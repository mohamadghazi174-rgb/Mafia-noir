// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Game Client (Fixed)
// ═══════════════════════════════════════
const socket = io({ reconnection:true, reconnectionAttempts:15, reconnectionDelay:1500 });

window.state = {
  roomCode: null, myId: null, myName: null,
  myRole: null,   myTeam: null, isHost: false,
  phase: 'lobby', round: 1, players: [],
  accusedId: null, selectedTarget: null,
  currentChannel: 'public', timerMax: 30,
  actionDone: false, currentVotes: {}, allVotesNamed: {},
  eventLog: [],
};

// ══════════════════════════════════════
//  LOBBY ACTIONS
// ══════════════════════════════════════
function createRoom() {
  const name    = document.getElementById('createName').value.trim();
  const privacy = document.getElementById('createPrivacy').value;
  const max     = parseInt(document.getElementById('createMax').value) || 10;
  const errEl   = document.getElementById('createError');
  errEl.textContent = '';
  socket.emit('create_room', { name, options: { private: privacy==='private', maxPlayers: max } }, res => {
    if (res?.error) { errEl.textContent = res.error; return; }
    state.roomCode = res.roomCode;
    state.myId     = socket.id;
    state.myName   = name;
    state.isHost   = true;
    UI.show('screenLobby');
    Sound.play('join');
  });
}

function joinRoom(spectate = false) {
  const code  = document.getElementById('joinCode').value.trim().toUpperCase();
  const name  = document.getElementById('joinName').value.trim();
  const errEl = document.getElementById('joinError');
  errEl.textContent = '';
  socket.emit('join_room', { code, name, spectate }, res => {
    if (res?.error) { errEl.textContent = res.error; return; }
    state.roomCode = res.roomCode;
    state.myId     = socket.id;
    state.myName   = name;
    state.isHost   = false;
    UI.show('screenLobby');
    Sound.play('join');
  });
}

function startGame() {
  socket.emit('start_game', {}, res => { if (res?.error) UI.toast(res.error, 'error'); });
}

function kickPlayer(id) {
  socket.emit('kick_player', { targetId: id }, res => { if (res?.error) UI.toast(res.error, 'error'); });
}

function banPlayer(id) {
  if (!confirm('حظر هذا اللاعب؟')) return;
  socket.emit('ban_player', { targetId: id, reason: 'بقرار الهوست' }, res => {
    if (res?.error) UI.toast(res.error, 'error');
  });
}

function addBots() {
  const count = parseInt(prompt('كم بوت تضيف؟ (1-4)', '2')) || 2;
  socket.emit('add_bots', { count: Math.min(4, Math.max(1, count)) }, res => {
    if (res?.error) UI.toast(res.error, 'error');
    else UI.toast(`تم إضافة ${res.count} بوت 🤖`, 'success');
  });
}

function removeBots() {
  socket.emit('remove_bots', {}, res => {
    if (res?.error) UI.toast(res.error, 'error');
    else UI.toast('تم حذف البوتات', 'info');
  });
}

function copyCode() {
  const code = document.getElementById('lobbyCode').textContent;
  navigator.clipboard.writeText(code).then(() => UI.toast('✓ تم نسخ الكود', 'success'));
}

function restartGame() {
  socket.emit('restart_game', {}, res => {
    if (res?.error) { UI.toast(res.error, 'error'); return; }
    UI.closePopup('popupGameOver');
  });
}

function showPublicRooms() {
  socket.emit('get_public_rooms', {}, res => {
    const list = document.getElementById('publicRoomsList');
    if (!res?.rooms?.length) {
      list.innerHTML = '<p style="color:var(--text-dim);text-align:center">لا توجد غرف عامة</p>';
    } else {
      list.innerHTML = res.rooms.map(r => `
        <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;color:var(--gold)">${r.code}</span>
          <span style="color:var(--text-dim)">${r.players}/${r.max} لاعبين</span>
          <button class="btn btn-secondary" style="padding:6px 14px;min-width:unset" onclick="quickJoin('${r.code}')">انضمام</button>
        </div>
      `).join('');
    }
    UI.openPopup('popupPublicRooms');
  });
}

function quickJoin(code) {
  UI.closePopup('popupPublicRooms');
  document.getElementById('joinCode').value = code;
  UI.show('screenJoin');
}

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════
function authLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  socket.emit('auth_login', { username, password }, res => {
    if (res?.error) { document.getElementById('authError').textContent = res.error; return; }
    state.myName = res.user.username;
    UI.toast(`مرحباً ${res.user.username} 👋`, 'success');
    UI.show('screenLanding');
  });
}

function authRegister() {
  const username = document.getElementById('regUser').value.trim();
  const password = document.getElementById('regPass').value;
  socket.emit('auth_register', { username, password }, res => {
    if (res?.error) { document.getElementById('authError').textContent = res.error; return; }
    UI.toast('تم التسجيل بنجاح ✓', 'success');
    switchAuthTab('login');
  });
}

function authGuest() {
  const name = document.getElementById('guestName').value.trim();
  socket.emit('auth_guest', { name }, res => {
    if (res?.error) { document.getElementById('authError').textContent = res.error; return; }
    state.myName = name;
    UI.toast(`دخلت كزائر: ${name}`, 'info');
    UI.show('screenLanding');
  });
}

// ══════════════════════════════════════
//  GAME ACTIONS
// ══════════════════════════════════════
function selectTarget(targetId) {
  if (state.actionDone) return;
  const phase = state.phase;
  const name  = state.players.find(p => p.id === targetId)?.name || '';

  // Voting phases — instant send
  if (phase === 'discussion') {
    socket.emit('cast_vote', { targetId }, res => {
      if (res?.error) { UI.toast(res.error, 'error'); return; }
      state.selectedTarget = targetId;
      UI.toast(`صوّتت ضد ${name} ⚖️`, 'info');
      renderGamePlayers();
      showActionPanel(phase);
    });
    return;
  }

  if (phase === 'voting') {
    socket.emit('vote_eliminate', { eliminate: true }, res => {
      if (res?.error) { UI.toast(res.error, 'error'); return; }
      state.selectedTarget = targetId;
      UI.toast(`صوّتت بالطرد ⚖️`, 'info');
      renderGamePlayers();
      showActionPanel(phase);
    });
    return;
  }

  // Night actions
  const eventMap = {
    night:      'mafia_kill',
    doctor:     'doctor_save',
    detective:  'detective_check',
    sniper:     'sniper_shoot',
  };

  const ev = eventMap[phase];
  if (!ev) return;

  if (phase === 'sniper' && !confirm(`هل أنت متأكد من إطلاق النار على ${name}؟`)) return;

  socket.emit(ev, { targetId }, res => {
    if (res?.error) { UI.toast(res.error, 'error'); return; }
    state.selectedTarget = targetId;
    state.actionDone     = true;

    const msgs = {
      night:     `تم اختيار ${name} ضحية 🔫`,
      doctor:    `ستحمي ${name} 💉`,
      detective: null,
      sniper:    `أطلقت النار على ${name} 🎯`,
    };
    if (msgs[phase]) UI.toast(msgs[phase], 'info');
    if (phase === 'night') Sound.play('vote');
    renderGamePlayers();
    showActionPanel(phase);
  });
}

function voteAbstain() {
  if (state.phase === 'voting') {
    socket.emit('vote_eliminate', { eliminate: false }, res => {
      if (!res?.error) UI.toast('امتنعت عن التصويت', 'info');
    });
  } else {
    socket.emit('skip_action', {}, res => {
      if (!res?.error) { state.actionDone = true; showActionPanel(state.phase); }
    });
  }
}

function skipAction() {
  socket.emit('skip_action', {}, res => {
    if (res?.error) return;
    state.actionDone = true;
    showActionPanel(state.phase);
  });
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;
  socket.emit('send_message', { text, channel: state.currentChannel }, res => {
    if (res?.error) { UI.toast(res.error, 'error'); return; }
    input.value = '';
  });
}

function switchChat(ch) {
  state.currentChannel = ch;
  document.querySelectorAll('.chat-tab').forEach(t => t.classList.toggle('active', t.dataset.ch === ch));
  const input = document.getElementById('chatInput');
  const myPlayer = state.players.find(p => p.id === state.myId);
  const blocked =
    (ch === 'mafia' && state.phase !== 'night') ||
    (ch === 'dead'  && myPlayer?.alive) ||
    (ch === 'public' && !['lobby','discussion','defense','result'].includes(state.phase) && myPlayer?.alive);
  input.disabled    = blocked;
  input.placeholder = blocked ? '🔒 لا يمكن الكتابة الآن' : 'اكتب رسالة...';
}

function toggleMute() {
  const on = Sound.toggle();
  const btn = document.getElementById('muteBtn');
  if (btn) btn.textContent = on ? '🔊' : '🔇';
  UI.toast(on ? 'الصوت مفعّل 🔊' : 'الصوت مكتوم 🔇', 'info');
}

// ══════════════════════════════════════
//  RENDER
// ══════════════════════════════════════
function renderLobby(room) {
  document.getElementById('lobbyCode').textContent  = room.code;
  document.getElementById('lobbyCount').textContent = `${room.players.length}/${room.maxPlayers}`;
  const grid = document.getElementById('lobbyPlayers');
  grid.innerHTML = '';
  room.players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card' + (p.isHost ? ' is-host' : '');
    card.innerHTML = `
      ${p.isHost ? '<div class="host-badge">هوست</div>' : ''}
      ${p.isBot  ? '<div class="bot-badge">🤖 بوت</div>' : ''}
      ${!p.connected ? '<div class="offline-badge"></div>' : ''}
      <div class="player-avatar">${UI.avatar(p.avatarId)}</div>
      <div class="player-name">${p.name}</div>
      ${state.isHost && !p.isHost && !p.isBot ? `
        <div style="display:flex;gap:4px;margin-top:6px">
          <button onclick="kickPlayer('${p.id}')" style="flex:1;background:rgba(231,76,60,0.2);border:1px solid rgba(231,76,60,0.4);color:#e74c3c;border-radius:6px;padding:3px;font-size:.7rem;cursor:pointer">طرد</button>
          <button onclick="banPlayer('${p.id}')" style="flex:1;background:rgba(100,0,0,0.3);border:1px solid rgba(150,0,0,0.4);color:#ff6666;border-radius:6px;padding:3px;font-size:.7rem;cursor:pointer">حظر</button>
        </div>` : ''}
    `;
    grid.appendChild(card);
  });

  const startBtn = document.getElementById('startBtn');
  const waiting  = document.getElementById('lobbyWaiting');
  const botBtns  = document.getElementById('botControls');

  if (state.isHost) {
    startBtn.style.display  = room.players.length >= 4 ? 'flex' : 'none';
    waiting.style.display   = 'none';
    if (botBtns) botBtns.style.display = 'flex';
  } else {
    startBtn.style.display  = 'none';
    waiting.style.display   = 'block';
    if (botBtns) botBtns.style.display = 'none';
  }
}

function renderGamePlayers() {
  const grid     = document.getElementById('gamePlayers');
  const myPlayer = state.players.find(p => p.id === state.myId);
  const phase    = state.phase;

  let canSelect =
    (phase === 'night'      && myPlayer?.team === 'mafia') ||
    (phase === 'doctor'     && myPlayer?.role === 'doctor') ||
    (phase === 'detective'  && myPlayer?.role === 'detective') ||
    (phase === 'sniper'     && myPlayer?.role === 'sniper') ||
    (phase === 'discussion' && myPlayer?.alive) ||
    (phase === 'voting'     && myPlayer?.alive && !!state.accusedId);

  if (state.actionDone && !['discussion','voting'].includes(phase)) canSelect = false;

  grid.innerHTML = '';
  state.players.forEach(p => {
    let selectable = canSelect && p.alive && p.id !== state.myId;
    if (phase === 'voting'     && state.accusedId && p.id !== state.accusedId) selectable = false;
    if (phase === 'night'      && p.team === 'mafia') selectable = false; // can't kill own mafia
    if (phase === 'detective'  && p.id === state.myId) selectable = false;

    const votes    = state.currentVotes?.[p.id];
    const votedBy  = Object.entries(state.allVotesNamed || {})
      .filter(([, v]) => v.targetId === p.id)
      .map(([, v]) => v.voterName);

    const card = document.createElement('div');
    card.className = [
      'game-player-card',
      !p.alive    ? 'dead'       : '',
      selectable  ? 'selectable' : '',
      state.selectedTarget === p.id ? 'selected' : '',
      p.knownMafia && p.id !== state.myId ? 'known-mafia' : '',
      p.id === state.accusedId ? 'accused' : '',
    ].filter(Boolean).join(' ');

    if (votes) { card.setAttribute('data-votes', votes); card.classList.add('voted-on'); }

    // Role visibility: only show your own role (or mafia sees mafia)
    const showRole = (p.id === state.myId) || p.knownMafia || state.phase === 'result';
    const roleLabel = showRole && p.role
      ? `<div class="gp-role" style="color:${UI.roleColor(p.role)}">${UI.roleName(p.role)}</div>` : '';

    const statusLabel = !p.alive
      ? '<div class="gp-status">💀</div>'
      : !p.connected ? '<div class="gp-status">📡</div>'
      : p.knownMafia  ? '<div class="gp-status" style="color:#e74c3c">🔫</div>' : '';

    const accusedBadge = p.id === state.accusedId
      ? '<div class="accused-badge">🎯 متهم</div>' : '';

    const voteBar = votes
      ? `<div class="vote-bar" title="${votedBy.join(', ')}">
           <span class="vote-count">${votes}🗳️</span>
         </div>` : '';

    const botBadge = p.isBot ? '<div class="bot-badge-sm">🤖</div>' : '';

    card.innerHTML = `
      ${accusedBadge}
      <div class="gp-avatar">${UI.avatar(p.avatarId)}</div>
      <div class="gp-name">${p.name}${botBadge}</div>
      ${statusLabel}
      ${roleLabel}
      ${voteBar}
    `;
    if (selectable) card.onclick = () => selectTarget(p.id);
    grid.appendChild(card);
  });
}

function showActionPanel(phase) {
  const panel    = document.getElementById('actionPanel');
  const titleEl  = document.getElementById('actionTitle');
  const hintEl   = document.getElementById('actionHint');
  const skipBtn  = document.getElementById('skipBtn');
  const myPlayer = state.players.find(p => p.id === state.myId);
  if (!myPlayer?.alive) { panel.style.display = 'none'; return; }

  const map = {
    night:      ['mafia',     '🔫 اختر ضحيتك الليلة',         'اضغط على لاعب لاختياره',   true],
    doctor:     ['doctor',    '💉 من ستحمي الليلة؟',           'اضغط على لاعب لحمايته',     true],
    detective:  ['detective', '🔍 من ستحقق معه؟',              'ستعرف إن كان مافيا أم لا',  true],
    sniper:     ['sniper',    '🎯 رصاصتك الوحيدة',             'تحذير: رصاصة واحدة فقط!',   false],
    discussion: [null,        '💬 صوّت على من تشك فيه',        'اضغط على لاعب للتصويت',    false],
    voting:     [null,        '⚖️ تصويت الطرد النهائي',        '',                           false],
  };

  const entry = map[phase];
  if (!entry) { panel.style.display = 'none'; return; }

  const [role, title, hint, canSkip] = entry;
  const roleMatch = !role || myPlayer.role === role || (role === 'mafia' && myPlayer.team === 'mafia');
  if (!roleMatch) { panel.style.display = 'none'; return; }

  if (state.actionDone && ['night','doctor','detective','sniper'].includes(phase)) {
    titleEl.textContent   = '✅ تم تسجيل اختيارك';
    hintEl.textContent    = 'في انتظار بقية اللاعبين...';
    skipBtn.style.display = 'none';
  } else {
    if (phase === 'voting' && state.accusedId) {
      const accused = state.players.find(p => p.id === state.accusedId);
      titleEl.textContent = `⚖️ هل تطرد ${accused?.name || ''}؟`;
      hintEl.textContent  = 'اضغط عليه للتصويت بالطرد';
      // Show abstain button
      const abstainBtn = document.getElementById('abstainBtn');
      if (abstainBtn) abstainBtn.style.display = 'block';
    } else {
      titleEl.textContent = title;
      hintEl.textContent  = hint;
      const abstainBtn = document.getElementById('abstainBtn');
      if (abstainBtn) abstainBtn.style.display = 'none';
    }
    skipBtn.style.display = canSkip ? 'block' : 'none';
  }

  panel.style.display = 'block';
}

function renderEventLog() {
  const logEl = document.getElementById('eventLog');
  if (!logEl) return;
  logEl.innerHTML = state.eventLog.slice(-30).map(ev => {
    const icons = {
      phase_change: '🔄', kill: '💀', save: '💚', sniper_kill: '🎯',
      eject: '🚨', game_over: '🏆', disconnect: '📡', reconnect: '✅',
      vote: '🗳️', leave: '💀',
    };
    const icon = icons[ev.type] || '📝';
    return `<div class="log-entry log-${ev.type}">${icon} ${ev.text || ev.type} <span class="log-round">ج${ev.round||''}</span></div>`;
  }).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// ══════════════════════════════════════
//  SOCKET EVENTS
// ══════════════════════════════════════

socket.on('room_update', (room) => {
  state.players   = room.players;
  state.phase     = room.phase;
  state.round     = room.round || 1;
  state.accusedId = room.accusedId;
  if (room.hostId === socket.id) state.isHost = true;
  const me = room.players.find(p => p.id === socket.id);
  if (me?.role) { state.myRole = me.role; state.myTeam = me.team; }
  if (room.phase === 'lobby') renderLobby(room);
});

socket.on('game_started', ({ round }) => {
  state.round = round;
  document.getElementById('chatMessages').innerHTML = '';
  UI.addSystemMsg('🎭 اللعبة بدأت! تحقق من دورك...');
  UI.show('screenGame');
  Sound.play('nightStop');
});

socket.on('role_assigned', ({ role, mafiaTeam }) => {
  state.myRole = role.id;
  state.myTeam = role.team;

  document.getElementById('revealEmoji').textContent = role.emoji;
  document.getElementById('revealName').textContent  = role.name;
  document.getElementById('revealDesc').textContent  = role.description;
  document.getElementById('myRoleEmoji').textContent = role.emoji;
  document.getElementById('myRoleName').textContent  = role.name;
  document.getElementById('myRoleCard').style.borderColor = role.color || 'var(--border)';

  const mafiaSection = document.getElementById('revealMafiaTeam');
  if (mafiaTeam.length) {
    mafiaSection.style.display = 'block';
    document.getElementById('revealMafiaList').innerHTML =
      mafiaTeam.map(m => `<span class="mafia-tag">🔫 ${m.name}</span>`).join('');
  } else {
    mafiaSection.style.display = 'none';
  }

  if (role.team === 'mafia') {
    document.querySelector('[data-ch="mafia"]').style.display = 'flex';
  }
  setTimeout(() => UI.openPopup('popupRole'), 500);
});

socket.on('phase_change', ({ phase, name, icon, duration, round, accusedId }) => {
  state.phase          = phase;
  state.round          = round;
  state.timerMax       = duration;
  state.actionDone     = false;
  state.selectedTarget = null;
  state.currentVotes   = {};
  state.allVotesNamed  = {};
  state.accusedId      = accusedId || null;

  document.getElementById('phaseName').textContent  = name;
  document.getElementById('phaseIcon').textContent  = icon;
  document.getElementById('roundBadge').textContent = `الجولة ${round}`;

  renderGamePlayers();
  showActionPanel(phase);
  UI.showPhaseTransition(icon, name, round);

  const myPlayer = state.players.find(p => p.id === state.myId);
  if (myPlayer && !myPlayer.alive) {
    const deadTab = document.querySelector('[data-ch="dead"]');
    if (deadTab) deadTab.style.display = 'flex';
    switchChat('dead');
  }

  if (phase === 'night') {
    Sound.play('night');
    UI.addSystemMsg('🌙 الليل حلّ — المافيا تتحرك في الظلام');
  } else if (phase === 'discussion') {
    Sound.play('nightStop');
    const savedMsg = document.getElementById('doctorSaveAnnounce');
    // Will be set by night_results
    UI.addSystemMsg('☀️ أشرق الصبح. ناقشوا وصوّتوا!');
  } else if (phase === 'voting') {
    UI.addSystemMsg('⚖️ التصويت النهائي على المتهم!');
  } else if (phase === 'defense' && state.accusedId) {
    const acc = state.players.find(p => p.id === state.accusedId);
    UI.addSystemMsg(`🛡️ ${acc?.name} يدافع عن نفسه — 30 ثانية`);
  }

  // Re-enable correct chat channel
  switchChat(state.currentChannel);
});

socket.on('timer_update', ({ timeLeft, max }) => {
  state.timerMax = max || state.timerMax;
  UI.updateTimer(timeLeft, state.timerMax);
  if (timeLeft === 10) Sound.play('urgent');
  if (timeLeft <= 5 && timeLeft > 0) Sound.play('tick');
});

socket.on('night_results', ({ events, round, doctorSaved }) => {
  Sound.play('nightStop');
  const el = document.getElementById('nightEvents');
  el.innerHTML = '';
  events.forEach(ev => {
    const d = document.createElement('div');
    if (ev.type === 'killed') {
      d.className = 'night-event killed';
      d.innerHTML = `<div style="font-size:2.5rem">💀</div>
        <div style="font-weight:700">${ev.name} وجد ميتاً!</div>
        <div style="font-size:.8rem;opacity:.6">${ev.roleData?.emoji} ${ev.roleData?.name}</div>`;
      Sound.play('kill');
      const p = state.players.find(pl => pl.id === ev.id);
      if (p) p.alive = false;
    } else if (ev.type === 'saved') {
      d.className = 'night-event saved';
      d.innerHTML = `<div style="font-size:2.5rem">💚</div>
        <div style="font-weight:700">${ev.name} نجا بأعجوبة!</div>
        <div style="font-size:.8rem;opacity:.6">الطبيب أنقذه 💉</div>`;
      setTimeout(() => Sound.play('saved'), 500);
    } else {
      d.className = 'night-event';
      d.innerHTML = `<div style="font-size:2.5rem">😴</div><div style="font-weight:700">مرت الليلة بسلام</div>`;
    }
    el.appendChild(d);
  });
  UI.openPopup('popupNight');
  renderGamePlayers();

  // If doctor saved, announce during day
  if (doctorSaved) {
    setTimeout(() => {
      UI.addSystemMsg('💚 الطبيب أنقذ أحد الليلة — نجح في مهمته!');
    }, 4200);
  }
});

socket.on('detective_result', ({ name, isMafia }) => {
  const el = document.getElementById('detectiveResult');
  el.className = `detective-result ${isMafia ? 'mafia' : 'town'}`;
  el.innerHTML = isMafia
    ? `<div style="font-size:2rem">🔫</div><p><strong>${name}</strong> من المافيا!</p>`
    : `<div style="font-size:2rem">✅</div><p><strong>${name}</strong> بريء</p>`;
  UI.openPopup('popupDetective');
  Sound.play(isMafia ? 'kill' : 'saved');
});

socket.on('sniper_shot', ({ name, roleData, id }) => {
  UI.addSystemMsg(`🎯 القناص أطلق النار على ${name} (${roleData?.name})`);
  setTimeout(() => Sound.play('sniper'), 300);
  const p = state.players.find(pl => pl.id === id || pl.name === name);
  if (p) p.alive = false;
  renderGamePlayers();
  // Log
  state.eventLog.push({ type: 'sniper_kill', text: `القناص أطلق على ${name}`, round: state.round });
  renderEventLog();
});

socket.on('player_accused', ({ accusedId, accusedName, voteCount }) => {
  state.accusedId = accusedId;
  UI.addSystemMsg(`🎯 ${accusedName} متهم — سيدافع عن نفسه`);
  renderGamePlayers();
});

socket.on('votes_updated', ({ voteCount, allVotes, allVotesNamed, total, needed, accusedId }) => {
  state.currentVotes  = voteCount;
  state.allVotesNamed = allVotesNamed || {};
  if (accusedId) state.accusedId = accusedId;
  renderGamePlayers();

  // Live vote display in action panel
  const lines = Object.values(allVotesNamed || {}).map(v => `${v.voterName}→${v.targetName}`).join(' | ');
  const hintEl = document.getElementById('actionHint');
  if (hintEl && ['discussion','voting'].includes(state.phase)) {
    hintEl.textContent = `${total}/${needed} صوتوا${lines ? ' • ' + lines : ''}`;
  }
  Sound.play('vote');
});

socket.on('vote_results', ({ ejected, voteCount, players }) => {
  state.players = players;
  const el = document.getElementById('voteResult');
  if (ejected) {
    el.innerHTML = `<div style="background:rgba(192,57,43,.1);border:1px solid rgba(192,57,43,.3);border-radius:12px;padding:16px">
      <div style="font-size:3rem">🚨</div>
      <div style="font-weight:700;font-size:1.1rem">${ejected.name} تم طرده!</div>
      <div style="opacity:.6;font-size:.85rem">${ejected.roleData?.emoji} ${ejected.roleData?.name}</div>
    </div>`;
    Sound.play('eject');
    state.eventLog.push({ type: 'eject', text: `${ejected.name} طُرد`, round: state.round });
  } else {
    el.innerHTML = `<p style="color:var(--text-dim)">لم يتوفر أغلبية — لم يُطرد أحد</p>`;
    state.eventLog.push({ type: 'vote', text: 'لم يُطرد أحد', round: state.round });
  }
  UI.openPopup('popupVote');
  renderGamePlayers();
  renderEventLog();
});

socket.on('mafia_kill_selected', ({ targetId, targetName, byName }) => {
  // Only mafia see this
  UI.addSystemMsg(`🔫 ${byName} اختار ${targetName}`);
});

socket.on('game_over', ({ winner, reason, players, xpMap }) => {
  state.players = players;
  state.phase   = 'result';
  Sound.play('nightStop');

  document.getElementById('gameoverIcon').textContent    = winner === 'town' ? '🏙️' : '🔫';
  const winEl = document.getElementById('gameoverWinner');
  winEl.textContent = winner === 'town' ? '🏆 المدينة انتصرت!' : '💀 المافيا انتصرت!';
  winEl.className   = `gameover-winner ${winner}`;
  document.getElementById('gameoverReason').textContent  = reason;

  const fp = document.getElementById('finalPlayers');
  fp.innerHTML = players.map(p => `
    <div class="final-player ${p.team}" style="border-color:${UI.roleColor(p.role)}22">
      ${p.roleData?.emoji} ${p.name}
      <span style="opacity:.6;font-size:.75rem">${p.roleData?.name}</span>
      ${!p.alive ? '💀' : ''}
      ${xpMap?.[p.id] ? `<span style="color:var(--gold);font-size:.75rem">+${xpMap[p.id]}xp</span>` : ''}
    </div>
  `).join('');

  // Add restart button if host
  const restartBtn = document.getElementById('restartGameBtn');
  if (restartBtn) restartBtn.style.display = state.isHost ? 'flex' : 'none';

  UI.openPopup('popupGameOver');

  if (winner === state.myTeam) {
    Sound.play('win');
  } else {
    Sound.play('lose');
  }
  renderGamePlayers();
});

socket.on('event_log_update', ({ event, log }) => {
  state.eventLog = log;
  renderEventLog();
});

socket.on('event_log_catch_up', ({ log }) => {
  state.eventLog = log;
  renderEventLog();
});

socket.on('new_message',      (msg) => UI.addMessage(msg, state.currentChannel));
socket.on('system_message',   ({ text, type }) => { UI.addSystemMsg(text); if (type==='join') Sound.play('join'); });
socket.on('player_disconnected', ({ name }) => { UI.toast(`📡 ${name} انقطع`, 'info'); renderGamePlayers(); });
socket.on('player_reconnected',  ({ name }) => { UI.toast(`✅ ${name} عاد`, 'success'); renderGamePlayers(); });
socket.on('kicked',    ({ reason }) => { UI.toast(reason, 'error'); setTimeout(()=>UI.show('screenLanding'), 2000); });
socket.on('room_closed', ({ reason }) => { UI.toast(reason, 'error'); setTimeout(()=>UI.show('screenLanding'), 2000); });
socket.on('error_msg', ({ text }) => UI.toast(text, 'error'));

socket.on('game_restarted', () => {
  state.phase          = 'lobby';
  state.round          = 0;
  state.myRole         = null;
  state.myTeam         = null;
  state.actionDone     = false;
  state.selectedTarget = null;
  state.currentVotes   = {};
  state.allVotesNamed  = {};
  state.accusedId      = null;
  state.eventLog       = [];

  const mafiaTab = document.querySelector('[data-ch="mafia"]');
  const deadTab  = document.querySelector('[data-ch="dead"]');
  if (mafiaTab) mafiaTab.style.display = 'none';
  if (deadTab)  deadTab.style.display  = 'none';
  switchChat('public');

  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('myRoleEmoji').textContent = '❓';
  document.getElementById('myRoleName').textContent  = '...';
  document.getElementById('myRoleCard').style.borderColor = 'var(--border)';

  const logEl = document.getElementById('eventLog');
  if (logEl) logEl.innerHTML = '';

  UI.show('screenLobby');
  UI.toast('🔄 جولة جديدة!', 'success');
});

socket.on('disconnect', () => UI.toast('📡 انقطع الاتصال...', 'error', 5000));
socket.on('reconnect',  () => {
  state.myId = socket.id;
  UI.toast('✅ تم إعادة الاتصال', 'success');
  if (state.roomCode && state.myName) {
    socket.emit('rejoin_room', { roomCode: state.roomCode, name: state.myName }, res => {
      if (res?.success) {
        state.myId  = socket.id;
        state.phase = res.phase;
        state.round = res.round;
        if (res.phase !== 'lobby') {
          UI.show('screenGame');
          renderGamePlayers();
          showActionPanel(state.phase);
        } else {
          UI.show('screenLobby');
        }
      }
    });
  }
});

// ── Input Listeners ───────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('createName')?.addEventListener('keydown', e => { if(e.key==='Enter') createRoom(); });
  document.getElementById('joinCode')?.addEventListener('keydown',   e => { if(e.key==='Enter') document.getElementById('joinName').focus(); });
  document.getElementById('joinCode')?.addEventListener('input',     e => e.target.value = e.target.value.toUpperCase());
  document.getElementById('joinName')?.addEventListener('keydown',   e => { if(e.key==='Enter') joinRoom(); });
  document.getElementById('chatInput')?.addEventListener('keydown',  e => { if(e.key==='Enter') sendMessage(); });
});
