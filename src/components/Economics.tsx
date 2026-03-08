import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, Leaf, Euro, Download, Calculator, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

interface EconomicsParams {
  investment: number;
  annualKwh: number;
  electricityPrice: number;
  priceIncrease: number;
  systemYears: number;
}

const DEFAULTS: EconomicsParams = {
  investment: 470,
  annualKwh: 365,
  electricityPrice: 0.30,
  priceIncrease: 2.5,
  systemYears: 20,
};

const CO2_PER_KWH = 0.4; // kg CO₂/kWh (Deutscher Strommix 2024)

const inputClass =
  'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full';

export default function Economics() {
  const [params, setParams] = useState<EconomicsParams>(() => {
    try {
      const saved = localStorage.getItem('bkw-economics');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    localStorage.setItem('bkw-economics', JSON.stringify(params));
  }, [params]);

  function setNum<K extends keyof EconomicsParams>(key: K, raw: string) {
    const value = parseFloat(raw);
    if (!isNaN(value) && value > 0) setParams(prev => ({ ...prev, [key]: value }));
  }

  const { projectionData, breakEvenYear, totalNetGain, totalCo2Saved } = useMemo(() => {
    const years = Math.max(5, Math.min(Math.round(params.systemYears), 25));
    let cumSavings = 0;
    let cumCo2 = 0;
    let bey: number | null = null;

    const data = Array.from({ length: years + 1 }, (_, i) => {
      if (i === 0) {
        return {
          year: '0',
          netBalance: -Math.round(params.investment),
          co2Saved: 0,
          annualSavings: 0,
          cumCostWithout: 0,
          cumCostWith: Math.round(params.investment),
        };
      }
      const price = params.electricityPrice * Math.pow(1 + params.priceIncrease / 100, i - 1);
      const annualSavings = params.annualKwh * price;
      cumSavings += annualSavings;
      cumCo2 += (params.annualKwh * CO2_PER_KWH) / 1000; // tonnes
      const netBalance = cumSavings - params.investment;
      if (bey === null && netBalance >= 0) bey = i;

      return {
        year: `${i}`,
        netBalance: Math.round(netBalance * 100) / 100,
        co2Saved: Math.round(cumCo2 * 100) / 100,
        annualSavings: Math.round(annualSavings * 100) / 100,
        cumCostWithout: Math.round(cumSavings * 100) / 100,
        cumCostWith: Math.round(params.investment),
      };
    });

    return {
      projectionData: data,
      breakEvenYear: bey,
      totalNetGain: Math.round((cumSavings - params.investment) * 100) / 100,
      totalCo2Saved: Math.round(cumCo2 * 10) / 10,
    };
  }, [params]);

  function exportData() {
    const blob = new Blob(
      [JSON.stringify({ params, projectionData, breakEvenYear, totalNetGain, totalCo2Saved }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bkw-wirtschaftlichkeit.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const tooltipStyle = {
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0,0,0,.1)',
    fontSize: '13px',
  };

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Wirtschaftlichkeit</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Amortisationsrechner &amp; 20-Jahres-Projektion</p>
        </div>
        <button
          onClick={exportData}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700"
        >
          <Download size={13} />
          JSON
        </button>
      </div>

      {/* Input Parameters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Calculator size={14} />
          Parameter
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Investition (€)</span>
            <input
              type="number"
              value={params.investment}
              onChange={e => setNum('investment', e.target.value)}
              min="1"
              step="10"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Jahresertrag (kWh)</span>
            <input
              type="number"
              value={params.annualKwh}
              onChange={e => setNum('annualKwh', e.target.value)}
              min="1"
              step="10"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Strompreis (€/kWh)</span>
            <input
              type="number"
              value={params.electricityPrice}
              onChange={e => setNum('electricityPrice', e.target.value)}
              min="0.01"
              step="0.01"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Preissteigerung (%/Jahr)</span>
            <input
              type="number"
              value={params.priceIncrease}
              onChange={e => setNum('priceIncrease', e.target.value)}
              min="0"
              max="20"
              step="0.5"
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-4">
          <label className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Betrachtungszeitraum</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{params.systemYears} Jahre</span>
            </div>
            <input
              type="range"
              value={params.systemYears}
              onChange={e => setParams(prev => ({ ...prev, systemYears: parseInt(e.target.value) }))}
              min="5"
              max="25"
              step="1"
              className="accent-emerald-500 w-full"
            />
          </label>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: Euro,
            color: 'text-emerald-500',
            label: 'Amortisation',
            value: breakEvenYear !== null ? `${breakEvenYear} J.` : '>25 J.',
            delay: 0.05,
          },
          {
            icon: TrendingUp,
            color: 'text-blue-500',
            label: 'Gesamtgewinn',
            value: `${totalNetGain > 0 ? '+' : ''}${totalNetGain} €`,
            delay: 0.1,
          },
          {
            icon: Leaf,
            color: 'text-teal-500',
            label: 'CO₂ gespart',
            value: `${totalCo2Saved} t`,
            delay: 0.15,
          },
        ].map(({ icon: Icon, color, label, value, delay }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 text-center"
          >
            <Icon size={18} className={`mx-auto ${color} mb-2`} />
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{value}</p>
          </motion.div>
        ))}
      </div>

      {/* Kumulierter Netto-Ertrag (Amortisation) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Euro size={14} />
          Kumulierter Netto-Ertrag
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={projectionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gNetPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'Jahr', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#94a3b8' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}€`} width={55} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [`${v > 0 ? '+' : ''}${v} €`, 'Netto-Ertrag']}
              labelFormatter={l => `Jahr ${l}`}
            />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="netBalance" stroke="#10b981" strokeWidth={2.5} fill="url(#gNetPos)" />
          </AreaChart>
        </ResponsiveContainer>
        {breakEvenYear !== null && (
          <p className="text-center text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
            ✓ Break-even nach ca. {breakEvenYear} Jahren
          </p>
        )}
      </div>

      {/* Vergleichschart: Mit vs. Ohne BKW */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Zap size={14} />
          Kostenvergleich: Mit vs. Ohne BKW
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={projectionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'Jahr', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#94a3b8' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}€`} width={55} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [`${v} €`, name]}
              labelFormatter={l => `Jahr ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Line type="monotone" dataKey="cumCostWithout" name="Ohne BKW (Stromkosten)" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cumCostWith" name="Mit BKW (Investition)" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="6 3" />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
          Die rote Kurve zeigt kumulierte Stromkosten ohne Anlage (inkl. Preissteigerung)
        </p>
      </div>

      {/* Jährliche Ersparnis */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <TrendingUp size={14} />
          Jährliche Ersparnis
        </h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={projectionData.slice(1)} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}€`} width={45} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [`${v} €`, 'Jahresersparnis']}
              labelFormatter={l => `Jahr ${l}`}
            />
            <Bar dataKey="annualSavings" name="Ersparnis" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CO₂-Einsparung kumuliert */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Leaf size={14} />
          CO₂-Einsparung kumuliert
        </h3>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={projectionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gCo2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} label={{ value: 'Jahr', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#94a3b8' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}t`} width={40} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => [`${v} t`, 'CO₂ gespart']}
              labelFormatter={l => `Jahr ${l}`}
            />
            <Area type="monotone" dataKey="co2Saved" name="CO₂ gespart" stroke="#14b8a6" strokeWidth={2.5} fill="url(#gCo2)" />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
          Basis: 0,4 kg CO₂/kWh (Deutscher Strommix 2024)
        </p>
      </div>
    </div>
  );
}
