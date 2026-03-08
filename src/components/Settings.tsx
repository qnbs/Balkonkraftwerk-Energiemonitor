import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, AlertTriangle, Zap, BellRing, Key, Moon, Sun, Shield, ExternalLink, Globe, Battery, Home, Bell, PlugZap, TestTube2, Wifi, WifiOff, Share2, Trash2, Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { Thresholds } from '../App';
import type { Theme } from '../lib/theme';
import { getStoredApiKey } from '../lib/gemini';
import { getStoredHAConfig, setStoredHAConfig, type HAConfig, type HAStatus } from '../lib/ha';
import { getStoredMQTTConfig, setStoredMQTTConfig, type MQTTConfig, type MQTTStatus } from '../lib/mqtt';
import { getAlertPrefs, saveAlertPrefs, showBrowserNotification, type AlertPreferences, DEFAULT_ALERT_PREFS } from '../lib/push';
import {
  saveApiKey, deleteApiKey, hasApiKeyStored, isApiKeyEncrypted,
  getApiKey, setKeyInCache, clearKeyCache, verifyPin,
} from '../lib/db';

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
  mqttStatus: MQTTStatus;
  onMqttConnect: () => void;
  onMqttDisconnect: () => void;
}

export default function Settings({
  thresholds, setThresholds, theme, toggleTheme,
  hasBattery, onHasBatteryChange, batteryCapacity, onBatteryCapacityChange,
  haStatus, onHaConnect, onHaDisconnect,
  mqttStatus, onMqttConnect, onMqttDisconnect,
}: SettingsProps) {
  const { t, i18n } = useTranslation();
  const [localThresholds, setLocalThresholds] = useState<Thresholds>(thresholds);
  const [saved, setSaved] = useState(false);

  // API key state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyStored, setKeyStored] = useState(false);
  const [keyEncrypted, setKeyEncrypted] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [usePinProtection, setUsePinProtection] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [keySaving, setKeySaving] = useState(false);

  const [haConfig, setHaConfig] = useState<HAConfig>({ url: '', token: '', entitySolar: '', entityLoad: '', entityBattery: '' });
  const [mqttConfig, setMqttConfig] = useState<MQTTConfig>({ brokerUrl: '', username: '', password: '', topicSolar: '', topicLoad: '', topicBattery: '', topicGrid: '' });
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const [alertPrefs, setAlertPrefs] = useState<AlertPreferences>(DEFAULT_ALERT_PREFS);

  // Load all async settings on mount
  useEffect(() => {
    hasApiKeyStored().then(setKeyStored);
    isApiKeyEncrypted().then(setKeyEncrypted);
    getStoredHAConfig().then(setHaConfig);
    getStoredMQTTConfig().then(setMqttConfig);
    getAlertPrefs().then(setAlertPrefs);
  }, []);

  useEffect(() => { setLocalThresholds(thresholds); }, [thresholds]);

  const handleSave = () => {
    setThresholds(localThresholds);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    if (!keyStored) {
      // Show security warning on first save
      setShowSecurityModal(true);
      return;
    }
    await doSaveKey();
  };

  const doSaveKey = async () => {
    setKeySaving(true);
    try {
      await saveApiKey(apiKeyInput.trim(), usePinProtection ? pinInput : undefined);
      setKeyStored(true);
      setKeyEncrypted(usePinProtection && pinInput.length >= 4);
      setApiKeyInput('');
      setPinInput('');
      setShowSecurityModal(false);
      toast.success(keyEncrypted ? '🔐 API-Key verschlüsselt gespeichert' : '✅ API-Key gespeichert (IndexedDB)');
    } catch (err) {
      toast.error('Fehler beim Speichern', { description: String(err) });
    } finally {
      setKeySaving(false);
    }
  };

  const handleDeleteKey = async () => {
    await deleteApiKey();
    clearKeyCache();
    setKeyStored(false);
    setKeyEncrypted(false);
    setApiKeyInput('');
    toast.success('API-Key gelöscht');
  };

  const handleUnlockKey = async () => {
    try {
      const key = await getApiKey(pinInput);
      setKeyInCache(key);
      setPinInput('');
      toast.success('API-Key entsperrt – KI-Funktionen verfügbar');
    } catch {
      toast.error('Falscher PIN');
    }
  };

  const handleSaveHaConfig = async () => {
    await setStoredHAConfig(haConfig);
    toast.success(t('settings.haSaved'));
  };

  const handleSaveMqttConfig = async () => {
    await setStoredMQTTConfig(mqttConfig);
    toast.success('MQTT-Einstellungen gespeichert');
  };

  const handleEnablePush = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === 'granted') toast.success(t('settings.pushEnabled'));
  };

  const handleSaveAlerts = async () => {
    await saveAlertPrefs(alertPrefs);
    toast.success('Alarm-Einstellungen gespeichert');
  };

  const handleTestNotification = async () => {
    if (notifPerm !== 'granted') {
      toast.error('Notifications erst aktivieren');
      return;
    }
    await showBrowserNotification(
      '✅ Test-Benachrichtigung',
      'Push-Notifications funktionieren korrekt!',
      'test',
    );
    toast.success('Test-Notification gesendet');
  };

  // Current in-memory key status
  const cachedKey = getStoredApiKey(); // reads from _keyCache

  const haStatusColor = haStatus === 'connected'
    ? 'text-emerald-600'
    : haStatus === 'connecting'
    ? 'text-amber-500'
    : haStatus === 'error'
    ? 'text-rose-600'
    : 'text-slate-400';

  const mqttStatusColor = mqttStatus === 'connected'
    ? 'text-emerald-600'
    : mqttStatus === 'connecting'
    ? 'text-amber-500'
    : mqttStatus === 'error'
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

        {/* Security info */}
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
          <div className="flex gap-2 items-start">
            <Shield size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <p className="font-semibold mb-1">{t('settings.byok')}</p>
              <p>{t('settings.byokDescription')}</p>
              <p className="mt-1 font-medium">🔐 Key wird NUR in IndexedDB gespeichert – nie in localStorage oder Server.</p>
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

        {/* Key status + management */}
        {keyStored ? (
          <div className="space-y-3">
            <div className={`flex items-center gap-2.5 p-3 rounded-xl ${
              keyEncrypted ? 'bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800' : 'bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800'
            }`}>
              {keyEncrypted
                ? <Lock size={16} className="text-violet-600 flex-shrink-0" />
                : <LockOpen size={16} className="text-emerald-600 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">
                  {keyEncrypted ? '🔐 Key verschlüsselt (AES-256-GCM + PIN)' : '✅ Key gespeichert (IndexedDB)'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {cachedKey ? 'Aktiv im Speicher – KI-Funktionen verfügbar' : 'Key liegt verschlüsselt vor – PIN nötig zum Aktivieren'}
                </p>
              </div>
            </div>
            {/* PIN unlock for encrypted key (if not yet in cache) */}
            {keyEncrypted && !cachedKey && (
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlockKey()}
                  placeholder="PIN eingeben"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  onClick={handleUnlockKey}
                  disabled={!pinInput}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                >
                  Entsperren
                </button>
              </div>
            )}
            {/* Change / Delete buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                <Key size={13} /> Key ändern
              </button>
              <button
                onClick={handleDeleteKey}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-all"
              >
                <Trash2 size={13} /> Löschen
              </button>
            </div>
            {/* Inline key change form */}
            <AnimatePresence>
              {showKeyInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-2"
                >
                  <div className="relative">
                    <input
                      type={showKeyInput ? 'password' : 'text'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="Neuer Gemini API-Key (AIza...)"
                      className="w-full px-3 py-2 pr-9 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUsePinProtection(!usePinProtection)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        usePinProtection ? 'bg-violet-100 dark:bg-violet-900 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <Lock size={12} /> PIN-Schutz
                    </button>
                    {usePinProtection && (
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        placeholder="Neuer PIN (mind. 4 Stellen)"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    )}
                  </div>
                  <button
                    onClick={doSaveKey}
                    disabled={!apiKeyInput.trim() || keySaving || (usePinProtection && pinInput.length < 4)}
                    className="w-full py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                  >
                    {keySaving ? 'Speichere...' : 'Key speichern'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* No key yet */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t('settings.apiKeyLabel')}
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            {/* Optional PIN protection */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setUsePinProtection(!usePinProtection)}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${usePinProtection ? 'bg-violet-500' : 'bg-slate-300'}`}
                role="switch"
                aria-checked={usePinProtection}
              >
                <motion.span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                  animate={{ x: usePinProtection ? 16 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                />
              </button>
              <div>
                <p className="text-xs font-medium">PIN-Schutz (optional)</p>
                <p className="text-[10px] text-slate-500">Key mit AES-256-GCM verschlüsseln</p>
              </div>
            </div>
            {usePinProtection && (
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PIN (mind. 4 Stellen)"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            )}
            <button
              onClick={handleSaveKey}
              disabled={!apiKeyInput.trim() || (usePinProtection && pinInput.length < 4)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
            >
              <Key size={14} />
              {t('settings.saveKey')}
            </button>
            <p className="text-xs text-slate-400 text-center">{t('settings.noKey')}</p>
          </div>
        )}

        {/* Security-Warning Modal (shown on first save) */}
        <AnimatePresence>
          {showSecurityModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl w-full max-w-sm border border-amber-200 dark:border-amber-800"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-amber-100 dark:bg-amber-900 p-2.5 rounded-xl">
                    <Shield size={20} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="font-bold text-sm">Sicherheitshinweis</h3>
                </div>
                <div className="space-y-2.5 mb-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p>✅ <strong>Lokal & privat:</strong> Dein API-Key wird ausschließlich in deinem Browser (IndexedDB) gespeichert – kein Server, keine Cloud.</p>
                  <p>🔒 <strong>Empfehlung:</strong> Schränke deinen Key in <strong>Google AI Studio</strong> auf den Referrer <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">*.github.io/*</code> ein.</p>
                  <p>🛡️ Dadurch ist der Key auch bei Diebstahl aus dem Speicher wertlos.</p>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium hover:underline"
                  >
                    Google AI Studio öffnen <ExternalLink size={11} />
                  </a>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={doSaveKey}
                    disabled={keySaving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                  >
                    {keySaving ? 'Speichere...' : 'Verstanden – Speichern'}
                  </button>
                  <button
                    onClick={() => setShowSecurityModal(false)}
                    className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  >
                    Abbrechen
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Push Notifications */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Bell size={18} className="text-rose-500" />
          {t('settings.pushTitle')}
        </h2>
        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl mb-3">
          <div>
            <p className="text-sm font-medium">{t('settings.pushStatus')}</p>
            <p className={`text-xs mt-0.5 ${
              notifPerm === 'granted' ? 'text-emerald-600' : notifPerm === 'denied' ? 'text-rose-500' : 'text-slate-400'
            }`}>
              {notifPerm === 'granted' ? t('settings.pushGranted') : notifPerm === 'denied' ? t('settings.pushDenied') : t('settings.pushDefault')}
            </p>
          </div>
          <div className="flex gap-2">
            {notifPerm === 'granted' && (
              <button
                onClick={handleTestNotification}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                <TestTube2 size={14} />
                Test
              </button>
            )}
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

        {/* Alert type toggles */}
        {notifPerm === 'granted' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Alarm-Typen</p>

            {([
              { key: 'peakProduction' as const, icon: '☀️', label: 'Peak-Erzeugung', desc: 'Wenn Anlage auf Volllast läuft' },
              { key: 'lowAutarky' as const, icon: '⚡', label: 'Niedrige Autarkie', desc: `Autarkie unter ${alertPrefs.lowAutarkyThreshold} %` },
              { key: 'amortization' as const, icon: '🎉', label: 'Amortisation erreicht', desc: 'Einmalige Meilenstein-Benachrichtigung' },
              { key: 'pricePeak' as const, icon: '💰', label: 'Strompreis-Alarm', desc: `Preis > ${alertPrefs.pricePeakThresholdCtKwh} ct oder < ${alertPrefs.priceLowThresholdCtKwh} ct` },
            ] as const).map(({ key, icon, label, desc }) => (
              <div key={key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{icon}</span>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => setAlertPrefs((p) => ({ ...p, [key]: !p[key] }))}
                  className={`relative w-10 h-6 rounded-full transition-colors ${alertPrefs[key] ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  role="switch"
                  aria-checked={alertPrefs[key]}
                >
                  <motion.span
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                    animate={{ x: alertPrefs[key] ? 16 : 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  />
                </button>
              </div>
            ))}

            {/* Threshold sliders */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium flex items-center gap-1.5">
                    <PlugZap size={13} className="text-amber-500" />
                    Preis-Alarm ab (ct/kWh)
                  </label>
                  <span className="font-mono text-xs bg-white dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                    {alertPrefs.pricePeakThresholdCtKwh} ct
                  </span>
                </div>
                <input
                  type="range" min="5" max="40" step="1"
                  value={alertPrefs.pricePeakThresholdCtKwh}
                  onChange={(e) => setAlertPrefs((p) => ({ ...p, pricePeakThresholdCtKwh: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium flex items-center gap-1.5">
                    <Zap size={13} className="text-emerald-500" />
                    Autarkie-Alarm unter (%)
                  </label>
                  <span className="font-mono text-xs bg-white dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                    {alertPrefs.lowAutarkyThreshold} %
                  </span>
                </div>
                <input
                  type="range" min="10" max="90" step="5"
                  value={alertPrefs.lowAutarkyThreshold}
                  onChange={(e) => setAlertPrefs((p) => ({ ...p, lowAutarkyThreshold: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>

            <button
              onClick={handleSaveAlerts}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-rose-500 text-white hover:bg-rose-600 transition-all"
            >
              <BellRing size={15} />
              Alarm-Einstellungen speichern
            </button>
          </div>
        )}
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

      {/* MQTT */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Share2 size={18} className="text-teal-500" />
          MQTT-Broker
          <span className={`ml-auto text-xs font-normal ${mqttStatusColor}`}>
            {mqttStatus === 'connected' ? '● Verbunden'
              : mqttStatus === 'connecting' ? '○ Verbinde…'
              : mqttStatus === 'error' ? '✕ Fehler'
              : '○ Getrennt'}
          </span>
        </h2>
        <div className="bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 rounded-xl p-3 mb-4 text-xs text-teal-700 dark:text-teal-300 leading-relaxed">
          <p className="font-semibold mb-1">WebSocket-Transport</p>
          <p>Der Browser verbindet sich per <code className="font-mono bg-teal-100 dark:bg-teal-900 px-1 rounded">ws://</code> direkt zum MQTT-Broker.
          Mosquitto (Port 9001) oder der HA-Mosquitto-Add-on unterstützen dies out-of-the-box.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Broker-URL (WebSocket)
            </label>
            <input
              type="url"
              value={mqttConfig.brokerUrl}
              onChange={(e) => setMqttConfig({ ...mqttConfig, brokerUrl: e.target.value })}
              placeholder="ws://homeassistant.local:9001"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Benutzername
              </label>
              <input
                type="text"
                value={mqttConfig.username}
                onChange={(e) => setMqttConfig({ ...mqttConfig, username: e.target.value })}
                placeholder="(optional)"
                autoComplete="username"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Passwort
              </label>
              <input
                type="password"
                value={mqttConfig.password}
                onChange={(e) => setMqttConfig({ ...mqttConfig, password: e.target.value })}
                placeholder="(optional)"
                autoComplete="current-password"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest pt-1">
            Topic-Konfiguration
          </p>
          {([
            { key: 'topicSolar',   label: 'Solar (W)',    ph: 'bkw/energy/solar_w' },
            { key: 'topicLoad',    label: 'Verbrauch (W)',ph: 'bkw/energy/consumption_w' },
            { key: 'topicBattery', label: 'Batterie (%)', ph: 'bkw/energy/battery_pct' },
            { key: 'topicGrid',    label: 'Netz (W)',     ph: 'bkw/energy/grid_w' },
          ] as const).map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {label}
              </label>
              <input
                type="text"
                value={mqttConfig[key]}
                onChange={(e) => setMqttConfig({ ...mqttConfig, [key]: e.target.value })}
                placeholder={ph}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
              />
            </div>
          ))}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSaveMqttConfig}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <Save size={14} />
              Speichern
            </button>
            {mqttStatus === 'disconnected' || mqttStatus === 'error' ? (
              <button
                onClick={onMqttConnect}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-teal-500 text-white hover:bg-teal-600 transition-all"
              >
                <Wifi size={14} />
                Verbinden
              </button>
            ) : (
              <button
                onClick={onMqttDisconnect}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 transition-all"
              >
                <WifiOff size={14} />
                Trennen
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
