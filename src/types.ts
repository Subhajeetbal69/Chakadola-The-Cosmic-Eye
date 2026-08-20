export type ObjectClassification = 'ACTIVE_SATELLITE' | 'ROCKET_BODY' | 'DEBRIS' | 'SPECIAL';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface TleRecord {
  id: string; // NORAD ID or unique key
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

export interface DistanceTimePoint {
  timeIso: string;
  timestamp: number;
  timeOffsetMin: number;
  distanceKm: number;
  posA: Vector3D;
  posB: Vector3D;
}

export interface ConjunctionHistory {
  conjunctionId: string;
  objectAName: string;
  objectBName: string;
  tcaIso: string;
  minDistanceKm: number;
  points: DistanceTimePoint[];
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
  analysisWindowHours: number;
  timeStepSeconds: number;
  detectedConjunctionsCount: number;
  activeSource: string;
  config: SystemConfig;
  isProcessing?: boolean;
}
