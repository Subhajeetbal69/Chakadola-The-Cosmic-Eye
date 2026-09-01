import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import missionState from '../../stores/missionStore';

gsap.registerPlugin(ScrollTrigger);

// Prevent mobile address bar height shifts from jittering GSAP triggers
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * ScrollController — GSAP ScrollTrigger that feeds normalized progress
 * (0–1) into the shared missionState store.
 * 
 * Supports both desktop wheel/scrollbar navigation and direct mobile
 * touch swipe & flick gestures with momentum.
 */
interface ScrollControllerProps {
  children: React.ReactNode;
}

export function ScrollController({ children }: ScrollControllerProps) {
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!spacerRef.current) return;

    // Refresh ScrollTrigger calculations
    ScrollTrigger.refresh();

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

    // ── Mobile Direct Touch Gesture Translation ──
    let touchStartY = 0;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    let touchVelocity = 0;
    let momentumRaf: number | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf);
        momentumRaf = null;
      }
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        lastTouchY = touchStartY;
        lastTouchTime = performance.now();
        touchVelocity = 0;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const currentY = e.touches[0].clientY;
        const deltaY = lastTouchY - currentY;
        const now = performance.now();
        const dt = Math.max(1, now - lastTouchTime);

        // Calculate instantaneous velocity (pixels/ms)
        touchVelocity = deltaY / dt;

        // Apply touch displacement directly to window scroll with enhanced mobile sensitivity
        const scrollMultiplier = 1.35;
        window.scrollBy(0, deltaY * scrollMultiplier);

        // Keep trigger synchronized
        trigger.update();

        lastTouchY = currentY;
        lastTouchTime = now;
      }
    };

    const handleTouchEnd = () => {
      // Apply momentum decay if flicked
      if (Math.abs(touchVelocity) > 0.15) {
        let velocity = touchVelocity * 14; // Initial momentum impulse
        const decay = 0.92; // Friction factor

        const applyMomentum = () => {
          if (Math.abs(velocity) > 0.5) {
            window.scrollBy(0, velocity);
            trigger.update();
            velocity *= decay;
            momentumRaf = requestAnimationFrame(applyMomentum);
          } else {
            momentumRaf = null;
          }
        };

        momentumRaf = requestAnimationFrame(applyMomentum);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Handle orientation and resize changes gracefully
    const handleResize = () => {
      ScrollTrigger.refresh();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

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
      if (momentumRaf) cancelAnimationFrame(momentumRaf);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
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
