import React, { useState } from 'react';
import { X, Sliders, Save, RotateCcw, Check } from 'lucide-react';
import { SystemConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  onSaveConfig: (config: SystemConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig
}) => {
  const [formData, setFormData] = useState<SystemConfig>({ ...config });
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleResetDefaults = () => {
    setFormData({
      datasetSize: 35,
      predictionHours: 24,
      timeStepSeconds: 60,
      distanceThresholdKm: 15,
      riskWeights: {
        distance: 0.60,
        velocity: 0.25,
        time: 0.15
      },
      riskThresholds: {
        critical: 80,
        high: 60,
        medium: 30
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020617]/85 backdrop-blur-md">
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-200 text-xs">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              Astrodynamics & Risk Scoring Settings
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Astrodynamics Simulation Parameters */}
          <div className="space-y-3">
            <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider">
              1. Propagation & Conjunction Detection
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1 text-[11px]">Dataset Size (Objects)</label>
                <input
                  type="number"
                  min="10"
                  max="50"
                  value={formData.datasetSize}
                  onChange={(e) => setFormData({ ...formData, datasetSize: parseInt(e.target.value, 10) || 30 })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900/50 border border-white/10 text-white font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1 text-[11px]">Prediction Horizon (Hours)</label>
                <select
                  value={formData.predictionHours}
                  onChange={(e) => setFormData({ ...formData, predictionHours: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900/50 border border-white/10 text-white font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none"
                >
                  <option value={6}>6 Hours</option>
                  <option value={12}>12 Hours</option>
                  <option value={24}>24 Hours</option>
                  <option value={48}>48 Hours</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1 text-[11px]">Time Step (Seconds)</label>
                <select
                  value={formData.timeStepSeconds}
                  onChange={(e) => setFormData({ ...formData, timeStepSeconds: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900/50 border border-white/10 text-white font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none"
                >
                  <option value={30}>30s (High Precision)</option>
                  <option value={60}>60s (Standard MVP)</option>
                  <option value={120}>120s (Fast)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1 text-[11px]">Distance Threshold (km)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.distanceThresholdKm}
                  onChange={(e) => setFormData({ ...formData, distanceThresholdKm: parseFloat(e.target.value) || 10 })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900/50 border border-white/10 text-white font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Risk Scoring Weights */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider">
                2. Risk Score Formulation Weights
              </h4>
              <span className="font-mono text-[10px] text-slate-500">
                Sum: {((formData.riskWeights.distance + formData.riskWeights.velocity + formData.riskWeights.time) * 100).toFixed(0)}%
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Separation Distance Weight:</span>
                  <span className="font-mono font-bold text-blue-400">{(formData.riskWeights.distance * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={formData.riskWeights.distance}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      riskWeights: { ...formData.riskWeights, distance: parseFloat(e.target.value) }
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Relative Velocity Weight:</span>
                  <span className="font-mono font-bold text-orange-400">{(formData.riskWeights.velocity * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.6"
                  step="0.05"
                  value={formData.riskWeights.velocity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      riskWeights: { ...formData.riskWeights, velocity: parseFloat(e.target.value) }
                    })
                  }
                  className="w-full accent-orange-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Time-to-Event Weight:</span>
                  <span className="font-mono font-bold text-purple-400">{(formData.riskWeights.time * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.5"
                  step="0.05"
                  value={formData.riskWeights.time}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      riskWeights: { ...formData.riskWeights, time: parseFloat(e.target.value) }
                    })
                  }
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Classification Thresholds */}
          <div className="space-y-3 pt-3 border-t border-white/10">
            <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider">
              3. Risk Classification Thresholds
            </h4>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 shadow-inner">
                <span className="font-bold text-red-400">CRITICAL</span>
                <div className="mt-1 font-mono text-white">&gt;= {formData.riskThresholds.critical}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 shadow-inner">
                <span className="font-bold text-orange-400">HIGH</span>
                <div className="mt-1 font-mono text-white">&gt;= {formData.riskThresholds.high}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-inner">
                <span className="font-bold text-amber-400">MEDIUM</span>
                <div className="mt-1 font-mono text-white">&gt;= {formData.riskThresholds.medium}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-slate-900/80 flex items-center justify-between">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center gap-1.5 text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 text-xs shadow-md transition-all"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? 'Saved!' : 'Save & Recalculate'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
