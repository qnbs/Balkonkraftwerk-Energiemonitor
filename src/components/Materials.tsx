import { CheckSquare, Square, Wrench, Cpu, Zap, Box, ExternalLink, Calculator } from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion } from 'motion/react';

interface Material {
  id: number;
  name: string;
  category: string;
  price: number;
  link?: string;
  checked: boolean;
}

const initialMaterials: Material[] = [
  { id: 1, name: 'Hichi TTL IR-Lesekopf (USB/TTL)', category: 'Elektronik', price: 29.90, link: 'https://www.amazon.de/s?k=Hichi+IR+Lesekopf+TTL', checked: false },
  { id: 2, name: 'ESP32-WROOM-32 DevKit', category: 'Elektronik', price: 8.49, link: 'https://www.amazon.de/s?k=ESP32+WROOM+DevKit', checked: false },
  { id: 3, name: 'USB-C Kabel (1m)', category: 'Elektronik', price: 5.99, link: 'https://www.amazon.de/s?k=USB-C+Kabel+1m', checked: false },
  { id: 4, name: 'USB-Netzteil 5V/2A (CE)', category: 'Elektronik', price: 7.99, link: 'https://www.amazon.de/s?k=USB+Netzteil+5V+2A+CE', checked: false },
  { id: 5, name: 'Dupont-Kabel Set (40 Stk.)', category: 'Elektronik', price: 4.99, link: 'https://www.amazon.de/s?k=Dupont+Kabel+Set', checked: false },
  { id: 6, name: 'SPI-Display 1.8" ST7735 (optional)', category: 'Elektronik', price: 6.49, link: 'https://www.amazon.de/s?k=ST7735+SPI+Display', checked: false },
  { id: 7, name: 'Lochrasterplatine 5x7cm', category: 'Kleinteile', price: 1.99, link: 'https://www.amazon.de/s?k=Lochrasterplatine+5x7', checked: false },
  { id: 8, name: 'Widerstände-Set (assorted)', category: 'Kleinteile', price: 3.99, link: 'https://www.amazon.de/s?k=Widerst%C3%A4nde+Set+assorted', checked: false },
  { id: 9, name: 'Gehäuse (3D-Druck / Universal)', category: 'Gehäuse', price: 8.99, link: 'https://www.amazon.de/s?k=ESP32+Geh%C3%A4use+universal', checked: false },
  { id: 10, name: 'M2.5 Schrauben-Set', category: 'Kleinteile', price: 3.49, link: 'https://www.amazon.de/s?k=M2.5+Schrauben+Set', checked: false },
  { id: 11, name: 'Lötzinn bleifrei 100g', category: 'Kleinteile', price: 6.99, link: 'https://www.amazon.de/s?k=L%C3%B6tzinn+bleifrei+100g', checked: false },
];

const initialTools: Material[] = [
  { id: 101, name: 'Lötkolben mit Temperaturregelung', category: 'Werkzeug', price: 24.99, link: 'https://www.amazon.de/s?k=L%C3%B6tkolben+Temperaturregelung', checked: false },
  { id: 102, name: 'Seitenschneider', category: 'Werkzeug', price: 7.99, checked: false },
  { id: 103, name: 'Abisolierzange', category: 'Werkzeug', price: 8.99, checked: false },
  { id: 104, name: 'Multimeter', category: 'Werkzeug', price: 14.99, link: 'https://www.amazon.de/s?k=Multimeter+digital', checked: false },
  { id: 105, name: 'Schraubendreher-Set (Kreuz/Schlitz)', category: 'Werkzeug', price: 9.99, checked: false },
  { id: 106, name: '3. Hand / Löthilfe', category: 'Werkzeug', price: 11.99, link: 'https://www.amazon.de/s?k=dritte+Hand+L%C3%B6thilfe', checked: false },
];

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Elektronik': return <Cpu size={14} className="text-purple-500" />;
    case 'Kleinteile': return <Zap size={14} className="text-amber-500" />;
    case 'Gehäuse': return <Box size={14} className="text-blue-500" />;
    case 'Werkzeug': return <Wrench size={14} className="text-slate-500" />;
    default: return <Box size={14} className="text-slate-500" />;
  }
};

export default function Materials() {
  const [materials, setMaterials] = useState(initialMaterials);
  const [tools, setTools] = useState(initialTools);

  const toggleItem = (list: Material[], setList: React.Dispatch<React.SetStateAction<Material[]>>, id: number) => {
    setList(list.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)));
  };

  const totalCost = useMemo(() => {
    const matCost = materials.reduce((s, m) => s + m.price, 0);
    const toolCost = tools.reduce((s, t) => s + t.price, 0);
    return { materials: matCost, tools: toolCost, total: matCost + toolCost };
  }, [materials, tools]);

  const renderList = (items: Material[], setItems: React.Dispatch<React.SetStateAction<Material[]>>, title: string, icon: React.ReactNode) => {
    const checkedCount = items.filter((i) => i.checked).length;
    const progress = Math.round((checkedCount / items.length) * 100);
    const subtotal = items.reduce((s, m) => s + m.price, 0);

    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            {icon}
            {title}
          </h3>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
            {checkedCount}/{items.length} · {subtotal.toFixed(2)} €
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
              onClick={() => toggleItem(items, setItems, item.id)}
            >
              <button className="flex-shrink-0" aria-label={item.checked ? `${item.name} abhaken` : `${item.name} markieren`}>
                {item.checked ? (
                  <CheckSquare className="text-emerald-500" size={20} />
                ) : (
                  <Square className="text-slate-300" size={20} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${item.checked ? 'line-through opacity-70' : ''}`}>{item.name}</span>
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
    <div className="p-4 max-w-4xl mx-auto pb-24">
      {/* Header with Cost Calculator */}
      <div className="bg-emerald-600 dark:bg-emerald-800 text-white rounded-2xl p-5 shadow-md mb-4">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Calculator size={20} />
          Stückliste & Kostenrechner
        </h2>
        <p className="text-emerald-100 text-xs mb-4">
          Preise Stand März 2026 · Alle Preise inkl. MwSt.
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-lg font-bold">{totalCost.materials.toFixed(2)} €</p>
            <p className="text-[10px] text-emerald-200 uppercase">Material</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-lg font-bold">{totalCost.tools.toFixed(2)} €</p>
            <p className="text-[10px] text-emerald-200 uppercase">Werkzeug</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 ring-2 ring-white/30">
            <p className="text-lg font-bold">{totalCost.total.toFixed(2)} €</p>
            <p className="text-[10px] text-emerald-200 uppercase">Gesamt</p>
          </div>
        </div>
      </div>

      {renderList(materials, setMaterials, 'Materialien', <Cpu className="text-emerald-600" size={18} />)}
      {renderList(tools, setTools, 'Werkzeuge', <Wrench className="text-emerald-600" size={18} />)}
    </div>
  );
}
