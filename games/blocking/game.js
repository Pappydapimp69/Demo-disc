// BLOCKING - playable demo.
// A stage-blocking puzzle: drag the actors so every seat in the house can see every actor.
// Seats light red while a sightline is cut. The geometry is the lesson: a stagger only clears
// the house with real sideways offset (about three body radii); a small nudge blocks nearly as much
// as standing in a straight line.
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const W = 540, H = 960;
  const PX = 42, OX = W / 2, OY = 400;          // 42 px per metre; stage front edge (y = 0) at screen y 400
  const R = 0.25, SNAP = 0.25, HIT = 30;          // actor body radius (m), drag snap (m), touch radius (px)
  const sx = x => OX + x * PX, sy = y => OY - y * PX;
  const wx = px => (px - OX) / PX, wy = py => (OY - py) / PX;

  // ---------- the house: seats in metres, audience below the stage looking up ----------
  const curve = (y, x0, x1, n, bow) => Array.from({ length: n }, (_, i) => { const x = x0 + (x1 - x0) * i / (n - 1); return { x, y: y + bow * (x / x1) * (x / x1) }; });
  const PROSCENIUM = [...curve(-3.5, -5, 5, 9, 1.2), ...curve(-6, -6, 6, 10, 1.6)];
  const THRUST = [...curve(-3.5, -4, 4, 7, 1), ...curve(-6, -5, 5, 8, 1.4),
    ...[0.5, 1.5, 2.5].map(y => ({ x: -5.6, y })), ...[0.5, 1.5, 2.5].map(y => ({ x: 5.6, y }))];

  // rules: near [a, b, max m] · down [a, b, min m] (a at least min downstage of b) · rows n (distinct depths >= .75 m apart)
  const LEVELS = [
    { name: 'TWO-HANDER', seats: PROSCENIUM, stage: { x0: -4, x1: 4, y0: 0, y1: 4 },
      tip: 'A PILLAR. TWO ACTORS. EVERY SEAT SEES BOTH.',
      actors: [{ n: 'ANA', c: '#ff5a8a', x: 0, y: 1 }, { n: 'BO', c: '#4ab0ff', x: 0, y: 3 }],
      props: [{ x: 0, y: 2, r: .35, n: 'PILLAR' }],
      rules: [{ near: [0, 1, 2.5] }],
      solution: [[-1, 1], [1, 1]] },
    { name: 'THE THRONE', seats: PROSCENIUM, stage: { x0: -4, x1: 4, y0: 0, y1: 4 },
      tip: 'COURTIERS STAND DOWNSTAGE OF THE KING. NOBODY BLOCKS HIM.',
      actors: [{ n: 'KING', c: '#ffd23a', x: 0, y: 3, fixed: true }, { n: 'LORD', c: '#4ab0ff', x: 0, y: 2 }, { n: 'LADY', c: '#ff5a8a', x: 0, y: 1 }],
      props: [],
      rules: [{ down: [1, 0, 1] }, { down: [2, 0, 1] }, { near: [1, 0, 2.5] }, { near: [2, 0, 2.5] }],
      solution: [[0, 3], [-2, 2], [2, 2]] },
    { name: 'THE CROWD', seats: PROSCENIUM, stage: { x0: -3, x1: 3, y0: 0, y1: 4 },
      tip: 'FOUR ACTORS ON THREE DEPTHS. A NUDGE IS NOT A STAGGER.',
      actors: [{ n: 'A', c: '#ff5a8a', x: 0, y: .5 }, { n: 'B', c: '#4ab0ff', x: 0, y: 1.5 }, { n: 'C', c: '#4ad05a', x: 0, y: 2.5 }, { n: 'D', c: '#ffd23a', x: 0, y: 3.5 }],
      props: [],
      rules: [{ rows: 3 }],
      solution: [[3, 0], [-.5, 2], [-1.5, 2], [-3, 1]],
      tight: [[-.25, .5], [0, 1.5], [.25, 2.5], [.5, 3.5]] },
    { name: 'THRUST STAGE', seats: THRUST, stage: { x0: -4, x1: 4, y0: 0, y1: 4 },
      tip: 'NOW THE HOUSE WRAPS THE SIDES. THE OLD TRICK MAY NOT HOLD.',
      actors: [{ n: 'A', c: '#ff5a8a', x: 0, y: .5 }, { n: 'B', c: '#4ab0ff', x: 0, y: 1.5 }, { n: 'C', c: '#4ad05a', x: 0, y: 2.5 }],
      props: [{ x: 0, y: 3.4, r: .35, n: 'TREE' }],
      rules: [{ rows: 3 }],
      solution: [[4, 3], [-2.5, 0], [.5, 1.5]] },
  ];

  // ---------- sightline geometry (pure) ----------
  // is the line from seat s to target t cut by a disc at o with radius r? (the target's own disc counts: two bodies overlap)
  function cuts(s, t, o, r) {
    const dx = t.x - s.x, dy = t.y - s.y, L2 = dx * dx + dy * dy;
    const u = ((o.x - s.x) * dx + (o.y - s.y) * dy) / L2;
    if (u <= 0 || u >= 1) return false;
    return Math.hypot(o.x - (s.x + u * dx), o.y - (s.y + u * dy)) < R + r;
  }
  function sightlines(L, pos) {
    const blockers = [...pos.map(p => ({ x: p.x, y: p.y, r: R })), ...L.props];
    const seat = L.seats.map(() => []);      // per seat: the actors it cannot see
    let pairs = 0;
    L.seats.forEach((s, si) => pos.forEach((a, ai) => {
      if (blockers.some((b, bi) => bi !== ai && cuts(s, a, b, b.r))) { seat[si].push(ai); pairs++; }
    }));
    return { seat, pairs };
  }
  function ruleResults(L, pos) {
    return L.rules.map(r => {
      if (r.near) { const [a, b, m] = r.near; return { ok: Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y) <= m + 1e-9, text: `${L.actors[a].n} WITHIN ${m}M OF ${L.actors[b].n}` }; }
      if (r.down) { const [a, b, m] = r.down; return { ok: pos[a].y <= pos[b].y - m + 1e-9, text: `${L.actors[a].n} ${m}M DOWNSTAGE OF ${L.actors[b].n}` }; }
      if (r.rows) {
        const ys = pos.map(p => p.y).sort((x, y) => x - y); let rows = 1, last = ys[0];
        for (const y of ys) if (y - last >= .75 - 1e-9) { rows++; last = y; }
        return { ok: rows >= r.rows, text: `ACTORS ON ${r.rows}+ DEPTHS (${rows} NOW)` };
      }
    });
  }
  function evaluate(L, pos) {
    const sl = sightlines(L, pos), rules = ruleResults(L, pos);
    return { ...sl, rules, solved: sl.pairs === 0 && rules.every(r => r.ok) };
  }

  // ---------- state ----------
  const S = { li: 0, L: null, pos: [], state: 'play', t: 0, t0: 0, sel: 0, drag: null, ev: null, flash: 0, winT: 0, tries: 0 };
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, pos: L.actors.map(a => ({ x: a.x, y: a.y })), state: 'play', t: 0, t0: 0, sel: L.actors.findIndex(a => !a.fixed), drag: null, flash: 0, winT: 0, tries: 0 });
    S.ev = evaluate(L, S.pos);
  }
  const snap = v => Math.round(v / SNAP) * SNAP;
  function place(i, x, y) {
    const L = S.L, a = L.actors[i]; if (!a || a.fixed || S.state !== 'play') return false;
    const st = L.stage, p = { x: clamp(snap(x), st.x0, st.x1), y: clamp(snap(y), st.y0, st.y1) };
    // bodies and props can't overlap
    if (S.pos.some((q, j) => j !== i && Math.hypot(q.x - p.x, q.y - p.y) < 2 * R - 1e-9)) return false;
    if (L.props.some(q => Math.hypot(q.x - p.x, q.y - p.y) < R + q.r - 1e-9)) return false;
    if (p.x === S.pos[i].x && p.y === S.pos[i].y) return true;
    S.pos[i] = p; S.ev = evaluate(L, S.pos);
    Audio.tone(S.ev.pairs ? 300 : 600, .04, 'square', .03);
    return true;
  }
  function curtain() {
    if (S.state !== 'play') return;
    S.tries++;
    if (S.ev.solved) { S.state = 'win'; S.winT = 0; Audio.sfx('win'); }
    else { S.flash = 1; Audio.sfx('bad'); }
  }
  function next() { Audio.sfx('select'); if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; Audio.sfx('start'); } }

  function update(dt) {
    S.t += dt; S.flash = Math.max(0, S.flash - dt * 1.5);
    if (S.state === 'win') S.winT += dt;
  }

  // ---------- drawing ----------
  const BTN = { x: 150, y: 860, w: 240, h: 64 };
  function background(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a0a12'); g.addColorStop(1, '#0a0410'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function stage(ctx) {
    const st = S.L.stage;
    // curtains
    ctx.fillStyle = '#7a0a1e'; ctx.fillRect(0, sy(st.y1) - 40, W, 34);
    for (let k = 0; k < 18; k++) { ctx.fillStyle = k % 2 ? '#8a1428' : '#6a0818'; ctx.fillRect(k * 30, sy(st.y1) - 40, 15, 34); }
    // boards
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx(st.x0), sy(st.y1), (st.x1 - st.x0) * PX, (st.y1 - st.y0) * PX);
    ctx.strokeStyle = '#00000033'; ctx.lineWidth = 1;
    for (let x = st.x0; x <= st.x1; x += .5) { ctx.beginPath(); ctx.moveTo(sx(x), sy(st.y1)); ctx.lineTo(sx(x), sy(st.y0)); ctx.stroke(); }
    ctx.strokeStyle = '#ffffff10'; for (let y = st.y0; y <= st.y1; y += .25) { ctx.beginPath(); ctx.moveTo(sx(st.x0), sy(y)); ctx.lineTo(sx(st.x1), sy(y)); ctx.stroke(); }
    ctx.fillStyle = '#ffe14a'; ctx.fillRect(sx(st.x0), sy(0) - 3, (st.x1 - st.x0) * PX, 6);   // apron edge / footlights
    ctx.font = '700 11px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff55';
    ctx.fillText('UPSTAGE', W / 2, sy(st.y1) + 14); ctx.fillText('DOWNSTAGE', W / 2, sy(0) - 8);
  }
  function seats(ctx) {
    const sel = S.drag ? S.drag.i : -1;
    S.L.seats.forEach((s, i) => {
      const bad = S.ev.seat[i].length, x = sx(s.x), y = sy(s.y);
      // the dragged actor's cut sightlines are drawn so the player sees what they're fixing
      if (sel >= 0 && S.ev.seat[i].includes(sel)) { ctx.strokeStyle = '#ff4a6a88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx(S.pos[sel].x), sy(S.pos[sel].y)); ctx.stroke(); }
      ctx.fillStyle = bad ? '#ff4a6a' : '#4ad05a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      Draw.rr(ctx, x - 9, y - 7, 18, 14, 4); ctx.fill(); ctx.stroke();
      if (bad) { ctx.fillStyle = '#fff'; ctx.font = '700 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(bad), x, y + 1); ctx.textBaseline = 'alphabetic'; }
    });
  }
  function actors(ctx) {
    for (const p of S.L.props) { ctx.fillStyle = '#9a9aa8'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r * PX, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#222'; ctx.font = '700 9px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.n, sx(p.x), sy(p.y) + 3); }
    S.L.actors.forEach((a, i) => {
      const p = S.pos[i], x = sx(p.x), y = sy(p.y), hidden = S.ev.seat.some(l => l.includes(i));
      if (i === S.sel && S.state === 'play') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, R * PX + 8, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = a.c; ctx.strokeStyle = hidden ? '#ff2a4a' : '#000'; ctx.lineWidth = hidden ? 4 : 3;
      ctx.beginPath(); ctx.arc(x, y, R * PX + 2, 0, 7); ctx.fill(); ctx.stroke();
      if (a.fixed) { ctx.fillStyle = '#000'; ctx.fillRect(x - 6, y - 16, 12, 4); }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = '900 12px Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.strokeText(a.n, x, y - 18); ctx.fillText(a.n, x, y - 18);
    });
  }
  function hud(ctx) {
    Draw.bigText(ctx, 'BLOCKING', W / 2, 36, 38, '#ffe14a');
    Draw.bigText(ctx, `SCENE ${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 72, 17, '#ffd0d8');
    ctx.font = '700 13px Arial, sans-serif'; ctx.fillStyle = '#ffffffcc'; ctx.textAlign = 'center'; ctx.fillText(S.L.tip, W / 2, 98);
    // checklist
    let y = 720;
    const row = (ok, text) => { ctx.fillStyle = ok ? '#4ad05a' : '#ff6a8a'; ctx.font = '700 15px Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${ok ? '✓' : '✗'}  ${text}`, 60, y); y += 26; };
    row(S.ev.pairs === 0, S.ev.pairs ? `${S.ev.pairs} BLOCKED SIGHTLINE${S.ev.pairs > 1 ? 'S' : ''}` : 'EVERY SEAT SEES EVERY ACTOR');
    for (const r of S.ev.rules) row(r.ok, r.text);
    const live = S.ev.solved;
    ctx.fillStyle = live ? '#4ad05a' : '#5a4a5a'; Draw.rr(ctx, BTN.x, BTN.y, BTN.w, BTN.h, 32); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    Draw.bigText(ctx, 'CURTAIN UP', W / 2, BTN.y + BTN.h / 2 + 2, 28, '#fff');
    if (S.flash > 0) { ctx.globalAlpha = S.flash; Draw.bigText(ctx, 'THE HOUSE CAN\'T SEE!', W / 2, 560, 40, '#ff6a8a'); ctx.globalAlpha = 1; }
    if (S.t < 3 && S.tries === 0) { ctx.globalAlpha = 1 - clamp((S.t - 2.3) / .7); Draw.bigText(ctx, 'DRAG THE ACTORS', W / 2, 160, 24, '#fff'); ctx.globalAlpha = 1; }
  }
  function render(ctx) {
    background(ctx);
    if (S.state === 'done') {
      Draw.bigText(ctx, 'DEMO COMPLETE', W / 2, 400, 50, '#ffe14a');
      Draw.bigText(ctx, 'THE HOUSE SAW EVERYTHING', W / 2, 470, 24, '#fff');
      Draw.bigText(ctx, 'BLOCKING', W / 2, 520, 34, '#ffe14a');
      Draw.bigText(ctx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 660, 18, '#ffc8d0');
      return;
    }
    stage(ctx); seats(ctx); actors(ctx); hud(ctx);
    if (S.state === 'win') {
      const k = clamp(S.winT / .4); ctx.fillStyle = `rgba(0,0,0,${.55 * k})`; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, 420); const b = back(k); ctx.scale(b, b); Draw.bigText(ctx, 'BRAVO!', 0, 0, 72, '#ffe14a'); ctx.restore();
      const stars = S.tries <= 1 ? 3 : S.tries <= 3 ? 2 : 1;
      for (let i = 0; i < 3; i++) { const kk = back(clamp((S.winT - .3 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 90, 520 - (i === 1 ? 16 : 0)); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 36, i < stars ? '#ffd23a' : '#4a3a4a'); ctx.restore(); } }
      if (S.winT > 1.2) { ctx.fillStyle = '#4ad05a'; Draw.rr(ctx, BTN.x, BTN.y, BTN.w, BTN.h, 32); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); Draw.bigText(ctx, S.li < LEVELS.length - 1 ? 'NEXT SCENE' : 'FINISH', W / 2, BTN.y + BTN.h / 2 + 2, 28, '#fff'); }
    }
  }

  // ---------- input: drag an actor; or 1-4 / Enter to pick one and arrows to walk them ----------
  const inBtn = (x, y) => x >= BTN.x && x <= BTN.x + BTN.w && y >= BTN.y && y <= BTN.y + BTN.h;
  function actorAt(x, y) {
    let best = -1, bd = HIT;
    S.pos.forEach((p, i) => { const d = Math.hypot(sx(p.x) - x, sy(p.y) - y); if (!S.L.actors[i].fixed && d < bd) { bd = d; best = i; } });
    return best;
  }
  function onPointer(type, x, y) {
    if (type === 'down') {
      if (S.state === 'done') { Engine.exit(); return; }
      if (S.state === 'win') { if (S.winT > 1.2) next(); return; }
      if (inBtn(x, y)) { curtain(); return; }
      const i = actorAt(x, y); if (i >= 0) { S.sel = i; S.drag = { i }; Audio.sfx('select'); }
    } else if (type === 'move' && S.drag) place(S.drag.i, wx(x), wy(y));
    else if (type === 'up' || type === 'cancel') S.drag = null;
  }
  function cycle() { const n = S.L.actors.length; for (let k = 1; k <= n; k++) { const j = (S.sel + k) % n; if (!S.L.actors[j].fixed) { S.sel = j; break; } } Audio.sfx('select'); }
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'win') { if (S.winT > 1.2 && (key === 'Enter' || key === ' ')) next(); return; }
    if (/^[1-9]$/.test(key)) { const j = +key - 1; if (S.L.actors[j] && !S.L.actors[j].fixed) S.sel = j; return; }
    if (key === 'Tab' || key === 'Enter') { cycle(); return; }
    if (key === ' ' || key === 'c' || key === 'C') { curtain(); return; }
    const d = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, SNAP], ArrowDown: [0, -SNAP] }[key];
    if (d && S.sel >= 0) { const p = S.pos[S.sel]; place(S.sel, p.x + d[0], p.y + d[1]); }
  }
  window.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key === ' ') e.preventDefault(); });

  const API = { LEVELS, S, load, place, curtain, evaluate: pos => evaluate(S.L, pos), step: n => game.step(n), get state() { return S.state; },
    // place every actor at once (a level's solution, or any layout a test wants to try)
    arrange(layout) { layout.forEach(([x, y], i) => { if (!S.L.actors[i].fixed) { S.pos[i] = { x: -99 - i, y: -99 }; } }); layout.forEach(([x, y], i) => place(i, x, y)); S.ev = evaluate(S.L, S.pos); } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
