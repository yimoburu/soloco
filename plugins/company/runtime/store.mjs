import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = '0.1.0';
export const stamp = () => new Date().toISOString();
export const id = (prefix) => `${prefix}-${randomUUID()}`;
export const digest = (text) => createHash('sha256').update(text).digest('hex');
export function requireText(value, name, max = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be nonempty text, at most ${max} characters`);
  return value;
}
export function folder(root) {
  if (!path.isAbsolute(root ?? '')) throw new Error('Use an absolute company folder');
  const real = fs.realpathSync(root);
  if (!fs.statSync(real).isDirectory()) throw new Error('Company folder is not a directory');
  if (real === PACKAGE || real.startsWith(PACKAGE + path.sep)) throw new Error('Company records must live outside the installed plugin');
  return real;
}
export function noLink(file) {
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Refusing linked company record: ${file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export class Store {
  constructor(root, create = false) {
    this.root = folder(root);
    this.dir = path.join(this.root, '.company');
    noLink(this.dir);
    if (create) fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.dir)) throw new Error('No company here yet; call company_open');
    const file = path.join(this.dir, 'company.sqlite');
    for (const suffix of ['', '-wal', '-shm']) noLink(file + suffix);
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS company (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL);');
  }
  read() {
    const row = this.db.prepare('SELECT value FROM company WHERE id=1').get();
    return row ? JSON.parse(row.value) : null;
  }
  transaction(type, fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      const next = fn(state);
      next.revision = (state?.revision ?? -1) + 1;
      next.updated_at = stamp();
      this.db.prepare('INSERT INTO company VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(next));
      this.db.prepare('INSERT INTO events(at,type,value) VALUES (?,?,?)').run(stamp(), type, JSON.stringify({revision: next.revision, owner: next.owner}));
      this.db.exec('COMMIT');
      return next;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
export function withStore(root, fn, create = false) {
  const db = new Store(root, create);
  try { return fn(db); } finally { db.close(); }
}
export function owner(state, actor, host, epoch) {
  if (!state || state.schema !== 1) throw new Error('Unsupported or missing company state; do not reinitialize');
  if (state.owner.session_id !== actor || state.owner.host !== host || (epoch !== undefined && state.owner.epoch !== epoch)) throw new Error('This chat does not own the company. Resume the active chat or perform a checked handover.');
  if (state.plugin_version !== VERSION) throw new Error('Pinned team version differs. Use its matching package; migration is not automatic.');
}
export function notice(state, kind, summary, reference = null) {
  const item = {id: id('notice'), kind, summary, reference, created_at: stamp(), deliveries: [], seen_at: null, resolution: null};
  state.notices.push(item);
  return item;
}
