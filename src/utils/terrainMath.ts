import { CRATER_POSITIONS } from '../components/moon/RoverPath';

// Simple hash-based pseudo-random
function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) / 2147483648;
}

// Simplex-like noise approximation
function noise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;

  return nx0 + (nx1 - nx0) * sy;
}

// Fractal Brownian Motion
export function fbm(x: number, y: number, octaves: number = 5): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    maxValue += amplitude;
    amplitude *= 0.45;
    frequency *= 2.1;
  }

  return value / maxValue;
}

export interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

// Crater carving function
export function craterHeight(x: number, z: number, craters: Crater[]): number {
  let h = 0;
  for (const crater of craters) {
    const dx = x - crater.x;
    const dz = z - crater.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const r = crater.radius;

    if (dist < r * 1.5) {
      const t = dist / r;
      if (t < 0.8) {
        h -= crater.depth * (1 - (t / 0.8) * (t / 0.8));
      } else if (t < 1.2) {
        const rimT = (t - 0.8) / 0.4;
        h += crater.depth * 0.4 * Math.sin(rimT * Math.PI); // increased rim height slightly
      }
    }
  }
  return h;
}

// Global terrain height function
export function getTerrainHeight(x: number, z: number, allCraters: Crater[] = CRATER_POSITIONS): number {
  // Base terrain noise
  let y = fbm(x * 0.02 + 50, z * 0.02 + 50, 5) * 2.5;
  // Add larger rolling hills
  y += fbm(x * 0.005, z * 0.005, 3) * 4;
  // Fine detail
  y += fbm(x * 0.08, z * 0.08, 3) * 0.4;

  // Carve craters
  y += craterHeight(x, z, allCraters);

  // Smooth path slightly so it's drivable
  const pathDist = Math.abs(x) / 10;
  if (pathDist < 1) {
    const smoothFactor = 1 - (1 - pathDist) * 0.15;
    y *= smoothFactor;
  }

  return y;
}
