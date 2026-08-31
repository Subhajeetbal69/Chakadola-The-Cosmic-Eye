import { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_RADIUS } from '../../utils/orbitalMath';

/**
 * High-fidelity realistic Earth model with atmosphere, clouds, and day/night transitions.
 * Uses MeshPhongMaterial with onBeforeCompile to inject night lights into the
 * standard Phong shader on the dark hemisphere.
 */
interface RealisticEarthProps {
  simSpeedMultiplier?: number;
}

export function RealisticEarth({ simSpeedMultiplier = 60 }: RealisticEarthProps) {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);

  // Load high-resolution textures from local public directory
  const [
    colorMap,
    bumpMap,
    specularMap,
    cloudsMap,
    nightMap
  ] = useLoader(THREE.TextureLoader, [
    '/textures/earth-blue-marble.webp',
    '/textures/earth-topology.webp',
    '/textures/earth-water.webp',
    '/textures/earth-clouds.webp',
    '/textures/earth-lights.webp'
  ]);

  // Configure color space for realistic rendering
  colorMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.colorSpace = THREE.SRGBColorSpace;

  // Sun direction matching the directionalLight position in EarthScene.tsx
  const sunDirection = useMemo(() => new THREE.Vector3(50, 10, -20).normalize(), []);

  // Create MeshPhongMaterial with injected night lights via onBeforeCompile
  const earthMaterial = useMemo(() => {
    const mat = new THREE.MeshPhongMaterial({
      map: colorMap,
      bumpMap: bumpMap,
      bumpScale: 0.12,
      specularMap: specularMap,
      specular: new THREE.Color('grey'),
      shininess: 15,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNightMap = { value: nightMap };
      shader.uniforms.uSunDirection = { value: sunDirection };

      // --- VERTEX SHADER MODIFICATIONS ---
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `varying vec3 vWorldNormal;
        void main() {`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

      // --- FRAGMENT SHADER MODIFICATIONS ---
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `uniform sampler2D uNightMap;
        uniform vec3 uSunDirection;
        varying vec3 vWorldNormal;
        void main() {`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `// --- Night Lights ---
        {
          vec3 nlNormal = normalize(vWorldNormal);
          vec3 nlSunDir = normalize(uSunDirection);
          float nlDot = dot(nlNormal, nlSunDir);
          float nlNightFactor = smoothstep(0.15, -0.25, nlDot);
          vec4 nlColor = texture2D(uNightMap, vMapUv);
          gl_FragColor.rgb += nlColor.rgb * nlNightFactor * 1.5;
        }
        #include <dithering_fragment>`
      );
    };

    mat.customProgramCacheKey = () => 'earth-night-lights';
    return mat;
  }, [colorMap, bumpMap, specularMap, nightMap, sunDirection]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    // Dynamic Earth rotation that is clearly visible at 1x and scales up visibly with the speedometer (30x, 60x, 150x)
    const baseVisualRate = 0.015; // rad/sec baseline at 1x (~0.86 deg/s)
    const speedFactor = 1 + (simSpeedMultiplier - 1) * 0.35;
    const earthRotationDelta = baseVisualRate * speedFactor * dt;
    const cloudsRotationDelta = earthRotationDelta * 1.15; // subtle differential atmospheric drift

    if (earthRef.current) {
      earthRef.current.rotation.y += earthRotationDelta;
    }
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += cloudsRotationDelta;
    }
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y += earthRotationDelta;
    }
  });

  return (
    <group>
      {/* 1. Main Earth Sphere with custom day/night shader (optimized 64x64 segments) */}
      <mesh ref={earthRef} castShadow receiveShadow material={earthMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      </mesh>

      {/* 2. Cloud Layer (optimized 48x48 segments) */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[EARTH_RADIUS * 1.006, 48, 48]} />
        <meshPhongMaterial
          map={cloudsMap}
          transparent={true}
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Atmospheric Edge Glow (optimized 48x48 segments) */}
      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[EARTH_RADIUS * 1.02, 48, 48]} />
        <meshBasicMaterial
          color="#2255ff"
          transparent={true}
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export default RealisticEarth;

