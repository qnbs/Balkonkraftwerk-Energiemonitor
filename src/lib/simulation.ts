import { deviceFactor } from './deviceStore';

export type TimeRange = 'daily' | 'weekly' | 'monthly';

export interface EnergyDataPoint {
  time: string;
  solar: number;
  consumption: number;
  unused: number;
  grid: number;
}

// ---------------------------------------------------------------------------
// Base data generation (random, for single-device / default)
// ---------------------------------------------------------------------------
export function generateData(range: TimeRange): EnergyDataPoint[] {
  const data: EnergyDataPoint[] = [];

  if (range === 'daily') {
    for (let i = 0; i < 24; i++) {
      const isDaylight = i >= 6 && i <= 20;
      const cloudFactor = 0.6 + Math.random() * 0.4; // 60-100% clear
      const solar = isDaylight
        ? Math.max(0, Math.sin(((i - 6) / 14) * Math.PI) * 850 * cloudFactor)
        : 0;
      const baseLoad = 120 + Math.random() * 80; // 120-200W base
      const morningPeak = i >= 7 && i <= 9 ? 300 + Math.random() * 200 : 0;
      const eveningPeak = i >= 17 && i <= 22 ? 400 + Math.random() * 300 : 0;
      const consumption = baseLoad + morningPeak + eveningPeak;

      const sR = Math.round(solar);
      const cR = Math.round(consumption);
      data.push({
        time: `${i}:00`,
        solar: sR,
        consumption: cR,
        unused: Math.max(0, sR - cR),
        grid: Math.max(0, cR - sR),
      });
    }
  } else if (range === 'weekly') {
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    for (let i = 0; i < 7; i++) {
      const weather = 0.5 + Math.random() * 0.5;
      const solar = 2500 * weather + Math.random() * 1500;
      const isWeekend = i >= 5;
      const consumption = (isWeekend ? 4500 : 3500) + Math.random() * 1500;
      const sR = Math.round(solar);
      const cR = Math.round(consumption);
      data.push({
        time: days[i],
        solar: sR,
        consumption: cR,
        unused: Math.max(0, sR - cR),
        grid: Math.max(0, cR - sR),
      });
    }
  } else {
    for (let i = 1; i <= 30; i++) {
      const weather = 0.4 + Math.random() * 0.6;
      const solar = 2800 * weather + Math.random() * 1800;
      const consumption = 3500 + Math.random() * 2000;
      const sR = Math.round(solar);
      const cR = Math.round(consumption);
      data.push({
        time: `${i}.`,
        solar: sR,
        consumption: cR,
        unused: Math.max(0, sR - cR),
        grid: Math.max(0, cR - sR),
      });
    }
  }
  return data;
}

/** Simulate realistic current solar reading based on time of day */
export function simulateCurrentSolar(prev: number): number {
  const hour = new Date().getHours();
  const isDaylight = hour >= 6 && hour <= 20;
  if (!isDaylight) return Math.max(0, prev * 0.9 + Math.random() * 5);
  const target = Math.sin(((hour - 6) / 14) * Math.PI) * 750 * (0.7 + Math.random() * 0.3);
  return Math.max(0, prev * 0.7 + target * 0.3 + (Math.random() * 40 - 20));
}

export function simulateCurrentConsumption(prev: number): number {
  const hour = new Date().getHours();
  const base = 150;
  const morningPeak = hour >= 7 && hour <= 9 ? 350 : 0;
  const eveningPeak = hour >= 17 && hour <= 22 ? 500 : 0;
  const target = base + morningPeak + eveningPeak + Math.random() * 100;
  return Math.max(80, prev * 0.6 + target * 0.4 + (Math.random() * 60 - 30));
}

const ELECTRICITY_PRICE = 0.30; // €/kWh
const CO2_PER_KWH = 0.4; // kg CO₂/kWh (German grid mix)

export function calculateSavings(solarKwh: number): number {
  return solarKwh * ELECTRICITY_PRICE;
}

export function calculateCO2(solarKwh: number): number {
  return solarKwh * CO2_PER_KWH;
}

/**
 * Simulate battery state-of-charge evolution over a 3-second tick.
 * @param prevPct   Current SOC in percent (0–100)
 * @param solarW    Current solar output in Watt
 * @param consumptionW  Current consumption in Watt
 * @param capacityKwh   Battery capacity in kWh
 */
export function simulateBattery(
  prevPct: number,
  solarW: number,
  consumptionW: number,
  capacityKwh: number,
): number {
  if (capacityKwh <= 0) return prevPct;
  const netW = solarW - consumptionW;
  const deltaKwh = (netW * 3) / 3_600_000; // 3s interval in Wh → kWh
  const deltaPct = (deltaKwh / capacityKwh) * 100;
  return Math.max(0, Math.min(100, prevPct + deltaPct));
}

// ---------------------------------------------------------------------------
// Multi-device support
// ---------------------------------------------------------------------------

/**
 * Generate chart data scaled to a specific device's capacity factor.
 * Each device gets a deterministic multiplication factor based on its ID,
 * giving visually distinct but realistic data.
 */
export function generateDataForDevice(range: TimeRange, deviceId: string): EnergyDataPoint[] {
  const factor = deviceFactor(deviceId);
  return generateData(range).map((p) => {
    const solar = Math.round(p.solar * factor);
    return {
      ...p,
      solar,
      unused: Math.round(Math.max(0, solar - p.consumption)),
      grid: Math.round(Math.max(0, p.consumption - solar)),
    };
  });
}

/**
 * Aggregate (sum) data from multiple devices for the "all devices" overview.
 */
export function aggregateDevicesData(
  range: TimeRange,
  deviceIds: string[],
): EnergyDataPoint[] {
  if (deviceIds.length === 0) return generateData(range);
  if (deviceIds.length === 1) return generateDataForDevice(range, deviceIds[0]);

  const datasets = deviceIds.map((id) => generateDataForDevice(range, id));
  const base = datasets[0];
  return base.map((point, i) => {
    const solar = datasets.reduce((s, d) => s + (d[i]?.solar ?? 0), 0);
    const consumption = datasets.reduce((s, d) => s + (d[i]?.consumption ?? 0), 0);
    return {
      time: point.time,
      solar,
      consumption,
      unused: Math.max(0, solar - consumption),
      grid: Math.max(0, consumption - solar),
    };
  });
}

