import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Bar, BarChart,
} from 'recharts';
import { Zap, Sun, ArrowDownToLine, ArrowUpFromLine, Clock, TrendingUp, Sparkles, Leaf, Euro, Loader2, CloudSun, CalendarDays, AlertTriangle, Battery, BatteryCharging, FileDown, PlugZap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import type { Thresholds, Notification } from '../App';
import {
  simulateCurrentSolar, simulateCurrentConsumption,
  calculateCO2, simulateBattery, generateDataForDevice, aggregateDevicesData,
  type TimeRange, type EnergyDataPoint,
} from '../lib/simulation';
import type { BKWDevice } from '../lib/deviceStore';
const ReportModal = lazy(() => import('./ReportModal'));
import { analyzeEnergyData, forecastEnergyData, hasApiKey, type ForecastInput, type DayForecast } from '../lib/gemini';
import { fetchWeatherForecast, getWeatherCache, weatherToSolar, WeatherRateLimitError, type WeatherForecast } from '../lib/weather';
import { fetchEsp32Data, getEsp32Url } from '../lib/esp32';
import type { HAData } from '../lib/ha';
import {
  type MarketPrice, getCurrentPrice, getPriceLevel, getRetailEstimate,
  PRICE_LEVEL_COLORS, PRICE_LEVEL_BG, PRICE_LEVEL_LABEL,
} from '../lib/electricity';
import { checkAlerts } from '../lib/push';

interface DashboardProps {
  thresholds: Thresholds;
  addNotification: (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  liveMode: boolean;
  hasBattery?: boolean;
  batteryCapacity?: number;
  haData?: HAData | null;
  devices: BKWDevice[];
  activeDeviceId: string;
  onActiveDeviceChange: (id: string) => void;
  /** Live electricity prices from aWATTar (passed from App) */
  electricityPrices?: MarketPrice[];
}

const RANGES_KEYS: Array<{ key: TimeRange }> = [
  { key: 'daily' }, { key: 'weekly' }, { key: 'monthly' },
];

export default function Dashboard({ thresholds, addNotification, liveMode, hasBattery = false, batteryCapacity = 5, haData, devices, activeDeviceId, onActiveDeviceChange, electricityPrices = [] }: DashboardProps) {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState<TimeRange>(() =>
    (localStorage.getItem('bkw-timerange') as TimeRange) || 'daily',
  );
  const [data, setData] = useState<EnergyDataPoint[]>(() =>
    activeDeviceId === 'all'
      ? aggregateDevicesData(timeRange, devices.map((d) => d.id))
      : generateDataForDevice(timeRange, activeDeviceId),
  );
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

  // Live mode error
  const [liveError, setLiveError] = useState<string | null>(null);
  const [batteryPct, setBatteryPct] = useState(50);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showPriceChart, setShowPriceChart] = useState(false);

  // Derived electricity price state
  const currentPrice = useMemo(() => getCurrentPrice(electricityPrices), [electricityPrices]);
  const priceLevel   = useMemo(
    () => (currentPrice ? getPriceLevel(currentPrice.priceCtKwh) : null),
    [currentPrice],
  );
  const retailEstimate = useMemo(
    () => (currentPrice ? getRetailEstimate(currentPrice.priceEurKwh) : null),
    [currentPrice],
  );

  useEffect(() => {
    localStorage.setItem('bkw-timerange', timeRange);
    setData(
      activeDeviceId === 'all'
        ? aggregateDevicesData(timeRange, devices.map((d) => d.id))
        : generateDataForDevice(timeRange, activeDeviceId),
    );
  }, [timeRange, activeDeviceId, devices]);

  // Live simulation OR real ESP32 polling (skipped if haData present)
  useEffect(() => {
    if (haData) return; // HA overrides all local data
    if (!liveMode) {
      const interval = setInterval(() => {
        setCurrentSolar((prev) => {
          const next = simulateCurrentSolar(prev);
          if (hasBattery) setBatteryPct((b) => simulateBattery(b, next, 310, batteryCapacity));
          return next;
        });
        setCurrentConsumption((prev) => simulateCurrentConsumption(prev));
      }, 3000);
      return () => clearInterval(interval);
    } else {
      let active = true;
      const poll = async () => {
        try {
          const d = await fetchEsp32Data(getEsp32Url());
          if (active) {
            setCurrentSolar(d.solar_w);
            setCurrentConsumption(d.consumption_w);
            if (d.battery_pct != null) setBatteryPct(d.battery_pct);
            setLiveError(null);
          }
        } catch (err) {
          if (active) setLiveError(err instanceof Error ? err.message : 'ESP32 nicht erreichbar');
        }
      };
      poll();
      const interval = setInterval(poll, 5000);
      return () => { active = false; clearInterval(interval); };
    }
  }, [liveMode, haData, hasBattery, batteryCapacity]);

  // Sync HA data into current readings
  useEffect(() => {
    if (!haData) return;
    setCurrentSolar(haData.solarW);
    setCurrentConsumption(haData.loadW);
    if (haData.batteryPct != null) setBatteryPct(haData.batteryPct);
  }, [haData]);

  const gridExchange = currentSolar - currentConsumption;
  const isFeedingGrid = gridExchange > 0;

  const metrics = useMemo(() => {
    const totalSolar = data.reduce((s, d) => s + d.solar, 0);
    const totalConsumption = data.reduce((s, d) => s + d.consumption, 0);
    const selfConsumed = data.reduce((s, d) => s + Math.min(d.solar, d.consumption), 0);
    const peakSolar = Math.max(...data.map((d) => d.solar), 0);
    const peakConsumption = Math.max(...data.map((d) => d.consumption), 0);
    const peakTime = data.find((d) => d.consumption === peakConsumption)?.time ?? '';
    const solarKwh = totalSolar / 1000;
    const selfSufficiency = totalConsumption > 0 ? Math.min(100, Math.round((selfConsumed / totalConsumption) * 100)) : 0;
    // Use live retail estimate if available, otherwise fixed 0.30 €/kWh fallback
    const pricePerKwh = retailEstimate ?? 0.30;
    const savings = (solarKwh * pricePerKwh).toFixed(2);

    return {
      totalSolar: solarKwh.toFixed(1),
      totalConsumption: (totalConsumption / 1000).toFixed(1),
      selfSufficiency,
      savings,
      co2: calculateCO2(solarKwh).toFixed(1),
      peakConsumption,
      peakSolar,
      peakTime,
    };
  }, [data, retailEstimate]);

  // Periodic push alert checks
  useEffect(() => {
    const interval = setInterval(() => {
      checkAlerts({
        currentSolarW: currentSolar,
        selfSufficiency: metrics.selfSufficiency,
        peakSolarW: metrics.peakSolar,
        spotPriceCtKwh: currentPrice?.priceCtKwh ?? null,
        amortizationReached: false,
        daysToAmortization: null,
      }).catch(() => { /* ignore if notifications unavailable */ });
    }, 60_000);
    return () => clearInterval(interval);
  }, [currentSolar, metrics.selfSufficiency, metrics.peakSolar, currentPrice]);

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
      {/* Device Switcher */}
      {devices.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          <button
            onClick={() => onActiveDeviceChange('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              activeDeviceId === 'all'
                ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {t('devices.allTitle')}
          </button>
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => onActiveDeviceChange(d.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                activeDeviceId === d.id
                  ? 'text-white border-transparent'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
              style={activeDeviceId === d.id ? { backgroundColor: d.color, borderColor: d.color } : {}}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              {d.name}
            </button>
          ))}
        </div>
      )}
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
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            {t('dashboard.generation')}
            {liveMode && (
              <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full ml-1">
                {t('dashboard.liveTag')}
              </span>
            )}
          </span>
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
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('dashboard.consumption')}</span>
          <span className="text-2xl font-light">
            {Math.round(currentConsumption)}
            <span className="text-sm text-slate-400 ml-1">W</span>
          </span>
        </motion.div>
      </div>

      {/* Live mode error banner */}
      <AnimatePresence>
        {liveMode && liveError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 flex items-start gap-2 overflow-hidden"
          >
            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">ESP32 nicht erreichbar</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{liveError}</p>
              <p className="text-[10px] text-slate-400 mt-1">Wechsle im Hardware-Tab zurück zu Simulation oder überprüfe die Verbindung.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              {isFeedingGrid ? t('dashboard.feedIn') : t('dashboard.gridDraw')}
            </h3>
            <p className={`text-xl font-medium ${isFeedingGrid ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'}`}>
              {Math.abs(Math.round(gridExchange))} W
            </p>
          </div>
        </div>
        {/* Inline price badge */}
        {currentPrice && priceLevel && (
          <div className={`px-3 py-2 rounded-xl text-center ${PRICE_LEVEL_BG[priceLevel]}`}>
            <p className={`text-base font-bold ${PRICE_LEVEL_COLORS[priceLevel]}`}>
              {currentPrice.priceCtKwh.toFixed(1)} ct
            </p>
            <p className="text-[9px] text-slate-500 uppercase">Spotpreis</p>
          </div>
        )}
      </motion.div>

      {/* Live Electricity Price Card */}
      <AnimatePresence>
        {currentPrice && priceLevel && retailEstimate !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={`rounded-2xl p-4 border shadow-sm ${PRICE_LEVEL_BG[priceLevel]} border-transparent`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/60 dark:bg-slate-800/60 flex items-center justify-center">
                    <PlugZap size={20} className={PRICE_LEVEL_COLORS[priceLevel]} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Live Strompreis (EPEX Spot)
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-2xl font-bold ${PRICE_LEVEL_COLORS[priceLevel]}`}>
                        {currentPrice.priceCtKwh.toFixed(2)} ct/kWh
                      </span>
                      <span className="text-xs text-slate-500">
                        Spotpreis · Handel: {(retailEstimate * 100).toFixed(1)} ct/kWh
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full bg-white/50 dark:bg-slate-800/50 ${PRICE_LEVEL_COLORS[priceLevel]}`}>
                    {PRICE_LEVEL_LABEL[priceLevel]}
                  </span>
                  <button
                    onClick={() => setShowPriceChart((p) => !p)}
                    className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2"
                  >
                    {showPriceChart ? 'Chart ausblenden' : '24-h-Chart'}
                  </button>
                </div>
              </div>

              {/* 24-h price chart */}
              <AnimatePresence>
                {showPriceChart && electricityPrices.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-3"
                  >
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                      Heute & morgen – Spotpreise (ct/kWh)
                    </p>
                    <div className="h-24 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={electricityPrices.map((p) => ({
                            hour: new Date(p.startTimestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
                            price: parseFloat(p.priceCtKwh.toFixed(2)),
                            isCurrent: p.startTimestamp <= Date.now() && p.endTimestamp > Date.now(),
                          }))}
                          margin={{ top: 2, right: 2, left: -28, bottom: 0 }}
                          barSize={8}
                        >
                          <XAxis
                            dataKey="hour"
                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                            tickLine={false}
                            axisLine={false}
                            interval={3}
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #e2e8f0' }}
                            formatter={(v: number) => [`${v} ct/kWh`, 'Spotpreis']}
                            labelFormatter={(l) => `${l} Uhr`}
                          />
                          <Bar
                            dataKey="price"
                            radius={[3, 3, 0, 0]}
                            fill="#f59e0b"
                            label={false}
                          />
                          <ReferenceLine
                            y={currentPrice.priceCtKwh}
                            stroke="#ef4444"
                            strokeDasharray="3 3"
                            label={{ position: 'insideTopRight', value: 'jetzt', fill: '#ef4444', fontSize: 9 }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed-in / savings banner */}
      <AnimatePresence>
        {currentPrice && priceLevel && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-2xl p-4 border flex items-center gap-3 ${
              priceLevel === 'very-high' || priceLevel === 'high'
                ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700'
                : priceLevel === 'very-low'
                ? 'bg-sky-50 dark:bg-sky-950 border-sky-300 dark:border-sky-700'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="text-2xl leading-none flex-shrink-0">
              {priceLevel === 'very-high' || priceLevel === 'high' ? '💰' : priceLevel === 'very-low' ? '🔌' : '📊'}
            </span>
            <div>
              {(priceLevel === 'very-high' || priceLevel === 'high') && (
                <>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                    {isFeedingGrid ? 'Jetzt lohnt sich Einspeisung!' : 'Strompreis-Spitze – Eigenverbrauch maximieren!'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {isFeedingGrid
                      ? `Spotpreis ${currentPrice.priceCtKwh.toFixed(1)} ct/kWh – deine Einspeisung ist jetzt besonders wertvoll.`
                      : `Spotpreis ${currentPrice.priceCtKwh.toFixed(1)} ct/kWh – Großverbraucher wenn möglich verschieben.`}
                  </p>
                </>
              )}
              {priceLevel === 'very-low' && (
                <>
                  <p className="text-sm font-bold text-sky-800 dark:text-sky-200">
                    Günstiger Strom – guter Zeitpunkt für hohen Verbrauch
                  </p>
                  <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">
                    Spotpreis {currentPrice.priceCtKwh.toFixed(1)} ct/kWh – Waschmaschine, Laden, Spülmaschine jetzt!
                  </p>
                </>
              )}
              {(priceLevel === 'low' || priceLevel === 'medium') && (
                <>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Normales Preisniveau
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Spotpreis {currentPrice.priceCtKwh.toFixed(1)} ct/kWh · Handel~{(retailEstimate! * 100).toFixed(1)} ct / kWh
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CO₂ & € Savings Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-center">
          <Leaf className="mx-auto text-emerald-500 mb-1" size={18} />
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{metrics.co2} kg</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('dashboard.co2')}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-center">
          <Euro className="mx-auto text-amber-500 mb-1" size={18} />
          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{metrics.savings} €</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('dashboard.savings')}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-center">
          <TrendingUp className="mx-auto text-blue-500 mb-1" size={18} />
          <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{metrics.selfSufficiency}%</p>
          <p className="text-[10px] text-slate-500 uppercase">{t('dashboard.autarky')}</p>
        </div>
      </div>

      {/* Battery Card – only when hasBattery */}
      <AnimatePresence>
        {hasBattery && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {currentSolar > currentConsumption
                  ? <BatteryCharging size={18} className="text-emerald-500" />
                  : <Battery size={18} className="text-amber-500" />}
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">{t('dashboard.battery')}</span>
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{Math.round(batteryPct)} %</span>
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  batteryPct > 60 ? 'bg-emerald-500' : batteryPct > 25 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                animate={{ width: `${batteryPct}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>0%</span><span>{batteryCapacity} kWh</span><span>100%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="text-emerald-600" size={18} />
            {t('dashboard.history')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <FileDown size={13} />
              {t('report.csvTitle')}
            </button>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full sm:w-auto">
            {RANGES_KEYS.map((r) => (
              <button
                key={r.key}
                onClick={() => setTimeRange(r.key)}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timeRange === r.key
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t(`dashboard.${r.key === 'daily' ? 'day' : r.key === 'weekly' ? 'week' : 'month'}`)}
              </button>
            ))}
          </div>
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
          {timeRange === 'daily' ? t('dashboard.dailyBalance') : timeRange === 'weekly' ? t('dashboard.weeklyBalance') : t('dashboard.monthlyBalance')}
        </h3>
        <div className="grid grid-cols-3 gap-3 text-center divide-x divide-slate-700">
          <div>
            <p className="text-[10px] text-slate-400 mb-1">{t('dashboard.generated')}</p>
            <p className="text-xl font-bold text-amber-400">
              {metrics.totalSolar} <span className="text-xs font-normal text-amber-300/60">kWh</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1">{t('dashboard.consumed')}</p>
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
          <span className="hidden xs:inline">{aiLoading ? t('dashboard.aiAnalyzing') : t('dashboard.aiAnalysis')}</span>
          <span className="xs:hidden">{aiLoading ? '…' : t('dashboard.aiAnalysis')}</span>
        </button>
        <button
          onClick={handleForecast}
          disabled={forecastLoading || aiLoading}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm transition-all bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white shadow-md disabled:opacity-60"
        >
          {forecastLoading ? <Loader2 size={16} className="animate-spin" /> : <CloudSun size={16} />}
          <span>{forecastLoading ? t('dashboard.forecastLoading') : t('dashboard.forecast')}</span>
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

      {/* Report Modal */}
      <Suspense fallback={null}>
        {showReportModal && (
          <ReportModal
            data={data}
            deviceName={
              activeDeviceId === 'all'
                ? t('devices.allTitle')
                : (devices.find((d) => d.id === activeDeviceId)?.name ?? 'Anlage')
            }
            deviceId={activeDeviceId === 'all' ? 'default' : activeDeviceId}
            onClose={() => setShowReportModal(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
