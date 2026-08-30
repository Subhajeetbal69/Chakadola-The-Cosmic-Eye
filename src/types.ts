export type ObjectClassification = 'ACTIVE_SATELLITE' | 'ROCKET_BODY' | 'DEBRIS' | 'SPECIAL';

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO' | 'OTHER';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type FreshnessState = 'LIVE' | 'FRESH_SNAPSHOT' | 'STALE_SNAPSHOT' | 'CRITICAL_STALE' | 'NO_DATA';

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LeoBand = 'VERY_LOW_LEO' | 'CORE_CONSTELLATION_LEO' | 'MID_LEO' | 'UPPER_LEO';

export interface SnapshotMetadata {
  id: string;
  source: 'CELESTRAK' | 'LOCAL_SNAPSHOT' | 'DEMO_SCENARIO';
  fetchedAt: string;
  processedAt: string;
  objectCount?: number;
  validLeoCount?: number;
  totalFetched: number;
  invalidCount: number;
  nonLeoCount: number;
  dataHash?: string;
  contentHash?: string;
  isActive?: boolean;
  status: 'ACTIVE' | 'SUPERSEDED' | 'FAILED';
}

export interface DataStatusResponse {
  mode: string;
  source: string;
  fetchedAt: string;
  processedAt: string;
  ageSeconds: number;
  freshnessState: FreshnessState;
  objectCount: number;
  totalFetched: number;
  invalidCount: number;
  nonLeoCount: number;
  activeSnapshotId: string;
  isFallback: boolean;
  retentionCount?: number;
}

export interface TleRecord {
  id: string; // NORAD ID or unique key
  noradId?: number;
  snapshotId?: string;
  name: string;
  line1: string;
  line2: string;
  classification: ObjectClassification;
  orbitClass?: OrbitClass;
  source: 'CELESTRAK' | 'SAMPLE_DATASET' | 'DEMO_CONJUNCTION' | 'LOCAL_SNAPSHOT';
  epochYear: number;
  epochDay: number;
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevDay: number;
  periodMin: number;
  perigeeKm: number;
  apogeeKm: number;
  status: string;
  updatedAt: string;
}

export interface Vector3D {
  x: number; // km
  y: number; // km
  z: number; // km
}

export interface TrajectoryPoint {
  timeIso: string;
  timestamp: number; // ms
  position: Vector3D; // ECI / TEME km
  velocity: Vector3D; // km/s
  speed: number; // km/s
  lat: number; // deg
  lng: number; // deg
  alt: number; // km
}

export interface TrackedObjectSummary {
  id: string;
  name: string;
  classification: ObjectClassification;
  orbitClass?: OrbitClass;
  source: string;
  noradId: string;
  inclinationDeg: number;
  perigeeKm: number;
  apogeeKm: number;
  periodMin: number;
  altitudeKm: number;
  speedKmS: number;
  currentPosition: Vector3D;
  positionKm?: Vector3D; // compatibility alias
  currentVelocity: Vector3D;
  lat: number;
  lng: number;
  orbitSample?: Vector3D[];
  updatedAt: string;
}

export interface RiskScoreBreakdown {
  rawDistanceKm: number;
  distanceScore: number; // 0-100 (45% weight)
  distanceWeight: number; // 0.45
  
  relativeVelocityKmS: number;
  severityScore: number; // 0-100 (25% weight)
  severityWeight: number; // 0.25
  severityLevel: SeverityLevel;
  
  timeToEventHours: number;
  urgencyScore: number; // 0-100 (20% weight)
  urgencyWeight: number; // 0.20
  urgencyLevel: UrgencyLevel;
  
  leoContextScore: number; // 0-100 (10% weight)
  leoContextWeight: number; // 0.10
  leoBand: LeoBand;
  tcaAltitudeKm: number;
  
  // Backwards compatibility aliases
  velocityScore?: number;
  velocityWeight?: number;
  timeScore?: number;
  timeWeight?: number;
  
  finalRiskScore: number; // 0-100
  riskLevel: RiskLevel;
  formulaDescription: string;
}

export interface ConjunctionEvent {
  id: string;
  objectA: TrackedObjectSummary;
  objectB: TrackedObjectSummary;
  tcaIso: string; // Time of Closest Approach
  tcaTimestamp: number;
  timeToEventHours: number;
  minDistanceKm: number;
  relativeVelocityKmS: number;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  breakdown: RiskScoreBreakdown;
  positionAAtTca: Vector3D;
  positionBAtTca: Vector3D;
  isSimulatedHazard?: boolean;
}

export interface ConjunctionSyncState {
  conjunctionId: string;
  tcaIso: string;
  timeOffsetMin: number; // e.g. 0 for exact TCA
  tcaSecondsOffset: number; // relative seconds from epoch/now to TCA
  minDistanceKm: number;
  positionA: Vector3D;
  positionB: Vector3D;
  timestamp: number; // token to trigger camera animation/re-focus
  isActive: boolean;
}


export type PropagationAnomalyType =
  | 'ORBITAL_DEVIATION'
  | 'TELEMETRY_GAP'
  | 'ATMOSPHERIC_DRAG_SURGE'
  | 'SENSOR_BLACKOUT';

export interface DistanceTimePoint {
  timeIso: string;
  timestamp: number;
  timeOffsetMin: number;
  distanceKm: number;
  posA: Vector3D;
  posB: Vector3D;
  // SGP4 Anomaly & Telemetry Gap Indicators
  isAnomaly?: boolean;
  anomalyType?: PropagationAnomalyType;
  anomalyMagnitudeKm?: number; // deviation residual error in km
  anomalyReason?: string; // explainable SGP4 / telemetry cause
  confidencePercent?: number; // e.g. 65% during gap vs 98% nominal
  upperUncertaintyKm?: number; // +1 sigma dispersion bound
  lowerUncertaintyKm?: number; // -1 sigma dispersion bound
}

export interface ConjunctionHistory {
  conjunctionId: string;
  objectAName: string;
  objectBName: string;
  tcaIso: string;
  minDistanceKm: number;
  points: DistanceTimePoint[];
  anomalyCount?: number;
  telemetryGapCount?: number;
}

export interface SystemConfig {
  datasetSize: number;
  predictionHours: number;
  timeStepSeconds: number;
  distanceThresholdKm: number;
  riskWeights: {
    distance: number;
    velocity: number;
    time: number;
    leoContext?: number;
  };
  riskThresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

export interface SystemStatus {
  lastDataUpdate: string;
  trackedObjectsCount: number;
  activeSatellitesCount?: number;
  debrisCount?: number;
  rocketBodiesCount?: number;
  analysisWindowHours: number;
  timeStepSeconds: number;
  detectedConjunctionsCount: number;
  activeSource: string;
  config: SystemConfig;
  isProcessing?: boolean;
  lastSyncTimestamp?: number;
  isLiveCelesTrak?: boolean;
  wsConnectedClients?: number;
  snapshotMetadata?: SnapshotMetadata;
  freshnessState?: FreshnessState;
}

export interface LiveTelemetryObject {
  id: string;
  name: string;
  classification: ObjectClassification;
  orbitClass?: OrbitClass;
  noradId: string;
  pos: Vector3D;
  vel: Vector3D;
  speedKmS: number;
  altKm: number;
  lat: number;
  lng: number;
  epochTimestamp: number;
}

export interface WsTelemetryPacket {
  type: 'telemetry_stream';
  timestamp: number;
  iso: string;
  objects: LiveTelemetryObject[];
}

export interface WsInitialStatePacket {
  type: 'initial_state';
  status: SystemStatus;
  objects: TrackedObjectSummary[];
  conjunctions: ConjunctionEvent[];
  timestamp: number;
}

export interface WsConjunctionUpdatePacket {
  type: 'conjunction_update';
  status: SystemStatus;
  conjunctions: ConjunctionEvent[];
  objects: TrackedObjectSummary[];
  timestamp: number;
}

export type WsServerPacket =
  | WsTelemetryPacket
  | WsInitialStatePacket
  | WsConjunctionUpdatePacket
  | { type: 'pong'; timestamp: number }
  | { type: 'sync_complete'; status: SystemStatus; objects: TrackedObjectSummary[]; conjunctions: ConjunctionEvent[] }
  | { type: 'dataset_updated'; status: SystemStatus; snapshot: SnapshotMetadata }
  | { type: 'error'; message: string };


