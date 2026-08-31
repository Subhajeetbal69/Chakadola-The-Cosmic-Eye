import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import missionState from '../../stores/missionStore';
import { CRATER_POSITIONS } from './RoverPath';

/**
 * Crater — visual markers for the major craters with scan ring effects.
 * Rings appear as the rover approaches each crater.
 */
interface CraterMarkerProps {
  position: { x: number; z: number; radius: number; depth: number };
  radius: number;
  triggerProgress: number;
  index: number;
}

function CraterMarker({ position, radius, triggerProgress, index }: CraterMarkerProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const progress = missionState.smoothProgress;
    const time = clock.getElapsedTime();

    // Show crater marker when rover is near
    const distFromTrigger = Math.abs(progress - triggerProgress);
    const isNear = distFromTrigger < 0.12;

    if (ringRef.current) {
      // Opacity based on proximity
      const opacity = isNear ? Math.max(0, 1 - distFromTrigger / 0.12) : 0;
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = opacity * 0.6;
      }

      // Rotate and pulse the ring
      ringRef.current.rotation.y = time * 0.3;
      const pulse = 1 + Math.sin(time * 2) * 0.05;
      ringRef.current.scale.setScalar(pulse);
    }

    if (glowRef.current) {
      const opacity = isNear ? Math.max(0, 1 - distFromTrigger / 0.12) : 0;
      glowRef.current.intensity = opacity * 2;
    }

    // Update mission state
    if (index === 0 && progress > triggerProgress - 0.02) {
      missionState.crater1Discovered = true;
    }
    if (index === 1 && progress > triggerProgress - 0.02) {
      missionState.crater2Discovered = true;
    }
  });

  return (
    <group position={[position.x, 1.5, position.z]}>
      {/* Scan ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.9, radius * 1.0, 64]} />
        <meshBasicMaterial
          color="#00e5ff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Inner scan ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.5, radius * 0.55, 64]} />
        <meshBasicMaterial
          color="#4a9eff"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Glow point light */}
      <pointLight
        ref={glowRef}
        color="#00e5ff"
        intensity={0}
        distance={radius * 2}
      />
    </group>
  );
}

export function Craters() {
  return (
    <>
      <CraterMarker
        position={CRATER_POSITIONS[0]}
        radius={CRATER_POSITIONS[0].radius}
        triggerProgress={0.35}
        index={0}
      />
      <CraterMarker
        position={CRATER_POSITIONS[1]}
        radius={CRATER_POSITIONS[1].radius}
        triggerProgress={0.60}
        index={1}
      />
    </>
  );
}

export default Craters;
