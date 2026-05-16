// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Config
// ═══════════════════════════════════════
require('dotenv').config();

module.exports = {
  PORT:              process.env.PORT        || 3000,
  NODE_ENV:          process.env.NODE_ENV    || 'development',
  DB_PATH:           process.env.DB_PATH     || './mafia.db',

  // Game settings
  GAME: {
    MIN_PLAYERS:     4,
    MAX_PLAYERS:     10,
    AUTO_START_AT:   null,           // null = disabled, number = auto start count
    ROOM_TTL_MS:     4 * 60 * 60 * 1000,  // 4 hours
    CLEANUP_INTERVAL: 30 * 60 * 1000,     // 30 min
    RECONNECT_GRACE:  60 * 1000,          // 60s to reconnect
  },

  // Phase durations (seconds)
  DURATIONS: {
    NIGHT:      30,
    DOCTOR:     30,
    DETECTIVE:  30,
    SNIPER:     30,
    DISCUSSION: 180,
    DEFENSE:    30,
    VOTING:     60,
  },

  // Rate limiting
  RATE: {
    SOCKET_EVENTS_PER_SECOND: 10,
    CHAT_MESSAGES_PER_MINUTE: 30,
    MAX_CONNECTIONS_PER_IP:   5,
  },

  // XP rewards
  XP: {
    WIN:          100,
    KILL:          30,
    SAVE:          25,
    CORRECT_VOTE:  20,
    SURVIVE_ROUND: 10,
  },

  // Ranks
  RANKS: [
    { name: 'مبتدئ',    minXP: 0,    icon: '🌱' },
    { name: 'محقق',     minXP: 500,  icon: '🔍' },
    { name: 'عميل',     minXP: 1500, icon: '🕵️' },
    { name: 'قائد',     minXP: 3000, icon: '⭐' },
    { name: 'أسطورة',   minXP: 6000, icon: '👑' },
  ],
};
