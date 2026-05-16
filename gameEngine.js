// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Game Engine (Fixed)
// ═══════════════════════════════════════
const { PHASES, ROLES } = require('./constants');
const { XP, DURATIONS } = require('./config');
const logger             = require('./logger');

class GameEngine {
  constructor(room, io) {
    this.room   = room;
    this.io     = io;
    this._timer = null;
    this.timeLeft = 0;
  }

  emit(event, data)        { this.io.to(this.room.code).emit(event, data); }
  emitTo(sid, event, data) { this.io.to(sid).emit(event, data); }
  emitToMafia(event, data) { this.room.getMafiaMembers().forEach(m => this.emitTo(m.id, event, data)); }
  emitToDead(event, data)  { this.room.getDeadPlayers().forEach(p => this.emitTo(p.id, event, data)); }

  clearTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  startTimer(seconds, onEnd) {
    this.clearTimer();
    this.timeLeft = seconds;
    this.emit('timer_update', { timeLeft: this.timeLeft, max: seconds });
    this._timer = setInterval(() => {
      this.timeLeft--;
      this.emit('timer_update', { timeLeft: this.timeLeft, max: seconds });
      if (this.timeLeft <= 0) { this.clearTimer(); onEnd(); }
    }, 1000);
  }

  startGame() {
    const room = this.room;
    room.assignRoles();
    room.round = 1;
    for (const player of room.getAllPlayers()) {
      const roleData  = ROLES[player.role.toUpperCase()];
      const mafiaTeam = player.team === 'mafia'
        ? room.getMafiaMembers().filter(m => m.id !== player.id).map(m => ({ id: m.id, name: m.name }))
        : [];
      this.emitTo(player.id, 'role_assigned', { role: roleData, mafiaTeam });
    }
    this.emit('game_started', { round: room.round });
    logger.info('Engine', `Game started in room ${room.code}`);
    setTimeout(() => this.startPhase('night'), 4000);
  }

  startPhase(phaseId) {
    const room      = this.room;
    room.phase      = phaseId;
    const phaseData = PHASES[phaseId.toUpperCase()];
    const duration  = phaseData?.duration ?? 30;

    if (phaseId === 'night') {
      room.nightKill  = null;
      room.doctorSave = null;
      room.votes      = {};
      for (const p of room.getAllPlayers()) p.actionDone = false;
    }
    if (phaseId === 'discussion') {
      room.votes = {};
    }

    this.emit('phase_change', {
      phase:     phaseId,
      name:      phaseData?.name || phaseId,
      icon:      phaseData?.icon || '🎭',
      duration,
      round:     room.round,
      accusedId: room.accusedId,
    });

    logger.debug('Engine', `Phase: ${phaseId} | Room: ${room.code}`);
    this.startTimer(duration, () => this.onPhaseEnd(phaseId));
  }

  onPhaseEnd(phaseId) {
    switch (phaseId) {
      case 'night':      return this.endNight();
      case 'doctor':     return this.endDoctor();
      case 'detective':  return this.endDetective();
      case 'sniper':     return this.endSniper();
      case 'discussion': return this.endDiscussion();
      case 'defense':    return this.endDefense();
      case 'voting':     return this.endVoting();
    }
  }

  // ── Auto-complete night phases ────────────────────────────────────
  tryAutoAdvance() {
    const room  = this.room;
    const alive = room.getAlivePlayers();
    const phase = room.phase;

    if (phase === 'night') {
      if (room.nightKill !== null) {
        this.clearTimer();
        this.endNight();
      }
    } else if (phase === 'doctor') {
      const doctor = alive.find(p => p.role === 'doctor');
      if (!doctor || doctor.actionDone) {
        this.clearTimer();
        this.endDoctor();
      }
    } else if (phase === 'detective') {
      const det = alive.find(p => p.role === 'detective');
      if (!det || det.actionDone) {
        this.clearTimer();
        this.endDetective();
      }
    }
  }

  endNight() {
    const alive = this.room.getAlivePlayers();
    if (alive.some(p => p.role === 'doctor'))                           return this.startPhase('doctor');
    if (alive.some(p => p.role === 'detective'))                        return this.startPhase('detective');
    if (alive.some(p => p.role === 'sniper') && !this.room.sniperUsed) return this.startPhase('sniper');
    this.resolveNight();
  }

  endDoctor() {
    const alive = this.room.getAlivePlayers();
    if (alive.some(p => p.role === 'detective'))                        return this.startPhase('detective');
    if (alive.some(p => p.role === 'sniper') && !this.room.sniperUsed) return this.startPhase('sniper');
    this.resolveNight();
  }

  endDetective() {
    if (this.room.getAlivePlayers().some(p => p.role === 'sniper') && !this.room.sniperUsed)
      return this.startPhase('sniper');
    this.resolveNight();
  }

  endSniper() { this.resolveNight(); }

  resolveNight() {
    const room   = this.room;
    const events = [];

    if (room.nightKill) {
      const target = room.getPlayer(room.nightKill);
      if (target?.alive) {
        if (room.doctorSave === room.nightKill) {
          events.push({ type: 'saved', name: target.name });
          const doc = room.getAlivePlayers().find(p => p.role === 'doctor');
          if (doc) doc.saves++;
          room._doctorSavedThisRound = true;
        } else {
          target.alive = false;
          events.push({ type: 'killed', id: target.id, name: target.name, roleData: ROLES[target.role.toUpperCase()] });
          room.getMafiaMembers().forEach(m => m.kills++);
          room._doctorSavedThisRound = false;
        }
      }
    } else {
      events.push({ type: 'no_kill' });
      room._doctorSavedThisRound = false;
    }

    this.emit('night_results', { events, round: room.round, doctorSaved: room._doctorSavedThisRound });
    const win = room.checkWinCondition();
    if (win) return setTimeout(() => this.endGame(win), 4000);
    setTimeout(() => this.startPhase('discussion'), 4000);
  }

  endDiscussion() {
    const room      = this.room;
    const voteCount = this._countVotes();
    const sorted    = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);

    if (!sorted.length || sorted[0][1] === 0) {
      room.accusedId = null;
      room.round++;
      room.votes = {};
      return this.startPhase('night');
    }

    room.accusedId = sorted[0][0];
    room.votes     = {};
    const accused  = room.getPlayer(room.accusedId);

    this.emit('player_accused', {
      accusedId:   room.accusedId,
      accusedName: accused?.name,
      voteCount,
    });

    this.startPhase('defense');
  }

  endDefense() {
    this.room.votes = {};
    this.startPhase('voting');
  }

  endVoting() {
    const room       = this.room;
    const voteCount  = this._countVotes();
    const sorted     = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
    const aliveCount = room.getAlivePlayers().length;
    let ejected      = null;

    if (sorted.length) {
      const [topId, topCount] = sorted[0];
      // Must be the accused AND have majority
      if (topId === room.accusedId && topCount > aliveCount / 2) {
        const p = room.getPlayer(topId);
        if (p?.alive) {
          p.alive = false;
          ejected = { ...p, roleData: ROLES[p.role.toUpperCase()] };
        }
      }
    }

    this.emit('vote_results', {
      ejected,
      voteCount,
      allVotes: room.votes,
      players:  room.getAllPlayers(),
    });

    const win = room.checkWinCondition();
    if (win) return setTimeout(() => this.endGame(win), 5000);

    room.round++;
    room.accusedId = null;
    room.votes     = {};
    setTimeout(() => this.startPhase('night'), 5000);
  }

  _countVotes() {
    const counts = {};
    for (const [vid, tid] of Object.entries(this.room.votes)) {
      const voter  = this.room.getPlayer(vid);
      if (!voter?.alive) continue;
      const weight = voter?.role === 'mayor' ? 2 : 1;
      counts[tid]  = (counts[tid] || 0) + weight;
    }
    return counts;
  }

  // ── Night Actions ─────────────────────────────────────────────────
  mafiaKill(targetId, playerId) {
    this.room.nightKill = targetId;
    const player = this.room.getPlayer(playerId);
    if (player) player.actionDone = true;
    // Broadcast to mafia team what was selected
    this.emitToMafia('mafia_kill_selected', {
      targetId,
      targetName: this.room.getPlayer(targetId)?.name,
      byId: playerId,
      byName: player?.name,
    });
    this.tryAutoAdvance();
  }

  doctorSave(targetId, playerId) {
    this.room.doctorSave = targetId;
    const player = this.room.getPlayer(playerId);
    if (player) player.actionDone = true;
    this.tryAutoAdvance();
  }

  detectiveCheck(detectiveId, targetId) {
    const target    = this.room.getPlayer(targetId);
    const detective = this.room.getPlayer(detectiveId);
    if (!target) return;

    this.emitTo(detectiveId, 'detective_result', {
      name: target.name, team: target.team, isMafia: target.team === 'mafia',
    });

    if (detective) detective.actionDone = true;
    this.tryAutoAdvance();
  }

  sniperShoot(targetId) {
    if (this.room.sniperUsed) return;
    this.room.sniperUsed = true;
    const target = this.room.getPlayer(targetId);
    if (target?.alive) {
      target.alive = false;
      this.emit('sniper_shot', {
        name: target.name, id: target.id, roleData: ROLES[target.role.toUpperCase()],
      });
    }
    this.clearTimer();
    setTimeout(() => this.endSniper(), 1500);
  }

  castVote(voterId, targetId, skip = false) {
    const room = this.room;
    if (skip) {
      delete room.votes[voterId];
    } else {
      room.votes[voterId] = targetId;
    }

    const voteCount    = this._countVotes();
    const aliveCount   = room.getAlivePlayers().length;
    const allVotesNamed = {};
    for (const [vid, tid] of Object.entries(room.votes)) {
      allVotesNamed[vid] = {
        targetId:   tid,
        voterName:  room.getPlayer(vid)?.name  || '?',
        targetName: room.getPlayer(tid)?.name  || '?',
      };
    }

    this.emit('votes_updated', {
      voteCount,
      allVotes: room.votes,
      allVotesNamed,
      total:    Object.keys(room.votes).length,
      needed:   aliveCount,
      accusedId: room.accusedId,
    });

    // Auto-end if everyone voted
    const aliveVoters = room.getAlivePlayers().length;
    if (Object.keys(room.votes).length >= aliveVoters) {
      this.clearTimer();
      this.onPhaseEnd(room.phase);
    }
  }

  // ── Game Over ─────────────────────────────────────────────────────
  endGame(winData) {
    this.clearTimer();
    this.room.phase = 'result';
    logger.info('Engine', `Game over in ${this.room.code}: ${winData.winner} wins`);

    const xpMap = {};
    for (const p of this.room.getAllPlayers()) {
      let xp = 0;
      if (p.team === winData.winner) xp += XP.WIN;
      xp += p.kills * XP.KILL;
      xp += p.saves * XP.SAVE;
      xpMap[p.id] = xp;
    }

    this.emit('game_over', {
      winner:  winData.winner,
      reason:  winData.reason,
      xpMap,
      players: this.room.getAllPlayers().map(p => ({
        ...p, roleData: ROLES[p.role.toUpperCase()], xpEarned: xpMap[p.id] || 0,
      })),
    });
  }
}

module.exports = { GameEngine };
