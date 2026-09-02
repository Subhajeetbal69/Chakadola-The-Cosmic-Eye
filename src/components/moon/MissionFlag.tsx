import { useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import missionState from '../../stores/missionStore';
import { FLAG_POSITIONS } from './RoverPath';

/**
 * MissionFlags — interactive destination waypoint cards.
 * Two destination waypoints: Earth (cyan/blue) and Alert (gold/yellow).
 */
interface FlagProps {
  position: { x: number; z: number };
  label: string;
  route: string;
  className: string;
}

function Flag({ position, label, route, className }: FlagProps) {
  const navigate = useNavigate();
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const handleClick = useCallback((e?: any) => {
    if (e) {
      e.stopPropagation?.();
      e.preventDefault?.();
    }
    navigate(route);
  }, [navigate, route]);

  useFrame(() => {
    const progress = missionState.smoothProgress;

    // Interactive when scroll > 0.80
    const isInteractive = progress > 0.80;
    if (isInteractive !== interactive) {
      setInteractive(isInteractive);
      missionState.flagsInteractive = isInteractive;
    }

    // Waypoint visibility (fade in from 0.70)
    if (groupRef.current) {
      const flagOpacity = progress > 0.7 ? Math.min(1, (progress - 0.7) / 0.15) : 0;
      groupRef.current.visible = flagOpacity > 0.01;
    }
  });

  return (
    <group ref={groupRef} position={[position.x, 0.3, position.z]}>
      {/* Interactive HTML button label */}
      {interactive && (
        <Html center position={[0, 2.8, 0]} distanceFactor={10} zIndexRange={[100, 0]} style={{ pointerEvents: 'auto' }}>
          <button
            className={`flag-label ${className}`}
            onClick={handleClick}
            onPointerDown={handleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ cursor: 'pointer', pointerEvents: 'auto' }}
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
        label="EXPLORE EARTH"
        route="/earth"
        className="earth"
      />
      <Flag
        position={FLAG_POSITIONS.alert}
        label="VIEW ALERTS"
        route="/alert"
        className="alert"
      />
    </>
  );
}

export default MissionFlags;
