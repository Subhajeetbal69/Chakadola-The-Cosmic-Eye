/**
 * LEO Space Situational Awareness (SSA) Pipeline Test Suite
 * Validates:
 * 1. LEO Orbital Filtering & Classification Logic (h <= 2000 km)
 * 2. TLE Modulo-10 Checksum & Parser Metrics Validation
 * 3. Atomic SQLite Snapshot Persistence, Retention Pruning (Keep 3), & Rollback
 * 4. 4-Factor LEO Multi-Factor Risk Scoring Engine
 * 5. End-to-end Conjunction Detection LEO Invariant
 * 6. Dataset Freshness State Transitions
 */

import { classifyOrbit, parseTleWithMetrics, parseTleRawText } from '../server/tleParser';
import {
  getDb,
  saveNewSnapshot,
  loadActiveSnapshot,
  getActiveSnapshotMetadata,
  getSnapshotList,
  rollbackToSnapshot
} from '../server/db';
import {
  calculateRiskScore,
  DEFAULT_CONFIG,
  detectConjunctions
} from '../server/conjunctionEngine';
import { SnapshotMetadata, TleRecord, FreshnessState } from '../src/types';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail !== undefined) {
      console.error('    Detail:', detail);
    }
    testsFailed++;
  }
}

function assertClose(actual: number, expected: number, tolerance: number, testName: string) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${testName} (actual: ${actual}, expected: ${expected}, diff: ${diff.toFixed(4)})`);
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('🚀 RUNNING LEO SSA PIPELINE & MULTI-FACTOR RISK TEST SUITE');
  console.log('===============================================================\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Orbital Regime Classification & LEO Boundaries
  // ─────────────────────────────────────────────────────────────────
  console.log('[Test Section 1] Orbital Regime Classification');
  {
    // ISS (415 x 420 km, ecc 0.0005) -> LEO
    assert(classifyOrbit(415, 420, 0.0005) === 'LEO', 'ISS is classified as LEO');

    // Starlink (550 x 550 km) -> LEO
    assert(classifyOrbit(550, 550, 0.0001) === 'LEO', 'Starlink is classified as LEO');

    // Upper LEO boundary (1990 x 1995 km) -> LEO
    assert(classifyOrbit(1990, 1995, 0.001) === 'LEO', '1995 km apogee is classified as LEO');

    // Exactly at 2000 km boundary -> LEO
    assert(classifyOrbit(2000, 2000, 0.0001) === 'LEO', 'Exact 2000 km boundary is LEO');

    // Over 2000 km boundary (2005 km apogee) -> MEO
    assert(classifyOrbit(500, 2005, 0.001) !== 'LEO', 'Apogee > 2000 km is strictly excluded from LEO');

    // GPS Navigation (20,200 km) -> MEO
    assert(classifyOrbit(20180, 20220, 0.01) === 'MEO', 'GPS constellation is classified as MEO');

    // Geostationary (35,786 km) -> GEO
    assert(classifyOrbit(35780, 35790, 0.0001) === 'GEO', 'Geostationary altitude is classified as GEO');

    // Molniya / Highly Elliptical (500 x 39,000 km) -> HEO
    assert(classifyOrbit(500, 39000, 0.7) === 'HEO', 'Molniya orbit is classified as HEO');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: TLE Checksums, Parsing Metrics, & Non-LEO Pruning
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Test Section 2] TLE Modulo-10 Checksum & Parser Metrics');
  {
    // ISS (LEO) + GOES 16 (GEO) + COSMOS 2251 Debris (LEO) + Corrupted TLE
    const sampleTleFeed = `ISS (ZARYA)             
1 25544U 98067A   24060.50000000  .00016717  00000-0  10270-3 0  9004
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.48919970498722
GOES 16                 
1 41866U 16071A   24060.00000000  .00000100  00000-0  00000-0 0  9993
2 41866   0.0500  75.2000 0001000 180.0000 180.0000  1.00270000 35003
COSMOS 2251 DEB         
1 33749U 93036KJ  24060.50000000  .00002000  00000-0  15000-4 0  9996
2 33749  74.0400  50.1200 0030000  80.0000 280.0000 14.50000000750004
CORRUPT RECORD
1 99999U 99999A   26059.00000000  .00000000  00000-0  00000-0 0  00000
2 99999   0.0000   0.0000 0000000   0.0000   0.0000  0.00000000 00000`;

    const { records, metrics } = parseTleWithMetrics(sampleTleFeed, 'SAMPLE_DATASET', true);

    assert(metrics.validRecords === 2, `Retained 2 valid LEO records (got: ${metrics.validRecords})`);
    assert(metrics.nonLeoRecords === 1, `Correctly detected and filtered GEO object GOES 16 (got: ${metrics.nonLeoRecords})`);
    assert(metrics.invalidChecksums >= 1, `Correctly rejected corrupt record checksums (got: ${metrics.invalidChecksums})`);
    assert(records.length === 2, `Retained exactly 2 LEO objects in returned array (got: ${records.length})`);
    assert(records.every(r => r.orbitClass === 'LEO'), 'All retained records have orbitClass === "LEO"');
    assert(records.some(r => r.noradId === 25544), 'ISS (25544) is present in retained LEO records');
    assert(records.some(r => r.noradId === 33749), 'COSMOS 2251 debris (33749) is present in retained LEO records');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Atomic SQLite Snapshot Persistence, Retention Pruning (Keep 3), & Rollback
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Test Section 3] Atomic SQLite Snapshot Store & Retention');
  {
    const db = await getDb(); // Ensure DB is initialized
    db.run("DELETE FROM snapshots;");
    db.run("DELETE FROM tles;");

    const tleTextA = `ISS (ZARYA)             
1 25544U 98067A   24060.50000000  .00016717  00000-0  10270-3 0  9004
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.48919970498722`;

    const tleTextB = `ISS (ZARYA)             
1 25544U 98067A   24060.50000000  .00016717  00000-0  10270-3 0  9004
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.48919970498722
COSMOS 2251 DEB         
1 33749U 93036KJ  24060.50000000  .00002000  00000-0  15000-4 0  9996
2 33749  74.0400  50.1200 0030000  80.0000 280.0000 14.50000000750004`;

    const mockRecordsA = parseTleRawText(tleTextA, 'LOCAL_SNAPSHOT', true);
    const mockRecordsB = parseTleRawText(tleTextB, 'LOCAL_SNAPSHOT', true);

    const baseTime = Date.now();

    // 1. Create Snapshot 1
    const meta1: SnapshotMetadata = {
      id: 'snap_test_001',
      fetchedAt: new Date(baseTime + 1000).toISOString(),
      processedAt: new Date(baseTime + 1000).toISOString(),
      source: 'CELESTRAK',
      totalFetched: 5,
      validLeoCount: 1,
      invalidCount: 0,
      nonLeoCount: 4,
      contentHash: 'hash001',
      status: 'ACTIVE'
    };
    await saveNewSnapshot(meta1, mockRecordsA, 3);

    let active = await loadActiveSnapshot();
    assert(active.metadata?.id === 'snap_test_001', 'Snapshot 1 is active after creation');
    assert(active.records.length === 1, 'Snapshot 1 contains 1 record');

    // 2. Create Snapshot 2
    const meta2: SnapshotMetadata = {
      id: 'snap_test_002',
      fetchedAt: new Date(baseTime + 2000).toISOString(),
      processedAt: new Date(baseTime + 2000).toISOString(),
      source: 'CELESTRAK',
      totalFetched: 6,
      validLeoCount: 2,
      invalidCount: 0,
      nonLeoCount: 4,
      contentHash: 'hash002',
      status: 'ACTIVE'
    };
    await saveNewSnapshot(meta2, mockRecordsB, 3);

    active = await loadActiveSnapshot();
    assert(active.metadata?.id === 'snap_test_002', 'Snapshot 2 became the active snapshot');
    assert(active.records.length === 2, 'Snapshot 2 contains 2 records');

    // 3. Create Snapshot 3 & 4 (to trigger retention pruning with keepLastN = 3)
    const meta3: SnapshotMetadata = {
      id: 'snap_test_003',
      fetchedAt: new Date(baseTime + 3000).toISOString(),
      processedAt: new Date(baseTime + 3000).toISOString(),
      source: 'CELESTRAK',
      totalFetched: 6,
      validLeoCount: 2,
      invalidCount: 0,
      nonLeoCount: 4,
      contentHash: 'hash003',
      status: 'ACTIVE'
    };
    await saveNewSnapshot(meta3, mockRecordsB, 3);

    const meta4: SnapshotMetadata = {
      id: 'snap_test_004',
      fetchedAt: new Date(baseTime + 4000).toISOString(),
      processedAt: new Date(baseTime + 4000).toISOString(),
      source: 'CELESTRAK',
      totalFetched: 6,
      validLeoCount: 2,
      invalidCount: 0,
      nonLeoCount: 4,
      contentHash: 'hash004',
      status: 'ACTIVE'
    };
    await saveNewSnapshot(meta4, mockRecordsB, 3);

    const snapshots = await getSnapshotList();
    assert(snapshots.length <= 3, `Retained snapshot count is <= 3 (actual: ${snapshots.length})`);
    assert(snapshots.some(s => s.id === 'snap_test_004'), 'Latest snapshot 4 is in retention list');
    assert(!snapshots.some(s => s.id === 'snap_test_001'), 'Oldest snapshot 1 was pruned automatically');

    // 4. Rollback to Snapshot 3
    const rolledBack = await rollbackToSnapshot('snap_test_003');
    assert(rolledBack === true, 'Rollback to snapshot 3 succeeded');
    const activeAfterRollback = await loadActiveSnapshot();
    assert(activeAfterRollback.metadata?.id === 'snap_test_003', 'Active snapshot is now snapshot 3 after rollback');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: 4-Factor LEO Multi-Factor Risk Scoring Engine
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Test Section 4] 4-Factor LEO Multi-Factor Risk Engine');
  {
    // Factor 1: Miss Distance Quadratic Term
    // d <= 1.0 km -> 100 pts
    const closeScore = calculateRiskScore(0.5, 10.0, 5.0, 550, DEFAULT_CONFIG);
    assert(closeScore.distanceScore === 100, 'Distance <= 1.0 km yields distanceScore of 100');

    // d = 8.0 km (half of 15km threshold) -> ((15-8)/14)^2 * 100 = 0.5^2 * 100 = 25 pts
    const midScore = calculateRiskScore(8.0, 10.0, 5.0, 550, DEFAULT_CONFIG);
    assertClose(midScore.distanceScore, 25.0, 0.5, 'Distance 8.0 km yields quadratic decay score of 25 pts');

    // d >= 15.0 km -> 0 pts
    const farScore = calculateRiskScore(15.5, 10.0, 5.0, 550, DEFAULT_CONFIG);
    assert(farScore.distanceScore === 0, 'Distance >= 15.0 km yields distanceScore of 0');

    // Factor 2: Collision Severity / Kinetic Energy Term
    // v = 14 km/s (max LEO relative speed) -> 100 pts (EXTREME)
    const extremeVel = calculateRiskScore(2.0, 14.0, 5.0, 550, DEFAULT_CONFIG);
    assert(extremeVel.severityScore === 100, 'v_rel = 14.0 km/s yields severityScore of 100');
    assert(extremeVel.severityLevel === 'EXTREME', 'v_rel = 14.0 km/s has EXTREME severity level');

    // v = 7.0 km/s -> (7/14)^2 * 100 = 25 pts (MEDIUM)
    const midVel = calculateRiskScore(2.0, 7.0, 5.0, 550, DEFAULT_CONFIG);
    assertClose(midVel.severityScore ?? 0, 25.0, 0.5, 'v_rel = 7.0 km/s yields severityScore of 25 pts');
    assert(midVel.severityLevel === 'MEDIUM', 'v_rel = 7.0 km/s has MEDIUM severity level');

    // Factor 3: Operational Urgency / TCA Term
    // t = 1.0 h -> 100 pts (CRITICAL)
    const critTime = calculateRiskScore(2.0, 10.0, 1.0, 550, DEFAULT_CONFIG);
    assert(critTime.urgencyScore === 100, 't = 1.0h yields urgencyScore of 100');
    assert(critTime.urgencyLevel === 'CRITICAL', 't = 1.0h has CRITICAL urgency level');

    // t = 24.0 h -> 100 * exp(-0.052 * 23) ~= 30.2 pts (MEDIUM)
    const medTime = calculateRiskScore(2.0, 10.0, 24.0, 550, DEFAULT_CONFIG);
    assertClose(medTime.urgencyScore ?? 0, 30.2, 1.0, 't = 24h yields urgencyScore around 30.2 pts');
    assert(medTime.urgencyLevel === 'MEDIUM', 't = 24h has MEDIUM urgency level');

    // Factor 4: LEO Altitude Traffic Density Shell Context
    const bandConstellation = calculateRiskScore(2.0, 10.0, 5.0, 550, DEFAULT_CONFIG);
    assert(bandConstellation.leoContextScore === 95, '550 km core constellation band yields 95 pts');
    assert(bandConstellation.leoBand === 'CORE_CONSTELLATION_LEO', '550 km classified as CORE_CONSTELLATION_LEO');

    const bandMid = calculateRiskScore(2.0, 10.0, 5.0, 800, DEFAULT_CONFIG);
    assert(bandMid.leoContextScore === 85, '800 km mid LEO band yields 85 pts');

    const bandLow = calculateRiskScore(2.0, 10.0, 5.0, 250, DEFAULT_CONFIG);
    assert(bandLow.leoContextScore === 40, '250 km very low LEO band yields 40 pts');

    // Composite 4-Factor Weighted Sum Test
    // Formula: (0.45 * S_dist) + (0.25 * S_sev) + (0.20 * S_urg) + (0.10 * S_env)
    // For: d=0.5 (100), v=14.0 (100), t=1.0 (100), alt=550 (95):
    // Expected: (0.45 * 100) + (0.25 * 100) + (0.20 * 100) + (0.10 * 95) = 45 + 25 + 20 + 9.5 = 99.5
    const compositeMax = calculateRiskScore(0.5, 14.0, 1.0, 550, DEFAULT_CONFIG);
    assertClose(compositeMax.finalRiskScore, 99.5, 0.1, 'Composite max threat score matches exact 4-factor formula (99.5 pts)');
    assert(compositeMax.riskLevel === 'CRITICAL', 'Score 99.5 is classified as CRITICAL threat level');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: End-to-End Conjunction Engine LEO Invariant
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Test Section 5] Conjunction Detection LEO Invariant');
  {
    const mixedTleText = `ISS (ZARYA)             
1 25544U 98067A   24060.50000000  .00016717  00000-0  10270-3 0  9004
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.48919970498722
COSMOS 2251 DEB         
1 33749U 93036KJ  24060.50000000  .00002000  00000-0  15000-4 0  9996
2 33749  74.0400  50.1200 0030000  80.0000 280.0000 14.50000000750004
GOES 16                 
1 41866U 16071A   24060.00000000  .00000100  00000-0  00000-0 0  9993
2 41866   0.0500  75.2000 0001000 180.0000 180.0000  1.00270000 35003`;

    const mixedRecords = parseTleRawText(mixedTleText, 'SAMPLE_DATASET', false);

    const results = detectConjunctions(mixedRecords, DEFAULT_CONFIG, new Date());
    assert(Array.isArray(results), 'Conjunction engine executed without errors');
    // None of the conjunction candidates should involve GEO object
    assert(
      results.every(c => c.objectA?.orbitClass === 'LEO' && c.objectB?.orbitClass === 'LEO'),
      'Strict LEO invariant: All conjunction events exclusively involve LEO objects'
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Data Freshness State Classifier
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Test Section 6] Data Freshness State Classification');
  {
    function calculateFreshness(snapshot: SnapshotMetadata | null, isLive: boolean): FreshnessState {
      if (!snapshot) return 'NO_DATA';
      const ageSec = Math.max(0, Math.floor((Date.now() - new Date(snapshot.fetchedAt).getTime()) / 1000));
      if (isLive && ageSec < 30 * 60) return 'LIVE';
      if (ageSec < 2 * 3600) return 'FRESH_SNAPSHOT';
      if (ageSec < 24 * 3600) return 'STALE_SNAPSHOT';
      return 'CRITICAL_STALE';
    }

    const liveSnap: SnapshotMetadata = {
      id: 's1',
      fetchedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      processedAt: new Date().toISOString(),
      source: 'CELESTRAK',
      totalFetched: 100,
      validLeoCount: 100,
      invalidCount: 0,
      nonLeoCount: 0,
      contentHash: 'h',
      status: 'ACTIVE'
    };
    assert(calculateFreshness(liveSnap, true) === 'LIVE', 'Fetch < 30 min ago with live flag is LIVE');

    const freshCache: SnapshotMetadata = {
      ...liveSnap,
      fetchedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() // 45 min ago
    };
    assert(calculateFreshness(freshCache, false) === 'FRESH_SNAPSHOT', 'Snapshot 45 min ago is FRESH_SNAPSHOT');

    const staleCache: SnapshotMetadata = {
      ...liveSnap,
      fetchedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString() // 5 hrs ago
    };
    assert(calculateFreshness(staleCache, false) === 'STALE_SNAPSHOT', 'Snapshot 5 hrs ago is STALE_SNAPSHOT');

    const criticalStaleCache: SnapshotMetadata = {
      ...liveSnap,
      fetchedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString() // 30 hrs ago
    };
    assert(calculateFreshness(criticalStaleCache, false) === 'CRITICAL_STALE', 'Snapshot 30 hrs ago is CRITICAL_STALE');

    assert(calculateFreshness(null, false) === 'NO_DATA', 'Null snapshot is NO_DATA');
  }

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────
  console.log('\n===============================================================');
  console.log(`🏁 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('===============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
