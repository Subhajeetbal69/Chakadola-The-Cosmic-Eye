/**
 * Mission Store — shared refs for scroll-driven state.
 * Uses plain object refs (no React state) to avoid re-renders.
 * 3D components read these in useFrame for 60fps updates.
 */

export interface MissionState {
  scrollProgress: number;
  smoothProgress: number;
  scrollVelocity: number;
  isLoaded: boolean;
  crater1Discovered: boolean;
  crater2Discovered: boolean;
  flagsInteractive: boolean;
}

const missionState: MissionState = {
  // Scroll progress 0 → 1
  scrollProgress: 0,
  // Smoothed scroll progress (lerped)
  smoothProgress: 0,
  // Scroll velocity for optional effects
  scrollVelocity: 0,
  // Whether loading is complete
  isLoaded: false,
  // Discovery states
  crater1Discovered: false,
  crater2Discovered: false,
  // Flag interaction
  flagsInteractive: false,
};

export default missionState;
