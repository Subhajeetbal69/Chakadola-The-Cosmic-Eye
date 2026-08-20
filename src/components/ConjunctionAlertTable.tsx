import React, { useState, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  Zap,
  Filter,
  Eye,
  LineChart,
  Sliders,
  Radio,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Flame,
  Info,
  Maximize2,
  CheckCircle2,
  Trash2,
  Rocket,
  Layers,
  Sparkles,
  ArrowUpRight,
  Gauge,
  Compass,
  Activity
} from 'lucide-react';
import { ConjunctionEvent, RiskLevel, TrackedObjectSummary } from '../types';

interface ConjunctionAlertTableProps {
  conjunctions: ConjunctionEvent[];
  selectedConjunction: ConjunctionEvent | null;
  onSelectConjunction: (conjunction: ConjunctionEvent) => void;
  onViewDistanceChart: (conjunction: ConjunctionEvent) => void;
  onViewRiskMath?: (conjunction: ConjunctionEvent) => void;
  onFocus3D: (conjunction: ConjunctionEvent) => void;
  onOpenObjectDossier?: (object: TrackedObjectSummary) => void;
  onLoadDemo?: () => void;
}

type SortField = 'RISK_SCORE' | 'MIN_DISTANCE' | 'TIME_TO_EVENT' | 'REL_VELOCITY';
type SortOrder = 'ASC' | 'DESC';

// Sub-component for individual table row: pure render, no backdrop-filter blur inside scroll viewport for 60fps scrolling
const ConjunctionRow = React.memo<{
  conjunction: ConjunctionEvent;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (c: ConjunctionEvent) => void;
  onFocus3D: (e: React.MouseEvent, c: ConjunctionEvent) => void;
  onViewCurve: (e: React.MouseEvent, c: ConjunctionEvent) => void;
  onToggleExpand: (e: React.MouseEvent, id: string) => void;
  onOpenDossier?: (e: React.MouseEvent, obj?: TrackedObjectSummary) => void;
}>(({
  conjunction: c,
  isSelected,
  isExpanded,
  onSelect,
  onFocus3D,
  onViewCurve,
  onToggleExpand,
  onOpenDossier
}) => {
  const minDistance = c.minDistanceKm ?? 0;
  const timeToEvent = c.breakdown?.timeToEventHours ?? c.timeToEventHours ?? 0;
  const relVel = c.relativeVelocityKmS ?? 0;
  const relSpeedMach = (relVel * 3600) / 1234.8;
  const riskScore = c.riskScore ?? 0;

  // Format UTC TCA
  const tcaTimeStr = useMemo(() => {
    if (!c.tcaIso) return 'Pending';
    try {
      return new Date(c.tcaIso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return c.tcaIso;
    }
  }, [c.tcaIso]);

  const riskBadge = useMemo(() => {
    switch (c.riskLevel) {
      case 'CRITICAL':
        return (
          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[9px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            CRIT
          </span>
        );
      case 'HIGH':
        return (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[9px] px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 text-[9px] px-2 py-0.5 rounded font-mono font-bold">
            MED
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[9px] px-2 py-0.5 rounded font-mono">
            LOW
          </span>
        );
    }
  }, [c.riskLevel]);

  return (
    <>
      <tr
        onClick={() => onSelect(c)}
        className={`cursor-pointer transition-colors duration-75 ${
          isSelected
            ? 'bg-blue-950/80 border-l-4 border-l-cyan-400'
            : c.riskLevel === 'CRITICAL'
            ? 'bg-rose-950/20 hover:bg-rose-900/30'
            : c.riskLevel === 'HIGH'
            ? 'bg-amber-950/20 hover:bg-amber-900/30'
            : 'hover:bg-slate-800/60'
        }`}
      >
        {/* Risk Column */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {riskBadge}
            <button
              onClick={(e) => onToggleExpand(e, c.id)}
              className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition-colors"
              title={isExpanded ? 'Collapse Telemetry' : 'Expand Actual Telemetry Data'}
            >
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </td>

        {/* Pair Objects */}
        <td className="px-3 py-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={(e) => onOpenDossier?.(e, c.objectA)}
                className="font-bold text-white hover:text-cyan-300 hover:underline flex items-center gap-1.5 text-left transition-colors text-xs font-sans group"
                title="Click to open Full Intelligence Dossier for Primary Object"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-[160px]">
                  {c.objectA?.name || 'Primary Obj'}
                </span>
              </button>
              <span className="text-slate-500 font-normal text-[10px]">&harr;</span>
              <button
                onClick={(e) => onOpenDossier?.(e, c.objectB)}
                className="font-bold text-slate-300 hover:text-cyan-300 hover:underline flex items-center gap-1.5 text-left transition-colors text-xs font-sans group"
                title="Click to open Full Intelligence Dossier for Secondary Object"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-[160px]">
                  {c.objectB?.name || 'Secondary Obj'}
                </span>
              </button>
            </div>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
              <span>#{c.objectA?.noradId || '00000'} ({c.objectA?.classification?.replace('_', ' ') || 'ACTIVE'})</span>
              <span>&bull;</span>
              <span>#{c.objectB?.noradId || '00000'} ({c.objectB?.classification?.replace('_', ' ') || 'DEBRIS'})</span>
            </div>
          </div>
        </td>

        {/* TCA Timestamp */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col">
            <span className="text-slate-200 font-semibold">{tcaTimeStr}</span>
            <span className="text-[10px] text-slate-400 font-mono">
              in {timeToEvent.toFixed(1)}h ({Math.round(timeToEvent * 60)} min)
            </span>
          </div>
        </td>

        {/* Miss Distance */}
        <td className="px-3 py-3 text-right whitespace-nowrap">
          <div className="flex flex-col items-end">
            <span
              className={`font-black text-sm ${
                minDistance < 1
                  ? 'text-rose-400'
                  : minDistance < 2
                  ? 'text-amber-400'
                  : minDistance < 5
                  ? 'text-yellow-400'
                  : 'text-slate-200'
              }`}
            >
              {minDistance.toFixed(2)} km
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {(minDistance * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} m
            </span>
          </div>
        </td>

        {/* Relative Velocity */}
        <td className="px-3 py-3 text-right whitespace-nowrap">
          <div className="flex flex-col items-end">
            <span className="font-bold text-slate-200">{relVel.toFixed(2)} km/s</span>
            <span className="text-[10px] text-amber-400 font-bold font-mono">
              Mach {relSpeedMach.toFixed(1)}
            </span>
          </div>
        </td>

        {/* Explainable Risk Score */}
        <td className="px-3 py-3 text-right whitespace-nowrap">
          <div className="inline-flex flex-col items-end">
            <span
              className={`font-mono font-black text-xs px-2 py-0.5 rounded border ${
                riskScore >= 75
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                  : riskScore >= 50
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {riskScore.toFixed(1)}
            </span>
            {/* Visual Micro Severity Meter */}
            <div className="w-12 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  riskScore >= 75
                    ? 'bg-rose-500'
                    : riskScore >= 50
                    ? 'bg-amber-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, riskScore))}%` }}
              />
            </div>
          </div>
        </td>

        {/* Interactive Actions */}
        <td className="px-4 py-3 whitespace-nowrap text-center">
          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* 3D Focus Button */}
            <button
              onClick={(e) => onFocus3D(e, c)}
              className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-sans font-semibold text-[11px] flex items-center gap-1 shadow-md shadow-blue-500/20 transition-all active:scale-95"
              title="Focus 3D View and lock camera to this encounter pair"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>3D Focus</span>
            </button>

            {/* Separation Curve Button */}
            <button
              onClick={(e) => onViewCurve(e, c)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-cyan-300 border border-cyan-500/30 font-sans font-semibold text-[11px] flex items-center gap-1 transition-all active:scale-95"
              title="Analyze dynamic separation distance curve"
            >
              <LineChart className="w-3.5 h-3.5 text-cyan-400" />
              <span>Curve</span>
            </button>

            {/* In-depth Data Expand Button */}
            <button
              onClick={(e) => onToggleExpand(e, c.id)}
              className={`px-2 py-1.5 rounded-xl text-[11px] font-sans font-medium flex items-center gap-1 transition-all border ${
                isExpanded
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="View full orbital telemetry breakdown"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Data</span>
            </button>
          </div>
        </td>
      </tr>

      {/* EXPANDED TELEMETRY & ASTRODYNAMICS DOSSIER */}
      {isExpanded && (
        <tr className="bg-slate-950 border-b border-cyan-500/30">
          <td colSpan={7} className="p-4 sm:p-5">
            <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 sm:p-5 space-y-4 text-xs font-mono text-slate-200 shadow-2xl">
              {/* Alert Header Summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white font-sans">
                      Conjunction Orbital Ephemeris & Telemetry Dossier
                    </h4>
                    <p className="text-[10px] text-slate-400 font-sans">
                      SGP4 Propagation & Relative State Vector Analysis
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-400 font-mono">Encounter ID:</span>
                  <span className="text-cyan-300 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {c.id}
                  </span>
                </div>
              </div>

              {/* 4-Column Scientific Data Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* TCA Metric */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>Time of Closest Approach</span>
                  </div>
                  <div className="text-sm font-bold text-white mt-1 truncate">
                    {c.tcaIso ? new Date(c.tcaIso).toUTCString() : 'N/A'}
                  </div>
                  <div className="text-[10px] text-cyan-400 mt-0.5 font-bold">
                    T-Minus: {timeToEvent.toFixed(2)} hours ({Math.round(timeToEvent * 60)} min)
                  </div>
                </div>

                {/* Minimum Miss Distance */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold flex items-center gap-1.5">
                    <Compass className="w-3 h-3 text-rose-400" />
                    <span>Miss Distance (3D Euclidean)</span>
                  </div>
                  <div className="text-base font-black text-rose-400 mt-1">
                    {minDistance.toFixed(3)} km
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {(minDistance * 1000).toLocaleString()} meters separation
                  </div>
                </div>

                {/* Relative Encounter Velocity */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-amber-400" />
                    <span>Relative Encounter Speed</span>
                  </div>
                  <div className="text-sm font-bold text-amber-300 mt-1">
                    {relVel.toFixed(2)} km/s
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Mach {relSpeedMach.toFixed(1)} &bull; {((relVel * 3600)).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h
                  </div>
                </div>

                {/* Mathematical Risk Score Breakdown */}
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold flex items-center gap-1.5">
                    <Gauge className="w-3 h-3 text-blue-400" />
                    <span>Explainable Risk Score</span>
                  </div>
                  <div className="text-base font-black text-cyan-300 mt-1">
                    {riskScore.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 100</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Dist: {c.breakdown?.distanceScore?.toFixed(0) ?? 'N/A'}pt | Vel: {c.breakdown?.velocityScore?.toFixed(0) ?? 'N/A'}pt | Time: {c.breakdown?.timeScore?.toFixed(0) ?? 'N/A'}pt
                  </div>
                </div>
              </div>

              {/* State Vectors at TCA (ECI TEME Coordinates) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                      {c.objectA?.name} (Primary Object)
                    </span>
                    <button
                      onClick={(e) => onOpenDossier?.(e, c.objectA)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-200 hover:underline flex items-center gap-0.5 font-sans"
                    >
                      <span>Full Dossier</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-slate-400 text-[11px] pt-1">
                    ECI Spatial Coordinates at TCA:
                  </div>
                  <div className="text-slate-200 font-mono">
                    X: {c.positionAAtTca?.x?.toFixed(2) ?? 'N/A'} km, Y: {c.positionAAtTca?.y?.toFixed(2) ?? 'N/A'} km, Z: {c.positionAAtTca?.z?.toFixed(2) ?? 'N/A'} km
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                      {c.objectB?.name} (Secondary Object)
                    </span>
                    <button
                      onClick={(e) => onOpenDossier?.(e, c.objectB)}
                      className="text-[10px] text-cyan-400 hover:text-cyan-200 hover:underline flex items-center gap-0.5 font-sans"
                    >
                      <span>Full Dossier</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-slate-400 text-[11px] pt-1">
                    ECI Spatial Coordinates at TCA:
                  </div>
                  <div className="text-slate-200 font-mono">
                    X: {c.positionBAtTca?.x?.toFixed(2) ?? 'N/A'} km, Y: {c.positionBAtTca?.y?.toFixed(2) ?? 'N/A'} km, Z: {c.positionBAtTca?.z?.toFixed(2) ?? 'N/A'} km
                  </div>
                </div>
              </div>

              {/* Tactical Actions in Drawer */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-300 font-sans flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>
                    Advisory Evasive Impulse: <strong>&Delta;V &ge; 4.8 m/s</strong> (Prograde burn clears miss distance &gt; 15 km)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => onFocus3D(e, c)}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Lock in 3D Orbit</span>
                  </button>
                  <button
                    onClick={(e) => onViewCurve(e, c)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <LineChart className="w-3.5 h-3.5" />
                    <span>Separation Profile</span>
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});

export const ConjunctionAlertTable: React.FC<ConjunctionAlertTableProps> = React.memo(({
  conjunctions = [],
  selectedConjunction,
  onSelectConjunction,
  onViewDistanceChart,
  onViewRiskMath,
  onFocus3D,
  onOpenObjectDossier,
  onLoadDemo
}) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('RISK_SCORE');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const safeConjunctions = Array.isArray(conjunctions) ? conjunctions : [];

  // Filter & Search & Sort Logic with useMemo
  const processedConjunctions = useMemo(() => {
    let list = safeConjunctions.filter((c) => {
      if (!c) return false;
      if (filterLevel !== 'ALL' && c.riskLevel !== filterLevel) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameA = c.objectA?.name?.toLowerCase() || '';
        const nameB = c.objectB?.name?.toLowerCase() || '';
        const noradA = c.objectA?.noradId?.toLowerCase() || '';
        const noradB = c.objectB?.noradId?.toLowerCase() || '';
        if (
          !nameA.includes(query) &&
          !nameB.includes(query) &&
          !noradA.includes(query) &&
          !noradB.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      switch (sortField) {
        case 'RISK_SCORE':
          valA = a.riskScore ?? 0;
          valB = b.riskScore ?? 0;
          break;
        case 'MIN_DISTANCE':
          valA = a.minDistanceKm ?? 0;
          valB = b.minDistanceKm ?? 0;
          break;
        case 'TIME_TO_EVENT':
          valA = a.timeToEventHours ?? a.breakdown?.timeToEventHours ?? 0;
          valB = b.timeToEventHours ?? b.breakdown?.timeToEventHours ?? 0;
          break;
        case 'REL_VELOCITY':
          valA = a.relativeVelocityKmS ?? 0;
          valB = b.relativeVelocityKmS ?? 0;
          break;
      }
      return sortOrder === 'ASC' ? valA - valB : valB - valA;
    });

    return list;
  }, [safeConjunctions, filterLevel, searchQuery, sortField, sortOrder]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortOrder((prevOrder) => (prevOrder === 'ASC' ? 'DESC' : 'ASC'));
        return prevField;
      } else {
        setSortOrder(field === 'MIN_DISTANCE' || field === 'TIME_TO_EVENT' ? 'ASC' : 'DESC');
        return field;
      }
    });
  }, []);

  const criticalCount = useMemo(() => safeConjunctions.filter((c) => c?.riskLevel === 'CRITICAL').length, [safeConjunctions]);
  const highCount = useMemo(() => safeConjunctions.filter((c) => c?.riskLevel === 'HIGH').length, [safeConjunctions]);
  const medCount = useMemo(() => safeConjunctions.filter((c) => c?.riskLevel === 'MEDIUM').length, [safeConjunctions]);

  const handleRowClick = useCallback((c: ConjunctionEvent) => {
    onSelectConjunction(c);
  }, [onSelectConjunction]);

  const handleFocus3DClick = useCallback((e: React.MouseEvent, c: ConjunctionEvent) => {
    e.stopPropagation();
    onFocus3D(c);
    const elem = document.getElementById('orbit-3d-panel');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  }, [onFocus3D]);

  const handleCurveClick = useCallback((e: React.MouseEvent, c: ConjunctionEvent) => {
    e.stopPropagation();
    onViewDistanceChart(c);
    const elem = document.getElementById('distance-chart-panel');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  }, [onViewDistanceChart]);

  const handleToggleExpand = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedRowId((prev) => (prev === id ? null : id));
  }, []);

  const handleObjectBadgeClick = useCallback((e: React.MouseEvent, obj?: TrackedObjectSummary) => {
    e.stopPropagation();
    if (obj && onOpenObjectDossier) {
      onOpenObjectDossier(obj);
    }
  }, [onOpenObjectDossier]);

  return (
    <div
      id="conjunction-alert-panel"
      className="bg-[#0b1120] border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0f172a]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Conjunction Alerts Prioritization
            </h2>
          </div>
          <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-400 text-xs font-mono font-bold rounded-lg border border-rose-500/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            {safeConjunctions.length} ACTIVE THREATS
          </span>
        </div>

        {/* Filter Tabs, Search & Sort */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search satellite, debris, NORAD..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 transition-colors w-52"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterLevel('ALL')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
                filterLevel === 'ALL'
                  ? 'bg-blue-600 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              All ({safeConjunctions.length})
            </button>
            <button
              onClick={() => setFilterLevel('CRITICAL')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
                filterLevel === 'CRITICAL'
                  ? 'bg-rose-600 text-white shadow shadow-rose-500/30 font-bold'
                  : 'text-rose-400 hover:text-white hover:bg-rose-950/40'
              }`}
            >
              Critical ({criticalCount})
            </button>
            <button
              onClick={() => setFilterLevel('HIGH')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
                filterLevel === 'HIGH'
                  ? 'bg-amber-600 text-white shadow shadow-amber-500/30 font-bold'
                  : 'text-amber-400 hover:text-white hover:bg-amber-950/40'
              }`}
            >
              High ({highCount})
            </button>
            <button
              onClick={() => setFilterLevel('MEDIUM')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
                filterLevel === 'MEDIUM'
                  ? 'bg-yellow-500 text-slate-950 shadow shadow-yellow-500/30 font-bold'
                  : 'text-yellow-400 hover:text-white hover:bg-yellow-950/40'
              }`}
            >
              Med ({medCount})
            </button>
          </div>
        </div>
      </div>

      {/* Table Content with Hardware-Accelerated Smooth Scroll */}
      <div className="overflow-x-auto max-h-[460px] overflow-y-auto smooth-scroll">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#0f172a] sticky top-0 z-10 border-b border-slate-800 select-none shadow-md">
            <tr className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
              <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort('RISK_SCORE')}>
                <div className="flex items-center gap-1">
                  <span>Risk</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="px-3 py-3">Pair Objects (Click to inspect)</th>
              <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort('TIME_TO_EVENT')}>
                <div className="flex items-center gap-1">
                  <span>TCA Timestamp</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('MIN_DISTANCE')}>
                <div className="flex items-center justify-end gap-1">
                  <span>Min Miss Dist</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('REL_VELOCITY')}>
                <div className="flex items-center justify-end gap-1">
                  <span>Rel Speed</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="px-3 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('RISK_SCORE')}>
                <div className="flex items-center justify-end gap-1">
                  <span>Score</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="px-4 py-3 text-center">Interactive Telemetry & 3D Actions</th>
            </tr>
          </thead>
          <tbody className="text-xs font-mono divide-y divide-slate-800/80">
            {processedConjunctions.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-14 text-slate-400 font-sans">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <ShieldAlert className="w-8 h-8 text-slate-600" />
                    <div>
                      <p className="font-bold text-slate-300">No Conjunction Alerts matching current criteria</p>
                      <p className="text-xs text-slate-500 mt-1">
                        All monitored orbits maintain safe separation thresholds or filter is active.
                      </p>
                    </div>
                    {onLoadDemo && (
                      <button
                        onClick={onLoadDemo}
                        className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Load High-Risk Conjunction Demonstration</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              processedConjunctions.map((c) => (
                <ConjunctionRow
                  key={c.id}
                  conjunction={c}
                  isSelected={selectedConjunction?.id === c.id}
                  isExpanded={expandedRowId === c.id}
                  onSelect={handleRowClick}
                  onFocus3D={handleFocus3DClick}
                  onViewCurve={handleCurveClick}
                  onToggleExpand={handleToggleExpand}
                  onOpenDossier={handleObjectBadgeClick}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
