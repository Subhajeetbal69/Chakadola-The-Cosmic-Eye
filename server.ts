import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  TleRecord,
  SystemConfig,
  ConjunctionEvent,
  SystemStatus,
  TrackedObjectSummary,
  LiveTelemetryObject
} from './src/types';
import {
  fetchLiveTleData,
  createDeterministicDemoScenario,
  loadSampleTleDataset
} from './server/tleFetcher';
import {
  detectConjunctions,
  DEFAULT_CONFIG,
  getDistanceHistory,
  calculateRiskScore
} from './server/conjunctionEngine';
import {
  createSatrec,
  generateTrajectory,
  getObjectSummary,
  propagateAtTime
} from './server/propagator';
import { getDb, loadAllTles, saveTleRecords, setMetadata, getMetadata } from './server/db';

let currentTles: TleRecord[] = [];
let currentConjunctions: ConjunctionEvent[] = [];
let activeConfig: SystemConfig = { ...DEFAULT_CONFIG };
let activeSource = 'Curated Reference Fleet (Offline)';
let lastAnalysisDate: Date = new Date();
let wss: WebSocketServer | null = null;

function getSystemStatus(): SystemStatus {
  const activeSats = currentTles.filter((t) => t.classification === 'ACTIVE_SATELLITE').length;
  const debris = currentTles.filter((t) => t.classification === 'DEBRIS').length;
  const rocketBodies = currentTles.filter((t) => t.classification === 'ROCKET_BODY').length;

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
    isLiveCelesTrak: activeSource.includes('CelesTrak'),
    wsConnectedClients: wss ? wss.clients.size : 0
  };
}

function getLiveTelemetryList(date: Date = new Date()): LiveTelemetryObject[] {
  const wrappers = currentTles.map((r) => createSatrec(r)).filter((w) => w.isValid);
  return wrappers.map((w) => {
    const summary = getObjectSummary(w, date);
    return {
      id: summary.id,
      name: summary.name,
      classification: summary.classification,
      noradId: summary.noradId,
      pos: summary.currentPosition,
      vel: summary.currentVelocity,
      speedKmS: summary.speedKmS,
      altKm: summary.altitudeKm,
      lat: summary.lat,
      lng: summary.lng,
      epochTimestamp: date.getTime()
    };
  });
}

function getObjectsSummaries(date: Date = new Date()): TrackedObjectSummary[] {
  const wrappers = currentTles.map((r) => createSatrec(r)).filter((w) => w.isValid);
  return wrappers.map((w) => getObjectSummary(w, date));
}

function broadcastWsMessage(data: any) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function initCoreEngine() {
  await getDb();
  const baseMasterRecords = loadSampleTleDataset();
  const dbRecords = await loadAllTles();
  
  if (dbRecords.length === baseMasterRecords.length && baseMasterRecords.length > 0) {
    currentTles = dbRecords;
    activeSource = await getMetadata('active_source', 'Curated Reference Fleet (Offline)');
  } else {
    currentTles = baseMasterRecords;
    await saveTleRecords(currentTles);
    activeSource = 'Curated Reference Fleet (Offline)';
  }

  // Run initial conjunction detection
  lastAnalysisDate = new Date();
  currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);
  console.log(`[Core Engine] Initialized with ${currentTles.length} objects and ${currentConjunctions.length} conjunctions.`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize DB and astrodynamics engine
  await initCoreEngine();

  // Create HTTP server for both Express and WebSockets
  const server = http.createServer(app);

  // Initialize WebSocket Server with explicit upgrade routing to avoid Vite HMR conflicts
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws' || url.pathname.startsWith('/ws')) {
        wss?.handleUpgrade(request, socket, head, (ws) => {
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
      objects: getObjectsSummaries(new Date()),
      conjunctions: currentConjunctions,
      timestamp: Date.now()
    };
    try {
      ws.send(JSON.stringify(initialState));
    } catch (err) {
      console.error('[WebSocket] Failed sending initial state:', err);
    }

    ws.on('message', async (messageData) => {
      try {
        const text = messageData.toString();
        const msg = JSON.parse(text);

        if (msg.action === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }

        if (msg.action === 'fetch_live') {
          const result = await fetchLiveTleData();
          currentTles = result.records;
          activeSource = result.source;
          lastAnalysisDate = new Date();
          currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

          broadcastWsMessage({
            type: 'conjunction_update',
            status: getSystemStatus(),
            objects: getObjectsSummaries(lastAnalysisDate),
            conjunctions: currentConjunctions,
            timestamp: Date.now()
          });
          return;
        }

        if (msg.action === 'load_demo') {
          const demoRecords = createDeterministicDemoScenario();
          currentTles = demoRecords;
          activeSource = 'Deterministic Demo Conjunction Scenario';
          await saveTleRecords(currentTles);
          await setMetadata('active_source', activeSource);

          lastAnalysisDate = new Date();
          currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

          broadcastWsMessage({
            type: 'conjunction_update',
            status: getSystemStatus(),
            objects: getObjectsSummaries(lastAnalysisDate),
            conjunctions: currentConjunctions,
            timestamp: Date.now()
          });
          return;
        }

        if (msg.action === 'reanalyze') {
          lastAnalysisDate = new Date();
          currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

          broadcastWsMessage({
            type: 'conjunction_update',
            status: getSystemStatus(),
            objects: getObjectsSummaries(lastAnalysisDate),
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

  // Continuous High-Frequency Telemetry Stream Broadcast Loop (Every 500ms)
  setInterval(() => {
    if (!wss || wss.clients.size === 0) return;
    const now = new Date();
    const telemetryList = getLiveTelemetryList(now);

    broadcastWsMessage({
      type: 'telemetry_stream',
      timestamp: now.getTime(),
      iso: now.toISOString(),
      objects: telemetryList
    });
  }, 500);

  // API ROUTES
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      wsClients: wss?.clients.size || 0,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/status', async (req, res) => {
    res.json(getSystemStatus());
  });

  app.get('/api/telemetry/live', (req, res) => {
    const timeMs = Number(req.query.timestamp) || Date.now();
    const date = new Date(timeMs);
    const telemetry = getLiveTelemetryList(date);
    res.json({
      timestamp: date.toISOString(),
      epochMs: date.getTime(),
      count: telemetry.length,
      objects: telemetry
    });
  });

  app.get('/api/tle/fetch', async (req, res) => {
    try {
      const result = await fetchLiveTleData();
      currentTles = result.records;
      activeSource = result.source;
      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

      // Broadcast update over WebSocket to all active subscribers
      broadcastWsMessage({
        type: 'conjunction_update',
        status: getSystemStatus(),
        objects: getObjectsSummaries(lastAnalysisDate),
        conjunctions: currentConjunctions,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        count: currentTles.length,
        source: activeSource,
        isFallback: result.isFallback,
        conjunctionsCount: currentConjunctions.length
      });
    } catch (err: any) {
      console.error('[API /tle/fetch Error]', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed fetching TLE data' });
    }
  });

  app.post('/api/tle/demo', async (req, res) => {
    try {
      const demoRecords = createDeterministicDemoScenario();
      currentTles = demoRecords;
      activeSource = 'Deterministic Demo Conjunction Scenario';
      await saveTleRecords(currentTles);
      await setMetadata('active_source', activeSource);

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
        count: currentTles.length,
        source: activeSource,
        conjunctionsCount: currentConjunctions.length
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.get('/api/objects', (req, res) => {
    const now = new Date();
    res.json(getObjectsSummaries(now));
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

  app.post('/api/analyze', (req, res) => {
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
      conjunctionsCount: currentConjunctions.length,
      analyzedAt: lastAnalysisDate.toISOString()
    });
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

