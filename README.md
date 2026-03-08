# ⚡ Balkonkraftwerk Energiemonitor

![Production Ready](https://img.shields.io/badge/status-production%20ready-brightgreen)
![PWA](https://img.shields.io/badge/PWA-installable-blue)
![i18n](https://img.shields.io/badge/i18n-de%20%7C%20en-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
[![Deploy](https://github.com/qnbs/Balkonkraftwerk-Energiemonitor/actions/workflows/deploy.yml/badge.svg)](https://github.com/qnbs/Balkonkraftwerk-Energiemonitor/actions)

**Live-Demo:** https://qnbs.github.io/Balkonkraftwerk-Energiemonitor/

A fully offline-capable Progressive Web App for monitoring, analyzing and optimizing your balcony power plant (Balkonkraftwerk / micro inverter). Works without any backend — all data stays in your browser.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📊 **Live Dashboard** | Real-time solar generation & consumption with animated gauges |
| 🔋 **Battery Storage** | Optional battery SOC tracking (simulated or via ESP32/HA) |
| 🤖 **Gemini AI Analysis** | BYOK — your key, direct to Google API, never leaves browser |
| 🌤 **7-Day Forecast** | Open-Meteo weather → AI energy prediction with chart overlay |
| 🏠 **Home Assistant** | WebSocket integration (auth + state_changed subscription) |
| 🔌 **ESP32 Live Mode** | HTTP polling every 5 s, QR setup, Arduino sketch included |
| 🌍 **i18n (de / en)** | Full German & English translations, RTL-prepared |
| 🌙 **Dark Mode** | System-aware + manual toggle |
| 📲 **PWA** | Installable, offline-first, custom service worker with push support |
| 🔔 **Web Push** | Browser push notifications with VAPID (permission flow in Settings) |
| 💶 **Economics Tab** | 20-year ROI calculator with amortization chart |
| 🛠 **Materials Tab** | Component checklist & shopping list |
| 📋 **Manual Tab** | Step-by-step installation guide |

---

## 🏗 Architecture

```
src/
├── App.tsx               # Root — routing, HA wiring, theme, i18n
├── main.tsx              # React 19 entry, i18n init
├── sw.ts                 # Service Worker (injectManifest + push handler)
├── components/
│   ├── Dashboard.tsx     # Live data, chart, AI, forecast, battery card
│   ├── Settings.tsx      # Language, Dark Mode, BYOK, Push, Battery, HA
│   ├── Hardware.tsx      # ESP32 live mode, QR, Arduino sketch
│   ├── Economics.tsx     # Amortization + 20yr projection
│   ├── Manual.tsx        # Installation steps
│   ├── Materials.tsx     # Component list
│   └── ui/
│       └── LanguageSwitcher.tsx
└── lib/
    ├── i18n.ts           # i18next, de + en inline resources
    ├── ha.ts             # HAClient — HA WebSocket protocol
    ├── gemini.ts         # Gemini 2.0 Flash — analysis + forecast
    ├── weather.ts        # Open-Meteo — 7-day forecast
    ├── simulation.ts     # Data simulation + battery model
    ├── esp32.ts          # ESP32 HTTP polling
    └── theme.ts          # Dark/light theme
```

---

## 🚀 Quick Start

```bash
git clone https://github.com/qnbs/Balkonkraftwerk-Energiemonitor.git
cd Balkonkraftwerk-Energiemonitor
npm install
npm run dev          # http://localhost:3000
```

### Build & Deploy

```bash
npm run build        # → dist/
npm run preview      # local preview of built PWA
```

GitHub Actions deploys automatically on every push to `main` → GitHub Pages.

---

## 🔑 Gemini AI (BYOK)

1. Get a free key at https://aistudio.google.com/apikey
2. Open **Settings → Gemini AI** and paste your key
3. Key stored in `localStorage` only — never sent to any server
4. Click **KI-Analyse** or **24h / 7-Tage** on the Dashboard

---

## 🏠 Home Assistant Integration

1. Create a **Long-Lived Access Token** in HA (*Profile → Security*)
2. Open **Settings → Home Assistant**
3. Enter WebSocket URL: `ws://homeassistant.local:8123/api/websocket`
4. Enter token and entity IDs for solar, load, battery
5. Click **Verbinden** — Dashboard switches to live HA data automatically

The client uses the standard HA WebSocket API (`auth_required → auth_ok → get_states + subscribe_events state_changed`), compatible with HA 2021.1+.

---

## 🔌 ESP32 Hardware Setup

1. Flash your ESP32 with the Arduino sketch shown in the **Hardware tab**
2. Scan the WLAN QR code to connect the ESP32 to your network
3. Enter the ESP32 IP in the Hardware tab and click **Verbindung testen**
4. Toggle **Live (ESP32)** mode — data polls every 5 seconds

Expected JSON from ESP32:
```json
{ "solar_w": 420, "consumption_w": 310, "grid_w": 110, "battery_pct": 72 }
```

---

## 🧪 Tests

```bash
npm run test          # Vitest unit tests (simulation, battery model)
npx playwright test   # E2E smoke tests (Chromium)
```

---

## ✅ Production Checklist

- [x] PWA manifest + service worker (injectManifest mode)
- [x] Offline-first precaching (22 entries)
- [x] i18n — German & English, LanguageDetector
- [x] Dark Mode (system-aware + localStorage)
- [x] Home Assistant WebSocket client
- [x] Battery storage simulation & SOC display
- [x] Web Push permission flow + VAPID-ready SW handler
- [x] Gemini AI analysis & 7-day forecast (BYOK, 30 min cache)
- [x] ESP32 live mode with fallback to simulation
- [x] Code splitting — 10 lazy-loaded chunks
- [x] Vitest unit tests
- [x] Playwright E2E smoke tests
- [x] Lighthouse CI workflow (`.github/workflows/lighthouse.yml`)
- [x] `robots.txt` + canonical URL + preconnect hints
- [x] GitHub Actions deploy → GitHub Pages

---

## 🛠 Tech Stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript 5.8 |
| Build | Vite 6 + vite-plugin-pwa 0.21 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3.8 |
| Animation | Framer Motion (motion/react) |
| i18n | react-i18next + i18next-browser-languagedetector |
| AI | @google/generative-ai (Gemini 2.0 Flash) |
| Weather | Open-Meteo (free, no key) |
| Toasts | sonner v2 |
| QR Codes | qrcode.react v4 |
| SW | workbox-precaching + workbox-core |
| Tests | Vitest + Playwright |

---

## 📄 License

MIT © 2025 qnbs
