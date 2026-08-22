import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AIAssessment
} from './components/AIAssessment';
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
  SystemConfig,
  WsServerPacket,
  LiveTelemetryObject,
  ConjunctionSyncState
} from './types';
import { Orbit, Globe, Layers, ShieldAlert, Radio, CheckCircle2, AlertTriangle } from 'lucide-react';

interface TelemetryStateSetters {
  setObjects: React.Dispatch<React.SetStateAction<TrackedObjectSummary[]>>;
  setSelectedObject: React.Dispatch<React.SetStateAction<TrackedObjectSummary | null>>;
}

function updateLiveTelemetry(
  liveMap: Map<string, LiveTelemetryObject>,
  { setObjects, setSelectedObject }: TelemetryStateSetters
) {
  setObjects((prev) => {
    if (prev.length === 0) return prev;

    return prev.map((obj) => {
      const live = liveMap.get(obj.id);
      if (!live) return obj;

      return {
        ...obj,
        currentPosition: live.pos,
        positionKm: live.pos,
        currentVelocity: live.vel,
        speedKmS: live.speedKmS,
        altitudeKm: live.altKm,
        lat: live.lat,
        lng: live.lng
      };
    });
  });

  setSelectedObject((prev) => {
    if (!prev) return null;

    const live = liveMap.get(prev.id);
    if (!live) return prev;

    return {
      ...prev,
      currentPosition: live.pos,
      positionKm: live.pos,
      currentVelocity: live.vel,
      speedKmS: live.speedKmS,
      altitudeKm: live.altKm,
      lat: live.lat,
      lng: live.lng
    };
  });
}

function createLiveTelemetryMap(objects: LiveTelemetryObject[]) {
  return new Map(objects.map((item) => [item.id, item]));
}

function updateLiveTelemetry(
  liveMap: Map<string, LiveTelemetryObject>,
  setObjects: React.Dispatch<React.SetStateAction<TrackedObjectSummary[]>>,
  setSelectedObject: React.Dispatch<React.SetStateAction<TrackedObjectSummary | null>>
) {
  setObjects((prev) => prev.map((obj) => {
    const live = liveMap.get(obj.id);
    return live ? { ...obj, currentPosition: live.pos, positionKm: live.pos, currentVelocity: live.vel, speedKmS: live.speedKmS, altitudeKm: live.altKm, lat: live.lat, lng: live.lng } : obj;
  }));

  setSelectedObject((prev) => {
    if (!prev) return null;
    const live = liveMap.get(prev.id);
    return live ? { ...prev, currentPosition: live.pos, positionKm: live.pos, currentVelocity: live.vel, speedKmS: live.speedKmS, altitudeKm: live.altKm, lat: live.lat, lng: live.lng } : prev;
  });
}

function getSafeConjunctionSelection(conjunctions: ConjunctionEvent[], previous: ConjunctionEvent | null) {
  if (!conjunctions.length) return null;
  return conjunctions.find((c) => c.id === previous?.id) || conjunctions[0];
}

function sendWebSocketAction(wsRef: React.MutableRefObject<WebSocket | null>, action: string) {
  if (wsRef.current?.readyState === WebSocket.OPEN)
    wsRef.current.send(JSON.stringify({ action }));
}

export default function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [objects, setObjects] = useState<TrackedObjectSummary[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunction, setSelectedConjunction] = useState<ConjunctionEvent | null>(null);
  const [selectedObject, setSelectedObject] = useState<TrackedObjectSummary | null>(null);
  const [conjunctionSyncState, setConjunctionSyncState] = useState<ConjunctionSyncState | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'3D' | '2D' | 'CATALOG'>('3D');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  // Sync Zoom Callback for Conjunction Close Approach
  const handleSyncZoom = useCallback((syncPayload: ConjunctionSyncState) => {
    setConjunctionSyncState(syncPayload);
    showToast(
      `Sync Zoom Active: Focused 3D & 2D views onto TCA encounter window`,
      'info'
    );
  }, []);

  const handleResetSync = useCallback(() => {
    setConjunctionSyncState(null);
  }, []);

  // WebSocket Streaming State
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [wsLatency, setWsLatency] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingStartRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isArchOpen, setIsArchOpen] = useState<boolean>(false);
  const [isDossierOpen, setIsDossierOpen] = useState<boolean>(false);

  const showToast = (text: string, type: 'success' | 'info' | 'warn' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [statusRes, objectsRes, conjRes] = await Promise.all([
        fetch('/api/status').then((r) => r.json()).catch(() => null),
        fetch('/api/objects').then((r) => r.json()).catch(() => []),
        fetch('/api/conjunctions').then((r) => r.json()).catch(() => [])
      ]);

      if (statusRes) setStatus(statusRes);
      if (Array.isArray(objectsRes) && objectsRes.length > 0) setObjects(objectsRes);
      
      const safeConjunctions = Array.isArray(conjRes) ? conjRes : [];
      setConjunctions(safeConjunctions);

      setSelectedConjunction((prev) =>
        getSafeConjunctionSelection(safeConjunctions, prev)
      );
    } catch (err) {
      console.error('Failed loading telemetry data:', err);
      showToast('Error connecting to astrodynamics server', 'warn');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize initial HTTP snapshot
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Connect and maintain resilient WebSocket continuous telemetry stream with gradual backoff
  useEffect(() => {
    let isUnmounted = false;
    let reconnectDelay = 2000;

    function connectWs() {
      if (isUnmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsWsConnected(true);
          reconnectDelay = 2000;
          console.log('[WebSocket Client] Connected to continuous astrodynamics feed.');
          // Measure initial ping
          pingStartRef.current = Date.now();
          ws.send(JSON.stringify({ action: 'ping' }));
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data: WsServerPacket = JSON.parse(event.data);

            if (data.type === 'telemetry_stream') {
              // Update live coordinates and telemetry for each object in the curated fleet
              const liveMap = new Map<string, LiveTelemetryObject>();
              for (const item of data.objects) {
                liveMap.set(item.id, item);
              }

              updateLiveTelemetry(liveMap, { setObjects, setSelectedObject });
            } else if (data.type === 'initial_state' || data.type === 'conjunction_update') {
              if (data.status) setStatus(data.status);
              if (Array.isArray(data.objects)) setObjects(data.objects);
              if (Array.isArray(data.conjunctions)) {
                setConjunctions(data.conjunctions);
                setSelectedConjunction((prev) =>
                  getSafeConjunctionSelection(data.conjunctions, prev)
                );
              }
            } else if (data.type === 'pong') {
              const latency = Date.now() - pingStartRef.current;
              setWsLatency(latency);
            }
          } catch (err) {
            console.error('[WebSocket Client] Parse error:', err);
          }
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          setIsWsConnected(false);
          setWsLatency(null);
          // Reconnect with progressive backoff (max 12s)
          reconnectDelay = Math.min(reconnectDelay * 1.5, 12000);
          reconnectTimeoutRef.current = setTimeout(connectWs, reconnectDelay);
        };

        ws.onerror = () => {
          // Gracefully close on error to trigger backoff reconnect
          try {
            ws.close();
          } catch {
            // ignore
          }
        };
      } catch (err) {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 12000);
        reconnectTimeoutRef.current = setTimeout(connectWs, reconnectDelay);
      }
    }

    connectWs();

    // Heartbeat ping interval every 8 seconds
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        pingStartRef.current = Date.now();
        wsRef.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, 8000);

    return () => {
      isUnmounted = true;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Global keyboard listener for modal dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsArchOpen(false);
        setIsSettingsOpen(false);
        setIsDossierOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Adaptive Continuous High-Frequency Telemetry Stream (Active when WS is offline or during proxy handshake)
  useEffect(() => {
    if (isWsConnected) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const res = await fetch('/api/telemetry/live');
        if (!res.ok) return;
        const data = await res.json();
        if (data && Array.isArray(data.objects)) {
          const liveMap = new Map<string, LiveTelemetryObject>();
          for (const item of data.objects) {
            liveMap.set(item.id, item);
          }

          updateLiveTelemetry(liveMap, { setObjects, setSelectedObject });
        }
      } catch {
        // Silently skip if network is transient
      }
    }, 600);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [isWsConnected]);

  const handleFetchLive = async () => {
    setIsLoading(true);
    showToast('Synchronizing curated satellite & debris fleet with CelesTrak...', 'info');

    // Notify via WebSocket if open
    sendWebSocketAction(wsRef, 'fetch_live');

    try {
      const res = await fetch('/api/tle/fetch').then((r) => r.json());
      if (res.success) {
        showToast(
          res.isFallback
            ? `Curated reference fleet active: ${res.count} targets tracked.`
            : `Synchronized ${res.count} curated fleet targets with live CelesTrak TLEs!`,
          res.isFallback ? 'warn' : 'success'
        );
        await loadData();
      } else {
        showToast(`CelesTrak sync error: ${res.error}`, 'warn');
      }
    } catch (err: any) {
      showToast('Failed to sync with CelesTrak', 'warn');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadDemo = async () => {
    setIsLoading(true);
    showToast('Loading deterministic conjunction demonstration scenario...', 'info');

    sendWebSocketAction(wsRef, 'load_demo');

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

    sendWebSocketAction(wsRef, 'reanalyze');

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
        isWsConnected={isWsConnected}
        wsLatency={wsLatency}
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
                syncState={conjunctionSyncState}
                onSelectObject={(obj) => {
                  setSelectedObject(obj);
                }}
                onOpenDossier={(obj) => {
                  setSelectedObject(obj);
                  setIsDossierOpen(true);
                }}
                onResetSync={handleResetSync}
              />
            )}

            {activeTab === '2D' && (
              <Orbit2DView
                objects={objects}
                selectedConjunction={selectedConjunction}
                syncState={conjunctionSyncState}
                onSelectObject={(obj) => {
                  setSelectedObject(obj);
                  setIsDossierOpen(true);
                }}
                onResetSync={handleResetSync}
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
            {/* Separation Distance Chart with Sync Zoom */}
            <DistanceChart
              conjunction={selectedConjunction}
              syncState={conjunctionSyncState}
              onSyncZoom={handleSyncZoom}
            />

            {/* Explainable Risk Score Breakdown */}
            <RiskExplainer conjunction={selectedConjunction} />

            {/* AI Decision Support & Burn Simulation */}
            <AIAssessment conjunction={selectedConjunction} />
          </div>

        </div>

        {/* Bottom Section: Conjunction Alert Prioritization Table */}
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
            onExportSuccess={(count, filename) => {
              showToast(
                `Exported ${count} conjunction ${count === 1 ? 'threat record' : 'threat records'} to ${filename} for offline risk analysis`,
                'success'
              );
            }}
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
            <span className={`w-1.5 h-1.5 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span className="text-slate-400 font-mono font-bold">
              {isWsConnected ? 'WS_TELEMETRY_STREAM_ACTIVE (500MS)' : 'WS_DISCONNECTED (HTTP_FALLBACK)'}
            </span>
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