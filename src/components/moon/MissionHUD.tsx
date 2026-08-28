import { useState, useEffect, useRef } from 'react';
import missionState from '../../stores/missionStore';
import { PATH_LENGTH } from './RoverPath';

/**
 * MissionHUD — glassmorphism HUD overlay with mission telemetry.
 * Shows distance, craters discovered, data collected, and status.
 */
interface HUDData {
  distance: string;
  craters: number;
  dataCollected: number;
  status: string;
  opacity: number;
}

export function MissionHUD() {
  const [data, setData] = useState<HUDData>({
    distance: "0",
    craters: 0,
    dataCollected: 0,
    status: 'STANDBY',
    opacity: 0,
  });
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      const p = missionState.smoothProgress;

      // HUD visible between 10% and 80% scroll
      let opacity = 0;
      if (p > 0.1 && p < 0.8) {
        const fadeIn = Math.min(1, (p - 0.1) / 0.05);
        const fadeOut = Math.min(1, (0.8 - p) / 0.05);
        opacity = Math.min(fadeIn, fadeOut);
      }

      // Distance
      const distance = (p * PATH_LENGTH * 0.1).toFixed(1);

      // Craters
      let craters = 0;
      if (missionState.crater1Discovered) craters++;
      if (missionState.crater2Discovered) craters++;

      // Data collected (simulated)
      const dataCollected = Math.floor(p * 847);

      // Status
      let status = 'STANDBY';
      if (p > 0.02 && p < 0.25) status = 'EN ROUTE';
      else if (p >= 0.25 && p < 0.45) status = 'SCANNING';
      else if (p >= 0.45 && p < 0.55) status = 'ANALYZING';
      else if (p >= 0.55 && p < 0.7) status = 'EN ROUTE';
      else if (p >= 0.7 && p < 0.85) status = 'APPROACHING';
      else if (p >= 0.85) status = 'MISSION COMPLETE';

      setData({ distance, craters, dataCollected, status, opacity });
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Top-left: Mission status */}
      <div
        className="mission-hud hud-top-left"
        style={{ opacity: data.opacity }}
      >
        <div className="hud-card">
          <div className="hud-label">Mission Status</div>
          <div className="hud-status">
            <div className="hud-status-dot" />
            <div className="hud-status-text">{data.status}</div>
          </div>
        </div>
        <div className="hud-card">
          <div className="hud-label">Distance</div>
          <div className="hud-value">
            {data.distance}<span className="hud-unit">KM</span>
          </div>
        </div>
      </div>

      {/* Top-right: Discovery stats */}
      <div
        className="mission-hud hud-top-right"
        style={{ opacity: data.opacity }}
      >
        <div className="hud-card">
          <div className="hud-label">Craters Found</div>
          <div className="hud-value">{data.craters}<span className="hud-unit">/ 2</span></div>
        </div>
        <div className="hud-card">
          <div className="hud-label">Data Collected</div>
          <div className="hud-value">{data.dataCollected}<span className="hud-unit">MB</span></div>
        </div>
      </div>
    </>
  );
}

export default MissionHUD;
