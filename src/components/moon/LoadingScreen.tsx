import { useState, useEffect, useRef } from 'react';

/**
 * LoadingScreen — cinematic loading overlay with sequential messages.
 */
const LOADING_MESSAGES = [
  'INITIALIZING MISSION...',
  'GENERATING LUNAR TERRAIN...',
  'CALIBRATING ROVER SYSTEMS...',
  'ESTABLISHING COMM LINK...',
  'MISSION READY',
];

interface LoadingScreenProps {
  onLoaded?: () => void;
}

export function LoadingScreen({ onLoaded }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const duration = 2500;
    let rafId: number;

    const update = () => {
      const elapsed = Date.now() - startTime.current;
      const t = Math.min(1, elapsed / duration);

      // Ease-out progress curve
      const easedProgress = 1 - Math.pow(1 - t, 3);
      const percentProgress = Math.round(easedProgress * 100);

      setProgress(percentProgress);

      const idx = Math.min(
        LOADING_MESSAGES.length - 1,
        Math.floor(easedProgress * LOADING_MESSAGES.length)
      );
      setMessageIndex(idx);

      if (t < 1) {
        rafId = requestAnimationFrame(update);
      } else {
        setTimeout(() => {
          setLoaded(true);
          if (onLoaded) onLoaded();
        }, 400);
      }
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [onLoaded]);

  return (
    <div className={`loading-screen ${loaded ? 'loaded' : ''}`}>
      <div className="loading-logo">MISSION CONTROL</div>
      <div className="loading-messages">
        {LOADING_MESSAGES[messageIndex]}
      </div>
      <div className="loading-bar-container">
        <div
          className="loading-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="loading-percent">
        {progress}%
      </div>
    </div>
  );
}

export default LoadingScreen;
