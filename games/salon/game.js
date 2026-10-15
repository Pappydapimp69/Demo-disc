// HAIR SALON ASMR - playable demo.
// Drag the clippers over the hair. Every level's clippings become the next level's hair:
// the customer, the salon, the dog, the town, the Earth. Then someone stops by to use the Earth as a mirror.
(function () {
  'use strict';
  const { createGame, Audio, Draw } = Engine;
  const W = 720, H = 1280;
  let cx = null; // the scene code below draws through this, same as the ad
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const easeOut = x => 1 - (1 - x) * (1 - x);
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, Math.max(0, r)); }
  function circ(x, y, r) { cx.beginPath(); cx.arc(x, y, Math.max(0, r), 0, 7); cx.fill(); }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// clippers in Sal's hand (always the same size on screen, the world just gets bigger)
function clipper(x, y, t, on) {
  const j = on ? Math.sin(t * 90) * 2 : 0;
  cx.save(); cx.translate(x + j, y); cx.rotate(-.35);
  cx.fillStyle = '#f2c79a'; cx.strokeStyle = '#7a4a2a'; cx.lineWidth = 3; rr(-26, 40, 52, 120, 24); cx.fill(); cx.stroke();   // hand/forearm
  cx.fillStyle = '#2a2a34'; rr(-22, -10, 44, 120, 14); cx.fill();
  cx.fillStyle = '#c8c8d8'; rr(-26, -26, 52, 22, 4); cx.fill();
  cx.fillStyle = '#8a8a9a'; for (let k = -22; k <= 18; k += 6) cx.fillRect(k, -32, 3, 8);
  cx.fillStyle = on ? '#4ad05a' : '#555'; circ(0, 40, 5);
  cx.restore();
}

// ---------- what's underneath ----------
function salonBack(dim = 1) {
  cx.fillStyle = '#e8d8c8'; cx.fillRect(0, 0, W, H);
  cx.fillStyle = '#c8a888'; for (let k = 0; k < 8; k++) cx.fillRect(k * 100, 0, 50, 760);
  cx.fillStyle = '#b8d8e8'; rr(160, 140, 400, 300, 20); cx.fill(); cx.strokeStyle = '#8a6a4a'; cx.lineWidth = 12; cx.stroke();   // mirror
  cx.fillStyle = '#d8c0a0'; cx.fillRect(0, 760, W, H - 760);
  for (let k = 0; k < 10; k++) for (let j = 0; j < 6; j++) { cx.fillStyle = (k + j) % 2 ? '#2a2a34' : '#f0f0f0'; cx.fillRect(k * 80 - 20, 800 + j * 80, 80, 80); }
}
function customer(x, y, s, bald, look = 0) {
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = '#e8e8f0'; cx.beginPath(); cx.moveTo(-230, 520); cx.quadraticCurveTo(-200, 230, 0, 230); cx.quadraticCurveTo(200, 230, 230, 520); cx.fill(); // cape
  cx.fillStyle = '#f2c79a'; cx.beginPath(); cx.ellipse(0, 0, 150, 190, 0, 0, 7); cx.fill();
  cx.fillStyle = '#f2c79a'; circ(-150, 10, 30); circ(150, 10, 30);
  if (bald) { cx.fillStyle = '#ffffffaa'; cx.beginPath(); cx.ellipse(-50, -120, 50, 26, -.5, 0, 7); cx.fill(); }
  cx.fillStyle = '#fff'; circ(-55, -10 , 26); circ(55, -10, 26);
  cx.fillStyle = '#222'; circ(-55 + look * 8, -6, 12); circ(55 + look * 8, -6, 12);
  cx.strokeStyle = '#7a3a2a'; cx.lineWidth = 7; cx.lineCap = 'round'; cx.beginPath();
  if (bald) cx.arc(0, 70, 34, .3, Math.PI - .3); else { cx.moveTo(-30, 80); cx.lineTo(30, 80); }
  cx.stroke();
  cx.restore();
}
function room(t) {
  salonBack();
  // barber chair + the now-bald customer
  cx.fillStyle = '#a02a2a'; rr(250, 760, 220, 240, 30); cx.fill(); cx.fillStyle = '#888'; cx.fillRect(345, 1000, 30, 80); rr(290, 1070, 140, 20, 8); cx.fill();
  customer(360, 690, .45, true);
  // the door, open: the clippings leave through it
  cx.fillStyle = '#6a4a2a'; cx.fillRect(600, 460, 110, 320); cx.fillStyle = '#9adcff'; cx.fillRect(610, 470, 90, 300);
}
function street(t, dogVisible) {
  const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8ad0ff'); g.addColorStop(1, '#d8f0ff'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  cx.fillStyle = '#7ac85a'; cx.fillRect(0, 900, W, H - 900);
  cx.fillStyle = '#c8a888'; cx.fillRect(0, 300, 260, 600); cx.fillStyle = '#6a4a2a'; cx.fillRect(150, 640, 90, 260); // salon front + door
  cx.fillStyle = '#a02a2a'; cx.font = '900 34px system-ui'; cx.textAlign = 'center'; cx.fillText("SAL'S", 130, 360);
}
function chihuahua(x, y, t) {
  const sh = Math.sin(t * 60) * 3;
  cx.save(); cx.translate(x + sh, y);
  cx.fillStyle = '#e8c89a'; cx.beginPath(); cx.ellipse(0, 0, 46, 26, 0, 0, 7); cx.fill();
  cx.fillRect(-36, 14, 8, 34); cx.fillRect(-18, 14, 8, 34); cx.fillRect(14, 14, 8, 34); cx.fillRect(30, 14, 8, 34);
  circ(46, -26, 24);
  cx.beginPath(); cx.moveTo(36, -44); cx.lineTo(30, -82); cx.lineTo(50, -50); cx.fill(); cx.beginPath(); cx.moveTo(56, -46); cx.lineTo(72, -80); cx.lineTo(66, -40); cx.fill();
  cx.fillStyle = '#222'; circ(52, -30, 6); circ(68, -22, 4);
  cx.restore();
}
function town() {
  const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#6ab8ff'); g.addColorStop(1, '#d8f0ff'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  cx.fillStyle = '#7ac85a'; cx.fillRect(0, 980, W, H - 980);
  const r = rng(4);
  for (let k = 0; k < 9; k++) {
    const x = 10 + k * 80, h = 160 + r() * 260, col = ['#e8b88a', '#c8d8e8', '#f0d0a0', '#d8a8a8'][k % 4];
    cx.fillStyle = col; cx.fillRect(x, 1000 - h, 72, h);
    cx.fillStyle = '#a03a2a'; cx.beginPath(); cx.moveTo(x - 6, 1000 - h); cx.lineTo(x + 36, 1000 - h - 40); cx.lineTo(x + 78, 1000 - h); cx.fill();
    cx.fillStyle = '#9adcff'; for (let j = 0; j < h / 70 - 1; j++) { cx.fillRect(x + 12, 1000 - h + 20 + j * 66, 18, 26); cx.fillRect(x + 42, 1000 - h + 20 + j * 66, 18, 26); }
  }
  cx.fillStyle = '#888'; cx.fillRect(0, 1000, W, 40);
}
function space() {
  cx.fillStyle = '#040616'; cx.fillRect(0, 0, W, H);
  const r = rng(9); cx.fillStyle = '#fff'; for (let i = 0; i < 140; i++) { cx.globalAlpha = .3 + r() * .7; cx.fillRect(r() * W, r() * H, 2, 2); } cx.globalAlpha = 1;
}
function earth(t, polish) {
  const R = 255, X = 360, Y = 680;
  const g = cx.createRadialGradient(X - 90, Y - 110, 20, X, Y, R); g.addColorStop(0, polish ? '#cfefff' : '#5ab8ff'); g.addColorStop(.35, '#3a90e8'); g.addColorStop(1, '#0a3a8a');
  cx.fillStyle = g; circ(X, Y, R);
  cx.save(); cx.beginPath(); cx.arc(X, Y, R, 0, 7); cx.clip();
  cx.fillStyle = polish ? '#5ad87a' : '#4ab85a';
  for (const [x, y, rx, ry, a] of [[-.45, -.3, .36, .26, .5], [.32, -.42, .28, .2, -.4], [.36, .28, .26, .32, .3], [-.38, .42, .3, .18, -.2], [-.02, .02, .2, .16, 0]]) { cx.beginPath(); cx.ellipse(X + x * R, Y + y * R, rx * R, ry * R, a, 0, 7); cx.fill(); }
  if (polish) {
    // chrome shine: a hard specular streak and a sweeping gleam
    cx.fillStyle = 'rgba(255,255,255,.75)'; cx.beginPath(); cx.ellipse(X - 100, Y - 130, 90, 36, -.6, 0, 7); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.ellipse(X + 120, Y + 140, 40, 16, -.6, 0, 7); cx.fill();
    const gl = lin(t, 17.4, 18.1); if (gl > 0 && gl < 1) { const gx = mix(X - R * 1.4, X + R * 1.4, gl); const lg = cx.createLinearGradient(gx - 60, 0, gx + 60, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.8)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = lg; cx.fillRect(gx - 60, Y - R, 120, R * 2); }
  }
  cx.restore();
  if (polish && t > 17.9 && t < 18.6) sparkle(X - 60, Y - 160, lin(t, 17.9, 18.6));
}
function sparkle(x, y, k) { const s = Math.sin(k * Math.PI) * 40; cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(x, y - s); cx.lineTo(x + s * .2, y); cx.lineTo(x, y + s); cx.lineTo(x - s * .2, y); cx.fill(); cx.beginPath(); cx.moveTo(x - s, y); cx.lineTo(x, y - s * .2); cx.lineTo(x + s, y); cx.lineTo(x, y + s * .2); cx.fill(); }

// ---------- the UFO and the alien who checks its hair ----------
function ufo(x, y, t, comb, s = 1) {
  cx.save(); cx.translate(x, y); cx.scale(s, s);
  cx.fillStyle = '#9ae8ff88'; cx.beginPath(); cx.ellipse(0, -30, 70, 60, 0, Math.PI, 0); cx.fill();
  // alien
  cx.fillStyle = '#6ad86a'; circ(0, -40, 34);
  cx.fillStyle = '#111'; cx.beginPath(); cx.ellipse(-13, -44, 9, 13, -.3, 0, 7); cx.fill(); cx.beginPath(); cx.ellipse(13, -44, 9, 13, .3, 0, 7); cx.fill();
  // one antenna with a single proud tuft of hair
  cx.strokeStyle = '#6ad86a'; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(0, -72); cx.lineTo(0, -108); cx.stroke();
  cx.strokeStyle = '#ff5ab0'; cx.lineWidth = 4; cx.lineCap = 'round';
  const neat = clamp(comb), lean = mix(.9, -.1, neat);
  for (let k = -2; k <= 2; k++) { cx.beginPath(); cx.moveTo(0, -108); cx.quadraticCurveTo(k * 8 * (1 - neat) + 10 * lean, -130, k * 10 * (1 - neat * .6) + 22 * lean, -146 + Math.abs(k) * 4 * neat); cx.stroke(); }
  // saucer
  cx.fillStyle = '#b8b8c8'; cx.beginPath(); cx.ellipse(0, 0, 130, 34, 0, 0, 7); cx.fill();
  cx.fillStyle = '#8a8a9a'; cx.beginPath(); cx.ellipse(0, 8, 130, 20, 0, 0, Math.PI); cx.fill();
  for (let k = -3; k <= 3; k++) { cx.fillStyle = Math.floor(t * 6 + k) % 2 ? '#ffd23a' : '#ff5ab0'; circ(k * 34, 6, 7); }
  cx.restore();
}
function comb(x, y, k) { cx.save(); cx.translate(x, y); cx.rotate(-.3 + Math.sin(k * Math.PI * 4) * .3); cx.fillStyle = '#3a8ad0'; rr(-6, -40, 12, 50, 4); cx.fill(); for (let j = 0; j < 6; j++) cx.fillRect(6, -38 + j * 8, 14, 4); cx.restore(); }


  // ---------- levels (same hair as the ad) ----------
  const LEVELS = [
    { name: 'JUST A TRIM', r: 56, drift: [0, 1], n: 1400, box: { x: 190, y: 310, w: 340, h: 640 }, inside: (x, y) => { const dx = (x - 360) / 170, dy = (y - 600) / 290; return dx * dx + dy * dy < 1; },
      under: t => { salonBack(); customer(360, 560, 1, S.done, S.done ? Math.sin(S.doneT * 3) : 0); }, before: 'Just a trim.', after: "...That's not a trim." },
    { name: 'THE SALON', r: 84, drift: [1, -.2], n: 2400, box: { x: 30, y: 300, w: 660, h: 830 }, inside: (x, y) => y > 290 && y < 1130,
      under: t => room(t), before: null, after: null },
    { name: 'THE DOG', r: 66, drift: [.2, -1], n: 1800, box: { x: 130, y: 470, w: 460, h: 460 }, inside: (x, y) => (x - 360) ** 2 + (y - 700) ** 2 < 225 ** 2,
      under: t => { street(t); chihuahua(380, 760, t); }, before: null, after: null },
    { name: 'THE TOWN', r: 84, drift: [0, -1], n: 2400, box: { x: 30, y: 520, w: 660, h: 610 }, inside: (x, y) => y > 520 && y < 1130,
      under: t => town(), before: null, after: 'Hey!' },
    { name: 'THE EARTH', r: 70, drift: null, n: 2400, box: { x: 90, y: 410, w: 540, h: 540 }, inside: (x, y) => (x - 360) ** 2 + (y - 680) ** 2 < 262 ** 2,
      under: t => { space(); earth(S.done ? 17.4 + Math.min(S.doneT, 1.2) * .6 : 0, S.done); }, before: null, after: null },
  ];
  function deal(i) {
    const L = LEVELS[i], r = rng(100 + i), out = [];
    while (out.length < L.n) {
      const x = L.box.x - 20 + r() * (L.box.w + 40), y = L.box.y - 20 + r() * (L.box.h + 40);
      if (L.inside(x, y)) out.push({ x, y, a: -Math.PI / 2 + (r() - .5) * 1.6, c: r(), l: 26 * (.7 + r() * .6), cut: -1, dr: r() });
    }
    return out;
  }

  // ---------- state ----------
  const S = { li: 0, L: null, strands: [], left: 0, t: 0, lt: 0, state: 'play', done: false, doneT: 0, ptr: null, down: false, keys: {}, idle: 0, auto: 0, ufoT: 0, bubble: null };
  function load(i) {
    Object.assign(S, { li: i, L: LEVELS[i], strands: deal(i), lt: 0, state: 'play', done: false, doneT: 0, ptr: { x: 600, y: 1150 }, down: false, idle: 0, auto: 0, ufoT: 0 });
    S.left = S.strands.length;
    S.bubble = S.L.before ? { text: S.L.before, t: 0 } : null;
    API.autopilot = null;
  }
  function clip(x, y) {
    const r = S.L.r; let n = 0;
    for (const s of S.strands) if (s.cut < 0 && (s.x - x) ** 2 + (s.y - y) ** 2 < r * r) { s.cut = S.t; n++; }
    S.left -= n;
    if (n && !S.done && S.left <= S.strands.length * .03) finish();
  }
  function finish() {
    for (const s of S.strands) if (s.cut < 0) s.cut = S.t;   // the last few wisps go with a flourish
    S.left = 0; S.done = true; S.doneT = 0;
    Audio.sfx('win');
    if (S.L.after) S.bubble = { text: S.L.after, t: S.t };
  }
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'ufo'; S.ufoT = 0; } }

  let buzzT = 0;
  function update(dt) {
    S.t += dt; S.lt += dt;
    if (S.state === 'ufo') { S.ufoT += dt; if (S.ufoT > 6) S.state = 'done'; return; }
    if (S.state !== 'play') return;
    if (S.done) { S.doneT += dt; if (S.doneT > 2.4) next(); return; }
    // steering: keys, or the test autopilot (it mows rows like the ad), or the pointer
    const auto = API.autopilot;
    if (auto) {
      const B = S.L.box, rows = Math.ceil(B.h / (S.L.r * 1.4)), k = Math.min(1, S.auto += dt / 9), f = k * rows, row = Math.min(rows - 1, Math.floor(f)), u = f - row;
      S.ptr = { x: row % 2 ? mix(B.x + B.w, B.x, u) : mix(B.x, B.x + B.w, u), y: B.y + (row + .5) * B.h / rows }; S.down = true;
      if (k >= 1) { // a final pass over anything the rows missed
        const s = S.strands.find(q => q.cut < 0); if (s) S.ptr = { x: s.x, y: s.y };
      }
    } else {
      const dx = (S.keys.ArrowRight ? 1 : 0) - (S.keys.ArrowLeft ? 1 : 0), dy = (S.keys.ArrowDown ? 1 : 0) - (S.keys.ArrowUp ? 1 : 0);
      if (dx || dy) { S.ptr = { x: clamp(S.ptr.x + dx * 520 * dt, 0, W), y: clamp(S.ptr.y + dy * 520 * dt, 0, H) }; S.down = true; S.kb = true; }
      else if (S.kb) { S.down = false; S.kb = false; }
    }
    if (S.down && S.ptr) { clip(S.ptr.x, S.ptr.y); S.idle = 0; buzzT -= dt; if (buzzT <= 0) { Audio.tone(110 - S.li * 10, .09, 'sawtooth', .025); buzzT = .08; } }
    else S.idle += dt;
  }

  // ---------- drawing ----------
  function hairDraw(t) {
    cx.lineCap = 'round'; cx.lineWidth = 4;
    for (const s of S.strands) {
      let x = s.x, y = s.y, a = 1;
      if (s.cut >= 0) {
        const k = (t - s.cut) / 1.1; if (k >= 1) continue; a = 1 - k;
        const d = S.L.drift;
        if (d) { x += d[0] * 420 * k * k + Math.sin(s.dr * 9 + t * 4) * 20 * k; y += d[1] * 420 * k * k; }
        else { const ang = Math.atan2(s.y - 680, s.x - 360); x += Math.cos(ang) * 500 * k; y += Math.sin(ang) * 500 * k; }
      }
      cx.globalAlpha = a; cx.strokeStyle = `hsl(25, 55%, ${18 + s.c * 30}%)`;
      cx.beginPath(); cx.moveTo(x, y); cx.quadraticCurveTo(x + Math.cos(s.a + .5) * s.l * .6, y + Math.sin(s.a + .5) * s.l * .6, x + Math.cos(s.a) * s.l, y + Math.sin(s.a) * s.l); cx.stroke();
    }
    cx.globalAlpha = 1;
  }
  function bubble(text, x, y) {
    cx.save(); cx.font = '800 38px system-ui'; const w = Math.max(90, cx.measureText(text).width + 44), bx = clamp(x - w / 2, 30, W - 30 - w), by = y - 90;
    cx.fillStyle = '#fff'; cx.strokeStyle = '#000'; cx.lineWidth = 4; rr(bx, by, w, 70, 26); cx.fill(); cx.stroke();
    const tx = clamp(x, bx + 30, bx + w - 30); cx.beginPath(); cx.moveTo(tx - 14, by + 68); cx.lineTo(x, y); cx.lineTo(tx + 14, by + 68); cx.fill(); cx.stroke();
    cx.fillStyle = '#111'; cx.textAlign = 'center'; cx.fillText(text, bx + w / 2, by + 48); cx.restore();
  }
  function render(ctx) {
    cx = ctx;
    if (S.state === 'done') {
      cx.fillStyle = '#2a1a4a'; cx.fillRect(0, 0, W, H);
      Draw.bigText(cx, 'DEMO COMPLETE', W / 2, 520, 64, '#ffe14a');
      Draw.bigText(cx, 'YOU SHAVED THE EARTH.', W / 2, 610, 34, '#fff');
      Draw.bigText(cx, 'IT HAS NEVER LOOKED BETTER.', W / 2, 660, 30, '#c8b8ff');
      Draw.bigText(cx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 820, 24, '#9ad8ff');
      return;
    }
    if (S.state === 'ufo') {
      const t = S.ufoT;
      space(); earth(18.2, true);
      const ux = mix(950, 470, easeOut(lin(t, 0, .8))), uy = mix(160, 330, easeOut(lin(t, 0, .8))) + Math.sin(t * 2) * 6, ck = lin(t, 1.0, 2.0);
      cx.save(); cx.beginPath(); cx.arc(360, 680, 255, 0, 7); cx.clip(); cx.globalAlpha = .6; cx.translate(360 + (ux - 360) * .3, 600); cx.scale(-.8, .8); ufo(0, 0, t, ck); if (t > .9 && t < 2.2) comb(30, -120, ck); cx.restore(); cx.globalAlpha = 1;
      ufo(ux, uy, t, ck, 1.5); if (t > .9 && t < 2.2) comb(ux + 45, uy - 175, ck);
      if (t > 1.6 && t < 4.4) bubble('Looking good.', ux, uy - 215);
      if (t > 2.2) for (let i = 0; i < 3; i++) { const kk = back(lin(t, 2.2 + i * .15, 2.6 + i * .15)); if (kk > 0) { cx.save(); cx.translate(W / 2 + (i - 1) * 110, 1080 - (i === 1 ? 20 : 0)); cx.scale(kk, kk); Draw.star(cx, 0, 0, 46, '#ffd23a'); cx.restore(); } }
      if (t > 2.4) Draw.bigText(cx, 'PERFECT SHAVE!', W / 2, 1190, 54, '#ffd23a');
      return;
    }
    const zin = 1 + .25 * (1 - easeOut(lin(S.lt, 0, .45)));
    cx.save(); cx.translate(W / 2, H / 2); cx.scale(zin, zin); cx.translate(-W / 2, -H / 2);
    S.L.under(S.t);
    hairDraw(S.t);
    cx.restore();
    if (S.li === 0 && S.done && S.doneT < 1.4) sparkle(300, 400, lin(S.doneT, 0, .7));
    // clippers
    if (S.ptr && !S.done) clipper(S.ptr.x, S.ptr.y, S.t, S.down);
    // HUD
    Draw.bigText(cx, `LEVEL ${S.li + 1}/${LEVELS.length}`, W / 2, 70, 34, '#fff');
    Draw.bigText(cx, S.L.name, W / 2, 122, 46, '#ffe14a');
    const pct = Math.round(100 * (1 - S.left / S.strands.length));
    cx.fillStyle = '#0008'; rr(160, 160, 400, 26, 13); cx.fill(); cx.fillStyle = '#4ad05a'; rr(160, 160, 400 * pct / 100, 26, 13); cx.fill();
    if (S.done) { const k = back(lin(S.doneT, 0, .4)); cx.save(); cx.translate(W / 2, 1180); cx.scale(k, k); Draw.bigText(cx, 'SO SMOOTH!', 0, 0, 64, '#ffe14a'); cx.restore(); }
    if (S.bubble && S.t - S.bubble.t < 2.2) bubble(S.bubble.text, S.li === 0 ? 360 : S.li === 3 ? 200 : 360, S.li === 0 ? 330 : 500);
    if (!S.done && S.idle > 2.5 && pct < 5) { cx.globalAlpha = .5 + .5 * Math.sin(S.t * 5); Draw.bigText(cx, 'DRAG TO SHAVE', W / 2, 1210, 40, '#fff'); cx.globalAlpha = 1; }
  }

  // ---------- input ----------
  function onPointer(type, x, y) {
    if (S.state === 'done') { if (type === 'down') location.href = '../../index.html'; return; }
    if (type === 'down') { Audio.unlock(); S.down = true; S.ptr = { x, y: y - 40 }; }
    else if (type === 'move' && S.down) S.ptr = { x, y: y - 40 };     // the head sits just above the finger so you can see what you're cutting
    else if (type === 'up' || type === 'cancel') S.down = false;
  }
  function onKey(key, down) { S.keys[key] = down; if (down && S.state === 'done' && (key === 'Enter' || key === ' ')) location.href = '../../index.html'; }

  const API = { LEVELS, S, load, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
