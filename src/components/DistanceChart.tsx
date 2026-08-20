import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Clock, ShieldAlert, Crosshair, AlertTriangle, RefreshCw } from 'lucide-react';
import { ConjunctionEvent, ConjunctionHistory } from '../types';

interface DistanceChartProps {
  conjunction: ConjunctionEvent | null;
}

export const DistanceChart: React.FC<DistanceChartProps> = ({ conjunction }) => {
  const [history, setHistory] = useState<ConjunctionHistory | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!conjunction || !conjunction.id) {
      setHistory(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/conjunctions/${conjunction.id}/distance-history`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        return res.json();
      })
      .then((data: any) => {
        if (isMounted) {
          if (data && Array.isArray(data.points) && data.points.length > 0) {
            setHistory(data as ConjunctionHistory);
          } else {
            setHistory(null);
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setHistory(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [conjunction?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear with Aerospace Glass background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    const points = history?.points;
    if (!points || !Array.isArray(points) || points.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Separation profile updating...', width / 2, height / 2);
      return;
    }

    const padding = { top: 25, right: 35, bottom: 40, left: 55 };

    const validDistances = points.map((p) => (typeof p.distanceKm === 'number' ? p.distanceKm : 10));
    const maxDist = Math.max(15, ...validDistances);
    const minDist = 0;

    const minTimeOffset = points[0]?.timeOffsetMin ?? -30;
    const maxTimeOffset = points[points.length - 1]?.timeOffsetMin ?? 30;
    const timeSpan = Math.max(1, maxTimeOffset - minTimeOffset);

    const getX = (offsetMin: number) => {
      return (
        padding.left +
        ((offsetMin - minTimeOffset) / timeSpan) *
          (width - padding.left - padding.right)
      );
    };

    const getY = (distKm: number) => {
      return (
        padding.top +
        (1 - (distKm - minDist) / Math.max(1, maxDist - minDist)) *
          (height - padding.top - padding.bottom)
      );
    };

    // Draw Risk Zones (Background fills)
    const y10 = getY(10);
    const y5 = getY(5);
    const y2 = getY(2);
    const y1 = getY(1);
    const y0 = getY(0);

    // < 1 km (Critical)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(padding.left, y1, width - padding.left - padding.right, y0 - y1);

    // 1 - 2 km (High)
    ctx.fillStyle = 'rgba(249, 115, 22, 0.1)';
    ctx.fillRect(padding.left, y2, width - padding.left - padding.right, y1 - y2);

    // 2 - 5 km (Medium)
    ctx.fillStyle = 'rgba(234, 179, 8, 0.05)';
    ctx.fillRect(padding.left, y5, width - padding.left - padding.right, y2 - y5);

    // Grid lines & Y-axis labels
    const yTicks = [0, 1, 2, 5, 10, Math.round(maxDist)];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    for (const tick of yTicks) {
      if (tick > maxDist) continue;
      const y = getY(tick);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${tick} km`, padding.left - 6, y + 3);
    }

    // X-axis time ticks
    ctx.textAlign = 'center';
    const xTicks = [-40, -20, 0, 20, 40];
    for (const tick of xTicks) {
      if (tick < minTimeOffset || tick > maxTimeOffset) continue;
      const x = getX(tick);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.strokeStyle = tick === 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.05)';
      ctx.setLineDash(tick === 0 ? [3, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(tick === 0 ? 'TCA (0m)' : `${tick > 0 ? '+' : ''}${tick}m`, x, height - padding.bottom + 15);
    }

    // Distance Curve
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#3b82f6';

    for (let i = 0; i < points.length; i++) {
      const px = getX(points[i].timeOffsetMin);
      const py = getY(points[i].distanceKm);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Mark Minimum Distance (TCA Point)
    let minPoint = points[0];
    for (const p of points) {
      if (p.distanceKm < minPoint.distanceKm) {
        minPoint = p;
      }
    }

    if (minPoint) {
      const tcaX = getX(minPoint.timeOffsetMin);
      const tcaY = getY(minPoint.distanceKm);

      // Glowing TCA marker
      ctx.beginPath();
      ctx.arc(tcaX, tcaY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // TCA callout label
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(tcaX - 45, tcaY - 26, 90, 20);
      ctx.strokeStyle = '#fecaca';
      ctx.strokeRect(tcaX - 45, tcaY - 26, 90, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Min: ${minPoint.distanceKm.toFixed(2)} km`, tcaX, tcaY - 13);
    }
  }, [history]);

  if (!conjunction) {
    return (
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-[280px] shadow-2xl">
        <LineChart className="w-8 h-8 text-slate-700 mb-2" />
        <p className="font-semibold text-slate-400">No Conjunction Event Selected</p>
        <p className="mt-1 max-w-xs text-slate-500 font-medium">Select any event from the Conjunction Alert list to analyze its separation curve.</p>
      </div>
    );
  }

  return (
    <div id="distance-chart-panel" className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-slate-900/40 backdrop-blur-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LineChart className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-white">
            Separation vs. Time
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-bold shadow-inner">
            Min {(conjunction.minDistanceKm ?? 0).toFixed(2)} km
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="p-2 relative h-[220px] bg-[#020617]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 text-blue-400 gap-2 text-xs backdrop-blur-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="font-semibold tracking-wider">Calculating trajectory separation profile...</span>
          </div>
        ) : null}
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Threshold Key */}
      <div className="px-4 py-2.5 bg-slate-900/40 backdrop-blur-xl border-t border-white/5 flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-medium">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/40 border border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
            <span>&lt; 1km (Crit)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-orange-500/40 border border-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.5)]" />
            <span>1–2km (High)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500/30 border border-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]" />
            <span>2–5km (Med)</span>
          </div>
        </div>
        <div className="font-mono text-slate-400">
          Rel Speed: <span className="text-white font-bold">{(conjunction.relativeVelocityKmS ?? 0).toFixed(2)} km/s</span>
        </div>
      </div>
    </div>
  );
};
