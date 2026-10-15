// STICK SWARM 3D - playable crowd-runner demo.
// Steer the swarm through gates (blue: add/multiply, red: subtract/divide), dodge saws, beat the giant's number.
// Win, and the whole swarm piles onto a one-winner podium. The YOU marker settles for whoever's on top.
(function () {
  'use strict';
  const { createGame, Audio, Draw, ease, back, clamp } = Engine;
  const W = 540, H = 960, HOR = 210, BASE = 760, CXS = 270, ROAD = 230, ZK = 200, SPEED = 380;
  const proj = (X, z) => { const s = 1 / (1 + Math.max(z, -.8 * ZK) / ZK); return { x: CXS + X * s, y: HOR + (BASE - HOR) * s, s }; };

  // ---------- levels: [z, leftOp, rightOp] gates, saws {z, x, w}, a giant with a number ----------
  const LEVELS = [
    { name: 'BEAT THE GIANT', boss: 40, bossZ: 3200,
      gates: [[600, '+5', '-2'], [1200, '+1', 'x2'], [1800, '+10', 'x2'], [2500, 'x3', '-5']], saws: [{ z: 2150, x: 0, w: 130 }] },
    { name: 'BIGGER GIANT', boss: 200, bossZ: 4000,
      gates: [[600, '+9', 'x2'], [1200, 'x3', '-4'], [1900, '÷2', '+20'], [2600, 'x2', '-10'], [3300, '+30', 'x3']], saws: [{ z: 1550, x: 0, w: 140 }, { z: 2950, x: 0, w: 140 }] },
    { name: 'THE BIGGEST GIANT', boss: 2500, bossZ: 4800,
      gates: [[600, 'x5', '+2'], [1200, '+15', '-3'], [1800, 'x10', '÷2'], [2500, 'x3', '+50'], [3200, '-100', 'x5'], [3900, '+500', 'x2']], saws: [{ z: 1500, x: 0, w: 140 }, { z: 2850, x: 0, w: 140 }, { z: 3550, x: 0, w: 140 }] },
  ];
  const apply = (c, op) => { const n = parseFloat(op.slice(1)); switch (op[0]) { case '+': return c + n; case '-': return Math.max(0, c - n); case 'x': return c * n; case '÷': return Math.floor(c / n); } return c; };
  const good = op => op[0] === '+' || op[0] === 'x';

  // ---------- state ----------
  const S = { li: 0, L: null, state: 'play', t: 0, p: 0, X: 0, count: 1, shown: 1, gatesDone: 0, sawsDone: 0, bossHp: 0, fightT: 0, winT: 0, pops: [], keys: {}, drag: null };
  function load(i) {
    const L = LEVELS[i]; Object.assign(S, { li: i, L, state: 'play', t: 0, p: 0, X: 0, count: 1, shown: 1, gatesDone: 0, sawsDone: 0, bossHp: L.boss, fightT: 0, winT: 0, pops: [], t0: 0 });
    API.autopilot = null;
  }
  function pop(text, col) { S.pops.push({ text, col, t: S.t }); }
  function fail(reason) { if (S.state === 'fail') return; S.state = 'fail'; S.reason = reason; S.t0 = S.t; Audio.sfx('fail'); }

  function update(dt) {
    S.t += dt;
    if (S.state === 'play') {
      // steering: keys, drag, or the test autopilot
      const auto = API.autopilot;
      if (auto) {
        const next = S.L.gates[S.gatesDone];
        let want = 0;
        if (next) { const [, l, r] = next, lv = apply(S.count, l), rv = apply(S.count, r); const best = lv >= rv ? -1 : 1; want = (auto === 'best' ? best : -best) * 115; }
        S.X += clamp(want - S.X, -400 * dt, 400 * dt);
      } else {
        const dir = (S.keys.ArrowRight || S.keys.d || S.keys.D ? 1 : 0) - (S.keys.ArrowLeft || S.keys.a || S.keys.A ? 1 : 0);
        S.X += dir * 420 * dt;
      }
      S.X = clamp(S.X, -ROAD + 30, ROAD - 30);
      S.p += SPEED * dt;
      // gates
      const g = S.L.gates[S.gatesDone];
      if (g && S.p >= g[0]) {
        const op = S.X < 0 ? g[1] : g[2]; S.count = apply(S.count, op); S.gatesDone++;
        Audio.sfx(good(op) ? 'gate' : 'bad'); pop(op, good(op) ? '#4ab0ff' : '#ff5a5a');
        if (S.count <= 0) fail('EVERYONE IS GONE');
      }
      // saws: a hit costs a third of the swarm
      const sw = S.L.saws[S.sawsDone];
      if (sw && S.p >= sw.z) { S.sawsDone++; if (Math.abs(S.X - sw.x) < sw.w / 2 + 40) { const lost = Math.ceil(S.count / 3) + 2; S.count = Math.max(0, S.count - lost); Audio.sfx('hit'); pop('-' + lost, '#ff5a5a'); if (S.count <= 0) fail('SAWED'); } }
      if (S.p >= S.L.bossZ - 90) { S.p = S.L.bossZ - 90; S.state = 'fight'; S.fightT = 0; S.startCount = S.count; Audio.sfx('hit'); }
    } else if (S.state === 'fight') {
      S.fightT += dt;
      const k = clamp(S.fightT / 1.6), spent = Math.min(S.startCount, S.L.boss);
      S.count = Math.round(S.startCount - spent * k); S.bossHp = Math.round(S.L.boss - spent * k);
      if (S.fightT % .12 < dt) Audio.sfx('hit');
      if (k >= 1) { if (S.startCount > S.L.boss) { S.state = 'win'; S.winT = 0; S.t0 = S.t; Audio.sfx('win'); } else fail('THE GIANT WINS'); }
    } else if (S.state === 'win') { S.winT += dt; }
    S.shown += (S.count - S.shown) * Math.min(1, dt * 10);
  }

  // ---------- drawing ----------
  function stickman(ctx, x, y, h, col, phase, run = 1, armsUp = false) {
    const hr = h * .17, top = y - h + hr * 2, hip = y - h * .42, sw = Math.sin(phase) * .6 * run;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, h * .1);
    Draw.circ(ctx, x, y - h + hr, hr);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, hip); ctx.moveTo(x, hip); ctx.lineTo(x + Math.sin(sw) * h * .28, y); ctx.moveTo(x, hip); ctx.lineTo(x - Math.sin(sw) * h * .28, y);
    if (armsUp) { ctx.moveTo(x, top + h * .08); ctx.lineTo(x - h * .22, top - h * .18); ctx.moveTo(x, top + h * .08); ctx.lineTo(x + h * .22, top - h * .18); }
    else { ctx.moveTo(x, top + h * .08); ctx.lineTo(x - Math.sin(sw) * h * .25, hip); ctx.moveTo(x, top + h * .08); ctx.lineTo(x + Math.sin(sw) * h * .25, hip); }
    ctx.stroke();
  }
  function road(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, HOR); g.addColorStop(0, '#5ac8ff'); g.addColorStop(1, '#c8f0ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, HOR + 2);
    ctx.fillStyle = '#7ad06a'; ctx.fillRect(0, HOR, W, H - HOR);
    const a = proj(-ROAD, 5000), b = proj(ROAD, 5000), c = proj(ROAD, -160), d = proj(-ROAD, -160);
    ctx.fillStyle = '#e8dcc8'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill();
    ctx.fillStyle = '#d4c4aa';
    for (let k = -2; k < 50; k++) { const z0 = k * 120 - (S.p % 120), z1 = z0 + 60; if (z1 < -160) continue; const q0 = proj(-ROAD, Math.max(z0, -160)), q1 = proj(ROAD, Math.max(z0, -160)), q2 = proj(ROAD, z1), q3 = proj(-ROAD, z1); ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.fill(); }
  }
  function gatePair(ctx, g, idx) {
    const z = g[0] - S.p; if (z < -40 || z > 5000) return;
    for (const [side, op] of [[-1, g[1]], [1, g[2]]]) {
      const p0 = proj(side < 0 ? -ROAD + 6 : 6, z), p1 = proj(side < 0 ? -6 : ROAD - 6, z), top = p0.y - 230 * p0.s;
      const ok = good(op), used = idx < S.gatesDone;
      ctx.fillStyle = ok ? `rgba(40,140,255,${used ? .15 : .55})` : `rgba(255,60,60,${used ? .15 : .55})`; ctx.fillRect(p0.x, top, p1.x - p0.x, p0.y - top);
      ctx.strokeStyle = ok ? '#1a6ad0' : '#c02020'; ctx.lineWidth = 6 * p0.s + 1; ctx.strokeRect(p0.x, top, p1.x - p0.x, p0.y - top);
      Draw.bigText(ctx, op, (p0.x + p1.x) / 2, (top + p0.y) / 2, Math.max(8, 100 * p0.s), '#fff');
    }
  }
  function saw(ctx, sw) {
    const z = sw.z - S.p; if (z < -40 || z > 5000) return;
    const c = proj(sw.x, z), r = sw.w / 2 * c.s;
    ctx.save(); ctx.translate(c.x, c.y - r * .6); ctx.rotate(S.t * 12);
    ctx.fillStyle = '#c8c8d0'; ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, q = i % 2 ? r : r * .82; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.fill();
    ctx.fillStyle = '#7a7a86'; Draw.circ(ctx, 0, 0, r * .25); ctx.restore();
  }
  function giant(ctx) {
    const z = S.L.bossZ - S.p, base = proj(0, z), h = 1500 * base.s;
    const fall = S.state === 'win' ? ease(clamp(S.winT / .8)) : 0;
    const stomp = S.state === 'play' ? Math.abs(Math.sin(S.t * 3)) * 10 * base.s : 0;
    ctx.save(); ctx.translate(base.x, base.y); ctx.rotate(-fall * 1.45); ctx.translate(-base.x, -base.y);
    ctx.strokeStyle = '#d02a2a'; ctx.fillStyle = '#d02a2a'; ctx.lineCap = 'round'; ctx.lineWidth = h * .09;
    const hip = base.y - h * .42 - stomp, top = base.y - h * .8 - stomp;
    Draw.circ(ctx, base.x, base.y - h * .9 - stomp, h * .11);
    ctx.beginPath(); ctx.moveTo(base.x, top); ctx.lineTo(base.x, hip); ctx.moveTo(base.x, hip); ctx.lineTo(base.x - h * .2, base.y); ctx.moveTo(base.x, hip); ctx.lineTo(base.x + h * .2, base.y - stomp * 2);
    ctx.moveTo(base.x, top + h * .06); ctx.lineTo(base.x - h * .26, top + h * .26); ctx.moveTo(base.x, top + h * .06); ctx.lineTo(base.x + h * .26, top + h * .2); ctx.stroke();
    ctx.restore();
    if (fall < .5) pill(ctx, base.x, Math.max(base.y - h * 1.1 - 26, 250), String(S.bossHp), '#d02a2a', Math.max(.9, base.s * 3));
  }
  function pill(ctx, x, y, text, col, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.font = "900 30px Impact, 'Arial Black', sans-serif"; const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = col; Draw.rr(ctx, -w / 2, -22, w, 44, 22); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 2); ctx.restore();
  }
  const PHI = .6180339887;
  function crowd(ctx) {
    const c = Math.max(0, Math.round(S.shown)), n = Math.min(c, 300), R = c <= 1 ? 0 : Math.min(6 * Math.sqrt(c) + 10, 210);
    const fightK = S.state === 'fight' ? clamp(S.fightT / .5) : 0, boss = proj(0, S.L.bossZ - S.p);
    const pts = [];
    for (let i = 1; i < n; i++) { const r = R * Math.sqrt(i / n), a = i * 2.39996; pts.push({ X: S.X + r * Math.cos(a), z: r * Math.sin(a) * .5 + R * .5, i }); } // golden-angle spiral: even spacing
    pts.sort((a, b) => b.z - a.z);
    for (const d of pts) {
      const q = proj(d.X, d.z); let x = q.x, y = q.y, h = 64 * q.s;
      if (fightK > 0) { x += (boss.x + ((d.i * 37) % 60 - 30) * boss.s * 6 - x) * fightK; y += (boss.y - ((d.i * 53) % 100) / 100 * 800 * boss.s - y) * fightK; }
      stickman(ctx, x, y, h, '#2a8cff', ((d.i * PHI) % 1) * Math.PI * 2 + S.t * 14); // scrambled phase: no lockstep sway
    }
    // the original, at the front, marked YOU
    const lead = proj(S.X, c <= 1 ? 0 : R * 1.05);
    if (c > 0) { stickman(ctx, lead.x, lead.y, 64 * lead.s, '#1a6ad0', S.t * 14); you(ctx, lead.x, lead.y - 64 * lead.s - 6); }
    if (c > 0 || S.state === 'fight') pill(ctx, lead.x, Math.min(lead.y - 64 * lead.s - 60, 720), Math.round(S.shown).toLocaleString('en-US'), '#2a8cff');
  }
  function you(ctx, x, y) {
    const b = Math.sin(S.t * 6) * 4; ctx.save(); ctx.translate(x, y - 14 + b); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(10, -12); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = "900 18px Impact, sans-serif"; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeText('YOU', 0, -18); ctx.fillText('YOU', 0, -18); ctx.restore();
  }
  // win: the swarm piles onto a one-winner podium; the YOU marker settles for whoever is on top
  function winScene(ctx) {
    const t = S.winT, pod = { x: W / 2, y: 640 }, rise = ease(clamp((t - .9) / .4));
    ctx.fillStyle = '#ffcf3a'; Draw.rr(ctx, pod.x - 90, pod.y - 70 * rise, 180, 70 * rise, 8); ctx.fill(); if (rise > .5) Draw.bigText(ctx, '1ST', pod.x, pod.y - 35, 34, '#7a5a00', 'transparent');
    const n = Math.min(Math.round(S.count), 300), rows = Math.floor((Math.sqrt(8 * n + 1) - 1) / 2), apexY = pod.y - 70 * rise - rows * 7 - 2; // pile sits on the podium
    for (let i = 0; i < n; i++) {
      const k = ease(clamp((t - 1.4 - i / n * 1.2) / .5)); if (k <= 0) continue;
      let row = 0, used = 0; const rank = n - 1 - i; while (used + row + 1 <= rank) { used += row + 1; row++; }
      const col = rank - used, tx = pod.x + (col - row / 2) * 7.5, ty = apexY + row * 7 + 2;
      const sx = W / 2 + ((i * 53) % 300 - 150), sy = 900;
      stickman(ctx, sx + (tx - sx) * k, sy + (ty - sy) * k - Math.sin(k * Math.PI) * 50, 14 + 30 * (1 - k), '#2a8cff', i, k < 1 ? 1 : 0);
    }
    if (t > 3.0) { stickman(ctx, pod.x, apexY - 4, 40, '#2a8cff', 0, 0, true); trophy(ctx, pod.x, apexY - 56, 1); }
    // YOU: under the pile, then hops to the winner
    const bot = { x: pod.x, y: pod.y - 70 }, top = { x: pod.x - 42, y: apexY - 40 }, hk = ease(clamp((t - 3.8) / .6));
    if (t > 1.6) you(ctx, bot.x + (top.x - bot.x) * hk, bot.y + (top.y - bot.y) * hk - Math.sin(hk * Math.PI) * 90);
    if (t > 3.0) Draw.bigText(ctx, '🏆 WINNER!', W / 2, 190, 52, '#ffd93a');
    if (t > 4.6) btn(ctx, S.li < LEVELS.length - 1 ? 'NEXT' : 'FINISH', 860, '#4ad05a');
  }
  function trophy(ctx, x, y, s) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#ffd93a'; ctx.strokeStyle = '#b08a10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -28); ctx.lineTo(20, -28); ctx.quadraticCurveTo(20, 2, 0, 6); ctx.quadraticCurveTo(-20, 2, -20, -28); ctx.fill(); ctx.stroke(); ctx.fillRect(-4, 6, 8, 12); Draw.rr(ctx, -14, 18, 28, 8, 3); ctx.fill(); ctx.restore(); }
  function btn(ctx, label, cy, colr) { ctx.fillStyle = colr; Draw.rr(ctx, 150, cy - 36, 240, 72, 36); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); Draw.bigText(ctx, label, W / 2, cy + 2, 30, '#fff'); }

  function render(ctx) {
    if (S.state === 'done') { ctx.fillStyle = '#0a3a8a'; ctx.fillRect(0, 0, W, H); Draw.bigText(ctx, 'DEMO COMPLETE', W / 2, 380, 52, '#ffe14a'); Draw.bigText(ctx, 'YOU WON. ALL 6,000 OF YOU.', W / 2, 460, 24, '#fff'); Draw.bigText(ctx, 'ONE OF YOU GOT THE TROPHY.', W / 2, 500, 24, '#aaa'); Draw.bigText(ctx, 'PRESS ESC FOR THE DISC MENU', W / 2, 640, 20, '#9ad8ff'); return; }
    road(ctx);
    if (S.state === 'win' && S.winT > .9) { ctx.fillStyle = 'rgba(122,208,106,' + clamp((S.winT - .9) / .3) + ')'; ctx.fillRect(0, HOR, W, H - HOR); winScene(ctx); return; }
    for (let i = S.L.gates.length - 1; i >= 0; i--) gatePair(ctx, S.L.gates[i], i);
    for (const sw of S.L.saws) saw(ctx, sw);
    giant(ctx);
    crowd(ctx);
    for (const pp of S.pops) { const k = clamp((S.t - pp.t) / .9); if (k < 1) { ctx.globalAlpha = 1 - k; Draw.bigText(ctx, pp.text, W / 2, 420 - k * 60, 64, pp.col); ctx.globalAlpha = 1; } }
    Draw.bigText(ctx, `LEVEL ${S.li + 1}/${LEVELS.length}`, W / 2, 50, 26, '#fff');
    Draw.bigText(ctx, S.L.name, W / 2, 92, 36, '#ffe14a');
    if (S.state === 'play' && S.t < 2.5) { ctx.globalAlpha = 1 - clamp((S.t - 1.8) / .7); Draw.bigText(ctx, '← DRAG TO STEER →', W / 2, 860, 26, '#fff'); ctx.globalAlpha = 1; }
    if (S.state === 'fail') { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); Draw.bigText(ctx, 'FAIL', W / 2, 420, 110, '#ff2a2a'); Draw.bigText(ctx, S.reason, W / 2, 520, 32, '#ff9a9a'); if (S.t - S.t0 > .5) btn(ctx, 'TRY AGAIN', 860, '#4ad05a'); }
  }

  // ---------- input ----------
  function onPointer(type, x) {
    if (type === 'down') {
      if (S.state === 'fail' && S.t - S.t0 > .5) { load(S.li); Audio.sfx('select'); return; }
      if (S.state === 'win' && S.winT > 4.6) { next(); return; }
      if (S.state === 'done') { location.href = '../../index.html'; return; }
      S.drag = { x0: x, X0: S.X };
    } else if (type === 'move' && S.drag) S.X = clamp(S.drag.X0 + (x - S.drag.x0) * 1.4, -ROAD + 30, ROAD - 30);
    else if (type === 'up' || type === 'cancel') S.drag = null;
  }
  function next() { Audio.sfx('select'); if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; Audio.sfx('start'); } }
  function onKey(key, down) {
    S.keys[key] = down; if (!down) return;
    if (key === 'Enter' || key === ' ') { if (S.state === 'fail') load(S.li); else if (S.state === 'win' && S.winT > 4.6) next(); else if (S.state === 'done') location.href = '../../index.html'; }
  }

  const API = { LEVELS, S, load, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
