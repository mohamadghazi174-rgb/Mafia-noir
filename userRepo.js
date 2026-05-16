// ═══════════════════════════════════════
//  MAFIA NOIR V2 — User Repository
// ═══════════════════════════════════════
const { v4: uuidv4 } = require('uuid');
const { getDb }      = require('../database');
const config         = require('./config');

let bcrypt;
try { bcrypt = require('bcryptjs'); } catch(e) { bcrypt = null; }

// ── Helpers ───────────────────────────
function getRank(xp) {
  const ranks = [...config.RANKS].reverse();
  return ranks.find(r => xp >= r.minXP) || config.RANKS[0];
}

async function hashPassword(pw) {
  if (!bcrypt) return pw; // fallback: plain (dev only)
  return bcrypt.hash(pw, 10);
}

async function comparePassword(pw, hash) {
  if (!bcrypt) return pw === hash;
  return bcrypt.compare(pw, hash);
}

// ── CRUD ──────────────────────────────
function findById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function findByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) || null;
}

async function createUser({ username, password = null, guest = false, avatar = 1 }) {
  const id   = uuidv4();
  const hash = password ? await hashPassword(password) : null;

  getDb().prepare(`
    INSERT INTO users (id, username, password, guest, avatar)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, hash, guest ? 1 : 0, avatar);

  return findById(id);
}

async function createGuest(name) {
  const guestName = `guest_${name}_${Date.now().toString(36)}`;
  return createUser({ username: guestName, guest: true });
}

async function authenticate(username, password) {
  const user = findByUsername(username);
  if (!user || user.guest)          return { error: 'المستخدم غير موجود' };
  if (user.banned)                  return { error: 'تم حظرك: ' + (user.ban_reason || '') };
  const ok = await comparePassword(password, user.password);
  if (!ok)                          return { error: 'كلمة المرور خاطئة' };
  touchLastSeen(user.id);
  return { user: safeUser(user) };
}

function touchLastSeen(id) {
  getDb().prepare(`UPDATE users SET last_seen = strftime('%s','now') WHERE id = ?`).run(id);
}

function addXP(id, amount) {
  getDb().prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(amount, id);
  return findById(id);
}

function addCoins(id, amount) {
  getDb().prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(amount, id);
}

function recordGameResult(id, { won, role, team, kills = 0, saves = 0, survived = 0, gameId, xpEarned = 0 }) {
  const db = getDb();
  db.prepare(`
    UPDATE users SET
      games  = games  + 1,
      wins   = wins   + ?,
      losses = losses + ?,
      kills  = kills  + ?,
      saves  = saves  + ?,
      xp     = xp     + ?
    WHERE id = ?
  `).run(won?1:0, won?0:1, kills, saves, xpEarned, id);

  db.prepare(`
    INSERT INTO stats (user_id, game_id, role, team, won, kills, saves, survived, xp_earned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, gameId, role, team, won?1:0, kills, saves, survived?1:0, xpEarned);
}

function banUser(id, reason = '') {
  getDb().prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').run(reason, id);
}

function unbanUser(id) {
  getDb().prepare('UPDATE users SET banned = 0, ban_reason = NULL WHERE id = ?').run(id);
}

function updateAvatar(id, avatar) {
  getDb().prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, id);
}

function getLeaderboard(limit = 10) {
  return getDb().prepare('SELECT * FROM users WHERE guest = 0 ORDER BY xp DESC LIMIT ?').all(limit);
}

// Strip sensitive fields
function safeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  safe.rank = getRank(safe.xp);
  return safe;
}

module.exports = {
  findById, findByUsername, createUser, createGuest,
  authenticate, addXP, addCoins, recordGameResult,
  banUser, unbanUser, updateAvatar, getLeaderboard,
  safeUser, getRank, touchLastSeen,
};
