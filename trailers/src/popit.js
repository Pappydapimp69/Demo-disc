// POP IT spoof ad: the fidget-ASMR lie. A rainbow pop-it board, a finger popping domes with sparkles and a
// climbing combo, one missed dome (FAIL), then the board flips for a mega combo, and the held call to action
// that fades back into the opening frame so the tile loops.
const COLS = ['#ff5a8a', '#ffa23a', '#ffe14a', '#5ad06a', '#4ab8ff', '#a77aff'];
const R = 6, C = 5, CELL = 112, BX = (W - C * CELL) / 2, BY = 340;
const cellXY = i => ({ x: BX + (i % C) * CELL + CELL / 2, y: BY + Math.floor(i / C) * CELL + CELL / 2 });
// snake order through the board; first pass misses dome 13 then fails, second pass (after the flip) is fast and clean
const SNAKE = [...Array(R * C).keys()].map(i => { const r = Math.floor(i / C), c = i % C; return r * C + (r % 2 ? C - 1 - c : c); });
const P1 = 3.0, D1 = .28, MISS = 13, FAILT = P1 + MISS * D1 + .4, FLIP = 9.6, P2 = 10.6, D2 = .17, MEGA = P2 + SNAKE.length * D2;
function popTimes(t) {
  const out = {}; // dome -> time it popped (in the current pass)
  if (t < FLIP) { for (let k = 0; k < MISS; k++) if (t >= P1 + k * D1) out[SNAKE[k]] = P1 + k * D1; }
  else if (t >= P2) for (let k = 0; k < SNAKE.length; k++) if (t >= P2 + k * D2) out[SNAKE[k]] = P2 + k * D2;
  return out;
}
function finger(t) {
  const pass = t < FLIP ? { t0: P1, d: D1, n: MISS + 1 } : { t0: P2, d: D2, n: SNAKE.length };
  const k = Math.floor((t - pass.t0) / pass.d) + 1; if (t < pass.t0 - pass.d || k > pass.n) return null;
  const kk = K.clamp(k, 0, pass.n - 1), a = cellXY(SNAKE[Math.max(0, kk - 1)]), b = cellXY(SNAKE[kk]);
  const m = K.ease(K.seg(t, pass.t0 + (kk - 1) * pass.d, pass.t0 + kk * pass.d - pass.d * .2));
  // the missed tap on the first pass lands a dome short
  const off = t < FLIP && kk === MISS ? -60 : 0;
  return { x: a.x + (b.x - a.x) * m + off, y: a.y + (b.y - a.y) * m + 20, press: K.clamp(1 - ((t - pass.t0) % pass.d) / .1) };
}
const FILM = {
  dur: 25,
  draw(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ffd6ec'); g.addColorStop(1, '#d8e8ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (t >= 20.6) {
      for (let i = 0; i < 6; i++) { ctx.fillStyle = COLS[i]; K.circ(ctx, 120 + i * 96, 420 + Math.sin(t * 4 + i) * 20, 40); }
      K.big(ctx, 'POP IT!', 360, 640, 150, '#ffe14a'); ctx.font = '800 32px system-ui'; ctx.fillStyle = '#2a1a4a'; ctx.textAlign = 'center';
      ctx.fillText('ONLY 1% CAN POP THEM ALL', 360, 760); ctx.fillText('SO. SATISFYING.', 360, 810);
      K.play(ctx, t); K.loopFade(ctx, t, 24.3, 25, (c, t0) => FILM.draw(c, t0)); return;
    }
    const pops = popTimes(t), combo = Object.keys(pops).length;
    K.bar(ctx, 'POP IT! SO SATISFYING', t < FLIP ? `COMBO ${combo}` : `MEGA COMBO ${combo}`);
    // the board, flipping over between passes
    const fl = K.seg(t, FLIP, FLIP + .8), sy = Math.abs(Math.cos(fl * Math.PI));
    ctx.save(); ctx.translate(W / 2, BY + R * CELL / 2); ctx.scale(1, sy); ctx.translate(-W / 2, -(BY + R * CELL / 2));
    ctx.fillStyle = '#fff'; K.rr(ctx, BX - 20, BY - 20, C * CELL + 40, R * CELL + 40, 50); ctx.fill();
    for (let i = 0; i < R * C; i++) {
      const { x, y } = cellXY(i), col = COLS[Math.floor(i / C) % 6], p = pops[i];
      ctx.fillStyle = col; K.rr(ctx, x - CELL / 2, y - CELL / 2, CELL, CELL, 0); ctx.fill();
      const down = p !== undefined, sq = down ? 1 - K.clamp((t - p) / .08) * .15 : 1;
      ctx.fillStyle = 'rgba(0,0,0,.18)'; K.circ(ctx, x, y + 4, 42);
      ctx.fillStyle = col; K.circ(ctx, x, y, 40 * sq);
      ctx.fillStyle = down ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.55)'; K.circ(ctx, down ? x : x - 12, down ? y : y - 12, down ? 26 : 11);
    }
    ctx.restore();
    // sparkles and +1s on every pop
    for (const [i, p] of Object.entries(pops)) {
      const k = t - p; if (k > .5) continue; const { x, y } = cellXY(+i);
      for (let s = 0; s < 8; s++) { const a = s / 8 * 6.28 + +i, d = 30 + k * 260; ctx.globalAlpha = 1 - k * 2; ctx.fillStyle = '#fff'; K.circ(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 7 - k * 10); }
      ctx.globalAlpha = 1 - k * 2; K.big(ctx, '+1', x, y - 50 - k * 80, 40, '#fff', '#e0306a'); ctx.globalAlpha = 1;
    }
    const f = finger(t); if (f && t < MEGA + .3) K.finger(ctx, f.x, f.y, f.press);
    K.fail(ctx, t > FAILT && t < FLIP ? t - FAILT : 0, 'MISSED!');
    if (t < 2.8) { ctx.font = '900 34px system-ui'; ctx.fillStyle = '#2a1a4a'; ctx.textAlign = 'center'; ctx.fillText('POP THEM ALL WITHOUT MISSING!', 360, 1100); }
    if (t > FLIP && t < P2) K.big(ctx, 'FLIP IT!', 360, 1100, 90, '#fff', '#e0306a');
    if (t > MEGA) {
      const k = t - MEGA;
      for (let i = 0; i < 90; i++) { const a = i * 2.4, d = k * (500 + (i % 9) * 60); ctx.fillStyle = COLS[i % 6]; K.circ(ctx, 360 + Math.cos(a) * d, 680 + Math.sin(a) * d, 14); }
      const s = K.back(K.clamp(k * 2.5)); ctx.save(); ctx.translate(360, 1110); ctx.scale(s, s); K.big(ctx, 'x30 SATISFYING!', 0, 0, 74, '#ffe14a', '#e0306a'); ctx.restore();
    }
  },
  score(ac) {
    const bpm = 100, beat = 60 / bpm;
    for (let b = 0; b * beat < 24.5; b++) {
      const t = b * beat; if (t > FAILT && t < FLIP) continue;
      const ch = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]][Math.floor(b / 4) % 4];
      ch.forEach(m => K.tone(ac, t, K.midi(m + (t > 20.6 ? 12 : 0)), beat * .95, 'sine', .035));
      K.tone(ac, t, K.midi(ch[0] - 24), beat * .5, 'triangle', .07); if (b % 2) K.noise(ac, t, .06, .08, 6000, 2);
    }
    // the pops: a soft click that climbs with the combo
    for (let k = 0; k < MISS; k++) { const t = P1 + k * D1; K.tone(ac, t, 380 * 2 ** (k / 24), .07, 'sine', .22, 700 * 2 ** (k / 24)); K.noise(ac, t, .03, .2, 1800, 3); }
    K.tone(ac, P1 + MISS * D1, 160, .2, 'triangle', .12, 90);
    [392, 370, 349, 330].forEach((f, i) => K.tone(ac, FAILT + i * .22, f / 2, i < 3 ? .2 : .5, 'sawtooth', .1));
    K.noise(ac, FLIP, .6, .2, 600, .6);
    for (let k = 0; k < SNAKE.length; k++) { const t = P2 + k * D2; K.tone(ac, t, 380 * 2 ** (k / 18), .06, 'sine', .22, 700 * 2 ** (k / 18)); K.noise(ac, t, .03, .2, 2200, 3); }
    [523, 659, 784, 1047].forEach((f, i) => K.tone(ac, MEGA + i * .12, f, i < 3 ? .14 : .6, 'square', .09)); K.noise(ac, MEGA, .8, .2, 5000, .5);
  },
};
