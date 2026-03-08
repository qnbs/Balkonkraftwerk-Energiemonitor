export interface ESP32Payload {
  solar_w: number;
  consumption_w: number;
  grid_w: number;
  uptime_s?: number;
  ip?: string;
  age_ms?: number;
}

const LIVE_MODE_KEY = 'bkw-live-mode';
const ESP32_URL_KEY = 'bkw-esp32-url';

export const DEFAULT_ESP32_URL = 'http://192.168.4.1/energy';

export function isLiveMode(): boolean {
  return localStorage.getItem(LIVE_MODE_KEY) === 'true';
}

export function setLiveMode(v: boolean): void {
  localStorage.setItem(LIVE_MODE_KEY, String(v));
}

export function getEsp32Url(): string {
  return localStorage.getItem(ESP32_URL_KEY) ?? DEFAULT_ESP32_URL;
}

export function setEsp32Url(url: string): void {
  localStorage.setItem(ESP32_URL_KEY, url.trim());
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
