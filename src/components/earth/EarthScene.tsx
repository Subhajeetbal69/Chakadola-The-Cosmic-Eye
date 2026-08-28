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
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (!zoomAction) return;

    if (zoomAction.type === 'IN') {
      const currentDist = camera.position.length();
      const newDist = Math.max(12.5, currentDist * 0.75);
      camera.position.setLength(newDist);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    } else if (zoomAction.type === 'OUT') {
      const currentDist = camera.position.length();
      const newDist = Math.min(80, currentDist * 1.35);
      camera.position.setLength(newDist);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
    } else if (zoomAction.type === 'RESET') {
      camera.position.set(0, 6, 26);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  }, [zoomAction, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      minDistance={11.5}
      maxDistance={85}
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
      camera={{ position: [0, 6, 26], fov: 45 }}
      onCreated={() => {
        if (onLoaded) onLoaded();
      }}
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
    >
      <color attach="background" args={['#05050a']} />
      
      {/* Cosmos Background Stars */}
      <Stars 
        radius={120} 
        depth={60} 
        count={6000} 
        factor={4} 
        saturation={0} 
        fade 
        speed={0.4} 
      />

      {/* Ambient Lighting for the Dark Side */}
      <ambientLight intensity={0.08} color="#8899bb" />
      
      {/* The Sun (Directional Light illuminating the day hemisphere) */}
      <directionalLight
        position={[50, 10, -20]}
        intensity={2.8}
        color="#ffffff"
        castShadow
      />

      {/* Realistic Earth & Live Orbital Trajectory System */}
      <group>
        <Suspense fallback={null}>
          <RealisticEarth />
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
