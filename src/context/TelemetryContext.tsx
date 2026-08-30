import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  SystemStatus,
  TrackedObjectSummary,
  ConjunctionEvent,
  SystemConfig,
  WsServerPacket,
  LiveTelemetryObject,
  ConjunctionSyncState
} from '../types';

export interface ToastState {
  text: string;
  type: 'success' | 'info' | 'warn';
}

export interface TelemetryContextType {
  status: SystemStatus | null;
  objects: TrackedObjectSummary[];
  conjunctions: ConjunctionEvent[];
  selectedConjunction: ConjunctionEvent | null;
  selectedObject: TrackedObjectSummary | null;
  conjunctionSyncState: ConjunctionSyncState | null;
  isLoading: boolean;
  activeTab: '3D' | '2D' | 'CATALOG';
  toastMessage: ToastState | null;
  isWsConnected: boolean;
  wsLatency: number | null;
  isSettingsOpen: boolean;
  isArchOpen: boolean;
  isDossierOpen: boolean;

  // Setters
  setSelectedConjunction: React.Dispatch<React.SetStateAction<ConjunctionEvent | null>>;
  setSelectedObject: React.Dispatch<React.SetStateAction<TrackedObjectSummary | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<'3D' | '2D' | 'CATALOG'>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsArchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDossierOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  showToast: (text: string, type?: 'success' | 'info' | 'warn') => void;
  loadData: () => Promise<void>;
  handleFetchLive: () => Promise<void>;
  handleLoadDemo: () => Promise<void>;
  handleReAnalyze: () => Promise<void>;
  handleSaveConfig: (newConfig: SystemConfig) => Promise<void>;
  handleSyncZoom: (syncPayload: ConjunctionSyncState) => void;
  handleResetSync: () => void;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [objects, setObjects] = useState<TrackedObjectSummary[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [selectedConjunction, setSelectedConjunction] = useState<ConjunctionEvent | null>(null);
  const [selectedObject, setSelectedObject] = useState<TrackedObjectSummary | null>(null);
  const [conjunctionSyncState, setConjunctionSyncState] = useState<ConjunctionSyncState | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'3D' | '2D' | 'CATALOG'>('3D');
  const [toastMessage, setToastMessage] = useState<ToastState | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isArchOpen, setIsArchOpen] = useState<boolean>(false);
  const [isDossierOpen, setIsDossierOpen] = useState<boolean>(false);

  // WebSocket Streaming State
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [wsLatency, setWsLatency] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingStartRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warn' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const handleSyncZoom = useCallback((syncPayload: ConjunctionSyncState) => {
    setConjunctionSyncState(syncPayload);
    showToast(`Sync Zoom Active: Focused onto TCA encounter window`, 'info');
  }, [showToast]);

  const handleResetSync = useCallback(() => {
    setConjunctionSyncState(null);
  }, []);

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
  }, [showToast]);

  // Initial HTTP snapshot
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Maintain WebSocket continuous telemetry stream
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
          if (isUnmounted) {
            ws.close();
            return;
          }
          setIsWsConnected(true);
          reconnectDelay = 2000;
          console.log('[WebSocket Client] Connected to continuous astrodynamics feed.');
          pingStartRef.current = Date.now();
          ws.send(JSON.stringify({ action: 'ping' }));
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data: WsServerPacket = JSON.parse(event.data);

            if (data.type === 'telemetry_stream') {
              const liveMap = new Map<string, LiveTelemetryObject>();
              for (const item of data.objects) {
                liveMap.set(item.id, item);
              }

              setObjects((prev) => {
                if (prev.length === 0) return prev;
                let updated = false;
                for (const obj of prev) {
                  const live = liveMap.get(obj.id);
                  if (live) {
                    obj.currentPosition = live.pos;
                    obj.positionKm = live.pos;
                    obj.currentVelocity = live.vel;
                    obj.speedKmS = live.speedKmS;
                    obj.altitudeKm = live.altKm;
                    obj.lat = live.lat;
                    obj.lng = live.lng;
                    updated = true;
                  }
                }
                return updated ? [...prev] : prev;
              });

              setSelectedObject((prev) => {
                if (!prev) return null;
                const live = liveMap.get(prev.id);
                if (live) {
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
                }
                return prev;
              });
            } else if (data.type === 'initial_state' || data.type === 'conjunction_update') {
              if (data.status) setStatus(data.status);
              if (Array.isArray(data.objects)) setObjects(data.objects);
              if (Array.isArray(data.conjunctions)) {
                setConjunctions(data.conjunctions);
                setSelectedConjunction((prev) => {
                  if (prev && data.conjunctions.some((c) => c.id === prev.id)) {
                    return data.conjunctions.find((c) => c.id === prev.id) || data.conjunctions[0];
                  }
                  return data.conjunctions.length > 0 ? data.conjunctions[0] : null;
                });
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
          reconnectDelay = Math.min(reconnectDelay * 1.5, 8000);
          reconnectTimeoutRef.current = setTimeout(connectWs, reconnectDelay);
        };

        ws.onerror = () => {
          // Handled via onclose
        };
      } catch (err) {
        if (!isUnmounted) {
          reconnectDelay = Math.min(reconnectDelay * 1.5, 8000);
          reconnectTimeoutRef.current = setTimeout(connectWs, reconnectDelay);
        }
      }
    }

    connectWs();

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
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        } else if (wsRef.current.readyState === WebSocket.CONNECTING) {
          const socket = wsRef.current;
          socket.onopen = () => socket.close();
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

  // HTTP Polling Fallback
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

          setObjects((prev) => {
            if (prev.length === 0) return prev;
            let updated = false;
            for (const obj of prev) {
              const live = liveMap.get(obj.id);
              if (live) {
                obj.currentPosition = live.pos;
                obj.positionKm = live.pos;
                obj.currentVelocity = live.vel;
                obj.speedKmS = live.speedKmS;
                obj.altitudeKm = live.altKm;
                obj.lat = live.lat;
                obj.lng = live.lng;
                updated = true;
              }
            }
            return updated ? [...prev] : prev;
          });

          setSelectedObject((prev) => {
            if (!prev) return null;
            const live = liveMap.get(prev.id);
            if (live) {
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
            }
            return prev;
          });
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
    showToast('Synchronizing satellite & debris fleet with orbital data providers...', 'info');

    try {
      const res = await fetch('/api/tle/fetch').then((r) => r.json());
      if (res.success) {
        showToast(
          res.isFallback
            ? `${res.source}: ${res.count} targets loaded.`
            : `Synchronized ${res.count} targets from ${res.source}!`,
          res.isFallback ? 'warn' : 'success'
        );
        await loadData();
      } else {
        showToast(`Sync error: ${res.error || 'Failed to reach providers'}`, 'warn');
      }
    } catch (err: any) {
      showToast('Failed to sync orbital data', 'warn');
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

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'reanalyze' }));
    }

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
    <TelemetryContext.Provider
      value={{
        status,
        objects,
        conjunctions,
        selectedConjunction,
        selectedObject,
        conjunctionSyncState,
        isLoading,
        activeTab,
        toastMessage,
        isWsConnected,
        wsLatency,
        isSettingsOpen,
        isArchOpen,
        isDossierOpen,
        setSelectedConjunction,
        setSelectedObject,
        setActiveTab,
        setIsSettingsOpen,
        setIsArchOpen,
        setIsDossierOpen,
        showToast,
        loadData,
        handleFetchLive,
        handleLoadDemo,
        handleReAnalyze,
        handleSaveConfig,
        handleSyncZoom,
        handleResetSync
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
};
