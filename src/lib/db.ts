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
}

export interface EnergyReading {
  id?: number;        // autoIncrement primary key
  timestamp: number;  // Unix ms – indexed
  deviceId: string;   // indexed + compound [deviceId+timestamp]
  solarW: number;
  consumptionW: number;
  gridW: number;
  autarky: number;    // 0–100 %
  savedAt?: number;
}

export interface StoredReport {
  id: string;
  date: string;       // YYYY-MM-DD – indexed
  deviceId: string;
  deviceName: string;
  type: 'monthly' | 'yearly';
  data: Record<string, unknown>;
  createdAt: number;
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
    this.version(1).stores({
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
    return record !== undefined ? (record.value as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
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
  return all;
}

export async function putDevice(device: StoredDevice): Promise<StoredDevice> {
  await db.devices.put({ ...device, updatedAt: Date.now() });
  return device;
}

export async function removeDevice(id: string): Promise<StoredDevice[]> {
  const all = await db.devices.toArray();
  if (all.length <= 1) return all; // refuse to delete the last device
  await db.devices.delete(id);
  return db.devices.orderBy('createdAt').toArray();
}

// ---------------------------------------------------------------------------
// Energy readings
// ---------------------------------------------------------------------------

export async function addEnergyReading(reading: Omit<EnergyReading, 'id'>): Promise<void> {
  await db.energyReadings.add(reading);
}

export async function getReadings(
  deviceId: string,
  from?: number,
  to?: number,
): Promise<EnergyReading[]> {
  if (deviceId === 'all') {
    if (from !== undefined && to !== undefined) {
      return db.energyReadings.where('timestamp').between(from, to).toArray();
    }
    return db.energyReadings.toArray();
  }
  if (from !== undefined && to !== undefined) {
    return db.energyReadings
      .where('[deviceId+timestamp]')
      .between([deviceId, from], [deviceId, to])
      .toArray();
  }
  return db.energyReadings.where('deviceId').equals(deviceId).toArray();
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
