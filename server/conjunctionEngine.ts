import {
  TleRecord,
  ConjunctionEvent,
  RiskScoreBreakdown,
  RiskLevel,
  SystemConfig,
  DistanceTimePoint,
  ConjunctionHistory,
  Vector3D
} from './types';
import {
  createSatrec,
  SatrecWrapper,
  propagateAtTime,
  generateTrajectory,
  getObjectSummary
} from './propagator';

export const DEFAULT_CONFIG: SystemConfig = {
  datasetSize: 35,
  predictionHours: 24,
  timeStepSeconds: 60,
  distanceThresholdKm: 15,
  riskWeights: {
    distance: 0.60,
    velocity: 0.25,
    time: 0.15
  },
  riskThresholds: {
    critical: 80,
    high: 60,
    medium: 30
  }
};

/**
 * Calculates Euclidean distance between two 3D vectors (km)
 */
export function calculateDistance(p1: Vector3D, p2: Vector3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculates relative velocity magnitude between two velocity vectors (km/s)
 */
export function calculateRelativeVelocity(v1: Vector3D, v2: Vector3D): number {
  const dvx = v1.x - v2.x;
  const dvy = v1.y - v2.y;
  const dvz = v1.z - v2.z;
  return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
}

/**
 * Computes explainable risk score according to prompt specification
 */
export function calculateRiskScore(
  minDistanceKm: number,
  relativeVelocityKmS: number,
  timeToEventHours: number,
  config: SystemConfig = DEFAULT_CONFIG
): RiskScoreBreakdown {
  // 1. Distance Risk Score (0 - 100)
  let distanceScore = 0;
  if (minDistanceKm < 1.0) {
    distanceScore = 100;
  } else if (minDistanceKm < 2.0) {
    distanceScore = 80 + (2.0 - minDistanceKm) * 20; // 80 - 100
  } else if (minDistanceKm < 5.0) {
    distanceScore = 60 + ((5.0 - minDistanceKm) / 3.0) * 20; // 60 - 80
  } else if (minDistanceKm < 10.0) {
    distanceScore = 30 + ((10.0 - minDistanceKm) / 5.0) * 30; // 30 - 60
  } else if (minDistanceKm <= config.distanceThresholdKm) {
    distanceScore = Math.max(0, ((config.distanceThresholdKm - minDistanceKm) / (config.distanceThresholdKm - 10.0)) * 30);
  } else {
    distanceScore = 0;
  }

  // 2. Relative Velocity Contribution (0 - 100)
  let velocityScore = 0;
  if (relativeVelocityKmS >= 10.0) {
    velocityScore = 100;
  } else if (relativeVelocityKmS >= 5.0) {
    velocityScore = 60 + ((relativeVelocityKmS - 5.0) / 5.0) * 40; // 60 - 100
  } else {
    velocityScore = Math.max(10, (relativeVelocityKmS / 5.0) * 60); // 10 - 60
  }

  // 3. Time-to-Event Contribution (0 - 100)
  let timeScore = 0;
  if (timeToEventHours < 1.0) {
    timeScore = 100;
  } else if (timeToEventHours <= 6.0) {
    timeScore = 70 + ((6.0 - timeToEventHours) / 5.0) * 30; // 70 - 100
  } else if (timeToEventHours <= 24.0) {
    timeScore = 30 + ((24.0 - timeToEventHours) / 18.0) * 40; // 30 - 70
  } else {
    timeScore = Math.max(5, 30 - (timeToEventHours - 24.0) * 0.5);
  }

  // Weighted Combination
  const wDist = config.riskWeights.distance;
  const wVel = config.riskWeights.velocity;
  const wTime = config.riskWeights.time;

  const rawFinalScore = wDist * distanceScore + wVel * velocityScore + wTime * timeScore;
  const finalRiskScore = Math.min(100, Math.max(0, Number(rawFinalScore.toFixed(1))));

  let riskLevel: RiskLevel = 'LOW';
  if (finalRiskScore >= config.riskThresholds.critical) {
    riskLevel = 'CRITICAL';
  } else if (finalRiskScore >= config.riskThresholds.high) {
    riskLevel = 'HIGH';
  } else if (finalRiskScore >= config.riskThresholds.medium) {
    riskLevel = 'MEDIUM';
  }

  const formulaDescription = `${(wDist * 100).toFixed(0)}% × [Dist: ${distanceScore.toFixed(0)}] + ${(wVel * 100).toFixed(0)}% × [Vel: ${velocityScore.toFixed(0)}] + ${(wTime * 100).toFixed(0)}% × [Time: ${timeScore.toFixed(0)}] = ${finalRiskScore}`;

  return {
    rawDistanceKm: Number(minDistanceKm.toFixed(3)),
    distanceScore: Number(distanceScore.toFixed(1)),
    distanceWeight: wDist,
    relativeVelocityKmS: Number(relativeVelocityKmS.toFixed(2)),
    velocityScore: Number(velocityScore.toFixed(1)),
    velocityWeight: wVel,
    timeToEventHours: Number(timeToEventHours.toFixed(2)),
    timeScore: Number(timeScore.toFixed(1)),
    timeWeight: wTime,
    finalRiskScore,
    riskLevel,
    formulaDescription
  };
}

/**
 * Refines the closest approach around an initial detected timestamp using 1-second sub-stepping
 */
function refineClosestApproach(
  wrapperA: SatrecWrapper,
  wrapperB: SatrecWrapper,
  centerDate: Date,
  windowSeconds: number = 60
): { minDistance: number; tcaDate: Date; posA: Vector3D; posB: Vector3D; relVel: number } {
  let bestDist = Infinity;
  let bestDate = centerDate;
  let bestPosA: Vector3D = { x: 0, y: 0, z: 0 };
  let bestPosB: Vector3D = { x: 0, y: 0, z: 0 };
  let bestRelVel = 0;

  const centerMs = centerDate.getTime();
  for (let s = -windowSeconds; s <= windowSeconds; s += 2) {
    const d = new Date(centerMs + s * 1000);
    const ptA = propagateAtTime(wrapperA, d);
    const ptB = propagateAtTime(wrapperB, d);

    if (ptA && ptB) {
      const dist = calculateDistance(ptA.position, ptB.position);
      if (dist < bestDist) {
        bestDist = dist;
        bestDate = d;
        bestPosA = ptA.position;
        bestPosB = ptB.position;
        bestRelVel = calculateRelativeVelocity(ptA.velocity, ptB.velocity);
      }
    }
  }

  return {
    minDistance: bestDist,
    tcaDate: bestDate,
    posA: bestPosA,
    posB: bestPosB,
    relVel: bestRelVel
  };
}

/**
 * Performs pairwise conjunction detection across all tracked orbital objects
 */
export function detectConjunctions(
  tleRecords: TleRecord[],
  config: SystemConfig = DEFAULT_CONFIG,
  startDate: Date = new Date()
): ConjunctionEvent[] {
  const wrappers = tleRecords.map((r) => createSatrec(r)).filter((w) => w.isValid);
  const n = wrappers.length;
  console.log(`[Conjunction Engine] Starting pairwise analysis for ${n} objects (${(n * (n - 1)) / 2} pairs)...`);

  // Pre-generate trajectories on time step grid
  const trajectories: Map<string, ReturnType<typeof generateTrajectory>> = new Map();
  for (const w of wrappers) {
    trajectories.set(
      w.record.id,
      generateTrajectory(w, startDate, config.predictionHours, config.timeStepSeconds)
    );
  }

  const events: ConjunctionEvent[] = [];

  for (let i = 0; i < n; i++) {
    const wA = wrappers[i];
    const trajA = trajectories.get(wA.record.id);
    if (!trajA || trajA.length === 0) continue;

    for (let j = i + 1; j < n; j++) {
      const wB = wrappers[j];
      const trajB = trajectories.get(wB.record.id);
      if (!trajB || trajB.length === 0) continue;

      let pairMinDist = Infinity;
      let minIndex = -1;
      const len = Math.min(trajA.length, trajB.length);

      for (let k = 0; k < len; k++) {
        const pA = trajA[k].position;
        const pB = trajB[k].position;
        const d = calculateDistance(pA, pB);
        if (d < pairMinDist) {
          pairMinDist = d;
          minIndex = k;
        }
      }

      // If within threshold, refine TCA
      if (pairMinDist <= config.distanceThresholdKm && minIndex >= 0) {
        const roughTcaDate = new Date(trajA[minIndex].timestamp);
        const refined = refineClosestApproach(wA, wB, roughTcaDate, config.timeStepSeconds);

        if (refined.minDistance <= config.distanceThresholdKm) {
          const timeToEventHours = Math.max(0, (refined.tcaDate.getTime() - startDate.getTime()) / (1000 * 3600));
          const breakdown = calculateRiskScore(refined.minDistance, refined.relVel, timeToEventHours, config);

          const summaryA = getObjectSummary(wA, startDate);
          const summaryB = getObjectSummary(wB, startDate);

          events.push({
            id: `CONJ-${wA.record.id}-${wB.record.id}`,
            objectA: summaryA,
            objectB: summaryB,
            tcaIso: refined.tcaDate.toISOString(),
            tcaTimestamp: refined.tcaDate.getTime(),
            timeToEventHours: Number(timeToEventHours.toFixed(2)),
            minDistanceKm: Number(refined.minDistance.toFixed(3)),
            relativeVelocityKmS: Number(refined.relVel.toFixed(2)),
            riskScore: breakdown.finalRiskScore,
            riskLevel: breakdown.riskLevel,
            breakdown,
            positionAAtTca: refined.posA,
            positionBAtTca: refined.posB
          });
        }
      }
    }
  }

  // Sort descending by risk score
  events.sort((a, b) => b.riskScore - a.riskScore);
  console.log(`[Conjunction Engine] Analysis complete. Found ${events.length} conjunction candidates.`);
  return events;
}

/**
 * Generates distance-vs-time series for a specific conjunction pair
 */
export function getDistanceHistory(
  recA: TleRecord,
  recB: TleRecord,
  tcaDate: Date,
  spanMinutes: number = 60
): ConjunctionHistory {
  const wA = createSatrec(recA);
  const wB = createSatrec(recB);
  const points: DistanceTimePoint[] = [];

  const centerMs = tcaDate.getTime();
  let minDistanceKm = Infinity;

  // Generate 120 samples across span
  const stepMs = (spanMinutes * 60 * 1000) / 120;
  const startMs = centerMs - (spanMinutes * 60 * 1000) / 2;

  for (let t = 0; t <= 120; t++) {
    const currentMs = startMs + t * stepMs;
    const d = new Date(currentMs);
    const ptA = propagateAtTime(wA, d);
    const ptB = propagateAtTime(wB, d);

    if (ptA && ptB) {
      const dist = calculateDistance(ptA.position, ptB.position);
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
      }
      points.push({
        timeIso: d.toISOString(),
        timestamp: currentMs,
        timeOffsetMin: Number(((currentMs - centerMs) / (60 * 1000)).toFixed(1)),
        distanceKm: Number(dist.toFixed(3)),
        posA: ptA.position,
        posB: ptB.position
      });
    }
  }

  return {
    conjunctionId: `CONJ-${recA.id}-${recB.id}`,
    objectAName: recA.name,
    objectBName: recB.name,
    tcaIso: tcaDate.toISOString(),
    minDistanceKm: Number(minDistanceKm.toFixed(3)),
    points
  };
}
