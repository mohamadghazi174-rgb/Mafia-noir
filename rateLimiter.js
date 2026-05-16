// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Rate Limiter
// ═══════════════════════════════════════
const { RATE } = require('./config');
const logger   = require('./logger');

// Per-socket event counters: socketId → { event → [timestamps] }
const counters = new Map();

function getRateLimit(event) {
  if (event === 'send_message') return { max: RATE.CHAT_MESSAGES_PER_MINUTE, windowMs: 60000 };
  return { max: RATE.SOCKET_EVENTS_PER_SECOND * 2, windowMs: 2000 };
}

function checkRateLimit(socketId, event) {
  if (!counters.has(socketId)) counters.set(socketId, {});
  const socketCounters = counters.get(socketId);
  if (!socketCounters[event]) socketCounters[event] = [];

  const { max, windowMs } = getRateLimit(event);
  const now  = Date.now();
  const hits  = socketCounters[event].filter(t => now - t < windowMs);
  hits.push(now);
  socketCounters[event] = hits;

  if (hits.length > max) {
    logger.warn('RateLimit', `${socketId} exceeded ${event} (${hits.length}/${max})`);
    return false;
  }
  return true;
}

function clearSocket(socketId) {
  counters.delete(socketId);
}

// Cleanup old entries every 5 min
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [sid, events] of counters.entries()) {
    for (const [ev, ts] of Object.entries(events)) {
      events[ev] = ts.filter(t => t > cutoff);
    }
  }
}, 5 * 60 * 1000);

module.exports = { checkRateLimit, clearSocket };
