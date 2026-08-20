import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Compass,
  Layers,
  Cpu,
  Server,
  Zap,
  ShieldAlert,
  Sliders,
  Check,
  Copy,
  ChevronRight,
  Terminal,
  Orbit
} from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'ASTRODYNAMICS' | 'ARCHITECTURE' | 'RISK_MATH' | 'SCALING_BENCHMARK';

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('ASTRODYNAMICS');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Interactive Astrodynamics Orbit Calculator State
  const [calcAltitudeKm, setCalcAltitudeKm] = useState<number>(550);
  const [calcEccentricity, setCalcEccentricity] = useState<number>(0.001);

  // Interactive Risk Math Simulator State
  const [simDistanceKm, setSimDistanceKm] = useState<number>(3.5);
  const [simVelocityKmS, setSimVelocityKmS] = useState<number>(11.2);
  const [simTimeHours, setSimTimeHours] = useState<number>(4.5);

  // Interactive Scaling Benchmark Simulator State
  const [simFleetCount, setSimFleetCount] = useState<number>(50);

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(label);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // Astrodynamics Calculations
  const EARTH_RADIUS_KM = 6378.137;
  const MU_EARTH = 398600.4418; // km^3/s^2
  const rOrbit = EARTH_RADIUS_KM + calcAltitudeKm;
  const vCirc = Math.sqrt(MU_EARTH / rOrbit);
  const orbitalPeriodSec = 2 * Math.PI * Math.sqrt(Math.pow(rOrbit, 3) / MU_EARTH);
  const orbitalPeriodMin = orbitalPeriodSec / 60;
  const orbitsPerDay = (86400 / orbitalPeriodSec).toFixed(2);

  // Live Risk Calculation Math
  const distScore = Math.max(0, Math.min(100, ((15 - simDistanceKm) / 15) * 100));
  const velScore = Math.max(0, Math.min(100, (simVelocityKmS / 15) * 100));
  const timeScore = Math.max(0, Math.min(100, ((24 - simTimeHours) / 24) * 100));
  const totalRiskScore = Math.round(0.6 * distScore + 0.25 * velScore + 0.15 * timeScore);

  let riskTier = 'LOW';
  let riskColor = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  if (totalRiskScore >= 80) {
    riskTier = 'CRITICAL';
    riskColor = 'text-red-400 bg-red-500/10 border-red-500/30';
  } else if (totalRiskScore >= 60) {
    riskTier = 'HIGH';
    riskColor = 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  } else if (totalRiskScore >= 30) {
    riskTier = 'MEDIUM';
    riskColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  }

  // Scaling Benchmark Math
  const pairwiseComparisons = (simFleetCount * (simFleetCount - 1)) / 2;
  const total24hStepChecks = pairwiseComparisons * 1440; // 60s steps = 1440 per day
  const estimatedMemoryMB = ((simFleetCount * 1440 * 3 * 8) / (1024 * 1024)).toFixed(2);
  
  let recommendedArch = 'Tier 1: Single-Thread In-Memory (Node/V8)';
  let archBadgeColor = 'text-blue-400 border-blue-500/30 bg-blue-500/10';
  if (simFleetCount > 5000) {
    recommendedArch = 'Tier 3: Distributed Ray / GPU CUDA Vectorized SGP4';
    archBadgeColor = 'text-purple-400 border-purple-500/30 bg-purple-500/10';
  } else if (simFleetCount > 500) {
    recommendedArch = 'Tier 2: PostgreSQL + PostGIS 3D Spatial Octree Indexing';
    archBadgeColor = 'text-orange-400 border-orange-500/30 bg-orange-500/10';
  }

  return (
    <div
      id="architecture-spec-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#020617]/90"
      onClick={onClose}
    >
      <div
        id="architecture-spec-modal-window"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col text-slate-200 text-xs overflow-hidden"
        style={{ contain: 'paint' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                ASTRODYNAMICS SPEC & SYSTEM ARCHITECTURE
              </h3>
              <p className="text-[11px] text-slate-400">
                SGP4 Propagation Theory, ECI / TEME Frames, Real-Time Pipeline & Scaling Architecture
              </p>
            </div>
          </div>
          <button
            id="btn-close-arch-modal"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-700 cursor-pointer"
            title="Close Specification (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-950/50 border-b border-slate-800 shrink-0 overflow-x-auto">
          <button
            id="tab-astrodynamics-spec"
            onClick={() => setActiveTab('ASTRODYNAMICS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ASTRODYNAMICS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>1. Astrodynamics & Physics</span>
          </button>

          <button
            id="tab-system-arch"
            onClick={() => setActiveTab('ARCHITECTURE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ARCHITECTURE'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Pipeline & Architecture</span>
          </button>

          <button
            id="tab-risk-math"
            onClick={() => setActiveTab('RISK_MATH')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'RISK_MATH'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>3. Risk Prioritization Math</span>
          </button>

          <button
            id="tab-scaling-benchmark"
            onClick={() => setActiveTab('SCALING_BENCHMARK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'SCALING_BENCHMARK'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>4. Scaling Roadmap Simulator</span>
          </button>
        </div>

        {/* Scrollable Content Body with Butter-Smooth Performance */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 smooth-scroll text-slate-300">
          
          {/* TAB 1: ASTRODYNAMICS & PHYSICS CORE */}
          {activeTab === 'ASTRODYNAMICS' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Primary Coordinate Frame & Geoid Constants */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    Earth-Centered Inertial (ECI / TEME) Reference Frame
                  </h4>
                  <button
                    onClick={() => handleCopy(
                      'R_E = 6378.137 km\nmu = 398600.4418 km^3/s^2\nJ2 = 1.08263e-3\nJ3 = -2.53215e-6\nJ4 = -1.61099e-6\nFrame = True Equator, Mean Equinox (TEME)',
                      'constants'
                    )}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[10px] flex items-center gap-1 border border-slate-700 transition-colors"
                  >
                    {copiedSection === 'constants' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSection === 'constants' ? 'Copied' : 'Copy Constants'}</span>
                  </button>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 leading-relaxed">
                  <p className="text-slate-300">
                    All satellite and debris orbital positions are computed and rendered in the <strong className="text-cyan-400 font-mono">True Equator, Mean Equinox (TEME / ECI)</strong> coordinate system:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                        <Orbit className="w-3.5 h-3.5 text-cyan-400" />
                        ECI Reference Axes Definition
                      </div>
                      <div className="text-slate-400 space-y-1">
                        <div><span className="text-slate-200 font-bold">+X:</span> Vernal Equinox direction (First Point of Aries)</div>
                        <div><span className="text-slate-200 font-bold">+Y:</span> 90&deg; East in the equatorial plane</div>
                        <div><span className="text-slate-200 font-bold">+Z:</span> Earth True Rotation Axis (North Pole)</div>
                        <div><span className="text-slate-200 font-bold">Origin:</span> Earth's Center of Mass (0, 0, 0)</div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="text-blue-400 font-bold flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-blue-400" />
                        WGS-84 Planetary Constants
                      </div>
                      <div className="text-slate-400 space-y-1">
                        <div><span className="text-slate-200 font-bold">Equatorial Radius (R_E):</span> 6378.137 km</div>
                        <div><span className="text-slate-200 font-bold">Gravitational Param (&mu;):</span> 398600.4418 km&sup3;/s&sup2;</div>
                        <div><span className="text-slate-200 font-bold">Oblateness (J2):</span> 1.08263 &times; 10&minus;&sup3;</div>
                        <div><span className="text-slate-200 font-bold">Harmonics (J3, J4):</span> SGP4 perturbation model</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SGP4 Perturbations & Analytical Engine */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  SGP4 Analytical Perturbation Mechanics
                </h4>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <p className="text-slate-300 leading-relaxed">
                    The analytical <strong className="text-emerald-400">SGP4 / SDP4</strong> engine translates NORAD Two-Line Element (TLE) mean orbital elements into Cartesian ECI position and velocity state vectors r(t), v(t) while accounting for non-spherical gravitational and atmospheric forces:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-amber-400 font-bold mb-1">Earth Oblateness (J2)</div>
                      <p className="text-slate-400 leading-relaxed text-[10px]">
                        Drives nodal precession &Omega;&#775; (drift of ascending node) and apsidal rotation &omega;&#775; (precession of perigee).
                      </p>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-cyan-400 font-bold mb-1">Atmospheric Drag (B*)</div>
                      <p className="text-slate-400 leading-relaxed text-[10px]">
                        Dynamic drag modeling using the modified B* drag term, decaying semi-major axis a(t) over time in LEO orbits.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-purple-400 font-bold mb-1">Third-Body Gravity</div>
                      <p className="text-slate-400 leading-relaxed text-[10px]">
                        Deep-space perturbation models (SDP4) for HEO and GEO regimes influenced by Lunar and Solar gravitational resonance.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Orbital Mechanics Calculator */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  Interactive Astrodynamics Quick-Calculator
                </h4>

                <div className="bg-slate-950/90 border border-blue-500/30 rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400 font-medium">Orbital Altitude (LEO - GEO)</span>
                        <span className="font-mono font-bold text-cyan-400">{calcAltitudeKm} km</span>
                      </div>
                      <input
                        type="range"
                        min={200}
                        max={36000}
                        step={50}
                        value={calcAltitudeKm}
                        onChange={(e) => setCalcAltitudeKm(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400 font-medium">Eccentricity (e)</span>
                        <span className="font-mono font-bold text-purple-400">{calcEccentricity.toFixed(4)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.25}
                        step={0.001}
                        value={calcEccentricity}
                        onChange={(e) => setCalcEccentricity(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                      />
                    </div>
                  </div>

                  {/* Calculated Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Radius (r)</div>
                      <div className="text-sm font-mono font-bold text-white mt-0.5">{rOrbit.toFixed(1)} km</div>
                    </div>
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Circ. Velocity (v)</div>
                      <div className="text-sm font-mono font-bold text-cyan-400 mt-0.5">{vCirc.toFixed(3)} km/s</div>
                      <div className="text-[9px] font-mono text-slate-500">{(vCirc * 3600).toFixed(0)} km/h</div>
                    </div>
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Orbital Period (T)</div>
                      <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">{orbitalPeriodMin.toFixed(1)} min</div>
                    </div>
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Revolutions / Day</div>
                      <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">{orbitsPerDay} rev/day</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: SYSTEM ARCHITECTURE & PIPELINE */}
          {activeTab === 'ARCHITECTURE' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Architecture Dataflow Graph */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Full-Stack Architecture & Real-Time Telemetry Pipeline
                </h4>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-center text-[10px] font-mono">
                    
                    <div className="p-3 bg-slate-900 border border-cyan-500/30 rounded-xl flex flex-col justify-between">
                      <div className="font-bold text-cyan-400 text-xs mb-1">1. TLE Ingestion</div>
                      <p className="text-slate-400 text-[10px]">CelesTrak / Space-Track live ephemeris sync & parsing</p>
                      <div className="mt-2 text-[9px] text-cyan-300 font-bold bg-cyan-950/50 py-0.5 rounded border border-cyan-500/20">HTTP / REST</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-blue-500/30 rounded-xl flex flex-col justify-between">
                      <div className="font-bold text-blue-400 text-xs mb-1">2. SGP4 Engine</div>
                      <p className="text-slate-400 text-[10px]">Analytical state vector generator for N space objects</p>
                      <div className="mt-2 text-[9px] text-blue-300 font-bold bg-blue-950/50 py-0.5 rounded border border-blue-500/20">60s Grid Epochs</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-xl flex flex-col justify-between">
                      <div className="font-bold text-amber-400 text-xs mb-1">3. Conjunction Core</div>
                      <p className="text-slate-400 text-[10px]">Pairwise Euclidean search & 1s TCA sub-stepping</p>
                      <div className="mt-2 text-[9px] text-amber-300 font-bold bg-amber-950/50 py-0.5 rounded border border-amber-500/20">O(N&sup2;) &le; 15km</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-purple-500/30 rounded-xl flex flex-col justify-between">
                      <div className="font-bold text-purple-400 text-xs mb-1">4. Broadcast Stream</div>
                      <p className="text-slate-400 text-[10px]">WebSocket delta broadcast with heartbeat</p>
                      <div className="mt-2 text-[9px] text-purple-300 font-bold bg-purple-950/50 py-0.5 rounded border border-purple-500/20">WS 500ms Ping</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-emerald-500/30 rounded-xl flex flex-col justify-between">
                      <div className="font-bold text-emerald-400 text-xs mb-1">5. Visualizer</div>
                      <p className="text-slate-400 text-[10px]">Three.js 3D WebGL + 2D Vector Plane Canvas</p>
                      <div className="mt-2 text-[9px] text-emerald-300 font-bold bg-emerald-950/50 py-0.5 rounded border border-emerald-500/20">60 FPS Hardware</div>
                    </div>

                  </div>
                </div>
              </div>

              {/* Conjunction 2-Tier Pipeline Specification */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Two-Tier Conjunction Detection Specification
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      Tier 1: Coarse Grid Space Search (60s Steps)
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Propagates N trajectories at 60-second time increments over a 24-hour horizon (1,440 discrete epochs per object). Performs N(N - 1) / 2 pairwise Euclidean distance checks:
                    </p>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-cyan-300">
                      d(t) = || r_A(t) - r_B(t) || = sqrt((x_A - x_B)&sup2; + (y_A - y_B)&sup2; + (z_A - z_B)&sup2;)
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Flags all encounter events crossing the threshold d(t) &le; 15 km as conjunction candidates.
                    </p>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                      <span className="w-2 h-2 rounded-full bg-red-400" />
                      Tier 2: High-Resolution 1-Second Sub-Stepping
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      For each candidate event, the engine isolates a &plusmn;60s temporal window centered on the coarse minimum and evaluates state vectors at 1-second increments:
                    </p>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-red-300">
                      TCA = argmin(t &isin; [t0 - 60s, t0 + 60s]) || r_A(t) - r_B(t) ||
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Pins down the exact Time of Closest Approach (TCA), minimum miss distance, and 3D relative velocity vector v_rel = v_A - v_B.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: RISK PRIORITIZATION MATHEMATICS */}
          {activeTab === 'RISK_MATH' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Formula & Weighting Specification */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-orange-400" />
                  Explainable Collision-Risk Prioritization Metric
                </h4>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="bg-slate-900 border border-blue-500/30 p-3 rounded-xl text-center font-mono text-sm text-cyan-300 font-bold">
                    Risk Score = 0.60 &times; S_dist + 0.25 &times; S_vel + 0.15 &times; S_time
                  </div>

                  <p className="text-slate-300 leading-relaxed text-xs">
                    The risk formula generates an explainable scalar index from <strong className="text-white">0 to 100</strong>, factoring in Euclidean miss distance (60% weight), relative velocity impact energy (25% weight), and urgency/time-to-event (15% weight):
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <div className="text-cyan-400 font-bold">1. Distance Score (S_dist)</div>
                      <div className="text-slate-400 font-mono text-[10px]">Weight: 60%</div>
                      <p className="text-slate-300 font-mono text-[10px] leading-relaxed">
                        S_dist = max(0, ((15 - d_miss) / 15) &times; 100)
                      </p>
                      <p className="text-slate-500 text-[10px]">Linear decay from 0 km (100 pts) to 15 km threshold (0 pts).</p>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <div className="text-amber-400 font-bold">2. Velocity Score (S_vel)</div>
                      <div className="text-slate-400 font-mono text-[10px]">Weight: 25%</div>
                      <p className="text-slate-300 font-mono text-[10px] leading-relaxed">
                        S_vel = min(100, (v_rel / 15) &times; 100)
                      </p>
                      <p className="text-slate-500 text-[10px]">Scales kinetic collision hazard from 0 to 15 km/s hypervelocity.</p>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                      <div className="text-purple-400 font-bold">3. Time Score (S_time)</div>
                      <div className="text-slate-400 font-mono text-[10px]">Weight: 15%</div>
                      <p className="text-slate-300 font-mono text-[10px] leading-relaxed">
                        S_time = max(0, ((24 - &Delta;t_hours) / 24) &times; 100)
                      </p>
                      <p className="text-slate-500 text-[10px]">Prioritizes urgent close approaches occurring within immediate hours.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Risk Simulator */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Interactive Collision Risk Simulator
                </h4>

                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400">Miss Distance (d)</span>
                        <span className="font-mono font-bold text-cyan-400">{simDistanceKm.toFixed(2)} km</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={15}
                        step={0.1}
                        value={simDistanceKm}
                        onChange={(e) => setSimDistanceKm(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400">Relative Velocity (v_rel)</span>
                        <span className="font-mono font-bold text-amber-400">{simVelocityKmS.toFixed(1)} km/s</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={15}
                        step={0.1}
                        value={simVelocityKmS}
                        onChange={(e) => setSimVelocityKmS(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-400">Time to TCA (&Delta;t)</span>
                        <span className="font-mono font-bold text-purple-400">{simTimeHours.toFixed(1)} hrs</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={24}
                        step={0.2}
                        value={simTimeHours}
                        onChange={(e) => setSimTimeHours(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                      />
                    </div>
                  </div>

                  {/* Calculated Output HUD */}
                  <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-mono font-bold text-white">
                        {totalRiskScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${riskColor}`}>
                        {riskTier}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
                      <div>Dist Score: <span className="text-cyan-400 font-bold">{distScore.toFixed(1)}</span></div>
                      <div>Vel Score: <span className="text-amber-400 font-bold">{velScore.toFixed(1)}</span></div>
                      <div>Time Score: <span className="text-purple-400 font-bold">{timeScore.toFixed(1)}</span></div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: SCALING ROADMAP & BENCHMARK SIMULATOR */}
          {activeTab === 'SCALING_BENCHMARK' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Interactive Fleet Scale Simulator */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Interactive Fleet Scaling & Computational Load Calculator
                </h4>

                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400 font-semibold">Tracked Fleet Population (N)</span>
                      <span className="font-mono font-bold text-cyan-400 text-sm">{simFleetCount.toLocaleString()} Objects</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={15000}
                      step={20}
                      value={simFleetCount}
                      onChange={(e) => setSimFleetCount(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>

                  {/* Metrics HUD */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pairwise Combinations</div>
                      <div className="text-sm font-mono font-bold text-white mt-1">
                        {pairwiseComparisons.toLocaleString()}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">N(N - 1) / 2 pairs</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">24h Epoch Calculations</div>
                      <div className="text-sm font-mono font-bold text-amber-400 mt-1">
                        {(total24hStepChecks / 1_000_000).toFixed(2)}M
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">@ 60s step grid</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Ephemeris RAM Footprint</div>
                      <div className="text-sm font-mono font-bold text-cyan-400 mt-1">
                        {estimatedMemoryMB} MB
                      </div>
                      <div className="text-[9px] font-mono text-slate-500">3D Vector state</div>
                    </div>

                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Recommended Architecture</div>
                      <div className={`text-[10px] font-mono font-bold mt-1 px-1.5 py-0.5 rounded border ${archBadgeColor}`}>
                        {simFleetCount <= 500 ? 'Single Node' : simFleetCount <= 5000 ? 'PostGIS Octree' : 'GPU CUDA Ray'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3-Tier Production Architecture Roadmap */}
              <div className="space-y-3">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  3-Tier Production Architectural Roadmap
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  
                  {/* Tier 1 */}
                  <div className="bg-slate-950/80 border border-blue-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        TIER 1 (ACTIVE MVP)
                      </span>
                      <div className="font-bold text-white mt-2 text-xs">20 &ndash; 50 Tracked Objects</div>
                      <p className="text-slate-400 text-[10px] mt-1">Curated high-value satellites, rocket bodies & high-interest debris.</p>
                      
                      <ul className="mt-3 space-y-1.5 text-slate-300 list-disc list-inside text-[10px]">
                        <li>In-memory V8 ephemeris store</li>
                        <li>SGP4 Analytical Engine (O(N&sup2;) brute-force)</li>
                        <li>High-frequency WebSocket client streaming</li>
                        <li>Instant sub-100ms conjunction re-scan</li>
                      </ul>
                    </div>
                    <div className="text-[9px] font-mono text-blue-400 pt-2 border-t border-slate-800">
                      Latency: &lt; 50ms | Memory: &lt; 20MB
                    </div>
                  </div>

                  {/* Tier 2 */}
                  <div className="bg-slate-950/80 border border-orange-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        TIER 2 (MID-SCALE CATALOG)
                      </span>
                      <div className="font-bold text-white mt-2 text-xs">500 &ndash; 5,000 Tracked Objects</div>
                      <p className="text-slate-400 text-[10px] mt-1">Regional space traffic management & mega-constellations.</p>
                      
                      <ul className="mt-3 space-y-1.5 text-slate-300 list-disc list-inside text-[10px]">
                        <li>PostgreSQL + PostGIS 3D Spatial R-Tree Indexing</li>
                        <li>Dynamic Bounding Box & Octree coarse filter</li>
                        <li>Worker pool multithreading (Node cluster / Golang)</li>
                        <li>Automated Space-Track TLE cron ingestion</li>
                      </ul>
                    </div>
                    <div className="text-[9px] font-mono text-orange-400 pt-2 border-t border-slate-800">
                      Latency: &lt; 2s | Filter: 98% cull rate
                    </div>
                  </div>

                  {/* Tier 3 */}
                  <div className="bg-slate-950/80 border border-purple-500/30 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        TIER 3 (ENTERPRISE / SPACE FORCE)
                      </span>
                      <div className="font-bold text-white mt-2 text-xs">10,000 &ndash; 50,000+ Objects</div>
                      <p className="text-slate-400 text-[10px] mt-1">Complete NORAD public catalog & millimeter debris clouds.</p>
                      
                      <ul className="mt-3 space-y-1.5 text-slate-300 list-disc list-inside text-[10px]">
                        <li>Distributed Ray / Apache Spark cluster</li>
                        <li>GPU CUDA SIMD vectorized SGP4 kernel</li>
                        <li>3D Covariance Ellipsoids & P_c collision probability</li>
                        <li>Apache Kafka real-time event streaming pipeline</li>
                      </ul>
                    </div>
                    <div className="text-[9px] font-mono text-purple-400 pt-2 border-t border-slate-800">
                      Throughput: 1.2B pairs/sec (Nvidia H100)
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer with Quick Navigation & Actions */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SGP4 Core v2.4 • WGS-84 Coordinate Compliant</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const nextTab: Record<TabType, TabType> = {
                  ASTRODYNAMICS: 'ARCHITECTURE',
                  ARCHITECTURE: 'RISK_MATH',
                  RISK_MATH: 'SCALING_BENCHMARK',
                  SCALING_BENCHMARK: 'ASTRODYNAMICS'
                };
                setActiveTab(nextTab[activeTab]);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Next Section</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-md cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
