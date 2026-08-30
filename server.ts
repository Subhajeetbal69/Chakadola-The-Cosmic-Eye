import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import * as satellite from 'satellite.js';
import {
  TleRecord,
  SystemConfig,
  ConjunctionEvent,
  SystemStatus,
  TrackedObjectSummary,
  LiveTelemetryObject,
  SnapshotMetadata,
  DataStatusResponse,
  FreshnessState
} from './src/types';
import {
  fetchLiveTleData,
  createDeterministicDemoScenario,
  bootstrapInitialSnapshot,
  getCircuitBreakerStatus,
  ingestRawTleContent
} from './server/tleFetcher';
import {
  detectConjunctions,
  DEFAULT_CONFIG,
  getDistanceHistory,
  calculateRiskScore,
  simulateManeuver
} from './server/conjunctionEngine';
import {
  createSatrec,
  generateTrajectory,
  getObjectSummary,
  propagateAtTime
} from './server/propagator';
import {
  getDb,
  loadActiveSnapshot,
  getActiveSnapshotMetadata,
  saveNewSnapshot,
  setMetadata,
  getMetadata,
  getSnapshotList,
  rollbackToSnapshot
} from './server/db';
import { getConjunctionAssessment } from './ai/aiServices';

let currentTles: TleRecord[] = [];
let currentConjunctions: ConjunctionEvent[] = [];
let currentSnapshotMetadata: SnapshotMetadata | null = null;
let activeConfig: SystemConfig = { ...DEFAULT_CONFIG };
let activeSource = 'Curated Reference Fleet (Offline)';
let lastAnalysisDate: Date = new Date();
let wss: WebSocketServer | null = null;

// ── In-Memory Security & Concurrency Guards ───────────────────────
let activeAnalysisPromise: Promise<ConjunctionEvent[]> | null = null;
let activeTleFetchPromise: Promise<any> | null = null;
const aiAssessmentCache = new Map<string, { data: any; expiresAt: number }>();

function calculateFreshnessState(snapshot: SnapshotMetadata | null, isLive: boolean): { state: FreshnessState; ageSeconds: number } {
  if (!snapshot) {
    return { state: 'NO_DATA', ageSeconds: 0 };
  }
  const fetchedMs = new Date(snapshot.fetchedAt).getTime();
  const ageSeconds = Math.max(0, Math.floor((Date.now() - fetchedMs) / 1000));

  if (isLive && ageSeconds < 30 * 60) {
    return { state: 'LIVE', ageSeconds };
  }
  if (ageSeconds < 2 * 3600) {
    return { state: 'FRESH_SNAPSHOT', ageSeconds };
  }
  if (ageSeconds < 24 * 3600) {
    return { state: 'STALE_SNAPSHOT', ageSeconds };
  }
  return { state: 'CRITICAL_STALE', ageSeconds };
}

async function executeSafeConjunctionDetection(): Promise<ConjunctionEvent[]> {
  if (activeAnalysisPromise) {
    return activeAnalysisPromise;
  }
  activeAnalysisPromise = (async () => {
    try {
      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);
      return currentConjunctions;
    } finally {
      activeAnalysisPromise = null;
    }
  })();
  return activeAnalysisPromise;
}

async function executeSafeLiveTleFetch(): Promise<any> {
  if (activeTleFetchPromise) {
    return activeTleFetchPromise;
  }
  activeTleFetchPromise = (async () => {
    try {
      const result = await fetchLiveTleData();
      currentTles = result.records;
      currentSnapshotMetadata = result.snapshot;
      activeSource = result.source;
      refreshSatrecCache();
      await executeSafeConjunctionDetection();
      return result;
    } finally {
      activeTleFetchPromise = null;
    }
  })();
  return activeTleFetchPromise;
}

// In-memory cache of satrec wrappers for instant propagation
let cachedSatrecWrappers: Array<{ record: TleRecord; wrapper: any }> = [];

function refreshSatrecCache() {
  cachedSatrecWrappers = currentTles.map((r) => ({
    record: r,
    wrapper: createSatrec(r)
  }));
}

function getSystemStatus(): SystemStatus {
  const activeSats = currentTles.filter((t) => t.classification === 'ACTIVE_SATELLITE').length;
  const debris = currentTles.filter((t) => t.classification === 'DEBRIS').length;
  const rocketBodies = currentTles.filter((t) => t.classification === 'ROCKET_BODY').length;
  const isLive = activeSource.includes('Live') || activeSource.includes('CelesTrak');
  const { state } = calculateFreshnessState(currentSnapshotMetadata, isLive);

  return {
    lastDataUpdate: lastAnalysisDate.toISOString(),
    trackedObjectsCount: currentTles.length,
    activeSatellitesCount: activeSats,
    debrisCount: debris,
    rocketBodiesCount: rocketBodies,
    analysisWindowHours: activeConfig.predictionHours,
    timeStepSeconds: activeConfig.timeStepSeconds,
    detectedConjunctionsCount: currentConjunctions.length,
    activeSource,
    config: activeConfig,
    lastSyncTimestamp: lastAnalysisDate.getTime(),
    isLiveCelesTrak: isLive,
    wsConnectedClients: wss ? wss.clients.size : 0,
    snapshotMetadata: currentSnapshotMetadata || undefined,
    freshnessState: state
  };
}

function getLiveTelemetryList(date: Date = new Date(), limit: number = 2000, offset: number = 0): LiveTelemetryObject[] {
  const wrappers = cachedSatrecWrappers.length === currentTles.length
    ? cachedSatrecWrappers
    : currentTles.map((r) => ({ record: r, wrapper: createSatrec(r) }));

  const gmst = satellite.gstime(date);

  // Collect key conjunction hazard objects first
  const priorityIds = new Set<string>();
  for (const c of currentConjunctions) {
    if (c.objectA) priorityIds.add(c.objectA.id);
    if (c.objectB) priorityIds.add(c.objectB.id);
  }

  const result: LiveTelemetryObject[] = [];
  const total = wrappers.length;

  // Add priority conjunction objects first
  for (const item of wrappers) {
    if (priorityIds.has(item.record.id)) {
      const summary = getObjectSummary(item.wrapper, date, true, gmst, false);
      result.push({
        id: summary.id,
        name: summary.name,
        classification: summary.classification,
        orbitClass: summary.orbitClass || 'LEO',
        noradId: summary.noradId,
        pos: summary.currentPosition,
        vel: summary.currentVelocity,
        speedKmS: summary.speedKmS,
        altKm: summary.altitudeKm,
        lat: summary.lat,
        lng: summary.lng,
        epochTimestamp: date.getTime()
      });
    }
  }

  // Add rotating batch of background fleet to keep streaming lightweight & high-speed
  const sampleStep = Math.max(1, Math.floor(total / limit));
  for (let i = (offset % sampleStep); i < total && result.length < limit; i += sampleStep) {
    const item = wrappers[i];
    if (!priorityIds.has(item.record.id)) {
      const summary = getObjectSummary(item.wrapper, date, true, gmst, false);
      result.push({
        id: summary.id,
        name: summary.name,
        classification: summary.classification,
        orbitClass: summary.orbitClass || 'LEO',
        noradId: summary.noradId,
        pos: summary.currentPosition,
        vel: summary.currentVelocity,
        speedKmS: summary.speedKmS,
        altKm: summary.altitudeKm,
        lat: summary.lat,
        lng: summary.lng,
        epochTimestamp: date.getTime()
      });
    }
  }

  return result;
}

function getObjectsSummaries(date: Date = new Date(), skipOrbitSample = true, limit?: number, offset: number = 0): TrackedObjectSummary[] {
  const wrappers = cachedSatrecWrappers.length === currentTles.length
    ? cachedSatrecWrappers
    : currentTles.map((r) => ({ record: r, wrapper: createSatrec(r) }));

  const gmst = satellite.gstime(date);
  const slice = typeof limit === 'number' ? wrappers.slice(offset, offset + limit) : wrappers;
  return slice.map((item) => getObjectSummary(item.wrapper, date, skipOrbitSample, gmst, false));
}

function broadcastWsMessage(data: any) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 1024 * 1024) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('[WebSocket] Broadcast error:', err);
      }
    }
  }
}

async function initCoreEngine() {
  await getDb();
  const activeSnap = await loadActiveSnapshot();

  if (activeSnap.records.length > 0 && activeSnap.metadata) {
    currentTles = activeSnap.records;
    currentSnapshotMetadata = activeSnap.metadata;
    activeSource = activeSnap.metadata.source === 'CELESTRAK'
      ? 'CelesTrak (Live LEO Ingestion)'
      : `${activeSnap.metadata.source} (Active LEO Snapshot)`;
    console.log(`[Core Engine] Loaded active LEO snapshot ${activeSnap.metadata.id} with ${currentTles.length} objects.`);
  } else {
    const boot = await bootstrapInitialSnapshot();
    currentTles = boot.records;
    currentSnapshotMetadata = boot.snapshot;
    activeSource = 'Local LEO Baseline Snapshot';
    console.log(`[Core Engine] ℹ️ Bootstrapped baseline LEO snapshot with ${currentTles.length} objects (Running in LOCAL BASELINE / DEMO mode).`);
  }

  refreshSatrecCache();

  // Run initial conjunction detection
  lastAnalysisDate = new Date();
  currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);
  console.log(`[Core Engine] Initialized with ${currentTles.length} LEO space objects and ${currentConjunctions.length} conjunction alerts.`);

  // Background refresh daemon (every 2 hours - aligned with upstream GP publication cadence)
  const TLE_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
  setInterval(() => {
    console.log('[Background Daemon] Running scheduled 2-hour LEO orbital elements refresh check...');
    executeSafeLiveTleFetch().then(() => {
      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate, true),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });
    }).catch((err) => {
      console.warn('[Background Daemon] Scheduled refresh error:', err);
    });
  }, TLE_REFRESH_INTERVAL_MS);
}


async function startServer() {
  const app = express();
  const PORT = 3000;

  // ── 1. HTTP Security Headers & Payload Size Clamping ─────────────
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: '32kb' }));

  // ── 2. Layer 7 Rate Limiting Defenses ────────────────────────────
  // General API Rate Limiter: max 240 requests/min per IP
  const apiGeneralLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Please slow down.' }
  });
  app.use('/api/', apiGeneralLimiter);

  // Heavy Computation Rate Limiter: max 12 requests/min per IP for CPU/DB/AI intensive routes
  const heavyComputationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Computation rate limit exceeded. Please wait before retrying.' }
  });
  app.use('/api/tle/fetch', heavyComputationLimiter);
  app.use('/api/tle/demo', heavyComputationLimiter);
  app.use('/api/tle/import', heavyComputationLimiter);
  app.use('/api/analyze', heavyComputationLimiter);
  app.use('/api/conjunctions/:id/assess', heavyComputationLimiter);
  app.use('/api/conjunctions/csv', heavyComputationLimiter);

  // Initialize DB and astrodynamics engine
  await initCoreEngine();

  // Create HTTP server for both Express and WebSockets
  const server = http.createServer(app);

  // ── 3. Slowloris & Request Timeout Hardening ──────────────────────
  server.headersTimeout = 15000;  // 15 seconds max to receive complete HTTP headers
  server.requestTimeout = 30000;  // 30 seconds max for entire HTTP request processing
  server.keepAliveTimeout = 10000; // 10 seconds idle keep-alive timeout

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Server Error] Port ${PORT} is already in use by another process.`);
      console.error(`Please terminate any background Node/TSX servers running on port ${PORT} before running npm run dev.\n`);
    } else {
      console.error('[Server Error]', err);
    }
  });

  // ── 4. WebSocket Server & DDoS Shielding ──────────────────────────
  const wsIpConnectionCounts = new Map<string, number>();

  wss = new WebSocketServer({ 
    noServer: true,
    maxPayload: 32 * 1024 // 32 KB maximum payload per message to prevent buffer exhaustion
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws' || url.pathname.startsWith('/ws')) {
        const rawIp = (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || request.socket.remoteAddress || '127.0.0.1';
        const currentCount = wsIpConnectionCounts.get(rawIp) || 0;

        // Limit to 25 concurrent WebSocket connections per IP address
        if (currentCount >= 25) {
          console.warn(`[WebSocket Guard] Blocked excessive concurrent connection attempt from IP: ${rawIp}`);
          socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }

        wsIpConnectionCounts.set(rawIp, currentCount + 1);

        wss?.handleUpgrade(request, socket, head, (ws) => {
          (ws as any).clientIp = rawIp;
          (ws as any).isAlive = true;
          (ws as any).msgCount = 0;
          (ws as any).lastMsgReset = Date.now();

          ws.on('close', () => {
            const count = wsIpConnectionCounts.get(rawIp) || 1;
            if (count <= 1) {
              wsIpConnectionCounts.delete(rawIp);
            } else {
              wsIpConnectionCounts.set(rawIp, count - 1);
            }
          });

          wss?.emit('connection', ws, request);
        });
      }
    } catch (err) {
      console.warn('[Server Upgrade] WebSocket upgrade error:', err);
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log(`[WebSocket] Client connected. Total active clients: ${wss?.clients.size || 0}`);

    // Send immediate initial state snapshot to newly connected client
    const initialState = {
      type: 'initial_state',
      status: getSystemStatus(),
      objects: getObjectsSummaries(new Date(), true),
      conjunctions: currentConjunctions,
      timestamp: Date.now()
    };
    try {
      ws.send(JSON.stringify(initialState));
    } catch (err) {
      console.error('[WebSocket] Failed sending initial state:', err);
    }

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    ws.on('message', async (messageData) => {
      try {
        // Per-socket message rate limiting: max 15 messages/sec per client
        const now = Date.now();
        const socketState = ws as any;
        if (now - (socketState.lastMsgReset || 0) > 1000) {
          socketState.msgCount = 0;
          socketState.lastMsgReset = now;
        }
        socketState.msgCount = (socketState.msgCount || 0) + 1;
        if (socketState.msgCount > 15) {
          ws.send(JSON.stringify({ type: 'error', message: 'WebSocket message rate limit exceeded.' }));
          return;
        }

        const text = messageData.toString();
        const msg = JSON.parse(text);

        if (msg.action === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }

        if (msg.action === 'fetch_live') {
          await executeSafeLiveTleFetch();

          broadcastWsMessage({
            type: 'conjunction_update',
            status: getSystemStatus(),
            objects: getObjectsSummaries(lastAnalysisDate, true),
            conjunctions: currentConjunctions,
            timestamp: Date.now()
          });
          return;
        }

        if (msg.action === 'load_demo') {
          console.log('\n[Operator Notice] ⚠️ Fleet switched to DETERMINISTIC DEMO / FALLBACK MODE via WebSocket.');
          const demo = await createDeterministicDemoScenario();
          currentTles = demo.records;
          currentSnapshotMetadata = demo.snapshot;
          activeSource = 'Deterministic Demo Conjunction Scenario';
          refreshSatrecCache();

          await executeSafeConjunctionDetection();

          broadcastWsMessage({
            type: 'conjunction_update',
            status: getSystemStatus(),
            objects: getObjectsSummaries(lastAnalysisDate, true),
            conjunctions: currentConjunctions,
            timestamp: Date.now()
          });
          return;
        }

        if (msg.action === 'reanalyze') {
          await executeSafeConjunctionDetection();

          broadcastWsMessage({
            type: 'conjunction_update',
            status: getSystemStatus(),
            objects: getObjectsSummaries(lastAnalysisDate, true),
            conjunctions: currentConjunctions,
            timestamp: Date.now()
          });
          return;
        }
      } catch (err: any) {
        console.error('[WebSocket Message Error]', err);
        ws.send(JSON.stringify({ type: 'error', message: err?.message || 'Invalid WebSocket payload' }));
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Client disconnected (code: ${code}). Total active clients: ${wss?.clients.size || 0}`);
    });

    ws.on('error', (err) => {
      console.warn('[WebSocket] Connection error:', err);
    });
  });

  // ── 5. Zombie Connection Reaper (Every 30s Heartbeat) ──────────────
  const heartbeatInterval = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      const client = ws as any;
      if (client.isAlive === false) {
        console.log(`[WebSocket Guard] Terminating inactive zombie socket from ${client.clientIp || 'unknown'}`);
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);

  // Continuous High-Frequency Telemetry Stream Broadcast Loop (Every 500ms)
  let streamOffset = 0;
  setInterval(() => {
    if (!wss || wss.clients.size === 0) return;
    const now = new Date();
    streamOffset = (streamOffset + 1) % 100;
    const telemetryList = getLiveTelemetryList(now, 2000, streamOffset);

    broadcastWsMessage({
      type: 'telemetry_stream',
      timestamp: now.getTime(),
      iso: now.toISOString(),
      objects: telemetryList
    });
  }, 500);

  // API ROUTES
  app.get(['/health', '/api/health'], (req, res) => {
    const isLive = activeSource.includes('Live') || activeSource.includes('CelesTrak');
    const { state, ageSeconds } = calculateFreshnessState(currentSnapshotMetadata, isLive);
    res.json({
      status: 'ok',
      wsClients: wss?.clients.size || 0,
      trackedCount: currentTles.length,
      activeSnapshotId: currentSnapshotMetadata?.id || null,
      freshnessState: state,
      ageSeconds,
      timestamp: new Date().toISOString()
    });
  });

  app.get(['/health/tle', '/api/health/tle'], async (req, res) => {
    const active = await loadActiveSnapshot();
    const meta = active.metadata || currentSnapshotMetadata;
    const isLive = activeSource.includes('Live') || activeSource.includes('CelesTrak');
    const { state, ageSeconds } = calculateFreshnessState(meta, isLive);
    res.json({
      status: 'ok',
      reachability: 'OK',
      activeSnapshotId: meta?.id || null,
      source: meta?.source || 'UNKNOWN',
      ageSeconds,
      freshnessState: state,
      leoCount: currentTles.length,
      invalidCount: meta?.invalidCount || 0,
      nonLeoCount: meta?.nonLeoCount || 0,
      circuitBreaker: getCircuitBreakerStatus(),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/data-status', async (req, res) => {
    const active = await loadActiveSnapshot();
    const meta = active.metadata || currentSnapshotMetadata;
    const isLive = activeSource.includes('Live') || activeSource.includes('CelesTrak');
    const { state, ageSeconds } = calculateFreshnessState(meta, isLive);
    const response: DataStatusResponse = {
      mode: meta ? meta.source : 'NO_DATA',
      source: activeSource,
      fetchedAt: meta?.fetchedAt || new Date().toISOString(),
      processedAt: meta?.processedAt || new Date().toISOString(),
      ageSeconds,
      freshnessState: state,
      objectCount: currentTles.length,
      totalFetched: meta?.totalFetched || currentTles.length,
      invalidCount: meta?.invalidCount || 0,
      nonLeoCount: meta?.nonLeoCount || 0,
      activeSnapshotId: meta?.id || 'none',
      isFallback: !isLive || state === 'STALE_SNAPSHOT' || state === 'CRITICAL_STALE',
      circuitBreaker: getCircuitBreakerStatus()
    };
    res.json(response);
  });

  app.get('/api/snapshots', async (req, res) => {
    const snapshots = await getSnapshotList();
    res.json(snapshots);
  });

  app.get('/api/status', async (req, res) => {
    res.json(getSystemStatus());
  });

  app.get('/api/telemetry/live', (req, res) => {
    const timeMs = Number(req.query.timestamp) || Date.now();
    const date = new Date(timeMs);
    const limit = Number(req.query.limit) || 2000;
    const telemetry = getLiveTelemetryList(date, limit);
    res.json({
      timestamp: date.toISOString(),
      epochMs: date.getTime(),
      count: telemetry.length,
      objects: telemetry
    });
  });

  const handleTleFetch = async (req: express.Request, res: express.Response) => {
    try {
      const result = await executeSafeLiveTleFetch();

      // Broadcast update over WebSocket to all active subscribers
      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate, true),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        count: currentTles.length,
        source: activeSource,
        isFallback: result.isFallback,
        snapshotId: currentSnapshotMetadata?.id || null,
        conjunctionsCount: currentConjunctions.length
      });
    } catch (err: any) {
      console.error('[API /tle/fetch Error]', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed fetching TLE data' });
    }
  };

  app.get('/api/tle/fetch', handleTleFetch);
  app.post('/api/tle/fetch', handleTleFetch);

  app.post('/api/tle/demo', async (req, res) => {
    try {
      console.log('\n[Operator Notice] ⚠️ Fleet switched to DETERMINISTIC DEMO / FALLBACK MODE via HTTP API.');
      const demo = await createDeterministicDemoScenario();
      currentTles = demo.records;
      currentSnapshotMetadata = demo.snapshot;
      activeSource = 'Deterministic Demo Conjunction Scenario';
      refreshSatrecCache();

      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate, true),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        count: currentTles.length,
        source: activeSource,
        snapshotId: demo.snapshot.id,
        conjunctionsCount: currentConjunctions.length
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post('/api/tle/import', async (req, res) => {
    try {
      const { content, sourceLabel } = req.body || {};
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing or invalid "content" in request body' });
      }

      const result = await ingestRawTleContent(content, sourceLabel || 'Manual Import');
      currentTles = result.records;
      currentSnapshotMetadata = result.snapshot;
      activeSource = `${sourceLabel || 'Manual Import'} (Custom Ingestion)`;
      refreshSatrecCache();

      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate, true),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        count: currentTles.length,
        source: activeSource,
        snapshotId: result.snapshot.id,
        conjunctionsCount: currentConjunctions.length
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Failed to import TLE data' });
    }
  });


  app.get('/api/objects', (req, res) => {
    const { page, limit, search, type } = req.query;
    const now = new Date();

    if (page || limit || search || type) {
      let filtered = currentTles;
      if (type && typeof type === 'string' && type !== 'ALL') {
        filtered = filtered.filter((t) => t.classification === type);
      }
      if (search && typeof search === 'string' && search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter((t) => t.name.toLowerCase().includes(q) || t.id.includes(q));
      }

      const p = Math.max(1, Number(page) || 1);
      const l = Math.min(500, Math.max(1, Number(limit) || 50));
      const total = filtered.length;
      const offset = (p - 1) * l;
      const pageRecords = filtered.slice(offset, offset + l);

      const pageSummaries = pageRecords.map((r) => {
        const wrapper = createSatrec(r);
        return getObjectSummary(wrapper, now, true);
      });

      return res.json({
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        objects: pageSummaries
      });
    }

    res.json(getObjectsSummaries(now, true));
  });

  app.get('/api/objects/:id/trajectory', (req, res) => {
    const { id } = req.params;
    const target = currentTles.find((t) => t.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Object not found' });
    }

    const wrapper = createSatrec(target);
    if (!wrapper.isValid) {
      return res.status(400).json({ error: 'Invalid TLE orbit elements' });
    }

    const points = generateTrajectory(
      wrapper,
      lastAnalysisDate,
      Math.min(activeConfig.predictionHours, 24),
      Math.max(activeConfig.timeStepSeconds, 120) // optimized step for visualizer
    );

    res.json({
      object: getObjectSummary(wrapper, lastAnalysisDate),
      points
    });
  });

  app.get('/api/conjunctions', (req, res) => {
    const { risk, maxDistance, minScore } = req.query;

    let filtered = [...currentConjunctions];
    if (risk && typeof risk === 'string' && risk !== 'ALL') {
      filtered = filtered.filter((c) => c.riskLevel.toUpperCase() === risk.toUpperCase());
    }
    if (maxDistance && !isNaN(Number(maxDistance))) {
      filtered = filtered.filter((c) => c.minDistanceKm <= Number(maxDistance));
    }
    if (minScore && !isNaN(Number(minScore))) {
      filtered = filtered.filter((c) => c.riskScore >= Number(minScore));
    }

    res.json(filtered);
  });

  app.get('/api/conjunctions/csv', (req, res) => {
    const { risk, maxDistance, minScore } = req.query;

    let filtered = [...currentConjunctions];
    if (risk && typeof risk === 'string' && risk !== 'ALL') {
      filtered = filtered.filter((c) => c.riskLevel.toUpperCase() === risk.toUpperCase());
    }
    if (maxDistance && !isNaN(Number(maxDistance))) {
      filtered = filtered.filter((c) => c.minDistanceKm <= Number(maxDistance));
    }
    if (minScore && !isNaN(Number(minScore))) {
      filtered = filtered.filter((c) => c.riskScore >= Number(minScore));
    }

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Conjunction_ID',
      'Risk_Level',
      'Risk_Score',
      'Primary_Object_Name',
      'Primary_Object_NORAD_ID',
      'Primary_Object_Type',
      'Secondary_Object_Name',
      'Secondary_Object_NORAD_ID',
      'Secondary_Object_Type',
      'TCA_UTC_Timestamp',
      'Time_To_TCA_Hours',
      'Time_To_TCA_Minutes',
      'Miss_Distance_km',
      'Miss_Distance_meters',
      'Relative_Velocity_km_s',
      'Relative_Speed_km_h',
      'Relative_Speed_Mach',
      'Distance_Score_Component',
      'Velocity_Score_Component',
      'Time_Score_Component',
      'Primary_ECI_X_km',
      'Primary_ECI_Y_km',
      'Primary_ECI_Z_km',
      'Secondary_ECI_X_km',
      'Secondary_ECI_Y_km',
      'Secondary_ECI_Z_km',
      'Advisory_DeltaV_ms',
      'Is_Simulated_Hazard'
    ];

    const rows = filtered.map((c) => {
      const minDistance = c.minDistanceKm ?? 0;
      const timeToEvent = c.breakdown?.timeToEventHours ?? c.timeToEventHours ?? 0;
      const relVel = c.relativeVelocityKmS ?? 0;
      const relSpeedKmh = relVel * 3600;
      const relSpeedMach = relSpeedKmh / 1234.8;
      const riskScore = c.riskScore ?? 0;

      return [
        escapeCsv(c.id),
        escapeCsv(c.riskLevel),
        escapeCsv(riskScore.toFixed(2)),
        escapeCsv(c.objectA?.name || 'Unknown Primary'),
        escapeCsv(c.objectA?.noradId || 'N/A'),
        escapeCsv(c.objectA?.classification || 'UNKNOWN'),
        escapeCsv(c.objectB?.name || 'Unknown Secondary'),
        escapeCsv(c.objectB?.noradId || 'N/A'),
        escapeCsv(c.objectB?.classification || 'UNKNOWN'),
        escapeCsv(c.tcaIso || 'N/A'),
        escapeCsv(timeToEvent.toFixed(3)),
        escapeCsv((timeToEvent * 60).toFixed(1)),
        escapeCsv(minDistance.toFixed(4)),
        escapeCsv((minDistance * 1000).toFixed(1)),
        escapeCsv(relVel.toFixed(3)),
        escapeCsv(relSpeedKmh.toFixed(1)),
        escapeCsv(relSpeedMach.toFixed(2)),
        escapeCsv(c.breakdown?.distanceScore?.toFixed(2) ?? 'N/A'),
        escapeCsv(c.breakdown?.velocityScore?.toFixed(2) ?? 'N/A'),
        escapeCsv(c.breakdown?.timeScore?.toFixed(2) ?? 'N/A'),
        escapeCsv(c.positionAAtTca?.x?.toFixed(4) ?? 'N/A'),
        escapeCsv(c.positionAAtTca?.y?.toFixed(4) ?? 'N/A'),
        escapeCsv(c.positionAAtTca?.z?.toFixed(4) ?? 'N/A'),
        escapeCsv(c.positionBAtTca?.x?.toFixed(4) ?? 'N/A'),
        escapeCsv(c.positionBAtTca?.y?.toFixed(4) ?? 'N/A'),
        escapeCsv(c.positionBAtTca?.z?.toFixed(4) ?? 'N/A'),
        escapeCsv('4.8'),
        escapeCsv(c.isSimulatedHazard ? 'TRUE' : 'FALSE')
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="conjunction_risk_assessment_${timestampStr}.csv"`);
    res.send(csvContent);
  });

  app.get('/api/conjunctions/:id/distance-history', (req, res) => {
    const { id } = req.params;
    const conj = currentConjunctions.find((c) => c.id === id);
    if (!conj) {
      return res.status(404).json({ error: 'Conjunction event not found' });
    }

    const recA = currentTles.find((t) => t.id === conj.objectA.id || t.name === conj.objectA.name);
    const recB = currentTles.find((t) => t.id === conj.objectB.id || t.name === conj.objectB.name);

    const targetRecA: TleRecord = recA || {
      id: conj.objectA.id,
      name: conj.objectA.name,
      line1: '',
      line2: '',
      classification: conj.objectA.classification,
      source: 'SAMPLE_DATASET',
      epochYear: 2026,
      epochDay: 1,
      inclinationDeg: conj.objectA.inclinationDeg || 51.6,
      raanDeg: 0,
      eccentricity: 0.001,
      argPerigeeDeg: 0,
      meanAnomalyDeg: 0,
      meanMotionRevDay: 1440 / (conj.objectA.periodMin || 92),
      periodMin: conj.objectA.periodMin || 92,
      perigeeKm: conj.objectA.perigeeKm || 400,
      apogeeKm: conj.objectA.apogeeKm || 420,
      status: 'TRACKED',
      updatedAt: new Date().toISOString()
    };

    const targetRecB: TleRecord = recB || {
      id: conj.objectB.id,
      name: conj.objectB.name,
      line1: '',
      line2: '',
      classification: conj.objectB.classification,
      source: 'SAMPLE_DATASET',
      epochYear: 2026,
      epochDay: 1,
      inclinationDeg: conj.objectB.inclinationDeg || 74.0,
      raanDeg: 0,
      eccentricity: 0.001,
      argPerigeeDeg: 0,
      meanAnomalyDeg: 0,
      meanMotionRevDay: 1440 / (conj.objectB.periodMin || 92),
      periodMin: conj.objectB.periodMin || 92,
      perigeeKm: conj.objectB.perigeeKm || 400,
      apogeeKm: conj.objectB.apogeeKm || 420,
      status: 'TRACKED',
      updatedAt: new Date().toISOString()
    };

    const tcaDate = new Date(conj.tcaIso);
    const spanMinutes = Math.min(180, Math.max(10, Number(req.query.spanMinutes) || 60));
    const history = getDistanceHistory(
      targetRecA,
      targetRecB,
      tcaDate,
      spanMinutes,
      conj.minDistanceKm,
      conj.relativeVelocityKmS
    );
    res.json(history);
  });

  app.get('/api/config', (req, res) => {
    res.json(activeConfig);
  });

  app.post('/api/config', (req, res) => {
    try {
      const newConfig = req.body as Partial<SystemConfig>;
      activeConfig = {
        ...activeConfig,
        ...newConfig,
        riskWeights: {
          ...activeConfig.riskWeights,
          ...(newConfig.riskWeights || {})
        },
        riskThresholds: {
          ...activeConfig.riskThresholds,
          ...(newConfig.riskThresholds || {})
        }
      };

      // Recalculate
      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        config: activeConfig,
        conjunctionsCount: currentConjunctions.length
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Invalid configuration' });
    }
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      await executeSafeConjunctionDetection();

      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        conjunctionsCount: currentConjunctions.length,
        analyzedAt: lastAnalysisDate.toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Analysis error' });
    }
  });

  // Handler for Conjunction AI Assessment (Gemini API)
  const handleConjunctionAssessment = async (req: express.Request, res: express.Response) => {
    const { id } = req.params;
    const forceRefresh = req.body?.forceRefresh === true || req.query?.force === 'true';
    let conj = currentConjunctions.find((c) => c.id === id);
    if (!conj && req.body?.conjunction) {
      conj = req.body.conjunction;
    }
    if (!conj) {
      return res.status(404).json({ error: `Conjunction event ${id} not found in active tracking registry.` });
    }

    if (forceRefresh) {
      console.log(`[Gemini API] 🔄 Force refresh requested for conjunction ${id}. Evicting cache.`);
      aiAssessmentCache.delete(id);
    } else {
      const cached = aiAssessmentCache.get(id);
      if (cached && Date.now() < cached.expiresAt) {
        console.log(`[Gemini API] ⚡ Returning cached assessment for ${id} (TTL remaining: ${Math.round((cached.expiresAt - Date.now()) / 1000)}s)`);
        return res.json({ ...cached.data, isCached: true });
      }
    }

    try {
      console.log(`[Gemini API] 🚀 Dispatching live Gemini API assessment for ${id} (${conj.objectA?.name} vs ${conj.objectB?.name})...`);
      const startTime = Date.now();
      const result = await getConjunctionAssessment(conj, currentTles);
      const elapsedMs = Date.now() - startTime;
      console.log(`[Gemini API] ✅ Live assessment completed in ${elapsedMs}ms for ${id}. Status: ${result.assessment?.status || 'DONE'}`);
      
      aiAssessmentCache.set(id, {
        data: result,
        expiresAt: Date.now() + 15 * 60 * 1000 // 15-minute cache
      });
      res.json({ ...result, isCached: false });
    } catch (err: any) {
      console.error('[Gemini API Error] Failed generating conjunction assessment:', err);
      res.status(500).json({ error: err?.message || 'Failed generating AI assessment' });
    }
  };

  // POST & GET /api/conjunctions/:id/assess - Returns structured Gemini AI assessment
  app.post('/api/conjunctions/:id/assess', handleConjunctionAssessment);
  app.get('/api/conjunctions/:id/assess', handleConjunctionAssessment);

  // POST /api/conjunctions/:id/simulate - Runs local physics-based maneuver simulation
  app.post('/api/conjunctions/:id/simulate', (req, res) => {
    const { id } = req.params;
    const { burnDirection, burnMagnitudeMs, burnTimeHoursBeforeTca, conjunction } = req.body || {};

    let conj = currentConjunctions.find((c) => c.id === id);
    if (!conj && conjunction) {
      conj = conjunction;
    }
    if (!conj) {
      return res.status(404).json({ error: 'Conjunction event not found' });
    }

    try {
      const parsedMagnitude = burnMagnitudeMs !== undefined && !isNaN(Number(burnMagnitudeMs)) ? Number(burnMagnitudeMs) : 5.0;
      const parsedTime = burnTimeHoursBeforeTca !== undefined && !isNaN(Number(burnTimeHoursBeforeTca)) ? Number(burnTimeHoursBeforeTca) : 12.0;

      const result = simulateManeuver(
        conj,
        currentTles,
        burnDirection || 'PROGRADE',
        parsedMagnitude,
        parsedTime
      );
      res.json(result);
    } catch (err: any) {
      console.error('[Simulation Error]', err);
      res.status(400).json({ error: err?.message || 'Failed running maneuver simulation' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Space Debris Tracking Dashboard running with WebSockets on http://localhost:${PORT}`);
  });
}

startServer();

