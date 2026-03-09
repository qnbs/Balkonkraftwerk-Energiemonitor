import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileDown, Share2, FileText, Table2, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { EnergyDataPoint } from '../lib/simulation';
import { generateDataForDevice } from '../lib/simulation';

interface ReportModalProps {
  data: EnergyDataPoint[];
  deviceName: string;
  deviceId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// CSV helpers (no dependency – pure browser)
// ---------------------------------------------------------------------------
function buildCsvBlob(rows: EnergyDataPoint[]): Blob {
  const header = 'Zeit,Solar (W),Verbrauch (W),Einspeisung (W),Netzbezug (W)\n';
  const body = rows
    .map((r) => `${r.time},${r.solar},${r.consumption},${r.unused},${r.grid}`)
    .join('\n');
  return new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------
function sumMetrics(rows: EnergyDataPoint[]) {
  const totalSolar = rows.reduce((s, r) => s + r.solar, 0);
  const totalConsumption = rows.reduce((s, r) => s + r.consumption, 0);
  const totalFeedIn = rows.reduce((s, r) => s + r.unused, 0);
  const totalGrid = rows.reduce((s, r) => s + r.grid, 0);
  // Convert W sums to kWh (assume each data-point represents ~1h for daily, ~1day for weekly/monthly)
  const factor = 1 / 1000;
  return {
    solar: (totalSolar * factor).toFixed(2),
    consumption: (totalConsumption * factor).toFixed(2),
    feedIn: (totalFeedIn * factor).toFixed(2),
    grid: (totalGrid * factor).toFixed(2),
    savings: ((totalSolar * factor) * 0.30).toFixed(2),
    co2: ((totalSolar * factor) * 0.4).toFixed(2),
    selfSufficiency: totalConsumption > 0
      ? Math.min(100, Math.round((totalSolar / totalConsumption) * 100))
      : 0,
  };
}

// ---------------------------------------------------------------------------
// PDF generator (dynamic import – keeps initial bundle small)
// ---------------------------------------------------------------------------
async function generatePDFReport(
  rows: EnergyDataPoint[],
  deviceName: string,
  period: string,
  reportType: 'monthly' | 'yearly',
): Promise<void> {
  const [{ jsPDF }, autoTableModule, QRCode] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('qrcode'),
  ]);

  const autoTable = (autoTableModule.default ?? autoTableModule) as (doc: unknown, opts: unknown) => void;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;

  // ------------------------------------------------------------------
  // Header band
  // ------------------------------------------------------------------
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('⚡ BKW Monitor', margin, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${reportType === 'yearly' ? 'Jahresbericht' : 'Monatsbericht'} · ${deviceName}`, margin, 20);

  // Generated date (right-aligned)
  const dateStr = `Stand: ${new Date().toLocaleDateString('de-DE')}`;
  const dateW = doc.getTextWidth(dateStr);
  doc.text(dateStr, pageW - margin - dateW, 20);

  // ------------------------------------------------------------------
  // Period label
  // ------------------------------------------------------------------
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`Zeitraum: ${period}`, margin, 38);

  // ------------------------------------------------------------------
  // Summary metrics
  // ------------------------------------------------------------------
  const m = sumMetrics(rows);

  const summaryData = [
    ['☀️  Solar erzeugt', `${m.solar} kWh`],
    ['🏠  Verbrauch gesamt', `${m.consumption} kWh`],
    ['🔋  Einspeisung', `${m.feedIn} kWh`],
    ['🔌  Netzbezug', `${m.grid} kWh`],
    ['💶  Ersparnis', `${m.savings} €`],
    ['🌿  CO₂ gespart', `${m.co2} kg`],
    ['📊  Autarkie', `${m.selfSufficiency} %`],
  ];

  autoTable(doc, {
    startY: 44,
    head: [['Kennzahl', 'Wert']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
    tableWidth: (pageW - 2 * margin) * 0.46,
  });

  // ------------------------------------------------------------------
  // Chart data table
  // ------------------------------------------------------------------
  const tableStartY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  const slicedRows = rows.slice(0, reportType === 'yearly' ? rows.length : 30);

  autoTable(doc, {
    startY: tableStartY,
    head: [['Zeit', 'Solar (W)', 'Verbrauch (W)', 'Einspeisung (W)', 'Netzbezug (W)']],
    body: slicedRows.map((r) => [r.time, r.solar, r.consumption, r.unused, r.grid]),
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    margin: { left: margin, right: margin },
  });

  // ------------------------------------------------------------------
  // QR code (links to app) – placed to the right of summary table
  // ------------------------------------------------------------------
  try {
    const appUrl = window.location.origin + window.location.pathname;
    const qrDataUrl = await QRCode.toDataURL(appUrl, { width: 120, margin: 1 });
    const qrSize = 38;
    const qrX = pageW - margin - qrSize;
    const qrY = 44;
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text('App öffnen', qrX + qrSize / 2, qrY + qrSize + 4, { align: 'center' });
  } catch {
    // QR generation failed – skip silently
  }

  // ------------------------------------------------------------------
  // Footer
  // ------------------------------------------------------------------
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  const footerY = pageH - 8;
  doc.text('Erstellt mit BKW Monitor · https://github.com/qnbs/Balkonkraftwerk-Energiemonitor', margin, footerY);
  doc.text(`Seite 1`, pageW - margin, footerY, { align: 'right' });

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------
  const filename = `BKW-${deviceName.replace(/\s+/g, '_')}-${reportType === 'yearly' ? 'Jahresbericht' : 'Monatsbericht'}-${new Date().toISOString().slice(0, 7)}.pdf`;
  doc.save(filename);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ACTIONS = ['csv', 'monthly', 'yearly', 'share'] as const;
type Action = (typeof ACTIONS)[number];

export default function ReportModal({ data, deviceName, deviceId, onClose }: ReportModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<Action | null>(null);
  const [done, setDone] = useState<Action | null>(null);

  const markDone = (a: Action) => {
    setDone(a);
    setTimeout(() => setDone(null), 2000);
  };

  // -- CSV export (last 30 days = monthly simulation data)
  const handleCSV = async () => {
    setLoading('csv');
    try {
      const monthlyData = generateDataForDevice('monthly', deviceId);
      const blob = buildCsvBlob(monthlyData);
      downloadBlob(blob, `BKW-${deviceName.replace(/\s+/g, '_')}-letzte30Tage.csv`);
      markDone('csv');
      toast.success(t('report.csvSuccess'));
    } catch {
      toast.error(t('report.error'));
    } finally {
      setLoading(null);
    }
  };

  // -- PDF monthly
  const handlePDFMonthly = async () => {
    setLoading('monthly');
    try {
      const monthlyData = generateDataForDevice('monthly', deviceId);
      const month = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      await generatePDFReport(monthlyData, deviceName, month, 'monthly');
      markDone('monthly');
      toast.success(t('report.pdfSuccess'));
    } catch (e) {
      console.error(e);
      toast.error(t('report.error'));
    } finally {
      setLoading(null);
    }
  };

  // -- PDF yearly (12 months aggregated)
  const handlePDFYearly = async () => {
    setLoading('yearly');
    try {
      // Build 12-month data by appending daily-range data 30× with month labels
      const yearlyRows: EnergyDataPoint[] = [];
      const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      const currentMonth = new Date().getMonth();
      for (let m = 0; m < 12; m++) {
        const monthData = generateDataForDevice('monthly', deviceId + m);
        const sumSolar = monthData.reduce((s, r) => s + r.solar, 0);
        const sumConsumption = monthData.reduce((s, r) => s + r.consumption, 0);
        yearlyRows.push({
          time: months[(currentMonth - 11 + m + 12) % 12],
          solar: Math.round(sumSolar / 1000), // kWh
          consumption: Math.round(sumConsumption / 1000),
          unused: Math.round(Math.max(0, sumSolar - sumConsumption) / 1000),
          grid: Math.round(Math.max(0, sumConsumption - sumSolar) / 1000),
        });
      }
      const year = new Date().getFullYear();
      await generatePDFReport(yearlyRows, deviceName, `${year}`, 'yearly');
      markDone('yearly');
      toast.success(t('report.pdfSuccess'));
    } catch (e) {
      console.error(e);
      toast.error(t('report.error'));
    } finally {
      setLoading(null);
    }
  };

  // -- Web Share API / copy link
  const handleShare = async () => {
    setLoading('share');
    try {
      const url = window.location.href;
      const shareData = {
        title: `BKW Monitor – ${deviceName}`,
        text: `Mein Balkonkraftwerk Energiemonitor: ${deviceName}`,
        url,
      };
      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t('report.linkCopied'));
      }
      markDone('share');
    } catch {
      // user cancelled share – ignore
    } finally {
      setLoading(null);
    }
  };

  const buttons: Array<{
    id: Action;
    icon: typeof FileDown;
    label: string;
    sublabel: string;
    color: string;
    handler: () => void;
  }> = [
    {
      id: 'csv',
      icon: Table2,
      label: t('report.csvTitle'),
      sublabel: t('report.csvSub'),
      color: 'from-emerald-500 to-teal-600',
      handler: handleCSV,
    },
    {
      id: 'monthly',
      icon: FileText,
      label: t('report.monthlyPdf'),
      sublabel: t('report.monthlyPdfSub'),
      color: 'from-blue-500 to-indigo-600',
      handler: handlePDFMonthly,
    },
    {
      id: 'yearly',
      icon: FileDown,
      label: t('report.yearlyPdf'),
      sublabel: t('report.yearlyPdfSub'),
      color: 'from-violet-500 to-purple-700',
      handler: handlePDFYearly,
    },
    {
      id: 'share',
      icon: Share2,
      label: t('report.share'),
      sublabel: t('report.shareSub'),
      color: 'from-amber-500 to-orange-600',
      handler: handleShare,
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        aria-hidden="true"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
            <div>
              <h2 id="report-modal-title" className="text-base font-bold">{t('report.title')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{deviceName}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Bericht-Dialog schließen"
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="p-4 space-y-3">
            {buttons.map(({ id, icon: Icon, label, sublabel, color, handler }) => (
              <motion.button
                key={id}
                onClick={handler}
                disabled={loading !== null}
                whileTap={{ scale: 0.97 }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${color} text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-opacity`}
              >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  {loading === id ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : done === id ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <Icon size={20} />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold leading-tight">{label}</p>
                  <p className="text-xs opacity-75 mt-0.5">{sublabel}</p>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Footer hint */}
          <p className="text-center text-[10px] text-slate-400 pb-5 px-4">
            {t('report.hint')}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
