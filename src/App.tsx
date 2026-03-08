import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Activity, BookOpen, Wrench, Settings as SettingsIcon, Bell, X, Sun, Moon, Zap, TrendingUp, Cpu } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { ErrorBoundary, OfflineBanner } from './components/ui/ErrorBoundary';
import { DashboardSkeleton } from './components/ui/Skeleton';
import { getStoredTheme, setStoredTheme, type Theme } from './lib/theme';
import { isLiveMode, setLiveMode } from './lib/esp32';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Manual = lazy(() => import('./components/Manual'));
const Materials = lazy(() => import('./components/Materials'));
const Settings = lazy(() => import('./components/Settings'));
const Economics = lazy(() => import('./components/Economics'));
const Hardware = lazy(() => import('./components/Hardware'));

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
  { id: 'dashboard', label: 'Monitor', icon: Activity },
  { id: 'manual', label: 'Montage', icon: BookOpen },
  { id: 'materials', label: 'Material', icon: Wrench },
  { id: 'economics', label: 'Rendite', icon: TrendingUp },
  { id: 'hardware', label: 'ESP32', icon: Cpu },
  { id: 'settings', label: 'Setup', icon: SettingsIcon },
] as const;

type TabId = (typeof tabs)[number]['id'];

const TAB_IDS = tabs.map((t) => t.id);
const SWIPE_THRESHOLD = 50;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [liveMode, setLiveModeState] = useState(isLiveMode);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1);

  const handleLiveModeChange = (v: boolean) => {
    setLiveMode(v);
    setLiveModeState(v);
  };
  const mainRef = useRef<HTMLElement>(null);
  const dragX = useMotionValue(0);
  const dragOpacity = useTransform(dragX, [-200, 0, 200], [0.5, 1, 0.5]);

  const [thresholds, setThresholds] = useState<Thresholds>(() => {
    const saved = localStorage.getItem('bkw-thresholds');
    return saved
      ? JSON.parse(saved)
      : { maxConsumption: 2000, minProductionDrop: 50, storageWarning: 90 };
  });

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

  // Persist thresholds
  useEffect(() => {
    localStorage.setItem('bkw-thresholds', JSON.stringify(thresholds));
  }, [thresholds]);

  // Online/offline tracking
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); toast.success('Verbindung wiederhergestellt'); };
    const goOffline = () => { setIsOnline(false); toast.warning('Keine Internetverbindung'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

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
                {activeTab === 'dashboard' && <Dashboard liveMode={liveMode} thresholds={thresholds} addNotification={addNotification} />}
                {activeTab === 'manual' && <Manual />}
                {activeTab === 'materials' && <Materials />}
                {activeTab === 'economics' && <Economics />}
                {activeTab === 'hardware' && <Hardware liveMode={liveMode} onLiveModeChange={handleLiveModeChange} />}
                {activeTab === 'settings' && (
                  <Settings thresholds={thresholds} setThresholds={setThresholds} theme={theme} toggleTheme={toggleTheme} />
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
                  <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
                </motion.button>
              );
            })}
          </div>
        </nav>
      </div>
    </ErrorBoundary>
  );
}
