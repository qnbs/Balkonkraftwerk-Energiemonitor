import { Component, type ReactNode } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-500 flex items-center justify-center mb-4">
            <WifiOff size={28} />
          </div>
          <h2 className="text-lg font-bold mb-2">Etwas ist schiefgelaufen</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
            {this.state.error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw size={16} />
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function OfflineBanner() {
  return (
    <div className="bg-amber-500 text-white text-center text-xs font-medium py-1.5 px-4">
      <span className="flex items-center justify-center gap-1.5">
        <WifiOff size={12} />
        Offline – Daten werden lokal zwischengespeichert
      </span>
    </div>
  );
}
