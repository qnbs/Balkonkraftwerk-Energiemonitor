/**
 * BKW Device Store
 *
 * Manages multiple Balkonkraftwerk devices in IndexedDB (via Dexie).
 * Cloud-ready: swap with Supabase client when adding cloud sync.
 *
 * Supabase migration hints:
 *   - Table: `devices (id uuid, user_id uuid, name text, peak_power_w int, install_date date, color text)`
 *   - Replace `loadDevices()` with `supabase.from('devices').select()`
 *   - Replace `saveDevice()` with `supabase.from('devices').upsert()`
 */

import { db, DEFAULT_DEVICE_COLORS, type StoredDevice } from './db';
import { saveSetting } from './db';

export type { StoredDevice as BKWDevice };
export { DEFAULT_DEVICE_COLORS as DEVICE_COLORS };

// ---------------------------------------------------------------------------
// CRUD – all async, IndexedDB-backed
// ---------------------------------------------------------------------------

export async function loadDevices(): Promise<StoredDevice[]> {
  const all = await db.devices.orderBy('createdAt').toArray();
  if (all.length === 0) {
    const fallback: StoredDevice = {
      id: 'default',
      name: 'Meine Anlage',
      peakPowerW: 800,
      installDate: new Date().toISOString().slice(0, 10),
      color: DEFAULT_DEVICE_COLORS[0],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.devices.put(fallback);
    return [fallback];
  }
  return all;
}

export async function saveDevices(devices: StoredDevice[]): Promise<void> {
  await db.devices.bulkPut(devices.map((d) => ({ ...d, updatedAt: Date.now() })));
}

export async function addDevice(name: string, peakPowerW = 800, location?: string): Promise<StoredDevice> {
  const existing = await db.devices.count();
  const device: StoredDevice = {
    id: crypto.randomUUID(),
    name: name.trim() || `Anlage ${existing + 1}`,
    peakPowerW,
    installDate: new Date().toISOString().slice(0, 10),
    color: DEFAULT_DEVICE_COLORS[existing % DEFAULT_DEVICE_COLORS.length],
    location,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.devices.put(device);
  return device;
}

export async function deleteDevice(id: string): Promise<StoredDevice[]> {
  const all = await db.devices.toArray();
  if (all.length <= 1) return all;
  await db.devices.delete(id);
  return db.devices.orderBy('createdAt').toArray();
}

export async function renameDevice(id: string, name: string): Promise<StoredDevice[]> {
  await db.devices.where('id').equals(id).modify((d) => {
    d.name = name.trim() || d.name;
    d.updatedAt = Date.now();
  });
  return db.devices.orderBy('createdAt').toArray();
}

export async function updateDevice(id: string, patch: Partial<Omit<StoredDevice, 'id' | 'createdAt'>>): Promise<StoredDevice[]> {
  await db.devices.where('id').equals(id).modify((d) => {
    Object.assign(d, { ...patch, updatedAt: Date.now() });
  });
  return db.devices.orderBy('createdAt').toArray();
}

/** Persist the active device selection to DB. */
export async function saveActiveDeviceId(id: string): Promise<void> {
  await saveSetting('active-device', id);
}

/** Derive a stable 0–1 float factor from a device ID (used for simulation differentiation). */
export function deviceFactor(deviceId: string): number {
  if (deviceId === 'default') return 1.0;
  let h = 5381;
  for (let i = 0; i < deviceId.length; i++) {
    h = ((h * 33) ^ deviceId.charCodeAt(i)) | 0;
  }
  // Map to 0.55 – 1.0 range so every device looks like a plausible balcony PV
  return 0.55 + (Math.abs(h) % 1000) / 2222;
}
