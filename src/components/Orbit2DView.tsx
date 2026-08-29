import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  Focus,
  ZoomIn,
  ZoomOut,
  Compass,
} from 'lucide-react';
import { TrackedObjectSummary, ConjunctionEvent, ConjunctionSyncState } from '../types';

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
  onResetSync,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plane, setPlane] = useState<'XY' | 'XZ' | 'YZ'>('XY');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const simTimeStepRef = useRef<number>(0);

  const zoomRef = useRef<number>(1.0);
  const targetZoomRef = useRef<number>(1.0);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoomDisplay, setZoomDisplay] = useState<number>(1.0);

  const [clockDisplay, setClockDisplay] = useState<number>(0);
  const [hoveredObject, setHoveredObject] = useState<TrackedObjectSummary | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const EARTH_RADIUS_KM = 6378.137;
  const VIEW_RADIUS_KM = 46000;

  const starsRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([]);
  if (starsRef.current.length === 0) {
    for (let i = 0; i < 90; i++) {
      starsRef.current.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.2 + 0.4,
        alpha: Math.random() * 0.6 + 0.2,
      });
    }
  }

  useEffect(() => {
    if (!syncState || !syncState.isActive) {
      targetZoomRef.current = 1.0;
      targetPanRef.current = { x: 0, y: 0 };
      return;
    }

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

    targetZoomRef.current = 3.2;

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
    const height = canvas ? canvas.clientHeight : 500;
    const baseScale = (Math.min(width, height) / (2 * VIEW_RADIUS_KM)) * 3.2;

    targetPanRef.current = {
      x: -projX * baseScale,
      y: projY * baseScale,
    };

    const minutesOffset = Math.floor(syncState.tcaSecondsOffset / 60);
    simTimeStepRef.current = Math.max(0, minutesOffset % 1440);
    setClockDisplay(simTimeStepRef.current);
  }, [syncState?.timestamp, syncState?.isActive]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
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

    const bgGrad = ctx.createRadialGradient(originX, originY, 10, originX, originY, Math.max(width, height) * 0.85);
    bgGrad.addColorStop(0, '#0a1024');
    bgGrad.addColorStop(0.4, '#050814');
    bgGrad.addColorStop(1, '#020307');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    for (const star of starsRef.current) {
      ctx.fillStyle = `rgba(220, 235, 255, ${star.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const orbitalZones = [
      { r: 8378, label: 'LEO (2,000 km)', color: 'rgba(0, 229, 255, 0.15)' },
      { r: 16378, label: 'MEO (10,000 km)', color: 'rgba(59, 130, 246, 0.12)' },
      { r: 26378, label: 'MEO (20,000 km)', color: 'rgba(59, 130, 246, 0.10)' },
      { r: 42164, label: 'GEO BELT (35,786 km)', color: 'rgba(0, 255, 102, 0.22)' },
    ];

    ctx.lineWidth = 0.9;
    for (const zone of orbitalZones) {
      const canvasR = zone.r * scale;
      ctx.beginPath();
      ctx.arc(originX, originY, canvasR, 0, Math.PI * 2);
      ctx.strokeStyle = zone.color;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (canvasR > 18) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.font = '9px Orbitron, monospace';
        ctx.fillText(zone.label, originX + 6, originY - canvasR - 4);
      }
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px Rajdhani, monospace';
    const axisLabels =
      plane === 'XY'
        ? { x: '+X (Vernal Equinox)', y: '+Y Orbit Plane' }
        : plane === 'XZ'
        ? { x: '+X (Vernal Equinox)', y: '+Z (North Celestial Pole)' }
        : { x: '+Y Orbit Normal', y: '+Z (North Celestial Pole)' };
    ctx.fillText(axisLabels.x, Math.min(width - 130, originX + 160), originY - 8);
    ctx.fillText(axisLabels.y, originX + 8, Math.max(22, originY - 150));

    const earthCanvasR = EARTH_RADIUS_KM * scale;
    const atmoGrad = ctx.createRadialGradient(originX, originY, earthCanvasR * 0.8, originX, originY, earthCanvasR * 1.35);
    atmoGrad.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
    atmoGrad.addColorStop(0.5, 'rgba(37, 99, 235, 0.18)');
    atmoGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(originX, originY, earthCanvasR * 1.35, 0, Math.PI * 2);
    ctx.fill();

    const earthGrad = ctx.createRadialGradient(originX - earthCanvasR * 0.3, originY - earthCanvasR * 0.35, earthCanvasR * 0.05, originX, originY, earthCanvasR);
    earthGrad.addColorStop(0, '#2563eb');
    earthGrad.addColorStop(0.45, '#1e3a8a');
    earthGrad.addColorStop(0.85, '#0f172a');
    earthGrad.addColorStop(1, '#020617');
    ctx.beginPath();
    ctx.arc(originX, originY, earthCanvasR, 0, Math.PI * 2);
    ctx.fillStyle = earthGrad;
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const project = (x: number, y: number, z: number) => {
      let px = 0, py = 0;
      if (plane === 'XY') { px = originX + x * scale; py = originY - y * scale; }
      else if (plane === 'XZ') { px = originX + x * scale; py = originY - z * scale; }
      else { px = originX + y * scale; py = originY - z * scale; }
      return { px, py };
    };

    if (Array.isArray(objects)) {
      for (const obj of objects) {
        if (!obj || !obj.orbitSample || obj.orbitSample.length === 0) continue;
        const isConjunctionPair = selectedConjunction && (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);
        const isHovered = hoveredObject?.id === obj.id;
        if (isConjunctionPair || isHovered) {
          ctx.beginPath();
          ctx.lineWidth = isConjunctionPair ? 2 : 1.2;
          ctx.strokeStyle = obj.classification === 'DEBRIS' ? '#ff3366' : obj.classification === 'ROCKET_BODY' ? '#00d4ff' : '#00ff66';
          for (let i = 0; i < obj.orbitSample.length; i++) {
            const pt = obj.orbitSample[i];
            if (!pt) continue;
            const { px, py } = project(pt.x, pt.y, pt.z);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      const currentSimStep = simTimeStepRef.current;
      for (const obj of objects) {
        if (!obj) continue;
        const sampleIdx = currentSimStep % (obj.orbitSample?.length || 1);
        const rawPt = obj.currentPosition || obj.positionKm;
        const pt = obj.orbitSample && obj.orbitSample[sampleIdx] ? obj.orbitSample[sampleIdx] : rawPt;
        if (!pt) continue;
        const { px, py } = project(pt.x, pt.y, pt.z);
        const isConjunctionPair = selectedConjunction && (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);
        const isHovered = hoveredObject?.id === obj.id;
        ctx.beginPath();
        let dotRadius = 1.3;
        if (isConjunctionPair) dotRadius = 5; else if (isHovered) dotRadius = 4.5;
        ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = obj.classification === 'DEBRIS' ? '#ff2244' : obj.classification === 'ROCKET_BODY' ? '#00d4ff' : '#00ff66';
        ctx.fill();
        if (isConjunctionPair || isHovered) {
          ctx.beginPath();
          ctx.arc(px, py, 9, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px Orbitron, monospace';
          ctx.fillText(obj.name, px + 12, py - 6);
        }
      }
    }

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
        ctx.strokeStyle = '#ff2244';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        const midX = (pA.px + pB.px) / 2;
        const midY = (pA.py + pB.py) / 2;
        if (syncState && syncState.isActive) {
          ctx.beginPath();
          ctx.arc(midX, midY, 18, 0, Math.PI * 2);
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = '#ff2244';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`⚠ ${(selectedConjunction.minDistanceKm ?? 0).toFixed(2)} km`, midX + 6, midY - 6);
      }
    }
    ctx.restore();
  }, [objects, selectedConjunction, plane, hoveredObject, syncState]);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let clockCounter = 0;
    const loop = (currentTime: number) => {
      const delta = currentTime - lastTime;
      zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.09;
      panRef.current.x += (targetPanRef.current.x - panRef.current.x) * 0.09;
      panRef.current.y += (targetPanRef.current.y - panRef.current.y) * 0.09;
      if (delta > 60 && isPlaying) {
        simTimeStepRef.current = (simTimeStepRef.current + 1) % 1440;
        lastTime = currentTime;
        clockCounter++;
        if (clockCounter % 10 === 0) {
          setClockDisplay(simTimeStepRef.current);
          setZoomDisplay(Number(zoomRef.current.toFixed(1)));
        }
      }
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
        let px = 0, py = 0;
        if (plane === 'XY') { px = originX + pt.x * scale; py = originY - pt.y * scale; }
        else if (plane === 'XZ') { px = originX + pt.x * scale; py = originY - pt.z * scale; }
        else { px = originX + pt.y * scale; py = originY - pt.z * scale; }
        const dist = Math.hypot(mouseX - px, mouseY - py);
        if (dist < 12) { found = obj; break; }
      }
    }
    setHoveredObject(found);
    setTooltipPos(found ? { x: mouseX, y: mouseY } : null);
  };

  const handleCanvasClick = () => {
    if (hoveredObject && onSelectObject) {
      onSelectObject(hoveredObject);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

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
        let px = 0, py = 0;
        if (plane === 'XY') { px = originX + pt.x * scale; py = originY - pt.y * scale; }
        else if (plane === 'XZ') { px = originX + pt.x * scale; py = originY - pt.z * scale; }
        else { px = originX + pt.y * scale; py = originY - pt.z * scale; }
        const dist = Math.hypot(touchX - px, touchY - py);
        if (dist < 18) { found = obj; break; }
      }
    }
    setHoveredObject(found);
    setTooltipPos(found ? { x: touchX, y: touchY } : null);
    if (found && onSelectObject) {
      onSelectObject(found);
    }
  };

  const handleResetTime = () => {
    simTimeStepRef.current = 0;
    setClockDisplay(0);
  };

  const activeCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'ACTIVE_SATELLITE').length : 0;
  const debrisCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'DEBRIS').length : 0;
  const rbCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'ROCKET_BODY').length : 0;

  return (
    <div id="orbit-2d-panel" className="w-full h-full bg-slate-950/80 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
      {/* ── Top Responsive Controls Bar (Zero Overlap Guaranteed) ── */}
      <div className="absolute top-2 sm:top-3 inset-x-2 sm:inset-x-3 z-10 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
        {/* Left: Classification Object Breakdown */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl px-2 sm:px-3 py-1 sm:py-1.5 border border-white/10 rounded-xl flex items-center gap-2 sm:gap-3 text-xs shadow-2xl shrink-0">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00ff66] shadow-[0_0_6px_#00ff66]" />
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-200">
              <span className="hidden sm:inline">SATS </span>{activeCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ff2244] shadow-[0_0_6px_#ff2244]" />
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-200">
              <span className="hidden sm:inline">DEBRIS </span>{debrisCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00d4ff] shadow-[0_0_6px_#00d4ff]" />
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-200">
              <span className="hidden sm:inline">R/B </span>{rbCount}
            </span>
          </div>
        </div>

        {/* Right: Plane Switcher & Zoom Buttons */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl p-1 sm:p-1.5 border border-white/10 rounded-xl flex items-center gap-1 sm:gap-1.5 shadow-2xl shrink-0">
          <div className="flex items-center gap-0.5 sm:gap-1 px-1 border-r border-white/10">
            <Compass className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400 shrink-0" />
            <span className="hidden lg:inline text-[10px] font-mono font-bold text-slate-400 mr-0.5">PLANE:</span>
            {(['XY', 'XZ', 'YZ'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlane(p)}
                className={`px-1.5 sm:px-2 py-0.5 rounded-lg font-mono text-[9px] sm:text-[10px] font-bold transition-all cursor-pointer ${
                  plane === p ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 pl-0.5">
            <button onClick={() => { targetZoomRef.current = Math.min(4.0, targetZoomRef.current + 0.3); setZoomDisplay(Number(targetZoomRef.current.toFixed(1))); }} className="p-0.5 sm:p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer" title="Zoom in">
              <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
            <span className="font-mono text-[9px] sm:text-[10px] font-bold text-cyan-400 min-w-[24px] sm:min-w-[30px] text-center">{(zoomDisplay * 100).toFixed(0)}%</span>
            <button onClick={() => { targetZoomRef.current = Math.max(0.5, targetZoomRef.current - 0.3); setZoomDisplay(Number(targetZoomRef.current.toFixed(1))); }} className="p-0.5 sm:p-1 rounded hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer" title="Zoom out">
              <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full min-h-[340px] sm:min-h-[460px]">
        {syncState && syncState.isActive && selectedConjunction && (
          <div className="absolute top-12 sm:top-14 left-1/2 -translate-x-1/2 z-20 bg-slate-950/95 backdrop-blur-md border border-cyan-500/60 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-1.5 text-xs font-mono max-w-[92vw]">
            <div className="flex items-center gap-1 text-cyan-300 font-bold">
              <Focus className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span className="text-[10px] sm:text-xs">TCA SYNC</span>
            </div>
            <div className="flex items-center gap-1 text-slate-300 text-[9px] sm:text-[10px] border-l border-white/10 pl-1.5">
              <span className="text-red-400 font-bold bg-red-950/70 border border-red-500/40 px-1 py-0.2 rounded">{selectedConjunction.minDistanceKm.toFixed(2)} km</span>
            </div>
            {onResetSync && (
              <button onClick={onResetSync} className="px-1 py-0.2 rounded bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-[9px] font-sans transition-colors border border-white/10 cursor-pointer">Reset</button>
            )}
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onMouseLeave={() => { setHoveredObject(null); setTooltipPos(null); }}
          className="w-full h-full block cursor-crosshair touch-none"
        />
        {hoveredObject && tooltipPos && (
          <div className="absolute z-30 pointer-events-none bg-slate-900/95 backdrop-blur-2xl border border-white/20 p-2.5 sm:p-3.5 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.8)] text-xs font-mono text-slate-200 max-w-[260px] sm:max-w-none" style={{ left: Math.min(tooltipPos.x + 12, window.innerWidth - 280), top: Math.max(10, Math.min(tooltipPos.y + 12, 380)) }}>
            <div className="font-bold text-white text-xs sm:text-sm mb-1 flex items-center gap-1.5">
              <span className="truncate">{hoveredObject.name}</span>
              <span className={`w-2 h-2 shrink-0 rounded-full ${hoveredObject.classification === 'DEBRIS' ? 'bg-[#ff2244]' : hoveredObject.classification === 'ROCKET_BODY' ? 'bg-[#00d4ff]' : 'bg-[#00ff66]'}`} />
            </div>
            <div className="text-slate-400 text-[10px] sm:text-[11px]">NORAD ID: #{hoveredObject.noradId}</div>
            <div className="text-slate-400 text-[10px] sm:text-[11px]">Type: {hoveredObject.classification}</div>
            <div className="text-cyan-400 text-[10px] sm:text-[11px] mt-0.5 font-semibold">Altitude: {(hoveredObject.altitudeKm ?? 0).toFixed(1)} km</div>
            <div className="text-slate-400 text-[10px] sm:text-[11px]">Speed: {(hoveredObject.speedKmS ?? 0).toFixed(2)} km/s</div>
          </div>
        )}
      </div>

      <div className="p-2 sm:p-3 bg-slate-900/90 backdrop-blur-2xl border-t border-white/10 flex flex-wrap items-center justify-between gap-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setIsPlaying(!isPlaying)} className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-all flex items-center gap-1 cursor-pointer">
            {isPlaying ? <Pause className="w-3 h-3 text-cyan-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
            <span className="text-[9px] sm:text-[10px] font-mono font-bold">{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>
          <button onClick={handleResetTime} className="p-1 sm:p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all cursor-pointer" title="Reset to T0">
            <RotateCcw className="w-3 h-3" />
          </button>
          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-300 font-mono bg-black/40 px-2 py-1 rounded-lg border border-white/10">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>T+ <strong className="text-cyan-300">{Math.floor(clockDisplay / 60)}h {(clockDisplay % 60).toString().padStart(2, '0')}m</strong></span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="text-[9px] sm:text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded-lg border border-white/10">
            FRAME: <strong className="text-slate-200">ECI</strong> &nbsp;|&nbsp; <strong className="text-cyan-400">{plane}-PLANE</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Orbit2DView;
