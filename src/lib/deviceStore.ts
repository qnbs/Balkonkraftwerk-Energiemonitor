/**
 * BKW Device Store
 *
 * Manages multiple Balkonkraftwerk devices in localStorage.
 * Supabase-ready: swap localStorage calls with Supabase client when adding cloud sync.
 *
 * Supabase migration hints:
 *   - Table: `devices (id uuid, user_id uuid, name text, peak_power_w int, install_date date, color text)`
 *   - Replace `loadDevices()` with `supabase.from('devices').select()`
 *   - Replace `saveDevices()` with `supabase.from('devices').upsert()`
 */

export interface BKWDevice {
  /** UUID – used as stable key for data seeding */
  id: string;
  /** Display name, user-editable */
  name: string;
  /** Nominal peak power in Watt (e.g. 800 for 2×400W panels) */
  peakPowerW: number;
  /** ISO date string (YYYY-MM-DD) */
  installDate: string;
  /** Hex color for UI differentiation */
  color: string;
  /** Optional free-text location label */
  location?: string;
}

export const DEVICE_COLORS: readonly string[] = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

const STORAGE_KEY = 'bkw-devices';

function makeDefault(): BKWDevice {
  return {
    id: 'default',
    name: 'Meine Anlage',
    peakPowerW: 800,
    installDate: new Date().toISOString().slice(0, 10),
    color: DEVICE_COLORS[0],
  };
}

// ---------------------------------------------------------------------------
// CRUD – all synchronous, localStorage-backed
// ---------------------------------------------------------------------------

export function loadDevices(): BKWDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BKWDevice[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted entry – fall through to default
  }
  const fallback = [makeDefault()];
  saveDevices(fallback);
  return fallback;
}

export function saveDevices(devices: BKWDevice[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

export function addDevice(name: string, peakPowerW = 800, location?: string): BKWDevice {
  const existing = loadDevices();
  const device: BKWDevice = {
    id: crypto.randomUUID(),
    name: name.trim() || `Anlage ${existing.length + 1}`,
    peakPowerW,
    installDate: new Date().toISOString().slice(0, 10),
    color: DEVICE_COLORS[existing.length % DEVICE_COLORS.length],
    location,
  };
  saveDevices([...existing, device]);
  return device;
}

export function deleteDevice(id: string): BKWDevice[] {
  const remaining = loadDevices().filter((d) => d.id !== id);
  const final = remaining.length > 0 ? remaining : [makeDefault()];
  saveDevices(final);
  return final;
}

export function renameDevice(id: string, name: string): BKWDevice[] {
  const updated = loadDevices().map((d) =>
    d.id === id ? { ...d, name: name.trim() || d.name } : d,
  );
  saveDevices(updated);
  return updated;
}

export function updateDevice(id: string, patch: Partial<Omit<BKWDevice, 'id'>>): BKWDevice[] {
  const updated = loadDevices().map((d) => (d.id === id ? { ...d, ...patch } : d));
  saveDevices(updated);
  return updated;
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
