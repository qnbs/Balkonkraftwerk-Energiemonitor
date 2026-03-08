import { getSetting, saveSetting } from './db';

const LS_THEME_KEY = 'bkw-theme'; // kept in localStorage for synchronous FOUC-prevention
const DB_THEME_KEY = 'theme';

export type Theme = 'light' | 'dark';

/** Synchronous read from localStorage – used during React initial render to prevent FOUC. */
export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(LS_THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Persist theme to both localStorage (FOUC) and IndexedDB (source of truth). */
export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(LS_THEME_KEY, theme);
  saveSetting(DB_THEME_KEY, theme).catch(() => { /* non-critical */ });
  applyTheme(theme);
}

export async function loadThemeFromDB(): Promise<Theme | null> {
  return getSetting<Theme | null>(DB_THEME_KEY, null);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
