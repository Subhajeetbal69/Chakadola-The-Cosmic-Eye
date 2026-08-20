import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  TleRecord,
  SystemConfig,
  ConjunctionEvent,
  SystemStatus,
  TrackedObjectSummary
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
let activeSource = 'Embedded Sample Dataset';
let lastAnalysisDate: Date = new Date();

async function initCoreEngine() {
  await getDb();
  const dbRecords = await loadAllTles();
  if (dbRecords.length > 0) {
    currentTles = dbRecords;
    activeSource = await getMetadata('active_source', 'Cached SQLite Database');
  } else {
    currentTles = loadSampleTleDataset();
    await saveTleRecords(currentTles);
    activeSource = 'Embedded Sample Dataset';
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

  // API ROUTES
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/status', async (req, res) => {
    const status: SystemStatus = {
      lastDataUpdate: lastAnalysisDate.toISOString(),
      trackedObjectsCount: currentTles.length,
      analysisWindowHours: activeConfig.predictionHours,
      timeStepSeconds: activeConfig.timeStepSeconds,
      detectedConjunctionsCount: currentConjunctions.length,
      activeSource,
      config: activeConfig
    };
    res.json(status);
  });

  app.get('/api/tle/fetch', async (req, res) => {
    try {
      const result = await fetchLiveTleData(activeConfig.datasetSize);
      currentTles = result.records;
      activeSource = result.source;
      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

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
      currentTles = demoRecords.slice(0, activeConfig.datasetSize);
      activeSource = 'Deterministic Demo Conjunction Scenario';
      await saveTleRecords(currentTles);
      await setMetadata('active_source', activeSource);

      lastAnalysisDate = new Date();
      currentConjunctions = detectConjunctions(currentTles, activeConfig, lastAnalysisDate);

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
    const wrappers = currentTles.map((r) => createSatrec(r)).filter((w) => w.isValid);
    const summaries: TrackedObjectSummary[] = wrappers.map((w) => getObjectSummary(w, now));
    res.json(summaries);
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

  app.get('/api/conjunctions/:id/distance-history', (req, res) => {
    const { id } = req.params;
    const conj = currentConjunctions.find((c) => c.id === id);
    if (!conj) {
      return res.status(404).json({ error: 'Conjunction event not found' });
    }

    const recA = currentTles.find((t) => t.id === conj.objectA.id);
    const recB = currentTles.find((t) => t.id === conj.objectB.id);

    if (!recA || !recB) {
      return res.status(404).json({ error: 'Objects corresponding to conjunction not found' });
    }

    const tcaDate = new Date(conj.tcaIso);
    const history = getDistanceHistory(recA, recB, tcaDate, 90); // 90 min window around TCA
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Space Debris Tracking Dashboard running on http://localhost:${PORT}`);
  });
}

startServer();
