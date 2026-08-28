import * as THREE from 'three';

// Constants
export const EARTH_RADIUS = 10; // Earth mesh radius in our 3D scene (scaled down for visualization)
export const REAL_EARTH_RADIUS_KM = 6371;
export const SCALE_FACTOR = EARTH_RADIUS / REAL_EARTH_RADIUS_KM; // 0.00156961

/**
 * Converts real Earth-Centered Inertial (ECI) coordinates in km to Three.js 3D scene coordinates.
 * Three.js uses Y-up, so:
 * Scene X = ECI X * SCALE_FACTOR
 * Scene Y = ECI Z * SCALE_FACTOR
 * Scene Z = -ECI Y * SCALE_FACTOR
 */
export function eciToScenePosition(xKm: number, yKm: number, zKm: number): THREE.Vector3 {
  return new THREE.Vector3(
    xKm * SCALE_FACTOR,
    zKm * SCALE_FACTOR,
    -yKm * SCALE_FACTOR
  );
}

/**
 * Converts an array of ECI trajectory points (in km) to Three.js Vector3 points.
 */
export function generateTrajectoryFromEci(points: Array<{ x: number; y: number; z: number }>): THREE.Vector3[] {
  if (!points || points.length === 0) return [];
  return points.map((p) => eciToScenePosition(p.x, p.y, p.z));
}

/**
 * Calculates a 3D position from Keplerian orbital elements (fallback when ECI is not precomputed).
 * @param sma Semi-major axis (in 3D scene units)
 * @param ecc Eccentricity (0 = circular, <1 = elliptical)
 * @param inc Inclination (in radians)
 * @param raan Right Ascension of the Ascending Node (in radians)
 * @param aop Argument of Periapsis (in radians)
 * @param ta True Anomaly (in radians, defines current position along orbit)
 */
export function getOrbitalPosition(sma: number, ecc: number, inc: number, raan: number, aop: number, ta: number): THREE.Vector3 {
  const r = (sma * (1 - ecc * ecc)) / (1 + ecc * Math.cos(ta));

  const p = r * Math.cos(ta);
  const q = r * Math.sin(ta);

  const x1 = p * Math.cos(aop) - q * Math.sin(aop);
  const y1 = p * Math.sin(aop) + q * Math.cos(aop);

  const x2 = x1;
  const y2 = y1 * Math.cos(inc);
  const z2 = y1 * Math.sin(inc);

  const x3 = x2 * Math.cos(raan) - y2 * Math.sin(raan);
  const y3 = x2 * Math.sin(raan) + y2 * Math.cos(raan);

  return new THREE.Vector3(x3, z2, -y3);
}

/**
 * Generates an array of points representing a Keplerian orbital path.
 */
export function generateOrbitPath(sma: number, ecc: number, inc: number, raan: number, aop: number, segments = 128): THREE.Vector3[] {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const ta = (i / segments) * Math.PI * 2;
    points.push(getOrbitalPosition(sma, ecc, inc, raan, aop, ta));
  }
  return points;
}

/**
 * Approximate velocity in km/s based on altitude in km (circular orbit assumption)
 */
export function calculateOrbitalVelocity(altitudeKm: number): number {
  const G = 6.6743e-11;
  const M = 5.972e24; // Earth mass (kg)
  const r = (REAL_EARTH_RADIUS_KM + Math.max(0, altitudeKm)) * 1000;
  const v = Math.sqrt((G * M) / r);
  return v / 1000; // Return in km/s
}
