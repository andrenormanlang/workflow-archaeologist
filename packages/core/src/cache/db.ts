import initSqlJs from 'sql.js';
import type { Decision } from '../types/index.js';

export interface Cache {
  getDecision(key: string): Decision | null;
  setDecision(key: string, decision: Decision): void;
  getEnrichment(key: string): unknown | null;
  setEnrichment(key: string, data: unknown): void;
  clearAll(): void;
  countDecisions(): number;
  close(): void;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS decisions (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS enrichments (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`;

class SqlCache implements Cache {
  private db: import('sql.js').Database;
  private closed = false;

  constructor(db: import('sql.js').Database) {
    this.db = db;
    this.db.run(SCHEMA);
  }

  getDecision(key: string): Decision | null {
    try {
      const stmt = this.db.prepare(
        'SELECT value FROM decisions WHERE key = :key'
      );
      stmt.bind({ ':key': key });
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return JSON.parse(row['value'] as string) as Decision;
      }
      stmt.free();
      return null;
    } catch {
      return null;
    }
  }

  setDecision(key: string, decision: Decision): void {
    this.db.run(
      'INSERT OR REPLACE INTO decisions (key, value, createdAt) VALUES (?, ?, ?)',
      [key, JSON.stringify(decision), new Date().toISOString()]
    );
  }

  getEnrichment(key: string): unknown | null {
    try {
      const stmt = this.db.prepare(
        'SELECT value FROM enrichments WHERE key = :key'
      );
      stmt.bind({ ':key': key });
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return JSON.parse(row['value'] as string);
      }
      stmt.free();
      return null;
    } catch {
      return null;
    }
  }

  setEnrichment(key: string, data: unknown): void {
    this.db.run(
      'INSERT OR REPLACE INTO enrichments (key, value, createdAt) VALUES (?, ?, ?)',
      [key, JSON.stringify(data), new Date().toISOString()]
    );
  }

  clearAll(): void {
    this.db.run('DELETE FROM decisions');
    this.db.run('DELETE FROM enrichments');
  }

  countDecisions(): number {
    const result = this.db.exec('SELECT COUNT(*) FROM decisions');
    if (!result.length || !result[0].values.length) return 0;
    return result[0].values[0][0] as number;
  }

  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}

export async function createCache(_dbPath?: string): Promise<Cache> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return new SqlCache(db);
}