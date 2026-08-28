import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import missionState from '../../stores/missionStore';
import { getRoverState } from './RoverPath';

/**
 * MissionCamera — Drone-style follow camera.
 * Captures from the top of the rover. It moves with the rover on X and Z axes
 * but its Y altitude remains fixed for smooth cinematics.
 */
export function MissionCamera() {
  const { camera } = useThree();
  const currentPos = useRef(new THREE.Vector3(0, 15, 5));
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    const progress = missionState.smoothProgress;
    const { position: roverPos } = getRoverState(progress);

    // Drone flight altitude (fixed)
    const droneAltitude = 4; 

    // Target camera position: 20-degree low angle view
    const targetPos = new THREE.Vector3(
      roverPos.x,
      droneAltitude,
      roverPos.z + 11
    );

    // Target look-at
    const targetLookAt = new THREE.Vector3(
      roverPos.x,
      0,
      roverPos.z
    );

    // Smooth follow interpolation
    const smoothFactor = 0.06;
    currentPos.current.lerp(targetPos, smoothFactor);
    currentLookAt.current.lerp(targetLookAt, smoothFactor);

    // Apply to camera
    camera.position.copy(currentPos.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

export default MissionCamera;
