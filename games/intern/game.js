// THE INTERN: TOWER DEFENSE - playable demo (neon vector).
// Tap a pad to build a tower (50 coins); towers fire on their own. Bugs walk the path to the server.
// The intern keeps "helping": his hand comes for a tower to move it somewhere useless. TAP THE HAND to swat it.
// Below 40% server HP the UNPLUG button lights up: it clears the wave, technically, for one star.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const W = 720, H = 1280;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  const C = { cyan: '#3af0ff', pink: '#ff3ab0', green: '#5aff7a', yellow: '#ffe13a', orange: '#ff8a3a', violet: '#a05aff', red: '#ff3a4a' };
  let cx = null;

  // cheap neon: a wide translucent stroke under a thin hot core (no shadowBlur, so it stays fast on phones)
  function neon(path, col, w = 3, a = 1) {
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.globalAlpha = a * .25; cx.strokeStyle = col; cx.lineWidth = w * 5; cx.beginPath(); path(); cx.stroke();
    cx.globalAlpha = a * .8; cx.lineWidth = w * 1.8; cx.beginPath(); path(); cx.stroke();
    cx.globalAlpha = a * .9; cx.strokeStyle = '#fff'; cx.lineWidth = w * .55; cx.beginPath(); path(); cx.stroke();
    cx.restore();
  }
  const poly = (pts, close) => () => { pts.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); if (close) cx.closePath(); };
  const circle = (x, y, r) => () => cx.arc(x, y, r, 0, Math.PI * 2);
  function text(s, x, y, size, col = '#fff', align = 'center') { cx.font = `900 ${size}px Inter, "Liberation Sans", sans-serif`; cx.textAlign = align; cx.lineJoin = 'round'; cx.lineWidth = size * .2; cx.strokeStyle = '#000'; cx.strokeText(s, x, y); cx.fillStyle = col; cx.fillText(s, x, y); }

  const PATH = [[740, 470], [200, 470], [200, 700], [560, 700], [560, 930], [360, 930], [360, 1070]];
  const SERVER = [360, 1110];
  const PADS = [[120, 380], [300, 580], [460, 600], [100, 820], [640, 820], [460, 1020], [640, 1110], [280, 1020], [380, 820], [100, 590]];
  const SEGS = PATH.slice(1).map((p, i) => [PATH[i], p]);
  const PATH_LEN = SEGS.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
  function pathPoint(d) { for (const [a, b] of SEGS) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= L) return [mix(a[0], b[0], d / L), mix(a[1], b[1], d / L)]; d -= L; } return PATH[PATH.length - 1]; }
  const RANGE = 160;
  // how much of the path a pad covers: used to rank good pads (tests) and to find the intern's favourite bad spot
  const coverage = PADS.map(([x, y]) => { let n = 0; for (let d = 0; d < PATH_LEN; d += 10) { const [px, py] = pathPoint(d); if (Math.hypot(px - x, py - y) < RANGE) n++; } return n; });
  const LEVELS = [
    { name: 'DAY 1', coins: 120, bugs: 18, every: 1.1, hp: 3, speed: 150, bite: 10, internEvery: 9 },
    { name: 'DAY 2', coins: 160, bugs: 26, every: .9, hp: 5, speed: 170, bite: 10, internEvery: 7.5 },
    { name: 'DAY 3: PERFORMANCE REVIEW', coins: 220, bugs: 34, every: .8, hp: 6, speed: 180, bite: 10, internEvery: 6 },
  ];
  const SAYS = ["i'll just optimize this", 'trust me', 'this one looks lonely', 'feng shui', 'moving it closer to the wifi', 'chat said to move it', 'ok hear me out'];

  const S = {};
  function load(i) {
    Object.assign(S, { li: i, L: LEVELS[i], t: 0, state: 'play', coins: LEVELS[i].coins, hp: 100, bugs: [], spawned: 0, spawnT: 1.0, towers: [], shots: [], pops: [],
      intern: null, internT: LEVELS[i].internEvery * .7, says: null, endT: 0, stars: 0, reason: '', technically: false, mood: 'smile', moodT: 0, nextId: 0, sayN: i * 3 });
    API.autopilot = null;
  }
  const towerAt = pi => S.towers.find(tw => tw.pad === pi);
  function build(pi) {
    if (S.state !== 'play' || towerAt(pi) || S.coins < 50) { if (S.coins < 50 && !towerAt(pi)) { pop('NEED 50', PADS[pi][0], PADS[pi][1] - 40, C.red); Audio.tone(200, .12, 'square', .05); } return false; }
    S.coins -= 50; S.towers.push({ pad: pi, cd: 0, aim: -1.57, col: [C.cyan, C.pink, C.violet, C.orange][S.towers.length % 4] });
    Audio.tone(880, .1, 'square', .06); Audio.tone(1320, .15, 'square', .05, null, .08);
    return true;
  }
  function pop(s, x, y, col = '#fff') { S.pops.push({ s, x, y, col, t: S.t }); }
  function unplug() {
    if (S.state !== 'play' || S.hp >= 40) return;
    S.state = 'win'; S.technically = true; S.stars = 1; S.endT = 0; S.mood = 'smug';
    Audio.tone(900, 1.2, 'sawtooth', .08, 40); Audio.noise(.4, .15);
  }
  function swat() {
    if (!S.intern || S.intern.phase !== 'grab') return false;
    S.intern.phase = 'retreat'; S.intern.t0 = S.t; pop('NO!', S.intern.x, S.intern.y - 60, C.red);
    Audio.noise(.08, .25); Audio.tone(300, .1, 'square', .08); S.mood = 'sad'; S.moodT = S.t;
    return true;
  }

  function update(dt) {
    S.t += dt;
    if (S.state !== 'play') { S.endT += dt; return; }
    const L = S.L;
    const auto = API.autopilot; if (auto) autopilot(auto);
    // spawn
    S.spawnT -= dt;
    if (S.spawned < L.bugs && S.spawnT <= 0) { S.bugs.push({ id: S.nextId++, d: 0, hp: L.hp }); S.spawned++; S.spawnT = L.every; }
    // move
    for (const b of S.bugs) b.d += L.speed * dt;
    for (const b of S.bugs) if (b.d >= PATH_LEN && !b.dead) { b.dead = true; S.hp -= L.bite; pop(`-${L.bite}%`, SERVER[0], SERVER[1] - 70, C.red); Audio.tone(120, .2, 'square', .08); S.mood = 'panic'; S.moodT = S.t; }
    // towers shoot the bug furthest along that's in range
    for (const tw of S.towers) {
      tw.cd -= dt; const [x, y] = PADS[tw.pad];
      let target = null;
      for (const b of S.bugs) { if (b.dead) continue; const [bx, by] = pathPoint(b.d); if (Math.hypot(bx - x, by - y) < RANGE && (!target || b.d > target.d)) target = b; }
      if (target) { const [bx, by] = pathPoint(target.d); tw.aim = Math.atan2(by - y, bx - x); if (tw.cd <= 0) { tw.cd = .45; target.hp--; S.shots.push({ x, y, bx, by, col: tw.col, t: S.t }); if (target.hp <= 0) { target.dead = true; S.coins += 10; } Audio.tone(1800, .07, 'square', .02, 600); } }
    }
    S.bugs = S.bugs.filter(b => !b.dead);
    S.shots = S.shots.filter(s => S.t - s.t < .12);
    // the intern
    S.internT -= dt;
    if (!S.intern && S.internT <= 0 && S.towers.length) {
      const tw = S.towers[Math.floor((S.t * 7.31) % S.towers.length)];
      S.intern = { tw, phase: 'reach', t0: S.t, x: PADS[tw.pad][0], y: PADS[tw.pad][1] };
      S.says = { s: SAYS[S.sayN++ % SAYS.length], t: S.t };
    }
    if (S.intern) {
      const it = S.intern, a = S.t - it.t0;
      if (it.phase === 'reach' && a > .8) { it.phase = 'grab'; it.t0 = S.t; }
      else if (it.phase === 'grab' && a > 1.3) {
        // too slow: he moves it to the most useless free pad
        const free = PADS.map((p, i) => i).filter(i => !towerAt(i));
        if (free.length && S.towers.includes(it.tw)) { const worst = free.sort((p, q) => coverage[p] - coverage[q])[0]; it.tw.pad = worst; pop('MOVED IT', PADS[worst][0], PADS[worst][1] - 40, C.yellow); Audio.tone(500, .2, 'triangle', .06, 250); S.mood = 'smile'; S.moodT = S.t; }
        it.phase = 'retreat'; it.t0 = S.t;
      } else if (it.phase === 'retreat' && a > .6) { S.intern = null; S.internT = S.L.internEvery; }
    }
    if (S.hp <= 0) { S.hp = 0; S.state = 'fail'; S.endT = 0; S.reason = 'THE SERVER IS DOWN.'; Audio.sfx('fail'); return; }
    if (S.spawned >= L.bugs && !S.bugs.length) { S.state = 'win'; S.endT = 0; S.stars = S.hp >= 80 ? 3 : S.hp >= 50 ? 2 : 1; Audio.sfx('win'); S.mood = 'smug'; }
  }
  // test policies: 'good' builds on the best pads and swats every grab; 'unplug' builds nothing and pulls the plug
  function autopilot(kind) {
    if (kind === 'good') {
      const best = PADS.map((p, i) => i).filter(i => !towerAt(i)).sort((p, q) => coverage[q] - coverage[p]);
      if (best.length && S.coins >= 50) build(best[0]);
      if (S.intern && S.intern.phase === 'grab') swat();
    } else if (kind === 'unplug' && S.hp < 40) unplug();
  }

  // ---------- drawing ----------
  function bug(x, y, ang, sit) {
    cx.save(); cx.translate(x, y); cx.rotate(ang); cx.scale(1.4, 1.4);
    neon(() => cx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2), C.green, 2);
    const leg = sit ? 0 : Math.sin(S.t * 20 + x) * 3;
    for (const s of [-1, 1]) for (const k of [-5, 0, 5]) neon(poly([[k, s * 7], [k + leg * s * .5 + 3, s * 13]]), C.green, 1.2, .7);
    cx.restore();
  }
  function facecam() {
    const x = 30, y = 96, w = 170, h = 170;
    cx.save(); cx.beginPath(); cx.roundRect(x, y, w, h, 20); cx.clip();
    cx.fillStyle = '#1a1a2a'; cx.fillRect(x, y, w, h);
    const mood = S.t - S.moodT < 1.5 ? S.mood : S.state === 'win' ? 'smug' : S.hp < 40 ? 'panic' : 'smile';
    const cxp = x + w / 2, cyp = y + 100 + Math.sin(S.t * 3) * 2, lit = mood === 'panic' ? '#ff8a8a' : '#cfe8ff';
    cx.fillStyle = '#3a3a5a'; cx.beginPath(); cx.ellipse(cxp, y + h + 10, 75, 66, 0, Math.PI, 0); cx.fill();
    cx.fillStyle = lit; cx.beginPath(); cx.ellipse(cxp, cyp, 38, 46, 0, 0, 7); cx.fill();
    cx.fillStyle = '#2a1a10'; cx.beginPath(); cx.ellipse(cxp, cyp - 32, 44, 24, 0, Math.PI, 0); cx.fill();
    cx.fillStyle = '#111'; cx.beginPath(); cx.arc(cxp - 14, cyp - 5, mood === 'panic' ? 6 : 4, 0, 7); cx.arc(cxp + 14, cyp - 5, mood === 'panic' ? 6 : 4, 0, 7); cx.fill();
    cx.strokeStyle = '#111'; cx.lineWidth = 4; cx.lineCap = 'round'; cx.beginPath();
    if (mood === 'smile' || mood === 'smug') cx.arc(cxp, cyp + 12, 12, .2, Math.PI - .2); else if (mood === 'panic') cx.ellipse(cxp, cyp + 22, 8, 11, 0, 0, 7); else { cx.moveTo(cxp - 10, cyp + 24); cx.quadraticCurveTo(cxp, cyp + 16, cxp + 10, cyp + 24); }
    cx.stroke(); cx.restore();
    cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.beginPath(); cx.roundRect(x, y, w, h, 20); cx.stroke();
    cx.fillStyle = C.red; cx.beginPath(); cx.arc(x + 18, y + 18, 6, 0, 7); cx.fill();
    if (S.says && S.t - S.says.t < 2.4) { text(S.says.s, 460, 170, 30, '#fff'); }
  }
  function hand(x, y, press) {
    cx.save(); cx.translate(x, y); cx.rotate(-.3); const s = 1 - press * .1; cx.scale(s, s);
    cx.fillStyle = '#e8b890'; cx.strokeStyle = '#7a4a2a'; cx.lineWidth = 3;
    cx.beginPath(); cx.roundRect(-9, -4, 18, 70, 9); cx.fill(); cx.stroke();
    cx.beginPath(); cx.roundRect(-26, 50, 60, 70, 22); cx.fill(); cx.stroke();
    cx.restore();
  }
  function render(ctx) {
    cx = ctx;
    const dark = S.technically ? 1 - lin(S.endT, 0, .3) : 1;
    cx.fillStyle = '#05060f'; cx.fillRect(0, 0, W, H);
    if (S.state === 'done') { text('DEMO COMPLETE', 360, 520, 64, C.cyan); text('THREE DAYS. STILL EMPLOYED.', 360, 600, 34, C.pink); text('(SOMEHOW)', 360, 650, 30, '#888'); text('TAP OR ESC FOR THE DISC MENU', 360, 820, 26, '#888'); return; }
    cx.globalAlpha = .35 * (dark * .7 + .3); cx.strokeStyle = '#1a2a6a'; cx.lineWidth = 1;
    for (let x = 0; x <= W; x += 60) { cx.beginPath(); cx.moveTo(x, 400); cx.lineTo(x, H); cx.stroke(); }
    for (let y = 400; y <= H; y += 60) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    cx.globalAlpha = 1;
    neon(poly(PATH), C.violet, 4, .45 * (dark * .6 + .4));
    PADS.forEach(([x, y], i) => { if (!towerAt(i)) { neon(circle(x, y, 26), '#4a5aca', 2, .7 * (dark * .6 + .4)); if (S.coins >= 50 && S.state === 'play') text('+', x, y + 10, 28, '#6a7aea'); } });
    // server + plug
    const [sx, sy] = SERVER, alarm = S.hp < 40 && dark > .5 && Math.sin(S.t * 14) > 0;
    neon(poly([[sx - 60, sy - 40], [sx + 60, sy - 40], [sx + 60, sy + 60], [sx - 60, sy + 60]], true), alarm ? C.red : C.cyan, 3, dark * .85 + .15);
    for (let k = 0; k < 4; k++) neon(poly([[sx - 46, sy - 24 + k * 20], [sx + 20, sy - 24 + k * 20]]), alarm ? C.red : C.cyan, 1.5, dark * .85 + .15);
    const pulled = S.technically ? lin(S.endT, 0, .3) : 0;
    neon(poly([[sx + 60, sy + 30], [sx + 110, sy + 30], [sx + 130 + pulled * 100, sy + 50 - pulled * 50]]), '#bbbbbb', 2, .9);
    // towers
    for (const tw of S.towers) {
      const [x, y] = PADS[tw.pad], held = S.intern && S.intern.tw === tw && S.intern.phase === 'grab' ? Math.sin(S.t * 30) * 3 : 0;
      neon(poly([[x - 22 + held, y + 18], [x + 22 + held, y + 18], [x + 16 + held, y - 6], [x - 16 + held, y - 6]], true), tw.col, 2.5, dark * .8 + .2);
      cx.save(); cx.translate(x + held, y - 10); cx.rotate(tw.aim); neon(poly([[0, 0], [30, 0]]), tw.col, 3, dark * .8 + .2); cx.restore();
    }
    for (const s of S.shots) neon(poly([[s.x, s.y - 10], [s.bx, s.by]]), s.col, 2, 1 - (S.t - s.t) / .12);
    for (const b of S.bugs) { const p = pathPoint(b.d), q = pathPoint(Math.min(PATH_LEN, b.d + 4)); bug(p[0], p[1], Math.atan2(q[1] - p[1], q[0] - p[0]), false); }
    // HUD
    neon(poly([[300, 330], [680, 330]]), '#333', 8, .6);
    if (dark > .2) neon(poly([[300, 330], [300 + 380 * S.hp / 100, 330]]), S.hp < 40 ? C.red : C.green, 8, dark);
    text(dark > .2 ? `SERVER ${Math.round(S.hp)}%` : 'SERVER: OFF', 490, 312, 26, S.hp < 40 ? C.red : C.green);
    text(`${S.li + 1}/3 ${S.L.name}`, 690, 70, 24, '#aaa', 'right');
    text(`🪙 ${S.coins}`, 690, 110, 30, C.yellow, 'right');
    text(`BUGS ${S.spawned}/${S.L.bugs}`, 690, 270, 22, '#888', 'right');
    facecam();
    // the UNPLUG button: only when things are bad
    if (S.state === 'play' && S.hp < 40) { const p = .6 + .4 * Math.sin(S.t * 8); neon(poly([[470, 1170], [690, 1170], [690, 1250], [470, 1250]], true), C.yellow, 3, p); text('🔌 UNPLUG', 580, 1222, 34, C.yellow); }
    if (S.state === 'play' && S.t < 4) text('TAP A PAD TO BUILD (50)', 360, 1215, 34, '#fff');
    // the intern's hand
    if (S.intern) {
      const it = S.intern, a = S.t - it.t0;
      const k = it.phase === 'reach' ? ease(lin(a, 0, .8)) : it.phase === 'grab' ? 1 : 1 - ease(lin(a, 0, .6));
      hand(mix(700, it.x + 10, k), mix(1320, it.y + 10, k), it.phase === 'grab' ? 1 : 0);
      if (it.phase === 'grab') { const p = .5 + .5 * Math.sin(S.t * 16); text('TAP HIS HAND!', it.x, it.y - 50, 26, `rgba(255,58,74,${.5 + p * .5})`); }
    }
    for (const p of S.pops) { const k = (S.t - p.t) / .9; if (k < 1) { cx.globalAlpha = 1 - k; text(p.s, p.x, p.y - k * 40, 30, p.col); cx.globalAlpha = 1; } }
    if (S.state === 'win') {
      const k = back(lin(S.endT, .3, .7));
      cx.save(); cx.translate(360, 640); cx.scale(k, k);
      cx.fillStyle = '#05060fcc'; cx.fillRect(-270, -120, 540, 260);
      neon(poly([[-270, -120], [270, -120], [270, 140], [-270, 140]], true), C.yellow, 3);
      text('WAVE CLEARED', 0, -40, 56, C.yellow);
      text('★'.repeat(S.stars) + '☆'.repeat(3 - S.stars), 0, 30, 48, C.yellow);
      text(S.technically ? '(TECHNICALLY)' : `SERVER AT ${Math.round(S.hp)}%`, 0, 90, 30, '#fff');
      cx.restore();
      if (S.endT > 1.2) { neon(poly([[220, 860], [500, 860], [500, 940], [220, 940]], true), C.green, 3); text(S.li < 2 ? 'NEXT DAY ▶' : 'FINISH ▶', 360, 914, 38, '#fff'); }
    }
    if (S.state === 'fail') {
      cx.fillStyle = '#000a'; cx.fillRect(0, 0, W, H);
      text(S.reason, 360, 600, 48, C.red); text("(YOU'RE FIRED)", 360, 660, 32, '#fff');
      if (S.endT > .6) { neon(poly([[220, 860], [500, 860], [500, 940], [220, 940]], true), C.green, 3); text('TRY AGAIN', 360, 914, 38, '#fff'); }
    }
  }

  // ---------- input ----------
  function next() { if (S.li < 2) load(S.li + 1); else S.state = 'done'; Audio.sfx('select'); }
  function onPointer(type, x, y) {
    if (type !== 'down') return;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'win' && S.endT > 1.2) { next(); return; }
    if (S.state === 'fail' && S.endT > .6) { load(S.li); return; }
    if (S.state !== 'play') return;
    // swat the hand: a generous target around his hand
    if (S.intern && S.intern.phase === 'grab' && Math.hypot(x - S.intern.x, y - (S.intern.y + 60)) < 110) { swat(); return; }
    if (S.hp < 40 && x > 470 && y > 1170) { unplug(); return; }
    for (let i = 0; i < PADS.length; i++) if (Math.hypot(x - PADS[i][0], y - PADS[i][1]) < 44) { build(i); return; }
  }
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'win' && S.endT > 1.2 && (key === 'Enter' || key === ' ')) { next(); return; }
    if (S.state === 'fail' && S.endT > .6 && (key === 'Enter' || key === ' ')) { load(S.li); return; }
    if (key === ' ') swat();
    if (key === 'u' || key === 'U') unplug();
    const n = parseInt(key, 10); if (n >= 1 && n <= PADS.length) build(n - 1);   // number keys build on pads
  }

  const API = { LEVELS, S, load, build, swat, unplug, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
