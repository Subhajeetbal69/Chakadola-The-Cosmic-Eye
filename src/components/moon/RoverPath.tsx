import * as THREE from 'three';
import { getTerrainHeight } from '../../utils/terrainMath';

/**
 * RoverPath — defines the CatmullRomCurve3 spline that the rover follows.
 * Control points weave between crater positions to create a natural exploration route.
 */

// Crater positions (used by both terrain carving and path planning)
export const CRATER_POSITIONS = [
  { x: -8, z: -25, radius: 6, depth: 1.8 },   // Crater 1 — first discovery
  { x: 12, z: -55, radius: 8, depth: 2.2 },    // Crater 2 — second discovery
];

// Flag positions (at the end of the journey — positioned apart on either side of the rover)
export const FLAG_POSITIONS = {
  earth: { x: -2.8, z: -82.2 },
  alert: { x: 2.8, z: -82.2 },
};

// Path control points — rover goes OVER/THROUGH the craters
const pathPoints = [
  new THREE.Vector3(0, 0, 5),         // Start
  new THREE.Vector3(-1, 0, -2),
  new THREE.Vector3(-3, 0, -8),
  new THREE.Vector3(-6, 0, -15),      
  new THREE.Vector3(-8, 0, -20),       // Approaching crater 1
  new THREE.Vector3(-8, 0, -25),       // DEAD CENTER of crater 1
  new THREE.Vector3(-8, 0, -30),       // Exiting crater 1
  new THREE.Vector3(-5, 0, -38),       
  new THREE.Vector3(2, 0, -45),
  new THREE.Vector3(8, 0, -50),        // Approaching crater 2
  new THREE.Vector3(12, 0, -55),       // DEAD CENTER of crater 2
  new THREE.Vector3(8, 0, -62),        // Exiting crater 2
  new THREE.Vector3(4, 0, -68),
  new THREE.Vector3(0, 0, -75),
  new THREE.Vector3(0, 0, -80),        // Approach flags
  new THREE.Vector3(0, 0, -83),        // Final position between flags
];

// Create the curve
const roverCurve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.5);

/**
 * Get rover position and orientation at a given progress t (0–1).
 */
export function getRoverState(t: number) {
  const clampedT = Math.max(0, Math.min(1, t));
  const position = roverCurve.getPointAt(clampedT);
  const tangent = roverCurve.getTangentAt(clampedT);

  // Calculate rotation from tangent
  const angle = Math.atan2(tangent.x, tangent.z);

  return { position, tangent, angle };
}

/**
 * Get a position slightly ahead on the path (for camera look-ahead).
 */
export function getLookAheadPosition(t: number, offset = 0.05) {
  const lookT = Math.min(1, t + offset);
  return roverCurve.getPointAt(lookT);
}

/**
 * Get total arc length of the path (for distance calculation).
 */
export const PATH_LENGTH = roverCurve.getLength();

export const PRECOMPUTED_STEPS = 1000;
export const precomputedPath: { x: number; y: number; z: number; pitch: number; roll: number; angle: number }[] = [];

// Precompute terrain physics along the path to save CPU cycles in useFrame
function precomputeTerrainPhysics() {
  for (let i = 0; i <= PRECOMPUTED_STEPS; i++) {
    const t = i / PRECOMPUTED_STEPS;
    const { position, angle } = getRoverState(t);
    
    const terrainY = getTerrainHeight(position.x, position.z, CRATER_POSITIONS);
    
    const sampleDistZ = 0.625; // Matches wheelbase (front 0.5, back -0.75 => avg dist ~0.625)
    const sampleDistX = 0.55;  // Matches rover width (side * 0.55)
    const fdx = Math.sin(angle);
    const fdz = Math.cos(angle);
    const rdx = fdz;
    const rdz = -fdx;

    const frontY = getTerrainHeight(position.x + fdx * sampleDistZ, position.z + fdz * sampleDistZ, CRATER_POSITIONS);
    const backY = getTerrainHeight(position.x - fdx * sampleDistZ, position.z - fdz * sampleDistZ, CRATER_POSITIONS);
    const rightY = getTerrainHeight(position.x + rdx * sampleDistX, position.z + rdz * sampleDistX, CRATER_POSITIONS);
    const leftY = getTerrainHeight(position.x - rdx * sampleDistX, position.z - rdz * sampleDistX, CRATER_POSITIONS);

    const pitch = -Math.atan2(frontY - backY, sampleDistZ * 2);
    const roll = Math.atan2(rightY - leftY, sampleDistX * 2);

    precomputedPath.push({
      x: position.x,
      y: terrainY,
      z: position.z,
      pitch,
      roll,
      angle
    });
  }
}

// Call once on module load
precomputeTerrainPhysics();

/**
 * Fast lookup for precomputed rover state
 */
export function getFastRoverState(t: number) {
  const clampedT = Math.max(0, Math.min(1, t));
  const index = clampedT * PRECOMPUTED_STEPS;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  
  if (lowerIndex === upperIndex) {
    return precomputedPath[lowerIndex];
  }

  // Linear interpolate between the two closest precomputed steps
  const fraction = index - lowerIndex;
  const lower = precomputedPath[lowerIndex];
  const upper = precomputedPath[upperIndex];

  // Helper for lerp
  const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end;

  // Handle angle interpolation properly (avoid spinning at 360 wrap)
  let angleDiff = upper.angle - lower.angle;
  if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  return {
    x: lerp(lower.x, upper.x, fraction),
    y: lerp(lower.y, upper.y, fraction),
    z: lerp(lower.z, upper.z, fraction),
    pitch: lerp(lower.pitch, upper.pitch, fraction),
    roll: lerp(lower.roll, upper.roll, fraction),
    angle: lower.angle + angleDiff * fraction
  };
}

export default roverCurve;
