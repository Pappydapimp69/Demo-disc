// POP IT - playable demo, and a real experiment.
// The ad: a satisfying pop-it fidget board, "only 1% can pop them all". The game: bubbles rise, tap them before
// they float off. Underneath, every round is the same game; what changes is the JUICE: hit-stop, screen shake,
// particles, a pop that climbs in pitch with your combo, squash and stretch. Each round draws juice on or off
// from a shuffled block (both conditions about equally, never in a fixed order), and the player is not told which.
// After a round: one tap for how it felt, then play again or stop. Brain's tension T9 says a headless sim proves
// systems but cannot prove feel; this asks real players whether juice changes what they do (score, accuracy,
// reaction time, whether they come back for another round) or only what they say.
(function () {
  'use strict';
  const { createGame, Audio, Draw, clamp } = Engine;
  const W = 540, H = 960, TOP = 150, ROUND = 30, SPAWN = .36, STOP_TICKS = 3;
  const COLS = ['#ff5a8a', '#ffa23a', '#ffe14a', '#5ad06a', '#4ab8ff', '#a77aff'];
  const Stats0 = (x, cuts) => cuts.find(([lim]) => x < lim)[1];   // a value's band, for anonymous counts
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const lab = Lab.create('popit');
  const S = { state: 'intro', t: 0, lockUntil: 0, round: 0, juice: true, rt: 0, rng: null, fx: null, bubbles: [], parts: [], rings: [], texts: [],
    nextSpawn: 0, score: 0, combo: 0, best: 0, pops: 0, taps: 0, whiffs: 0, escaped: 0, react: [], stop: 0, stopTotal: 0, shake: 0, punch: 0, rating: 0, seed: 0, nid: 0 };
  function pause(s = .5) { S.lockUntil = S.t + s; }
  const paused = () => S.t < S.lockUntil;

  function startRound(seed, juice) {
    S.round++; S.juice = juice !== undefined ? juice : lab.next('juice', ['on', 'off']) === 'on';
    S.seed = seed !== undefined ? seed : Math.floor(Math.random() * 1e9);
    // gameplay and cosmetics draw from separate streams, so juice can never change where bubbles come from
    S.rng = mkRng(S.seed); S.fx = mkRng(S.seed ^ 0x5bd1e995);
    Object.assign(S, { state: 'play', rt: 0, bubbles: [], parts: [], rings: [], texts: [], nextSpawn: .3, score: 0, combo: 0, best: 0, pops: 0, taps: 0, whiffs: 0, escaped: 0, react: [], stop: 0, stopTotal: 0, shake: 0, punch: 0, rating: 0 });
    lab.log('round', { round: S.round, juice: S.juice, seed: S.seed });
    Audio.sfx('start'); pause(.2);
  }
  function spawn() {
    const r = 30 + S.rng() * 20;
    S.bubbles.push({ id: S.nid++, x: r + S.rng() * (W - 2 * r), y: H + r, r, v: 320 + S.rng() * 240 + S.rt * 7, col: COLS[Math.floor(S.rng() * COLS.length)], wob: S.rng() * 6, born: S.rt, seen: null, age: 0 });
  }
  function pop(b) {
    b.gone = true; S.pops++; S.combo++; S.best = Math.max(S.best, S.combo); S.score += 10 * Math.min(5, 1 + Math.floor(S.combo / 5));
    S.react.push(Math.round((S.rt - (b.seen === null ? S.rt : b.seen)) * 1000));
    if (!S.juice) return;
    // the juice: everything below is feedback only and touches no game state the score depends on
    S.stop = STOP_TICKS; S.stopTotal += STOP_TICKS; S.shake = Math.min(14, 6 + S.combo * .6); S.punch = 1;
    for (let i = 0; i < 14; i++) { const a = S.fx() * Math.PI * 2, sp = 150 + S.fx() * 350; S.parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .5 + S.fx() * .3, col: b.col, s: 4 + S.fx() * 6 }); }
    S.rings.push({ x: b.x, y: b.y, r: b.r, life: .3, col: b.col });
    if (S.combo % 5 === 0) S.texts.push({ x: b.x, y: b.y - 40, s: `x${Math.min(5, 1 + Math.floor(S.combo / 5))}!`, life: .8 });
    const f = 520 * 2 ** (Math.min(S.combo, 24) / 12);
    Audio.tone(f, .09, 'sine', .18, f * 1.6); Audio.noise(.05, .12);
  }

  function update(dt) {
    S.t += dt;
    if (S.state !== 'play') return;
    // hit-stop freezes the whole simulation (round clock included), so a juiced round lasts the same game time
    if (S.stop > 0) { S.stop--; return; }
    S.rt += dt;
    S.nextSpawn -= dt; if (S.nextSpawn <= 0) { spawn(); S.nextSpawn = SPAWN * (.6 + S.rng() * .8) * (1 - S.rt / ROUND * .35); }
    for (const b of S.bubbles) {
      b.y -= b.v * dt; b.age += dt;
      if (b.seen === null && b.y < H - b.r) b.seen = S.rt;
      if (b.y < TOP - b.r) { b.gone = true; S.escaped++; S.combo = 0; if (S.juice) { S.shake = 4; Audio.tone(180, .15, 'triangle', .08, 120); } }
    }
    S.bubbles = S.bubbles.filter(b => !b.gone);
    for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0);
    for (const r of S.rings) { r.r += 260 * dt; r.life -= dt; } S.rings = S.rings.filter(r => r.life > 0);
    for (const t of S.texts) { t.y -= 60 * dt; t.life -= dt; } S.texts = S.texts.filter(t => t.life > 0);
    S.shake = Math.max(0, S.shake - dt * 60); S.punch = Math.max(0, S.punch - dt * 5);
    if (API.autopilot) autopilot(dt);
    if (S.rt >= ROUND) endRound();
  }
  function endRound() {
    S.state = 'rate'; Audio.sfx('win');
    const rs = S.react.slice().sort((a, b) => a - b);
    S.result = { round: S.round, juice: S.juice, seed: S.seed, score: S.score, pops: S.pops, taps: S.taps, whiffs: S.whiffs, escaped: S.escaped, best: S.best,
      acc: S.taps ? +(S.pops / S.taps).toFixed(3) : 0, reactMed: rs.length ? rs[Math.floor(rs.length / 2)] : null, stopTicks: S.stopTotal };
    pause(.6);
  }
  function rate(k) {
    if (S.state !== 'rate' || paused()) return;
    S.rating = k; lab.log('result', Object.assign({ rating: k }, S.result)); Audio.sfx('select');
    const j = S.juice ? 'on' : 'off', r = S.result;
    lab.report(`lab-pop-${j}-rate${k}`);
    lab.report(`lab-pop-${j}-score-${Stats0(r.score, [[2000, 'under2k'], [3000, '2-3k'], [4000, '3-4k'], [1e9, '4k-plus']])}`);
    lab.report(`lab-pop-${j}-escaped-${Stats0(r.escaped, [[1, '0'], [6, '1-5'], [16, '6-15'], [31, '16-30'], [1e9, '31-plus']])}`);
    S.state = 'again'; pause(.4);
  }
  function again(yes) {
    if (S.state !== 'again' || paused()) return;
    lab.log('choice', { round: S.round, again: yes, juice: S.juice }); lab.report(`lab-pop-${S.juice ? 'on' : 'off'}-${yes ? 'again' : 'stop'}`);
    if (yes) startRound(); else { S.state = 'end'; pause(.4); }
  }
  function tap(x, y) {
    // every finger counts, hit-stop included (bubbles are frozen in place then), so several fingers at once all land
    if (S.state !== 'play') return;
    S.taps++;
    let best = null, bd = 1e9;
    for (const b of S.bubbles) { if (b.gone) continue; const d = Math.hypot(b.x - x, b.y - y); if (d < b.r + 12 && d < bd) { bd = d; best = b; } }
    if (best) pop(best); else { S.whiffs++; S.combo = 0; }
  }

  // ---------- test autopilot: taps the highest bubble once it has been on screen a human-ish reaction time ----------
  function autopilot() {
    const A = S.ap || (S.ap = { cool: 0 });
    A.cool -= 1 / 60; if (A.cool > 0) return;
    const b = S.bubbles.filter(b => b.seen !== null && S.rt - b.seen > API.reaction).sort((p, q) => p.y - q.y)[0];
    if (b) { tap(b.x, b.y); A.cool = API.reaction * .6; }
  }

  // ---------- drawing ----------
  let ctx;
  const RATE = k => ({ x: 30 + k * 98, y: 520, w: 88, h: 88 });
  const YES = { x: 60, y: 700, w: 200, h: 90 }, NO = { x: 280, y: 700, w: 200, h: 90 }, BIG = { x: 120, y: 760, w: 300, h: 90 };
  function button(b, label, col, size = 28, on = true) {
    ctx.fillStyle = on ? col : '#fff'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 24); ctx.fill(); ctx.strokeStyle = '#2a1a4a'; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = `900 ${size}px system-ui`; ctx.fillStyle = on ? '#fff' : '#2a1a4a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1); ctx.textBaseline = 'alphabetic';
  }
  function text(s, x, y, size, col, weight = 800, maxW = 460) {
    ctx.font = `${weight} ${size}px system-ui`; ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y;
    for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += size * 1.35; } else line = t; }
    ctx.fillText(line, x, yy); return yy;
  }
  function bubble(b) {
    const squash = S.juice ? 1 + Math.sin(b.age * 9 + b.wob) * .06 : 1;
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(squash, 2 - squash);
    ctx.fillStyle = b.col; Draw.circ(ctx, 0, 0, b.r);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; Draw.circ(ctx, 0, b.r * .12, b.r * .72);
    ctx.fillStyle = b.col; Draw.circ(ctx, 0, 0, b.r * .66);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; Draw.circ(ctx, -b.r * .3, -b.r * .32, b.r * .2);
    ctx.restore();
  }
  function hud() {
    ctx.fillStyle = '#2a1a4a'; ctx.fillRect(0, 0, W, TOP - 20);
    Draw.bigText(ctx, 'POP IT!', W / 2, 52, 40, '#ffe14a', '#000');
    const p = 1 + S.punch * .25;
    ctx.save(); ctx.translate(110, 100); ctx.scale(p, p); ctx.font = '900 26px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(S.score), 0, 9); ctx.restore();
    ctx.font = '800 15px system-ui'; ctx.fillStyle = '#c8b8ff'; ctx.textAlign = 'center'; ctx.fillText(S.combo >= 5 ? `COMBO ${S.combo}` : 'SCORE', 110, 72);
    ctx.fillStyle = '#0006'; Draw.rr(ctx, 200, 88, 300, 16, 8); ctx.fill(); ctx.fillStyle = '#ffe14a'; Draw.rr(ctx, 200, 88, 300 * clamp(1 - S.rt / ROUND), 16, 8); ctx.fill();
  }
  function render(c) {
    ctx = c; ctx.fillStyle = '#fff4fb'; ctx.fillRect(0, 0, W, H);
    if (S.state === 'intro') {
      ctx.fillStyle = '#2a1a4a'; ctx.fillRect(0, 0, W, 130); Draw.bigText(ctx, 'POP IT!', W / 2, 64, 48, '#ffe14a', '#000');
      text('THE AD SAID IT WOULD FEEL AMAZING.', W / 2, 210, 24, '#e0306a', 900);
      text('TAP THE BUBBLES BEFORE THEY FLOAT AWAY. ROUNDS ARE 30 SECONDS.', W / 2, 270, 22, '#2a1a4a');
      text('SOME ROUNDS FEEL DIFFERENT FROM OTHERS. AFTER EACH ONE, SAY HOW IT FELT.', W / 2, 360, 20, '#6a5a8a', 700);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = COLS[i]; Draw.circ(ctx, 95 + i * 70, 480, 26); }
      text('THIS GAME IS ALSO A REAL EXPERIMENT ON GAME FEEL. RATINGS AND SCORES ARE SHARED ANONYMOUSLY TO HELP ANSWER IT.', W / 2, 580, 16, '#6a5a8a', 600, 440);
      if (!paused()) button(BIG, 'PLAY', '#e0306a', 34);
      return;
    }
    if (S.state === 'play') {
      ctx.save();
      if (S.shake > 0) ctx.translate((S.fx() - .5) * S.shake, (S.fx() - .5) * S.shake);
      ctx.fillStyle = '#ffe8f4'; ctx.fillRect(-20, TOP - 20, W + 40, 4);
      for (const b of S.bubbles) if (!b.gone) bubble(b);
      for (const r of S.rings) { ctx.globalAlpha = r.life / .3; ctx.strokeStyle = r.col; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
      for (const p of S.parts) { ctx.globalAlpha = clamp(p.life * 2); ctx.fillStyle = p.col; Draw.circ(ctx, p.x, p.y, p.s); }
      ctx.globalAlpha = 1;
      for (const t of S.texts) { ctx.globalAlpha = clamp(t.life * 2); Draw.bigText(ctx, t.s, t.x, t.y, 40, '#fff', '#e0306a'); }
      ctx.globalAlpha = 1; ctx.restore();
      hud();
      return;
    }
    ctx.fillStyle = '#2a1a4a'; ctx.fillRect(0, 0, W, 130); Draw.bigText(ctx, 'POP IT!', W / 2, 64, 48, '#ffe14a', '#000');
    if (S.state === 'rate' || S.state === 'again') {
      Draw.bigText(ctx, String(S.result.score), W / 2, 230, 80, '#e0306a', '#fff');
      text(`${S.result.pops} POPPED · ${S.result.escaped} GOT AWAY · BEST COMBO ${S.result.best}`, W / 2, 310, 18, '#6a5a8a', 700);
      text('HOW DID THAT ROUND FEEL?', W / 2, 460, 26, '#2a1a4a', 900);
      for (let k = 0; k < 5; k++) button(RATE(k), String(k + 1), '#e0306a', 34, S.rating === k + 1);
      ctx.font = '700 14px system-ui'; ctx.fillStyle = '#6a5a8a'; ctx.textAlign = 'left'; ctx.fillText('FLAT', 30, 630); ctx.textAlign = 'right'; ctx.fillText('AMAZING', 510, 630);
      if (S.state === 'again' && !paused()) { button(YES, 'AGAIN', '#e0306a'); button(NO, "I'M DONE", '#6a5a8a'); }
      return;
    }
    if (S.state === 'end') {
      const res = lab.events.filter(e => e.type === 'result');
      text(`${res.length} ROUND${res.length === 1 ? '' : 'S'} PLAYED. THANKS.`, W / 2, 230, 28, '#2a1a4a', 900);
      text('HALF THE ROUNDS HAD THE JUICE (SHAKE, SPARKS, A POP THAT CLIMBS WITH YOUR COMBO) AND HALF DID NOT. THE GAME UNDERNEATH WAS THE SAME.', W / 2, 300, 19, '#6a5a8a', 700);
      text('YOUR RATINGS (SHARED ANONYMOUSLY) HELP ANSWER WHETHER GAME FEEL CHANGES HOW YOU PLAY, OR ONLY HOW IT FEELS.', W / 2, 470, 17, '#6a5a8a', 600);
      if (!paused()) button(BIG, 'PLAY MORE', '#e0306a', 30);
    }
  }

  // ---------- input ----------
  const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function onPointer(type, x, y) {
    if (type !== 'down') return;
    if (S.state === 'play') { tap(x, y); return; }
    if (paused()) return;
    if (S.state === 'intro' && hit(BIG, x, y)) startRound();
    else if (S.state === 'rate') { for (let k = 0; k < 5; k++) if (hit(RATE(k), x, y)) rate(k + 1); }
    else if (S.state === 'again') { if (hit(YES, x, y)) again(true); else if (hit(NO, x, y)) again(false); }
    else if (S.state === 'end' && hit(BIG, x, y)) startRound();
  }
  function onKey(key, down) {
    if (!down || paused()) return;
    if (S.state === 'intro' && (key === 'Enter' || key === ' ')) startRound();
    else if (S.state === 'rate' && key >= '1' && key <= '5') rate(+key);
    else if (S.state === 'again' && (key === 'Enter' || key === 'y' || key === 'Y')) again(true);
    else if (S.state === 'again' && (key === 'n' || key === 'N' || key === 'Backspace')) again(false);
    else if (S.state === 'end' && (key === 'Enter' || key === ' ')) startRound();
  }
  // leaving mid-round or on a result screen is itself a choice to stop
  window.addEventListener('pagehide', () => { if (S.state === 'play' || S.state === 'rate' || S.state === 'again') lab.log('left', { round: S.round, state: S.state, rt: +S.rt.toFixed(1) }); });

  const API = { S, lab, ROUND, startRound, tap, rate, again, autopilot: false, reaction: .45, step: n => game.step(n), get state() { return S.state; } };
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  pause(.6);
  Audio.unlock();
  window.__game = API;
})();
