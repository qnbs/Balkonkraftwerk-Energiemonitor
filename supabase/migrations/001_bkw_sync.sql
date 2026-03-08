-- ============================================================
-- BKW Monitor – Cloud-Sync Table
-- Run this in the Supabase SQL Editor of your project.
-- ============================================================

-- 1. Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- 2. Main sync table – stores encrypted blobs for all local stores
create table if not exists public.bkw_sync (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  local_id        text not null,
  table_name      text not null check (table_name in ('energyReadings','devices','settings','reports')),
  encrypted_payload text not null,  -- "iv_b64:ciphertext_b64" (AES-GCM, client-side)
  sync_version    bigint not null default 0,
  updated_at      timestamptz not null default now(),
  is_deleted      boolean not null default false,

  -- Enforce one row per (user, local record, table)
  unique (user_id, local_id, table_name)
);

-- 3. Index for efficient pull-sync queries
create index if not exists bkw_sync_user_updated
  on public.bkw_sync (user_id, updated_at asc);

-- 4. Auto-update `updated_at` on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bkw_sync_updated_at on public.bkw_sync;
create trigger bkw_sync_updated_at
  before update on public.bkw_sync
  for each row execute procedure public.set_updated_at();

-- 5. Row Level Security – users see only their own rows
alter table public.bkw_sync enable row level security;

drop policy if exists "bkw_sync_select_own" on public.bkw_sync;
create policy "bkw_sync_select_own"
  on public.bkw_sync for select
  using (auth.uid() = user_id);

drop policy if exists "bkw_sync_insert_own" on public.bkw_sync;
create policy "bkw_sync_insert_own"
  on public.bkw_sync for insert
  with check (auth.uid() = user_id);

drop policy if exists "bkw_sync_update_own" on public.bkw_sync;
create policy "bkw_sync_update_own"
  on public.bkw_sync for update
  using (auth.uid() = user_id);

drop policy if exists "bkw_sync_delete_own" on public.bkw_sync;
create policy "bkw_sync_delete_own"
  on public.bkw_sync for delete
  using (auth.uid() = user_id);

-- 6. Enable Realtime for the sync table
-- (In Supabase Dashboard: Database → Replication → bkw_sync → enable)
alter publication supabase_realtime add table public.bkw_sync;
