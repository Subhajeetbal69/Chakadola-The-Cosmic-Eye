import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NavPill } from './NavPill';
import {
  Satellite,
  ShieldAlert,
  Clock,
  RefreshCw,
  PlayCircle,
  Sliders,
  BookOpen,
  Radio,
  Layers,
  Zap,
  Rocket,
  Trash2,
  Compass,
  Globe
} from 'lucide-react';
import { SystemStatus } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  isLoading: boolean;
  isWsConnected: boolean;
  wsLatency: number | null;
  onFetchLive: () => void;
  onLoadDemo: () => void;
  onReAnalyze: () => void;
  onOpenSettings: () => void;
  onOpenArch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  isLoading,
  isWsConnected,
  wsLatency,
  onFetchLive,
  onLoadDemo,
  onReAnalyze,
  onOpenSettings,
  onOpenArch
}) => {
  const [liveUtcClock, setLiveUtcClock] = useState<string>('');
  const location = useLocation();

  // High-frequency live UTC clock displaying sub-second precision
  useEffect(() => {
    let animId: number;
    const updateClock = () => {
      const now = new Date();
      const iso = now.toISOString();
      const datePart = iso.substring(0, 10);
      const timePart = iso.substring(11, 23);
      const microRemainder = Math.floor((performance.now() % 1) * 1000).toString().padStart(3, '0');
      setLiveUtcClock(`${datePart} ${timePart}${microRemainder} UTC`);
      animId = requestAnimationFrame(updateClock);
    };
    animId = requestAnimationFrame(updateClock);
    return () => cancelAnimationFrame(animId);
  }, []);

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

  const satsCount = status?.activeSatellitesCount ?? Math.max(0, (status?.trackedObjectsCount || 0) - 20);
  const debrisCount = status?.debrisCount ?? Math.min(status?.trackedObjectsCount || 0, 12);
  const rbCount = status?.rocketBodiesCount ?? Math.min(status?.trackedObjectsCount || 0, 8);
  const conjCount = status?.detectedConjunctionsCount ?? 0;

  const freshnessState = status?.freshnessState || (isLive ? 'LIVE' : 'FRESH_SNAPSHOT');
  
  const getFreshnessBadge = () => {
    const ageMin = status?.snapshotMetadata?.fetchedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(status.snapshotMetadata.fetchedAt).getTime()) / (60 * 1000)))
      : 0;

    switch (freshnessState) {
      case 'LIVE':
        return {
          label: 'LIVE (CelesTrak LEO)',
          classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.25)]',
          dot: 'bg-emerald-400 animate-pulse'
        };
      case 'FRESH_SNAPSHOT':
        return {
          label: `SNAPSHOT (${ageMin}m ago)`,
          classes: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]',
          dot: 'bg-cyan-400'
        };
      case 'STALE_SNAPSHOT':
        return {
          label: `STALE SNAPSHOT (${ageMin}m ago)`,
          classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
          dot: 'bg-amber-400 animate-pulse'
        };
      case 'CRITICAL_STALE':
        return {
          label: `CRITICAL STALE (${Math.floor(ageMin / 60)}h ago)`,
          classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
          dot: 'bg-rose-400 animate-ping'
        };
      case 'NO_DATA':
      default:
        return {
          label: 'NO DATA',
          classes: 'bg-slate-800 text-slate-400 border-slate-700',
          dot: 'bg-slate-500'
        };
    }
  };

  const badge = getFreshnessBadge();

  return (
    <header id="dashboard-header" className="bg-slate-900/95 border-b border-white/10 text-slate-100 px-3 sm:px-6 py-2 sm:py-3.5 sticky top-0 z-30 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto flex flex-col gap-2.5 sm:gap-3">
        
        {/* Top Row: Brand, Global Navigation, & High-Res Clock */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="text-[9px] sm:text-[10px] tracking-[0.2em] sm:tracking-[0.25em] text-cyan-400 font-bold uppercase flex items-center gap-1 font-mono">
                <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span className="hidden sm:inline">LEO SSA</span> Astrodynamics Stream
              </span>

              {/* Data Freshness Status Badge */}
              <span className={`text-[9px] sm:text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${badge.classes}`} title={`Orbital Dataset State: ${freshnessState}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                <span>{badge.label}</span>
              </span>

              {/* Real-time Telemetry Stream Status Badge */}
              <span className={`text-[9px] sm:text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
                isWsConnected
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              }`} title={isWsConnected ? 'WebSocket continuously streaming live telemetry packets' : 'Continuous real-time astrodynamics stream active'}>
                <span className={`w-1.5 h-1.5 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
                <span>{isWsConnected ? `WS ${wsLatency !== null ? `(${wsLatency}ms)` : 'LIVE'}` : 'STREAMING'}</span>
              </span>
            </div>

            <h1 className="text-base sm:text-xl font-light tracking-tight mt-0.5 text-white flex items-center gap-1.5">
              LEO SPACE DEBRIS <span className="text-cyan-400 font-semibold">& CONJUNCTION TRACKER</span>
            </h1>
          </div>

          {/* Navigation Tabs (Home, Earth, Alert) */}
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <div className="overflow-x-auto no-scrollbar w-full sm:w-auto">
              <NavPill conjCount={conjCount} />
            </div>

            {/* Real-time Clock on Desktop */}
            <div className="hidden lg:flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-cyan-500/30 shadow-inner">
              <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-bold">Real-time Clock</span>
                <span className="font-mono text-xs font-bold text-cyan-300 whitespace-nowrap">
                  {liveUtcClock || 'SYNCHRONIZING...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Quick Telemetry Metrics & Action Buttons */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pt-1 border-t border-white/5">
          {/* Scrollable metrics row on mobile */}
          <div className="flex xl:grid xl:grid-cols-4 gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 max-w-full xl:max-w-4xl">
            <div id="metric-tracked-objects" className="bg-slate-950/60 border border-white/10 rounded-xl p-2 flex flex-col justify-between shadow-md shrink-0 min-w-[125px] xl:min-w-0">
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">LEO Tracked Objects</span>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-sm sm:text-base font-mono font-bold leading-none text-white">{status?.trackedObjectsCount ?? 0}</span>
                <span className="text-[8px] sm:text-[9px] font-mono text-cyan-400 font-bold">LEO &le; 2000km</span>
              </div>
            </div>

            <div id="metric-conjunctions" className={`rounded-xl p-2 flex flex-col justify-between shadow-md border shrink-0 min-w-[125px] xl:min-w-0 ${
              conjCount > 0
                ? 'bg-red-950/30 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                : 'bg-slate-950/60 border-white/10'
            }`}>
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Conjunction Alerts</span>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className={`text-sm sm:text-base font-mono font-bold leading-none ${conjCount > 0 ? 'text-red-400' : 'text-white'}`}>
                  {conjCount}
                </span>
                <span className="text-[8px] sm:text-[9px] font-mono text-red-400/80 font-bold">&lt;{status?.config?.distanceThresholdKm || 15}km</span>
              </div>
            </div>

            <div id="metric-analysis-window" className="bg-slate-950/60 border border-white/10 rounded-xl p-2 flex flex-col justify-between shadow-md shrink-0 min-w-[120px] xl:min-w-0">
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Prop. Window</span>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-sm sm:text-base font-mono font-bold leading-none text-white">{status?.analysisWindowHours ?? 24}h</span>
                <span className="text-[8px] sm:text-[9px] font-mono text-slate-400 font-bold">@{status?.timeStepSeconds ?? 60}s</span>
              </div>
            </div>

            <div id="metric-last-update" className="bg-slate-950/60 border border-white/10 rounded-xl p-2 flex flex-col justify-between shadow-md shrink-0 min-w-[130px] xl:min-w-0">
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">LEO Snapshot Age</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} shrink-0`}></span>
                <span className="text-[10px] sm:text-[11px] font-mono font-bold text-cyan-300 truncate">
                  {formatTime(status?.snapshotMetadata?.fetchedAt || status?.lastDataUpdate)}
                </span>
              </div>
            </div>
          </div>


          {/* Action Controls in a neat scrollable row on mobile */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 py-0.5">
            <button
              id="btn-fetch-celestrak"
              onClick={onFetchLive}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.35)] border border-cyan-400/40 cursor-pointer whitespace-nowrap"
              title="Synchronize live TLE orbital elements from CelesTrak"
            >
              <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync CelesTrak</span>
            </button>

            <button
              id="btn-load-demo"
              onClick={onLoadDemo}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-md backdrop-blur-md cursor-pointer whitespace-nowrap"
              title="Load deterministic conjunction demonstration scenario"
            >
              <PlayCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-purple-400" />
              <span>Demo Scenario</span>
            </button>

            <button
              id="btn-reanalyze"
              onClick={onReAnalyze}
              disabled={isLoading}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 font-semibold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 backdrop-blur-md cursor-pointer whitespace-nowrap"
              title="Recalculate trajectories and pairwise conjunctions"
            >
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <span>Re-Scan</span>
            </button>

            <button
              id="btn-open-settings"
              onClick={onOpenSettings}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs transition-all backdrop-blur-md cursor-pointer"
              title="Configuration & Risk Weights"
            >
              <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              id="btn-open-architecture"
              onClick={onOpenArch}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs transition-all backdrop-blur-md cursor-pointer"
              title="System Architecture & Astrodynamics Spec"
            >
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
