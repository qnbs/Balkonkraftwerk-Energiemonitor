import { GoogleGenerativeAI } from '@google/generative-ai';

const STORAGE_KEY = 'bkw-gemini-api-key';
const FORECAST_CACHE_KEY = 'bkw-forecast-ai';
const FORECAST_CACHE_TTL = 30 * 60 * 1000; // 30 min

export interface DayForecast {
  datum: string;               // "Heute", "Morgen", or weekday abbreviation
  avgCloudCover: number;       // 0–100 %
  maxRadiationWm2: number;     // W/m² peak
  totalPrecipMm: number;       // mm
  estimatedKwh: number;        // client-side pre-calculated estimate
}

export interface ForecastInput {
  aktuelleErzeugungW: number;
  aktuellerVerbrauchW: number;
  heuteKwhBisher: string;
  tage: DayForecast[];         // 7 days starting today
  historischDurchschnittKwh: string;
}

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

export function setStoredApiKey(key: string): void {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasApiKey(): boolean {
  return getStoredApiKey().length > 0;
}

export async function analyzeEnergyData(
  data: Record<string, unknown>,
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Kein Gemini API-Key konfiguriert. Bitte unter Settings eingeben.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Du bist ein Energieberater für Balkonkraftwerke in Deutschland.
Analysiere die folgenden Energiedaten und gib konkrete, hilfreiche Tipps auf Deutsch.
Formatiere die Antwort als übersichtliches Markdown mit Emojis.

Daten:
${JSON.stringify(data, null, 2)}

Antworte mit:
1. **Zusammenfassung** der aktuellen Energiebilanz
2. **Autarkie-Bewertung** (wie gut deckt das BKW den Eigenverbrauch?)
3. **Optimierungstipps** (wann sollte man Geräte einschalten?)
4. **Prognose** für die nächsten Stunden basierend auf dem Trend
5. **Spartipp** des Tages`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

interface ForecastCache {
  result: string;
  timestamp: number;
  fingerprint: string;
}

function getForecastCached(fingerprint: string): string | null {
  try {
    const raw = localStorage.getItem(FORECAST_CACHE_KEY);
    if (!raw) return null;
    const c: ForecastCache = JSON.parse(raw);
    if (c.fingerprint === fingerprint && Date.now() - c.timestamp < FORECAST_CACHE_TTL) {
      return c.result;
    }
  } catch { /* ignore */ }
  return null;
}

/** Generate 24h + 7-day Gemini forecast using live energy + Open-Meteo weather data.
 *  Results are cached 30 min in localStorage keyed to input fingerprint. */
export async function forecastEnergyData(input: ForecastInput): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) throw new Error('Kein Gemini API-Key konfiguriert. Bitte unter Settings eingeben.');

  const fingerprint = JSON.stringify(input).slice(0, 120);
  const cached = getForecastCached(fingerprint);
  if (cached) return cached;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const daysTable = input.tage
    .map(d =>
      `| ${d.datum.padEnd(8)} | ${String(d.avgCloudCover).padStart(3)} % | ${String(d.maxRadiationWm2).padStart(4)} W/m² | ${String(d.totalPrecipMm).padStart(4)} mm | ~${d.estimatedKwh} kWh |`,
    )
    .join('\n');

  const prompt = `Du bist ein Energieprognose-Experte für Balkonkraftwerke in Deutschland (850 W Peak, ~365 kWh/Jahr).
Erstelle eine präzise 24h- und 7-Tage-Energieprognose auf Deutsch. Verwende Markdown mit Emojis.

**Aktuelle Messdaten:**
- Erzeugung jetzt: ${input.aktuelleErzeugungW} W
- Verbrauch jetzt: ${input.aktuellerVerbrauchW} W
- Bisherige Erzeugung heute: ${input.heuteKwhBisher} kWh
- Historischer Tagesdurchschnitt: ${input.historischDurchschnittKwh} kWh

**7-Tage-Wetterdaten (Open-Meteo):**
| Tag      | Bewölk. | Strahlung    | Nieder. | Schätzung |
|----------|---------|--------------|---------|-----------|
${daysTable}

Antworte mit diesen 5 Abschnitten:

1. **Morgen erwartete Erzeugung: X,X kWh (±Y %)** – genaue Begründung aus Wetterdaten (Bewölkung, Strahlung)
2. **7-Tage-Ausblick** – tabellarisch mit Tag, kWh-Schätzung und Wettertrend-Emoji (☀️🌤️⛅🌥️🌧️)
3. **Bester Solarpeak morgen** – voraussichtliche Uhrzeit und Maximalleistung in W
4. **Empfehlung** – welche Verbraucher (Waschmaschine, Spülmaschine, Laden) wann einschalten
5. **Hinweis** falls Schlechtwetterperiode erkannt wird (> 3 Tage > 60 % Bewölkung)`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  localStorage.setItem(
    FORECAST_CACHE_KEY,
    JSON.stringify({ result: text, timestamp: Date.now(), fingerprint } satisfies ForecastCache),
  );
  return text;
}
