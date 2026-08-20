import React, { useState, useMemo } from 'react';
import {
  X,
  Crosshair,
  Gauge,
  Layers,
  Zap,
  ShieldAlert,
  Radio,
  Copy,
  Check,
  Flame,
  Globe2,
  Orbit,
  Trash2,
  Rocket,
  ArrowUpRight,
  Activity,
  Sliders,
  Sparkles
} from 'lucide-react';
import { TrackedObjectSummary, ConjunctionEvent } from '../types';

interface SatelliteDossierModalProps {
  object: TrackedObjectSummary | null;
  conjunctions: ConjunctionEvent[];
  isOpen: boolean;
  onClose: () => void;
  onTrackIn3D?: (obj: TrackedObjectSummary) => void;
  onSwitchTo2D?: (obj: TrackedObjectSummary) => void;
}

export const SatelliteDossierModal: React.FC<SatelliteDossierModalProps> = React.memo(({
  object,
  conjunctions = [],
  isOpen,
  onClose,
  onTrackIn3D,
  onSwitchTo2D
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'EPHEMERIS' | 'HAZARDS' | 'BURN_SIM'>('OVERVIEW');
  const [copied, setCopied] = useState(false);
  const [deltaVInput, setDeltaVInput] = useState<number>(10); // m/s
  const [burnDirection, setBurnDirection] = useState<'PROGRADE' | 'RETROGRADE'>('PROGRADE');

  if (!isOpen || !object) return null;

  const isDebris = object.classification === 'DEBRIS';
  const isRocketBody = object.classification === 'ROCKET_BODY';
  const isActive = object.classification === 'ACTIVE_SATELLITE';

  // Find any active conjunction involving this object
  const activeHazard = conjunctions.find(
    (c) => c.objectA?.id === object.id || c.objectB?.id === object.id
  );

  const speedKmS = object.speedKmS ?? 7.68;
  const speedKmH = speedKmS * 3600;
  const speedMph = speedKmH * 0.621371;
  const speedMach = speedKmH / 1234.8; // Sea-level acoustic benchmark

  // Kinetic energy calculations
  const estMassKg = isDebris ? 8.5 : isRocketBody ? 2400 : 1500;
  const kineticEnergyMJ = (0.5 * estMassKg * Math.pow(speedKmS * 1000, 2)) / 1e6;
  const tntEquivalentKg = kineticEnergyMJ / 4.184;

  // Evasive maneuver delta-r calculation: delta_r = 2 * r * (delta_v / v)
  const semiMajorKm = ((object.perigeeKm || 400) + (object.apogeeKm || 600)) / 2 + 6378.137;
  const altitudeShiftKm = 2 * semiMajorKm * ((deltaVInput / 1000) / speedKmS);
  const estFuelConsumptionKg = (estMassKg * (1 - Math.exp(-deltaVInput / (9.81 * 220)))); // Isp ~220s for hydrazine

  const handleCopy = () => {
    const text =
      `SPACE OBJECT INTELLIGENCE DOSSIER\n` +
      `---------------------------------\n` +
      `Object Name: ${object.name}\n` +
      `NORAD Catalog ID: ${object.noradId}\n` +
      `Classification: ${object.classification}\n` +
      `Orbital Velocity: ${speedKmS.toFixed(2)} km/s (${speedKmH.toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h / Mach ${speedMach.toFixed(1)})\n` +
      `Mean Altitude: ${(object.altitudeKm ?? 0).toFixed(1)} km\n` +
      `Perigee x Apogee: ${(object.perigeeKm ?? 0).toFixed(1)} km x ${(object.apogeeKm ?? 0).toFixed(1)} km\n` +
      `Inclination: ${(object.inclinationDeg ?? 0).toFixed(2)} deg\n` +
      `Period: ${(object.periodMin ?? 0).toFixed(1)} min (${(1440 / Math.max(1, object.periodMin ?? 90)).toFixed(2)} rev/day)\n` +
      `Estimated Mass: ~${estMassKg} kg\n` +
      `Kinetic Energy: ${kineticEnergyMJ.toFixed(1)} MJ (~${tntEquivalentKg.toFixed(1)} kg TNT equiv)\n` +
      `ECI Position (km): X=${object.currentPosition?.x?.toFixed(1) ?? 'N/A'}, Y=${object.currentPosition?.y?.toFixed(1) ?? 'N/A'}, Z=${object.currentPosition?.z?.toFixed(1) ?? 'N/A'}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="satellite-dossier-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${
                isDebris
                  ? 'bg-slate-800 border-slate-600 text-slate-200'
                  : isRocketBody
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-400'
                  : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-400'
              }`}
            >
              {isDebris ? (
                <Trash2 className="w-5 h-5" />
              ) : isRocketBody ? (
                <Rocket className="w-5 h-5" />
              ) : (
                <Radio className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                    isDebris
                      ? 'bg-slate-800 text-slate-300 border-slate-700'
                      : isRocketBody
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  }`}
                >
                  {object.classification.replace('_', ' ')}
                </span>
                <span className="text-xs font-mono text-slate-400 font-semibold">
                  NORAD #{object.noradId}
                </span>
                {activeHazard && (
                  <span className="bg-rose-600 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                    <ShieldAlert className="w-3 h-3" />
                    CONJUNCTION HAZARD
                  </span>
                )}
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide mt-1 font-sans truncate">
                {object.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            title="Close Dossier"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'OVERVIEW'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Overview & Dynamics</span>
          </button>
          <button
            onClick={() => setActiveTab('EPHEMERIS')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'EPHEMERIS'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Orbit className="w-3.5 h-3.5" />
            <span>Keplerian Ephemeris</span>
          </button>
          <button
            onClick={() => setActiveTab('HAZARDS')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'HAZARDS'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Safety & Hazards</span>
          </button>
          <button
            onClick={() => setActiveTab('BURN_SIM')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === 'BURN_SIM'
                ? 'bg-amber-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Evasive Burn Planner</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-200 flex-1">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              {/* Velocity & Mechanics Grid */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Orbital Kinematics & Energy
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                    HYPERVELOCITY
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Velocity</div>
                    <div className="text-lg font-black text-cyan-300 font-mono mt-0.5">
                      {speedKmS.toFixed(2)} <span className="text-xs font-normal text-slate-400">km/s</span>
                    </div>
                  </div>
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Mach Equiv.</div>
                    <div className="text-lg font-black text-amber-300 font-mono mt-0.5">
                      Mach {speedMach.toFixed(1)}
                    </div>
                  </div>
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Ground Speed</div>
                    <div className="text-sm font-bold text-slate-200 font-mono mt-1">
                      {speedKmH.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                      <span className="text-[10px] text-slate-400">km/h</span>
                    </div>
                  </div>
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-mono">Kinetic Energy</div>
                    <div className="text-sm font-bold text-rose-400 font-mono mt-1">
                      {kineticEnergyMJ.toFixed(1)}{' '}
                      <span className="text-[10px] text-slate-400">MJ</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span>Impact Energy Equivalence:</span>
                  <span className="font-mono font-bold text-rose-300">
                    ~{tntEquivalentKg.toFixed(1)} kg TNT detonation
                  </span>
                </div>
              </div>

              {/* Spatial Coordinates Quick View */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe2 className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Geographic Sub-Point
                    </h4>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Latitude:</span>
                    <span className="font-mono text-emerald-300 font-bold">
                      {(object.lat ?? 0).toFixed(2)}&deg; {((object.lat ?? 0) >= 0 ? 'N' : 'S')}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-slate-400">Longitude:</span>
                    <span className="font-mono text-emerald-300 font-bold">
                      {(object.lng ?? 0).toFixed(2)}&deg; {((object.lng ?? 0) >= 0 ? 'E' : 'W')}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Orbit className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Altitude & Period
                    </h4>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Altitude:</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {(object.altitudeKm ?? 0).toFixed(1)} km
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-slate-400">Period:</span>
                    <span className="font-mono text-slate-200 font-bold">
                      {(object.periodMin ?? 0).toFixed(1)} min
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KEPLERIAN EPHEMERIS */}
          {activeTab === 'EPHEMERIS' && (
            <div className="space-y-4">
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <Orbit className="w-4 h-4 text-blue-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    6-Parameter Keplerian State Vector
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono">Semi-Major Axis (a)</span>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {semiMajorKm.toFixed(1)} km
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono">Inclination (i)</span>
                    <div className="text-sm font-bold text-white font-mono mt-0.5">
                      {(object.inclinationDeg ?? 0).toFixed(2)}&deg;
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono">Perigee (Lowest Point)</span>
                    <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">
                      {(object.perigeeKm ?? 0).toFixed(1)} km
                    </div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-mono">Apogee (Highest Point)</span>
                    <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">
                      {(object.apogeeKm ?? 0).toFixed(1)} km
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Orbital Period:</span>
                    <span className="font-mono text-slate-200">
                      {(object.periodMin ?? 0).toFixed(1)} minutes ({(1440 / Math.max(1, object.periodMin ?? 90)).toFixed(2)} rev/day)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">ECI Coordinates:</span>
                    <span className="font-mono text-slate-300">
                      X: {object.currentPosition?.x?.toFixed(1) ?? 'N/A'}, Y: {object.currentPosition?.y?.toFixed(1) ?? 'N/A'}, Z: {object.currentPosition?.z?.toFixed(1) ?? 'N/A'} km
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SAFETY & HAZARDS */}
          {activeTab === 'HAZARDS' && (
            <div className="space-y-4">
              {activeHazard ? (
                <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-rose-400" />
                      <h4 className="font-bold text-rose-300 text-sm">
                        Conjunction Encounter Detected
                      </h4>
                    </div>
                    <span className="px-2.5 py-0.5 bg-rose-600 text-white text-xs font-bold rounded">
                      {activeHazard.riskLevel} RISK
                    </span>
                  </div>

                  <div className="text-xs text-slate-200 font-mono space-y-1 bg-slate-950/60 p-3 rounded-xl border border-rose-500/20">
                    <div>
                      Target Intersect: <strong className="text-white">{activeHazard.objectA?.id === object.id ? activeHazard.objectB?.name : activeHazard.objectA?.name}</strong>
                    </div>
                    <div>
                      Minimum Miss Distance: <strong className="text-rose-400">{(activeHazard.minDistanceKm ?? 0).toFixed(2)} km</strong>
                    </div>
                    <div>
                      Relative Encounter Velocity: <strong className="text-amber-300">{(activeHazard.relativeVelocityKmS ?? 0).toFixed(2)} km/s</strong>
                    </div>
                    <div>
                      TCA Timestamp: {activeHazard.tcaIso ? new Date(activeHazard.tcaIso).toLocaleString() : 'Within 24h propagation window'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-xs text-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                  <div>
                    <strong className="block text-emerald-200">Nominal Flight Safety Profile</strong>
                    No critical collision hazard or conjunction threat detected in the next 24-hour propagation window.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EVASIVE BURN PLANNER */}
          {activeTab === 'BURN_SIM' && (
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Maneuver Simulation (&Delta;V Impulse)
                  </h4>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px]">
                  <button
                    onClick={() => setBurnDirection('PROGRADE')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      burnDirection === 'PROGRADE' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Prograde (+Alt)
                  </button>
                  <button
                    onClick={() => setBurnDirection('RETROGRADE')}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      burnDirection === 'RETROGRADE' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Retrograde (-Alt)
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs text-slate-300 mb-1.5">
                  <span>Delta-V Impulse:</span>
                  <span className="font-mono font-bold text-amber-400">{deltaVInput} m/s</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={deltaVInput}
                  onChange={(e) => setDeltaVInput(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] uppercase font-mono">Induced Altitude Shift</span>
                  <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                    {burnDirection === 'PROGRADE' ? '+' : '-'}{altitudeShiftKm.toFixed(1)} km
                  </div>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] uppercase font-mono">Est. Fuel Expended</span>
                  <div className="text-sm font-bold text-slate-200 font-mono mt-0.5">
                    {estFuelConsumptionKg.toFixed(2)} kg
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleCopy}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-2 transition-all"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied Dossier!' : 'Copy Dossier'}</span>
          </button>

          <div className="flex items-center gap-2">
            {onSwitchTo2D && (
              <button
                onClick={() => {
                  onSwitchTo2D(object);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all"
              >
                <Orbit className="w-4 h-4 text-cyan-400" />
                <span>2D Orbit Plane</span>
              </button>
            )}

            {onTrackIn3D && (
              <button
                onClick={() => {
                  onTrackIn3D(object);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
              >
                <Crosshair className="w-4 h-4" />
                <span>Lock in 3D</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
