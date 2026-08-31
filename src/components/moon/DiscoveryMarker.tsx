import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import missionState from '../../stores/missionStore';
import { CRATER_POSITIONS } from './RoverPath';

/**
 * DiscoveryMarker — floating scan UI that appears near craters.
 * Shows "CRATER DETECTED" → "SCANNING..." → "ANALYSIS COMPLETE"
 */
interface SingleDiscoveryProps {
  position: { x: number; z: number };
  triggerProgress: number;
  craterIndex: number;
}

function SingleDiscovery({ position, triggerProgress, craterIndex }: SingleDiscoveryProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [phase, setPhase] = useState<'hidden' | 'detected' | 'scanning' | 'complete'>('hidden');
  const [opacity, setOpacity] = useState(0);

  useFrame(() => {
    const progress = missionState.smoothProgress;
    const dist = progress - triggerProgress;

    if (dist < -0.04) {
      setPhase('hidden');
      setOpacity(0);
    } else if (dist < 0) {
      setPhase('detected');
      const t = (dist + 0.04) / 0.04;
      setOpacity(Math.min(1, t));
    } else if (dist < 0.04) {
      setPhase('scanning');
      setOpacity(1);
    } else if (dist < 0.10) {
      setPhase('complete');
      const fadeT = (dist - 0.04) / 0.06;
      setOpacity(Math.max(0, 1 - fadeT));
    } else {
      setPhase('hidden');
      setOpacity(0);
    }
  });

  if (opacity <= 0.01) return null;

  const messages: Record<string, string> = {
    hidden: '',
    detected: 'CRATER DETECTED',
    scanning: 'SCANNING...',
    complete: 'ANALYSIS COMPLETE',
  };

  const subMessages: Record<string, string> = {
    hidden: '',
    detected: 'UNKNOWN GEOLOGICAL FORMATION',
    scanning: `CRATER ${craterIndex + 1} — COLLECTING DATA`,
    complete: 'DATA RECORDED',
  };

  return (
    <group ref={groupRef} position={[position.x, 4, position.z]}>
      <Html center distanceFactor={15} style={{ pointerEvents: 'none' }}>
        <div style={{
          opacity,
          transition: 'opacity 0.3s ease',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          <div style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            color: '#00e5ff',
            textTransform: 'uppercase',
            textShadow: '0 0 20px rgba(0, 229, 255, 0.5)',
            marginBottom: '6px',
          }}>
            {messages[phase]}
          </div>
          <div style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: '8px',
            fontWeight: 400,
            letterSpacing: '0.25em',
            color: '#8a8fa8',
            textTransform: 'uppercase',
          }}>
            {subMessages[phase]}
          </div>
        </div>
      </Html>
    </group>
  );
}

export function DiscoveryMarkers() {
  return (
    <>
      <SingleDiscovery
        position={CRATER_POSITIONS[0]}
        triggerProgress={0.35}
        craterIndex={0}
      />
      <SingleDiscovery
        position={CRATER_POSITIONS[1]}
        triggerProgress={0.60}
        craterIndex={1}
      />
    </>
  );
}

export default DiscoveryMarkers;
