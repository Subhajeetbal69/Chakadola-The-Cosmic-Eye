import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Link } from 'react-router-dom';
import ScrollController from '../components/moon/ScrollController';
import MoonScene from '../components/moon/MoonScene';
import MissionHUD from '../components/moon/MissionHUD';
import LoadingScreen from '../components/moon/LoadingScreen';
import missionState from '../stores/missionStore';
import { useTelemetry } from '../context/TelemetryContext';
import { Globe, ShieldAlert, Radio } from 'lucide-react';

/**
 * SectionText — dynamic text transitions triggered by scroll progress.
 */
function SectionText() {
  const [currentSection, setCurrentSection] = useState('hero');
  const [opacity, setOpacity] = useState(1);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      const p = missionState.smoothProgress;

      if (p < 0.05) {
        setCurrentSection('hero');
        setOpacity(1 - p / 0.05);
      } else if (p > 0.08 && p < 0.18) {
        setCurrentSection('journey');
        const fadeIn = Math.min(1, (p - 0.08) / 0.03);
        const fadeOut = Math.min(1, (0.18 - p) / 0.03);
        setOpacity(Math.min(fadeIn, fadeOut));
      } else if (p > 0.88 && p < 1.0) {
        setCurrentSection('final');
        const fadeIn = Math.min(1, (p - 0.88) / 0.04);
        setOpacity(fadeIn);
      } else {
        setOpacity(0);
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
      <div className="hero-overlay" style={{ opacity }}>
        <div className="hero-title">MISSION CONTROL</div>
        <div className="hero-subtitle">Lunar Exploration & Orbital Defense</div>
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
      <div className="section-text center" style={{ opacity }}>
        <div className="discovery-title" style={{ fontSize: 'clamp(0.7rem, 1.5vw, 1rem)' }}>
          MISSION DISCOVERY
        </div>
        <div className="discovery-subtitle">
          Choose your destination
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
  const { isWsConnected, conjunctions } = useTelemetry();
  const conjCount = conjunctions.length;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex items-center gap-2 p-1.5 bg-slate-900/70 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-1 text-xs font-mono font-bold text-cyan-400 border-r border-white/10">
        <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
        <span className="hidden sm:inline">MISSION 01</span>
      </div>

      <Link
        to="/earth"
        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-cyan-600/30 hover:border-cyan-400/50 border border-transparent text-slate-200 hover:text-white transition-all cursor-pointer"
        title="View 3D & 2D Earth satellite and space debris tracking"
      >
        <Globe className="w-3.5 h-3.5 text-cyan-400" />
        <span>Earth Tracking</span>
      </Link>

      <Link
        to="/alert"
        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-red-600/30 hover:border-red-400/50 border border-transparent text-slate-200 hover:text-white transition-all cursor-pointer relative"
        title="View conjunction warnings and AI collision avoidance center"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
        <span>Alert Center</span>
        {conjCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
            {conjCount}
          </span>
        )}
      </Link>

      <div className="hidden md:flex items-center gap-1.5 pl-2 pr-1 border-l border-white/10 text-[10px] font-mono text-slate-400">
        <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
        <span>{isWsConnected ? 'LIVE FEED' : 'READY'}</span>
      </div>
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
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [0, 5, 13], fov: 55, near: 0.1, far: 1000 }}
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
