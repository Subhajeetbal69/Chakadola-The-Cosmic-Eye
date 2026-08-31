import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import missionState from '../../stores/missionStore';
import { getFastRoverState, PATH_LENGTH } from './RoverPath';
import { generateNoiseTexture } from '../../utils/textureGenerator';

/**
 * Rover — procedural highly realistic lunar rover built from Three.js primitives.
 * Features Rocker-Bogie suspension, camera mast, RTG, and detailed chassis.
 * Uses precomputed terrain physics for 0-overhead performance.
 */
export function Rover() {
  const groupRef = useRef<THREE.Group>(null);
  const wheelsRef = useRef<(THREE.Mesh | null)[]>([]);
  const headlightRef = useRef<THREE.SpotLight>(null);
  const scannerRef = useRef<THREE.PointLight>(null);
  const prevProgress = useRef<number>(0);
  const totalWheelRotation = useRef<number>(0);

  // Track wheel refs
  const setWheelRef = (index: number) => (el: THREE.Mesh | null) => {
    if (el) wheelsRef.current[index] = el;
  };

  // Generate realistic textures
  const { bodyTexture, wheelTexture, goldTexture } = useMemo(() => {
    // Body metal noise
    const bt = generateNoiseTexture(256);
    bt.repeat.set(2, 2);
    
    // Wheel tread noise
    const wt = generateNoiseTexture(128);
    wt.repeat.set(10, 2);

    // Gold foil noise
    const gt = generateNoiseTexture(128);
    gt.repeat.set(4, 4);

    return { bodyTexture: bt, wheelTexture: wt, goldTexture: gt };
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    const progress = missionState.smoothProgress;
    
    // Fast precomputed physics lookup
    const fastState = getFastRoverState(progress);

    // Calculate wheel rotation based on distance traveled
    const delta = progress - prevProgress.current;
    const distanceDelta = Math.abs(delta) * PATH_LENGTH;
    totalWheelRotation.current += distanceDelta * 2 * Math.sign(delta || 1);
    prevProgress.current = progress;

    // Apply precomputed position and rotation
    groupRef.current.position.set(fastState.x, fastState.y + 0.36, fastState.z);
    groupRef.current.rotation.set(fastState.pitch, fastState.angle, fastState.roll, 'YXZ');

    // Suspension dynamics (bounce and jitter based on movement)
    const time = clock.getElapsedTime();
    const isMoving = Math.abs(missionState.scrollVelocity) > 0.001;
    
    if (isMoving) {
      groupRef.current.position.y += Math.sin(time * 12) * 0.01;
      groupRef.current.rotation.z += Math.sin(time * 8) * 0.005;
      groupRef.current.rotation.x += Math.sin(time * 10) * 0.003;
    }

    // Rotate wheels
    wheelsRef.current.forEach((wheel) => {
      if (wheel) wheel.rotation.x = totalWheelRotation.current;
    });

    // Scanner / Camera active lights
    if (scannerRef.current) {
      scannerRef.current.intensity = 0.5 + (Math.sin(time * 4) + 1) * 0.5;
    }
  });

  // Materials
  const materials = useMemo(() => ({
    bodyWhite: new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.8, metalness: 0.1, bumpMap: bodyTexture, bumpScale: 0.02 }),
    metalDark: new THREE.MeshStandardMaterial({ color: "#222222", roughness: 0.6, metalness: 0.6 }),
    metalLight: new THREE.MeshStandardMaterial({ color: "#888888", roughness: 0.4, metalness: 0.8 }),
    goldFoil: new THREE.MeshStandardMaterial({ color: "#cca633", roughness: 0.3, metalness: 0.9, bumpMap: goldTexture, bumpScale: 0.05 }),
    wheel: new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.9, metalness: 0.2, bumpMap: wheelTexture, bumpScale: 0.1 }),
    lens: new THREE.MeshStandardMaterial({ color: "#001133", roughness: 0.1, metalness: 0.9, envMapIntensity: 2 }),
  }), [bodyTexture, goldTexture, wheelTexture]);

  return (
    <group ref={groupRef} scale={[1.8, 1.8, 1.8]}>
      
      {/* --- CHASSIS (MAIN BODY) --- */}
      <group position={[0, 0.4, 0]}>
        {/* Main box */}
        <mesh castShadow receiveShadow material={materials.bodyWhite}>
          <boxGeometry args={[0.9, 0.35, 1.2]} />
        </mesh>
        
        {/* Angled front plate (Glacis) */}
        <mesh position={[0, -0.05, 0.65]} rotation={[-0.4, 0, 0]} castShadow material={materials.bodyWhite}>
          <boxGeometry args={[0.9, 0.4, 0.3]} />
        </mesh>

        {/* Top deck details */}
        <mesh position={[0, 0.2, -0.2]} castShadow material={materials.goldFoil}>
          <boxGeometry args={[0.6, 0.05, 0.6]} />
        </mesh>
        <mesh position={[0.2, 0.2, 0.2]} castShadow material={materials.metalDark}>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 16]} />
        </mesh>
        <mesh position={[-0.2, 0.2, 0.3]} castShadow material={materials.metalDark}>
          <boxGeometry args={[0.2, 0.1, 0.2]} />
        </mesh>

        {/* RTG (Radioisotope Thermoelectric Generator) on the back */}
        <group position={[0, 0.1, -0.75]} rotation={[0.2, 0, 0]}>
          <mesh castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.15, 0.15, 0.4, 16]} />
          </mesh>
          <mesh position={[0, 0, 0]} castShadow material={materials.goldFoil}>
            <cylinderGeometry args={[0.16, 0.16, 0.1, 16]} />
          </mesh>
          <mesh position={[0, 0.2, 0]} castShadow material={materials.metalLight}>
            <boxGeometry args={[0.1, 0.05, 0.1]} />
          </mesh>
        </group>
      </group>

      {/* --- CAMERA MAST (HEAD & NECK) --- */}
      <group position={[0.3, 0.6, 0.45]}>
        {/* Neck */}
        <mesh castShadow material={materials.bodyWhite}>
          <cylinderGeometry args={[0.03, 0.04, 0.6, 16]} />
        </mesh>
        
        {/* Head Base */}
        <group position={[0, 0.35, 0]}>
          <mesh castShadow material={materials.bodyWhite}>
            <boxGeometry args={[0.25, 0.12, 0.15]} />
          </mesh>
          
          {/* Stereo Cameras (Eyes) */}
          <mesh position={[-0.08, 0, 0.08]} rotation={[Math.PI/2, 0, 0]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.03, 0.03, 0.05, 16]} />
          </mesh>
          <mesh position={[0.08, 0, 0.08]} rotation={[Math.PI/2, 0, 0]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.03, 0.03, 0.05, 16]} />
          </mesh>
          <mesh position={[-0.08, 0, 0.1]} castShadow material={materials.lens}>
            <circleGeometry args={[0.02, 16]} />
          </mesh>
          <mesh position={[0.08, 0, 0.1]} castShadow material={materials.lens}>
            <circleGeometry args={[0.02, 16]} />
          </mesh>

          {/* SuperCam / Laser box on top */}
          <mesh position={[0, 0.1, 0]} castShadow material={materials.bodyWhite}>
            <boxGeometry args={[0.15, 0.08, 0.18]} />
          </mesh>
          <mesh position={[0, 0.1, 0.09]} castShadow material={materials.lens}>
            <circleGeometry args={[0.03, 16]} />
          </mesh>
        </group>
      </group>

      {/* --- ROCKER-BOGIE SUSPENSION & WHEELS --- */}
      {[1, -1].map((side, i) => (
        <group key={i} position={[side * 0.55, 0, 0]}>
          
          {/* Main differential pivot attached to body */}
          <mesh position={[0, 0.3, 0]} rotation={[0, 0, Math.PI/2]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.06, 0.06, 0.15, 16]} />
          </mesh>

          {/* Rocker Arm (Connects pivot to front wheel and back bogie) */}
          <mesh position={[0, 0.25, 0.25]} rotation={[0.4, 0, 0]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
          </mesh>
          <mesh position={[0, 0.25, -0.2]} rotation={[-0.4, 0, 0]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.03, 0.03, 0.5, 8]} />
          </mesh>

          {/* Bogie Pivot */}
          <mesh position={[0, 0.15, -0.4]} rotation={[0, 0, Math.PI/2]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
          </mesh>

          {/* Bogie Arm (Connects middle and rear wheels) */}
          <mesh position={[0, 0.15, -0.4]} rotation={[Math.PI/2, 0, 0]} castShadow material={materials.metalDark}>
            <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
          </mesh>

          {/* Wheel Mounts (Steering actuators) */}
          <mesh position={[0, 0.1, 0.5]} castShadow material={materials.metalLight}>
            <cylinderGeometry args={[0.04, 0.04, 0.15, 12]} />
          </mesh>
          <mesh position={[0, 0.1, -0.05]} castShadow material={materials.metalLight}>
            <cylinderGeometry args={[0.04, 0.04, 0.15, 12]} />
          </mesh>
          <mesh position={[0, 0.1, -0.75]} castShadow material={materials.metalLight}>
            <cylinderGeometry args={[0.04, 0.04, 0.15, 12]} />
          </mesh>

          {/* Wheels */}
          {/* Front Wheel */}
          <mesh ref={setWheelRef(i * 3 + 0)} position={[0, 0, 0.5]} rotation={[0, 0, Math.PI/2]} castShadow material={materials.wheel}>
            <cylinderGeometry args={[0.2, 0.2, 0.22, 24]} />
          </mesh>
          {/* Middle Wheel */}
          <mesh ref={setWheelRef(i * 3 + 1)} position={[0, 0, -0.05]} rotation={[0, 0, Math.PI/2]} castShadow material={materials.wheel}>
            <cylinderGeometry args={[0.2, 0.2, 0.22, 24]} />
          </mesh>
          {/* Back Wheel */}
          <mesh ref={setWheelRef(i * 3 + 2)} position={[0, 0, -0.75]} rotation={[0, 0, Math.PI/2]} castShadow material={materials.wheel}>
            <cylinderGeometry args={[0.2, 0.2, 0.22, 24]} />
          </mesh>
        </group>
      ))}

      {/* --- LIGHTS --- */}
      {/* Main Headlight */}
      <spotLight
        ref={headlightRef}
        position={[0.3, 0.95, 0.6]}
        target-position={[0.3, 0, 10]}
        angle={0.5}
        penumbra={0.3}
        intensity={2.5}
        color="#ffffff"
        distance={25}
        castShadow={false}
      />
      
      {/* Scanner laser effect */}
      <pointLight
        ref={scannerRef}
        position={[0.3, 0.95, 0.6]}
        intensity={0}
        color="#ff3333"
        distance={4}
      />
    </group>
  );
}

export default Rover;
