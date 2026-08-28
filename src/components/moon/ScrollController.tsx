import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import missionState from '../../stores/missionStore';

gsap.registerPlugin(ScrollTrigger);

/**
 * ScrollController — GSAP ScrollTrigger that feeds normalized progress
 * (0–1) into the shared missionState store.
 *
 * Renders an invisible spacer element that drives the scroll.
 */
interface ScrollControllerProps {
  children: React.ReactNode;
}

export function ScrollController({ children }: ScrollControllerProps) {
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!spacerRef.current) return;

    const trigger = ScrollTrigger.create({
      trigger: spacerRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        const newProgress = self.progress;
        missionState.scrollVelocity = newProgress - missionState.scrollProgress;
        missionState.scrollProgress = newProgress;
      },
    });

    // Smooth progress update via requestAnimationFrame
    let rafId: number;
    const smoothUpdate = () => {
      const current = missionState.smoothProgress;
      const target = missionState.scrollProgress;
      missionState.smoothProgress = current + (target - current) * 0.08;
      rafId = requestAnimationFrame(smoothUpdate);
    };
    rafId = requestAnimationFrame(smoothUpdate);

    return () => {
      trigger.kill();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      {children}
      <div
        ref={spacerRef}
        className="scroll-spacer"
        style={{ height: '1200vh' }}
      />
    </>
  );
}

export default ScrollController;
