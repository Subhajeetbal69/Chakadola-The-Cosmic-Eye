import fs from 'fs';
import path from 'path';
import { TleRecord } from './types';
import { parseTleRawText } from './tleParser';
import { saveTleRecords, loadAllTles, setMetadata, getMetadata } from './db';

const CATALOG_16063_PATH = path.join(process.cwd(), 'data', 'catalog_16063.tle');
const SAMPLE_FILE_PATH = path.join(process.cwd(), 'server', 'sample_tles.txt');

// Comprehensive CelesTrak Group Endpoints covering active satellites, debris clouds, constellations & stations
const CELESTRAK_URLS = [
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=communications&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=tle',
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
 * Loads the comprehensive master dataset from local disk (~16,063 objects)
 */
export function loadSampleTleDataset(): TleRecord[] {
  try {
    if (fs.existsSync(CATALOG_16063_PATH)) {
      const content = fs.readFileSync(CATALOG_16063_PATH, 'utf8');
      const records = parseTleRawText(content, 'SAMPLE_DATASET');
      if (records.length > 0) {
        return records;
      }
    }
    if (fs.existsSync(SAMPLE_FILE_PATH)) {
      const content = fs.readFileSync(SAMPLE_FILE_PATH, 'utf8');
      return parseTleRawText(content, 'SAMPLE_DATASET');
    }
  } catch (err) {
    console.error('[TLE Fetcher] Failed loading TLE dataset:', err);
  }
  return [];
}

/**
 * Creates deterministic test conjunction scenario maintaining the full 16,063-object catalog
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
 * Fetches real TLE data from CelesTrak across active groups and debris fields.
 * Updates the existing 16,063 orbital elements with live CelesTrak TLEs.
 * Ensures the system operates seamlessly whether connected to CelesTrak or using the local catalog.
 */
export async function fetchLiveTleData(): Promise<{ records: TleRecord[]; source: string; isFallback: boolean }> {
  // 1. Base persistent catalog
  const baseMasterRecords = loadSampleTleDataset();
  if (baseMasterRecords.length === 0) {
    console.error('[TLE Fetcher] No base master records found in catalog_16063.tle');
    return { records: [], source: 'Error', isFallback: true };
  }

  let fetchedText = '';
  let successfulFetch = false;

  // 2. Fetch concurrently from CelesTrak endpoints with timeout
  const fetchPromises = CELESTRAK_URLS.map(async (url) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
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
      // Endpoint unreachable or timeout
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

  if (successfulFetch && fetchedText.length > 100) {
    const liveParsed = parseTleRawText(fetchedText, 'CELESTRAK');
    console.log(`[TLE Fetcher] Received ${liveParsed.length} live records from CelesTrak.`);

    // Fast lookup map of live CelesTrak records by NORAD ID and normalized name
    const liveByNorad = new Map<number, TleRecord>();
    const liveByName = new Map<string, TleRecord>();

    for (const liveItem of liveParsed) {
      if (liveItem.noradId) {
        liveByNorad.set(liveItem.noradId, liveItem);
      }
      const cleanName = liveItem.name.replace(/[\s\-_]+/g, ' ').trim().toUpperCase();
      liveByName.set(cleanName, liveItem);
    }

    let matchedCount = 0;
    // Update our 16,063 objects in-place with fresh live orbital parameters
    const updatedRecords: TleRecord[] = baseMasterRecords.map((baseRec) => {
      let liveMatch: TleRecord | undefined;

      if (baseRec.noradId && liveByNorad.has(baseRec.noradId)) {
        liveMatch = liveByNorad.get(baseRec.noradId);
      } else {
        const cleanBaseName = baseRec.name.replace(/[\s\-_]+/g, ' ').trim().toUpperCase();
        if (liveByName.has(cleanBaseName)) {
          liveMatch = liveByName.get(cleanBaseName);
        }
      }

      if (liveMatch) {
        matchedCount++;
        return {
          ...baseRec,
          line1: liveMatch.line1,
          line2: liveMatch.line2,
          epochYear: liveMatch.epochYear,
          epochDay: liveMatch.epochDay,
          inclinationDeg: liveMatch.inclinationDeg,
          raanDeg: liveMatch.raanDeg,
          eccentricity: liveMatch.eccentricity,
          argPerigeeDeg: liveMatch.argPerigeeDeg,
          meanAnomalyDeg: liveMatch.meanAnomalyDeg,
          meanMotionRevDay: liveMatch.meanMotionRevDay,
          periodMin: liveMatch.periodMin,
          perigeeKm: liveMatch.perigeeKm,
          apogeeKm: liveMatch.apogeeKm,
          source: 'CELESTRAK' as const,
          updatedAt: new Date().toISOString()
        };
      }

      return baseRec;
    });

    console.log(`[TLE Fetcher] Synchronized ${matchedCount}/${updatedRecords.length} objects with live CelesTrak elements.`);

    await saveTleRecords(updatedRecords);
    await setMetadata('active_source', 'CelesTrak (Live Satellite & Debris Catalog)');

    return {
      records: updatedRecords,
      source: 'CelesTrak (Live Satellite & Debris Catalog)',
      isFallback: false
    };
  }

  // Fallback: Use stored records if available or base master records
  const cached = await loadAllTles();
  if (cached.length >= 1000) {
    console.log(`[TLE Fetcher] CelesTrak offline/unreachable: maintaining ${cached.length} stored catalog records.`);
    return { records: cached, source: 'Catalog Telemetry (Live Astrodynamics Propagation)', isFallback: true };
  }

  await saveTleRecords(baseMasterRecords);
  await setMetadata('active_source', 'Catalog Telemetry (Live Astrodynamics Propagation)');
  return { records: baseMasterRecords, source: 'Catalog Telemetry (Live Astrodynamics Propagation)', isFallback: true };
}



