import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrollController from '../components/moon/ScrollController';
import MoonScene from '../components/moon/MoonScene';
import MissionHUD from '../components/moon/MissionHUD';
import LoadingScreen from '../components/moon/LoadingScreen';
import missionState from '../stores/missionStore';
import { useTelemetry } from '../context/TelemetryContext';
import { NavPill } from '../components/NavPill';
import './MissionBanner.css';

/**
 * SectionText — dynamic text transitions triggered by scroll progress.
 */
function SectionText() {
  const [currentSection, setCurrentSection] = useState('hero');
  const [opacity, setOpacity] = useState(1);
  const [blurPx, setBlurPx] = useState(14);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      const p = missionState.smoothProgress;

      if (p < 0.07) {
        setCurrentSection('hero');
        const factor = Math.max(0, 1 - p / 0.05);
        setOpacity(factor);
        setBlurPx(factor * 14);
      } else if (p > 0.08 && p < 0.22) {
        setCurrentSection('journey');
        const fadeIn = Math.min(1, (p - 0.08) / 0.03);
        const fadeOut = Math.min(1, (0.22 - p) / 0.03);
        setOpacity(Math.min(fadeIn, fadeOut));
        setBlurPx(0);
      } else if (p >= 0.95 && p <= 1.0) {
        setCurrentSection('final');
        const fadeIn = Math.min(1, (p - 0.95) / 0.03);
        setOpacity(fadeIn);
        setBlurPx(0);
      } else {
        setOpacity(0);
        setBlurPx(0);
      }

      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (opacity < 0.01) return null;

  const sections: Record<string, React.ReactNode> = {
    hero: (
      <div
        className="hero-overlay"
        style={{
          opacity,
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
          backgroundColor: `rgba(6, 8, 16, ${opacity * 0.52})`,
          touchAction: 'pan-y',
        }}
      >
        <div className="hero-tagline">
        </div>
        <h1 className="hero-title">
          BEGIN THE<br />MISSION
        </h1>
        <p className="hero-description">
          Explore the unknown. Scroll or swipe to guide the rover across the lunar surface and uncover what waits at the far site.
        </p>
      </div>
    ),
    journey: (
      <div className="section-text bottom-center" style={{ opacity, touchAction: 'pan-y' }}>
        <div className="hero-subtitle" style={{ fontSize: 'clamp(0.5rem, 1vw, 0.7rem)' }}>
          THE JOURNEY BEGINS
        </div>
      </div>
    ),
    final: (
      <div
        className="section-text pointer-events-none"
        style={{
          opacity,
          position: 'fixed',
          bottom: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          touchAction: 'pan-y',
          transition: 'opacity 0.3s ease',
        }}
      >
        <div className="banner" role="button" tabIndex={0} aria-label="Mission Discovery — Choose your mission destination">
          <span className="corner tl"></span>
          <span className="corner tr"></span>
          <span className="corner bl"></span>
          <span className="corner br"></span>
          <span className="banner-title">Mission Discovery</span>
          <span className="banner-sub">Choose your mission destination</span>
        </div>
      </div>
    ),
  };

  return sections[currentSection] || null;
}

/**
 * ScrollIndicator — shows bouncing line on intro screen.
 */
function ScrollIndicator() {
  const [opacity, setOpacity] = useState(1);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      const p = missionState.smoothProgress;
      setOpacity(p < 0.05 ? 1 - p / 0.05 : 0);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (opacity < 0.01) return null;

  return (
    <div className="scroll-indicator" style={{ opacity, touchAction: 'pan-y' }}>
      <div className="scroll-indicator-text">Scroll or Swipe to Explore</div>
      <div className="scroll-indicator-line" />
    </div>
  );
}

/**
 * HomeNavbar — floating aerospace top dock for fast jumping between pages.
 */
function HomeNavbar() {
  const { conjunctions } = useTelemetry();
  const conjCount = conjunctions.length;

  return (
    <div className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <NavPill conjCount={conjCount} />
    </div>
  );
}

/**
 * HomePage — the immersive 3D Moon Rover exploration experience.
 */
export function HomePage() {
  return (
    <ScrollController>
      {/* Floating Aerospace Navigation Dock */}
      <HomeNavbar />

      {/* Fixed 3D Canvas */}
      <div className="canvas-container">
        <Canvas
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 2]}
          camera={{ position: [0, 4.2, 8.5], fov: 48, near: 0.1, far: 1000 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
          }}
          style={{ background: '#0a0a0f', touchAction: 'pan-y' }}
        >
          <MoonScene />
        </Canvas>
      </div>

      {/* Loading Screen */}
      <LoadingScreen onLoaded={() => ScrollTrigger.refresh()} />

      {/* HTML Overlays */}
      <SectionText />
      <ScrollIndicator />
      <MissionHUD />
    </ScrollController>
  );
}

export default HomePage;
