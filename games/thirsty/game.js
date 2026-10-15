// THIRSTY - playable demo (sketchbook style).
// Draw lines to steer the water into the glass, then CLOSE THE TAP. Fill him to the line and stop:
// leave the water running and he gets greedy, grabs your pencil and drinks until he pops.
// Stars for using less ink.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const W = 720, H = 1280;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
  const GRAPHITE = '#34343e', PAPER = '#f4efe2', WATER = '#3a8ad0', RED = '#d8483a';
  const FONT = s => `800 ${s}px "Comic Sans MS", "Chalkboard SE", Inter, sans-serif`;
  let cx = null, frameSeed = 0;

  function sketch(pts, { w = 4, col = GRAPHITE, seed = 1, amt = 1.6, closed = false, fill = null } = {}) {
    for (let pass = 0; pass < 2; pass++) {
      cx.beginPath();
      pts.forEach(([x, y], i) => { const j = hash((frameSeed * 131 + seed * 977 + i * 31 + pass * 7) | 0) - .5, k = hash((frameSeed * 71 + seed * 313 + i * 17 + pass * 3) | 0) - .5; if (i) cx.lineTo(x + j * amt * 2, y + k * amt * 2); else cx.moveTo(x + j * amt * 2, y + k * amt * 2); });
      if (closed) cx.closePath();
      if (fill && pass === 0) { cx.fillStyle = fill; cx.fill(); }
      cx.strokeStyle = col; cx.globalAlpha = pass ? .45 : .9; cx.lineWidth = pass ? w * .6 : w; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.stroke();
    }
    cx.globalAlpha = 1;
  }
  function text(s, x, y, size, col = GRAPHITE, align = 'center') { cx.font = FONT(size); cx.textAlign = align; cx.fillStyle = col; cx.fillText(s, x, y); }
  function star(x, y, r, filled, seed) { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; p.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); } sketch(p, { w: 4, seed, closed: true, fill: filled ? '#ffc83a' : null }); }
  function pencil(x, y, ang = -.65) {
    cx.save(); cx.translate(x, y); cx.rotate(ang);
    cx.fillStyle = '#f4d4a0'; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(22, -9); cx.lineTo(22, 9); cx.closePath(); cx.fill();
    cx.fillStyle = GRAPHITE; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(7, -3); cx.lineTo(7, 3); cx.closePath(); cx.fill();
    cx.fillStyle = '#ffc83a'; cx.fillRect(22, -9, 120, 18); cx.fillStyle = '#c8c8d0'; cx.fillRect(142, -9, 12, 18); cx.fillStyle = '#ff8aa0'; cx.fillRect(154, -9, 16, 18);
    cx.strokeStyle = GRAPHITE; cx.lineWidth = 2; cx.strokeRect(22, -9, 148, 18); cx.restore();
  }

  // ---------- levels: tap spout, cup (centre x, bottom y), obstacles, star ink limits, a known solution for tests ----------
  const LEVELS = [
    { name: 'JUST A SIP', tap: [150, 330], cup: [520, 1000], walls: [], ink: [330, 450],
      sol: [[[120, 440], [440, 620]]] },
    { name: 'THE SHELF', tap: [560, 300], cup: [190, 1000], walls: [[[380, 600], [720, 600]]], ink: [420, 560],
      sol: [[[600, 420], [300, 560]]] },
    { name: 'ROUND THE BOX', tap: [140, 300], cup: [200, 1000], walls: [[[60, 560], [300, 560]], [[300, 560], [300, 640]], [[300, 640], [60, 640]], [[60, 640], [60, 560]]], ink: [650, 850],
      sol: [[[100, 400], [430, 520]], [[560, 560], [230, 740]]] },
    { name: 'LONG WAY DOWN', tap: [600, 260], cup: [140, 1010], walls: [[[0, 520], [420, 520]]], ink: [900, 1200],
      sol: [[[650, 360], [530, 445]], [[430, 530], [610, 640]], [[715, 640], [200, 765]]] },
  ];
  const CUP_TW = 220, CUP_BW = 170, CUP_H = 230, FILL_FRAC = .55, PR = 8;
  const cupWalls = L => { const [c, b] = L.cup, top = b - CUP_H; return [[[c - CUP_TW / 2, top], [c - CUP_BW / 2, b]], [[c - CUP_BW / 2, b], [c + CUP_BW / 2, b]], [[c + CUP_BW / 2, b], [c + CUP_TW / 2, top]]]; };

  const S = {};
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, t: 0, state: 'play', parts: [], strokes: [], cur: null, open: false, emitted: 0, emitAcc: 0, ink: 0,
      inCup: 0, fullT: 0, greed: 0, endT: 0, reason: '', stars: 0, settleT: 0, ptr: null });
    API.autopilot = null; API.autoStep = 0;
  }
  const segments = () => {
    const segs = [];
    for (const w of S.L.walls.concat(cupWalls(S.L))) segs.push(w);
    for (const st of S.strokes) for (let i = 0; i + 1 < st.length; i++) segs.push([st[i], st[i + 1]]);
    if (S.cur) for (let i = 0; i + 1 < S.cur.length; i++) segs.push([S.cur[i], S.cur[i + 1]]);
    return segs;
  };
  const strokeLen = st => { let d = 0; for (let i = 0; i + 1 < st.length; i++) d += Math.hypot(st[i + 1][0] - st[i][0], st[i + 1][1] - st[i][1]); return d; };
  const fillTarget = () => Math.round((CUP_H * FILL_FRAC) * (CUP_BW + (CUP_TW - CUP_BW) * FILL_FRAC / 2 - 24) / Math.pow(PR * 1.9, 2) * 1.1);

  // ---------- water ----------
  function collide(p, segs) {
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const u = clamp(((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L2), qx = a[0] + dx * u, qy = a[1] + dy * u;
      const ex = p.x - qx, ey = p.y - qy, d = Math.hypot(ex, ey), R = PR + 4;
      if (d < R) {
        // which side: the side the drop came from (its previous position), so nothing tunnels through a wall
        let nx, ny;
        if (d > 1e-6) { nx = ex / d; ny = ey / d; } else { nx = -dy / Math.sqrt(L2); ny = dx / Math.sqrt(L2); }
        const side = (p.px - qx) * nx + (p.py - qy) * ny;
        if (side < 0) { nx = -nx; ny = -ny; }
        p.x = qx + nx * R; p.y = qy + ny * R;
        const vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= 1.15 * vn * nx; p.vy -= 1.15 * vn * ny; }
        p.vx *= .996; p.vy *= .996;
      }
    }
  }
  function stepWater(dt) {
    const segs = segments(), G = 1100, VMAX = 650, SUB = 2, h = dt / SUB;
    for (let sub = 0; sub < SUB; sub++) {
      for (const p of S.parts) {
        p.px = p.x; p.py = p.y;
        p.vy += G * h;
        const sp = Math.hypot(p.vx, p.vy); if (sp > VMAX) { p.vx *= VMAX / sp; p.vy *= VMAX / sp; }
        p.x += p.vx * h; p.y += p.vy * h;
        collide(p, segs);
      }
      // keep drops apart (a cheap incompressibility), then re-resolve walls so spacing never pushes a drop through one
      const cell = PR * 2, grid = new Map(), key = (x, y) => (x * 92837111) ^ (y * 689287499);
      S.parts.forEach((p, i) => { const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); });
      for (let i = 0; i < S.parts.length; i++) {
        const p = S.parts[i], gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const a = grid.get(key(gx + ox, gy + oy)); if (!a) continue;
          for (const j of a) { if (j <= i) continue; const q = S.parts[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), R = PR * 1.9;
            if (d < R && d > 1e-6) { const push = (R - d) * .5, nx = dx / d, ny = dy / d; p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push; } }
        }
      }
      for (const p of S.parts) collide(p, segs);
    }
    S.parts = S.parts.filter(p => p.y < H + 60 && p.x > -60 && p.x < W + 60);
    const [c, b] = S.L.cup, top = b - CUP_H;
    S.inCup = S.parts.filter(p => p.y > top && p.y < b && Math.abs(p.x - c) < mix(CUP_BW, CUP_TW, (b - p.y) / CUP_H) / 2).length;
  }
  function update(dt) {
    S.t += dt; frameSeed = Math.floor(S.t * 12);
    if (S.state !== 'play') { S.endT += dt; if (S.state === 'pop' || S.state === 'win') stepWater(dt); return; }
    const auto = API.autopilot; if (auto) autopilot(auto, dt);
    if (S.open) {
      S.emitAcc += dt * 32;
      while (S.emitAcc >= 1) { S.emitAcc--; S.emitted++; S.parts.push({ x: S.L.tap[0] + (hash(S.emitted) - .5) * 8, y: S.L.tap[1] + 20, vx: (hash(S.emitted + 7) - .5) * 30, vy: 60 }); }
      if (S.emitted % 6 === 0 && S.emitAcc < dt * 32) Audio.tone(700 + hash(S.emitted) * 500, .05, 'sine', .03, 1300);
    }
    stepWater(dt);
    const full = S.inCup >= fillTarget();
    // greed: water still running after he's full
    if (full && S.open) { S.greed += dt; if (S.greed > 3.0) { S.state = 'pop'; S.endT = 0; S.reason = 'TOO HAPPY. HE POPPED.'; burst(); Audio.tone(600, .25, 'sine', .2, 60); Audio.noise(.9, .3); Audio.sfx('fail'); return; } }
    else S.greed = Math.max(0, S.greed - dt * 2);
    if (full && !S.open) { S.settleT += dt; if (S.settleT > .8) win(); } else S.settleT = 0;
    if (S.emitted > 900 && !full) { S.state = 'fail'; S.endT = 0; S.reason = "HE'S STILL THIRSTY."; Audio.sfx('fail'); }
  }
  function burst() { const [c, b] = S.L.cup; for (let i = 0; i < 60; i++) { const a = hash(i * 3) * Math.PI * 2, sp = 300 + hash(i * 5) * 500; S.parts.push({ x: c, y: b - CUP_H / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200 }); } }
  function win() {
    S.state = 'win'; S.endT = 0;
    S.stars = S.ink <= S.L.ink[0] ? 3 : S.ink <= S.L.ink[1] ? 2 : 1;
    Audio.sfx('win');
  }
  // test policies: 'good' draws the known solution, opens the tap and closes it when full; 'greedy' never closes it
  function autopilot(kind, dt) {
    if (API.autoStep === 0) { for (const st of S.L.sol) { addStroke(st.map(p => p.slice())); } API.autoStep = 1; return; }
    if (API.autoStep === 1) { S.open = true; API.autoStep = 2; return; }
    if (kind === 'good' && S.inCup >= fillTarget() && S.open) S.open = false;
  }
  function addStroke(pts) { if (pts.length < 2) return; S.strokes.push(pts); S.ink += strokeLen(pts); }

  // ---------- drawing ----------
  function paper() {
    cx.fillStyle = PAPER; cx.fillRect(0, 0, W, H);
    cx.strokeStyle = '#c8d8e8'; cx.lineWidth = 1.5;
    for (let x = 0; x < W; x += 40) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    for (let y = 0; y < H; y += 40) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
  }
  function drawTap() {
    const [x, y] = S.L.tap, left = x < W / 2;
    const end = left ? 0 : W;
    sketch([[end, y - 40], [x + (left ? 15 : -15), y - 40], [x + (left ? 15 : -15), y], [x - (left ? 15 : -15), y], [x - (left ? 15 : -15), y - 25], [end, y - 25]], { w: 5, seed: 3, closed: true, fill: '#d8d8e0' });
    const hx = mix(end, x, .5);
    cx.save(); cx.translate(hx, y - 40); cx.rotate(S.open ? .7 : 0); sketch([[-24, -30], [24, -30]], { w: 7, seed: 5 }); sketch([[0, 0], [0, -30]], { w: 5, seed: 4 }); cx.restore();
  }
  function drawCup() {
    const [c, b] = S.L.cup, top = b - CUP_H, pop = S.state === 'pop';
    if (pop) {   // a deflated rubber cup
      sketch([[c - 120, b], [c - 80, b - 30], [c + 80, b - 28], [c + 120, b]], { w: 6, seed: 7 });
      sketch([[c - 20, b - 18], [c, b - 12], [c + 20, b - 18]], { w: 4, seed: 30 }); return;
    }
    const swell = 1 + clamp(S.greed / 3) * .35;
    cx.save(); cx.translate(c, b); cx.scale(swell, swell); cx.translate(-c, -b);
    const fy = b - CUP_H * FILL_FRAC;
    cx.setLineDash([10, 10]); cx.strokeStyle = RED; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(c - 95, fy); cx.lineTo(c + 95, fy); cx.stroke(); cx.setLineDash([]);
    sketch(cupWalls(S.L).map(s => s[0]).concat([cupWalls(S.L)[2][1]]), { w: 7, seed: 7 });
    // the face
    const f = clamp(S.inCup / fillTarget()), mood = S.greed > .3 ? 'greedy' : f < .25 ? 'sad' : f < .95 ? 'happy' : 'ecstatic', fx = c, fyy = b - 90;
    const lookUp = S.greed > .3 ? -1 : 0;
    for (const ex of [fx - 30, fx + 30]) {
      if (mood === 'ecstatic') sketch([[ex - 10, fyy - 8], [ex, fyy - 18], [ex + 10, fyy - 8]], { w: 4, seed: 20 + ex });
      else { cx.fillStyle = GRAPHITE; cx.beginPath(); cx.arc(ex - (S.greed > .3 ? 4 : 0), fyy - 10 + lookUp * 5, 7, 0, 7); cx.fill(); }
    }
    const m = { sad: [[fx - 26, fyy + 34], [fx, fyy + 22], [fx + 26, fyy + 34]], happy: [[fx - 30, fyy + 20], [fx, fyy + 40], [fx + 30, fyy + 20]],
      ecstatic: [[fx - 36, fyy + 16], [fx, fyy + 50], [fx + 36, fyy + 16]], greedy: [[fx - 26, fyy + 28], [fx + 6, fyy + 34], [fx + 30, fyy + 20]] }[mood];
    sketch(m, { w: 5, seed: 30 });
    if (mood === 'sad') sketch([[fx + 6, fyy + 30], [fx + 10, fyy + 52]], { w: 6, col: '#e87a8a', seed: 31 });
    cx.restore();
    // greed: his arm reaches for your pencil
    if (S.greed > .6) {
      const k = clamp((S.greed - .6) / 2.4), sx = c + CUP_TW / 2 * swell - 10, sy = b - 120;
      const tx = S.ptr ? S.ptr[0] : W - 60, ty = S.ptr ? S.ptr[1] : 1150;
      const px = mix(sx, tx, k), py = mix(sy, ty, k);
      sketch([[sx, sy], [mix(sx, px, .5) + 20, mix(sy, py, .5) + 30], [px, py]], { w: 10, seed: 80 });
      sketch([[px - 10, py - 10], [px + 10, py - 10], [px + 10, py + 10], [px - 10, py + 10]], { w: 5, seed: 81, closed: true, fill: PAPER });
    }
  }
  function drawWater() {
    cx.fillStyle = WATER;
    for (const p of S.parts) { cx.beginPath(); cx.arc(p.x, p.y, PR + 2, 0, 7); cx.fill(); }
  }
  function hud() {
    text(`${S.li + 1}/${LEVELS.length}  ${S.L.name}`, W / 2, 78, 36);
    // ink meter with the star thresholds
    const max = S.L.ink[1] * 1.5, x0 = 120, w = 480, y = 110;
    sketch([[x0, y], [x0 + w, y], [x0 + w, y + 26], [x0, y + 26]], { w: 3, seed: 200, closed: true });
    cx.fillStyle = GRAPHITE; cx.globalAlpha = .7; cx.fillRect(x0 + 3, y + 4, (w - 6) * clamp(S.ink / max), 18); cx.globalAlpha = 1;
    for (const [i, lim] of S.L.ink.entries()) { const xx = x0 + w * lim / max; cx.strokeStyle = RED; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(xx, y - 6); cx.lineTo(xx, y + 32); cx.stroke(); text(i ? '★★' : '★★★', xx, y - 10, 18, RED); }
    text('INK', x0 - 14, y + 22, 22, GRAPHITE, 'right');
    // buttons
    btn(190, 1200, S.open ? 'CLOSE TAP' : 'OPEN TAP', S.open ? '#f0a0a0' : '#a0d0f0', 300);
    btn(530, 1200, 'ERASE', '#e8e0c8', 240);
    if (S.state === 'play' && S.t < 4 && !S.strokes.length) text('DRAW A LINE FOR THE WATER', W / 2, 200, 30);
    if (S.state === 'play' && S.inCup >= fillTarget() && S.open) { cx.globalAlpha = .6 + .4 * Math.sin(S.t * 12); text('HE\'S FULL! CLOSE THE TAP!', W / 2, 200, 34, RED); cx.globalAlpha = 1; }
  }
  function btn(x, y, label, col, w) { sketch([[x - w / 2, y - 40], [x + w / 2, y - 42], [x + w / 2 + 2, y + 40], [x - w / 2, y + 42]], { w: 5, seed: x, closed: true, fill: col }); text(label, x, y + 12, 34); }
  function overlay() {
    if (S.state === 'win' && S.endT > .4) {
      sketch([[130, 380], [590, 370], [600, 640], [120, 650]], { w: 5, seed: 300, closed: true, fill: PAPER });
      text('SO REFRESHED!', W / 2, 450, 50);
      for (let i = 0; i < 3; i++) star(270 + i * 90, 530, 34 * back(lin(S.endT, .5 + i * .15, .8 + i * .15)), i < S.stars, 301 + i);
      text(`INK: ${Math.round(S.ink)}`, W / 2, 615, 28);
      if (S.endT > 1.2) btn(W / 2, 760, S.li < LEVELS.length - 1 ? 'NEXT GLASS' : 'FINISH', '#8ad08a', 340);
    }
    if ((S.state === 'pop' || S.state === 'fail') && S.endT > .3) {
      if (S.state === 'pop' && S.endT < .8) text('POP!', W / 2, 600, 140 * back(lin(S.endT, .3, .6)), RED);
      sketch([[130, 380], [590, 370], [600, 600], [120, 610]], { w: 5, seed: 310, closed: true, fill: PAPER });
      text(S.reason, W / 2, 470, S.reason.length > 18 ? 36 : 44, RED);
      if (S.state === 'pop') text('(close the tap when he\'s full)', W / 2, 530, 26);
      if (S.endT > .9) btn(W / 2, 760, 'TRY AGAIN', '#8ad08a', 320);
    }
    if (S.state === 'done') {
      paper(); text('DEMO COMPLETE', W / 2, 500, 64); text('FOUR GLASSES. ZERO POPS.', W / 2, 580, 34); text('(PROBABLY)', W / 2, 630, 28);
      text('TAP OR ESC FOR THE DISC MENU', W / 2, 820, 28);
    }
  }
  function render(ctx) {
    cx = ctx;
    paper();
    if (S.state !== 'done') {
      for (const w of S.L.walls) sketch([w[0], w[1]], { w: 10, seed: 400 + w[0][0], col: '#7a6a5a' });
      drawTap();
      for (const [i, st] of S.strokes.entries()) sketch(st, { w: 7, seed: 40 + i });
      if (S.cur) sketch(S.cur, { w: 7, seed: 39 });
      drawWater(); drawCup(); hud();
      if (S.ptr && S.state === 'play' && S.greed < 2.9) pencil(S.ptr[0], S.ptr[1]);
    }
    overlay();
  }

  // ---------- input ----------
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else S.state = 'done'; Audio.sfx('select'); }
  function onPointer(type, x, y) {
    S.ptr = [x, y];
    if (type === 'down') {
      if (S.state === 'done') { Engine.exit(); return; }
      if (S.state === 'win' && S.endT > 1.2) { next(); return; }
      if ((S.state === 'pop' || S.state === 'fail') && S.endT > .9) { load(S.li); return; }
      if (S.state !== 'play') return;
      if (y > 1150) {
        if (x < 360) { S.open = !S.open; Audio.tone(S.open ? 500 : 300, .1, 'square', .06); }
        else { S.strokes = []; S.ink = 0; Audio.noise(.2, .1); }
        return;
      }
      S.cur = [[x, y]];
    } else if (type === 'move' && S.cur) {
      const l = S.cur[S.cur.length - 1];
      if (Math.hypot(x - l[0], y - l[1]) > 14) { S.cur.push([x, y]); if (S.cur.length % 3 === 0) Audio.noise(.03, .03); }
    } else if ((type === 'up' || type === 'cancel') && S.cur) { addStroke(S.cur); S.cur = null; }
  }
  function onKey(key, down) {
    if (!down) return;
    if (key === ' ' || key === 'Enter') {
      if (S.state === 'done') { Engine.exit(); return; }
      if (S.state === 'win' && S.endT > 1.2) { next(); return; }
      if ((S.state === 'pop' || S.state === 'fail') && S.endT > .9) { load(S.li); return; }
      if (S.state === 'play') S.open = !S.open;
    }
    if ((key === 'Backspace' || key === 'e' || key === 'E') && S.state === 'play') { S.strokes = []; S.ink = 0; }
  }

  const API = { LEVELS, S, load, autopilot: null, autoStep: 0, fillTarget, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
