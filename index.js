// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Flat Server Entry
// ═══════════════════════════════════════
const express  = require('express');
const http     = require('http');
const path     = require('path');
const { Server } = require('socket.io');

const config        = require('./config');
const logger        = require('./logger');
const socketHandler = require('./socketHandler');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors:         { origin: '*' },
  pingTimeout:  60000,
  pingInterval: 25000,
  transports:   ['websocket', 'polling'],
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

socketHandler(io);

try {
  require('./database').getDb();
} catch (e) {
  logger.warn('Server', 'DB init skipped');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info('Server', `🎭 Mafia Noir V3 — http://localhost:${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
