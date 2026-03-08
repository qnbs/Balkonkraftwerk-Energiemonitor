export type TimeRange = 'daily' | 'weekly' | 'monthly';

export interface EnergyDataPoint {
  time: string;
  solar: number;
  consumption: number;
  unused: number;
  grid: number;
}

/** Realistic balcony PV simulation: 0-850W solar based on time of day & weather randomness */
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

      data.push({
        time: `${i}:00`,
        solar: Math.round(solar),
        consumption: Math.round(consumption),
        unused: Math.round(Math.max(0, solar - consumption)),
        grid: Math.round(Math.max(0, consumption - solar)),
      });
    }
  } else if (range === 'weekly') {
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    for (let i = 0; i < 7; i++) {
      const weather = 0.5 + Math.random() * 0.5;
      const solar = 2500 * weather + Math.random() * 1500;
      const isWeekend = i >= 5;
      const consumption = (isWeekend ? 4500 : 3500) + Math.random() * 1500;
      data.push({
        time: days[i],
        solar: Math.round(solar),
        consumption: Math.round(consumption),
        unused: Math.round(Math.max(0, solar - consumption)),
        grid: Math.round(Math.max(0, consumption - solar)),
      });
    }
  } else {
    for (let i = 1; i <= 30; i++) {
      const weather = 0.4 + Math.random() * 0.6;
      const solar = 2800 * weather + Math.random() * 1800;
      const consumption = 3500 + Math.random() * 2000;
      data.push({
        time: `${i}.`,
        solar: Math.round(solar),
        consumption: Math.round(consumption),
        unused: Math.round(Math.max(0, solar - consumption)),
        grid: Math.round(Math.max(0, consumption - solar)),
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
