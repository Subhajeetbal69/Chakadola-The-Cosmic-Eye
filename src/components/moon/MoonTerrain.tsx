import { useRef, useMemo, useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { CRATER_POSITIONS } from './RoverPath';
import { getTerrainHeight } from '../../utils/terrainMath';
import { generateNoiseTexture } from '../../utils/textureGenerator';

/**
 * MoonTerrain — procedural lunar terrain with carved craters and scattered rocks.
 * Uses CPU-side vertex displacement for the terrain plane.
 */
export function MoonTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);

  // Load the realistic photographic moon texture with maximum sharpness and anisotropic filtering
  const albedoTexture = useLoader(THREE.TextureLoader, '/moon_texture.jpg') as THREE.Texture;
  albedoTexture.wrapS = THREE.RepeatWrapping;
  albedoTexture.wrapT = THREE.RepeatWrapping;
  albedoTexture.repeat.set(24, 24); // Fine tiling for razor-sharp micro detail
  albedoTexture.colorSpace = THREE.SRGBColorSpace;
  albedoTexture.anisotropy = 16; // Fixes grazing angle stretching & blurring
  albedoTexture.minFilter = THREE.LinearMipmapLinearFilter;
  albedoTexture.magFilter = THREE.LinearFilter;
  albedoTexture.generateMipmaps = true;
  albedoTexture.needsUpdate = true;

  // Generate terrain geometry with displacement
  const geometry = useMemo(() => {
    // 400x400 segments for high resolution crater edges
    const geo = new THREE.PlaneGeometry(200, 200, 400, 400);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position.array;

    // Small craters for surface detail (seeded to avoid path)
    const smallCraters = [];
    let seed = 12345;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 60; i++) {
      if (smallCraters.length >= 30) break;
      const x = (random() - 0.5) * 160;
      const z = (random() - 0.5) * 160;
      
      // Prevent small craters on rover path
      if (x > -15 && x < 18 && z > -90 && z < 10) {
        continue;
      }

      smallCraters.push({
        x,
        z,
        radius: 1 + random() * 3,
        depth: 0.3 + random() * 0.6,
      });
    }

    const allCraters = [...CRATER_POSITIONS, ...smallCraters];

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];

      positions[i + 1] = getTerrainHeight(x, z, allCraters);
    }

    geo.computeVertexNormals();
    return geo;
  }, []);

  // Rock instances
  const rockData = useMemo(() => {
    const rocks = [];
    for (let i = 0; i < 150; i++) {
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;

      // Don't place rocks on the rover path
      const pathDist = Math.abs(x);
      if (pathDist < 3 && z > -90 && z < 10) continue;

      // Don't place rocks inside main craters
      let inCrater = false;
      for (const c of CRATER_POSITIONS) {
        const dx = x - c.x;
        const dz = z - c.z;
        if (Math.sqrt(dx * dx + dz * dz) < c.radius * 0.8) {
          inCrater = true;
          break;
        }
      }
      if (inCrater) continue;

      const scale = 0.1 + Math.random() * 0.5;
      const rotY = Math.random() * Math.PI * 2;

      const terrainY = getTerrainHeight(x, z, CRATER_POSITIONS);

      rocks.push({ x, y: terrainY, z, scale, rotY });
    }
    return rocks;
  }, []);

  const rockGeometry = useMemo(() => {
    // Irregular rock shape
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] *= 0.7 + Math.random() * 0.6;
      pos[i + 1] *= 0.5 + Math.random() * 0.5;
      pos[i + 2] *= 0.7 + Math.random() * 0.6;
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const rockMeshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!rockMeshRef.current || rockData.length === 0) return;
    const dummy = new THREE.Object3D();
    rockData.forEach((rock, i) => {
      dummy.position.set(rock.x, rock.y - 0.1, rock.z);
      dummy.rotation.set(0, rock.rotY, 0);
      dummy.scale.setScalar(rock.scale);
      dummy.updateMatrix();
      rockMeshRef.current.setMatrixAt(i, dummy.matrix);
    });
    rockMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [rockData]);

  const bumpTexture = useMemo(() => {
    const tex = generateNoiseTexture(1024);
    tex.repeat.set(50, 50);
    return tex;
  }, []);

  return (
    <group>
      {/* Main terrain */}
      <mesh ref={meshRef} geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color="#d0d0d0"
          roughness={0.95}
          metalness={0.02}
          map={albedoTexture}
          bumpMap={bumpTexture}
          bumpScale={0.03}
          flatShading={false}
        />
      </mesh>

      {/* Instanced rocks */}
      <instancedMesh
        ref={rockMeshRef}
        args={[rockGeometry, undefined as any, rockData.length]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#6b6b6b"
          roughness={0.95}
          metalness={0.02}
          flatShading={true}
        />
      </instancedMesh>
    </group>
  );
}

export default MoonTerrain;
