import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import missionState from '../../stores/missionStore';
import { getRoverState } from './RoverPath';

/**
 * MissionCamera — Hero cinematic follow camera.
 * Positions closely and heroically behind the Rover, framing its chassis,
 * mast, and wheels as the prominent main subject of the scene.
 */
export function MissionCamera() {
  const { camera, size } = useThree();
  const currentPos = useRef(new THREE.Vector3(0, 3.6, 7.8));
  const currentLookAt = useRef(new THREE.Vector3(0, 1.2, 0));

  useFrame(() => {
    const progress = missionState.smoothProgress;
    const { position: roverPos } = getRoverState(progress);

    // Dynamic adaptation for portrait mobile screens vs landscape/desktop
    const aspect = size.width / Math.max(1, size.height);
    const isPortrait = aspect < 1.0;
    
    // Scale distance and height dynamically for narrow mobile viewports
    const portraitScale = isPortrait ? Math.min(2.2, 1.0 / aspect) : 1.0;
    const droneAltitude = 3.6 * (isPortrait ? Math.min(1.8, 1.2 * portraitScale) : 1.0);
    const zOffset = 7.8 * (isPortrait ? Math.min(2.0, 1.15 * portraitScale) : 1.0);

    // Target camera position: elevated and positioned behind the rover
    const targetPos = new THREE.Vector3(
      roverPos.x,
      roverPos.y + droneAltitude,
      roverPos.z + zOffset
    );

    // Target look-at focused in front of the rover towards the lunar horizon
    const targetLookAt = new THREE.Vector3(
      roverPos.x,
      roverPos.y + (isPortrait ? 0.8 : 0.6),
      roverPos.z - (isPortrait ? 2.5 : 4.5)
    );

    // Smooth follow interpolation
    const smoothFactor = 0.08;
    currentPos.current.lerp(targetPos, smoothFactor);
    currentLookAt.current.lerp(targetLookAt, smoothFactor);

    // Apply to camera
    camera.position.copy(currentPos.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

export default MissionCamera;
