import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Orbit,
  Maximize2,
  Minimize2,
  Layers,
  Info,
  Clock,
  Play,
  Pause,
  RotateCcw,
  ShieldAlert,
  Focus,
  Sparkles
} from 'lucide-react';
import { TrackedObjectSummary, ConjunctionEvent, ObjectClassification, ConjunctionSyncState } from '../types';

interface Orbit2DViewProps {
  objects: TrackedObjectSummary[];
  selectedConjunction: ConjunctionEvent | null;
  syncState?: ConjunctionSyncState | null;
  onSelectObject?: (obj: TrackedObjectSummary) => void;
  onResetSync?: () => void;
}

export const Orbit2DView: React.FC<Orbit2DViewProps> = ({
  objects = [],
  selectedConjunction,
  syncState = null,
  onSelectObject,
  onResetSync
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plane, setPlane] = useState<'XY' | 'XZ' | 'YZ'>('XY');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const simTimeStepRef = useRef<number>(0);
  
  // Smooth Pan and Zoom Refs for continuous interpolation
  const zoomRef = useRef<number>(1.0);
  const targetZoomRef = useRef<number>(1.0);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoomDisplay, setZoomDisplay] = useState<number>(1.0);
  
  // Create a display state purely for the UI clock, updated less frequently
  const [clockDisplay, setClockDisplay] = useState<number>(0);
  
  const [hoveredObject, setHoveredObject] = useState<TrackedObjectSummary | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const EARTH_RADIUS_KM = 6378.137;
  const VIEW_RADIUS_KM = 22000;

  // React to Conjunction Sync Zoom from DistanceChart
  useEffect(() => {
    if (!syncState || !syncState.isActive) {
      targetZoomRef.current = 1.0;
      targetPanRef.current = { x: 0, y: 0 };
      return;
    }

    // Compute delta magnitudes to find best projection plane that reveals separation
    const dx = Math.abs(syncState.positionA.x - syncState.positionB.x);
    const dy = Math.abs(syncState.positionA.y - syncState.positionB.y);
    const dz = Math.abs(syncState.positionA.z - syncState.positionB.z);

    let chosenPlane: 'XY' | 'XZ' | 'YZ' = 'XY';
    if (dz > dx && dz > dy) {
      chosenPlane = 'XZ';
    } else if (dy > dx && dy > dz) {
      chosenPlane = 'YZ';
    } else {
      chosenPlane = 'XY';
    }
    setPlane(chosenPlane);

    // Zoom in close to observe orbital crossing (2.4x)
    targetZoomRef.current = 2.4;

    // Calculate encounter midpoint in km
    const midX = (syncState.positionA.x + syncState.positionB.x) * 0.5;
    const midY = (syncState.positionA.y + syncState.positionB.y) * 0.5;
    const midZ = (syncState.positionA.z + syncState.positionB.z) * 0.5;

    let projX = midX;
    let projY = midY;
    if (chosenPlane === 'XZ') {
      projX = midX;
      projY = midZ;
    } else if (chosenPlane === 'YZ') {
      projX = midY;
      projY = midZ;
    }

    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : 800;
    const height = canvas ? canvas.clientHeight : 460;
    const baseScale = (Math.min(width, height) / (2 * VIEW_RADIUS_KM)) * 2.4;

    // Center the encounter directly on screen
    targetPanRef.current = {
      x: -projX * baseScale,
      y: projY * baseScale
    };

    // Advance 2D sim clock offset
    const minutesOffset = Math.floor(syncState.tcaSecondsOffset / 60);
    simTimeStepRef.current = Math.max(0, minutesOffset % 1440);
    setClockDisplay(simTimeStepRef.current);
  }, [syncState?.timestamp, syncState?.isActive]);


  // Manual Canvas Drawing Function to decouple from React state renders
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Only resize if actually changed to avoid flicker
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const originX = centerX + currentPan.x;
    const originY = centerY + currentPan.y;

    const scale = (Math.min(width, height) / (2 * VIEW_RADIUS_KM)) * currentZoom;

    // Background - Clean Aerospace Dark
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, width, height);

    // Subtle background grid stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < 40; i++) {
      const sx = (Math.sin(i * 99) * 0.5 + 0.5) * width;
      const sy = (Math.cos(i * 33) * 0.5 + 0.5) * height;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Concentric Reference Altitude Rings
    const referenceRadii = [7000, 10000, 15000, 20000];
    ctx.lineWidth = 0.8;
    for (const r of referenceRadii) {
      const canvasR = r * scale;
      ctx.beginPath();
      ctx.arc(originX, originY, canvasR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
      ctx.font = '9px monospace';
      ctx.fillText(`${r} km`, originX + 4, originY - canvasR - 3);
    }

    // Axes centered at Earth origin
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Axis Labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    const axisLabels =
      plane === 'XY'
        ? { x: '+X (Vernal Equinox)', y: '+Y' }
        : plane === 'XZ'
        ? { x: '+X (Vernal Equinox)', y: '+Z (North Pole)' }
        : { x: '+Y', y: '+Z (North Pole)' };
    ctx.fillText(axisLabels.x, Math.min(width - 110, originX + 160), originY - 8);
    ctx.fillText(axisLabels.y, originX + 8, Math.max(18, originY - 140));

    // Draw Earth Sphere at origin
    const earthCanvasR = EARTH_RADIUS_KM * scale;
    const earthGrad = ctx.createRadialGradient(
      originX - earthCanvasR * 0.3,
      originY - earthCanvasR * 0.3,
      earthCanvasR * 0.1,
      originX,
      originY,
      earthCanvasR
    );
    earthGrad.addColorStop(0, '#1e3a8a');
    earthGrad.addColorStop(0.7, '#0f172a');
    earthGrad.addColorStop(1, '#020617');

    ctx.beginPath();
    ctx.arc(originX, originY, earthCanvasR, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // Atmospheric outer glow
    ctx.beginPath();
    ctx.arc(originX, originY, earthCanvasR + 4 * currentZoom, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.lineWidth = 4 * currentZoom;
    ctx.stroke();

    // Helper to project 3D km to 2D Canvas relative to origin
    const project = (x: number, y: number, z: number) => {
      let px = 0;
      let py = 0;
      if (plane === 'XY') {
        px = originX + x * scale;
        py = originY - y * scale;
      } else if (plane === 'XZ') {
        px = originX + x * scale;
        py = originY - z * scale;
      } else {
        px = originX + y * scale;
        py = originY - z * scale;
      }
      return { px, py };
    };

    // Draw Orbital Trajectories
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        if (!obj || !obj.orbitSample || obj.orbitSample.length === 0) continue;

        const isConjunctionPair =
          selectedConjunction &&
          (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);

        ctx.beginPath();
        ctx.lineWidth = isConjunctionPair ? 2 : 1;

        if (obj.classification === 'DEBRIS') {
          ctx.strokeStyle = isConjunctionPair ? '#ef4444' : 'rgba(239, 68, 68, 0.3)';
          ctx.setLineDash([4, 4]);
        } else if (obj.classification === 'ROCKET_BODY') {
          ctx.strokeStyle = isConjunctionPair ? '#f59e0b' : 'rgba(245, 158, 11, 0.25)';
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = isConjunctionPair ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)';
          ctx.setLineDash([]);
        }

        for (let i = 0; i < obj.orbitSample.length; i++) {
          const pt = obj.orbitSample[i];
          if (!pt) continue;
          const { px, py } = project(pt.x, pt.y, pt.z);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Objects at Animated Simulation Time
      const currentSimStep = simTimeStepRef.current;
      for (const obj of objects) {
        if (!obj) continue;
        const sampleIdx = currentSimStep % (obj.orbitSample?.length || 1);
        const rawPt = obj.currentPosition || obj.positionKm;
        const pt = obj.orbitSample && obj.orbitSample[sampleIdx] ? obj.orbitSample[sampleIdx] : rawPt;
        if (!pt) continue;

        const { px, py } = project(pt.x, pt.y, pt.z);

        const isConjunctionPair =
          selectedConjunction &&
          (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);

        const isHovered = hoveredObject?.id === obj.id;

        ctx.beginPath();
        const dotRadius = isConjunctionPair ? 5.5 : isHovered ? 5 : 3;
        ctx.arc(px, py, dotRadius, 0, Math.PI * 2);

        if (obj.classification === 'DEBRIS') {
          ctx.fillStyle = '#ef4444';
        } else if (obj.classification === 'ROCKET_BODY') {
          ctx.fillStyle = '#f59e0b';
        } else {
          ctx.fillStyle = '#3b82f6';
        }
        ctx.fill();

        if (isConjunctionPair || isHovered) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(obj.name, px + 8, py - 4);
        }
      }
    }

    // Conjunction Hazard Vector
    if (selectedConjunction && Array.isArray(objects)) {
      const objA = objects.find((o) => o.id === selectedConjunction.objectA?.id);
      const objB = objects.find((o) => o.id === selectedConjunction.objectB?.id);

      const posA = objA?.currentPosition || objA?.positionKm || selectedConjunction.positionAAtTca;
      const posB = objB?.currentPosition || objB?.positionKm || selectedConjunction.positionBAtTca;

      if (posA && posB) {
        const pA = project(posA.x, posA.y, posA.z);
        const pB = project(posB.x, posB.y, posB.z);

        ctx.beginPath();
        ctx.moveTo(pA.px, pA.py);
        ctx.lineTo(pB.px, pB.py);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (pA.px + pB.px) / 2;
        const midY = (pA.py + pB.py) / 2;

        // Prominent Sync Radar target ring when sync is active
        if (syncState && syncState.isActive) {
          ctx.beginPath();
          ctx.arc(midX, midY, 18, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(midX, midY, 28, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(
          `⚠ ${(selectedConjunction.minDistanceKm ?? 0).toFixed(2)} km`,
          midX + 5,
          midY - 5
        );
      }
    }
    
    ctx.restore();
  }, [objects, selectedConjunction, plane, hoveredObject, syncState]);

  // Smooth Animation Loop (Continuous lerp for zoom and pan)
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let clockUpdateCounter = 0;

    const loop = (currentTime: number) => {
      const delta = currentTime - lastTime;

      // Smooth pan and zoom lerp
      zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.09;
      panRef.current.x += (targetPanRef.current.x - panRef.current.x) * 0.09;
      panRef.current.y += (targetPanRef.current.y - panRef.current.y) * 0.09;

      if (delta > 60 && isPlaying) {
        simTimeStepRef.current = (simTimeStepRef.current + 1) % 1440;
        lastTime = currentTime;
        
        // Update UI clock less frequently to avoid constant re-renders
        clockUpdateCounter++;
        if (clockUpdateCounter % 10 === 0) {
           setClockDisplay(simTimeStepRef.current);
           setZoomDisplay(Number(zoomRef.current.toFixed(1)));
        }
      }
      
      // Always draw the canvas in RAF
      drawCanvas();
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, drawCanvas]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const originX = centerX + currentPan.x;
    const originY = centerY + currentPan.y;
    const scale = (Math.min(rect.width, rect.height) / (2 * VIEW_RADIUS_KM)) * currentZoom;

    let found: TrackedObjectSummary | null = null;
    const currentSimStep = simTimeStepRef.current;

    if (Array.isArray(objects)) {
      for (const obj of objects) {
        if (!obj) continue;
        const sampleIdx = currentSimStep % (obj.orbitSample?.length || 1);
        const rawPt = obj.currentPosition || obj.positionKm;
        const pt = obj.orbitSample && obj.orbitSample[sampleIdx] ? obj.orbitSample[sampleIdx] : rawPt;
        if (!pt) continue;

        let px = 0;
        let py = 0;
        if (plane === 'XY') {
          px = originX + pt.x * scale;
          py = originY - pt.y * scale;
        } else if (plane === 'XZ') {
          px = originX + pt.x * scale;
          py = originY - pt.z * scale;
        } else {
          px = originX + pt.y * scale;
          py = originY - pt.z * scale;
        }

        const dist = Math.hypot(mouseX - px, mouseY - py);
        if (dist < 10) {
          found = obj;
          break;
        }
      }
    }

    setHoveredObject(found);
    setTooltipPos(found ? { x: mouseX, y: mouseY } : null);
  };

  const handleResetTime = () => {
    simTimeStepRef.current = 0;
    setClockDisplay(0);
  };

  const activeCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'ACTIVE_SATELLITE').length : 0;
  const debrisCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'DEBRIS').length : 0;
  const rbCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'ROCKET_BODY').length : 0;

  return (
    <div id="orbit-2d-panel" className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
      {/* Top Overlays */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <div className="bg-black/40 backdrop-blur-md px-3.5 py-1.5 border border-white/10 rounded-xl flex items-center gap-4 text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_5px_rgba(96,165,250,0.8)]"></span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-300">
              Active ({activeCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-400 rounded-full shadow-[0_0_5px_rgba(248,113,113,0.8)]"></span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-300">
              Debris ({debrisCount})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full shadow-[0_0_5px_rgba(251,191,36,0.8)]"></span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-300">
              R/B ({rbCount})
            </span>
          </div>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-black/40 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded-xl flex flex-col text-right">
        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Coordinates</span>
        <span className="text-xs font-mono text-blue-400">ECI Frame (TEME)</span>
      </div>

      {/* Projection Plane Selector & Zoom Controls (Floating Top Right Center) */}
      <div className="absolute top-16 right-4 z-10 flex flex-col gap-1.5 bg-black/40 backdrop-blur-md p-1.5 border border-white/10 rounded-xl text-xs shadow-lg">
        <div className="flex gap-1">
          {(['XY', 'XZ', 'YZ'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlane(p)}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold transition-all ${
                plane === p
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-1 pt-1 border-t border-white/10 text-[10px] text-slate-400">
          <button
            onClick={() => {
              targetZoomRef.current = Math.min(3.0, targetZoomRef.current + 0.25);
              setZoomDisplay(Number(targetZoomRef.current.toFixed(1)));
            }}
            className="hover:text-white px-1.5 py-0.5 hover:bg-white/10 rounded transition-colors"
          >
            +
          </button>
          <span className="font-mono text-slate-300">{(zoomDisplay * 100).toFixed(0)}%</span>
          <button
            onClick={() => {
              targetZoomRef.current = Math.max(0.4, targetZoomRef.current - 0.25);
              setZoomDisplay(Number(targetZoomRef.current.toFixed(1)));
            }}
            className="hover:text-white px-1.5 py-0.5 hover:bg-white/10 rounded transition-colors"
          >
            -
          </button>
        </div>
      </div>

      {/* 2D Canvas */}
      <div className="relative w-full h-[460px] bg-[#020617]">
        {/* SYNC ZOOM ACTIVE ENCOUNTER HUD BANNER */}
        {syncState && syncState.isActive && selectedConjunction && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-950/95 backdrop-blur-md border border-cyan-500/60 px-3.5 py-1.5 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.3)] flex items-center gap-2.5 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-1 text-cyan-300 font-bold">
              <Focus className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>SYNC ZOOM: TCA WINDOW</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-slate-300 text-[11px] border-l border-white/10 pl-2">
              <span className="text-red-400 font-bold bg-red-950/70 border border-red-500/40 px-1.5 py-0.5 rounded text-[10px]">
                {selectedConjunction.minDistanceKm.toFixed(2)} km
              </span>
            </div>
            {onResetSync && (
              <button
                onClick={onResetSync}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[10px] font-sans transition-colors border border-white/10"
                title="Reset zoom and plane"
              >
                Reset
              </button>
            )}
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoveredObject(null);
            setTooltipPos(null);
          }}
          className="w-full h-full block cursor-crosshair"
        />

        {/* Hover Tooltip */}
        {hoveredObject && tooltipPos && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-2xl text-xs font-mono text-slate-200"
            style={{
              left: Math.min(tooltipPos.x + 15, 520),
              top: Math.min(tooltipPos.y + 15, 340)
            }}
          >
            <div className="font-bold text-white text-sm mb-1">{hoveredObject.name}</div>
            <div className="text-slate-400 text-[11px]">NORAD ID: #{hoveredObject.noradId}</div>
            <div className="text-slate-400 text-[11px]">Type: {hoveredObject.classification}</div>
            <div className="text-blue-400 text-[11px] mt-1">
              Altitude: {(hoveredObject.altitudeKm ?? 0).toFixed(1)} km
            </div>
            <div className="text-slate-400 text-[11px]">
              Speed: {(hoveredObject.speedKmS ?? 0).toFixed(2)} km/s
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="p-3 bg-slate-900/60 backdrop-blur-xl border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all flex items-center gap-1.5"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 text-blue-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[11px] font-medium">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={handleResetTime}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all"
            title="Reset to T0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono bg-black/20 px-2.5 py-1 rounded-md border border-white/5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>
              T+ <strong className="text-blue-400">{Math.floor(clockDisplay / 60)}h {(clockDisplay % 60).toString().padStart(2, '0')}m</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase font-mono font-semibold">Projection:</span>
          <span className="text-xs font-mono text-slate-300 font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">
            {plane}-Plane Elevation
          </span>
        </div>
      </div>
    </div>
  );
};
