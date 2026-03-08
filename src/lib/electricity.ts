import { getSetting, saveSetting } from './db';

/**
 * Live electricity price integration via aWATTar Germany (EPEX Spot day-ahead).
 * Free API, no key required. Prices in €/MWh.
 * https://api.awattar.de/v1/marketdata
 */

export interface MarketPrice {
  startTimestamp: number;   // Unix ms
  endTimestamp: number;
  priceEurMwh: number;      // EPEX Spot raw price
  priceEurKwh: number;      // = priceEurMwh / 1000
  priceCtKwh: number;       // = priceEurMwh / 10
}

export type PriceLevel = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

interface ElectricityCache {
  prices: MarketPrice[];
  fetchedAt: number;
}

const CACHE_KEY = 'electricity-prices-cache';
const CACHE_TTL = 60 * 60 * 1000;  // 1 hour

/**
 * German grid surcharges, levies & taxes (approx. 2026).
 * Added on top of the spot price to estimate the household retail tariff.
 * ~17.2 ct/kWh: Netzentgelte + Steuern + Abgaben + Umlagen
 */
export const GRID_SURCHARGE_EUR_KWH = 0.172;

export async function getElectricityCache(): Promise<MarketPrice[] | null> {
  try {
    const cache = await getSetting<ElectricityCache | null>(CACHE_KEY, null);
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.prices;
  } catch { /* ignore */ }
  return null;
}

/**
 * Fetch hourly spot prices from aWATTar Germany (EPEX Spot day-ahead).
 * Results are cached for 1 h in IndexedDB → offline-capable.
 */
export async function fetchElectricityPrices(): Promise<MarketPrice[]> {
  const cached = await getElectricityCache();
  if (cached) return cached;

  const now = Date.now();
  const start = now - 2 * 3600 * 1000;   // 2 h ago (ensure current slot is included)
  const end = now + 26 * 3600 * 1000;    // +26 h ahead

  const url = `https://api.awattar.de/v1/marketdata?start=${start}&end=${end}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`aWATTar API: HTTP ${res.status}`);

  const json = await res.json() as {
    data: Array<{ start_timestamp: number; end_timestamp: number; marketprice: number }>;
  };

  const prices: MarketPrice[] = json.data.map((d) => ({
    startTimestamp: d.start_timestamp,
    endTimestamp: d.end_timestamp,
    priceEurMwh: d.marketprice,
    priceEurKwh: d.marketprice / 1000,
    priceCtKwh: d.marketprice / 10,
  }));

  const cache: ElectricityCache = { prices, fetchedAt: now };
  await saveSetting(CACHE_KEY, cache);
  return prices;
}

/** Returns the price slot that covers the current moment, or null. */
export function getCurrentPrice(prices: MarketPrice[]): MarketPrice | null {
  const now = Date.now();
  return prices.find((p) => p.startTimestamp <= now && p.endTimestamp > now) ?? null;
}

/**
 * Classify a spot price (ct/kWh) into a visual level.
 * Typical German aWATTar range: –5 to 30 ct/kWh.
 */
export function getPriceLevel(ctKwh: number): PriceLevel {
  if (ctKwh < 2)  return 'very-low';
  if (ctKwh < 8)  return 'low';
  if (ctKwh < 14) return 'medium';
  if (ctKwh < 20) return 'high';
  return 'very-high';
}

/** Estimated retail tariff = spot price + grid surcharges/taxes. */
export function getRetailEstimate(priceEurKwh: number): number {
  return Math.max(0, priceEurKwh + GRID_SURCHARGE_EUR_KWH);
}

/** Price level color classes for Tailwind. */
export const PRICE_LEVEL_COLORS: Record<PriceLevel, string> = {
  'very-low': 'text-emerald-600 dark:text-emerald-400',
  'low':      'text-green-600 dark:text-green-400',
  'medium':   'text-amber-500 dark:text-amber-400',
  'high':     'text-orange-600 dark:text-orange-400',
  'very-high':'text-rose-600 dark:text-rose-400',
};

export const PRICE_LEVEL_BG: Record<PriceLevel, string> = {
  'very-low': 'bg-emerald-100 dark:bg-emerald-900/40',
  'low':      'bg-green-100 dark:bg-green-900/40',
  'medium':   'bg-amber-100 dark:bg-amber-900/40',
  'high':     'bg-orange-100 dark:bg-orange-900/40',
  'very-high':'bg-rose-100 dark:bg-rose-900/40',
};

export const PRICE_LEVEL_LABEL: Record<PriceLevel, string> = {
  'very-low': 'Sehr günstig',
  'low':      'Günstig',
  'medium':   'Mittel',
  'high':     'Hoch',
  'very-high':'Spitzenpreis',
};
