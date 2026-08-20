import { TleRecord, ObjectClassification } from './types';

const EARTH_RADIUS_KM = 6378.137;
const MU_EARTH = 398600.4418; // km^3 / s^2

/**
 * Validates standard TLE line checksum (modulo 10 sum of digits with '-' counted as 1)
 */
export function validateChecksum(line: string): boolean {
  if (!line || line.length < 69) return false;
  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const char = line[i];
    if (char >= '0' && char <= '9') {
      sum += parseInt(char, 10);
    } else if (char === '-') {
      sum += 1;
    }
  }
  const expected = parseInt(line[68], 10);
  return (sum % 10) === expected;
}

/**
 * Infers object classification from name and line characteristics
 */
export function classifyObject(name: string, line1: string): ObjectClassification {
  const upper = name.toUpperCase();
  if (
    upper.includes('DEB') ||
    upper.includes('DEBRIS') ||
    upper.includes('FRAGMENT') ||
    upper.includes('COSMOS 2251') ||
    upper.includes('FENGYUN') ||
    upper.includes('IRIDIUM 33 DEB') ||
    upper.includes('PEGASUS DEB') ||
    upper.includes('OPS 5744')
  ) {
    return 'DEBRIS';
  }
  if (
    upper.includes('R/B') ||
    upper.includes('ROCKET BODY') ||
    upper.includes('BOOSTER') ||
    upper.includes('STAGE') ||
    upper.includes('SL-') ||
    upper.includes('CZ-') ||
    upper.includes('DELTA') ||
    upper.includes('FALCON 9 R/B') ||
    upper.includes('ARIANE') ||
    upper.includes('CENTAUR') ||
    upper.includes('H-2A')
  ) {
    return 'ROCKET_BODY';
  }
  if (upper.includes('ISS') || upper.includes('ZARYA') || upper.includes('TIANHE') || upper.includes('HUBBLE') || upper.includes('HST')) {
    return 'ACTIVE_SATELLITE';
  }
  return 'ACTIVE_SATELLITE';
}

/**
 * Parses raw 2-line or 3-line TLE text blocks into structured TleRecords
 */
export function parseTleRawText(rawText: string, source: 'CELESTRAK' | 'SAMPLE_DATASET' | 'DEMO_CONJUNCTION' = 'SAMPLE_DATASET'): TleRecord[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const records: TleRecord[] = [];
  let i = 0;

  while (i < lines.length) {
    let name = 'UNKNOWN OBJECT';
    let line1 = '';
    let line2 = '';

    if (lines[i].startsWith('1 ') && lines[i + 1] && lines[i + 1].startsWith('2 ')) {
      // 2-line format without title line
      line1 = lines[i];
      line2 = lines[i + 1];
      const satNum = line1.substring(2, 7).trim();
      name = `SAT-${satNum}`;
      i += 2;
    } else if (
      lines[i + 1] &&
      lines[i + 1].startsWith('1 ') &&
      lines[i + 2] &&
      lines[i + 2].startsWith('2 ')
    ) {
      // 3-line format (Title, Line1, Line2)
      name = lines[i].replace(/^0\s+/, '').trim();
      line1 = lines[i + 1];
      line2 = lines[i + 2];
      i += 3;
    } else {
      // Skip unrecognized line
      i++;
      continue;
    }

    try {
      const noradId = line1.substring(2, 7).trim();
      const epochYearStr = line1.substring(18, 20).trim();
      const epochDayStr = line1.substring(20, 32).trim();
      const yr = parseInt(epochYearStr, 10);
      const epochYear = yr < 57 ? 2000 + yr : 1900 + yr;
      const epochDay = parseFloat(epochDayStr);

      const incDeg = parseFloat(line2.substring(8, 16).trim());
      const raanDeg = parseFloat(line2.substring(17, 25).trim());
      const eccStr = '0.' + line2.substring(26, 33).trim();
      const ecc = parseFloat(eccStr);
      const argPerDeg = parseFloat(line2.substring(34, 42).trim());
      const meanAnomDeg = parseFloat(line2.substring(43, 51).trim());
      const meanMotion = parseFloat(line2.substring(52, 63).trim());

      // Astrodynamics derivations
      const periodMin = meanMotion > 0 ? 1440 / meanMotion : 0;
      const nRadSec = (meanMotion * 2 * Math.PI) / 86400;
      const semiMajorAxisKm = Math.pow(MU_EARTH / (nRadSec * nRadSec), 1 / 3);
      const perigeeKm = Math.max(0, semiMajorAxisKm * (1 - ecc) - EARTH_RADIUS_KM);
      const apogeeKm = Math.max(0, semiMajorAxisKm * (1 + ecc) - EARTH_RADIUS_KM);

      const classification = classifyObject(name, line1);

      records.push({
        id: noradId || `OBJ-${records.length + 1}`,
        name: name,
        line1,
        line2,
        classification,
        source,
        epochYear,
        epochDay,
        inclinationDeg: Number(incDeg.toFixed(3)),
        raanDeg: Number(raanDeg.toFixed(3)),
        eccentricity: Number(ecc.toFixed(6)),
        argPerigeeDeg: Number(argPerDeg.toFixed(3)),
        meanAnomalyDeg: Number(meanAnomDeg.toFixed(3)),
        meanMotionRevDay: Number(meanMotion.toFixed(4)),
        periodMin: Number(periodMin.toFixed(2)),
        perigeeKm: Number(perigeeKm.toFixed(1)),
        apogeeKm: Number(apogeeKm.toFixed(1)),
        status: 'TRACKED',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`[TLE Parser] Skipping corrupted TLE record (${name}):`, err);
    }
  }

  // Deduplicate by NORAD ID
  const seen = new Set<string>();
  const uniqueRecords: TleRecord[] = [];
  for (const r of records) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      uniqueRecords.push(r);
    }
  }

  return uniqueRecords;
}
