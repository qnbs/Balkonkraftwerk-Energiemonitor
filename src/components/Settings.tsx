import { useState } from 'react';
import { Save, AlertTriangle, Zap, HardDrive, BellRing } from 'lucide-react';
import { Thresholds } from '../App';

interface SettingsProps {
  thresholds: Thresholds;
  setThresholds: React.Dispatch<React.SetStateAction<Thresholds>>;
}

export default function Settings({ thresholds, setThresholds }: SettingsProps) {
  const [localThresholds, setLocalThresholds] = useState<Thresholds>(thresholds);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setThresholds(localThresholds);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <BellRing className="text-emerald-600" />
          Benachrichtigungen
        </h2>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          Konfiguriere die Schwellenwerte für kritische Ereignisse. Das System informiert dich, wenn diese Werte über- oder unterschritten werden.
        </p>

        <div className="space-y-6">
          {/* Max Consumption */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                <Zap size={24} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Maximaler Verbrauch (Watt)
                </label>
                <p className="text-xs text-slate-500 mb-3">Warnung bei Überschreitung dieses Wertes.</p>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="500" 
                    max="5000" 
                    step="100"
                    value={localThresholds.maxConsumption}
                    onChange={(e) => setLocalThresholds({...localThresholds, maxConsumption: parseInt(e.target.value)})}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <span className="font-mono bg-white px-3 py-1 rounded border border-slate-200 min-w-[80px] text-center">
                    {localThresholds.maxConsumption} W
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Min Production Drop */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Produktionsabfall (%)
                </label>
                <p className="text-xs text-slate-500 mb-3">Kritische Warnung bei plötzlichem Leistungsabfall (z.B. durch Verschattung oder Defekt).</p>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="10" 
                    max="90" 
                    step="5"
                    value={localThresholds.minProductionDrop}
                    onChange={(e) => setLocalThresholds({...localThresholds, minProductionDrop: parseInt(e.target.value)})}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <span className="font-mono bg-white px-3 py-1 rounded border border-slate-200 min-w-[80px] text-center">
                    {localThresholds.minProductionDrop} %
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Storage Warning */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                <HardDrive size={24} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Speicherplatzwarnung (%)
                </label>
                <p className="text-xs text-slate-500 mb-3">Warnung, wenn die SD-Karte diesen Füllstand erreicht.</p>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="50" 
                    max="99" 
                    step="1"
                    value={localThresholds.storageWarning}
                    onChange={(e) => setLocalThresholds({...localThresholds, storageWarning: parseInt(e.target.value)})}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <span className="font-mono bg-white px-3 py-1 rounded border border-slate-200 min-w-[80px] text-center">
                    {localThresholds.storageWarning} %
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              saved 
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md hover:shadow-lg'
            }`}
          >
            <Save size={20} />
            {saved ? 'Gespeichert!' : 'Einstellungen speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
