import React, { useState } from 'react';
import {
  Crosshair,
  Gauge,
  ShieldAlert,
  Radio,
  Copy,
  Check,
  Flame,
  Globe2,
  Orbit,
  Trash2,
  Rocket
} from 'lucide-react';
import { TrackedObjectSummary, ConjunctionEvent } from '../types';

interface SatelliteDossierInlineProps {
  object: TrackedObjectSummary;
  conjunctions: ConjunctionEvent[];
  onTrackIn3D?: (obj: TrackedObjectSummary) => void;
  onSwitchTo2D?: (obj: TrackedObjectSummary) => void;
}

export const SatelliteDossierInline: React.FC<SatelliteDossierInlineProps> = React.memo(({
  object,
  conjunctions = [],
  onTrackIn3D,
  onSwitchTo2D
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'EPHEMERIS' | 'HAZARDS' | 'BURN_SIM'>('OVERVIEW');
  const [copied, setCopied] = useState(false);
  const [deltaVInput, setDeltaVInput] = useState<number>(10);
  const [burnDirection, setBurnDirection] = useState<'PROGRADE' | 'RETROGRADE'>('PROGRADE');

  const isDebris = object.classification === 'DEBRIS';
  const isRocketBody = object.classification === 'ROCKET_BODY';

  const activeHazard = conjunctions.find(
    (c) => c.objectA?.id === object.id || c.objectB?.id === object.id
  );

  const speedKmS = object.speedKmS ?? 7.68;
  const speedKmH = speedKmS * 3600;
  const speedMach = speedKmH / 1234.8; 

  const estMassKg = isDebris ? 8.5 : isRocketBody ? 2400 : 1500;
  const kineticEnergyMJ = (0.5 * estMassKg * Math.pow(speedKmS * 1000, 2)) / 1e6;
  const tntEquivalentKg = kineticEnergyMJ / 4.184;

  const semiMajorKm = ((object.perigeeKm || 400) + (object.apogeeKm || 600)) / 2 + 6378.137;
  const altitudeShiftKm = 2 * semiMajorKm * ((deltaVInput / 1000) / speedKmS);
  const estFuelConsumptionKg = (estMassKg * (1 - Math.exp(-deltaVInput / (9.81 * 220))));

  const handleCopy = () => {
    const text =
      `SPACE OBJECT INTELLIGENCE DOSSIER\n` +
      `---------------------------------\n` +
      `Object Name: ${object.name}\n` +
      `NORAD Catalog ID: ${object.noradId}\n` +
      `Classification: ${object.classification}\n` +
      `Orbital Velocity: ${speedKmS.toFixed(2)} km/s\n` +
      `Estimated Mass: ~${estMassKg} kg`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#0b1720]/80 border border-white/12 rounded-[28px] overflow-hidden flex flex-col w-full text-slate-100 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 bg-black/20 flex items-start justify-between gap-4">
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
            {isDebris ? <Trash2 className="w-5 h-5" /> : isRocketBody ? <Rocket className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                  isDebris ? 'bg-slate-800 text-slate-300 border-slate-700'
                  : isRocketBody ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
              }`}>
                {object.classification.replace('_', ' ')}
              </span>
              <span className="text-xs font-mono text-slate-400 font-semibold">NORAD #{object.noradId}</span>
              {activeHazard && (
                <span className="bg-[#f18b78] text-[#172116] text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  CONJUNCTION HAZARD
                </span>
              )}
            </div>
            <h3 className="text-lg sm:text-xl font-bold tracking-wide mt-1 font-[Georgia,serif] truncate text-[#f2f3ee]">
              {object.name}
            </h3>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 py-2.5 bg-black/10 border-b border-white/10 overflow-x-auto text-xs font-medium">
        {[
          { id: 'OVERVIEW', label: 'Overview & Dynamics', Icon: Gauge },
          { id: 'EPHEMERIS', label: 'Keplerian Ephemeris', Icon: Orbit },
          { id: 'HAZARDS', label: 'Safety & Hazards', Icon: ShieldAlert },
          { id: 'BURN_SIM', label: 'Evasive Burn Planner', Icon: Flame }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-[#cbd98a] text-[#172116] font-bold shadow'
                : 'text-[#9ca89f] hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.Icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? '' : tab.id === 'BURN_SIM' ? 'text-amber-400' : ''}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5 overflow-y-auto space-y-4 text-slate-200">
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Orbital Kinematics & Energy</h4>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">HYPERVELOCITY</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Velocity</div>
                  <div className="text-lg font-black text-cyan-300 font-mono mt-0.5">{speedKmS.toFixed(2)} <span className="text-xs font-normal text-slate-400">km/s</span></div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Mach Equiv.</div>
                  <div className="text-lg font-black text-amber-300 font-mono mt-0.5">Mach {speedMach.toFixed(1)}</div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Ground Speed</div>
                  <div className="text-sm font-bold text-slate-200 font-mono mt-1">{speedKmH.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">km/h</span></div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Kinetic Energy</div>
                  <div className="text-sm font-bold text-[#f18b78] font-mono mt-1">{kineticEnergyMJ.toFixed(1)} <span className="text-[10px] text-slate-400">MJ</span></div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Globe2 className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Geographic Sub-Point</h4>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-white/10">
                  <span className="text-slate-400">Latitude:</span>
                  <span className="font-mono text-emerald-300 font-bold">{(object.lat ?? 0).toFixed(2)}&deg;</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-400">Longitude:</span>
                  <span className="font-mono text-emerald-300 font-bold">{(object.lng ?? 0).toFixed(2)}&deg;</span>
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Orbit className="w-4 h-4 text-blue-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Altitude & Period</h4>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-white/10">
                  <span className="text-slate-400">Altitude:</span>
                  <span className="font-mono text-blue-400 font-bold">{(object.altitudeKm ?? 0).toFixed(1)} km</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-400">Period:</span>
                  <span className="font-mono text-slate-200 font-bold">{(object.periodMin ?? 0).toFixed(1)} min</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'EPHEMERIS' && (
          <div className="space-y-4">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-2.5">
              <div className="flex items-center gap-2 mb-2">
                <Orbit className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">6-Parameter Keplerian State Vector</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-mono">Semi-Major Axis (a)</span>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">{semiMajorKm.toFixed(1)} km</div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-mono">Inclination (i)</span>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">{(object.inclinationDeg ?? 0).toFixed(2)}&deg;</div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-mono">Perigee (Lowest Point)</span>
                  <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">{(object.perigeeKm ?? 0).toFixed(1)} km</div>
                </div>
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <span className="text-slate-400 text-[10px] uppercase font-mono">Apogee (Highest Point)</span>
                  <div className="text-sm font-bold text-cyan-300 font-mono mt-0.5">{(object.apogeeKm ?? 0).toFixed(1)} km</div>
                </div>
              </div>
              <div className="pt-2 border-t border-white/10 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-400">ECI Coordinates:</span>
                  <span className="font-mono text-slate-300">
                    X: {object.currentPosition?.x?.toFixed(1) ?? 'N/A'}, Y: {object.currentPosition?.y?.toFixed(1) ?? 'N/A'}, Z: {object.currentPosition?.z?.toFixed(1) ?? 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'HAZARDS' && (
          <div className="space-y-4">
            {activeHazard ? (
              <div className="p-4 bg-[#f18b78]/10 border border-[#f18b78]/40 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-[#f18b78]" />
                    <h4 className="font-bold text-[#f18b78] text-sm">Conjunction Encounter Detected</h4>
                  </div>
                  <span className="px-2.5 py-0.5 bg-[#f18b78] text-[#172116] text-xs font-bold rounded">{activeHazard.riskLevel} RISK</span>
                </div>
                <div className="text-xs text-slate-200 font-mono space-y-1 bg-black/20 p-3 rounded-xl border border-[#f18b78]/20">
                  <div>Target Intersect: <strong className="text-white">{activeHazard.objectA?.id === object.id ? activeHazard.objectB?.name : activeHazard.objectA?.name}</strong></div>
                  <div>Minimum Miss Distance: <strong className="text-[#f18b78]">{(activeHazard.minDistanceKm ?? 0).toFixed(2)} km</strong></div>
                  <div>Relative Encounter Velocity: <strong className="text-[#e8894a]">{(activeHazard.relativeVelocityKmS ?? 0).toFixed(2)} km/s</strong></div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#cbd98a]/10 border border-[#cbd98a]/30 rounded-2xl flex items-center gap-3 text-xs text-[#cbd98a]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#cbd98a] shrink-0" />
                <div><strong className="block text-[#d9e68e]">Nominal Flight Safety Profile</strong>No critical collision hazard detected.</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'BURN_SIM' && (
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Maneuver Simulation (&Delta;V Impulse)</h4>
              </div>
              <div className="flex items-center gap-1 bg-black/30 p-1 rounded-lg border border-white/10 text-[10px]">
                <button onClick={() => setBurnDirection('PROGRADE')} className={`px-2 py-0.5 rounded font-bold transition-all ${burnDirection === 'PROGRADE' ? 'bg-[#e8894a] text-black' : 'text-slate-400 hover:text-white'}`}>Prograde (+Alt)</button>
                <button onClick={() => setBurnDirection('RETROGRADE')} className={`px-2 py-0.5 rounded font-bold transition-all ${burnDirection === 'RETROGRADE' ? 'bg-[#e8894a] text-black' : 'text-slate-400 hover:text-white'}`}>Retrograde (-Alt)</button>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center text-xs text-slate-300 mb-1.5">
                <span>Delta-V Impulse:</span>
                <span className="font-mono font-bold text-amber-400">{deltaVInput} m/s</span>
              </div>
              <input type="range" min="1" max="50" value={deltaVInput} onChange={(e) => setDeltaVInput(Number(e.target.value))} className="w-full accent-[#e8894a] h-1.5 bg-black/40 rounded-lg cursor-pointer" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 text-[10px] uppercase font-mono">Induced Altitude Shift</span>
                <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">{burnDirection === 'PROGRADE' ? '+' : '-'}{altitudeShiftKm.toFixed(1)} km</div>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-slate-400 text-[10px] uppercase font-mono">Est. Fuel Expended</span>
                <div className="text-sm font-bold text-slate-200 font-mono mt-0.5">{estFuelConsumptionKg.toFixed(2)} kg</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 bg-black/20 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
        <button onClick={handleCopy} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium flex items-center gap-2 transition-all">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied Dossier!' : 'Copy Dossier'}</span>
        </button>
        <div className="flex items-center gap-2">
          {onSwitchTo2D && (
            <button onClick={() => onSwitchTo2D(object)} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all">
              <Orbit className="w-4 h-4 text-cyan-400" />
              <span>2D Orbit Plane</span>
            </button>
          )}
          {onTrackIn3D && (
            <button onClick={() => onTrackIn3D(object)} className="px-4 py-2 rounded-xl bg-[#cbd98a] hover:bg-[#e1efa1] text-[#172116] text-xs font-semibold flex items-center gap-2 transition-all">
              <Crosshair className="w-4 h-4" />
              <span>Lock in 3D</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
