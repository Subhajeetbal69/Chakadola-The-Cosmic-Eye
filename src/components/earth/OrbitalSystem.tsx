import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { TrackedObjectSummary, ConjunctionEvent } from '../../types';
import {
  eciToScenePosition,
  generateTrajectoryFromEci,
  computeOrbitBasis,
  generateOrbitCircleFromBasis,
  OrbitBasis
} from '../../utils/orbitalMath';

interface OrbitalSystemProps {
  objects: TrackedObjectSummary[];
  selectedObject: TrackedObjectSummary | null;
  selectedConjunction?: ConjunctionEvent | null;
  simSpeedMultiplier?: number;
  onSelectObject: (obj: TrackedObjectSummary | null) => void;
}

// Generate a crisp, round particle sprite canvas texture with a bright solid center and smooth antialiasing
function createCrispDotTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Checks if a 3D point in scene space is physically occluded by the solid Earth sphere (radius ~9.95)
 */
function isPointOccludedByEarth(pointPos: THREE.Vector3, cameraPos: THREE.Vector3, earthRadius = 9.95): boolean {
  const rayDir = new THREE.Vector3().subVectors(pointPos, cameraPos);
  const pointDist = rayDir.length();
  if (pointDist < 1e-4) return false;
  rayDir.normalize();

  // Vector from camera to Earth center (0,0,0) is -cameraPos
  const toCenter = cameraPos.clone().negate();
  const proj = toCenter.dot(rayDir);

  // If Earth center is behind camera or beyond the point, it cannot occlude
  if (proj <= 0 || proj >= pointDist) return false;

  // Distance squared from Earth center to line of sight
  const d2 = toCenter.lengthSq() - proj * proj;
  return d2 < earthRadius * earthRadius;
}

interface OrbitalParams {
  id: string;
  basis: OrbitBasis;
  meanMotion: number; // radians per second
  hasSample: boolean;
  samplePoints?: THREE.Vector3[];
}

export function OrbitalSystem({
  objects = [],
  selectedObject,
  selectedConjunction,
  simSpeedMultiplier = 60,
  onSelectObject
}: OrbitalSystemProps) {
  const { camera, raycaster } = useThree();
  const circleTexture = useMemo(() => createCrispDotTexture(), []);
  const simTimeRef = useRef<number>(0);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const selectedMarkerGroupRef = useRef<THREE.Group>(null);

  // Separate objects into Satellites (White), Debris (Bright Red), and Rocket Bodies (Blue)
  const { satList, debrisList, rocketList } = useMemo(() => {
    const sats: TrackedObjectSummary[] = [];
    const debris: TrackedObjectSummary[] = [];
    const rockets: TrackedObjectSummary[] = [];

    for (const obj of objects) {
      if (obj.classification === 'ACTIVE_SATELLITE') {
        sats.push(obj);
      } else if (obj.classification === 'ROCKET_BODY') {
        rockets.push(obj);
      } else {
        debris.push(obj);
      }
    }

    return { satList: sats, debrisList: debris, rocketList: rockets };
  }, [objects]);

  // Compute exact, physically consistent orbital plane parameters for each object
  const createOrbitalParams = useCallback((list: TrackedObjectSummary[]): OrbitalParams[] => {
    return list.map((obj) => {
      const pos = obj.currentPosition || obj.positionKm;
      const vel = obj.currentVelocity;
      const inc = obj.inclinationDeg || 51.6;
      const altKm = obj.altitudeKm || 400;

      const basis = computeOrbitBasis(pos, vel, inc, altKm);
      const periodSec = obj.periodMin ? Math.max(60, obj.periodMin) * 60 : 92 * 60;
      const meanMotion = (Math.PI * 2) / periodSec;

      const hasSample = !!(obj.orbitSample && obj.orbitSample.length > 8);
      const samplePoints = hasSample ? generateTrajectoryFromEci(obj.orbitSample!) : undefined;

      return {
        id: obj.id,
        basis,
        meanMotion,
        hasSample,
        samplePoints
      };
    });
  }, []);

  const satParams = useMemo(() => createOrbitalParams(satList), [satList, createOrbitalParams]);
  const debrisParams = useMemo(() => createOrbitalParams(debrisList), [debrisList, createOrbitalParams]);
  const rocketParams = useMemo(() => createOrbitalParams(rocketList), [rocketList, createOrbitalParams]);

  // Pre-initialize buffer positions at t=0 with exact coordinates (never 0,0,0)
  const satPositions = useMemo(() => {
    const arr = new Float32Array(satList.length * 3);
    for (let i = 0; i < satList.length; i++) {
      const p = satParams[i];
      if (p) {
        arr[i * 3] = p.basis.radius * p.basis.u.x;
        arr[i * 3 + 1] = p.basis.radius * p.basis.u.y;
        arr[i * 3 + 2] = p.basis.radius * p.basis.u.z;
      }
    }
    return arr;
  }, [satList.length, satParams]);

  const debrisPositions = useMemo(() => {
    const arr = new Float32Array(debrisList.length * 3);
    for (let i = 0; i < debrisList.length; i++) {
      const p = debrisParams[i];
      if (p) {
        arr[i * 3] = p.basis.radius * p.basis.u.x;
        arr[i * 3 + 1] = p.basis.radius * p.basis.u.y;
        arr[i * 3 + 2] = p.basis.radius * p.basis.u.z;
      }
    }
    return arr;
  }, [debrisList.length, debrisParams]);

  const rocketPositions = useMemo(() => {
    const arr = new Float32Array(rocketList.length * 3);
    for (let i = 0; i < rocketList.length; i++) {
      const p = rocketParams[i];
      if (p) {
        arr[i * 3] = p.basis.radius * p.basis.u.x;
        arr[i * 3 + 1] = p.basis.radius * p.basis.u.y;
        arr[i * 3 + 2] = p.basis.radius * p.basis.u.z;
      }
    }
    return arr;
  }, [rocketList.length, rocketParams]);

  // Points Mesh Refs
  const satPointsRef = useRef<THREE.Points>(null);
  const debrisPointsRef = useRef<THREE.Points>(null);
  const rocketPointsRef = useRef<THREE.Points>(null);

  // Immediately place marker group at selected object position on selection change
  useEffect(() => {
    if (selectedObject && selectedMarkerGroupRef.current) {
      const p =
        satParams.find((s) => s.id === selectedObject.id) ||
        debrisParams.find((d) => d.id === selectedObject.id) ||
        rocketParams.find((r) => r.id === selectedObject.id);
      if (p) {
        const t = simTimeRef.current;
        const angle = (t * p.meanMotion) % (Math.PI * 2);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const { u, v, radius } = p.basis;
        selectedMarkerGroupRef.current.position.set(
          radius * (cosA * u.x + sinA * v.x),
          radius * (cosA * u.y + sinA * v.y),
          radius * (cosA * u.z + sinA * v.z)
        );
        selectedMarkerGroupRef.current.quaternion.copy(camera.quaternion);
        selectedMarkerGroupRef.current.updateMatrixWorld(true);
      }
    }
  }, [selectedObject, satParams, debrisParams, rocketParams, camera]);

  // Precise Keplerian frame loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    simTimeRef.current += dt * simSpeedMultiplier;
    const t = simTimeRef.current;

    // Helper to calculate 3D coordinates on orbital plane
    const updatePointPositions = (
      pointsRef: React.RefObject<THREE.Points | null>,
      params: OrbitalParams[],
      list: TrackedObjectSummary[]
    ) => {
      if (!pointsRef.current || list.length === 0) return;
      const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (!posAttr) return;

      for (let i = 0; i < list.length; i++) {
        const param = params[i];
        if (!param) continue;

        let x = 0, y = 0, z = 0;

        if (param.hasSample && param.samplePoints && param.samplePoints.length > 1) {
          const numPts = param.samplePoints.length;
          const phase = ((t * param.meanMotion) / (Math.PI * 2)) % 1;
          const normalizedPhase = phase < 0 ? phase + 1 : phase;
          const exactIdx = normalizedPhase * numPts;
          const idxA = Math.floor(exactIdx) % numPts;
          const idxB = (idxA + 1) % numPts;
          const frac = exactIdx - Math.floor(exactIdx);

          const ptA = param.samplePoints[idxA];
          const ptB = param.samplePoints[idxB];
          x = ptA.x + (ptB.x - ptA.x) * frac;
          y = ptA.y + (ptB.y - ptA.y) * frac;
          z = ptA.z + (ptB.z - ptA.z) * frac;
        } else {
          const angle = (t * param.meanMotion) % (Math.PI * 2);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const { u, v, radius } = param.basis;

          x = radius * (cosA * u.x + sinA * v.x);
          y = radius * (cosA * u.y + sinA * v.y);
          z = radius * (cosA * u.z + sinA * v.z);
        }

        posAttr.setXYZ(i, x, y, z);

        if (selectedObject && selectedObject.id === list[i].id) {
          if (selectedMarkerGroupRef.current) {
            selectedMarkerGroupRef.current.position.set(x, y, z);
            selectedMarkerGroupRef.current.quaternion.copy(camera.quaternion);
            selectedMarkerGroupRef.current.updateMatrixWorld(true);
          }
        }
      }
      posAttr.needsUpdate = true;
    };

    // 1. Propagate Active Satellites (White)
    updatePointPositions(satPointsRef, satParams, satList);

    // 2. Propagate Space Debris (Bright Red)
    updatePointPositions(debrisPointsRef, debrisParams, debrisList);

    // 3. Propagate Rocket Bodies (Blue)
    updatePointPositions(rocketPointsRef, rocketParams, rocketList);
  });

  // Selected Object Full Orbit Path (100% matched to object's exact orbital basis)
  const selectedOrbitPoints = useMemo(() => {
    if (!selectedObject) return null;

    if (selectedObject.orbitSample && selectedObject.orbitSample.length > 8) {
      const pts = generateTrajectoryFromEci(selectedObject.orbitSample);
      if (pts.length > 0 && pts[0].distanceTo(pts[pts.length - 1]) > 0.05) {
        pts.push(pts[0].clone());
      }
      return pts;
    }

    const pos = selectedObject.currentPosition || selectedObject.positionKm;
    const vel = selectedObject.currentVelocity;
    const inc = selectedObject.inclinationDeg || 51.6;
    const alt = selectedObject.altitudeKm || 400;

    const basis = computeOrbitBasis(pos, vel, inc, alt);
    return generateOrbitCircleFromBasis(basis, 180);
  }, [selectedObject]);

  // Record pointer down position to differentiate clicks from camera rotation drags
  const handlePointerDown = useCallback((e: any) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Raycast click handler with Earth occlusion filtering & distance-to-ray cursor aim precision
  const handlePointerUp = useCallback(
    (e: any) => {
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      const moveDist = Math.hypot(dx, dy);

      // If user was dragging/orbiting the camera, do not trigger click selection
      if (moveDist > 6) return;

      e.stopPropagation();

      const checkList: Array<{ ref: THREE.Points | null; list: TrackedObjectSummary[] }> = [
        { ref: satPointsRef.current, list: satList },
        { ref: rocketPointsRef.current, list: rocketList },
        { ref: debrisPointsRef.current, list: debrisList }
      ];

      raycaster.params.Points.threshold = 0.55;

      interface HitCandidate {
        obj: TrackedObjectSummary;
        distanceToRay: number;
        distanceToCamera: number;
      }

      const candidates: HitCandidate[] = [];

      for (const item of checkList) {
        if (!item.ref) continue;
        const intersects = raycaster.intersectObject(item.ref, false);
        for (const hit of intersects) {
          if (hit.index !== undefined && hit.index < item.list.length) {
            const ptWorld = hit.point;
            // Only consider points on the visible side facing the camera (not occluded behind Earth)
            if (!isPointOccludedByEarth(ptWorld, camera.position)) {
              candidates.push({
                obj: item.list[hit.index],
                distanceToRay: hit.distanceToRay ?? 0.1,
                distanceToCamera: hit.distance
              });
            }
          }
        }
      }

      if (candidates.length > 0) {
        // Sort primarily by cursor aim proximity (distanceToRay), secondarily by camera distance
        candidates.sort((a, b) => {
          if (Math.abs(a.distanceToRay - b.distanceToRay) > 0.05) {
            return a.distanceToRay - b.distanceToRay;
          }
          return a.distanceToCamera - b.distanceToCamera;
        });
        onSelectObject(candidates[0].obj);
        return;
      }

      // Background click: deselect if clicking open cosmos
      onSelectObject(null);
    },
    [raycaster, camera, satList, rocketList, debrisList, onSelectObject]
  );

  return (
    <group onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      {/* Invisible Sphere for Background Deselection */}
      <mesh>
        <sphereGeometry args={[100, 16, 16]} />
        <meshBasicMaterial visible={false} side={THREE.BackSide} />
      </mesh>

      {/* 1. Active Satellites (Vibrant High-Tech Emerald Green Dots) */}
      {satList.length > 0 && (
        <points ref={satPointsRef}>
          <bufferGeometry
            onUpdate={(self) => {
              self.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
            }}
          >
            <bufferAttribute
              attach="attributes-position"
              count={satList.length}
              array={satPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#00ff66"
            size={0.16}
            map={circleTexture}
            transparent={true}
            opacity={0.95}
            sizeAttenuation={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {/* 2. Space Debris (Sharp Bright Red Dots) */}
      {debrisList.length > 0 && (
        <points ref={debrisPointsRef}>
          <bufferGeometry
            onUpdate={(self) => {
              self.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
            }}
          >
            <bufferAttribute
              attach="attributes-position"
              count={debrisList.length}
              array={debrisPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#ff2244"
            size={0.10}
            map={circleTexture}
            transparent={true}
            opacity={0.9}
            sizeAttenuation={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {/* 3. Rocket Bodies (Sharp Blue Dots) */}
      {rocketList.length > 0 && (
        <points ref={rocketPointsRef}>
          <bufferGeometry
            onUpdate={(self) => {
              self.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);
            }}
          >
            <bufferAttribute
              attach="attributes-position"
              count={rocketList.length}
              array={rocketPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#0088ff"
            size={0.12}
            map={circleTexture}
            transparent={true}
            opacity={0.95}
            sizeAttenuation={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {/* Selected Object Primary Orbit Line (Sleek Glowing Cyan Trajectory) */}
      {selectedOrbitPoints && (
        <Line
          points={selectedOrbitPoints}
          color="#00ffff"
          lineWidth={2.2}
          transparent
          opacity={0.88}
        />
      )}

      {/* Selected Object Single Clean Target Circle & Side Name */}
      {selectedObject && (
        <group ref={selectedMarkerGroupRef}>
          {/* Crisp, clean circular targeting ring around the satellite */}
          <mesh>
            <ringGeometry args={[0.22, 0.25, 48]} />
            <meshBasicMaterial
              color="#00ffff"
              side={THREE.DoubleSide}
              transparent
              opacity={0.9}
            />
          </mesh>

          {/* Compact name on the side */}
          <Html
            position={[0.38, 0, 0]}
            style={{ pointerEvents: 'none', transform: 'translate(0, -50%)' }}
            distanceFactor={28}
            zIndexRange={[100, 0]}
          >
            <div className="select-none px-2 py-0.5 rounded bg-slate-950/85 border border-cyan-400/60 text-cyan-300 font-mono text-[10px] font-semibold tracking-wider shadow-[0_0_10px_rgba(0,255,255,0.35)] whitespace-nowrap flex items-center gap-1.5 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>{selectedObject.name}</span>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

export default OrbitalSystem;



