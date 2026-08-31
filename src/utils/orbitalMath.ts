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

export interface OrbitBasis {
  u: THREE.Vector3; // Unit radial vector to initial position (t=0)
  v: THREE.Vector3; // Unit tangent vector in direction of orbital motion
  w: THREE.Vector3; // Unit normal vector to orbital plane (angular momentum direction)
  radius: number;   // Orbital radius in 3D Scene units
}

/**
 * Computes exact orthonormal 3D orbital plane basis vectors (u, v, w) directly from
 * real ECI position and velocity (or inclination) in Three.js coordinates.
 * This guarantees the satellite's motion and its orbit path line are 100% mathematically identical.
 */
export function computeOrbitBasis(
  posKm?: { x: number; y: number; z: number } | null,
  velKmS?: { x: number; y: number; z: number } | null,
  incDeg: number = 51.6,
  altitudeKm: number = 400
): OrbitBasis {
  // If no position provided, generate a sensible default on the equator
  if (!posKm || (posKm.x === 0 && posKm.y === 0 && posKm.z === 0)) {
    const defaultR = EARTH_RADIUS + Math.max(120, altitudeKm) * SCALE_FACTOR;
    const incRad = (incDeg * Math.PI) / 180;
    const u = new THREE.Vector3(1, 0, 0);
    const w = new THREE.Vector3(0, Math.cos(incRad), Math.sin(incRad)).normalize();
    const v = new THREE.Vector3().crossVectors(w, u).normalize();
    return { u, v, w, radius: defaultR };
  }

  const p0 = eciToScenePosition(posKm.x, posKm.y, posKm.z);
  const radius = p0.length();

  if (radius < 0.1) {
    const defaultR = EARTH_RADIUS + Math.max(120, altitudeKm) * SCALE_FACTOR;
    const u = new THREE.Vector3(1, 0, 0);
    const v = new THREE.Vector3(0, 1, 0);
    const w = new THREE.Vector3(0, 0, 1);
    return { u, v, w, radius: defaultR };
  }

  const u = p0.clone().normalize();
  let w = new THREE.Vector3();

  // Try calculating plane normal from angular momentum vector h = r x v
  if (velKmS && (Math.abs(velKmS.x) > 0.0001 || Math.abs(velKmS.y) > 0.0001 || Math.abs(velKmS.z) > 0.0001)) {
    const v0 = eciToScenePosition(velKmS.x, velKmS.y, velKmS.z);
    w.crossVectors(p0, v0);
    if (w.lengthSq() > 1e-8) {
      w.normalize();
    }
  }

  // If velocity is unavailable or degenerate, construct plane normal from inclination
  if (w.lengthSq() < 0.5) {
    const incRad = (incDeg * Math.PI) / 180;
    const cosI = Math.cos(incRad);
    const sinI = Math.sin(incRad);

    const uy = u.y;
    const ux = u.x;
    const uz = u.z;
    const horizontalR = Math.sqrt(ux * ux + uz * uz);

    if (horizontalR > 1e-4) {
      const factor = (-uy * cosI) / (horizontalR * horizontalR);
      const wx = factor * ux - (sinI * uz) / horizontalR;
      const wz = factor * uz + (sinI * ux) / horizontalR;
      w.set(wx, cosI, wz).normalize();
    } else {
      w.set(sinI, cosI, 0).normalize();
    }
  }

  const v = new THREE.Vector3().crossVectors(w, u).normalize();

  return { u, v, w, radius };
}

/**
 * Generates a closed, continuous 360-degree orbital loop path from basis vectors.
 */
export function generateOrbitCircleFromBasis(basis: OrbitBasis, segments = 128): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const { u, v, radius } = basis;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    points.push(
      new THREE.Vector3(
        radius * (cosA * u.x + sinA * v.x),
        radius * (cosA * u.y + sinA * v.y),
        radius * (cosA * u.z + sinA * v.z)
      )
    );
  }
  return points;
}

/**
 * Calculates a 3D position from Keplerian orbital elements (legacy fallback).
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

