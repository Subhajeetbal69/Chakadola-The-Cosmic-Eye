import React from 'react';
import {
  Satellite,
  ShieldAlert,
  Clock,
  Database,
  RefreshCw,
  PlayCircle,
  Sliders,
  BookOpen,
  Radio,
  Layers,
  Activity
} from 'lucide-react';
import { SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  isLoading: boolean;
  onFetchLive: () => void;
  onLoadDemo: () => void;
  onReAnalyze: () => void;
  onOpenSettings: () => void;
  onOpenArch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  isLoading,
  onFetchLive,
  onLoadDemo,
  onReAnalyze,
  onOpenSettings,
  onOpenArch
}) => {
  const formatTime = (isoString?: string) => {
    if (!isoString) return 'Pending';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' UTC';
    } catch {
      return isoString;
    }
  };

  const isLive = status?.activeSource?.includes('CelesTrak') || status?.activeSource?.includes('Live');
  const isDemo = status?.activeSource?.includes('Demo') || status?.activeSource?.includes('Scenario');

  return (
    <header id="dashboard-header" className="bg-slate-900/60 border-b border-white/5 text-slate-100 px-4 sm:px-6 py-5 sticky top-0 z-30 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        
        {/* Brand & Main Title */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-[0.3em] text-blue-400 font-bold uppercase">
              System Intelligence • Astrodynamics Core
            </span>
            <span className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
              isLive
                ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                : isDemo
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                : 'bg-white/5 text-slate-400 border-white/5'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-blue-400 animate-ping' : 'bg-emerald-400'}`} />
              {status?.activeSource || 'LIVE_TELEMETRY_CONNECTED'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-light tracking-tight mt-1 text-white">
            SPACE DEBRIS <span className="text-blue-500 font-medium">TRACKER</span>
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-widest font-medium">
            Conjunction Risk Prediction Dashboard v1.1.0 • SGP4 / TEME Frame
          </p>
        </div>

        {/* Telemetry Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div id="metric-tracked-objects" className="bg-slate-800/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Tracked Objects</span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-mono leading-none text-white">{status?.trackedObjectsCount ?? 0}</span>
              <span className="text-[10px] font-mono text-blue-400 font-bold">SGP4</span>
            </div>
            <div className="w-full bg-slate-900/50 h-1 mt-2 rounded-full overflow-hidden border border-white/5">
              <div className="bg-blue-500 h-full w-full rounded-full"></div>
            </div>
          </div>

          <div id="metric-conjunctions" className={`rounded-xl p-3 flex flex-col justify-between shadow-lg backdrop-blur-md border ${
            (status?.detectedConjunctionsCount ?? 0) > 0
              ? 'bg-red-950/20 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
              : 'bg-slate-800/40 border-white/5'
          }`}>
            <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Close Encounters</span>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-mono leading-none font-bold ${(status?.detectedConjunctionsCount ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                {status?.detectedConjunctionsCount ?? 0}
              </span>
              <span className="text-[10px] font-mono text-red-400/80 font-bold">Candidates</span>
            </div>
            <div className="w-full bg-slate-900/50 h-1 mt-2 rounded-full overflow-hidden border border-white/5">
              <div className="bg-red-500 h-full rounded-full" style={{ width: `${Math.min(100, (status?.detectedConjunctionsCount || 0) * 15)}%` }}></div>
            </div>
          </div>

          <div id="metric-analysis-window" className="bg-slate-800/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Pred. Window</span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-mono leading-none text-white">{status?.analysisWindowHours ?? 24}h</span>
              <span className="text-[10px] font-mono text-slate-400 font-bold">@{status?.timeStepSeconds ?? 60}s</span>
            </div>
            <div className="w-full bg-slate-900/50 h-1 mt-2 rounded-full overflow-hidden border border-white/5">
              <div className="bg-purple-500/60 h-full w-full rounded-full"></div>
            </div>
          </div>

          <div id="metric-last-update" className="bg-slate-800/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="block text-[9px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">System Status</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <span className="text-xs font-mono font-bold text-emerald-400 truncate">NOMINAL</span>
            </div>
            <span className="text-[9px] font-mono text-slate-500 truncate mt-1">
              {formatTime(status?.lastDataUpdate)}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            id="btn-fetch-celestrak"
            onClick={onFetchLive}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(37,99,235,0.3)] border border-blue-500/50"
            title="Download latest TLEs from CelesTrak"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Fetch CelesTrak</span>
          </button>

          <button
            id="btn-load-demo"
            onClick={onLoadDemo}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-200 border border-white/5 font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg backdrop-blur-md"
            title="Load deterministic close-approach scenario for demonstration"
          >
            <PlayCircle className="w-3.5 h-3.5 text-purple-400" />
            <span>Demo Scenario</span>
          </button>

          <button
            id="btn-reanalyze"
            onClick={onReAnalyze}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 border border-white/5 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 backdrop-blur-md"
            title="Recalculate trajectories and pairwise conjunctions"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Re-Scan</span>
          </button>

          <button
            id="btn-open-settings"
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 border border-white/5 text-xs transition-all backdrop-blur-md"
            title="Configuration & Risk Weights"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            id="btn-open-architecture"
            onClick={onOpenArch}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 border border-white/5 text-xs transition-all backdrop-blur-md"
            title="System Architecture & Scaling Roadmap"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
};
