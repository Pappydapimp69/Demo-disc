// EMBERS - playable demo.
// The ad is an idle tapper: tap the fire, grow the fire. The game is the opposite: the fire is the danger.
// You keep watch by a small campfire. Your eyes take minutes to adjust to the dark, and looking at the fire
// throws that away: a glance costs about two minutes of night sight, a long stare about seventeen. But the
// night is cold, so you must warm your hands sometimes. Things come out of the treeline; you can only drive
// off what you can see. A red torch shows what is close and costs no night sight. (1 s here = 1 night minute.)
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const W = 540, H = 960, HOR = 430, FOV = 1.75;        // horizon y, field of view (rad)
  const GLANCE = 2, STARE = 17, BLEACH_T = 5;           // night-minutes of re-adaptation: a glance, a full stare, and how fast a look grows from one to the other
  const HEAT = 9, HEAT_RAMP = .8;                      // warmth per second once your hands have caught the heat, and how long that takes (a flick of a glance barely warms)

  const LEVELS = [
    { name: 'FIRST NIGHT', tip: "DON'T LOOK AT THE FIRE. YOUR EYES NEED THE DARK. TAP WHAT COMES OUT OF THE TREES.", len: 60, cold: 1.0, spawn: 7, speed: .06, pack: 1, torch: 0 },
    { name: 'COLD SNAP', tip: 'IT IS COLDER. WARM YOUR HANDS, BUT EVERY LOOK AT THE FIRE COSTS YOU YOUR EYES. HANDS TAKE A MOMENT TO CATCH THE HEAT.', len: 70, cold: 1.8, spawn: 6, speed: .07, pack: 1, torch: 0 },
    { name: 'THE PACK', tip: 'THEY COME IN TWOS NOW. LISTEN FOR THE TWIGS AND TURN TOWARD THEM.', len: 75, cold: 1.8, spawn: 6.5, speed: .075, pack: 2, torch: 0 },
    { name: 'RED LIGHT', tip: 'A RED TORCH DOES NOT SPOIL NIGHT SIGHT, BUT IT ONLY REACHES WHAT IS CLOSE.', len: 80, cold: 2.0, spawn: 6, speed: .08, pack: 2, torch: 25 },
    { name: 'THE LONGEST NIGHT', tip: 'EVERYTHING AT ONCE. UNTIL DAWN.', len: 100, cold: 2.2, spawn: 5.5, speed: .085, pack: 2, torch: 20 },
  ];
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // the cost of a look that has lasted e seconds: a glance costs GLANCE, it saturates at STARE
  const lookCost = e => STARE - (STARE - GLANCE) * Math.exp(-Math.max(0, e - .4) / BLEACH_T);
  // night sight from the re-adaptation still owed: dark-adapted at 0, nearly blind at a full stare
  const sight = debt => 1 - Math.sqrt(clamp(debt / STARE));
  // how fast your hands warm after e seconds at the fire: they take a moment to catch the heat
  const heatRate = e => HEAT * (1 - Math.exp(-e / HEAT_RAMP));
  // what you can make out at closeness d (0 = treeline, 1 = at the fire): far needs good night sight
  const canSee = (v, d) => v > .95 - .9 * d;

  const S = { li: 0, L: null, state: 'intro', t: 0, lt: 0, lockUntil: 0, look: 0, warming: false, expo: 0, debt: 0, warmth: 100, lives: 3, night: 0,
    beasts: [], rng: null, torch: false, battery: 0, nextSpawn: 0, flash: [], hurt: 0, ap: null, looks: 0, warmTime: 0 };
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, state: 'intro', lt: 0, look: 0, warming: false, expo: 0, debt: 0, warmth: 100, lives: 3, night: 0, beasts: [], rng: mkRng(300 + i * 31),
      torch: false, battery: L.torch, nextSpawn: 3, flash: [], hurt: 0, ap: null, looks: 0, warmTime: 0, why: null, endT: 0, shivered: false });
    pause();
  }
  function pause() { S.lockUntil = S.t + .6; S.warming = false; }
  const paused = () => S.t < S.lockUntil;
  const V = () => sight(S.debt);
  function start() { S.state = 'play'; pause(); }

  // ---------- the fire and your eyes ----------
  function setWarming(on) {
    if (S.state !== 'play') return;
    if (on && !S.warming) { S.expo = 0; S.looks++; Snd.fire(true); }
    if (!on && S.warming) Snd.fire(false);
    S.warming = on;
  }
  function eyes(dt) {
    if (S.warming) {
      S.expo += dt; S.warmTime += dt;
      S.debt = Math.max(S.debt, lookCost(S.expo));            // bleaching saturates: a new look doesn't stack on the old debt
      S.warmth = Math.min(100, S.warmth + heatRate(S.expo) * dt);
    } else S.debt = Math.max(0, S.debt - dt);                 // one night-minute of recovery per second
    S.warmth -= S.L.cold * dt;
    if (S.warmth < 25 && !S.shivered) { S.shivered = true; Snd.shiver(); } else if (S.warmth > 40) S.shivered = false;
  }

  // ---------- what comes out of the trees ----------
  function spawn() {
    const n = S.L.pack, base = S.rng() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = wrap(base + (k ? (S.rng() < .5 ? -1 : 1) * (1.4 + S.rng()) : 0));
      S.beasts.push({ a, d: 0, v: S.L.speed * (.8 + S.rng() * .4), flee: 0, snapT: 0, id: Math.floor(S.rng() * 1e6) });
      Snd.snap(wrap(a - S.look), 0);
    }
  }
  function beasts(dt) {
    S.nextSpawn -= dt; if (S.nextSpawn <= 0) { spawn(); S.nextSpawn = S.L.spawn * (.8 + S.rng() * .4); }
    for (const b of S.beasts) {
      if (b.flee) { b.d -= dt * .5; continue; }
      b.d += b.v * dt;
      b.snapT -= dt; if (b.snapT <= 0) { Snd.snap(wrap(b.a - S.look), b.d); b.snapT = 2.5 - b.d * 1.6; }
      if (b.d >= 1) { b.gone = true; S.lives--; S.hurt = 1; Snd.lunge(); }
    }
    S.beasts = S.beasts.filter(b => !b.gone && b.d > -.05);
  }
  // can you see this one right now? (in view, your eyes or the torch reach it)
  function visible(b) {
    if (S.warming || b.flee) return false;
    const rel = wrap(b.a - S.look); if (Math.abs(rel) > FOV / 2) return false;
    return canSee(V(), b.d) || (S.torch && b.d > .55 && Math.abs(rel) < .5);
  }
  function shoo(b) { b.flee = 1; Snd.shout(); S.flash.push({ t: S.t, a: b.a, d: b.d }); }

  function update(dt) {
    S.t += dt; S.lt += dt; S.hurt = Math.max(0, S.hurt - dt * 1.5);
    Snd.ambience(S.state === 'play');
    if (S.state === 'intro') { if (API.autopilot && !paused()) start(); return; }
    if (S.state !== 'play') { S.endT = (S.endT || 0) + dt; return; }
    if (API.autopilot) autopilot(dt);
    if (S.torch) { S.battery -= dt; if (S.battery <= 0) { S.battery = 0; S.torch = false; } }
    S.look = wrap(S.look + (S.turn || 0) * 2.2 * dt);
    eyes(dt); beasts(dt);
    S.night += dt;
    if (S.lives <= 0 || S.warmth <= 0) { S.state = 'lost'; S.why = S.warmth <= 0 ? 'THE COLD GOT YOU' : 'THE DARK GOT YOU'; S.endT = 0; setWarming(false); Audio.sfx('fail'); pause(); }
    else if (S.night >= S.L.len) { S.state = 'dawn'; S.endT = 0; setWarming(false); Snd.dawn(); pause(); }
  }

  // ---------- test autopilot ----------
  // It turns toward twig snaps, shoos anything it can see, and warms its hands in one of two styles:
  // 'glance': many short looks (0.5 s) below 60 warmth; 'medium': 2.5 s looks below 50, never with something close;
  // 'stare': one long look from 35 up to 95.
  function autopilot(dt) {
    const A = S.ap || (S.ap = { target: null, lookT: 0 });
    const pol = API.autopilot;
    if (pol === 'glance' || pol === 'medium') {
      const len = pol === 'glance' ? .5 : 2.5, below = pol === 'glance' ? 60 : 50;
      if (S.warming) { A.lookT += dt; if (A.lookT > len) { setWarming(false); A.cool = 1.2; } }
      else { A.cool = (A.cool || 0) - dt; if (S.warmth < below && A.cool <= 0 && !S.beasts.some(b => !b.flee && b.d > .6)) { A.lookT = 0; setWarming(true); } }
    } else {
      if (S.warming) { if (S.warmth > 95) setWarming(false); }
      else if (S.warmth < 35) setWarming(true);
    }
    if (S.warming) { S.turn = 0; return; }
    for (const b of S.beasts) { if (visible(b)) { b.seen = (b.seen || 0) + dt; if (b.seen > .5) shoo(b); } else b.seen = 0; }
    // turn toward the nearest thing it has heard (the snaps tell it where)
    const heard = S.beasts.filter(b => !b.flee).sort((x, y) => y.d - x.d)[0];
    if (heard) { const rel = wrap(heard.a - S.look); S.turn = Math.abs(rel) < .1 ? 0 : clamp(rel * 3, -1, 1); }
    else S.turn = 0;
    if (S.L.torch && heard && heard.d > .55 && !canSee(V(), heard.d) && S.battery > 0) S.torch = true; else S.torch = false;
  }

  // ---------- sound ----------
  const Snd = {
    ctx() { return Audio.ctx && !Audio.muted ? Audio.ctx : null; },
    nb: null,
    noise(c) { if (!this.nb) { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = ((((i * 1103515245 + 12345) >>> 8) % 2000) / 1000 - 1); this.nb = b; } return this.nb; },
    burst(f, q, dur, gain, pan = 0, at = 0) {
      const c = this.ctx(); if (!c) return; try {
        const t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
        s.buffer = this.noise(c); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        s.connect(fl).connect(g); if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p).connect(c.destination); } else g.connect(c.destination); s.start(t, S.rng()); s.stop(t + dur + .05);
      } catch (_) {}
    },
    snap(rel, d) { const back = Math.abs(rel) > Math.PI / 2; this.burst(back ? 1400 : 2600, 3, .06, .12 + d * .3, Math.sin(rel)); this.burst(back ? 900 : 1800, 4, .05, .08 + d * .2, Math.sin(rel), .07); },
    shout() { Audio.tone(220, .25, 'sawtooth', .12, 160); this.burst(800, 1, .2, .2); },
    lunge() { Audio.tone(110, .5, 'sawtooth', .2, 60); this.burst(400, .8, .5, .4); },
    fire(on) { const c = this.ctx(); if (!c) return; if (!this.fg) { const s = c.createBufferSource(); s.buffer = this.noise(c); s.loop = true; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; this.fg = c.createGain(); this.fg.gain.value = .02; s.connect(f).connect(this.fg).connect(c.destination); s.start(); } this.fg.gain.setTargetAtTime(on ? .12 : .03, c.currentTime, .1); },
    ambience(on) { const c = this.ctx(); if (!c) return; this.fire(S.warming); if (!this.cr) { this.cr = c.createGain(); this.cr.gain.value = 0; const o = c.createOscillator(); o.frequency.value = 4400; const l = c.createOscillator(); l.frequency.value = 22; const lg = c.createGain(); lg.gain.value = 1; l.connect(lg.gain); o.connect(lg).connect(this.cr).connect(c.destination); o.start(); l.start(); } this.cr.gain.setTargetAtTime(on ? .006 : 0, c.currentTime, .5); },
    shiver() { for (let i = 0; i < 4; i++) this.burst(300 + i * 40, 2, .09, .1, (i % 2 ? .3 : -.3), i * .11); },
    dawn() { [60, 64, 67, 72, 76].forEach((m, i) => Audio.tone(440 * 2 ** ((m - 69) / 12), .8, 'sine', .12, null, i * .15)); },
  };

  // ---------- drawing ----------
  let ctx;
  const TREES = (() => { const r = mkRng(77), out = []; for (let i = 0; i < 90; i++) out.push({ a: r() * Math.PI * 2, h: 60 + r() * 120, w: 26 + r() * 30 }); return out; })();
  const STARS = (() => { const r = mkRng(5), out = []; for (let i = 0; i < 160; i++) out.push({ a: r() * Math.PI * 2, y: 40 + r() * 330, b: r() }); return out; })();
  const sx = a => W / 2 + wrap(a - S.look) / (FOV / 2) * (W / 2);
  function panorama() {
    const v = S.warming ? 0 : V();
    const sky = ctx.createLinearGradient(0, 0, 0, HOR); sky.addColorStop(0, '#02030a'); sky.addColorStop(1, `rgb(${10 + v * 18},${12 + v * 22},${30 + v * 30})`);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HOR);
    for (const s of STARS) { const x = sx(s.a); if (x < -5 || x > W + 5) continue; ctx.globalAlpha = (.1 + .9 * v) * (.3 + .7 * s.b); ctx.fillStyle = '#fff'; ctx.fillRect(x, s.y, 2, 2); }
    ctx.globalAlpha = 1;
    // the treeline: you can make it out once your eyes have adjusted
    const tl = Math.round(4 + v * 22);
    ctx.fillStyle = `rgb(${tl},${tl + 4},${tl + 6})`;
    for (const tr of TREES) { const x = sx(tr.a); if (x < -60 || x > W + 60) continue; ctx.beginPath(); ctx.moveTo(x - tr.w, HOR + 4); ctx.lineTo(x, HOR - tr.h); ctx.lineTo(x + tr.w, HOR + 4); ctx.fill(); }
    // the ground, lit warm near you by the fire
    const gr = ctx.createLinearGradient(0, HOR, 0, H); gr.addColorStop(0, `rgb(${6 + v * 10},${8 + v * 12},${10 + v * 12})`); gr.addColorStop(1, '#3a1a08'); ctx.fillStyle = gr; ctx.fillRect(0, HOR, W, H - HOR);
    // red torch beam
    if (S.torch) { const g = ctx.createRadialGradient(W / 2, H, 40, W / 2, H, 520); g.addColorStop(0, 'rgba(255,40,40,.35)'); g.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(W / 2 - 260, HOR + 130); ctx.lineTo(W / 2 + 260, HOR + 130); ctx.fill(); }
    // things in the dark, far ones up at the treeline, close ones big and low
    for (const b of S.beasts.slice().sort((x, y) => x.d - y.d)) {
      const x = sx(b.a); if (x < -80 || x > W + 80) continue;
      const y = HOR + 10 + b.d * b.d * 330, s = .35 + b.d * 1.6, see = visible(b), torchOnly = see && !canSee(v, b.d);
      if (b.flee) { ctx.globalAlpha = clamp(b.d * 2); beast(x, y, s, '#000', false, true); ctx.globalAlpha = 1; continue; }
      if (!see) continue;
      beast(x, y, s, torchOnly ? '#5a0a0a' : `rgb(${20 + v * 30},${20 + v * 30},${30 + v * 30})`, torchOnly, false);
    }
    // the fire's glow at the bottom of the view
    const fg = ctx.createRadialGradient(W / 2, H + 80, 20, W / 2, H + 80, 300); fg.addColorStop(0, 'rgba(255,140,40,.55)'); fg.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = fg; ctx.fillRect(0, H - 320, W, 320);
    // snaps you heard off-screen: a mark at the edge
    for (const b of S.beasts) { if (b.flee) continue; const rel = wrap(b.a - S.look); if (Math.abs(rel) < FOV / 2) continue; const k = clamp(1 - (2.5 - b.d * 1.6 - b.snapT) / 1.2); if (k <= 0) continue; ctx.globalAlpha = k * (.4 + b.d * .6); ctx.fillStyle = '#ffd8a0'; Draw.bigText(ctx, rel < 0 ? '◀ snap' : 'snap ▶', rel < 0 ? 60 : W - 60, HOR + 60 + (b.id % 5) * 24, 16, '#ffd8a0'); ctx.globalAlpha = 1; }
  }
  function beast(x, y, s, col, red, fleeing) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -20, 46, 34, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-34, -44); ctx.lineTo(-24, -82); ctx.lineTo(-8, -50); ctx.fill(); ctx.beginPath(); ctx.moveTo(34, -44); ctx.lineTo(24, -82); ctx.lineTo(8, -50); ctx.fill();
    if (!fleeing) { ctx.fillStyle = red ? '#ff6a6a' : '#ffe14a'; ctx.beginPath(); ctx.ellipse(-16, -26, 9, 5, .2, 0, 7); ctx.ellipse(16, -26, 9, 5, -.2, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // looking down into the fire: bright, warm, and it's costing your eyes
  function fireView() {
    const g = ctx.createRadialGradient(W / 2, 560, 30, W / 2, 560, 600); g.addColorStop(0, '#fff6c0'); g.addColorStop(.25, '#ffb040'); g.addColorStop(.6, '#a03a0a'); g.addColorStop(1, '#1a0a04');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) { const x = 140 + i * 45, h = 180 + Math.sin(S.t * 9 + i * 1.7) * 50; ctx.fillStyle = i % 2 ? '#ff6a1a' : '#ffd23a'; ctx.beginPath(); ctx.moveTo(x - 30, 700); ctx.quadraticCurveTo(x, 700 - h * 1.3, x + 30, 700); ctx.fill(); }
    ctx.fillStyle = '#5a2a0a'; ctx.save(); ctx.translate(W / 2, 720); ctx.rotate(.25); Draw.rr(ctx, -200, -20, 400, 40, 20); ctx.fill(); ctx.rotate(-.5); Draw.rr(ctx, -200, -20, 400, 40, 20); ctx.fill(); ctx.restore();
    Draw.bigText(ctx, `NIGHT SIGHT GONE: ${Math.round(S.debt)} MIN`, W / 2, 200, 26, '#fff', '#5a1a00');
    Draw.bigText(ctx, S.expo < HEAT_RAMP ? 'HANDS CATCHING THE HEAT…' : 'HANDS WARMING', W / 2, 240, 18, '#ffe8c0', '#5a1a00');
  }
  const WARM = { x: 30, y: H - 150, w: 200, h: 110 }, TORCH = { x: W - 230, y: H - 150, w: 200, h: 110 };
  function hud() {
    Draw.bigText(ctx, `${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 70, 24, '#ffd8a0', '#000');
    const bar = (y, label, k, col) => { ctx.fillStyle = '#0008'; Draw.rr(ctx, 130, y, 280, 16, 8); ctx.fill(); ctx.fillStyle = col; Draw.rr(ctx, 130, y, 280 * clamp(k), 16, 8); ctx.fill(); ctx.font = '800 13px system-ui'; ctx.fillStyle = '#ffd8a0'; ctx.textAlign = 'right'; ctx.fillText(label, 122, y + 13); };
    bar(96, 'WARMTH', S.warmth / 100, S.warmth < 25 ? (Math.sin(S.t * 8) > 0 ? '#ff4a4a' : '#ff9a3a') : '#ff9a3a');
    bar(120, 'NIGHT SIGHT', V(), '#9ab8ff');
    bar(144, 'DAWN', S.night / S.L.len, '#ffe14a');
    ctx.font = '800 22px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#ff6a6a'; ctx.fillText('♥'.repeat(Math.max(0, S.lives)), 424, 160);
    const btn = (b, label, sub, on, col) => { ctx.fillStyle = on ? col : '#1a1a22cc'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 24); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); Draw.bigText(ctx, label, b.x + b.w / 2, b.y + 44, 24, '#fff', '#000'); ctx.font = '700 13px system-ui'; ctx.fillStyle = '#ffd8a0'; ctx.textAlign = 'center'; ctx.fillText(sub, b.x + b.w / 2, b.y + 80); };
    btn(WARM, 'WARM HANDS', 'HOLD · LOOKS AT THE FIRE', S.warming, '#ff7a2a');
    if (S.L.torch) btn(TORCH, 'RED TORCH', `${Math.ceil(S.battery)} S LEFT`, S.torch, '#c02a2a');
    if (S.lt < 6 && S.state === 'play' && !S.looks) { ctx.font = '800 16px system-ui'; ctx.fillStyle = '#ffd8a0'; ctx.textAlign = 'center'; ctx.fillText('DRAG TO LOOK AROUND · TAP WHAT YOU SEE', W / 2, H - 175); }
    // the cold creeping in at the edges, and a nudge before it's too late
    if (S.state === 'play' && S.warmth < 30 && !S.warming) {
      const k = clamp((30 - S.warmth) / 30), fv = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
      fv.addColorStop(0, 'rgba(160,200,255,0)'); fv.addColorStop(1, `rgba(170,210,255,${.15 + k * .4})`); ctx.fillStyle = fv; ctx.fillRect(0, 0, W, H);
      if (S.warmth < 20) { ctx.globalAlpha = .6 + .4 * Math.sin(S.t * 6); Draw.bigText(ctx, 'YOUR HANDS ARE GOING NUMB', W / 2, H - 205, 18, '#cfe4ff', '#000'); ctx.globalAlpha = 1; }
    }
    if (S.hurt > 0) { ctx.fillStyle = `rgba(160,0,0,${S.hurt * .5})`; ctx.fillRect(0, 0, W, H); }
  }
  function wrapText(s, x, y, maxW, lh, font, col) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y;
    for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
    ctx.fillText(line, x, yy);
  }
  function card(title, col, lines, prompt) {
    ctx.fillStyle = '#05030aee'; ctx.fillRect(0, 0, W, H);
    Draw.bigText(ctx, title, W / 2, 260, 52, col);
    lines.forEach((l, i) => wrapText(l, W / 2, 350 + i * 90, 440, 30, '700 21px system-ui', '#e8d8c0'));
    if (!paused()) { ctx.globalAlpha = .6 + .4 * Math.sin(S.t * 4); Draw.bigText(ctx, prompt, W / 2, 760, 30, '#fff'); ctx.globalAlpha = 1; }
  }
  function render(c) {
    ctx = c;
    if (S.state === 'done') { card('DAWN', '#ffe14a', ['FIVE NIGHTS. YOU KEPT YOUR EYES AND YOUR FINGERS.', 'DEMO COMPLETE'], 'TAP FOR THE DISC MENU'); return; }
    if (S.warming && S.state === 'play') fireView(); else panorama();
    for (const f of S.flash) { const k = (S.t - f.t) / .5; if (k > 0 && k < 1) { ctx.globalAlpha = 1 - k; Draw.bigText(ctx, 'HEY!', sx(f.a), HOR + 40 + f.d * 200, 40, '#fff'); ctx.globalAlpha = 1; } }
    hud();
    if (S.state === 'intro') card(`NIGHT ${S.li + 1}`, '#ff9a3a', [S.L.name, S.L.tip], 'TAP TO START');
    if (S.state === 'lost') card(S.why, '#ff6a6a', ['THE NIGHT WINS THIS ONE.'], 'TAP TO TRY AGAIN');
    if (S.state === 'dawn') {
      const looks = S.looks, stars = S.lives === 3 ? 3 : S.lives === 2 ? 2 : 1;
      card('DAWN', '#ffe14a', [`YOU MADE IT. ${S.looks} LOOKS AT THE FIRE, ${Math.round(S.warmTime)} S OF WARMTH.`], S.li < LEVELS.length - 1 ? 'TAP FOR THE NEXT NIGHT' : 'TAP TO FINISH');
      for (let i = 0; i < 3; i++) { const kk = back(clamp((S.endT - .3 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 80, 560); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 30, i < stars ? '#ffd23a' : '#3a3040'); ctx.restore(); } }
    }
  }

  // ---------- input: drag to look around, tap a thing to shoo it, hold WARM HANDS to look at the fire ----------
  const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  let drag = null;
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; pause(); } }
  function tapAt(x, y) {
    let best = null, bd = 90;
    for (const b of S.beasts) { if (!visible(b)) continue; const bx = sx(b.a), by = HOR + 10 + b.d * b.d * 330 - 20 * (.35 + b.d * 1.6), d = Math.hypot(bx - x, by - y); if (d < bd) { bd = d; best = b; } }
    if (best) shoo(best);
  }
  function onPointer(type, x, y) {
    if (type === 'down' && paused()) return;
    if (type === 'down') {
      if (S.state === 'done') { Engine.exit(); return; }
      if (S.state === 'intro') { start(); return; }
      if (S.state === 'lost') { load(S.li); return; }
      if (S.state === 'dawn') { if (S.endT > 1) next(); return; }
      if (hit(WARM, x, y)) { setWarming(true); drag = { warm: true }; return; }
      if (S.L.torch && hit(TORCH, x, y)) { if (S.battery > 0) S.torch = !S.torch; return; }
      drag = { x0: x, look0: S.look, moved: false, x, y };
    } else if (type === 'move' && drag && !drag.warm) { if (Math.abs(x - drag.x0) > 12) drag.moved = true; S.look = wrap(drag.look0 - (x - drag.x0) / W * FOV); }
    else if (type === 'up' || type === 'cancel') { if (drag && drag.warm) setWarming(false); else if (drag && !drag.moved && S.state === 'play') tapAt(drag.x, drag.y); drag = null; }
  }
  const keys = {};
  function onKey(key, down) {
    keys[key] = down;
    if (down && paused()) return;
    if (down && (key === 'Enter' || key === ' ')) {
      if (S.state === 'done') { Engine.exit(); return; } if (S.state === 'intro') { start(); return; } if (S.state === 'lost') { load(S.li); return; } if (S.state === 'dawn') { if (S.endT > 1) next(); return; }
      // shoo whatever is nearest the middle of your view
      const b = S.beasts.filter(visible).sort((p, q) => Math.abs(wrap(p.a - S.look)) - Math.abs(wrap(q.a - S.look)))[0]; if (b) shoo(b); return;
    }
    if (S.state !== 'play' || API.autopilot) return;
    if (key === 'ArrowDown' || key === 's' || key === 'S') setWarming(down);
    if (down && (key === 't' || key === 'T') && S.L.torch && S.battery > 0) S.torch = !S.torch;
    S.turn = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0);
  }

  const API = { LEVELS, S, load, start, lookCost, sight, heatRate, canSee, setWarming, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  Audio.unlock();
  window.__game = API;
})();
