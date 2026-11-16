// Мінімальна сумісна з D1 обгортка над node:sqlite — для тестів і локального smoke без Cloudflare.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync as DB } from 'node:sqlite';

// vite не знає вбудований модуль node:sqlite — вантажимо через require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type DatabaseSync = DB;

class Stmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...args: unknown[]) {
    this.args = args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));
    return this;
  }
  async first<T>(col?: string): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...(this.args as never[])) as Record<string, unknown> | undefined;
    if (!r) return null;
    return (col ? r[col] : { ...r }) as T;
  }
  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...(this.args as never[])) as Record<string, unknown>[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]));
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function makeD1(migrationsDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations')) {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => Promise.all(stmts.map((s) => s.run())),
    exec: async (sql: string) => { db.exec(sql); return { count: 0, duration: 0 }; },
    raw: db,
  };
  return d1 as unknown as D1Database & { raw: DatabaseSync };
}
