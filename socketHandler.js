// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Socket Orchestrator
// ═══════════════════════════════════════
const { getRoomByPlayer, deleteRoom } = require('./roomManager');
const { GameEngine }   = require('./gameEngine');
const { BotManager }   = require('./botManager');
const { checkRateLimit, clearSocket } = require('./rateLimiter');
const lobbyHandler = require('./lobbyHandler');
const gameHandler  = require('./gameHandler');
const voteHandler  = require('./voteHandler');
const chatHandler  = require('./chatHandler');
const logger       = require('./logger');

const engines  = new Map();   // roomCode → GameEngine
const bots     = new Map();   // roomCode → BotManager
const sessions = new Map();   // socketId → { roomCode, name, userId }

// ── Event Log helper ─────────────────────────────────────────────
function addEventLog(room, io, entry) {
  if (!room._eventLog) room._eventLog = [];
  const event = { ...entry, ts: Date.now(), round: room.round };
  room._eventLog.push(event);
  io.to(room.code).emit('event_log_update', { event, log: room._eventLog });
}

module.exports = function socketHandler(io) {

  io.use((socket, next) => {
    socket.onAny((event) => {
      if (!checkRateLimit(socket.id, event)) {
        socket.emit('error_msg', { text: 'أرسلت رسائل كثيرة جداً، انتظر قليلاً' });
      }
    });
    next();
  });

  io.on('connection', (socket) => {
    logger.info('Socket', `Connected: ${socket.id}`);

    lobbyHandler(io, socket, engines, sessions);
    gameHandler(io, socket, engines);
    voteHandler(io, socket, engines);
    chatHandler(io, socket);

    // ── Bot Management ────────────────────────────────────────────
    socket.on('add_bots', ({ count = 2 }, cb) => {
      try {
        const room = getRoomByPlayer(socket.id);
        if (!room || room.hostId !== socket.id) return cb?.({ error: 'فقط الهوست' });
        if (room.phase !== 'lobby')             return cb?.({ error: 'اللعبة بدأت' });

        const botMgr = bots.get(room.code) || new BotManager(room, io, null);
        const added  = botMgr.addBots(count);
        bots.set(room.code, botMgr);

        // Broadcast updated room
        for (const p of room.getAllPlayers()) {
          io.to(p.id).emit('room_update', room.publicState(p.id));
        }
        io.to(room.code).emit('system_message', { text: `🤖 تمت إضافة ${added.length} بوت`, type: 'info' });
        cb?.({ success: true, count: added.length });
      } catch(e) {
        cb?.({ error: 'حدث خطأ' });
      }
    });

    socket.on('remove_bots', (_, cb) => {
      try {
        const room = getRoomByPlayer(socket.id);
        if (!room || room.hostId !== socket.id) return cb?.({ error: 'فقط الهوست' });
        const botMgr = bots.get(room.code);
        if (botMgr) {
          botMgr.bots.forEach(b => room.removePlayer(b.id));
          botMgr.destroy();
          bots.delete(room.code);
        }
        for (const p of room.getAllPlayers()) {
          io.to(p.id).emit('room_update', room.publicState(p.id));
        }
        cb?.({ success: true });
      } catch(e) {
        cb?.({ error: 'حدث خطأ' });
      }
    });

    // ── Phase change: notify bots ─────────────────────────────────
    // We hook into GameEngine's emit by wrapping startPhase
    // This is handled via the event log below

    // ── Get Event Log ─────────────────────────────────────────────
    socket.on('get_event_log', (_, cb) => {
      const room = getRoomByPlayer(socket.id);
      cb?.({ log: room?._eventLog || [] });
    });

    // ── Auth: Register ────────────────────────────────────────────
    socket.on('auth_register', async ({ username, password, avatar = 1 }, cb) => {
      try {
        const userRepo = require('./userRepo');
        const { validateName, validatePassword } = require('./validator');
        const nameErr = validateName(username);
        if (nameErr) return cb?.({ error: nameErr });
        const pwErr = validatePassword(password);
        if (pwErr) return cb?.({ error: pwErr });
        const exists = userRepo.findByUsername(username);
        if (exists) return cb?.({ error: 'اسم المستخدم محجوز' });
        const user = await userRepo.createUser({ username, password, avatar });
        cb?.({ success: true, user: userRepo.safeUser(user) });
      } catch (e) {
        cb?.({ error: 'حدث خطأ في التسجيل' });
      }
    });

    socket.on('auth_login', async ({ username, password }, cb) => {
      try {
        const userRepo = require('./userRepo');
        const result = await userRepo.authenticate(username, password);
        if (result.error) return cb?.({ error: result.error });
        cb?.({ success: true, user: result.user });
      } catch (e) {
        cb?.({ error: 'حدث خطأ في تسجيل الدخول' });
      }
    });

    socket.on('auth_guest', async ({ name }, cb) => {
      try {
        const userRepo = require('./userRepo');
        const { validateName } = require('./validator');
        const nameErr = validateName(name);
        if (nameErr) return cb?.({ error: nameErr });
        const user = await userRepo.createGuest(name);
        cb?.({ success: true, user: userRepo.safeUser(user), guest: true });
      } catch (e) {
        cb?.({ error: 'حدث خطأ' });
      }
    });

    socket.on('get_leaderboard', (_, cb) => {
      try {
        const userRepo = require('./userRepo');
        const rows = userRepo.getLeaderboard(20);
        cb?.({ success: true, leaderboard: rows.map(userRepo.safeUser) });
      } catch (e) {
        cb?.({ leaderboard: [] });
      }
    });

    // ── Rejoin ────────────────────────────────────────────────────
    socket.on('rejoin_room', ({ roomCode, name }, cb) => {
      try {
        const { getRoom } = require('./roomManager');
        const room = getRoom(roomCode);
        if (!room) return cb?.({ error: 'الغرفة غير موجودة' });

        const existing = [...room.players.values()].find(
          p => p.name.toLowerCase() === name.trim().toLowerCase() && !p.connected && !p.isBot
        );
        if (!existing) return cb?.({ error: 'لم يتم العثور على جلستك' });

        const oldId = existing.id;
        room.remapSocket(oldId, socket.id);
        room.markReconnected(socket.id);
        sessions.set(socket.id, { roomCode: room.code, name: existing.name });

        // Update bot manager if exists
        const botMgr = bots.get(room.code);
        if (botMgr) botMgr.room = room;

        socket.join(room.code);
        cb?.({ success: true, player: existing, phase: room.phase, round: room.round });
        socket.emit('room_update', room.publicState(socket.id));
        socket.emit('event_log_catch_up', { log: room._eventLog || [] });
        io.to(room.code).emit('player_reconnected', { id: socket.id, name: existing.name });
        io.to(room.code).emit('system_message', { text: `✅ ${existing.name} عاد`, type: 'reconnect' });

        addEventLog(room, io, { type: 'reconnect', playerName: existing.name });
      } catch (e) {
        cb?.({ error: 'حدث خطأ' });
      }
    });

    // ── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info('Socket', `Disconnected: ${socket.id} (${reason})`);
      clearSocket(socket.id);

      const room = getRoomByPlayer(socket.id);
      if (!room) return;

      const player = room.getPlayer(socket.id);
      if (!player || player.isBot) return;

      room.markDisconnected(socket.id);
      io.to(room.code).emit('player_disconnected', { id: socket.id, name: player.name });
      addEventLog(room, io, { type: 'disconnect', playerName: player.name });

      if (room.phase === 'lobby') {
        if (room.hostId === socket.id) {
          const transferred = room.autoTransferHost(socket.id);
          if (!transferred) {
            deleteRoom(room.code);
            engines.delete(room.code);
            const botMgr = bots.get(room.code);
            if (botMgr) { botMgr.destroy(); bots.delete(room.code); }
            io.to(room.code).emit('room_closed', { reason: 'الهوست غادر' });
            return;
          }
          const newHost = room.getAllPlayers().find(p => p.isHost);
          if (newHost) io.to(room.code).emit('system_message', { text: `👑 ${newHost.name} أصبح الهوست`, type: 'host' });
        }
        room.removePlayer(socket.id);
        for (const p of room.getAllPlayers()) {
          io.to(p.id).emit('room_update', room.publicState(p.id));
        }
        return;
      }

      const { GAME } = require('./config');
      setTimeout(() => {
        const p = room.getPlayer(socket.id);
        if (p && !p.connected) {
          p.alive = false;
          io.to(room.code).emit('system_message', { text: `💀 ${p.name} غادر اللعبة`, type: 'leave' });
          addEventLog(room, io, { type: 'leave', playerName: p.name });
          const engine = engines.get(room.code);
          const win    = room.checkWinCondition();
          if (win && engine) engine.endGame(win);
        }
      }, GAME.RECONNECT_GRACE);
    });

  });

  // ── Hook into GameEngine events for bots + event log ─────────────
  // Wrap emit on engines when they're created
  const originalSet = engines.set.bind(engines);
  engines.set = function(code, engine) {
    const room = engine.room;

    // Wrap startPhase to notify bots
    const origStartPhase = engine.startPhase.bind(engine);
    engine.startPhase = function(phaseId) {
      origStartPhase(phaseId);
      const botMgr = bots.get(code);
      if (botMgr) {
        botMgr.engine = engine;
        botMgr.onPhaseChange(phaseId);
      }
      // Add to event log
      addEventLog(room, io, { type: 'phase_change', phase: phaseId });
    };

    // Wrap endGame for event log
    const origEndGame = engine.endGame.bind(engine);
    engine.endGame = function(winData) {
      origEndGame(winData);
      addEventLog(room, io, { type: 'game_over', winner: winData.winner, reason: winData.reason });
      const botMgr = bots.get(code);
      if (botMgr) { botMgr.destroy(); bots.delete(code); }
    };

    return originalSet(code, engine);
  };
};
