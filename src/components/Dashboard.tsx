import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Zap, Sun, ArrowDownToLine, ArrowUpFromLine, Clock, TrendingUp, Sparkles, Leaf, Euro, Loader2, CloudSun, CalendarDays } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import type { Thresholds, Notification } from '../App';
import {
  generateData, simulateCurrentSolar, simulateCurrentConsumption,
  calculateSavings, calculateCO2, type TimeRange, type EnergyDataPoint,
} from '../lib/simulation';
import { analyzeEnergyData, forecastEnergyData, hasApiKey, type ForecastInput, type DayForecast } from '../lib/gemini';
import { fetchWeatherForecast, getWeatherCache, weatherToSolar, WeatherRateLimitError, type WeatherForecast } from '../lib/weather';

interface DashboardProps {
  thresholds: Thresholds;
  addNotification: (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
}

const RANGES: { key: TimeRange; label: string }[] = [
  { key: 'daily', label: 'Tag' },
  { key: 'weekly', label: 'Woche' },
  { key: 'monthly', label: 'Monat' },
];

export default function Dashboard({ thresholds, addNotification }: DashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(() =>
    (localStorage.getItem('bkw-timerange') as TimeRange) || 'daily',
  );
  const [data, setData] = useState<EnergyDataPoint[]>(() => generateData(timeRange));
  const [currentSolar, setCurrentSolar] = useState(420);
  const [currentConsumption, setCurrentConsumption] = useState(310);

  // AI state
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAi, setShowAi] = useState(false);

  // Forecast state
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastText, setForecastText] = useState('');
  const [showForecast, setShowForecast] = useState(false);
  const [weatherCacheAge, setWeatherCacheAge] = useState<number | null>(null);
  const [rateLimitWarning, setRateLimitWarning] = useState('');
  const [forecastDays, setForecastDays] = useState<DayForecast[] | null>(null);

  useEffect(() => {
    localStorage.setItem('bkw-timerange', timeRange);
    setData(generateData(timeRange));
  }, [timeRange]);

  // Live simulation every 3s
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSolar((prev) => simulateCurrentSolar(prev));
      setCurrentConsumption((prev) => simulateCurrentConsumption(prev));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const gridExchange = currentSolar - currentConsumption;
  const isFeedingGrid = gridExchange > 0;

  const metrics = useMemo(() => {
    const totalSolar = data.reduce((s, d) => s + d.solar, 0);
    const totalConsumption = data.reduce((s, d) => s + d.consumption, 0);
    const selfConsumed = data.reduce((s, d) => s + Math.min(d.solar, d.consumption), 0);
    const peakConsumption = Math.max(...data.map((d) => d.consumption));
    const peakTime = data.find((d) => d.consumption === peakConsumption)?.time ?? '';
    const solarKwh = totalSolar / 1000;
    const selfSufficiency = totalConsumption > 0 ? Math.min(100, Math.round((selfConsumed / totalConsumption) * 100)) : 0;

    return {
      totalSolar: solarKwh.toFixed(1),
      totalConsumption: (totalConsumption / 1000).toFixed(1),
      selfSufficiency,
      savings: calculateSavings(solarKwh).toFixed(2),
      co2: calculateCO2(solarKwh).toFixed(1),
      peakConsumption,
      peakTime,
    };
  }, [data]);

  // Merge weather forecast into chart data as dashed overlay (daily view only)
  const forecastChartData = useMemo(() => {
    if (!weatherForecast || timeRange !== 'daily') {
      return data.map(d => ({ ...d, forecastSolar: undefined as number | undefined }));
    }
    const nowHour = new Date().getHours();
    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
    return data.map(point => {
      const hour = parseInt(point.time, 10); // "14:00" → 14
      if (hour < nowHour) return { ...point, forecastSolar: undefined as number | undefined };
      const isoKey = `${todayStr}T${String(hour).padStart(2, '0')}:00`;
      const wh = weatherForecast.hours.find(h => h.time === isoKey);
      return {
        ...point,
        forecastSolar: wh != null ? weatherToSolar(wh.radiation, wh.cloudCover) : (undefined as number | undefined),
      };
    });
  }, [data, weatherForecast, timeRange]);

  const handleAiAnalysis = useCallback(async () => {
    if (!hasApiKey()) {
      setAiResponse('⚠️ Bitte gib deinen Gemini API-Key in den **Settings** ein, um die KI-Analyse zu nutzen.');
      setShowAi(true);
      return;
    }
    setAiLoading(true);
    setShowAi(true);
    setAiResponse('');
    try {
      const result = await analyzeEnergyData({
        zeitraum: timeRange === 'daily' ? 'Heute' : timeRange === 'weekly' ? 'Diese Woche' : 'Dieser Monat',
        aktuelleErzeugung: Math.round(currentSolar),
        aktuellerVerbrauch: Math.round(currentConsumption),
        gesamtErzeugungKwh: metrics.totalSolar,
        gesamtVerbrauchKwh: metrics.totalConsumption,
        autarkieGrad: metrics.selfSufficiency,
        ersparnisEuro: metrics.savings,
        co2EinsparungKg: metrics.co2,
        spitzenlast: metrics.peakConsumption,
        spitzenlastZeit: metrics.peakTime,
        verlauf: data.slice(-12),
      });
      setAiResponse(result);
    } catch (err) {
      setAiResponse(`❌ Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
    } finally {
      setAiLoading(false);
    }
  }, [timeRange, currentSolar, currentConsumption, metrics, data]);

  const handleForecast = useCallback(async () => {
    if (!hasApiKey()) {
      setForecastText('⚠️ Bitte Gemini API-Key in den **Settings** eingeben, um die Prognose zu nutzen.');
      setShowForecast(true);
      return;
    }
    setForecastLoading(true);
    setShowForecast(true);
    setForecastText('');
    setRateLimitWarning('');

    let weather: WeatherForecast | null = null;
    try {
      weather = await fetchWeatherForecast();
    } catch (err) {
      if (err instanceof WeatherRateLimitError) {
        setRateLimitWarning(err.message);
        weather = getWeatherCache();
      } else {
        setForecastText(`❌ Wetter-Fehler: ${err instanceof Error ? err.message : String(err)}`);
        setForecastLoading(false);
        return;
      }
    }

    if (!weather) {
      setForecastLoading(false);
      return;
    }

    setWeatherForecast(weather);
    const ageMin = Math.round((Date.now() - weather.fetchedAt) / 60000);
    setWeatherCacheAge(ageMin > 0 ? ageMin : null);

    // Build per-day summary for Gemini prompt + 7-day chart
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const maxVal = (arr: number[]) =>
      arr.length ? Math.round(Math.max(...arr)) : 0;
    const sumVal = (arr: number[]) =>
      parseFloat(arr.reduce((a, b) => a + b, 0).toFixed(1));

    const days: DayForecast[] = Array.from({ length: 7 }, (_, d) => {
      const dateStr = new Date(Date.now() + d * 86400000).toLocaleDateString('sv-SE');
      const dayHours = weather!.hours.filter(h => h.time.startsWith(dateStr));
      const daylightHours = dayHours.filter(h => {
        const hr = parseInt(h.time.split('T')[1]?.split(':')[0] ?? '0', 10);
        return hr >= 6 && hr <= 20;
      });
      const estimatedKwh =
        Math.round(daylightHours.reduce((acc, h) => acc + weatherToSolar(h.radiation, h.cloudCover) / 1000, 0) * 10) / 10;
      const label =
        d === 0
          ? 'Heute'
          : d === 1
            ? 'Morgen'
            : new Date(Date.now() + d * 86400000).toLocaleDateString('de-DE', { weekday: 'short' });
      return {
        datum: label,
        avgCloudCover: avg(dayHours.map(h => h.cloudCover)),
        maxRadiationWm2: maxVal(dayHours.map(h => h.radiation)),
        totalPrecipMm: sumVal(dayHours.map(h => h.precipitation)),
        estimatedKwh,
      };
    });
    setForecastDays(days);

    try {
      const input: ForecastInput = {
        aktuelleErzeugungW: Math.round(currentSolar),
        aktuellerVerbrauchW: Math.round(currentConsumption),
        heuteKwhBisher: metrics.totalSolar,
        tage: days,
        historischDurchschnittKwh: metrics.totalSolar,
      };
      const text = await forecastEnergyData(input);
      setForecastText(text);
    } catch (err) {
      setForecastText(`❌ KI-Fehler: ${err instanceof Error ? err.message : String(err)}`);
    }
    setForecastLoading(false);
  }, [currentSolar, currentConsumption, metrics]);

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      {/* Live Status Cards */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-500 flex items-center justify-center mb-2">
            <Sun size={22} />
          </div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Erzeugung</span>
          <span className="text-2xl font-light">
            {Math.round(currentSolar)}
            <span className="text-sm text-slate-400 ml-1">W</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-500 flex items-center justify-center mb-2">
            <Zap size={22} />
          </div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Verbrauch</span>
          <span className="text-2xl font-light">
            {Math.round(currentConsumption)}
            <span className="text-sm text-slate-400 ml-1">W</span>
          </span>
        </motion.div>
      </div>

      {/* Grid Status */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl p-5 shadow-sm border flex items-center justify-between transition-colors duration-500 ${
          isFeedingGrid
            ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center shadow-sm ${
              isFeedingGrid ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            }`}
          >
            {isFeedingGrid ? <ArrowUpFromLine size={22} /> : <ArrowDownToLine size={22} />}
          </div>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isFeedingGrid ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {isFeedingGrid ? 'Einspeisung' : 'Netzbezug'}
            </h3>
            <p className={`text-xl font-medium ${isFeedingGrid ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'}`}>
              {Math.abs(Math.round(gridExchange))} W
            </p>
          </div>
        </div>
      </motion.div>

      {/* CO₂ & € Savings Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-center">
          <Leaf className="mx-auto text-emerald-500 mb-1" size={18} />
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{metrics.co2} kg</p>
          <p className="text-[10px] text-slate-500 uppercase">CO₂ gespart</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-center">
          <Euro className="mx-auto text-amber-500 mb-1" size={18} />
          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{metrics.savings} €</p>
          <p className="text-[10px] text-slate-500 uppercase">Ersparnis</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-center">
          <TrendingUp className="mx-auto text-blue-500 mb-1" size={18} />
          <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{metrics.selfSufficiency}%</p>
          <p className="text-[10px] text-slate-500 uppercase">Autarkie</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="text-emerald-600" size={18} />
            Verlauf
          </h3>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full sm:w-auto">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setTimeRange(r.key)}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeRange === r.key
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={forecastChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSolar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gConsumption" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gUnused" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(0,0,0,.1)',
                  fontSize: '13px',
                }}
                formatter={(value: number, name: string) => [`${value} W`, name]}
              />
              <Area type="monotone" dataKey="unused" name="Einspeisung" stroke="none" fill="url(#gUnused)" />
              <Area type="monotone" dataKey="solar" name="Erzeugung" stroke="#f59e0b" strokeWidth={2.5} fill="url(#gSolar)" />
              <Area type="monotone" dataKey="consumption" name="Verbrauch" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gConsumption)" />
              {timeRange === 'daily' && (
                <ReferenceLine
                  y={metrics.peakConsumption}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{ position: 'insideTopLeft', value: 'Spitzenlast', fill: '#ef4444', fontSize: 10 }}
                />
              )}
              {timeRange === 'daily' && weatherForecast && (
                <Line
                  type="monotone"
                  dataKey="forecastSolar"
                  name="Prognose (Wetter)"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                  dot={false}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Clock size={14} />
          {timeRange === 'daily' ? 'Tagesbilanz' : timeRange === 'weekly' ? 'Wochenbilanz' : 'Monatsbilanz'}
        </h3>
        <div className="grid grid-cols-3 gap-3 text-center divide-x divide-slate-700">
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Erzeugt</p>
            <p className="text-xl font-bold text-amber-400">
              {metrics.totalSolar} <span className="text-xs font-normal text-amber-300/60">kWh</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Verbraucht</p>
            <p className="text-xl font-bold text-blue-400">
              {metrics.totalConsumption} <span className="text-xs font-normal text-blue-300/60">kWh</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Autarkie</p>
            <p className="text-xl font-bold text-emerald-400">
              {metrics.selfSufficiency} <span className="text-xs font-normal text-emerald-300/60">%</span>
            </p>
          </div>
        </div>
      </div>

      {/* AI buttons row */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleAiAnalysis}
          disabled={aiLoading || forecastLoading}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm transition-all bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md disabled:opacity-60"
        >
          {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          <span className="hidden xs:inline">{aiLoading ? 'Analysiert…' : 'KI-Analyse'}</span>
          <span className="xs:hidden">{aiLoading ? '…' : 'Analyse'}</span>
        </button>
        <button
          onClick={handleForecast}
          disabled={forecastLoading || aiLoading}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm transition-all bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white shadow-md disabled:opacity-60"
        >
          {forecastLoading ? <Loader2 size={16} className="animate-spin" /> : <CloudSun size={16} />}
          <span>{forecastLoading ? 'Prognose…' : '24h / 7-Tage'}</span>
        </button>
      </div>

      {/* Forecast Response */}
      <AnimatePresence>
        {showForecast && (forecastText || rateLimitWarning) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-sky-200 dark:border-sky-800 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <CloudSun size={16} className="text-sky-500 shrink-0" />
              <h4 className="text-sm font-bold text-sky-700 dark:text-sky-300">Energieprognose</h4>
              {weatherCacheAge !== null && (
                <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full">
                  Wetter {weatherCacheAge} Min. alt
                </span>
              )}
              <button
                onClick={() => setShowForecast(false)}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 shrink-0"
              >
                Schließen
              </button>
            </div>
            {rateLimitWarning && (
              <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-xl mb-3 flex items-start gap-2">
                <span className="mt-0.5">⏱️</span>
                <span>{rateLimitWarning} Wetterdaten aus Cache verwendet.</span>
              </div>
            )}
            {/* 7-day estimated kWh mini-chart */}
            {forecastDays && (
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <CalendarDays size={11} />
                  7-Tage-Schätzung (kWh)
                </p>
                <div className="flex items-end gap-1 h-16">
                  {forecastDays.map(day => {
                    const max = Math.max(...forecastDays.map(d => d.estimatedKwh), 0.1);
                    const pct = (day.estimatedKwh / max) * 100;
                    const isToday = day.datum === 'Heute';
                    return (
                      <div key={day.datum} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                          {day.estimatedKwh}
                        </span>
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            isToday ? 'bg-sky-400 dark:bg-sky-500' : 'bg-sky-200 dark:bg-sky-800'
                          }`}
                          style={{ height: `${Math.max(4, pct * 0.48)}px` }}
                        />
                        <span className={`text-[9px] font-medium ${
                          isToday ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'
                        }`}>
                          {day.datum.slice(0, 2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {forecastText && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown>{forecastText}</ReactMarkdown>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Response */}
      <AnimatePresence>
        {showAi && aiResponse && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-violet-200 dark:border-violet-800 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-violet-500" />
              <h4 className="text-sm font-bold text-violet-700 dark:text-violet-300">Gemini KI-Analyse</h4>
              <button
                onClick={() => setShowAi(false)}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600"
              >
                Schließen
              </button>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{aiResponse}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
