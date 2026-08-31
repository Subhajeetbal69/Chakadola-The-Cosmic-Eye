import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import RealisticEarth from './RealisticEarth';
import OrbitalSystem from './OrbitalSystem';
import { TrackedObjectSummary, ConjunctionEvent } from '../../types';

export interface ZoomAction {
  type: 'IN' | 'OUT' | 'RESET';
  timestamp: number;
}

interface EarthSceneProps {
  onLoaded?: () => void;
  objects: TrackedObjectSummary[];
  selectedObject: TrackedObjectSummary | null;
  selectedConjunction?: ConjunctionEvent | null;
  zoomAction?: ZoomAction | null;
  simSpeedMultiplier?: number;
  onSelectObject: (obj: TrackedObjectSummary | null) => void;
}

function CameraController({ zoomAction }: { zoomAction?: ZoomAction | null }) {
  const { camera, size } = useThree();
  const controlsRef = useRef<any>(null);
  const initialAdjusted = useRef(false);
  const lastExecutedTimestamp = useRef<number>(0);

  useEffect(() => {
    if (!initialAdjusted.current) {
      const aspect = size.width / Math.max(1, size.height);
      if (aspect < 1.0) {
        // Mobile portrait: pull camera back smoothly so Earth and full LEO/GEO orbits fit inside viewport
        const dist = 26 * Math.min(1.7, 1.0 / aspect);
        camera.position.set(0, 6 * (dist / 26), dist);
        camera.updateProjectionMatrix();
        if (controlsRef.current) {
          controlsRef.current.update();
        }
      }
      initialAdjusted.current = true;
    }
  }, [size, camera]);

  useEffect(() => {
    // Only execute when a NEW zoomAction timestamp is received to prevent continuous looping
    if (!zoomAction || !zoomAction.timestamp || zoomAction.timestamp <= lastExecutedTimestamp.current) {
      return;
    }
    lastExecutedTimestamp.current = zoomAction.timestamp;

    if (zoomAction.type === 'IN') {
      const currentDist = camera.position.length();
      const newDist = Math.max(12.5, currentDist * 0.75);
      camera.position.setLength(newDist);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    } else if (zoomAction.type === 'OUT') {
      const currentDist = camera.position.length();
      const newDist = Math.min(260, currentDist * 1.35);
      camera.position.setLength(newDist);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    } else if (zoomAction.type === 'RESET') {
      const aspect = size.width / Math.max(1, size.height);
      const defaultDist = aspect < 1.0 ? 26 * Math.min(1.7, 1.0 / aspect) : 26;
      camera.position.set(0, 6 * (defaultDist / 26), defaultDist);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  }, [zoomAction, camera, size]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      minDistance={11.5}
      maxDistance={280}
      dampingFactor={0.05}
      enableDamping={true}
      rotateSpeed={0.5}
    />
  );
}

/**
 * The main 3D scene container for the Earth Orbital Visualization.
 */
export function EarthScene({
  onLoaded,
  objects,
  selectedObject,
  selectedConjunction,
  zoomAction,
  simSpeedMultiplier = 60,
  onSelectObject
}: EarthSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 6, 26], fov: 45, near: 0.1, far: 3000 }}
      dpr={[1, typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1]}
      onCreated={() => {
        if (onLoaded) onLoaded();
      }}
      gl={{
        antialias: true,
        logarithmicDepthBuffer: true,
        powerPreference: 'high-performance'
      }}
    >
      <color attach="background" args={['#05050a']} />
      
      {/* Cosmos Background Stars */}
      <Stars 
        radius={350} 
        depth={100} 
        count={5000} 
        factor={3} 
        saturation={0} 
        fade 
        speed={0.3} 
      />

      {/* Ambient Lighting for the Dark Side */}
      <ambientLight intensity={0.08} color="#8899bb" />
      
      {/* The Sun (Directional Light illuminating the day hemisphere) */}
      <directionalLight
        position={[50, 10, -20]}
        intensity={2.8}
        color="#ffffff"
      />

      {/* Realistic Earth & Live Orbital Trajectory System */}
      <group>
        <Suspense fallback={null}>
          <RealisticEarth simSpeedMultiplier={simSpeedMultiplier} />
        </Suspense>
        <OrbitalSystem 
          objects={objects}
          selectedObject={selectedObject}
          selectedConjunction={selectedConjunction}
          simSpeedMultiplier={simSpeedMultiplier}
          onSelectObject={onSelectObject}
        />
      </group>

      {/* Orbit Camera Controls with on-screen Zoom Trigger support */}
      <CameraController zoomAction={zoomAction} />
    </Canvas>
  );
}

export default EarthScene;
