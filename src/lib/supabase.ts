/**
 * BKW Monitor – Supabase Cloud-Sync (optional)
 *
 * Security model:
 *  - Supabase acts as a "dumb" encrypted blob store.
 *  - All payload data is AES-GCM encrypted CLIENT-SIDE before leaving the
 *    browser. Supabase never sees plaintext.
 *  - The unencrypted metadata kept in Supabase rows:
 *      • user_id (from Supabase Auth – opaque UUID)
 *      • local_id (the local Dexie PK / string id)
 *      • table_name (for routing)
 *      • sync_version (monotonically increasing counter for conflict detection)
 *      • updated_at (server timestamp, set by Postgres default)
 *      • is_deleted (soft-delete flag)
 *  - All other fields are in `encrypted_payload` (base64 AES-GCM ciphertext).
 *  - Row-Level Security (RLS) in Supabase ensures users can only read/write
 *    their own rows (`auth.uid() = user_id`).
 *
 * Setup:
 *  1. Create a Supabase project at https://supabase.com
 *  2. Run the SQL migration `supabase/migrations/001_bkw_sync.sql` in the SQL editor.
 *  3. Copy Project URL + anon key to `.env.local`:
 *       VITE_SUPABASE_URL=https://xxxx.supabase.co
 *       VITE_SUPABASE_ANON_KEY=eyJ...
 *  4. Optional: VITE_SUPABASE_SERVICE_ROLE_KEY (only for server-side / admin scripts)
 *
 * The Supabase integration is entirely opt-in:
 *  • Without env vars: `isSupabaseConfigured()` returns false, all sync
 *    functions become no-ops, the app operates purely offline.
 *  • With env vars but not signed in: Guest mode – local only.
 *  • Signed in: Offline-first Sync queue is flushed on reconnect.
 */

import { createClient, type SupabaseClient, type User, type Session, type RealtimeChannel } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'bkw-supabase-auth',
      },
      realtime: {
        params: { eventsPerSecond: 2 },
      },
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

let _authState: AuthState = { user: null, session: null, loading: true };
const _authListeners = new Set<(state: AuthState) => void>();

function notifyAuthListeners(): void {
  _authListeners.forEach((fn) => fn({ ..._authState }));
}

export function subscribeToAuthState(fn: (state: AuthState) => void): () => void {
  _authListeners.add(fn);
  fn({ ..._authState }); // immediately emit current state
  return () => _authListeners.delete(fn);
}

export function getAuthState(): AuthState {
  return { ..._authState };
}

/** Must be called once on app start (after Dexie is ready). */
export async function initSupabaseAuth(): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) {
    _authState = { user: null, session: null, loading: false };
    notifyAuthListeners();
    return;
  }

  // Restore existing session
  const { data } = await sb.auth.getSession();
  _authState = {
    user: data.session?.user ?? null,
    session: data.session,
    loading: false,
  };
  notifyAuthListeners();

  // Subscribe to future auth changes
  sb.auth.onAuthStateChange((_event, session) => {
    _authState = { user: session?.user ?? null, session, loading: false };
    notifyAuthListeners();
  });
}

/** Send a Magic Link to the given email. */
export async function signInWithMagicLink(email: string): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
}

/** Sign out (clears Supabase session, local data stays intact). */
export async function signOut(): Promise<void> {
  await getSupabaseClient()?.auth.signOut();
  _authState = { user: null, session: null, loading: false };
  notifyAuthListeners();
}

export function getCurrentUser(): User | null {
  return _authState.user;
}

// ---------------------------------------------------------------------------
// Supabase table row types
// ---------------------------------------------------------------------------

/** A single row in the `bkw_sync` table. */
export interface SyncRow {
  id?: string;            // UUID, generated by Postgres
  user_id?: string;       // set server-side via RLS `auth.uid()`
  local_id: string;       // local Dexie PK (string-cast)
  table_name: 'energyReadings' | 'devices' | 'settings' | 'reports';
  encrypted_payload: string; // "iv_b64:ciphertext_b64" – AES-GCM
  sync_version: number;   // client-incremented, monotonic
  updated_at?: string;    // Postgres `now()` default
  is_deleted: boolean;
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

/** Upsert a single encrypted row. Returns the row as saved, or throws. */
export async function upsertSyncRow(
  row: Omit<SyncRow, 'id' | 'user_id' | 'updated_at'>,
): Promise<SyncRow> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error('SUPABASE_NOT_CONFIGURED');

  const user = getCurrentUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  const { data, error } = await sb
    .from('bkw_sync')
    .upsert(
      { ...row, user_id: user.id },
      { onConflict: 'user_id,local_id,table_name', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) throw error;
  return data as SyncRow;
}

/** Soft-delete a row (sets is_deleted=true). */
export async function deleteSyncRow(
  localId: string,
  tableName: SyncRow['table_name'],
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || !getCurrentUser()) return;

  await sb
    .from('bkw_sync')
    .update({ is_deleted: true, sync_version: Date.now() })
    .match({ local_id: localId, table_name: tableName, user_id: getCurrentUser()!.id });
}

/** Pull all rows for the current user updated after `since` (epoch ms). */
export async function pullSyncRows(since: number = 0): Promise<SyncRow[]> {
  const sb = getSupabaseClient();
  if (!sb || !getCurrentUser()) return [];

  const sinceTs = new Date(since).toISOString();
  const { data, error } = await sb
    .from('bkw_sync')
    .select('*')
    .eq('user_id', getCurrentUser()!.id)
    .gte('updated_at', sinceTs)
    .order('updated_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SyncRow[];
}

/** Pull ALL rows for the current user (full initial sync). */
export async function pullAllSyncRows(): Promise<SyncRow[]> {
  return pullSyncRows(0);
}

// ---------------------------------------------------------------------------
// Realtime subscription
// ---------------------------------------------------------------------------

let _realtimeChannel: RealtimeChannel | null = null;

export function subscribeToRealtimeSync(
  onInsert: (row: SyncRow) => void,
  onUpdate: (row: SyncRow) => void,
): () => void {
  const sb = getSupabaseClient();
  if (!sb || !getCurrentUser()) return () => {};

  _realtimeChannel?.unsubscribe();

  _realtimeChannel = sb
    .channel('bkw-sync-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bkw_sync',
        filter: `user_id=eq.${getCurrentUser()!.id}`,
      },
      (payload) => onInsert(payload.new as SyncRow),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'bkw_sync',
        filter: `user_id=eq.${getCurrentUser()!.id}`,
      },
      (payload) => onUpdate(payload.new as SyncRow),
    )
    .subscribe();

  return () => {
    _realtimeChannel?.unsubscribe();
    _realtimeChannel = null;
  };
}
