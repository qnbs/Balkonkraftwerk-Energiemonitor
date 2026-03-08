import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n'; // i18next must be initialized before rendering
import { applyTheme, getStoredTheme } from './lib/theme';
import i18n from './lib/i18n';

applyTheme(getStoredTheme());
// Apply stored language + dir to <html>
const storedLang = localStorage.getItem('bkw-lang') ?? navigator.language.split('-')[0];
document.documentElement.setAttribute('lang', storedLang);
document.documentElement.setAttribute('dir', i18n.dir(storedLang));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
