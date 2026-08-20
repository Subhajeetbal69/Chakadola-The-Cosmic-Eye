export type ObjectClassification = 'ACTIVE_SATELLITE' | 'ROCKET_BODY' | 'DEBRIS' | 'SPECIAL';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface TleRecord {
  id: string; // NORAD ID or unique key
  noradId?: number;
  name: string;
  line1: string;
  line2: string;
  classification: ObjectClassification;
  source: 'CELESTRAK' | 'SAMPLE_DATASET' | 'DEMO_CONJUNCTION';
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
  distanceScore: number; // 0-100
  distanceWeight: number; // e.g. 0.60
  
  relativeVelocityKmS: number;
  velocityScore: number; // 0-100
  velocityWeight: number; // e.g. 0.25
  
  timeToEventHours: number;
  timeScore: number; // 0-100
  timeWeight: number; // e.g. 0.15
  
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
}

export interface LiveTelemetryObject {
  id: string;
  name: string;
  classification: ObjectClassification;
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
  | { type: 'error'; message: string };

