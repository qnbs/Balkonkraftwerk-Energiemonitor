import { useState, useEffect } from 'react';
import { Save, AlertTriangle, Zap, BellRing, Key, Moon, Sun, Shield, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import type { Thresholds } from '../App';
import type { Theme } from '../lib/theme';
import { getStoredApiKey, setStoredApiKey, hasApiKey } from '../lib/gemini';

interface SettingsProps {
  thresholds: Thresholds;
  setThresholds: React.Dispatch<React.SetStateAction<Thresholds>>;
  theme: Theme;
  toggleTheme: () => void;
}

export default function Settings({ thresholds, setThresholds, theme, toggleTheme }: SettingsProps) {
  const [localThresholds, setLocalThresholds] = useState<Thresholds>(thresholds);
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKey] = useState(getStoredApiKey);
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    setLocalThresholds(thresholds);
  }, [thresholds]);

  const handleSave = () => {
    setThresholds(localThresholds);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveKey = () => {
    setStoredApiKey(apiKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24 space-y-4">
      {/* Appearance */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          {theme === 'light' ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-indigo-400" />}
          Erscheinungsbild
        </h2>
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
          <div>
            <p className="text-sm font-medium">Dark Mode</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Zwischen hell und dunkel wechseln</p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-300'
            }`}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Dark Mode umschalten"
          >
            <motion.span
              className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm flex items-center justify-center"
              animate={{ x: theme === 'dark' ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              {theme === 'dark' ? <Moon size={12} className="text-indigo-500" /> : <Sun size={12} className="text-amber-500" />}
            </motion.span>
          </button>
        </div>
      </div>

      {/* Gemini API Key (BYOK) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-3 flex items-center gap-2">
          <Key size={18} className="text-violet-500" />
          Gemini KI-Analyse
        </h2>

        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
          <div className="flex gap-2 items-start">
            <Shield size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <p className="font-semibold mb-1">Bring Your Own Key (BYOK)</p>
              <p>Dein API-Key wird <strong>nur lokal in deinem Browser</strong> gespeichert (localStorage) und niemals an unsere Server gesendet. Der Key wird direkt für die Google Gemini API verwendet.</p>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-amber-800 dark:text-amber-200 font-medium hover:underline"
              >
                Kostenlosen API-Key erstellen
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="apiKey" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Google Gemini API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${hasApiKey() ? 'text-emerald-600' : 'text-slate-400'}`}>
              {hasApiKey() ? '✓ Key konfiguriert' : 'Kein Key gesetzt'}
            </span>
            <button
              onClick={handleSaveKey}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                keySaved
                  ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              <Key size={14} />
              {keySaved ? 'Gespeichert!' : 'Key speichern'}
            </button>
          </div>
        </div>
      </div>

      {/* Notification Thresholds */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <BellRing size={18} className="text-emerald-600" />
          Benachrichtigungen
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Schwellenwerte für automatische Warnungen konfigurieren.
        </p>

        <div className="space-y-5">
          {/* Max Consumption */}
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <Zap size={16} className="text-amber-500" />
              <label className="text-sm font-medium">Max. Verbrauch</label>
              <span className="ml-auto font-mono text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                {localThresholds.maxConsumption} W
              </span>
            </div>
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={localThresholds.maxConsumption}
              onChange={(e) => setLocalThresholds({ ...localThresholds, maxConsumption: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              aria-label="Maximaler Verbrauch in Watt"
            />
          </div>

          {/* Min Production Drop */}
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={16} className="text-rose-500" />
              <label className="text-sm font-medium">Produktionsabfall</label>
              <span className="ml-auto font-mono text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                {localThresholds.minProductionDrop} %
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              step="5"
              value={localThresholds.minProductionDrop}
              onChange={(e) => setLocalThresholds({ ...localThresholds, minProductionDrop: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              aria-label="Mindest-Produktionsabfall in Prozent"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              saved
                ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'
            }`}
          >
            <Save size={16} />
            {saved ? 'Gespeichert!' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          Balkonkraftwerk Energiemonitor v1.0.0
        </p>
        <p className="text-[10px] text-slate-400 mt-1">
          Open Source · MIT Lizenz ·{' '}
          <a
            href="https://github.com/qnbs/Balkonkraftwerk-Energiemonitor"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-600"
          >
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
