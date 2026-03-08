import { useState } from 'react';
import {
  CheckCircle2, ChevronRight, Info, AlertTriangle, ShieldAlert, Code2, Wifi,
  Cpu, Monitor, Wrench, Plug, Radio, CheckSquare, Square, ExternalLink, Calculator,
  Zap, Box, BookOpen, Package,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ---------------------------------------------------------------------------
// Installation guide data
// ---------------------------------------------------------------------------

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
    float watt = parseSML(sml);
    Serial.printf("Aktuell: %.1f W\\n", watt);
  }
  delay(1000);
}

float parseSML(String &data) {
  // OBIS 1-0:16.7.0 = aktuelle Leistung
  int idx = data.indexOf("\\x01\\x00\\x10\\x07\\x00");
  if (idx > 0) {
    long val = (data[idx+8] << 24) | (data[idx+9] << 16)
             | (data[idx+10] << 8) |  data[idx+11];
    return val / 10.0;
  }
  return 0.0;
}`;

interface Step {
  title: string;
  description: string;
  iconName: string;
  details: string;
  isCode?: boolean;
}

const steps: Step[] = [
  {
    title: '1. Bauteile prüfen & Werkzeug bereitlegen',
    description: 'Alle Komponenten aus der Stückliste auf Vollständigkeit prüfen.',
    iconName: 'info',
    details: 'Lege ESP32, IR-Lesekopf, USB-Kabel, Gehäuse, Lötzubehör und Schrauben bereit.\nLötkolben auf 320 °C vorheizen. ESD-Schutz: erden durch Berühren eines Heizkörpers.',
  },
  {
    title: '2. ESP32 mit Firmware flashen',
    description: 'Tasmota oder ESPHome auf den ESP32 per USB flashen.',
    iconName: 'cpu',
    details: 'ESP32 per USB-C an PC anschließen. Chrome/Edge öffnen → tasmota.github.io/install → "Tasmota32 (english)" wählen → Connect → COM-Port auswählen → Install.\nAlternativ: ESPHome über Home Assistant flashen.',
  },
  {
    title: '3. Hichi IR-Lesekopf anlöten',
    description: 'TTL IR-Lesekopf mit dem ESP32 verbinden.',
    iconName: 'radio',
    details: 'Pinbelegung:\n• VCC (Hichi) → 3.3V (ESP32)\n• GND (Hichi) → GND (ESP32)\n• TX (Hichi) → RX / GPIO16 (ESP32)\n• RX (Hichi) → TX / GPIO17 (ESP32)\n\nSaubere, glänzende Lötstellen – keine Kurzschlüsse!',
  },
  {
    title: '4. Optional: Display anschließen',
    description: 'SPI-Display (ST7735 / ILI9341) für lokale Anzeige.',
    iconName: 'monitor',
    details: 'Pinbelegung SPI:\n• VCC → 3.3V\n• GND → GND\n• CS → GPIO15\n• RESET → GPIO4\n• DC → GPIO2\n• SDI/MOSI → GPIO23\n• SCK → GPIO18\n\nIn Tasmota: Display-Treiber konfigurieren.',
  },
  {
    title: '5. Gehäusemontage',
    description: 'Elektronik ins Gehäuse einbauen & fixieren.',
    iconName: 'wrench',
    details: 'Platine mit M2.5 Schrauben befestigen. USB-Port nach außen zugänglich lassen.\nKabel nicht einklemmen. Bei 3D-Druck: PETG für Wärmebeständigkeit empfohlen.',
  },
  {
    title: '6. IR-Lesekopf am Zähler anbringen',
    description: 'Magnetischen Lesekopf auf die optische Schnittstelle setzen.',
    iconName: 'warning',
    details: 'Der Lesekopf haftet magnetisch. Exakt auf die zwei runden Dioden des Zählers platzieren (optische Schnittstelle). Kabel nach unten führen. Sende-/Empfangsdioden müssen genau ausgerichtet sein.',
  },
  {
    title: '7. WLAN konfigurieren',
    description: 'ESP32 mit dem Heimnetzwerk verbinden.',
    iconName: 'wifi',
    details: 'Mit Smartphone nach WLAN "tasmota-xxxx" suchen → verbinden → Router-WLAN-Zugangsdaten eingeben → ESP32 startet neu und erhält IP vom Router. IP im Router nachschauen oder mDNS (tasmota.local) nutzen.',
  },
  {
    title: '8. SML-Skript einrichten',
    description: 'Zählertyp-spezifisches Skript in Tasmota einfügen.',
    iconName: 'code',
    details: 'Weboberfläche des ESP32 öffnen → Consoles → Console. SML-Skript für deinen Zählertyp einfügen (z.B. Holley DTZ541, Logarex LK13BE).\nSkripte: github.com/tasmota/tasmota → SML-Scripting Wiki.',
  },
  {
    title: '9. Arduino/ESP32-Code hochladen',
    description: 'Alternativ: Eigenes Programm mit Arduino IDE.',
    iconName: 'code',
    isCode: true,
    details: 'Falls du kein Tasmota nutzt, kannst du den ESP32 mit der Arduino IDE programmieren. Installiere das ESP32-Board (Boardverwalter → esp32 by Espressif). Code-Beispiel:',
  },
  {
    title: '10. Test & Monitoring starten',
    description: 'Prüfe die Datenübertragung und starte das Dashboard.',
    iconName: 'check',
    details: 'LED am IR-Lesekopf blinkt bei Datenempfang. In Tasmota unter "Main Menu" sollten OBIS-Werte erscheinen:\n• 1-0:1.8.0 = Netzbezug\n• 1-0:2.8.0 = Einspeisung\n• 1-0:16.7.0 = aktuelle Leistung\n\nDaten per MQTT an Home Assistant oder dieses Dashboard weiterleiten.',
  },
];

function StepIcon({ name }: { name: string }) {
  switch (name) {
    case 'info':    return <Info className="text-blue-500" size={20} />;
    case 'cpu':     return <Cpu className="text-purple-500" size={20} />;
    case 'radio':   return <Radio className="text-amber-500" size={20} />;
    case 'monitor': return <Monitor className="text-cyan-500" size={20} />;
    case 'wrench':  return <Wrench className="text-slate-500" size={20} />;
    case 'warning': return <AlertTriangle className="text-amber-500" size={20} />;
    case 'wifi':    return <Wifi className="text-blue-500" size={20} />;
    case 'code':    return <Code2 className="text-violet-500" size={20} />;
    case 'check':   return <CheckCircle2 className="text-emerald-500" size={20} />;
    default:        return <Info className="text-slate-400" size={20} />;
  }
}

// ---------------------------------------------------------------------------
// Materials / parts list data
// ---------------------------------------------------------------------------

interface Material {
  id: number;
  name: string;
  category: string;
  price: number;
  link?: string;
  checked: boolean;
}

const INITIAL_MATERIALS: Material[] = [
  { id: 1,  name: 'Hichi TTL IR-Lesekopf (USB/TTL)', category: 'Elektronik', price: 29.90, link: 'https://www.amazon.de/s?k=Hichi+IR+Lesekopf+TTL', checked: false },
  { id: 2,  name: 'ESP32-WROOM-32 DevKit',            category: 'Elektronik', price:  8.49, link: 'https://www.amazon.de/s?k=ESP32+WROOM+DevKit', checked: false },
  { id: 3,  name: 'USB-C Kabel (1 m)',                 category: 'Elektronik', price:  5.99, link: 'https://www.amazon.de/s?k=USB-C+Kabel+1m', checked: false },
  { id: 4,  name: 'USB-Netzteil 5V/2A (CE)',           category: 'Elektronik', price:  7.99, link: 'https://www.amazon.de/s?k=USB+Netzteil+5V+2A+CE', checked: false },
  { id: 5,  name: 'Dupont-Kabel Set (40 Stk.)',        category: 'Elektronik', price:  4.99, link: 'https://www.amazon.de/s?k=Dupont+Kabel+Set', checked: false },
  { id: 6,  name: 'SPI-Display 1.8" ST7735 (optional)',category: 'Elektronik', price:  6.49, link: 'https://www.amazon.de/s?k=ST7735+SPI+Display', checked: false },
  { id: 7,  name: 'Lochrasterplatine 5 × 7 cm',        category: 'Kleinteile', price:  1.99, link: 'https://www.amazon.de/s?k=Lochrasterplatine+5x7', checked: false },
  { id: 8,  name: 'Widerstände-Set (assorted)',        category: 'Kleinteile', price:  3.99, link: 'https://www.amazon.de/s?k=Widerst%C3%A4nde+Set+assorted', checked: false },
  { id: 9,  name: 'Gehäuse (3D-Druck / Universal)',    category: 'Gehäuse',    price:  8.99, link: 'https://www.amazon.de/s?k=ESP32+Geh%C3%A4use+universal', checked: false },
  { id: 10, name: 'M2.5 Schrauben-Set',               category: 'Kleinteile', price:  3.49, link: 'https://www.amazon.de/s?k=M2.5+Schrauben+Set', checked: false },
  { id: 11, name: 'Lötzinn bleifrei 100 g',            category: 'Kleinteile', price:  6.99, link: 'https://www.amazon.de/s?k=L%C3%B6tzinn+bleifrei+100g', checked: false },
];

const INITIAL_TOOLS: Material[] = [
  { id: 101, name: 'Lötkolben mit Temperaturregelung', category: 'Werkzeug', price: 24.99, link: 'https://www.amazon.de/s?k=L%C3%B6tkolben+Temperaturregelung', checked: false },
  { id: 102, name: 'Seitenschneider',                  category: 'Werkzeug', price:  7.99, checked: false },
  { id: 103, name: 'Abisolierzange',                   category: 'Werkzeug', price:  8.99, checked: false },
  { id: 104, name: 'Multimeter',                       category: 'Werkzeug', price: 14.99, link: 'https://www.amazon.de/s?k=Multimeter+digital', checked: false },
  { id: 105, name: 'Schraubendreher-Set',              category: 'Werkzeug', price:  9.99, checked: false },
  { id: 106, name: '3. Hand / Löthilfe',               category: 'Werkzeug', price: 11.99, link: 'https://www.amazon.de/s?k=dritte+Hand+L%C3%B6thilfe', checked: false },
];

function getCategoryIcon(category: string) {
  switch (category) {
    case 'Elektronik': return <Cpu size={14} className="text-purple-500" />;
    case 'Kleinteile': return <Zap size={14} className="text-amber-500" />;
    case 'Gehäuse':    return <Box size={14} className="text-blue-500" />;
    case 'Werkzeug':   return <Wrench size={14} className="text-slate-500" />;
    default:           return <Box size={14} className="text-slate-500" />;
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function InstallGuide() {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {/* Safety Warning */}
      <div className="bg-rose-50 dark:bg-rose-950 rounded-2xl p-5 border-l-4 border-rose-500">
        <h3 className="text-rose-800 dark:text-rose-200 font-bold text-sm mb-2 flex items-center gap-2">
          <ShieldAlert size={18} />
          Sicherheitshinweise
        </h3>
        <ul className="space-y-1 text-rose-700 dark:text-rose-300 text-xs leading-relaxed list-disc list-inside">
          <li><strong>Lebensgefahr:</strong> Arbeiten am 230-V-Netz nur durch Elektrofachkräfte!</li>
          <li>Der optische Lesekopf wird nur <strong>außen</strong> am geschlossenen Zähler angebracht – völlig unbedenklich.</li>
          <li>Nur CE-zertifizierte USB-Netzteile verwenden.</li>
          <li>Elektronik vor Feuchtigkeit schützen.</li>
        </ul>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={index}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <button
              onClick={() => setExpandedStep(expandedStep === index ? null : index)}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              aria-expanded={expandedStep === index}
            >
              <div className="flex-shrink-0">
                <StepIcon name={step.iconName} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{step.description}</p>
              </div>
              <ChevronRight
                size={16}
                className={`text-slate-400 transition-transform flex-shrink-0 ${expandedStep === index ? 'rotate-90' : ''}`}
              />
            </button>

            <AnimatePresence initial={false}>
              {expandedStep === index && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="pt-3 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {step.details}
                    </div>
                    {step.isCode && (
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialsList() {
  const [materials, setMaterials] = useState<Material[]>(INITIAL_MATERIALS);
  const [tools, setTools] = useState<Material[]>(INITIAL_TOOLS);

  const toggle = (
    list: Material[],
    setList: React.Dispatch<React.SetStateAction<Material[]>>,
    id: number,
  ) => {
    setList(list.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)));
  };

  const matTotal  = materials.reduce((s, m) => s + m.price, 0);
  const toolTotal = tools.reduce((s, t) => s + t.price, 0);

  const renderList = (
    items: Material[],
    setItems: React.Dispatch<React.SetStateAction<Material[]>>,
    title: string,
    icon: React.ReactNode,
  ) => {
    const checked  = items.filter((i) => i.checked).length;
    const progress = Math.round((checked / items.length) * 100);
    const subtotal = items.reduce((s, m) => s + m.price, 0);

    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2">{icon}{title}</h3>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
            {checked}/{items.length} · {subtotal.toFixed(2)} €
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mb-4 overflow-hidden">
          <motion.div
            className="bg-emerald-500 h-1.5 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-sm ${
                item.checked
                  ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 opacity-70'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
              }`}
              onClick={() => toggle(items, setItems, item.id)}
            >
              <button
                className="flex-shrink-0"
                aria-label={item.checked ? `${item.name} abhaken` : `${item.name} markieren`}
                tabIndex={-1}
              >
                {item.checked
                  ? <CheckSquare className="text-emerald-500" size={20} />
                  : <Square className="text-slate-300" size={20} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${item.checked ? 'line-through opacity-70' : ''}`}>
                    {item.name}
                  </span>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-500 hover:text-blue-600 flex-shrink-0"
                      aria-label={`${item.name} kaufen`}
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    {getCategoryIcon(item.category)}
                    {item.category}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.price.toFixed(2)} €
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div>
      {/* Cost overview header */}
      <div className="bg-emerald-600 dark:bg-emerald-800 text-white rounded-2xl p-5 shadow-md mb-4">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Calculator size={18} />
          Stückliste & Kostenrechner
        </h2>
        <p className="text-emerald-100 text-xs mb-4">Preise Stand 2026 · Alle Preise inkl. MwSt.</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-lg font-bold">{matTotal.toFixed(2)} €</p>
            <p className="text-[10px] text-emerald-200 uppercase">Material</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-lg font-bold">{toolTotal.toFixed(2)} €</p>
            <p className="text-[10px] text-emerald-200 uppercase">Werkzeug</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 ring-2 ring-white/30">
            <p className="text-lg font-bold">{(matTotal + toolTotal).toFixed(2)} €</p>
            <p className="text-[10px] text-emerald-200 uppercase">Gesamt</p>
          </div>
        </div>
      </div>

      {renderList(materials, setMaterials, 'Materialien', <Cpu className="text-emerald-600" size={18} />)}
      {renderList(tools, setTools, 'Werkzeuge', <Wrench className="text-emerald-600" size={18} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Help  –  root export
// ---------------------------------------------------------------------------

type HelpTab = 'guide' | 'materials';

export default function Help() {
  const [tab, setTab] = useState<HelpTab>('guide');

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-4">
        <h2 className="text-xl font-bold mb-1">Hilfe & Montage</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          10-Schritte-Aufbauanleitung · Stückliste · Kostenrechner
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 gap-1">
        <button
          onClick={() => setTab('guide')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
            tab === 'guide'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <BookOpen size={15} />
          Aufbauanleitung
        </button>
        <button
          onClick={() => setTab('materials')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
            tab === 'materials'
              ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Package size={15} />
          Stückliste
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'guide'     ? <InstallGuide /> : <MaterialsList />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
