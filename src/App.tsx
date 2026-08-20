import React, { useState, useEffect } from 'react';
import {
  Header
} from './components/Header';
import {
  ConjunctionAlertTable
} from './components/ConjunctionAlertTable';
import {
  Orbit2DView
} from './components/Orbit2DView';
import {
  Orbit3DView
} from './components/Orbit3DView';
import {
  DistanceChart
} from './components/DistanceChart';
import {
  RiskExplainer
} from './components/RiskExplainer';
import {
  TrackedObjectsCatalog
} from './components/TrackedObjectsCatalog';
import {
  SettingsModal
} from './components/SettingsModal';
import {
  ArchitectureModal
} from './components/ArchitectureModal';
import {
  SatelliteDossierModal
} from './components/SatelliteDossierModal';
import {
  SystemStatus,
  TrackedObjectSummary,
  ConjunctionEvent,
  SystemConfig
} from './types';
import {
  Orbit,
  Globe,
  Layers,
  LineChart,
  Calculator,
  ShieldAlert,
  Radio,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [objects, setObjects] = useState<TrackedObjectSummary[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunction, setSelectedConjunction] = useState<ConjunctionEvent | null>(null);
  const [selectedObject, setSelectedObject] = useState<TrackedObjectSummary | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'3D' | '2D' | 'CATALOG'>('3D');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isArchOpen, setIsArchOpen] = useState<boolean>(false);
  const [isDossierOpen, setIsDossierOpen] = useState<boolean>(false);

  const showToast = (text: string, type: 'success' | 'info' | 'warn' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [statusRes, objectsRes, conjRes] = await Promise.all([
        fetch('/api/status').then((r) => r.json()).catch(() => null),
        fetch('/api/objects').then((r) => r.json()).catch(() => []),
        fetch('/api/conjunctions').then((r) => r.json()).catch(() => [])
      ]);

      if (statusRes) setStatus(statusRes);
      if (Array.isArray(objectsRes)) setObjects(objectsRes);
      
      const safeConjunctions = Array.isArray(conjRes) ? conjRes : [];
      setConjunctions(safeConjunctions);

      if (safeConjunctions.length > 0) {
        setSelectedConjunction((prev) => {
          if (prev && safeConjunctions.some((c) => c.id === prev.id)) {
            return safeConjunctions.find((c) => c.id === prev.id) || safeConjunctions[0];
          }
          return safeConjunctions[0];
        });
      } else {
        setSelectedConjunction(null);
      }
    } catch (err) {
      console.error('Failed loading telemetry data:', err);
      showToast('Error connecting to astrodynamics server', 'warn');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFetchLive = async () => {
    setIsLoading(true);
    showToast('Fetching latest TLE records from CelesTrak...', 'info');
    try {
      const res = await fetch('/api/tle/fetch').then((r) => r.json());
      if (res.success) {
        showToast(
          res.isFallback
            ? `Offline fallback loaded: ${res.count} records.`
            : `Downloaded ${res.count} fresh TLEs from CelesTrak!`,
          res.isFallback ? 'warn' : 'success'
        );
        await loadData();
      } else {
        showToast(`CelesTrak fetch error: ${res.error}`, 'warn');
      }
    } catch (err: any) {
      showToast('Failed to fetch from CelesTrak', 'warn');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadDemo = async () => {
    setIsLoading(true);
    showToast('Loading deterministic conjunction demonstration scenario...', 'info');
    try {
      const res = await fetch('/api/tle/demo', { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        showToast(`Demo scenario loaded! Detected ${res.conjunctionsCount} close encounters.`, 'success');
        await loadData();
      }
    } catch (err) {
      showToast('Failed loading demo scenario', 'warn');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReAnalyze = async () => {
    setIsLoading(true);
    showToast('Re-running SGP4 orbital propagation & pairwise analysis...', 'info');
    try {
      const res = await fetch('/api/analyze', { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        showToast(`Propagation complete: ${res.conjunctionsCount} close passes detected.`, 'success');
        await loadData();
      }
    } catch (err) {
      showToast('Analysis failed', 'warn');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async (newConfig: SystemConfig) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      }).then((r) => r.json());

      if (res.success) {
        showToast('Configuration updated and orbits re-analyzed.', 'success');
        await loadData();
      }
    } catch (err) {
      showToast('Failed to save settings', 'warn');
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="system-toast"
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 backdrop-blur-md transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              : toastMessage.type === 'warn'
              ? 'bg-red-950/80 border-red-500/50 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
              : 'bg-slate-900/80 border-blue-500/50 text-blue-200 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : toastMessage.type === 'warn' ? (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          ) : (
            <Radio className="w-4 h-4 text-blue-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <Header
        status={status}
        isLoading={isLoading}
        onFetchLive={handleFetchLive}
        onLoadDemo={handleLoadDemo}
        onReAnalyze={handleReAnalyze}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenArch={() => setIsArchOpen(true)}
      />

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 relative">
        {/* Subtle background glow effect */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
        
        {/* Top Section: Visualization & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Main Visualizer Panel (8 cols on lg) */}
          <div className="lg:col-span-8 flex flex-col space-y-3">
            {/* View Mode Selector Tabs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 p-1 bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-xl text-xs shadow-lg">
                <button
                  id="tab-3d-view"
                  onClick={() => setActiveTab('3D')}
                  className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === '3D'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>3D ECI Globe</span>
                </button>

                <button
                  id="tab-2d-view"
                  onClick={() => setActiveTab('2D')}
                  className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === '2D'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Orbit className="w-3.5 h-3.5" />
                  <span>2D Orbit Plane</span>
                </button>

                <button
                  id="tab-catalog"
                  onClick={() => setActiveTab('CATALOG')}
                  className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'CATALOG'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Objects ({objects.length})</span>
                </button>
              </div>

              {selectedConjunction && (
                <div className="hidden sm:flex items-center gap-2 text-xs font-mono bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-xl text-red-400 shadow-inner">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="truncate max-w-[200px] font-semibold">
                    {selectedConjunction.objectA.name} &harr; {selectedConjunction.objectB.name}
                  </span>
                  <span className="font-bold text-white">({selectedConjunction.minDistanceKm.toFixed(2)} km)</span>
                </div>
              )}
            </div>

            {/* Active Visualizer Component */}
            {activeTab === '3D' && (
              <Orbit3DView
                objects={objects}
                selectedConjunction={selectedConjunction}
                selectedObject={selectedObject}
                onSelectObject={(obj) => {
                  setSelectedObject(obj);
                }}
                onOpenDossier={(obj) => {
                  setSelectedObject(obj);
                  setIsDossierOpen(true);
                }}
              />
            )}

            {activeTab === '2D' && (
              <Orbit2DView
                objects={objects}
                selectedConjunction={selectedConjunction}
                onSelectObject={(obj) => {
                  setSelectedObject(obj);
                  setIsDossierOpen(true);
                }}
              />
            )}

            {activeTab === 'CATALOG' && (
              <TrackedObjectsCatalog
                objects={objects}
                onSelectObject={(obj) => {
                  setSelectedObject(obj);
                  setIsDossierOpen(true);
                }}
              />
            )}
          </div>

          {/* Right Side Analysis Panels (4 cols on lg) */}
          <div className="lg:col-span-4 flex flex-col space-y-5">
            {/* Separation Distance Chart */}
            <DistanceChart conjunction={selectedConjunction} />

            {/* Explainable Risk Score Breakdown */}
            <RiskExplainer conjunction={selectedConjunction} />
          </div>

        </div>

        {/* Bottom Section: Conjunction Alert Prioritization Table */}
        <div className="w-full">
          <ConjunctionAlertTable
            conjunctions={conjunctions}
            selectedConjunction={selectedConjunction}
            onSelectConjunction={(conj) => {
              setSelectedConjunction(conj);
              if (conj.objectA) {
                setSelectedObject(conj.objectA);
              }
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
            onFocus3D={(conj) => {
              setSelectedConjunction(conj);
              if (conj.objectA) {
                setSelectedObject(conj.objectA);
              }
              setActiveTab('3D');
            }}
            onOpenObjectDossier={(obj) => {
              setSelectedObject(obj);
              setIsDossierOpen(true);
            }}
            onLoadDemo={handleLoadDemo}
          />
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-900/60 backdrop-blur-xl py-5 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] uppercase tracking-widest font-semibold">
          <div className="flex gap-6 items-center">
            <span>&copy; Orbital Dynamics Lab</span>
            <span className="text-slate-800">|</span>
            <span>Data: CelesTrak / Space-Track Public</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-blue-400 font-mono font-bold">LIVE_TELEMETRY_CONNECTED</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={status?.config || {
          datasetSize: 35,
          predictionHours: 24,
          timeStepSeconds: 60,
          distanceThresholdKm: 15,
          riskWeights: { distance: 0.6, velocity: 0.25, time: 0.15 },
          riskThresholds: { critical: 80, high: 60, medium: 30 }
        }}
        onSaveConfig={handleSaveConfig}
      />

      <ArchitectureModal
        isOpen={isArchOpen}
        onClose={() => setIsArchOpen(false)}
      />

      <SatelliteDossierModal
        isOpen={isDossierOpen}
        object={selectedObject}
        conjunctions={conjunctions}
        onClose={() => setIsDossierOpen(false)}
        onTrackIn3D={(obj) => {
          setSelectedObject(obj);
          setActiveTab('3D');
          setIsDossierOpen(false);
        }}
        onSwitchTo2D={(obj) => {
          setSelectedObject(obj);
          setActiveTab('2D');
          setIsDossierOpen(false);
        }}
      />
    </div>
  );
}
