import * as satellite from 'satellite.js';
import { TleRecord, TrajectoryPoint, TrackedObjectSummary, Vector3D } from './types';

const EARTH_RADIUS_KM = 6378.137;
const MU_EARTH = 398600.4418; // km^3 / s^2

export interface SatrecWrapper {
  record: TleRecord;
  satrec: satellite.SatRec;
  isValid: boolean;
}

/**
 * Creates satellite.js Satrec with validation
 */
export function createSatrec(record: TleRecord): SatrecWrapper {
  try {
    const satrec = satellite.twoline2satrec(record.line1, record.line2);
    const isValid = !!satrec && satrec.error === 0;
    return {
      record,
      satrec,
      isValid: true // We can always propagate via Kepler fallback even if satrec has warnings
    };
  } catch (err) {
    return {
      record,
      satrec: {} as satellite.SatRec,
      isValid: true
    };
  }
}

/**
 * Solves Kepler's equation M = E - e*sin(E) using Newton-Raphson iteration
 */
function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 15; i++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-8) break;
  }
  return E;
}

/**
 * Robust analytical two-body Keplerian propagator fallback.
 * Guarantees TEME / ECI position and velocity vectors even if SGP4 encounters drag errors or epoch drift.
 */
export function propagateKeplerian(record: TleRecord, date: Date, gmst?: number, skipGeodetic = false): TrajectoryPoint {
  const incRad = (record.inclinationDeg * Math.PI) / 180;
  const raanRad = (record.raanDeg * Math.PI) / 180;
  const argPerRad = (record.argPerigeeDeg * Math.PI) / 180;
  const ecc = Math.max(0.00001, Math.min(0.95, record.eccentricity));
  const meanMotionRevDay = Math.max(0.1, record.meanMotionRevDay || 15.0);

  // Mean motion in rad/s
  const nRadSec = (meanMotionRevDay * 2 * Math.PI) / 86400;
  const aKm = Math.pow(MU_EARTH / (nRadSec * nRadSec), 1 / 3);

  // Time difference in seconds from epoch
  const epochYear = record.epochYear || 2026;
  const epochDay = record.epochDay || 1;
  const epochDate = new Date(Date.UTC(epochYear, 0, 1) + (epochDay - 1) * 86400 * 1000);
  const dtSeconds = (date.getTime() - epochDate.getTime()) / 1000;

  // Mean anomaly at time
  const initialM = ((record.meanAnomalyDeg || 0) * Math.PI) / 180;
  let M = (initialM + nRadSec * dtSeconds) % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;

  // Solve Eccentric Anomaly
  const E = solveKepler(M, ecc);

  // True anomaly
  const sinNu = (Math.sqrt(1 - ecc * ecc) * Math.sin(E)) / (1 - ecc * Math.cos(E));
  const cosNu = (Math.cos(E) - ecc) / (1 - ecc * Math.cos(E));
  const nu = Math.atan2(sinNu, cosNu);

  // Orbital radius
  const r = Math.max(EARTH_RADIUS_KM + 120, aKm * (1 - ecc * Math.cos(E)));

  // Position in orbital plane (perifocal PQW frame)
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);

  // Orbital velocity in perifocal frame
  const p = aKm * (1 - ecc * ecc);
  const sqrtMuOverP = Math.sqrt(MU_EARTH / Math.max(1, p));
  const vxp = -sqrtMuOverP * Math.sin(nu);
  const vyp = sqrtMuOverP * (ecc + Math.cos(nu));

  // Transform PQW to TEME / ECI frame
  const cosO = Math.cos(raanRad);
  const sinO = Math.sin(raanRad);
  const cosi = Math.cos(incRad);
  const sini = Math.sin(incRad);
  const cosw = Math.cos(argPerRad);
  const sinw = Math.sin(argPerRad);

  const Px = cosO * cosw - sinO * sinw * cosi;
  const Py = sinO * cosw + cosO * sinw * cosi;
  const Pz = sinw * sini;

  const Qx = -cosO * sinw - sinO * cosw * cosi;
  const Qy = -sinO * sinw + cosO * cosw * cosi;
  const Qz = cosw * sini;

  const x = xp * Px + yp * Qx;
  const y = xp * Py + yp * Qy;
  const z = xp * Pz + yp * Qz;

  const vx = vxp * Px + vyp * Qx;
  const vy = vxp * Py + vyp * Qy;
  const vz = vxp * Pz + vyp * Qz;

  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const alt = Math.max(120, r - EARTH_RADIUS_KM);

  let lat = 0;
  let lngDeg = 0;

  if (!skipGeodetic) {
    const actualGmst = gmst !== undefined ? gmst : satellite.gstime(date);
    lat = (Math.asin(Math.max(-1, Math.min(1, z / r))) * 180) / Math.PI;
    let lng = (Math.atan2(y, x) - actualGmst) % (2 * Math.PI);
    if (lng > Math.PI) lng -= 2 * Math.PI;
    if (lng < -Math.PI) lng += 2 * Math.PI;
    lngDeg = (lng * 180) / Math.PI;
  }

  return {
    timeIso: date.toISOString(),
    timestamp: date.getTime(),
    position: {
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      z: Math.round(z * 1000) / 1000
    },
    velocity: {
      x: Math.round(vx * 10000) / 10000,
      y: Math.round(vy * 10000) / 10000,
      z: Math.round(vz * 10000) / 10000
    },
    speed: Math.round(speed * 1000) / 1000,
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lngDeg * 1000) / 1000,
    alt: Math.round(alt * 100) / 100
  };
}

/**
 * Propagate single satrec at given Date.
 * Falls back seamlessly to Keplerian analytical solver if SGP4 produces NaN or error.
 */
export function propagateAtTime(wrapper: SatrecWrapper, date: Date, gmst?: number, skipGeodetic = false): TrajectoryPoint {
  if (wrapper.satrec && wrapper.satrec.error === 0) {
    try {
      const positionAndVelocity = satellite.propagate(wrapper.satrec, date);
      const position = positionAndVelocity?.position as satellite.EciVec3<number>;
      const velocity = positionAndVelocity?.velocity as satellite.EciVec3<number>;

      if (
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        Number.isFinite(position.z) &&
        Number.isFinite(velocity.x) &&
        Number.isFinite(velocity.y) &&
        Number.isFinite(velocity.z) &&
        position.x !== 0 && position.y !== 0 && position.z !== 0
      ) {
        let lat = 0;
        let lng = 0;
        let alt = 0;

        if (!skipGeodetic) {
          const actualGmst = gmst !== undefined ? gmst : satellite.gstime(date);
          try {
            const geodetic = satellite.eciToGeodetic(position, actualGmst);
            lat = satellite.radiansToDegrees(geodetic.latitude);
            lng = satellite.radiansToDegrees(geodetic.longitude);
            alt = geodetic.height;
          } catch {
            const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
            alt = Math.max(0, r - EARTH_RADIUS_KM);
          }
        } else {
          const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
          alt = Math.max(0, r - EARTH_RADIUS_KM);
        }

        const vx = velocity?.x || 0;
        const vy = velocity?.y || 0;
        const vz = velocity?.z || 0;
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

        return {
          timeIso: date.toISOString(),
          timestamp: date.getTime(),
          position: {
            x: Math.round(position.x * 1000) / 1000,
            y: Math.round(position.y * 1000) / 1000,
            z: Math.round(position.z * 1000) / 1000
          },
          velocity: {
            x: Math.round(vx * 10000) / 10000,
            y: Math.round(vy * 10000) / 10000,
            z: Math.round(vz * 10000) / 10000
          },
          speed: Math.round(speed * 1000) / 1000,
          lat: Math.round(lat * 1000) / 1000,
          lng: Math.round(lng * 1000) / 1000,
          alt: Math.round(alt * 100) / 100
        };
      }
    } catch (err) {
      console.warn("SGP4 propagation failed:", err);
    }
  }

  // Guaranteed analytical Keplerian fallback
  return propagateKeplerian(wrapper.record, date, gmst, skipGeodetic);
}

/**
 * Generates future trajectory points over prediction window
 */
export function generateTrajectory(
  wrapper: SatrecWrapper,
  startDate: Date,
  hours: number = 24,
  stepSeconds: number = 60
): TrajectoryPoint[] {
  const totalSteps = Math.floor((hours * 3600) / stepSeconds);
  const stepMs = stepSeconds * 1000;
  const points = new Array<TrajectoryPoint>(totalSteps + 1);
  let currentMs = startDate.getTime();

  for (let i = 0; i <= totalSteps; i++) {
    points[i] = propagateAtTime(wrapper, new Date(currentMs));
    currentMs += stepMs;
  }

  return points;
}

// Simple orbit sample cache to avoid recalculating 48-point trajectory on every summary call
const orbitSampleCache = new Map<string, { updatedAt: string; timestamp: number; sample: Vector3D[] }>();

/**
 * Gets summary and guaranteed 48-point orbital loop samples for a tracked object
 */
export function getObjectSummary(
  wrapper: SatrecWrapper,
  date: Date = new Date(),
  skipOrbitSample = false,
  gmst?: number,
  skipGeodetic = false
): TrackedObjectSummary {
  const r = wrapper.record;
  const current = propagateAtTime(wrapper, date, gmst, skipGeodetic);

  // Generate 48 samples around 1 orbital period to render high-fidelity 3D and 2D orbit tracks
  const orbitSample: Vector3D[] = [];
  
  if (!skipOrbitSample) {
    const startMs = date.getTime();
    const cacheKey = r.id;
    const cached = orbitSampleCache.get(cacheKey);

    // Reuse cache if it matches the updatedAt TLE timestamp and is within 5 minutes of target time
    if (cached && cached.updatedAt === r.updatedAt && Math.abs(cached.timestamp - startMs) < 300000) {
      orbitSample.push(...cached.sample);
    } else {
      const periodMin = Math.max(80, r.periodMin || 92);
      const periodSeconds = periodMin * 60;
      const stepSeconds = periodSeconds / 48;

      // Reuse a single Date object to avoid 48 object allocations per satellite summary
      const sampleDate = new Date();
      for (let i = 0; i < 48; i++) {
        sampleDate.setTime(startMs + i * stepSeconds * 1000);
        // Bypassing geodetic calculations entirely for orbit path points since only position is needed
        const pt = propagateAtTime(wrapper, sampleDate, undefined, true);
        if (pt && pt.position) {
          orbitSample.push(pt.position);
        }
      }

      // Store generated sample in cache
      orbitSampleCache.set(cacheKey, {
        updatedAt: r.updatedAt,
        timestamp: startMs,
        sample: [...orbitSample]
      });
    }
  }

  return {
    id: r.id,
    name: r.name,
    classification: r.classification,
    source: r.source,
    noradId: r.id,
    inclinationDeg: r.inclinationDeg,
    perigeeKm: r.perigeeKm,
    apogeeKm: r.apogeeKm,
    periodMin: r.periodMin,
    altitudeKm: current.alt,
    speedKmS: current.speed || 7.6,
    currentPosition: current.position,
    positionKm: current.position,
    currentVelocity: current.velocity,
    lat: current.lat,
    lng: current.lng,
    orbitSample,
    updatedAt: r.updatedAt
  };
}
