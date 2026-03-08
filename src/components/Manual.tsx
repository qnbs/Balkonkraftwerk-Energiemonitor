import { CheckCircle2, ChevronRight, Info, AlertTriangle, ShieldAlert, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';

export default function Manual() {
  const steps = [
    {
      title: 'Vorbereitung & Werkzeug',
      description: 'Stelle sicher, dass alle Bauteile vorhanden sind und der Arbeitsplatz gut beleuchtet ist.',
      icon: <Info className="text-blue-500" size={24} />,
      image: 'https://picsum.photos/seed/tools/600/300',
      details: 'Lötkolben auf ca. 320°C vorheizen, Bauteile sortieren. Denke daran, dich vor elektrostatischer Entladung (ESD) zu schützen, indem du dich erdest (z.B. an einem Heizkörper).'
    },
    {
      title: 'ESP32 Flashen',
      description: 'Flashe die Tasmota oder ESPHome Firmware auf den ESP32.',
      icon: <ChevronRight className="text-slate-400" size={24} />,
      image: 'https://picsum.photos/seed/esp32/600/300',
      details: 'Verbinde den ESP32 per Micro-USB/USB-C mit dem PC. Öffne den Web-Flasher für Tasmota (tasmota.github.io/install) im Chrome/Edge Browser. Wähle "Tasmota (english)" oder ein spezielles Smart Meter Build. Klicke auf "Connect" und wähle den COM-Port aus.'
    },
    {
      title: 'Hichi IR-Lesekopf verbinden',
      description: 'Löte die Verbindungen zwischen ESP32 und dem Hichi TTL Lesekopf.',
      icon: <ChevronRight className="text-slate-400" size={24} />,
      image: 'https://picsum.photos/seed/soldering/600/300',
      details: 'Verbinde die Pins wie folgt:\n- VCC (Hichi) an 3.3V (ESP32)\n- GND (Hichi) an GND (ESP32)\n- TX (Hichi) an RX / GPIO3 (ESP32)\n- RX (Hichi) an TX / GPIO1 (ESP32)\nAchte auf saubere, glänzende Lötstellen ohne Kurzschlüsse.'
    },
    {
      title: 'Display anschließen (Optional)',
      description: 'Verbinde das SPI-Display mit dem ESP32 WROOM für lokale Anzeigen.',
      icon: <ChevronRight className="text-slate-400" size={24} />,
      details: 'Verbinde VCC, GND, CS (GPIO15), RESET (GPIO4), DC (GPIO2), SDI/MOSI (GPIO23) und SCK (GPIO18) gemäß Pinout deines ESP32 Boards.'
    },
    {
      title: 'Gehäusemontage',
      description: 'Baue die Elektronik in das 3D-gedruckte Gehäuse ein.',
      icon: <ChevronRight className="text-slate-400" size={24} />,
      image: 'https://picsum.photos/seed/case/600/300',
      details: 'Platine mit M2.5 Schrauben fixieren. Darauf achten, dass keine Kabel eingeklemmt werden. Der USB-Port zur Stromversorgung muss von außen gut zugänglich bleiben.'
    },
    {
      title: 'Installation am Stromzähler',
      description: 'Bringe den IR-Lesekopf am digitalen Stromzähler an.',
      icon: <AlertTriangle className="text-amber-500" size={24} />,
      image: 'https://picsum.photos/seed/meter/600/300',
      details: 'Der Lesekopf ist magnetisch. Platziere ihn exakt auf der optischen Schnittstelle (den zwei kleinen runden Dioden) des Zählers. Das Kabel sollte nach unten zeigen. Achte auf die korrekte Ausrichtung der Sende-/Empfangsdioden.'
    },
    {
      title: 'Konfiguration & WLAN',
      description: 'Richte das WLAN ein und konfiguriere das Zählerskript.',
      icon: <CheckCircle2 className="text-emerald-500" size={24} />,
      details: 'Suche mit dem Smartphone nach dem WLAN "tasmota-xxxx". Verbinde dich und gib deine Heim-WLAN-Daten ein. Nach dem Neustart öffne die IP des ESP32. Unter "Consoles" -> "Console" das SML-Skript für deinen Zählertyp einfügen und speichern.'
    }
  ];

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-10"></div>
        <h2 className="text-3xl font-bold text-slate-800 mb-3 tracking-tight">Montagehandbuch</h2>
        <p className="text-slate-600 text-base leading-relaxed max-w-2xl">
          Schritt-für-Schritt Anleitung zum Bau deines eigenen Energiemonitors für das Balkonkraftwerk. 
          Dieses System erfasst den Stromverbrauch und die Produktion direkt an der optischen Schnittstelle deines digitalen Stromzählers.
        </p>
        
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
            <LinkIcon size={16} />
            Schaltplan herunterladen (PDF)
          </a>
          <a href="#" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
            <LinkIcon size={16} />
            Tasmota SML-Skripte
          </a>
        </div>
      </div>

      {/* Safety Warning */}
      <div className="bg-rose-50 rounded-2xl p-6 border-l-4 border-rose-500 mb-8 shadow-sm">
        <h3 className="text-rose-800 font-bold text-lg mb-3 flex items-center gap-2">
          <ShieldAlert size={24} />
          Wichtige Sicherheitshinweise
        </h3>
        <ul className="space-y-2 text-rose-700 text-sm leading-relaxed list-disc list-inside">
          <li><strong>Lebensgefahr durch Stromschlag:</strong> Arbeiten am 230V-Netz oder im Inneren des Zählerschranks dürfen <strong>ausschließlich von zertifizierten Elektrofachkräften</strong> durchgeführt werden!</li>
          <li>Das Anbringen des optischen Lesekopfs auf der Außenseite des geschlossenen Zählers ist für Laien unbedenklich und erlaubt.</li>
          <li>Verwende zur Stromversorgung des ESP32 nur hochwertige, CE-zertifizierte USB-Netzteile.</li>
          <li>Schütze die Elektronik vor Feuchtigkeit. Der Zählerschrank muss trocken sein.</li>
        </ul>
      </div>

      {/* Steps */}
      <div className="space-y-8 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
        {steps.map((step, index) => (
          <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            {/* Timeline dot */}
            <div className="flex items-center justify-center w-12 h-12 rounded-full border-4 border-white bg-slate-100 text-slate-500 font-bold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors group-hover:bg-emerald-500 group-hover:text-white">
              {index + 1}
            </div>
            
            {/* Content Card */}
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-4 rounded-2xl bg-white shadow-sm border border-slate-100 group-hover:border-emerald-200 transition-all group-hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold text-slate-800">{step.title}</h3>
                <div className="text-slate-400 group-hover:text-emerald-500 transition-colors">
                  {step.icon}
                </div>
              </div>
              
              <p className="text-slate-600 text-sm mb-4 leading-relaxed">{step.description}</p>
              
              {step.image && (
                <div className="mb-4 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 relative group/img">
                  <img 
                    src={step.image} 
                    alt={`Illustration für ${step.title}`} 
                    className="w-full h-40 object-cover opacity-90 group-hover/img:opacity-100 transition-opacity"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <ImageIcon className="text-white drop-shadow-md" size={32} />
                  </div>
                </div>
              )}
              
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 border border-slate-100">
                <span className="font-bold text-slate-800 block mb-2 text-xs uppercase tracking-wider">Details & Tipps</span>
                <div className="whitespace-pre-line leading-relaxed">
                  {step.details}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
