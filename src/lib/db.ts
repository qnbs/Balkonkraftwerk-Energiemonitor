/**
 * BKW Monitor – IndexedDB via Dexie.js
 *
 * Security model for Gemini API key:
 *  - Stored ONLY in IndexedDB, never in localStorage or env variables
 *  - Optional AES-GCM encryption with user-defined PIN (≥ 4 chars)
 *  - Key derivation: PBKDF2(PIN, random-salt, 100 000 iterations, SHA-256) → AES-256-GCM
 *  - Random IV + salt per save → same PIN always yields different ciphertext
 *  - Only a SHA-256 hash of the PIN is persisted (for verification); the PIN itself is never stored
 *  - Decrypted key is kept in a module-level variable (_keyCache), cleared on pagehide
 *  - _keyCache is intentionally NOT exposed to React state / DevTools
 */

import Dexie, { type Table } from 'dexie';

// ---------------------------------------------------------------------------
// Table types
// ---------------------------------------------------------------------------

export interface Setting {
  key: string;
  value: unknown;
  _enc?: string; // AES-GCM encrypted payload (present when DB encryption is active)
}

export interface StoredDevice {
  id: string;
  name: string;
  peakPowerW: number;
  installDate: string;
  color: string;
  location?: string;
  createdAt: number;
  updatedAt: number;
  _enc?: string;
}

export interface EnergyReading {
  id?: number;        // autoIncrement primary key
  timestamp: number;  // Unix ms – indexed (always plaintext for query capability)
  deviceId: string;   // indexed + compound [deviceId+timestamp] (always plaintext)
  solarW: number;
  consumptionW: number;
  gridW: number;
  autarky: number;    // 0–100 %
  savedAt?: number;
  _enc?: string;      // AES-GCM encrypted payload of solarW/consumptionW/gridW/autarky/savedAt
}

export interface StoredReport {
  id: string;
  date: string;       // YYYY-MM-DD – indexed (always plaintext)
  deviceId: string;
  deviceName: string;
  type: 'monthly' | 'yearly';
  data: Record<string, unknown>;
  createdAt: number;
  _enc?: string;      // AES-GCM encrypted payload (excludes id, date)
}

// ---------------------------------------------------------------------------
// Dexie schema
// ---------------------------------------------------------------------------

class BalkonkraftwerkDB extends Dexie {
  settings!: Table<Setting, string>;
  devices!: Table<StoredDevice, string>;
  energyReadings!: Table<EnergyReading, number>;
  reports!: Table<StoredReport, string>;

  constructor() {
    super('BalkonkraftwerkDB');
    // v1: initial schema
    this.version(1).stores({
      settings:       'key',
      devices:        'id, name, createdAt, updatedAt',
      energyReadings: '++id, timestamp, deviceId, [deviceId+timestamp]',
      reports:        'id, date, deviceId, type, createdAt',
    });
    // v2: same schema, adds support for _enc field on all stores (no structural change needed).
    // Records may now contain an optional _enc field with AES-GCM encrypted payload.
    this.version(2).stores({
      settings:       'key',
      devices:        'id, name, createdAt, updatedAt',
      energyReadings: '++id, timestamp, deviceId, [deviceId+timestamp]',
      reports:        'id, date, deviceId, type, createdAt',
    });
  }
}

export const db = new BalkonkraftwerkDB();

// ---------------------------------------------------------------------------
// Generic settings helpers
// ---------------------------------------------------------------------------

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const record = await db.settings.get(key);
    if (record === undefined) return defaultValue;
    if (record._enc) {
      if (!_masterKey) return defaultValue; // DB locked – return default rather than error
      try { return await decryptPayload<T>(record._enc); } catch { return defaultValue; }
    }
    return record.value as T;
  } catch {
    return defaultValue;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  if (_dbEncEnabled && _masterKey && !DB_ENC_BYPASS_KEYS.has(key)) {
    const enc = await encryptPayload(value);
    await db.settings.put({ key, value: null, _enc: enc });
  } else {
    await db.settings.put({ key, value });
  }
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key);
}

// ---------------------------------------------------------------------------
// WebCrypto – Gemini API key encryption
// ---------------------------------------------------------------------------

export interface EncryptedApiKey {
  encrypted: true;
  ciphertext: string; // base64
  iv: string;         // base64 (12 bytes, AES-GCM nonce)
  salt: string;       // base64 (16 bytes, PBKDF2 salt)
  pinHash: string;    // base64 SHA-256(PIN) – for PIN verification only
}

export interface PlainApiKey {
  encrypted: false;
  key: string;
}

export type StoredApiKeyValue = EncryptedApiKey | PlainApiKey;

const GEMINI_KEY_SETTING = 'gemini-api-key';

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function unb64(s: string): ArrayBuffer {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function pinToAesKey(pin: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(pin);
  const imported = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    imported,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function sha256b64(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64(buf);
}

/** Save Gemini API key to DB, optionally encrypted with a PIN (≥ 4 chars). */
export async function saveApiKey(apiKey: string, pin?: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) return;

  if (pin && pin.length >= 4) {
    const salt = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const iv   = crypto.getRandomValues(new Uint8Array(12)).buffer;
    const aes  = await pinToAesKey(pin, salt);
    const ct   = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aes,
      new TextEncoder().encode(trimmed),
    );
    const stored: EncryptedApiKey = {
      encrypted: true,
      ciphertext: b64(ct),
      iv:        b64(iv),
      salt:      b64(salt),
      pinHash:   await sha256b64(pin),
    };
    await saveSetting(GEMINI_KEY_SETTING, stored);
  } else {
    const stored: PlainApiKey = { encrypted: false, key: trimmed };
    await saveSetting(GEMINI_KEY_SETTING, stored);
  }
  // Populate the in-memory cache immediately so AI calls work straight away
  _keyCache = trimmed;
}

/**
 * Retrieve the stored API key from DB.
 *  - If not encrypted: returns key directly and warms the cache.
 *  - If encrypted and `pin` provided: decrypts, warms cache, returns key.
 *  - If encrypted and `pin` omitted: throws `'PIN_REQUIRED'`.
 *  - If PIN is wrong: throws `'INVALID_PIN'`.
 */
export async function getApiKey(pin?: string): Promise<string> {
  const stored = await getSetting<StoredApiKeyValue | null>(GEMINI_KEY_SETTING, null);
  if (!stored) return '';

  if (!stored.encrypted) {
    _keyCache = (stored as PlainApiKey).key;
    return (stored as PlainApiKey).key;
  }

  // Encrypted path
  if (!pin) throw new Error('PIN_REQUIRED');
  const candidateHash = await sha256b64(pin);
  if (candidateHash !== stored.pinHash) throw new Error('INVALID_PIN');
  const aes   = await pinToAesKey(pin, unb64(stored.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(stored.iv) },
    aes,
    unb64(stored.ciphertext),
  );
  const key = new TextDecoder().decode(plain);
  _keyCache = key;
  return key;
}

export async function deleteApiKey(): Promise<void> {
  await deleteSetting(GEMINI_KEY_SETTING);
  _keyCache = null;
}

export async function hasApiKeyStored(): Promise<boolean> {
  const record = await db.settings.get(GEMINI_KEY_SETTING);
  return record !== undefined;
}

export async function isApiKeyEncrypted(): Promise<boolean> {
  const stored = await getSetting<StoredApiKeyValue | null>(GEMINI_KEY_SETTING, null);
  return stored?.encrypted === true;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await getSetting<StoredApiKeyValue | null>(GEMINI_KEY_SETTING, null);
  if (!stored?.encrypted) return false;
  const h = await sha256b64(pin);
  return h === stored.pinHash;
}

// ---------------------------------------------------------------------------
// In-memory key cache
// Intentionally NOT in React state so it does not appear in React DevTools.
// Cleared on pagehide (back/forward cache eviction counts as pagehide too).
// ---------------------------------------------------------------------------
let _keyCache: string | null = null;

export function getKeyFromCache(): string | null {
  return _keyCache;
}

export function setKeyInCache(key: string): void {
  _keyCache = key;
}

export function clearKeyCache(): void {
  _keyCache = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { _keyCache = null; });
}

// ---------------------------------------------------------------------------
// DB-level AES-GCM encryption
//
// Security model:
//  - A random 256-bit AES-GCM "master key" is generated once when the user
//    enables DB encryption.
//  - The master key is exported and encrypted with a PIN derived via PBKDF2
//    (100 000 iterations, SHA-256), then stored as `_db_enc_key_blob` in
//    settings (that entry is itself NOT re-encrypted by the DB layer, avoiding
//    chicken-and-egg).
//  - All records in settings / energyReadings / devices / reports are
//    transparently encrypted on write and decrypted on read when the master
//    key is loaded into `_masterKey`.
//  - Index fields (timestamp, deviceId, id, date) stay plaintext so Dexie
//    indexes remain functional.
//  - The master key lives only in memory (_masterKey) and is cleared on
//    pagehide. It is never stored unencrypted anywhere.
// ---------------------------------------------------------------------------

let _masterKey: CryptoKey | null = null;
let _dbEncEnabled = false;

/** Settings keys that bypass DB-level encryption (bootstrap + already self-encrypted). */
const DB_ENC_BYPASS_KEYS = new Set([
  '_migrated_v1',
  '_db_encrypted',
  '_db_enc_key_blob',
  '_db_pin_hash',
  '_db_salt',
  '_db_iv',
  'gemini-api-key',      // has its own AES-GCM encryption
  '_alert_cooldowns',    // non-sensitive operational data
]);

// ── Public status helpers ──────────────────────────────────────────────────

/** True when DB encryption is enabled AND the master key is loaded in memory. */
export function isDbUnlocked(): boolean {
  return !_dbEncEnabled || _masterKey !== null;
}

export async function getDbEncryptionStatus(): Promise<{ enabled: boolean; unlocked: boolean }> {
  const enabled = (await db.settings.get('_db_encrypted'))?.value === true;
  _dbEncEnabled = enabled; // sync module state
  return { enabled, unlocked: !enabled || _masterKey !== null };
}

// ── Internal crypto helpers ────────────────────────────────────────────────

async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,                           // extractable so we can export & store it
    ['encrypt', 'decrypt'],
  );
}

async function exportRawKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key);
}

async function importRawKey(raw: ArrayBuffer, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

interface EncryptedBlob { blob: string; salt: string; iv: string; pinHash: string; }

async function wrapKeyWithPin(masterKeyRaw: ArrayBuffer, pin: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const pinKey = await pinToAesKey(pin, salt.buffer);
  const encBlob = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer }, pinKey, masterKeyRaw);
  return { blob: b64(encBlob), salt: b64(salt.buffer), iv: b64(iv.buffer), pinHash: await sha256b64(pin) };
}

async function unwrapKeyWithPin(eb: EncryptedBlob, pin: string): Promise<CryptoKey> {
  const candidateHash = await sha256b64(pin);
  if (candidateHash !== eb.pinHash) throw new Error('INVALID_PIN');
  const pinKey = await pinToAesKey(pin, unb64(eb.salt));
  const masterKeyRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(eb.iv) }, pinKey, unb64(eb.blob));
  return importRawKey(masterKeyRaw);
}

/** Encrypt any serialisable value to "iv_b64:ciphertext_b64" string. */
async function encryptPayload(data: unknown): Promise<string> {
  if (!_masterKey) throw new Error('DB_LOCKED');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer }, _masterKey, plain);
  return b64(iv.buffer) + ':' + b64(ct);
}

/** Decrypt "iv_b64:ciphertext_b64" string back to a typed value. */
async function decryptPayload<T>(enc: string): Promise<T> {
  if (!_masterKey) throw new Error('DB_LOCKED');
  const sep = enc.indexOf(':');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(enc.slice(0, sep)) },
    _masterKey,
    unb64(enc.slice(sep + 1)),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

// ── Load/store encryption metadata (always plaintext) ─────────────────────

async function readEncBlob(): Promise<EncryptedBlob | null> {
  const [blob, salt, iv, pinHash] = await Promise.all([
    db.settings.get('_db_enc_key_blob'),
    db.settings.get('_db_salt'),
    db.settings.get('_db_iv'),
    db.settings.get('_db_pin_hash'),
  ]);
  if (!blob?.value) return null;
  return { blob: blob.value as string, salt: salt!.value as string, iv: iv!.value as string, pinHash: pinHash!.value as string };
}

async function writeEncBlob(eb: EncryptedBlob): Promise<void> {
  await db.settings.bulkPut([
    { key: '_db_enc_key_blob', value: eb.blob },
    { key: '_db_salt',         value: eb.salt },
    { key: '_db_iv',           value: eb.iv },
    { key: '_db_pin_hash',     value: eb.pinHash },
  ]);
}

// ── Bulk re-encryption helpers ─────────────────────────────────────────────

async function encryptAllRecords(): Promise<void> {
  // settings
  const allSettings = await db.settings.toArray();
  for (const s of allSettings) {
    if (DB_ENC_BYPASS_KEYS.has(s.key) || s._enc) continue;
    const enc = await encryptPayload(s.value);
    await db.settings.put({ key: s.key, value: null, _enc: enc });
  }

  // energyReadings (keep timestamp, deviceId as plaintext indexes)
  const readings = await db.energyReadings.toArray();
  for (const r of readings) {
    if (r._enc) continue;
    const payload = { solarW: r.solarW, consumptionW: r.consumptionW, gridW: r.gridW, autarky: r.autarky, savedAt: r.savedAt };
    const enc = await encryptPayload(payload);
    await db.energyReadings.put({ id: r.id, timestamp: r.timestamp, deviceId: r.deviceId, solarW: 0, consumptionW: 0, gridW: 0, autarky: 0, _enc: enc });
  }

  // devices (keep id as PK)
  const devices = await db.devices.toArray();
  for (const d of devices) {
    if (d._enc) continue;
    const enc = await encryptPayload(d);
    await db.devices.put({ id: d.id, name: '', peakPowerW: 0, installDate: '', color: '', createdAt: d.createdAt, updatedAt: d.updatedAt, _enc: enc });
  }

  // reports (keep id, date as indexes)
  const reports = await db.reports.toArray();
  for (const rep of reports) {
    if (rep._enc) continue;
    const enc = await encryptPayload(rep);
    await db.reports.put({ id: rep.id, date: rep.date, deviceId: '', deviceName: '', type: 'monthly', data: {}, createdAt: rep.createdAt, _enc: enc });
  }
}

async function decryptAllRecords(): Promise<void> {
  const allSettings = await db.settings.toArray();
  for (const s of allSettings) {
    if (!s._enc) continue;
    try {
      const value = await decryptPayload<unknown>(s._enc);
      await db.settings.put({ key: s.key, value });
    } catch { /* skip corrupted entries */ }
  }

  const readings = await db.energyReadings.toArray();
  for (const r of readings) {
    if (!r._enc) continue;
    try {
      const payload = await decryptPayload<{ solarW: number; consumptionW: number; gridW: number; autarky: number; savedAt?: number }>(r._enc);
      await db.energyReadings.put({ ...r, ...payload, _enc: undefined });
    } catch { /* skip */ }
  }

  const devices = await db.devices.toArray();
  for (const d of devices) {
    if (!d._enc) continue;
    try {
      const payload = await decryptPayload<StoredDevice>(d._enc);
      await db.devices.put({ ...payload, _enc: undefined });
    } catch { /* skip */ }
  }

  const reports = await db.reports.toArray();
  for (const rep of reports) {
    if (!rep._enc) continue;
    try {
      const payload = await decryptPayload<StoredReport>(rep._enc);
      await db.reports.put({ ...payload, _enc: undefined });
    } catch { /* skip */ }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Enable database encryption for the first time.
 * Generates a random master key, wraps it with the PIN, encrypts all existing
 * records, and sets the `_db_encrypted` flag.
 */
export async function enableDbEncryption(pin: string): Promise<void> {
  if (pin.length < 4) throw new Error('PIN_TOO_SHORT');
  const masterKey = await generateMasterKey();
  const masterKeyRaw = await exportRawKey(masterKey);
  const eb = await wrapKeyWithPin(masterKeyRaw, pin);
  await writeEncBlob(eb);
  await db.settings.put({ key: '_db_encrypted', value: true });
  _masterKey = masterKey;
  _dbEncEnabled = true;
  await encryptAllRecords();
}

/**
 * Unlock the database with the PIN. Must be called once after app start when
 * `getDbEncryptionStatus().enabled` is true.
 * Throws 'INVALID_PIN' if the PIN is wrong.
 */
export async function unlockDb(pin: string): Promise<void> {
  const eb = await readEncBlob();
  if (!eb) throw new Error('DB_NOT_ENCRYPTED');
  _masterKey = await unwrapKeyWithPin(eb, pin);
  _dbEncEnabled = true;
}

/**
 * Change the PIN without re-encrypting all records (only the key wrapper changes).
 * Throws 'INVALID_PIN' if oldPin is wrong, 'PIN_TOO_SHORT' if newPin is too short.
 */
export async function changeDbPin(oldPin: string, newPin: string): Promise<void> {
  if (newPin.length < 4) throw new Error('PIN_TOO_SHORT');
  // Re-derive raw key bytes from the stored blob using oldPin – avoids needing
  // an extractable in-memory CryptoKey.
  const eb = await readEncBlob();
  if (!eb) throw new Error('DB_NOT_ENCRYPTED');
  const candidateHash = await sha256b64(oldPin);
  if (candidateHash !== eb.pinHash) throw new Error('INVALID_PIN');
  const oldPinKey = await pinToAesKey(oldPin, unb64(eb.salt));
  const masterKeyRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(eb.iv) },
    oldPinKey,
    unb64(eb.blob),
  );
  // Keep in-memory key fresh (non-extractable is fine for encrypt/decrypt)
  _masterKey = await importRawKey(masterKeyRaw);
  _dbEncEnabled = true;
  // Re-wrap with new PIN
  const newEb = await wrapKeyWithPin(masterKeyRaw, newPin);
  await writeEncBlob(newEb);
}

/**
 * Disable database encryption: decrypts all records, removes encryption meta,
 * clears the in-memory master key.
 * Throws 'INVALID_PIN' if the PIN is wrong.
 */
export async function disableDbEncryption(pin: string): Promise<void> {
  await unlockDb(pin);
  await decryptAllRecords();
  await db.settings.bulkDelete(['_db_encrypted', '_db_enc_key_blob', '_db_salt', '_db_iv', '_db_pin_hash']);
  _masterKey = null;
  _dbEncEnabled = false;
}

/**
 * Verify the current DB PIN without unlocking.
 */
export async function verifyDbPin(pin: string): Promise<boolean> {
  const eb = await readEncBlob();
  if (!eb) return false;
  const h = await sha256b64(pin);
  return h === eb.pinHash;
}

/**
 * Nuclear option: delete the entire IndexedDB database. Used when the user
 * has forgotten their PIN and consents to losing all data.
 */
export async function resetDbAndDeleteAll(): Promise<void> {
  await db.delete();
  _masterKey = null;
  _dbEncEnabled = false;
  // Reload the page so Dexie re-creates the DB from scratch
  if (typeof window !== 'undefined') window.location.reload();
}

/**
 * FOR TESTING ONLY: resets the module-level in-memory encryption state.
 * Call this in beforeEach when using fake-indexeddb so that module state from
 * a previous test doesn't bleed into the next.
 */
export function resetDbEncryptionState(): void {
  _masterKey = null;
  _dbEncEnabled = false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { _masterKey = null; });
}

// ---------------------------------------------------------------------------
// Devices CRUD (async)
// ---------------------------------------------------------------------------

export const DEFAULT_DEVICE_COLORS: readonly string[] = [
  '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#84cc16',
];

function makeDefaultDevice(): StoredDevice {
  return {
    id: 'default',
    name: 'Meine Anlage',
    peakPowerW: 800,
    installDate: new Date().toISOString().slice(0, 10),
    color: DEFAULT_DEVICE_COLORS[0],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function getDevices(): Promise<StoredDevice[]> {
  const all = await db.devices.orderBy('createdAt').toArray();
  if (all.length === 0) {
    const d = makeDefaultDevice();
    await db.devices.put(d);
    return [d];
  }
  // Decrypt if needed
  if (_dbEncEnabled && _masterKey) {
    return Promise.all(all.map(async (d) => {
      if (!d._enc) return d;
      try { return { ...(await decryptPayload<StoredDevice>(d._enc)), _enc: undefined }; }
      catch { return d; }
    }));
  }
  return all;
}

export async function putDevice(device: StoredDevice): Promise<StoredDevice> {
  const updated = { ...device, updatedAt: Date.now() };
  if (_dbEncEnabled && _masterKey) {
    const enc = await encryptPayload(updated);
    await db.devices.put({ id: device.id, name: '', peakPowerW: 0, installDate: '', color: '', createdAt: device.createdAt, updatedAt: updated.updatedAt, _enc: enc });
  } else {
    await db.devices.put(updated);
  }
  return updated;
}

export async function removeDevice(id: string): Promise<StoredDevice[]> {
  const all = await db.devices.toArray();
  if (all.length <= 1) return getDevices(); // refuse to delete the last device
  await db.devices.delete(id);
  return getDevices();
}

// ---------------------------------------------------------------------------
// Energy readings
// ---------------------------------------------------------------------------

export async function addEnergyReading(reading: Omit<EnergyReading, 'id'>): Promise<void> {
  if (_dbEncEnabled && _masterKey) {
    const { timestamp, deviceId } = reading;
    const payload = { solarW: reading.solarW, consumptionW: reading.consumptionW, gridW: reading.gridW, autarky: reading.autarky, savedAt: reading.savedAt };
    const enc = await encryptPayload(payload);
    await db.energyReadings.add({ timestamp, deviceId, solarW: 0, consumptionW: 0, gridW: 0, autarky: 0, _enc: enc });
  } else {
    await db.energyReadings.add(reading);
  }
}

async function decryptReadings(raw: EnergyReading[]): Promise<EnergyReading[]> {
  if (!_dbEncEnabled || !_masterKey) return raw;
  return Promise.all(raw.map(async (r) => {
    if (!r._enc) return r;
    try {
      const p = await decryptPayload<{ solarW: number; consumptionW: number; gridW: number; autarky: number; savedAt?: number }>(r._enc);
      return { ...r, ...p, _enc: undefined };
    } catch { return r; }
  }));
}

export async function getReadings(
  deviceId: string,
  from?: number,
  to?: number,
): Promise<EnergyReading[]> {
  let raw: EnergyReading[];
  if (deviceId === 'all') {
    if (from !== undefined && to !== undefined) {
      raw = await db.energyReadings.where('timestamp').between(from, to).toArray();
    } else {
      raw = await db.energyReadings.toArray();
    }
  } else if (from !== undefined && to !== undefined) {
    raw = await db.energyReadings
      .where('[deviceId+timestamp]')
      .between([deviceId, from], [deviceId, to])
      .toArray();
  } else {
    raw = await db.energyReadings.where('deviceId').equals(deviceId).toArray();
  }
  return decryptReadings(raw);
}

/** Delete readings older than `olderThanMs` (default: 2 years). Returns deleted count. */
export async function deleteOldReadings(
  olderThanMs = 2 * 365 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  return db.energyReadings.where('timestamp').below(cutoff).delete();
}

// ---------------------------------------------------------------------------
// LocalStorage → IndexedDB migration (runs once on first start)
// ---------------------------------------------------------------------------

export async function migrateFromLocalStorage(): Promise<void> {
  // Guard: only run once
  const flag = await db.settings.get('_migrated_v1');
  if (flag?.value === true) return;

  // Simple string/JSON key-value pairs
  const keyMap: Array<[string, string]> = [
    ['bkw-ha-config',          'ha-config'],
    ['bkw-mqtt-config',        'mqtt-config'],
    ['bkw-live-mode',          'live-mode'],
    ['bkw-esp32-url',          'esp32-url'],
    ['bkw-has-battery',        'has-battery'],
    ['bkw-battery-capacity',   'battery-capacity'],
    ['bkw-theme',              'theme'],
    ['bkw-active-device',      'active-device'],
    ['bkw-timerange',          'timerange'],
    ['bkw-thresholds',         'thresholds'],
    ['bkw-alert-prefs',        'alert-prefs'],
    ['bkw-alert-cooldowns',    'alert-cooldowns'],
    ['bkw-electricity-prices', 'electricity-prices-cache'],
    ['bkw-weather-forecast',   'weather-cache'],
    ['bkw-weather-rate',       'weather-rate'],
  ];

  for (const [lsKey, dbKey] of keyMap) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw !== null) {
        let value: unknown;
        try { value = JSON.parse(raw); } catch { value = raw; }
        await db.settings.put({ key: dbKey, value });
      }
    } catch { /* ignore individual failures */ }
  }

  // Migrate Gemini API key (stored unencrypted – user can add PIN later via Settings)
  try {
    const apiKey = localStorage.getItem('bkw-gemini-api-key');
    if (apiKey?.trim()) {
      const stored: PlainApiKey = { encrypted: false, key: apiKey.trim() };
      await saveSetting(GEMINI_KEY_SETTING, stored);
    }
  } catch { /* ignore */ }

  // Migrate devices
  try {
    const raw = localStorage.getItem('bkw-devices');
    if (raw) {
      const arr = JSON.parse(raw) as unknown[];
      if (Array.isArray(arr) && arr.length > 0) {
        await db.devices.bulkPut(
          arr.map((d) => {
            const dev = d as unknown as StoredDevice;
            return {
              ...dev,
              createdAt: dev.createdAt ?? Date.now(),
              updatedAt: dev.updatedAt ?? Date.now(),
            };
          }),
        );
      }
    }
  } catch { /* ignore */ }

  // Mark migration complete
  await db.settings.put({ key: '_migrated_v1', value: true });

  // Clean up localStorage – keep 'bkw-theme' for synchronous FOUC-prevention
  try {
    const theme = localStorage.getItem('bkw-theme');
    localStorage.clear();
    if (theme) localStorage.setItem('bkw-theme', theme);
  } catch { /* ignore */ }
}
