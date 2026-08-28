import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { ConjunctionAlertTable } from '../components/ConjunctionAlertTable';
import { DistanceChart } from '../components/DistanceChart';
import { RiskExplainer } from '../components/RiskExplainer';
import { AIAssessment } from '../components/AIAssessment';
import { useTelemetry } from '../context/TelemetryContext';
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  Activity,
  Navigation,
  Compass
} from 'lucide-react';

export function AlertPage() {
  const navigate = useNavigate();
  const {
    status,
    conjunctions,
    selectedConjunction,
    conjunctionSyncState,
    isLoading,
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
    handleSyncZoom,
    showToast
  } = useTelemetry();

  // Summary counts
  const criticalCount = conjunctions.filter((c) => c.riskLevel === 'CRITICAL').length;
  const highCount = conjunctions.filter((c) => c.riskLevel === 'HIGH').length;
  const medCount = conjunctions.filter((c) => c.riskLevel === 'MEDIUM' || c.riskLevel === 'LOW').length;
  const minApproach = conjunctions.length > 0
    ? Math.min(...conjunctions.map((c) => c.minDistanceKm)).toFixed(2)
    : 'N/A';

  const handleFocus3D = (conj: any) => {
    setSelectedConjunction(conj);
    if (conj.objectA) {
      setSelectedObject(conj.objectA);
    }
    setActiveTab('3D');
    navigate('/earth');
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* Top Header */}
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

      {/* Main Alert Center Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 relative">
        {/* Glowing background hazard aura */}
        <div className="absolute top-1/6 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Hazard Metrics Header Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-red-950/30 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3.5 shadow-[0_0_20px_rgba(239,68,68,0.15)] backdrop-blur-xl">
            <div className="p-3 rounded-xl bg-red-500/20 text-red-400">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-red-300 font-bold">Critical Threats</span>
              <div className="text-2xl font-bold font-mono text-red-400 mt-0.5">{criticalCount}</div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg backdrop-blur-xl">
            <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-amber-300 font-bold">High Risk Events</span>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-0.5">{highCount}</div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg backdrop-blur-xl">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-300 font-bold">Closest Approach</span>
              <div className="text-2xl font-bold font-mono text-white mt-0.5">
                {minApproach} <span className="text-xs font-normal text-slate-400 font-sans">km</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg backdrop-blur-xl">
            <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-300 font-bold">Total Monitored</span>
              <div className="text-2xl font-bold font-mono text-cyan-300 mt-0.5">{conjunctions.length}</div>
            </div>
          </div>
        </div>

        {/* Middle Analysis Grid: Distance Chart, Risk Breakdown & AI Assessment */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="flex flex-col">
            <DistanceChart
              conjunction={selectedConjunction}
              syncState={conjunctionSyncState}
              onSyncZoom={handleSyncZoom}
            />
          </div>

          <div className="flex flex-col">
            <RiskExplainer conjunction={selectedConjunction} />
          </div>

          <div className="flex flex-col">
            <AIAssessment conjunction={selectedConjunction} />
          </div>
        </div>

        {/* Conjunction Alert Prioritization Table */}
        <div className="w-full">
          <ConjunctionAlertTable
            conjunctions={conjunctions}
            selectedConjunction={selectedConjunction}
            onSelectConjunction={(conj) => {
              setSelectedConjunction(conj);
            }}
            onViewDistanceChart={(conj) => {
              setSelectedConjunction(conj);
              const elem = document.getElementById('distance-chart-panel');
              if (elem) {
                elem.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            onViewRiskMath={(conj) => {
              setSelectedConjunction(conj);
              const elem = document.getElementById('risk-explainer-panel');
              if (elem) {
                elem.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            onFocus3D={handleFocus3D}
            onOpenObjectDossier={(obj) => {
              setSelectedObject(obj);
              setIsDossierOpen(true);
            }}
            onLoadDemo={handleLoadDemo}
            onExportSuccess={(count, filename) => {
              showToast(
                `Exported ${count} conjunction ${count === 1 ? 'threat record' : 'threat records'} to ${filename}`,
                'success'
              );
            }}
          />
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-900/60 backdrop-blur-xl py-4 px-6 text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] uppercase tracking-widest font-semibold font-mono">
          <div className="flex gap-6 items-center">
            <span>&copy; Orbital Dynamics Lab — Conjunction Assessment Center</span>
            <span className="text-slate-800">|</span>
            <span>Astrodynamics Engine: SGP4 Propagation</span>
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

export default AlertPage;
