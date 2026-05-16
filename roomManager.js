// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Room Manager (Fixed)
// ═══════════════════════════════════════
const { ROLES_CONFIG } = require('./constants');
const { GAME }         = require('./config');
const logger           = require('./logger');

const rooms = new Map(); // code → Room

// ── Room Class ────────────────────────────────────────────────────
class Room {
  constructor(hostId, options = {}) {
    this.code        = genCode();
    this.hostId      = hostId;
    this.phase       = 'lobby';
    this.round       = 0;
    this.players     = new Map();   // socketId → Player
    this.spectators  = new Map();
    this.bannedIds   = new Set();
    this.maxPlayers  = Math.min(options.maxPlayers || 10, GAME.MAX_PLAYERS);
    this.isPrivate   = options.private !== false;
    this.autoStartAt = options.autoStartAt || GAME.AUTO_START_AT;

    // Game state
    this.nightKill         = null;
    this.doctorSave        = null;
    this.votes             = {};
    this.accusedId         = null;
    this.sniperUsed        = false;
    this._doctorSavedThisRound = false;
    this._eventLog         = [];

    // Chat logs
    this.publicChat = [];
    this.mafiaChat  = [];
    this.deadChat   = [];

    this.createdAt = Date.now();
  }

  // ── Player Management ─────────────────────────────────────────────
  addPlayer(socketId, name, userId = null, isHost = false) {
    if (this.players.size >= this.maxPlayers) return null;
    const p = {
      id:          socketId,
      name:        name.trim(),
      userId,
      isHost,
      isBot:       false,
      role:        null,
      team:        null,
      alive:       true,
      connected:   true,
      actionDone:  false,
      knownMafia:  false,
      kills:       0,
      saves:       0,
      avatarId:    Math.floor(Math.random() * 10),
    };
    this.players.set(socketId, p);
    return p;
  }

  getPlayer(socketId)    { return this.players.get(socketId) || null; }
  getAllPlayers()         { return [...this.players.values()]; }
  getAlivePlayers()      { return this.getAllPlayers().filter(p => p.alive); }
  getDeadPlayers()       { return this.getAllPlayers().filter(p => !p.alive); }
  getMafiaMembers()      { return this.getAllPlayers().filter(p => p.team === 'mafia'); }
  getAliveMafia()        { return this.getAlivePlayers().filter(p => p.team === 'mafia'); }
  getAliveTown()         { return this.getAlivePlayers().filter(p => p.team !== 'mafia'); }

  removePlayer(socketId) {
    this.players.delete(socketId);
    // Reassign host if needed
    if (this.hostId === socketId) this.autoTransferHost(socketId);
  }

  // ── Role Assignment ───────────────────────────────────────────────
  assignRoles() {
    const players = this.getAllPlayers();
    const n       = players.length;
    const roles   = buildRoleList(n);

    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    players.forEach((p, i) => {
      const roleCfg  = ROLES_CONFIG[roles[i]];
      p.role         = roles[i];
      p.team         = roleCfg.team;
      p.alive        = true;
      p.actionDone   = false;
      p.kills        = 0;
      p.saves        = 0;
    });

    // Mafia members know each other
    const mafiaIds = this.getMafiaMembers().map(m => m.id);
    this.getMafiaMembers().forEach(m => {
      m.knownMafia = false; // self is not marked
    });
    this.sniperUsed = false;
  }

  // ── Win Condition ─────────────────────────────────────────────────
  checkWinCondition() {
    const aliveMafia = this.getAliveMafia().length;
    const aliveTown  = this.getAliveTown().length;

    if (aliveMafia === 0) return { winner: 'town',  reason: 'تمت القضاء على المافيا' };
    if (aliveMafia >= aliveTown) return { winner: 'mafia', reason: 'المافيا تفوقت عدداً على المدنيين' };
    return null;
  }

  // ── Public State (per-player visibility) ─────────────────────────
  publicState(requesterId) {
    const me = this.getPlayer(requesterId);
    return {
      code:       this.code,
      hostId:     this.hostId,
      phase:      this.phase,
      round:      this.round,
      maxPlayers: this.maxPlayers,
      accusedId:  this.accusedId,
      players:    this.getAllPlayers().map(p => {
        const showRole =
          (p.id === requesterId) ||
          (me?.team === 'mafia' && p.team === 'mafia') ||
          this.phase === 'result';
        return {
          id:        p.id,
          name:      p.name,
          avatarId:  p.avatarId,
          isHost:    p.isHost || p.id === this.hostId,
          isBot:     p.isBot,
          alive:     p.alive,
          connected: p.connected,
          knownMafia: me?.team === 'mafia' && p.team === 'mafia',
          role:      showRole ? p.role : null,
          team:      showRole ? p.team : null,
          kills:     p.kills,
          saves:     p.saves,
        };
      }),
    };
  }

  // ── Host Management ───────────────────────────────────────────────
  transferHost(newId) {
    const p = this.getPlayer(newId);
    if (!p) return false;
    const old = this.getPlayer(this.hostId);
    if (old) old.isHost = false;
    p.isHost    = true;
    this.hostId = newId;
    return true;
  }

  autoTransferHost(leavingId) {
    const candidates = this.getAllPlayers().filter(
      p => p.id !== leavingId && !p.isBot && p.connected
    );
    if (!candidates.length) return false;
    this.transferHost(candidates[0].id);
    return true;
  }

  // ── Reconnect ─────────────────────────────────────────────────────
  remapSocket(oldId, newId) {
    const p = this.players.get(oldId);
    if (!p) return false;
    p.id = newId;
    this.players.delete(oldId);
    this.players.set(newId, p);
    if (this.hostId === oldId) this.hostId = newId;
    // Remap votes
    for (const [k, v] of Object.entries(this.votes)) {
      if (k === oldId)  { delete this.votes[k]; this.votes[newId] = v; }
      if (v === oldId)  this.votes[k] = newId;
    }
    if (this.nightKill  === oldId) this.nightKill  = newId;
    if (this.doctorSave === oldId) this.doctorSave = newId;
    if (this.accusedId  === oldId) this.accusedId  = newId;
    return true;
  }

  markDisconnected(socketId) {
    const p = this.players.get(socketId);
    if (p) p.connected = false;
  }

  markReconnected(socketId) {
    const p = this.players.get(socketId);
    if (p) p.connected = true;
  }

  // ── Spectators ────────────────────────────────────────────────────
  addSpectator(socketId, name) {
    const s = { id: socketId, name, ts: Date.now() };
    this.spectators.set(socketId, s);
    return s;
  }

  // ── Ban ───────────────────────────────────────────────────────────
  ban(id, reason = '') {
    this.bannedIds.add(id);
    logger.info('Room', `Banned ${id} from ${this.code}: ${reason}`);
  }

  // ── Reset for Restart ─────────────────────────────────────────────
  resetForRestart() {
    this.phase       = 'lobby';
    this.round       = 0;
    this.nightKill   = null;
    this.doctorSave  = null;
    this.votes       = {};
    this.accusedId   = null;
    this.sniperUsed  = false;
    this._doctorSavedThisRound = false;
    this._eventLog   = [];
    this.publicChat  = [];
    this.mafiaChat   = [];
    this.deadChat    = [];
    for (const p of this.getAllPlayers()) {
      if (p.isBot) { this.players.delete(p.id); continue; }
      p.role        = null;
      p.team        = null;
      p.alive       = true;
      p.actionDone  = false;
      p.knownMafia  = false;
      p.kills       = 0;
      p.saves       = 0;
    }
  }
}

// ── Role List Builder ─────────────────────────────────────────────
function buildRoleList(n) {
  // Mafia count: ~25% of players
  const mafiaCount = Math.max(1, Math.floor(n / 4));
  const roles = [];
  for (let i = 0; i < mafiaCount; i++) {
    roles.push(i === 0 ? 'godfather' : 'mafia');
  }
  // Special roles
  if (n >= 5)  roles.push('doctor');
  if (n >= 6)  roles.push('detective');
  if (n >= 8)  roles.push('sniper');
  if (n >= 9)  roles.push('mayor');
  // Fill rest with citizens
  while (roles.length < n) roles.push('citizen');
  return roles;
}

// ── Code Generator ────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({length:4}, ()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

// ── Public API ────────────────────────────────────────────────────
function createRoom(hostId, options = {}) {
  const room = new Room(hostId, options);
  rooms.set(room.code, room);
  logger.info('Room', `Created ${room.code}`);
  return room;
}

function getRoom(code)          { return rooms.get(code?.toUpperCase()) || null; }
function deleteRoom(code)       { rooms.delete(code); }

function getRoomByPlayer(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId) || room.spectators.has(socketId)) return room;
  }
  return null;
}

function getPublicRooms() {
  return [...rooms.values()]
    .filter(r => !r.isPrivate && r.phase === 'lobby')
    .map(r => ({ code: r.code, players: r.players.size, max: r.maxPlayers }));
}

// Cleanup stale rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > GAME.ROOM_TTL_MS) {
      logger.info('Room', `Cleaning up stale room ${code}`);
      rooms.delete(code);
    }
  }
}, GAME.CLEANUP_INTERVAL);

module.exports = { createRoom, getRoom, deleteRoom, getRoomByPlayer, getPublicRooms };
