import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EarthScene, ZoomAction } from '../components/earth/EarthScene';
import { Orbit2DView } from '../components/Orbit2DView';
import { TrackedObjectsCatalog } from '../components/TrackedObjectsCatalog';
import { useTelemetry } from '../context/TelemetryContext';
import {
  Globe,
  Orbit,
  Layers,
  ShieldAlert,
  ArrowRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Gauge,
  X,
  Radio,
  Compass
} from 'lucide-react';
import './EarthPage.css';

/**
 * Determine orbital regime (LEO, MEO, GEO, HEO) based on altitude and period.
 */
function getOrbitType(altitudeKm: number, periodMin?: number): string {
  if (altitudeKm < 2000) return 'LEO (Low Earth Orbit)';
  if (altitudeKm >= 35000 && altitudeKm <= 36500) return 'GEO (Geostationary)';
  if (altitudeKm >= 2000 && altitudeKm < 35000) return 'MEO (Medium Earth Orbit)';
  return 'HEO (High Earth Orbit)';
}

/**
 * EarthPage — Immersive, pure Cosmos & 3D Earth visualization
 * with floating HUD telemetry and streamlined aerospace page switcher.
 */
export function EarthPage() {
  const {
    status,
    objects,
    conjunctions,
    selectedConjunction,
    selectedObject,
    conjunctionSyncState,
    activeTab,
    isWsConnected,
    setSelectedConjunction,
    setSelectedObject,
    setActiveTab,
    setIsDossierOpen,
    handleResetSync
  } = useTelemetry();

  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [zoomAction, setZoomAction] = useState<ZoomAction | null>(null);
  const [simSpeed, setSimSpeed] = useState<number>(60);

  const activeSatsCount = status?.activeSatellitesCount ?? objects.filter(o => o.classification === 'ACTIVE_SATELLITE').length;
  const debrisCount = status?.debrisCount ?? objects.filter(o => o.classification === 'DEBRIS').length;
  const rbCount = status?.rocketBodiesCount ?? objects.filter(o => o.classification === 'ROCKET_BODY').length;
  const conjCount = conjunctions.length;

  const triggerZoom = (type: 'IN' | 'OUT' | 'RESET') => {
    setZoomAction({ type, timestamp: Date.now() });
  };

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#05050a] text-slate-100 font-sans select-none">
      {/* ── Top Floating Aerospace Page Switcher Dock ───────────── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-1.5 sm:gap-2 p-1.5 bg-slate-900/80 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold text-cyan-400 border-r border-white/10">
          <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
          <span className="hidden sm:inline">ORBITAL VIEW</span>
        </div>

        <Link
          to="/"
          className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/15 border border-transparent text-slate-300 hover:text-white transition-all cursor-pointer"
          title="Switch to Mission Control Lunar Center"
        >
          <Compass className="w-3.5 h-3.5 text-slate-400" />
          <span>Mission Control</span>
        </Link>

        <Link
          to="/earth"
          className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-cyan-600/40 border border-cyan-400/60 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
          title="Earth Orbital & Space Debris Tracker"
        >
          <Globe className="w-3.5 h-3.5 text-cyan-300" />
          <span>Earth Tracking</span>
        </Link>

        <Link
          to="/alert"
          className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-red-600/30 hover:border-red-400/50 border border-transparent text-slate-300 hover:text-white transition-all cursor-pointer relative"
          title="View conjunction threats & AI avoidance center"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
          <span>Alert Center</span>
          {conjCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
              {conjCount}
            </span>
          )}
        </Link>

        <div className="hidden md:flex items-center gap-1.5 pl-2 pr-1 border-l border-white/10 text-[10px] font-mono text-slate-400">
          <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <span>{isWsConnected ? 'LIVE FEED' : 'SYNCED'}</span>
        </div>
      </div>

      {/* ── Active Conjunction Threat Floating Banner (If Detected) ── */}
      {selectedConjunction && (
        <Link
          to="/alert"
          className="fixed top-18 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 text-xs font-mono bg-red-950/85 hover:bg-red-900/90 border border-red-500/50 px-4 py-1.5 rounded-2xl text-red-300 transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] backdrop-blur-xl cursor-pointer"
          title="Click to view collision avoidance solutions in Alert Center"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 animate-pulse" />
          <span className="truncate max-w-[180px] sm:max-w-[260px] font-semibold text-white">
            {selectedConjunction.objectA.name} &harr; {selectedConjunction.objectB.name}
          </span>
          <span className="font-bold text-red-400">({selectedConjunction.minDistanceKm.toFixed(2)} km)</span>
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-500/40 ml-1">
            Avoidance &rarr;
          </span>
        </Link>
      )}

      {/* ── Fullscreen Earth & Cosmos 3D Canvas ────────────────── */}
      <div className="earth-page-container">
        {/* Cinematic Loading Screen */}
        {!sceneLoaded && (
          <div className="earth-loading-screen">
            <div className="loading-text">
              <h2>INITIALIZING ORBITAL SYSTEM</h2>
              <p>LOADING HIGH-RES EARTH TEXTURES...</p>
              <p>PROPAGATING {objects.length} ORBITAL OBJECTS...</p>
              <p>CONNECTING REAL-TIME ASTRODYNAMICS FEED...</p>
            </div>
          </div>
        )}

        {/* 3D Realistic Earth Scene */}
        <EarthScene
          onLoaded={() => setSceneLoaded(true)}
          objects={objects}
          selectedObject={selectedObject}
          selectedConjunction={selectedConjunction}
          zoomAction={zoomAction}
          simSpeedMultiplier={simSpeed}
          onSelectObject={(obj) => setSelectedObject(obj)}
        />

        {/* Floating Mission Control HUD Overlay */}
        <div className={`earth-ui-overlay ${sceneLoaded ? 'visible' : ''}`}>
          {/* Top Left - Minimal Title & View Mode Selector */}
          <div className="ui-panel top-left">
            <div className="flex items-center gap-2">
              <h1>EARTH</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                LIVE
              </span>
            </div>
            <p>ORBITAL DEBRIS & SATELLITE TRACKER</p>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-white/10">
              <button
                id="tab-3d-realistic"
                onClick={() => setActiveTab('3D')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === '3D'
                    ? 'bg-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>3D Earth</span>
              </button>

              <button
                id="tab-2d-view"
                onClick={() => setActiveTab('2D')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === '2D'
                    ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Orbit className="w-3 h-3" />
                <span>2D Plane</span>
              </button>

              <button
                id="tab-catalog"
                onClick={() => setActiveTab('CATALOG')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'CATALOG'
                    ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Registry ({objects.length})</span>
              </button>
            </div>
          </div>

          {/* Top Right - Status Counter & Color Legend */}
          <div className="ui-panel top-right">
            <div className="flex items-center justify-between gap-4 mb-2 pb-1.5 border-b border-white/10">
              <span className="font-mono text-[10px] tracking-wider text-slate-400 font-bold uppercase">
                OBJECTS TRACKED
              </span>
              <span className="font-mono text-xs font-bold text-cyan-300">
                {objects.length.toLocaleString()} TOTAL
              </span>
            </div>
            <div className="stats space-y-1.5">
              <div className="flex items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />
                  <span className="text-slate-300">SATELLITES:</span>
                </div>
                <span className="highlight text-white font-bold">{activeSatsCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff2244] shadow-[0_0_8px_#ff2244]" />
                  <span className="text-slate-300">SPACE DEBRIS:</span>
                </div>
                <span className="highlight text-[#ff4466] font-bold">{debrisCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0088ff] shadow-[0_0_8px_#0088ff]" />
                  <span className="text-slate-300">ROCKET BODIES:</span>
                </div>
                <span className="highlight text-[#33aaff] font-bold">{rbCount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Bottom Left - Camera Zoom Controls & Sim Speed */}
          <div className="ui-panel camera-controls">
            <div className="flex items-center gap-1 border-r border-white/10 pr-2">
              <button
                onClick={() => triggerZoom('IN')}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-600 text-slate-300 hover:text-white transition-all cursor-pointer border border-white/10"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => triggerZoom('OUT')}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-600 text-slate-300 hover:text-white transition-all cursor-pointer border border-white/10"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => triggerZoom('RESET')}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer border border-white/10"
                title="Reset Center View"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Simulation Speed Buttons */}
            <div className="flex items-center gap-1 pl-1">
              <Gauge className="w-3.5 h-3.5 text-cyan-400 mr-1" />
              {[1, 30, 60, 150].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimSpeed(spd)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    simSpeed === spd
                      ? 'bg-cyan-600 text-white shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : 'bg-slate-800/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Center - Instructions */}
          {!selectedObject && (
            <div className="ui-panel bottom-center instructions">
              <p>CLICK ANY OBJECT IN ORBIT TO INSPECT TELEMETRY</p>
            </div>
          )}

          {/* Selected Object Info Panel */}
          {selectedObject && (
            <div className="ui-panel object-info-panel">
              {/* Header with Close Button */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00e5ff]" />
                  <span className="font-mono text-[10px] font-bold tracking-widest text-cyan-300 uppercase">
                    TELEMETRY DOSSIER
                  </span>
                </div>
                <button
                  onClick={() => setSelectedObject(null)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-all cursor-pointer border border-white/10"
                  title="Close Panel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="info-row">
                <span className="label">OBJECT</span>
                <span className="value primary" title={selectedObject.name}>
                  {selectedObject.name}
                </span>
              </div>

              <div className="info-row">
                <span className="label">TYPE</span>
                <span className={`value text-xs font-semibold px-2 py-0.5 rounded ${
                  selectedObject.classification === 'ACTIVE_SATELLITE'
                    ? 'bg-white/20 text-white border border-white/30'
                    : selectedObject.classification === 'ROCKET_BODY'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {selectedObject.classification.replace('_', ' ')}
                </span>
              </div>

              <div className="info-row">
                <span className="label">REGIME</span>
                <span className="value text-xs text-slate-300">
                  {getOrbitType(selectedObject.altitudeKm || 400, selectedObject.periodMin)}
                </span>
              </div>

              <div className="info-row">
                <span className="label">ALTITUDE</span>
                <span className="value text-cyan-300 font-bold">
                  {selectedObject.altitudeKm ? `${selectedObject.altitudeKm.toFixed(1)} km` : '420.0 km'}
                </span>
              </div>

              <div className="info-row">
                <span className="label">VELOCITY</span>
                <span className="value text-white">
                  {selectedObject.speedKmS ? `${selectedObject.speedKmS.toFixed(2)} km/s` : '7.66 km/s'}
                </span>
              </div>

              <div className="info-row">
                <span className="label">INCLINATION</span>
                <span className="value text-slate-300">
                  {selectedObject.inclinationDeg ? `${selectedObject.inclinationDeg.toFixed(1)}°` : '51.6°'}
                </span>
              </div>

              <div className="info-row">
                <span className="label">STATUS</span>
                <span className="value active flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  TRACKED (LIVE)
                </span>
              </div>

              <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-2">
                <button
                  onClick={() => setIsDossierOpen(true)}
                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(6,182,212,0.3)] cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Full Dossier</span>
                </button>
                
                <button
                  onClick={() => {
                    setActiveTab('2D');
                  }}
                  className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all border border-white/10 cursor-pointer"
                  title="View 2D Orbital Plane"
                >
                  2D View
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2D Orbit Plane Modal / Overlay ─────────────────────── */}
      {activeTab === '2D' && (
        <div className="fixed inset-4 sm:inset-10 z-50 bg-slate-950/85 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur-2xl overflow-auto flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm font-bold">
              <Orbit className="w-4 h-4" />
              <span>2D ORBITAL PLANE PROJECTION</span>
            </div>
            <button
              onClick={() => setActiveTab('3D')}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(6,182,212,0.4)] cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Return to 3D Earth</span>
            </button>
          </div>
          <div className="flex-1 min-h-[400px]">
            <Orbit2DView
              objects={objects}
              selectedConjunction={selectedConjunction}
              syncState={conjunctionSyncState}
              onSelectObject={(obj) => {
                setSelectedObject(obj);
                setIsDossierOpen(true);
              }}
              onResetSync={handleResetSync}
            />
          </div>
        </div>
      )}

      {/* ── Catalog Registry Modal / Overlay ───────────────────── */}
      {activeTab === 'CATALOG' && (
        <div className="fixed inset-4 sm:inset-10 z-50 bg-slate-950/85 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur-2xl overflow-auto flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm font-bold">
              <Layers className="w-4 h-4" />
              <span>TRACKED OBJECTS REGISTRY ({objects.length})</span>
            </div>
            <button
              onClick={() => setActiveTab('3D')}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(6,182,212,0.4)] cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Return to 3D Earth</span>
            </button>
          </div>
          <div className="flex-1 min-h-[400px]">
            <TrackedObjectsCatalog
              objects={objects}
              onSelectObject={(obj) => {
                setSelectedObject(obj);
                setIsDossierOpen(true);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default EarthPage;

