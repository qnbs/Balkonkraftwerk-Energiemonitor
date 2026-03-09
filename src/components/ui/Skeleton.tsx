export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton rounded-lg bg-slate-200 dark:bg-slate-700 ${className}`}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Dashboard wird geladen"
      className="p-4 space-y-4 max-w-4xl mx-auto pb-24 animate-in"
    >
      <span className="sr-only">Daten werden geladen…</span>
      {/* Live cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-20 h-7" />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2">
          <Skeleton className="w-10 h-10 rounded-full" />
          <Skeleton className="w-16 h-3" />
          <Skeleton className="w-20 h-7" />
        </div>
      </div>
      {/* Grid status */}
      <Skeleton className="w-full h-20 rounded-2xl" />
      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      {/* Chart */}
      <Skeleton className="w-full h-72 rounded-2xl" />
      {/* Summary */}
      <Skeleton className="w-full h-28 rounded-2xl" />
    </div>
  );
}
