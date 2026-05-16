// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Smart AI Bot Manager
// ═══════════════════════════════════════

const BOT_NAMES = [
  'أبو علي','سارة','خالد','ريم','محمد','نور','عمر','لينا',
  'يوسف','هنا','فارس','دانا','زياد','مي','باسل','رنا'
];

const CHAT_LINES = {
  discussion_innocent: [
    'أنا متأكد إنو ما عندي علاقة بالمافيا 😤',
    'شو الدليل؟ ما في دليل!',
    'صوتوا على حدا ثاني، أنا بريء',
    'ليش دايماً الشك عليّ؟',
    'أنا مراقب المافيا من البداية',
  ],
  discussion_accuse: [
    'هاد التصرف مريب جداً 🤔',
    'لاحظت إنو ما صوّت بشكل واضح',
    'هاد عنده أسلوب المافيا 100%',
    'شو رأيكم فيه؟ بدي أعرف',
    'الأدلة كلها بتشير عليه',
  ],
  night_mafia: [
    'اقتلوا الطبيب قبل ما ينقذ أحد',
    'الهدف الأذكى هو المحقق',
    'نختار ضحية ذكية الليلة',
  ],
  defend: [
    'أنا بريء وأثبت ذلك!',
    'ما عندي سبب أكذب عليكم',
    'ثقوا فيّ هاي المرة',
    'أعطوني فرصة وما تندموا',
  ],
  general: [
    'يلا نفكر بعقلانية 🧠',
    'من رأيكم؟',
    'هاد الوضع صعب',
    'لازم نتعاون',
  ],
};

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function botThink(bot, room, phase) {
  // Bots analyze who looks suspicious based on voting history
  const alive    = room.getAlivePlayers().filter(p => !p.isBot || p.id !== bot.id);
  const enemies  = bot.team === 'mafia'
    ? alive.filter(p => p.team !== 'mafia')
    : alive.filter(p => p.team === 'mafia');
  const friends  = bot.team === 'mafia'
    ? alive.filter(p => p.team === 'mafia' && p.id !== bot.id)
    : [];

  // Pick target: prefer known enemies, otherwise random
  const targets = enemies.length ? enemies : alive.filter(p => p.id !== bot.id);
  return targets[Math.floor(Math.random() * targets.length)];
}

class BotManager {
  constructor(room, io, engine) {
    this.room    = room;
    this.io      = io;
    this.engine  = engine;
    this.bots    = [];
    this._timers = [];
  }

  // Add N bots to room
  addBots(count = 2) {
    const usedNames = new Set(this.room.getAllPlayers().map(p => p.name));
    let added = 0;
    for (const name of BOT_NAMES) {
      if (added >= count) break;
      if (usedNames.has(name)) continue;
      const botId = `bot_${Date.now()}_${added}`;
      const player = this.room.addPlayer(botId, name, null, false);
      if (player) {
        player.isBot     = true;
        player.connected = true;
        this.bots.push(player);
        added++;
        usedNames.add(name);
      }
    }
    return this.bots;
  }

  // Called when phase changes
  onPhaseChange(phase) {
    this._clearTimers();
    const room = this.room;

    if (phase === 'night') {
      this.bots.forEach(bot => {
        if (!bot.alive || bot.actionDone) return;
        if (bot.team !== 'mafia') return;

        const delay = randomDelay(3000, 10000);
        const t = setTimeout(() => {
          const target = botThink(bot, room, phase);
          if (target && room.phase === 'night') {
            this.engine.mafiaKill(target.id, bot.id);
            // Mafia chat
            this._botChat(bot, randomItem(CHAT_LINES.night_mafia), 'mafia');
          }
        }, delay);
        this._timers.push(t);
      });
    }

    if (phase === 'doctor') {
      this.bots.forEach(bot => {
        if (!bot.alive || bot.role !== 'doctor') return;
        const delay = randomDelay(2000, 8000);
        const t = setTimeout(() => {
          if (room.phase !== 'doctor') return;
          // Doctor saves self or random alive player
          const alive = room.getAlivePlayers();
          const target = alive[Math.floor(Math.random() * alive.length)];
          if (target) this.engine.doctorSave(target.id, bot.id);
        }, delay);
        this._timers.push(t);
      });
    }

    if (phase === 'detective') {
      this.bots.forEach(bot => {
        if (!bot.alive || bot.role !== 'detective') return;
        const delay = randomDelay(2000, 8000);
        const t = setTimeout(() => {
          if (room.phase !== 'detective') return;
          const suspects = room.getAlivePlayers().filter(p => p.id !== bot.id);
          const target   = suspects[Math.floor(Math.random() * suspects.length)];
          if (target) this.engine.detectiveCheck(bot.id, target.id);
        }, delay);
        this._timers.push(t);
      });
    }

    if (phase === 'sniper') {
      this.bots.forEach(bot => {
        if (!bot.alive || bot.role !== 'sniper' || room.sniperUsed) return;
        // Sniper bots might pass or shoot
        if (Math.random() < 0.5) return; // 50% skip
        const delay = randomDelay(4000, 15000);
        const t = setTimeout(() => {
          if (room.phase !== 'sniper' || room.sniperUsed) return;
          const target = botThink(bot, room, phase);
          if (target) this.engine.sniperShoot(target.id);
        }, delay);
        this._timers.push(t);
      });
    }

    if (phase === 'discussion') {
      // Bots talk
      this.bots.forEach(bot => {
        if (!bot.alive) return;
        const chatDelay = randomDelay(3000, 20000);
        const t = setTimeout(() => {
          if (room.phase !== 'discussion') return;
          const lines = bot.team === 'mafia'
            ? [...CHAT_LINES.discussion_innocent, ...CHAT_LINES.general]
            : [...CHAT_LINES.discussion_accuse, ...CHAT_LINES.general];
          this._botChat(bot, randomItem(lines), 'public');
        }, chatDelay);
        this._timers.push(t);

        // Bots vote
        const voteDelay = randomDelay(15000, 50000);
        const t2 = setTimeout(() => {
          if (room.phase !== 'discussion') return;
          const target = botThink(bot, room, phase);
          if (target) this.engine.castVote(bot.id, target.id, false);
        }, voteDelay);
        this._timers.push(t2);
      });
    }

    if (phase === 'defense') {
      // Accused bot defends itself
      this.bots.forEach(bot => {
        if (!bot.alive || bot.id !== room.accusedId) return;
        const delay = randomDelay(1000, 5000);
        const t = setTimeout(() => {
          this._botChat(bot, randomItem(CHAT_LINES.defend), 'public');
        }, delay);
        this._timers.push(t);
      });
    }

    if (phase === 'voting') {
      this.bots.forEach(bot => {
        if (!bot.alive) return;
        const delay = randomDelay(3000, 15000);
        const t = setTimeout(() => {
          if (room.phase !== 'voting' || !room.accusedId) return;
          const accused = room.getPlayer(room.accusedId);
          if (!accused) return;
          // Mafia bots won't vote against their own
          const shouldEliminate = bot.team === 'mafia'
            ? accused.team === 'mafia' ? false : Math.random() > 0.3
            : Math.random() > 0.4;
          if (shouldEliminate) {
            this.engine.castVote(bot.id, room.accusedId, false);
          } else {
            this.engine.castVote(bot.id, null, true);
          }
        }, delay);
        this._timers.push(t);
      });
    }
  }

  _botChat(bot, text, channel) {
    const msg = {
      senderId:   bot.id,
      senderName: bot.name,
      avatarId:   bot.avatarId,
      text,
      channel,
      ts:         Date.now(),
      isBot:      true,
    };
    if (channel === 'public') {
      this.io.to(this.room.code).emit('new_message', msg);
    } else if (channel === 'mafia') {
      this.room.getMafiaMembers().forEach(m => this.io.to(m.id).emit('new_message', msg));
    }
  }

  _clearTimers() {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
  }

  destroy() {
    this._clearTimers();
  }
}

module.exports = { BotManager };
