// TROLLEY DASH - playable demo.
// The ad is a quiet cart-return puzzle that promises "no racing". The game is a kart racer: shoppers race
// trolleys, go-karts and mobility scooters round supermarket tracks, with items, shortcuts, boost pads and
// random events. The road is drawn Mode 7 style: a flat track texture, sampled per scanline from a camera
// behind the kart, into a small low-res buffer that is scaled up 3x (integer scale, no mixels).
(function () {
  'use strict';
  const { createGame, Audio, Draw, clamp } = Engine;
  const W = 540, H = 960, LW = 180, LH = 200, SCALE = 3, HOR = 52;   // low-res view, its scale, horizon row
  const FOCAL = 120, CAMH = 22, CAMD = 26, FOG = 900;                // camera: focal length (px), height, distance behind the kart, fog distance
  const T = { WALL: 0, GRASS: 1, ROAD: 2, CURB: 3, BOOST: 4, SAND: 5, ICE: 6, START: 7 };

  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian ABGR for Uint32 ImageData

  // ---------- tracks ----------
  // A track is a closed centreline (control points, Catmull-Rom), a road width and a verge before the wall.
  // Features are placed by distance along the centreline (s) so they stay put when the shape is edited.
  const TRACKS = [
    { name: 'CAR PARK CIRCUIT', size: 1024, width: 44, verge: 30, theme: 'carpark',
      pts: [[200, 820], [200, 300], [300, 180], [520, 170], [640, 280], [600, 440], [760, 520], [860, 420], [900, 640], [820, 860], [560, 900], [420, 760], [300, 880]] },
  ];
  function spline(pts, step) {   // closed Catmull-Rom, resampled every `step` units: [{x, y, dx, dy, s}]
    const raw = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let k = 0; k < 40; k++) { const t = k / 40, t2 = t * t, t3 = t2 * t;
        raw.push([0, 1].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3))); }
    }
    const out = []; let s = 0, prev = raw[0], acc = 0;
    out.push({ x: prev[0], y: prev[1], s: 0 });
    for (let i = 1; i <= raw.length; i++) {
      const q = raw[i % raw.length], d = Math.hypot(q[0] - prev[0], q[1] - prev[1]); acc += d; s += d;
      if (acc >= step) { out.push({ x: q[0], y: q[1], s }); acc = 0; }
      prev = q;
    }
    const L = s;
    for (let i = 0; i < out.length; i++) { const a = out[i], b = out[(i + 1) % out.length], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; a.dx = (b.x - a.x) / d; a.dy = (b.y - a.y) / d; }
    out.L = L; return out;
  }
  // rasterize: terrain codes, the distance along the track for each texel (for curbs and progress), and colours
  function buildTrack(def) {
    const N = def.size, ter = new Uint8Array(N * N), sAt = new Float32Array(N * N).fill(-1), col = new Uint32Array(N * N);
    const line = spline(def.pts, 2);
    const stamp = (x, y, r, code, onlyOver, s) => {
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(N - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(N - 1, Math.ceil(y + r)), r2 = r * r;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx - x, dy = yy - y; if (dx * dx + dy * dy > r2) continue; const i = yy * N + xx; if (onlyOver !== undefined && ter[i] > onlyOver) continue; ter[i] = code; if (s !== undefined) sAt[i] = s; }
    };
    for (const p of line) stamp(p.x, p.y, def.width + def.verge, T.GRASS, T.GRASS);
    for (const p of line) stamp(p.x, p.y, def.width, T.CURB, T.CURB, p.s);
    for (const p of line) stamp(p.x, p.y, def.width - 6, T.ROAD, undefined, p.s);
    // the start line: a checkered band across the road at s = 0
    for (const p of line.slice(0, 6)) stamp(p.x, p.y, def.width - 6, T.START, undefined, p.s);
    // colours
    const theme = THEMES[def.theme], r = mkRng(7);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, t = ter[i], s = sAt[i];
      let c;
      if (t === T.ROAD) { const tile = ((x >> 4) + (y >> 4)) & 1; c = tile ? theme.road : theme.road2; }
      else if (t === T.CURB) c = Math.floor(s / 10) & 1 ? theme.curbA : theme.curbB;
      else if (t === T.START) c = ((x >> 3) + (y >> 3)) & 1 ? rgb(250, 250, 250) : rgb(30, 30, 40);
      else if (t === T.GRASS) c = (r() < .5) ? theme.grass : theme.grass2;
      else c = ((x >> 5) + (y >> 5)) & 1 ? theme.wall : theme.wall2;
      col[i] = c;
    }
    return { def, N, ter, sAt, col, line, L: line.L };
  }
  const THEMES = {
    carpark: { road: rgb(92, 96, 108), road2: rgb(86, 90, 102), curbA: rgb(230, 70, 80), curbB: rgb(245, 245, 245), grass: rgb(96, 170, 90), grass2: rgb(88, 160, 84), wall: rgb(60, 66, 90), wall2: rgb(54, 60, 84),
      sky: ['#9ad0ff', '#e8f4ff'], skyline: '#7a8ab8', fog: [214, 232, 250] },
  };

  // ---------- the view: Mode 7 ground + billboards into a low-res buffer ----------
  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lctx = low.getContext('2d'); lctx.imageSmoothingEnabled = false;
  const img = lctx.createImageData(LW, LH - HOR), buf = new Uint32Array(img.data.buffer);
  const ROWZ = Array.from({ length: LH - HOR }, (_, k) => CAMH * FOCAL / (k + 1));   // forward distance seen on each row below the horizon
  function camera(k) { const fx = Math.cos(k.a), fy = Math.sin(k.a); return { x: k.x - fx * CAMD, y: k.y - fy * CAMD, fx, fy, rx: -fy, ry: fx, a: k.a }; }
  function ground(trk, cam, theme) {
    const N = trk.N, col = trk.col, [fr, fg, fb] = theme.fog;
    for (let k = 0; k < LH - HOR; k++) {
      const z = ROWZ[k], fog = Math.min(1, z / FOG), lat0 = -(LW / 2) * z / FOCAL, dl = z / FOCAL;
      let wx = cam.x + cam.fx * z + cam.rx * lat0, wy = cam.y + cam.fy * z + cam.ry * lat0;
      const sx = cam.rx * dl, sy = cam.ry * dl, row = k * LW;
      for (let x = 0; x < LW; x++) {
        const ix = wx | 0, iy = wy | 0;
        let c = (ix >= 0 && iy >= 0 && ix < N && iy < N) ? col[iy * N + ix] : col[0];
        if (fog > .02) { const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255; c = rgb(r + (fr - r) * fog | 0, g + (fg - g) * fog | 0, b + (fb - b) * fog | 0); }
        buf[row + x] = c; wx += sx; wy += sy;
      }
    }
    lctx.putImageData(img, 0, HOR);
  }
  function sky(cam, theme) {
    const g = lctx.createLinearGradient(0, 0, 0, HOR); g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]); lctx.fillStyle = g; lctx.fillRect(0, 0, LW, HOR);
    // a skyline that slides with the heading (one full turn = 4 screen widths)
    const off = (-cam.a / (2 * Math.PI)) * LW * 4; lctx.fillStyle = theme.skyline;
    for (let i = -1; i < 6; i++) { const base = ((off % (LW * 4)) + LW * 4) % (LW * 4) - LW * 4 + i * LW * .8; for (let b = 0; b < 6; b++) { const bx = Math.floor(base + b * 24), h = 8 + ((i * 7 + b * 13) % 5) * 5; lctx.fillRect(bx, HOR - h, 20, h); } }
  }
  // project a world point to the low-res screen: null if behind the camera
  function project(cam, x, y) { const dx = x - cam.x, dy = y - cam.y, fz = dx * cam.fx + dy * cam.fy; if (fz < 4) return null; const lat = dx * cam.rx + dy * cam.ry; return { x: LW / 2 + lat * FOCAL / fz, y: HOR + CAMH * FOCAL / fz, s: FOCAL / fz, z: fz }; }

  // ---------- sprites: small procedural pixel canvases, drawn as billboards ----------
  function spr(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g); return c; }
  const SPR = {
    lamp: spr(6, 40, g => { g.fillStyle = '#5a6070'; g.fillRect(2, 4, 2, 36); g.fillStyle = '#fff6c0'; g.fillRect(0, 0, 6, 5); }),
    cone: spr(10, 12, g => { g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(5, 0); g.lineTo(9, 11); g.lineTo(1, 11); g.fill(); g.fillStyle = '#fff'; g.fillRect(3, 5, 4, 2); g.fillStyle = '#333'; g.fillRect(0, 11, 10, 1); }),
    tree: spr(20, 30, g => { g.fillStyle = '#6a4a2a'; g.fillRect(8, 18, 4, 12); g.fillStyle = '#3a9a4a'; g.beginPath(); g.arc(10, 11, 10, 0, 7); g.fill(); g.fillStyle = '#5ab85a'; g.beginPath(); g.arc(7, 8, 5, 0, 7); g.fill(); }),
    kart: spr(24, 18, g => { g.fillStyle = '#222'; g.fillRect(0, 10, 6, 8); g.fillRect(18, 10, 6, 8); g.fillStyle = '#e83a5a'; g.fillRect(3, 6, 18, 9); g.fillStyle = '#ffd8b0'; g.fillRect(9, 0, 6, 6); g.fillStyle = '#333'; g.fillRect(8, 0, 8, 2); }),
  };
  // scenery placed along the verge on both sides, from the track's own centreline
  function scenery(trk) {
    const out = [], r = mkRng(31), d = trk.def, every = 70;
    for (let s = 20; s < trk.L; s += every) {
      const p = trk.line[Math.floor(s / trk.L * trk.line.length) % trk.line.length];
      for (const side of [-1, 1]) { const off = d.width + 8 + r() * (d.verge - 12), kind = r() < .5 ? 'lamp' : r() < .5 ? 'tree' : 'cone';
        out.push({ x: p.x - p.dy * off * side, y: p.y + p.dx * off * side, img: SPR[kind], size: kind === 'lamp' ? 34 : kind === 'tree' ? 26 : 8 }); }
    }
    return out;
  }
  // billboards far to near; size is the object's world height
  function billboards(cam, objs) {
    const vis = [];
    for (const o of objs) { const p = project(cam, o.x, o.y); if (!p || p.z > FOG * .9) continue; vis.push({ o, p }); }
    vis.sort((a, b) => b.p.z - a.p.z);
    for (const { o, p } of vis) { const h = Math.max(1, Math.round(o.size * p.s)), w = Math.max(1, Math.round(h * o.img.width / o.img.height)); if (p.x + w < 0 || p.x - w > LW) continue; lctx.drawImage(o.img, Math.round(p.x - w / 2), Math.round(p.y - h - (o.lift || 0) * p.s), w, h); }
  }

  // ---------- driving: one pure step for every kart, player and AI alike ----------
  // terrain: how fast you can go on it, and how much sideways grip it gives
  const SURF = { [T.ROAD]: [1, 1], [T.START]: [1, 1], [T.CURB]: [.95, 1], [T.BOOST]: [1, 1], [T.GRASS]: [.5, .7], [T.SAND]: [.45, .6], [T.ICE]: [1, .12] };
  const BASE = { top: 150, accel: 95, turn: 2.8, grip: 7, weight: 1 };
  const terrainAt = (trk, x, y) => { const ix = x | 0, iy = y | 0; return ix < 0 || iy < 0 || ix >= trk.N || iy >= trk.N ? T.WALL : trk.ter[iy * trk.N + ix]; };
  function newKart(x, y, a, stats) { return { x, y, a, vx: 0, vy: 0, st: { ...BASE, ...stats }, drift: 0, charge: 0, boost: 0, bump: 0, ter: T.ROAD, spin: 0 }; }
  const speedOf = k => k.vx * Math.cos(k.a) + k.vy * Math.sin(k.a);
  // input: { steer -1..1, gas 0/1, brake 0/1, drift bool }
  function stepKart(k, inp, trk, dt) {
    const st = k.st, fx = Math.cos(k.a), fy = Math.sin(k.a), rx = -fy, ry = fx;
    let vf = k.vx * fx + k.vy * fy, vl = k.vx * rx + k.vy * ry;
    const ter = k.ter = terrainAt(trk, k.x, k.y), [sm, gm] = SURF[ter] || [1, 1];
    if (ter === T.BOOST) k.boost = Math.max(k.boost, .7);
    const top = st.top * sm * (k.boost > 0 ? 1.35 : 1);
    k.boost = Math.max(0, k.boost - dt); k.bump = Math.max(0, k.bump - dt);
    if (k.spin > 0) { k.spin -= dt; k.a = wrapA(k.a + 9 * dt); vf *= Math.exp(-2.5 * dt); inp = { steer: 0, gas: 0, brake: 0, drift: false }; }
    // engine: accelerate towards the top speed for this surface; above it, slow down quickly (off-road bites)
    if (k.boost > 0) vf = Math.max(vf, top * .98);
    else if (inp.brake) vf -= (vf > 0 ? 160 : 40) * dt;
    else if (inp.gas && vf < top) vf += st.accel * (1 - vf / top * .6) * dt;
    if (vf > top) vf += (top - vf) * 2.2 * dt;
    if (!inp.gas && !inp.brake) vf *= Math.exp(-.6 * dt);
    vf = Math.max(-40, vf);
    // steering: needs some speed; drifting turns tighter or wider depending on how you lean into it
    const sp = Math.min(1, Math.abs(vf) / 60);
    if (inp.drift && !k.drift && Math.abs(inp.steer) > .3 && vf > st.top * .45 && k.spin <= 0) { k.drift = Math.sign(inp.steer); k.charge = 0; k.hop = .12; }
    if (k.drift && (!inp.drift || vf < st.top * .3)) {   // release: a long enough drift fires a mini-turbo
      if (inp.drift === false && k.charge >= 2) k.boost = Math.max(k.boost, 1.0); else if (inp.drift === false && k.charge >= 1) k.boost = Math.max(k.boost, .55);
      k.mt = k.charge >= 2 ? 2 : k.charge >= 1 ? 1 : 0; k.drift = 0; k.charge = 0;
    }
    let turn;
    if (k.drift) { const lean = inp.steer * k.drift; turn = k.drift * st.turn * (1.05 + .5 * lean); k.charge += dt * (.7 + .6 * Math.max(0, lean)); }
    else turn = inp.steer * st.turn * sp * (1 - .25 * Math.min(1, vf / st.top));
    k.a = wrapA(k.a + turn * dt * Math.sign(vf || 1));
    k.hop = Math.max(0, (k.hop || 0) - dt);
    // grip: kill sideways speed; a drift (and ice) lets the kart slide
    const grip = st.grip * gm * (k.drift ? .35 : 1);
    vl *= Math.exp(-grip * dt);
    const nfx = Math.cos(k.a), nfy = Math.sin(k.a);
    // keep the forward speed along the new heading (the old sideways part is what slides)
    k.vx = nfx * vf + rx * vl; k.vy = nfy * vf + ry * vl;
    // move in substeps no longer than 1 unit so a wall can't be tunnelled through
    const dist = Math.hypot(k.vx, k.vy) * dt, n = Math.max(1, Math.ceil(dist));
    for (let i = 0; i < n; i++) {
      const nx = k.x + k.vx * dt / n, ny = k.y + k.vy * dt / n;
      if (terrainAt(trk, nx, ny) === T.WALL) { wall(k, trk); break; }
      k.x = nx; k.y = ny;
    }
  }
  // bounce off a wall: normal from the wall texels around the kart, keep a little of the speed along it
  function wall(k, trk) {
    let nx = 0, ny = 0;
    for (let a = 0; a < 8; a++) { const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4); if (terrainAt(trk, k.x + ca * 4, k.y + sa * 4) === T.WALL) { nx -= ca; ny -= sa; } }
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const vn = k.vx * nx + k.vy * ny;
    if (vn < 0) { k.vx -= 1.4 * vn * nx; k.vy -= 1.4 * vn * ny; }
    k.vx *= .6; k.vy *= .6; k.x += nx * .8; k.y += ny * .8; k.bump = .3; k.drift = 0; k.charge = 0;
  }

  // ---------- state ----------
  // ---------- race: progress along the centreline, laps through checkpoints, AI, bumps ----------
  const LAPS = 3, NK = 8, KR = 6;   // laps, karts, kart radius
  // nearest centreline sample: search near the last one, fall back to a full search when far off the line
  function nearest(trk, k) {
    const L = trk.line, n = L.length; let best = k.li || 0, bd = 1e9;
    const look = (i) => { const p = L[(i + n) % n], d = (p.x - k.x) ** 2 + (p.y - k.y) ** 2; if (d < bd) { bd = d; best = (i + n) % n; } };
    for (let i = (k.li || 0) - 30; i <= (k.li || 0) + 30; i++) look(i);
    if (bd > (trk.def.width * 2) ** 2) for (let i = 0; i < n; i++) look(i);
    return best;
  }
  // progress: laps done x L + distance along. A lap counts only after both checkpoints were crossed,
  // and a jump forward is accepted up to 600 units (a shortcut), never backwards across the line.
  function track(k, trk) {
    const L = trk.L, i = nearest(trk, k), s = trk.line[i].s;
    let ds = s - k.s; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L;
    if (ds > 600 || ds < -300) return;   // too far to be one move: ignore (the kart is off in the weeds)
    k.li = i;
    const prev = k.s; k.s = s;
    for (const [c, frac] of [[0, 1 / 3], [1, 2 / 3]]) { const cs = L * frac; if (!k.cp[c] && ds > 0 && ((prev < cs && s >= cs) || (prev > s && (prev < cs || s >= cs)))) k.cp[c] = true; }
    if (ds > 0 && prev > s) { if (k.cp[0] && k.cp[1]) { k.lap++; k.cp = [false, false]; if (k.lap >= LAPS && !k.done) { k.done = true; k.finishT = S.clock; S.order.push(k); } } else k.lap += 0; }
    if (ds < 0 && prev < s) { /* backed over the line: nothing counts until you come forward again */ }
    k.prog = k.lap * L + k.s;
  }
  // AI: steer at a point ahead on the centreline, shifted to its own lane; drift into tight corners
  function aiInput(k, trk) {
    const L = trk.line, n = L.length, v = speedOf(k), ahead = Math.round((24 + v * .32) / 2);
    const p = L[(k.li + ahead) % n], q = L[(k.li + ahead * 2) % n], lane = (k.ai ? k.ai.lane : 0) * trk.def.width * .45;
    const tx = p.x - p.dy * lane, ty = p.y + p.dx * lane, want = Math.atan2(ty - k.y, tx - k.x), err = wrapA(want - k.a);
    const bend = Math.abs(wrapA(Math.atan2(q.dy, q.dx) - Math.atan2(p.dy, p.dx)));
    // corner speed: the tightest radius in the next stretch sets how fast it can take it (a drift turns tighter)
    let vmax = 1e9; const h0 = Math.atan2(L[k.li].dy, L[k.li].dx);
    for (let j = 5; j <= 70; j += 5) { const pj = L[(k.li + j) % n], ang = Math.abs(wrapA(Math.atan2(pj.dy, pj.dx) - h0)); if (ang > .05) vmax = Math.min(vmax, (j * 2 / ang) * k.st.turn * .8 * (k.ai ? k.ai.brave : 1) + j * 1.2); }
    const turnDir = Math.sign(wrapA(Math.atan2(q.dy, q.dx) - Math.atan2(L[k.li].dy, L[k.li].dx)));
    // drift only into the corner (same side as the bend and the steering), and let go once it straightens
    const steer = clamp(err * 3, -1, 1), drift = k.drift ? (k.drift === turnDir && bend > .2) : (bend > .9 && v > k.st.top * .6 && Math.sign(steer) === turnDir && Math.abs(steer) > .4);
    return { steer, gas: v < vmax ? 1 : 0, brake: v > vmax + 30 ? 1 : 0, drift };
  }
  // stuck: no progress for 3 s puts the kart back on the line where it was (progress kept, placement fixed)
  function unstick(k, trk) {
    if (S.clock - (k.lastProgT || 0) > 3) { const p = trk.line[k.li || 0]; Object.assign(k, { x: p.x, y: p.y, a: Math.atan2(p.dy, p.dx), vx: 0, vy: 0, drift: 0, lastProgT: S.clock }); k.rescues = (k.rescues || 0) + 1; }
    if (k.prog > (k.bestProg || -1e9) + 5) { k.bestProg = k.prog; k.lastProgT = S.clock; }
  }
  // kart-kart bumps: push apart, the lighter one moves more, and swap some speed along the contact line
  function bumps(ks) {
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= KR * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, wa = a.st.weight, wb = b.st.weight, over = KR * 2 - d;
      a.x -= nx * over * wb / (wa + wb); a.y -= ny * over * wb / (wa + wb); b.x += nx * over * wa / (wa + wb); b.y += ny * over * wa / (wa + wb);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv >= 0) continue;
      const imp = -1.3 * rv / (1 / wa + 1 / wb);
      a.vx -= imp * nx / wa; a.vy -= imp * ny / wa; b.vx += imp * nx / wb; b.vy += imp * ny / wb; a.bump = b.bump = .2;
    }
  }
  const S = { t: 0, clock: 0, state: 'count', trk: null, player: null, karts: [], order: [], inp: { steer: 0, gas: 1, brake: 0, drift: false }, seed: 1 };
  function load(ti, seed = 1) {
    S.trk = buildTrack(TRACKS[ti]); S.scenery = scenery(S.trk); S.seed = seed;
    const L = S.trk.line, n = L.length, r = mkRng(seed * 97 + ti);
    S.karts = [];
    for (let g = 0; g < NK; g++) {   // grid: two columns behind the line, the player starts at the back
      const back = 8 + Math.floor(g / 2) * 9, p = L[(n - back) % n], side = (g % 2 ? 1 : -1) * 14;
      const k = newKart(p.x - p.dy * side, p.y + p.dx * side, Math.atan2(p.dy, p.dx), g === NK - 1 ? {} : { top: BASE.top * (.9 + r() * .08) });
      Object.assign(k, { id: g, li: (n - back) % n, s: p.s, lap: -1, cp: [true, true], prog: p.s - S.trk.L, done: false, col: COLORS[g], spr: kartSprite(COLORS[g]),
        ai: g === NK - 1 ? null : { lane: (r() - .5) * 1.0, brave: .95 + r() * .2 } });
      k.prog = p.s - S.trk.L; k.bestProg = k.prog; S.karts.push(k);
    }
    S.player = S.karts[NK - 1]; S.order = []; S.clock = 0; S.t0 = S.t; S.state = 'count';
  }
  const COLORS = ['#3a8aff', '#ffd23a', '#4ad05a', '#a77aff', '#ff9a3a', '#3ad0c8', '#ff6ad0', '#e83a5a'];
  function kartSprite(col) { return spr(24, 18, g => { g.fillStyle = '#222'; g.fillRect(0, 10, 6, 8); g.fillRect(18, 10, 6, 8); g.fillStyle = col; g.fillRect(3, 6, 18, 9); g.fillStyle = '#ffd8b0'; g.fillRect(9, 0, 6, 6); g.fillStyle = '#333'; g.fillRect(8, 0, 8, 2); }); }
  const place = k => S.karts.slice().sort((a, b) => (a.done && b.done) ? a.finishT - b.finishT : a.done ? -1 : b.done ? 1 : b.prog - a.prog).indexOf(k) + 1;
  function update(dt) {
    S.t += dt;
    if (S.state === 'count') { if (S.t - S.t0 > 3) { S.state = 'race'; } return; }
    if (S.state === 'results') return;
    S.clock += dt;
    for (const k of S.karts) {
      const inp = k.ai ? aiInput(k, S.trk) : (S.auto ? aiInput(k, S.trk) : k.done ? { steer: 0, gas: 0, brake: 1, drift: false } : S.inp);
      stepKart(k, k.done && k.ai ? { ...inp, gas: 1 } : inp, S.trk, dt);
    }
    bumps(S.karts);
    for (const k of S.karts) { track(k, S.trk); unstick(k, S.trk); }
    if (S.player.done && !S.finishedAt) S.finishedAt = S.clock;
    if (S.player.done && S.clock - S.finishedAt > 3 || S.clock > 300) { S.state = 'results'; S.karts.filter(k => !k.done).sort((a, b) => b.prog - a.prog).forEach(k => S.order.push(k)); }
  }
  function render(ctx) {
    const cam = camera(S.player), theme = THEMES[S.trk.def.theme];
    sky(cam, theme); ground(S.trk, cam, theme);
    billboards(cam, [...S.scenery, ...S.karts.map(k => ({ x: k.x, y: k.y, img: k.spr, size: 7, lift: k.hop ? 2 : 0 }))]);
    const pk = S.player, pp = project(cam, pk.x, pk.y);
    if (pp && pk.drift) { const c = pk.charge >= 2 ? '#ff9a2a' : pk.charge >= 1 ? '#4ab8ff' : '#ffffff'; lctx.fillStyle = c; for (let i = 0; i < 4; i++) lctx.fillRect(Math.round(pp.x - 14 * pk.drift - 2 + (S.t * 60 + i * 7) % 6), Math.round(pp.y - 2 - i), 2, 2); }
    if (pp && pk.boost > 0) { lctx.fillStyle = (S.t * 20 | 0) % 2 ? '#ffd23a' : '#ff6a2a'; lctx.fillRect(Math.round(pp.x - 3), Math.round(pp.y), 6, 3); }
    ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, LW * SCALE, LH * SCALE);
    ctx.fillStyle = '#14141e'; ctx.fillRect(0, LH * SCALE, W, H - LH * SCALE);
    ctx.fillStyle = '#ffffff14'; Draw.rr(ctx, PAD.x, PAD.y, PAD.w, PAD.h, 24); ctx.fill(); ctx.fillStyle = '#ffffff55'; Draw.circ(ctx, PAD.x + PAD.w / 2 + S.inp.steer * PAD.w * .4, PAD.y + PAD.h / 2, 30);
    ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff88'; ctx.fillText('◀ STEER ▶', PAD.x + PAD.w / 2, PAD.y + PAD.h - 16);
    ctx.fillStyle = S.inp.drift ? '#ff9a2a' : '#ffffff14'; Draw.rr(ctx, DRIFTB.x, DRIFTB.y, DRIFTB.w, DRIFTB.h, 24); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 26px system-ui'; ctx.fillText('DRIFT', DRIFTB.x + DRIFTB.w / 2, DRIFTB.y + DRIFTB.h / 2 + 8);
    ctx.font = '800 22px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(Math.max(0, speedOf(S.player)) * .6)} km/h`, 24, LH * SCALE + 50);
    const pl = place(S.player); Draw.bigText(ctx, `${pl}${['ST', 'ND', 'RD'][pl - 1] || 'TH'}`, W - 80, 90, 54, '#ffe14a', '#000');
    Draw.bigText(ctx, `LAP ${clamp(S.player.lap + 1, 1, LAPS)}/${LAPS}`, 90, 90, 30, '#fff', '#000');
    if (S.state === 'count') { const n = 3 - Math.floor(S.t - S.t0); Draw.bigText(ctx, n > 0 ? String(n) : 'GO!', W / 2, 300, 120, n > 0 ? '#fff' : '#4ad05a', '#000'); }
    if (S.state === 'results') { ctx.fillStyle = '#000c'; ctx.fillRect(40, 140, W - 80, 440); S.order.forEach((k, i) => { ctx.fillStyle = k === S.player ? '#ffe14a' : '#fff'; ctx.font = '800 26px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}. ${k === S.player ? 'YOU' : 'CPU ' + (k.id + 1)}`, 80, 200 + i * 46); ctx.textAlign = 'right'; ctx.fillText(k.done ? k.finishT.toFixed(2) + ' s' : '—', W - 80, 200 + i * 46); }); }
  }
  // touch: the bottom panel. Drag left/right on the steering pad; hold DRIFT. (One pointer each side.)
  const PAD = { x: 20, y: LH * SCALE + 150, w: 300, h: 190 }, DRIFTB = { x: 340, y: LH * SCALE + 150, w: 180, h: 190 };
  const inB = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  let padDown = false;
  function onPointer(type, x, y) {
    if (type === 'down' && inB(DRIFTB, x, y)) { S.inp.drift = true; return; }
    if (type === 'down' && inB(PAD, x, y)) padDown = true;
    if (padDown && (type === 'down' || type === 'move')) S.inp.steer = clamp((x - (PAD.x + PAD.w / 2)) / (PAD.w * .4), -1, 1);
    if (type === 'up' || type === 'cancel') { if (x > PAD.x + PAD.w) S.inp.drift = false; else { padDown = false; S.inp.steer = 0; } }
  }
  const keys = {};
  function onKey(key, down) {
    keys[key] = down;
    S.inp.steer = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
    S.inp.brake = keys.ArrowDown || keys.s ? 1 : 0;
    S.inp.drift = !!(keys[' '] || keys.Shift);
  }

  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = { S, TRACKS, T, SURF, BASE, LAPS, place, aiInput, load, buildTrack, project, camera, newKart, stepKart, terrainAt, speedOf, step: n => game.step(n), get state() { return S.state; } };
})();
