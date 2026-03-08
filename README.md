# ⚡ Balkonkraftwerk Energiemonitor

> Installierbare PWA zum Monitoring deines Balkonkraftwerks – mit Live-Simulation, KI-Analyse (Gemini) und Bauanleitung.

**🔗 [Live-Demo](https://qnbs.github.io/Balkonkraftwerk-Energiemonitor/)**

---

## Features

- **📊 Live-Dashboard** – Echtzeit-Simulation mit realistischen Balkonkraftwerk-Werten (0–850W)
- **📈 Recharts-Diagramme** – Area-Charts mit Gradienten, 3 Zeiträume (Tag/Woche/Monat)
- **🤖 KI-Analyse (Gemini)** – BYOK: Bring Your Own Key, lokale Speicherung im Browser
- **💰 Ersparnis & CO₂** – Automatische Berechnung bei 0,30 €/kWh + CO₂-Einsparung
- **🔧 Montagehandbuch** – 10 Schritte mit ESP32 + IR-Lesekopf + Arduino-Code
- **🛒 Materialliste** – Preise 2026, Amazon-Links, Kostenrechner
- **🌙 Dark Mode** – Automatisch oder manuell, mit Framer Motion Animationen
- **📱 PWA** – Installierbar, offline-fähig, responsive Mobile-First
- **🔔 Benachrichtigungen** – Schwellenwert-basierte Warnungen
- **⚙️ Einstellungen** – API-Key, Dark Mode, Schwellenwerte (persistent in localStorage)

## Tech Stack

| Technologie | Version |
|-------------|---------|
| React | 19 |
| Vite | 6 |
| TypeScript | 5.8 |
| Tailwind CSS | 4 |
| Recharts | 3 |
| Framer Motion | 12 |
| Lucide Icons | — |
| Google Gemini | 2.0 Flash |
| vite-plugin-pwa | 0.21 |

## Schnellstart

```bash
git clone https://github.com/qnbs/Balkonkraftwerk-Energiemonitor.git
cd Balkonkraftwerk-Energiemonitor
npm install
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000)

## KI-Analyse (BYOK)

1. Erstelle einen kostenlosen API-Key: [Google AI Studio](https://aistudio.google.com/apikey)
2. Öffne die App → **Setup** → Gemini API Key eingeben
3. Der Key wird **nur lokal** in deinem Browser gespeichert (localStorage)
4. Im Dashboard auf **"KI-Analyse starten"** klicken

> ⚠️ **Sicherheitshinweis:** API-Keys im Browser sind grundsätzlich sichtbar. Nutze die API-Key-Einschränkungen in der Google Cloud Console (HTTP Referrer).

## Deployment (GitHub Pages)

Automatisch über GitHub Actions bei Push auf `main`:
1. Repository Settings → Pages → Source: **GitHub Actions**
2. Push auf `main` → Workflow deployt automatisch
3. Live: `https://qnbs.github.io/Balkonkraftwerk-Energiemonitor/`

## Projektstruktur

```
src/
├── App.tsx                 # Root: Navigation, Theme, Notifications
├── components/
│   ├── Dashboard.tsx       # Live-Simulation, Charts, KI-Analyse
│   ├── Manual.tsx          # 10-Schritte Montagehandbuch
│   ├── Materials.tsx       # Stückliste mit Preisen & Links
│   └── Settings.tsx        # BYOK, Dark Mode, Schwellenwerte
└── lib/
    ├── gemini.ts           # Gemini API (BYOK localStorage)
    ├── simulation.ts       # Energiedaten-Simulation
    └── theme.ts            # Dark/Light Mode
```

## Lizenz

MIT © [qnbs](https://github.com/qnbs)
