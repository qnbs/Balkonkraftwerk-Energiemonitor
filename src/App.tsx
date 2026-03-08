import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Activity, BookOpen, Settings as SettingsIcon, Bell, X, Sun, Moon, Zap, TrendingUp, Cpu, LayoutGrid, HelpCircle, Lock } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ErrorBoundary, OfflineBanner } from './components/ui/ErrorBoundary';
import { DashboardSkeleton } from './components/ui/Skeleton';
import { LanguageSwitcher } from './components/ui/LanguageSwitcher';
import { getStoredTheme, setStoredTheme, type Theme } from './lib/theme';
import { isLiveMode, setLiveMode } from './lib/esp32';
import { HAClient, getStoredHAConfig, type HAStatus, type HAData } from './lib/ha';
import { MQTTClient, getStoredMQTTConfig, type MQTTStatus } from './lib/mqtt';
import { loadDevices, type BKWDevice } from './lib/deviceStore';
import { fetchElectricityPrices, type MarketPrice } from './lib/electricity';
import {
  migrateFromLocalStorage, getSetting, saveSetting,
  getApiKey, hasApiKeyStored, isApiKeyEncrypted, setKeyInCache, db,
  getDbEncryptionStatus, unlockDb, resetDbAndDeleteAll,
  flushSyncQueue,
} from './lib/db';
import { initSupabaseAuth, subscribeToRealtimeSync, isSupabaseConfigured } from './lib/supabase';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Help = lazy(() => import('./components/Help'));
const Settings = lazy(() => import('./components/Settings'));
const Economics = lazy(() => import('./components/Economics'));
const Hardware = lazy(() => import('./components/Hardware'));
const DeviceManager = lazy(() => import('./components/DeviceManager'));

export type Notification = {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'critical' | 'info';
  timestamp: Date;
  read: boolean;
};

export type Thresholds = {
  maxConsumption: number;
  minProductionDrop: number;
  storageWarning: number;
};

const tabs = [
  { id: 'dashboard', label: 'Monitor',  icon: Activity },
  { id: 'economics', label: 'Rendite',  icon: TrendingUp },
  { id: 'hardware',  label: 'ESP32',    icon: Cpu },
  { id: 'devices',   label: 'Anlagen',  icon: LayoutGrid },
  { id: 'help',      label: 'Hilfe',    icon: HelpCircle },
  { id: 'settings',  label: 'Setup',    icon: SettingsIcon },
] as const;

type TabId = (typeof tabs)[number]['id'];

const TAB_IDS = tabs.map((t) => t.id);
const SWIPE_THRESHOLD = 50;

export default function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [liveMode, setLiveModeState] = useState(false);
  const [hasBattery, setHasBattery] = useState(false);
  const [batteryCapacity, setBatteryCapacity] = useState(5);
  const [haStatus, setHaStatus] = useState<HAStatus>('disconnected');
  const [haData, setHaData] = useState<HAData | null>(null);
  const haClientRef = useRef<HAClient | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MQTTStatus>('disconnected');
  const [mqttData, setMqttData] = useState<HAData | null>(null);
  const mqttClientRef = useRef<MQTTClient | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1);
  const [dbReady, setDbReady] = useState(false);
  // PIN unlock modal (handles both DB encryption and encrypted Gemini key)
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinModalMode, setPinModalMode] = useState<'db' | 'gemini' | 'both'>('gemini');
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [forgotPinConfirm, setForgotPinConfirm] = useState(false);

  // Live electricity prices (aWATTar Germany)
  const [electricityPrices, setElectricityPrices] = useState<MarketPrice[]>([]);

  // Multi-device state – reactive via useLiveQuery
  const liveDevices = useLiveQuery(
    () => db.devices.orderBy('createdAt').toArray(),
    [],
  );
  const devices: BKWDevice[] = liveDevices ?? [];
  const [activeDeviceId, setActiveDeviceId] = useState<string>('default');

  const handleDevicesChange = useCallback((_updated: BKWDevice[]) => {
    // With dexie-react-hooks useLiveQuery, devices update reactively – no manual state update needed.
    // This callback is kept for compatibility with DeviceManager's onDevicesChange prop.
  }, []);

  const handleActiveDeviceChange = useCallback((id: string) => {
    setActiveDeviceId(id);
    saveSetting('active-device', id).catch(() => {});
  }, []);

  const handleLiveModeChange = useCallback((v: boolean) => {
    setLiveMode(v).catch(() => {});
    setLiveModeState(v);
  }, []);

  const handleHaConnect = useCallback(async () => {
    const cfg = await getStoredHAConfig();
    const client = new HAClient(cfg);
    client.onStatusChange = (status, error) => {
      setHaStatus(status);
      if (status === 'connected') toast.success('Home Assistant verbunden');
      if (status === 'error') toast.error('HA Fehler', { description: error });
    };
    client.onDataUpdate = (data) => setHaData(data);
    haClientRef.current?.disconnect();
    haClientRef.current = client;
    client.connect();
  }, []);

  const handleHaDisconnect = useCallback(() => {
    haClientRef.current?.disconnect();
    haClientRef.current = null;
    setHaData(null);
    setHaStatus('disconnected');
  }, []);

  const handleMqttConnect = useCallback(async () => {
    const cfg = await getStoredMQTTConfig();
    const client = new MQTTClient(cfg);
    client.onStatusChange = (status, error) => {
      setMqttStatus(status);
      if (status === 'connected') toast.success('MQTT verbunden');
      if (status === 'error') toast.error('MQTT Fehler', { description: error });
    };
    client.onDataUpdate = (data) => setMqttData(data);
    mqttClientRef.current?.disconnect();
    mqttClientRef.current = client;
    client.connect();
  }, []);

  const handleMqttDisconnect = useCallback(() => {
    mqttClientRef.current?.disconnect();
    mqttClientRef.current = null;
    setMqttData(null);
    setMqttStatus('disconnected');
  }, []);

  // DB migration + initial settings load
  useEffect(() => {
    migrateFromLocalStorage()
      .then(async () => {
        // ── Check DB encryption FIRST – if enabled, show PIN modal before
        // reading encrypted settings (settings would return defaults while locked)
        const { enabled: dbEncEnabled } = await getDbEncryptionStatus();

        const [lm, hasBat, batCap, activeDevice, savedThresholds, cachedPrices] = await Promise.all([
          isLiveMode(),
          getSetting<boolean>('has-battery', false),
          getSetting<number>('battery-capacity', 5),
          getSetting<string>('active-device', 'default'),
          getSetting<Thresholds | null>('thresholds', null),
          getSetting<{ prices: MarketPrice[]; fetchedAt: number } | null>('electricity-prices-cache', null),
        ]);
        setLiveModeState(lm);
        setHasBattery(hasBat);
        setBatteryCapacity(batCap);
        setActiveDeviceId(activeDevice);
        if (savedThresholds) setThresholds(savedThresholds);
        if (cachedPrices?.prices?.length) setElectricityPrices(cachedPrices.prices);

        // Ensure at least the default device exists
        await loadDevices();

        // ── Determine what the PIN modal needs to unlock ──────────────────
        const hasKey = await hasApiKeyStored();
        const geminiEncrypted = hasKey && (await isApiKeyEncrypted());

        if (dbEncEnabled && geminiEncrypted) {
          setPinModalMode('both');
          setShowPinModal(true);
        } else if (dbEncEnabled) {
          setPinModalMode('db');
          setShowPinModal(true);
        } else if (geminiEncrypted) {
          setPinModalMode('gemini');
          setShowPinModal(true);
        } else if (hasKey) {
          await getApiKey(); // warms _keyCache for unencrypted key
        }

        setDbReady(true);
      })
      .catch((err) => {
        console.error('[DB] Migration failed:', err);
        setDbReady(true); // continue even on failure
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Supabase Auth init + Realtime subscription + online-triggered queue flush
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    initSupabaseAuth().catch(() => {});

    const handleOnline = () => { flushSyncQueue().catch(() => {}); };
    window.addEventListener('online', handleOnline);

    const unsub = subscribeToRealtimeSync(
      () => { /* realtime INSERT – useLiveQuery auto-refreshes */ },
      () => { /* realtime UPDATE – useLiveQuery auto-refreshes */ },
    );
    return () => {
      window.removeEventListener('online', handleOnline);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    saveSetting('has-battery', hasBattery).catch(() => {});
    saveSetting('battery-capacity', batteryCapacity).catch(() => {});
  }, [hasBattery, batteryCapacity, dbReady]);

  // Fetch live electricity prices (aWATTar DE) – refresh every 60 min
  useEffect(() => {
    const load = () => {
      fetchElectricityPrices()
        .then(setElectricityPrices)
        .catch(() => { /* stay with cached data if offline */ });
    };
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Update html lang/dir on language change
  useEffect(() => {
    document.documentElement.setAttribute('lang', i18n.language);
    document.documentElement.setAttribute('dir', i18n.dir(i18n.language));
  }, [i18n.language]);
  const mainRef = useRef<HTMLElement>(null);
  const dragX = useMotionValue(0);
  const dragOpacity = useTransform(dragX, [-200, 0, 200], [0.5, 1, 0.5]);

  const [thresholds, setThresholds] = useState<Thresholds>(
    () => ({ maxConsumption: 2000, minProductionDrop: 50, storageWarning: 90 }),
  );

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'System gestartet',
      message: 'Energiemonitor erfolgreich initialisiert.',
      type: 'info',
      timestamp: new Date(),
      read: false,
    },
  ]);

  // Persist thresholds to DB
  useEffect(() => {
    if (!dbReady) return;
    saveSetting('thresholds', thresholds).catch(() => {});
  }, [thresholds, dbReady]);

  // Online/offline tracking
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); toast.success('Verbindung wiederhergestellt'); };
    const goOffline = () => { setIsOnline(false); toast.warning('Keine Internetverbindung'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const handlePinSubmit = async () => {
    try {
      // Unlock DB encryption if needed
      if (pinModalMode === 'db' || pinModalMode === 'both') {
        await unlockDb(pinInput);
        // After DB unlock, reload settings that were encrypted
        const [lm, hasBat, batCap, activeDevice, savedThresholds] = await Promise.all([
          isLiveMode(),
          getSetting<boolean>('has-battery', false),
          getSetting<number>('battery-capacity', 5),
          getSetting<string>('active-device', 'default'),
          getSetting<Thresholds | null>('thresholds', null),
        ]);
        setLiveModeState(lm);
        setHasBattery(hasBat);
        setBatteryCapacity(batCap);
        setActiveDeviceId(activeDevice);
        if (savedThresholds) setThresholds(savedThresholds);
      }
      // Unlock Gemini key if needed
      if (pinModalMode === 'gemini' || pinModalMode === 'both') {
        const key = await getApiKey(pinInput);
        setKeyInCache(key);
      }
      setShowPinModal(false);
      setPinInput('');
      setPinError('');
      setShowForgotPin(false);
      setForgotPinConfirm(false);
      const label = pinModalMode === 'both' ? 'DB + API-Key entsperrt' : pinModalMode === 'db' ? 'Datenbank entsperrt' : 'API-Key entsperrt – KI verfügbar';
      toast.success(`🔓 ${label}`);
    } catch (err) {
      setPinError(err instanceof Error && err.message === 'INVALID_PIN' ? 'Falscher PIN' : 'Fehler beim Entschlüsseln');
    }
  };

  const handleForgotPin = async () => {
    await resetDbAndDeleteAll(); // reloads page
  };

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    setStoredTheme(next);
  }, [theme]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const addNotification = useCallback(
    (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      setNotifications((prev) => [
        { ...notif, id: crypto.randomUUID(), timestamp: new Date(), read: false },
        ...prev.slice(0, 49),
      ]);
      // Also show as toast
      if (notif.type === 'critical') toast.error(notif.title, { description: notif.message });
      else if (notif.type === 'warning') toast.warning(notif.title, { description: notif.message });
      else toast.info(notif.title, { description: notif.message });
    },
    [],
  );

  // Random notification simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.95) {
        addNotification({
          title: 'Hoher Verbrauch erkannt',
          message: `Verbrauch überschreitet ${thresholds.maxConsumption} W.`,
          type: 'warning',
        });
      }
      if (Math.random() > 0.98) {
        addNotification({
          title: 'Produktionsausfall',
          message: 'Solarproduktion stark abgefallen – Wechselrichter prüfen.',
          type: 'critical',
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [thresholds, addNotification]);

  // Swipe navigation handler
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const currentIndex = TAB_IDS.indexOf(activeTab);
    if (info.offset.x < -SWIPE_THRESHOLD && info.velocity.x < -100 && currentIndex < TAB_IDS.length - 1) {
      setSwipeDirection(1);
      setActiveTab(TAB_IDS[currentIndex + 1]);
    } else if (info.offset.x > SWIPE_THRESHOLD && info.velocity.x > 100 && currentIndex > 0) {
      setSwipeDirection(-1);
      setActiveTab(TAB_IDS[currentIndex - 1]);
    }
  };

  // Navigate tab with direction tracking
  const navigateTab = (id: TabId) => {
    const currentIndex = TAB_IDS.indexOf(activeTab);
    const nextIndex = TAB_IDS.indexOf(id);
    setSwipeDirection(nextIndex > currentIndex ? 1 : -1);
    setActiveTab(id);
  };

  const pageVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? '20%' : '-20%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-20%' : '20%', opacity: 0 }),
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-300">
        {/* Offline Banner */}
        {!isOnline && <OfflineBanner />}

        {/* PIN Unlock Modal – handles DB encryption and/or Gemini key */}
        <AnimatePresence>
          {showPinModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-violet-100 dark:bg-violet-900 p-2.5 rounded-xl">
                    <Lock size={20} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {pinModalMode === 'db' ? 'Datenbank entsperren' : pinModalMode === 'both' ? 'App entsperren' : 'API-Key entsperren'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {pinModalMode === 'db' && 'Alle Daten sind AES-256-GCM verschlüsselt'}
                      {pinModalMode === 'both' && 'DB + Gemini Key sind PIN-geschützt'}
                      {pinModalMode === 'gemini' && 'Dein Gemini-Key ist PIN-geschützt'}
                    </p>
                  </div>
                </div>

                {!showForgotPin ? (
                  <>
                    <input
                      autoFocus
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={pinInput}
                      onChange={(e) => { setPinInput(e.target.value); setPinError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                      placeholder="PIN eingeben"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 mb-3"
                    />
                    {pinError && <p className="text-xs text-rose-500 mb-3">{pinError}</p>}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={handlePinSubmit}
                        disabled={!pinInput}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-all"
                      >
                        Entsperren
                      </button>
                      <button
                        onClick={() => { setShowPinModal(false); setPinInput(''); setPinError(''); }}
                        className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                      >
                        Überspringen
                      </button>
                    </div>
                    {/* Forgot PIN link */}
                    <button
                      onClick={() => setShowForgotPin(true)}
                      className="w-full text-xs text-rose-400 hover:text-rose-600 transition-colors text-center py-1"
                    >
                      PIN vergessen?
                    </button>
                  </>
                ) : (
                  /* Forgot PIN – reset confirmation */
                  <div className="space-y-3">
                    <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
                      <p className="text-xs font-bold text-rose-700 dark:text-rose-300 mb-1">⚠️ UNWIDERRUFLICH!</p>
                      <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
                        Alle gespeicherten Daten (Messwerte, Einstellungen, Geräte, Berichte und API-Key) werden <strong>permanent gelöscht</strong>. Die App beginnt von vorne.
                      </p>
                    </div>
                    {!forgotPinConfirm ? (
                      <>
                        <button
                          onClick={() => setForgotPinConfirm(true)}
                          className="w-full py-2.5 rounded-xl text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 transition-all"
                        >
                          Alles löschen – ich verstehe
                        </button>
                        <button
                          onClick={() => setShowForgotPin(false)}
                          className="w-full py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        >
                          Zurück
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-center font-semibold text-rose-600">Letzte Chance – wirklich alles löschen?</p>
                        <button
                          onClick={handleForgotPin}
                          className="w-full py-2.5 rounded-xl text-sm font-bold bg-rose-700 text-white hover:bg-rose-800 transition-all"
                        >
                          ✓ Ja, alles löschen und neu starten
                        </button>
                        <button
                          onClick={() => { setShowForgotPin(false); setForgotPinConfirm(false); }}
                          className="w-full py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        >
                          Abbrechen
                        </button>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sonner Toaster */}
        <Toaster
          position="top-center"
          toastOptions={{
            className: 'text-sm',
            duration: 4000,
          }}
          theme={theme === 'dark' ? 'dark' : 'light'}
          richColors
          closeButton
        />

        {/* Header */}
        <header className="bg-emerald-600 dark:bg-emerald-800 text-white px-4 py-3 shadow-md z-30 flex justify-between items-center">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <motion.span
              animate={{ rotate: [0, -10, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 5 }}
            >
              <Zap className="text-amber-300" size={22} />
            </motion.span>
            BKW Monitor
          </h1>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
          <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label={theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ y: -12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 12, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="block"
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label="Benachrichtigungen öffnen"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-emerald-600 dark:border-emerald-800"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </motion.button>
          </div>
        </header>

        {/* Notifications Panel */}
        <AnimatePresence>
          {showNotifications && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/20 z-35"
                onClick={() => setShowNotifications(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute top-14 right-2 left-2 sm:left-auto sm:w-96 bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 z-40 max-h-[70vh] flex flex-col rounded-2xl overflow-hidden"
              >
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <h2 className="font-semibold text-sm">Benachrichtigungen</h2>
                  <div className="flex gap-3">
                    <button onClick={markAllRead} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                      Alle gelesen
                    </button>
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto p-2 flex-1">
                  {notifications.length === 0 ? (
                    <p className="text-center text-slate-500 text-sm p-4">Keine Benachrichtigungen</p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((notif, i) => (
                        <motion.div
                          key={notif.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`p-3 rounded-lg border text-sm ${
                            notif.read
                              ? 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 opacity-60'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          } ${
                            notif.type === 'critical'
                              ? 'border-l-4 border-l-rose-500'
                              : notif.type === 'warning'
                                ? 'border-l-4 border-l-amber-500'
                                : 'border-l-4 border-l-blue-500'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <h4
                              className={`text-xs font-semibold ${
                                notif.type === 'critical'
                                  ? 'text-rose-600'
                                  : notif.type === 'warning'
                                    ? 'text-amber-600'
                                    : 'text-blue-600'
                              }`}
                            >
                              {notif.title}
                            </h4>
                            <span className="text-[10px] text-slate-400">
                              {notif.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{notif.message}</p>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </> 
          )}
        </AnimatePresence>

        {/* Main – swipeable */}
        <motion.main
          ref={mainRef}
          className="flex-1 overflow-y-auto overflow-x-hidden pb-20 touch-pan-y"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          style={{ x: dragX, opacity: dragOpacity }}
        >
          <AnimatePresence mode="wait" custom={swipeDirection} initial={false}>
            <motion.div
              key={activeTab}
              custom={swipeDirection}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <Suspense fallback={<DashboardSkeleton />}>
                {activeTab === 'dashboard' && <Dashboard liveMode={liveMode} hasBattery={hasBattery} batteryCapacity={batteryCapacity} haData={haData ?? mqttData} thresholds={thresholds} addNotification={addNotification} devices={devices} activeDeviceId={activeDeviceId} onActiveDeviceChange={handleActiveDeviceChange} electricityPrices={electricityPrices} />}
                {activeTab === 'help' && <Help />}
                {activeTab === 'economics' && <Economics />}
                {activeTab === 'hardware' && <Hardware liveMode={liveMode} onLiveModeChange={handleLiveModeChange} />}
                {activeTab === 'devices' && (
                  <DeviceManager
                    devices={devices}
                    activeDeviceId={activeDeviceId}
                    onDevicesChange={handleDevicesChange}
                    onActiveDeviceChange={(id) => {
                      handleActiveDeviceChange(id);
                      navigateTab('dashboard');
                    }}
                  />
                )}
                {activeTab === 'settings' && (
                  <Settings
                    thresholds={thresholds}
                    setThresholds={setThresholds}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    hasBattery={hasBattery}
                    onHasBatteryChange={setHasBattery}
                    batteryCapacity={batteryCapacity}
                    onBatteryCapacityChange={setBatteryCapacity}
                    haStatus={haStatus}
                    onHaConnect={handleHaConnect}
                    onHaDisconnect={handleHaDisconnect}
                    mqttStatus={mqttStatus}
                    onMqttConnect={handleMqttConnect}
                    onMqttDisconnect={handleMqttDisconnect}
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </motion.main>

        {/* Bottom Navigation */}
        <nav
          className="fixed bottom-0 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 z-20 safe-area-pb"
          role="navigation"
          aria-label="Hauptnavigation"
        >
          <div className="flex justify-around items-center h-16 max-w-lg mx-auto relative">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => navigateTab(tab.id)}
                  whileTap={{ scale: 0.85 }}
                  className={`relative flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
                  }`}
                  aria-label={tab.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-600 dark:bg-emerald-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <motion.span
                    animate={isActive ? { y: -2 } : { y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <Icon size={22} />
                  </motion.span>
                  <span className="text-[10px] font-medium uppercase tracking-wider">{t(`nav.${tab.id}`)}</span>
                </motion.button>
              );
            })}
          </div>
        </nav>
      </div>
    </ErrorBoundary>
  );
}
