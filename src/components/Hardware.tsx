import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu, Wifi, Copy, Check, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Radio, ExternalLink, Plug,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  setLiveMode as saveLiveMode,
  getEsp32Url, setEsp32Url as saveEsp32Url,
  fetchEsp32Data, DEFAULT_ESP32_URL, type ESP32Payload,
} from '../lib/esp32';

export interface HardwareProps {
  liveMode: boolean;
  onLiveModeChange: (v: boolean) => void;
}

/* ── Arduino sketch – full production-ready 2026 version ─────────────── */
const ARDUINO_CODE = `/*
 * BKW-Monitor ESP32 v2.0 (2026)
 * Smart Meter IR-Lesekopf → HTTP-JSON-Server (kein Cloud-Backend nötig)
 *
 * Bibliotheken (Arduino Library Manager):
 *   ESP32 Arduino Core  >= 3.0.0
 *   ESPAsyncWebServer   >= 3.0.0  (dvarrel/ESPAsyncWebServer)
 *   ArduinoJson         >= 7.0.0
 *
 * Verkabelung:
 *   TCRT5000 / D-Lesekopf TX  →  GPIO16  (UART2 RX)
 *   VCC 3,3 V                 →  3V3
 *   GND                       →  GND
 *
 * Endpoint: GET http://<ESP32-IP>/energy
 * Der BKW-Monitor-App pollt diesen Endpunkt alle 5 Sekunden.
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// ── Konfiguration ─────────────────────────────────────────────────────
const char* SSID     = "DEIN_WLAN_NAME";
const char* PASSWORD = "DEIN_PASSWORT";
const uint8_t IR_RX  = 16;   // GPIO16 = UART2 RX
// ─────────────────────────────────────────────────────────────────────

AsyncWebServer server(80);
HardwareSerial irSerial(2);   // UART2

struct {
  float    solar_w      = 0;
  float    consumption_w = 0;
  float    grid_w       = 0;
  uint32_t updated_ms   = 0;
} meas;

// ── Minimal SML-Parser  (OBIS 16.7.0 – Wirkleistung Gesamt) ──────────
static const uint8_t OBIS_POWER[] = { 0x07,0x01,0x00,0x10,0x07,0x00 };
uint8_t  smlBuf[512];
uint16_t smlLen = 0;

void parseSML(const uint8_t* buf, uint16_t len) {
  for (uint16_t i = 0; i + 12 < len; i++) {
    if (memcmp(&buf[i], OBIS_POWER, 6) != 0) continue;
    int8_t  scaler = (int8_t)buf[i + 7];
    int32_t raw    = ((int32_t)buf[i+8]  << 24)
                   | ((int32_t)buf[i+9]  << 16)
                   | ((int32_t)buf[i+10] <<  8)
                   |  (int32_t)buf[i+11];
    float w = (float)raw * powf(10.0f, scaler);
    // negative = Einspeisung (solar > consumption), positive = Bezug
    meas.solar_w       = (w < 0) ? -w : 0.0f;
    meas.consumption_w = (w >= 0) ? w : 0.0f;
    meas.grid_w        = meas.consumption_w - meas.solar_w;
    meas.updated_ms    = millis();
  }
}

void readIR() {
  while (irSerial.available()) {
    uint8_t b = irSerial.read();
    if (smlLen < sizeof(smlBuf)) smlBuf[smlLen++] = b;
    // SML-Ende-Escape: 1B 1B 1B 1B 1A xx xx
    if (smlLen >= 7 &&
        smlBuf[smlLen-7] == 0x1B && smlBuf[smlLen-6] == 0x1B &&
        smlBuf[smlLen-5] == 0x1B && smlBuf[smlLen-4] == 0x1B &&
        smlBuf[smlLen-3] == 0x1A) {
      parseSML(smlBuf, smlLen);
      smlLen = 0;
    }
  }
}

void setup() {
  Serial.begin(115200);
  irSerial.begin(9600, SERIAL_8N1, IR_RX, -1);

  WiFi.mode(WIFI_STA);
  WiFi.begin(SSID, PASSWORD);
  Serial.print("Verbinde mit WLAN");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\\nIP: %s\\n", WiFi.localIP().toString().c_str());

  // GET /energy  –  polled by BKW-Monitor app every 5 s
  server.on("/energy", HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["solar_w"]       = meas.solar_w;
    doc["consumption_w"] = meas.consumption_w;
    doc["grid_w"]        = meas.grid_w;
    doc["uptime_s"]      = millis() / 1000UL;
    doc["ip"]            = WiFi.localIP().toString();
    doc["age_ms"]        = millis() - meas.updated_ms;

    String json;
    serializeJson(doc, json);
    AsyncWebServerResponse* r =
      req->beginResponse(200, "application/json", json);
    r->addHeader("Access-Control-Allow-Origin",  "*");
    r->addHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    r->addHeader("Cache-Control",                "no-cache");
    req->send(r);
  });

  // OPTIONS preflight für CORS (Browser preflight request)
  server.on("/energy", HTTP_OPTIONS, [](AsyncWebServerRequest* req) {
    AsyncWebServerResponse* r = req->beginResponse(204);
    r->addHeader("Access-Control-Allow-Origin",  "*");
    r->addHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    req->send(r);
  });

  server.begin();
  Serial.printf("HTTP-Server: http://%s/energy\\n",
                WiFi.localIP().toString().c_str());
}

void loop() {
  readIR();
  delay(1);
}`;

export default function Hardware({ liveMode, onLiveModeChange }: HardwareProps) {
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [urlInput, setUrlInput] = useState(() => getEsp32Url());
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testData, setTestData] = useState<ESP32Payload | null>(null);
  const [testError, setTestError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [mockData, setMockData] = useState({ solar: 423, cons: 310 });

  // Mock WS ticker – only running in simulation mode
  useEffect(() => {
    if (liveMode) return;
    const id = setInterval(() => {
      setMockData({
        solar: Math.max(0, Math.round(420 + (Math.random() * 80 - 40))),
        cons:  Math.max(80, Math.round(310 + (Math.random() * 60 - 30))),
      });
    }, 2000);
    return () => clearInterval(id);
  }, [liveMode]);

  const handleToggle = (v: boolean) => {
    saveLiveMode(v);
    onLiveModeChange(v);
  };

  const handleSaveUrl = () => saveEsp32Url(urlInput);

  const handleTest = async () => {
    setTestStatus('loading');
    setTestError('');
    setTestData(null);
    try {
      const data = await fetchEsp32Data(urlInput);
      setTestData(data);
      setTestStatus('ok');
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
      setTestStatus('error');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ARDUINO_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard blocked */ }
  };

  const wifiQrValue = ssid.trim() ? `WIFI:T:WPA;S:${ssid};P:${wifiPass};;` : '';
  const appUrl = 'https://qnbs.github.io/Balkonkraftwerk-Energiemonitor/';
  const now = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const inputClass =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto pb-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Cpu size={20} className="text-emerald-500" />
          Hardware-Integration
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          ESP32 + IR-Lesekopf → Echtzeit-Energiedaten ohne Cloud-Backend
        </p>
      </div>

      {/* Live-Modus Toggle */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Datenmodus
          </h3>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleToggle(!liveMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              liveMode
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {liveMode ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {liveMode ? 'Live (ESP32)' : 'Simulation'}
          </motion.button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
              !liveMode
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                : 'border-slate-200 dark:border-slate-700 opacity-60'
            }`}
            onClick={() => handleToggle(false)}
          >
            <Radio size={16} className="text-emerald-500 mb-2" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Simulation</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Realistische Zufallsdaten, kein ESP32 nötig
            </p>
          </div>
          <div
            className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
              liveMode
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-slate-200 dark:border-slate-700 opacity-60'
            }`}
            onClick={() => handleToggle(true)}
          >
            <Plug size={16} className="text-blue-500 mb-2" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Live (ESP32)</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Echte Messdaten via HTTP-Polling alle 5 s
            </p>
          </div>
        </div>
      </div>

      {/* Mock WS Stream – visible in simulation mode */}
      <AnimatePresence>
        {!liveMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-slate-900 dark:bg-slate-800 rounded-2xl p-4 overflow-hidden shadow-inner"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <p className="text-xs font-mono font-bold text-emerald-400 tracking-wider">
                MOCK WS &bull; CONNECTED
              </p>
              <span className="ml-auto text-[10px] font-mono text-slate-400">{now}</span>
            </div>
            <pre className="text-xs font-mono text-slate-300 leading-relaxed select-text">{`{
  "solar_w":       ${String(mockData.solar).padStart(3)},
  "consumption_w": ${String(mockData.cons).padStart(3)},
  "grid_w":        ${String(mockData.solar - mockData.cons).padStart(4)},
  "source":        "simulation"
}`}</pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ESP32 Verbindung */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Plug size={14} />
          Mit echtem ESP32 verbinden
        </h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder={DEFAULT_ESP32_URL}
              className={`flex-1 font-mono text-xs ${inputClass}`}
            />
            <button
              onClick={handleSaveUrl}
              className="px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors"
            >
              OK
            </button>
          </div>
          <button
            onClick={handleTest}
            disabled={testStatus === 'loading'}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {testStatus === 'loading' ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verbinde…</>
            ) : (
              <><ExternalLink size={15} /> Verbindung testen</>
            )}
          </button>
          <AnimatePresence>
            {testStatus === 'ok' && testData && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3"
              >
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">ESP32 erreichbar</span>
                  {testData.ip && (
                    <span className="ml-auto text-[10px] font-mono text-slate-400">{testData.ip}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Solar', value: Math.round(testData.solar_w), unit: 'W' },
                    { label: 'Verbrauch', value: Math.round(testData.consumption_w), unit: 'W' },
                    { label: 'Uptime', value: testData.uptime_s != null ? testData.uptime_s : '–', unit: 's' },
                  ].map(({ label, value, unit }) => (
                    <div key={label} className="bg-white dark:bg-slate-900 rounded-lg p-2">
                      <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {value} <span className="text-[9px] text-slate-400 font-normal">{unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            {testStatus === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex items-start gap-2"
              >
                <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-rose-700 dark:text-rose-300">Verbindungsfehler</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{testError}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
                    Tipp: ESP32 und Browser im gleichen WLAN? HTTPS-Seiten können kein HTTP pollen (Mixed-Content). Lösung: App lokal starten oder ESP32 mit HTTPS.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expected response format */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 mt-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Erwartetes JSON (GET /energy)
            </p>
            <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre">{`{
  "solar_w":       423.5,
  "consumption_w": 310.0,
  "grid_w":       -113.5,
  "uptime_s":      3600,
  "ip":            "192.168.1.100",
  "age_ms":        250
}`}</pre>
          </div>
        </div>
      </div>

      {/* WiFi Setup QR Code */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Wifi size={14} />
          WLAN-Setup QR-Code
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1.5">WLAN-Name (SSID)</label>
              <input
                type="text"
                value={ssid}
                onChange={e => setSsid(e.target.value)}
                placeholder="Mein Heimnetz"
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1.5">Passwort</label>
              <input
                type="password"
                value={wifiPass}
                onChange={e => setWifiPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className={inputClass}
              />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              QR-Code von Android / iOS scannen, um bequem ins gleiche WLAN wie der ESP32 zu wechseln.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            {wifiQrValue ? (
              <>
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                  <QRCodeSVG value={wifiQrValue} size={144} level="M" />
                </div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  ✓ Bereit zum Scannen
                </p>
              </>
            ) : (
              <div className="w-36 h-36 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <Wifi size={30} className="mx-auto mb-2 opacity-40" />
                  <p className="text-[10px]">SSID eingeben</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Arduino Code Snippet */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <button
          onClick={() => setShowCode(v => !v)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center shrink-0">
              <Cpu size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Arduino-Sketch (ESP32, 2026)
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                UART2 SML-Parser · ESPAsyncWebServer · ArduinoJson 7
              </p>
            </div>
          </div>
          {showCode
            ? <ChevronUp size={18} className="text-slate-400 shrink-0" />
            : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
        </button>
        <AnimatePresence>
          {showCode && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden border-t border-slate-100 dark:border-slate-800"
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-[10px] font-mono text-slate-400">esp32_bkw_monitor.ino</span>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                    copied
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
              <div className="px-4 pb-5 overflow-x-auto">
                <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre">
                  {ARDUINO_CODE}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* App QR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4">
        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
          <QRCodeSVG value={appUrl} size={80} level="M" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">App teilen</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            BKW-Monitor auf einem anderen Gerät öffnen – PWA installierbar.
          </p>
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-1.5 truncate"
          >
            <ExternalLink size={10} className="shrink-0" />
            {appUrl.replace('https://', '')}
          </a>
        </div>
      </div>
    </div>
  );
}
