import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, AlertTriangle, Zap, BellRing, Key, Moon, Sun, Shield, ExternalLink, Globe, Battery, Home, Wifi, WifiOff, Bell } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { Thresholds } from '../App';
import type { Theme } from '../lib/theme';
import { getStoredApiKey, setStoredApiKey, hasApiKey } from '../lib/gemini';
import { getStoredHAConfig, setStoredHAConfig, DEFAULT_HA_CONFIG, type HAConfig, type HAStatus } from '../lib/ha';

interface SettingsProps {
  thresholds: Thresholds;
  setThresholds: React.Dispatch<React.SetStateAction<Thresholds>>;
  theme: Theme;
  toggleTheme: () => void;
  hasBattery: boolean;
  onHasBatteryChange: (v: boolean) => void;
  batteryCapacity: number;
  onBatteryCapacityChange: (v: number) => void;
  haStatus: HAStatus;
  onHaConnect: () => void;
  onHaDisconnect: () => void;
}

export default function Settings({
  thresholds, setThresholds, theme, toggleTheme,
  hasBattery, onHasBatteryChange, batteryCapacity, onBatteryCapacityChange,
  haStatus, onHaConnect, onHaDisconnect,
}: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [localThresholds, setLocalThresholds] = useState<Thresholds>(thresholds);
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKey] = useState(getStoredApiKey);
  const [keySaved, setKeySaved] = useState(false);
  const [haConfig, setHaConfig] = useState<HAConfig>(getStoredHAConfig);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );

  useEffect(() => { setLocalThresholds(thresholds); }, [thresholds]);

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

  const handleSaveHaConfig = () => {
    setStoredHAConfig(haConfig);
    toast.success(t('settings.haSaved'));
  };

  const handleEnablePush = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') toast.success(t('settings.pushEnabled'));
  };

  const haStatusColor = haStatus === 'connected'
    ? 'text-emerald-600'
    : haStatus === 'connecting'
    ? 'text-amber-500'
    : haStatus === 'error'
    ? 'text-rose-600'
    : 'text-slate-400';

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24 space-y-4">

      {/* Language */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Globe size={18} className="text-sky-500" />
          {t('settings.language')}
        </h2>
        <div className="flex gap-3">
          {(['de', 'en'] as const).map((code) => (
            <button
              key={code}
              onClick={() => {
                i18n.changeLanguage(code);
                document.documentElement.lang = code;
                document.documentElement.dir = 'ltr';
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                i18n.language === code
                  ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {code === 'de' ? '🇩🇪  Deutsch' : '🇬🇧  English'}
            </button>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          {theme === 'light' ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-indigo-400" />}
          {t('settings.appearance')}
        </h2>
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
          <div>
            <p className="text-sm font-medium">{t('settings.darkMode')}</p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-12 h-7 rounded-full transition-colors ${theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-300'}`}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label={t('settings.darkMode')}
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
          {t('settings.gemini')}
        </h2>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
          <div className="flex gap-2 items-start">
            <Shield size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <p className="font-semibold mb-1">{t('settings.byok')}</p>
              <p>{t('settings.byokDescription')}</p>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-amber-800 dark:text-amber-200 font-medium hover:underline"
              >
                {t('settings.createKey')}
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor="apiKey" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t('settings.apiKeyLabel')}
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
              {hasApiKey() ? `✓ ${t('settings.keySet')}` : t('settings.noKey')}
            </span>
            <button
              onClick={handleSaveKey}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                keySaved ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              <Key size={14} />
              {keySaved ? t('settings.saved') : t('settings.saveKey')}
            </button>
          </div>
        </div>
      </div>

      {/* Push Notifications */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Bell size={18} className="text-rose-500" />
          {t('settings.pushTitle')}
        </h2>
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
          <div>
            <p className="text-sm font-medium">{t('settings.pushStatus')}</p>
            <p className={`text-xs mt-0.5 ${
              notifPerm === 'granted' ? 'text-emerald-600' : notifPerm === 'denied' ? 'text-rose-500' : 'text-slate-400'
            }`}>
              {notifPerm === 'granted' ? t('settings.pushGranted') : notifPerm === 'denied' ? t('settings.pushDenied') : t('settings.pushDefault')}
            </p>
          </div>
          {notifPerm !== 'granted' && (
            <button
              onClick={handleEnablePush}
              disabled={notifPerm === 'denied'}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {t('settings.pushEnable')}
            </button>
          )}
        </div>
      </div>

      {/* Battery Storage */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Battery size={18} className="text-emerald-500" />
          {t('settings.batteryTitle')}
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <p className="text-sm font-medium">{t('settings.hasBattery')}</p>
            <button
              onClick={() => onHasBatteryChange(!hasBattery)}
              className={`relative w-12 h-7 rounded-full transition-colors ${hasBattery ? 'bg-emerald-500' : 'bg-slate-300'}`}
              role="switch"
              aria-checked={hasBattery}
            >
              <motion.span
                className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm"
                animate={{ x: hasBattery ? 20 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              />
            </button>
          </div>
          {hasBattery && (
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <Battery size={16} className="text-emerald-500" />
                <label className="text-sm font-medium">{t('settings.batteryCapacity')}</label>
                <span className="ml-auto font-mono text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                  {batteryCapacity} kWh
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="0.5"
                value={batteryCapacity}
                onChange={(e) => onBatteryCapacityChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                aria-label={t('settings.batteryCapacity')}
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>1 kWh</span><span>30 kWh</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Home Assistant */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Home size={18} className="text-orange-500" />
          {t('settings.haTitle')}
          <span className={`ml-auto text-xs font-normal ${haStatusColor}`}>
            {haStatus === 'connected' ? `● ${t('settings.haConnected')}`
              : haStatus === 'connecting' ? `○ ${t('settings.haConnecting')}`
              : haStatus === 'error' ? `✕ ${t('settings.haError')}`
              : `○ ${t('settings.haDisconnected')}`}
          </span>
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('settings.haUrl')}</label>
            <input
              type="url"
              value={haConfig.url}
              onChange={(e) => setHaConfig({ ...haConfig, url: e.target.value })}
              placeholder="ws://homeassistant.local:8123/api/websocket"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t('settings.haToken')}</label>
            <input
              type="password"
              value={haConfig.token}
              onChange={(e) => setHaConfig({ ...haConfig, token: e.target.value })}
              placeholder="eyJ..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['entitySolar', 'entityLoad', 'entityBattery'] as const).map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t(`settings.${key === 'entitySolar' ? 'haSolar' : key === 'entityLoad' ? 'haLoad' : 'haBattery'}`)}
                </label>
                <input
                  type="text"
                  value={haConfig[key]}
                  onChange={(e) => setHaConfig({ ...haConfig, [key]: e.target.value })}
                  placeholder={key === 'entitySolar' ? 'sensor.solar_power' : key === 'entityLoad' ? 'sensor.load_power' : 'sensor.battery_soc'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSaveHaConfig}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <Save size={14} />
              {t('settings.save')}
            </button>
            {haStatus === 'disconnected' || haStatus === 'error' ? (
              <button
                onClick={onHaConnect}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
              >
                <Wifi size={14} />
                {t('settings.haConnect')}
              </button>
            ) : (
              <button
                onClick={onHaDisconnect}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-all"
              >
                <WifiOff size={14} />
                {t('settings.haDisconnect')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notification Thresholds */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <BellRing size={18} className="text-emerald-600" />
          {t('settings.thresholds')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t('settings.thresholdsDesc')}</p>
        <div className="space-y-5">
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <Zap size={16} className="text-amber-500" />
              <label className="text-sm font-medium">{t('settings.maxConsumption')}</label>
              <span className="ml-auto font-mono text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                {localThresholds.maxConsumption} W
              </span>
            </div>
            <input
              type="range" min="500" max="5000" step="100"
              value={localThresholds.maxConsumption}
              onChange={(e) => setLocalThresholds({ ...localThresholds, maxConsumption: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              aria-label={t('settings.maxConsumption')}
            />
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle size={16} className="text-rose-500" />
              <label className="text-sm font-medium">{t('settings.minProductionDrop')}</label>
              <span className="ml-auto font-mono text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">
                {localThresholds.minProductionDrop} %
              </span>
            </div>
            <input
              type="range" min="10" max="90" step="5"
              value={localThresholds.minProductionDrop}
              onChange={(e) => setLocalThresholds({ ...localThresholds, minProductionDrop: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              aria-label={t('settings.minProductionDrop')}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              saved ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'
            }`}
          >
            <Save size={16} />
            {saved ? t('settings.saved') : t('settings.save')}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-400">Balkonkraftwerk Energiemonitor v2.0.0</p>
        <p className="text-[10px] text-slate-400 mt-1">
          Open Source · MIT ·{' '}
          <a href="https://github.com/qnbs/Balkonkraftwerk-Energiemonitor" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
