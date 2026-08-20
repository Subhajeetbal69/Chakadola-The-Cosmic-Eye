import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  LineChart,
  RefreshCw,
  Target,
  Clock,
  ShieldAlert,
  Zap,
  Focus,
  AlertTriangle,
  Radio,
  WifiOff,
  Activity,
  Layers,
  Sparkles,
  ChevronRight,
  Eye,
  Info
} from 'lucide-react';
import {
  ConjunctionEvent,
  ConjunctionHistory,
  ConjunctionSyncState,
  PropagationAnomalyType,
  DistanceTimePoint
} from '../types';

interface DistanceChartProps {
  conjunction: ConjunctionEvent | null;
  onSyncZoom?: (syncState: ConjunctionSyncState) => void;
  syncState?: ConjunctionSyncState | null;
}

type WindowSpanMinutes = 30 | 60 | 90;

interface HoveredDataPoint {
  timeOffsetMin: number;
  distanceKm: number;
  timeIso: string;
  x: number;
  y: number;
  riskZone: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'SAFE';
  isAnomaly?: boolean;
  anomalyType?: PropagationAnomalyType;
  anomalyMagnitudeKm?: number;
  anomalyReason?: string;
  confidencePercent?: number;
  upperUncertaintyKm?: number;
  lowerUncertaintyKm?: number;
}

export const DistanceChart: React.FC<DistanceChartProps> = ({
  conjunction,
  onSyncZoom,
  syncState
}) => {
  const [history, setHistory] = useState<ConjunctionHistory | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [windowSpan, setWindowSpan] = useState<WindowSpanMinutes>(30);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredDataPoint | null>(null);
  const [showAnomalies, setShowAnomalies] = useState<boolean>(true);
  const [selectedAnomalyOffset, setSelectedAnomalyOffset] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  const isSyncActive = Boolean(
    syncState &&
    syncState.isActive &&
    conjunction &&
    syncState.conjunctionId === conjunction.id
  );

  const handleTriggerSyncZoom = useCallback((timeOffsetMin: number = 0) => {
    if (!conjunction || !onSyncZoom) return;

    // Calculate relative seconds offset from now to encounter TCA + scrubber offset
    const baseTcaSeconds = (conjunction.timeToEventHours || 0) * 3600;
    const totalSecondsOffset = baseTcaSeconds + timeOffsetMin * 60;

    const payload: ConjunctionSyncState = {
      conjunctionId: conjunction.id,
      tcaIso: conjunction.tcaIso,
      timeOffsetMin,
      tcaSecondsOffset: totalSecondsOffset,
      minDistanceKm: conjunction.minDistanceKm,
      positionA: conjunction.positionAAtTca,
      positionB: conjunction.positionBAtTca,
      timestamp: Date.now(),
      isActive: true
    };

    onSyncZoom(payload);
  }, [conjunction, onSyncZoom]);

  // Fetch separation history when conjunction or window span changes
  useEffect(() => {
    if (!conjunction || !conjunction.id) {
      setHistory(null);
      setHoveredPoint(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setHoveredPoint(null);

    fetch(`/api/conjunctions/${conjunction.id}/distance-history?spanMinutes=${windowSpan}`)
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
      .catch(() => {
        if (isMounted) {
          setHistory(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [conjunction?.id, windowSpan]);

  // Identify distinct anomaly epoch groups for quick-jump controls
  const anomalyKeyEvents = React.useMemo(() => {
    if (!history?.points) return [];
    const events: {
      type: PropagationAnomalyType;
      centerOffsetMin: number;
      label: string;
      reason: string;
      magnitudeKm: number;
      confidence: number;
      point: DistanceTimePoint;
    }[] = [];

    let currentAnomalyPoints: DistanceTimePoint[] = [];
    let lastType: PropagationAnomalyType | undefined;

    for (const p of history.points) {
      if (p.isAnomaly && p.anomalyType) {
        if (!lastType || p.anomalyType === lastType) {
          currentAnomalyPoints.push(p);
          lastType = p.anomalyType;
        } else {
          // Wrap previous group
          if (currentAnomalyPoints.length > 0) {
            const peak = currentAnomalyPoints.reduce((max, pt) =>
              (pt.anomalyMagnitudeKm || 0) > (max.anomalyMagnitudeKm || 0) ? pt : max
            , currentAnomalyPoints[0]);
            events.push({
              type: lastType!,
              centerOffsetMin: peak.timeOffsetMin,
              label: lastType === 'ORBITAL_DEVIATION' ? 'SGP4 Deviation' : 'Telemetry Gap',
              reason: peak.anomalyReason || 'Orbital model discontinuity',
              magnitudeKm: peak.anomalyMagnitudeKm || 0.4,
              confidence: peak.confidencePercent || 70,
              point: peak
            });
          }
          currentAnomalyPoints = [p];
          lastType = p.anomalyType;
        }
      } else if (currentAnomalyPoints.length > 0) {
        // Closed group
        const peak = currentAnomalyPoints.reduce((max, pt) =>
          (pt.anomalyMagnitudeKm || 0) > (max.anomalyMagnitudeKm || 0) ? pt : max
        , currentAnomalyPoints[0]);
        events.push({
          type: lastType!,
          centerOffsetMin: peak.timeOffsetMin,
          label: lastType === 'ORBITAL_DEVIATION' ? 'SGP4 Deviation' : 'Telemetry Gap',
          reason: peak.anomalyReason || 'Orbital model discontinuity',
          magnitudeKm: peak.anomalyMagnitudeKm || 0.4,
          confidence: peak.confidencePercent || 70,
          point: peak
        });
        currentAnomalyPoints = [];
        lastType = undefined;
      }
    }

    if (currentAnomalyPoints.length > 0 && lastType) {
      const peak = currentAnomalyPoints.reduce((max, pt) =>
        (pt.anomalyMagnitudeKm || 0) > (max.anomalyMagnitudeKm || 0) ? pt : max
      , currentAnomalyPoints[0]);
      events.push({
        type: lastType,
        centerOffsetMin: peak.timeOffsetMin,
        label: lastType === 'ORBITAL_DEVIATION' ? 'SGP4 Deviation' : 'Telemetry Gap',
        reason: peak.anomalyReason || 'Orbital model discontinuity',
        magnitudeKm: peak.anomalyMagnitudeKm || 0.4,
        confidence: peak.confidencePercent || 70,
        point: peak
      });
    }

    return events;
  }, [history]);

  // Main Canvas Rendering Function with Anomaly Highlight Indicators & Uncertainty Bands
  const renderChart = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = canvasWrapperRef.current;
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = rect.width;
    const height = rect.height;

    // Set internal resolution strictly matching container
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Solid deep space dark background to avoid any transparency bleed
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);

    const points = history?.points;
    if (!points || !Array.isArray(points) || points.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        isLoading ? 'Calculating high-resolution separation profile...' : 'No separation profile available',
        width / 2,
        height / 2
      );
      ctx.restore();
      return;
    }

    const padding = { top: 24, right: 32, bottom: 32, left: 56 };
    const chartWidth = Math.max(10, width - padding.left - padding.right);
    const chartHeight = Math.max(10, height - padding.top - padding.bottom);

    // Calculate nice Y range with clean steps
    const validDistances = points
      .map((p) => (typeof p.distanceKm === 'number' && !isNaN(p.distanceKm) ? p.distanceKm : 10))
      .filter((d) => d >= 0);

    const rawMax = Math.max(...validDistances, 5);

    let maxDist = 15;
    if (rawMax <= 6) maxDist = 6;
    else if (rawMax <= 12) maxDist = 12;
    else if (rawMax <= 20) maxDist = 20;
    else if (rawMax <= 35) maxDist = 35;
    else if (rawMax <= 60) maxDist = 60;
    else maxDist = Math.ceil(rawMax / 10) * 10;

    const minDist = 0;

    const minTimeOffset = points[0]?.timeOffsetMin ?? -(windowSpan / 2);
    const maxTimeOffset = points[points.length - 1]?.timeOffsetMin ?? windowSpan / 2;
    const timeSpan = Math.max(0.1, maxTimeOffset - minTimeOffset);

    const getX = (offsetMin: number) => {
      return padding.left + ((offsetMin - minTimeOffset) / timeSpan) * chartWidth;
    };

    const getY = (distKm: number) => {
      const clamped = Math.max(minDist, Math.min(maxDist, distKm));
      return padding.top + (1 - (clamped - minDist) / (maxDist - minDist)) * chartHeight;
    };

    // =========================================================================
    // 1. VISUAL HIGHLIGHT INDICATOR: ANOMALY BACKGROUND BANDS & SHADED REGIONS
    // =========================================================================
    if (showAnomalies) {
      let currentRegion: {
        type: PropagationAnomalyType;
        startOffset: number;
        endOffset: number;
      } | null = null;

      const anomalyRegions: {
        type: PropagationAnomalyType;
        startOffset: number;
        endOffset: number;
      }[] = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (pt.isAnomaly && pt.anomalyType) {
          if (!currentRegion) {
            currentRegion = {
              type: pt.anomalyType,
              startOffset: pt.timeOffsetMin,
              endOffset: pt.timeOffsetMin
            };
          } else if (currentRegion.type === pt.anomalyType) {
            currentRegion.endOffset = pt.timeOffsetMin;
          } else {
            anomalyRegions.push(currentRegion);
            currentRegion = {
              type: pt.anomalyType,
              startOffset: pt.timeOffsetMin,
              endOffset: pt.timeOffsetMin
            };
          }
        } else if (currentRegion) {
          anomalyRegions.push(currentRegion);
          currentRegion = null;
        }
      }
      if (currentRegion) {
        anomalyRegions.push(currentRegion);
      }

      // Draw highlighted vertical alert bands for detected anomalies & telemetry gaps
      for (const region of anomalyRegions) {
        const x1 = Math.max(padding.left, getX(region.startOffset));
        const x2 = Math.min(padding.left + chartWidth, getX(region.endOffset));
        const bandWidth = Math.max(6, x2 - x1);

        const isDev = region.type === 'ORBITAL_DEVIATION';
        const isGap = region.type === 'TELEMETRY_GAP';

        // Shaded fill
        ctx.fillStyle = isDev ? 'rgba(245, 158, 11, 0.10)' : 'rgba(168, 85, 247, 0.12)';
        ctx.fillRect(x1, padding.top, bandWidth, chartHeight);

        // Subtle hatched stripes inside anomaly region
        ctx.strokeStyle = isDev ? 'rgba(245, 158, 11, 0.18)' : 'rgba(168, 85, 247, 0.20)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);

        ctx.beginPath();
        ctx.moveTo(x1, padding.top);
        ctx.lineTo(x1, padding.top + chartHeight);
        ctx.moveTo(x2, padding.top);
        ctx.lineTo(x2, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Top Flag Badge on Canvas
        const badgeX = x1 + bandWidth / 2;
        const badgeLabel = isDev ? '⚠️ SGP4 DEVIATION' : '📡 TELEMETRY GAP';
        ctx.font = 'bold 9px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';

        const textWidth = ctx.measureText(badgeLabel).width;
        ctx.fillStyle = isDev ? 'rgba(245, 158, 11, 0.85)' : 'rgba(168, 85, 247, 0.85)';
        ctx.fillRect(badgeX - textWidth / 2 - 4, padding.top + 2, textWidth + 8, 13);

        ctx.fillStyle = '#0f172a';
        ctx.fillText(badgeLabel, badgeX, padding.top + 11.5);
      }
    }

    // =========================================================================
    // 2. Y-AXIS GRID LINES & TICKS
    // =========================================================================
    const stepCount = chartHeight > 160 ? 3 : 2;
    const stepValue = maxDist / stepCount;
    const yTicks: number[] = [];
    for (let i = 0; i <= stepCount; i++) {
      yTicks.push(Math.round(i * stepValue * 10) / 10);
    }

    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';

    for (const tick of yTicks) {
      const y = getY(tick);

      // Subtle horizontal grid line
      ctx.beginPath();
      ctx.strokeStyle = tick === 0 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      // Clean single-line numeric label with crisp solid color
      ctx.fillStyle = tick === 0 ? '#94a3b8' : '#64748b';
      ctx.fillText(`${tick} km`, padding.left - 8, y + 3.5);
    }

    // =========================================================================
    // 3. X-AXIS GRID LINES & TICKS
    // =========================================================================
    const halfSpan = windowSpan / 2;
    const xTicks = [-halfSpan, -halfSpan / 2, 0, halfSpan / 2, halfSpan];

    ctx.textAlign = 'center';
    for (const tick of xTicks) {
      if (tick < minTimeOffset || tick > maxTimeOffset) continue;
      const x = getX(tick);
      const isTca = Math.abs(tick) < 0.01;

      ctx.beginPath();
      ctx.strokeStyle = isTca ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash(isTca ? [3, 3] : []);
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isTca ? '#ef4444' : '#64748b';
      ctx.font = isTca ? 'bold 10px ui-monospace, monospace' : '10px ui-monospace, monospace';
      ctx.fillText(isTca ? 'TCA (0m)' : `${tick > 0 ? '+' : ''}${tick}m`, x, padding.top + chartHeight + 16);
    }

    // =========================================================================
    // 4. UNCERTAINTY DISPERSION RIBBON (±1 SIGMA COVARIANCE ENVELOPE)
    // =========================================================================
    if (showAnomalies && points.length > 1) {
      const upperCoords = points.map((p) => ({
        x: getX(p.timeOffsetMin),
        y: getY(p.upperUncertaintyKm ?? p.distanceKm + 0.1)
      }));

      const lowerCoords = points.map((p) => ({
        x: getX(p.timeOffsetMin),
        y: getY(p.lowerUncertaintyKm ?? Math.max(0.01, p.distanceKm - 0.1))
      }));

      // Draw uncertainty envelope fill
      ctx.beginPath();
      ctx.moveTo(upperCoords[0].x, upperCoords[0].y);
      for (let i = 1; i < upperCoords.length; i++) {
        ctx.lineTo(upperCoords[i].x, upperCoords[i].y);
      }
      for (let i = lowerCoords.length - 1; i >= 0; i--) {
        ctx.lineTo(lowerCoords[i].x, lowerCoords[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.fill();

      // Draw upper and lower dashed uncertainty boundary lines
      ctx.beginPath();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 1;

      ctx.moveTo(upperCoords[0].x, upperCoords[0].y);
      for (let i = 1; i < upperCoords.length; i++) {
        ctx.lineTo(upperCoords[i].x, upperCoords[i].y);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lowerCoords[0].x, lowerCoords[0].y);
      for (let i = 1; i < lowerCoords.length; i++) {
        ctx.lineTo(lowerCoords[i].x, lowerCoords[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // =========================================================================
    // 5. SMOOTH DISTANCE SEPARATION CURVE (MONOTONIC CUBIC BÉZIER)
    // =========================================================================
    const pixelCoords = points.map((p) => ({
      x: getX(p.timeOffsetMin),
      y: getY(p.distanceKm),
      isAnomaly: p.isAnomaly,
      anomalyType: p.anomalyType
    }));

    if (pixelCoords.length > 1) {
      // Area gradient under the smooth curve
      const areaGradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      areaGradient.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
      areaGradient.addColorStop(0.6, 'rgba(56, 189, 248, 0.05)');
      areaGradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

      // Draw Filled Smooth Area
      ctx.beginPath();
      ctx.moveTo(pixelCoords[0].x, padding.top + chartHeight);
      ctx.lineTo(pixelCoords[0].x, pixelCoords[0].y);

      for (let i = 0; i < pixelCoords.length - 1; i++) {
        const p0 = pixelCoords[Math.max(0, i - 1)];
        const p1 = pixelCoords[i];
        const p2 = pixelCoords[i + 1];
        const p3 = pixelCoords[Math.min(pixelCoords.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }

      ctx.lineTo(pixelCoords[pixelCoords.length - 1].x, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = areaGradient;
      ctx.fill();

      // Draw Glowing Smooth Separation Line
      ctx.shadowColor = 'rgba(56, 189, 248, 0.35)';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#38bdf8';

      ctx.moveTo(pixelCoords[0].x, pixelCoords[0].y);
      for (let i = 0; i < pixelCoords.length - 1; i++) {
        const p0 = pixelCoords[Math.max(0, i - 1)];
        const p1 = pixelCoords[i];
        const p2 = pixelCoords[i + 1];
        const p3 = pixelCoords[Math.min(pixelCoords.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // =========================================================================
    // 6. VISUAL HIGHLIGHT INDICATOR: ANOMALY BEACON / DIAMOND MARKERS ON CURVE
    // =========================================================================
    if (showAnomalies && anomalyKeyEvents.length > 0) {
      for (const event of anomalyKeyEvents) {
        const pX = getX(event.centerOffsetMin);
        const pY = getY(event.point.distanceKm);
        const isDev = event.type === 'ORBITAL_DEVIATION';

        // Outer glow halo ring
        ctx.beginPath();
        ctx.arc(pX, pY, 10, 0, Math.PI * 2);
        ctx.fillStyle = isDev ? 'rgba(245, 158, 11, 0.20)' : 'rgba(168, 85, 247, 0.20)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pX, pY, 10, 0, Math.PI * 2);
        ctx.strokeStyle = isDev ? 'rgba(245, 158, 11, 0.6)' : 'rgba(168, 85, 247, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Diamond glyph for orbital deviation, Octagon / circle for telemetry gap
        ctx.beginPath();
        if (isDev) {
          // Diamond shape
          const s = 5.5;
          ctx.moveTo(pX, pY - s);
          ctx.lineTo(pX + s, pY);
          ctx.lineTo(pX, pY + s);
          ctx.lineTo(pX - s, pY);
          ctx.closePath();
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          // Beacon circle with cross
          ctx.arc(pX, pY, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#a855f7';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Small indicator pulse
        if (selectedAnomalyOffset === event.centerOffsetMin) {
          ctx.beginPath();
          ctx.arc(pX, pY, 16, 0, Math.PI * 2);
          ctx.strokeStyle = isDev ? '#f59e0b' : '#a855f7';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // =========================================================================
    // 7. MINIMUM DISTANCE (TCA POINT) MARKER WITH RADAR RINGS
    // =========================================================================
    let minPoint = points[0];
    for (const p of points) {
      if (p.distanceKm < minPoint.distanceKm) {
        minPoint = p;
      }
    }

    if (minPoint) {
      const tcaX = getX(minPoint.timeOffsetMin);
      const tcaY = getY(minPoint.distanceKm);

      // If Sync is active, draw prominent glowing radar rings on TCA point
      if (isSyncActive) {
        ctx.beginPath();
        ctx.arc(tcaX, tcaY, 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(tcaX, tcaY, 15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Indicator on TCA
      ctx.beginPath();
      ctx.arc(tcaX, tcaY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // =========================================================================
    // 8. HOVER CROSSHAIR & POINT TRACKER
    // =========================================================================
    if (hoveredPoint) {
      const hX = hoveredPoint.x;
      const hY = hoveredPoint.y;

      const isDev = hoveredPoint.anomalyType === 'ORBITAL_DEVIATION';
      const isGap = hoveredPoint.anomalyType === 'TELEMETRY_GAP';

      // Crosshair lines
      ctx.beginPath();
      ctx.strokeStyle = isDev
        ? 'rgba(245, 158, 11, 0.8)'
        : isGap
        ? 'rgba(168, 85, 247, 0.8)'
        : 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(hX, padding.top);
      ctx.lineTo(hX, padding.top + chartHeight);
      ctx.moveTo(padding.left, hY);
      ctx.lineTo(padding.left + chartWidth, hY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer glow circle
      ctx.beginPath();
      ctx.arc(hX, hY, 8, 0, Math.PI * 2);
      ctx.fillStyle = isDev
        ? 'rgba(245, 158, 11, 0.25)'
        : isGap
        ? 'rgba(168, 85, 247, 0.25)'
        : 'rgba(56, 189, 248, 0.25)';
      ctx.fill();

      // Solid inner point
      ctx.beginPath();
      ctx.arc(hX, hY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isDev ? '#f59e0b' : isGap ? '#a855f7' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }, [history, hoveredPoint, windowSpan, isLoading, showAnomalies, anomalyKeyEvents, selectedAnomalyOffset, isSyncActive]);

  // Handle ResizeObserver to completely prevent canvas stretching
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        renderChart();
      });
    });

    observer.observe(wrapper);
    renderChart();

    return () => {
      observer.disconnect();
    };
  }, [renderChart]);

  // Handle Mouse Move over Canvas to Live Track and Display Values on Hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper || !history?.points || history.points.length === 0) return;

    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const padding = { top: 24, right: 32, bottom: 32, left: 56 };
    const chartWidth = Math.max(10, rect.width - padding.left - padding.right);
    const chartHeight = Math.max(10, rect.height - padding.top - padding.bottom);

    const points = history.points;
    const validDistances = points.map((p) => (typeof p.distanceKm === 'number' && !isNaN(p.distanceKm) ? p.distanceKm : 10));
    const rawMax = Math.max(...validDistances, 5);

    let maxDist = 15;
    if (rawMax <= 6) maxDist = 6;
    else if (rawMax <= 12) maxDist = 12;
    else if (rawMax <= 20) maxDist = 20;
    else if (rawMax <= 35) maxDist = 35;
    else if (rawMax <= 60) maxDist = 60;
    else maxDist = Math.ceil(rawMax / 10) * 10;

    const minDist = 0;
    const minTimeOffset = points[0]?.timeOffsetMin ?? -(windowSpan / 2);
    const maxTimeOffset = points[points.length - 1]?.timeOffsetMin ?? windowSpan / 2;
    const timeSpan = Math.max(0.1, maxTimeOffset - minTimeOffset);

    // Find nearest point along horizontal axis
    let closest = points[0];
    let minDiff = Infinity;

    for (const p of points) {
      const px = padding.left + ((p.timeOffsetMin - minTimeOffset) / timeSpan) * chartWidth;
      const diff = Math.abs(px - mouseX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }

    if (closest) {
      const px = padding.left + ((closest.timeOffsetMin - minTimeOffset) / timeSpan) * chartWidth;
      const py = padding.top + (1 - (closest.distanceKm - minDist) / (maxDist - minDist)) * chartHeight;

      let riskZone: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'SAFE' = 'SAFE';
      if (closest.distanceKm < 1.0) riskZone = 'CRITICAL';
      else if (closest.distanceKm < 2.0) riskZone = 'HIGH';
      else if (closest.distanceKm < 5.0) riskZone = 'MEDIUM';

      setHoveredPoint({
        timeOffsetMin: closest.timeOffsetMin,
        distanceKm: closest.distanceKm,
        timeIso: closest.timeIso,
        x: px,
        y: py,
        riskZone,
        isAnomaly: closest.isAnomaly,
        anomalyType: closest.anomalyType,
        anomalyMagnitudeKm: closest.anomalyMagnitudeKm,
        anomalyReason: closest.anomalyReason,
        confidencePercent: closest.confidencePercent,
        upperUncertaintyKm: closest.upperUncertaintyKm,
        lowerUncertaintyKm: closest.lowerUncertaintyKm
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const handleCanvasClick = () => {
    if (hoveredPoint) {
      handleTriggerSyncZoom(hoveredPoint.timeOffsetMin);
    } else {
      handleTriggerSyncZoom(0);
    }
  };

  const jumpToAnomaly = (event: typeof anomalyKeyEvents[0]) => {
    setSelectedAnomalyOffset(event.centerOffsetMin);
    handleTriggerSyncZoom(event.centerOffsetMin);

    const pt = event.point;
    const padding = { top: 24, right: 32, bottom: 32, left: 56 };
    const wrapper = canvasWrapperRef.current;
    if (wrapper && history?.points) {
      const rect = wrapper.getBoundingClientRect();
      const chartWidth = Math.max(10, rect.width - padding.left - padding.right);
      const chartHeight = Math.max(10, rect.height - padding.top - padding.bottom);
      const minTimeOffset = history.points[0]?.timeOffsetMin ?? -(windowSpan / 2);
      const maxTimeOffset = history.points[history.points.length - 1]?.timeOffsetMin ?? windowSpan / 2;
      const timeSpan = Math.max(0.1, maxTimeOffset - minTimeOffset);

      const px = padding.left + ((pt.timeOffsetMin - minTimeOffset) / timeSpan) * chartWidth;
      const validDistances = history.points.map((p) => (typeof p.distanceKm === 'number' && !isNaN(p.distanceKm) ? p.distanceKm : 10));
      const rawMax = Math.max(...validDistances, 5);
      const maxDist = rawMax <= 6 ? 6 : rawMax <= 12 ? 12 : rawMax <= 20 ? 20 : rawMax <= 35 ? 35 : rawMax <= 60 ? 60 : Math.ceil(rawMax / 10) * 10;
      const py = padding.top + (1 - (pt.distanceKm / maxDist)) * chartHeight;

      setHoveredPoint({
        timeOffsetMin: pt.timeOffsetMin,
        distanceKm: pt.distanceKm,
        timeIso: pt.timeIso,
        x: px,
        y: py,
        riskZone: pt.distanceKm < 1.0 ? 'CRITICAL' : pt.distanceKm < 2.0 ? 'HIGH' : pt.distanceKm < 5.0 ? 'MEDIUM' : 'SAFE',
        isAnomaly: pt.isAnomaly,
        anomalyType: pt.anomalyType,
        anomalyMagnitudeKm: pt.anomalyMagnitudeKm,
        anomalyReason: pt.anomalyReason,
        confidencePercent: pt.confidencePercent,
        upperUncertaintyKm: pt.upperUncertaintyKm,
        lowerUncertaintyKm: pt.lowerUncertaintyKm
      });
    }
  };

  if (!conjunction) {
    return (
      <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-[300px] shadow-2xl">
        <LineChart className="w-8 h-8 text-slate-700 mb-2" />
        <p className="font-semibold text-slate-400">No Conjunction Event Selected</p>
        <p className="mt-1 max-w-xs text-slate-500 font-medium">
          Select an event from the alert table to view its separation trajectory.
        </p>
      </div>
    );
  }

  const objAName = conjunction.objectA?.name || 'Primary';
  const objBName = conjunction.objectB?.name || 'Secondary';
  const minMissDist = conjunction.minDistanceKm ?? 0;

  return (
    <div
      id="distance-chart-panel"
      className={`bg-slate-900/90 border rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
        isSyncActive
          ? 'border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.15)]'
          : 'border-white/10'
      }`}
    >
      {/* Top Header with clean hierarchy & dedicated non-overlapping badges */}
      <div className="p-4 border-b border-white/10 bg-slate-950/80 flex flex-col gap-3">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              Separation vs. Time (TCA Profile)
            </h3>
          </div>

          {/* Right Header Controls: Anomaly Overlay Toggle + Sync Zoom Button + Miss Distance Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Anomaly Highlight Overlay Toggle */}
            <button
              id="chart-toggle-anomalies-btn"
              onClick={() => setShowAnomalies(!showAnomalies)}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-semibold flex items-center gap-1.5 transition-all border ${
                showAnomalies
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Toggle visual highlight indicators for SGP4 orbital deviations and telemetry gaps"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Anomalies {showAnomalies ? 'ON' : 'OFF'}</span>
              {anomalyKeyEvents.length > 0 && (
                <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-300 text-[9px] font-bold border border-amber-500/30">
                  {anomalyKeyEvents.length}
                </span>
              )}
            </button>

            {/* Prominent Sync Zoom Button */}
            <button
              id="chart-sync-zoom-btn"
              onClick={() => handleTriggerSyncZoom(0)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-md ${
                isSyncActive
                  ? 'bg-cyan-500 text-slate-950 border border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                  : 'bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400'
              }`}
              title="Automatically focus and zoom 3D & 2D views onto the minimum distance encounter window"
            >
              <Focus className="w-3.5 h-3.5" />
              <span>{isSyncActive ? 'Synced to TCA' : 'Sync Zoom'}</span>
              {isSyncActive && <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />}
            </button>

            {/* Dedicated Solid Miss Distance Badge */}
            <div
              id="chart-header-miss-badge"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-red-500/40 text-red-300 shadow-md shrink-0"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Miss:</span>
              <span className="font-mono text-xs font-bold text-white whitespace-nowrap">
                {minMissDist.toFixed(2)} km
              </span>
            </div>
          </div>
        </div>

        {/* Sub-header row: Target Pair and Window Span Toggles */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium truncate">
            <span className="text-white font-semibold truncate max-w-[120px] sm:max-w-[150px]">{objAName}</span>
            <span className="text-slate-500">&harr;</span>
            <span className="text-white font-semibold truncate max-w-[120px] sm:max-w-[150px]">{objBName}</span>
            {isSyncActive && (
              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                FOCUS_LOCKED
              </span>
            )}
          </div>

          {/* Quick Anomaly Jump Buttons & Window Span Toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick jump pills for detected anomalies */}
            {showAnomalies && anomalyKeyEvents.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-amber-500/30">
                <span className="text-[9px] font-mono text-slate-400 px-1.5 flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5 text-amber-400" />
                  Jump:
                </span>
                {anomalyKeyEvents.map((evt, idx) => (
                  <button
                    key={idx}
                    onClick={() => jumpToAnomaly(evt)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-medium transition-all flex items-center gap-1 ${
                      evt.type === 'ORBITAL_DEVIATION'
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    }`}
                    title={`${evt.reason} (Click to zoom & inspect)`}
                  >
                    <span>{evt.centerOffsetMin > 0 ? `+${evt.centerOffsetMin.toFixed(1)}m` : `${evt.centerOffsetMin.toFixed(1)}m`}</span>
                    <span className="text-[8px] opacity-75">{evt.type === 'ORBITAL_DEVIATION' ? 'Dev' : 'Gap'}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Window Span Toggles */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-white/10 shrink-0">
              <button
                id="chart-window-30m"
                onClick={() => setWindowSpan(30)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                  windowSpan === 30
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="±15 min Window"
              >
                &plusmn;15m
              </button>
              <button
                id="chart-window-60m"
                onClick={() => setWindowSpan(60)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                  windowSpan === 60
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="±30 min Window"
              >
                &plusmn;30m
              </button>
              <button
                id="chart-window-90m"
                onClick={() => setWindowSpan(90)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                  windowSpan === 90
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="±45 min Window"
              >
                &plusmn;45m
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Legend Bar for SGP4 Propagation & Anomaly Highlights */}
      {showAnomalies && (
        <div className="px-4 py-1.5 bg-slate-950/95 border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cyan-400 rounded-full" />
              <span>SGP4 Separation Curve</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rotate-45 bg-amber-400" />
              <span className="text-amber-300 font-semibold">Orbital Deviation (Drag/Perturbation)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-purple-300 font-semibold">Telemetry Gap (Sensor Blackout)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b border-dashed border-cyan-400/60" />
              <span>&plusmn;1&sigma; Dispersion Cone</span>
            </div>
          </div>

          <div className="text-slate-500 flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Hover on graph for root cause diagnostics</span>
          </div>
        </div>
      )}

      {/* Chart Canvas Area with Live Hover Cursor Tooltip */}
      <div ref={canvasWrapperRef} className="p-2 relative h-[210px] w-full bg-[#030712] overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 text-cyan-400 gap-2 text-xs backdrop-blur-sm">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="font-semibold">Loading separation curve & anomaly diagnostics...</span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
          className="w-full h-full block cursor-crosshair"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Live Floating Hover Tooltip - fully opaque with solid background to prevent overlaps */}
        {hoveredPoint && (
          <div
            className={`absolute z-30 pointer-events-none bg-slate-950 border rounded-lg px-3 py-2 text-[11px] font-mono shadow-[0_6px_24px_rgba(0,0,0,0.85)] transition-all duration-75 max-w-[260px] ${
              hoveredPoint.anomalyType === 'ORBITAL_DEVIATION'
                ? 'border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : hoveredPoint.anomalyType === 'TELEMETRY_GAP'
                ? 'border-purple-500/80 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                : 'border-cyan-500/60'
            }`}
            style={{
              left: Math.min(
                Math.max(8, hoveredPoint.x - 90),
                (canvasWrapperRef.current?.clientWidth || 300) - 265
              ),
              top: Math.min(
                Math.max(8, hoveredPoint.y - 85),
                (canvasWrapperRef.current?.clientHeight || 200) - 75
              )
            }}
          >
            {/* Top row: distance + risk tier */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-cyan-300 font-bold text-xs">
                {hoveredPoint.distanceKm.toFixed(3)} km
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-sans font-bold ${
                  hoveredPoint.riskZone === 'CRITICAL'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : hoveredPoint.riskZone === 'HIGH'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                    : hoveredPoint.riskZone === 'MEDIUM'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}
              >
                {hoveredPoint.riskZone}
              </span>
            </div>

            {/* Time & Sync status */}
            <div className="text-slate-400 text-[10px] mt-0.5 flex items-center justify-between gap-2">
              <span>t = {hoveredPoint.timeOffsetMin > 0 ? `+${hoveredPoint.timeOffsetMin.toFixed(1)}` : hoveredPoint.timeOffsetMin.toFixed(1)} min</span>
              <span className="text-cyan-400 font-semibold">{hoveredPoint.timeOffsetMin === 0 ? 'TCA (Click to sync)' : 'Click to sync'}</span>
            </div>

            {/* Visual Anomaly Highlight Diagnostics inside Tooltip */}
            {hoveredPoint.isAnomaly && hoveredPoint.anomalyType && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-800 space-y-1 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className={`font-bold flex items-center gap-1 ${
                    hoveredPoint.anomalyType === 'ORBITAL_DEVIATION' ? 'text-amber-400' : 'text-purple-400'
                  }`}>
                    {hoveredPoint.anomalyType === 'ORBITAL_DEVIATION' ? (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        <span>SGP4 DEVIATION</span>
                      </>
                    ) : (
                      <>
                        <Radio className="w-3 h-3" />
                        <span>TELEMETRY GAP</span>
                      </>
                    )}
                  </span>
                  <span className="text-slate-300 font-mono">
                    {hoveredPoint.confidencePercent}% conf
                  </span>
                </div>

                <p className="text-[9px] text-slate-300 leading-tight">
                  {hoveredPoint.anomalyReason}
                </p>

                <div className="text-[9px] text-slate-400 flex justify-between font-mono pt-0.5">
                  <span>Residual: <strong className="text-white">+{hoveredPoint.anomalyMagnitudeKm} km</strong></span>
                  <span>Dispersion: <strong className="text-cyan-400">&plusmn;{((hoveredPoint.upperUncertaintyKm ?? hoveredPoint.distanceKm) - hoveredPoint.distanceKm).toFixed(2)} km</strong></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Bottom Telemetry Bar */}
      {hoveredPoint ? (
        <div
          id="chart-live-data-panel"
          className={`px-4 py-2.5 bg-slate-950 border-t flex items-center justify-between gap-3 text-xs flex-wrap ${
            hoveredPoint.anomalyType === 'ORBITAL_DEVIATION'
              ? 'border-amber-500/50 bg-amber-950/10'
              : hoveredPoint.anomalyType === 'TELEMETRY_GAP'
              ? 'border-purple-500/50 bg-purple-950/10'
              : 'border-cyan-500/30'
          }`}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">Hover Distance:</span>
              <span className="font-mono font-bold text-white text-xs">
                {hoveredPoint.distanceKm.toFixed(3)} km
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">Offset:</span>
              <span className="font-mono font-semibold text-cyan-300 text-xs">
                {hoveredPoint.timeOffsetMin === 0
                  ? '0.0 min (TCA Exact)'
                  : `${hoveredPoint.timeOffsetMin > 0 ? '+' : ''}${hoveredPoint.timeOffsetMin.toFixed(2)} min`}
              </span>
            </div>

            {/* Anomaly Indicator in Bottom Bar */}
            {hoveredPoint.isAnomaly && (
              <div className="flex items-center gap-1.5 text-[11px]">
                {hoveredPoint.anomalyType === 'ORBITAL_DEVIATION' ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>SGP4 Drag Perturbation (+{hoveredPoint.anomalyMagnitudeKm} km)</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono flex items-center gap-1">
                    <Radio className="w-3 h-3 text-purple-400" />
                    <span>Sensor LOS Blackout ({hoveredPoint.confidencePercent}% Confidence)</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTriggerSyncZoom(hoveredPoint.timeOffsetMin)}
              className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono flex items-center gap-1 transition-all shadow-sm"
            >
              <Focus className="w-3 h-3" />
              <span>Sync to this moment</span>
            </button>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${
                hoveredPoint.riskZone === 'CRITICAL'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : hoveredPoint.riskZone === 'HIGH'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                  : hoveredPoint.riskZone === 'MEDIUM'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {hoveredPoint.riskZone}
            </span>
          </div>
        </div>
      ) : (
        /* Default Solid Footer Telemetry */
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300 font-medium flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-slate-400">Rel Velocity:</span>
              <span className="text-white font-mono font-bold">
                {(conjunction.relativeVelocityKmS ?? 0).toFixed(2)} km/s
              </span>
            </div>
            {isSyncActive && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-cyan-400 font-mono">
                <Sparkles className="w-3 h-3" />
                <span>3D & 2D Focus Active</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            {anomalyKeyEvents.length > 0 && (
              <span className="text-amber-400/90 flex items-center gap-1 text-[10px]">
                <Activity className="w-3 h-3" />
                <span>{anomalyKeyEvents.length} Anomaly Epochs Detected</span>
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">TCA Miss:</span>
              <span className="text-red-400 font-bold bg-red-950/60 border border-red-500/30 px-2 py-0.5 rounded">
                {minMissDist.toFixed(2)} km
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
