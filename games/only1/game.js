// ONLY 1% CAN SAVE HIM - playable pin-puzzle demo.
// Liquids are particles: lava + water -> stone, lava + gold -> molten (lost), lava on the knight -> FAIL.
// Fail a level 3 times and the knight gives up on you and solves it himself.
(function () {
  'use strict';
  const { createGame, Audio, Draw, ease, back, clamp } = Engine;
  const W = 540, H = 960, R = 7, G = 900;
  // speed cap: under one radius per tick (7 px * 60 Hz) a particle can never tunnel through a 10 px wall
  const VMAX = 400;
  // density: heavier particles sink through lighter ones, so stone settles out and fresh lava keeps meeting water
  const DEN = { water: 1, lava: 2, stone: 3, gold: 3 };

  // ---------- levels ----------
  // walls/pins/drains are rects. Pins slide out along dir when tapped; a lever removes its drain rect.
  // Liquids are spawned as grids of particles inside a box. Each level states its own win/lose test.
  const frame = () => [
    { x: 30, y: 120, w: 20, h: 790 }, { x: 490, y: 120, w: 20, h: 790 }, // side walls
  ];
  function tank(x0, y0, w, h) { // open-top tank walls (the pin is its floor)
    return [{ x: x0 - 10, y: y0 - 20, w: 10, h: h + 32 }, { x: x0 + w, y: y0 - 20, w: 10, h: h + 32 }];
  }
  const LEVELS = [
    {
      title: 'ONLY 1% CAN SAVE HIM', knight: { x: 115, floor: 820 }, chest: { x: 420, floor: 820 },
      walls: [...frame(),
        { x: 50, y: 820, w: 150, h: 90 }, { x: 340, y: 820, w: 150, h: 90 }, { x: 200, y: 880, w: 140, h: 30 }, // ledges + pit floor
        ...tank(60, 420, 130, 120), ...tank(215, 290, 120, 150)],
      pins: [
        { id: 'lava', x: 60, y: 540, w: 130, h: 12, dir: -1 },
        { id: 'water', x: 215, y: 440, w: 120, h: 12, dir: 1 },
      ],
      liquids: [
        { type: 'lava', x: 60, y: 430, w: 130, h: 108 },
        { type: 'water', x: 215, y: 300, w: 120, h: 138 },
        { type: 'lava', x: 200, y: 826, w: 140, h: 52 }, // the lava pit between the knight and the chest
      ],
      zone: { x: 200, y: 760, w: 140, h: 120 },
      solution: ['water'],
      ready: (s) => s.count('lava', s.L.zone) === 0 && s.count('stone', s.L.zone) >= 12,
    },
    {
      title: 'DRAIN IT!', knight: { x: 115, floor: 820 }, chest: { x: 455, floor: 880 },
      walls: [...frame(),
        { x: 50, y: 820, w: 200, h: 90 }, { x: 250, y: 880, w: 80, h: 30 }, { x: 410, y: 880, w: 80, h: 30 },
        ...tank(330, 420, 130, 110)],
      drains: [{ id: 'drain', x: 330, y: 880, w: 80, h: 30 }],
      lever: { id: 'drain', x: 470, y: 640 },
      pins: [{ id: 'lava', x: 330, y: 530, w: 130, h: 12, dir: 1 }],
      liquids: [
        { type: 'lava', x: 330, y: 430, w: 130, h: 98 },
        { type: 'water', x: 252, y: 760, w: 236, h: 118 },  // the flooded basin the chest sits in
      ],
      zone: { x: 250, y: 700, w: 240, h: 180 },
      solution: ['drain'],
      ready: (s) => s.count('water', s.L.zone) < 12 && s.count('stone', s.L.zone) === 0 && s.count('lava', s.L.zone) === 0,
      failIf: (s) => s.count('stone', s.L.zone) > 6 ? 'CHEST BURIED' : null,
    },
    {
      title: 'GET THE GOLD', knight: { x: 110, floor: 820 }, goldGoal: .5,
      walls: [...frame(),
        { x: 50, y: 820, w: 130, h: 90 }, { x: 180, y: 880, w: 230, h: 30 }, { x: 410, y: 820, w: 80, h: 90 },
        ...tank(195, 310, 55, 140), ...tank(270, 300, 115, 150), ...tank(60, 440, 110, 110)],
      pins: [
        { id: 'gold', x: 195, y: 450, w: 55, h: 12, dir: -1 },
        { id: 'water', x: 270, y: 450, w: 115, h: 12, dir: 1 },
        { id: 'lava', x: 60, y: 550, w: 110, h: 12, dir: -1 },
      ],
      liquids: [
        { type: 'gold', x: 195, y: 316, w: 55, h: 132 },
        { type: 'water', x: 270, y: 306, w: 115, h: 142 },
        { type: 'lava', x: 60, y: 450, w: 110, h: 98 },
        { type: 'lava', x: 182, y: 852, w: 226, h: 26 }, // a lava pool under the gold
      ],
      zone: { x: 180, y: 700, w: 230, h: 180 },
      solution: ['water', 'gold'],
      ready: (s) => s.count('lava', s.L.zone) === 0 && s.pulledAt.gold !== undefined && s.t - s.pulledAt.gold > 1.5,
      failIf: (s) => s.melted > s.goldTotal * .35 ? 'THE GOLD MELTED' : null,
    },
  ];

  // ---------- state ----------
  const S = { li: 0, L: null, parts: [], walls: [], pins: [], drains: [], lever: null, knight: null, state: 'play', t: 0, fails: [0, 0, 0],
    reason: '', goldTotal: 0, collected: 0, melted: 0, settled: 0, readyTicks: 0, pulledAt: {}, hint: null, cursor: null, events: [],
    count(type, z) { let n = 0; for (const p of this.parts) if (p.type === type && (!z || (p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h))) n++; return n; } };

  function load(i) {
    const L = LEVELS[i]; S.li = i; S.L = L; S.state = 'play'; S.t = 0; S.reason = ''; S.readyTicks = 0; S.settled = 0; S.pulledAt = {}; S.hint = null; S.cursor = null; S.events = [];
    S.walls = L.walls.map(r => ({ ...r }));
    S.pins = L.pins.map(p => ({ ...p, out: 0, pulling: false }));
    S.drains = (L.drains || []).map(d => ({ ...d, open: false }));
    S.lever = L.lever ? { ...L.lever, flip: 0, on: false } : null;
    S.parts = [];
    for (const q of L.liquids) for (let y = q.y + R; y <= q.y + q.h - R + .01; y += R * 2) for (let x = q.x + R; x <= q.x + q.w - R + .01; x += R * 2)
      S.parts.push({ type: q.type, x, y, vx: 0, vy: 0, fixed: false });
    S.goldTotal = S.count('gold', null); S.collected = 0; S.melted = 0;
    S.knight = { x: L.knight.x, floor: L.knight.floor, y: L.knight.floor, walking: false, target: L.chest ? L.chest.x - 40 : 400, mood: 'worried', stepT: 0 };
  }

  // ---------- physics ----------
  function solids() {
    const out = S.walls.slice();
    for (const p of S.pins) if (p.out < .5) out.push({ x: p.x + p.dir * p.out * (p.w + 20), y: p.y, w: p.w, h: p.h });
    for (const d of S.drains) if (!d.open) out.push(d);
    return out;
  }
  function collideRect(p, r) {
    const cx = clamp(p.x, r.x, r.x + r.w), cy = clamp(p.y, r.y, r.y + r.h);
    let dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    if (d2 === 0) { // centre inside the rect: push out through the nearest face
      const l = p.x - r.x, rt = r.x + r.w - p.x, t = p.y - r.y, b = r.y + r.h - p.y, m = Math.min(l, rt, t, b);
      if (m === t) { p.y = r.y - R; p.vy = Math.min(p.vy, 0); } else if (m === b) { p.y = r.y + r.h + R; p.vy = Math.max(p.vy, 0); }
      else if (m === l) { p.x = r.x - R; p.vx = Math.min(p.vx, 0); } else { p.x = r.x + r.w + R; p.vx = Math.max(p.vx, 0); }
      return;
    }
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = R - d;
    p.x += nx * push; p.y += ny * push;
    const vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; }
    const fr = p.type === 'gold' || p.type === 'stone' ? .88 : .985; p.vx *= fr;
  }
  let stoneSfxT = -1, coinSfxT = -1;
  function physics(dt) {
    const sol = solids();
    for (const p of S.parts) {
      if (p.fixed) continue;
      p.vy += G * dt;
      if (p.vy > VMAX) p.vy = VMAX; if (p.vy < -VMAX) p.vy = -VMAX; if (p.vx > VMAX) p.vx = VMAX; if (p.vx < -VMAX) p.vx = -VMAX;
      if (p.type === 'lava') p.vx *= .97;
      p.x += p.vx * dt; p.y += p.vy * dt;
      for (const r of sol) collideRect(p, r);
    }
    // particle pairs through a spatial hash
    const cell = R * 2, grid = new Map();
    S.parts.forEach((p, i) => { const k = ((p.x / cell) | 0) * 1000 + ((p.y / cell) | 0); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); });
    const dead = new Set();
    for (let it = 0; it < 2; it++) {
      for (const [k, list] of grid) {
        const gx = Math.floor(k / 1000), gy = k % 1000;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const other = grid.get((gx + ox) * 1000 + gy + oy); if (!other) continue;
          for (const i of list) for (const j of other) {
            if (j <= i) continue; const a = S.parts[i], b = S.parts[j];
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy; if (d2 >= cell * cell || d2 === 0) continue;
            // reactions
            const pair = a.type + b.type;
            if ((pair === 'lavawater' || pair === 'waterlava')) { a.type = b.type = 'stone'; a.vx *= .2; a.vy *= .2; b.vx *= .2; b.vy *= .2; if (S.t - stoneSfxT > .15) { Audio.sfx('stone'); stoneSfxT = S.t; } continue; }
            if (pair === 'lavagold' || pair === 'goldlava') { const g = a.type === 'gold' ? a : b; g.type = 'lava'; S.melted++; if (S.t - stoneSfxT > .2) { Audio.sfx('sizzle'); stoneSfxT = S.t; } continue; }
            if (!a.fixed && !b.fixed && DEN[a.type] !== DEN[b.type] && Math.abs(dx) < R * 1.4) {
              const up = a.y < b.y ? a : b, lo = up === a ? b : a;
              if (DEN[up.type] > DEN[lo.type]) { const ux = up.x, uy = up.y; up.x = lo.x; up.y = lo.y; lo.x = ux; lo.y = uy; continue; }
            }
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = cell - d;
            if (a.fixed && b.fixed) continue;
            if (a.fixed) { b.x += nx * ov; b.y += ny * ov; } else if (b.fixed) { a.x -= nx * ov; a.y -= ny * ov; }
            else { a.x -= nx * ov * .5; a.y -= ny * ov * .5; b.x += nx * ov * .5; b.y += ny * ov * .5;
              const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv < 0) { const imp = rv * .5; a.vx += imp * nx; a.vy += imp * ny; b.vx -= imp * nx; b.vy -= imp * ny; } }
          }
        }
      }
      for (const p of S.parts) if (!p.fixed) for (const r of sol) collideRect(p, r);
    }
    // drained particles fall out of the world
    S.parts = S.parts.filter(p => p.y < H + 30);
    // knight contact
    const k = S.knight, kr = { x: k.x - 22, y: k.y - 76, w: 44, h: 76 };
    let speed = 0;
    for (const p of S.parts) {
      speed = Math.max(speed, Math.abs(p.vx) + Math.abs(p.vy));
      const inside = p.x > kr.x - R && p.x < kr.x + kr.w + R && p.y > kr.y - R && p.y < kr.y + kr.h + R;
      if (!inside) continue;
      if (p.type === 'lava' && S.state === 'play') return fail('TOO HOT');
      if (p.type === 'gold' && k.walking) { p.type = 'got'; S.collected++; if (S.t - coinSfxT > .06) { Audio.sfx('coin'); coinSfxT = S.t; } }
    }
    S.parts = S.parts.filter(p => p.type !== 'got');
    S.settled = speed < 40 ? S.settled + 1 : 0;
  }

  // ---------- rules ----------
  function fail(reason) { if (S.state !== 'play') return; S.state = 'fail'; S.reason = reason; S.t0 = S.t; S.fails[S.li]++; S.knight.mood = 'dead'; Audio.sfx('fail'); }
  function win() { if (S.state !== 'play') return; S.state = 'win'; S.t0 = S.t; S.knight.mood = 'happy'; Audio.sfx('win'); }
  function act(id) {
    if (S.state !== 'play' || S.knight.walking) return false;
    const pin = S.pins.find(p => p.id === id && !p.pulling);
    if (pin) { pin.pulling = true; S.pulledAt[id] = S.t; Audio.sfx('pin'); S.events.push(id); return true; }
    if (S.lever && S.lever.id === id && !S.lever.on) { S.lever.on = true; const d = S.drains.find(d => d.id === id); if (d) d.open = true; Audio.sfx('lever'); setTimeout(() => Audio.sfx('splash'), 200); S.events.push(id); return true; }
    return false;
  }
  function update(dt) {
    S.t += dt;
    for (const p of S.pins) if (p.pulling) p.out = Math.min(1, p.out + dt * 3);
    if (S.lever) S.lever.flip = Math.min(1, S.lever.flip + (S.lever.on ? dt * 5 : 0));
    if (S.state === 'play' || S.state === 'win') physics(dt);
    const k = S.knight, L = S.L;
    if (S.state === 'play') {
      const f = L.failIf && L.failIf(S); if (f) return fail(f);
      if (!k.walking && L.ready(S)) { if (++S.readyTicks > 30) { k.walking = true; k.mood = 'normal'; } } else if (!k.walking) S.readyTicks = 0;
      if (k.walking) {
        k.stepT += dt;
        const dir = Math.sign(k.target - k.x); k.x += dir * 90 * dt;
        // walk down into a basin / across a stone bridge: follow the highest solid under the feet
        k.y = groundAt(k.x);
        if (L.goldGoal) { if (S.collected >= S.goldTotal * L.goldGoal) win(); else if (Math.abs(k.target - k.x) < 3) { k.target = k.target > 300 ? 120 : 380; } }
        else if (Math.abs(k.target - k.x) < 3) win();
      }
    }
    // hint: the knight solves it himself after three fails
    if (S.hint) {
      const h = S.hint; h.t += dt;
      const step = h.steps[h.i];
      if (step) {
        const tgt = targetXY(step), from = h.from;
        const k2 = clamp((h.t - .2) / .9); S.cursor = { x: from.x + (tgt.x - from.x) * ease(k2), y: from.y + (tgt.y - from.y) * ease(k2), press: h.t > 1.1 ? 1 : 0 };
        if (h.t > 1.2) { act(step); h.i++; h.t = 0; h.from = tgt; }
      } else if (h.t > .6) S.cursor = null;
    }
  }
  function groundAt(x) {
    let best = H; for (const r of solids()) if (x > r.x && x < r.x + r.w && r.y < best && r.y > 600) best = r.y;
    for (const p of S.parts) if ((p.type === 'stone' || p.type === 'gold') && Math.abs(p.x - x) < R * 1.5 && p.y - R < best && p.y > 600) best = p.y - R;
    return best;
  }
  function targetXY(id) {
    const pin = S.pins.find(p => p.id === id);
    if (pin) return { x: pin.dir < 0 ? pin.x - 12 : pin.x + pin.w + 12, y: pin.y + 6 };
    return { x: S.lever.x, y: S.lever.y - 40 };
  }
  function startHint() {
    if (S.hint) return; load(S.li); S.hint = { steps: S.L.solution.slice(), i: 0, t: -1.6, from: { x: 270, y: 990 } }; S.knight.mood = 'flat';
  }

  // ---------- input ----------
  let pointer = null;
  function onPointer(type, x, y) {
    pointer = { x, y };
    if (type !== 'down') return;
    if (S.state === 'fail') { if (button(x, y, 330)) { load(S.li); Audio.sfx('select'); } else if (S.fails[S.li] >= 3 && button(x, y, 420)) startHint(); return; }
    if (S.state === 'win') { if (button(x, y, 330)) next(); return; }
    if (S.hint) return;
    for (const p of S.pins) {
      const hx = p.dir < 0 ? p.x - 12 : p.x + p.w + 12;
      if ((x > p.x - 8 && x < p.x + p.w + 8 && y > p.y - 18 && y < p.y + p.h + 18) || Math.hypot(x - hx, y - (p.y + 6)) < 28) { if (act(p.id)) return; }
    }
    if (S.lever && Math.hypot(x - S.lever.x, y - (S.lever.y - 25)) < 40) act(S.lever.id);
  }
  const button = (x, y, cy) => x > 150 && x < 390 && y > cy - 36 && y < cy + 36;
  function next() { Audio.sfx('select'); if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; S.t0 = S.t; Audio.sfx('start'); } }
  function onKey(key, down) {
    if (!down) return;
    if (key === 'Enter' || key === ' ') { if (S.state === 'fail') load(S.li); else if (S.state === 'win') next(); else if (S.state === 'done') location.href = '../../index.html'; }
    if ((key === 'h' || key === 'H') && S.state === 'fail' && S.fails[S.li] >= 3) startHint();
    const n = parseInt(key, 10); if (S.state === 'play' && n >= 1 && n <= S.pins.length + (S.lever ? 1 : 0)) act(n <= S.pins.length ? S.pins[n - 1].id : S.lever.id);
  }

  // ---------- drawing ----------
  function render(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a1a6a'); g.addColorStop(.6, '#6a2a9a'); g.addColorStop(1, '#1a0a30'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (S.state === 'done') return doneCard(ctx);
    ctx.fillStyle = '#2a2238'; ctx.fillRect(50, 120, 440, 790);
    ctx.fillStyle = '#342a46'; for (let y = 120; y < 910; y += 36) for (let x = 50 + ((y / 36) % 2) * 26; x < 490; x += 52) ctx.fillRect(x + 2, y + 2, 48, 32);
    for (const r of S.walls) { ctx.fillStyle = '#8a7a9a'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4); }
    for (const d of S.drains) { ctx.fillStyle = '#111'; ctx.fillRect(d.x, d.y, d.w, 8); if (!d.open) { ctx.fillStyle = '#6a6070'; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.fillStyle = '#3a3440'; for (let i = 0; i < 5; i++) ctx.fillRect(d.x + 6 + i * 16, d.y + 2, 4, 8); } }
    // liquids: one path per type (batched)
    const col = { water: '#3a96ff', lava: '#ff6a1a', stone: '#8a8a96', gold: '#ffd23a' };
    for (const type of ['stone', 'water', 'gold', 'lava']) {
      ctx.fillStyle = col[type]; ctx.beginPath();
      for (const p of S.parts) if (p.type === type) { ctx.moveTo(p.x + R + 1, p.y); ctx.arc(p.x, p.y, R + 1, 0, Math.PI * 2); }
      ctx.fill();
      if (type === 'lava') { ctx.fillStyle = 'rgba(255,200,80,.35)'; ctx.beginPath(); for (const p of S.parts) if (p.type === 'lava') { ctx.moveTo(p.x + 3, p.y - 2); ctx.arc(p.x - 1, p.y - 2, 3, 0, Math.PI * 2); } ctx.fill(); }
      if (type === 'gold') { ctx.fillStyle = '#fff6b0'; ctx.beginPath(); for (const p of S.parts) if (p.type === 'gold') { ctx.moveTo(p.x, p.y - 2); ctx.arc(p.x - 2, p.y - 2, 2, 0, Math.PI * 2); } ctx.fill(); }
    }
    for (const p of S.pins) drawPin(ctx, p);
    if (S.lever) drawLever(ctx, S.lever);
    if (S.L.chest) drawChest(ctx, S.L.chest.x, S.L.chest.floor, S.state === 'win' ? back(clamp((S.t - S.t0) / .3)) : 0);
    drawKnight(ctx, S.knight);
    // HUD
    Draw.bigText(ctx, `LEVEL ${S.li + 1}/${LEVELS.length}`, W / 2, 46, 26, '#ffffff');
    Draw.bigText(ctx, S.L.title, W / 2, 86, 34, '#ffe14a');
    if (S.L.goldGoal && S.state === 'play') Draw.bigText(ctx, `GOLD ${S.collected}/${Math.ceil(S.goldTotal * S.L.goldGoal)}`, W / 2, 936, 22, '#ffd23a');
    if (S.hint && S.hint.t < 1.6 && S.hint.i === 0) Draw.bubble(ctx, '...Fine. I\'ll do it.', S.knight.x + 10, S.knight.y - 92, W);
    if (S.cursor) Draw.finger(ctx, S.cursor.x, S.cursor.y, S.cursor.press, -.35, .7);
    if (S.state === 'fail') failCard(ctx);
    if (S.state === 'win' && S.t - S.t0 > .6) winCard(ctx);
  }
  function drawPin(ctx, p) {
    const sx = p.dir * p.out * (p.w + 20), hx = (p.dir < 0 ? p.x - 12 : p.x + p.w + 12) + sx;
    ctx.fillStyle = '#f0c040'; ctx.strokeStyle = '#8a6010'; ctx.lineWidth = 2; Draw.rr(ctx, p.x + sx, p.y, p.w, p.h, 6); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#f0c040'; ctx.beginPath(); ctx.arc(hx, p.y + 6, 13, 0, Math.PI * 2); ctx.stroke();
  }
  function drawLever(ctx, l) {
    ctx.fillStyle = '#5a5060'; Draw.rr(ctx, l.x - 14, l.y - 24, 28, 48, 6); ctx.fill();
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(-.7 + 1.4 * ease(l.flip)); ctx.strokeStyle = '#c03040'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -44); ctx.stroke(); ctx.fillStyle = '#e04a5a'; Draw.circ(ctx, 0, -46, 11); ctx.restore();
  }
  function drawChest(ctx, x, floor, open) {
    ctx.fillStyle = '#7a4a1a'; Draw.rr(ctx, x - 36, floor - 46, 72, 46, 6); ctx.fill(); ctx.fillStyle = '#f0c040'; ctx.fillRect(x - 36, floor - 30, 72, 5); ctx.fillRect(x - 5, floor - 36, 10, 14);
    ctx.save(); ctx.translate(x - 36, floor - 46); ctx.rotate(-open * 1.9); ctx.fillStyle = '#8a5a2a'; Draw.rr(ctx, 0, -20, 72, 22, 9); ctx.fill(); ctx.restore();
    if (open > 0) { const gr = ctx.createRadialGradient(x, floor - 50, 4, x, floor - 50, 120 * open); gr.addColorStop(0, 'rgba(255,230,120,.9)'); gr.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 150, floor - 200, 300, 200); }
  }
  function drawKnight(ctx, k) {
    const dead = k.mood === 'dead', t = S.t, bob = k.walking ? Math.abs(Math.sin(t * 10)) * 4 : 0;
    const sy = dead ? .5 : 1, sx = 1 / sy;
    ctx.save(); ctx.translate(k.x, k.y - bob); ctx.scale(sx * .9, sy * .9);
    const steel = dead ? '#2a2420' : '#c8d2e1', dark = dead ? '#141010' : '#7a8296';
    ctx.fillStyle = dark; Draw.rr(ctx, -20, -24, 14, 24, 5); ctx.fill(); Draw.rr(ctx, 6, -24, 14, 24, 5); ctx.fill();
    ctx.fillStyle = steel; Draw.rr(ctx, -30, -70, 60, 52, 18); ctx.fill(); ctx.fillStyle = '#c03040'; ctx.fillRect(-30, -46, 60, 8);
    ctx.fillStyle = '#ddd'; ctx.fillRect(30, -60, 6, 40);
    ctx.fillStyle = steel; ctx.beginPath(); ctx.arc(0, -86, 30, Math.PI, 0); ctx.lineTo(30, -66); ctx.lineTo(-30, -66); ctx.fill();
    const pw = Math.sin(t * 5) * 6; ctx.fillStyle = dead ? '#3a2a2a' : '#e0304a'; ctx.beginPath(); ctx.moveTo(-4, -114); ctx.quadraticCurveTo(-30 + pw, -140, -38 + pw, -104); ctx.quadraticCurveTo(-18 + pw, -118, 4, -110); ctx.fill();
    ctx.fillStyle = '#1a1a22'; Draw.rr(ctx, -22, -94, 44, 18, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    if (dead) { for (const e of [-9, 9]) { ctx.beginPath(); ctx.moveTo(e - 4, -89); ctx.lineTo(e + 4, -81); ctx.moveTo(e + 4, -89); ctx.lineTo(e - 4, -81); ctx.stroke(); } }
    else if (k.mood === 'happy') { ctx.beginPath(); ctx.arc(-9, -83, 5, Math.PI, 0); ctx.moveTo(14, -83); ctx.arc(9, -83, 5, Math.PI, 0); ctx.stroke(); }
    else if (k.mood === 'flat') { ctx.fillRect(-15, -86, 11, 3); ctx.fillRect(4, -86, 11, 3); }
    else { Draw.circ(ctx, -9, -85, 4); Draw.circ(ctx, 9, -85, 4); if (k.mood === 'worried') { ctx.beginPath(); ctx.moveTo(-16, -93); ctx.lineTo(-4, -91); ctx.moveTo(16, -93); ctx.lineTo(4, -91); ctx.stroke(); } }
    ctx.restore();
  }
  function stamp(ctx, text, col, t0) {
    const k = clamp((S.t - t0) / .16), sc = k < 1 ? 2.4 - 1.5 * k * k : 1;
    ctx.save(); ctx.translate(W / 2, 470); ctx.rotate(-.2); ctx.scale(sc, sc); ctx.strokeStyle = col; ctx.lineWidth = 12; Draw.rr(ctx, -170, -66, 340, 132, 20); ctx.stroke();
    ctx.font = "900 100px Impact, 'Arial Black', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(text, 0, 6); ctx.restore();
  }
  function btn(ctx, label, cy, colr) { ctx.fillStyle = colr; Draw.rr(ctx, 150, cy - 36, 240, 72, 36); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); Draw.bigText(ctx, label, W / 2, cy + 2, 30, '#fff'); }
  function failCard(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); stamp(ctx, 'FAIL', '#ff2a2a', S.t0);
    Draw.bigText(ctx, S.reason, W / 2, 230, 34, '#ff8a8a');
    if (S.t - S.t0 > .5) { btn(ctx, 'TRY AGAIN', 330, '#4ad05a'); if (S.fails[S.li] >= 3) btn(ctx, 'HELP ME', 420, '#3a8ad0'); }
  }
  function winCard(ctx) {
    stamp(ctx, 'SUCCESS', '#3ad05a', S.t0 + .6);
    for (let i = 0; i < 3; i++) { const s = back(clamp((S.t - S.t0 - .8 - i * .15) / .25)); ctx.save(); ctx.translate(W / 2 - 80 + i * 80, 600); ctx.scale(s, s); Draw.star(ctx, 0, 0, 30, '#ffd93a'); ctx.restore(); }
    btn(ctx, S.li < LEVELS.length - 1 ? 'NEXT' : 'FINISH', 330, '#4ad05a');
  }
  function doneCard(ctx) {
    Draw.bigText(ctx, 'DEMO COMPLETE', W / 2, 380, 52, '#ffe14a');
    Draw.bigText(ctx, 'THE KNIGHT THANKS YOU.', W / 2, 460, 28, '#fff');
    Draw.bigText(ctx, 'MOSTLY.', W / 2, 505, 24, '#aaa');
    Draw.bigText(ctx, 'PRESS ESC FOR THE DISC MENU', W / 2, 640, 20, '#9ad8ff');
  }

  // ---------- boot ----------
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = { S, LEVELS, load, act, step: n => game.step(n), get state() { return S.state; }, startHint };
})();
