// VEER - playable demo.
// The ad is a bright draw-the-path puzzle. The game is a foggy walk you play by ear: you and a friend got
// separated, and all you can do is walk, whistle, and listen for the answer.
// Two real effects run it. Heading noise: with no sun to steer by, your heading drifts and you walk in
// circles without noticing (the camera turns with you, so it never looks like turning). Forest sound: a
// whistle carries over a kilometre in the open but only 150-500 m under trees, so clearings carry it.
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const W = 540, H = 960, CELL = 20, PXM = 5;          // 5 px per metre
  const SPEED = 3.6, TURN = 1.6, NOISE = .22;          // m/s, rad/s, heading noise (rad per sqrt(s)) while walking
  const SRC = 100, AIR = 1, SND = 343, REACT = .7;     // whistle dB at 1 m, air loss dB/100 m, m/s, friend reaction s
  const FOUND = 9;                                     // metres: close enough to see them in the fog
  const PX = W / 2, PY = 640;                          // the player sits low on screen, looking up the screen

  // ---------- levels (metres, origin top-left; att = forest excess attenuation in dB per 100 m) ----------
  const LEVELS = [
    { name: 'THE MEADOW', tip: 'TAP THE WHISTLE. LISTEN. WALK TOWARD THE ANSWER.', size: [500, 500], base: 0, sky: 'sun', sunAz: 2.4, vis: 70, time: 240,
      start: [250, 440], friend: [300, 120], blobs: [{ x: 60, y: 80, r: 90, att: 10 }, { x: 470, y: 300, r: 80, att: 10 }] },
    { name: 'THE TREE LINE', tip: 'UNDER TREES A WHISTLE DIES FAST. KEEP WHISTLING.', size: [600, 600], base: 0, sky: 'sun', sunAz: 2.0, vis: 60, time: 360,
      start: [300, 540], friend: [340, 150], blobs: [{ x: 300, y: 130, r: 250, att: 14 }] },
    { name: 'OVERCAST', tip: 'NO SUN. YOU WILL DRIFT AND NOT FEEL IT. WHISTLE OFTEN.', size: [700, 700], base: 0, sky: 'overcast', vis: 50, time: 360,
      start: [350, 640], friend: [240, 170], blobs: [{ x: 150, y: 400, r: 60, att: 8 }, { x: 560, y: 300, r: 70, att: 8 }, { x: 420, y: 120, r: 50, att: 8 }] },
    { name: 'DEEP WOODS', tip: 'THE TREES SWALLOW SOUND. FIND A CLEARING, THEN WHISTLE.', size: [800, 800], base: 23, sky: 'overcast', vis: 40, time: 420,
      start: [400, 730], friend: [560, 200], clearings: [{ x: 400, y: 430, r: 115 }, { x: 560, y: 200, r: 70 }] },
    { name: 'THE RIVER', tip: 'THE RIVER DROWNS EVERYTHING OUT. FIND THE BRIDGE.', size: [700, 700], base: 0, sky: 'sun', sunAz: 1.2, vis: 55, time: 420,
      start: [200, 610], friend: [230, 130], river: { y: 330, h: 30, bx: 560, bw: 16 }, blobs: [{ x: 600, y: 560, r: 110, att: 8 }, { x: 80, y: 220, r: 90, att: 8 }] },
    { name: 'THE WANDERER', tip: 'THEY ARE WALKING TOO. ONCE THEY HEAR YOU, THEY STAY PUT.', size: [800, 800], base: 8, sky: 'overcast', vis: 45, time: 480,
      start: [200, 660], friend: [600, 220], wander: true, clearings: [{ x: 330, y: 420, r: 80 }, { x: 600, y: 220, r: 60 }, { x: 640, y: 560, r: 70 }] },
    { name: 'NIGHTFALL', tip: 'LAST LIGHT. EVERY CUE AT ONCE. TRUST THE WHISTLE.', size: [900, 900], base: 15, sky: 'night', vis: 28, time: 560,
      start: [200, 800], friend: [700, 150], clearings: [{ x: 300, y: 560, r: 90 }, { x: 520, y: 380, r: 80 }, { x: 700, y: 150, r: 60 }, { x: 760, y: 620, r: 70 }] },
  ];

  // ---------- deterministic noise ----------
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const hash = (a, b, s = 0) => { let h = Math.imul(a * 374761393 + b * 668265263 + s * 2147483647, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const gauss = r => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // ---------- the map: a grid of forest attenuation, plus the river ----------
  function buildMap(L) {
    const cw = Math.ceil(L.size[0] / CELL), ch = Math.ceil(L.size[1] / CELL), att = new Float32Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = (i + .5) * CELL, y = (j + .5) * CELL, jit = (hash(i, j, 7) - .5) * 30;
      let a = L.base;
      for (const b of L.blobs || []) if (Math.hypot(x - b.x, y - b.y) < b.r + jit) a = b.att;
      for (const c of L.clearings || []) if (Math.hypot(x - c.x, y - c.y) < c.r + jit) a = 0;
      att[j * cw + i] = a;
    }
    return { cw, ch, att };
  }
  const attAt = (x, y) => { const M = S.map, i = Math.floor(x / CELL), j = Math.floor(y / CELL); return i < 0 || j < 0 || i >= M.cw || j >= M.ch ? 30 : M.att[j * M.cw + i]; };
  const inRiver = (x, y) => { const R = S.L.river; return R && y > R.y && y < R.y + R.h && Math.abs(x - R.bx) > R.bw / 2; };
  // background noise: a quiet 20 dB, but a river roars over everything near it
  const bgAt = (x, y) => { const R = S.L.river; if (!R) return 20; const d = y < R.y ? R.y - y : y > R.y + R.h ? y - R.y - R.h : 0; return 20 + 32 * Math.exp(-d / 45); };

  // ---------- sound propagation: spreading + air + the forest's linear excess loss ----------
  function forestLoss(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 5)); let loss = 0;
    for (let k = 0; k < n; k++) { const q = (k + .5) / n; loss += attAt(ax + (bx - ax) * q, ay + (by - ay) * q) * (d / n) / 100; }
    return loss;
  }
  function levelAt(ax, ay, bx, by) {
    const d = Math.max(1, Math.hypot(bx - ax, by - ay)), f = forestLoss(ax, ay, bx, by);
    return { L: SRC - 20 * Math.log10(d) - AIR * d / 100 - f, d, forest: f };
  }

  // ---------- state ----------
  const S = { li: 0, L: null, map: null, state: 'intro', t: 0, lt: 0, lockUntil: 0, x: 0, y: 0, th: 0, walking: false, turn: 0,
    rng: null, light: 1, trail: [], events: [], cues: [], friend: null, myWhistles: 0, walked: 0, stepT: 0, nextCall: 0, winT: 0, ap: null };
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, map: buildMap(L), state: 'intro', lt: 0, x: L.start[0], y: L.start[1], th: -Math.PI / 2, walking: false, turn: 0,
      rng: mkRng(1000 + i * 77), light: 1, trail: [], events: [], cues: [], myWhistles: 0, walked: 0, stepT: 0, nextCall: 18, winT: 0, ap: null, timeLeft: L.time,
      friend: { x: L.friend[0], y: L.friend[1], th: 1.3, stay: !L.wander, said: null, saidT: 0 } });
    pause();
  }
  function pause() { S.lockUntil = S.t + .6; S.walking = false; S.turn = 0; }
  const paused = () => S.t < S.lockUntil;
  const skyVisible = () => S.L.sky === 'sun' && attAt(S.x, S.y) < 8;   // canopy hides the sun

  // ---------- whistles ----------
  function whistle() {
    if (S.state !== 'play' || S.t - (S.lastWhistle || -9) < 1.2) return;
    S.lastWhistle = S.t; S.myWhistles++; Snd.mine();
    // does the friend hear it? (same physics both ways, against the noise where they stand)
    const h = levelAt(S.x, S.y, S.friend.x, S.friend.y);
    if (h.L > bgAt(S.friend.x, S.friend.y)) {
      if (S.L.wander && !S.friend.stay) { S.friend.stay = true; S.friend.said = "I hear you! I'll stay put!"; S.friend.saidT = S.t + h.d / SND; }
      S.events.push({ at: S.t + h.d / SND + REACT, kind: 'reply', fx: S.friend.x, fy: S.friend.y });
    }
  }
  // the friend's sound leaves them at `at`; it reaches you after travelling, if it is loud enough where you are then
  function emit(fx, fy) {
    const h = levelAt(fx, fy, S.x, S.y), bg = bgAt(S.x, S.y), q = clamp((h.L - bg) / 30);
    if (h.L <= bg) { S.cues.push({ t: S.t, missed: true }); return null; }
    const abs = Math.atan2(fy - S.y, fx - S.x), rel = wrap(abs - S.th);
    const cue = { t: S.t, rel, q, width: .18 + (1 - q) * 1.1, forest: h.forest, d: h.d };
    S.cues.push(cue); Snd.theirs(rel, q, h.forest);
    return cue;
  }
  function processEvents() {
    for (const e of S.events) {
      if (e.done || S.t < e.at) continue;
      if (e.kind === 'reply' || e.kind === 'call') {   // the sound leaves the friend now; schedule its arrival
        const d = Math.hypot(e.fx - S.x, e.fy - S.y); e.done = true;
        S.events.push({ at: S.t + d / SND, kind: 'arrive', fx: e.fx, fy: e.fy, src: e.kind });
      } else if (e.kind === 'arrive') { e.done = true; S.lastCue = emit(e.fx, e.fy); S.lastCue && (S.lastCue.src = e.src); }
    }
    S.events = S.events.filter(e => !e.done);
  }

  // ---------- update ----------
  function move(dt) {
    if (API.autopilot) autopilot(dt);
    S.th = wrap(S.th + S.turn * TURN * dt);
    if (!S.walking) return;
    // heading noise: the drift you can't feel
    S.th = wrap(S.th + NOISE * Math.sqrt(dt) * gauss(S.rng));
    const nx = S.x + Math.cos(S.th) * SPEED * dt, ny = S.y + Math.sin(S.th) * SPEED * dt;
    const [mw, mh] = S.L.size;
    if (nx < 4 || ny < 4 || nx > mw - 4 || ny > mh - 4 || inRiver(nx, ny)) { S.bump = S.t; return; }
    S.walked += Math.hypot(nx - S.x, ny - S.y); S.x = nx; S.y = ny;
    const last = S.trail[S.trail.length - 1];
    if (!last || Math.hypot(last[0] - S.x, last[1] - S.y) > 2.5) S.trail.push([S.x, S.y, S.t]);
    S.stepT -= dt; if (S.stepT <= 0) { Snd.step(attAt(S.x, S.y)); S.stepT = .42; }
  }
  function friendUpdate(dt) {
    const F = S.friend;
    if (!F.stay) {   // the wanderer drifts too
      F.th = wrap(F.th + NOISE * Math.sqrt(dt) * gauss(S.rng));
      const nx = F.x + Math.cos(F.th) * 1.1 * dt, ny = F.y + Math.sin(F.th) * 1.1 * dt;
      if (nx < 20 || ny < 20 || nx > S.L.size[0] - 20 || ny > S.L.size[1] - 20 || inRiver(nx, ny)) F.th += Math.PI / 2; else { F.x = nx; F.y = ny; }
    }
    // a lost person calls out now and then
    if (S.t - S.lt0 > S.nextCall) { S.nextCall += 22; S.events.push({ at: S.t, kind: 'call', fx: F.x, fy: F.y }); }
  }
  function update(dt) {
    S.t += dt; S.lt += dt;
    Snd.ambience(S.state === 'play' ? attAt(S.x, S.y) : 0, S.state === 'play' ? bgAt(S.x, S.y) : 20);
    if (S.state === 'win') { S.winT += dt; return; }
    if (S.state === 'intro') { if (API.autopilot && !paused()) start(); return; }
    if (S.state !== 'play') return;
    S.timeLeft -= dt; S.light = clamp(S.timeLeft / 60, .25, 1);
    move(dt); friendUpdate(dt); processEvents();
    if (Math.hypot(S.friend.x - S.x, S.friend.y - S.y) < FOUND) { S.state = 'win'; S.winT = 0; S.walking = false; Snd.found(); pause(); }
    else if (S.timeLeft <= 0) { S.state = 'dark'; S.walking = false; Audio.sfx('fail'); pause(); }
  }
  function start() { S.state = 'play'; S.lt0 = S.t; S.lastWhistle = -9; pause(); }

  // ---------- test autopilot: it only knows what a player knows ----------
  // policy 'home': whistle, turn to where the answer came from, walk a stretch, repeat; if nothing answers, keep going.
  // policy 'clearing': same, but when nothing answers it heads for the nearest open ground first (it knows the map,
  // like a player who has spotted the light of a clearing). policy 'straight': walk and never whistle.
  // Without the sun it steers by its own turn commands only, so it drifts exactly like a player does.
  function autopilot(dt) {
    const A = S.ap || (S.ap = { phase: 'whistle', wait: 0, walk: 0, believed: S.th, tried: new Set() });
    const pol = API.autopilot, sky = skyVisible();
    if (sky) A.believed = S.th;                       // the sun shows the true heading
    const steerTo = target => { const err = wrap(target - A.believed); S.turn = clamp(err * 3, -1, 1); A.believed = wrap(A.believed + S.turn * TURN * dt); };
    if (pol === 'straight') { S.walking = true; S.turn = 0; return; }
    // any answer or call heard mid-walk re-aims us, like a player who hears it
    if (A.phase === 'walk' && S.lastCue && S.lastCue !== A.used) { A.phase = 'listen'; A.wait = 0; }
    if (A.phase === 'whistle') { S.walking = false; S.turn = 0; S.lastCue = null; whistle(); A.phase = 'listen'; A.wait = 0; return; }
    if (A.phase === 'listen') {
      A.wait += dt; S.walking = false;
      if (S.lastCue) {   // aim at the middle of what we heard, give or take how vague it was
        const c = S.lastCue, err = (S.rng() - .5) * c.width; A.used = c; S.lastCue = null;
        A.target = wrap(A.believed + c.rel + err); A.walk = 30 + (1 - c.q) * 110; A.phase = 'turn'; return;   // loud = close: take a shorter stretch
      }
      if (A.wait > 6.5) {
        if (pol === 'clearing') {
          let best = null;
          for (const c of S.L.clearings || []) { const k = c.x + ',' + c.y; if (A.tried.has(k)) continue; const d = Math.hypot(c.x - S.x, c.y - S.y); if (d > c.r * .6 && (!best || d < best.d)) best = { c, d, k }; }
          if (best && attAt(S.x, S.y) > 0) { A.tried.add(best.k); A.target = wrap(A.believed + wrap(Math.atan2(best.c.y - S.y, best.c.x - S.x) - S.th)); A.walk = best.d; A.phase = 'turn'; return; }
        }
        A.target = A.believed; A.walk = 80; A.phase = 'turn';
      }
      return;
    }
    if (A.phase === 'turn') { S.walking = false; steerTo(A.target); if (Math.abs(wrap(A.target - A.believed)) < .05) { S.turn = 0; A.phase = 'walk'; A.from = [S.x, S.y]; } return; }
    if (A.phase === 'walk') {
      S.walking = true; steerTo(A.target);
      const gone = Math.hypot(S.x - A.from[0], S.y - A.from[1]);
      if (S.bump && S.t - S.bump < .1) {
        const R = S.L.river;
        if (R && Math.abs(S.y - (R.y + R.h / 2)) < R.h + 6) {   // at the river: follow the bank to the bridge, then cross
          A.target = wrap(A.believed + wrap(Math.atan2(0, R.bx - S.x) - S.th)); A.from = [S.x, S.y]; A.walk = Math.abs(R.bx - S.x); A.cross = S.y > R.y ? -1 : 1;
        } else { A.target = wrap(A.target + 1.2); A.from = [S.x, S.y]; A.walk = 30; }   // the map edge: slide along
      }
      if (A.cross && gone >= A.walk) { A.target = wrap(A.believed + wrap(Math.atan2(A.cross, 0) - S.th)); A.from = [S.x, S.y]; A.walk = 70; A.cross = 0; return; }
      if (gone >= A.walk) A.phase = 'whistle';
    }
  }

  // ---------- sound ----------
  const Snd = {
    amb: null,
    ctx() { return Audio.ctx && !Audio.muted ? Audio.ctx : null; },
    mine() {   // your whistle: a quick rising two-note
      const c = this.ctx(); if (!c) return; const t = c.currentTime;
      [[1900, 2500, 0], [2200, 2700, .2]].forEach(([a, b, d]) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(a, t + d); o.frequency.exponentialRampToValueAtTime(b, t + d + .16); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.16, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .2); o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + .25); });
    },
    // their whistle: panned to where it came from, quieter with distance, duller through trees and from behind
    theirs(rel, q, forest) {
      const c = this.ctx(); if (!c) return; const t = c.currentTime;
      const p = c.createStereoPanner ? c.createStereoPanner() : null, f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = Math.max(600, 9000 * (Math.abs(rel) > Math.PI / 2 ? .28 : 1) * Math.max(.2, 1 - forest / 70));
      g.gain.value = .03 + .3 * q * q;
      if (p) { p.pan.value = clamp(Math.sin(rel), -1, 1); f.connect(g).connect(p).connect(c.destination); } else f.connect(g).connect(c.destination);
      [[2600, 2000, 0], [2000, 2600, .32]].forEach(([a, b, d]) => { const o = c.createOscillator(), e = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(a, t + d); o.frequency.exponentialRampToValueAtTime(b, t + d + .26); e.gain.setValueAtTime(0, t + d); e.gain.linearRampToValueAtTime(1, t + d + .03); e.gain.exponentialRampToValueAtTime(.0001, t + d + .3); o.connect(e).connect(f); o.start(t + d); o.stop(t + d + .35); });
    },
    step(att) {   // grass swish in the open, twig crunch under trees
      const c = this.ctx(); if (!c) return; const t = c.currentTime, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      n.buffer = this.noise(c); f.type = 'bandpass'; f.frequency.value = att > 5 ? 1800 + S.rng() * 1500 : 900 + S.rng() * 400; f.Q.value = att > 5 ? 2.5 : .8;
      g.gain.setValueAtTime(att > 5 ? .22 : .12, t); g.gain.exponentialRampToValueAtTime(.0001, t + (att > 5 ? .07 : .14));
      n.connect(f).connect(g).connect(c.destination); n.start(t, S.rng()); n.stop(t + .16);
    },
    noise(c) { if (!this.nb) { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = ((((i * 1103515245 + 12345) >>> 8) % 2000) / 1000 - 1); this.nb = b; } return this.nb; },
    ambience(att, bg) {   // wind in the open, hush under trees, and the river's roar
      const c = this.ctx(); if (!c) return;
      try {
        if (!this.amb) {
          const mk = (type, fr) => { const s = c.createBufferSource(); s.buffer = this.noise(c); s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = fr; const g = c.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(c.destination); s.start(); return g; };
          this.amb = { wind: mk('lowpass', 500), river: mk('bandpass', 1200) };
        }
        const t = c.currentTime;
        this.amb.wind.gain.setTargetAtTime(S.state === 'play' ? .05 + .06 * (1 - clamp(att / 20)) : .02, t, .4);
        this.amb.river.gain.setTargetAtTime(S.state === 'play' ? clamp((bg - 22) / 30) * .35 : 0, t, .3);
      } catch (_) {}
    },
    found() { const c = this.ctx(); if (!c) return; [72, 76, 79, 84].forEach((m, i) => Audio.tone(440 * 2 ** ((m - 69) / 12), .5, 'sine', .14, null, i * .12)); },
  };

  // ---------- drawing ----------
  let ctx;
  const FOG = { sun: '#dfe8d8', overcast: '#c8ccd0', night: '#0a1020' };
  function world() {
    const L = S.L, vis = L.vis, R = vis + CELL * 2;
    ctx.save(); ctx.translate(PX, PY); ctx.rotate(-Math.PI / 2 - S.th); ctx.scale(PXM, PXM); ctx.translate(-S.x, -S.y);
    const i0 = Math.max(0, Math.floor((S.x - R) / CELL)), i1 = Math.min(S.map.cw - 1, Math.floor((S.x + R) / CELL));
    const j0 = Math.max(0, Math.floor((S.y - R) / CELL)), j1 = Math.min(S.map.ch - 1, Math.floor((S.y + R) / CELL));
    const night = L.sky === 'night';
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = S.map.att[j * S.map.cw + i], k = clamp(a / 23);
      ctx.fillStyle = night ? `hsl(${130 - k * 10}, 25%, ${16 - k * 6}%)` : `hsl(${100 - k * 10}, ${45 - k * 10}%, ${52 - k * 22}%)`;
      ctx.fillRect(i * CELL - .3, j * CELL - .3, CELL + .6, CELL + .6);
      // grass tufts in the open
      if (a < 5) { ctx.fillStyle = night ? '#ffffff10' : '#ffffff22'; for (let n = 0; n < 4; n++) ctx.fillRect(i * CELL + hash(i, j, n) * CELL, j * CELL + hash(j, i, n) * CELL, .6, 1.4); }
    }
    if (L.river) { const Rv = L.river; ctx.fillStyle = night ? '#1a3a5a' : '#4a90d0'; ctx.fillRect(0, Rv.y, L.size[0], Rv.h); ctx.fillStyle = '#ffffff33'; for (let k = 0; k < 40; k++) ctx.fillRect(((k * 53 + S.t * 9) % L.size[0]), Rv.y + 4 + (k % 4) * 6, 6, .8); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(Rv.bx - Rv.bw / 2, Rv.y - 2, Rv.bw, Rv.h + 4); }
    // footprints: the trail you left (look back and see the curve)
    for (const [x, y, t] of S.trail) { const age = S.t - t; if (age > 120 || Math.hypot(x - S.x, y - S.y) > R) continue; ctx.fillStyle = `rgba(40,30,20,${.35 * (1 - age / 120)})`; ctx.fillRect(x - .4, y - .4, .8, .8); }
    // trees: low-poly crowns, more of them where the forest is thicker
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = S.map.att[j * S.map.cw + i], n = a <= 0 ? (hash(i, j, 3) < .06 ? 1 : 0) : Math.round(1 + a / 4);
      for (let k = 0; k < n; k++) {
        const x = i * CELL + hash(i, j, 10 + k) * CELL, y = j * CELL + hash(i, j, 20 + k) * CELL, r = 2.2 + hash(i, j, 30 + k) * 2.2;
        if (Math.hypot(x - S.x, y - S.y) > R) continue;
        ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.arc(x + .8, y + .8, r, 0, 7); ctx.fill();
        ctx.fillStyle = night ? '#16301e' : ['#2a6a32', '#30783a', '#245a2c'][k % 3]; ctx.beginPath(); for (let s = 0; s < 6; s++) { const an = s / 6 * 6.28 + hash(i, j, k); ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); } ctx.fill();
        ctx.fillStyle = night ? '#1e3a26' : '#3a8a44'; ctx.beginPath(); for (let s = 0; s < 6; s++) { const an = s / 6 * 6.28 + hash(i, j, k); ctx.lineTo(x - r * .25 + Math.cos(an) * r * .55, y - r * .25 + Math.sin(an) * r * .55); } ctx.fill();
      }
    }
    // the friend, if the fog lets you see them
    const F = S.friend;
    if (Math.hypot(F.x - S.x, F.y - S.y) < vis) person(F.x, F.y, '#e04a4a', S.t * 3);
    ctx.restore();
  }
  function person(x, y, col, w) {
    ctx.save(); ctx.translate(x, y); ctx.scale(2.6, 2.6); ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.arc(.3, .3, 1.1, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 1.1, .8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#f2c79a'; ctx.beginPath(); ctx.arc(0, 0, .5, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = .35; ctx.beginPath(); ctx.moveTo(.6, 0); ctx.lineTo(1.4, -.8 + Math.sin(w) * .4); ctx.stroke(); ctx.restore();
  }
  function fog() {
    const L = S.L, r1 = L.vis * PXM, col = FOG[L.sky], dark = 1 - S.light;
    const g = ctx.createRadialGradient(PX, PY, r1 * .45, PX, PY, r1);
    g.addColorStop(0, col + '00'); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.moveTo(PX + r1, PY); ctx.arc(PX, PY, r1, 0, Math.PI * 2); ctx.fill('evenodd');
    if (dark > 0) { ctx.fillStyle = `rgba(10,15,40,${dark * .6})`; ctx.fillRect(0, 0, W, H); }
  }
  function me() {
    ctx.save(); ctx.translate(PX, PY); ctx.scale(PXM, PXM); ctx.rotate(-Math.PI / 2);
    person(0, 0, '#3a7ae0', S.walking ? S.t * 9 : 0); ctx.restore();
  }
  // what you heard, drawn as a ring segment: wide and faint when it was far or muffled
  function cues() {
    for (const c of S.cues) {
      const age = S.t - c.t; if (age > 3) continue;
      if (c.missed) continue;
      const k = 1 - age / 3, a = c.rel - Math.PI / 2, rad = 150 + age * 30;
      ctx.strokeStyle = `rgba(255,240,180,${(.25 + .75 * c.q) * k})`; ctx.lineWidth = 6 + 10 * c.q; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(PX, PY, rad, a - c.width / 2, a + c.width / 2); ctx.stroke();
    }
  }
  function sun() {
    if (!skyVisible()) return;
    const a = S.L.sunAz - S.th - Math.PI / 2, x = clamp(PX + Math.cos(a) * 300, 30, W - 30), y = clamp(PY + Math.sin(a) * 300, 120, H - 160);
    ctx.fillStyle = '#ffe14a'; Draw.circ(ctx, x, y, 16); ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 3;
    for (let k = 0; k < 8; k++) { const q = k / 8 * 6.28; ctx.beginPath(); ctx.moveTo(x + Math.cos(q) * 22, y + Math.sin(q) * 22); ctx.lineTo(x + Math.cos(q) * 30, y + Math.sin(q) * 30); ctx.stroke(); }
  }
  const WB = { x: W - 130, y: H - 150, r: 56 };
  function hud() {
    const night = S.L.sky === 'night', ink = night || S.light < .5 ? '#e8ecff' : '#1a2a1a';
    Draw.bigText(ctx, `${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 70, 24, '#fff', '#1a2a1a');
    // daylight left
    ctx.fillStyle = '#0005'; Draw.rr(ctx, 120, 92, 300, 14, 7); ctx.fill(); ctx.fillStyle = S.timeLeft < 60 ? '#ff8a5a' : '#ffe14a'; Draw.rr(ctx, 120, 92, 300 * clamp(S.timeLeft / S.L.time), 14, 7); ctx.fill();
    ctx.font = '700 12px system-ui'; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.fillText('DAYLIGHT', W / 2, 124);
    // whistle button
    const ready = S.t - (S.lastWhistle || -9) > 1.2;
    ctx.fillStyle = ready ? '#ffe14a' : '#8a8a6a'; Draw.circ(ctx, WB.x, WB.y, WB.r); ctx.strokeStyle = '#1a2a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(WB.x, WB.y, WB.r, 0, 7); ctx.stroke();
    ctx.fillStyle = '#1a2a1a'; Draw.rr(ctx, WB.x - 26, WB.y - 8, 40, 18, 9); ctx.fill(); Draw.circ(ctx, WB.x + 16, WB.y + 1, 12); ctx.fillStyle = '#ffe14a'; Draw.circ(ctx, WB.x + 16, WB.y + 1, 5);
    ctx.font = '800 14px system-ui'; ctx.fillStyle = '#1a2a1a'; ctx.fillText('WHISTLE', WB.x, WB.y + 40);
    if (S.lt - (S.lt0 || 0) < 8 && S.walked < 15) { ctx.font = '800 16px system-ui'; ctx.fillStyle = ink; ctx.fillText('HOLD TO WALK · DRAG SIDEWAYS TO TURN', W / 2 - 50, H - 40); }
    const F = S.friend; if (F.said && S.t > F.saidT && S.t - F.saidT < 3) Draw.bigText(ctx, F.said, W / 2, 170, 20, '#fff', '#a02a2a');
    if (S.t - (S.lastWhistle || -9) > 4 && S.t - (S.lastWhistle || -9) < 7 && !S.lastCueSinceWhistle()) { ctx.font = '800 16px system-ui'; ctx.fillStyle = ink; ctx.fillText('...NO ANSWER', W / 2, 210); }
  }
  S.lastCueSinceWhistle = () => S.cues.some(c => !c.missed && c.t > (S.lastWhistle || -9));
  function introCard() {
    ctx.fillStyle = '#0c1a10ee'; ctx.fillRect(0, 0, W, H);
    Draw.bigText(ctx, 'VEER', W / 2, 220, 70, '#ffe14a');
    Draw.bigText(ctx, `LEVEL ${S.li + 1} · ${S.L.name}`, W / 2, 320, 30, '#fff');
    wrapText(S.L.tip, W / 2, 400, 440, 30, '700 22px system-ui', '#cfe8d0');
    ctx.font = '700 16px system-ui'; ctx.fillStyle = '#9ab89a'; ctx.textAlign = 'center';
    ctx.fillText(S.L.sky === 'sun' ? 'SUN OUT: IT SHOWS YOUR TRUE HEADING IN THE OPEN' : 'NO SUN TODAY', W / 2, 560);
    ctx.fillText('HEADPHONES RECOMMENDED', W / 2, 590);
    if (!paused()) { ctx.globalAlpha = .6 + .4 * Math.sin(S.t * 4); Draw.bigText(ctx, 'TAP TO START', W / 2, 720, 34, '#fff'); ctx.globalAlpha = 1; }
  }
  function wrapText(s, x, y, maxW, lh, font, col) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y;
    for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
    ctx.fillText(line, x, yy);
  }
  // after finding them: the whole map, north up, with the path you actually walked
  function reveal() {
    const L = S.L, s = Math.min((W - 60) / L.size[0], (H - 420) / L.size[1]), ox = (W - L.size[0] * s) / 2, oy = 150;
    ctx.fillStyle = '#0c1a10'; ctx.fillRect(0, 0, W, H);
    for (let j = 0; j < S.map.ch; j++) for (let i = 0; i < S.map.cw; i++) { const k = clamp(S.map.att[j * S.map.cw + i] / 23); ctx.fillStyle = `hsl(${100 - k * 10}, ${45 - k * 10}%, ${52 - k * 26}%)`; ctx.fillRect(ox + i * CELL * s, oy + j * CELL * s, CELL * s + .5, CELL * s + .5); }
    if (L.river) { ctx.fillStyle = '#4a90d0'; ctx.fillRect(ox, oy + L.river.y * s, L.size[0] * s, L.river.h * s); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(ox + (L.river.bx - L.river.bw / 2) * s, oy + L.river.y * s, L.river.bw * s, L.river.h * s); }
    const k = clamp(S.winT / 2);
    ctx.setLineDash([6, 6]); ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox + L.start[0] * s, oy + L.start[1] * s); ctx.lineTo(ox + S.x * s, oy + S.y * s); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 3; ctx.beginPath(); const n = Math.floor(S.trail.length * k);
    ctx.moveTo(ox + L.start[0] * s, oy + L.start[1] * s); for (let i = 0; i < n; i++) ctx.lineTo(ox + S.trail[i][0] * s, oy + S.trail[i][1] * s); ctx.stroke();
    ctx.fillStyle = '#3a7ae0'; Draw.circ(ctx, ox + L.start[0] * s, oy + L.start[1] * s, 7); ctx.fillStyle = '#e04a4a'; Draw.circ(ctx, ox + S.friend.x * s, oy + S.friend.y * s, 7);
    Draw.bigText(ctx, 'FOUND THEM!', W / 2, 80, 46, '#ffe14a');
    const direct = Math.hypot(S.x - L.start[0], S.y - L.start[1]), ratio = direct / Math.max(1, S.walked), stars = ratio > .6 ? 3 : ratio > .35 ? 2 : 1;
    const by = oy + L.size[1] * s + 40;
    ctx.font = '800 20px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(`YOU WALKED ${Math.round(S.walked)} m · STRAIGHT LINE ${Math.round(direct)} m`, W / 2, by);
    ctx.font = '700 16px system-ui'; ctx.fillStyle = '#cfe8d0'; ctx.fillText(`${S.myWhistles} WHISTLES · YELLOW IS YOUR REAL PATH`, W / 2, by + 28);
    for (let i = 0; i < 3; i++) { const kk = back(clamp((S.winT - 1.8 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 80, by + 90); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 30, i < stars ? '#ffd23a' : '#3a4a3a'); ctx.restore(); } }
    if (S.winT > 2.4) Draw.bigText(ctx, S.li < LEVELS.length - 1 ? 'TAP FOR THE NEXT WALK' : 'TAP TO FINISH', W / 2, H - 70, 26, '#fff');
  }
  function render(c) {
    ctx = c;
    if (S.state === 'done') {
      ctx.fillStyle = '#0c1a10'; ctx.fillRect(0, 0, W, H);
      Draw.bigText(ctx, 'DEMO COMPLETE', W / 2, 380, 50, '#ffe14a');
      Draw.bigText(ctx, 'EVERYONE MADE IT HOME.', W / 2, 450, 26, '#fff');
      Draw.bigText(ctx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 620, 18, '#9ab89a');
      return;
    }
    if (S.state === 'win') { reveal(); return; }
    ctx.fillStyle = FOG[S.L.sky]; ctx.fillRect(0, 0, W, H);
    world(); fog(); cues(); me(); sun(); hud();
    if (S.state === 'intro') introCard();
    if (S.state === 'dark') {
      ctx.fillStyle = '#05081aee'; ctx.fillRect(0, 0, W, H);
      Draw.bigText(ctx, 'IT GOT DARK', W / 2, 380, 50, '#9ab0ff');
      Draw.bigText(ctx, 'THEY ARE STILL OUT THERE.', W / 2, 450, 24, '#fff');
      if (!paused()) Draw.bigText(ctx, 'TAP TO TRY AGAIN', W / 2, 620, 30, '#fff');
    }
  }

  // ---------- input: hold to walk, drag sideways to turn, tap the whistle ----------
  let drag = null;
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; pause(); } }
  function onPointer(type, x, y) {
    if (type === 'down' && paused()) return;
    if (S.state === 'done') { if (type === 'down') Engine.exit(); return; }
    if (S.state === 'intro') { if (type === 'down') start(); return; }
    if (S.state === 'dark') { if (type === 'down') load(S.li); return; }
    if (S.state === 'win') { if (type === 'down' && S.winT > 2.4) next(); return; }
    if (type === 'down') {
      if (Math.hypot(x - WB.x, y - WB.y) < WB.r + 10) { whistle(); return; }
      drag = { x0: x }; S.walking = true;
    } else if (type === 'move' && drag) S.turn = clamp((x - drag.x0) / 70, -1, 1);
    else if (type === 'up' || type === 'cancel') { drag = null; S.walking = false; S.turn = 0; }
  }
  const keys = {};
  function onKey(key, down) {
    keys[key] = down;
    if (down && paused()) return;
    if (down && (key === 'Enter' || key === ' ')) {
      if (S.state === 'done') { Engine.exit(); return; }
      if (S.state === 'intro') { start(); return; }
      if (S.state === 'dark') { load(S.li); return; }
      if (S.state === 'win') { if (S.winT > 2.4) next(); return; }
      whistle(); return;
    }
    if (S.state !== 'play' || API.autopilot) return;
    S.walking = !!(keys.ArrowUp || keys.w || keys.W);
    S.turn = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0);
  }

  const API = { LEVELS, S, load, start, whistle, levelAt: (ax, ay, bx, by) => levelAt(ax, ay, bx, by), forestLoss, attAt: (x, y) => attAt(x, y), autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  Audio.unlock();
  window.__game = API;
})();
