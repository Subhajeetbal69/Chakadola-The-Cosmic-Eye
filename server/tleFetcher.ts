import fs from 'fs';
import path from 'path';
import { TleRecord } from './types';
import { parseTleRawText } from './tleParser';
import { saveTleRecords, loadAllTles, setMetadata, getMetadata } from './db';

const SAMPLE_FILE_PATH = path.join(process.cwd(), 'server', 'sample_tles.txt');

// Public CelesTrak Group URLs (Including Real Debris Catalogues, Rocket Bodies, and Active Satellites)
const CELESTRAK_URLS = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=1982-092&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
];

/**
 * Loads the fallback sample dataset from local disk
 */
export function loadSampleTleDataset(): TleRecord[] {
  try {
    if (fs.existsSync(SAMPLE_FILE_PATH)) {
      const content = fs.readFileSync(SAMPLE_FILE_PATH, 'utf8');
      const records = parseTleRawText(content, 'SAMPLE_DATASET');
      console.log(`[TLE Fetcher] Loaded ${records.length} records from sample_tles.txt`);
      return records;
    }
  } catch (err) {
    console.error('[TLE Fetcher] Failed loading sample_tles.txt:', err);
  }
  return [];
}

/**
 * Creates deterministic test conjunction scenario
 */
export function createDeterministicDemoScenario(): TleRecord[] {
  const baseRecords = loadSampleTleDataset();
  const demoRecords = baseRecords.map((r) => ({
    ...r,
    source: 'DEMO_CONJUNCTION' as const,
    updatedAt: new Date().toISOString()
  }));
  return demoRecords;
}

/**
 * Fetches real TLE data from CelesTrak with guaranteed debris preservation and balanced distribution.
 */
export async function fetchLiveTleData(limitCount: number = 35): Promise<{ records: TleRecord[]; source: string; isFallback: boolean }> {
  let fetchedText = '';
  let successfulFetch = false;

  // Fetch concurrently from CelesTrak with 4s timeout per endpoint
  const fetchPromises = CELESTRAK_URLS.map(async (url) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SpaceDebrisTracker/1.2 (Educational Astrodynamics Demo)'
        }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 100) {
          return text;
        }
      }
    } catch (err) {
      console.warn(`[TLE Fetcher] Network fetch error for ${url}:`, err);
    }
    return '';
  });

  const results = await Promise.allSettled(fetchPromises);
  results.forEach((res) => {
    if (res.status === 'fulfilled' && res.value) {
      fetchedText += '\n' + res.value;
      successfulFetch = true;
    }
  });

  if (successfulFetch && fetchedText.length > 200) {
    const parsed = parseTleRawText(fetchedText, 'CELESTRAK');
    if (parsed.length >= 5) {
      const active = parsed.filter((p) => p.classification === 'ACTIVE_SATELLITE');
      const debris = parsed.filter((p) => p.classification === 'DEBRIS');
      const rb = parsed.filter((p) => p.classification === 'ROCKET_BODY');

      // Guarantee essential sample debris & rocket bodies if CelesTrak active group is dominated by active payloads
      const sample = loadSampleTleDataset();
      const sampleDebris = sample.filter((s) => s.classification === 'DEBRIS');
      const sampleRb = sample.filter((s) => s.classification === 'ROCKET_BODY');

      const targetDebrisCount = Math.max(8, Math.floor(limitCount * 0.35));
      const targetRbCount = Math.max(4, Math.floor(limitCount * 0.20));
      const targetActiveCount = Math.max(10, limitCount - targetDebrisCount - targetRbCount);

      const selectedDebris = [
        ...debris.slice(0, targetDebrisCount),
        ...sampleDebris
      ].slice(0, targetDebrisCount);

      const selectedRb = [
        ...rb.slice(0, targetRbCount),
        ...sampleRb
      ].slice(0, targetRbCount);

      const selectedActive = active.slice(0, targetActiveCount);

      const combined = [...selectedDebris, ...selectedRb, ...selectedActive];

      const deduplicatedMap = new Map<string, TleRecord>();
      for (const item of combined) {
        if (!deduplicatedMap.has(item.id)) {
          deduplicatedMap.set(item.id, item);
        }
      }

      const finalRecords = Array.from(deduplicatedMap.values()).slice(0, limitCount);
      await saveTleRecords(finalRecords);
      await setMetadata('active_source', 'CelesTrak (Live Satellite & Debris Catalog)');
      return { records: finalRecords, source: 'CelesTrak (Live Satellite & Debris Catalog)', isFallback: false };
    }
  }

  // Fallback 1: Previously stored SQLite records
  const cached = await loadAllTles();
  if (cached.length >= 10) {
    console.log(`[TLE Fetcher] Using ${cached.length} cached SQLite TLE records.`);
    await setMetadata('active_source', 'CACHED_SQLITE');
    return { records: cached.slice(0, limitCount), source: 'Cached SQLite Database', isFallback: true };
  }

  // Fallback 2: Local sample dataset
  const sampleRecords = loadSampleTleDataset().slice(0, limitCount);
  await saveTleRecords(sampleRecords);
  await setMetadata('active_source', 'SAMPLE_DATASET');
  return { records: sampleRecords, source: 'Embedded Sample Dataset (Offline)', isFallback: true };
}
