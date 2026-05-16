// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Lobby Handler
// ═══════════════════════════════════════
const { createRoom, getRoom, deleteRoom, getRoomByPlayer, getPublicRooms } = require('./roomManager');
const { GameEngine } = require('./gameEngine');
const { validateName, validateCode } = require('./validator');
const { GAME } = require('./config');
const logger   = require('./logger');

module.exports = function lobbyHandler(io, socket, engines, sessions) {

  function broadcastRoom(room) {
    for (const p of room.getAllPlayers()) {
      io.to(p.id).emit('room_update', room.publicState(p.id));
    }
    // Also send to spectators
    for (const s of room.spectators.values()) {
      io.to(s.id).emit('room_update', room.publicState(s.id));
    }
  }

  // ── Create Room ───────────────────────────────────────────────────
  socket.on('create_room', ({ name, options = {} }, cb) => {
    try {
      const nameErr = validateName(name);
      if (nameErr) return cb?.({ error: nameErr });

      const existing = getRoomByPlayer(socket.id);
      if (existing) return cb?.({ error: 'أنت بالفعل في غرفة' });

      const room   = createRoom(socket.id, options);
      const player = room.addPlayer(socket.id, name, null, true);
      if (!player) return cb?.({ error: 'فشل إنشاء اللاعب' });

      socket.join(room.code);
      sessions.set(socket.id, { roomCode: room.code, name: player.name, userId: null });

      cb?.({ success: true, roomCode: room.code, player });
      broadcastRoom(room);
    } catch (e) {
      logger.error('Lobby', 'create_room error', e);
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Join Room ─────────────────────────────────────────────────────
  socket.on('join_room', ({ code, name, spectate = false }, cb) => {
    try {
      const nameErr = validateName(name);
      if (nameErr) return cb?.({ error: nameErr });
      const codeErr = validateCode(code);
      if (codeErr) return cb?.({ error: codeErr });

      const room = getRoom(code);
      if (!room) return cb?.({ error: 'الغرفة غير موجودة' });

      // Ban check
      if (room.bannedIds.has(socket.id)) return cb?.({ error: 'تم حظرك من هذه الغرفة' });

      if (!spectate) {
        if (room.phase !== 'lobby')       return cb?.({ error: 'اللعبة بدأت' });
        if (room.players.size >= room.maxPlayers) return cb?.({ error: 'الغرفة ممتلئة' });

        const taken = [...room.players.values()].some(
          p => p.name.toLowerCase() === name.trim().toLowerCase()
        );
        if (taken) return cb?.({ error: 'الاسم مأخوذ' });

        const player = room.addPlayer(socket.id, name, null, false);
        if (!player) return cb?.({ error: 'فشل الانضمام' });

        socket.join(room.code);
        sessions.set(socket.id, { roomCode: room.code, name: player.name });

        cb?.({ success: true, roomCode: room.code, player });
        broadcastRoom(room);
        io.to(room.code).emit('system_message', { text: `👋 ${player.name} انضم`, type: 'join' });

        // Auto-start check
        if (room.autoStartAt && room.players.size >= room.autoStartAt) {
          setTimeout(() => {
            if (room.phase === 'lobby' && room.players.size >= GAME.MIN_PLAYERS) {
              const engine = new GameEngine(room, io);
              engines.set(room.code, engine);
              engine.startGame();
            }
          }, 3000);
        }
      } else {
        // Spectator
        const spectator = room.addSpectator(socket.id, name);
        socket.join(room.code);
        cb?.({ success: true, roomCode: room.code, spectator: true });
        socket.emit('room_update', room.publicState(socket.id));
        io.to(room.code).emit('system_message', { text: `👁️ ${name} يشاهد اللعبة`, type: 'spectate' });
      }
    } catch (e) {
      logger.error('Lobby', 'join_room error', e);
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Start Game ────────────────────────────────────────────────────
  socket.on('start_game', (_, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room)                        return cb?.({ error: 'لست في غرفة' });
      if (room.hostId !== socket.id)    return cb?.({ error: 'فقط الهوست' });
      if (room.players.size < GAME.MIN_PLAYERS) return cb?.({ error: `يحتاج ${GAME.MIN_PLAYERS} لاعبين على الأقل` });
      if (room.phase !== 'lobby')       return cb?.({ error: 'اللعبة بدأت' });

      const engine = new GameEngine(room, io);
      engines.set(room.code, engine);
      cb?.({ success: true });
      engine.startGame();
    } catch (e) {
      logger.error('Lobby', 'start_game error', e);
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Kick Player ───────────────────────────────────────────────────
  socket.on('kick_player', ({ targetId }, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return cb?.({ error: 'غير مصرح' });
      if (room.phase !== 'lobby')             return cb?.({ error: 'لا يمكن الطرد أثناء اللعبة' });

      const target = room.getPlayer(targetId);
      if (!target) return cb?.({ error: 'اللاعب غير موجود' });

      room.removePlayer(targetId);
      io.to(targetId).emit('kicked', { reason: 'تم طردك من الغرفة' });
      io.sockets.sockets.get(targetId)?.leave(room.code);

      cb?.({ success: true });
      broadcastRoom(room);
      io.to(room.code).emit('system_message', { text: `🚫 ${target.name} تم طرده`, type: 'kick' });
    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Ban Player ────────────────────────────────────────────────────
  socket.on('ban_player', ({ targetId, reason = '' }, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return cb?.({ error: 'غير مصرح' });

      const target = room.getPlayer(targetId);
      if (!target) return cb?.({ error: 'اللاعب غير موجود' });

      room.ban(target.userId || targetId, reason);
      room.removePlayer(targetId);
      io.to(targetId).emit('kicked', { reason: `تم حظرك: ${reason || 'بدون سبب'}` });
      io.sockets.sockets.get(targetId)?.leave(room.code);

      cb?.({ success: true });
      broadcastRoom(room);
      io.to(room.code).emit('system_message', { text: `⛔ ${target.name} تم حظره`, type: 'ban' });
    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Transfer Host ─────────────────────────────────────────────────
  socket.on('transfer_host', ({ targetId }, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return cb?.({ error: 'غير مصرح' });

      if (!room.transferHost(targetId)) return cb?.({ error: 'اللاعب غير موجود' });

      cb?.({ success: true });
      broadcastRoom(room);
      const target = room.getPlayer(targetId);
      io.to(room.code).emit('system_message', { text: `👑 ${target?.name} أصبح الهوست`, type: 'host' });
    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Restart Game ──────────────────────────────────────────────────
  socket.on('restart_game', (_, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room || room.hostId !== socket.id) return cb?.({ error: 'غير مصرح' });

      const engine = engines.get(room.code);
      if (engine) engine.clearTimer();
      engines.delete(room.code);
      room.resetForRestart();

      cb?.({ success: true });
      broadcastRoom(room);
      io.to(room.code).emit('game_restarted');
    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Public Rooms List ─────────────────────────────────────────────
  socket.on('get_public_rooms', (_, cb) => {
    cb?.({ rooms: getPublicRooms() });
  });
};
