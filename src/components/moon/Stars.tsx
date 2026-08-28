import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Stars — background starfield using Points geometry.
 * Enhanced to look like a cosmos/galaxy with varying colors, sizes, and clusters.
 */
export function Stars() {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors, sizes } = useMemo(() => {
    const count = 5000;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const radius = 500;
    const colorObj = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Create a galactic band
      const isGalaxy = Math.random() > 0.6;
      let theta: number, phi: number;

      if (isGalaxy) {
        // Cluster in a band across the sky
        theta = (Math.random() - 0.5) * Math.PI * 2;
        phi = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      } else {
        // Uniform distribution
        theta = Math.random() * Math.PI * 2;
        phi = Math.acos(2 * Math.random() - 1);
      }

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(radius * Math.sin(phi) * Math.sin(theta));
      pos[i * 3 + 2] = radius * Math.cos(phi);

      // Colors
      const colorRand = Math.random();
      if (colorRand > 0.9) colorObj.setHex(0xffaa88);
      else if (colorRand > 0.6) colorObj.setHex(0x88ccff);
      else if (isGalaxy && colorRand > 0.4) colorObj.setHex(0x6644aa);
      else colorObj.setHex(0xffffff);

      col[i * 3] = colorObj.r;
      col[i * 3 + 1] = colorObj.g;
      col[i * 3 + 2] = colorObj.b;

      sz[i] = isGalaxy ? (0.5 + Math.random() * 2) : (0.2 + Math.random() * 1.5);
    }

    return { positions: pos, colors: col, sizes: sz };
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const time = clock.getElapsedTime();
    const sizeAttr = pointsRef.current.geometry.attributes.size as THREE.BufferAttribute;
    if (!sizeAttr) return;
    const baseSize = sizes;

    for (let i = 0; i < sizeAttr.count; i++) {
      if (i % 7 === 0) {
        const twinkle = Math.sin(time * 1.2 + i * 0.5) * 0.4 + 0.6;
        sizeAttr.array[i] = baseSize[i] * twinkle;
      }
    }
    sizeAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={colors.length / 3} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={sizes.length} array={sizes} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={1.2}
        sizeAttenuation={true}
        transparent={true}
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default Stars;
