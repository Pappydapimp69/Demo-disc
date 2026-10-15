// IQ TEST 2026 spoof ad: the brain-training lie. Ten cards flash, the player taps them wrong (FAIL, IQ 62),
// tries again and taps them all (IQ climbs to 160, GENIUS), "just 10 minutes a day", then the held call to action
// that fades back into the opening frame so the tile loops.
const SYM = ['△', '◯', '☐', '✕', '☆', '♢', '⬡', '✚', '◐', '☾'];
const CARD = i => ({ x: 70 + (i % 5) * 120, y: 470 + Math.floor(i / 5) * 170, w: 100, h: 140 });
// the order the finger taps the cards, and whether each tap is right; first try goes wrong on the 4th tap
const TRY1 = [0, 6, 2, 9], TRY2 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const T1 = 4.0, T2 = 10.2, DT1 = .75, DT2 = .42, GEN = T2 + TRY2.length * DT2 + .2;
function iqAt(t) {
  if (t < T1 + 3 * DT1 + .3) return 100;
  if (t < T2) return 62;
  return Math.round(62 + (160 - 62) * K.ease(K.seg(t, T2, GEN)));
}
function bg(ctx, t, hue) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `hsl(${hue},70%,22%)`); g.addColorStop(1, `hsl(${hue + 40},70%,12%)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = .08; ctx.fillStyle = '#fff'; for (let i = 0; i < 30; i++) { const x = (i * 137 + t * 30) % W, y = (i * 263) % H; K.circ(ctx, x, y, 3 + (i % 4)); } ctx.globalAlpha = 1;
}
function brain(ctx, x, y, s, glow) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (glow) { const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 160); g.addColorStop(0, `rgba(255,225,74,${glow})`); g.addColorStop(1, 'rgba(255,225,74,0)'); ctx.fillStyle = g; K.circ(ctx, 0, 0, 160); }
  ctx.fillStyle = '#ff8ab0'; ctx.strokeStyle = '#a0305a'; ctx.lineWidth = 6;
  for (const [cx, cy, r] of [[-40, -20, 46], [0, -40, 50], [40, -20, 46], [-30, 22, 44], [30, 22, 44]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, -80); ctx.bezierCurveTo(-10, -40, 10, 0, 0, 60); ctx.stroke(); ctx.restore();
}
function cards(ctx, t, faceUp, marks) {
  for (let i = 0; i < 10; i++) {
    const c = CARD(i), up = faceUp(i), sx = Math.abs(Math.cos(up * Math.PI));
    ctx.save(); ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(sx, 1);
    const front = up > .5; ctx.fillStyle = front ? '#fff' : '#5a3aff'; K.rr(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 14); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    if (front) { ctx.font = '700 64px system-ui'; ctx.fillStyle = '#1a2340'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SYM[i], 0, 4); }
    else { ctx.font = '900 54px Impact, sans-serif'; ctx.fillStyle = '#ffe14a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 4); }
    ctx.restore();
    const m = marks[i]; if (m) { ctx.strokeStyle = m === 'ok' ? '#2ad06a' : '#ff2a4a'; ctx.lineWidth = 8; K.rr(ctx, c.x - 6, c.y - 6, c.w + 12, c.h + 12, 18); ctx.stroke(); }
  }
}
function tapState(t, t0, seq, dt, wrongAt) {
  const marks = {}; let fx = null, fy = null, press = 0;
  for (let k = 0; k < seq.length; k++) {
    const tk = t0 + k * dt; if (t < tk - dt) break;
    const c = CARD(seq[k]), prev = k ? CARD(seq[k - 1]) : { x: 360, y: 1100, w: 0, h: 0 };
    const m = K.ease(K.seg(t, tk - dt * .8, tk - dt * .2));
    fx = prev.x + prev.w / 2 + (c.x + c.w / 2 - prev.x - prev.w / 2) * m; fy = prev.y + prev.h * .6 + (c.y + c.h * .6 - prev.y - prev.h * .6) * m;
    if (t >= tk) { marks[seq[k]] = k === wrongAt ? 'bad' : 'ok'; press = K.clamp(1 - (t - tk) / .15); }
  }
  return { marks, fx, fy, press };
}
const FILM = {
  dur: 25,
  draw(ctx, t) {
    if (t < 20.6) {
      bg(ctx, t, 250);
      const iq = iqAt(t);
      K.bar(ctx, 'ONLY GENIUSES REMEMBER ALL 10!', `IQ ${iq}`);
      brain(ctx, 360, 290, 1.1 + (t > T2 ? .25 * K.seg(t, T2, GEN) : 0), t > T2 ? K.seg(t, T2, GEN) * .9 : 0);
      ctx.font = '900 30px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      if (t < 2.8) ctx.fillText('MEMORISE THE CARDS!', 360, 430);
      else if (t < T2) ctx.fillText('NOW TAP THEM IN ORDER!', 360, 430);
      else ctx.fillText(t < GEN ? 'FASTER!!' : 'GENIUS!!!', 360, 430);
      // flash face up 0.4-2.6 s, hide, reveal as tapped
      let st = { marks: {}, fx: null };
      if (t >= T1 - DT1 && t < T2 - 1.2) st = tapState(t, T1, TRY1, DT1, 3);
      else if (t >= T2 - DT2) st = tapState(t, T2, TRY2, DT2, -1);
      const shown = i => t < 3 ? K.clamp((t - .3 - i * .05) * 3) * (1 - K.clamp((t - 2.6) * 3)) : st.marks[i] ? 1 : 0;
      cards(ctx, t, shown, st.marks);
      if (st.fx !== null && t < GEN + .2) K.finger(ctx, st.fx, st.fy, st.press);
      K.fail(ctx, t > T1 + 3 * DT1 && t < T2 - .8 ? (t - T1 - 3 * DT1) : 0);
      if (t > T1 + 3 * DT1 + .2 && t < T2 - .8) { ctx.font = '900 34px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('YOUR IQ: 62', 360, 900); }
      // genius: confetti and a big IQ
      if (t > GEN) {
        const k = t - GEN;
        for (let i = 0; i < 80; i++) { const x = (i * 97) % W, y = ((i * 53) % 300) + k * (300 + (i % 7) * 60) - 100; ctx.fillStyle = `hsl(${i * 47},90%,60%)`; ctx.fillRect(x, y, 12, 18); }
        const s = K.back(K.clamp(k * 2)); ctx.save(); ctx.translate(360, 1110); ctx.scale(s, s); K.big(ctx, 'IQ 160', 0, 0, 110, '#ffe14a'); ctx.restore();
      }
      if (t > 16.4) { // "just 10 minutes a day" over a certificate
        const k = K.seg(t, 16.4, 16.9); ctx.globalAlpha = k; ctx.fillStyle = 'rgba(10,6,30,.82)'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(360, 640); ctx.rotate(-.04); ctx.scale(k, k);
        ctx.fillStyle = '#fff8e0'; K.rr(ctx, -260, -200, 520, 400, 16); ctx.fill(); ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 10; ctx.stroke();
        ctx.font = '900 40px Georgia, serif'; ctx.fillStyle = '#7a5a10'; ctx.textAlign = 'center'; ctx.fillText('CERTIFIED', 0, -110); ctx.fillText('GENIUS', 0, -60);
        brain(ctx, 0, 70, .7, .6); ctx.restore();
        K.big(ctx, 'JUST 10 MINUTES', 360, 300, 72, '#fff'); K.big(ctx, 'A DAY!', 360, 380, 72, '#ffe14a');
        if (t > 18) { ctx.font = '800 28px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('★★★★★  "I FEEL SMARTER ALREADY"', 360, 1000); }
      }
    } else {
      // held call to action, fading into the opening frame for the loop
      bg(ctx, t, 250); brain(ctx, 360, 420, 1.6, .7 + .2 * Math.sin(t * 5));
      K.big(ctx, 'IQ TEST', 360, 700, 120, '#ffe14a'); K.big(ctx, '2026', 360, 820, 100, '#fff');
      ctx.font = '800 30px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('ARE YOU IN THE TOP 1%?', 360, 920);
      K.play(ctx, t);
      K.loopFade(ctx, t, 24.3, 25, (c, t0) => FILM.draw(c, t0));
    }
  },
  score(ac) {
    const bpm = 128, beat = 60 / bpm, prog = [57, 53, 60, 55];
    for (let b = 0; b * beat < 24.5; b++) {
      const t = b * beat, root = prog[Math.floor(b / 4) % 4], loud = t > T2 ? .07 : .05;
      if (t > T1 + 3 * DT1 && t < T2 - .3) { if (b % 2 === 0) K.tone(ac, t, K.midi(root - 12), beat * .9, 'triangle', .06); continue; } // the fail: music drops out
      K.noise(ac, t, .08, .25, 120, .7); if (b % 2) K.noise(ac, t, .1, .12, 3000, 1);
      for (let k = 0; k < 4; k++) K.tone(ac, t + k * beat / 4, K.midi(root + [0, 4, 7, 12][k] + (t > 20.6 ? 12 : 0)), beat / 4, 'square', loud * .6);
      K.tone(ac, t, K.midi(root - 24), beat * .9, 'sawtooth', .05);
    }
    for (let i = 0; i < 10; i++) K.tone(ac, .3 + i * .05, 900 + i * 60, .05, 'square', .05);           // cards flash up
    TRY1.forEach((_, k) => k < 3 ? K.tone(ac, T1 + k * DT1, 1200, .08, 'square', .08) : 0);
    [392, 370, 349, 330].forEach((f, i) => K.tone(ac, T1 + 3 * DT1 + i * .26, f / 2, i < 3 ? .24 : .6, 'sawtooth', .12));
    TRY2.forEach((_, k) => K.tone(ac, T2 + k * DT2, K.midi(72 + k), .09, 'square', .08));
    [523, 659, 784, 1047].forEach((f, i) => K.tone(ac, GEN + i * .12, f, i < 3 ? .14 : .6, 'square', .1));
    K.noise(ac, GEN, .8, .2, 5000, .5);
  },
};
