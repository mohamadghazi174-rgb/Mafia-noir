// ═══════════════════════════════════════
//  MAFIA NOIR V3 — Sound Engine (Full)
// ═══════════════════════════════════════
const Sound = (() => {
  let ctx      = null;
  let bgNode   = null;
  let bgGain   = null;
  let muted    = false;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, type, dur, vol = 0.3) {
    if (muted) return;
    try {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(); o.stop(c.currentTime + dur);
    } catch(e) {}
  }

  // -- Fortnite knock sound (layered thuds) --------------------------
  function fortnitKnock() {
    if (muted) return;
    try {
      const c = getCtx();
      [0, 150, 300].forEach(delay => {
        const o = c.createOscillator();
        const g = c.createGain();
        const now = c.currentTime + delay / 1000;
        o.connect(g); g.connect(c.destination);
        o.type = 'sine'; o.frequency.setValueAtTime(200, now);
        o.frequency.exponentialRampToValueAtTime(60, now + 0.3);
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        o.start(now); o.stop(now + 0.35);
      });
    } catch(e) {}
  }

  // -- Mario death ---------------------------------------------------
  function marioDeath() {
    if (muted) return;
    try {
      const c   = getCtx();
      const seq = [
        [494, 0.00], [392, 0.15], [494, 0.30],
        [523, 0.50], [523, 0.65], [494, 0.80],
        [440, 0.95], [392, 1.15]
      ];
      seq.forEach(([f, t]) => {
        const o = c.createOscillator();
        const g = c.createGain();
        const now = c.currentTime + t;
        o.connect(g); g.connect(c.destination);
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.25, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.13);
      });
    } catch(e) {}
  }

  // -- "Sike that's the wrong number" (doctor save) -----------------
  // Played via Web Speech API
  function speakText(text, rate = 1.1, pitch = 1.2) {
    if (muted) return;
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = rate;
    utt.pitch = pitch;
    utt.lang  = 'en-US';
    window.speechSynthesis.speak(utt);
  }

  // -- Victory jingle (citizens win) --------------------------------
  function citizensWin() {
    if (muted) return;
    try {
      const c = getCtx();
      const notes = [523,659,784,880,1047,880,784,1047];
      notes.forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        const now = c.currentTime + i * 0.15;
        o.connect(g); g.connect(c.destination);
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.35, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.start(now); o.stop(now + 0.2);
      });
    } catch(e) {}
  }

  // -- Dark mafia win ------------------------------------------------
  function mafiaWin() {
    if (muted) return;
    try {
      const c = getCtx();
      // Joker laugh vibes — descending minor
      [392,370,349,330,311,294,277,262].forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        const now = c.currentTime + i * 0.2;
        o.connect(g); g.connect(c.destination);
        o.type = 'sawtooth'; o.frequency.value = f;
        g.gain.setValueAtTime(0.3, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        o.start(now); o.stop(now + 0.26);
      });
    } catch(e) {}
  }

  // -- Creepy background night music --------------------------------
  function startNightBg() {
    if (muted) return;
    stopBg();
    try {
      const c = getCtx();
      bgGain  = c.createGain();
      bgGain.gain.value = 0.08;
      bgGain.connect(c.destination);

      function pulse(freq, interval) {
        const o = c.createOscillator();
        o.type = 'sine'; o.frequency.value = freq;
        o.connect(bgGain);
        o.start();
        bgNode = o;
        // Slowly modulate for creepy effect
        const lfo = c.createOscillator();
        const lfoG = c.createGain();
        lfo.frequency.value = 0.2;
        lfoG.gain.value = 20;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        lfo.start();
      }
      pulse(60, 2000);
    } catch(e) {}
  }

  function stopBg() {
    try { bgNode?.stop(); } catch(e) {}
    bgNode = null;
  }

  const sounds = {
    tick:    () => tone(800, 'square', 0.08, 0.15),
    urgent:  () => tone(600, 'sawtooth', 0.15, 0.2),
    join:    () => tone(660, 'sine', 0.3, 0.2),
    message: () => tone(900, 'sine', 0.1, 0.1),
    vote:    () => { tone(440, 'triangle', 0.15, 0.2); setTimeout(()=>tone(550,'triangle',0.1,0.15),180); },
    // Death = Fortnite knock
    kill:    () => fortnitKnock(),
    // Ejected = mario death
    eject:   () => marioDeath(),
    // Doctor saved = "sike that's the wrong number"
    saved:   () => speakText("Sike, that's the wrong numberrr!", 0.9, 1.3),
    // Sniper kill = announcement
    sniper:  () => speakText("Thank you, bye bye!", 1.0, 0.9),
    // Night ambiance
    night:   () => startNightBg(),
    nightStop: () => stopBg(),
    // Citizens win = "somebody need some milk"
    win:     () => { citizensWin(); setTimeout(()=>speakText("Ohhh, somebody need some milk!", 0.85, 1.1), 2000); },
    // Mafia win = dark dramatic + voice
    lose:    () => { mafiaWin(); setTimeout(()=>speakText("I don't lose. I win.", 0.75, 0.7), 1500); },
  };

  return {
    play: (name) => { try { sounds[name]?.(); } catch(e) {} },
    mute: ()     => { muted = true; stopBg(); },
    unmute: ()   => { muted = false; },
    toggle: ()   => { muted ? Sound.unmute() : Sound.mute(); return !muted; },
    isMuted: ()  => muted,
  };
})();
