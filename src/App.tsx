import { useState, useEffect } from 'react';
import { Activity, BookOpen, Wrench, Settings as SettingsIcon, Bell, X } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Manual from './components/Manual';
import Materials from './components/Materials';
import Settings from './components/Settings';

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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  
  const [thresholds, setThresholds] = useState<Thresholds>({
    maxConsumption: 2000,
    minProductionDrop: 50, // % drop
    storageWarning: 90, // % full
  });

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'System gestartet',
      message: 'Energiemonitor erfolgreich initialisiert.',
      type: 'info',
      timestamp: new Date(),
      read: false
    }
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications(prev => [{
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      read: false
    }, ...prev]);
  };

  // Simulate monitoring for notifications
  useEffect(() => {
    const interval = setInterval(() => {
      // Randomly trigger a high consumption alert for demonstration
      if (Math.random() > 0.95) {
        addNotification({
          title: 'Hoher Verbrauch erkannt',
          message: `Der aktuelle Verbrauch überschreitet den Schwellenwert von ${thresholds.maxConsumption}W.`,
          type: 'warning'
        });
      }
      // Randomly trigger a production drop alert
      if (Math.random() > 0.98) {
        addNotification({
          title: 'Produktionsausfall',
          message: 'Die Solarproduktion ist plötzlich stark abgefallen. Bitte Wechselrichter prüfen.',
          type: 'critical'
        });
      }
      // Randomly trigger storage warning
      if (Math.random() > 0.99) {
        addNotification({
          title: 'Speicherplatz knapp',
          message: `Die SD-Karte ist zu ${thresholds.storageWarning}% voll. Bitte alte Daten sichern.`,
          type: 'warning'
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [thresholds]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 shadow-md z-30 relative flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-tight">
          Balkonkraftwerk Monitor
        </h1>
        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 hover:bg-emerald-700 rounded-full transition-colors"
        >
          <Bell size={24} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-emerald-600">
              {unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* Notifications Panel */}
      {showNotifications && (
        <div className="absolute top-16 right-0 w-full sm:w-96 bg-white shadow-xl border-l border-b border-slate-200 z-40 max-h-[70vh] flex flex-col">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 className="font-semibold text-slate-800">Benachrichtigungen</h2>
            <div className="flex gap-3">
              <button onClick={markAllRead} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                Alle als gelesen markieren
              </button>
              <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto p-2 flex-1">
            {notifications.length === 0 ? (
              <p className="text-center text-slate-500 text-sm p-4">Keine Benachrichtigungen</p>
            ) : (
              <div className="space-y-2">
                {notifications.map(notif => (
                  <div key={notif.id} className={`p-3 rounded-lg border ${notif.read ? 'bg-white border-slate-100 opacity-70' : 'bg-slate-50 border-slate-200'} ${notif.type === 'critical' ? 'border-l-4 border-l-rose-500' : notif.type === 'warning' ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-blue-500'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={`text-sm font-semibold ${notif.type === 'critical' ? 'text-rose-700' : notif.type === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {notif.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{notif.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-20 relative">
        {activeTab === 'dashboard' && <Dashboard thresholds={thresholds} addNotification={addNotification} />}
        {activeTab === 'manual' && <Manual />}
        {activeTab === 'materials' && <Materials />}
        {activeTab === 'settings' && <Settings thresholds={thresholds} setThresholds={setThresholds} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              activeTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Activity size={24} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Monitor</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              activeTab === 'manual' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BookOpen size={24} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Montage</span>
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              activeTab === 'materials' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Wrench size={24} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Material</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              activeTab === 'settings' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <SettingsIcon size={24} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Setup</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
