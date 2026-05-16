// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Game Handler (Fixed)
// ═══════════════════════════════════════
const { getRoomByPlayer } = require('./roomManager');
const logger = require('./logger');

module.exports = function gameHandler(io, socket, engines) {

  function getContext() {
    const room   = getRoomByPlayer(socket.id);
    const engine = room ? engines.get(room.code) : null;
    return { room, engine };
  }

  // ── Mafia Kill ────────────────────────────────────────────────────
  socket.on('mafia_kill', ({ targetId }, cb) => {
    try {
      const { room, engine } = getContext();
      if (!room || !engine)         return cb?.({ error: 'خطأ في الجلسة' });
      if (room.phase !== 'night')   return cb?.({ error: 'ليس وقت الليل' });

      const player = room.getPlayer(socket.id);
      if (!player)                  return cb?.({ error: 'لاعب غير موجود' });
      if (player.team !== 'mafia')  return cb?.({ error: 'لست من المافيا' });
      if (!player.alive)            return cb?.({ error: 'أنت ميت' });

      const target = room.getPlayer(targetId);
      if (!target)                  return cb?.({ error: 'الهدف غير موجود' });
      if (!target.alive)            return cb?.({ error: 'اللاعب ميت' });
      if (targetId === socket.id)   return cb?.({ error: 'لا تستطيع اختيار نفسك' });
      if (target.team === 'mafia')  return cb?.({ error: 'لا تقتل زميلك' });

      engine.mafiaKill(targetId, socket.id);
      cb?.({ success: true });

    } catch (e) {
      logger.error('GameHandler', 'mafia_kill', e);
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Doctor Save ───────────────────────────────────────────────────
  socket.on('doctor_save', ({ targetId }, cb) => {
    try {
      const { room, engine } = getContext();
      if (!room || !engine)          return cb?.({ error: 'خطأ' });
      if (room.phase !== 'doctor')   return cb?.({ error: 'ليس دور الطبيب' });

      const player = room.getPlayer(socket.id);
      if (!player)                   return cb?.({ error: 'لاعب غير موجود' });
      if (player.role !== 'doctor')  return cb?.({ error: 'لست الطبيب' });
      if (!player.alive)             return cb?.({ error: 'أنت ميت' });
      if (player.actionDone)         return cb?.({ error: 'اخترت بالفعل' });

      const target = room.getPlayer(targetId);
      if (!target?.alive)            return cb?.({ error: 'اللاعب ميت' });

      engine.doctorSave(targetId, socket.id);
      cb?.({ success: true });

    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Detective Check ───────────────────────────────────────────────
  socket.on('detective_check', ({ targetId }, cb) => {
    try {
      const { room, engine } = getContext();
      if (!room || !engine)             return cb?.({ error: 'خطأ' });
      if (room.phase !== 'detective')   return cb?.({ error: 'ليس دور المحقق' });

      const player = room.getPlayer(socket.id);
      if (!player)                      return cb?.({ error: 'لاعب غير موجود' });
      if (player.role !== 'detective')  return cb?.({ error: 'لست المحقق' });
      if (!player.alive)                return cb?.({ error: 'أنت ميت' });
      if (player.actionDone)            return cb?.({ error: 'فحصت بالفعل' });
      if (targetId === socket.id)       return cb?.({ error: 'لا تفحص نفسك' });

      const target = room.getPlayer(targetId);
      if (!target?.alive)               return cb?.({ error: 'اللاعب ميت' });

      engine.detectiveCheck(socket.id, targetId);
      cb?.({ success: true });

    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Sniper Shoot ──────────────────────────────────────────────────
  socket.on('sniper_shoot', ({ targetId }, cb) => {
    try {
      const { room, engine } = getContext();
      if (!room || !engine)          return cb?.({ error: 'خطأ' });
      if (room.phase !== 'sniper')   return cb?.({ error: 'ليس دور القناص' });

      const player = room.getPlayer(socket.id);
      if (!player)                   return cb?.({ error: 'لاعب غير موجود' });
      if (player.role !== 'sniper')  return cb?.({ error: 'لست القناص' });
      if (!player.alive)             return cb?.({ error: 'أنت ميت' });
      if (room.sniperUsed)           return cb?.({ error: 'استخدمت رصاصتك' });
      if (targetId === socket.id)    return cb?.({ error: 'لا تطلق على نفسك' });

      const target = room.getPlayer(targetId);
      if (!target?.alive)            return cb?.({ error: 'اللاعب ميت' });

      engine.sniperShoot(targetId);
      player.actionDone = true;
      cb?.({ success: true });

    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // ── Skip Night Action ─────────────────────────────────────────────
  socket.on('skip_action', (_, cb) => {
    try {
      const { room, engine } = getContext();
      if (!room) return cb?.({ error: 'خطأ' });
      const player = room.getPlayer(socket.id);
      if (player) {
        player.actionDone = true;
        if (engine) engine.tryAutoAdvance();
      }
      cb?.({ success: true });
    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });
};
