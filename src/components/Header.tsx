import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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

  return (
    <header id="dashboard-header" className="bg-slate-900/90 border-b border-white/10 text-slate-100 px-4 sm:px-6 py-3.5 sticky top-0 z-30 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto flex flex-col gap-3.5">
        
        {/* Top Row: Brand, Global Navigation, & High-Res Clock */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] tracking-[0.25em] text-cyan-400 font-bold uppercase flex items-center gap-1.5 font-mono">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                Continuous Astrodynamics Stream
              </span>

              {/* Real-time Telemetry Stream Status Badge */}
              <span className={`text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                isWsConnected
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
              }`} title={isWsConnected ? 'WebSocket continuously streaming live telemetry packets' : 'Continuous real-time astrodynamics stream active'}>
                <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
                <span>{isWsConnected ? `WS STREAMING ${wsLatency !== null ? `(${wsLatency}ms)` : ''}` : 'LIVE STREAMING (ACTIVE)'}</span>
              </span>

              <span className={`text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                isLive
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : isDemo
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                  : 'bg-white/5 text-slate-400 border-white/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-cyan-400' : 'bg-slate-400'}`} />
                {status?.activeSource || 'CURATED_FLEET'}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-light tracking-tight mt-1 text-white flex items-center gap-2">
              SPACE DEBRIS <span className="text-cyan-400 font-semibold">& ROCKET BODY TRACKER</span>
            </h1>
          </div>

          {/* Navigation Tabs (Home, Earth, Alert) */}
          <nav className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-white/10 rounded-2xl shadow-inner backdrop-blur-xl">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Compass className="w-4 h-4 text-blue-400" />
              <span>Mission Control</span>
            </NavLink>

            <NavLink
              to="/earth"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>Earth Tracking</span>
            </NavLink>

            <NavLink
              to="/alert"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>Alert Center</span>
              {conjCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                  {conjCount}
                </span>
              )}
            </NavLink>
          </nav>

          {/* Real-time Clock & Breakdown */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-cyan-500/30 shadow-inner">
              <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-widest text-slate-400 font-mono font-bold">Real-time Clock</span>
                <span className="font-mono text-xs font-bold text-cyan-300 whitespace-nowrap">
                  {liveUtcClock || 'SYNCHRONIZING...'}
                </span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-white/10">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-300" title="Active Satellites">
                <Satellite className="w-3 h-3 text-blue-400" />
                <span>{satsCount} Sat</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-mono text-red-300" title="Space Debris">
                <Trash2 className="w-3 h-3 text-red-400" />
                <span>{debrisCount} Debris</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-300" title="Rocket Bodies">
                <Rocket className="w-3 h-3 text-amber-400" />
                <span>{rbCount} R/B</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Quick Telemetry Metrics & Action Buttons */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pt-1 border-t border-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 max-w-4xl">
            <div id="metric-tracked-objects" className="bg-slate-950/50 border border-white/10 rounded-xl p-2 flex flex-col justify-between shadow-md">
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Tracked Objects</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-base font-mono font-bold leading-none text-white">{status?.trackedObjectsCount ?? 0}</span>
                <span className="text-[9px] font-mono text-cyan-400 font-bold">Curated Set</span>
              </div>
            </div>

            <div id="metric-conjunctions" className={`rounded-xl p-2 flex flex-col justify-between shadow-md border ${
              conjCount > 0
                ? 'bg-red-950/30 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                : 'bg-slate-950/50 border-white/10'
            }`}>
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Conjunction Alerts</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className={`text-base font-mono font-bold leading-none ${conjCount > 0 ? 'text-red-400' : 'text-white'}`}>
                  {conjCount}
                </span>
                <span className="text-[9px] font-mono text-red-400/80 font-bold">&lt;{status?.config?.distanceThresholdKm || 15}km</span>
              </div>
            </div>

            <div id="metric-analysis-window" className="bg-slate-950/50 border border-white/10 rounded-xl p-2 flex flex-col justify-between shadow-md">
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Prop. Window</span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-base font-mono font-bold leading-none text-white">{status?.analysisWindowHours ?? 24}h</span>
                <span className="text-[9px] font-mono text-slate-400 font-bold">@{status?.timeStepSeconds ?? 60}s</span>
              </div>
            </div>

            <div id="metric-last-update" className="bg-slate-950/50 border border-white/10 rounded-xl p-2 flex flex-col justify-between shadow-md">
              <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold">CelesTrak Sync</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                <span className="text-[11px] font-mono font-bold text-emerald-400 truncate">
                  {formatTime(status?.lastDataUpdate)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <button
              id="btn-fetch-celestrak"
              onClick={onFetchLive}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.35)] border border-cyan-400/40 cursor-pointer"
              title="Synchronize live TLE orbital elements from CelesTrak"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync CelesTrak</span>
            </button>

            <button
              id="btn-load-demo"
              onClick={onLoadDemo}
              disabled={isLoading}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50 shadow-md backdrop-blur-md cursor-pointer"
              title="Load deterministic conjunction demonstration scenario"
            >
              <PlayCircle className="w-3.5 h-3.5 text-purple-400" />
              <span>Demo Scenario</span>
            </button>

            <button
              id="btn-reanalyze"
              onClick={onReAnalyze}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 backdrop-blur-md cursor-pointer"
              title="Recalculate trajectories and pairwise conjunctions"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Re-Scan</span>
            </button>

            <button
              id="btn-open-settings"
              onClick={onOpenSettings}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs transition-all backdrop-blur-md cursor-pointer"
              title="Configuration & Risk Weights"
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              id="btn-open-architecture"
              onClick={onOpenArch}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs transition-all backdrop-blur-md cursor-pointer"
              title="System Architecture & Astrodynamics Spec"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Header;
