// THE LAST NOTE - playable demo (1-bit).
// Play the funeral hymn on falling tiles. On the beat is solemn (Grandma approves, nothing moves).
// Half a beat LATE is GROOVE: the chapel starts tapping and the casket rolls toward the door.
// Wrong lane, mashing or a dropped tile is SOUR and Grandma's patience runs out.
// Get the casket to the door, then land the last note dead on the beat.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const W = 240, H = 427, SCALE = 3, LW = W * SCALE, LH = 1280;
  const low = document.createElement('canvas'); low.width = W; low.height = H;
  const cx = low.getContext('2d', { willReadFrequently: true });
  const INK = [28, 26, 34], PAPER = [232, 226, 210];
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  const g = v => { const c = Math.round(clamp(v) * 255); return `rgb(${c},${c},${c})`; };
  function rect(x, y, w, h, v) { cx.fillStyle = g(v); cx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function circ(x, y, r, v) { cx.fillStyle = g(v); cx.beginPath(); cx.arc(x, y, Math.max(0, r), 0, 7); cx.fill(); }
  function text(s, x, y, size, v, align = 'center') { cx.font = `bold ${size}px "Courier New", monospace`; cx.textAlign = align; cx.fillStyle = g(v); cx.fillText(s, Math.round(x), Math.round(y)); }
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let B = .75;   // seconds per beat; the characters bob to it

// ---------- characters (1-bit: solid ink silhouettes, paper highlights) ----------
function mourner(x, y, h, hat, t, k) {
  // k: 0 = solemn, 1 = dancing; bob + foot tap scale with it
  const bob = Math.abs(Math.sin(t * Math.PI / B)) * 2.5 * k, foot = Math.sin(t * Math.PI * 2 / B + x) > .3 ? 2 * Math.min(1, k * 3) : 0;
  rect(x - 5, y - h * .55 - bob, 10, h * .55, 0);                         // coat
  circ(x, y - h * .62 - bob, 5, .85);                                      // face (pale)
  if (hat === 1) { rect(x - 7, y - h * .7 - bob, 14, 2, 0); rect(x - 4, y - h * .82 - bob, 8, 6, 0); }
  else if (hat === 2) { cx.fillStyle = g(0); cx.beginPath(); cx.arc(x, y - h * .64 - bob, 6, Math.PI, 0); cx.fill(); rect(x - 6, y - h * .64 - bob, 12, 5, .35); }   // veil
  else { cx.fillStyle = g(0); cx.beginPath(); cx.arc(x, y - h * .64 - bob, 5.5, Math.PI * 1.1, -.1); cx.fill(); }
  rect(x - 4, y - h * .62 - bob - 1, 2, 1, 0); rect(x + 2, y - h * .62 - bob - 1, 2, 1, 0);   // eyes
  rect(x - 4, y - bob - 2, 3, 2 + bob, 0); rect(x + 1, y - foot - 2, 3, 2, 0);                 // legs, the right foot taps
}
function grandma(x, y, t, drag, glare) {
  const lean = drag * .5;
  cx.save(); cx.translate(x, y); cx.rotate(lean);
  rect(-6, -26, 12, 24, 0); circ(0, -30, 5.5, .85);
  rect(-8, -37, 16, 3, 0); rect(-4, -42, 8, 5, 0); circ(5, -41, 2, .7);   // hat with a flower
  rect(-4, -31, 3, 1, 0); rect(1, -31, 3, 1, 0);
  if (glare) { rect(-5, -34, 4, 1, 0); rect(1, -34, 4, 1, 0); }           // the glare: brows
  rect(-5, -2, 3, 3, 0); rect(2, -2, 3, 3, 0);
  if (drag > 0) { rect(4, -22, 10, 2, 0); }                              // arm out, holding the trolley
  cx.restore();
  if (drag > 0) for (let i = 0; i < 3; i++) rect(x - 10 - i * 5, y - 1 + (i % 2), 3, 1, .2);   // skid marks
}
function casket(x, y, t) {
  rect(x - 34, y - 18, 68, 18, 0);
  rect(x - 32, y - 16, 64, 2, .6);                                       // lid highlight
  rect(x - 4, y - 14, 8, 2, .8); rect(x - 1, y - 17, 2, 8, .8);          // cross
  rect(x - 30, y, 60, 3, .25);                                           // trolley
  for (const wx of [x - 24, x + 24]) { const a = t * 6; circ(wx, y + 6, 4, 0); rect(wx + Math.cos(a) * 2 - .5, y + 6 + Math.sin(a) * 2 - .5, 1.5, 1.5, .8); }
}
function portrait(x, y, smile) {
  rect(x - 13, y - 18, 26, 30, 0); rect(x - 11, y - 16, 22, 26, .75);
  circ(x, y - 4, 6, .9); cx.fillStyle = g(0); cx.beginPath(); cx.arc(x, y - 7, 6, Math.PI * 1.05, -.05); cx.fill();
  rect(x - 3, y - 5, 2, 1, 0); rect(x + 1, y - 5, 2, 1, 0);
  if (smile) { cx.strokeStyle = g(0); cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y - 2, 2.5, .3, Math.PI - .3); cx.stroke(); } else rect(x - 2, y - 1, 4, 1, 0);
  rect(x - 8, y + 12, 3, 14, 0); rect(x + 5, y + 12, 3, 14, 0);          // easel legs
}
function hand(x, y, press) {
  const p = press ? 2 : 0;
  rect(x - 3, y - 2 + p, 6, 14, 1); rect(x - 7, y + 10 + p, 16, 14, 1);
  cx.strokeStyle = g(0); cx.lineWidth = 1; cx.strokeRect(x - 3 + .5, y - 2 + p + .5, 6, 13); cx.strokeRect(x - 7 + .5, y + 10 + p + .5, 16, 13);
}


  // ---------- levels ----------
  const LEVELS = [
    { name: "GRANDPA'S HYMN", bpm: 76, tiles: 34, need: 12, seed: 5 },
    { name: 'THE LONG GOODBYE', bpm: 92, tiles: 40, need: 16, seed: 9 },
    { name: 'REQUIEM (UPTEMPO)', bpm: 108, tiles: 48, need: 20, seed: 14 },
  ];
  const LANE_X = l => 20 + l * 50, HIT_Y = 392, TILE_H = 38;
  const ON = .1, LATE_MIN = .14, LATE_MAX = .36, DROP = .42;
  const HYMN = [60, 64, 62, 60, 65, 64, 62, 60, 67, 65, 64, 62, 60, 64, 67, 69];

  const S = {};
  function load(i) {
    const L = LEVELS[i], r = mkRng(L.seed), tiles = []; B = 60 / L.bpm;
    let lane = 1;
    for (let k = 0; k < L.tiles; k++) { lane = (lane + 1 + Math.floor(r() * 3)) % 4; tiles.push({ t: 2.0 + k * B, lane, res: null, at: 0, n: k }); }
    Object.assign(S, { li: i, L, B, tiles, t: 0, state: 'play', groove: 0, anger: 0, last: null, roll: 0, pops: [], endT: 0, reason: '', press: [-1, -1, -1, -1], beatN: -1 });
    API.autopilot = null;
  }
  const fallSpeed = () => 150 * (S.B / .75);   // px per second: one beat is always the same height on screen
  function pop(text, big) { S.pops.push({ text, t: S.t, big }); }
  function organ(m, d, g = .05) { const f = 440 * 2 ** ((m - 69) / 12); Audio.tone(f, d, 'sine', g); Audio.tone(f * 2, d, 'sine', g * .45); Audio.tone(f * 3, d * .8, 'sine', g * .25); Audio.tone(f / 2, d, 'triangle', g * .5); }

  function tap(lane) {
    if (S.state !== 'play') return;
    Audio.unlock(); S.press[lane] = S.t;
    // the last note
    if (S.last) {
      const d = S.t - S.last.t;
      if (Math.abs(d) < .35 && S.last.lane === lane) {
        if (Math.abs(d) < ON + .04) { S.last.res = 'on'; S.state = 'win'; S.endT = 0; [60, 64, 67, 72, 48].forEach(m => organ(m, 2.2, .045)); Audio.sfx('win'); }
        else { S.last.res = 'sour'; fail('THE CASKET HIT THE DOOR.'); }
        return;
      }
    }
    // nearest unplayed tile in that lane
    let best = null;
    for (const x of S.tiles) if (x.res === null && x.lane === lane && Math.abs(S.t - x.t) < .5) { if (!best || Math.abs(S.t - x.t) < Math.abs(S.t - best.t)) best = x; }
    if (!best) return sour('wrong');
    const d = S.t - best.t;
    best.at = S.t;
    if (Math.abs(d) < ON) {
      best.res = 'on'; S.anger = Math.max(0, S.anger - 6);
      organ(HYMN[best.n % 16], S.B * .9);
    } else if (d > LATE_MIN && d < LATE_MAX) {
      best.res = 'late'; S.groove++;
      organ(HYMN[best.n % 16] + 12, S.B * .45); Audio.noise(.03, .08);
      pop(S.groove < 2 ? 'groove?' : S.groove < 5 ? 'GROOVE!' : `GROOVE x${S.groove}`);
      if (S.groove >= S.L.need && !S.last) spawnLast();
    } else { best.res = 'sour'; sour(); }
  }
  function sour() {
    S.anger += 22; Audio.tone(277, .4, 'sawtooth', .06); Audio.tone(294, .4, 'sawtooth', .06); pop('SOUR', true);
    if (S.anger >= 100) fail('GRANDMA THREW YOU OUT.');
  }
  function spawnLast() {
    // the song stops; the doors are shut; one slow tile
    S.last = { t: S.t + 2.4, lane: 1, res: null };
    for (const x of S.tiles) if (x.res === null && x.t > S.t) x.res = 'skip';
  }
  function fail(reason) { if (S.state !== 'play') return; S.state = 'fail'; S.reason = reason; S.endT = 0; Audio.sfx('fail'); }

  function update(dt) {
    S.t += dt;
    if (S.state !== 'play') { S.endT += dt; return; }
    S.roll = Math.min(S.roll + dt * .8, S.groove / S.L.need);
    // a soft pedal note on every beat so there is a beat to be late against
    const bn = Math.floor((S.t - 2.0) / S.B);
    if (!S.last && bn !== S.beatN && bn >= 0 && bn < S.L.tiles) { S.beatN = bn; Audio.tone(65.4 * (bn % 4 === 0 ? 1 : 1.5), S.B * .5, 'sine', .05); }
    const auto = API.autopilot; if (auto) autopilot(auto);
    // dropped tiles are sour
    for (const x of S.tiles) if (x.res === null && S.t - x.t > DROP) { x.res = 'miss'; sour(); if (S.state !== 'play') return; }
    if (S.last && S.last.res === null && S.t - S.last.t > .4) { S.last.res = 'miss'; fail('THE CASKET HIT THE DOOR.'); return; }
    if (!S.last && S.tiles.every(x => x.res !== null)) fail('THE HYMN ENDED. NOBODY MOVED.');
  }
  // test policies: 'groove' plays it late (on-beat when Grandma is cross), 'square' plays it perfectly, 'masher' mashes
  function autopilot(kind) {
    if (S.last) { if (S.last.res === null && S.t >= S.last.t) tap(S.last.lane); return; }
    for (const x of S.tiles) if (x.res === null) {
      const lateBy = kind === 'groove' && S.anger < 50 ? .24 : 0;
      if (kind === 'masher') { if (S.t >= x.t - .3) { tap((x.lane + 1) % 4); } break; }
      if (S.t >= x.t + lateBy) tap(x.lane);
      break;
    }
  }

  // ---------- the chapel, driven by state ----------
  function chapel() {
    const t = S.t, k = clamp(S.groove / 6), won = S.state === 'win', e = S.endT;
    rect(0, 40, W, 175, .42);
    for (const wx of [50, 120, 190]) {
      cx.fillStyle = g(.95); cx.beginPath(); cx.moveTo(wx - 9, 70); cx.lineTo(wx - 9, 56); cx.arc(wx, 56, 9, Math.PI, 0); cx.lineTo(wx + 9, 70); cx.fill();
      const lg = cx.createLinearGradient(0, 70, 0, 215); lg.addColorStop(0, g(.75)); lg.addColorStop(1, g(.42)); cx.fillStyle = lg; cx.beginPath(); cx.moveTo(wx - 9, 70); cx.lineTo(wx + 9, 70); cx.lineTo(wx + 26, 215); cx.lineTo(wx - 4, 215); cx.fill();
    }
    rect(0, 213, W, 37, .2); rect(0, 213, W, 1, 0);
    const open = won ? lin(e, .05, .4) : 0;
    rect(204, 120, 34, 94, 0);
    if (open > 0) { rect(206, 122, 30, 90, 1); rect(214, 170, 30, 30, 0); rect(214, 168, 30, 2, .6); const hd = lin(e, 1.2, 1.5); if (hd > 0) rect(212, 170, 4, 30 * hd, .5); }
    else { rect(206, 122, 14, 90, .3); rect(222, 122, 14, 90, .3); rect(219, 160, 2, 8, .9); }
    portrait(186, 172, won && e > 2.2);
    let cxp = mix(120, 168, ease(S.roll)) + (S.groove > 2 && !S.last ? Math.sin(t * Math.PI * 2 / S.B) * 1.5 : 0);
    if (won) cxp = mix(168, 232, ease(lin(e, .15, 1.1)));
    const casketY = won ? mix(205, 198, lin(e, .15, 1.1)) : 205;
    const ROW = [[60, 1], [80, 2], [100, 0], [140, 1], [160, 0], [180, 2]];
    const conga = lin(S.roll, .35, .6), leadX = Math.min(cxp, 168) - 46;
    const frozen = !!S.last && !won;
    ROW.forEach(([x0, hat], i) => {
      const kk = clamp((S.groove - i) / 3);
      const lineX = leadX - 16 - i * 13 + Math.sin(t * Math.PI / S.B + i) * 2 * conga;
      mourner(mix(x0, lineX, ease(conga)), mix(198, 212, ease(conga)), 40, hat, frozen ? 0 : t, frozen ? 0 : Math.max(kk, conga));
    });
    const dragging = S.roll > .08 && !(won && e > .3);
    grandma(dragging ? leadX : 64, 214, t, dragging ? (won ? .3 : 1) : 0, S.anger > 40);
    if (!(won && e > 1.2)) casket(cxp, casketY, S.roll > 0 && S.roll < 1 ? t : 0);
    for (const p of S.pops) { const d = t - p.t; if (d < .7) text(p.text, camX() , p.big ? 120 - d * 10 : 118 - d * 30, p.big ? 18 : 11, p.big ? 0 : 1); }
  }
  const camX = () => mix(112, 158, ease(S.roll)) + (S.state === 'win' ? 12 * lin(S.endT, .2, 1.1) : 0);

  function lanes() {
    const t = S.t;
    rect(0, 250, W, H - 250, 0);
    for (let l = 0; l <= 4; l++) rect(LANE_X(l) - 1, 250, 1, H - 250, .3);
    rect(20, HIT_Y, 200, 1, .8);
    // the late window: a faint band just under the hit line (the groove zone)
    rect(20, HIT_Y + LATE_MIN * fallSpeed(), 200, (LATE_MAX - LATE_MIN) * fallSpeed() * .35, .25);
    for (let l = 0; l < 4; l++) if (t - S.press[l] < .12) rect(LANE_X(l) + 2, HIT_Y - 4, 46, 8, .7);
    const fs = fallSpeed();
    for (const x of S.tiles) {
      if (x.res === 'skip') continue;
      const y = HIT_Y - (x.t - (x.res && x.res !== 'miss' ? x.at - (x.at - x.t) : t)) * fs - TILE_H;
      const yy = x.res && x.res !== 'miss' ? HIT_Y - TILE_H + (t - x.at) * 400 : HIT_Y - (x.t - t) * fs - TILE_H;
      if (yy > H || yy + TILE_H < 250) continue;
      if (x.res && x.res !== 'miss' && t - x.at > .25) continue;
      rect(LANE_X(x.lane) + 3, yy, 44, TILE_H, x.res === 'late' ? .55 : x.res === 'on' ? .8 : x.res ? .3 : 1);
    }
    if (S.last && S.last.res === null) { const y = HIT_Y - (S.last.t - t) * 60 - TILE_H; rect(LANE_X(1) + 3, y, 44, TILE_H, 1); rect(LANE_X(1) + 6, y + 3, 38, TILE_H - 6, 0); text('♪', LANE_X(1) + 25, y + 26, 18, 1); }
    for (let kk = 0; kk < 12; kk++) rect(20 + kk * 17, 404, 16, 23, .95);
    for (const kk of [0, 1, 3, 4, 5, 7, 8, 10]) rect(32 + kk * 17, 404, 9, 13, 0);
  }
  function hud() {
    rect(0, 0, W, 40, 0);
    text(`${S.li + 1}/${LEVELS.length} ${S.L.name}`, 234, 13, 9, 1, 'right');
    // groove bar (casket to the door) and Grandma's patience
    rect(20, 19, 96, 7, .3); rect(20, 19, 96 * clamp(S.groove / S.L.need), 7, 1); text('GROOVE', 20, 36, 8, 1, 'left');
    rect(124, 19, 96, 7, .3); rect(124, 19, 96 * clamp(1 - S.anger / 100), 7, 1); text('GRANDMA', 124, 36, 8, 1, 'left');
    if (S.t < 4.5 && S.state === 'play' && S.groove === 0) { rect(10, 262, 220, 50, 0); text('ON THE BEAT = SOLEMN', 120, 278, 10, 1); text('A BIT LATE = GROOVE', 120, 293, 10, 1); text('LANES: D F J K / TAP', 120, 307, 8, .8); }
    if (S.last && S.last.res === null) text('THE LAST NOTE. ON THE BEAT.', 120, 262, 9, 1);
  }
  function overlay() {
    if (S.state === 'win') {
      const e = S.endT;
      if (e > 1.4) { rect(20, 60, 200, 60, 0); const k = back(lin(e, 1.4, 1.8)); cx.save(); cx.translate(120, 88); cx.scale(k, k); text('PERFECT', 0, 0, 22, 1); cx.restore(); text('★ ★ ★', 120, 110, 12, 1); }
      if (e > 2.6) { rect(40, 300, 160, 40, 1); rect(42, 302, 156, 36, 0); text(S.li < LEVELS.length - 1 ? 'NEXT FUNERAL' : 'FINISH', 120, 325, 13, 1); }
    }
    if (S.state === 'fail') {
      rect(10, 90, 220, 110, 0); text('FAIL', 120, 128, 30, 1);
      const words = S.reason.split(' '); let line = '', y = 152; for (const w of words) { if ((line + w).length > 20) { text(line, 120, y, 11, 1); line = ''; y += 15; } line += w + ' '; } text(line, 120, y, 11, 1);
      if (S.endT > .6) { rect(40, 300, 160, 40, 1); rect(42, 302, 156, 36, 0); text('TRY AGAIN', 120, 325, 14, 1); }
    }
    if (S.state === 'done') {
      rect(0, 0, W, H, 0);
      text('DEMO COMPLETE', 120, 150, 18, 1); text('THREE FUNERALS.', 120, 190, 12, 1); text('NOBODY CRIED.', 120, 208, 12, 1); text('GRANDPA WOULD BE PROUD.', 120, 236, 10, .85);
      text('TAP OR ESC: DISC MENU', 120, 320, 9, .8);
    }
  }
  function dither() {
    const img = cx.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, on = d[i] / 255 > (BAYER[y & 3][x & 3] + .5) / 16, c = on ? PAPER : INK; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    cx.putImageData(img, 0, 0);
  }
  function render(ctx) {
    cx.setTransform(1, 0, 0, 1, 0, 0); rect(0, 0, W, H, 0);
    if (S.state !== 'done') {
      const sh = S.groove > 4 && S.state === 'play' && !S.last ? Math.round(Math.sin(S.t * 40)) : 0;
      cx.save(); cx.beginPath(); cx.rect(0, 40, W, 210); cx.clip(); cx.translate(120, 238 + sh); cx.scale(1.7, 1.7); cx.translate(-camX(), -214); chapel(); cx.restore();
      lanes(); hud();
    }
    overlay();
    dither();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, W, H, 0, 0, LW, LH);
  }

  // ---------- input ----------
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else S.state = 'done'; }
  function onPointer(type, x, y) {
    if (type !== 'down') return;
    const lx = x / SCALE, ly = y / SCALE;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'fail' && S.endT > .6) { load(S.li); return; }
    if (S.state === 'win' && S.endT > 2.6) { next(); return; }
    if (ly > 250) { const lane = Math.floor((lx - 20) / 50); if (lane >= 0 && lane < 4) tap(lane); }
  }
  const KEYS = { d: 0, D: 0, f: 1, F: 1, j: 2, J: 2, k: 3, K: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'fail' && S.endT > .6 && (key === 'Enter' || key === ' ')) { load(S.li); return; }
    if (S.state === 'win' && S.endT > 2.6 && (key === 'Enter' || key === ' ')) { next(); return; }
    if (key in KEYS) tap(KEYS[key]);
  }

  const API = { LEVELS, S, load, tap, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: LW, height: LH, update, render, onPointer, onKey });
  window.__game = API;
})();
