import React, { useState } from 'react';
import { Layers, Search, Filter, Satellite, Orbit, ExternalLink } from 'lucide-react';
import { TrackedObjectSummary, ObjectClassification } from '../types';

interface TrackedObjectsCatalogProps {
  objects: TrackedObjectSummary[];
  onSelectObject?: (obj: TrackedObjectSummary) => void;
}

export const TrackedObjectsCatalog: React.FC<TrackedObjectsCatalogProps> = ({
  objects = [],
  onSelectObject
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const safeObjects = Array.isArray(objects) ? objects : [];

  const filtered = safeObjects.filter((obj) => {
    if (!obj) return false;
    if (filterType !== 'ALL' && obj.classification !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (obj.name || '').toLowerCase().includes(q) || (obj.noradId || '').includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  const handleFilterChange = (type: string) => {
    setFilterType(type);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const getTag = (type: ObjectClassification) => {
    switch (type) {
      case 'DEBRIS':
        return (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono font-semibold">
            Debris
          </span>
        );
      case 'ROCKET_BODY':
        return (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-semibold">
            Rocket Body
          </span>
        );
      case 'ACTIVE_SATELLITE':
      default:
        return (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono font-semibold">
            Active Sat
          </span>
        );
    }
  };

  return (
    <div id="tracked-objects-catalog" className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <div className="p-4 sm:p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-white">Tracked Orbital Objects Catalog</h2>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
            SGP4 orbital states, Keplerian parameters, and ECI coordinates across all {safeObjects.length.toLocaleString()} tracked objects.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <button
            onClick={() => handleFilterChange('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
              filterType === 'ALL'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            All ({safeObjects.length.toLocaleString()})
          </button>
          <button
            onClick={() => handleFilterChange('ACTIVE_SATELLITE')}
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
              filterType === 'ACTIVE_SATELLITE'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            Active ({safeObjects.filter((o) => o.classification === 'ACTIVE_SATELLITE').length.toLocaleString()})
          </button>
          <button
            onClick={() => handleFilterChange('ROCKET_BODY')}
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
              filterType === 'ROCKET_BODY'
                ? 'bg-amber-600 text-white shadow'
                : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            R/B ({safeObjects.filter((o) => o.classification === 'ROCKET_BODY').length.toLocaleString()})
          </button>
          <button
            onClick={() => handleFilterChange('DEBRIS')}
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all ${
              filterType === 'DEBRIS'
                ? 'bg-red-600 text-white shadow'
                : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            Debris ({safeObjects.filter((o) => o.classification === 'DEBRIS').length.toLocaleString()})
          </button>
        </div>
      </div>

      {/* Search & Pagination Bar */}
      <div className="px-4 py-2.5 bg-slate-900/60 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs backdrop-blur-md">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search object name or NORAD ID..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950/50 border border-white/10 text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Page Nav */}
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="text-slate-400">
            Showing <span className="text-white font-bold">{startIndex + 1}–{Math.min(filtered.length, startIndex + pageSize)}</span> of <span className="text-white font-bold">{filtered.length.toLocaleString()}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
              className="px-2 py-0.5 rounded bg-white/5 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10"
              title="First Page"
            >
              &laquo;
            </button>
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-0.5 rounded bg-white/5 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10"
              title="Previous Page"
            >
              &lsaquo;
            </button>
            <span className="px-2 py-0.5 text-blue-400 font-bold bg-blue-500/10 rounded border border-blue-500/20">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-0.5 rounded bg-white/5 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10"
              title="Next Page"
            >
              &rsaquo;
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
              className="px-2 py-0.5 rounded bg-white/5 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10"
              title="Last Page"
            >
              &raquo;
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
        <table className="w-full text-left text-xs text-slate-300 border-collapse">
          <thead className="bg-slate-900/80 backdrop-blur-md text-slate-400 uppercase text-[9px] font-bold tracking-wider sticky top-0 z-10 border-b border-white/10">
            <tr>
              <th className="py-3 px-4">NORAD ID</th>
              <th className="py-3 px-3">Object Name</th>
              <th className="py-3 px-3">Classification</th>
              <th className="py-3 px-3">Perigee / Apogee</th>
              <th className="py-3 px-3">Inclination</th>
              <th className="py-3 px-3">Period</th>
              <th className="py-3 px-3">Altitude</th>
              <th className="py-3 px-3 text-right">Velocity</th>
              <th className="py-3 px-4 text-center">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono text-xs">
            {pageItems.map((obj) => {
              const speedKmS = obj.speedKmS ?? 7.68;
              const machNum = (speedKmS * 3600) / 1234.8;
              return (
                <tr
                  key={obj.id}
                  onClick={() => onSelectObject && onSelectObject(obj)}
                  className="hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-4 font-bold text-slate-400">
                    #{obj.noradId || obj.id}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-white font-sans truncate max-w-[180px]">{obj.name}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {getTag(obj.classification)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                    {obj.perigeeKm} &times; {obj.apogeeKm} km
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {(obj.inclinationDeg ?? 0).toFixed(1)}&deg;
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {(obj.periodMin ?? 0).toFixed(1)} min
                  </td>
                  <td className="py-2.5 px-3 text-blue-400 font-bold">
                    {(obj.altitudeKm ?? 0).toFixed(1)} km
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="font-bold text-cyan-300">{speedKmS.toFixed(2)} km/s</div>
                    <div className="text-[10px] text-amber-400 font-medium">Mach {machNum.toFixed(1)}</div>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectObject) onSelectObject(obj);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px] font-sans font-semibold transition-all shadow-sm"
                    >
                      Catch & Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
