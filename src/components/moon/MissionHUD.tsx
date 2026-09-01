import { useState, useEffect, useRef } from 'react';
import missionState from '../../stores/missionStore';
import { PATH_LENGTH } from './RoverPath';

/**
 * MissionHUD — Aerospace HUD telemetry overlay matching Image 2 reference.
 * Features clean left-side flight telemetry, top branding, and right-side scroll tracker.
 */
interface HUDData {
  distance: string;
  craters: number;
  dataPercent: number;
  scrollProgress: number;
}

export function MissionHUD() {
  const [data, setData] = useState<HUDData>({
    distance: '0.00',
    craters: 0,
    dataPercent: 0,
    scrollProgress: 0,
  });
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      const p = missionState.smoothProgress;

      // Distance traveled in km
      const distance = (p * PATH_LENGTH * 0.08).toFixed(2);

      // Craters discovered
      let craters = 0;
      if (missionState.crater1Discovered) craters++;
      if (missionState.crater2Discovered) craters++;

      // Data collected percentage
      const dataPercent = Math.min(100, Math.floor(p * 100));

      setData({
        distance,
        craters,
        dataPercent,
        scrollProgress: p,
      });

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* ── Top Left: Mission Control Branding (Image 2) ── */}
      <div className="fixed top-6 left-8 z-40 pointer-events-none hidden md:flex items-center gap-2">
        <img src="/Chakadola_LOGO.svg" alt="Chakadola Logo" className="h-20 w-auto opacity-90" />
      </div>

      {/* ── Top Right: Lunar Sector Status (Image 2) ── */}
      <div className="fixed top-6 right-8 z-40 pointer-events-none hidden md:flex flex-col items-end text-right font-['Orbitron']">
        <span className="text-[10px] font-bold tracking-[0.2em] text-slate-300 uppercase">
          LUNAR EXPLORATION
        </span>
        <span className="text-[9px] font-semibold tracking-[0.15em] text-slate-500 uppercase mt-0.5">
          PRAGYAN ROVER &nbsp;•&nbsp; <span className="text-emerald-400">LIVE</span>
        </span>
      </div>

      {/* ── Left Side: Primary Telemetry Indicators (Image 2) ── */}
      <div className="fixed top-1/2 -translate-y-1/2 left-8 z-30 pointer-events-none hidden sm:flex flex-col gap-6">
        <div>
          <div className="font-['Orbitron'] text-[9px] font-bold tracking-[0.25em] text-slate-500 uppercase mb-1">
            DISTANCE TRAVELED
          </div>
          <div className="font-['Orbitron'] text-2xl font-bold text-white tracking-wider flex items-baseline gap-1">
            {data.distance} <span className="text-xs font-medium text-slate-400">km</span>
          </div>
        </div>

        <div>
          <div className="font-['Orbitron'] text-[9px] font-bold tracking-[0.25em] text-slate-500 uppercase mb-1">
            CRATERS DISCOVERED
          </div>
          <div className="font-['Orbitron'] text-2xl font-bold text-white tracking-wider">
            {String(data.craters).padStart(2, '0')}
          </div>
        </div>

        <div>
          <div className="font-['Orbitron'] text-[9px] font-bold tracking-[0.25em] text-slate-500 uppercase mb-1">
            DATA COLLECTED
          </div>
          <div className="font-['Orbitron'] text-2xl font-bold text-white tracking-wider flex items-baseline gap-1">
            {data.dataPercent} <span className="text-xs font-medium text-slate-400">%</span>
          </div>
        </div>
      </div>

      {/* ── Right Side: Vertical Scroll Track Indicator (Image 2) ── */}
      <div className="fixed top-1/2 -translate-y-1/2 right-4 sm:right-8 z-30 pointer-events-none h-48 w-0.5 bg-white/10 rounded-full hidden sm:flex flex-col justify-start">
        <div
          className="w-2.5 h-2.5 -ml-1 rounded-full bg-cyan-400 shadow-[0_0_10px_#00e5ff] transition-all duration-75"
          style={{
            transform: `translateY(${data.scrollProgress * 180}px)`
          }}
        />
      </div>

      {/* ── Mobile Compact Bottom Telemetry Dock (Phone Viewports) ── */}
      {data.scrollProgress > 0.03 && data.scrollProgress < 0.86 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none sm:hidden flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-cyan-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.25)] text-[10px] font-['Orbitron'] tracking-wider text-slate-300">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[8px]">DIST</span>
            <span className="text-white font-bold">{data.distance}</span>
            <span className="text-cyan-400 text-[8px]">KM</span>
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[8px]">SCAN</span>
            <span className="text-cyan-300 font-bold">{data.dataPercent}%</span>
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div className="flex items-center gap-1">
            <span className="text-slate-500 text-[8px]">CRATERS</span>
            <span className="text-emerald-400 font-bold">{data.craters}/2</span>
          </div>
        </div>
      )}
    </>
  );
}

export default MissionHUD;

