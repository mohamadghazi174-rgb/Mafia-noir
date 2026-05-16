// ═══════════════════════════════════════
//  MAFIA NOIR V3 — UI Engine
// ═══════════════════════════════════════
const UI = (() => {

  // ── Screen Navigation ─────────────────────────────────────────────
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) { el.classList.add('active'); el.style.animation = 'fadeIn .35s ease'; }
  }

  // ── Popups ────────────────────────────────────────────────────────
  function openPopup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  function closePopup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }

  // Make closePopup global
  window.closePopup = closePopup;

  // Close popup on overlay click
  document.addEventListener('click', e => {
    if (e.target.classList.contains('popup-overlay')) {
      closePopup(e.target.id);
    }
  });

  // ── Toast Notifications ───────────────────────────────────────────
  function toast(text, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = text;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, duration);
  }

  // ── Phase Transition Overlay ──────────────────────────────────────
  function showPhaseTransition(icon, name, round) {
    let overlay = document.getElementById('phaseTransition');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'phaseTransition';
      overlay.style.cssText = `
        position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        background:rgba(0,0,0,.85);backdrop-filter:blur(8px);
        pointer-events:none;opacity:0;transition:opacity .4s;
      `;
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="font-size:5rem;animation:popIn .5s cubic-bezier(.34,1.56,.64,1)">${icon}</div>
      <div style="font-size:1.8rem;font-weight:900;color:#f0c040;margin-top:12px;letter-spacing:2px">${name}</div>
      <div style="font-size:.9rem;color:rgba(255,255,255,.5);margin-top:6px">الجولة ${round}</div>
    `;
    overlay.style.opacity = '1';
    setTimeout(() => { overlay.style.opacity = '0'; }, 2200);
  }

  // ── Timer ─────────────────────────────────────────────────────────
  function updateTimer(timeLeft, max) {
    const textEl   = document.getElementById('timerText');
    const circleEl = document.getElementById('timerCircle');
    if (!textEl || !circleEl) return;

    textEl.textContent = timeLeft;
    const r          = 18;
    const circumference = 2 * Math.PI * r;
    const ratio      = Math.max(0, timeLeft / (max || 30));
    circleEl.style.strokeDasharray  = circumference;
    circleEl.style.strokeDashoffset = circumference * (1 - ratio);

    // Color: green → yellow → red
    if (ratio > 0.5)      circleEl.style.stroke = '#2ecc71';
    else if (ratio > 0.2) circleEl.style.stroke = '#f39c12';
    else                  circleEl.style.stroke = '#e74c3c';

    if (timeLeft <= 5) textEl.style.color = '#e74c3c';
    else               textEl.style.color = 'var(--text)';
  }

  // ── Chat Messages ─────────────────────────────────────────────────
  function addMessage(msg, currentChannel) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    // Only show messages for current channel
    if (msg.channel !== currentChannel && msg.channel !== undefined) return;

    const el     = document.createElement('div');
    const isMine = msg.senderId === (window.state?.myId || '');
    el.className = `chat-msg ${isMine ? 'mine' : 'other'} ch-${msg.channel || 'public'}`;
    el.innerHTML = `
      <div class="chat-avatar">${avatar(msg.avatarId)}</div>
      <div class="chat-bubble">
        <span class="chat-name">${msg.senderName}${msg.isBot ? ' 🤖' : ''}</span>
        <span class="chat-text">${escHtml(msg.text)}</span>
        <span class="chat-time">${formatTime(msg.ts)}</span>
      </div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    Sound.play('message');
  }

  function addSystemMsg(text) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'chat-system';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  // ── Avatars ───────────────────────────────────────────────────────
  const AVATARS = ['🕵️','🎭','👤','🦹','🤵','👩','🧔','👨','🎩','🎪'];
  function avatar(id) { return AVATARS[id % AVATARS.length] || '👤'; }

  // ── Role Helpers ──────────────────────────────────────────────────
  const ROLE_COLORS = {
    mafia:     '#e74c3c',
    godfather: '#c0392b',
    doctor:    '#2ecc71',
    detective: '#3498db',
    sniper:    '#e67e22',
    mayor:     '#f1c40f',
    citizen:   '#95a5a6',
  };
  const ROLE_NAMES = {
    mafia:     'مافيا',
    godfather: 'العراب',
    doctor:    'طبيب',
    detective: 'محقق',
    sniper:    'قناص',
    mayor:     'عمدة',
    citizen:   'مواطن',
  };
  function roleColor(role) { return ROLE_COLORS[role] || '#aaa'; }
  function roleName(role)  { return ROLE_NAMES[role]  || role; }

  // ── Helpers ───────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  // ── Rain effect ───────────────────────────────────────────────────
  function initRain(count = 40) {
    const container = document.getElementById('rainContainer');
    if (!container) return;
    for (let i = 0; i < count; i++) {
      const drop = document.createElement('div');
      drop.className = 'rain-drop';
      drop.style.cssText = `
        left:${Math.random()*100}%;
        animation-delay:${Math.random()*3}s;
        animation-duration:${0.6 + Math.random()*0.8}s;
        opacity:${0.2 + Math.random()*0.4};
        height:${10 + Math.random()*20}px;
      `;
      container.appendChild(drop);
    }
  }

  // ── Auth Tab Switch ───────────────────────────────────────────────
  window.switchAuthTab = function(tab) {
    ['login','register','guest'].forEach(t => {
      document.getElementById('auth' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.auth-tab').forEach((btn, i) => {
      btn.classList.toggle('active', ['login','register','guest'][i] === tab);
    });
    document.getElementById('authError').textContent = '';
  };

  // ── Init ──────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initRain();

    // Add CSS animation keyframes dynamically
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes popIn    { from{opacity:0;transform:scale(.4)} to{opacity:1;transform:scale(1)} }
      @keyframes slideUp  { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
      @keyframes pulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
      @keyframes rain     { from{transform:translateY(-20px)} to{transform:translateY(100vh)} }
      @keyframes shake    { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
      @keyframes glow     { 0%,100%{box-shadow:0 0 10px rgba(240,192,64,.3)} 50%{box-shadow:0 0 30px rgba(240,192,64,.7)} }
    `;
    document.head.appendChild(style);
  });

  return {
    show, openPopup, closePopup, toast,
    showPhaseTransition, updateTimer,
    addMessage, addSystemMsg,
    avatar, roleColor, roleName,
  };
})();

// Make UI globally accessible
window.UI = UI;
