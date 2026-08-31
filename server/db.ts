import 'dotenv/config';
import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { TleRecord, SnapshotMetadata } from './types';

const { Pool } = pg;

let dbInstance: Database | null = null;
let pgPool: pg.Pool | null = null;
let pgAvailable = false;
let lastPgAttemptTime = 0;
export const PG_RETRY_INTERVAL_MS = 30000; // 30-second cooldown before attempting reconnection

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'debris_tracker.sqlite');
export const KEEP_LAST_N_SNAPSHOTS = 3;

/**
 * Detects if PostgreSQL is configured via DATABASE_URL
 */
export function isPostgresConfigured(): boolean {
  return !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0;
}

/**
 * Returns whether PostgreSQL is currently connected and healthy
 */
export function isPostgresActive(): boolean {
  return pgAvailable && pgPool !== null;
}

/**
 * Initializes and retrieves PostgreSQL connection pool with Self-Healing Reconnection.
 * If PostgreSQL is temporarily down, it falls back to SQLite and automatically
 * retries connecting every 30 seconds when new requests arrive.
 */
export async function getPgPool(): Promise<pg.Pool | null> {
  if (!isPostgresConfigured()) {
    return null;
  }

  if (pgPool && pgAvailable) {
    return pgPool;
  }

  const now = Date.now();
  // Cooldown check: prevent hammering an unreachable database on every single request
  if (!pgAvailable && lastPgAttemptTime > 0 && now - lastPgAttemptTime < PG_RETRY_INTERVAL_MS) {
    return null;
  }

  lastPgAttemptTime = now;
  const connectionString = process.env.DATABASE_URL!;
  const isLocalPg = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  try {
    if (!pgPool) {
      pgPool = new Pool({
        connectionString,
        ssl: isLocalPg ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000, // 15s timeout for remote cloud regions
        keepAlive: true
      });

      pgPool.on('error', (err) => {
        console.warn('[DB] Background PostgreSQL pool notice:', err.message);
        pgAvailable = false;
      });
    }

    console.log('[DB] Attempting connection to managed PostgreSQL database...');

    // Initialize PostgreSQL schemas
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS snapshots (
          id VARCHAR(64) PRIMARY KEY,
          source VARCHAR(64) NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL,
          processed_at TIMESTAMPTZ NOT NULL,
          object_count INT NOT NULL,
          total_fetched INT NOT NULL,
          invalid_count INT NOT NULL,
          non_leo_count INT NOT NULL,
          data_hash VARCHAR(64) NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          status VARCHAR(32) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tles (
          id VARCHAR(64) NOT NULL,
          snapshot_id VARCHAR(64) REFERENCES snapshots(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          line1 TEXT NOT NULL,
          line2 TEXT NOT NULL,
          classification VARCHAR(32) NOT NULL,
          orbit_class VARCHAR(16) NOT NULL,
          perigee_km DOUBLE PRECISION NOT NULL,
          apogee_km DOUBLE PRECISION NOT NULL,
          altitude_km DOUBLE PRECISION NOT NULL,
          inclination_deg DOUBLE PRECISION NOT NULL,
          eccentricity DOUBLE PRECISION NOT NULL,
          mean_motion DOUBLE PRECISION NOT NULL,
          period_min DOUBLE PRECISION NOT NULL,
          epoch_year INT NOT NULL,
          epoch_day DOUBLE PRECISION NOT NULL,
          source VARCHAR(64) NOT NULL,
          data_json JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (snapshot_id, id)
        );

        CREATE INDEX IF NOT EXISTS idx_tles_snapshot_id ON tles (snapshot_id);
        CREATE INDEX IF NOT EXISTS idx_tles_classification ON tles (classification);
        CREATE INDEX IF NOT EXISTS idx_tles_orbit_class ON tles (orbit_class);
        CREATE INDEX IF NOT EXISTS idx_snapshots_active ON snapshots (is_active);
        CREATE INDEX IF NOT EXISTS idx_snapshots_fetched_at ON snapshots (fetched_at);

        CREATE TABLE IF NOT EXISTS conjunctions (
          id VARCHAR(64) PRIMARY KEY,
          snapshot_id VARCHAR(64),
          object_a_id VARCHAR(64) NOT NULL,
          object_b_id VARCHAR(64) NOT NULL,
          tca TIMESTAMPTZ NOT NULL,
          min_distance DOUBLE PRECISION NOT NULL,
          relative_velocity DOUBLE PRECISION NOT NULL,
          risk_score DOUBLE PRECISION NOT NULL,
          risk_level VARCHAR(32) NOT NULL,
          data_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS system_metadata (
          key VARCHAR(128) PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      console.log('[DB] ✅ PostgreSQL connection established and schema verified.');
      pgAvailable = true;
    } finally {
      client.release();
    }

    return pgPool;
  } catch (err: any) {
    console.warn(`[DB] ⚠️ PostgreSQL connection notice: ${err?.message || 'Connection unavailable'}. Seamlessly falling back to local SQLite (auto-retry in 30s).`);
    pgAvailable = false;
    return null;
  }
}

/**
 * Initializes or retrieves SQLite database with upgraded snapshot schemas (Local / Offline Mode)
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
  const pool = await getPgPool();
  if (pool) {
    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // 1. Mark existing active snapshots as SUPERSEDED
      await client.query("UPDATE snapshots SET is_active = FALSE, status = 'SUPERSEDED' WHERE is_active = TRUE");

      // 2. Insert new Snapshot record
      await client.query(
        `INSERT INTO snapshots (
          id, source, fetched_at, processed_at, object_count,
          total_fetched, invalid_count, non_leo_count, data_hash,
          is_active, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET
          source = EXCLUDED.source,
          fetched_at = EXCLUDED.fetched_at,
          processed_at = EXCLUDED.processed_at,
          object_count = EXCLUDED.object_count,
          is_active = TRUE,
          status = 'ACTIVE'`,
        [
          metadata.id,
          metadata.source || 'SAMPLE_DATASET',
          metadata.fetchedAt || new Date().toISOString(),
          metadata.processedAt || new Date().toISOString(),
          records.length,
          metadata.totalFetched ?? records.length,
          metadata.invalidCount ?? 0,
          metadata.nonLeoCount ?? 0,
          metadata.contentHash || metadata.dataHash || 'no_hash'
        ]
      );

      // 3. Batch insert TLE records
      const BATCH_SIZE = 500;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const valueStrings: string[] = [];
        const params: any[] = [];
        let pIdx = 1;

        for (const r of batch) {
          const recordWithSnapshot: TleRecord = {
            ...r,
            snapshotId: metadata.id,
            orbitClass: r.orbitClass || 'LEO'
          };

          valueStrings.push(
            `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
          );

          params.push(
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
          );
        }

        const insertQuery = `
          INSERT INTO tles (
            id, snapshot_id, name, line1, line2, classification,
            orbit_class, perigee_km, apogee_km, altitude_km,
            inclination_deg, eccentricity, mean_motion, period_min,
            epoch_year, epoch_day, source, data_json, updated_at
          ) VALUES ${valueStrings.join(', ')}
          ON CONFLICT (snapshot_id, id) DO UPDATE SET
            data_json = EXCLUDED.data_json,
            updated_at = EXCLUDED.updated_at
        `;

        await client.query(insertQuery, params);
      }

      // 4. Prune older snapshots exceeding retention policy
      const snapListRes = await client.query('SELECT id FROM snapshots ORDER BY fetched_at DESC');
      if (snapListRes.rows.length > keepLastN) {
        const pruneIds = snapListRes.rows.slice(keepLastN).map((r) => r.id);
        await client.query('DELETE FROM snapshots WHERE id = ANY($1)', [pruneIds]);
        console.log(`[DB] Pruned ${pruneIds.length} older snapshots from PostgreSQL.`);
      }

      await client.query('COMMIT');
      await setMetadata('active_snapshot_id', metadata.id);
      await setMetadata('last_tle_update', metadata.fetchedAt);
      await setMetadata('tracked_count', records.length.toString());
      await setMetadata('active_source', metadata.source);
      return;
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK').catch(() => {});
      }
      pgAvailable = false;
      lastPgAttemptTime = Date.now();
      console.warn('[DB] ⚠️ PostgreSQL write lost connection, falling back to local SQLite (will retry in 30s):', err);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // SQLite fallback
  const db = await getDb();
  db.run('BEGIN TRANSACTION;');
  try {
    db.run("UPDATE snapshots SET is_active = 0, status = 'SUPERSEDED' WHERE is_active = 1");

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

    const res = db.exec('SELECT id FROM snapshots ORDER BY fetched_at DESC');
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
    console.error('[DB] SQLite snapshot insertion failed, rolled back:', err);
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
  const pool = await getPgPool();
  if (pool) {
    try {
      const snapRes = await pool.query(
        `SELECT id, source, fetched_at, processed_at, object_count,
                total_fetched, invalid_count, non_leo_count, data_hash,
                is_active, status
         FROM snapshots
         WHERE is_active = TRUE
         LIMIT 1`
      );

      if (snapRes.rows.length === 0) {
        const fallbackRes = await pool.query(
          `SELECT id, source, fetched_at, processed_at, object_count,
                  total_fetched, invalid_count, non_leo_count, data_hash,
                  is_active, status
           FROM snapshots
           ORDER BY fetched_at DESC
           LIMIT 1`
        );

        if (fallbackRes.rows.length > 0) {
          const row = fallbackRes.rows[0];
          const meta: SnapshotMetadata = {
            id: row.id,
            source: row.source,
            fetchedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : new Date().toISOString(),
            processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : new Date().toISOString(),
            objectCount: row.object_count,
            totalFetched: row.total_fetched,
            invalidCount: row.invalid_count,
            nonLeoCount: row.non_leo_count,
            dataHash: row.data_hash,
            isActive: row.is_active,
            status: row.status
          };

          const tlesRes = await pool.query('SELECT data_json FROM tles WHERE snapshot_id = $1', [meta.id]);
          const records = tlesRes.rows.map((r) => r.data_json as TleRecord);
          return { metadata: meta, records };
        }
      } else {
        const row = snapRes.rows[0];
        const metadata: SnapshotMetadata = {
          id: row.id,
          source: row.source,
          fetchedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : new Date().toISOString(),
          processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : new Date().toISOString(),
          objectCount: row.object_count,
          totalFetched: row.total_fetched,
          invalidCount: row.invalid_count,
          nonLeoCount: row.non_leo_count,
          dataHash: row.data_hash,
          isActive: row.is_active,
          status: row.status
        };

        const tlesRes = await pool.query('SELECT data_json FROM tles WHERE snapshot_id = $1', [metadata.id]);
        const records = tlesRes.rows.map((r) => r.data_json as TleRecord);
        return { metadata, records };
      }
    } catch (err) {
      pgAvailable = false;
      lastPgAttemptTime = Date.now();
      console.warn('[DB] ⚠️ PostgreSQL read lost connection, falling back to local SQLite (will retry in 30s):', err);
    }
  }

  // SQLite fallback
  const db = await getDb();
  const snapRes = db.exec(`
    SELECT id, source, fetched_at, processed_at, object_count,
           total_fetched, invalid_count, non_leo_count, data_hash,
           is_active, status
    FROM snapshots
    WHERE is_active = 1
    LIMIT 1
  `);

  if (!snapRes || snapRes.length === 0 || !snapRes[0].values || snapRes[0].values.length === 0) {
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

    const tlesRes = db.exec(`
      SELECT data_json FROM tles
      WHERE snapshot_id = '${meta.id}'
      ORDER BY rowid ASC
    `);

    const records = tlesRes && tlesRes[0]?.values
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

  const records = tlesRes && tlesRes[0]?.values
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
  const pool = await getPgPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, source, fetched_at, processed_at, object_count,
                total_fetched, invalid_count, non_leo_count, data_hash,
                is_active, status
         FROM snapshots
         ORDER BY fetched_at DESC`
      );

      return res.rows.map((row) => ({
        id: row.id,
        source: row.source,
        fetchedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : new Date().toISOString(),
        processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : new Date().toISOString(),
        objectCount: row.object_count,
        totalFetched: row.total_fetched,
        invalidCount: row.invalid_count,
        nonLeoCount: row.non_leo_count,
        dataHash: row.data_hash,
        isActive: row.is_active,
        status: row.status
      }));
    } catch (err) {
      pgAvailable = false;
      lastPgAttemptTime = Date.now();
      console.warn('[DB] ⚠️ PostgreSQL getSnapshotList lost connection, falling back to local SQLite (will retry in 30s):', err);
    }
  }

  // SQLite fallback
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
  const pool = await getPgPool();
  if (pool) {
    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("UPDATE snapshots SET is_active = FALSE, status = 'SUPERSEDED' WHERE is_active = TRUE");
      await client.query("UPDATE snapshots SET is_active = TRUE, status = 'ACTIVE' WHERE id = $1", [snapshotId]);
      await client.query('COMMIT');
      await setMetadata('active_snapshot_id', snapshotId);
      return true;
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      pgAvailable = false;
      lastPgAttemptTime = Date.now();
      console.warn('[DB] ⚠️ PostgreSQL Rollback lost connection, falling back to local SQLite (will retry in 30s):', err);
    } finally {
      if (client) client.release();
    }
  }

  // SQLite fallback
  const db = await getDb();
  db.run('BEGIN TRANSACTION;');
  try {
    db.run("UPDATE snapshots SET is_active = 0, status = 'SUPERSEDED' WHERE is_active = 1");
    db.run("UPDATE snapshots SET is_active = 1, status = 'ACTIVE' WHERE id = ?", [snapshotId]);
    db.run('COMMIT;');
    await setMetadata('active_snapshot_id', snapshotId);
    saveDb();
    return true;
  } catch (err) {
    db.run('ROLLBACK;');
    console.error('[DB] SQLite Rollback failed:', err);
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
  const pool = await getPgPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO system_metadata (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
      return;
    } catch (err) {
      pgAvailable = false;
      lastPgAttemptTime = Date.now();
      console.warn('[DB] ⚠️ PostgreSQL setMetadata lost connection, saving to SQLite (will retry in 30s):', err);
    }
  }

  // SQLite fallback
  const db = await getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO system_metadata (key, value) VALUES (?, ?)');
  stmt.run([key, value]);
  stmt.free();
  saveDb();
}

export async function getMetadata(key: string, defaultValue: string = ''): Promise<string> {
  const pool = await getPgPool();
  if (pool) {
    try {
      const res = await pool.query('SELECT value FROM system_metadata WHERE key = $1', [key]);
      if (res.rows.length > 0) {
        return res.rows[0].value || defaultValue;
      }
      return defaultValue;
    } catch (err) {
      pgAvailable = false;
      lastPgAttemptTime = Date.now();
      console.warn('[DB] ⚠️ PostgreSQL getMetadata lost connection, querying SQLite (will retry in 30s):', err);
    }
  }

  // SQLite fallback
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
