import React from 'react';
import { X, BookOpen, Compass, Layers, Cpu, Server, Database, Zap, ShieldAlert } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020617]/85 backdrop-blur-md">
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden text-slate-200 text-xs">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-white">
              Technical Documentation & Scaling Architecture
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
          
          {/* Section 1: Astrodynamics & Coordinate System */}
          <div className="space-y-2">
            <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              1. Astrodynamics Core & Coordinate System
            </h4>
            <div className="bg-slate-900/50 border border-white/10 rounded-xl p-3.5 space-y-2 leading-relaxed text-slate-300 shadow-inner">
              <p>
                <strong className="text-white">Coordinate System:</strong> All orbital trajectories are computed and represented in the <strong className="text-blue-400">Earth-Centered Inertial (TEME / ECI)</strong> reference frame:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 text-slate-400">
                <li><strong className="text-slate-200">Origin:</strong> Earth's center of mass (0, 0, 0).</li>
                <li><strong className="text-slate-200">Units:</strong> Distances in kilometers (km), velocities in km/s, angles in degrees/radians.</li>
                <li><strong className="text-slate-200">Earth Radius (R_E):</strong> WGS-84 equatorial radius (6378.137 km).</li>
                <li><strong className="text-slate-200">Propagation:</strong> Analytical Simplified General Perturbations-4 (<strong>SGP4</strong>) / SDP4 solving for Earth oblateness (J2, J3, J4), atmospheric drag (BSTAR), and lunar/solar gravitational perturbations.</li>
              </ul>
            </div>
          </div>

          {/* Section 2: Conjunction Detection & Sub-Stepping */}
          <div className="space-y-2">
            <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              2. Conjunction Detection & Refinement Pipeline
            </h4>
            <div className="bg-slate-900/50 border border-white/10 rounded-xl p-3.5 space-y-2 text-slate-300 leading-relaxed shadow-inner">
              <p>
                The conjunction pipeline employs a two-tier evaluation strategy:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-black/30 border border-white/5 p-3 rounded-xl shadow-inner">
                  <div className="text-blue-400 font-bold mb-1">Tier 1: Coarse Grid Search</div>
                  <div className="text-slate-400">
                    Propagates N trajectories on fixed time steps (60s) over the 24h horizon. Performs N(N-1)/2 Euclidean distance checks (d = |r_A - r_B|).
                  </div>
                </div>
                <div className="bg-black/30 border border-white/5 p-3 rounded-xl shadow-inner">
                  <div className="text-red-400 font-bold mb-1">Tier 2: 1-Second Sub-Stepping</div>
                  <div className="text-slate-400">
                    Candidate close approaches (&le; 15 km) are fine-interpolated in a &plusmn;60s window at 1s intervals to pinpoint exact Time of Closest Approach (TCA) and relative velocity vector.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Explainable Risk Score */}
          <div className="space-y-2">
            <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-orange-400" />
              3. Explainable Collision-Risk Prioritization Metric
            </h4>
            <div className="bg-slate-900/50 border border-white/10 rounded-xl p-3.5 space-y-2 text-slate-300 font-mono text-[11px] shadow-inner">
              <div className="bg-black/30 border border-white/5 p-2 rounded-lg text-blue-400 font-semibold shadow-inner">
                risk_score = 0.60 &times; distance_score + 0.25 &times; velocity_score + 0.15 &times; time_score
              </div>
              <p className="text-slate-400 font-sans text-xs">
                Score ranges from <strong className="text-white">0 to 100</strong>, classifying events into <strong>CRITICAL (&gt;=80)</strong>, <strong>HIGH (60–79)</strong>, <strong>MEDIUM (30–59)</strong>, and <strong>LOW (0–29)</strong>.
              </p>
            </div>
          </div>

          {/* Section 4: 3-Tier Scaling Roadmap */}
          <div className="space-y-2">
            <h4 className="font-bold text-blue-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              4. Scaling Roadmap (From MVP to 10,000+ Objects)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
              
              <div className="bg-slate-900/50 border border-blue-500/20 rounded-xl p-3 shadow-inner">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-sm">
                  VERSION 1 (CURRENT MVP)
                </span>
                <div className="font-bold text-white mt-1.5 text-xs">20–50 Objects</div>
                <ul className="mt-2 space-y-1 text-slate-400 list-disc list-inside">
                  <li>In-memory / SQLite store</li>
                  <li>SGP4 Analytical engine</li>
                  <li>O(N&sup2;) Pairwise comparison</li>
                  <li>Zero external GPU requirement</li>
                </ul>
              </div>

              <div className="bg-slate-900/50 border border-orange-500/20 rounded-xl p-3 shadow-inner">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-sm">
                  VERSION 2 (MEDIUM SCALE)
                </span>
                <div className="font-bold text-white mt-1.5 text-xs">500–2,000 Objects</div>
                <ul className="mt-2 space-y-1 text-slate-400 list-disc list-inside">
                  <li>PostgreSQL + PostGIS 3D spatial indexing</li>
                  <li>KD-Tree & Bounding Box coarse pre-filter</li>
                  <li>Multi-threaded worker pools</li>
                  <li>Batch TLE ingestion pipeline</li>
                </ul>
              </div>

              <div className="bg-slate-900/50 border border-purple-500/20 rounded-xl p-3 shadow-inner">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-sm">
                  VERSION 3 (ENTERPRISE SCALE)
                </span>
                <div className="font-bold text-white mt-1.5 text-xs">10,000+ Objects</div>
                <ul className="mt-2 space-y-1 text-slate-400 list-disc list-inside">
                  <li>Distributed Ray / Celery cluster</li>
                  <li>GPU CUDA / Vectorized SGP4 propagation</li>
                  <li>Apache Kafka real-time event streaming</li>
                  <li>Covariance ellipsoid P_c collision probability</li>
                </ul>
              </div>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-slate-900/80 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-xs transition-colors"
          >
            Close Documentation
          </button>
        </div>
      </div>
    </div>
  );
};
