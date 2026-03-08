# ⚡ Balkonkraftwerk Energiemonitor

![Production Ready](https://img.shields.io/badge/status-production%20ready-brightgreen)
![PWA](https://img.shields.io/badge/PWA-installable-blue)
![i18n](https://img.shields.io/badge/i18n-de%20%7C%20en-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
[![Deploy](https://github.com/qnbs/Balkonkraftwerk-Energiemonitor/actions/workflows/deploy.yml/badge.svg)](https://github.com/qnbs/Balkonkraftwerk-Energiemonitor/actions)

**Live-Demo:** https://qnbs.github.io/Balkonkraftwerk-Energiemonitor/

Ein vollständig offline-fähiges Progressive Web App zur Überwachung, Analyse und Optimierung deines Balkonkraftwerks. Kein Backend nötig — alle Daten bleiben im Browser.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📊 **Live Dashboard** | Echtzeit-Solarproduktion & Verbrauch mit animierten Karten |
| 💡 **Live Strompreise** | aWATTar Germany EPEX Spot-Preise, 1-Stunden-Cache, 24-h-Chart |
| 💸 **Dynamische Ersparnis** | Eigenverbrauch-Berechnung mit aktuellem Handelspreis (Spot + Abgaben) |
| 🟢 **Einspeisung-Banner** | „Jetzt lohnt sich Einspeisung!" / „Günstiger Strom jetzt!" situativ |
| 🔔 **Web Push Notifications** | Lokale SW-Notifications: Peak, Autarkie, Amortisation, Preis-Spitze |
| ⚙️ **Alert-Konfiguration** | Per-Alert-Toggle + Schwellwert-Slider in den Settings |
| 🏠 **Home Assistant WebSocket** | Direkte HA-API-Integration, auth_ok + state_changed-Subscription |
| 📡 **MQTT-Integration** | MQTT.js WebSocket-Client im Browser, verbindet direkt zum Broker |
| 🔌 **ESP32 HTTP-Modus (v2)** | HTTP-Polling alle 5 s, QR-Setup, Arduino-Sketch inklusive |
| 📤 **ESP32 MQTT-Modus (v3)** | ESP32 publiziert retained auf `bkw/energy/#`, PubSubClient |
| 🔋 **Batteriespeicher** | Optionales SOC-Tracking (Simulation oder ESP32/HA/MQTT) |
| 🤖 **Gemini KI-Analyse** | BYOK — dein Key, direkt zur Google API, verschlüsselt in IndexedDB |
| 🔐 **DB-Verschlüsselung** | Gesamte IndexedDB AES-GCM 256-bit verschlüsselt — PIN-basiert, Web Crypto API |
| ☁️ **Cloud-Sync (Supabase)** | Optionaler Multi-Gerät-Sync — offline-first, Ende-zu-Ende-verschlüsselt, Magic Link Auth |
| 🌤 **7-Tage-Prognose** | Open-Meteo Wetter → KI-Energieprognose mit Chart-Overlay |
| 🌍 **i18n (de / en)** | Vollständige deutsche & englische Übersetzungen, RTL-vorbereitet |
| 🌙 **Dark Mode** | System-aware + manuelle Umschaltung |
| 📲 **PWA** | Installierbar, offline-first, Service Worker mit Push-Handler |
| 💶 **Rendite-Tab** | 20-Jahres-ROI-Rechner mit Amortisationstabelle |
| 🛠 **Hilfe-Tab** | Montagehandbuch · Stückliste · Integrationsguide (MQTT, HA, ESP32) |

---

## 💡 Live Strompreise (aWATTar Germany)

Das Dashboard fragt stündlich die **EPEX Spot Intraday-Preise** für Deutschland über die kostenlose [aWATTar-API](https://api.awattar.de/v1/marketdata) ab:

- **Live Spot-Preis** in ct/kWh mit Preis-Level-Indikator (Sehr günstig → Spitzenpreis)
- **Geschätzter Haushaltspreis** = Spot + ~17,2 ct/kWh (Netzentgelte, Steuern, Abgaben)
- **24-h Balkendiagramm** der heutigen und morgigen Stundenpreise
- **Situatives Banner**: „Jetzt lohnt sich Einspeisung!" (hoher Preis) oder „Günstiger Strom jetzt" (Niedrigpreis)
- **Dynamische Ersparnis-Berechnung** im Dashboard nutzt den aktuellen Handelspreis statt Fixwert
- Daten werden **1 Stunde gecacht** → offline-fähig

---

## 🔔 Web Push Notifications

Benachrichtigungen werden lokal über den Service Worker ausgelöst (kein Backend nötig):

| Alert | Trigger |
|---|---|
| ☀️ **Peak-Erzeugung** | Anlage läuft auf ≥ 90 % ihrer historischen Spitze |
| ⚡ **Niedrige Autarkie** | Eigenversorgung fällt unter konfigurierten Schwellwert (Standard: 50 %) |
| 🎉 **Amortisation** | Einmalige Meilenstein-Notification bei Erreichen der Amortisation |
| 💸 **Strompreis-Spitze** | Spot-Preis überschreitet / unterschreitet konfigurierten Schwellwert |

Konfiguration: **Settings → Push-Benachrichtigungen** — Pro Alert ein Toggle + Schwellwert-Slider.  
30-Minuten-Cooldown pro Alert-Typ verhindert Benachrichtigungs-Spam.

---

## 📡 MQTT-Integration

Die App verbindet sich per **MQTT.js WebSocket** direkt zum MQTT-Broker — kein Proxy, kein Backend.

### Broker einrichten

**Option A – Mosquitto (Linux / Raspberry Pi)**
```bash
sudo apt install mosquitto mosquitto-clients
# /etc/mosquitto/conf.d/websockets.conf:
# listener 1883        # TCP – für ESP32
# listener 9001        # WebSocket – für Browser
# protocol websockets
# allow_anonymous false
# password_file /etc/mosquitto/passwd
sudo systemctl restart mosquitto
```

**Option B – Home Assistant Mosquitto Add-on**
1. HA → Einstellungen → Add-ons → **Mosquitto Broker** installieren & starten
2. Port 9001 (WebSocket) ist automatisch aktiv
3. Broker-URL in der App: `ws://<HA-IP>:9001`

### Topic-Struktur (ESP32 v3 MQTT-Firmware)

| Topic | Typ | Beschreibung |
|---|---|---|
| `bkw/energy/solar_w` | Float | Aktuelle Solarleistung (W) |
| `bkw/energy/consumption_w` | Float | Haushaltsverbrauch (W) |
| `bkw/energy/grid_w` | Float | Netzbezug (pos.) / Einspeisung (neg.) (W) |
| `bkw/energy/battery_pct` | Float | Batterieladung (%) |
| `bkw/energy/uptime_s` | Int | Betriebszeit (s) |
| `bkw/energy/ip` | String | IP-Adresse des ESP32 |
| `bkw/status` | String | `"online"` / `"offline"` (LWT) |

Alle Werte werden mit **retained flag** publiziert → App erhält sofort aktuellste Werte beim Connect.

### App konfigurieren

1. **Setup → MQTT-Broker** öffnen
2. Broker-URL eintragen: `ws://homeassistant.local:9001`
3. Optional: Benutzername / Passwort
4. Topics anpassen (Standard passt zu ESP32 v3 Firmware)
5. **Verbinden** → Daten erscheinen sofort im Dashboard

---

## 🏠 Home Assistant Integration

### WebSocket-API (direkt)

1. **Long-Lived Access Token** in HA anlegen (*Profil → Sicherheit*)
2. **Setup → Home Assistant** öffnen
3. WebSocket-URL: `ws://homeassistant.local:8123/api/websocket`
4. Token + Entity-IDs für Solar, Verbrauch, Batterie eintragen
5. **Verbinden** — Dashboard wechselt auf HA-Livedaten

### MQTT-Sensoren in HA anlegen

```yaml
# configuration.yaml
mqtt:
  sensor:
    - name: "BKW Solar"
      state_topic: "bkw/energy/solar_w"
      unit_of_measurement: "W"
      device_class: power
      state_class: measurement

    - name: "BKW Verbrauch"
      state_topic: "bkw/energy/consumption_w"
      unit_of_measurement: "W"
      device_class: power

    - name: "BKW Netz"
      state_topic: "bkw/energy/grid_w"
      unit_of_measurement: "W"
      device_class: power
```

Danach stehen `sensor.bkw_solar`, `sensor.bkw_verbrauch` etc. als HA-Entitäten zur Verfügung und können über die WebSocket-Integration abonniert werden.

---

## 🔌 ESP32 Hardware-Setup

### v2 · HTTP-Polling (einfach)

Bibliotheken: `ESPAsyncWebServer`, `ArduinoJson ≥ 7`

- ESP32 startet einen minimalen HTTP-Server auf Port 80
- Endpoint: `GET http://<ESP32-IP>/energy` → JSON
- Die App pollt alle 5 Sekunden
- CORS-Header sind gesetzt → direktes Abrufen aus dem Browser

```json
{ "solar_w": 423.5, "consumption_w": 310.0, "grid_w": -113.5, "uptime_s": 3600 }
```

### v3 · MQTT-Push (empfohlen für Smart Home)

Zusätzliche Bibliothek: `PubSubClient ≥ 2.8`

- ESP32 verbindet sich sowohl mit WLAN als auch MQTT-Broker (TCP Port 1883)
- Publiziert alle 5 Sekunden auf `bkw/energy/#` (retained)
- Last-Will-Testament: `bkw/status` = `"offline"` bei Verbindungsabbruch
- HTTP-Fallback bleibt erhalten → Backward-Kompatibilität zu v2

### Flashen (Arduino IDE)

1. **Arduino IDE 2** installieren: [arduino.cc/en/software](https://arduino.cc/en/software)
2. Boardverwalter-URL hinzufügen:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Board wählen: **ESP32 Dev Module**
4. Sketch aus dem **Hardware-Tab** der App kopieren (v2 HTTP oder v3 MQTT)
5. SSID / Passwort / Broker-Adresse im Sketch eintragen
6. Upload → Serieller Monitor (115200 Baud) zeigt IP-Adresse

---

## 🏗 Architektur

```
src/
├── App.tsx               # Root — HA + MQTT Client, Routing, Strompreis-Fetch
├── main.tsx              # React 19 Entry, i18n init
├── sw.ts                 # Service Worker (injectManifest + Push-Handler)
├── components/
│   ├── Dashboard.tsx     # Live-Daten, Strompreis, Banner, Chart, KI
│   ├── Settings.tsx      # Sprache, Dark Mode, BYOK, Push, Batterie, HA, MQTT
│   ├── Hardware.tsx      # ESP32 Live Mode, v2 HTTP / v3 MQTT Firmware
│   ├── Economics.tsx     # Amortisation + 20-Jahres-Projektion
│   ├── Help.tsx          # Anleitung · Stückliste · Integrationen
│   ├── DeviceManager.tsx # Multi-Anlagen-Verwaltung
│   └── ui/
│       ├── ErrorBoundary.tsx
│       ├── LanguageSwitcher.tsx
│       └── Skeleton.tsx
└── lib/
    ├── i18n.ts           # i18next, de + en Inline-Resources
    ├── ha.ts             # HAClient — HA WebSocket Protokoll
    ├── mqtt.ts           # MQTTClient — MQTT.js WebSocket (NEU)
    ├── gemini.ts         # Gemini 2.0 Flash — Analyse + Prognose
    ├── weather.ts        # Open-Meteo — 7-Tage-Prognose
    ├── simulation.ts     # Datensimulation + Batteriemodell
    ├── esp32.ts          # ESP32 HTTP-Polling
    ├── electricity.ts    # aWATTar EPEX Spot Preise
    ├── push.ts           # Web Push Alerts + Cooldown-Management
    ├── db.ts             # Dexie.js IndexedDB — Stores, AES-GCM DB-Verschlüsselung, PBKDF2, Sync-Queue
    ├── supabase.ts       # Supabase Client — Magic Link Auth, SyncRow CRUD, Realtime
    ├── deviceStore.ts    # Multi-Anlagen-Verwaltung (via IndexedDB)
    └── theme.ts          # Dark/Light Theme
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
npm run preview      # lokale Vorschau des gebauten PWA
```

GitHub Actions deployt automatisch bei jedem Push auf `main` → GitHub Pages.

---

## � End-to-End Datenbank-Verschlüsselung

Die gesamte IndexedDB (alle Stores: `settings`, `energyReadings`, `devices`, `reports`) wird **transparent mit AES-GCM 256-bit** verschlüsselt:

| Schritt | Mechanismus |
|---|---|
| PIN-Eingabe (6-stellig) | Nur im Memory, nie persistiert |
| Key-Ableitung | PBKDF2 (SHA-256, 100 000 Iterationen) aus PIN + Salt |
| DB-Encryption-Key | Zufälliger AES-256-Key, via PBKDF2-Key verschlüsselt gespeichert |
| PIN-Verifizierung | SHA-256-Hash des PINs gespeichert (kein Klartext-PIN) |
| Datenverschlüsselung | Jeder Datensatz einzeln mit AES-GCM + zufälligem IV |
| App-Start | PIN-Modal → Entschlüsselung → normaler Betrieb |
| PIN vergessen | Alles löschen + Neustart (unwiderruflich!) |

**Settings → Datenschutz & Verschlüsselung:**
- „Daten verschlüsseln“ Toggle zum Aktivieren
- PIN einrichten, ändern oder zurücksetzen
- Warnung: „Ohne PIN sind alle Daten (inkl. Gemini-Key) unwiderruflich verloren!“

---

## ☁️ Cloud-Sync (Supabase) — Optional, Ende-zu-Ende-verschlüsselt

Die App unterstützt optional **Supabase** als Cloud-Backend für Multi-Gerät-Synchronisation. Das Feature ist vollständig optional — die App funktioniert **100 % offline ohne Cloud**.

### Funktionsweise

| Aspekt | Implementierung |
|---|---|
| Architektur | Offline-First — Schreiben gehen immer zuerst in IndexedDB |
| Sync-Queue | Änderungen werden in `syncQueue`-Store gepuffert, geleert bei Reconnect |
| Verschlüsselung | Nur verschlüsselte Blobs werden zu Supabase gesendet — **nie Klartext** |
| Auth | Magic Link (kein Passwort nötig) |
| Konfliktauflösung | Last-Write-Wins anhand `sync_version` (Epoch-ms) |
| Realtime | `postgres_changes`-Subscription → Änderungen kommen sofort auf allen Geräten an |
| RLS | Supabase Row-Level-Security — jeder User sieht nur seine eigenen Daten |

### Einrichtung

1. **Supabase-Projekt anlegen**: https://supabase.com → New Project
2. **SQL-Migration ausführen**: In Supabase → SQL Editor den Inhalt von `supabase/migrations/001_bkw_sync.sql` einfügen und ausführen
3. **Env-Variablen setzen**:
   ```bash
   # .env.local
   VITE_SUPABASE_URL=https://dein-projekt.supabase.co
   VITE_SUPABASE_ANON_KEY=dein-anon-key
   ```
4. **App neu bauen** (`npm run build`) oder Dev-Server neu starten (`npm run dev`)
5. In der App: **Settings → Cloud-Sync** → E-Mail-Adresse eingeben → Magic Link anfordern → Link klicken
6. Nach dem Login: **DB-Verschlüsselung aktivieren** (Pflicht!) — ohne aktive Verschlüsselung wird kein Sync gestartet

> **Sicherheitshinweis:** `VITE_SUPABASE_ANON_KEY` ist der öffentliche Anon-Key — dieser ist sicher, in Frontend-Code einzubetten. Supabase RLS stellt sicher, dass kein User auf fremde Daten zugreifen kann.

### Ohne Supabase (Standard)

Ohne die Env-Variablen zeigt die Cloud-Sync-Section in Settings den Hinweis „Kein Sync konfiguriert" — alle anderen Features sind vollständig verfügbar.

---

## 🔑 Gemini KI (BYOK) — Sichere Schlüsselverwaltung

1. Kostenlosen Key holen: https://aistudio.google.com/apikey
2. **Settings → Gemini KI** öffnen → Key ins Passwort-Feld eintragen
3. Optional (empfohlen): **DB-Verschlüsselung mit PIN** aktivieren → Key wird doppelt geschützt
4. Key wird ausschließlich in **IndexedDB** gespeichert — nie in `localStorage`, nie in `.env`
5. Key erscheint **nie im Klartext** in DevTools oder der Browserkonsole
6. **Empfehlung:** Im Google AI Studio den Key auf Referrer `*.github.io/*` beschränken
7. **KI-Analyse** oder **24h / 7-Tage** im Dashboard klicken

> **Tipp:** Mit aktiver DB-Verschlüsselung sind alle Daten durch zwei unabhängige Schutzschichten geschützt: Origin-Isolation des Browsers + AES-GCM.

---

## 🧪 Tests

```bash
npm run test          # Vitest Unit-Tests (Simulation, Batteriemodell, DB-Mock)
npx playwright test   # E2E Smoke-Tests (Chromium)
```

IndexedDB wird in Unit-Tests per **`fake-indexeddb`** gemockt — keine echte DB nötig.

---

## ✅ Production Checklist

- [x] PWA Manifest + Service Worker (injectManifest Modus)
- [x] Offline-first Precaching (30+ Einträge)
- [x] i18n — Deutsch & Englisch, LanguageDetector
- [x] Dark Mode (system-aware + IndexedDB-persistiert)
- [x] **Home Assistant WebSocket** Client (auth + state_changed)
- [x] **MQTT.js Browser-Client** (WebSocket, reconnect, retained topics)
- [x] **ESP32 v2 Firmware** (HTTP-Polling, SML-Parser, CORS)
- [x] **ESP32 v3 Firmware** (MQTT-Push, PubSubClient, HTTP-Fallback)
- [x] Batteriespeicher Simulation & SOC Anzeige
- [x] Web Push Notifications via Service Worker (lokal, kein Backend)
- [x] Alert-Konfiguration pro Typ mit Cooldown-Management
- [x] **Live Strompreise (aWATTar EPEX Spot)** — gecacht, offline-fähig
- [x] **Dynamische Ersparnis-Berechnung** mit Live-Handelspreis
- [x] **Einspeisung-Banner** situativ nach Preisniveau
- [x] **24-h Preis-Chart** im Dashboard
- [x] Gemini KI Analyse & 7-Tage-Prognose (BYOK, 30 min Cache)
- [x] **IndexedDB via Dexie.js** — vollständige Migration von localStorage
- [x] **End-to-End DB-Verschlüsselung** — alle Stores AES-GCM 256-bit (Web Crypto, PIN-basiert)
- [x] **PBKDF2 Key-Derivation** (100 000 Iterationen, SHA-256) — brute-force-resistent
- [x] **PIN-Modal beim App-Start** — Unlock, PIN vergessen → sicheres Löschen
- [x] **AES-GCM Verschlüsselung** für Gemini API Key (zusätzliche Schutzschicht)
- [x] **Cloud-Sync via Supabase** (optional) — Offline-First, Ende-zu-Ende-verschlüsselt
- [x] **Magic Link Auth** — passwordloser Login, kein Backend-Code nötig
- [x] **Sync-Queue** — Änderungen werden gepuffert, bei Reconnect automatisch geleert
- [x] **Multi-Gerät-Sync** — Last-Write-Wins, Realtime über postgres_changes
- [x] **RLS (Row-Level-Security)** — Supabase isoliert User-Daten serverseitig
- [x] **Automatische localStorage → IndexedDB Migration** beim ersten Start
- [x] **Offline-Detektor** (navigator.onLine + Events) mit Demo-Modus-Fallback
- [x] **Background Sync** (Workbox) vorbereitet
- [x] ESP32 Live-Modus mit Fallback auf Simulation
- [x] Code-Splitting — 10+ lazy-geladene Chunks
- [x] **Help-Tab** — Anleitung · Stückliste · Integrationsguide
- [x] Vitest Unit-Tests
- [x] Playwright E2E Smoke-Tests
- [x] Lighthouse CI Workflow
- [x] `robots.txt` + Canonical URL + Preconnect Hints
- [x] GitHub Actions Deploy → GitHub Pages

---

## 🛠 Tech Stack

| Ebene | Bibliothek |
|---|---|
| Framework | React 19 + TypeScript 5.8 |
| Build | Vite 6 + vite-plugin-pwa 0.21 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3.8 |
| Animation | Framer Motion (motion/react) |
| i18n | react-i18next + i18next-browser-languagedetector |
| MQTT | mqtt 5.15 (MQTT.js, WebSocket-Transport) |
| KI | @google/generative-ai (Gemini 2.0 Flash) |
| Wetter | Open-Meteo (kostenlos, kein API-Key) |
| Strompreise | aWATTar Germany EPEX Spot API (kostenlos, kein Key) |
| Datenbank | Dexie.js 4 (IndexedDB) |
| Verschlüsselung | Web Crypto API — AES-GCM 256-bit + PBKDF2 (DB-weit) |
| Cloud-Sync | @supabase/supabase-js v2 (optional) |
| Toasts | sonner v2 |
| QR Codes | qrcode.react v4 |
| SW | workbox-precaching + workbox-routing + workbox-strategies |
| Tests | Vitest + Playwright |

---

## 📄 Lizenz

MIT © 2025–2026 qnbs

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
