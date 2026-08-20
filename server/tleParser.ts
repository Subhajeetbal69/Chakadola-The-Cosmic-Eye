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
export function classifyObject(name: string, line1: string = ''): ObjectClassification {
  const upper = name.toUpperCase();
  
  // 1. Debris identification
  if (
    upper.includes('DEB') ||
    upper.includes('DEBRIS') ||
    upper.includes('FRAG') ||
    upper.includes('FRAGMENT') ||
    upper.includes('COLLISION') ||
    upper.includes('EXPLOSION') ||
    upper.includes('COOLANT') ||
    upper.includes('DISCHARGED') ||
    upper.includes('COSMOS 2251') ||
    upper.includes('COSMOS 1408') ||
    upper.includes('COSMOS 2499') ||
    upper.includes('FENGYUN 1C') ||
    upper.includes('IRIDIUM 33 DEB') ||
    upper.includes('PEGASUS DEB') ||
    upper.includes('OPS 5744') ||
    upper.includes('CBERS 1') ||
    upper.includes('TIROS N')
  ) {
    return 'DEBRIS';
  }

  // 2. Rocket Body identification
  if (
    upper.includes('R/B') ||
    upper.includes('ROCKET BODY') ||
    upper.includes('BOOSTER') ||
    upper.includes('STAGE') ||
    upper.includes('SL-') ||
    upper.includes('CZ-') ||
    upper.includes('DELTA 1') ||
    upper.includes('DELTA 2') ||
    upper.includes('DELTA 4') ||
    upper.includes('FALCON 9 R/B') ||
    upper.includes('FALCON 9 STAGE') ||
    upper.includes('ARIANE') ||
    upper.includes('CENTAUR') ||
    upper.includes('H-2A') ||
    upper.includes('H-2B') ||
    upper.includes('TITAN') ||
    upper.includes('BREEZE') ||
    upper.includes('FREGAT') ||
    upper.includes('UPPER STAGE') ||
    upper.includes('AKM') ||
    upper.includes('MOTOR')
  ) {
    return 'ROCKET_BODY';
  }

  // 3. Active Satellite / Payload default
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
      const epochDay = parseFloat(epochDayStr) || 1;

      const incDeg = parseFloat(line2.substring(8, 16).trim()) || 0;
      const raanDeg = parseFloat(line2.substring(17, 25).trim()) || 0;
      const eccRaw = line2.substring(26, 33).trim().replace(/\s+/g, '0');
      const eccStr = '0.' + eccRaw.padStart(7, '0');
      const ecc = isNaN(parseFloat(eccStr)) ? 0.001 : parseFloat(eccStr);
      const argPerDeg = parseFloat(line2.substring(34, 42).trim()) || 0;
      const meanAnomDeg = parseFloat(line2.substring(43, 51).trim()) || 0;
      const meanMotion = parseFloat(line2.substring(52, 63).trim()) || 15.0;

      // Astrodynamics derivations
      const periodMin = meanMotion > 0 ? 1440 / meanMotion : 92.0;
      const nRadSec = (meanMotion * 2 * Math.PI) / 86400;
      const semiMajorAxisKm = nRadSec > 0 ? Math.pow(MU_EARTH / (nRadSec * nRadSec), 1 / 3) : 6800;
      const perigeeKm = Math.max(0, semiMajorAxisKm * (1 - ecc) - EARTH_RADIUS_KM);
      const apogeeKm = Math.max(0, semiMajorAxisKm * (1 + ecc) - EARTH_RADIUS_KM);

      const classification = classifyObject(name, line1);

      const noradIdNum = parseInt(noradId, 10);

      records.push({
        id: noradId || `OBJ-${records.length + 1}`,
        noradId: !isNaN(noradIdNum) ? noradIdNum : undefined,
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
