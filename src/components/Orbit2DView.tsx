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
import './Orbit2DView.css';

interface Orbit2DViewProps {
  objects: TrackedObjectSummary[];
  selectedConjunction: ConjunctionEvent | null;
  selectedObject?: TrackedObjectSummary | null;
  syncState?: ConjunctionSyncState | null;
  onSelectObject?: (obj: TrackedObjectSummary) => void;
  onResetSync?: () => void;
  onClose?: () => void;
  simSpeed?: number;
}

export const Orbit2DView: React.FC<Orbit2DViewProps> = ({
  objects = [],
  selectedConjunction,
  selectedObject,
  syncState = null,
  onSelectObject,
  onResetSync,
  onClose,
  simSpeed = 1000,
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

  const lastTimeRef = useRef<number>(performance.now());
  const lastClockDisplayRef = useRef<number>(-1);
  const lastZoomDisplayRef = useRef<number>(-1);

  const getInterpolatedPosition = useCallback((obj: TrackedObjectSummary, stepFloat: number) => {
    const rawPt = obj.currentPosition || obj.positionKm;
    if (!obj.orbitSample || obj.orbitSample.length === 0) return rawPt;
    const len = obj.orbitSample.length;
    const currentSimStep = Math.floor(stepFloat) % len;
    const nextSimStep = (currentSimStep + 1) % len;
    const fraction = stepFloat - Math.floor(stepFloat);
    const pt1 = obj.orbitSample[currentSimStep] || rawPt;
    const pt2 = obj.orbitSample[nextSimStep] || rawPt;
    if (!pt1 || !pt2) return rawPt;
    return {
      x: pt1.x + (pt2.x - pt1.x) * fraction,
      y: pt1.y + (pt2.y - pt1.y) * fraction,
      z: pt1.z + (pt2.z - pt1.z) * fraction,
    };
  }, []);

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
        const selectedObjectMatchesConjunction = selectedConjunction && selectedObject && (selectedConjunction.objectA?.id === selectedObject.id || selectedConjunction.objectB?.id === selectedObject.id);
        const mode = (selectedConjunction && (!selectedObject || selectedObjectMatchesConjunction)) ? 'CONJUNCTION' : (selectedObject ? 'OBJECT' : 'ALL');

        if (mode === 'CONJUNCTION' && !isConjunctionPair) continue;
        if (mode === 'OBJECT' && selectedObject?.id !== obj.id) continue;

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
        const isConjunctionPair = selectedConjunction && (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);
        const selectedObjectMatchesConjunction = selectedConjunction && selectedObject && (selectedConjunction.objectA?.id === selectedObject.id || selectedConjunction.objectB?.id === selectedObject.id);
        const mode = (selectedConjunction && (!selectedObject || selectedObjectMatchesConjunction)) ? 'CONJUNCTION' : (selectedObject ? 'OBJECT' : 'ALL');

        if (mode === 'CONJUNCTION' && !isConjunctionPair) continue;
        if (mode === 'OBJECT' && selectedObject?.id !== obj.id) continue;

        const stepFloat = simTimeStepRef.current;
        const pt = getInterpolatedPosition(obj, stepFloat);
        if (!pt) continue;
        const { px, py } = project(pt.x, pt.y, pt.z);
        const isHovered = hoveredObject?.id === obj.id;
        const isSelected = selectedObject?.id === obj.id && mode === 'OBJECT';
        
        ctx.beginPath();
        let dotRadius = 1.3;
        if (isConjunctionPair || isSelected) dotRadius = 5; else if (isHovered) dotRadius = 4.5;
        ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = obj.classification === 'DEBRIS' ? '#ff2244' : obj.classification === 'ROCKET_BODY' ? '#00d4ff' : '#00ff66';
        ctx.fill();
        if (isConjunctionPair || isHovered || isSelected) {
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

    const selectedObjectMatchesConjunction = selectedConjunction && selectedObject && (selectedConjunction.objectA?.id === selectedObject.id || selectedConjunction.objectB?.id === selectedObject.id);
    const mode = (selectedConjunction && (!selectedObject || selectedObjectMatchesConjunction)) ? 'CONJUNCTION' : (selectedObject ? 'OBJECT' : 'ALL');

    if (mode === 'CONJUNCTION' && selectedConjunction && Array.isArray(objects)) {
      const objA = objects.find((o) => o.id === selectedConjunction.objectA?.id);
      const objB = objects.find((o) => o.id === selectedConjunction.objectB?.id);
      
      const stepFloat = simTimeStepRef.current;
      const posA = objA ? getInterpolatedPosition(objA, stepFloat) : selectedConjunction.positionAAtTca;
      const posB = objB ? getInterpolatedPosition(objB, stepFloat) : selectedConjunction.positionBAtTca;
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
    const loop = (currentTime: number) => {
      const delta = currentTime - lastTimeRef.current;
      zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.09;
      panRef.current.x += (targetPanRef.current.x - panRef.current.x) * 0.09;
      panRef.current.y += (targetPanRef.current.y - panRef.current.y) * 0.09;
      
      if (isPlaying) {
        const simSpeedMultiplier = simSpeed || 1000;
        const minutesPassed = delta * (simSpeedMultiplier / 60000);
        simTimeStepRef.current = (simTimeStepRef.current + minutesPassed) % 1440;
      }
      
      lastTimeRef.current = currentTime;
      
      const currentClock = Math.floor(simTimeStepRef.current);
      if (currentClock !== lastClockDisplayRef.current) {
        lastClockDisplayRef.current = currentClock;
        setClockDisplay(currentClock);
      }
      const currentZoom = Number(zoomRef.current.toFixed(1));
      if (currentZoom !== lastZoomDisplayRef.current) {
        lastZoomDisplayRef.current = currentZoom;
        setZoomDisplay(currentZoom);
      }
      
      drawCanvas();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, drawCanvas, simSpeed]);

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
        const isConjunctionPair = selectedConjunction && (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);
        const selectedObjectMatchesConjunction = selectedConjunction && selectedObject && (selectedConjunction.objectA?.id === selectedObject.id || selectedConjunction.objectB?.id === selectedObject.id);
        const mode = (selectedConjunction && (!selectedObject || selectedObjectMatchesConjunction)) ? 'CONJUNCTION' : (selectedObject ? 'OBJECT' : 'ALL');

        if (mode === 'CONJUNCTION' && !isConjunctionPair) continue;
        if (mode === 'OBJECT' && selectedObject?.id !== obj.id) continue;

        const stepFloat = simTimeStepRef.current;
        const pt = getInterpolatedPosition(obj, stepFloat);
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
        const isConjunctionPair = selectedConjunction && (selectedConjunction.objectA?.id === obj.id || selectedConjunction.objectB?.id === obj.id);
        const selectedObjectMatchesConjunction = selectedConjunction && selectedObject && (selectedConjunction.objectA?.id === selectedObject.id || selectedConjunction.objectB?.id === selectedObject.id);
        const mode = (selectedConjunction && (!selectedObject || selectedObjectMatchesConjunction)) ? 'CONJUNCTION' : (selectedObject ? 'OBJECT' : 'ALL');

        if (mode === 'CONJUNCTION' && !isConjunctionPair) continue;
        if (mode === 'OBJECT' && selectedObject?.id !== obj.id) continue;

        const stepFloat = simTimeStepRef.current;
        const pt = getInterpolatedPosition(obj, stepFloat);
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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // deltaY < 0 is scroll up (zoom in), deltaY > 0 is scroll down (zoom out)
    let newZoom = targetZoomRef.current;
    if (e.deltaY < 0) {
      newZoom = Math.min(4.0, newZoom + 0.15);
    } else if (e.deltaY > 0) {
      newZoom = Math.max(0.5, newZoom - 0.15);
    }
    targetZoomRef.current = newZoom;
    setZoomDisplay(Number(newZoom.toFixed(1)));
  };

  const handleResetTime = () => {
    simTimeStepRef.current = 0;
    setClockDisplay(0);
  };

  const activeCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'ACTIVE_SATELLITE').length : 0;
  const debrisCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'DEBRIS').length : 0;
  const rbCount = Array.isArray(objects) ? objects.filter((o) => o.classification === 'ROCKET_BODY').length : 0;

  return (
    <div className="o2-shell">
      {/* ── Top bar ── */}
      <header className="o2-topbar">
        <div className="o2-topbar-left">
          <span className="o2-topbar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="12" rx="10" ry="4.5"/>
              <ellipse cx="12" cy="12" rx="4.5" ry="10" transform="rotate(60 12 12)"/>
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
          </span>
          <span className="o2-topbar-title">2D Orbital Projection</span>
        </div>
        <div className="o2-topbar-right">
          {onClose && (
            <button className="o2-btn-return" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M3.6 9h16.8M3.6 15h16.8"/>
                <path d="M12 3c-2.5 3.5-2.5 14.5 0 18M12 3c2.5 3.5 2.5 14.5 0 18"/>
              </svg>
              Return to 3D
            </button>
          )}
        </div>
      </header>

      {/* ── Canvas area ── */}
      <div className="o2-canvas-wrap flex-1 w-full relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onWheel={handleWheel}
          onMouseLeave={() => { setHoveredObject(null); setTooltipPos(null); }}
          className="w-full h-full block cursor-crosshair touch-none absolute inset-0 z-0"
        />

        {/* Legend overlay */}
        <div className="o2-legend">
          <div className="o2-legend-item">
            <span className="o2-ldot green"></span>
            SATS <span className="o2-lcount">{activeCount}</span>
          </div>
          <div className="o2-legend-item">
            <span className="o2-ldot red"></span>
            DEBRIS <span className="o2-lcount">{debrisCount}</span>
          </div>
          <div className="o2-legend-item">
            <span className="o2-ldot blue"></span>
            R/B <span className="o2-lcount">{rbCount}</span>
          </div>
        </div>

        {/* Plane / zoom controls */}
        <div className="o2-plane-ctrl">
          <span className="o2-plane-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <ellipse cx="12" cy="12" rx="9" ry="4.2"/>
              <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
            </svg>
            Plane:
          </span>
          <div className="o2-plane-btns">
            <button className={`o2-plane-btn ${plane === 'XY' ? 'active' : ''}`} onClick={() => setPlane('XY')}>XY</button>
            <button className={`o2-plane-btn ${plane === 'XZ' ? 'active' : ''}`} onClick={() => setPlane('XZ')}>XZ</button>
            <button className={`o2-plane-btn ${plane === 'YZ' ? 'active' : ''}`} onClick={() => setPlane('YZ')}>YZ</button>
          </div>
          <div className="o2-plane-divider"></div>
          <div className="o2-zoom-controls">
            <button className="o2-zoom-btn" title="Zoom out" onClick={() => { targetZoomRef.current = Math.max(0.5, targetZoomRef.current - 0.3); setZoomDisplay(Number(targetZoomRef.current.toFixed(1))); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M8 11h6"/></svg>
            </button>
            <span className="o2-zoom-info">{(zoomDisplay * 100).toFixed(0)}%</span>
            <button className="o2-zoom-btn" title="Zoom in" onClick={() => { targetZoomRef.current = Math.min(4.0, targetZoomRef.current + 0.3); setZoomDisplay(Number(targetZoomRef.current.toFixed(1))); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>
            </button>
          </div>
        </div>

        {/* Conjunction Sync Overlay */}
        {syncState && syncState.isActive && selectedConjunction && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-slate-950/95 backdrop-blur-md border border-cyan-500/60 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-1.5 text-xs font-mono max-w-[92vw]">
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

        {/* Satellite tooltip */}
        {hoveredObject && tooltipPos && (
          <div
            className="o2-sat-tooltip show"
            style={{
              left: Math.min(tooltipPos.x, window.innerWidth - 100),
              top: Math.max(0, tooltipPos.y)
            }}
          >
            <div className="o2-tt-header">
              <span className="o2-tt-dot" style={{ background: hoveredObject.classification === 'DEBRIS' ? 'var(--o2-red)' : hoveredObject.classification === 'ROCKET_BODY' ? 'var(--o2-blue)' : 'var(--o2-green)' }}></span>
              <span className="o2-tt-name" style={{ color: hoveredObject.classification === 'DEBRIS' ? 'var(--o2-red)' : hoveredObject.classification === 'ROCKET_BODY' ? 'var(--o2-blue)' : 'var(--o2-green)' }}>{hoveredObject.name}</span>
              <span className="o2-tt-live"></span>
            </div>
            <div className="o2-tt-sep"></div>
            <div className="o2-tt-row">NORAD ID: <span>#{hoveredObject.noradId}</span></div>
            <div className="o2-tt-row">Type: <span>{hoveredObject.classification}</span></div>
            <div className="o2-tt-row o2-tt-hi">Altitude: <span>{(hoveredObject.altitudeKm ?? 0).toFixed(1)} km</span></div>
            <div className="o2-tt-row o2-tt-hi">Speed: <span>{(hoveredObject.speedKmS ?? 0).toFixed(2)} km/s</span></div>
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <footer className="o2-bottombar">
        <div className="o2-bottombar-left">
          <button className={`o2-ctrl-btn ${!isPlaying ? 'active' : ''}`} onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            )}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="o2-ctrl-btn" onClick={handleResetTime} title="Reset Time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
          <div className="o2-timer-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 3"/>
            </svg>
            T+ <span className="o2-timer-val">{Math.floor(clockDisplay / 60)}h {(clockDisplay % 60).toString().padStart(2, '0')}m</span>
          </div>
        </div>
        <div className="o2-bottombar-right">
          <span className="o2-frame-display">
            <span className="o2-frame-display-label">Frame:</span>
            <span className="o2-frame-display-eci">ECI</span>
            <span className="o2-frame-display-sep">|</span>
            <span className="o2-frame-display-plane">{plane}-PLANE</span>
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Orbit2DView;
