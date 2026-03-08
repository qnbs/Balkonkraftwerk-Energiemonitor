import { useState, useEffect, useCallback } from 'react';
import { Activity, BookOpen, Wrench, Settings as SettingsIcon, Bell, X, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Dashboard from './components/Dashboard';
import Manual from './components/Manual';
import Materials from './components/Materials';
import Settings from './components/Settings';
import { getStoredTheme, setStoredTheme, type Theme } from './lib/theme';

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
  { id: 'settings', label: 'Setup', icon: SettingsIcon },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

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

  useEffect(() => {
    localStorage.setItem('bkw-thresholds', JSON.stringify(thresholds));
  }, [thresholds]);

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
        {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: new Date(),
          read: false,
        },
        ...prev.slice(0, 49),
      ]);
    },
    [],
  );

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

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-300">
      {/* Header */}
      <header className="bg-emerald-600 dark:bg-emerald-800 text-white px-4 py-3 shadow-md z-30 flex justify-between items-center">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Zap className="text-amber-300" size={22} />
          BKW Monitor
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label={theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Benachrichtigungen öffnen"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-emerald-600 dark:border-emerald-800">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Notifications Panel */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-14 right-0 w-full sm:w-96 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 z-40 max-h-[70vh] flex flex-col rounded-b-2xl"
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
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'dashboard' && <Dashboard thresholds={thresholds} addNotification={addNotification} />}
        {activeTab === 'manual' && <Manual />}
        {activeTab === 'materials' && <Materials />}
        {activeTab === 'settings' && (
          <Settings thresholds={thresholds} setThresholds={setThresholds} theme={theme} toggleTheme={toggleTheme} />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-0 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-20 safe-area-pb"
        role="navigation"
        aria-label="Hauptnavigation"
      >
        <div className="flex justify-around items-center h-16 max-w-lg mx-auto relative">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
                <Icon size={22} />
                <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// Re-export Zap used in header
import { Zap } from 'lucide-react';
