// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Logger
// ═══════════════════════════════════════
const { NODE_ENV } = require('./config');

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const COLORS = {
  ERROR: '\x1b[31m', WARN: '\x1b[33m',
  INFO:  '\x1b[36m', DEBUG: '\x1b[90m', RESET: '\x1b[0m'
};

const currentLevel = NODE_ENV === 'production' ? LEVELS.INFO : LEVELS.DEBUG;

function log(level, area, msg, data = null) {
  if (LEVELS[level] > currentLevel) return;
  const color = COLORS[level] || '';
  const ts    = new Date().toISOString().slice(11, 19);
  const line  = `${color}[${ts}] ${level.padEnd(5)} [${area}] ${msg}${COLORS.RESET}`;
  if (data) console.log(line, data);
  else      console.log(line);
}

module.exports = {
  error: (area, msg, data) => log('ERROR', area, msg, data),
  warn:  (area, msg, data) => log('WARN',  area, msg, data),
  info:  (area, msg, data) => log('INFO',  area, msg, data),
  debug: (area, msg, data) => log('DEBUG', area, msg, data),
};
