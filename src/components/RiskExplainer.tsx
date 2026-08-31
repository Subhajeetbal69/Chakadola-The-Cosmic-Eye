import React from 'react';
import { Calculator, ShieldAlert, Zap, Clock, Orbit, Info } from 'lucide-react';
import { ConjunctionEvent } from '../types';

interface RiskExplainerProps {
  conjunction: ConjunctionEvent | null;
}

export const RiskExplainer: React.FC<RiskExplainerProps> = ({ conjunction }) => {
  if (!conjunction || !conjunction.breakdown) {
    return (
      <div className="bg-[#0c0e14] border border-white/5 rounded-2xl p-5 text-center text-gray-500 text-xs flex flex-col items-center justify-center shadow-2xl h-[200px]">
        <Calculator className="w-6 h-6 text-gray-700 mb-1.5" />
        <p className="font-medium text-gray-400">Select a conjunction event to view the multi-factor LEO risk matrix.</p>
      </div>
    );
  }

  const b = conjunction.breakdown;

  const getSeverityBadgeClass = (level?: string) => {
    switch (level) {
      case 'EXTREME':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  const getUrgencyBadgeClass = (level?: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  return (
    <div id="risk-explainer-panel" className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col">
      {/* Title */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-cyan-400" />
          LEO Multi-Factor Risk Matrix
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 font-semibold">Risk Score:</span>
          <span className="text-xs font-mono font-bold text-white bg-slate-800/80 px-2 py-0.5 rounded border border-white/10 shadow-inner">
            {(conjunction.riskScore ?? 0).toFixed(1)} / 100
          </span>
        </div>
      </div>

      {/* Breakdown Rows */}
      <div className="flex flex-col gap-2.5 text-[10px] font-medium">
        {/* Factor 1: Miss Distance */}
        <div className="flex justify-between items-center bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-300 font-semibold">Miss Distance (45%)</span>
          </div>
          <span className="font-mono text-slate-200">
            {(b.rawDistanceKm ?? 0).toFixed(2)} km &rarr; <strong className="text-cyan-400 ml-1">{(b.distanceScore ?? 0).toFixed(0)} pts</strong>
          </span>
        </div>

        {/* Factor 2: Collision Severity / Relative Velocity */}
        <div className="flex justify-between items-center bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-orange-300 font-semibold">Kinetic Severity (25%)</span>
            {b.severityLevel && (
              <span className={`text-[8px] px-1.5 py-0.2 rounded border font-mono font-bold ${getSeverityBadgeClass(b.severityLevel)}`}>
                {b.severityLevel}
              </span>
            )}
          </div>
          <span className="font-mono text-slate-200">
            {(b.relativeVelocityKmS ?? 0).toFixed(2)} km/s &rarr; <strong className="text-orange-400 ml-1">{(b.severityScore ?? b.velocityScore ?? 0).toFixed(0)} pts</strong>
          </span>
        </div>

        {/* Factor 3: Operational Urgency / TCA */}
        <div className="flex justify-between items-center bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-purple-300 font-semibold">Operational Urgency (20%)</span>
            {b.urgencyLevel && (
              <span className={`text-[8px] px-1.5 py-0.2 rounded border font-mono font-bold ${getUrgencyBadgeClass(b.urgencyLevel)}`}>
                {b.urgencyLevel}
              </span>
            )}
          </div>
          <span className="font-mono text-slate-200">
            {(b.timeToEventHours ?? 0).toFixed(1)}h TCA &rarr; <strong className="text-purple-400 ml-1">{(b.urgencyScore ?? b.timeScore ?? 0).toFixed(0)} pts</strong>
          </span>
        </div>

        {/* Factor 4: LEO Orbital Shell Context */}
        <div className="flex justify-between items-center bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-300 font-semibold">LEO Shell Traffic (10%)</span>
            {b.leoBand && (
              <span className="text-[8px] px-1.5 py-0.2 rounded border font-mono font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                {b.leoBand.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <span className="font-mono text-slate-200">
            {(b.tcaAltitudeKm ?? 550).toFixed(0)} km &rarr; <strong className="text-emerald-400 ml-1">{(b.leoContextScore ?? 50).toFixed(0)} pts</strong>
          </span>
        </div>

        <div className="mt-2 pt-2.5 border-t border-white/10 flex flex-col gap-1">
          <div className="text-[9px] text-cyan-400 font-mono">
            {b.formulaDescription || `(0.45 × ${b.distanceScore.toFixed(0)}) + (0.25 × ${(b.severityScore ?? 0).toFixed(0)}) + (0.20 × ${(b.urgencyScore ?? 0).toFixed(0)}) + (0.10 × ${(b.leoContextScore ?? 0).toFixed(0)}) = ${conjunction.riskScore.toFixed(1)}`}
          </div>
          <div className="text-[9px] text-slate-500">
            LEO Collision Risk index combining miss distance, kinetic energy impact severity, time-to-TCA urgency, and orbital shell density.
          </div>
        </div>
      </div>
    </div>
  );
};

