import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Vercel serverless é read-only exceto /tmp. Local usa ./data.db
let dbPath: string;
if (process.env.VERCEL) {
  dbPath = '/tmp/xdx.db';
} else {
  dbPath = path.join(process.cwd(), 'data.db');
  // também tenta em xdx-main folder quando rodando via vite
  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

let db: Database.Database;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(dbPath);
  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      raw_text TEXT,
      store_name TEXT,
      user_id TEXT,
      target_budget REAL,
      is_session INTEGER NOT NULL DEFAULT 1,
      is_abandoned INTEGER NOT NULL DEFAULT 0,
      shelf_category TEXT,
      trip_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_items_user_session ON items(user_id, is_session);
    CREATE INDEX IF NOT EXISTS idx_items_trip ON items(trip_id);
    CREATE INDEX IF NOT EXISTS idx_items_store ON items(store_name);
  `);
  return db;
}

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDatabase(): Database.Database {
  return getDb();
}

// Helpers para não repetir SQL
export const queries = {
  // profiles
  getProfile: (id: string) => getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as any,
  createProfile: (id: string) => getDb().prepare('INSERT OR IGNORE INTO profiles (id) VALUES (?)').run(id),
  upsertProfile: (id: string, full_name: string, phone: string) => {
    const dbi = getDb();
    dbi.prepare('INSERT OR IGNORE INTO profiles (id) VALUES (?)').run(id);
    return dbi.prepare('UPDATE profiles SET full_name = ?, phone = ? WHERE id = ?').run(full_name, phone, id);
  },
  deleteProfile: (id: string) => getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id),

  // items
  getSessionItems: (user_id: string) =>
    getDb().prepare('SELECT * FROM items WHERE user_id = ? AND is_session = 1 ORDER BY created_at DESC').all(user_id) as any[],
  getHistoryItems: (user_id: string, limit = 150) =>
    getDb().prepare('SELECT * FROM items WHERE user_id = ? AND is_session = 0 ORDER BY created_at DESC LIMIT ?').all(user_id, limit) as any[],
  getLastPrice: (user_id: string, name: string) =>
    getDb().prepare('SELECT price, store_name FROM items WHERE user_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1').get(user_id, name) as any,
  insertItem: (item: any) => {
    const id = item.id || generateId();
    getDb()
      .prepare(
        `INSERT INTO items (id, name, price, quantity, raw_text, store_name, user_id, target_budget, is_session, is_abandoned, shelf_category, trip_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        item.name,
        item.price,
        item.quantity ?? 1,
        item.raw_text || '',
        item.store_name || 'Mercado XDX',
        item.user_id,
        item.target_budget ?? null,
        item.is_session ? 1 : 0,
        item.is_abandoned ? 1 : 0,
        item.shelf_category || 'Outros',
        item.trip_id || null,
        item.created_at || new Date().toISOString()
      );
    return id;
  },
  updateItem: (id: string, fields: any) => {
    const allowed = ['name', 'price', 'quantity', 'raw_text', 'store_name', 'target_budget', 'is_session', 'is_abandoned', 'shelf_category', 'trip_id'];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const k of allowed) {
      if (k in fields) {
        sets.push(`${k} = ?`);
        let v = fields[k];
        if (k === 'is_session' || k === 'is_abandoned') v = v ? 1 : 0;
        vals.push(v);
      }
    }
    if (sets.length === 0) return;
    vals.push(id);
    getDb().prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  deleteItem: (id: string) => getDb().prepare('DELETE FROM items WHERE id = ?').run(id),
  deleteSessionItems: (user_id: string) => getDb().prepare('DELETE FROM items WHERE user_id = ? AND is_session = 1').run(user_id),
  finalizeSession: (user_id: string, trip_id: string) =>
    getDb().prepare('UPDATE items SET is_session = 0, trip_id = ? WHERE user_id = ? AND is_session = 1').run(trip_id, user_id),
  getAllItemsForAdmin: () => getDb().prepare('SELECT * FROM items').all() as any[],
};
