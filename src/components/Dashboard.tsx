import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Zap, Sun, ArrowDownToLine, ArrowUpFromLine, Battery, Clock, TrendingUp } from 'lucide-react';
import { Thresholds, Notification } from '../App';

interface DashboardProps {
  thresholds: Thresholds;
  addNotification: (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
}

type TimeRange = 'daily' | 'weekly' | 'monthly';

// Mock data generation based on time range
const generateData = (range: TimeRange) => {
  const data = [];
  const now = new Date();
  
  if (range === 'daily') {
    for (let i = 0; i < 24; i++) {
      const hour = i;
      const isDaylight = hour >= 6 && hour <= 20;
      const solar = isDaylight ? Math.max(0, Math.sin((hour - 6) / 14 * Math.PI) * 600 + (Math.random() * 100 - 50)) : 0;
      const consumption = 150 + Math.random() * 200 + (hour >= 18 && hour <= 22 ? 500 : 0) + (hour >= 7 && hour <= 9 ? 300 : 0);
      
      data.push({
        time: `${hour}:00`,
        solar: Math.round(solar),
        consumption: Math.round(consumption),
        unused: Math.max(0, solar - consumption),
        grid: Math.max(0, consumption - solar)
      });
    }
  } else if (range === 'weekly') {
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    for (let i = 0; i < 7; i++) {
      const solar = 2000 + Math.random() * 3000;
      const consumption = 3000 + Math.random() * 2000;
      data.push({
        time: days[i],
        solar: Math.round(solar),
        consumption: Math.round(consumption),
        unused: Math.max(0, solar - consumption),
        grid: Math.max(0, consumption - solar)
      });
    }
  } else {
    for (let i = 1; i <= 30; i += 3) {
      const solar = 2000 + Math.random() * 4000;
      const consumption = 3000 + Math.random() * 2000;
      data.push({
        time: `${i}.`,
        solar: Math.round(solar),
        consumption: Math.round(consumption),
        unused: Math.max(0, solar - consumption),
        grid: Math.max(0, consumption - solar)
      });
    }
  }
  return data;
};

export default function Dashboard({ thresholds, addNotification }: DashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');
  const [data, setData] = useState(generateData('daily'));
  const [currentSolar, setCurrentSolar] = useState(450);
  const [currentConsumption, setCurrentConsumption] = useState(320);

  // Update data when time range changes
  useEffect(() => {
    setData(generateData(timeRange));
  }, [timeRange]);

  // Simulate real-time updates for current values
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSolar(prev => Math.max(0, prev + (Math.random() * 40 - 20)));
      setCurrentConsumption(prev => Math.max(100, prev + (Math.random() * 80 - 40)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const gridExchange = currentSolar - currentConsumption;
  const isFeedingGrid = gridExchange > 0;

  // Calculate metrics for the selected period
  const metrics = useMemo(() => {
    const totalSolar = data.reduce((sum, d) => sum + d.solar, 0);
    const totalConsumption = data.reduce((sum, d) => sum + d.consumption, 0);
    const totalUnused = data.reduce((sum, d) => sum + d.unused, 0);
    
    // Find peak consumption
    const peakConsumption = Math.max(...data.map(d => d.consumption));
    const peakTime = data.find(d => d.consumption === peakConsumption)?.time;

    return {
      totalSolar: timeRange === 'daily' ? (totalSolar / 1000).toFixed(1) : (totalSolar / 1000).toFixed(0),
      totalConsumption: timeRange === 'daily' ? (totalConsumption / 1000).toFixed(1) : (totalConsumption / 1000).toFixed(0),
      selfSufficiency: Math.min(100, Math.round((totalSolar - totalUnused) / totalConsumption * 100)) || 0,
      totalUnused: timeRange === 'daily' ? (totalUnused / 1000).toFixed(1) : (totalUnused / 1000).toFixed(0),
      peakConsumption,
      peakTime
    };
  }, [data, timeRange]);

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto pb-24">
      {/* Status Overview */}
      <div className="grid grid-cols-2 gap-4">
        {/* Solar Production */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full -z-10"></div>
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center mb-3 shadow-inner">
            <Sun size={24} />
          </div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Erzeugung</span>
          <span className="text-3xl font-light text-slate-800">{Math.round(currentSolar)}<span className="text-lg text-slate-400 ml-1">W</span></span>
        </div>

        {/* Consumption */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -z-10"></div>
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center mb-3 shadow-inner">
            <Zap size={24} />
          </div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Verbrauch</span>
          <span className="text-3xl font-light text-slate-800">{Math.round(currentConsumption)}<span className="text-lg text-slate-400 ml-1">W</span></span>
        </div>
      </div>

      {/* Grid Status */}
      <div className={`rounded-2xl p-6 shadow-sm border flex items-center justify-between transition-colors duration-500 ${isFeedingGrid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
        <div className="flex items-center space-x-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm ${isFeedingGrid ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
            {isFeedingGrid ? <ArrowUpFromLine size={24} /> : <ArrowDownToLine size={24} />}
          </div>
          <div>
            <h3 className={`text-sm font-bold uppercase tracking-wider ${isFeedingGrid ? 'text-emerald-800' : 'text-rose-800'}`}>
              {isFeedingGrid ? 'Einspeisung' : 'Netzbezug'}
            </h3>
            <p className={`text-2xl font-medium ${isFeedingGrid ? 'text-emerald-900' : 'text-rose-900'}`}>
              {Math.abs(Math.round(gridExchange))} W
            </p>
          </div>
        </div>
        {isFeedingGrid && (
          <div className="hidden sm:block text-right">
            <span className="text-xs font-semibold text-emerald-600 uppercase bg-emerald-100 px-2 py-1 rounded-full">
              Überschuss
            </span>
          </div>
        )}
      </div>

      {/* Chart Section */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="text-emerald-600" size={20} />
            Verlauf & Analyse
          </h3>
          
          {/* Time Range Selector */}
          <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
            <button 
              onClick={() => setTimeRange('daily')}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeRange === 'daily' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tag
            </button>
            <button 
              onClick={() => setTimeRange('weekly')}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeRange === 'weekly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Woche
            </button>
            <button 
              onClick={() => setTimeRange('monthly')}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeRange === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Monat
            </button>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSolar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorConsumption" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorUnused" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                formatter={(value: number, name: string) => [`${value} W`, name]}
              />
              
              {/* Highlight Unused Energy */}
              <Area type="monotone" dataKey="unused" name="Ungenutzt (Einspeisung)" stroke="none" fill="url(#colorUnused)" />
              
              <Area type="monotone" dataKey="solar" name="Erzeugung" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorSolar)" />
              <Area type="monotone" dataKey="consumption" name="Verbrauch" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorConsumption)" />
              
              {/* Peak Load Reference Line */}
              {timeRange === 'daily' && (
                <ReferenceLine 
                  y={metrics.peakConsumption} 
                  stroke="#ef4444" 
                  strokeDasharray="3 3" 
                  label={{ position: 'insideTopLeft', value: 'Spitzenlast', fill: '#ef4444', fontSize: 10 }} 
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-start gap-3">
            <div className="bg-rose-100 p-2 rounded-lg text-rose-600 mt-1">
              <Zap size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Spitzenlast</h4>
              <p className="text-xs text-slate-500 mt-1">
                Maximaler Verbrauch von <strong className="text-slate-700">{metrics.peakConsumption} W</strong> um {metrics.peakTime} Uhr.
              </p>
            </div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-start gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 mt-1">
              <Sun size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Ungenutzte Energie</h4>
              <p className="text-xs text-slate-500 mt-1">
                <strong className="text-emerald-700">{metrics.totalUnused} kWh</strong> wurden in diesem Zeitraum ins Netz eingespeist.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-800 rounded-bl-full -z-10 opacity-50"></div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Clock size={16} />
          {timeRange === 'daily' ? 'Tagesbilanz' : timeRange === 'weekly' ? 'Wochenbilanz' : 'Monatsbilanz'}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center divide-x divide-slate-700">
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Erzeugt</p>
            <p className="text-2xl font-bold text-amber-400">{metrics.totalSolar} <span className="text-sm font-normal text-amber-200/70">kWh</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Verbraucht</p>
            <p className="text-2xl font-bold text-blue-400">{metrics.totalConsumption} <span className="text-sm font-normal text-blue-200/70">kWh</span></p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Autarkie</p>
            <p className="text-2xl font-bold text-emerald-400">{metrics.selfSufficiency} <span className="text-sm font-normal text-emerald-200/70">%</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
