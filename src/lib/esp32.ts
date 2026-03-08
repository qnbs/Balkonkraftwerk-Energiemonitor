import { getSetting, saveSetting } from './db';

export interface ESP32Payload {
  solar_w: number;
  consumption_w: number;
  grid_w: number;
  uptime_s?: number;
  ip?: string;
  age_ms?: number;
  battery_pct?: number;
}

const LIVE_MODE_KEY  = 'live-mode';
const ESP32_URL_KEY  = 'esp32-url';

export const DEFAULT_ESP32_URL = 'http://192.168.4.1/energy';

export async function isLiveMode(): Promise<boolean> {
  return getSetting<boolean>(LIVE_MODE_KEY, false);
}

export async function setLiveMode(v: boolean): Promise<void> {
  await saveSetting(LIVE_MODE_KEY, v);
}

export async function getEsp32Url(): Promise<string> {
  return getSetting<string>(ESP32_URL_KEY, DEFAULT_ESP32_URL);
}

export async function setEsp32Url(url: string): Promise<void> {
  await saveSetting(ESP32_URL_KEY, url.trim());
}

/** Poll the ESP32 HTTP endpoint. Throws on network error or invalid payload. */
export async function fetchEsp32Data(url: string): Promise<ESP32Payload> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ESP32: HTTP ${res.status}`);
  const data = await res.json() as ESP32Payload;
  if (typeof data.solar_w !== 'number' || typeof data.consumption_w !== 'number') {
    throw new Error('Ungültiges ESP32-Datenformat (solar_w / consumption_w fehlen)');
  }
  return data;
}
