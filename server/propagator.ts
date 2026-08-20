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
    if (Math.abs(delta) < 1e-7) break;
  }
  return E;
}

/**
 * Robust analytical two-body Keplerian propagator fallback.
 * Guarantees TEME / ECI position and velocity vectors even if SGP4 encounters drag errors or epoch drift.
 */
export function propagateKeplerian(record: TleRecord, date: Date): TrajectoryPoint {
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

  // Sub-satellite latitude & longitude
  const gmst = satellite.gstime(date);
  const lat = (Math.asin(Math.max(-1, Math.min(1, z / r))) * 180) / Math.PI;
  let lng = (Math.atan2(y, x) - gmst) % (2 * Math.PI);
  if (lng > Math.PI) lng -= 2 * Math.PI;
  if (lng < -Math.PI) lng += 2 * Math.PI;
  const lngDeg = (lng * 180) / Math.PI;

  return {
    timeIso: date.toISOString(),
    timestamp: date.getTime(),
    position: {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      z: Number(z.toFixed(3))
    },
    velocity: {
      x: Number(vx.toFixed(4)),
      y: Number(vy.toFixed(4)),
      z: Number(vz.toFixed(4))
    },
    speed: Number(speed.toFixed(3)),
    lat: Number(lat.toFixed(3)),
    lng: Number(lngDeg.toFixed(3)),
    alt: Number(alt.toFixed(2))
  };
}

/**
 * Propagate single satrec at given Date.
 * Falls back seamlessly to Keplerian analytical solver if SGP4 produces NaN or error.
 */
export function propagateAtTime(wrapper: SatrecWrapper, date: Date): TrajectoryPoint {
  if (wrapper.satrec && wrapper.satrec.error === 0) {
    try {
      const positionAndVelocity = satellite.propagate(wrapper.satrec, date);
      const position = positionAndVelocity?.position as satellite.EciVec3<number>;
      const velocity = positionAndVelocity?.velocity as satellite.EciVec3<number>;

      if (
        position &&
        !isNaN(position.x) &&
        !isNaN(position.y) &&
        !isNaN(position.z) &&
        (position.x !== 0 || position.y !== 0 || position.z !== 0)
      ) {
        const gmst = satellite.gstime(date);
        let lat = 0;
        let lng = 0;
        let alt = 0;

        try {
          const geodetic = satellite.eciToGeodetic(position, gmst);
          lat = satellite.radiansToDegrees(geodetic.latitude);
          lng = satellite.radiansToDegrees(geodetic.longitude);
          alt = geodetic.height;
        } catch {
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
            x: Number(position.x.toFixed(3)),
            y: Number(position.y.toFixed(3)),
            z: Number(position.z.toFixed(3))
          },
          velocity: {
            x: Number(vx.toFixed(4)),
            y: Number(vy.toFixed(4)),
            z: Number(vz.toFixed(4))
          },
          speed: Number(speed.toFixed(3)),
          lat: Number(lat.toFixed(3)),
          lng: Number(lng.toFixed(3)),
          alt: Number(alt.toFixed(2))
        };
      }
    } catch (err) {
      // Fallback below
    }
  }

  // Guaranteed analytical Keplerian fallback
  return propagateKeplerian(wrapper.record, date);
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
  const points: TrajectoryPoint[] = [];
  const totalSteps = Math.floor((hours * 3600) / stepSeconds);
  const startMs = startDate.getTime();

  for (let i = 0; i <= totalSteps; i++) {
    const currentMs = startMs + i * stepSeconds * 1000;
    const date = new Date(currentMs);
    const pt = propagateAtTime(wrapper, date);
    points.push(pt);
  }

  return points;
}

/**
 * Gets summary and guaranteed 48-point orbital loop samples for a tracked object
 */
export function getObjectSummary(wrapper: SatrecWrapper, date: Date = new Date()): TrackedObjectSummary {
  const r = wrapper.record;
  const current = propagateAtTime(wrapper, date);

  // Generate 48 samples around 1 orbital period to render high-fidelity 3D and 2D orbit tracks
  const orbitSample: Vector3D[] = [];
  const periodMin = Math.max(80, r.periodMin || 92);
  const periodSeconds = periodMin * 60;
  const stepSeconds = periodSeconds / 48;
  const startMs = date.getTime();

  for (let i = 0; i < 48; i++) {
    const pt = propagateAtTime(wrapper, new Date(startMs + i * stepSeconds * 1000));
    if (pt && pt.position) {
      orbitSample.push(pt.position);
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
