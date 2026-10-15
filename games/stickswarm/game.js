// STICK SWARM 3D - playable demo.
// The ad is a crowd runner with twenty thousand stickmen. The game is a 2D sort puzzle with a few
// stickmen lying in jars. Tap a jar to lift its top stickman, tap another to drop him in: he can only
// land on his own colour or in an empty jar. One colour per jar wins.
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const W = 540, H = 960;
  let CAP = 4;   // jar height in stickmen: set per level
  const COLS = ['#ff4a6a', '#3aa0ff', '#4ad05a', '#ffd23a', '#b05aff', '#ff9a3a', '#3ad0c8', '#ff8ad0'];
  const LEVELS = [
    { name: 'WARM UP', colors: 3, empty: 2, cap: 4, seed: 5 },
    { name: 'FOUR OF A KIND', colors: 4, empty: 2, cap: 4, seed: 9 },
    { name: 'RUSH HOUR', colors: 5, empty: 2, cap: 4, seed: 17 },
    { name: 'TALL JARS', colors: 4, empty: 2, cap: 5, seed: 21 },
    { name: 'SIX PACK', colors: 6, empty: 2, cap: 4, seed: 33 },
    { name: 'ONE SPARE JAR', colors: 4, empty: 1, cap: 4, seed: 41 },
    { name: 'THE SWARM', colors: 7, empty: 2, cap: 4, seed: 29 },
    { name: 'THE MEGA SWARM', colors: 8, empty: 2, cap: 5, seed: 57 },
  ];

  // ---------- pure puzzle logic: a state is an array of jars, each an array of colour ids (bottom first) ----------
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const top = j => j[j.length - 1];
  const canMove = (st, a, b) => a !== b && st[a].length > 0 && st[b].length < CAP && (st[b].length === 0 || top(st[b]) === top(st[a]));
  const done = j => j.length === 0 || (j.length === CAP && j.every(c => c === j[0]));
  const solved = st => st.every(done);
  const key = st => st.map(j => j.join('')).sort().join('|');
  function moves(st) {
    const out = [];
    for (let a = 0; a < st.length; a++) for (let b = 0; b < st.length; b++) {
      if (!canMove(st, a, b)) continue;
      if (st[b].length === 0 && st[a].every(c => c === st[a][0])) continue;   // a pure jar into an empty one gets nowhere
      out.push([a, b]);
    }
    // finish jars first: dropping onto a run of the same colour is usually the good move
    return out.sort((x, y) => (st[y[1]].length - st[x[1]].length));
  }
  function apply(st, [a, b]) { const n = st.map(j => j.slice()); n[b].push(n[a].pop()); return n; }
  // depth-first solve with a visited set; returns the move list, or null
  function solve(st, limit = 200000) {
    const seen = new Set(), path = [];
    let budget = limit;
    function dfs(s) {
      if (solved(s)) return true;
      if (--budget < 0) return false;
      const k = key(s); if (seen.has(k)) return false; seen.add(k);
      for (const m of moves(s)) { path.push(m); if (dfs(apply(s, m))) return true; path.pop(); }
      return false;
    }
    return dfs(st) ? path : null;
  }
  function deal(L) {
    const r = mkRng(L.seed); CAP = L.cap;
    for (;;) {
      const bag = []; for (let c = 0; c < L.colors; c++) for (let k = 0; k < CAP; k++) bag.push(c);
      for (let i = bag.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [bag[i], bag[j]] = [bag[j], bag[i]]; }
      const st = []; for (let c = 0; c < L.colors; c++) st.push(bag.slice(c * CAP, c * CAP + CAP));
      for (let e = 0; e < L.empty; e++) st.push([]);
      if (!st.some(j => j.length && done(j)) && solve(st)) return st;   // never deal a jar that's already sorted, never deal a dead end
    }
  }

  // ---------- state ----------
  const S = { li: 0, L: null, jars: [], sel: -1, hist: [], movesN: 0, undos: 0, state: 'play', t: 0, lt: 0, winT: 0, fly: null, cursor: 0, stuck: false, plan: null,
    par: 0, hints: 0, hint: null, cheer: {}, shake: {}, confetti: [], lockUntil: 0, msg: null };
  function load(i) {
    const L = LEVELS[i], jars = deal(L);
    Object.assign(S, { li: i, L, jars, sel: -1, hist: [], movesN: 0, undos: 0, state: 'play', lt: 0, winT: 0, fly: null, cursor: 0, stuck: false, plan: null,
      par: (solve(jars) || []).length, hints: 0, hint: null, hintPlan: null, cheer: {}, shake: {}, confetti: [], lockUntil: S.t + .5, msg: null });
    API.autopilot = null;
  }
  // the solver doubles as the hint: show its next move from where you are now
  function hint() {
    if (S.state !== 'play' || S.hints >= 3) return;
    // keep following one plan while the player follows it: re-solving every time can pick a different route each
    // time and walk the player in circles
    const k = key(S.jars);
    if (!S.hintPlan || S.hintPlan.expect !== k || !S.hintPlan.moves.length) {
      const plan = solve(S.jars);
      if (!plan) { S.msg = { text: 'NO WAY OUT FROM HERE · UNDO FIRST', t: S.t }; Audio.sfx('bad'); S.hintPlan = null; return; }
      S.hintPlan = { moves: plan, expect: k };
    }
    const m = S.hintPlan.moves.shift(); if (!m) return;
    S.hintPlan.expect = key(apply(S.jars, m));
    S.hints++; S.hint = { a: m[0], b: m[1], t: S.t }; S.sel = -1; Audio.sfx('select');
  }
  function act(i) {
    if (S.state !== 'play' || i < 0 || i >= S.jars.length) return false;
    if (S.sel < 0) { if (S.jars[i].length) { S.sel = i; Audio.sfx('pin'); } return false; }
    const a = S.sel; S.sel = -1;
    if (a === i) { Audio.tone(300, .05, 'square', .05); return false; }
    if (!canMove(S.jars, a, i)) { S.shake[i] = S.t; Audio.sfx('bad'); return false; }
    S.hist.push(S.jars); S.jars = apply(S.jars, [a, i]); S.movesN++; S.hint = null;
    S.fly = { from: a, to: i, c: top(S.jars[i]), t: 0 };
    Audio.tone(330 * 2 ** (top(S.jars[i]) / 8) * (1 + S.jars[i].length * .12), .09, 'square', .07);
    if (done(S.jars[i]) && S.jars[i].length) {   // a full jar of one colour: they stand up and cheer
      S.cheer[i] = S.t; Audio.sfx('gate');
      const p = jarPos(i); for (let k = 0; k < 24; k++) S.confetti.push({ x: p.x + JW / 2, y: p.y - JH(), vx: (k % 8 - 3.5) * 40 + (k * 37 % 11), vy: -260 - (k * 53 % 140), c: COLS[(top(S.jars[i]) + k) % COLS.length], t: S.t });
    }
    if (solved(S.jars)) { S.state = 'win'; S.winT = 0; Audio.sfx('win'); }
    else S.stuck = moves(S.jars).length === 0;
    return true;
  }
  function undo() { if (S.state !== 'play' || !S.hist.length) return; S.jars = S.hist.pop(); S.sel = -1; S.undos++; S.stuck = false; Audio.sfx('select'); }
  function next() { Audio.sfx('select'); if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; Audio.sfx('start'); } }

  function update(dt) {
    S.t += dt; S.lt += dt;
    if (S.fly) { S.fly.t += dt / .18; if (S.fly.t >= 1) S.fly = null; }
    S.confetti = S.confetti.filter(c => S.t - c.t < 1.4);
    if (S.state === 'win') { S.winT += dt; return; }
    if (S.state !== 'play') return;
    if (API.autopilot === 'solve' && !S.fly) {
      if (!S.plan) S.plan = solve(S.jars) || [];
      const m = S.plan.shift(); if (m) { act(m[0]); act(m[1]); }
    }
  }

  // ---------- layout ----------
  const JW = 78, SLOT = 40, JH = () => SLOT * CAP + 18;
  function jarPos(i) {
    const n = S.jars.length, rows = n > 5 ? 2 : 1, perRow = Math.ceil(n / rows), row = Math.floor(i / perRow), k = i - row * perRow;
    const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow, gap = Math.min(24, (W - 40 - inRow * JW) / Math.max(1, inRow - 1));
    const total = inRow * JW + (inRow - 1) * gap, x = (W - total) / 2 + k * (JW + gap);
    const y = rows === 1 ? 560 : 440 + (CAP - 4) * 30 + row * (JH() + 90);
    return { x, y };   // y = jar bottom
  }

  // ---------- drawing ----------
  function stickman(x, y, c, s = 1, wave = 0) {   // lying on his side, head to the left
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    Draw.circ(ctx, -22, 0, 7);
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, 0);
    ctx.moveTo(-6, 0); ctx.lineTo(0, -8 - wave * 4); ctx.moveTo(-6, 0); ctx.lineTo(2, 8);
    ctx.moveTo(10, 0); ctx.lineTo(24, -7); ctx.moveTo(10, 0); ctx.lineTo(24, 7); ctx.stroke();
    ctx.fillStyle = '#fff'; Draw.circ(ctx, -24, -2, 2); ctx.restore();
  }
  let ctx;
  function background() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9ad8ff'); g.addColorStop(1, '#e8f6ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff99'; for (const [x, y, r] of [[80, 140, 34], [120, 150, 26], [420, 110, 30], [455, 122, 22]]) Draw.circ(ctx, x, y, r);
    ctx.fillStyle = '#c8a878'; ctx.fillRect(0, 860, W, 100);
  }
  function jar(i) {
    const p = jarPos(i), j = S.jars[i], sel = i === S.sel, full = done(j) && j.length;
    ctx.fillStyle = full ? '#fffbe0cc' : '#ffffffaa'; ctx.strokeStyle = sel ? '#ff5ab0' : i === S.cursor && !API.autopilot ? '#2a6ad0' : '#5a7a9a'; ctx.lineWidth = sel ? 6 : 4;
    const sh = S.shake[i] !== undefined && S.t - S.shake[i] < .35 ? Math.sin((S.t - S.shake[i]) * 60) * 6 * (1 - (S.t - S.shake[i]) / .35) : 0;
    ctx.save(); ctx.translate(sh, 0);
    const hinted = S.hint && (S.hint.a === i || S.hint.b === i) && S.t - S.hint.t < 4;
    if (hinted) { ctx.save(); ctx.strokeStyle = `rgba(255,210,58,${.6 + .4 * Math.sin(S.t * 10)})`; ctx.lineWidth = 10; Draw.rr(ctx, p.x - 6, p.y - JH() - 6, JW + 12, JH() + 12, 18); ctx.stroke(); ctx.restore(); }
    Draw.rr(ctx, p.x, p.y - JH(), JW, JH(), 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a7a9a'; Draw.rr(ctx, p.x - 6, p.y - JH() - 8, JW + 12, 12, 6); ctx.fill();
    j.forEach((c, k) => {
      if (sel && k === j.length - 1) return;
      if (S.fly && S.fly.to === i && k === j.length - 1) return;
      const ch = S.cheer[i] !== undefined ? S.t - S.cheer[i] : 9;
      if (ch < 1.6) { const jump = Math.abs(Math.sin(ch * 9 + k)) * 14 * (1 - ch / 1.6); standing(p.x + JW / 2 + (k % 2 ? 12 : -12), p.y - 12 - k * SLOT - jump, COLS[c], Math.sin(S.t * 14 + k) > 0); return; }
      const fidget = Math.sin(S.t * 2.3 + i * 1.7 + k * 2.1) > .93 ? 1 : 0;
      stickman(p.x + JW / 2, p.y - 12 - k * SLOT - SLOT / 2 + 8, COLS[c], .95, fidget);
    });
    if (sel && j.length) stickman(p.x + JW / 2, p.y - JH() - 40 + Math.sin(S.t * 8) * 4, COLS[top(j)], 1.05, Math.sin(S.t * 10) > 0 ? 1 : 0);
    if (full) { ctx.save(); ctx.translate(p.x + JW / 2, p.y - JH() - 30); ctx.scale(.6, .6); Draw.star(ctx, 0, 0, 22, '#ffd23a'); ctx.restore(); }
    if (hinted && S.hint.a === i) Draw.bigText(ctx, 'FROM', p.x + JW / 2, p.y + 22, 16, '#ffd23a', '#1a4aa0');
    if (hinted && S.hint.b === i) Draw.bigText(ctx, 'TO', p.x + JW / 2, p.y + 22, 16, '#ffd23a', '#1a4aa0');
    ctx.restore();
  }
  // a cheering stickman, upright, arms up
  function standing(x, y, c, up) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 4; ctx.lineCap = 'round';
    Draw.circ(ctx, 0, -30, 6); ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -8); ctx.moveTo(0, -8); ctx.lineTo(-6, 0); ctx.moveTo(0, -8); ctx.lineTo(6, 0);
    ctx.moveTo(0, -20); ctx.lineTo(-9, up ? -34 : -28); ctx.moveTo(0, -20); ctx.lineTo(9, up ? -28 : -34); ctx.stroke(); ctx.restore();
  }
  function hud() {
    Draw.bigText(ctx, 'STICK SWARM 3D', W / 2, 92, 40, '#fff', '#1a4aa0');
    Draw.bigText(ctx, `LEVEL ${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 134, 20, '#1a4aa0', '#fff');
    ctx.font = '700 18px Arial, sans-serif'; ctx.fillStyle = '#1a3a6a'; ctx.textAlign = 'center';
    ctx.fillText(`MOVES ${S.movesN} · PAR ${S.par}`, W / 2, 180);
    for (const [b, label] of [[BTN.undo, 'UNDO'], [BTN.hint, `HINT ${3 - S.hints}`], [BTN.restart, 'RESTART']]) { ctx.fillStyle = '#1a4aa0'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 24); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); Draw.bigText(ctx, label, b.x + b.w / 2, b.y + b.h / 2 + 2, 22, '#fff', '#0a2a6a'); }
    if (S.lt < 3.5 && S.li === 0 && S.movesN === 0) { ctx.globalAlpha = 1 - clamp((S.lt - 2.8) / .7); Draw.bigText(ctx, 'ONE COLOUR PER JAR', W / 2, 270, 28, '#fff', '#1a4aa0'); ctx.globalAlpha = 1; }
    if (S.stuck) Draw.bigText(ctx, 'NO MOVES LEFT · UNDO OR RESTART', W / 2, 270, 22, '#ff4a6a', '#fff');
    else if (S.msg && S.t - S.msg.t < 2.5) Draw.bigText(ctx, S.msg.text, W / 2, 270, 20, '#ff4a6a', '#fff');
  }
  const BTN = { undo: { x: 24, y: 880, w: 156, h: 56 }, hint: { x: 192, y: 880, w: 156, h: 56 }, restart: { x: 360, y: 880, w: 156, h: 56 }, next: { x: 150, y: 820, w: 240, h: 72 } };
  function render(c) {
    ctx = c; background();
    if (S.state === 'done') {
      Draw.bigText(ctx, 'DEMO COMPLETE', W / 2, 380, 50, '#fff', '#1a4aa0');
      Draw.bigText(ctx, 'THE SWARM IS SORTED.', W / 2, 450, 26, '#1a4aa0', '#fff');
      Draw.bigText(ctx, `ALL ${LEVELS.reduce((n, L) => n + L.colors * L.cap, 0)} OF THEM.`, W / 2, 490, 26, '#1a4aa0', '#fff');
      Draw.bigText(ctx, '(THE AD SAID 20,000.)', W / 2, 530, 20, '#1a4aa0', '#fff');
      Draw.bigText(ctx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 640, 18, '#1a4aa0', '#fff');
      return;
    }
    hud();
    for (let i = 0; i < S.jars.length; i++) jar(i);
    for (const c of S.confetti) { const k = S.t - c.t; ctx.globalAlpha = Math.max(0, 1 - k / 1.4); ctx.fillStyle = c.c; ctx.fillRect(c.x + c.vx * k, c.y + c.vy * k + 500 * k * k, 7, 4); } ctx.globalAlpha = 1;
    if (S.fly) {
      const a = jarPos(S.fly.from), b = jarPos(S.fly.to), k = S.fly.t, n = S.jars[S.fly.to].length - 1;
      const x = a.x + (b.x - a.x) * k + JW / 2, y0 = a.y - JH() - 40, y1 = b.y - 12 - n * SLOT - SLOT / 2 + 8;
      stickman(x, y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 50, COLS[S.fly.c], 1);
    }
    if (S.state === 'win') {
      const k = clamp(S.winT / .4); ctx.fillStyle = `rgba(10,30,80,${.5 * k})`; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 360); const bk = back(k); ctx.scale(bk, bk); Draw.bigText(ctx, 'LEVEL COMPLETE!', 0, 0, 46, '#4ad05a', '#0a3a1a'); ctx.restore();
      const stars = Math.min(S.hints ? 2 : 3, S.movesN <= S.par ? 3 : S.movesN <= S.par * 1.5 ? 2 : 1);
      for (let i = 0; i < 3; i++) { const kk = back(clamp((S.winT - .3 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 90, 460 - (i === 1 ? 16 : 0)); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 36, i < stars ? '#ffd23a' : '#5a6a8a'); ctx.restore(); } }
      Draw.bigText(ctx, `${S.movesN} MOVES · PAR ${S.par}`, W / 2, 560, 30, '#fff', '#0a2a6a');
      if (S.hints) Draw.bigText(ctx, `${S.hints} HINT${S.hints > 1 ? 'S' : ''} USED`, W / 2, 600, 20, '#ffe14a', '#0a2a6a');
      if (S.winT > 1.2) { const b = BTN.next; ctx.fillStyle = '#4ad05a'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 36); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); Draw.bigText(ctx, S.li < LEVELS.length - 1 ? 'NEXT' : 'FINISH', W / 2, b.y + b.h / 2 + 2, 30, '#fff'); }
    }
  }

  // ---------- input: tap a jar, then tap where he goes; ← → + Enter on keys/pad, U undo, R restart ----------
  const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function jarAt(x, y) { for (let i = 0; i < S.jars.length; i++) { const p = jarPos(i); if (x >= p.x - 8 && x <= p.x + JW + 8 && y >= p.y - JH() - 70 && y <= p.y + 10) return i; } return -1; }
  function onPointer(type, x, y) {
    if (type !== 'down' || S.t < S.lockUntil) return;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'win') { if (S.winT > 1.2) next(); return; }
    if (hit(BTN.undo, x, y)) { undo(); return; }
    if (hit(BTN.restart, x, y)) { load(S.li); Audio.sfx('select'); return; }
    if (hit(BTN.hint, x, y)) { hint(); return; }
    const i = jarAt(x, y); if (i >= 0) { S.cursor = i; act(i); } else S.sel = -1;
  }
  function onKey(key, down) {
    if (!down || S.t < S.lockUntil) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'win') { if (S.winT > 1.2 && (key === 'Enter' || key === ' ')) next(); return; }
    const n = S.jars.length;
    if (key === 'ArrowLeft' || key === 'a') S.cursor = (S.cursor + n - 1) % n;
    else if (key === 'ArrowRight' || key === 'd') S.cursor = (S.cursor + 1) % n;
    else if (key === 'ArrowUp' || key === 'ArrowDown') { const per = Math.ceil(n / (n > 5 ? 2 : 1)); S.cursor = (S.cursor + per) % n; }
    else if (key === 'Enter' || key === ' ') act(S.cursor);
    else if (key === 'u' || key === 'U' || key === 'Backspace') undo();
    else if (key === 'r' || key === 'R') load(S.li);
    else if (key === 'h' || key === 'H') hint();
  }

  const API = { LEVELS, S, load, act, undo, hint, solve: () => solve(S.jars), canMove: (a, b) => canMove(S.jars, a, b), autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
