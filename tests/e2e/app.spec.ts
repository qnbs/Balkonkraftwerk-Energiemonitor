import { test, expect } from '@playwright/test';

test.describe('BKW Monitor – Smoke Tests', () => {
  test('Startseite lädt und zeigt Header', async ({ page }) => {
    await page.goto('/Balkonkraftwerk-Energiemonitor/');
    await expect(page.locator('h1')).toContainText('BKW Monitor');
  });

  test('Navigation: alle 6 Tabs vorhanden', async ({ page }) => {
    await page.goto('/Balkonkraftwerk-Energiemonitor/');
    const nav = page.locator('nav[aria-label]');
    await expect(nav.locator('button')).toHaveCount(6);
  });

  test('Dashboard: Erzeugung-Karte sichtbar', async ({ page }) => {
    await page.goto('/Balkonkraftwerk-Energiemonitor/');
    // Wait for Suspense fallback to resolve
    await page.waitForSelector('text=Erzeugung', { timeout: 10000 });
    await expect(page.getByText('Erzeugung')).toBeVisible();
  });

  test('Tab-Navigation: ESP32-Tab öffnet sich', async ({ page }) => {
    await page.goto('/Balkonkraftwerk-Energiemonitor/');
    await page.getByText('ESP32').click();
    await expect(page.getByText('Hardware-Integration')).toBeVisible({ timeout: 5000 });
  });

  test('Tab-Navigation: Setup/Settings öffnet sich', async ({ page }) => {
    await page.goto('/Balkonkraftwerk-Energiemonitor/');
    await page.getByText('Setup').click();
    await expect(page.getByText('Erscheinungsbild')).toBeVisible({ timeout: 5000 });
  });

  test('PWA: manifest.webmanifest vorhanden', async ({ page }) => {
    const res = await page.request.get('/Balkonkraftwerk-Energiemonitor/manifest.webmanifest');
    expect(res.status()).toBe(200);
  });
});
