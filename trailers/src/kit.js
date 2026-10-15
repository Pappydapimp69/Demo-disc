// Spoof-ad kit shared by the canvas trailers: the loud mobile-ad furniture (title bar, 99% FAIL badge, tapping
// finger, FAIL stamp, PLAY NOW button) and a tiny offline synth for the soundtrack. A film defines
// FILM = { dur, draw(ctx, t), score(ac) }; render.mjs steps draw() per frame and renders score() offline.
const W = 720, H = 1280;
const K = {
  clamp: (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
  ease: x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
  back: x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  seg: (t, a, b) => K.clamp((t - a) / (b - a)),
  rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); },
  circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, 7); ctx.fill(); },
  big(ctx, s, x, y, size, fill, stroke = '#000') {
    ctx.save(); ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size / 6; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y); ctx.restore();
  },
  bar(ctx, title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, 130);
    let fs = 40; ctx.font = `900 ${fs}px system-ui`; while (ctx.measureText(title).width > W - 56 && fs > 20) ctx.font = `900 ${--fs}px system-ui`;
    ctx.fillStyle = '#ffe14a'; ctx.textAlign = 'left'; ctx.fillText(title, 28, 58);
    ctx.font = '800 26px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(sub, 28, 104);
    ctx.save(); ctx.translate(W - 110, 88); ctx.rotate(-.08); ctx.fillStyle = '#ff2a4a'; K.rr(ctx, -80, -24, 160, 48, 12); ctx.fill();
    ctx.font = '900 26px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('99% FAIL', 0, 10); ctx.restore();
  },
  finger(ctx, x, y, press = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-.35); const s = 1.1 * (1 - press * .12); ctx.scale(s, s);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.quadraticCurveTo(0, -8, 8, 0); ctx.lineTo(10, 58); ctx.lineTo(24, 54); ctx.quadraticCurveTo(32, 54, 32, 64); ctx.lineTo(42, 62); ctx.quadraticCurveTo(50, 62, 50, 72);
    ctx.lineTo(58, 72); ctx.quadraticCurveTo(66, 74, 64, 90); ctx.lineTo(60, 128); ctx.quadraticCurveTo(56, 146, 36, 146); ctx.lineTo(4, 146); ctx.quadraticCurveTo(-16, 144, -22, 124);
    ctx.lineTo(-38, 86); ctx.quadraticCurveTo(-42, 74, -30, 72); ctx.lineTo(-10, 90); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  },
  fail(ctx, k, label = 'FAIL') {
    if (k <= 0) return; const s = K.back(K.clamp(k * 3)) * (1.4 - .4 * K.clamp(k * 3));
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-.12); ctx.scale(s, s); ctx.globalAlpha = K.clamp(k * 4);
    ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 12; K.rr(ctx, -210, -80, 420, 160, 20); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    ctx.font = '900 120px Impact, sans-serif'; ctx.fillStyle = '#ff2a4a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 6); ctx.restore();
  },
  play(ctx, t, y = 1080, label = 'PLAY NOW') {
    const p = 1 + Math.sin(t * 8) * .05; ctx.save(); ctx.translate(W / 2, y); ctx.scale(p, p);
    ctx.fillStyle = '#2ad06a'; K.rr(ctx, -220, -60, 440, 120, 60); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.stroke();
    ctx.font = '900 60px Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 4); ctx.restore();
  },
  // ---- offline synth: everything is scheduled up front on an OfflineAudioContext ----
  tone(ac, t, f, d, type = 'square', g = .1, slide = null) {
    const o = ac.createOscillator(), v = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + .005); v.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(v).connect(ac.destination); o.start(t); o.stop(t + d + .02);
  },
  noise(ac, t, d, g = .2, f = 2000, q = 1) {
    const n = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < n; i++) x[i] = ((((i * 1103515245 + 12345) >>> 8) % 2000) / 1000 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), v = ac.createGain(); s.buffer = b; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; v.gain.value = g;
    s.connect(fl).connect(v).connect(ac.destination); s.start(t);
  },
  midi: m => 440 * 2 ** ((m - 69) / 12),
  // fade the end of the ad into its own opening frame so the tile's loop has no seam
  loopFade(ctx, t, a, b, draw) {
    const f = K.seg(t, a, b); if (f <= 0) return;
    const c = K._off || (K._off = Object.assign(document.createElement('canvas'), { width: W, height: H })), o = c.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; draw(o, 0); ctx.save(); ctx.globalAlpha = f; ctx.drawImage(c, 0, 0); ctx.restore();
  },
};
