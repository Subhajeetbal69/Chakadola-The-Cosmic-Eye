import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import missionState from '../../stores/missionStore';
import { FLAG_POSITIONS } from './RoverPath';
import { generateNoiseTexture } from '../../utils/textureGenerator';

/**
 * MissionFlag — interactive flag with cloth wave animation.
 * Two flags: Earth (cyan/blue) and Alert (gold/yellow).
 */
interface FlagProps {
  position: { x: number; z: number };
  color: string;
  emissiveColor: string;
  label: string;
  route: string;
  className: string;
}

function Flag({ position, color, emissiveColor, label, route, className }: FlagProps) {
  const navigate = useNavigate();
  const groupRef = useRef<THREE.Group>(null);
  const clothRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const [hovered, setHovered] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const handleClick = useCallback(() => {
    if (interactive) {
      navigate(route);
    }
  }, [interactive, navigate, route]);

  // Generate a procedural fabric bump map
  const fabricBump = useMemo(() => {
    const tex = generateNoiseTexture(256);
    tex.repeat.set(8, 6);
    return tex;
  }, []);

  useFrame(({ clock }) => {
    const progress = missionState.smoothProgress;
    const time = clock.getElapsedTime();

    // Interactive when scroll > 0.82
    const isInteractive = progress > 0.82;
    setInteractive(isInteractive);
    missionState.flagsInteractive = isInteractive;

    // Flag visibility (fade in from 0.70)
    if (groupRef.current) {
      const flagOpacity = progress > 0.7 ? Math.min(1, (progress - 0.7) / 0.15) : 0;
      groupRef.current.visible = flagOpacity > 0.01;
    }

    // Cloth wave animation
    if (clothRef.current) {
      const geo = clothRef.current.geometry;
      const positions = geo.attributes.position.array as Float32Array;
      const originalPositions = geo.userData.originalPositions as Float32Array | undefined;

      if (!originalPositions) {
        geo.userData.originalPositions = new Float32Array(positions);
      } else {
        for (let i = 0; i < positions.length; i += 3) {
          const x = originalPositions[i];
          const y = originalPositions[i + 1];
          // Wave displacement based on distance from pole (x position)
          const wave = Math.sin(time * 3 + x * 5) * 0.03 * Math.abs(x);
          const wave2 = Math.sin(time * 2.3 + x * 3 + y * 2) * 0.02 * Math.abs(x);
          positions[i + 2] = wave + wave2;
        }
        geo.attributes.position.needsUpdate = true;
      }
    }

    // Glow effect
    if (glowRef.current) {
      const baseIntensity = isInteractive ? 1.0 : 0.2;
      const hoverBoost = hovered ? 1.5 : 0;
      glowRef.current.intensity = baseIntensity + hoverBoost;
    }
  });

  return (
    <group ref={groupRef} position={[position.x, 0.3, position.z]}>
      {/* Base / Mount */}
      <mesh position={[0, -0.25, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 0.1, 16]} />
        <meshStandardMaterial color="#333" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Main Pole */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.025, 3.2, 16]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Horizontal Crossbar (Apollo style) */}
      <mesh position={[0.3, 2.8, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 8]} />
        <meshStandardMaterial color="#c0c0c0" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Cloth flag */}
      <mesh
        ref={clothRef}
        position={[0.3, 2.55, 0]}
        castShadow
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <planeGeometry args={[0.6, 0.5, 10, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={hovered ? 0.2 : 0}
          bumpMap={fabricBump}
          bumpScale={0.04}
          side={THREE.DoubleSide}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Glow light */}
      <pointLight
        ref={glowRef}
        position={[0.3, 2.55, 0]}
        color={emissiveColor}
        intensity={0.5}
        distance={5}
      />

      {/* Interactive HTML button label */}
      {interactive && (
        <Html center position={[0.3, 3.1, 0]} distanceFactor={10}>
          <button
            className={`flag-label ${className}`}
            onClick={handleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ cursor: 'pointer' }}
          >
            {label}
          </button>
        </Html>
      )}
    </group>
  );
}

export function MissionFlags() {
  return (
    <>
      <Flag
        position={FLAG_POSITIONS.earth}
        color="#0055ff" // Blue
        emissiveColor="#4488ff"
        label="EXPLORE EARTH"
        route="/earth"
        className="earth"
      />
      <Flag
        position={FLAG_POSITIONS.alert}
        color="#ffcc00" // Yellow
        emissiveColor="#ffdd44"
        label="VIEW ALERTS"
        route="/alert"
        className="alert"
      />
    </>
  );
}

export default MissionFlags;
