import React, { useState } from 'react';
import { TrackedObjectSummary, ObjectClassification } from '../types';
import './TrackedObjectsCatalog.css';

interface TrackedObjectsCatalogProps {
  objects: TrackedObjectSummary[];
  onSelectObject?: (obj: TrackedObjectSummary) => void;
  onClose?: () => void;
}

export const TrackedObjectsCatalog: React.FC<TrackedObjectsCatalogProps> = ({
  objects = [],
  onSelectObject,
  onClose
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [sortCol, setSortCol] = useState<keyof TrackedObjectSummary | null>(null);
  const [sortDir, setSortDir] = useState<number>(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pageSize = 50;
  const safeObjects = Array.isArray(objects) ? objects : [];

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 550);
    setFilterType('all');
    setSearch('');
    setSortCol(null);
    setSortDir(1);
    setPage(1);
  };

  const getSortField = (col: string): keyof TrackedObjectSummary => {
    switch(col) {
      case 'norad': return 'noradId';
      case 'name': return 'name';
      case 'inc': return 'inclinationDeg';
      case 'period': return 'periodMin';
      case 'alt': return 'altitudeKm';
      case 'vel': return 'speedKmS';
      default: return 'name';
    }
  };

  const handleSort = (col: string) => {
    const field = getSortField(col);
    if (sortCol === field) {
      setSortDir(-sortDir);
    } else {
      setSortCol(field);
      setSortDir(1);
    }
    setPage(1);
  };

  let filtered = safeObjects.filter((obj) => {
    if (!obj) return false;
    
    // map filterType ('all', 'sat', 'rb', 'deb') to ObjectClassification
    if (filterType !== 'all') {
      let matchType = '';
      if (filterType === 'sat') matchType = 'ACTIVE_SATELLITE';
      if (filterType === 'rb') matchType = 'ROCKET_BODY';
      if (filterType === 'deb') matchType = 'DEBRIS';
      if (obj.classification !== matchType) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      return (obj.name || '').toLowerCase().includes(q) || (obj.noradId || '').toString().includes(q);
    }
    return true;
  });

  if (sortCol) {
    filtered = [...filtered].sort((a, b) => {
      let av = a[sortCol];
      let bv = b[sortCol];
      if (typeof av === 'string' && typeof bv === 'string') {
        av = av.toLowerCase();
        bv = bv.toLowerCase();
      }
      if (av === undefined) av = '';
      if (bv === undefined) bv = '';
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const pageItems = filtered.slice(startIndex, endIndex);

  const renderBadge = (type: ObjectClassification) => {
    if (type === 'DEBRIS') {
      return <span className="class-badge deb"><span className="bdot"></span>Debris</span>;
    }
    if (type === 'ROCKET_BODY') {
      return <span className="class-badge rb"><span className="bdot"></span>R/B</span>;
    }
    return <span className="class-badge sat"><span className="bdot"></span>Active Sat</span>;
  };

  const getSortClass = (col: string) => {
    const field = getSortField(col);
    if (sortCol !== field) return '';
    return sortDir === 1 ? 'asc' : 'desc';
  };

  return (
    <div className="shell registry-main">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </span>
          <span className="topbar-title">Tracked Objects Registry</span>
          <span className="topbar-count">({safeObjects.length.toLocaleString()})</span>
        </div>
        <button className="btn-return" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M3.6 9h16.8M3.6 15h16.8"/>
            <path d="M12 3c-2.5 3.5-2.5 14.5 0 18M12 3c2.5 3.5 2.5 14.5 0 18"/>
          </svg>
          Return to 3D Earth
        </button>
      </header>

      {/* ── Main ── */}
      <div className="registry-main" style={{flex: 1, overflow: 'hidden'}}>
        
        {/* Catalog header + filters */}
        <div className="catalog-head">
          <div className="catalog-head-left">
            <div className="catalog-head-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <span>Tracked Orbital Objects Catalog</span>
            </div>
            <p className="catalog-head-sub">
              SGP4 orbital states, Keplerian parameters, and ECI coordinates across all {safeObjects.length.toLocaleString()} tracked LEO objects.
            </p>
          </div>
          <div className="filter-tabs">
            <button className={`ftab ${filterType === 'all' ? 'active' : ''}`} onClick={() => { setFilterType('all'); setPage(1); }}>
              All ({safeObjects.length.toLocaleString()})
            </button>
            <button className={`ftab ${filterType === 'sat' ? 'active' : ''}`} onClick={() => { setFilterType('sat'); setPage(1); }}>
              Active ({safeObjects.filter((o) => o.classification === 'ACTIVE_SATELLITE').length.toLocaleString()})
            </button>
            <button className={`ftab ${filterType === 'rb' ? 'active' : ''}`} onClick={() => { setFilterType('rb'); setPage(1); }}>
              R/B ({safeObjects.filter((o) => o.classification === 'ROCKET_BODY').length.toLocaleString()})
            </button>
            <button className={`ftab ${filterType === 'deb' ? 'active' : ''}`} onClick={() => { setFilterType('deb'); setPage(1); }}>
              Debris ({safeObjects.filter((o) => o.classification === 'DEBRIS').length.toLocaleString()})
            </button>
          </div>
        </div>

        {/* Search + pagination */}
        <div className="toolbar">
          <div className="search-group">
            <div className="search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input 
                className="search-input" 
                type="text" 
                placeholder="Search object name or NORAD ID…" 
                autoComplete="off" 
                spellCheck="false"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <button className={`btn-refresh ${isRefreshing ? 'spinning' : ''}`} onClick={handleRefresh} title="Refresh data">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
            </button>
          </div>
          <div className="pagination">
            <span className="page-info">Showing <strong>{filtered.length === 0 ? '0' : `${startIndex + 1}–${endIndex}`}</strong> of <strong>{filtered.length.toLocaleString()}</strong></span>
            <div className="page-btns">
              <button className="pbtn" disabled={currentPage <= 1} onClick={() => setPage(1)} title="First page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
              </button>
              <button className="pbtn" disabled={currentPage <= 1} onClick={() => setPage(Math.max(1, currentPage - 1))} title="Previous page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="page-current">{currentPage} / {totalPages}</span>
              <button className="pbtn" disabled={currentPage >= totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))} title="Next page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button className="pbtn" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)} title="Last page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="registry-table">
            <colgroup>
              <col className="c-norad" /><col className="c-name" /><col className="c-class" />
              <col className="c-orbit" /><col className="c-inc" /><col className="c-period" />
              <col className="c-alt" /><col className="c-vel" /><col className="c-inspect" />
            </colgroup>
            <thead>
              <tr>
                <th className={`sortable ${getSortClass('norad')}`} onClick={() => handleSort('norad')}>NORAD ID</th>
                <th className={`sortable ${getSortClass('name')}`} onClick={() => handleSort('name')}>Object Name</th>
                <th>Classification</th>
                <th>Perigee / Apogee</th>
                <th className={`right sortable ${getSortClass('inc')}`} onClick={() => handleSort('inc')}>Inclination</th>
                <th className={`right sortable ${getSortClass('period')}`} onClick={() => handleSort('period')}>Period</th>
                <th className={`right sortable ${getSortClass('alt')}`} onClick={() => handleSort('alt')}>Altitude</th>
                <th className={`right sortable ${getSortClass('vel')}`} onClick={() => handleSort('vel')}>Velocity</th>
                <th className="center">Inspect</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr className="empty-row"><td colSpan={9}>No objects match your search.</td></tr>
              ) : (
                pageItems.map((obj) => {
                  const speedKmS = obj.speedKmS ?? 7.68;
                  const machNum = (speedKmS * 3600) / 1234.8;
                  return (
                    <tr key={obj.id}>
                      <td><span className="norad-id">#{obj.noradId || obj.id}</span></td>
                      <td><span className="obj-name" title={obj.name}>{obj.name}</span></td>
                      <td>{renderBadge(obj.classification)}</td>
                      <td><span className="orbit-val">{obj.perigeeKm} × {obj.apogeeKm} km</span></td>
                      <td className="right"><span className="inc-val">{(obj.inclinationDeg ?? 0).toFixed(1)}°</span></td>
                      <td className="right"><span className="period-val">{(obj.periodMin ?? 0).toFixed(1)} min</span></td>
                      <td className="right"><span className="alt-val">{(obj.altitudeKm ?? 0).toFixed(1)}<small>km</small></span></td>
                      <td className="right">
                        <div className="vel-cell">
                          <span className="vel-main">{speedKmS.toFixed(2)} km/s</span>
                          <span className="vel-mach">Mach {machNum.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="center">
                        <button className="btn-inspect" onClick={() => onSelectObject && onSelectObject(obj)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="table-footer">
          <span className="tf-info">CelesTrak · SGP4 Propagation · LEO Invariant Filter ≤ 2,000 km</span>
          <span className="tf-live"><span className="dot"></span>Live Snapshot Active</span>
        </div>

      </div>
    </div>
  );
};
