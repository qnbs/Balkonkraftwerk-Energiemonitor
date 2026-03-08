/**
 * Tests for IndexedDB AES-GCM full-database encryption (db.ts)
 *
 * Uses fake-indexeddb (auto-polyfill via setup.ts) and the Web Crypto API
 * provided by the Node.js/jsdom environment.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  getSetting, saveSetting,
  addEnergyReading, getReadings,
  getDevices, putDevice,
  enableDbEncryption, disableDbEncryption, changeDbPin,
  getDbEncryptionStatus, isDbUnlocked, verifyDbPin,
  resetDbEncryptionState,
  type StoredDevice,
} from '../lib/db';

// ---------------------------------------------------------------------------
// Reset Dexie DB between every test so tests are independent
// ---------------------------------------------------------------------------
beforeEach(async () => {
  resetDbEncryptionState();   // clear _masterKey + _dbEncEnabled module state
  await db.delete();          // wipe fake-indexeddb data
  await db.open();            // recreate fresh DB
});

// ---------------------------------------------------------------------------
// Basic CRUD without encryption (baseline)
// ---------------------------------------------------------------------------
describe('Settings CRUD (no encryption)', () => {
  it('stores and retrieves a plain setting', async () => {
    await saveSetting('test-key', { hello: 'world' });
    const val = await getSetting<{ hello: string }>('test-key', { hello: '' });
    expect(val.hello).toBe('world');
  });

  it('returns defaultValue for missing key', async () => {
    const val = await getSetting<number>('non-existent', 42);
    expect(val).toBe(42);
  });
});

describe('Energy readings CRUD (no encryption)', () => {
  it('stores and retrieves a reading', async () => {
    await addEnergyReading({ timestamp: 1000, deviceId: 'dev1', solarW: 400, consumptionW: 300, gridW: -100, autarky: 100 });
    const readings = await getReadings('dev1');
    expect(readings).toHaveLength(1);
    expect(readings[0].solarW).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DB-level AES-GCM encryption
// ---------------------------------------------------------------------------
describe('enableDbEncryption', () => {
  it('rejects PIN shorter than 4 characters', async () => {
    await expect(enableDbEncryption('123')).rejects.toThrow('PIN_TOO_SHORT');
  });

  it('sets _db_encrypted flag in settings', async () => {
    await enableDbEncryption('1234');
    const flag = await db.settings.get('_db_encrypted');
    expect(flag?.value).toBe(true);
  });

  it('getDbEncryptionStatus reports enabled=true after enabling', async () => {
    await enableDbEncryption('1234');
    const { enabled, unlocked } = await getDbEncryptionStatus();
    expect(enabled).toBe(true);
    expect(unlocked).toBe(true); // master key is in memory right after enabling
  });

  it('isDbUnlocked returns true while master key is in memory', async () => {
    await enableDbEncryption('1234');
    expect(isDbUnlocked()).toBe(true);
  });

  it('re-encrypts an existing plain setting', async () => {
    await saveSetting('my-setting', 'secret-value');
    await enableDbEncryption('abcd');
    // The raw DB record should now have _enc and value === null
    const raw = await db.settings.get('my-setting');
    expect(raw?._enc).toBeDefined();
    expect(raw?.value).toBeNull();
    // Reading through getSetting should transparently decrypt
    const val = await getSetting<string>('my-setting', '');
    expect(val).toBe('secret-value');
  });

  it('re-encrypts existing energy readings (payload in _enc)', async () => {
    await addEnergyReading({ timestamp: 2000, deviceId: 'dev1', solarW: 500, consumptionW: 200, gridW: -300, autarky: 100 });
    await enableDbEncryption('efgh');
    const rawReading = (await db.energyReadings.toArray())[0];
    expect(rawReading._enc).toBeDefined();
    expect(rawReading.solarW).toBe(0); // plaintext fields zeroed
    // getReadings should decrypt transparently
    const readings = await getReadings('dev1');
    expect(readings[0].solarW).toBe(500);
    expect(readings[0].consumptionW).toBe(200);
  });

  it('does NOT encrypt bypass keys (_db_* + gemini-api-key)', async () => {
    await enableDbEncryption('1234');
    const flag = await db.settings.get('_db_encrypted');
    expect(flag?._enc).toBeUndefined(); // bypass keys stay plaintext
    expect(flag?.value).toBe(true);
  });
});

describe('verifyDbPin', () => {
  it('returns true for correct PIN', async () => {
    await enableDbEncryption('5678');
    expect(await verifyDbPin('5678')).toBe(true);
  });

  it('returns false for wrong PIN', async () => {
    await enableDbEncryption('5678');
    expect(await verifyDbPin('0000')).toBe(false);
  });
});

describe('changeDbPin', () => {
  it('allows unlocking with new PIN after change', async () => {
    await enableDbEncryption('abcd');
    await changeDbPin('abcd', 'wxyz');
    expect(await verifyDbPin('wxyz')).toBe(true);
    expect(await verifyDbPin('abcd')).toBe(false);
  });

  it('rejects wrong old PIN', async () => {
    await enableDbEncryption('abcd');
    await expect(changeDbPin('wrong', 'wxyz')).rejects.toThrow('INVALID_PIN');
  });

  it('rejects new PIN that is too short', async () => {
    await enableDbEncryption('abcd');
    await expect(changeDbPin('abcd', 'xy')).rejects.toThrow('PIN_TOO_SHORT');
  });
});

describe('disableDbEncryption', () => {
  it('decrypts all records and removes _db_encrypted flag', async () => {
    await saveSetting('plain-data', 42);
    await enableDbEncryption('mypin');
    await disableDbEncryption('mypin');
    const { enabled } = await getDbEncryptionStatus();
    expect(enabled).toBe(false);
    // Data should be back in plaintext
    const val = await getSetting<number>('plain-data', 0);
    expect(val).toBe(42);
  });

  it('rejects wrong PIN on disable', async () => {
    await enableDbEncryption('mypin');
    await expect(disableDbEncryption('wrong')).rejects.toThrow('INVALID_PIN');
  });
});

describe('Device CRUD with encryption', () => {
  it('transparently encrypts and decrypts a device', async () => {
    await enableDbEncryption('1234');
    const device: StoredDevice = {
      id: 'dev-1',
      name: 'Meine Anlage',
      peakPowerW: 820,
      installDate: '2026-01-01',
      color: '#10b981',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await putDevice(device);
    const rawDb = await db.devices.get('dev-1');
    expect(rawDb?._enc).toBeDefined(); // raw record is encrypted
    expect(rawDb?.name).toBe(''); // plaintext name field is zeroed

    const devices = await getDevices();
    const found = devices.find((d) => d.id === 'dev-1');
    expect(found?.name).toBe('Meine Anlage');
    expect(found?.peakPowerW).toBe(820);
  });
});
