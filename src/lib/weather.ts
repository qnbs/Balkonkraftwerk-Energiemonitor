export interface WeatherHour {
  time: string;        // ISO local datetime, e.g. "2026-03-08T14:00"
  radiation: number;   // W/m² shortwave radiation
  cloudCover: number;  // 0–100 %
  precipitation: number; // mm
  tempC: number;
}

export interface WeatherForecast {
  location: { lat: number; lon: number };
  fetchedAt: number;
  hours: WeatherHour[];
}

const CACHE_KEY = 'bkw-weather-forecast';
const RATE_KEY = 'bkw-weather-rate';
const CACHE_TTL = 30 * 60 * 1000;  // 30 min
const RATE_LIMIT_MS = 60 * 1000;   // 1 min between API calls

export class WeatherRateLimitError extends Error {
  remainingSecs: number;
  constructor(secs: number) {
    super(`Rate-Limit aktiv – bitte noch ${secs} Sekunde${secs !== 1 ? 'n' : ''} warten.`);
    this.name = 'WeatherRateLimitError';
    this.remainingSecs = secs;
  }
}

export function getWeatherCache(): WeatherForecast | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const f: WeatherForecast = JSON.parse(raw);
    if (Date.now() - f.fetchedAt < CACHE_TTL) return f;
  } catch { /* ignore parse errors */ }
  return null;
}

function getCoords(): Promise<{ lat: number; lon: number }> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: 50.11, lon: 8.68 }); // Frankfurt fallback
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ lat: 50.11, lon: 8.68 }),
      { timeout: 5000 },
    );
  });
}

/** Fetch 7-day hourly forecast from Open-Meteo (free, no API key required).
 *  Results are cached 30 min in localStorage. Rate-limited to 1 req/min. */
export async function fetchWeatherForecast(): Promise<WeatherForecast> {
  const cached = getWeatherCache();
  if (cached) return cached;

  const lastCall = parseInt(localStorage.getItem(RATE_KEY) ?? '0', 10);
  const elapsed = Date.now() - lastCall;
  if (lastCall > 0 && elapsed < RATE_LIMIT_MS) {
    throw new WeatherRateLimitError(Math.ceil((RATE_LIMIT_MS - elapsed) / 1000));
  }

  localStorage.setItem(RATE_KEY, String(Date.now()));
  const { lat, lon } = await getCoords();

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=shortwave_radiation,cloud_cover,precipitation,temperature_2m` +
    `&forecast_days=7&timezone=Europe%2FBerlin`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);

  const json = await res.json() as {
    hourly: {
      time: string[];
      shortwave_radiation: number[];
      cloud_cover: number[];
      precipitation: number[];
      temperature_2m: number[];
    };
  };

  const { time, shortwave_radiation, cloud_cover, precipitation, temperature_2m } = json.hourly;
  const hours: WeatherHour[] = time.map((t, i) => ({
    time: t,
    radiation: shortwave_radiation[i] ?? 0,
    cloudCover: cloud_cover[i] ?? 0,
    precipitation: precipitation[i] ?? 0,
    tempC: temperature_2m[i] ?? 10,
  }));

  const forecast: WeatherForecast = { location: { lat, lon }, fetchedAt: Date.now(), hours };
  localStorage.setItem(CACHE_KEY, JSON.stringify(forecast));
  return forecast;
}

/** Convert weather measurements to estimated BKW output in Watt.
 *  Assumes ~3.4 m² panel area (2 × 425 W), 18 % module efficiency, 96 % inverter. */
export function weatherToSolar(radiation: number, cloudCover: number): number {
  const dc = radiation * 3.4 * 0.18 * 0.96;
  const cloudMultiplier = 1 - (cloudCover / 100) * 0.75;
  return Math.max(0, Math.min(850, Math.round(dc * cloudMultiplier)));
}
