import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { TleRecord, SnapshotMetadata } from './types';

let dbInstance: Database | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'debris_tracker.sqlite');
export const KEEP_LAST_N_SNAPSHOTS = 3;

/**
 * Initializes or retrieves SQLite database with upgraded snapshot schemas
 */
export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      dbInstance = new SQL.Database(fileBuffer);
      console.log('[DB] Loaded existing SQLite database from disk.');
    } catch (err) {
      console.warn('[DB] Failed reading existing DB file, creating fresh DB:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
    console.log('[DB] Initialized fresh in-memory SQLite database.');
  }

  // Check if existing tables need schema migration to snapshot model
  try {
    const checkCols = dbInstance.exec("PRAGMA table_info(tles)");
    if (checkCols.length > 0 && checkCols[0].values) {
      const colNames = checkCols[0].values.map((v: any[]) => v[1]);
      if (!colNames.includes('snapshot_id') || !colNames.includes('orbit_class')) {
        console.log('[DB Migration] Migrating legacy SQLite schema to LEO snapshot model...');
        dbInstance.run('DROP TABLE IF EXISTS tles;');
        dbInstance.run('DROP TABLE IF EXISTS conjunctions;');
      }
    }
  } catch (err) {
    console.warn('[DB Migration] Schema check exception:', err);
  }

  // Ensure tables and indices exist
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      object_count INTEGER NOT NULL,
      total_fetched INTEGER NOT NULL,
      invalid_count INTEGER NOT NULL,
      non_leo_count INTEGER NOT NULL,
      data_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tles (
      id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      line1 TEXT NOT NULL,
      line2 TEXT NOT NULL,
      classification TEXT NOT NULL,
      orbit_class TEXT NOT NULL,
      perigee_km REAL NOT NULL,
      apogee_km REAL NOT NULL,
      altitude_km REAL NOT NULL,
      inclination_deg REAL NOT NULL,
      eccentricity REAL NOT NULL,
      mean_motion REAL NOT NULL,
      period_min REAL NOT NULL,
      epoch_year INTEGER NOT NULL,
      epoch_day REAL NOT NULL,
      source TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_tles_snapshot_id ON tles (snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_tles_classification ON tles (classification);
    CREATE INDEX IF NOT EXISTS idx_tles_orbit_class ON tles (orbit_class);
    CREATE INDEX IF NOT EXISTS idx_snapshots_active ON snapshots (is_active);
    CREATE INDEX IF NOT EXISTS idx_snapshots_fetched_at ON snapshots (fetched_at);

    CREATE TABLE IF NOT EXISTS conjunctions (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT,
      object_a_id TEXT NOT NULL,
      object_b_id TEXT NOT NULL,
      tca TEXT NOT NULL,
      min_distance REAL NOT NULL,
      relative_velocity REAL NOT NULL,
      risk_score REAL NOT NULL,
      risk_level TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  saveDb();
  return dbInstance;
}

/**
 * Persists SQLite memory state to disk
 */
export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('[DB] Error saving SQLite database to disk:', err);
  }
}

/**
 * Atomically saves a new snapshot, marks it as ACTIVE, supersedes previous snapshots,
 * and prunes historical snapshots exceeding KEEP_LAST_N_SNAPSHOTS.
 */
export async function saveNewSnapshot(
  metadata: SnapshotMetadata,
  records: TleRecord[],
  keepLastN: number = KEEP_LAST_N_SNAPSHOTS
): Promise<void> {
  const db = await getDb();

  db.run('BEGIN TRANSACTION;');
  try {
    // 1. Mark existing active snapshots as SUPERSEDED
    db.run(`
      UPDATE snapshots
      SET is_active = 0, status = 'SUPERSEDED'
      WHERE is_active = 1
    `);

    // 2. Insert new Snapshot record
    const snapStmt = db.prepare(`
      INSERT OR REPLACE INTO snapshots (
        id, source, fetched_at, processed_at, object_count,
        total_fetched, invalid_count, non_leo_count, data_hash,
        is_active, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE')
    `);

    snapStmt.run([
      metadata.id,
      metadata.source || 'SAMPLE_DATASET',
      metadata.fetchedAt || new Date().toISOString(),
      metadata.processedAt || new Date().toISOString(),
      records.length,
      metadata.totalFetched ?? records.length,
      metadata.invalidCount ?? 0,
      metadata.nonLeoCount ?? 0,
      metadata.contentHash || metadata.dataHash || 'no_hash'
    ]);
    snapStmt.free();

    // 3. Insert all TLE records tied to this snapshot
    const tleStmt = db.prepare(`
      INSERT OR REPLACE INTO tles (
        id, snapshot_id, name, line1, line2, classification,
        orbit_class, perigee_km, apogee_km, altitude_km,
        inclination_deg, eccentricity, mean_motion, period_min,
        epoch_year, epoch_day, source, data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of records) {
      const recordWithSnapshot: TleRecord = {
        ...r,
        snapshotId: metadata.id,
        orbitClass: r.orbitClass || 'LEO'
      };

      tleStmt.run([
        r.id,
        metadata.id,
        r.name || 'UNKNOWN',
        r.line1,
        r.line2,
        r.classification || 'ACTIVE_SATELLITE',
        recordWithSnapshot.orbitClass || 'LEO',
        r.perigeeKm ?? 0,
        r.apogeeKm ?? 0,
        ((r.perigeeKm || 0) + (r.apogeeKm || 0)) / 2,
        r.inclinationDeg ?? 0,
        r.eccentricity ?? 0,
        r.meanMotionRevDay ?? 15.0,
        r.periodMin ?? 92.0,
        r.epochYear ?? 2026,
        r.epochDay ?? 1,
        r.source || metadata.source || 'SAMPLE_DATASET',
        JSON.stringify(recordWithSnapshot),
        r.updatedAt || new Date().toISOString()
      ]);
    }
    tleStmt.free();

    // 4. Prune older snapshots exceeding retention policy (keep last N)
    const res = db.exec(`
      SELECT id FROM snapshots
      ORDER BY fetched_at DESC
    `);

    if (res && res.length > 0 && res[0].values) {
      const allSnapshotIds = res[0].values.map((v) => v[0] as string);
      if (allSnapshotIds.length > keepLastN) {
        const pruneIds = allSnapshotIds.slice(keepLastN);
        for (const pid of pruneIds) {
          db.run('DELETE FROM tles WHERE snapshot_id = ?', [pid]);
          db.run('DELETE FROM snapshots WHERE id = ?', [pid]);
          console.log(`[DB] Pruned older snapshot: ${pid}`);
        }
      }
    }

    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    console.error('[DB] Snapshot insertion failed, rolled back:', err);
    throw err;
  }

  await setMetadata('active_snapshot_id', metadata.id);
  await setMetadata('last_tle_update', metadata.fetchedAt);
  await setMetadata('tracked_count', records.length.toString());
  await setMetadata('active_source', metadata.source);
  saveDb();
}

/**
 * Loads the active snapshot metadata and its full set of TLE records
 */
export async function loadActiveSnapshot(): Promise<{ metadata: SnapshotMetadata | null; records: TleRecord[] }> {
  const db = await getDb();

  // 1. Fetch active snapshot metadata
  const snapRes = db.exec(`
    SELECT id, source, fetched_at, processed_at, object_count,
           total_fetched, invalid_count, non_leo_count, data_hash,
           is_active, status
    FROM snapshots
    WHERE is_active = 1
    LIMIT 1
  `);

  if (!snapRes || snapRes.length === 0 || !snapRes[0].values || snapRes[0].values.length === 0) {
    // If no explicit active snapshot, try getting the most recent snapshot
    const fallbackRes = db.exec(`
      SELECT id, source, fetched_at, processed_at, object_count,
             total_fetched, invalid_count, non_leo_count, data_hash,
             is_active, status
      FROM snapshots
      ORDER BY fetched_at DESC
      LIMIT 1
    `);

    if (!fallbackRes || fallbackRes.length === 0 || !fallbackRes[0].values || fallbackRes[0].values.length === 0) {
      return { metadata: null, records: [] };
    }

    const row = fallbackRes[0].values[0];
    const meta: SnapshotMetadata = {
      id: row[0] as string,
      source: row[1] as any,
      fetchedAt: row[2] as string,
      processedAt: row[3] as string,
      objectCount: row[4] as number,
      totalFetched: row[5] as number,
      invalidCount: row[6] as number,
      nonLeoCount: row[7] as number,
      dataHash: row[8] as string,
      isActive: (row[9] as number) === 1,
      status: row[10] as any
    };

    // Load records for this snapshot
    const tlesRes = db.exec(`
      SELECT data_json FROM tles
      WHERE snapshot_id = '${meta.id}'
      ORDER BY rowid ASC
    `);

    const records = (tlesRes && tlesRes[0]?.values)
      ? tlesRes[0].values.map((r) => JSON.parse(r[0] as string) as TleRecord)
      : [];

    return { metadata: meta, records };
  }

  const row = snapRes[0].values[0];
  const metadata: SnapshotMetadata = {
    id: row[0] as string,
    source: row[1] as any,
    fetchedAt: row[2] as string,
    processedAt: row[3] as string,
    objectCount: row[4] as number,
    totalFetched: row[5] as number,
    invalidCount: row[6] as number,
    nonLeoCount: row[7] as number,
    dataHash: row[8] as string,
    isActive: (row[9] as number) === 1,
    status: row[10] as any
  };

  const tlesRes = db.exec(`
    SELECT data_json FROM tles
    WHERE snapshot_id = '${metadata.id}'
    ORDER BY rowid ASC
  `);

  const records = (tlesRes && tlesRes[0]?.values)
    ? tlesRes[0].values.map((r) => JSON.parse(r[0] as string) as TleRecord)
    : [];

  return { metadata, records };
}

/**
 * Returns metadata of the active snapshot
 */
export async function getActiveSnapshotMetadata(): Promise<SnapshotMetadata | null> {
  const { metadata } = await loadActiveSnapshot();
  return metadata;
}

/**
 * Returns list of retained snapshots
 */
export async function getSnapshotList(): Promise<SnapshotMetadata[]> {
  const db = await getDb();
  const res = db.exec(`
    SELECT id, source, fetched_at, processed_at, object_count,
           total_fetched, invalid_count, non_leo_count, data_hash,
           is_active, status
    FROM snapshots
    ORDER BY fetched_at DESC
  `);

  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }

  return res[0].values.map((row) => ({
    id: row[0] as string,
    source: row[1] as any,
    fetchedAt: row[2] as string,
    processedAt: row[3] as string,
    objectCount: row[4] as number,
    totalFetched: row[5] as number,
    invalidCount: row[6] as number,
    nonLeoCount: row[7] as number,
    dataHash: row[8] as string,
    isActive: (row[9] as number) === 1,
    status: row[10] as any
  }));
}

/**
 * Rolls back the active snapshot to a specific retained snapshot ID
 */
export async function rollbackToSnapshot(snapshotId: string): Promise<boolean> {
  const db = await getDb();

  db.run('BEGIN TRANSACTION;');
  try {
    db.run('UPDATE snapshots SET is_active = 0, status = "SUPERSEDED" WHERE is_active = 1');
    db.run('UPDATE snapshots SET is_active = 1, status = "ACTIVE" WHERE id = ?', [snapshotId]);
    db.run('COMMIT;');
    await setMetadata('active_snapshot_id', snapshotId);
    saveDb();
    return true;
  } catch (err) {
    db.run('ROLLBACK;');
    console.error('[DB] Rollback failed:', err);
    return false;
  }
}

/**
 * Legacy compatibility wrapper to load all TLEs from current active snapshot
 */
export async function loadAllTles(): Promise<TleRecord[]> {
  const { records } = await loadActiveSnapshot();
  return records;
}

/**
 * Legacy compatibility wrapper to save TLE records by creating a local snapshot
 */
export async function saveTleRecords(records: TleRecord[]): Promise<void> {
  const snapId = `snap_local_${Date.now()}`;
  const metadata: SnapshotMetadata = {
    id: snapId,
    source: 'LOCAL_SNAPSHOT',
    fetchedAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    objectCount: records.length,
    totalFetched: records.length,
    invalidCount: 0,
    nonLeoCount: 0,
    dataHash: `hash_${records.length}_${Date.now()}`,
    isActive: true,
    status: 'ACTIVE'
  };

  await saveNewSnapshot(metadata, records);
}

export async function setMetadata(key: string, value: string): Promise<void> {
  const db = await getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO system_metadata (key, value) VALUES (?, ?)');
  stmt.run([key, value]);
  stmt.free();
  saveDb();
}

export async function getMetadata(key: string, defaultValue: string = ''): Promise<string> {
  const db = await getDb();
  const stmt = db.prepare('SELECT value FROM system_metadata WHERE key = ?');
  stmt.bind([key]);
  let val = defaultValue;
  if (stmt.step()) {
    const row = stmt.get();
    val = (row[0] as string) || defaultValue;
  }
  stmt.free();
  return val;
}


