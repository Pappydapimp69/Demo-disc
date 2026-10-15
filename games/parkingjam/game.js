// PARKING JAM - playable demo.
// The ad is a car-unblocking puzzle. The game is a gem match-3. There are no cars in it.
// Swap two neighbouring gems to line up 3 or more; reach the target score before you run out of moves.
(function () {
  'use strict';
  const { createGame, Audio, Draw, ease, back, clamp } = Engine;
  const W = 540, H = 960, COLS = 7, ROWS = 8, CELL = 70, BX = (W - COLS * CELL) / 2, BY = 250, TYPES = 6;
  const GEM = [
    { col: '#ff4a6a', dark: '#a01a3a', shape: 'diamond' },
    { col: '#3aa0ff', dark: '#1a4aa0', shape: 'circle' },
    { col: '#4ad05a', dark: '#1a7a2a', shape: 'square' },
    { col: '#ffd23a', dark: '#a07a10', shape: 'star' },
    { col: '#b05aff', dark: '#5a1aa0', shape: 'tri' },
    { col: '#ff9a3a', dark: '#a04a10', shape: 'hex' },
  ];
  const LEVELS = [
    { name: 'THE ROYAL VAULT', target: 1200, moves: 15, seed: 11 },
    { name: 'CRYSTAL CAVES', target: 1500, moves: 16, seed: 23 },
    { name: "THE QUEEN'S TREASURY", target: 1800, moves: 18, seed: 37 },
  ];
  const SWAP = .14, CLEAR = .2, FALL = .2;

  // seeded RNG so every level (and every test run) deals the same gems
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- board logic (pure: works on a grid array, no animation) ----------
  const at = (g, c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? -1 : g[r * COLS + c];
  function findMatches(g) {
    const hit = new Set();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 2; c++) { const v = at(g, c, r); if (v >= 0 && v === at(g, c + 1, r) && v === at(g, c + 2, r)) { let e = c; while (at(g, e + 1, r) === v) e++; for (let k = c; k <= e; k++) hit.add(r * COLS + k); } }
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 2; r++) { const v = at(g, c, r); if (v >= 0 && v === at(g, c, r + 1) && v === at(g, c, r + 2)) { let e = r; while (at(g, c, e + 1) === v) e++; for (let k = r; k <= e; k++) hit.add(k * COLS + c); } }
    return hit;
  }
  function swapped(g, a, b) { const h = g.slice(); [h[a], h[b]] = [h[b], h[a]]; return h; }
  function validMoves(g) {
    const out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c;
      if (c < COLS - 1) { const h = swapped(g, a, a + 1); const m = findMatches(h); if (m.size) out.push({ a, b: a + 1, gain: m.size }); }
      if (r < ROWS - 1) { const h = swapped(g, a, a + COLS); const m = findMatches(h); if (m.size) out.push({ a, b: a + COLS, gain: m.size }); }
    }
    return out;
  }
  function deal(rng) {
    for (;;) {
      const g = [];
      for (let i = 0; i < COLS * ROWS; i++) {
        let v; do { v = (rng() * TYPES) | 0; } while ((i % COLS >= 2 && g[i - 1] === v && g[i - 2] === v) || (i >= 2 * COLS && g[i - COLS] === v && g[i - 2 * COLS] === v));
        g.push(v);
      }
      if (validMoves(g).length) return g;
    }
  }

  // ---------- state ----------
  const S = { li: 0, L: null, state: 'play', phase: 'idle', pt: 0, t: 0, grid: [], fall: [], clearing: new Set(), swapAB: null, undo: false,
    score: 0, shown: 0, moves: 0, combo: 0, sel: -1, cursor: 24, pops: [], rng: null, drag: null, t0: 0, winT: 0 };
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, state: 'play', phase: 'idle', pt: 0, t: 0, rng: mkRng(L.seed), score: 0, shown: 0, moves: L.moves, combo: 0, sel: -1, cursor: 24, pops: [], clearing: new Set(), swapAB: null, undo: false, winT: 0 });
    S.grid = deal(S.rng); S.fall = S.grid.map(() => 0);
    API.autopilot = null;
  }

  function trySwap(a, b) {
    if (S.state !== 'play' || S.phase !== 'idle' || a < 0 || b < 0) return;
    const ca = a % COLS, ra = (a / COLS) | 0, cb = b % COLS, rb = (b / COLS) | 0;
    if (Math.abs(ca - cb) + Math.abs(ra - rb) !== 1) return;
    S.swapAB = [a, b]; S.phase = 'swap'; S.pt = 0; S.sel = -1;
    S.undo = !findMatches(swapped(S.grid, a, b)).size;
    Audio.sfx('select');
  }
  function settle() {
    // after the board stops moving: win, out of moves, or no moves left (reshuffle)
    S.combo = 0; S.phase = 'idle';
    if (S.score >= S.L.target) { S.state = 'win'; S.winT = 0; Audio.sfx('win'); return; }
    if (S.moves <= 0) { S.state = 'fail'; S.reason = 'OUT OF MOVES'; S.t0 = S.t; Audio.sfx('fail'); return; }
    if (!validMoves(S.grid).length) { S.grid = deal(S.rng); S.fall = S.grid.map(() => 3); S.phase = 'fall'; S.pt = 0; pop('SHUFFLE!', '#fff'); }
  }
  function pop(text, col) { S.pops.push({ text, col, t: S.t }); }

  function update(dt) {
    S.t += dt;
    S.shown += (S.score - S.shown) * Math.min(1, dt * 10);
    if (S.state === 'win') { S.winT += dt; return; }
    if (S.state !== 'play') return;
    S.pt += dt;
    if (S.phase === 'idle') {
      const auto = API.autopilot;
      if (auto && S.pt > .05) {
        const mv = validMoves(S.grid); mv.sort((x, y) => auto === 'best' ? y.gain - x.gain || x.a - y.a : x.gain - y.gain || y.a - x.a);
        if (mv[0]) trySwap(mv[0].a, mv[0].b);
      }
    } else if (S.phase === 'swap' && S.pt >= SWAP) {
      const [a, b] = S.swapAB;
      if (S.undo) { S.phase = 'unswap'; S.pt = 0; Audio.sfx('bad'); return; }
      S.grid = swapped(S.grid, a, b); S.swapAB = null; S.moves--;
      S.clearing = findMatches(S.grid); S.phase = 'clear'; S.pt = 0; S.combo = 1; scoreClear();
    } else if (S.phase === 'unswap' && S.pt >= SWAP) { S.swapAB = null; S.phase = 'idle'; S.pt = 0; }
    else if (S.phase === 'clear' && S.pt >= CLEAR) {
      // gravity + refill: each column drops, new gems fall in from above
      S.fall = S.grid.map(() => 0);
      for (let c = 0; c < COLS; c++) {
        const keep = [];
        for (let r = ROWS - 1; r >= 0; r--) { const i = r * COLS + c; if (!S.clearing.has(i)) keep.push([S.grid[i], r]); }
        let r = ROWS - 1;
        for (const [v, from] of keep) { S.grid[r * COLS + c] = v; S.fall[r * COLS + c] = r - from; r--; }
        const fresh = r + 1;
        for (; r >= 0; r--) { S.grid[r * COLS + c] = (S.rng() * TYPES) | 0; S.fall[r * COLS + c] = fresh; }
      }
      S.clearing = new Set(); S.phase = 'fall'; S.pt = 0;
    } else if (S.phase === 'fall' && S.pt >= FALL) {
      S.fall = S.grid.map(() => 0);
      const m = findMatches(S.grid);
      if (m.size) { S.combo++; S.clearing = m; S.phase = 'clear'; S.pt = 0; scoreClear(); }
      else settle();
    }
  }
  function scoreClear() {
    const n = S.clearing.size, pts = n * 20 * S.combo + (n >= 4 ? 40 * (n - 3) : 0);
    S.score += pts;
    Audio.tone(520 + S.combo * 120, .12, 'square', .08); Audio.tone(780 + S.combo * 160, .14, 'sine', .08, null, .05);
    if (S.combo >= 2) pop(S.combo >= 4 ? 'DAZZLING!' : S.combo === 3 ? 'SPLENDID!' : 'NICE!', '#ffe14a');
    else if (n >= 5) pop('BRILLIANT!', '#ff9aff');
  }

  // ---------- drawing ----------
  const cellXY = i => ({ x: BX + (i % COLS) * CELL + CELL / 2, y: BY + ((i / COLS) | 0) * CELL + CELL / 2 });
  function gem(ctx, v, x, y, s = 1, glow = 0) {
    const G = GEM[v], r = CELL * .36 * s;
    ctx.save(); ctx.translate(x, y);
    if (glow) { ctx.fillStyle = `rgba(255,255,255,${glow * .5})`; Draw.circ(ctx, 0, 0, r * 1.35); }
    ctx.fillStyle = G.col; ctx.strokeStyle = G.dark; ctx.lineWidth = 3; ctx.beginPath();
    switch (G.shape) {
      case 'diamond': ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); break;
      case 'circle': ctx.arc(0, 0, r * .92, 0, 7); break;
      case 'square': ctx.roundRect(-r * .8, -r * .8, r * 1.6, r * 1.6, r * .25); break;
      case 'tri': ctx.moveTo(0, -r); ctx.lineTo(r * .95, r * .75); ctx.lineTo(-r * .95, r * .75); break;
      case 'hex': for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } break;
      case 'star': for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * .5 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } break;
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * .28, -r * .32, r * .26, r * .14, -.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  function background(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a1a6a'); g.addColorStop(1, '#1a0a3a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let k = 0; k < 9; k++) Draw.circ(ctx, (k * 137) % W, (k * 251) % H, 40 + (k % 3) * 30);
  }
  function crown(ctx, x, y, s) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#a07a10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-30, 14); ctx.lineTo(-34, -14); ctx.lineTo(-15, 0); ctx.lineTo(0, -22); ctx.lineTo(15, 0); ctx.lineTo(34, -14); ctx.lineTo(30, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff4a6a'; Draw.circ(ctx, 0, 2, 5); ctx.restore(); }
  function hud(ctx) {
    crown(ctx, W / 2, 40, 1);
    Draw.bigText(ctx, 'PARKING JAM', W / 2, 84, 40, '#ffe14a');
    Draw.bigText(ctx, `LEVEL ${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 124, 18, '#e0d0ff');
    // score bar
    ctx.fillStyle = '#0006'; Draw.rr(ctx, 40, 150, 300, 70, 16); ctx.fill(); Draw.rr(ctx, 360, 150, 140, 70, 16); ctx.fill();
    const k = clamp(S.shown / S.L.target);
    ctx.fillStyle = '#ffffff22'; Draw.rr(ctx, 56, 196, 268, 12, 6); ctx.fill();
    ctx.fillStyle = '#ffd23a'; Draw.rr(ctx, 56, 196, 268 * k, 12, 6); ctx.fill();
    ctx.font = '700 16px Arial, sans-serif'; ctx.fillStyle = '#e0d0ff'; ctx.textAlign = 'left'; ctx.fillText(`SCORE  ${Math.round(S.shown)} / ${S.L.target}`, 56, 182);
    ctx.textAlign = 'center'; ctx.fillText('MOVES', 430, 172);
    Draw.bigText(ctx, String(S.moves), 430, 200, 30, S.moves <= 3 ? '#ff6a6a' : '#fff');
  }
  function board(ctx) {
    ctx.fillStyle = '#00000055'; Draw.rr(ctx, BX - 10, BY - 10, COLS * CELL + 20, ROWS * CELL + 20, 18); ctx.fill();
    for (let i = 0; i < COLS * ROWS; i++) { const p = cellXY(i); ctx.fillStyle = ((i % COLS) + ((i / COLS) | 0)) % 2 ? '#ffffff10' : '#ffffff1c'; ctx.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL); }
    // selection / cursor
    for (const [i, col] of [[S.cursor, '#ffffff55'], [S.sel, '#ffe14a']]) if (i >= 0) { const p = cellXY(i); ctx.strokeStyle = col; ctx.lineWidth = 4; Draw.rr(ctx, p.x - CELL / 2 + 3, p.y - CELL / 2 + 3, CELL - 6, CELL - 6, 10); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(BX - 10, BY - 10, COLS * CELL + 20, ROWS * CELL + 20); ctx.clip();
    for (let i = 0; i < COLS * ROWS; i++) {
      let p = cellXY(i), s = 1, glow = 0;
      if (S.swapAB && (i === S.swapAB[0] || i === S.swapAB[1])) {
        const o = i === S.swapAB[0] ? S.swapAB[1] : S.swapAB[0], q = cellXY(o);
        const k = S.phase === 'swap' ? ease(clamp(S.pt / SWAP)) : 1 - ease(clamp(S.pt / SWAP));
        p = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
      }
      if (S.phase === 'clear' && S.clearing.has(i)) { const k = clamp(S.pt / CLEAR); s = 1 + k * .4; glow = 1 - k; ctx.globalAlpha = 1 - k; }
      if (S.phase === 'fall' && S.fall[i]) { const k = ease(clamp(S.pt / FALL)); p = { x: p.x, y: p.y - S.fall[i] * CELL * (1 - k) }; }
      gem(ctx, S.grid[i], p.x, p.y, s, glow);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function btn(ctx, label, cy, colr) { ctx.fillStyle = colr; Draw.rr(ctx, 150, cy - 36, 240, 72, 36); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); Draw.bigText(ctx, label, W / 2, cy + 2, 30, '#fff'); }

  function render(ctx) {
    background(ctx);
    if (S.state === 'done') {
      crown(ctx, W / 2, 300, 2.2);
      Draw.bigText(ctx, 'DEMO COMPLETE', W / 2, 400, 50, '#ffe14a');
      Draw.bigText(ctx, 'THANK YOU FOR PLAYING', W / 2, 470, 26, '#fff');
      Draw.bigText(ctx, 'PARKING JAM', W / 2, 510, 34, '#ffe14a');
      Draw.bigText(ctx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 660, 18, '#c8b8ff');
      return;
    }
    hud(ctx); board(ctx);
    for (const pp of S.pops) { const k = clamp((S.t - pp.t) / 1.0); if (k < 1) { ctx.globalAlpha = 1 - k; Draw.bigText(ctx, pp.text, W / 2, 520 - k * 70, 54, pp.col); ctx.globalAlpha = 1; } }
    if (S.state === 'play' && S.t < 3 && S.moves === S.L.moves) { ctx.globalAlpha = 1 - clamp((S.t - 2.3) / .7); Draw.bigText(ctx, 'SWAP GEMS · MATCH 3', W / 2, 870, 24, '#fff'); ctx.globalAlpha = 1; }
    if (S.state === 'fail') { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); Draw.bigText(ctx, 'OUT OF MOVES', W / 2, 430, 56, '#ff6a8a'); Draw.bigText(ctx, `${S.score} / ${S.L.target}`, W / 2, 500, 30, '#fff'); if (S.t - S.t0 > .5) btn(ctx, 'TRY AGAIN', 840, '#4ad05a'); }
    if (S.state === 'win') {
      const k = clamp(S.winT / .4); ctx.fillStyle = `rgba(0,0,0,${.5 * k})`; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 420); const b = back(k); ctx.scale(b, b); Draw.bigText(ctx, 'LEVEL COMPLETE', 0, 0, 52, '#ffe14a'); ctx.restore();
      for (let i = 0; i < 3; i++) { const kk = back(clamp((S.winT - .3 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 90, 520 - (i === 1 ? 16 : 0)); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 36, '#ffd23a'); ctx.restore(); } }
      if (S.winT > 1.2) btn(ctx, S.li < LEVELS.length - 1 ? 'NEXT' : 'FINISH', 840, '#4ad05a');
    }
  }

  // ---------- input: drag a gem toward a neighbour, or tap one then tap a neighbour ----------
  function cellAt(x, y) { const c = Math.floor((x - BX) / CELL), r = Math.floor((y - BY) / CELL); return c >= 0 && r >= 0 && c < COLS && r < ROWS ? r * COLS + c : -1; }
  function next() { Audio.sfx('select'); if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; Audio.sfx('start'); } }
  function onPointer(type, x, y) {
    if (type === 'down') {
      Audio.unlock();
      if (S.state === 'fail' && S.t - S.t0 > .5) { load(S.li); return; }
      if (S.state === 'win' && S.winT > 1.2) { next(); return; }
      if (S.state === 'done') { Engine.exit(); return; }
      const i = cellAt(x, y); if (i < 0) return;
      S.cursor = i;
      if (S.sel >= 0 && S.sel !== i) { const a = S.sel; S.sel = -1; trySwap(a, i); if (S.phase === 'idle') S.sel = i; return; }
      S.sel = i; S.drag = { i, x, y };
    } else if (type === 'move' && S.drag) {
      const dx = x - S.drag.x, dy = y - S.drag.y;
      if (Math.hypot(dx, dy) > CELL * .4) {
        const i = S.drag.i, c = i % COLS, r = (i / COLS) | 0;
        const j = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (c < COLS - 1 ? i + 1 : -1) : (c > 0 ? i - 1 : -1)) : (dy > 0 ? (r < ROWS - 1 ? i + COLS : -1) : (r > 0 ? i - COLS : -1));
        S.drag = null; trySwap(i, j);
      }
    } else if (type === 'up' || type === 'cancel') S.drag = null;
  }
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'fail' && (key === 'Enter' || key === ' ')) { load(S.li); return; }
    if (S.state === 'win' && S.winT > 1.2 && (key === 'Enter' || key === ' ')) { next(); return; }
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    const c = S.cursor % COLS, r = (S.cursor / COLS) | 0;
    const mv = { ArrowLeft: c > 0 ? -1 : 0, ArrowRight: c < COLS - 1 ? 1 : 0, ArrowUp: r > 0 ? -COLS : 0, ArrowDown: r < ROWS - 1 ? COLS : 0 }[key];
    if (mv !== undefined) { if (S.sel >= 0) { trySwap(S.sel, S.sel + mv); S.sel = -1; } S.cursor += mv; return; }
    if (key === 'Enter' || key === ' ') S.sel = S.sel === S.cursor ? -1 : S.cursor;
  }

  const API = { LEVELS, S, load, trySwap, validMoves: () => validMoves(S.grid), autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
