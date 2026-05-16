// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Game Constants
// ═══════════════════════════════════════
const { DURATIONS } = require('./config');

const ROLES = {
  MAFIA: {
    id: 'mafia', name: 'المافيا', team: 'mafia',
    emoji: '🔫', color: '#e74c3c',
    description: 'تعرف زملاءك. تختار ضحية كل ليلة.',
    nightAction: true, canChatMafia: true,
  },
  CITIZEN: {
    id: 'citizen', name: 'المواطن', team: 'town',
    emoji: '👤', color: '#95a5a6',
    description: 'لا قدرات خاصة. استخدم منطقك.',
    nightAction: false,
  },
  DOCTOR: {
    id: 'doctor', name: 'الطبيب', team: 'town',
    emoji: '💉', color: '#2ecc71',
    description: 'احمِ لاعباً واحداً كل ليلة.',
    nightAction: true,
  },
  DETECTIVE: {
    id: 'detective', name: 'المحقق', team: 'town',
    emoji: '🔍', color: '#3498db',
    description: 'افحص هوية لاعب كل ليلة.',
    nightAction: true,
  },
  SNIPER: {
    id: 'sniper', name: 'القناص', team: 'town',
    emoji: '🎯', color: '#e67e22',
    description: 'رصاصة واحدة طوال اللعبة — استخدمها بحكمة.',
    nightAction: true, singleUse: true,
  },
  MAYOR: {
    id: 'mayor', name: 'العمدة', team: 'town',
    emoji: '⭐', color: '#f1c40f',
    description: 'صوتك يساوي مرتين في التصويت.',
    nightAction: false, voteWeight: 2,
  },
};

const PHASES = {
  LOBBY:      { id: 'lobby',      name: 'غرفة الانتظار', icon: '🏠', duration: null },
  NIGHT:      { id: 'night',      name: 'الليل',         icon: '🌙', duration: DURATIONS.NIGHT      },
  DOCTOR:     { id: 'doctor',     name: 'دور الطبيب',    icon: '💉', duration: DURATIONS.DOCTOR     },
  DETECTIVE:  { id: 'detective',  name: 'دور المحقق',    icon: '🔍', duration: DURATIONS.DETECTIVE  },
  SNIPER:     { id: 'sniper',     name: 'دور القناص',    icon: '🎯', duration: DURATIONS.SNIPER     },
  DISCUSSION: { id: 'discussion', name: 'النقاش',        icon: '💬', duration: DURATIONS.DISCUSSION },
  DEFENSE:    { id: 'defense',    name: 'الدفاع',        icon: '🛡️', duration: DURATIONS.DEFENSE    },
  VOTING:     { id: 'voting',     name: 'التصويت',       icon: '⚖️', duration: DURATIONS.VOTING     },
  RESULT:     { id: 'result',     name: 'النتيجة',       icon: '📜', duration: 6                    },
};

const ROLE_DISTRIBUTION = {
  4:  { mafia:1, doctor:0, detective:0, sniper:0, mayor:0 },
  5:  { mafia:1, doctor:1, detective:0, sniper:0, mayor:0 },
  6:  { mafia:1, doctor:1, detective:1, sniper:0, mayor:0 },
  7:  { mafia:2, doctor:1, detective:1, sniper:0, mayor:0 },
  8:  { mafia:2, doctor:1, detective:1, sniper:1, mayor:0 },
  9:  { mafia:2, doctor:1, detective:1, sniper:1, mayor:1 },
  10: { mafia:3, doctor:1, detective:1, sniper:1, mayor:1 },
};

module.exports = { ROLES, PHASES, ROLE_DISTRIBUTION };

// ROLES_CONFIG used by roomManager for role assignment
const ROLES_CONFIG = {
  mafia:     { team: 'mafia' },
  godfather: { team: 'mafia' },
  citizen:   { team: 'town'  },
  doctor:    { team: 'town'  },
  detective: { team: 'town'  },
  sniper:    { team: 'town'  },
  mayor:     { team: 'town'  },
};

// Add godfather role to ROLES
ROLES.GODFATHER = {
  id: 'godfather', name: 'العراب', team: 'mafia',
  emoji: '🎩', color: '#c0392b',
  description: 'قائد المافيا. يظهر بريئاً للمحقق.',
  nightAction: true, canChatMafia: true,
};

module.exports = { ROLES, PHASES, ROLE_DISTRIBUTION, ROLES_CONFIG };
