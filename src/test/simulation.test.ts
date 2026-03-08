import { describe, it, expect } from 'vitest';
import {
  generateData,
  simulateCurrentSolar,
  simulateCurrentConsumption,
  calculateSavings,
  calculateCO2,
  simulateBattery,
} from '../lib/simulation';

describe('generateData', () => {
  it('daily: 24 data points, solar >= 0', () => {
    const data = generateData('daily');
    expect(data).toHaveLength(24);
    data.forEach((d) => {
      expect(d.solar).toBeGreaterThanOrEqual(0);
      expect(d.consumption).toBeGreaterThan(0);
      expect(d.unused).toBeGreaterThanOrEqual(0);
    });
  });

  it('weekly: 7 data points', () => {
    expect(generateData('weekly')).toHaveLength(7);
  });

  it('monthly: 30 data points', () => {
    expect(generateData('monthly')).toHaveLength(30);
  });

  it('solar never exceeds 850 W in daily view', () => {
    for (let i = 0; i < 10; i++) {
      generateData('daily').forEach((d) => expect(d.solar).toBeLessThanOrEqual(850));
    }
  });

  it('unused = max(0, solar - consumption)', () => {
    generateData('daily').forEach((d) => {
      expect(d.unused).toBe(Math.round(Math.max(0, d.solar - d.consumption)));
    });
  });
});

describe('simulateCurrentSolar', () => {
  it('returns non-negative value', () => {
    for (let i = 0; i < 50; i++) {
      expect(simulateCurrentSolar(400)).toBeGreaterThanOrEqual(0);
    }
  });

  it('interpolates smoothly (≤ 400 W swing per 3s tick)', () => {
    const next = simulateCurrentSolar(400);
    expect(Math.abs(next - 400)).toBeLessThanOrEqual(410);
  });
});

describe('simulateCurrentConsumption', () => {
  it('stays above zero', () => {
    for (let i = 0; i < 50; i++) {
      expect(simulateCurrentConsumption(300)).toBeGreaterThan(0);
    }
  });
});

describe('calculateSavings', () => {
  it('1 kWh at 0.30 EUR = 0.30 EUR', () => {
    expect(calculateSavings(1)).toBeCloseTo(0.3, 5);
  });

  it('scales linearly', () => {
    expect(calculateSavings(10)).toBeCloseTo(3.0, 5);
  });
});

describe('calculateCO2', () => {
  it('1 kWh → 0.4 kg CO₂', () => {
    expect(calculateCO2(1)).toBeCloseTo(0.4, 5);
  });
});

describe('simulateBattery', () => {
  it('charges when solar > consumption', () => {
    const result = simulateBattery(50, 800, 200, 5);
    expect(result).toBeGreaterThan(50);
  });

  it('discharges when solar < consumption', () => {
    const result = simulateBattery(50, 0, 500, 5);
    expect(result).toBeLessThan(50);
  });

  it('clamps between 0 and 100', () => {
    expect(simulateBattery(100, 850, 0, 5)).toBeLessThanOrEqual(100);
    expect(simulateBattery(0, 0, 2000, 5)).toBeGreaterThanOrEqual(0);
  });
});
