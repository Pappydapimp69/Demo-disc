// Ukiyo-e woodblock drawing kit, shared by the SOAP OPERA SOLITAIRE ad and the playable game.
// Rules (Brain ART/style-catalog): flat fills from a small palette, heavy variable key lines,
// a bokashi gradient band, seigaiha wave-scale pattern, 1 px colour registration offset, wood grain.
(function () {
  'use strict';
  const P = { paper: '#efe3c8', paper2: '#e6d6b2', ink: '#1c1a1a', prussian: '#1f3a5f', indigo: '#2a3566', vermilion: '#d4432a', ochre: '#d8a03a', skin: '#f6ecd8', green: '#4a7a5a' };
  let cx = null;
  const setCtx = c => { cx = c; };
  function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, r); }
  const SERIF = s => `700 ${s}px "Liberation Serif", "DejaVu Serif", serif`;
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

  const cache = {};
  function cached(key, w, h, paint) {   // paint once into an offscreen canvas, then just blit it
    let c = cache[key];
    if (!c) { c = cache[key] = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); const keep = cx; cx = c.getContext('2d'); paint(); cx = keep; }
    return c;
  }
  function paperBg(W, H) {
    cx.drawImage(cached('paper' + W + 'x' + H, W, H, () => paperBgRaw(W, H)), 0, 0);
  }
  function paperBgRaw(W, H) {
    cx.fillStyle = P.paper; cx.fillRect(0, 0, W, H);
    cx.globalAlpha = .07; cx.strokeStyle = '#7a5a2a'; cx.lineWidth = 2;   // wood grain
    for (let i = 0; i < 70; i++) { const y = hash(i) * H; cx.beginPath(); cx.moveTo(0, y); for (let x = 0; x <= W; x += 60) cx.lineTo(x, y + Math.sin(x * .01 + i) * 6); cx.stroke(); }
    cx.globalAlpha = 1;
  }
  function bokashi(W, y0, h, col = P.prussian) {   // hand-wiped gradation band
    const g = cx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, col); g.addColorStop(1, 'rgba(31,58,95,0)');
    cx.fillStyle = g; cx.fillRect(0, y0, W, h);
  }
  function waves(W, y, t, scale = 1) {   // claw-tipped waves along the bottom
    for (let layer = 0; layer < 2; layer++) {
      const yy = y + layer * 40 * scale, off = (t * (20 + layer * 10)) % (140 * scale);
      cx.fillStyle = layer ? P.indigo : P.prussian;
      cx.beginPath(); cx.moveTo(0, yy + 200);
      for (let x = -140 * scale + off; x < W + 140; x += 140 * scale) {
        cx.quadraticCurveTo(x + 50 * scale, yy - 60 * scale, x + 100 * scale, yy - 20 * scale);
        cx.quadraticCurveTo(x + 120 * scale, yy - 40 * scale, x + 140 * scale, yy);
      }
      cx.lineTo(W + 140, yy + 200); cx.closePath(); cx.fill();
      cx.strokeStyle = P.ink; cx.lineWidth = 3; cx.stroke();
      cx.fillStyle = P.paper;   // foam claws
      for (let x = -140 * scale + off; x < W + 140; x += 140 * scale) for (let k = 0; k < 4; k++) { cx.beginPath(); cx.arc(x + 88 * scale + k * 9 * scale, yy - 22 * scale - k * 4 * scale, 5 * scale, 0, 7); cx.fill(); }
    }
  }
  function seigaiha(x, y, w, h) {
    const img = cached('sg' + Math.round(w) + 'x' + Math.round(h), w, h, () => seigaihaRaw(0, 0, w, h));
    cx.drawImage(img, x, y, w, h);
  }
  function seigaihaRaw(x, y, w, h) {
    cx.save(); cx.beginPath(); cx.rect(x, y, w, h); cx.clip();
    cx.fillStyle = P.indigo; cx.fillRect(x, y, w, h);
    const r = 10;
    for (let row = 0; row * r * .5 < h + r; row++) for (let col = -1; col * r * 2 < w + r * 2; col++) {
      const cxp = x + col * r * 2 + (row % 2 ? r : 0), cyp = y + row * r * .5 + r;
      for (const [rad, c] of [[r, P.paper], [r * .72, P.indigo], [r * .48, P.paper], [r * .26, P.indigo]]) { cx.fillStyle = c; cx.beginPath(); cx.arc(cxp, cyp, rad, Math.PI, 0); cx.fill(); }
    }
    cx.restore();
  }
  function keyRect(x, y, w, h, r, lw = 4) { rr(x, y, w, h, r); cx.strokeStyle = P.ink; cx.lineWidth = lw; cx.stroke(); }
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK = r => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
  // a card. c = { r, s } or { joker: true }; face-down draws the seigaiha back. opts: who (face portrait), eyes (look dir), mood
  function card(x, y, w, h, c, faceUp, opts = {}) {
    cx.save(); cx.translate(x, y); if (opts.rot) cx.rotate(opts.rot);
    cx.fillStyle = '#00000030'; rr(-w / 2 + 4, -h / 2 + 5, w, h, 6); cx.fill();
    if (!faceUp) { cx.fillStyle = P.paper; rr(-w / 2, -h / 2, w, h, 6); cx.fill(); seigaiha(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10); keyRect(-w / 2, -h / 2, w, h, 6); cx.restore(); return; }
    cx.fillStyle = P.skin; rr(-w / 2, -h / 2, w, h, 6); cx.fill();
    // registration slip: colour sits a pixel off the key line, like a print
    cx.translate(1, 1);
    if (c.joker) {
      portrait(0, h * .02, w * .42, 'joker', opts);
      cx.font = SERIF(w * .22); cx.fillStyle = P.vermilion; cx.textAlign = 'left'; cx.fillText('JKR', -w / 2 + 5, -h / 2 + w * .26);
    } else {
      const red = c.s === 'H' || c.s === 'D', col = red ? P.vermilion : P.ink;
      cx.font = SERIF(w * .3); cx.fillStyle = col; cx.textAlign = 'left'; cx.fillText(RANK(c.r), -w / 2 + 5, -h / 2 + w * .32);
      cx.font = SERIF(w * .26); cx.fillText(SUIT[c.s], -w / 2 + 5, -h / 2 + w * .58);
      if (c.r >= 11 || opts.who) portrait(w * .08, h * .1, w * .36, opts.who || ({ 11: 'jack', 12: red ? 'queen' : 'sister', 13: 'king' })[c.r], opts);
      else { cx.font = SERIF(w * .62); cx.textAlign = 'center'; cx.fillText(SUIT[c.s], w * .08, h * .3); if (opts.eyes) eyesOn(w * .08, h * .02, w * .1, opts); }
    }
    cx.translate(-1, -1);
    keyRect(-w / 2, -h / 2, w, h, 6, Math.max(2.5, w * .05));
    cx.restore();
  }
  function eyesOn(x, y, s, opts) {   // little eyes on pip cards (so everyone can look at the Joker)
    const [lx, ly] = opts.eyes;
    for (const ex of [x - s * .6, x + s * .6]) { cx.fillStyle = '#fff'; cx.beginPath(); cx.ellipse(ex, y, s * .45, s * .55, 0, 0, 7); cx.fill(); cx.strokeStyle = P.ink; cx.lineWidth = 2; cx.stroke(); cx.fillStyle = P.ink; cx.beginPath(); cx.arc(ex + lx * s * .2, y + ly * s * .2, s * .22, 0, 7); cx.fill(); }
  }
  // kabuki-style portrait. who: king | jack | queen | sister | joker; opts.mood: calm | gasp | faint | swoon | grin; opts.eyes: [dx, dy]
  function portrait(x, y, s, who, opts = {}) {
    const mood = opts.mood || 'calm', [lx, ly] = opts.eyes || [0, 0];
    cx.save(); cx.translate(x, y);
    // hair / headwear behind
    cx.fillStyle = P.ink;
    if (who === 'queen' || who === 'sister') { cx.beginPath(); cx.ellipse(0, -s * .55, s * .78, s * .55, 0, 0, 7); cx.fill(); cx.beginPath(); cx.arc(0, -s * 1.05, s * .32, 0, 7); cx.fill(); }
    else if (who === 'joker') { cx.fillStyle = P.vermilion; cx.beginPath(); cx.moveTo(-s * .8, -s * .3); cx.lineTo(-s * 1.0, -s * 1.2); cx.lineTo(0, -s * .55); cx.lineTo(s * 1.0, -s * 1.2); cx.lineTo(s * .8, -s * .3); cx.fill(); cx.fillStyle = P.ochre; cx.beginPath(); cx.arc(-s, -s * 1.2, s * .14, 0, 7); cx.arc(s, -s * 1.2, s * .14, 0, 7); cx.fill(); }
    else { cx.beginPath(); cx.ellipse(0, -s * .5, s * .7, s * .5, 0, Math.PI, 0); cx.fill(); cx.fillRect(-s * .12, -s * 1.1, s * .24, s * .5); }   // topknot
    // face
    cx.fillStyle = '#fbf6ee'; cx.beginPath(); cx.ellipse(0, 0, s * .6, s * .75, 0, 0, 7); cx.fill(); cx.strokeStyle = P.ink; cx.lineWidth = Math.max(1.5, s * .06); cx.stroke();
    // kumadori stripes (red) for the men and the joker
    if (who !== 'queen' && who !== 'sister') { cx.strokeStyle = P.vermilion; cx.lineWidth = s * .08; cx.beginPath(); cx.moveTo(-s * .5, -s * .1); cx.quadraticCurveTo(-s * .3, -s * .45, -s * .05, -s * .3); cx.moveTo(s * .5, -s * .1); cx.quadraticCurveTo(s * .3, -s * .45, s * .05, -s * .3); cx.stroke(); }
    // eyes
    cx.strokeStyle = P.ink; cx.fillStyle = P.ink; cx.lineWidth = Math.max(1.5, s * .07);
    if (mood === 'faint') { for (const ex of [-s * .25, s * .25]) { cx.beginPath(); cx.moveTo(ex - s * .1, -s * .15); cx.lineTo(ex + s * .1, -s * .05); cx.moveTo(ex - s * .1, -s * .05); cx.lineTo(ex + s * .1, -s * .15); cx.stroke(); } }
    else for (const ex of [-s * .25, s * .25]) {
      const open = mood === 'gasp' || mood === 'swoon' ? 1 : .55;
      cx.beginPath(); cx.ellipse(ex, -s * .1, s * .14, s * .09 * open + s * .02, ex < 0 ? .25 : -.25, 0, 7); cx.fillStyle = '#fff'; cx.fill(); cx.stroke();
      cx.fillStyle = P.ink; cx.beginPath(); cx.arc(ex + lx * s * .06, -s * .1 + ly * s * .04, s * .05, 0, 7); cx.fill();
    }
    // props
    if (who === 'king') { cx.fillStyle = P.ink; cx.beginPath(); cx.ellipse(-s * .25, -s * .1, s * .18, s * .14, 0, 0, 7); cx.fill(); cx.beginPath(); cx.moveTo(-s * .55, -s * .3); cx.lineTo(s * .5, s * .05); cx.stroke(); cx.fillStyle = P.ochre; cx.beginPath(); cx.moveTo(-s * .5, -s * .95); cx.lineTo(-s * .3, -s * 1.3); cx.lineTo(0, -s * 1.0); cx.lineTo(s * .3, -s * 1.3); cx.lineTo(s * .5, -s * .95); cx.fill(); }   // eyepatch + crown
    if (who === 'jack') { cx.strokeStyle = P.ink; cx.lineWidth = s * .12; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-s * .35, s * .22); cx.quadraticCurveTo(0, s * .1, s * .35, s * .22); cx.stroke(); cx.beginPath(); cx.moveTo(-s * .35, s * .22); cx.lineTo(-s * .5, s * .1); cx.moveTo(s * .35, s * .22); cx.lineTo(s * .5, s * .1); cx.stroke(); }   // the evil-twin moustache
    if (who === 'queen' || who === 'sister') { cx.strokeStyle = P.ochre; cx.lineWidth = s * .07; cx.beginPath(); cx.moveTo(-s * .2, -s * 1.15); cx.lineTo(-s * .6, -s * 1.5); cx.moveTo(s * .2, -s * 1.15); cx.lineTo(s * .6, -s * 1.5); cx.stroke(); cx.fillStyle = who === 'sister' ? P.prussian : P.vermilion; cx.beginPath(); cx.arc(-s * .6, -s * 1.5, s * .1, 0, 7); cx.arc(s * .6, -s * 1.5, s * .1, 0, 7); cx.fill(); }   // kanzashi pins
    // mouth
    cx.strokeStyle = P.vermilion; cx.fillStyle = P.vermilion; cx.lineWidth = Math.max(1.5, s * .07);
    if (mood === 'gasp' || mood === 'swoon') { cx.beginPath(); cx.ellipse(0, s * .35, s * .12, s * .16, 0, 0, 7); cx.fill(); }
    else if (who === 'joker' || mood === 'grin') { cx.beginPath(); cx.arc(0, s * .25, s * .3, .2, Math.PI - .2); cx.fill(); cx.fillStyle = '#fff'; cx.fillRect(-s * .2, s * .3, s * .4, s * .06); }
    else { cx.beginPath(); cx.moveTo(-s * .12, s * .38); cx.quadraticCurveTo(0, s * .3, s * .12, s * .38); cx.stroke(); }
    if (mood === 'swoon') { cx.strokeStyle = P.ink; cx.lineWidth = s * .08; cx.beginPath(); cx.moveTo(-s * .7, -s * .5); cx.lineTo(s * .1, -s * .45); cx.stroke(); }   // back of hand to brow
    if (opts.tear) { cx.fillStyle = '#7ab8e8'; cx.beginPath(); cx.ellipse(s * .3, s * .1 + opts.tear * s * .3, s * .05, s * .08, 0, 0, 7); cx.fill(); }
    cx.restore();
  }
  function cartouche(x, y, w, h, lines, size = 34, col = P.ink) {
    cx.fillStyle = P.paper; cx.fillRect(x - w / 2, y - h / 2, w, h);
    cx.strokeStyle = P.vermilion; cx.lineWidth = 6; cx.strokeRect(x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10);
    cx.strokeStyle = P.ink; cx.lineWidth = 3; cx.strokeRect(x - w / 2, y - h / 2, w, h);
    cx.font = SERIF(size); cx.fillStyle = col; cx.textAlign = 'center';
    lines.forEach((l, i) => cx.fillText(l, x, y + (i - (lines.length - 1) / 2) * size * 1.15 + size * .35));
  }
  function speedLines(x, y, r0, r1, n, seed) {   // melodramatic zoom lines in ink
    cx.strokeStyle = P.ink; cx.lineWidth = 3;
    for (let i = 0; i < n; i++) { const a = hash(seed + i) * Math.PI * 2, rr0 = r0 + hash(seed + i * 7) * 40; cx.globalAlpha = .55; cx.beginPath(); cx.moveTo(x + Math.cos(a) * rr0, y + Math.sin(a) * rr0); cx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); cx.stroke(); }
    cx.globalAlpha = 1;
  }
  window.Soap = { P, setCtx, paperBg, bokashi, waves, seigaiha, card, portrait, cartouche, speedLines, SERIF, hash };
})();
