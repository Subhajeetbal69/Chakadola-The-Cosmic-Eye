import React, { useState } from 'react';
import { TrackedObjectSummary, ConjunctionEvent } from '../types';
import './SatelliteDossier.css';

interface SatelliteDossierModalProps {
  object: TrackedObjectSummary | null;
  conjunctions: ConjunctionEvent[];
  isOpen: boolean;
  onClose: () => void;
  onTrackIn3D?: (obj: TrackedObjectSummary) => void;
  onSwitchTo2D?: (obj: TrackedObjectSummary) => void;
}

export const SatelliteDossierModal: React.FC<SatelliteDossierModalProps> = React.memo(({
  object,
  conjunctions = [],
  isOpen,
  onClose,
  onTrackIn3D,
  onSwitchTo2D
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'EPHEMERIS' | 'HAZARDS' | 'BURN_SIM'>('OVERVIEW');
  const [copied, setCopied] = useState(false);
  const [deltaVInput, setDeltaVInput] = useState<number>(10);
  const [burnDirection, setBurnDirection] = useState<'PROGRADE' | 'RETROGRADE'>('PROGRADE');

  if (!isOpen || !object) return null;

  const isDebris = object.classification === 'DEBRIS';
  const isRocketBody = object.classification === 'ROCKET_BODY';
  const isActive = object.classification === 'ACTIVE_SATELLITE';

  const activeHazard = conjunctions.find(
    (c) => c.objectA?.id === object.id || c.objectB?.id === object.id
  );

  const speedKmS = object.speedKmS ?? 7.68;
  const speedKmH = speedKmS * 3600;
  const speedMph = speedKmH * 0.621371;
  const speedMach = speedKmH / 1234.8; 

  const estMassKg = isDebris ? 8.5 : isRocketBody ? 2400 : 1500;
  const kineticEnergyMJ = (0.5 * estMassKg * Math.pow(speedKmS * 1000, 2)) / 1e6;
  const tntEquivalentKg = kineticEnergyMJ / 4.184;

  const semiMajorKm = ((object.perigeeKm || 400) + (object.apogeeKm || 600)) / 2 + 6378.137;
  const altitudeShiftKm = 2 * semiMajorKm * ((deltaVInput / 1000) / speedKmS);
  const estFuelConsumptionKg = (estMassKg * (1 - Math.exp(-deltaVInput / (9.81 * 220))));

  const handleCopy = () => {
    const text =
      `SPACE OBJECT INTELLIGENCE DOSSIER\n` +
      `---------------------------------\n` +
      `Object Name: ${object.name}\n` +
      `NORAD Catalog ID: ${object.noradId}\n` +
      `Classification: ${object.classification}\n` +
      `Orbital Velocity: ${speedKmS.toFixed(2)} km/s (${speedKmH.toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h / Mach ${speedMach.toFixed(1)})\n` +
      `Mean Altitude: ${(object.altitudeKm ?? 0).toFixed(1)} km\n` +
      `Perigee x Apogee: ${(object.perigeeKm ?? 0).toFixed(1)} km x ${(object.apogeeKm ?? 0).toFixed(1)} km\n` +
      `Inclination: ${(object.inclinationDeg ?? 0).toFixed(2)} deg\n` +
      `Period: ${(object.periodMin ?? 0).toFixed(1)} min (${(1440 / Math.max(1, object.periodMin ?? 90)).toFixed(2)} rev/day)\n` +
      `Estimated Mass: ~${estMassKg} kg\n` +
      `Kinetic Energy: ${kineticEnergyMJ.toFixed(1)} MJ (~${tntEquivalentKg.toFixed(1)} kg TNT equiv)\n` +
      `ECI Position (km): X=${object.currentPosition?.x?.toFixed(1) ?? 'N/A'}, Y=${object.currentPosition?.y?.toFixed(1) ?? 'N/A'}, Z=${object.currentPosition?.z?.toFixed(1) ?? 'N/A'}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="dossier-wrapper" role="dialog" aria-label="Object dossier">
        {/* ── Header ── */}
        <header className="dossier-head">
          <div className={`dossier-sigil ${isDebris ? 'debris' : isRocketBody ? 'rocket_body' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>
              <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/>
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <div className="dossier-head-main">
            <div className="dossier-tag-row">
              <span className={`dossier-chip status ${isDebris ? 'debris' : isRocketBody ? 'rocket_body' : ''}`}>
                {object.classification.replace('_', ' ')}
              </span>
              <span className="dossier-chip norad">NORAD #{object.noradId}</span>
              {activeHazard && (
                <span className="dossier-chip hazard">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z"/><path d="M12 8v4M12 15.5v.5"/></svg>
                  Conjunction Hazard
                </span>
              )}
            </div>
            <h1 className="dossier-title">{object.name}</h1>
          </div>
          <button className="dossier-close" aria-label="Close dossier" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </header>

        {/* ── Tabs ── */}
        <nav className="dossier-tabs" role="tablist">
          <button
            className={`dossier-tab ${activeTab === 'OVERVIEW' ? 'active' : ''}`}
            data-accent="lime"
            role="tab"
            aria-selected={activeTab === 'OVERVIEW'}
            onClick={() => setActiveTab('OVERVIEW')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 1 18 0"/><path d="M12 12l4-2.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>
            Overview &amp; Dynamics
          </button>
          <button
            className={`dossier-tab ${activeTab === 'EPHEMERIS' ? 'active' : ''}`}
            data-accent="lime"
            role="tab"
            aria-selected={activeTab === 'EPHEMERIS'}
            onClick={() => setActiveTab('EPHEMERIS')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="9" ry="4.2"/><ellipse cx="12" cy="12" rx="4.2" ry="9" transform="rotate(60 12 12)"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>
            Keplerian Ephemeris
          </button>
          <button
            className={`dossier-tab ${activeTab === 'HAZARDS' ? 'active' : ''}`}
            data-accent="lime"
            role="tab"
            aria-selected={activeTab === 'HAZARDS'}
            onClick={() => setActiveTab('HAZARDS')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z"/><path d="M12 8v4M12 15.5v.5"/></svg>
            Safety &amp; Hazards
          </button>
          <button
            className={`dossier-tab ${activeTab === 'BURN_SIM' ? 'active' : ''}`}
            data-accent="orange"
            role="tab"
            aria-selected={activeTab === 'BURN_SIM'}
            onClick={() => setActiveTab('BURN_SIM')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1.5 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.4.5-2.4 1.2-3.3.4 1 1 1.6 1.8 1.9-.3-2.3.5-4.9 1-6.6Z"/></svg>
            Evasive Burn Planner
          </button>
        </nav>

        {/* ── Body ── */}
        <div className="dossier-body">
          {/* Panel 1 — Overview & Dynamics */}
          {activeTab === 'OVERVIEW' && (
            <div className="dossier-panel active" role="tabpanel">
              <div className="dossier-card-lime" style={{ padding: '18px 20px' }}>
                <div className="dossier-sec-head">
                  <span className="dossier-sec-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12l4-6"/><path d="M3.5 15a9 9 0 0 1 17 0"/><circle cx="12" cy="12" r="1.4" fill="var(--lime)" stroke="none"/></svg>
                    Orbital Kinematics &amp; Energy
                  </span>
                  <span className="dossier-pill lime">Hypervelocity</span>
                </div>
                <div className="dossier-stat-grid">
                  <div className="dossier-stat">
                    <div className="k">Velocity</div>
                    <div><span className="dossier-v lime">{speedKmS.toFixed(2)}</span><span className="u">km/s</span></div>
                  </div>
                  <div className="dossier-stat">
                    <div className="k">Mach Equiv.</div>
                    <div><span className="dossier-v amber">Mach&nbsp;{speedMach.toFixed(1)}</span></div>
                  </div>
                  <div className="dossier-stat">
                    <div className="k">Ground Speed</div>
                    <div><span className="dossier-v white">{speedKmH.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span><span className="u">km/h</span></div>
                  </div>
                  <div className="dossier-stat">
                    <div className="k">Kinetic Energy</div>
                    <div><span className="dossier-v red">{kineticEnergyMJ.toFixed(1)}</span><span className="u">MJ</span></div>
                  </div>
                </div>
                <div className="dossier-impact">
                  <span className="lbl">Impact Energy Equivalence:</span>
                  <span className="val">~{tntEquivalentKg.toFixed(1)} kg TNT detonation</span>
                </div>
              </div>

              <div className="dossier-duo">
                <div className="dossier-card" style={{ padding: '15px 17px' }}>
                  <div className="dossier-sec-title" style={{ marginBottom: '13px', color: 'var(--green)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M12 3c-2.5 3.5-2.5 14.5 0 18M12 3c2.5 3.5 2.5 14.5 0 18"/></svg>
                    Geographic Sub-Point
                  </div>
                  <div className="dossier-kv"><span className="lbl">Latitude:</span><span className="dossier-v green" style={{ fontSize: '14px' }}>{(object.lat ?? 0).toFixed(2)}&deg; {((object.lat ?? 0) >= 0 ? 'N' : 'S')}</span></div>
                  <div className="dossier-kv"><span className="lbl">Longitude:</span><span className="dossier-v green" style={{ fontSize: '14px' }}>{(object.lng ?? 0).toFixed(2)}&deg; {((object.lng ?? 0) >= 0 ? 'E' : 'W')}</span></div>
                </div>
                <div className="dossier-card" style={{ padding: '15px 17px' }}>
                  <div className="dossier-sec-title" style={{ marginBottom: '13px', color: 'var(--lime)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(30 12 12)"/></svg>
                    Altitude &amp; Period
                  </div>
                  <div className="dossier-kv"><span className="lbl">Altitude:</span><span className="dossier-v lime" style={{ fontSize: '14px' }}>{(object.altitudeKm ?? 0).toFixed(1)} km</span></div>
                  <div className="dossier-kv"><span className="lbl">Period:</span><span className="dossier-v white" style={{ fontSize: '14px' }}>{(object.periodMin ?? 0).toFixed(1)} min</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Panel 2 — Keplerian Ephemeris */}
          {activeTab === 'EPHEMERIS' && (
            <div className="dossier-panel active" role="tabpanel">
              <div className="dossier-card-lime" style={{ padding: '18px 20px' }}>
                <div className="dossier-sec-head">
                  <span className="dossier-sec-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="9" ry="4.2"/><ellipse cx="12" cy="12" rx="4.2" ry="9" transform="rotate(60 12 12)"/><circle cx="12" cy="12" r="1.4" fill="var(--lime)" stroke="none"/></svg>
                    6-Parameter Keplerian State Vector
                  </span>
                </div>
                <div className="dossier-kep-grid">
                  <div className="dossier-kep">
                    <div className="k">Semi-Major Axis (a)</div>
                    <div className="dossier-v white">{semiMajorKm.toFixed(1)} km</div>
                  </div>
                  <div className="dossier-kep">
                    <div className="k">Inclination (i)</div>
                    <div className="dossier-v white">{(object.inclinationDeg ?? 0).toFixed(2)}&deg;</div>
                  </div>
                  <div className="dossier-kep">
                    <div className="k">Perigee (Lowest Point)</div>
                    <div className="dossier-v lime">{(object.perigeeKm ?? 0).toFixed(1)} km</div>
                  </div>
                  <div className="dossier-kep">
                    <div className="k">Apogee (Highest Point)</div>
                    <div className="dossier-v lime">{(object.apogeeKm ?? 0).toFixed(1)} km</div>
                  </div>
                </div>
                <div className="dossier-foot-line">
                  <span className="lbl">Orbital Period:</span>
                  <span className="dossier-v white" style={{ fontSize: '13.5px' }}>
                    {(object.periodMin ?? 0).toFixed(1)} minutes ({(1440 / Math.max(1, object.periodMin ?? 90)).toFixed(2)} rev/day)
                  </span>
                </div>
                <div className="dossier-foot-line" style={{ borderTop: 'none', paddingTop: '4px' }}>
                  <span className="lbl">ECI Coordinates:</span>
                  <span className="dossier-v white" style={{ fontSize: '13.5px' }}>
                    X: {object.currentPosition?.x?.toFixed(1) ?? 'N/A'}, Y: {object.currentPosition?.y?.toFixed(1) ?? 'N/A'}, Z: {object.currentPosition?.z?.toFixed(1) ?? 'N/A'} km
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Panel 3 — Safety & Hazards */}
          {activeTab === 'HAZARDS' && (
            <div className="dossier-panel active" role="tabpanel">
              {activeHazard ? (
                <div className="dossier-hazard-card">
                  <div className="dossier-sec-head" style={{ marginBottom: 0 }}>
                    <span className="dossier-sec-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z"/><path d="M12 8v4M12 15.5v.5"/></svg>
                      Conjunction Encounter Detected
                    </span>
                    <span className="dossier-pill crit">{activeHazard.riskLevel} Risk</span>
                  </div>
                  <div className="dossier-terminal">
                    <div><span className="lbl">Target Intersect:</span> <b>{activeHazard.objectA?.id === object.id ? activeHazard.objectB?.name : activeHazard.objectA?.name}</b></div>
                    <div><span className="lbl">Minimum Miss Distance:</span> <span className="danger">{(activeHazard.minDistanceKm ?? 0).toFixed(2)} km</span></div>
                    <div><span className="lbl">Relative Encounter Velocity:</span> <span className="warn">{(activeHazard.relativeVelocityKmS ?? 0).toFixed(2)} km/s</span></div>
                    <div><span className="lbl">TCA Timestamp:</span> <b>{activeHazard.tcaIso ? new Date(activeHazard.tcaIso).toLocaleString() : 'Within 24h propagation window'}</b></div>
                  </div>
                </div>
              ) : (
                <div className="dossier-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                  </svg>
                  <div>
                    <div style={{ color: 'var(--lime)', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Nominal Flight Safety Profile</div>
                    <div style={{ color: 'var(--muted)', fontSize: '13px' }}>No critical collision hazard or conjunction threat detected in the next 24-hour propagation window.</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Panel 4 — Evasive Burn Planner */}
          {activeTab === 'BURN_SIM' && (
            <div className="dossier-panel active" role="tabpanel">
              <div className="dossier-card" style={{ padding: '18px 20px' }}>
                <div className="dossier-sec-head">
                  <span className="dossier-sec-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1.5 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.4.5-2.4 1.2-3.3.4 1 1 1.6 1.8 1.9-.3-2.3.5-4.9 1-6.6Z"/></svg>
                    Maneuver Simulation (&Delta;V Impulse)
                  </span>
                  <div className="dossier-seg">
                    <button
                      className={burnDirection === 'PROGRADE' ? 'on' : ''}
                      onClick={() => setBurnDirection('PROGRADE')}
                    >
                      Prograde (+Alt)
                    </button>
                    <button
                      className={burnDirection === 'RETROGRADE' ? 'on' : ''}
                      onClick={() => setBurnDirection('RETROGRADE')}
                    >
                      Retrograde (&minus;Alt)
                    </button>
                  </div>
                </div>

                <div className="dossier-slider-wrap">
                  <div className="dossier-slider-top">
                    <span className="lbl">Delta-V Impulse:</span>
                    <span className="amt">{deltaVInput}<small>m/s</small></span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={deltaVInput}
                    onChange={(e) => setDeltaVInput(Number(e.target.value))}
                    style={{ '--fill': `${(deltaVInput / 50) * 100}%` } as React.CSSProperties}
                  />
                </div>

                <div className="dossier-duo" style={{ marginTop: '20px' }}>
                  <div className="dossier-stat"><div className="k">Induced Altitude Shift</div><div><span className="dossier-v orange">{burnDirection === 'PROGRADE' ? '+' : '-'}{altitudeShiftKm.toFixed(1)}</span><span className="u">km</span></div></div>
                  <div className="dossier-stat"><div className="k">Est. Fuel Expended</div><div><span className="dossier-v white">{estFuelConsumptionKg.toFixed(2)}</span><span className="u">kg</span></div></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="dossier-foot">
          <button className="dossier-btn" onClick={handleCopy}>
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--lime)'}}><path d="M20 6L9 17l-5-5"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
            )}
            {copied ? 'Copied' : 'Copy Dossier'}
          </button>
          <div className="dossier-foot-right">
            {onSwitchTo2D && (
              <button
                className="dossier-btn lime-outline"
                onClick={() => {
                  onSwitchTo2D(object);
                  onClose();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><ellipse cx="12" cy="12" rx="4.5" ry="9"/></svg>
                2D Orbit Plane
              </button>
            )}
            {onTrackIn3D && (
              <button
                className="dossier-btn primary"
                onClick={() => {
                  onTrackIn3D(object);
                  onClose();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>
                Lock in 3D
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
});
