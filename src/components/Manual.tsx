import { CheckCircle2, ChevronRight, Info, AlertTriangle, ShieldAlert, Code2, Wifi, Cpu, Monitor, Wrench, Plug, Radio } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

const ARDUINO_CODE = `#include <SoftwareSerial.h>
// ESP32: RX=GPIO16, TX=GPIO17
SoftwareSerial irSerial(16, 17);

void setup() {
  Serial.begin(115200);
  irSerial.begin(9600);
  Serial.println("IR-Lesekopf bereit...");
}

void loop() {
  if (irSerial.available()) {
    String sml = "";
    while (irSerial.available()) {
      char c = irSerial.read();
      sml += c;
    }
    // SML-Datenpakete parsen
    float watt = parseSML(sml);
    Serial.printf("Aktuell: %.1f W\\n", watt);
  }
  delay(1000);
}

float parseSML(String &data) {
  // Vereinfachtes SML-Parsing
  // OBIS 1-0:16.7.0 = aktuelle Leistung
  int idx = data.indexOf("\\x01\\x00\\x10\\x07\\x00");
  if (idx > 0) {
    // 4-Byte signed integer nach dem OBIS-Code
    long val = (data[idx+8] << 24) |
               (data[idx+9] << 16) |
               (data[idx+10] << 8) |
                data[idx+11];
    return val / 10.0;
  }
  return 0.0;
}`;

const steps = [
  {
    title: '1. Bauteile prüfen & Werkzeug bereitlegen',
    description: 'Alle Komponenten aus der Stückliste auf Vollständigkeit prüfen.',
    icon: <Info className="text-blue-500" size={20} />,
    details: 'Lege ESP32, IR-Lesekopf, USB-Kabel, Gehäuse, Lötzubehör und Schrauben bereit. Lötkolben auf 320°C vorheizen. ESD-Schutz: erden durch Berühren eines Heizkörpers.',
  },
  {
    title: '2. ESP32 mit Firmware flashen',
    description: 'Tasmota oder ESPHome auf den ESP32 per USB flashen.',
    icon: <Cpu className="text-purple-500" size={20} />,
    details: 'ESP32 per USB-C an PC anschließen. Chrome/Edge öffnen → tasmota.github.io/install → "Tasmota32 (english)" wählen → Connect → COM-Port auswählen → Install. Alternativ: ESPHome über Home Assistant flashen.',
  },
  {
    title: '3. Hichi IR-Lesekopf anlöten',
    description: 'TTL IR-Lesekopf mit dem ESP32 verbinden.',
    icon: <Radio className="text-amber-500" size={20} />,
    details: 'Pinbelegung:\n• VCC (Hichi) → 3.3V (ESP32)\n• GND (Hichi) → GND (ESP32)\n• TX (Hichi) → RX / GPIO16 (ESP32)\n• RX (Hichi) → TX / GPIO17 (ESP32)\n\nSaubere, glänzende Lötstellen – keine Kurzschlüsse!',
  },
  {
    title: '4. Optional: Display anschließen',
    description: 'SPI-Display (ST7735 / ILI9341) für lokale Anzeige.',
    icon: <Monitor className="text-cyan-500" size={20} />,
    details: 'Pinbelegung SPI:\n• VCC → 3.3V\n• GND → GND\n• CS → GPIO15\n• RESET → GPIO4\n• DC → GPIO2\n• SDI/MOSI → GPIO23\n• SCK → GPIO18\n\nIn Tasmota: Display-Treiber konfigurieren.',
  },
  {
    title: '5. Gehäusemontage',
    description: 'Elektronik ins Gehäuse einbauen & fixieren.',
    icon: <Wrench className="text-slate-500" size={20} />,
    details: 'Platine mit M2.5 Schrauben befestigen. USB-Port nach außen zugänglich lassen. Kabel nicht einklemmen. Bei 3D-Druck: PETG für Wärmebeständigkeit empfohlen.',
  },
  {
    title: '6. IR-Lesekopf am Zähler anbringen',
    description: 'Magnetischen Lesekopf auf die optische Schnittstelle setzen.',
    icon: <AlertTriangle className="text-amber-500" size={20} />,
    details: 'Der Lesekopf haftet magnetisch. Exakt auf die zwei runden Dioden des Zählers platzieren (optische Schnittstelle). Kabel nach unten führen. Sende-/Empfangsdioden müssen genau ausgerichtet sein.',
  },
  {
    title: '7. WLAN konfigurieren',
    description: 'ESP32 mit dem Heimnetzwerk verbinden.',
    icon: <Wifi className="text-blue-500" size={20} />,
    details: 'Mit Smartphone nach WLAN "tasmota-xxxx" suchen → verbinden → Router-WLAN-Zugangsdaten eingeben → ESP32 startet neu und erhält IP vom Router. IP im Router nachschauen oder mDNS (tasmota.local) nutzen.',
  },
  {
    title: '8. SML-Skript einrichten',
    description: 'Zählertyp-spezifisches Skript in Tasmota einfügen.',
    icon: <Code2 className="text-emerald-500" size={20} />,
    details: 'Weboberfläche des ESP32 öffnen → Consoles → Console. SML-Skript für deinen Zählertyp einfügen (z.B. Holley DTZ541, Logarex LK13BE). Skripte gibt es auf: github.com/tasmota/tasmota → SML-Scripting Wiki.',
  },
  {
    title: '9. Arduino/ESP32-Code hochladen',
    description: 'Alternativ: Eigenes Programm mit Arduino IDE.',
    icon: <Code2 className="text-violet-500" size={20} />,
    isCode: true,
    details: 'Falls du kein Tasmota nutzt, kannst du den ESP32 mit der Arduino IDE programmieren. Installiere das ESP32-Board in der Arduino IDE (Boardverwalter → esp32 by Espressif). Code-Beispiel siehe unten:',
  },
  {
    title: '10. Test & Monitoring starten',
    description: 'Prüfe die Datenübertragung und starte das Dashboard.',
    icon: <CheckCircle2 className="text-emerald-500" size={20} />,
    details: 'LED am IR-Lesekopf blinkt bei Datenempfang. In Tasmota unter "Main Menu" sollten OBIS-Werte erscheinen (1-0:1.8.0 = Bezug, 1-0:2.8.0 = Einspeisung, 1-0:16.7.0 = aktuelle Leistung). Daten per MQTT an Home Assistant oder dieses Dashboard weiterleiten.',
  },
];

export default function Manual() {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
        <h2 className="text-2xl font-bold mb-2">Montagehandbuch</h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
          10-Schritte-Anleitung zum Bau deines eigenen ESP32-basierten Energiemonitors mit IR-Lesekopf
          für digitale Stromzähler (SML-Protokoll).
        </p>
      </div>

      {/* Safety Warning */}
      <div className="bg-rose-50 dark:bg-rose-950 rounded-2xl p-5 border-l-4 border-rose-500 mb-6">
        <h3 className="text-rose-800 dark:text-rose-200 font-bold text-sm mb-2 flex items-center gap-2">
          <ShieldAlert size={20} />
          Sicherheitshinweise
        </h3>
        <ul className="space-y-1 text-rose-700 dark:text-rose-300 text-xs leading-relaxed list-disc list-inside">
          <li><strong>Lebensgefahr:</strong> Arbeiten am 230V-Netz nur durch Elektrofachkräfte!</li>
          <li>Der optische Lesekopf wird nur <strong>außen</strong> am geschlossenen Zähler angebracht – unbedenklich.</li>
          <li>Nur CE-zertifizierte USB-Netzteile verwenden.</li>
          <li>Elektronik vor Feuchtigkeit schützen.</li>
        </ul>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <button
              onClick={() => setExpandedStep(expandedStep === index ? null : index)}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              aria-expanded={expandedStep === index}
            >
              <div className="flex-shrink-0">{step.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{step.description}</p>
              </div>
              <ChevronRight
                size={16}
                className={`text-slate-400 transition-transform ${expandedStep === index ? 'rotate-90' : ''}`}
              />
            </button>

            {expandedStep === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800"
              >
                <div className="pt-3 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                  {step.details}
                </div>
                {'isCode' in step && step.isCode && (
                  <div className="mt-4">
                    <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 overflow-x-auto">
                      <div className="flex items-center gap-2 mb-3 text-xs text-slate-400">
                        <Plug size={14} />
                        <span>Arduino / ESP32 – IR-Lesekopf Beispielcode</span>
                      </div>
                      <pre className="text-xs text-emerald-400 font-mono leading-relaxed">
                        <code>{ARDUINO_CODE}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
