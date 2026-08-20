import React from 'react';
import { Calculator, ShieldAlert, Zap, Clock, Info } from 'lucide-react';
import { ConjunctionEvent } from '../types';

interface RiskExplainerProps {
  conjunction: ConjunctionEvent | null;
}

export const RiskExplainer: React.FC<RiskExplainerProps> = ({ conjunction }) => {
  if (!conjunction || !conjunction.breakdown) {
    return (
      <div className="bg-[#0c0e14] border border-white/5 rounded-2xl p-5 text-center text-gray-500 text-xs flex flex-col items-center justify-center shadow-2xl h-[200px]">
        <Calculator className="w-6 h-6 text-gray-700 mb-1.5" />
        <p className="font-medium text-gray-400">Select a conjunction event to view the risk matrix.</p>
      </div>
    );
  }

  const b = conjunction.breakdown;

  return (
    <div id="risk-explainer-panel" className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col">
      {/* Title */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-blue-400" />
          Risk Scoring Matrix
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 font-semibold">Score:</span>
          <span className="text-xs font-mono font-bold text-white bg-slate-800/80 px-2 py-0.5 rounded border border-white/10 shadow-inner">
            {(conjunction.riskScore ?? 0).toFixed(1)} / 100
          </span>
        </div>
      </div>

      {/* Breakdown Rows */}
      <div className="flex flex-col gap-3 text-[10px] font-medium">
        <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
          <span className="text-slate-400">Distance Weight (0.60)</span>
          <span className="font-mono text-slate-200">
            {(b.rawDistanceKm ?? 0).toFixed(2)} km &rarr; <strong className="text-blue-400 ml-1">{(b.distanceScore ?? 0).toFixed(0)}pts</strong>
          </span>
        </div>

        <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
          <span className="text-slate-400">Velocity Weight (0.25)</span>
          <span className="font-mono text-slate-200">
            {(b.relativeVelocityKmS ?? 0).toFixed(2)} km/s &rarr; <strong className="text-orange-400 ml-1">{(b.velocityScore ?? 0).toFixed(0)}pts</strong>
          </span>
        </div>

        <div className="flex justify-between items-center bg-white/5 px-2 py-1.5 rounded-lg border border-white/5">
          <span className="text-slate-400">Time Weight (0.15)</span>
          <span className="font-mono text-slate-200">
            {(b.timeToEventHours ?? 0).toFixed(1)}h until TCA &rarr; <strong className="text-purple-400 ml-1">{(b.timeScore ?? 0).toFixed(0)}pts</strong>
          </span>
        </div>

        <div className="mt-2 pt-3 border-t border-white/10 flex flex-col gap-1">
          <div className="text-[9px] text-blue-400 italic uppercase font-semibold">
            * Score = (0.60 &times; {(b.distanceScore ?? 0).toFixed(0)}) + (0.25 &times; {(b.velocityScore ?? 0).toFixed(0)}) + (0.15 &times; {(b.timeScore ?? 0).toFixed(0)}) = {(conjunction.riskScore ?? 0).toFixed(1)}
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            Prototype Prioritization metric for orbital collision avoidance.
          </div>
        </div>
      </div>
    </div>
  );
};
