import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
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
  Target
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

export function EarthPage() {
  const {
    status,
    objects,
    conjunctions,
    selectedConjunction,
    selectedObject,
    conjunctionSyncState,
    isLoading,
    activeTab,
    isWsConnected,
    wsLatency,
    setSelectedConjunction,
    setSelectedObject,
    setActiveTab,
    setIsSettingsOpen,
    setIsArchOpen,
    setIsDossierOpen,
    handleFetchLive,
    handleLoadDemo,
    handleReAnalyze,
    handleResetSync
  } = useTelemetry();

  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [zoomAction, setZoomAction] = useState<ZoomAction | null>(null);
  const [simSpeed, setSimSpeed] = useState<number>(60);

  const activeSatsCount = status?.activeSatellitesCount ?? objects.filter(o => o.classification === 'ACTIVE_SATELLITE').length;
  const debrisCount = status?.debrisCount ?? objects.filter(o => o.classification === 'DEBRIS').length;
  const rbCount = status?.rocketBodiesCount ?? objects.filter(o => o.classification === 'ROCKET_BODY').length;

  const triggerZoom = (type: 'IN' | 'OUT' | 'RESET') => {
    setZoomAction({ type, timestamp: Date.now() });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Aerospace Header & Nav */}
      <Header
        status={status}
        isLoading={isLoading}
        isWsConnected={isWsConnected}
        wsLatency={wsLatency}
        onFetchLive={handleFetchLive}
        onLoadDemo={handleLoadDemo}
        onReAnalyze={handleReAnalyze}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenArch={() => setIsArchOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5 relative">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* View Mode Selector Tabs & Conjunction Alert Badge */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl text-xs shadow-lg">
            <button
              id="tab-3d-realistic"
              onClick={() => setActiveTab('3D')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === '3D'
                  ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-cyan-300" />
              <span>Realistic 3D Earth</span>
            </button>

            <button
              id="tab-2d-view"
              onClick={() => setActiveTab('2D')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === '2D'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Orbit className="w-3.5 h-3.5 text-blue-300" />
              <span>2D Orbit Plane</span>
            </button>

            <button
              id="tab-catalog"
              onClick={() => setActiveTab('CATALOG')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'CATALOG'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-300" />
              <span>Objects Registry ({objects.length})</span>
            </button>
          </div>

          {selectedConjunction && (
            <Link
              to="/alert"
              className="flex items-center gap-2 text-xs font-mono bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-3.5 py-1.5 rounded-xl text-red-400 transition-all shadow-inner cursor-pointer"
              title="Click to view detailed Conjunction Risk & AI Avoidance in Alert Center"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0 animate-pulse" />
              <span className="truncate max-w-[180px] sm:max-w-[240px] font-semibold">
                {selectedConjunction.objectA.name} &harr; {selectedConjunction.objectB.name}
              </span>
              <span className="font-bold text-white">({selectedConjunction.minDistanceKm.toFixed(2)} km)</span>
              <ArrowRight className="w-3 h-3 text-red-400 ml-1" />
            </Link>
          )}
        </div>

        {/* View Mode Content */}
        {activeTab === '3D' && (
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

            {/* Mission Control UI Overlay */}
            <div className={`earth-ui-overlay ${sceneLoaded ? 'visible' : ''}`}>
              {/* Top Left - Title */}
              <div className="ui-panel top-left">
                <h1>EARTH</h1>
                <p>ORBITAL ENVIRONMENT & SPACE DEBRIS TRACKER</p>
              </div>

              {/* Top Right - Status Counter & Color Legend */}
              <div className="ui-panel top-right">
                <p>OBJECTS TRACKED & LEGEND</p>
                <div className="stats space-y-1">
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />
                    <span>SATELLITES: <span className="highlight text-white">{activeSatsCount}</span></span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff2244] shadow-[0_0_8px_#ff2244]" />
                    <span>SPACE DEBRIS: <span className="highlight text-[#ff4466]">{debrisCount}</span></span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0088ff] shadow-[0_0_8px_#0088ff]" />
                    <span>ROCKET BODIES: <span className="highlight text-[#33aaff]">{rbCount}</span></span>
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
                  <p>CLICK ANY DOT TO INSPECT ORBIT & TELEMETRY</p>
                </div>
              )}

              {/* Selected Object Info Panel (Fixed non-overlapping header) */}
              {selectedObject && (
                <div className="ui-panel object-info-panel">
                  {/* Clean Dedicated Header with Close Button */}
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00e5ff]" />
                      <span className="font-mono text-[11px] font-bold tracking-widest text-cyan-300 uppercase">
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

                  <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
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
        )}

        {activeTab === '2D' && (
          <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
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
        )}

        {activeTab === 'CATALOG' && (
          <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
            <TrackedObjectsCatalog
              objects={objects}
              onSelectObject={(obj) => {
                setSelectedObject(obj);
                setIsDossierOpen(true);
              }}
            />
          </div>
        )}

        {/* Quick Conjunctions Jump Bar */}
        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {conjunctions.length} Active Conjunction {conjunctions.length === 1 ? 'Threat' : 'Threats'} Detected
              </div>
              <div className="text-xs text-slate-400">
                Close approach collision risk calculations and Gemini AI avoidance burn recommendations
              </div>
            </div>
          </div>

          <Link
            to="/alert"
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] cursor-pointer"
          >
            <span>Open Alert Center</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-900/60 backdrop-blur-xl py-4 px-6 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] uppercase tracking-widest font-semibold font-mono">
          <div className="flex gap-6 items-center">
            <span>&copy; Orbital Dynamics Lab — Realistic Earth Visualization</span>
            <span className="text-slate-800">|</span>
            <span>Data: CelesTrak / Space-Track Public TLEs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-400">
              {isWsConnected ? 'WS_TELEMETRY_STREAM_ACTIVE (500MS)' : 'WS_DISCONNECTED (HTTP_FALLBACK)'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default EarthPage;
