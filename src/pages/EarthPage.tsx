import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EarthScene, ZoomAction } from '../components/earth/EarthScene';
import { Orbit2DView } from '../components/Orbit2DView';
import { TrackedObjectsCatalog } from '../components/TrackedObjectsCatalog';
import { useTelemetry } from '../context/TelemetryContext';
import { Play, Pause, FastForward, RotateCcw, AlertTriangle, ChevronRight, Share2, Globe, Orbit, MousePointer2, Move, Clock, Info, Rocket, Orbit as OrbitIcon, Navigation, RotateCw, ZoomIn, Lock, Focus, Map as MapIcon, Compass, ShieldAlert, Zap, Layers, RefreshCw, ZoomOut, Gauge, X, Radio, Maximize2 } from 'lucide-react';
import { NavPill } from '../components/NavPill';
import './EarthPage.css';
import './EarthHeader.css';
import './ObjectCounter.css';
import './TimeControl.css';
import './TelemetryDossier.css';

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
      {/* ── Top Aerospace Navigation Bar (Unified Responsive Container) ── */}
      <header className="fixed top-2.5 sm:top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex flex-col items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-slate-900/90 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl max-w-[96vw]">
        {/* Main Navigation Strip */}
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <NavPill conjCount={conjCount} />
        </div>

        {/* Mobile & Tablet Sub-Row (Contained inside same flex wrapper = Zero overlap on iPad Pro / Tablets) */}
        <div className="flex min-[1200px]:hidden items-center justify-between gap-2 pt-1 border-t border-white/10 w-full px-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('3D')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
                activeTab === '3D' ? 'bg-cyan-600 text-white shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-2.5 h-2.5" />
              <span>3D</span>
            </button>
            <button
              onClick={() => setActiveTab('2D')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
                activeTab === '2D' ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Orbit className="w-2.5 h-2.5" />
              <span>2D</span>
            </button>
            <button
              onClick={() => setActiveTab('CATALOG')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
                activeTab === 'CATALOG' ? 'bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-2.5 h-2.5" />
              <span>Registry</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/10 text-[9px] font-mono text-slate-300 shrink-0">
            <span className="flex items-center gap-0.5 text-[#00ff66]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff66]" />
              {activeSatsCount}
            </span>
            <span className="flex items-center gap-0.5 text-[#ff4466]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff2244]" />
              {debrisCount}
            </span>
            <span className="flex items-center gap-0.5 text-[#33aaff]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0088ff]" />
              {rbCount}
            </span>
          </div>
        </div>
      </header>

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
          <div className="earth-header">
            {/* Title + LIVE */}
            <div className="eh-title-row">
              <h1>EARTH</h1>
              <span className="eh-live-badge">
                <span className="eh-dot"></span>
                Live
              </span>
            </div>

            {/* Subtitle */}
            <div className="eh-subtitle">Orbital Debris &amp; Satellite Tracker</div>

            {/* Nav buttons */}
            <nav className="eh-nav-row">
              <button 
                className={`eh-nav-btn ${activeTab === '3D' ? 'active' : ''}`}
                onClick={() => setActiveTab('3D')}
              >
                {/* Globe icon */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <path d="M3.6 9h16.8M3.6 15h16.8"/>
                  <path d="M12 3c-2.5 3.5-2.5 14.5 0 18M12 3c2.5 3.5 2.5 14.5 0 18"/>
                </svg>
                3D Earth
              </button>

              <button 
                className={`eh-nav-btn ${activeTab === '2D' ? 'active' : ''}`}
                onClick={() => setActiveTab('2D')}
              >
                {/* Orbit icon */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="12" rx="10" ry="4.5"/>
                  <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
                </svg>
                2D Plane
              </button>

              <button 
                className={`eh-nav-btn ${activeTab === 'CATALOG' ? 'active' : ''}`}
                onClick={() => setActiveTab('CATALOG')}
              >
                {/* List icon */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
                </svg>
                Registry
                <span className="eh-badge-count">{objects.length}</span>
              </button>
            </nav>
          </div>

          {/* Top Right - Status Counter & Color Legend */}
          <div className="object-counter">
            {/* Total header */}
            <div className="oc-total-row">
              <span className="oc-total-label">Objects Tracked</span>
              <div className="oc-total-value">
                <span className="oc-total-number">{objects.length.toLocaleString()}</span>
                <span className="oc-total-word">Total</span>
              </div>
            </div>

            {/* Categories */}
            <div className="oc-category-list">
              {/* Satellites */}
              <div className="oc-cat-row">
                <div className="oc-cat-left">
                  <span className="oc-cat-dot green"></span>
                  <span className="oc-cat-label">Satellites</span>
                </div>
                <span className="oc-cat-count green">{activeSatsCount.toLocaleString()}</span>
              </div>

              {/* Space Debris */}
              <div className="oc-cat-row">
                <div className="oc-cat-left">
                  <span className="oc-cat-dot red"></span>
                  <span className="oc-cat-label">Space Debris</span>
                </div>
                <span className="oc-cat-count red">{debrisCount.toLocaleString()}</span>
              </div>

              {/* Rocket Bodies */}
              <div className="oc-cat-row">
                <div className="oc-cat-left">
                  <span className="oc-cat-dot blue"></span>
                  <span className="oc-cat-label">Rocket Bodies</span>
                </div>
                <span className="oc-cat-count blue">{rbCount.toLocaleString()}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="oc-counter-footer">
              <span className="oc-cf-label">CelesTrak · LEO Snapshot</span>
              <span className="oc-cf-live">
                <span className="oc-dot"></span>
                Synced Live
              </span>
            </div>
          </div>

          {/* Bottom Left - Camera Zoom Controls & Sim Speed */}
          <div className="control-bar" role="toolbar" aria-label="Viewport controls">
            {/* Zoom In */}
            <button className="tc-icon-btn" onClick={() => triggerZoom('IN')} title="Zoom in" aria-label="Zoom in">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.35-4.35"/>
                <path d="M11 8v6M8 11h6"/>
              </svg>
            </button>

            {/* Zoom Out */}
            <button className="tc-icon-btn" onClick={() => triggerZoom('OUT')} title="Zoom out" aria-label="Zoom out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.35-4.35"/>
                <path d="M8 11h6"/>
              </svg>
            </button>

            {/* Reset */}
            <button className="tc-icon-btn" onClick={() => triggerZoom('RESET')} title="Reset view" aria-label="Reset view">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>

            {/* Divider */}
            <div className="tc-divider" aria-hidden="true"></div>

            {/* Speed controls */}
            <div className="tc-speed-group" role="group" aria-label="Simulation speed">
              <span className="tc-speed-prefix">Speed</span>
              {[1, 30, 60, 150].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimSpeed(spd)}
                  className={`tc-speed-btn ${simSpeed === spd ? 'active' : ''}`}
                >
                  {spd}×
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
            <div className="telemetry-dossier">
              {/* Header bar */}
              <div className="td-dossier-head">
                <div className="td-dossier-head-left">
                  <span className="td-head-dot"></span>
                  <span className="td-dossier-title">Telemetry Dossier</span>
                </div>
                <button className="td-close-btn" onClick={() => setSelectedObject(null)} aria-label="Close">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18"/>
                  </svg>
                </button>
              </div>

              {/* Object name */}
              <div className="td-object-name">
                <span className="td-object-id" title={selectedObject.name}>{selectedObject.name}</span>
              </div>

              {/* Data rows */}
              <div className="td-data-table">
                <div className="td-data-row">
                  <span className="td-data-key">Object</span>
                  <span className="td-data-val lime">{selectedObject.name}</span>
                </div>

                <div className="td-data-row">
                  <span className="td-data-key">Type</span>
                  <span className="td-type-badge">{selectedObject.classification.replace('_', ' ')}</span>
                </div>

                <div className="td-data-row">
                  <span className="td-data-key">Regime</span>
                  <span className="td-data-val muted">{getOrbitType(selectedObject.altitudeKm || 400, selectedObject.periodMin)}</span>
                </div>

                <div className="td-data-row">
                  <span className="td-data-key">Altitude</span>
                  <span className="td-data-val">
                    {selectedObject.altitudeKm ? selectedObject.altitudeKm.toFixed(1) : '420.0'} <span style={{fontSize:'10.5px',color:'var(--td-muted)'}}>km</span>
                  </span>
                </div>

                <div className="td-data-row">
                  <span className="td-data-key">Velocity</span>
                  <span className="td-data-val">
                    {selectedObject.speedKmS ? selectedObject.speedKmS.toFixed(2) : '7.66'} <span style={{fontSize:'10.5px',color:'var(--td-muted)'}}>km/s</span>
                  </span>
                </div>

                <div className="td-data-row">
                  <span className="td-data-key">Inclination</span>
                  <span className="td-data-val">
                    {selectedObject.inclinationDeg ? selectedObject.inclinationDeg.toFixed(1) : '51.6'}°
                  </span>
                </div>

                <div className="td-data-row" style={{ borderBottom: 'none' }}>
                  <span className="td-data-key">Status</span>
                  <span className="td-status-val">
                    <span className="td-sdot"></span>
                    Tracked (Live)
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="td-dossier-foot">
                <button className="td-btn-full" onClick={() => setIsDossierOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                  </svg>
                  Full Dossier
                </button>
                <button className="td-btn-2d" onClick={() => setActiveTab('2D')} title="View 2D Orbital Plane">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="12" rx="10" ry="4.5"/>
                    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
                  </svg>
                  2D View
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2D Orbit Plane Modal / Overlay ─────────────────────── */}
      {activeTab === '2D' && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-8 bg-slate-950/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <Orbit2DView
            objects={objects}
            selectedConjunction={selectedConjunction}
            selectedObject={selectedObject}
            syncState={conjunctionSyncState}
            onSelectObject={(obj) => {
              setSelectedObject(obj);
              setIsDossierOpen(true);
            }}
            onResetSync={handleResetSync}
            onClose={() => setActiveTab('3D')}
            simSpeed={simSpeed}
          />
        </div>
      )}

      {/* ── Catalog Registry Modal / Overlay ───────────────────── */}
      {activeTab === 'CATALOG' && (
        <div className="fixed inset-0 z-50 bg-[#071019] animate-in fade-in duration-200">
          <TrackedObjectsCatalog
            objects={objects}
            onSelectObject={(obj) => {
              setSelectedObject(obj);
              setIsDossierOpen(true);
            }}
            onClose={() => setActiveTab('3D')}
          />
        </div>
      )}
    </div>
  );
}

export default EarthPage;

