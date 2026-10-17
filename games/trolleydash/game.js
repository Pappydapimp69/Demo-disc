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
  const T = { WALL: 0, GRASS: 1, ROAD: 2, CURB: 3, BOOST: 4, SAND: 5, ICE: 6, START: 7, PEAS: 8 };

  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian ABGR for Uint32 ImageData

  // ---------- tracks ----------
  // A track is a closed centreline (control points, Catmull-Rom), a road width and a verge before the wall.
  // Features are placed by distance along the centreline (s) so they stay put when the shape is edited.
  const TRACKS = [
    { name: 'CAR PARK CIRCUIT', size: 1024, width: 44, verge: 30, theme: 'carpark',
      pts: [[200, 820], [200, 300], [300, 180], [520, 170], [640, 280], [600, 440], [760, 520], [860, 420], [900, 640], [820, 860], [560, 900], [420, 760], [300, 880]],
      // the loading-bay alley under the notch, and a gravel cut inside the top-right bend
      shortcuts: [{ name: 'LOADING BAY', pts: [[560, 888], [480, 910], [380, 910], [300, 880]], width: 16, ter: 'ROAD', ai: .5 }, { name: 'GRAVEL', pts: [[440, 168], [520, 270], [600, 420]], width: 20, ter: 'SAND', ai: 0 }],
      boxes: [600, 1550, 2300], boosts: [[250, 0], [1700, -14], [2050, 14]], cones: [[1950, -20], [2010, 18], [2070, -20]] },
    { name: 'FROZEN FOODS', size: 1024, width: 44, verge: 26, theme: 'frozen',
      pts: [[160, 860], [160, 200], [290, 130], [420, 220], [420, 700], [540, 810], [660, 700], [660, 220], [780, 130], [880, 220], [880, 840], [760, 930], [300, 930]],
      // the freezer door between aisles 2 and 3 (skips the iced bend), and spilled peas inside the top-right bend
      shortcuts: [{ name: 'FREEZER DOOR', pts: [[420, 600], [450, 660], [540, 680], [630, 660], [660, 600]], width: 16, ter: 'ROAD', ai: .5 }, { name: 'SPILLED PEAS', pts: [[660, 340], [700, 268], [840, 268], [880, 340]], width: 22, ter: 'PEAS', ai: 0 }],
      patches: [[0, 0, 0, 'ICE', [290, 140]], [0, 0, 0, 'ICE', [540, 800]], [0, 0, 0, 'ICE', [780, 140]], [0, 0, 0, 'ICE', [520, 930]]],
      boxes: [600, 1900, 3000], boosts: [[300, 0], [1500, 10], [2700, -10], [3700, 0]], cones: [[3350, -18], [3410, 18], [3470, -18]] },
    { name: 'GARDEN CENTRE', size: 1024, width: 46, verge: 34, theme: 'garden',
      pts: [[220, 800], [180, 520], [260, 260], [480, 160], [700, 220], [860, 180], [920, 420], [760, 560], [870, 770], [700, 910], [480, 860], [380, 700]],
      // a path through the greenhouse inside the big right-hand bulge, and a potting-soil cut at the bottom-right
      shortcuts: [{ name: 'GREENHOUSE', pts: [[800, 210], [826, 300], [800, 380], [826, 460], [790, 540]], width: 15, ter: 'ROAD', ai: .5 }, { name: 'POTTING SOIL', pts: [[862, 600], [760, 760], [660, 912]], width: 22, ter: 'SAND', ai: 0 }],
      patches: [[0, 0, 0, 'SAND', [300, 260]], [0, 0, 0, 'SAND', [620, 900]]],
      boxes: [400, 1300, 2150], boosts: [[150, 0], [700, 12], [1900, -12]], cones: [[500, -20], [560, 18], [620, -20]] },
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
    { const p = line[0]; for (let a = -4; a <= 4; a++) for (let o = -(def.width - 6); o <= def.width - 6; o++) { const x = Math.round(p.x + p.dx * a - p.dy * o), y = Math.round(p.y + p.dy * a + p.dx * o); if (x >= 0 && y >= 0 && x < N && y < N) ter[y * N + x] = T.START; } }
    // shortcuts: a curb-edged alley or an off-road strip cut through whatever is there; they skip part of the lap
    const at = s0 => line[Math.floor(((s0 % line.L) + line.L) % line.L / line.L * line.length) % line.length];
    const seg = (pts, f) => { for (let i = 0; i + 1 < pts.length; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], d = Math.hypot(bx - ax, by - ay); for (let t = 0; t <= d; t += 1.5) f(ax + (bx - ax) * t / d, ay + (by - ay) * t / d); } };
    for (const sc of def.shortcuts || []) {
      if (sc.ter === 'ROAD') { seg(sc.pts, (x, y) => stamp(x, y, sc.width + 4, T.CURB, T.CURB, Math.hypot(x, y))); seg(sc.pts, (x, y) => stamp(x, y, sc.width, T.ROAD)); }
      else seg(sc.pts, (x, y) => stamp(x, y, sc.width, T[sc.ter], T.CURB));
    }
    for (const [, , , kind, [px, py]] of def.patches || []) stamp(px, py, 40, T[kind], undefined);
    for (const [s0, off] of def.boosts || []) { const p = at(s0); for (let a = -12; a <= 12; a += 1) stamp(p.x + p.dx * a - p.dy * off, p.y + p.dy * a + p.dx * off, 9, T.BOOST); }
    // colours
    const theme = THEMES[def.theme], r = mkRng(7);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, t = ter[i], s = sAt[i];
      let c;
      if (t === T.ROAD) { const tile = ((x >> 4) + (y >> 4)) & 1; c = tile ? theme.road : theme.road2; }
      else if (t === T.CURB) c = Math.floor(s / 10) & 1 ? theme.curbA : theme.curbB;
      else if (t === T.START) c = ((x >> 3) + (y >> 3)) & 1 ? rgb(250, 250, 250) : rgb(30, 30, 40);
      else if (t === T.GRASS) c = (r() < .5) ? theme.grass : theme.grass2;
      else if (t === T.SAND) c = r() < .5 ? rgb(214, 180, 120) : rgb(200, 166, 108);
      else if (t === T.PEAS) c = r() < .35 ? rgb(90, 190, 70) : r() < .5 ? rgb(70, 160, 56) : rgb(200, 220, 230);
      else if (t === T.ICE) c = ((x + y) >> 3) & 1 ? rgb(214, 240, 255) : rgb(190, 228, 250);
      else if (t === T.BOOST) c = ((x + y) >> 2) & 1 ? rgb(255, 210, 40) : rgb(255, 120, 30);
      else c = ((x >> 5) + (y >> 5)) & 1 ? theme.wall : theme.wall2;
      col[i] = c;
    }
    const cones = (def.cones || []).map(([s0, off]) => { const p = at(s0); return { x: p.x - p.dy * off, y: p.y + p.dx * off }; });
    const shortcuts = (def.shortcuts || []).map(sc => { const near = ([x, y]) => line.reduce((b, p, i) => (p.x - x) ** 2 + (p.y - y) ** 2 < (line[b].x - x) ** 2 + (line[b].y - y) ** 2 ? i : b, 0);
      const a = near(sc.pts[0]), b = near(sc.pts[sc.pts.length - 1]), path = []; seg(sc.pts, (x, y) => { const q = path[path.length - 1]; if (!q || Math.hypot(q.x - x, q.y - y) >= 2) path.push({ x, y }); });
      for (let i = 0; i < path.length; i++) { const q = path[Math.min(path.length - 1, i + 1)], o = path[Math.max(0, i - 1)], d = Math.hypot(q.x - o.x, q.y - o.y) || 1; path[i].dx = (q.x - o.x) / d; path[i].dy = (q.y - o.y) / d; }
      return { ...sc, ia: a, ib: b, path, skip: ((line[b].s - line[a].s) % line.L + line.L) % line.L }; });
    const boxes = []; for (const s0 of def.boxes || []) { const p = at(s0); for (const off of [-24, -8, 8, 24]) boxes.push({ x: p.x - p.dy * off, y: p.y + p.dx * off, back: 0 }); }
    // lap checkpoints near a third and two thirds of the way, moved out of any stretch a shortcut skips
    const inSkip = x => shortcuts.some(sc => { const a = line[sc.ia].s, d = ((x - a) % line.L + line.L) % line.L; return d < sc.skip + 20; });
    const cps = [1 / 3, 2 / 3].map(f => { for (let d = 0; d < line.L / 4; d += 10) for (const x of [line.L * f + d, line.L * f - d]) if (!inSkip(x)) return x; return line.L * f; });
    return { def, N, ter, sAt, col, line, L: line.L, cones, shortcuts, boxes, cps };
  }
  const THEMES = {
    carpark: { road: rgb(92, 96, 108), road2: rgb(86, 90, 102), curbA: rgb(230, 70, 80), curbB: rgb(245, 245, 245), grass: rgb(96, 170, 90), grass2: rgb(88, 160, 84), wall: rgb(60, 66, 90), wall2: rgb(54, 60, 84),
      sky: ['#9ad0ff', '#e8f4ff'], skyline: '#7a8ab8', fog: [214, 232, 250] },
    frozen: { road: rgb(200, 214, 228), road2: rgb(188, 204, 220), curbA: rgb(70, 140, 230), curbB: rgb(245, 250, 255), grass: rgb(150, 210, 240), grass2: rgb(140, 200, 235), wall: rgb(230, 240, 250), wall2: rgb(210, 226, 244),
      sky: ['#cfe6ff', '#ffffff'], skyline: '#a8c4e8', fog: [236, 244, 255] },
    garden: { road: rgb(176, 150, 120), road2: rgb(166, 140, 112), curbA: rgb(250, 250, 240), curbB: rgb(120, 90, 60), grass: rgb(90, 160, 70), grass2: rgb(80, 150, 64), wall: rgb(40, 110, 50), wall2: rgb(34, 100, 44),
      sky: ['#bfe8a8', '#fff8d0'], skyline: '#5a9a5a', fog: [240, 244, 214] },
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
      const z = ROWZ[k], fog = Math.min(1, z / (S.fogNow || FOG)), lat0 = -(LW / 2) * z / FOCAL, dl = z / FOCAL;
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
    bag: spr(14, 14, g => { g.fillStyle = '#ffd23a'; g.fillRect(1, 3, 12, 11); g.fillStyle = '#e8a020'; g.fillRect(1, 12, 12, 2); g.strokeStyle = '#a06a10'; g.strokeRect(4.5, .5, 5, 4); g.fillStyle = '#3a2a6a'; g.font = 'bold 10px monospace'; g.fillText('?', 4, 12); }),
    banana: spr(10, 6, g => { g.fillStyle = '#ffe14a'; g.fillRect(0, 2, 10, 3); g.fillStyle = '#c8a020'; g.fillRect(0, 2, 2, 2); g.fillRect(8, 2, 2, 2); }),
    melon: spr(10, 10, g => { g.fillStyle = '#3a9a3a'; g.beginPath(); g.arc(5, 5, 5, 0, 7); g.fill(); g.fillStyle = '#8ad08a'; g.fillRect(2, 2, 1, 6); g.fillRect(5, 1, 1, 8); g.fillRect(8, 2, 1, 6); }),
    trolley: spr(14, 10, g => { g.fillStyle = '#333'; g.fillRect(1, 8, 2, 2); g.fillRect(11, 8, 2, 2); g.fillStyle = '#c8d0dc'; g.fillRect(0, 2, 14, 6); g.fillStyle = '#e83a3a'; g.fillRect(0, 0, 14, 2); }),
    forklift: spr(24, 22, g => { g.fillStyle = '#222'; g.fillRect(1, 17, 6, 5); g.fillRect(17, 17, 6, 5); g.fillStyle = '#ffc20a'; g.fillRect(2, 8, 20, 10); g.fillStyle = '#333'; g.fillRect(4, 0, 2, 9); g.fillRect(18, 0, 2, 9); g.fillRect(4, 0, 16, 2); g.fillStyle = '#ff6a2a'; g.fillRect(10, 3, 4, 3); }),
    door: spr(30, 20, g => { g.fillStyle = '#8a8a96'; g.fillRect(0, 0, 30, 20); g.fillStyle = '#6a6a76'; for (let y = 2; y < 20; y += 3) g.fillRect(0, y, 30, 1); g.fillStyle = '#ffd23a'; g.fillRect(0, 17, 30, 3); g.fillStyle = '#222'; for (let x = 0; x < 30; x += 6) g.fillRect(x, 17, 3, 3); }),
    sign: spr(10, 14, g => { g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(5, 0); g.lineTo(10, 14); g.lineTo(0, 14); g.fill(); g.fillStyle = '#222'; g.fillRect(4, 5, 2, 5); }),
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

  // ---------- the roster: 8 shoppers x 3 vehicles. Speed, accel, handling and grip are trade-offs (points add to zero);
  // weight is flavour on top (it only matters in bumps), so it is kept out of the budget. Plus one trait each ----------
  const PT = { top: .04, accel: .10, turn: .07, grip: .10, weight: .15 };   // what one point is worth, as a fraction of the base
  const CHARS = [
    { name: 'GLORIA', who: 'GRANDMA', body: '#c88aff', skin: '#f0c8a0', hair: '#f4f4fa', hat: 'curls', pts: { top: 2, accel: -1, turn: -1, weight: 2 }, trait: 'anchor', desc: 'BUMPS BARELY MOVE HER' },
    { name: 'TODD', who: 'STOCK BOY', body: '#3a8aff', skin: '#f0c8a0', hair: '#6a3a1a', hat: 'cap', pts: { accel: 2, top: -1, grip: -1, weight: -1 }, trait: 'rocket', desc: 'ROCKET START ON GO' },
    { name: 'MARGE', who: 'MANAGER', body: '#e83a5a', skin: '#c89070', hair: '#2a1a10', hat: 'bun', pts: { turn: 1, grip: 1, top: -1, accel: -1 }, trait: 'spark', desc: 'DRIFT TURBOS CHARGE FASTER' },
    { name: 'BEN', who: 'BAGGER', body: '#4ad05a', skin: '#f0d0b0', hair: '#e8b030', hat: 'mop', pts: { accel: 1, top: -1, weight: -1 }, trait: 'offroad', desc: 'GRASS AND SAND SLOW HIM LESS' },
    { name: 'CHEN', who: 'DELI CHEF', body: '#f4f4f4', skin: '#f0c890', hair: '#1a1a1a', hat: 'chef', pts: {}, trait: 'pads', desc: 'BOOST PADS LAST LONGER' },
    { name: 'SAL', who: 'SECURITY', body: '#2a3a5a', skin: '#8a5a3a', hair: '#1a1a1a', hat: 'guard', pts: { top: 1, accel: -1, weight: 2 }, trait: 'draft', desc: 'FASTER IN SOMEONE\'S SLIPSTREAM' },
    { name: 'TWINS', who: 'KIDS', body: '#ffd23a', skin: '#f0c8a0', hair: '#a04a1a', hat: 'twins', pts: { turn: 2, accel: 1, top: -2, grip: -1, weight: -1 }, trait: 'nimble', desc: 'TIGHTER DRIFTS' },
    { name: 'PIDGE', who: 'STORE PIGEON', body: '#8a90a0', skin: '#8a90a0', hair: '#5a6070', hat: 'beak', pts: { top: 1, grip: -1 }, trait: 'slick', desc: 'KEEPS GRIP ON ICE AND SAND' },
  ];
  const VEHS = [
    { name: 'TROLLEY', pts: { turn: 2, grip: 1, top: -2, accel: -1, weight: -1 }, desc: 'NIMBLE, GRIPPY, SLOWER' },
    { name: 'GO-KART', pts: { top: 1, accel: 1, turn: -1, grip: -1 }, desc: 'QUICK ALL ROUND' },
    { name: 'SCOOTER', pts: { top: 2, accel: -1, turn: -1, weight: 2 }, desc: 'HEAVY AND FAST, SLOW OFF THE LINE' },
  ];
  function statsFor(ci, vi) {
    const out = { trait: CHARS[ci].trait };
    for (const k of Object.keys(PT)) out[k] = BASE[k] * (1 + PT[k] * ((CHARS[ci].pts[k] || 0) + (VEHS[vi].pts[k] || 0)));
    return out;
  }

  // ---------- driving: one pure step for every kart, player and AI alike ----------
  // terrain: how fast you can go on it, and how much sideways grip it gives
  const SURF = { [T.ROAD]: [1, 1], [T.START]: [1, 1], [T.CURB]: [.95, 1], [T.BOOST]: [1, 1], [T.GRASS]: [.5, .7], [T.SAND]: [.45, .6], [T.PEAS]: [.36, .65], [T.ICE]: [1, .12] };
  const BASE = { top: 150, accel: 95, turn: 2.8, grip: 7, weight: 1 };
  const terrainAt = (trk, x, y) => { const ix = x | 0, iy = y | 0; return ix < 0 || iy < 0 || ix >= trk.N || iy >= trk.N ? T.WALL : trk.ter[iy * trk.N + ix]; };
  function newKart(x, y, a, stats) { return { x, y, a, vx: 0, vy: 0, st: { ...BASE, ...stats }, drift: 0, charge: 0, boost: 0, bump: 0, ter: T.ROAD, spin: 0 }; }
  const speedOf = k => k.vx * Math.cos(k.a) + k.vy * Math.sin(k.a);
  // input: { steer -1..1, gas 0/1, brake 0/1, drift bool }
  function stepKart(k, inp, trk, dt) {
    const st = k.st, fx = Math.cos(k.a), fy = Math.sin(k.a), rx = -fy, ry = fx;
    let vf = k.vx * fx + k.vy * fy, vl = k.vx * rx + k.vy * ry;
    const ter = k.ter = terrainAt(trk, k.x, k.y); let [sm, gm] = SURF[ter] || [1, 1];
    if (st.trait === 'offroad' && sm < 1) sm = Math.max(sm, .7);
    if (k.boost > 0) sm = Math.max(sm, 1);   // a boost carries you over the rough stuff
    if (k.slow > 0) sm *= .7;
    if (S.puddles && S.puddles.some(p => Math.hypot(k.x - p.x, k.y - p.y) < p.r)) gm = Math.min(gm, .1);
    if (st.trait === 'slick' && gm < 1) gm = Math.min(1, gm * 2.5);
    if (ter === T.BOOST) k.boost = Math.max(k.boost, st.trait === 'pads' ? 1.05 : .7);
    if (st.trait === 'draft' && S.karts.some(o => o !== k && (() => { const dx = o.x - k.x, dy = o.y - k.y, d = Math.hypot(dx, dy); return d > 8 && d < 45 && (dx * fx + dy * fy) / d > .93; })())) sm *= 1.07;
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
    if (k.drift) { const lean = inp.steer * k.drift; turn = k.drift * st.turn * (1.05 + .5 * lean); k.charge += dt * (.7 + .6 * Math.max(0, lean)) * (st.trait === 'spark' ? 1.3 : 1); if (st.trait === 'nimble') turn *= 1.12; }
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
  // ---------- items: mystery bags give one item; the odds lean on where you are in the race ----------
  const ITEMS = {
    coffee: { name: 'TURBO COFFEE', icon: '☕' }, espresso: { name: 'TRIPLE ESPRESSO', icon: '☕☕☕' }, banana: { name: 'BANANA PEEL', icon: '🍌' },
    melon: { name: 'ROLLING MELON', icon: '🍉' }, trolley: { name: 'RUNAWAY TROLLEY', icon: '🛒' }, sign: { name: 'WET FLOOR', icon: '⚠️' }, tannoy: { name: 'CLEAN-UP ON AISLE 5', icon: '📢' },
  };
  // weights per item for 1st..8th place: leaders get defence, the back gets speed and the announcement
  const ODDS = {
    banana: [40, 25, 18, 12, 8, 5, 2, 0], sign: [25, 20, 14, 10, 6, 4, 2, 0], melon: [30, 30, 28, 24, 18, 12, 8, 6], coffee: [5, 15, 22, 26, 28, 28, 26, 22],
    trolley: [0, 10, 18, 22, 24, 24, 22, 20], espresso: [0, 0, 0, 6, 12, 18, 24, 28], tannoy: [0, 0, 0, 0, 4, 9, 16, 24],
  };
  function rollItem(place, r) { const ks = Object.keys(ODDS), tot = ks.reduce((a, k) => a + ODDS[k][place - 1], 0); let x = r() * tot; for (const k of ks) { x -= ODDS[k][place - 1]; if (x <= 0) return k; } return 'coffee'; }
  // use an item: boosts on you, things dropped behind you, things thrown ahead
  function useItem(k) {
    const it = k.item; if (!it || k.roll > 0) return; const fx = Math.cos(k.a), fy = Math.sin(k.a);
    if (it === 'coffee') { k.boost = Math.max(k.boost, 1.5); k.item = null; }
    else if (it === 'espresso') { k.boost = Math.max(k.boost, 1.5); k.uses = (k.uses || 3) - 1; if (k.uses <= 0) { k.item = null; k.uses = 0; } }
    else if (it === 'banana') { S.drops.push({ kind: 'banana', x: k.x - fx * 12, y: k.y - fy * 12, owner: k, t: S.clock }); k.item = null; }
    else if (it === 'sign') { S.puddles.push({ x: k.x - fx * 18, y: k.y - fy * 18, r: 16, until: S.clock + 12 }); k.item = null; }
    else if (it === 'melon') { S.shots.push({ kind: 'melon', x: k.x + fx * 12, y: k.y + fy * 12, vx: fx * 240 + k.vx * .3, vy: fy * 240 + k.vy * .3, owner: k, life: 6, bounces: 3 }); k.item = null; }
    else if (it === 'trolley') { const ahead = S.karts.filter(o => o !== k && !o.done && place(o) === place(k) - 1)[0]; S.shots.push({ kind: 'trolley', x: k.x + fx * 12, y: k.y + fy * 12, vx: fx * 230, vy: fy * 230, owner: k, target: ahead || null, li: k.li, life: 10, bounces: 0 }); k.item = null; }
    else if (it === 'tannoy') { for (const o of S.karts) if (o !== k && place(o) < place(k)) { o.slow = 2.5; o.spin = Math.max(o.spin, .35); } S.flashMsg = { text: '📢 CLEAN-UP ON AISLE 5!', t: S.t }; k.item = null; }
    k.used = (k.used || 0) + 1; if (k === S.player) Snd.use();
  }
  function hit(k, why) { if (k === S.player) { Snd.hit(); S.shake = .5; } if (k.boost > 0 && why !== 'tannoy') { k.boost = 0; } k.spin = Math.max(k.spin, 1.1); k.drift = 0; k.charge = 0; k.hits = (k.hits || 0) + 1; if (k === S.player) S.flashMsg = { text: why, t: S.t }; }
  function items(dt) {
    for (const k of S.karts) { if (k.roll > 0) { k.roll -= dt; if (k.roll <= 0) k.item = k.pending; } k.slow = Math.max(0, (k.slow || 0) - dt); }
    for (const b of S.trk.boxes) { if (b.back > S.clock) continue; for (const k of S.karts) if (Math.hypot(k.x - b.x, k.y - b.y) < KR + 5) { b.back = S.clock + 3; if (!k.item && !(k.roll > 0)) { k.pending = rollItem(place(k), S.rng); k.roll = 1; if (k === S.player) Snd.pick(); } break; } }
    // projectiles move in short substeps (no tunnelling), bounce or die on walls, and spin whoever they touch
    for (const sh of S.shots) {
      sh.life -= dt; const steps = Math.max(1, Math.ceil(Math.hypot(sh.vx, sh.vy) * dt / 2));
      if (sh.kind === 'trolley') {   // follow the track, then home in on the target once close
        const L = S.trk.line, n = L.length; let bi = sh.li, bd = 1e9; for (let j = -10; j <= 20; j++) { const q = L[(sh.li + j + n) % n], d = (q.x - sh.x) ** 2 + (q.y - sh.y) ** 2; if (d < bd) { bd = d; bi = (sh.li + j + n) % n; } } sh.li = bi;
        const tg = sh.target && !sh.target.done && Math.hypot(sh.target.x - sh.x, sh.target.y - sh.y) < 110 ? sh.target : null, q = tg || L[(sh.li + 12) % n];
        const want = Math.atan2(q.y - sh.y, q.x - sh.x), cur = Math.atan2(sh.vy, sh.vx), na = cur + clamp(wrapA(want - cur), -5 * dt, 5 * dt);
        sh.vx = Math.cos(na) * 230; sh.vy = Math.sin(na) * 230;
      }
      for (let i = 0; i < steps && sh.life > 0; i++) {
        const nx = sh.x + sh.vx * dt / steps, ny = sh.y + sh.vy * dt / steps;
        if (terrainAt(S.trk, nx, ny) === T.WALL) { if (sh.bounces-- > 0) { if (terrainAt(S.trk, nx, sh.y) === T.WALL) sh.vx = -sh.vx; if (terrainAt(S.trk, sh.x, ny) === T.WALL) sh.vy = -sh.vy; } else sh.life = 0; continue; }
        sh.x = nx; sh.y = ny;
        for (const k of S.karts) if ((k !== sh.owner || sh.age > .4) && Math.hypot(k.x - sh.x, k.y - sh.y) < KR + 4) { hit(k, sh.kind === 'melon' ? '🍉 MELON!' : '🛒 RUNAWAY TROLLEY!'); sh.life = 0; break; }
      }
      sh.age = (sh.age || 0) + dt;
    }
    S.shots = S.shots.filter(sh => sh.life > 0);
    for (const d of S.drops) for (const k of S.karts) if (!d.gone && (k !== d.owner || S.clock - d.t > .8) && Math.hypot(k.x - d.x, k.y - d.y) < KR + 3) { hit(k, '🍌 BANANA!'); d.gone = true; }
    S.drops = S.drops.filter(d => !d.gone);
    S.puddles = S.puddles.filter(p => p.until > S.clock);
  }
  // AI item use: simple, readable rules
  function aiItem(k) {
    if (!k.item || k.roll > 0) return; const fx = Math.cos(k.a), fy = Math.sin(k.a), pl = place(k);
    const behind = S.karts.some(o => o !== k && Math.hypot(o.x - k.x, o.y - k.y) < 60 && ((o.x - k.x) * fx + (o.y - k.y) * fy) < 0);
    const aheadIn = S.karts.some(o => { const dx = o.x - k.x, dy = o.y - k.y, d = Math.hypot(dx, dy); return o !== k && d < 150 && (dx * fx + dy * fy) / d > .97; });
    const it = k.item;
    if ((it === 'coffee' || it === 'espresso') && (k.route || Math.abs(aiInput(k, S.trk).steer) < .25)) useItem(k);
    else if ((it === 'banana' || it === 'sign') && behind) useItem(k);
    else if (it === 'melon' && aheadIn) useItem(k);
    else if (it === 'trolley' && pl > 1) useItem(k);
    else if (it === 'tannoy') useItem(k);
    else if (S.clock - (k.heldSince || (k.heldSince = S.clock)) > 12) { useItem(k); k.heldSince = 0; }
  }

  // ---------- sound: one engine voice and one screech kept alive, short effects under a voice budget, a scheduled loop ----------
  const Snd = {
    live: 0, last: {}, eng: null,
    ctx() { return Audio.ctx && !Audio.muted ? Audio.ctx : null; },
    fx(name, fn, cool = .08) { const c = this.ctx(); if (!c || this.live >= 14 || (this.last[name] || -9) > S.t - cool) return; this.last[name] = S.t; this.live++; setTimeout(() => this.live--, 500); fn(); },
    engine(k) {
      const c = this.ctx(); if (!c) return;
      try {
        if (!this.eng) { const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
          o.connect(f); o2.connect(f); f.connect(g).connect(c.destination); o.start(); o2.start();
          const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = ((i * 1103515245 + 12345 >>> 8) % 2000) / 1000 - 1; n.buffer = b; n.loop = true;
          const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2500; nf.Q.value = 2; const ng = c.createGain(); ng.gain.value = 0; n.connect(nf).connect(ng).connect(c.destination); n.start();
          this.eng = { o, o2, g, ng }; }
        const v = Math.max(0, speedOf(k)), t = c.currentTime, racing = S.state === 'race' || S.state === 'count';
        this.eng.o.frequency.setTargetAtTime(48 + v * .55 + (k.boost > 0 ? 30 : 0), t, .05); this.eng.o2.frequency.setTargetAtTime(24 + v * .28, t, .05);
        this.eng.g.gain.setTargetAtTime(racing ? .035 + Math.min(.03, v / 6000) : 0, t, .1);
        this.eng.ng.gain.setTargetAtTime(racing && (k.drift || k.spin > 0) ? .05 : 0, t, .05);
      } catch (_) {}
    },
    boost() { this.fx('boost', () => { Audio.noise(.4, .12); Audio.tone(300, .35, 'sawtooth', .05, 900); }, .3); },
    pick() { this.fx('pick', () => Audio.tone(1200, .05, 'square', .04)); },
    use() { this.fx('use', () => Audio.tone(500, .12, 'square', .06, 900)); },
    hit() { this.fx('hit', () => { Audio.noise(.25, .2); Audio.tone(220, .4, 'sawtooth', .07, 80); }, .2); },
    bump() { this.fx('bump', () => Audio.noise(.06, .12), .15); },
    beep(hi) { Audio.tone(hi ? 880 : 440, hi ? .4 : .15, 'square', .08); },
    lap(final) { [0, 4, 7, final ? 12 : 7].forEach((m, i) => Audio.tone(523 * 2 ** (m / 12), .12, 'square', .07, null, i * .09)); },
    // a short chiptune loop, scheduled ahead on the audio clock (never per-note timers)
    music() {
      const c = this.ctx(); if (!c || S.state !== 'race') { this.mt = null; return; }
      if (!this.mt || this.mt < c.currentTime) this.mt = c.currentTime + .05;
      const beat = 60 / 150 / 2, bass = [0, 0, 7, 0, 5, 5, 3, 5], lead = [12, 15, 19, 15, 17, 15, 12, 10];
      while (this.mt < c.currentTime + .25) { const i = this.step = ((this.step || 0) + 1) % 32, at = this.mt - c.currentTime;
        Audio.tone(110 * 2 ** (bass[(i >> 2) % 8] / 12), beat * .9, 'triangle', .035, null, at);
        if (i % 2 === 0) Audio.tone(440 * 2 ** (lead[(i >> 1) % 8] / 12 - 1), beat * 1.6, 'square', .012, null, at);
        this.mt += beat; }
    },
  };

  // ---------- store events: seeded per race, so every race goes a little differently ----------
  const EVENTS = {
    spill: { name: '🧽 SPILL! WET FLOOR AHEAD', dur: 20 }, herd: { name: '🛒 RUNAWAY TROLLEYS!', dur: 16 }, sale: { name: '🏷️ FLASH SALE! BAGS RESTOCK FAST', dur: 15 },
    power: { name: '💡 POWER CUT!', dur: 12 }, forklift: { name: '🚜 FORKLIFT ON THE TRACK!', dur: 25 },
  };
  function planEvents(seed, ti) {
    const r = mkRng(seed * 7919 + ti * 31), kinds = Object.keys(EVENTS), out = [];
    const first = kinds[Math.floor(r() * kinds.length)]; let second = kinds[Math.floor(r() * kinds.length)]; if (second === first) second = kinds[(kinds.indexOf(first) + 1) % kinds.length];
    out.push({ kind: first, at: 14 + r() * 16, r: r() }, { kind: second, at: 40 + r() * 20, r: r() });
    const door = r() < .4 ? 0 : -1;   // sometimes the store has shut a road alley's roller door for the day
    return { list: out, door };
  }
  function startEvent(e) {
    const L = S.trk.line, n = L.length, p = L[Math.floor(e.r * n)], ev = EVENTS[e.kind]; e.until = S.clock + ev.dur; S.flashMsg = { text: ev.name, t: S.t }; S.eventLog.push(e.kind);
    if (e.kind === 'spill') { const q = L[Math.floor((S.player.li + n / 3 + e.r * n / 3) % n)]; S.puddles.push({ x: q.x, y: q.y, r: 30, until: e.until }); }
    if (e.kind === 'herd') { const q = L[Math.floor((S.player.li + 60 + e.r * 80) % n)]; e.movers = []; for (let i = 0; i < 3; i++) e.movers.push({ x: q.x - q.dy * (90 + i * 40), y: q.y + q.dx * (90 + i * 40), vx: q.dy * 55, vy: -q.dx * 55, cx: q.x, cy: q.y, nx: -q.dy, ny: q.dx, img: 'trolley' }); }
    if (e.kind === 'forklift') { const lead = S.karts.slice().sort((a, b) => b.prog - a.prog)[0]; e.li = (lead.li + 80) % n; e.movers = [{ x: L[e.li].x, y: L[e.li].y, img: 'forklift', big: true }]; }
  }
  function events(dt) {
    for (const e of S.events) { if (!e.until && S.clock >= e.at) startEvent(e); }
    for (const e of S.events) {
      if (!e.until || S.clock > e.until) { if (e.movers) e.movers = null; continue; }
      if (e.kind === 'sale') for (const b of S.trk.boxes) b.back = Math.min(b.back, S.clock + .5);
      if (e.kind === 'herd') for (const m of e.movers) { m.x += m.vx * dt; m.y += m.vy * dt; const d = (m.x - m.cx) * m.nx + (m.y - m.cy) * m.ny; if (Math.abs(d) > 120) { m.x = m.cx + m.nx * -Math.sign(d) * 110; m.y = m.cy + m.ny * -Math.sign(d) * 110; } }
      if (e.kind === 'forklift') { const L = S.trk.line, n = L.length; e.acc = (e.acc || 0) + 55 * dt; while (e.acc >= 2) { e.acc -= 2; e.li = (e.li + 1) % n; } const m = e.movers[0], q = L[e.li]; m.x = q.x - q.dy * 12; m.y = q.y + q.dx * 12; }
      for (const m of e.movers || []) for (const k of S.karts) { const dx = k.x - m.x, dy = k.y - m.y, d = Math.hypot(dx, dy), R = m.big ? 16 : 9; if (d < R + KR && d > 0) { const nx = dx / d, ny = dy / d; k.x = m.x + nx * (R + KR); k.y = m.y + ny * (R + KR); const vn = k.vx * nx + k.vy * ny; if (vn < 0) { k.vx -= 1.6 * vn * nx; k.vy -= 1.6 * vn * ny; } k.vx *= .7; k.vy *= .7; k.bump = .3; } }
    }
  }
  const dark = () => S.events && S.events.some(e => e.kind === 'power' && e.until && S.clock <= e.until);

  // ---------- race: progress along the centreline, laps through checkpoints, AI, bumps ----------
  const LAPS = 3, NK = 8, KR = 6, PTS = [15, 12, 10, 8, 6, 4, 2, 1];   // laps, karts, kart radius
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
    if (ds > 800 || ds < -300) return;   // too far to be one move: ignore (the kart is off in the weeds); shortcuts skip under 600
    k.li = i;
    const prev = k.s; k.s = s;
    for (const [c, cs] of trk.cps.map((x, i) => [i, x])) { if (!k.cp[c] && ds > 0 && ((prev < cs && s >= cs) || (prev > s && (prev < cs || s >= cs)))) k.cp[c] = true; }
    if (ds > 0 && prev > s) { if (k.cp[0] && k.cp[1]) { k.lap++; k.cp = [false, false]; if (k === S.player && k.lap > 0) { Snd.lap(k.lap === LAPS - 1); if (k.lap === LAPS - 1) S.banner = { text: 'FINAL LAP!', t: S.t }; k.lapTimes = [...(k.lapTimes || []), S.clock]; } if (k.lap >= LAPS && !k.done) { k.done = true; k.finishT = S.clock; S.order.push(k); } } else k.lap += 0; }
    if (ds < 0 && prev < s && !k.done) { k.lap--; k.cp = [true, true]; }   // backed over the line: un-count the lap; driving forward over it counts it again
    k.prog = k.lap * L + k.s;
  }
  // AI: swerve round cones and dropped peels in the next stretch (closer and more central = harder swerve)
  function avoid(k, trk) {
    const fx = Math.cos(k.a), fy = Math.sin(k.a); let bias = 0;
    for (const o of [...trk.cones.filter(c => !(c.down > S.clock)), ...(S.drops || [])]) { const dx = o.x - k.x, dy = o.y - k.y, fz = dx * fx + dy * fy, lat = -dx * fy + dy * fx; if (fz > 0 && fz < 70 && Math.abs(lat) < 14) bias += -Math.sign(lat || 1) * 1.2 * (1 - fz / 70) * (1 - Math.abs(lat) / 14); }
    return bias;
  }
  // AI: steer at a point ahead on the centreline, shifted to its own lane; drift into tight corners
  function aiInput(k, trk) {
    if (k.route) {   // following a shortcut's own path, with the same corner-speed planning as the main line
      const P = trk.shortcuts[k.route.sc].path, v = speedOf(k);
      let j = k.route.i, bd = 1e9; for (let i = k.route.i; i < Math.min(P.length, k.route.i + 25); i++) { const d = (P[i].x - k.x) ** 2 + (P[i].y - k.y) ** 2; if (d < bd) { bd = d; j = i; } }
      k.route.i = j;
      if (j >= P.length - 4) { k.li = trk.shortcuts[k.route.sc].ib; k.route = null; }
      else {
        const q = P[Math.min(P.length - 1, j + Math.max(2, Math.round((10 + v * .16) / 2)))], err = wrapA(Math.atan2(q.y - k.y, q.x - k.x) - k.a);
        let vmax = 1e9; const h0 = Math.atan2(P[j].dy, P[j].dx);
        for (let m = 5; m <= 60 && j + m < P.length; m += 5) { const ang = Math.abs(wrapA(Math.atan2(P[j + m].dy, P[j + m].dx) - h0)); if (ang > .05) vmax = Math.min(vmax, (m * 2 / ang) * k.st.turn * .8 + m * 1.2); }
        return { steer: clamp(err * 3, -1, 1), gas: v < vmax ? 1 : 0, brake: v > vmax + 30 && k.boost <= 0 ? 1 : 0, drift: false };
      }
    }
    const L = trk.line, n = L.length, v = speedOf(k), ahead = Math.max(3, Math.round((14 + v * .2) / 2));
    const p = L[(k.li + ahead) % n], q = L[(k.li + ahead * 2) % n], lane = (k.ai ? k.ai.lane : 0) * trk.def.width * .45;
    const tx = p.x - p.dy * lane, ty = p.y + p.dx * lane, want = Math.atan2(ty - k.y, tx - k.x), err = wrapA(want - k.a);
    const bend = Math.abs(wrapA(Math.atan2(q.dy, q.dx) - Math.atan2(p.dy, p.dx)));
    // corner speed: the tightest radius in the next stretch sets how fast it can take it (a drift turns tighter)
    let vmax = 1e9; const h0 = Math.atan2(L[k.li].dy, L[k.li].dx);
    for (let j = 5; j <= 70; j += 5) { const pj = L[(k.li + j) % n], ang = Math.abs(wrapA(Math.atan2(pj.dy, pj.dx) - h0)); if (ang > .05) vmax = Math.min(vmax, (j * 2 / ang) * k.st.turn * .8 * (k.ai ? k.ai.brave : 1) + j * 1.2); }
    const turnDir = Math.sign(wrapA(Math.atan2(q.dy, q.dx) - Math.atan2(L[k.li].dy, L[k.li].dx)));
    // drift only into the corner (same side as the bend and the steering), and let go once it straightens
    const steer = clamp(err * 3 + avoid(k, trk), -1, 1), drift = k.drift ? (k.drift === turnDir && bend > .2 && Math.sign(steer) === k.drift) : (bend > .9 && v > k.st.top * .6 && Math.sign(steer) === turnDir && Math.abs(steer) > .4);
    return { steer, gas: v < vmax ? 1 : 0, brake: v > vmax + 30 ? 1 : 0, drift };
  }
  // stuck: no progress for 3 s puts the kart back on the line where it was (progress kept, placement fixed)
  function unstick(k, trk) {
    if (S.clock - (k.lastProgT || 0) > 3) { const p = trk.line[k.li || 0]; Object.assign(k, { x: p.x, y: p.y, a: Math.atan2(p.dy, p.dx), vx: 0, vy: 0, drift: 0, route: null, lastProgT: S.clock }); k.rescues = (k.rescues || 0) + 1; }
    if (k.prog > (k.bestProg || -1e9) + 5) { k.bestProg = k.prog; k.lastProgT = S.clock; }
  }
  // kart-kart bumps: push apart, the lighter one moves more, and swap some speed along the contact line
  function bumps(ks) {
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= KR * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, wa = a.st.weight * (a.st.trait === 'anchor' ? 1.6 : 1), wb = b.st.weight * (b.st.trait === 'anchor' ? 1.6 : 1), over = KR * 2 - d;
      a.x -= nx * over * wb / (wa + wb); a.y -= ny * over * wb / (wa + wb); b.x += nx * over * wa / (wa + wb); b.y += ny * over * wa / (wa + wb);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv >= 0) continue;
      const imp = -1.3 * rv / (1 / wa + 1 / wb);
      a.vx -= imp * nx / wa; a.vy -= imp * ny / wa; b.vx += imp * nx / wb; b.vy += imp * ny / wb; a.bump = b.bump = .2;
    }
  }
  const S = { pick: { c: 4, v: 1 }, t: 0, clock: 0, state: 'count', trk: null, player: null, karts: [], order: [], inp: { steer: 0, gas: 1, brake: 0, drift: false }, seed: 1 };
  function load(ti, seed = 1, pick = S.pick, grid = null) {
    S.trk = buildTrack(TRACKS[ti]); S.scenery = scenery(S.trk); S.seed = seed;
    const L = S.trk.line, n = L.length, r = mkRng(seed * 97 + ti);
    S.karts = []; const order = grid || [...CHARS.map((_, i) => i).filter(i => i !== pick.c), pick.c];
    for (let g = 0; g < NK; g++) {   // grid: two columns behind the line, front to back in `order` (race 1: the player at the back)
      const back = 8 + Math.floor(g / 2) * 9, p = L[(n - back) % n], side = (g % 2 ? 1 : -1) * 14;
      const ci = order[g], me = ci === pick.c, vi = me ? pick.v : (S.cup && S.cup.veh[ci] !== undefined ? S.cup.veh[ci] : Math.floor(r() * 3));
      if (S.cup && !me) S.cup.veh[ci] = vi;   // a CPU keeps its vehicle for the whole cup
      const k = newKart(p.x - p.dy * side, p.y + p.dx * side, Math.atan2(p.dy, p.dx), statsFor(ci, vi));
      if (!me) k.st.top *= .93 + r() * .05;   // CPU pace: a touch below a clean player line
      Object.assign(k, { id: g, ci, vi, li: (n - back) % n, s: p.s, lap: -1, cp: [true, true], prog: p.s - S.trk.L, done: false, col: CHARS[ci].body, spr: kartSprite(ci, vi),
        ai: me ? null : { lane: (r() - .5) * 1.0, brave: .95 + r() * .2 } });
      k.prog = p.s - S.trk.L; k.bestProg = k.prog; S.karts.push(k);
    }
    for (const c of S.trk.cones) c.down = 0;
    // everything a race can change is rebuilt here, so no event leaks into the next race
    const plan = planEvents(seed, ti); S.events = S.noEvents ? [] : plan.list; S.eventLog = []; S.dark = false;
    S.trk.shortcuts.forEach(sc => { sc.closed = false; });
    if (!S.noEvents && plan.door >= 0) { const roads = S.trk.shortcuts.filter(sc => sc.ter === 'ROAD'); if (roads.length) { const sc = roads[0]; sc.closed = true; const [x, y] = sc.pts[0], [x2, y2] = sc.pts[1], d = Math.hypot(x2 - x, y2 - y), ux = (x2 - x) / d, uy = (y2 - y) / d;
      sc.doorAt = { x: x + ux * 22, y: y + uy * 22 }; for (let a = -sc.width - 6; a <= sc.width + 6; a++) for (let b = 18; b <= 26; b++) { const px = Math.round(x + ux * b - uy * a), py = Math.round(y + uy * b + ux * a); if (S.trk.ter[py * S.trk.N + px] !== T.WALL) S.trk.ter[py * S.trk.N + px] = T.WALL; } S.eventLog.push('door'); } }
    S.shots = []; S.drops = []; S.puddles = []; S.flashMsg = null; for (const b of S.trk.boxes) b.back = 0;
    S.rng = mkRng(seed * 131 + ti * 7); S.player = S.karts.find(k => !k.ai); S.order = []; S.ti = ti; S.awarded = false; S.banner = null; S.shake = 0; S.lastPlace = 0; S.placePop = null; S.lastBeep = -1; S.clock = 0; S.t0 = S.t; S.state = 'count';
  }
  // a shopper seen from behind: body, head, and a hat that says who it is
  function shopper(g, c, x, y) {
    g.fillStyle = c.body; g.fillRect(x - 4, y, 8, 6);
    if (c.hat === 'beak') { g.fillStyle = c.skin; g.fillRect(x - 3, y - 6, 6, 6); g.fillStyle = '#ffb030'; g.fillRect(x + 3, y - 4, 2, 2); g.fillStyle = '#5a6070'; g.fillRect(x - 4, y + 1, 2, 4); g.fillRect(x + 2, y + 1, 2, 4); return; }
    g.fillStyle = c.hair; g.fillRect(x - 3, y - 6, 6, 6);
    if (c.hat === 'cap') { g.fillStyle = '#e83a3a'; g.fillRect(x - 3, y - 7, 6, 3); }
    if (c.hat === 'guard') { g.fillStyle = '#1a2a4a'; g.fillRect(x - 4, y - 7, 8, 3); g.fillStyle = '#ffd23a'; g.fillRect(x - 1, y - 7, 2, 1); }
    if (c.hat === 'chef') { g.fillStyle = '#fff'; g.fillRect(x - 3, y - 11, 6, 6); }
    if (c.hat === 'bun') { g.fillStyle = c.hair; g.fillRect(x - 2, y - 9, 4, 3); }
    if (c.hat === 'curls') { g.fillStyle = c.hair; g.fillRect(x - 4, y - 7, 8, 5); }
    if (c.hat === 'mop') { g.fillStyle = c.hair; g.fillRect(x - 4, y - 7, 8, 4); }
  }
  const SPRC = {};
  function kartSprite(ci, vi) {
    const key = ci + ':' + vi; if (SPRC[key]) return SPRC[key];
    const c = CHARS[ci];
    return SPRC[key] = spr(26, 22, g => {
      if (vi === 0) {   // trolley: a wire basket on four small wheels, shopper riding inside
        g.fillStyle = '#333'; g.fillRect(3, 19, 3, 3); g.fillRect(20, 19, 3, 3);
        shopper(g, c, 13, 8);
        g.fillStyle = '#c8d0dc'; g.fillRect(2, 11, 22, 8); g.fillStyle = '#8a96a8'; for (let x = 4; x < 24; x += 3) g.fillRect(x, 11, 1, 8); g.fillRect(2, 14, 22, 1);
        g.fillStyle = '#ff6a7a'; g.fillRect(1, 9, 24, 2);
        if (c.hat === 'twins') { shopper(g, { ...c, hat: 'mop' }, 8, 7); shopper(g, { ...c, hat: 'mop', body: '#3ad0c8' }, 18, 7); }
      } else if (vi === 1) {   // go-kart: low body, fat rear tyres
        g.fillStyle = '#222'; g.fillRect(0, 14, 6, 8); g.fillRect(20, 14, 6, 8);
        if (c.hat === 'twins') { shopper(g, { ...c, hat: 'mop' }, 10, 9); shopper(g, { ...c, hat: 'mop', body: '#3ad0c8' }, 16, 9); } else shopper(g, c, 13, 9);
        g.fillStyle = c.body === '#f4f4f4' ? '#e8a030' : c.body; g.fillRect(4, 14, 18, 6); g.fillStyle = '#0003'; g.fillRect(4, 18, 18, 2); g.fillStyle = '#ddd'; g.fillRect(9, 20, 8, 1);
      } else {   // mobility scooter: tall seat, rear basket, little wheels, an orange safety flag
        g.fillStyle = '#333'; g.fillRect(5, 19, 4, 3); g.fillRect(17, 19, 4, 3);
        g.fillStyle = '#ff8a2a'; g.fillRect(22, 0, 3, 3); g.fillStyle = '#aaa'; g.fillRect(23, 3, 1, 9);
        if (c.hat === 'twins') { shopper(g, { ...c, hat: 'mop' }, 10, 7); shopper(g, { ...c, hat: 'mop', body: '#3ad0c8' }, 16, 7); } else shopper(g, c, 13, 7);
        g.fillStyle = '#3a6ad0'; g.fillRect(4, 13, 18, 7); g.fillStyle = '#c8d0dc'; g.fillRect(7, 14, 12, 4); g.fillStyle = '#8a96a8'; for (let x = 8; x < 19; x += 3) g.fillRect(x, 14, 1, 4);
      }
    });
  }
  const place = k => S.karts.slice().sort((a, b) => (a.done && b.done) ? a.finishT - b.finishT : a.done ? -1 : b.done ? 1 : b.prog - a.prog).indexOf(k) + 1;
  function update(dt) {
    S.t += dt;
    if (S.state === 'select') return;
    if (S.state === 'count') { const c = Math.floor(S.t - S.t0); if (c !== S.lastBeep && c <= 3) { S.lastBeep = c; Snd.beep(c === 3); } if (S.t - S.t0 > 3) { S.state = 'race'; for (const k of S.karts) if (k.st.trait === 'rocket') k.boost = .9; } return; }
    if (S.state === 'results') { if (!S.awarded && S.cup) { S.awarded = true; S.order.forEach((k, i) => { S.cup.pts[k.ci] = (S.cup.pts[k.ci] || 0) + PTS[i]; }); S.cup.last = S.order.map(k => k.ci); } return; }
    if (S.state === 'standings' || S.state === 'podium') return;
    S.clock += dt;
    { const k = S.player; if (k.boost > .9 && !(S.prevBoost > .9)) Snd.boost(); S.prevBoost = k.boost; if (k.bump > .25 && !(S.prevBump > .25)) { Snd.bump(); S.shake = Math.max(S.shake || 0, .2); } S.prevBump = k.bump; }
    { const pl = place(S.player); if (S.lastPlace && pl !== S.lastPlace) S.placePop = { up: pl < S.lastPlace, t: S.t }; S.lastPlace = pl; }
    for (const k of S.karts) if (k.ai && !k.route) S.trk.shortcuts.forEach((sc, i) => {
      if (sc.closed) return;
      const d = (sc.ia - k.li + S.trk.line.length) % S.trk.line.length, key = k.lap + ':' + i;
      if (d > 4 && d < 22 && k.scKey !== key) { k.scKey = key; const r = S.rng(); if (r < (sc.ter === 'ROAD' ? sc.ai : (k.boost > .3 || k.st.trait === 'offroad' ? .7 : 0))) k.route = { sc: i, i: 0 }; }
    });
    for (const k of S.karts) {
      const inp = k.ai ? aiInput(k, S.trk) : (S.auto ? aiInput(k, S.trk) : k.done ? { steer: 0, gas: 0, brake: 1, drift: false } : S.inp);
      stepKart(k, k.done && k.ai ? { ...inp, gas: 1 } : inp, S.trk, dt);
    }
    events(dt); items(dt); for (const k of S.karts) if (k.ai || S.auto) aiItem(k);
    bumps(S.karts);
    // cones get knocked flat (and stood back up a few seconds later); hitting one costs some speed
    for (const k of S.karts) for (const c of S.trk.cones) if (!(c.down > S.clock) && Math.hypot(k.x - c.x, k.y - c.y) < KR + 3) { c.down = S.clock + 6; k.vx *= .75; k.vy *= .75; k.bump = .2; }
    for (const k of S.karts) { track(k, S.trk); unstick(k, S.trk); }
    if (S.player.done && !S.finishedAt) S.finishedAt = S.clock;
    if (S.player.done && (S.karts.every(k => k.done) || S.clock - S.finishedAt > 30) || S.clock > 300) { S.state = 'results'; S.karts.filter(k => !k.done).sort((a, b) => b.prog - a.prog).forEach(k => { k.est = true; k.finishT = S.clock + Math.max(0, LAPS * S.trk.L - k.prog) / 120; S.order.push(k); }); }
  }
  // ---------- select: pick a shopper and a vehicle ----------
  const CARD = (i) => ({ x: 22 + (i % 4) * 126, y: 200 + Math.floor(i / 4) * 160, w: 118, h: 150 });
  const VCARD = (i) => ({ x: 22 + i * 168, y: 560, w: 160, h: 120 }), GOB = { x: 120, y: 850, w: 300, h: 80 };
  function bar(ctx, label, v, y) { ctx.font = '800 16px system-ui'; ctx.textAlign = 'right'; ctx.fillStyle = '#c8d0e0'; ctx.fillText(label, 130, y + 13); ctx.fillStyle = '#ffffff22'; Draw.rr(ctx, 140, y, 300, 16, 8); ctx.fill(); ctx.fillStyle = '#ffd23a'; Draw.rr(ctx, 140, y, 300 * clamp(v), 16, 8); ctx.fill(); }
  function drawSelect(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1a5a'); g.addColorStop(1, '#5a2a6a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    Draw.bigText(ctx, 'TROLLEY DASH', W / 2, 90, 54, '#ffe14a', '#3a1a00'); ctx.font = '800 18px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8ff'; ctx.fillText('CHOOSE YOUR SHOPPER', W / 2, 170);
    ctx.imageSmoothingEnabled = false;
    CHARS.forEach((c, i) => { const b = CARD(i), on = S.pick.c === i; ctx.fillStyle = on ? '#ffe14a' : '#ffffff18'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 16); ctx.fill();
      ctx.drawImage(kartSprite(i, S.pick.v), b.x + 7, b.y + 10, 104, 88); ctx.font = '900 18px system-ui'; ctx.fillStyle = on ? '#2a1a00' : '#fff'; ctx.fillText(c.name, b.x + b.w / 2, b.y + 120); ctx.font = '700 11px system-ui'; ctx.fillText(c.who, b.x + b.w / 2, b.y + 138); });
    VEHS.forEach((v, i) => { const b = VCARD(i), on = S.pick.v === i; ctx.fillStyle = on ? '#4ab8ff' : '#ffffff18'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 16); ctx.fill();
      ctx.drawImage(kartSprite(S.pick.c, i), b.x + 40, b.y + 8, 78, 66); ctx.font = '900 18px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(v.name, b.x + b.w / 2, b.y + 96); });
    const st = statsFor(S.pick.c, S.pick.v), rel = (k, lo, hi) => (st[k] / BASE[k] - lo) / (hi - lo);
    bar(ctx, 'SPEED', rel('top', .8, 1.2), 700); bar(ctx, 'ACCEL', rel('accel', .5, 1.5), 726); bar(ctx, 'HANDLING', rel('turn', .6, 1.4), 752); bar(ctx, 'WEIGHT', rel('weight', .4, 1.6), 778);
    ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe14a'; ctx.fillText(`${CHARS[S.pick.c].name}: ${CHARS[S.pick.c].desc} · ${VEHS[S.pick.v].desc}`, W / 2, 826);
    ctx.fillStyle = '#4ad05a'; Draw.rr(ctx, GOB.x, GOB.y, GOB.w, GOB.h, 40); ctx.fill(); Draw.bigText(ctx, 'RACE!', W / 2, GOB.y + 42, 40, '#fff', '#0a4a1a');
  }
  function drawCup(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1a5a'); g.addColorStop(1, '#5a2a6a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const table = CHARS.map((c, ci) => ({ ci, pts: S.cup.pts[ci] || 0 })).sort((a, b) => b.pts - a.pts || S.cup.last.indexOf(a.ci) - S.cup.last.indexOf(b.ci));
    ctx.imageSmoothingEnabled = false;
    if (S.state === 'podium') {
      Draw.bigText(ctx, 'SUPERMARKET CUP', W / 2, 90, 44, '#ffe14a', '#3a1a00');
      [[0, W / 2, 300], [1, 140, 360], [2, W - 140, 400]].forEach(([i, x, y]) => { const t = table[i]; ctx.fillStyle = ['#ffd23a', '#c8d0dc', '#d08a4a'][i]; Draw.rr(ctx, x - 70, y + 90, 140, 560 - y, 12); ctx.fill(); Draw.bigText(ctx, String(i + 1), x, y + 130, 48, '#fff', '#3a2a00');
        ctx.drawImage(kartSprite(t.ci, t.ci === S.pick.c ? S.pick.v : S.cup.veh[t.ci] || 0), x - 52, y - 10, 104, 88); ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(CHARS[t.ci].name + (t.ci === S.pick.c ? ' (YOU)' : ''), x, y + 196); });
      const mine = table.findIndex(t => t.ci === S.pick.c) + 1;
      ctx.font = '800 22px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8ff'; ctx.fillText(mine === 1 ? '🏆 YOU WIN THE CUP!' : `YOU FINISHED ${mine}${['ST', 'ND', 'RD'][mine - 1] || 'TH'} OVERALL`, W / 2, 720);
      ctx.fillText('TAP FOR A NEW CUP', W / 2, 860); return;
    }
    Draw.bigText(ctx, `STANDINGS · AFTER RACE ${S.cup.race + 1}/3`, W / 2, 90, 30, '#ffe14a', '#3a1a00');
    table.forEach((t, i) => { const y = 160 + i * 74, me = t.ci === S.pick.c; ctx.fillStyle = me ? '#ffe14a' : '#ffffff18'; Draw.rr(ctx, 40, y, W - 80, 64, 14); ctx.fill();
      ctx.drawImage(kartSprite(t.ci, me ? S.pick.v : S.cup.veh[t.ci] || 0), 90, y + 6, 62, 52); ctx.font = '900 24px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = me ? '#2a1a00' : '#fff'; ctx.fillText(`${i + 1}. ${CHARS[t.ci].name}`, 170, y + 42); ctx.textAlign = 'right'; ctx.fillText(`${t.pts}`, W - 64, y + 42); });
    ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8ff'; ctx.fillText(`NEXT: ${TRACKS[S.cup.race + 1].name} · LEADER STARTS AT THE BACK · TAP`, W / 2, 790);
  }
  function render(ctx) {
    if (S.state === 'standings' || S.state === 'podium') { drawCup(ctx); return; }
    if (S.state === 'select') { drawSelect(ctx); return; }
    const cam = camera(S.player), theme = THEMES[S.trk.def.theme];
    const th = dark() ? { ...theme, fog: [8, 8, 16], sky: ['#05050a', '#14142a'] } : theme; S.fogNow = dark() ? 260 : FOG;
    sky(cam, th); ground(S.trk, cam, th);
    for (const p of S.puddles) { const q = project(cam, p.x, p.y); if (q) { lctx.fillStyle = '#7ac8ff99'; lctx.beginPath(); lctx.ellipse(q.x, q.y, p.r * q.s, p.r * q.s * .35, 0, 0, 7); lctx.fill(); } }
    billboards(cam, [...S.scenery, ...S.trk.cones.filter(c => !(c.down > S.clock)).map(c => ({ x: c.x, y: c.y, img: SPR.cone, size: 8 })), ...S.trk.boxes.filter(b => b.back <= S.clock).map(b => ({ x: b.x, y: b.y, img: SPR.bag, size: 9, lift: 2 + Math.sin(S.t * 4 + b.x) })),
      ...S.drops.map(d => ({ x: d.x, y: d.y, img: SPR.banana, size: 3 })), ...S.events.flatMap(e => (e.until && S.clock <= e.until && e.movers) ? e.movers.map(m => ({ x: m.x, y: m.y, img: SPR[m.img], size: m.big ? 18 : 8 })) : []), ...S.trk.shortcuts.filter(sc => sc.closed).map(sc => ({ x: sc.doorAt.x, y: sc.doorAt.y, img: SPR.door, size: 20 })), ...S.shots.map(sh => ({ x: sh.x, y: sh.y, img: SPR[sh.kind], size: sh.kind === 'melon' ? 6 : 7 })), ...S.puddles.map(p => ({ x: p.x, y: p.y, img: SPR.sign, size: 9 })), ...S.karts.map(k => ({ x: k.x, y: k.y, img: k.spr, size: 7, lift: k.hop ? 2 : 0 }))]);
    const pk = S.player, pp = project(cam, pk.x, pk.y);
    if (pp && pk.drift) { const c = pk.charge >= 2 ? '#ff9a2a' : pk.charge >= 1 ? '#4ab8ff' : '#ffffff'; lctx.fillStyle = c; for (let i = 0; i < 4; i++) lctx.fillRect(Math.round(pp.x - 14 * pk.drift - 2 + (S.t * 60 + i * 7) % 6), Math.round(pp.y - 2 - i), 2, 2); }
    if (pp && pk.boost > 0) { lctx.fillStyle = (S.t * 20 | 0) % 2 ? '#ffd23a' : '#ff6a2a'; lctx.fillRect(Math.round(pp.x - 3), Math.round(pp.y), 6, 3); }
    Snd.engine(S.player); Snd.music();
    // juice is presentation only: shake offsets the blit, speed lines overlay; the race underneath is unchanged
    if (S.player.boost > 0) { lctx.strokeStyle = '#ffffff88'; lctx.lineWidth = 1; for (let i = 0; i < 10; i++) { const a = (i * 2.4 + S.t * 40) % (Math.PI * 2), r0 = 40 + (S.t * 300 + i * 37) % 60; lctx.beginPath(); lctx.moveTo(LW / 2 + Math.cos(a) * r0, 120 + Math.sin(a) * r0 * .6); lctx.lineTo(LW / 2 + Math.cos(a) * (r0 + 18), 120 + Math.sin(a) * (r0 + 18) * .6); lctx.stroke(); } }
    S.shake = Math.max(0, (S.shake || 0) - 1 / 60); const sx = S.shake > 0 ? Math.round(Math.sin(S.t * 90) * S.shake * 8) : 0, sy = S.shake > 0 ? Math.round(Math.cos(S.t * 70) * S.shake * 6) : 0;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(low, sx, sy, LW * SCALE, LH * SCALE);
    ctx.fillStyle = '#14141e'; ctx.fillRect(0, LH * SCALE, W, H - LH * SCALE);
    ctx.fillStyle = '#ffffff14'; Draw.rr(ctx, PAD.x, PAD.y, PAD.w, PAD.h, 24); ctx.fill(); ctx.fillStyle = '#ffffff55'; Draw.circ(ctx, PAD.x + PAD.w / 2 + S.inp.steer * PAD.w * .4, PAD.y + PAD.h / 2, 30);
    ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff88'; ctx.fillText('◀ STEER ▶', PAD.x + PAD.w / 2, PAD.y + PAD.h - 16);
    ctx.fillStyle = S.inp.drift ? '#ff9a2a' : '#ffffff14'; Draw.rr(ctx, DRIFTB.x, DRIFTB.y, DRIFTB.w, DRIFTB.h, 24); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 26px system-ui'; ctx.fillText('DRIFT', DRIFTB.x + DRIFTB.w / 2, DRIFTB.y + DRIFTB.h / 2 + 8);
    ctx.font = '800 22px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(Math.max(0, speedOf(S.player)) * .6)} km/h`, 24, LH * SCALE + 50);
    { const k = S.player, show = k.roll > 0 ? Object.keys(ITEMS)[Math.floor(S.t * 14) % 7] : k.item; ctx.fillStyle = k.item ? '#4a8aff' : '#ffffff14'; Draw.rr(ctx, ITEMB.x, ITEMB.y, ITEMB.w, ITEMB.h, 20); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = "44px 'Noto Color Emoji', sans-serif"; if (show) ctx.fillText(ITEMS[show].icon.slice(0, 2), ITEMB.x + ITEMB.w / 2, ITEMB.y + 62); ctx.font = '800 12px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(show ? ITEMS[show].name + (show === 'espresso' && k.item ? ` x${k.uses || 3}` : '') : 'ITEM', ITEMB.x + ITEMB.w / 2, ITEMB.y + 98); }
    if (S.flashMsg && S.t - S.flashMsg.t < 1.8) Draw.bigText(ctx, S.flashMsg.text, W / 2, 200, 28, '#fff', '#000');
    if (S.banner && S.t - S.banner.t < 2) { const k = Math.min(1, (S.t - S.banner.t) * 4); ctx.save(); ctx.translate(W / 2, 300); ctx.scale(k, k); Draw.bigText(ctx, S.banner.text, 0, 0, 60, '#ff5a3a', '#fff'); ctx.restore(); }
    if (S.placePop && S.t - S.placePop.t < .8) Draw.bigText(ctx, S.placePop.up ? '▲' : '▼', W - 150, 90, 40, S.placePop.up ? '#4ad05a' : '#ff5a5a', '#000');
    { const k = S.player, q = S.trk.line[k.li], wrong = S.state === 'race' && Math.cos(k.a - Math.atan2(q.dy, q.dx)) < -.3 && speedOf(k) > 20; S.wrongT = wrong ? (S.wrongT || 0) + 1 / 60 : 0; if (S.wrongT > .8 && Math.floor(S.t * 3) % 2) Draw.bigText(ctx, '⟲ WRONG WAY', W / 2, 380, 40, '#ffe14a', '#a00'); }
    { const k = S.player, laps = k.lapTimes || [], cur = S.clock - (laps[laps.length - 1] || 0); ctx.font = '800 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#c8d0e0'; ctx.fillText(`TIME ${S.clock.toFixed(1)}  LAP ${cur.toFixed(1)}`, 24, LH * SCALE + 80); }
    drawMinimap(ctx, 196, LH * SCALE + 26, 136, 114);
    const pl = place(S.player); Draw.bigText(ctx, `${pl}${['ST', 'ND', 'RD'][pl - 1] || 'TH'}`, W - 80, 90, 54, '#ffe14a', '#000');
    Draw.bigText(ctx, `LAP ${clamp(S.player.lap + 1, 1, LAPS)}/${LAPS}`, 90, 90, 30, '#fff', '#000');
    if (S.state === 'count') { const n = 3 - Math.floor(S.t - S.t0); Draw.bigText(ctx, n > 0 ? String(n) : 'GO!', W / 2, 300, 120, n > 0 ? '#fff' : '#4ad05a', '#000'); }
    if (S.state === 'results') { ctx.fillStyle = '#000c'; ctx.fillRect(40, 140, W - 80, 440); if (S.cup) { ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe14a'; ctx.fillText(`RACE ${S.cup.race + 1}/3 · ${S.trk.def.name} · TAP TO GO ON`, W / 2, 166); } S.order.forEach((k, i) => { ctx.fillStyle = k === S.player ? '#ffe14a' : '#fff'; ctx.font = '800 26px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}. ${CHARS[k.ci].name}${k === S.player ? ' (YOU)' : ''}`, 80, 200 + i * 46); ctx.textAlign = 'right'; ctx.fillText(k.finishT ? (k.est ? '~' : '') + k.finishT.toFixed(2) + ' s' : '—', W - 80, 200 + i * 46); }); }
  }
  // minimap: the centreline traced small, every kart a dot (you are the big one)
  function drawMinimap(ctx, x0, y0, w, h) {
    const L = S.trk.line, N = S.trk.N, sc = Math.min(w, h) / N;
    ctx.fillStyle = '#ffffff10'; Draw.rr(ctx, x0, y0, w, h, 12); ctx.fill();
    ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 3; ctx.beginPath(); L.forEach((p, i) => { const px = x0 + (w - N * sc) / 2 + p.x * sc, py = y0 + p.y * sc; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.stroke();
    for (const k of S.karts) { ctx.fillStyle = k === S.player ? '#fff' : k.col; Draw.circ(ctx, x0 + (w - N * sc) / 2 + k.x * sc, y0 + k.y * sc, k === S.player ? 5 : 3); }
  }
  // touch: the bottom panel. Drag left/right on the steering pad; hold DRIFT. (One pointer each side.)
  const PAD = { x: 20, y: LH * SCALE + 150, w: 300, h: 190 }, DRIFTB = { x: 340, y: LH * SCALE + 150, w: 180, h: 190 }, ITEMB = { x: 340, y: LH * SCALE + 30, w: 180, h: 110 };
  const inB = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  let padDown = false;
  function onPointer(type, x, y) {
    if (S.state === 'select') { if (type !== 'down') return; CHARS.forEach((_, i) => { if (inB(CARD(i), x, y)) { S.pick.c = i; Audio.sfx('select'); } }); VEHS.forEach((_, i) => { if (inB(VCARD(i), x, y)) { S.pick.v = i; Audio.sfx('select'); } }); if (inB(GOB, x, y)) startRace(); return; }
    if (type === 'down' && advanceCup()) return;
    if (type === 'down' && inB(ITEMB, x, y)) { useItem(S.player); return; }
    if (type === 'down' && inB(DRIFTB, x, y)) { S.inp.drift = true; return; }
    if (type === 'down' && inB(PAD, x, y)) padDown = true;
    if (padDown && (type === 'down' || type === 'move')) S.inp.steer = clamp((x - (PAD.x + PAD.w / 2)) / (PAD.w * .4), -1, 1);
    if (type === 'up' || type === 'cancel') { if (x > PAD.x + PAD.w) S.inp.drift = false; else { padDown = false; S.inp.steer = 0; } }
  }
  const keys = {};
  function onKey(key, down) {
    keys[key] = down;
    if (S.state === 'select') { if (!down) return; if (key === 'ArrowRight') S.pick.c = (S.pick.c + 1) % 8; if (key === 'ArrowLeft') S.pick.c = (S.pick.c + 7) % 8; if (key === 'ArrowDown') S.pick.v = (S.pick.v + 1) % 3; if (key === 'ArrowUp') S.pick.v = (S.pick.v + 2) % 3; if (key === 'Enter' || key === ' ') startRace(); return; }
    S.inp.steer = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
    S.inp.brake = keys.ArrowDown || keys.s ? 1 : 0;
    S.inp.drift = !!(keys[' '] || keys.Shift);
    if (down && (key === 'Enter' || key === ' ') && advanceCup()) return;
    if (down && (key === 'x' || key === 'X' || key === 'e' || key === 'Enter') && S.state === 'race') useItem(S.player);
  }

  // test hook: time a solo kart from 40 samples before a shortcut to just past its exit, on the main line or through the cut
  function timeShortcut(ti, si, cut, boost, lane = 0) {
    load(ti, 1, { c: 4, v: 1 }); const t = S.trk, sc = t.shortcuts[si], n = t.line.length, k = S.player; S.karts = [k]; S.state = 'race';
    const i0 = (sc.ia - 40 + n) % n, p0 = t.line[i0], off = lane * t.def.width * .45;
    Object.assign(k, { x: p0.x - p0.dy * off, y: p0.y + p0.dx * off, a: Math.atan2(p0.dy, p0.dx), vx: p0.dx * 130, vy: p0.dy * 130, li: i0, ai: { lane, brave: 1 }, route: null });
    const exitS = t.line[(sc.ib + 20) % n].s; let entered = false;
    for (let st = 1; st < 1200; st++) {
      if (!entered && ((sc.ia - k.li + n) % n) <= 2) { entered = true; if (cut) k.route = { sc: si, i: 0 }; if (boost) k.boost = 1.5; }
      stepKart(k, aiInput(k, t), t, 1 / 60);
      if (!k.route) { let b = k.li, bd = 1e9; for (let j = -30; j <= 30; j++) { const q = t.line[(k.li + j + n) % n], d = (q.x - k.x) ** 2 + (q.y - k.y) ** 2; if (d < bd) { bd = d; b = (k.li + j + n) % n; } } k.li = b; if (Math.abs(t.line[k.li].s - exitS) < 6) return st / 60; }
    }
    return 99;
  }
  // the cup: three races, points by place; after each race the standings, the leader starts the next one at the back
  function startRace() { Audio.unlock(); Audio.sfx('start'); S.cup = { race: 0, pts: {}, veh: {}, last: [], seed: S.seedFixed || (Date.now() % 100000) + 1 }; load(0, S.cup.seed, S.pick); }
  function advanceCup() {
    if (!S.cup) return false;
    if (S.state === 'results' && S.awarded && S.t - (S.resultsAt || (S.resultsAt = S.t)) > .8) { S.resultsAt = 0; S.state = S.cup.race >= TRACKS.length - 1 ? 'podium' : 'standings'; Audio.sfx(S.state === 'podium' ? 'win' : 'select'); return true; }
    if (S.state === 'standings') { const table = CHARS.map((c, ci) => ({ ci, pts: S.cup.pts[ci] || 0 })).sort((a, b) => a.pts - b.pts || S.cup.last.indexOf(b.ci) - S.cup.last.indexOf(a.ci));
      S.cup.race++; load(S.cup.race, S.cup.seed + S.cup.race * 17, S.pick, table.map(t => t.ci)); return true; }
    if (S.state === 'podium') { S.cup = null; S.state = 'select'; return true; }
    return false;
  }
  load(0); S.state = 'select';
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = { advanceCup, PTS, Snd, EVENTS, planEvents, timeShortcut, hitKart: (k, w) => hit(k, w), ITEMS, ODDS, rollItem, useItem, mkRng, startRace, S, TRACKS, T, SURF, BASE, LAPS, CHARS, VEHS, statsFor, kartSprite, place, aiInput, load, buildTrack, project, camera, newKart, stepKart, terrainAt, speedOf, step: n => game.step(n), get state() { return S.state; } };
})();
