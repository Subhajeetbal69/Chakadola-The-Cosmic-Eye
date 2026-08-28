import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { TrackedObjectSummary, ConjunctionEvent } from '../../types';
import {
  eciToScenePosition,
  generateTrajectoryFromEci,
  generateOrbitPath,
  getOrbitalPosition,
  EARTH_RADIUS,
  SCALE_FACTOR,
  REAL_EARTH_RADIUS_KM
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

interface OrbitalParams {
  sma: number;
  ecc: number;
  inc: number;
  raan: number;
  aop: number;
  meanMotion: number; // radians per second
  initialAnomaly: number;
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

  // Transition controller so camera smoothly glides ONCE on selection, then lets user zoom freely
  const lastSelectedIdRef = useRef<string | null>(null);
  const transitionFramesRef = useRef<number>(0);

  useEffect(() => {
    if (selectedObject && selectedObject.id !== lastSelectedIdRef.current) {
      lastSelectedIdRef.current = selectedObject.id;
      // Animate for 45 frames (0.75s), then release control completely to OrbitControls
      transitionFramesRef.current = 45;
    } else if (!selectedObject) {
      lastSelectedIdRef.current = null;
      transitionFramesRef.current = 0;
    }
  }, [selectedObject]);

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

  // Compute realistic Keplerian orbital parameters for every object according to its dossier
  const createOrbitalParams = useCallback((list: TrackedObjectSummary[]): OrbitalParams[] => {
    return list.map((obj, index) => {
      const altKm = obj.altitudeKm || 400;
      const sma = EARTH_RADIUS + altKm * SCALE_FACTOR;
      
      const perigee = obj.perigeeKm || altKm;
      const apogee = obj.apogeeKm || altKm;
      const ecc = Math.max(0.0005, Math.min(0.25, (apogee - perigee) / (apogee + perigee + 2 * REAL_EARTH_RADIUS_KM)));
      
      const inc = ((obj.inclinationDeg || 51.6) * Math.PI) / 180;
      
      const pos = obj.currentPosition || obj.positionKm;
      let initialAnomaly = (index * 0.37) % (Math.PI * 2);
      let raan = ((index * 47) % 360) * (Math.PI / 180);
      let aop = ((index * 29) % 360) * (Math.PI / 180);

      if (pos) {
        const radius = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        if (radius > 100) {
          raan = Math.atan2(pos.y, pos.x);
          initialAnomaly = Math.asin(Math.max(-1, Math.min(1, pos.z / radius)));
        }
      }

      const periodSec = (obj.periodMin ? obj.periodMin * 60 : 92 * 60);
      const meanMotion = (Math.PI * 2) / periodSec;

      const hasSample = !!(obj.orbitSample && obj.orbitSample.length > 4);
      const samplePoints = hasSample ? generateTrajectoryFromEci(obj.orbitSample!) : undefined;

      return {
        sma,
        ecc,
        inc,
        raan,
        aop,
        meanMotion,
        initialAnomaly,
        hasSample,
        samplePoints
      };
    });
  }, []);

  const satParams = useMemo(() => createOrbitalParams(satList), [satList, createOrbitalParams]);
  const debrisParams = useMemo(() => createOrbitalParams(debrisList), [debrisList, createOrbitalParams]);
  const rocketParams = useMemo(() => createOrbitalParams(rocketList), [rocketList, createOrbitalParams]);

  // Fast coordinate arrays
  const satPositions = useMemo(() => new Float32Array(satList.length * 3), [satList.length]);
  const debrisPositions = useMemo(() => new Float32Array(debrisList.length * 3), [debrisList.length]);
  const rocketPositions = useMemo(() => new Float32Array(rocketList.length * 3), [rocketList.length]);

  // Points Mesh Refs
  const satPointsRef = useRef<THREE.Points>(null);
  const debrisPointsRef = useRef<THREE.Points>(null);
  const rocketPointsRef = useRef<THREE.Points>(null);

  // Track live current position of the selected object for prominent reticle & beacon
  const selectedLivePosRef = useRef<THREE.Vector3 | null>(null);
  const selectedLivePos = useRef<THREE.Vector3>(new THREE.Vector3());

  // Realistic Keplerian frame loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    simTimeRef.current += dt * simSpeedMultiplier;
    const t = simTimeRef.current;

    // 1. Propagate Active Satellites (White)
    if (satPointsRef.current && satList.length > 0) {
      const posAttr = satPointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < satList.length; i++) {
          const param = satParams[i];
          if (!param) continue;

          let x = 0, y = 0, z = 0;
          if (param.hasSample && param.samplePoints && param.samplePoints.length > 1) {
            const numPts = param.samplePoints.length;
            const phase = ((param.initialAnomaly + t * param.meanMotion) / (Math.PI * 2)) % 1;
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
            const ta = param.initialAnomaly + t * param.meanMotion;
            const v = getOrbitalPosition(param.sma, param.ecc, param.inc, param.raan, param.aop, ta);
            x = v.x;
            y = v.y;
            z = v.z;
          }

          posAttr.setXYZ(i, x, y, z);

          if (selectedObject && selectedObject.id === satList[i].id) {
            selectedLivePos.current.set(x, y, z);
            selectedLivePosRef.current = selectedLivePos.current;
          }
        }
        posAttr.needsUpdate = true;
      }
    }

    // 2. Propagate Space Debris (Bright Red)
    if (debrisPointsRef.current && debrisList.length > 0) {
      const posAttr = debrisPointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < debrisList.length; i++) {
          const param = debrisParams[i];
          if (!param) continue;

          let x = 0, y = 0, z = 0;
          if (param.hasSample && param.samplePoints && param.samplePoints.length > 1) {
            const numPts = param.samplePoints.length;
            const phase = ((param.initialAnomaly + t * param.meanMotion) / (Math.PI * 2)) % 1;
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
            const ta = param.initialAnomaly + t * param.meanMotion;
            const v = getOrbitalPosition(param.sma, param.ecc, param.inc, param.raan, param.aop, ta);
            x = v.x;
            y = v.y;
            z = v.z;
          }

          posAttr.setXYZ(i, x, y, z);

          if (selectedObject && selectedObject.id === debrisList[i].id) {
            selectedLivePos.current.set(x, y, z);
            selectedLivePosRef.current = selectedLivePos.current;
          }
        }
        posAttr.needsUpdate = true;
      }
    }

    // 3. Propagate Rocket Bodies (Blue)
    if (rocketPointsRef.current && rocketList.length > 0) {
      const posAttr = rocketPointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      if (posAttr) {
        for (let i = 0; i < rocketList.length; i++) {
          const param = rocketParams[i];
          if (!param) continue;

          let x = 0, y = 0, z = 0;
          if (param.hasSample && param.samplePoints && param.samplePoints.length > 1) {
            const numPts = param.samplePoints.length;
            const phase = ((param.initialAnomaly + t * param.meanMotion) / (Math.PI * 2)) % 1;
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
            const ta = param.initialAnomaly + t * param.meanMotion;
            const v = getOrbitalPosition(param.sma, param.ecc, param.inc, param.raan, param.aop, ta);
            x = v.x;
            y = v.y;
            z = v.z;
          }

          posAttr.setXYZ(i, x, y, z);

          if (selectedObject && selectedObject.id === rocketList[i].id) {
            selectedLivePos.current.set(x, y, z);
            selectedLivePosRef.current = selectedLivePos.current;
          }
        }
        posAttr.needsUpdate = true;
      }
    }

    // Smooth One-Time Camera Focus when an object is clicked, then release to user controls
    if (selectedObject && transitionFramesRef.current > 0 && selectedLivePosRef.current) {
      transitionFramesRef.current -= 1;
      const targetPos = selectedLivePosRef.current;
      const currentDist = camera.position.length();
      // Keep comfortable viewing distance between 18 and 28 units
      const targetDist = Math.max(18, Math.min(30, currentDist));
      const camOffset = targetPos.clone().normalize().multiplyScalar(targetDist);
      camera.position.lerp(camOffset, 0.08);
    }
  });

  // Selected Object Full Orbit Path (Closed 360° loop)
  const selectedOrbitPoints = useMemo(() => {
    if (!selectedObject) return null;

    if (selectedObject.orbitSample && selectedObject.orbitSample.length > 8) {
      const pts = generateTrajectoryFromEci(selectedObject.orbitSample);
      // Ensure closed loop
      if (pts.length > 0 && pts[0].distanceTo(pts[pts.length - 1]) > 0.1) {
        pts.push(pts[0].clone());
      }
      return pts;
    }

    const altKm = selectedObject.altitudeKm || 400;
    const sma = EARTH_RADIUS + altKm * SCALE_FACTOR;
    const perigee = selectedObject.perigeeKm || altKm;
    const apogee = selectedObject.apogeeKm || altKm;
    const ecc = Math.max(0.0005, Math.min(0.25, (apogee - perigee) / (apogee + perigee + 2 * REAL_EARTH_RADIUS_KM)));
    const inc = ((selectedObject.inclinationDeg || 51.6) * Math.PI) / 180;
    
    return generateOrbitPath(sma, ecc, inc, 0, 0, 180);
  }, [selectedObject]);

  // Conjunction secondary object trajectory points
  const secondaryOrbitPoints = useMemo(() => {
    if (!selectedConjunction || !selectedConjunction.objectB) return null;
    const objB = selectedConjunction.objectB;

    if (objB.orbitSample && objB.orbitSample.length > 8) {
      const pts = generateTrajectoryFromEci(objB.orbitSample);
      if (pts.length > 0 && pts[0].distanceTo(pts[pts.length - 1]) > 0.1) {
        pts.push(pts[0].clone());
      }
      return pts;
    }

    const altKm = objB.altitudeKm || 450;
    const sma = EARTH_RADIUS + altKm * SCALE_FACTOR;
    const inc = ((objB.inclinationDeg || 74.0) * Math.PI) / 180;
    return generateOrbitPath(sma, 0.002, inc, Math.PI / 3, 0, 180);
  }, [selectedConjunction]);

  // Conjunction hazard link vector
  const hazardVectorPoints = useMemo(() => {
    if (!selectedConjunction) return null;
    const posA = selectedConjunction.positionAAtTca || selectedConjunction.objectA?.currentPosition;
    const posB = selectedConjunction.positionBAtTca || selectedConjunction.objectB?.currentPosition;

    if (posA && posB) {
      return [
        eciToScenePosition(posA.x, posA.y, posA.z),
        eciToScenePosition(posB.x, posB.y, posB.z)
      ];
    }
    return null;
  }, [selectedConjunction]);

  // Raycast click handler for selecting dots
  const handlePointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();

      const pointObjects: Array<{ ref: THREE.Points | null; list: TrackedObjectSummary[] }> = [
        { ref: satPointsRef.current, list: satList },
        { ref: rocketPointsRef.current, list: rocketList },
        { ref: debrisPointsRef.current, list: debrisList }
      ];

      raycaster.params.Points.threshold = 0.6;

      for (const item of pointObjects) {
        if (!item.ref) continue;
        const intersects = raycaster.intersectObject(item.ref, false);
        if (intersects.length > 0 && intersects[0].index !== undefined) {
          const clickedIndex = intersects[0].index;
          if (clickedIndex < item.list.length) {
            onSelectObject(item.list[clickedIndex]);
            return;
          }
        }
      }

      // Background click: deselect
      onSelectObject(null);
    },
    [raycaster, satList, rocketList, debrisList, onSelectObject]
  );

  return (
    <group onPointerDown={handlePointerDown}>
      {/* Invisible Sphere for Background Deselection */}
      <mesh>
        <sphereGeometry args={[100, 16, 16]} />
        <meshBasicMaterial visible={false} side={THREE.BackSide} />
      </mesh>

      {/* 1. Active Satellites (Refined Sharp White Dots) */}
      {satList.length > 0 && (
        <points ref={satPointsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={satList.length}
              array={satPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#ffffff"
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

      {/* 2. Space Debris (Sharp Bright Red Dots) */}
      {debrisList.length > 0 && (
        <points ref={debrisPointsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={debrisList.length}
              array={debrisPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#ff2244"
            size={0.08}
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
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={rocketList.length}
              array={rocketPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#0088ff"
            size={0.10}
            map={circleTexture}
            transparent={true}
            opacity={0.95}
            sizeAttenuation={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {/* Selected Object Primary Orbit Line (Vibrant Glowing Cyan) */}
      {selectedOrbitPoints && (
        <Line
          points={selectedOrbitPoints}
          color="#00ffff"
          lineWidth={3.5}
          transparent
          opacity={0.95}
        />
      )}

      {/* Selected Object Prominent 3D Target Marker, Concentric Rings & Floating Name Tag */}
      {selectedObject && (
        <group position={selectedLivePos.current}>
          {/* Glowing 3D Diamond Satellite Centerpiece */}
          <mesh>
            <octahedronGeometry args={[0.24, 0]} />
            <meshStandardMaterial
              color="#00ffff"
              emissive="#00e5ff"
              emissiveIntensity={2.0}
              roughness={0.1}
              metalness={0.9}
            />
          </mesh>

          {/* Inner Pulsing Target Ring */}
          <mesh>
            <ringGeometry args={[0.35, 0.42, 32]} />
            <meshBasicMaterial
              color="#00ffff"
              side={THREE.DoubleSide}
              transparent
              opacity={0.9}
            />
          </mesh>

          {/* Outer Glowing Radar Ring */}
          <mesh>
            <ringGeometry args={[0.6, 0.68, 32]} />
            <meshBasicMaterial
              color="#00e5ff"
              side={THREE.DoubleSide}
              transparent
              opacity={0.5}
            />
          </mesh>

          {/* Floating Billboard Tag with Satellite Name */}
          <Html position={[0, 0.55, 0]} center distanceFactor={22}>
            <div className="pointer-events-none select-none px-2 py-0.5 rounded-md bg-slate-900/90 border border-cyan-400 text-cyan-300 font-mono text-[10px] font-bold shadow-[0_0_12px_rgba(0,255,255,0.6)] whitespace-nowrap flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>{selectedObject.name}</span>
            </div>
          </Html>
        </group>
      )}

      {/* Secondary Conjunction Hazard Orbit Line (Red/Pink) */}
      {secondaryOrbitPoints && (
        <Line
          points={secondaryOrbitPoints}
          color="#ff3366"
          lineWidth={2.5}
          transparent
          opacity={0.8}
        />
      )}

      {/* Conjunction Encounter Distance Vector (Yellow dashed) */}
      {hazardVectorPoints && (
        <Line
          points={hazardVectorPoints}
          color="#ffdd00"
          lineWidth={3}
          dashed
          dashScale={2}
          dashSize={0.2}
          gapSize={0.1}
        />
      )}
    </group>
  );
}

export default OrbitalSystem;
