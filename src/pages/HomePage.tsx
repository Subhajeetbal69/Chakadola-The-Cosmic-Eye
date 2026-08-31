import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import ScrollController from '../components/moon/ScrollController';
import MoonScene from '../components/moon/MoonScene';
import MissionHUD from '../components/moon/MissionHUD';
import LoadingScreen from '../components/moon/LoadingScreen';
import missionState from '../stores/missionStore';
import { useTelemetry } from '../context/TelemetryContext';
import { Globe, ShieldAlert, Radio } from 'lucide-react';
import { NavPill } from '../components/NavPill';

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
      } else if (p > 0.86 && p <= 1.0) {
        setCurrentSection('final');
        const fadeIn = Math.min(1, (p - 0.86) / 0.04);
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
        }}
      >
        <div className="hero-tagline">
        </div>
        <h1 className="hero-title">
          BEGIN THE<br />MISSION
        </h1>
        <p className="hero-description">
          Explore the unknown. Scroll to guide the rover across the lunar surface and uncover what waits at the far site.
        </p>
      </div>
    ),
    journey: (
      <div className="section-text bottom-center" style={{ opacity }}>
        <div className="hero-subtitle" style={{ fontSize: 'clamp(0.5rem, 1vw, 0.7rem)' }}>
          THE JOURNEY BEGINS
        </div>
      </div>
    ),
    final: (
      <div className="section-text center pointer-events-none" style={{ opacity }}>
        <div className="discovery-title" style={{ fontSize: 'clamp(0.75rem, 1.8vw, 1.15rem)' }}>
          MISSION DISCOVERY
        </div>
        <div className="discovery-subtitle text-xs text-slate-400 mt-1">
          Choose your mission destination
        </div>
        <div className="flex items-center justify-center gap-3 mt-4 flex-wrap pointer-events-auto">
          <Link
            to="/earth"
            className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 bg-cyan-600/90 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] border border-cyan-400/50 backdrop-blur-xl transition-all cursor-pointer"
            title="Explore 3D Earth tracking and orbital space debris"
          >
            <Globe className="w-4 h-4 text-cyan-200" />
            <span>Explore Earth</span>
          </Link>
          <Link
            to="/alert"
            className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 bg-red-600/90 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-400/50 backdrop-blur-xl transition-all cursor-pointer"
            title="View critical conjunction warnings and collision avoidance"
          >
            <ShieldAlert className="w-4 h-4 text-red-200" />
            <span>View Alerts</span>
          </Link>
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
    <div className="scroll-indicator" style={{ opacity }}>
      <div className="scroll-indicator-text">Scroll to Explore</div>
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
          style={{ background: '#0a0a0f' }}
        >
          <MoonScene />
        </Canvas>
      </div>

      {/* Loading Screen */}
      <LoadingScreen />

      {/* HTML Overlays */}
      <SectionText />
      <ScrollIndicator />
      <MissionHUD />
    </ScrollController>
  );
}

export default HomePage;
