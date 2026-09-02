# Chakadola — The Cosmic Eye: LEO Space Object Tracking & Conjunction Assessment System

[![Status](https://img.shields.io/badge/Status-Advanced_Prototype-blue.svg)](https://chakadola-the-cosmic-eye.onrender.com)
[![Runtime](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![Frontend](https://img.shields.io/badge/React-19.0.1-61dafb.svg)](https://react.dev)
[![Astrodynamics](https://img.shields.io/badge/Astrodynamics-SGP4_%2F_Keplerian-orange.svg)](https://celestrak.org)
[![AI](https://img.shields.io/badge/AI-Gemini_3.5_Flash--Lite-purple.svg)](https://ai.google.dev)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

A high-performance full-stack astrodynamics platform for real-time tracking, orbital propagation, pairwise conjunction screening, and collision avoidance simulation in Low Earth Orbit (LEO, altitude $\le 2000\text{ km}$).

The system ingests Two-Line Element (TLE) datasets from CelesTrak and Space-Track, executes a multi-stage orbital screening pipeline using SGP4 and analytical Keplerian solvers, evaluates conjunction threats via an empirical multi-factor risk model, and provides interactive AI tactical assessments using Google Gemini.

---

## 1. System Architecture

```
                                EXTERNAL SPACE DATA
                      ┌──────────────────────────────────────┐
                      │  Tier 1: CelesTrak GP Elements (TLE) │
                      │  Tier 2: Public REST TLE Mirror      │
                      │  Tier 3: Space-Track.org (Auth)      |
                      │  Tier 4: Active Database Snapshot    |
                      │  Tier 5: Static Cold Bootstrap       │
                      └──────────────────┬───────────────────┘
                                         │ HTTP GET (with Circuit Breaker)
                                         ▼
                             INGESTION & VALIDATION
                      ┌──────────────────────────────────────┐
                      │  - Modulo-10 Checksum Verification   │
                      │  - LEO Invariant Filter (h <= 2000km)│
                      │  - Debris / Rocket Body Classifier   │
                      │  - Duplicate NORAD ID Deduplication  │
                      └──────────────────┬───────────────────┘
                                         │ Atomic Transaction
                                         ▼
                           PERSISTENCE & VERSIONING
                      ┌──────────────────────────────────────┐
                      │  - Supabase Managed PostgreSQL Pool  │
                      │  - Local SQLite WASM Fallback        │
                      │  - Snapshot Pruning (Keep Last 3)    │
                      │  - Atomic Rollback Capability        │
                      └──────────────────┬───────────────────┘
                                         │ Load Active Snapshot
                                         ▼
                           CONJUNCTION DETECTION PIPELINE
                      ┌──────────────────────────────────────┐
                      │ Stage 1: Debris/Rocket Mutual Skip   │
                      │ Stage 2: Apogee/Perigee Shell Overlap│
                      │ Stage 3: 4D Sieve (RAAN / Incl.)     │
                      │ Stage 4: Fast Keplerian Trajectory   │
                      │ Stage 5: SGP4 Ternary Sub-Second Ref.│
                      └──────────────────┬───────────────────┘
                                         │ Pairs with Miss < 15 km
                                         ▼
                           MULTI-FACTOR RISK ENGINE
                      ┌──────────────────────────────────────┐
                      │  - 45% Miss Distance (Quadratic)     │
                      │  - 25% Kinetic Severity (v_rel^2)    │
                      │  - 20% TCA Urgency (Exp Decay)       │
                      │  - 10% LEO Shell Density Context     │
                      └──────────────────┬───────────────────┘
                                         │ Evaluated Conjunctions
                    ┌────────────────────┴────────────────────┐
                    │                                         │
                    ▼                                         ▼
        AI DECISION SUPPORT (GEMINI)              REAL-TIME BROADCAST ENGINE
┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐
│ - Model: gemini-3.5-flash-lite        │ │ - 500ms Live Telemetry Stream (/ws)   │
│ - Strict System Prompt & Guardrails   │ │ - Conjunction State Synchronization   │
│ - Tool 1: getDistanceHistory          │ │ - WebSocket DDoS & Zombie Reaper      │
│ - Tool 2: simulateManeuver            │ │ - Express REST Endpoints              │
│ - 15-Minute Cache Layer               │ │ - RFC 4180 Telemetry CSV Export       │
└───────────────────┬───────────────────┘ └───────────────────┬───────────────────┘
                    │                                         │
                    └────────────────────┬────────────────────┘
                                         │ WebSocket / REST API
                                         ▼
                           PRESENTATION & VISUALIZATION
┌─────────────────────────────────────────────────────────────────────────────────┐
│  - / : Lunar Exploration Interactive Hero Canvas (Three.js & GSAP)              │
│  - /earth : 3D Photorealistic Earth Canvas & Orbit Tracks, HUD Telemetry        │
│  - /alert : High-Priority Conjunction Table, SVG TCA Profile, Burn Simulator    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Verified Data Ingestion Pipeline

The platform uses a 5-tier failover mechanism implemented in `server/tleFetcher.ts`:

1. **Tier 1 — CelesTrak GP Elements (Primary):** Concurrent requests across 8 priority LEO endpoints (Active Satellites, Starlink, OneWeb, Stations, Cosmos 2251 Debris, Fengyun 1C Debris, Iridium 33 Debris, Rocket Bodies).
   * Features a **Circuit Breaker** (trips to `OPEN` for 30 minutes after 2 consecutive network timeouts or HTTP 429 errors).
   * Enforces a 600ms pacing delay between endpoint calls.
2. **Tier 2 — Public REST TLE Mirror:** Secondary mirror (`tle.ivanstanojevic.me`) queried in batches of 4 with a 250ms delay.
3. **Tier 3 — Space-Track.org (Authenticated):** Automated session login against the Space-Track REST API for full-catalog GP queries.
4. **Tier 4 — Active Database Snapshot:** Falls back to the latest active snapshot stored in PostgreSQL or SQLite.
5. **Tier 5 — Static Cold Bootstrap:** Uses local baseline catalog files (`data/catalog_16063.tle` or `server/sample_tles.txt`) containing verified LEO ephemerides.

### Data Invariants & Validation
* **Modulo-10 Checksum Verification:** Every TLE line is validated using standard NORAD modulo-10 checksum logic before parsing (`server/tleParser.ts`). Corrupt records are rejected.
* **Strict LEO Invariant:** Only objects with both perigee $\le 2000\text{ km}$ and apogee $\le 2000\text{ km}$ are admitted to the conjunction analysis fleet. MEO, GEO, and HEO objects are tracked in metrics but pruned from pairwise collision calculations.
* **Object Classification:** Categorizes objects into `ACTIVE_SATELLITE`, `ROCKET_BODY`, or `DEBRIS` using international designator patterns and payload naming conventions.

---

## 3. Astrodynamics & Conjunction Detection

### 3.1 Propagation Models
* **Primary SGP4/SDP4 (`server/propagator.ts`):** Implemented via `satellite.js` to compute True Equator Mean Equinox (TEME / ECI) Cartesian coordinates and WGS-84 geodetic coordinates.
* **Analytical Keplerian Solver (`server/propagator.ts`):** 15-iteration Newton-Raphson solver for Kepler's equation ($M = E - e \sin E$), calculating perifocal vectors $(P, Q, W)$ and rotating to ECI. Used for high-speed coarse screening and when SGP4 experiences atmospheric drag singularities.
* **Symplectic Lagrange $f$ and $g$ Series Propagator (`server/conjunctionEngine.ts`):** Analytical universal variable Cartesian propagator used for collision avoidance burn simulations, strictly conserving orbital energy and angular momentum.

### 3.2 5-Stage Conjunction Screening Architecture
To screen millions of pairwise combinations in under 10 seconds, `server/conjunctionEngine.ts` executes a 5-stage progressive filter:

```
Total Pairs: N * (N - 1) / 2 (~3.7 million for 2,724 objects)
   │
   ▼
Stage 1: Debris-Debris Mutual Exclusion
   │  Skips mutual DEBRIS × DEBRIS and ROCKET_BODY × ROCKET_BODY pairs.
   ▼
Stage 2: Sweep-and-Prune Altitude Shell Overlap
   │  Sorts objects by perigee; breaks loop when objB.perigee > objA.apogee + threshold.
   ▼
Stage 3: 4D Orbital Geometry Sieve
   │  Filters plane-incompatible pairs (|Δi| > 30° AND |ΔΩ| > 90°) and constellation siblings.
   ▼
Stage 4: Fast Keplerian Trajectory Distance Screening
   │  Evaluates squared distances at 1-minute steps over 24 hours against 500 km threshold.
   ▼
Stage 5: Sub-Second SGP4 Ternary Refinement
   │  Refines candidate TCA using ternary search to sub-second precision; retains pairs < 15 km.
   ▼
Confirmed Conjunction Hazards (< 15 km)
```

*Note on Synthetic Fallback:* If a reference dataset yields zero natural close approaches within 15 km over the 24-hour window, the engine synthesizes up to 7 realistic hazard scenarios to maintain decision-support training availability. Simulated events are marked with `isSimulatedHazard: true`.

---

## 4. Multi-Factor Risk Scoring Engine

The platform calculates a normalized **LEO Risk Score ($0\text{--}100$)** based on four weighted physical and operational factors (`server/conjunctionEngine.ts`):

$$\text{Risk Score} = 0.45 \cdot S_{\text{dist}} + 0.25 \cdot S_{\text{sev}} + 0.20 \cdot S_{\text{urg}} + 0.10 \cdot S_{\text{leo}}$$

```
1. Miss Distance Component (45% Weight):
   - d_min <= 1.0 km:           S_dist = 100
   - 1.0 km < d_min < 15.0 km:   S_dist = 100 * [ (15.0 - d_min) / 14.0 ]^2
   - d_min >= 15.0 km:          S_dist = 0

2. Kinetic Severity Component (25% Weight):
   - S_sev = min(100, max(10, 100 * (v_rel / 14.0)^2))
   - Reflects kinetic energy E_k proportional to relative velocity squared.

3. Operational Urgency Component (20% Weight):
   - t_TCA <= 1.0 hour:         S_urg = 100
   - t_TCA > 1.0 hour:          S_urg = max(5, 100 * exp(-0.052 * (t_TCA - 1.0)))

4. LEO Orbital Shell Context Component (10% Weight):
   - Altitude < 350 km (Very Low LEO):           S_leo = 40
   - Altitude 350 - 600 km (Mega-Constellations): S_leo = 95
   - Altitude 600 - 1000 km (Historical Debris):  S_leo = 85
   - Altitude 1000 - 2000 km (Upper LEO):         S_leo = 50
```

### Risk Level Boundaries
* **`CRITICAL` Risk:** $\text{Score} \ge 80$
* **`HIGH` Risk:** $60 \le \text{Score} < 80$
* **`MEDIUM` Risk:** $30 \le \text{Score} < 60$
* **`LOW` Risk:** $\text{Score} < 30$

*Engineering Note:* This metric is an empirical multi-criteria decision-support index designed for operational prioritization. It is **not** a formal 3D Gaussian covariance probability of collision ($P_c$) since standard TLE element sets do not include positional covariance matrices.

---

## 5. AI Decision Support (Google Gemini)

Integrated via the `@google/genai` SDK using the `gemini-3.5-flash-lite` model (`ai/aiServices.ts`):

* **Structured Output:** Strictly enforced via OpenAPI JSON Schema (`responseSchema`), returning structured tactical assessments, risk drivers, confidence levels, and recommended actions.
* **Two-Way Tool Calling (Function Calling):**
  1. `getDistanceHistory(conjunctionId, spanMinutes)`: Evaluates time-series separation curves, tracking gaps, and SGP4 model deviations.
  2. `simulateManeuver(conjunctionId, burnDirection, burnMagnitudeMs, burnTimeHoursBeforeTca)`: Executes symplectic Lagrange burn simulations to verify collision avoidance margin increases.
* **In-Memory Cache:** 15-minute TTL caching layer per conjunction event to prevent redundant API token consumption.
* **Decision Support Boundaries:** Strict system prompt guardrails ensure AI outputs are labeled as non-authoritative tactical recommendations requiring human flight dynamics verification.

---

## 6. Persistence & Storage Architecture

The system features a dual-database persistence engine (`server/db.ts`):

1. **Primary Cloud Persistence (PostgreSQL / Supabase):** Managed connection pool (`pg.Pool`) storing snapshot metadata, TLE element sets, conjunction events, and system configuration.
2. **Self-Healing Fallback (SQLite WASM / `sql.js`):** If PostgreSQL experiences connection timeouts or network failures, the storage engine switches to local SQLite WASM with zero downtime. Retries PostgreSQL every 30 seconds.
3. **Retention & Snapshot Pruning:** Retains the last 3 snapshots (`keepLastN = 3`), automatically deleting older snapshots and cascading TLE deletions. Supports instant snapshot rollback via `/api/snapshots`.

---

## 7. REST & WebSocket API Reference

### 7.1 Core REST Endpoints

| Method | Endpoint | Description | Rate Limit |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/health` | Server liveness, active snapshot ID, and object count | 240 / min |
| `GET` | `/api/health/tle` | TLE circuit breaker status and reachability diagnostics | 240 / min |
| `GET` | `/api/data-status` | Snapshot provenance, age, and freshness state (`LIVE`, `FRESH`, `STALE`) | 240 / min |
| `GET` | `/api/snapshots` | List historical retained snapshots with object counts | 240 / min |
| `GET` | `/api/status` | Complete system telemetry, fleet counters, and configuration | 240 / min |
| `GET` | `/api/telemetry/live` | Real-time Cartesian positions and velocities | 240 / min |
| `GET/POST` | `/api/tle/fetch` | Trigger multi-tier TLE sync from external sources | 12 / min |
| `POST` | `/api/tle/demo` | Switch active dataset to deterministic reference demo fleet | 12 / min |
| `POST` | `/api/tle/import` | Ingest raw custom TLE text with checksum verification | 12 / min |
| `GET` | `/api/objects` | Paginated catalog search with classification filtering | 240 / min |
| `GET` | `/api/objects/:id/trajectory`| 24-hour orbital trajectory points for 3D visualization | 240 / min |
| `GET` | `/api/conjunctions` | List detected close approach events with risk breakdowns | 240 / min |
| `GET` | `/api/conjunctions/csv` | Download RFC 4180 compliant conjunction telemetry CSV | 12 / min |
| `GET` | `/api/conjunctions/:id/distance-history` | Time-series separation curve and anomaly markers | 240 / min |
| `GET/POST` | `/api/config` | Read or update conjunction detection thresholds | 240 / min |
| `POST` | `/api/analyze` | Force re-run of 5-stage pairwise screening engine | 12 / min |
| `GET/POST` | `/api/conjunctions/:id/assess` | Request live Gemini AI tactical decision assessment | 12 / min |
| `POST` | `/api/conjunctions/:id/simulate` | Execute impulsive collision avoidance burn simulation | 240 / min |

### 7.2 WebSocket Streaming (`/ws`)
* **Endpoint:** `ws://localhost:3000/ws`
* **Telemetry Stream (`telemetry_stream`):** Broadcasts high-frequency ECI coordinates every 500ms for active conjunction pairs and background satellites.
* **Security & DDoS Defenses:**
  * Maximum **25 concurrent WebSocket connections per IP**.
  * Maximum **32 KB message payload size**.
  * Inbound message rate limit of **15 messages/second per client**.
  * 30-second heartbeat ping/pong cycle with automatic zombie connection reaper.

---

## 8. Installation & Setup

### Prerequisites
* **Node.js:** v20.x or higher
* **npm:** v10.x or higher (or `bun` / `pnpm`)

### 1. Clone Repository
```bash
git clone https://github.com/Subhajeetbal69/Space_Debris_Tracker
cd Space_Debris_Tracker
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the template and configure your credentials:
```bash
cp .env.example .env
```

Edit `.env` with your API keys:
```env
# Server Port
PORT=3000

# Google Gemini API Key (Required for AI tactical assessments)
GEMINI_API_KEY=your_gemini_api_key_here

# Space-Track.org Credentials (Optional Tier 3 TLE fallback)
SPACETRACK_USER=your_spacetrack_username
SPACETRACK_PASSWORD=your_spacetrack_password

# PostgreSQL Connection String (Optional; defaults to local SQLite if unset)
DATABASE_URL=postgresql://user:password@host:port/database
```

### 4. Run Development Server
```bash
npm run dev
```
Starts the Express API backend and Vite development server simultaneously on `http://localhost:3000`.

### 5. Build for Production
```bash
npm run build
npm start
```
Compiles the React frontend via Vite and bundles the Node.js server into `dist/server.cjs` using `esbuild`.

---

## 9. Current Operational Limitations & Roadmap

### Known Limitations
1. **Covariance Data:** Conjunction screening uses Two-Line Element (TLE) sets, which lack positional covariance matrices. The risk score is an empirical operational index, not a formal NASA/ESA $P_c$ probability.
2. **Single-Threaded Screening:** Pairwise screening runs on the main Node.js event loop. Fleets larger than 10,000 objects can cause transient latency during full-catalog re-analysis.
3. **In-Memory State:** Active fleet state resides in process memory, requiring sticky sessions if scaled horizontally across multiple servers.

### Planned Enhancements
* [ ] Offload 5-stage conjunction screening to a Node.js `worker_threads` pool.
* [ ] Ingest CCSDS Conjunction Data Messages (CDMs) to compute formal 2D/3D Gaussian collision probability ($P_c$).
* [ ] Introduce Redis publish/subscribe for multi-instance WebSocket horizontal scaling.
* [ ] Implement WebGPU compute shaders for client-side trajectory propagation of 100,000+ objects.
* [ ] Multi-stage Docker containerization and CI/CD automated test verification.

---

## 10. License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
