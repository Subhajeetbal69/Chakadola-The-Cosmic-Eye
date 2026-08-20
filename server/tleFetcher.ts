import fs from 'fs';
import path from 'path';
import { TleRecord } from './types';
import { parseTleRawText } from './tleParser';
import { saveTleRecords, loadAllTles, setMetadata, getMetadata } from './db';

const SAMPLE_FILE_PATH = path.join(process.cwd(), 'server', 'sample_tles.txt');

// Exact NORAD IDs of the curated fleet (33 target objects across satellites, debris, and rocket bodies)
const CURATED_NORAD_IDS = [
  25544, // ISS (ZARYA)
  48274, // CSS (TIANHE)
  20580, // HST (HUBBLE)
  44713, // STARLINK-1007
  25994, // TERRA
  27424, // AQUA
  33591, // NOAA 19
  39634, // SENTINEL-1A
  39084, // LANDSAT 8
  42955, // IRIDIUM 100
  34124, // COSMOS 2251 DEBRIS [CRITICAL TEST]
  31112, // FENGYUN 1C DEBRIS-A
  31456, // FENGYUN 1C DEBRIS-B
  34212, // IRIDIUM 33 DEBRIS-A
  34458, // IRIDIUM 33 DEBRIS-B
  25941, // CZ-4B R/B (DEBRIS)
  22803, // SL-16 R/B (ROCKET BODY)
  48860, // FALCON 9 R/B
  8821,  // DELTA 1 R/B
  49451, // COSMOS 1408 DEBRIS-A
  49452, // COSMOS 1408 DEBRIS-B
  27386, // ENVISAT
  24792, // PEGASUS DEBRIS
  37835, // ARIANE 5 R/B
  11112, // TIROS N DEBRIS
  52145, // STARLINK-30124
  4412,  // SL-08 R/B
  25162, // GLOBALSTAR M001
  39765, // COSMOS 2499 (SUSPECT DEBRIS)
  33493, // H-2A R/B
  25942, // CBERS 1 DEBRIS
  2847,  // OPS 5744 (ORBITAL DEBRIS)
  32382  // RADARSAT-2
];

// Target CelesTrak Query URLs - Primary is direct CATNR batch for our exact curated objects
const CELESTRAK_URLS = [
  `https://celestrak.org/NORAD/elements/gp.php?CATNR=${CURATED_NORAD_IDS.join(',')}&FORMAT=tle`,
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle',
  'https://celestrak.org/NORAD/elements/gp.php?NAME=R/B&FORMAT=tle'
];

/**
 * Loads the base curated master dataset from local disk (guaranteed exact 33 objects)
 */
export function loadSampleTleDataset(): TleRecord[] {
  try {
    if (fs.existsSync(SAMPLE_FILE_PATH)) {
      const content = fs.readFileSync(SAMPLE_FILE_PATH, 'utf8');
      const records = parseTleRawText(content, 'SAMPLE_DATASET');
      return records;
    }
  } catch (err) {
    console.error('[TLE Fetcher] Failed loading sample_tles.txt:', err);
  }
  return [];
}

/**
 * Creates deterministic test conjunction scenario maintaining the exact same curated 33 objects
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
 * Fetches real TLE data from CelesTrak for the EXACT curated set of 33 objects.
 * Updates the existing objects' orbital elements in-place with fresh CelesTrak TLEs.
 * Ensures the object count, identities, and tracked objects ALWAYS stay consistent.
 */
export async function fetchLiveTleData(_limitCount?: number): Promise<{ records: TleRecord[]; source: string; isFallback: boolean }> {
  // 1. Base persistent curated catalogue (guaranteed identical objects)
  const baseMasterRecords = loadSampleTleDataset();
  if (baseMasterRecords.length === 0) {
    console.error('[TLE Fetcher] No base master records found in sample_tles.txt');
    return { records: [], source: 'Error', isFallback: true };
  }

  let fetchedText = '';
  let successfulFetch = false;

  // 2. Fetch concurrently from CelesTrak endpoints with timeout
  const fetchPromises = CELESTRAK_URLS.map(async (url) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SpaceDebrisTracker/1.4 (Continuous Astrodynamics Feed)'
        }
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 50) {
          return text;
        }
      }
    } catch (err) {
      // Endpoint timeout or unreachable; will fallback gracefully
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
    let matchedCount = 0;

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

    // Update our exact 33 curated objects in-place with fresh live orbital parameters
    const updatedRecords: TleRecord[] = baseMasterRecords.map((baseRec) => {
      let liveMatch: TleRecord | undefined;

      if (baseRec.noradId && liveByNorad.has(baseRec.noradId)) {
        liveMatch = liveByNorad.get(baseRec.noradId);
      } else {
        const cleanBaseName = baseRec.name.replace(/[\s\-_]+/g, ' ').trim().toUpperCase();
        for (const [nameKey, liveRec] of liveByName.entries()) {
          if (cleanBaseName.includes(nameKey) || nameKey.includes(cleanBaseName)) {
            liveMatch = liveRec;
            break;
          }
        }
      }

      if (liveMatch) {
        matchedCount++;
        return {
          ...baseRec, // Preserves canonical ID, name, and classification
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

      // If specific debris item was not in CelesTrak query response, keep base calibrated elements
      return {
        ...baseRec,
        updatedAt: new Date().toISOString()
      };
    });

    console.log(`[TLE Fetcher] Synchronized ${matchedCount}/${updatedRecords.length} curated objects with live CelesTrak elements.`);

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
  if (cached.length === baseMasterRecords.length) {
    console.log(`[TLE Fetcher] Network offline/unreachable: maintaining ${cached.length} stored curated fleet records.`);
    return { records: cached, source: 'Cached Fleet Telemetry', isFallback: true };
  }

  await saveTleRecords(baseMasterRecords);
  await setMetadata('active_source', 'SAMPLE_DATASET');
  return { records: baseMasterRecords, source: 'Curated Reference Fleet (Offline)', isFallback: true };
}


