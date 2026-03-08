import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Check, X, Zap, LayoutGrid, ChevronRight, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { BKWDevice } from '../lib/deviceStore';
import { addDevice, deleteDevice, renameDevice, updateDevice, DEVICE_COLORS } from '../lib/deviceStore';
import { generateDataForDevice } from '../lib/simulation';

interface DeviceManagerProps {
  devices: BKWDevice[];
  activeDeviceId: string;
  onDevicesChange: (devices: BKWDevice[]) => void;
  onActiveDeviceChange: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Quick stats per device from simulated monthly data
// ---------------------------------------------------------------------------
function deviceMonthlyKwh(device: BKWDevice): number {
  const data = generateDataForDevice('monthly', device.id);
  const totalW = data.reduce((s, d) => s + d.solar, 0);
  return Math.round((totalW * 1) / 1000); // rough kWh (1h per datapoint)
}

// ---------------------------------------------------------------------------
// Add-Device Form (inline)
// ---------------------------------------------------------------------------
function AddDeviceForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, peakPowerW: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [peak, setPeak] = useState(800);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), peak);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 space-y-3 overflow-hidden"
    >
      <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
        <Plus size={16} /> {t('devices.addTitle')}
      </h3>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
          {t('devices.deviceName')}
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={t('devices.namePlaceholder')}
          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
          {t('devices.peakPower')}: <span className="font-bold text-emerald-600">{peak} W</span>
        </label>
        <input
          type="range"
          min="400"
          max="2000"
          step="100"
          value={peak}
          onChange={(e) => setPeak(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>400 W</span><span>2000 W</span>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
        >
          <Check size={15} /> {t('devices.add')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <X size={15} />
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Device Card
// ---------------------------------------------------------------------------
function DeviceCard({
  device,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onColorChange,
}: {
  device: BKWDevice;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onColorChange: (color: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(device.name);
  const [showColors, setShowColors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const monthlyKwh = deviceMonthlyKwh(device);

  const commitRename = () => {
    if (editName.trim()) onRename(editName.trim());
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 shadow-sm transition-all ${
        isActive
          ? 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-400/30'
          : 'border-slate-100 dark:border-slate-800'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Color dot */}
        <button
          onClick={() => setShowColors(!showColors)}
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm border-2 border-white dark:border-slate-800 mt-0.5"
          style={{ backgroundColor: device.color }}
          title={t('devices.changeColor')}
        >
          <Zap size={16} className="text-white" />
        </button>

        {/* Name + stats */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-1">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="flex-1 text-sm font-bold border-b-2 border-emerald-500 bg-transparent outline-none py-0.5"
              />
              <button onClick={commitRename} className="text-emerald-600 hover:text-emerald-700">
                <Check size={16} />
              </button>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold truncate">{device.name}</h3>
              <button
                onClick={() => { setEditName(device.name); setEditing(true); }}
                className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 flex-shrink-0"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Zap size={10} /> {device.peakPowerW} W
            </span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Sun size={10} /> ≈ {monthlyKwh} kWh/Mon.
            </span>
            <span className="text-[11px] text-slate-400">
              {new Date(device.installDate).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Active indicator + delete */}
        <div className="flex flex-col items-end gap-2">
          {isActive && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              {t('devices.active')}
            </span>
          )}
          {confirmDelete ? (
            <div className="flex gap-1">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 px-2 py-1 rounded-lg"
              >
                {t('devices.confirmDelete')}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Color picker */}
      <AnimatePresence>
        {showColors && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="flex gap-2 flex-wrap">
              {DEVICE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onColorChange(c); setShowColors(false); }}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-105 ${
                    c === device.color ? 'border-slate-800 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Go-to-dashboard button */}
      <button
        onClick={onSelect}
        className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all ${
          isActive
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        {t('devices.openDashboard')} <ChevronRight size={14} />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main DeviceManager component
// ---------------------------------------------------------------------------
export default function DeviceManager({
  devices,
  activeDeviceId,
  onDevicesChange,
  onActiveDeviceChange,
}: DeviceManagerProps) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = (name: string, peakPowerW: number) => {
    const newDevice = addDevice(name, peakPowerW);
    onDevicesChange([...devices, newDevice]);
    onActiveDeviceChange(newDevice.id);
    setShowAddForm(false);
    toast.success(t('devices.addedToast', { name: newDevice.name }));
  };

  const handleDelete = (id: string) => {
    if (devices.length === 1) {
      toast.error(t('devices.cannotDeleteLast'));
      return;
    }
    const updated = deleteDevice(id);
    onDevicesChange(updated);
    if (activeDeviceId === id) {
      onActiveDeviceChange(updated[0]?.id ?? 'all');
    }
    toast.success(t('devices.deletedToast'));
  };

  const handleRename = (id: string, name: string) => {
    const updated = renameDevice(id, name);
    onDevicesChange(updated);
  };

  const handleColorChange = (id: string, color: string) => {
    const updated = updateDevice(id, { color });
    onDevicesChange(updated);
  };

  // Aggregate stats
  const totalPeak = devices.reduce((s, d) => s + d.peakPowerW, 0);
  const totalMonthlyKwh = devices.reduce((s, d) => s + deviceMonthlyKwh(d), 0);

  return (
    <div className="p-4 max-w-4xl mx-auto pb-24 space-y-4">
      {/* Header card */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <LayoutGrid size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold">{t('devices.title')}</h1>
              <p className="text-xs opacity-80">{t('devices.subtitle', { count: devices.length })}</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label={t('devices.addTitle')}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-lg font-bold">{devices.length}</p>
            <p className="text-[10px] opacity-75 uppercase">{t('devices.countLabel')}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-lg font-bold">{totalPeak} W</p>
            <p className="text-[10px] opacity-75 uppercase">{t('devices.totalPeak')}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <p className="text-lg font-bold">≈{totalMonthlyKwh}</p>
            <p className="text-[10px] opacity-75 uppercase">kWh / {t('devices.month')}</p>
          </div>
        </div>
      </div>

      {/* "All devices" total overview button */}
      <button
        onClick={() => onActiveDeviceChange('all')}
        className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
          activeDeviceId === 'all'
            ? 'bg-slate-800 dark:bg-white border-slate-800 dark:border-white text-white dark:text-slate-900'
            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            activeDeviceId === 'all' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
          }`}
        >
          <LayoutGrid size={18} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold">{t('devices.allTitle')}</p>
          <p className="text-xs opacity-60">{t('devices.allSub', { count: devices.length })}</p>
        </div>
        <ChevronRight size={16} className="opacity-40" />
      </button>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <AddDeviceForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
        )}
      </AnimatePresence>

      {/* Device list */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 px-1">
          {t('devices.myDevices')}
        </h2>
        <AnimatePresence mode="popLayout">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              isActive={activeDeviceId === device.id}
              onSelect={() => onActiveDeviceChange(device.id)}
              onRename={(name) => handleRename(device.id, name)}
              onDelete={() => handleDelete(device.id)}
              onColorChange={(color) => handleColorChange(device.id, color)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Supabase hint */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('devices.cloudHint')}
        </p>
      </div>
    </div>
  );
}
