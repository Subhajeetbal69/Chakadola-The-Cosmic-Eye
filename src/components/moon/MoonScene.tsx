import MoonTerrain from './MoonTerrain';
import Rover from './Rover';
import MissionCamera from './MissionCamera';
import Craters from './Crater';
import DiscoveryMarkers from './DiscoveryMarker';
import MissionFlags from './MissionFlag';
import Stars from './Stars';

/**
 * MoonScene — top-level R3F scene that sets up lighting
 * and contains all 3D children.
 */
export function MoonScene() {
  return (
    <>
      {/* Camera controller */}
      <MissionCamera />

      {/* Lighting */}
      {/* Sun — strong directional light */}
      <directionalLight
        position={[50, 80, 30]}
        intensity={1.8}
        color="#f0eee6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={200}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-bias={-0.001}
      />

      {/* Ambient — subtle fill */}
      <ambientLight intensity={0.15} color="#4a5a8a" />

      {/* Hemisphere light */}
      <hemisphereLight
        args={['#2a3060', '#1a1a1a', 0.3]}
      />

      {/* Rim light */}
      <directionalLight
        position={[-30, 20, -60]}
        intensity={0.8}
        color="#8ab4ff"
      />

      {/* Fog for depth */}
      <fog attach="fog" args={['#0a0a12', 60, 180]} />

      {/* Scene elements */}
      <Stars />
      <MoonTerrain />
      <Rover />
      <Craters />
      <DiscoveryMarkers />
      <MissionFlags />
    </>
  );
}

export default MoonScene;
