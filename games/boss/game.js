// THE BOSS'S BAD DAY - playable demo.
// You are the dragon. Your daughter loves the knight, so you have to lose to him.
// Let him hit you, but keep it convincing: near-miss fireballs and roars keep her DRAMA up.
// Hit the knight and you've won (badly). Let the drama die and she's bored. Drag your own HP bar and she knows.
(function () {
  'use strict';
  const { createGame, Audio, Draw } = Engine;
  const W = 720, H = 1280, FLOOR = 1000, SC = 1.15;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const easeOut = x => 1 - (1 - x) * (1 - x), easeIn = x => x * x;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  const M = (x, y) => ({ x: 25 + 360 + (x - 360) * SC, y: FLOOR + (y - FLOOR) * SC });          // world -> screen
  const Mi = (x, y) => ({ x: 360 + (x - 25 - 360) / SC, y: FLOOR + (y - FLOOR) / SC });         // screen -> world
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let cx = null;
  function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, Math.max(0, r)); }
  function circ(x, y, r) { cx.beginPath(); cx.arc(x, y, Math.max(0, r), 0, 7); cx.fill(); }

  const LEVELS = [
    { name: 'SIR CLANKS-A-LOT', hp: 5, hit: .6, decay: 4.5, seed: 3, ending: 'HE FAINTED.' },
    { name: 'SIR CLANKS-A-LOT (AGAIN)', hp: 7, hit: .5, decay: 4.5, seed: 8, ending: 'HE FAINTED AGAIN.' },
    { name: 'SIR CLANKS-A-LOT (WITH SMELLING SALTS)', hp: 9, hit: .4, decay: 5, seed: 13, ending: 'HE BROUGHT SMELLING SALTS. HE FAINTED.' },
  ];
  const HEAD_UP = { x: 430, y: 560 }, HEAD_DOWN = { x: 300, y: 880 };
  const BTN = [{ id: 'fire', label: '🔥 FIRE', x: 140, col: '#e8642a' }, { id: 'lower', label: '⬇ LOWER', x: 360, col: '#8a6a3a' }, { id: 'roar', label: '🐉 ROAR', x: 580, col: '#3a8a5a' }];
  const BTN_Y = 1150;

  const S = {};
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, rng: mkRng(L.seed), state: 'play', t: 0, hp: L.hp, hearts: 3, drama: 70, headDown: false, headK: 0, armed: false,
      kx: 120, kmode: 'wander', ktarget: 180, kswing: 0, kswingT: 0, kflee: 0, kdazed: 0, fireballs: [], pops: [], agony: 0, roarCd: 0, roarT: 0, endT: 0, reason: '', cheatT: 0, hint: 0, lrng: mkRng(L.seed * 7 + 99), said: '', saidAt: -9, saidKind: '', lowT: 0, boredSaid: false });
    say('start');
    API.autopilot = null;
  }
  function pop(text, x, y, col = '#fff', size = 46) { S.pops.push({ text, x, y, col, size, t: S.t }); }
  function fail(reason) { if (S.state !== 'play') return; S.state = 'fail'; S.reason = reason; S.endT = 0; Audio.sfx('fail'); }

  // ---------- what she says (her own seeded stream, so the fight's rolls don't change) ----------
  const LINES = {
    start: ['Daddy, you PROMISED.', 'Be nice to him, Dad.', "He's so brave. Don't you dare."],
    close: ['EEEK! So close!', 'My hero dodged it!', 'Dad, that almost looked real!', "He's so nimble!"],
    ouch: ['YES! Get him, Clanksy!', 'MY KNIGHT!!', 'He hit a DRAGON!', '*swoon*'],
    roar: ['Ooh, scary Daddy!', "He's not even scared!", 'Roar back, Clanksy!'],
    miss: ['Almost, sweetie!', 'Aim for the big head!', "He'll get it next time."],
    oops: ['DAD!!!', 'You hit him?! On PURPOSE?!', "I'm telling Mom."],
    bored: ['...is it over yet?', 'Dad, this is boring.', 'Can he just win already?'],
    napping: ["Dad, you're lying down.", 'Is Daddy... napping?', 'That looks fake, Dad.'],
    cheat: ['DAD. I SAW THAT.', 'Did you just... move your own health?'],
    win: ['MY HERO!!', "We're getting MARRIED!", 'Daddy, you were SO scary.'],
  };
  // priority beats the cooldown: an accident or a cheat always gets a reaction
  const URGENT = { oops: 1, cheat: 1, win: 1, start: 1 };
  function say(kind) {
    if (!URGENT[kind] && S.t - S.saidAt < 1.8) return;
    const pool = LINES[kind]; let line = pool[Math.floor(S.lrng() * pool.length)];
    if (line === S.said && pool.length > 1) line = pool[(pool.indexOf(line) + 1) % pool.length];
    S.said = line; S.saidAt = S.t; S.saidKind = kind;
  }

  // ---------- actions ----------
  function press(id) {
    if (S.state !== 'play') return;
    if (id === 'fire') { S.armed = !S.armed; Audio.sfx('select'); }
    else if (id === 'lower') { S.headDown = !S.headDown; S.armed = false; Audio.tone(S.headDown ? 500 : 300, .25, 'sine', .08, S.headDown ? 200 : 700); }
    else if (id === 'roar' && S.roarCd <= 0) {
      S.roarCd = 2.5; S.roarT = 1; S.drama = Math.min(100, S.drama + 14); S.kflee = 1.0; say('roar');
      Audio.noise(.6, .2); Audio.tone(90, .6, 'sawtooth', .12, 60); pop('ROAR!', M(HEAD_UP.x, 380).x, 330, '#ffd23a', 56);
    }
  }
  function fireAt(wx) {
    if (S.state !== 'play') return;
    S.armed = false;
    const h = headPos();
    S.fireballs.push({ x0: h.x - 120, y0: h.y + 20, x: clamp(wx, 20, 340), t0: S.t });
    Audio.tone(200, .4, 'sawtooth', .07, 600);
  }
  function explode(fb) {
    const d = Math.abs(fb.x - S.kx);
    Audio.noise(.35, .2); Audio.tone(70, .3, 'sine', .2);
    if (d < 45) {
      S.hearts--; S.kdazed = 1.2; S.kflee = 0; S.drama = Math.max(0, S.drama - 10);
      pop('OOPS', M(S.kx, 760).x, M(S.kx, 760).y, '#ff6a6a', 56);
      say('oops'); if (S.hearts <= 0) fail('YOU WON. SHE WILL NEVER FORGIVE YOU.');
    } else if (d < 140) {
      S.drama = Math.min(100, S.drama + 30); S.kflee = .7;
      pop('CLOSE CALL!', M(fb.x, 760).x, M(fb.x, 760).y, '#ffd23a', 48); say('close');
    } else { S.drama = Math.min(100, S.drama + 4); pop('miss...', M(fb.x, 800).x, M(fb.x, 800).y, '#c8b8ff', 34); }
  }
  function headPos() { return { x: mix(HEAD_UP.x, HEAD_DOWN.x, ease(S.headK)), y: mix(HEAD_UP.y, HEAD_DOWN.y, ease(S.headK)) }; }

  // ---------- simulation ----------
  function update(dt) {
    S.t += dt;
    if (S.state === 'done') return;
    if (S.state !== 'play') { S.endT += dt; return; }
    const L = S.L;
    S.headK = clamp(S.headK + (S.headDown ? 1 : -1) * dt * 2.2);
    S.roarCd = Math.max(0, S.roarCd - dt); S.roarT = Math.max(0, S.roarT - dt); S.agony = Math.max(0, S.agony - dt); S.kdazed = Math.max(0, S.kdazed - dt); S.cheatT = Math.max(0, S.cheatT - dt);
    // drama fades, faster when the fight looks too easy (head down on the floor)
    S.drama -= dt * (L.decay + (S.headK > .9 ? 2.5 : 0));
    if (S.drama <= 0) { S.drama = 0; fail('SHE GOT BORED.'); return; }
    if (S.drama < 25 && !S.boredSaid) { S.boredSaid = true; say('bored'); } else if (S.drama > 40) S.boredSaid = false;
    S.lowT = S.headK > .9 ? S.lowT + dt : 0; if (S.lowT > 3) { say('napping'); S.lowT = -4; }
    // fireballs
    for (const fb of S.fireballs) if (!fb.done && S.t - fb.t0 >= .5) { fb.done = true; explode(fb); }
    S.fireballs = S.fireballs.filter(fb => S.t - fb.t0 < 1.0);
    if (S.state !== 'play') return;
    // the knight
    const auto = API.autopilot; if (auto) autopilot(auto);
    if (S.kdazed > 0) { S.kswing = 0; }
    else if (S.kflee > 0) { S.kflee -= dt; S.kx = Math.max(40, S.kx - 260 * dt); S.kswing = 0; }
    else {
      const reach = S.headK > .85;
      const goal = reach ? HEAD_DOWN.x - 85 : S.ktarget;
      if (Math.abs(S.kx - goal) > 6) { S.kx += Math.sign(goal - S.kx) * 180 * dt; S.kswingT = Math.min(S.kswingT, .6); }
      else {
        if (!reach && S.rng() < dt * .6) S.ktarget = 60 + S.rng() * 180;
        S.kswingT -= dt;
        if (S.kswingT <= 0) { S.kswingT = 1.0; S.kswing = .5; S.hitRoll = S.rng(); }
      }
      if (S.kswing > 0) {
        const before = S.kswing; S.kswing = Math.max(0, S.kswing - dt);
        if (before > .2 && S.kswing <= .2) { // the blade comes down now
          if (reach && S.hitRoll < L.hit) {
            S.hp--; S.agony = 1.1; S.drama = Math.min(100, S.drama + 22);
            Audio.tone(3200, .08, 'sine', .15); Audio.tone(110, .7, 'sawtooth', .12, 60);
            pop('OUCH!!', M(HEAD_DOWN.x, 760).x, M(HEAD_DOWN.x, 760).y, '#fff', 60);
            if (S.hp <= 0) { S.state = 'win'; S.endT = 0; S.headDown = true; Audio.sfx('win'); say('win'); } else say('ouch');
          } else { Audio.tone(1500, .05, 'square', .05); pop(reach ? 'MISSED' : 'swish', M(S.kx + 60, 820).x, M(S.kx + 60, 820).y, '#c8c8d8', 30); if (reach) say('miss'); }
        }
      }
    }
  }
  // test policy: 'good' plays the con properly, 'brute' just fires at the knight
  function autopilot(kind) {
    if (kind === 'brute') { // aims where he'll be when it lands
      if (S.fireballs.length) return;
      let x = S.kx;
      if (S.kdazed > 0) x = S.kx; else if (S.kflee > 0) x = Math.max(40, S.kx - 260 * Math.min(.5, S.kflee)); else { const goal = S.headK > .85 ? HEAD_DOWN.x - 85 : S.ktarget; x = S.kx + clamp(goal - S.kx, -90, 90); }
      fireAt(x); return;
    }
    if (S.drama < 35 && !S.fireballs.length) { if (S.headDown) S.headDown = false; else if (S.headK < .1) { if (S.roarCd <= 0 && S.drama < 30) press('roar'); else fireAt(S.kx + 110 < 340 ? S.kx + 110 : S.kx - 110); } }
    else if (S.drama > 55 && !S.headDown) S.headDown = true;
  }

  // ---------- drawing (same characters as the ad) ----------
  function star(x, y, r, col) { cx.fillStyle = col; cx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; cx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } cx.closePath(); cx.fill(); }
  function heart(x, y, s) { cx.beginPath(); cx.moveTo(x, y + s * .9); cx.bezierCurveTo(x - s * 1.6, y - s * .2, x - s * .6, y - s * 1.3, x, y - s * .4); cx.bezierCurveTo(x + s * .6, y - s * 1.3, x + s * 1.6, y - s * .2, x, y + s * .9); cx.fill(); }
  function lair() {
    const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1a3a'); g.addColorStop(1, '#5a2a2a'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#ffffff10'; for (let i = 0; i < 6; i++) { rr(i * 130 - 20, 460 + (i % 2) * 60, 110, 70, 10); cx.fill(); }
    cx.fillStyle = '#ffb02a'; for (const [x, y] of [[60, 520], [660, 420]]) { cx.globalAlpha = .7 + Math.sin(S.t * 9 + x) * .2; circ(x, y, 14); } cx.globalAlpha = 1;
    cx.fillStyle = '#3a2a2a'; cx.fillRect(0, FLOOR, W, H - FLOOR);
  }
  function dragon() {
    const h = headPos(), t = S.t, breathe = Math.sin(t * 2) * 6, flop = S.state === 'win' ? lin(S.endT, .2, .7) : 0;
    cx.fillStyle = '#3aa05a'; cx.strokeStyle = '#1a5a2a'; cx.lineWidth = 6;
    cx.beginPath(); cx.moveTo(620, 860); cx.quadraticCurveTo(760, 900, 700, 1000); cx.quadraticCurveTo(690, 940, 600, 920); cx.fill(); cx.stroke();
    cx.fillStyle = '#2a804a'; cx.beginPath(); cx.moveTo(540, 700); cx.lineTo(700, 470 + breathe * 2 + flop * 200); cx.lineTo(690, 620 + flop * 150); cx.lineTo(640, 600 + flop * 120); cx.lineTo(620, 720); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = '#3aa05a'; cx.beginPath(); cx.ellipse(540, 860 + flop * 30, 170, 150 - flop * 30 + breathe, 0, 0, 7); cx.fill(); cx.stroke();
    cx.fillStyle = '#e8d88a'; cx.beginPath(); cx.ellipse(470, 880 + flop * 30, 80, 110 - flop * 20, -.2, 0, 7); cx.fill();
    cx.fillStyle = '#3aa05a'; rr(600, 900, 70, 100, 30); cx.fill(); cx.stroke(); rr(380, 920, 80, 80, 30); cx.fill(); cx.stroke();
    cx.fillStyle = '#f0f0e0'; for (const dx of [0, 22, 44]) { cx.beginPath(); cx.moveTo(352 + dx, 1000); cx.lineTo(362 + dx, 980); cx.lineTo(372 + dx, 1000); cx.fill(); }
    cx.strokeStyle = '#1a5a2a'; cx.lineWidth = 92; cx.lineCap = 'round';
    const hy = h.y + (S.state === 'win' ? flop * 25 : 0);
    cx.beginPath(); cx.moveTo(500, 760); cx.quadraticCurveTo(mix(520, 420, S.headK), mix(560, 900, S.headK), h.x + 40, hy + 20); cx.stroke();
    cx.strokeStyle = '#3aa05a'; cx.lineWidth = 80; cx.stroke();
    head(h.x, hy);
  }
  function head(x, y) {
    const t = S.t, agony = Math.min(1, S.agony * 2), dead = S.state === 'win' && S.endT > .6, peek = dead && S.endT > 1.2 && S.endT < 1.8;
    cx.save(); cx.translate(x, y); cx.rotate(agony * -.3);
    cx.fillStyle = '#e8e0c8'; cx.beginPath(); cx.moveTo(40, -50); cx.lineTo(90, -120); cx.lineTo(70, -40); cx.fill(); cx.beginPath(); cx.moveTo(0, -55); cx.lineTo(20, -125); cx.lineTo(30, -50); cx.fill();
    cx.fillStyle = '#3aa05a'; cx.strokeStyle = '#1a5a2a'; cx.lineWidth = 6;
    cx.beginPath(); cx.ellipse(30, 0, 95, 62, 0, 0, 7); cx.fill(); cx.stroke();
    cx.beginPath(); cx.ellipse(-60, 18, 70, 40, 0, 0, 7); cx.fill(); cx.stroke();
    cx.fillStyle = '#1a5a2a'; circ(-104, 6, 7); circ(-86, 2, 6);
    if (agony > 0 || S.roarT > 0) { const k = Math.max(agony, S.roarT); cx.fillStyle = '#7a1a2a'; cx.beginPath(); cx.ellipse(-50, 50, 55, 26 * k, 0, 0, 7); cx.fill(); }
    else { cx.strokeStyle = '#1a5a2a'; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(-120, 38); cx.quadraticCurveTo(-40, 48, 40, 30); cx.stroke(); }
    if (dead && !peek) { cx.fillStyle = '#ff7a9a'; rr(-90, 44, 24, 30, 10); cx.fill(); }
    cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(40, -18, 30, 26, 0, 0, 7); cx.fill();
    if (agony > .3) { cx.strokeStyle = '#111'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(18, -30); cx.lineTo(56, -18); cx.lineTo(18, -6); cx.stroke(); cx.fillStyle = '#7ad0ff'; circ(14, (t * 120) % 60, 8); }
    else if (dead && !peek) { cx.strokeStyle = '#1a5a2a'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(14, -16); cx.lineTo(66, -16); cx.stroke(); }
    else { const lx = peek ? -1 : -.8, ly = .5; cx.fillStyle = '#222'; circ(40 + lx * 12, -18 + ly * 10, 12); }
    cx.strokeStyle = '#1a5a2a'; cx.lineWidth = 8; cx.beginPath(); cx.moveTo(8, -50); cx.lineTo(72, -44); cx.stroke();
    cx.restore();
  }
  function knight() {
    const t = S.t, win = S.state === 'win';
    // ending: walk to the cage, see her, faint onto the snout
    let x = S.kx, rot = 0, y = FLOOR;
    if (win) { const e = S.endT; x = e < 1.6 ? S.kx : e < 2.4 ? mix(S.kx, 175, ease(lin(e, 1.6, 2.4))) : 175; const f = lin(e, 3.0, 3.6); x += f * 55; y -= f * 60 + (e > 2.7 && e < 3.0 ? 30 : 0); rot = easeIn(f) * Math.PI / 2; }
    const dir = S.kflee > 0 ? -1 : 1;
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.scale(dir, 1);
    const moving = S.state === 'play' && (S.kflee > 0 || Math.abs(S.kx - (S.headK > .85 ? HEAD_DOWN.x - 85 : S.ktarget)) > 6);
    const bob = moving ? Math.abs(Math.sin(t * 16)) * 6 : 0;
    cx.fillStyle = '#8a8aa0'; rr(-20, -46 - bob, 14, 46, 5); cx.fill(); rr(4, -46 - bob, 14, 46, 5); cx.fill();
    cx.fillStyle = '#c8c8d8'; cx.strokeStyle = '#5a5a6a'; cx.lineWidth = 4; rr(-26, -110 - bob, 52, 70, 12); cx.fill(); cx.stroke();
    cx.fillStyle = '#d83a3a'; cx.fillRect(-6, -108 - bob, 12, 66);
    cx.fillStyle = '#c8c8d8'; cx.beginPath(); cx.arc(0, -138 - bob, 30, 0, 7); cx.fill(); cx.stroke();
    cx.fillStyle = '#222'; cx.fillRect(4, -146 - bob, 24, 8);
    cx.fillStyle = '#d83a3a'; cx.beginPath(); cx.moveTo(-4, -168 - bob); cx.quadraticCurveTo(-30, -200 - bob, -40, -170 - bob); cx.quadraticCurveTo(-20, -180 - bob, -4, -164 - bob); cx.fill();
    const sw = S.kswing > 0 ? (S.kswing > .2 ? -1.4 * lin(.5 - S.kswing, 0, .3) : 1.5) : 0;
    cx.save(); cx.translate(18, -96 - bob); cx.rotate(-1.2 + sw);
    cx.fillStyle = '#c8c8d8'; rr(-6, -6, 40, 12, 6); cx.fill();
    cx.fillStyle = '#8a5a2a'; rr(34, -5, 16, 10, 3); cx.fill(); cx.fillStyle = '#ffd23a'; rr(48, -14, 8, 28, 3); cx.fill();
    cx.fillStyle = '#e8eef8'; cx.strokeStyle = '#8a8aa0'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(56, -6); cx.lineTo(150, -4); cx.lineTo(162, 0); cx.lineTo(150, 4); cx.lineTo(56, 6); cx.closePath(); cx.fill(); cx.stroke();
    cx.restore(); cx.restore();
    if (S.kdazed > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; star(x + Math.cos(a) * 34, y - 180 + Math.sin(a) * 10, 10, '#ffd23a'); }
  }
  function princess() {
    const out = S.state === 'win' ? lin(S.endT, 2.4, 2.8) : 0, x = mix(95, 120, out), y = FLOOR - 10;
    const bored = S.drama < 25 && S.state === 'play';
    cx.save(); cx.translate(x, y);
    cx.fillStyle = '#ff9ad8'; cx.beginPath(); cx.moveTo(-34, 0); cx.lineTo(-20, -60); cx.lineTo(20, -60); cx.lineTo(34, 0); cx.fill();
    cx.fillStyle = '#5ac87a'; circ(0, -78, 26); cx.beginPath(); cx.ellipse(-20, -72, 20, 13, 0, 0, 7); cx.fill();
    cx.fillStyle = '#ffd23a'; cx.beginPath(); cx.moveTo(-14, -100); cx.lineTo(-10, -116); cx.lineTo(0, -104); cx.lineTo(10, -116); cx.lineTo(14, -100); cx.fill();
    if (S.cheatT > 0) { cx.strokeStyle = '#222'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(-14, -90); cx.lineTo(2, -84); cx.stroke(); cx.fillStyle = '#222'; circ(-6, -82, 4); }
    else if (bored) { cx.strokeStyle = '#222'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(-14, -84); cx.lineTo(4, -84); cx.stroke(); }
    else { cx.fillStyle = '#ff3a6a'; heart(-6, -84, 8 + Math.sin(S.t * 8) * 1.5); }
    cx.restore();
    if (S.state === 'play' && !bored) for (let i = 0; i < 3; i++) { const p = ((S.t * .5 + i / 3) % 1); cx.globalAlpha = (1 - p) * S.drama / 100; cx.fillStyle = '#ff5a8a'; heart(x + 20 + Math.sin(p * 9 + i) * 10, y - 120 - p * 90, 9); cx.globalAlpha = 1; }
  }
  function cage() {
    cx.strokeStyle = '#4a4a5a'; cx.lineWidth = 6;
    cx.beginPath(); cx.moveTo(30, FLOOR); cx.lineTo(30, 800); cx.quadraticCurveTo(95, 740, 160, 800); cx.lineTo(160, FLOOR); cx.stroke();
    for (const bx of [55, 80, 105, 130]) { cx.beginPath(); cx.moveTo(bx, FLOOR); cx.lineTo(bx, 778); cx.stroke(); }
  }
  function fireball(fb) {
    const k = clamp((S.t - fb.t0) / .5);
    if (k < 1) { const x = mix(fb.x0, fb.x, k), y = mix(fb.y0, FLOOR - 20, k) - Math.sin(k * Math.PI) * 120; cx.fillStyle = '#ffb02a'; circ(x, y, 22); cx.fillStyle = '#fff3a0'; circ(x, y, 11); }
    else { const e = clamp((S.t - fb.t0 - .5) / .5); cx.globalAlpha = 1 - e; cx.fillStyle = '#ff7a2a'; circ(fb.x, FLOOR - 30, 40 + e * 60); cx.fillStyle = '#ffd23a'; circ(fb.x, FLOOR - 30, 20 + e * 30); cx.globalAlpha = 1; }
  }

  // ---------- HUD ----------
  function hud() {
    Draw.bigText(cx, `LEVEL ${S.li + 1}/${LEVELS.length}`, W / 2, 60, 32, '#fff');
    Draw.bigText(cx, S.L.name, W / 2, 104, S.L.name.length > 26 ? 24 : 34, '#ffe14a');
    // your HP (the one you want at zero)
    cx.fillStyle = '#000a'; rr(130, 150, 460, 60, 14); cx.fill();
    cx.fillStyle = '#3a1a1a'; rr(146, 176, 428, 22, 10); cx.fill();
    cx.fillStyle = '#e83a3a'; rr(146, 176, 428 * S.hp / S.L.hp, 22, 10); cx.fill();
    cx.font = '900 20px system-ui'; cx.fillStyle = '#fff'; cx.textAlign = 'left'; cx.fillText('🐉 YOU (LOSE THIS)', 150, 170); cx.textAlign = 'right'; cx.fillText(`${S.hp} / ${S.L.hp}`, 572, 170);
    // the knight's hearts (keep these)
    for (let i = 0; i < 3; i++) { cx.fillStyle = i < S.hearts ? '#ff3a6a' : '#5a3a4a'; heart(160 + i * 30, 240, 11); }
    cx.font = '900 18px system-ui'; cx.fillStyle = '#fff'; cx.textAlign = 'left'; cx.fillText('HIM (KEEP THESE)', 250, 246);
    // her drama meter
    cx.fillStyle = '#000a'; rr(130, 270, 460, 46, 14); cx.fill();
    cx.fillStyle = S.drama < 25 ? '#8a8a9a' : '#ff5ab0'; rr(146, 286, 340 * S.drama / 100, 16, 8); cx.fill();
    cx.font = '900 18px system-ui'; cx.fillStyle = '#fff'; cx.textAlign = 'right'; cx.fillText(S.drama < 25 ? '😐 BORED' : '😍 DRAMA', 584, 301);
    // buttons
    if (S.state === 'play') for (const b of BTN) {
      const dim = b.id === 'roar' && S.roarCd > 0, on = (b.id === 'fire' && S.armed) || (b.id === 'lower' && S.headDown);
      cx.save(); cx.translate(b.x, BTN_Y); cx.globalAlpha = dim ? .45 : 1;
      cx.fillStyle = b.col; cx.strokeStyle = on ? '#ffe14a' : '#000'; cx.lineWidth = on ? 8 : 5; rr(-96, -46, 192, 92, 24); cx.fill(); cx.stroke();
      cx.font = '900 30px system-ui'; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.fillText(b.id === 'lower' && S.headDown ? '⬆ RAISE' : b.label, 0, 11); cx.restore();
    }
    if (S.armed) { cx.globalAlpha = .6 + .4 * Math.sin(S.t * 8); Draw.bigText(cx, 'TAP THE FLOOR TO AIM', W / 2, 1060, 28, '#ffd23a'); cx.globalAlpha = 1; }
    if (S.t < 4 && S.state === 'play') { cx.globalAlpha = 1 - lin(S.t, 3.2, 4); Draw.bigText(cx, 'LET HIM WIN. MAKE IT LOOK REAL.', W / 2, 370, 28, '#fff'); cx.globalAlpha = 1; }
  }

  function speech() {
    const age = S.t - S.saidAt; if (!S.said || age > 2.6 || S.state === 'fail') return;
    const k = Math.min(1, age / .15), fade = 1 - clamp((age - 2.2) / .4);
    cx.save(); cx.globalAlpha = fade; cx.font = "800 26px system-ui";
    const w = Math.min(470, cx.measureText(S.said).width + 40), x = 24, y = 600, h = 62, tip = M(95, 880);
    cx.translate(x + 40, y + h); cx.scale(back(k), back(k)); cx.translate(-x - 40, -y - h);
    const hot = S.saidKind === 'oops' || S.saidKind === 'cheat';
    cx.fillStyle = hot ? '#ffe0e8' : '#fff'; cx.strokeStyle = hot ? '#c0203a' : '#111'; cx.lineWidth = 4;
    rr(x, y, w, h, 24); cx.fill(); cx.stroke();
    cx.beginPath(); cx.moveTo(x + 30, y + h - 2); cx.lineTo(tip.x, y + h + 40); cx.lineTo(x + 62, y + h - 2); cx.fill(); cx.stroke();
    cx.fillRect(x + 32, y + h - 6, 28, 6);
    cx.fillStyle = hot ? '#c0203a' : '#111'; cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.fillText(S.said, x + 20, y + h / 2 + 1);
    cx.restore();
  }
  function render(ctx) {
    cx = ctx;
    if (S.state === 'done') {
      cx.fillStyle = '#2a1a2a'; cx.fillRect(0, 0, W, H);
      Draw.bigText(cx, 'DEMO COMPLETE', W / 2, 500, 62, '#ffe14a');
      Draw.bigText(cx, 'SHE SAID YES.', W / 2, 590, 40, '#fff');
      Draw.bigText(cx, "HE'LL FIND OUT WHEN HE WAKES UP.", W / 2, 640, 28, '#c8b8ff');
      Draw.bigText(cx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 820, 24, '#9ad8ff');
      return;
    }
    lair();
    cx.save(); cx.translate(25, 0); cx.translate(360, FLOOR); cx.scale(SC, SC); cx.translate(-360, -FLOOR);
    cage(); princess(); dragon(); knight();
    for (const fb of S.fireballs) fireball(fb);
    cx.restore();
    for (const p of S.pops) { const k = clamp((S.t - p.t) / 1.0); if (k < 1) { cx.globalAlpha = 1 - k; Draw.bigText(cx, p.text, p.x, p.y - k * 60, p.size, p.col); cx.globalAlpha = 1; } }
    speech();
    hud();
    if (S.state === 'win') {
      const e = S.endT;
      if (e > 3.8) {
        const b = back(lin(e, 3.8, 4.2)); cx.save(); cx.translate(W / 2, 520); cx.scale(b, b);
        cx.fillStyle = '#ffd23a'; cx.strokeStyle = '#000'; cx.lineWidth = 6; rr(-250, -60, 500, 120, 30); cx.fill(); cx.stroke();
        Draw.bigText(cx, 'VICTORY!', 0, 0, 72, '#c0302a'); cx.restore();
        Draw.bigText(cx, '(FOR HIM)', W / 2, 610, 30, '#fff');
      }
      if (e > 4.4) Draw.bigText(cx, S.L.ending, W / 2, 680, S.L.ending.length > 22 ? 26 : 36, '#ffe14a');
      if (e > 5.2) btn(S.li < LEVELS.length - 1 ? 'NEXT' : 'FINISH', 840, '#4ad05a');
    }
    if (S.state === 'fail') {
      cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fillRect(0, 0, W, H);
      Draw.bigText(cx, 'FAIL', W / 2, 460, 110, '#ff3a3a');
      Draw.bigText(cx, S.reason, W / 2, 560, S.reason.length > 22 ? 28 : 40, '#ffb0b0');
      if (S.endT > .6) btn('TRY AGAIN', 840, '#4ad05a');
    }
  }
  function btn(label, cy, colr) { cx.fillStyle = colr; rr(220, cy - 40, 280, 80, 40); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 4; cx.stroke(); Draw.bigText(cx, label, W / 2, cy + 2, 34, '#fff'); }

  // ---------- input ----------
  function next() { Audio.sfx('select'); if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; Audio.sfx('start'); } }
  let barDrag = null;
  function onPointer(type, x, y) {
    if (type === 'down') {
      if (S.state === 'done') { Engine.exit(); return; }
      if (S.state === 'fail' && S.endT > .6) { load(S.li); return; }
      if (S.state === 'win' && S.endT > 5.2) { next(); return; }
      if (S.state !== 'play') return;
      for (const b of BTN) if (Math.abs(x - b.x) < 96 && Math.abs(y - BTN_Y) < 46) { press(b.id); return; }
      if (y > 140 && y < 220 && x > 130 && x < 590) { barDrag = x; return; }   // grabbing your own HP bar...
      if (S.armed && y > 600 && y < 1090) { fireAt(Mi(x, y).x); return; }
    } else if (type === 'move' && barDrag !== null && Math.abs(x - barDrag) > 30 && S.state === 'play') {
      barDrag = null; S.cheatT = 2; S.drama = Math.max(0, S.drama - 40);
      pop('SHE SAW THAT.', W / 2, 360, '#ff9aff', 44); Audio.sfx('bad'); say('cheat');
    } else if (type === 'up' || type === 'cancel') barDrag = null;
  }
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'fail' && (key === 'Enter' || key === ' ')) { load(S.li); return; }
    if (S.state === 'win' && S.endT > 5.2 && (key === 'Enter' || key === ' ')) { next(); return; }
    if (key === 'f' || key === 'F' || key === 'ArrowLeft') { if (S.state === 'play') fireAt(S.kx + 100); }   // keyboard: lob one just past him
    if (key === 'ArrowDown' || key === 's' || key === 'S') press('lower');
    if (key === 'ArrowUp' || key === 'r' || key === 'R' || key === 'Enter') press('roar');
  }

  const API = { LEVELS, LINES, S, load, press, fireAt, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
