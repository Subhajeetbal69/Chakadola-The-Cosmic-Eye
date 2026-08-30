import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TleRecord, SnapshotMetadata } from './types';
import { parseTleWithMetrics } from './tleParser';
import { saveNewSnapshot, loadActiveSnapshot, setMetadata } from './db';

const CATALOG_16063_PATH = path.join(process.cwd(), 'data', 'catalog_16063.tle');
const SAMPLE_FILE_PATH = path.join(process.cwd(), 'server', 'sample_tles.txt');
export const MINIMUM_LEO_OBJECTS_THRESHOLD = 100;

// High-Yield Priority CelesTrak LEO Target Endpoints
const CELESTRAK_LEO_URLS = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=1982-092-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=special&FORMAT=tle'
];

// Secondary Online Mirror Endpoints (High-reliability fallback)
const SECONDARY_TLE_MIRROR_URLS = [
  'https://tle.ivanstanojevic.me/api/tle/?page-size=100'
];

// ── Circuit Breaker State ──────────────────────────────────────────
export interface CircuitBreakerStatus {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  failureThreshold: number;
  cooldownRemainingSec: number;
  lastFailureTime: string | null;
  lastSuccessTime: string | null;
  lastError: string | null;
  totalAttempts: number;
}

const circuitBreaker = {
  state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
  consecutiveFailures: 0,
  failureThreshold: 2,
  cooldownPeriodMs: 30 * 60 * 1000, // 30 minutes cooldown
  lastFailureTime: 0,
  lastSuccessTime: 0,
  lastError: null as string | null,
  totalAttempts: 0
};

export function getCircuitBreakerStatus(): CircuitBreakerStatus {
  const now = Date.now();
  let currentState = circuitBreaker.state;
  let remainingMs = 0;

  if (currentState === 'OPEN') {
    const elapsed = now - circuitBreaker.lastFailureTime;
    if (elapsed >= circuitBreaker.cooldownPeriodMs) {
      currentState = 'HALF_OPEN';
    } else {
      remainingMs = circuitBreaker.cooldownPeriodMs - elapsed;
    }
  }

  return {
    state: currentState,
    consecutiveFailures: circuitBreaker.consecutiveFailures,
    failureThreshold: circuitBreaker.failureThreshold,
    cooldownRemainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
    lastFailureTime: circuitBreaker.lastFailureTime ? new Date(circuitBreaker.lastFailureTime).toISOString() : null,
    lastSuccessTime: circuitBreaker.lastSuccessTime ? new Date(circuitBreaker.lastSuccessTime).toISOString() : null,
    lastError: circuitBreaker.lastError,
    totalAttempts: circuitBreaker.totalAttempts
  };
}

function recordSuccess() {
  circuitBreaker.state = 'CLOSED';
  circuitBreaker.consecutiveFailures = 0;
  circuitBreaker.lastSuccessTime = Date.now();
  circuitBreaker.lastError = null;
}

function recordFailure(errorMessage: string) {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.lastFailureTime = Date.now();
  circuitBreaker.lastError = errorMessage;

  if (circuitBreaker.consecutiveFailures >= circuitBreaker.failureThreshold) {
    circuitBreaker.state = 'OPEN';
    console.warn(`[Circuit Breaker] ⚠️ Tripped to OPEN state for 30 minutes. Reason: ${errorMessage}`);
  }
}

/**
 * Utility pause helper for polite sequential fetching
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * Ingests custom or uploaded raw TLE text into a new active snapshot
 */
export async function ingestRawTleContent(
  rawContent: string,
  sourceLabel: string = 'USER_IMPORT'
): Promise<{ success: boolean; records: TleRecord[]; snapshot: SnapshotMetadata; error?: string }> {
  if (!rawContent || rawContent.trim().length < 50) {
    throw new Error('Provided TLE text is too short or empty.');
  }

  const { records, metrics } = parseTleWithMetrics(rawContent, 'LOCAL_SNAPSHOT', true);

  if (records.length === 0) {
    throw new Error(`Failed to parse any valid LEO orbital elements (${metrics.invalidChecksums} invalid checksums, ${metrics.nonLeoRecords} non-LEO filtered).`);
  }

  const snapId = `snap_import_${Date.now()}`;
  const nowIso = new Date().toISOString();
  const hash = crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16);

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

  console.log(`[TLE Ingestion] Successfully imported ${records.length} LEO records from ${sourceLabel}.`);
  await saveNewSnapshot(metadata, records);
  await setMetadata('active_source', `${sourceLabel} (Custom Ingestion)`);

  return { success: true, records, snapshot: metadata };
}

/**
 * Fetches a single URL with timeout, headers, and explicit HTTP diagnostic reporting
 */
async function fetchWithDiagnostics(url: string, timeoutMs: number = 6000): Promise<{ ok: boolean; data: string; status?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SpaceDebrisTracker/2.0 (Astrodynamics-Research)',
        'Accept': 'text/plain, application/json, */*'
      }
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const text = await resp.text();
      if (text && text.length > 50 && !text.includes('<html')) {
        return { ok: true, data: text, status: resp.status };
      }
      return { ok: false, data: '', status: resp.status, error: `Invalid content received (${text.length} bytes, contains HTML/error page)` };
    } else {
      return { ok: false, data: '', status: resp.status, error: `HTTP ${resp.status} ${resp.statusText}` };
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || err?.message?.includes('timeout');
    const msg = isTimeout ? `Network timeout after ${timeoutMs}ms` : (err?.message || 'Fetch failed');
    return { ok: false, data: '', error: msg };
  }
}

/**
 * Tier 1: Polite Sequential Ingestion from CelesTrak with early break on connection failure
 */
async function fetchFromCelestrakPolitely(): Promise<{ success: boolean; rawData: string; error?: string }> {
  let combinedText = '';
  let successfulEndpoints = 0;
  let firstEndpointError: string | undefined;

  for (let i = 0; i < CELESTRAK_LEO_URLS.length; i++) {
    const url = CELESTRAK_LEO_URLS[i];
    const groupMatch = url.match(/GROUP=([^&]+)/);
    const groupName = groupMatch ? groupMatch[1] : `group-${i}`;

    const res = await fetchWithDiagnostics(url, 6000);

    if (res.ok && res.data) {
      combinedText += '\n' + res.data;
      successfulEndpoints++;
    } else {
      if (i === 0) {
        firstEndpointError = res.error || `HTTP ${res.status || 'unknown'}`;
        console.warn(`[TLE Fetcher] Primary CelesTrak group '${groupName}' failed: ${firstEndpointError}. Halting subsequent group queries to avoid IP ban.`);
        // Break early if primary endpoint timed out/was blocked
        break;
      } else {
        console.warn(`[TLE Fetcher] CelesTrak group '${groupName}' skipped: ${res.error || res.status}`);
      }
    }

    // Polite inter-request delay
    if (i < CELESTRAK_LEO_URLS.length - 1) {
      await sleep(600);
    }
  }

  if (successfulEndpoints > 0 && combinedText.length > 200) {
    return { success: true, rawData: combinedText };
  }

  return { success: false, rawData: '', error: firstEndpointError || 'All CelesTrak endpoints unreachable' };
}

/**
 * Tier 2: Secondary Online TLE REST Mirror Fallback
 */
async function fetchFromSecondaryMirror(): Promise<{ success: boolean; rawData: string; error?: string }> {
  try {
    const res = await fetchWithDiagnostics(SECONDARY_TLE_MIRROR_URLS[0], 8000);
    if (res.ok && res.data) {
      try {
        const json = JSON.parse(res.data);
        if (json && Array.isArray(json.member) && json.member.length > 0) {
          const lines: string[] = [];
          for (const item of json.member) {
            if (item.name && item.line1 && item.line2) {
              lines.push(item.name);
              lines.push(item.line1);
              lines.push(item.line2);
            }
          }
          if (lines.length >= 30) {
            return { success: true, rawData: lines.join('\n') };
          }
        }
      } catch {
        // Not JSON, check if plain text TLE
        if (res.data.length > 200) {
          return { success: true, rawData: res.data };
        }
      }
    }
    return { success: false, rawData: '', error: res.error || 'Invalid mirror payload' };
  } catch (err: any) {
    return { success: false, rawData: '', error: err?.message || 'Mirror fetch error' };
  }
}

/**
 * Tier 3: Optional Authenticated Space-Track.org Ingestion (if credentials provided)
 */
async function fetchFromSpaceTrack(): Promise<{ success: boolean; rawData: string; error?: string }> {
  const user = process.env.SPACETRACK_USER;
  const pass = process.env.SPACETRACK_PASSWORD;
  if (!user || !pass) {
    return { success: false, rawData: '', error: 'Space-Track.org credentials not configured in environment' };
  }

  try {
    const authUrl = 'https://www.space-track.org/ajaxauth/login';
    const queryUrl = 'https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/orderby/norad_cat_id/limit/500/format/tle';

    const loginResp = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `identity=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`
    });

    if (!loginResp.ok) {
      return { success: false, rawData: '', error: `Space-Track auth failed (HTTP ${loginResp.status})` };
    }

    const cookie = loginResp.headers.get('set-cookie');
    const dataResp = await fetch(queryUrl, {
      headers: { Cookie: cookie || '' }
    });

    if (dataResp.ok) {
      const text = await dataResp.text();
      if (text && text.length > 200) {
        return { success: true, rawData: text };
      }
    }
    return { success: false, rawData: '', error: `Space-Track data fetch failed (HTTP ${dataResp.status})` };
  } catch (err: any) {
    return { success: false, rawData: '', error: err?.message || 'Space-Track network error' };
  }
}

export interface FetchLiveTleResult {
  records: TleRecord[];
  snapshot: SnapshotMetadata | null;
  source: string;
  isFallback: boolean;
  circuitBreaker?: CircuitBreakerStatus;
  metrics?: {
    totalFetched: number;
    leoRecords: number;
    nonLeoRecords: number;
    invalidChecksums: number;
  };
}

/**
 * Multi-Tier Failover TLE Ingestion Pipeline:
 * Tier 1: CelesTrak (Polite Sequential Fetch)
 * Tier 2: Public TLE REST Mirror
 * Tier 3: Space-Track.org (if credentials present)
 * Tier 4: Active SQLite Snapshot Cache
 * Tier 5: Local Baseline catalog_16063.tle
 */
export async function fetchLiveTleData(): Promise<FetchLiveTleResult> {
  circuitBreaker.totalAttempts++;
  const cbStatus = getCircuitBreakerStatus();

  // ── Tier 1: CelesTrak Fetch (if circuit breaker is not OPEN) ───────
  if (cbStatus.state !== 'OPEN') {
    console.log('[TLE Fetcher] Attempting polite sequential ingestion from CelesTrak...');
    const celestrakRes = await fetchFromCelestrakPolitely();

    if (celestrakRes.success && celestrakRes.rawData) {
      const { records, metrics } = parseTleWithMetrics(celestrakRes.rawData, 'CELESTRAK', true);

      if (records.length >= MINIMUM_LEO_OBJECTS_THRESHOLD) {
        recordSuccess();
        const snapId = `snap_celestrak_${Date.now()}`;
        const nowIso = new Date().toISOString();
        const dataHash = crypto.createHash('sha256').update(celestrakRes.rawData).digest('hex').slice(0, 16);

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
          circuitBreaker: getCircuitBreakerStatus(),
          metrics: {
            totalFetched: metadata.totalFetched,
            leoRecords: records.length,
            nonLeoRecords: metrics.nonLeoRecords,
            invalidChecksums: metrics.invalidChecksums
          }
        };
      } else {
        recordFailure(`CelesTrak returned insufficient LEO objects (${records.length} < ${MINIMUM_LEO_OBJECTS_THRESHOLD})`);
      }
    } else {
      recordFailure(celestrakRes.error || 'CelesTrak unreachable');
    }
  } else {
    console.warn(`[TLE Fetcher] CelesTrak Circuit Breaker is OPEN (${cbStatus.cooldownRemainingSec}s cooldown remaining). Skipping direct CelesTrak query.`);
  }

  // ── Tier 2: Secondary Online Mirror ────────────────────────────────
  console.log('[TLE Fetcher] Checking Tier 2 online secondary TLE mirror...');
  const mirrorRes = await fetchFromSecondaryMirror();
  if (mirrorRes.success && mirrorRes.rawData) {
    const { records, metrics } = parseTleWithMetrics(mirrorRes.rawData, 'LOCAL_SNAPSHOT', true);
    if (records.length >= 20) {
      const snapId = `snap_mirror_${Date.now()}`;
      const nowIso = new Date().toISOString();
      const dataHash = crypto.createHash('sha256').update(mirrorRes.rawData).digest('hex').slice(0, 16);

      const metadata: SnapshotMetadata = {
        id: snapId,
        source: 'LOCAL_SNAPSHOT',
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

      console.log(`[TLE Fetcher] Successfully ingested ${records.length} LEO records from Secondary TLE Mirror.`);
      await saveNewSnapshot(metadata, records);
      await setMetadata('active_source', 'Public TLE Mirror (Online Fallback)');

      return {
        records,
        snapshot: metadata,
        source: 'Public TLE Mirror (Online Fallback)',
        isFallback: true,
        circuitBreaker: getCircuitBreakerStatus(),
        metrics: {
          totalFetched: metadata.totalFetched,
          leoRecords: records.length,
          nonLeoRecords: metrics.nonLeoRecords,
          invalidChecksums: metrics.invalidChecksums
        }
      };
    }
  }

  // ── Tier 3: Space-Track.org (if configured) ───────────────────────
  if (process.env.SPACETRACK_USER && process.env.SPACETRACK_PASSWORD) {
    console.log('[TLE Fetcher] Checking Tier 3 Space-Track.org provider...');
    const stRes = await fetchFromSpaceTrack();
    if (stRes.success && stRes.rawData) {
      const { records, metrics } = parseTleWithMetrics(stRes.rawData, 'CELESTRAK', true);
      if (records.length >= MINIMUM_LEO_OBJECTS_THRESHOLD) {
        const snapId = `snap_spacetrack_${Date.now()}`;
        const nowIso = new Date().toISOString();
        const dataHash = crypto.createHash('sha256').update(stRes.rawData).digest('hex').slice(0, 16);

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

        await saveNewSnapshot(metadata, records);
        await setMetadata('active_source', 'Space-Track.org (Live Ingestion)');

        return {
          records,
          snapshot: metadata,
          source: 'Space-Track.org (Live Ingestion)',
          isFallback: false,
          circuitBreaker: getCircuitBreakerStatus(),
          metrics: {
            totalFetched: metadata.totalFetched,
            leoRecords: records.length,
            nonLeoRecords: metrics.nonLeoRecords,
            invalidChecksums: metrics.invalidChecksums
          }
        };
      }
    }
  }

  // ── Tier 4: Active SQLite Snapshot Cache ───────────────────────────
  const active = await loadActiveSnapshot();
  if (active.records.length > 0 && active.metadata) {
    console.log(`[TLE Fetcher] Using active SQLite snapshot (${active.records.length} objects, snapshot ID: ${active.metadata.id}).`);
    return {
      records: active.records,
      snapshot: active.metadata,
      source: `${active.metadata.source} (Snapshot Cache)`,
      isFallback: true,
      circuitBreaker: getCircuitBreakerStatus()
    };
  }

  // ── Tier 5: Local Baseline Dataset Fallback ────────────────────────
  console.log('[TLE Fetcher] Triggering cold bootstrap from local catalog baseline.');
  const boot = await bootstrapInitialSnapshot();
  return {
    records: boot.records,
    snapshot: boot.snapshot,
    source: 'Local LEO Baseline Snapshot',
    isFallback: true,
    circuitBreaker: getCircuitBreakerStatus()
  };
}
