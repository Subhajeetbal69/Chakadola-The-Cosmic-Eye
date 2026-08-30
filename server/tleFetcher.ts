import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TleRecord, SnapshotMetadata } from './types';
import { parseTleWithMetrics } from './tleParser';
import { saveNewSnapshot, loadActiveSnapshot, setMetadata } from './db';

const CATALOG_16063_PATH = path.join(process.cwd(), 'data', 'catalog_16063.tle');
const SAMPLE_FILE_PATH = path.join(process.cwd(), 'server', 'sample_tles.txt');
export const MINIMUM_LEO_OBJECTS_THRESHOLD = 100;

// High-Priority CelesTrak LEO Target Endpoints covering active constellations, stations & debris clouds
const CELESTRAK_LEO_URLS = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=1982-092-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=special&FORMAT=tle'
];

/**
 * Loads baseline raw TLE content from local disk (used strictly for bootstrap fallback)
 */
function readBootstrapRawContent(): string {
  try {
    if (fs.existsSync(SAMPLE_FILE_PATH)) {
      return fs.readFileSync(SAMPLE_FILE_PATH, 'utf8');
    }
    if (fs.existsSync(CATALOG_16063_PATH)) {
      return fs.readFileSync(CATALOG_16063_PATH, 'utf8');
    }
  } catch (err) {
    console.error('[TLE Fetcher] Failed reading bootstrap TLE file:', err);
  }
  return '';
}

/**
 * Bootstraps an initial LEO snapshot into SQLite if the database is fresh/empty
 */
export async function bootstrapInitialSnapshot(): Promise<{ records: TleRecord[]; snapshot: SnapshotMetadata }> {
  const raw = readBootstrapRawContent();
  const { records, metrics } = parseTleWithMetrics(raw, 'LOCAL_SNAPSHOT', true);

  const snapId = `snap_boot_${Date.now()}`;
  const nowIso = new Date().toISOString();
  const hash = crypto.createHash('sha256').update(raw || 'empty').digest('hex').slice(0, 16);

  const metadata: SnapshotMetadata = {
    id: snapId,
    source: 'LOCAL_SNAPSHOT',
    fetchedAt: nowIso,
    processedAt: nowIso,
    objectCount: records.length,
    totalFetched: metrics.validRecords + metrics.nonLeoRecords,
    invalidCount: metrics.invalidChecksums,
    nonLeoCount: metrics.nonLeoRecords,
    dataHash: hash,
    isActive: true,
    status: 'ACTIVE'
  };

  console.log(`[TLE Fetcher] Bootstrapping initial LEO snapshot (${records.length} LEO objects, ${metrics.nonLeoRecords} non-LEO filtered).`);
  await saveNewSnapshot(metadata, records);
  return { records, snapshot: metadata };
}

/**
 * Creates deterministic test conjunction scenario maintaining LEO invariant
 */
export async function createDeterministicDemoScenario(): Promise<{ records: TleRecord[]; snapshot: SnapshotMetadata }> {
  const active = await loadActiveSnapshot();
  let baseRecords = active.records;
  if (baseRecords.length === 0) {
    const boot = await bootstrapInitialSnapshot();
    baseRecords = boot.records;
  }

  const snapId = `snap_demo_${Date.now()}`;
  const nowIso = new Date().toISOString();
  const demoRecords: TleRecord[] = baseRecords.map((r) => ({
    ...r,
    source: 'DEMO_CONJUNCTION' as const,
    snapshotId: snapId,
    updatedAt: nowIso
  }));

  const hash = crypto.createHash('sha256').update(`demo_${snapId}`).digest('hex').slice(0, 16);
  const metadata: SnapshotMetadata = {
    id: snapId,
    source: 'DEMO_SCENARIO',
    fetchedAt: nowIso,
    processedAt: nowIso,
    objectCount: demoRecords.length,
    totalFetched: demoRecords.length,
    invalidCount: 0,
    nonLeoCount: 0,
    dataHash: hash,
    isActive: true,
    status: 'ACTIVE'
  };

  await saveNewSnapshot(metadata, demoRecords);
  return { records: demoRecords, snapshot: metadata };
}

/**
 * Fetches a single CelesTrak URL with timeout and 1 retry
 */
async function fetchWithRetry(url: string, timeoutMs: number = 12000, maxRetries: number = 1): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SpaceDebrisTracker/2.0'
        }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 50 && !text.includes('<html')) {
          return text;
        }
      }
    } catch {
      // Retry once on failure
    }
  }
  return '';
}

export interface FetchLiveTleResult {
  records: TleRecord[];
  snapshot: SnapshotMetadata | null;
  source: string;
  isFallback: boolean;
  metrics?: {
    totalFetched: number;
    leoRecords: number;
    nonLeoRecords: number;
    invalidChecksums: number;
  };
}

/**
 * Fetches real LEO TLE data from CelesTrak, parses and strictly filters to LEO,
 * atomically stores into a new SQLite snapshot, and prunes older historical snapshots.
 * Seamlessly falls back to the most recent valid active snapshot on network degradation.
 */
export async function fetchLiveTleData(): Promise<FetchLiveTleResult> {
  const fetchPromises = CELESTRAK_LEO_URLS.map((url) => fetchWithRetry(url, 12000, 1));
  const results = await Promise.allSettled(fetchPromises);

  let fetchedText = '';
  let successfulEndpoints = 0;

  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      fetchedText += '\n' + res.value;
      successfulEndpoints++;
    }
  }

  // Check if CelesTrak responded with sufficient text
  if (successfulEndpoints > 0 && fetchedText.length > 200) {
    const { records, metrics } = parseTleWithMetrics(fetchedText, 'CELESTRAK', true);

    if (records.length >= MINIMUM_LEO_OBJECTS_THRESHOLD) {
      const snapId = `snap_celestrak_${Date.now()}`;
      const nowIso = new Date().toISOString();
      const dataHash = crypto.createHash('sha256').update(fetchedText).digest('hex').slice(0, 16);

      const metadata: SnapshotMetadata = {
        id: snapId,
        source: 'CELESTRAK',
        fetchedAt: nowIso,
        processedAt: nowIso,
        objectCount: records.length,
        totalFetched: metrics.validRecords + metrics.nonLeoRecords,
        invalidCount: metrics.invalidChecksums,
        nonLeoCount: metrics.nonLeoRecords,
        dataHash,
        isActive: true,
        status: 'ACTIVE'
      };

      console.log(
        `[TLE Fetcher] Successfully fetched ${records.length} LEO records from CelesTrak ` +
        `(${metrics.nonLeoRecords} non-LEO excluded, ${metrics.invalidChecksums} invalid checksums).`
      );

      await saveNewSnapshot(metadata, records);
      await setMetadata('active_source', 'CelesTrak (Live LEO Ingestion)');

      return {
        records,
        snapshot: metadata,
        source: 'CelesTrak (Live LEO Ingestion)',
        isFallback: false,
        metrics: {
          totalFetched: metadata.totalFetched,
          leoRecords: records.length,
          nonLeoRecords: metrics.nonLeoRecords,
          invalidChecksums: metrics.invalidChecksums
        }
      };
    } else {
      console.warn(`[TLE Fetcher] CelesTrak returned only ${records.length} LEO objects (below ${MINIMUM_LEO_OBJECTS_THRESHOLD} threshold). Triggering fallback snapshot.`);
    }
  } else {
    console.warn('[TLE Fetcher] CelesTrak unreachable or timed out. Triggering fallback snapshot.');
  }

  // Fallback Phase: Load latest active snapshot from SQLite
  const active = await loadActiveSnapshot();
  if (active.records.length > 0 && active.metadata) {
    console.log(`[TLE Fetcher] Using active fallback snapshot (${active.records.length} objects, snapshot ID: ${active.metadata.id}).`);
    return {
      records: active.records,
      snapshot: active.metadata,
      source: `${active.metadata.source} (Snapshot Cache)`,
      isFallback: true
    };
  }

  // Cold Bootstrap Fallback
  const boot = await bootstrapInitialSnapshot();
  return {
    records: boot.records,
    snapshot: boot.snapshot,
    source: 'Local LEO Baseline Snapshot',
    isFallback: true
  };
}




