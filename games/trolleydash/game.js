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
    for (const { o, p } of vis) { const h = Math.max(1, Math.round(o.size * p.s)), w = Math.max(1, Math.round(h * o.img.width / o.img.height)); if (p.x + w < 0 || p.x - w > LW) continue; lctx.drawImage(o.img, Math.round(p.x - w / 2), Math.round(p.y - h), w, h); }
  }

  // ---------- state ----------
  const S = { t: 0, state: 'race', trk: null, player: { x: 0, y: 0, a: 0, v: 0 }, steer: 0, gas: true };
  function load(ti) {
    S.trk = buildTrack(TRACKS[ti]); S.scenery = scenery(S.trk); const p = S.trk.line[2];
    Object.assign(S.player, { x: p.x, y: p.y, a: Math.atan2(p.dy, p.dx), v: 0 });
  }
  function update(dt) {
    S.t += dt;
    const k = S.player;   // placeholder driving for the renderer milestone; real physics comes next
    k.v = Math.min(140, k.v + 80 * dt); k.a = wrapA(k.a + S.steer * 1.8 * dt);
    k.x += Math.cos(k.a) * k.v * dt; k.y += Math.sin(k.a) * k.v * dt;
  }
  function render(ctx) {
    const cam = camera(S.player), theme = THEMES[S.trk.def.theme];
    sky(cam, theme); ground(S.trk, cam, theme);
    billboards(cam, [...S.scenery, { x: S.player.x, y: S.player.y, img: SPR.kart, size: 7 }]);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, LW * SCALE, LH * SCALE);
    ctx.fillStyle = '#14141e'; ctx.fillRect(0, LH * SCALE, W, H - LH * SCALE);
  }
  function onPointer(type, x, y) { if (type === 'down' || type === 'move') S.steer = x < W / 3 ? -1 : x > W * 2 / 3 ? 1 : 0; if (type === 'up' || type === 'cancel') S.steer = 0; }
  const keys = {};
  function onKey(key, down) { keys[key] = down; S.steer = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); }

  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = { S, TRACKS, T, load, buildTrack, project, camera, step: n => game.step(n), get state() { return S.state; } };
})();
