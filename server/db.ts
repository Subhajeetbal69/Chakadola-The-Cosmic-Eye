import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { TleRecord, SystemConfig } from './types';

let dbInstance: Database | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'debris_tracker.sqlite');

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

  // Create tables
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS tles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      line1 TEXT NOT NULL,
      line2 TEXT NOT NULL,
      classification TEXT NOT NULL,
      source TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conjunctions (
      id TEXT PRIMARY KEY,
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

export async function saveTleRecords(records: TleRecord[]): Promise<void> {
  const db = await getDb();
  db.run('DELETE FROM tles');
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tles (id, name, line1, line2, classification, source, data_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of records) {
    stmt.run([
      r.id,
      r.name,
      r.line1,
      r.line2,
      r.classification,
      r.source,
      JSON.stringify(r),
      r.updatedAt
    ]);
  }
  stmt.free();

  setMetadata('last_tle_update', new Date().toISOString());
  setMetadata('tracked_count', records.length.toString());
  saveDb();
}

export async function loadAllTles(): Promise<TleRecord[]> {
  const db = await getDb();
  const res = db.exec('SELECT data_json FROM tles ORDER BY name ASC');
  if (!res || res.length === 0 || !res[0].values) {
    return [];
  }
  return res[0].values.map((row) => JSON.parse(row[0] as string) as TleRecord);
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
