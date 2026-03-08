import { CheckSquare, Square, Wrench, Cpu, Zap, Box } from 'lucide-react';
import { useState } from 'react';

export default function Materials() {
  const [materials, setMaterials] = useState([
    { id: 1, name: 'Hichi TTL, IR-Lesekopf', category: 'Elektronik', checked: false },
    { id: 2, name: 'ESP32-Board WROVER', category: 'Elektronik', checked: false },
    { id: 3, name: 'ESP32-Board WROOM mit SPI-Display', category: 'Elektronik', checked: false },
    { id: 4, name: 'MicroSD-Karte', category: 'Speicher', checked: false },
    { id: 5, name: 'Lochrasterplatine', category: 'Elektronik', checked: false },
    { id: 6, name: 'Widerstände (lt. Schaltplan)', category: 'Kleinteile', checked: false },
    { id: 7, name: 'Dioden', category: 'Kleinteile', checked: false },
    { id: 8, name: 'Kondensatoren', category: 'Kleinteile', checked: false },
    { id: 9, name: 'LEDs', category: 'Kleinteile', checked: false },
    { id: 10, name: 'Taster', category: 'Kleinteile', checked: false },
    { id: 11, name: 'Gehäuse für Transmitter', category: 'Gehäuse', checked: false },
  ]);

  const [tools, setTools] = useState([
    { id: 101, name: 'Lötkolben & Lötzinn', category: 'Werkzeug', checked: false },
    { id: 102, name: 'Seitenschneider', category: 'Werkzeug', checked: false },
    { id: 103, name: 'Abisolierzange', category: 'Werkzeug', checked: false },
    { id: 104, name: 'Schraubendreher-Set', category: 'Werkzeug', checked: false },
    { id: 105, name: 'Multimeter', category: 'Werkzeug', checked: false },
    { id: 106, name: 'Bohrer (für Gehäuse)', category: 'Werkzeug', checked: false },
  ]);

  const toggleMaterial = (id: number) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, checked: !m.checked } : m));
  };

  const toggleTool = (id: number) => {
    setTools(tools.map(t => t.id === id ? { ...t, checked: !t.checked } : t));
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Elektronik': return <Cpu size={16} className="text-purple-500" />;
      case 'Kleinteile': return <Zap size={16} className="text-amber-500" />;
      case 'Gehäuse': return <Box size={16} className="text-blue-500" />;
      case 'Werkzeug': return <Wrench size={16} className="text-slate-500" />;
      default: return <Box size={16} className="text-slate-500" />;
    }
  };

  const renderList = (items: any[], toggleFn: (id: number) => void, title: string, icon: React.ReactNode) => {
    const checkedCount = items.filter(i => i.checked).length;
    const progress = Math.round((checkedCount / items.length) * 100);

    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {icon}
            {title}
          </h3>
          <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {checkedCount} / {items.length}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
          <div 
            className="bg-emerald-500 h-2 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <ul className="space-y-3">
          {items.map((item) => (
            <li 
              key={item.id} 
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                item.checked 
                  ? 'bg-emerald-50 border-emerald-200 text-slate-500' 
                  : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-300'
              }`}
              onClick={() => toggleFn(item.id)}
            >
              <button className="flex-shrink-0 focus:outline-none">
                {item.checked ? (
                  <CheckSquare className="text-emerald-500" size={24} />
                ) : (
                  <Square className="text-slate-300" size={24} />
                )}
              </button>
              <div className="flex-1 flex items-center justify-between">
                <span className={`font-medium ${item.checked ? 'line-through opacity-70' : ''}`}>
                  {item.name}
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                  {getCategoryIcon(item.category)}
                  {item.category}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24">
      <div className="bg-emerald-600 text-white rounded-2xl p-6 shadow-md mb-6">
        <h2 className="text-2xl font-bold mb-2">Stückliste & Werkzeug</h2>
        <p className="text-emerald-100 text-sm leading-relaxed">
          Hake die benötigten Teile ab, um den Überblick zu behalten. 
          Ein gut vorbereiteter Arbeitsplatz ist die halbe Miete für ein erfolgreiches Maker-Projekt.
        </p>
      </div>

      {renderList(materials, toggleMaterial, 'Materialien', <Cpu className="text-emerald-600" />)}
      {renderList(tools, toggleTool, 'Werkzeuge', <Wrench className="text-emerald-600" />)}
    </div>
  );
}
