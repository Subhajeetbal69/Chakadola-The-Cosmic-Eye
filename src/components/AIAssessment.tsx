import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Play,
  ArrowRight,
  ShieldAlert,
  Gauge,
  Compass,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ConjunctionEvent } from '../types';

interface AIAssessmentProps {
  conjunction: ConjunctionEvent | null;
}

export const AIAssessment: React.FC<AIAssessmentProps> = ({ conjunction }) => {
  const [assessment, setAssessment] = useState<any>(null);
  const [isAssessing, setIsAssessing] = useState<boolean>(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // Simulation State
  const [burnDirection, setBurnDirection] = useState<'PROGRADE' | 'RETROGRADE' | 'RADIAL' | 'NORMAL'>('PROGRADE');
  const [burnMagnitude, setBurnMagnitude] = useState<number>(5.0);
  const [burnTime, setBurnTime] = useState<number>(12.0);
  const [simResult, setSimResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Cache assessments by conjunction ID to avoid spamming calls
  const [assessmentCache, setAssessmentCache] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!conjunction) {
      setAssessment(null);
      setSimResult(null);
      return;
    }

    if (assessmentCache[conjunction.id]) {
      setAssessment(assessmentCache[conjunction.id]);
      setAssessmentError(null);
    } else {
      setAssessment(null);
    }
    setSimResult(null);
    setSimError(null);
  }, [conjunction, assessmentCache]);

  const handleGenerateAssessment = async () => {
    if (!conjunction) return;

    setIsAssessing(true);
    setAssessmentError(null);

    try {
      const res = await fetch(`/api/conjunctions/${conjunction.id}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        throw new Error('Failed to communicate with the decision-support server.');
      }

      const data = await res.json();
      setAssessment(data);
      setAssessmentCache(prev => ({ ...prev, [conjunction.id]: data }));
    } catch (err: any) {
      setAssessmentError(err.message || 'Failed generating AI assessment.');
    } finally {
      setIsAssessing(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!conjunction) return;

    setIsSimulating(true);
    setSimError(null);
    setSimResult(null);

    try {
      const res = await fetch(`/api/conjunctions/${conjunction.id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          burnDirection,
          burnMagnitudeMs: burnMagnitude,
          burnTimeHoursBeforeTca: burnTime
        })
      });

      if (!res.ok) {
        throw new Error('Maneuver simulation failed on the server.');
      }

      const data = await res.json();
      setSimResult(data);
    } catch (err: any) {
      setSimError(err.message || 'Failed running burn simulation.');
    } finally {
      setIsSimulating(false);
    }
  };

  if (!conjunction) {
    return (
      <div className="bg-[#0c0e14] border border-white/5 rounded-2xl p-5 text-center text-gray-500 text-xs flex flex-col items-center justify-center shadow-2xl h-[200px]">
        <Sparkles className="w-6 h-6 text-gray-700 mb-1.5" />
        <p className="font-medium text-gray-400">Select a conjunction event to generate AI Tactical Assessment.</p>
      </div>
    );
  }

  // Render Status Badge
  const renderStatusBadge = (status: string) => {
    let style = 'bg-slate-800 text-slate-400 border-slate-700';
    if (status === 'HIGH_CONCERN' || status === 'ESCALATE_FOR_MANEUVER_ANALYSIS') {
      style = 'bg-rose-500/20 text-rose-300 border-rose-500/50';
    } else if (status === 'CLOSE_MONITORING') {
      style = 'bg-amber-500/20 text-amber-300 border-amber-500/50';
    } else if (status === 'MONITOR') {
      style = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/40';
    } else if (status === 'LOW_CONCERN') {
      style = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40';
    }

    return (
      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${style}`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div id="ai-assessment-panel" className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
      {/* Title */}
      <div className="flex justify-between items-center pb-2 border-b border-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          AI Threat Assessment (Gemini 3.5)
        </h3>
        {assessment && renderStatusBadge(assessment.assessment?.status || 'INSUFFICIENT_DATA')}
      </div>

      {/* Assessment Body */}
      {!assessment ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          {assessmentError && (
            <div className="text-[10px] text-rose-400 font-mono bg-rose-500/5 px-3 py-2 rounded-lg border border-rose-500/25 mb-3 w-full">
              {assessmentError}
            </div>
          )}
          <button
            onClick={handleGenerateAssessment}
            disabled={isAssessing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-500/10 disabled:opacity-50"
          >
            {isAssessing ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Running Tactical Diagnostics...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Trigger AI Conjunction Assessment</span>
              </>
            )}
          </button>
          <p className="text-[9px] text-slate-500 mt-2">
            Uses Gemini API to evaluate risk factors, historical anomalies, and candidate maneuvers.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-[11px] font-sans">
          {/* Headline & Summary */}
          <div className="space-y-1 bg-white/5 p-3 rounded-xl border border-white/5">
            <div className="font-bold text-white text-xs">{assessment.assessment?.headline}</div>
            <p className="text-slate-400 leading-relaxed text-[10px]">{assessment.assessment?.summary}</p>
          </div>

          {/* Risk Factors */}
          {assessment.risk_factors?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Identified Risk Drivers</span>
              <div className="flex flex-col gap-1.5">
                {assessment.risk_factors.map((rf: any, idx: number) => {
                  let badge = 'text-slate-400 bg-slate-800';
                  if (rf.impact === 'increases_concern') badge = 'text-rose-400 bg-rose-950/20 border border-rose-500/20';
                  else if (rf.impact === 'decreases_concern') badge = 'text-emerald-400 bg-emerald-950/20 border border-emerald-500/20';

                  return (
                    <div key={idx} className="bg-slate-950/60 p-2.5 rounded-lg border border-white/5 flex flex-col gap-0.5 font-mono">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-300 font-bold">{rf.factor}</span>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono ${badge}`}>
                          {rf.value}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-sans mt-0.5">{rf.explanation}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {assessment.recommended_actions?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Recommended Action Plan</span>
              <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1 font-mono text-[10px]">
                {assessment.recommended_actions.map((act: string, idx: number) => (
                  <li key={idx} className="leading-relaxed"><span className="font-sans text-slate-300">{act}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Confidence & Limitations */}
          <div className="grid grid-cols-2 gap-2 text-[9px] border-t border-white/5 pt-3">
            <div>
              <span className="text-slate-500 block">Assessment Confidence:</span>
              <strong className="text-cyan-400 capitalize font-mono text-[10px]">
                {assessment.confidence?.level} ({assessment.confidence?.reason})
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Data Limitations:</span>
              <span className="text-slate-400 font-sans leading-tight">
                {assessment.data_limitations?.join(', ') || 'None noted.'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Maneuver Simulation Sandbox */}
      <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          Interactive Burn Simulation Sandbox
        </h4>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
          {/* Burn Direction */}
          <div className="flex flex-col gap-1">
            <span className="text-slate-500 font-medium">Impulse Direction</span>
            <select
              value={burnDirection}
              onChange={(e) => setBurnDirection(e.target.value as any)}
              className="bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-mono text-[10px]"
            >
              <option value="PROGRADE">PROGRADE (Raises Orbit / Speeds Up)</option>
              <option value="RETROGRADE">RETROGRADE (Lowers Orbit / Slows Down)</option>
              <option value="RADIAL">RADIAL (Inward/Outward Shift)</option>
              <option value="NORMAL">NORMAL (Cross-Track/Inclination Shift)</option>
            </select>
          </div>

          {/* Burn Magnitude Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Burn Magnitude (&Delta;V)</span>
              <span className="text-cyan-400 font-mono font-bold">{burnMagnitude.toFixed(1)} m/s</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="20"
              step="0.5"
              value={burnMagnitude}
              onChange={(e) => setBurnMagnitude(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500 border border-slate-800"
            />
          </div>

          {/* Burn Time Slider */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Burn Location Time (Hours Before TCA)</span>
              <span className="text-cyan-400 font-mono font-bold">{burnTime.toFixed(1)} hours before TCA</span>
            </div>
            <input
              type="range"
              min="1"
              max="24"
              step="0.5"
              value={burnTime}
              onChange={(e) => setBurnTime(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-500 border border-slate-800"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3 mt-1 justify-between flex-wrap">
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-4 py-2 bg-slate-850 hover:bg-slate-750 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-blue-500/5 disabled:opacity-50"
          >
            {isSimulating ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Running SGP4 Keplerian sweep...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Run Burn Simulation</span>
              </>
            )}
          </button>

          {/* Clear Results / Re-Trigger AI */}
          {assessment && (
            <button
              onClick={handleGenerateAssessment}
              disabled={isAssessing}
              className="text-[10px] text-slate-500 hover:text-slate-300 font-medium transition-colors"
            >
              Recalculate AI Assessment
            </button>
          )}
        </div>

        {/* Simulation Output Card */}
        {simError && (
          <div className="text-[10px] text-rose-400 font-mono bg-rose-500/5 p-3 rounded-xl border border-rose-500/25">
            {simError}
          </div>
        )}

        {simResult && (
          <div className="bg-slate-950/80 p-3 rounded-xl border border-white/5 flex flex-col gap-2 font-mono text-[10px]">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="font-bold text-slate-300 uppercase font-sans">Simulated State at TCA:</span>
              {simResult.isRiskCleared ? (
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[9px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  RISK CLEARED
                </span>
              ) : (
                <span className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[9px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  HIGH RISK REMAINING
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
              <div>
                <span className="text-slate-500">Original Miss Distance:</span>
                <span className="text-slate-300 block font-bold">{simResult.originalMissDistanceKm.toFixed(2)} km</span>
              </div>
              <div>
                <span className="text-slate-500">Simulated Miss Distance:</span>
                <span className={`block font-black text-xs ${simResult.isRiskCleared ? 'text-emerald-400' : 'text-rose-400 animate-pulse'}`}>
                  {simResult.newMissDistanceKm.toFixed(2)} km
                </span>
              </div>
              <div className="col-span-2 bg-white/5 p-2 rounded border border-white/5 flex items-center justify-between mt-1 text-[9px]">
                <span className="text-slate-400">Total Safety Margin Gained:</span>
                <strong className="text-cyan-300">+{simResult.missDistanceIncreaseKm.toFixed(2)} km</strong>
              </div>
            </div>

            <div className="text-[8px] text-slate-500 font-sans leading-tight mt-1">
              * Note: Burn implemented at {new Date(new Date(conjunction.tcaIso).getTime() - simResult.burnTimeHoursBeforeTca * 3600 * 1000).toUTCString()}. Evasive impulse results in new TCA at {new Date(simResult.newTcaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
