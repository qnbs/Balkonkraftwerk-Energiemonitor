import { getSetting, saveSetting } from './db';

/**
 * Web Push / local notification helpers for BKW Monitor.
 * Uses ServiceWorkerRegistration.showNotification so alerts work even when
 * the tab is in the background (or the PWA is installed).
 * No server needed — all notifications are triggered client-side.
 */

export interface AlertPreferences {
  peakProduction: boolean;
  lowAutarky: boolean;
  amortization: boolean;
  pricePeak: boolean;
  /** Spot price (ct/kWh) above which a "peak price" alert fires */
  pricePeakThresholdCtKwh: number;
  /** Spot price (ct/kWh) below which a "cheap power" alert fires */
  priceLowThresholdCtKwh: number;
  /** Self-sufficiency below this % triggers the low-autarky alert */
  lowAutarkyThreshold: number;
}

const PREFS_KEY    = 'alert-prefs';
const COOLDOWN_KEY = 'alert-cooldowns';
/** 30-minute cooldown per alert tag to avoid notification spam */
const COOLDOWN_MS  = 30 * 60 * 1000;

export const DEFAULT_ALERT_PREFS: AlertPreferences = {
  peakProduction: true,
  lowAutarky: true,
  amortization: true,
  pricePeak: true,
  pricePeakThresholdCtKwh: 20,
  priceLowThresholdCtKwh: 2,
  lowAutarkyThreshold: 50,
};

export async function getAlertPrefs(): Promise<AlertPreferences> {
  try {
    const val = await getSetting<AlertPreferences | null>(PREFS_KEY, null);
    if (val) return { ...DEFAULT_ALERT_PREFS, ...val };
  } catch { /* ignore */ }
  return { ...DEFAULT_ALERT_PREFS };
}

export async function saveAlertPrefs(prefs: AlertPreferences): Promise<void> {
  await saveSetting(PREFS_KEY, prefs);
}

// ---------------------------------------------------------------------------
// Cooldown helpers (stored in IndexedDB so they survive tab reloads)
// ---------------------------------------------------------------------------

async function getCooldowns(): Promise<Record<string, number>> {
  try {
    return await getSetting<Record<string, number>>(COOLDOWN_KEY, {});
  } catch { /* ignore */ }
  return {};
}

async function setCooldown(tag: string): Promise<void> {
  const c = await getCooldowns();
  c[tag] = Date.now();
  await saveSetting(COOLDOWN_KEY, c);
}

async function isCooledDown(tag: string): Promise<boolean> {
  return Date.now() - ((await getCooldowns())[tag] ?? 0) > COOLDOWN_MS;
}

// ---------------------------------------------------------------------------
// Core notify helper
// ---------------------------------------------------------------------------

const ICON = '/Balkonkraftwerk-Energiemonitor/pwa-192.png';

/**
 * Show a notification via the registered Service Worker.
 * Falls back to the basic Notification API if SW is unavailable.
 */
export async function showBrowserNotification(
  title: string,
  body: string,
  tag: string,
): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: ICON,
      badge: ICON,
      tag,
      // vibrate is a Web Push / ServiceWorker notification extension
      ...(({ vibrate: [200, 100, 200] } as unknown) as object),
      data: { url: '/Balkonkraftwerk-Energiemonitor/' },
    });
  } catch {
    // SW not available (e.g. in dev mode without HTTPS)
    new Notification(title, { body, icon: ICON, tag });
  }
}

// ---------------------------------------------------------------------------
// Alert checks
// ---------------------------------------------------------------------------

export interface AlertCheckInput {
  currentSolarW: number;
  selfSufficiency: number;
  /** Historical peak (used to decide "peak production") */
  peakSolarW: number;
  /** Current spot price in ct/kWh, or null if unavailable */
  spotPriceCtKwh: number | null;
  amortizationReached: boolean;
  daysToAmortization: number | null;
}

/**
 * Check all enabled alert conditions and fire browser notifications
 * for those that are triggered and not within their cooldown window.
 */
export async function checkAlerts(input: AlertCheckInput): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const prefs = await getAlertPrefs();
  const { currentSolarW, selfSufficiency, peakSolarW, spotPriceCtKwh, amortizationReached, daysToAmortization } = input;

  // ⚡ Peak production
  if (
    prefs.peakProduction &&
    currentSolarW >= peakSolarW * 0.9 &&
    currentSolarW > 300 &&
    await isCooledDown('peak')
  ) {
    await showBrowserNotification(
      '☀️ Peak-Erzeugung jetzt!',
      `Deine Anlage läuft auf Hochtouren: ${Math.round(currentSolarW)} W`,
      'peak',
    );
    await setCooldown('peak');
  }

  // ⚡ Low autarky
  if (prefs.lowAutarky && selfSufficiency < prefs.lowAutarkyThreshold && await isCooledDown('autarky')) {
    await showBrowserNotification(
      `⚡ Autarkie unter ${prefs.lowAutarkyThreshold} %`,
      `Aktuelle Eigenversorgung: ${selfSufficiency} % – hoher Netzbezug`,
      'autarky',
    );
    await setCooldown('autarky');
  }

  // 🎉 Amortization milestone
  if (prefs.amortization && amortizationReached && await isCooledDown('amortization')) {
    await showBrowserNotification(
      '🎉 Amortisation erreicht!',
      daysToAmortization != null
        ? `Deine Anlage amortisiert sich in ${daysToAmortization} Tagen!`
        : 'Deine Anlage hat sich bereits amortisiert!',
      'amortization',
    );
    await setCooldown('amortization');
  }

  // 💰 Price alerts
  if (prefs.pricePeak && spotPriceCtKwh != null) {
    if (spotPriceCtKwh > prefs.pricePeakThresholdCtKwh && await isCooledDown('price-high')) {
      await showBrowserNotification(
        '💸 Strompreis-Spitze!',
        `Spotpreis jetzt ${spotPriceCtKwh.toFixed(1)} ct/kWh – Eigenverbrauch maximieren!`,
        'price-high',
      );
      await setCooldown('price-high');
    } else if (spotPriceCtKwh < prefs.priceLowThresholdCtKwh && await isCooledDown('price-low')) {
      await showBrowserNotification(
        '🟢 Günstiger Strom jetzt',
        `Spotpreis jetzt nur ${spotPriceCtKwh.toFixed(1)} ct/kWh – guter Zeitpunkt für hohen Verbrauch`,
        'price-low',
      );
      await setCooldown('price-low');
    }
  }
}
