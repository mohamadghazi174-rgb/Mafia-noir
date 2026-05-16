// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Chat Handler
// ═══════════════════════════════════════
const { getRoomByPlayer } = require('./roomManager');
const { validateMessage, sanitize } = require('./validator');

module.exports = function chatHandler(io, socket) {

  socket.on('send_message', ({ text, channel = 'public' }, cb) => {
    try {
      const room = getRoomByPlayer(socket.id);
      if (!room) return cb?.({ error: 'لست في غرفة' });

      const player = room.getPlayer(socket.id);
      if (!player) return cb?.({ error: 'لاعب غير موجود' });

      const msgErr = validateMessage(text);
      if (msgErr) return cb?.({ error: msgErr });

      const clean = sanitize(text, 200);
      const msg   = {
        senderId:   player.id,
        senderName: player.name,
        avatarId:   player.avatarId,
        text:       clean,
        channel,
        ts:         Date.now(),
      };

      // ── Public Chat ───────────────────────────────────────────────
      if (channel === 'public') {
        // Restrict speech during active game phases (only discussion/defense/lobby)
        const talkPhases = ['lobby', 'discussion', 'defense', 'result'];
        if (!talkPhases.includes(room.phase) && player.alive) {
          return cb?.({ error: 'الدردشة العامة متاحة فقط في وقت النقاش' });
        }
        if (!player.alive && !['discussion','defense','result','lobby'].includes(room.phase)) {
          return cb?.({ error: 'الأموات لا يتحدثون في الدردشة العامة' });
        }
        room.publicChat.push(msg);
        io.to(room.code).emit('new_message', msg);

      // ── Mafia Chat ────────────────────────────────────────────────
      } else if (channel === 'mafia') {
        if (player.team !== 'mafia')  return cb?.({ error: 'لست من المافيا' });
        if (room.phase !== 'night')   return cb?.({ error: 'شات المافيا متاح بالليل فقط' });
        room.mafiaChat.push(msg);
        room.getMafiaMembers().forEach(m => io.to(m.id).emit('new_message', msg));

      // ── Dead Chat ─────────────────────────────────────────────────
      } else if (channel === 'dead') {
        if (player.alive) return cb?.({ error: 'هذا الشات للأموات فقط' });
        room.deadChat.push(msg);
        room.getDeadPlayers().forEach(p => io.to(p.id).emit('new_message', msg));

      } else {
        return cb?.({ error: 'قناة غير معروفة' });
      }

      cb?.({ success: true });
    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });
};
