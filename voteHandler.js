// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Vote Handler (Fixed)
// ═══════════════════════════════════════
const { getRoomByPlayer } = require('./roomManager');

module.exports = function voteHandler(io, socket, engines) {

  socket.on('cast_vote', ({ targetId, skip = false }, cb) => {
    try {
      const room   = getRoomByPlayer(socket.id);
      const engine = room ? engines.get(room.code) : null;
      if (!room || !engine) return cb?.({ error: 'خطأ في الجلسة' });

      const validPhases = ['discussion', 'voting'];
      if (!validPhases.includes(room.phase)) return cb?.({ error: 'ليس وقت التصويت' });

      const voter = room.getPlayer(socket.id);
      if (!voter)           return cb?.({ error: 'لاعب غير موجود' });
      if (!voter.alive)     return cb?.({ error: 'الأموات لا يصوتون' });

      if (!skip) {
        if (!targetId) return cb?.({ error: 'اختر لاعباً' });

        const target = room.getPlayer(targetId);
        if (!target)          return cb?.({ error: 'اللاعب غير موجود' });
        if (!target.alive)    return cb?.({ error: 'لا يمكن التصويت على ميت' });
        if (targetId === socket.id) return cb?.({ error: 'لا تصوت على نفسك' });

        // In voting phase, can only vote on accused
        if (room.phase === 'voting') {
          if (!room.accusedId) return cb?.({ error: 'لا يوجد متهم' });
          if (targetId !== room.accusedId) return cb?.({ error: 'التصويت فقط على المتهم' });
        }
      }

      engine.castVote(socket.id, targetId, skip);
      cb?.({ success: true });

    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // Vote to accuse during discussion (alias)
  socket.on('vote_accuse', ({ targetId }, cb) => {
    try {
      const room   = getRoomByPlayer(socket.id);
      const engine = room ? engines.get(room.code) : null;
      if (!room || !engine)            return cb?.({ error: 'خطأ في الجلسة' });
      if (room.phase !== 'discussion') return cb?.({ error: 'ليس وقت النقاش' });

      const voter = room.getPlayer(socket.id);
      if (!voter?.alive) return cb?.({ error: 'الأموات لا يصوتون' });

      const target = room.getPlayer(targetId);
      if (!target?.alive)              return cb?.({ error: 'اللاعب غير موجود' });
      if (targetId === socket.id)      return cb?.({ error: 'لا تصوت على نفسك' });

      engine.castVote(socket.id, targetId, false);
      cb?.({ success: true });

    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });

  // Final elimination vote
  socket.on('vote_eliminate', ({ eliminate }, cb) => {
    try {
      const room   = getRoomByPlayer(socket.id);
      const engine = room ? engines.get(room.code) : null;
      if (!room || !engine)         return cb?.({ error: 'خطأ في الجلسة' });
      if (room.phase !== 'voting')  return cb?.({ error: 'ليس وقت التصويت' });
      if (!room.accusedId)          return cb?.({ error: 'لا يوجد متهم' });

      const voter = room.getPlayer(socket.id);
      if (!voter?.alive) return cb?.({ error: 'الأموات لا يصوتون' });

      if (eliminate) {
        engine.castVote(socket.id, room.accusedId, false);
      } else {
        engine.castVote(socket.id, null, true); // skip = abstain
      }
      cb?.({ success: true });

    } catch (e) {
      cb?.({ error: 'حدث خطأ' });
    }
  });
};
