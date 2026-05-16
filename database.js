// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Database (SQLite)
// ═══════════════════════════════════════
const path   = require('path');
const fs     = require('fs');
const config = require('./config');
const logger = require('./logger');

let db = null;

function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  try {
    const Database = require('better-sqlite3');
    db = new Database(config.DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    logger.info('DB', `SQLite connected: ${config.DB_PATH}`);
  } catch (e) {
    logger.warn('DB', 'better-sqlite3 not available, using in-memory fallback');
    db = createMemoryDb();
  }

  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      password    TEXT,
      guest       INTEGER DEFAULT 0,
      avatar      INTEGER DEFAULT 1,
      xp          INTEGER DEFAULT 0,
      coins       INTEGER DEFAULT 100,
      wins        INTEGER DEFAULT 0,
      losses      INTEGER DEFAULT 0,
      games       INTEGER DEFAULT 0,
      kills       INTEGER DEFAULT 0,
      saves       INTEGER DEFAULT 0,
      banned      INTEGER DEFAULT 0,
      ban_reason  TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now')),
      last_seen   INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS stats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      game_id     TEXT NOT NULL,
      role        TEXT,
      team        TEXT,
      won         INTEGER DEFAULT 0,
      kills       INTEGER DEFAULT 0,
      saves       INTEGER DEFAULT 0,
      survived    INTEGER DEFAULT 0,
      xp_earned   INTEGER DEFAULT 0,
      played_at   INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id     TEXT NOT NULL,
      friend_id   TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      created_at  INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY(user_id, friend_id),
      FOREIGN KEY(user_id)   REFERENCES users(id),
      FOREIGN KEY(friend_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_stats_user ON stats(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);
}

// ── In-Memory Fallback (no native module) ─────────────────────────
function createMemoryDb() {
  const users = new Map();
  const stats = [];

  return {
    _memory: true,
    prepare: (sql) => ({
      get:  (...args) => memoryQuery(sql, args, users, stats, 'get'),
      all:  (...args) => memoryQuery(sql, args, users, stats, 'all'),
      run:  (...args) => memoryQuery(sql, args, users, stats, 'run'),
    }),
    exec: () => {},
    pragma: () => {},
  };
}

function memoryQuery(sql, args, users, stats, mode) {
  // Minimal in-memory SQL interpreter for our queries
  const s = sql.trim().toUpperCase();

  if (s.startsWith('SELECT') && s.includes('USERS')) {
    const rows = [...users.values()];
    if (mode === 'get') return rows.find(u =>
      args.some(a => u.id === a || u.username === a)
    ) || null;
    return rows;
  }

  if (s.startsWith('INSERT INTO USERS')) {
    const [id, username, password, guest, avatar] = args;
    const user = { id, username, password: password || null, guest: guest || 0,
      avatar: avatar || 1, xp: 0, coins: 100, wins: 0, losses: 0,
      games: 0, kills: 0, saves: 0, banned: 0, ban_reason: null };
    users.set(id, user);
    return { changes: 1 };
  }

  if (s.startsWith('UPDATE USERS')) {
    const user = [...users.values()].find(u => args.some(a => u.id === a));
    if (user) { /* simplified: no-op for fallback */ }
    return { changes: 1 };
  }

  if (s.startsWith('INSERT INTO STATS')) {
    stats.push({ id: stats.length + 1, ...Object.fromEntries(args.map((v,i)=>([i,v]))) });
    return { changes: 1 };
  }

  return mode === 'all' ? [] : null;
}

module.exports = { getDb };
