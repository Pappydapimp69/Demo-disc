// HAIR SALON ASMR - playable demo.
// Real haircuts. Each customer wants a style: a guard length per zone of the head (top, sides, low sides).
// Snap a guard onto the clippers (each one clicks on and leaves a different length), shave each zone,
// then hit DONE. Hair only gets shorter: go too short and it stays too short.
(function () {
  'use strict';
  const { createGame, Audio, Draw } = Engine;
  const W = 720, H = 1280;
  let cx = null;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, Math.max(0, r)); }
  function circ(x, y, r) { cx.beginPath(); cx.arc(x, y, Math.max(0, r), 0, 7); cx.fill(); }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- guards: the number is the guard, mm is the length it leaves ----------
  const GUARDS = [
    { k: '0', mm: 1, col: '#c8c8d8', name: 'NO GUARD' },
    { k: '1', mm: 3, col: '#ff5a5a', name: '#1' },
    { k: '2', mm: 6, col: '#ff9a3a', name: '#2' },
    { k: '3', mm: 10, col: '#ffd23a', name: '#3' },
    { k: '4', mm: 13, col: '#4ad05a', name: '#4' },
    { k: '6', mm: 19, col: '#3aa0ff', name: '#6' },
    { k: '8', mm: 25, col: '#b05aff', name: '#8' },
  ];
  const G = k => GUARDS.find(g => g.k === k);
  const MMPX = 1.6, BRUSH = 36;   // pixels per mm of hair; clipper head radius

  // ---------- the head: hair cap and zones (customer drawn at 360,560) ----------
  const HX = 360, HY = 560;
  const inCap = (x, y) => { const dx = (x - HX) / 178, dy = (y - 545) / 222, fx = (x - HX) / 132, fy = (y - 610) / 175; return dx * dx + dy * dy < 1 && fx * fx + fy * fy > 1 && y < 650; };
  const zoneAt = (x, y) => (y < 430 && Math.abs(x - HX) < 105) ? 'top' : y > 520 ? 'low' : 'mid';

  // each level names the guard per zone; zones not split share one key
  const LEVELS = [
    { name: 'BUZZ CUT', band: [.55, .67], who: 'DEV', skin: '#f2c79a', hair: 28, style: { top: '3', mid: '3', low: '3' }, labels: { top: 'ALL OVER' }, ask: 'Number three all over.' },
    { name: 'THE TRIM', band: [.42, .54], who: 'ROSA', skin: '#c88a5a', hair: 10, style: { top: '8', mid: '8', low: '8' }, labels: { top: 'ALL OVER' }, ask: 'Just a little off. Eight all over.' },
    { name: 'SHORT BACK & SIDES', band: [.66, .78], who: 'TOM', skin: '#f8d8b8', hair: 35, style: { top: '6', mid: '2', low: '2' }, labels: { top: 'TOP', mid: 'SIDES' }, ask: 'Six on top, two on the sides.' },
    { name: 'THE FADE', band: [.5, .62], who: 'JAY', skin: '#8a5a3a', hair: 5, style: { top: '4', mid: '2', low: '1' }, labels: { top: 'TOP', mid: 'UPPER SIDES', low: 'LOW SIDES' }, ask: 'Four on top, fade it two to one.' },
    { name: 'HIGH & TIGHT', band: [.74, .86], who: 'SAM', skin: '#e8b88a', hair: 20, style: { top: '3', mid: '0', low: '0' }, labels: { top: 'TOP', mid: 'SIDES' }, ask: 'Three on top. Sides down to the skin.' },
  ];
  // zones that share a guard share a label: group keys by guard
  function zones(L) {
    const out = [];
    for (const z of ['top', 'mid', 'low']) {
      const g = L.style[z], hit = out.find(o => o.g === g && (L.labels[z] === undefined));
      if (hit) hit.keys.push(z); else out.push({ keys: [z], g, label: L.labels[z] || z.toUpperCase() });
    }
    return out;
  }
  function deal(i) {
    const L = LEVELS[i], r = rng(100 + i), out = [];
    while (out.length < 1500) {
      const x = 170 + r() * 380, y = 315 + r() * 340;
      if (!inCap(x, y)) continue;
      const a0 = Math.atan2(y - HY, x - HX);
      out.push({ x, y, z: zoneAt(x, y), a: a0 * .6 + -Math.PI / 2 * .4 + (r() - .5) * .5, len: 30 + r() * 10, c: r() });
    }
    return out;
  }

  // ---------- cozy sound: lo-fi loop, vinyl crackle, room tone, crisp snips (the clipper hum is the motor below) ----------
  const Cozy = {
    on: false, next: 0, beat: 0, snipAt: 0,
    start() {
      const c = Audio.ctx; if (this.on || !c || c.state !== 'running') return; this.on = true;
      this.out = c.createGain(); this.out.gain.value = 1.2;
      const warm = c.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5200;
      const glue = c.createDynamicsCompressor(); glue.threshold.value = -14; glue.ratio.value = 4;   // louder, without clipping
      this.out.connect(glue).connect(warm).connect(c.destination);
      const noise = (sec, brown) => { const n = c.sampleRate * sec | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; };
      this.white = noise(2, false);
      // room tone + vinyl crackle, always there under everything
      const room = c.createBufferSource(); room.buffer = noise(4, true); room.loop = true; const rg = c.createGain(); rg.gain.value = .08; room.connect(rg).connect(this.out); room.start();
      const crk = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), cd = crk.getChannelData(0); for (let i = 0; i < cd.length; i++) cd[i] = Math.random() < .0009 ? (Math.random() - .5) * .9 : 0;
      const cs = c.createBufferSource(); cs.buffer = crk; cs.loop = true; const cf = c.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 1200; const cg = c.createGain(); cg.gain.value = .5; cs.connect(cf).connect(cg).connect(this.out); cs.start();
      this.next = c.currentTime + .02;   // first chord lands right away
    },
    // keep ~0.4 s of music scheduled ahead (lo-fi, 76 bpm, Fmaj7 Em7 Dm7 Cmaj7)
    tick() {
      const c = Audio.ctx; if (!this.on) return;
      const b = 60 / 76, CH = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], MEL = [76, 79, 81, 84, 72, 74];
      while (this.next < c.currentTime + .4) {
        const t = this.next, k = this.beat, ch = CH[(k >> 3) % 4];
        if (k % 8 === 0) { for (const m of ch) this.note(m, t, b * 8, 'triangle', .06, .06); this.note(ch[0] - 12, t, b * 8, 'sine', .11, .03); }
        if (k % 4 === 0) this.kick(t);
        if (k % 2 === 1) this.brush(t);
        if ((k * 7 + (k >> 3)) % 5 === 0) this.note(MEL[(k * 3 + (k >> 2)) % MEL.length], t + (k % 2 ? b * .5 : 0), b * 1.6, 'sine', .07, .01);   // rhodes-ish dabs
        this.next += b; this.beat++;
      }
    },
    note(m, t, d, type, g, att) {
      const c = Audio.ctx, o = c.createOscillator(), o2 = c.createOscillator(), gn = c.createGain(), f = 440 * 2 ** ((m - 69) / 12);
      o.type = type; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 1.004;
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + att + .01); gn.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(gn); o2.connect(gn); gn.connect(this.out); o.start(t); o2.start(t); o.stop(t + d + .05); o2.stop(t + d + .05);
    },
    kick(t) { const c = Audio.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + .15); g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.0001, t + .25); o.connect(g).connect(this.out); o.start(t); o.stop(t + .3); },
    brush(t) { const c = Audio.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.white; f.type = 'highpass'; f.frequency.value = 6000; g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.0001, t + .12); s.connect(f).connect(g).connect(this.out); s.start(t, Math.random()); s.stop(t + .15); },
    // the satisfying part: little crisp crunches, more of them the more hair you take
    snip(n) {
      const c = Audio.ctx; if (!this.on || !n) return; const now = c.currentTime; if (now < this.snipAt) return; this.snipAt = now + .035;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.white; f.type = 'bandpass'; f.frequency.value = 3000 + Math.random() * 3000; f.Q.value = 1.5;
      g.gain.setValueAtTime(Math.min(.34, .09 + n * .012), now); g.gain.exponentialRampToValueAtTime(.0001, now + .06);
      s.connect(f).connect(g).connect(this.out); s.start(now, Math.random() * 1.5); s.stop(now + .07);
      const s2 = c.createBufferSource(), f2 = c.createBiquadFilter(), g2 = c.createGain();   // the low crunch under the crisp part
      s2.buffer = this.white; f2.type = 'bandpass'; f2.frequency.value = 700 + Math.random() * 500; f2.Q.value = 2;
      g2.gain.setValueAtTime(Math.min(.3, .06 + n * .01), now); g2.gain.exponentialRampToValueAtTime(.0001, now + .08);
      s2.connect(f2).connect(g2).connect(this.out); s2.start(now, Math.random() * 1.5); s2.stop(now + .09);
    },
    chime() { const c = Audio.ctx; if (!this.on) return; const t = c.currentTime; [84, 88, 91, 96].forEach((m, i) => this.note(m, t + i * .09, 1.6, 'sine', .07, .005)); },
  };

  // ---------- clipper motor: one continuous voice, so the buzz starts the instant you touch ----------
  const M = { g: null, o1: null, o2: null, f: null, on: false };
  function motor(on, load) {
    const c = Audio.ctx; if (!c) return;
    try {
      if (!M.g) {
        M.o1 = c.createOscillator(); M.o1.type = 'sawtooth'; M.o1.frequency.value = 118;
        M.o2 = c.createOscillator(); M.o2.type = 'square'; M.o2.frequency.value = 237;
        M.f = c.createBiquadFilter(); M.f.type = 'lowpass'; M.f.frequency.value = 1100;
        M.g = c.createGain(); M.g.gain.value = 0;
        const g2 = c.createGain(); g2.gain.value = .35;
        M.o1.connect(M.f); M.o2.connect(g2).connect(M.f); M.f.connect(M.g).connect(c.destination);
        // the brushed buzz of the blades on top of the motor hum
        const n = c.createBuffer(1, c.sampleRate, c.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (((i * 1103515245 + 12345) >>> 8) % 2000) / 1000 - 1;
        const bz = c.createBufferSource(); bz.buffer = n; bz.loop = true; const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2600; bf.Q.value = .9; const bg = c.createGain(); bg.gain.value = .5;
        bz.connect(bf).connect(bg).connect(M.g); bz.start();
        M.o1.start(); M.o2.start();
      }
      const t = c.currentTime, live = on && !Audio.muted;
      M.g.gain.setTargetAtTime(live ? .085 : 0, t, live ? .008 : .05);
      M.o1.frequency.setTargetAtTime(load ? 104 : 118, t, .03); M.o2.frequency.setTargetAtTime(load ? 209 : 237, t, .03);
    } catch (_) {}
  }
  // the guard snapping on: a two-part plastic click, pitched by guard size
  function snapClick(i) {
    Audio.noise(.012, .35); Audio.tone(2600 - i * 120, .018, 'square', .1);
    Audio.tone(1300 - i * 60, .03, 'triangle', .14, null, .05); Audio.noise(.01, .28, .05);
  }

  // ---------- salon foley: the rituals around the cut ----------
  const FX = {
    buf: null,
    // filtered noise with a sweep: the raw material of fabric, air, bristles and hydraulics
    src(f0, f1, q, dur, gain, type = 'bandpass', at = 0) {
      const c = Audio.ctx; if (!c || Audio.muted) return;
      try {
        if (!this.buf) { const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.buf = b; }
        const t = c.currentTime + at, sr = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        sr.buffer = this.buf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(.04, dur * .3)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        sr.connect(f).connect(g).connect(Cozy.on ? Cozy.out : c.destination); sr.start(t, Math.random()); sr.stop(t + dur + .05);
      } catch (_) {}
    },
    whoosh(at = 0) { this.src(300, 2400, 1.2, .4, .35, 'bandpass', at); },
    snap(at = 0) { this.src(3200, 2800, 2, .04, .45, 'bandpass', at); Audio.tone(1800, .02, 'square', .08, null, at); },
    velcro(at = 0) { for (let i = 0; i < 10; i++) this.src(2400 + i * 160, 1900, 3, .035, .28, 'bandpass', at + i * .026); },
    pump(k) { Audio.tone(82 - k * 4, .16, 'sine', .3, 45); this.src(5200, 3400, .7, .24, .14, 'highpass', .08); Audio.tone(240 + k * 30, .05, 'triangle', .05, null, .02); },
    spray() { this.src(7400, 5200, .6, .3, .34, 'highpass'); Audio.tone(900, .02, 'square', .04); },
    brush() { this.src(2400, 5200, .8, .38, .3); },
    knock() { Audio.tone(220, .06, 'triangle', .22, 140); Audio.tone(200, .06, 'triangle', .2, 130, .14); },
  };
  const RITUALS = {
    prep: [{ id: 'cape', taps: 1, text: 'TAP TO PUT ON THE CAPE' }, { id: 'pump', taps: 1, text: 'PUMP TO THE GREEN · HOLD IT' }, { id: 'spray', taps: 3, text: 'TAP TO SPRAY THE HAIR' }],
    finish: [{ id: 'brush', taps: 3, text: 'TAP TO BRUSH OFF THE NECK' }, { id: 'capeoff', taps: 1, text: 'TAP TO TAKE OFF THE CAPE' }, { id: 'clean', taps: 4, text: 'TAP TO CLEAN THE CLIPPERS' }],
  };
  // every stage change ignores input for a beat, so a tap meant for the last step can't land on the next one
  const PAUSE = .6;
  function pause() { S.lockUntil = S.t + PAUSE; S.down = false; S.releasing = false; motor(false); }
  const paused = () => S.t < S.lockUntil;
  function startRitual(kind) { S.rit = { kind, i: 0, n: 0, t: 9 }; pause(); }
  function ritTap() {
    const R = S.rit, st = R && RITUALS[R.kind][R.i]; if (!st || R.n >= st.taps) return;
    if (st.id === 'pump') { pumpTap(); return; }
    if (R.t < .2) return;
    R.n++; R.t = 0;
    const neck = () => { for (let k = 0; k < 14; k++) S.bits.push({ x: 290 + Math.random() * 140, y: 790, a: Math.random() * 6, l: 6 + Math.random() * 10, t: S.t, c: Math.random(), vx: (Math.random() - .5) * 160 }); };
    switch (st.id) {
      case 'cape': S.capeTo = 1; FX.whoosh(); FX.velcro(.3); FX.snap(.62); break;
      case 'spray': FX.spray(); for (let k = 0; k < 26; k++) S.mist.push({ x: 600, y: 400, vx: -260 - Math.random() * 260, vy: (Math.random() - .5) * 220, t: S.t }); break;
      case 'brush': FX.brush(); S.brushT = 0; neck(); break;
      case 'capeoff': S.capeTo = 0; FX.snap(); FX.velcro(.05); FX.whoosh(.32); for (let k = 0; k < 4; k++) neck(); break;
      case 'clean': if (R.n === st.taps) FX.knock(); else if (R.n % 2) FX.spray(); else FX.brush(); S.brushT = 0; break;
    }
  }
  // ---------- the chair pump minigame ----------
  // Pump the pedal to raise the chair into the customer's green band, then hold it there for a second.
  // A full stroke waits for the pedal to come back up; stamping too fast only sputters. The seal leaks a
  // little, so it creeps down; overshoot and you hold RELEASE to bleed it off.
  const PEDAL = .38, FULL = .13, WEAK = .03, LEAK = .025, BLEED = .3, HOLD = 1;
  const band = () => S.L.band, mid = () => (S.L.band[0] + S.L.band[1]) / 2;
  function pumpTap() {
    if (S.pump.locked) return;
    const full = S.pump.pedalT >= PEDAL;
    S.h = Math.min(1, S.h + (full ? FULL : WEAK)); S.pump.pedalT = 0; S.pump.n++;
    if (full) FX.pump(Math.min(6, S.pump.n)); else FX.src(3800, 1800, .7, .12, .1, 'highpass');
  }
  function pumpUpdate(dt, R, st) {
    const P = S.pump; P.pedalT += dt;
    if (P.locked) return;
    const [lo, hi] = band();
    if (API.autopilot) { S.releasing = S.h > hi; if (S.h < lo + .03 && P.pedalT >= PEDAL) pumpTap(); }
    S.h = Math.max(0, S.h - LEAK * dt);
    if (S.releasing) { S.h = Math.max(0, S.h - BLEED * dt); P.hissT -= dt; if (P.hissT <= 0) { FX.src(6200, 5200, .5, .12, .12, 'highpass'); P.hissT = .09; } }
    P.lockT = S.h >= lo && S.h <= hi && !S.releasing ? P.lockT + dt : 0;
    if (P.lockT >= HOLD) { P.locked = true; R.n = st.taps; R.t = 0; S.releasing = false; FX.snap(); FX.knock(); }
  }

  function ritUpdate(dt) {
    const R = S.rit, list = RITUALS[R.kind], st = list[R.i];
    R.t += dt;
    if (st.id === 'pump') pumpUpdate(dt, R, st);
    else if (API.autopilot && R.t > .25) ritTap();
    if (R.n >= st.taps && R.t > .5) {
      if (st.id === 'pump') S.settle = true;   // from here on the chair sits at working height
      R.i++; R.n = 0; R.t = 9; pause();
      if (R.i >= list.length) {
        if (R.kind === 'prep') { S.state = 'play'; S.lt = 0; }
        else { S.state = 'result'; S.resT = 0; if (S.result.stars && Cozy.on) Cozy.chime(); else Audio.sfx(S.result.stars ? 'win' : 'fail'); }
      }
    }
  }

  // ---------- state ----------
  const S = { li: 0, L: null, strands: [], bits: [], guard: '8', equipT: 9, t: 0, lt: 0, state: 'play', result: null, resT: 0, ptr: null, down: false, keys: {}, snipT: 0, cutting: 0, ap: null, apDone: false, rit: null, lockUntil: 0, cape: 0, capeTo: 0, h: 0, hv: 0, settle: false, releasing: false, pump: null, mist: [], brushT: 9 };
  function load(i) {
    Object.assign(S, { li: i, L: LEVELS[i], strands: deal(i), bits: [], equipT: 9, lt: 0,   // the guard stays on between customers
      state: 'prep', result: null, resT: 0, ptr: { x: 600, y: 900 }, down: false, ap: null, apDone: false, cape: 0, capeTo: 0, h: 0, hv: 0, settle: false, releasing: false, pump: { pedalT: 9, lockT: 0, locked: false, n: 0, hissT: 0 }, mist: [], brushT: 9 });
    startRitual('prep');
    API.autopilot = null;
  }
  function equip(k) {
    if (!G(k) || S.state === 'result' || S.state === 'done') return;
    if (k !== S.guard) { S.guard = k; S.equipT = 0; snapClick(GUARDS.indexOf(G(k))); }
  }
  // cut every strand under the head down to the guard's length; return how many got shorter
  function cutAt(x, y) {
    const mm = G(S.guard).mm; let n = 0;
    for (const s of S.strands) {
      if (s.len <= mm + 1e-9 || (s.x - x) ** 2 + (s.y - y) ** 2 > BRUSH * BRUSH) continue;
      const ca = Math.cos(s.a), sa = Math.sin(s.a);
      if (S.bits.length < 900) S.bits.push({ x: s.x + ca * mm * MMPX, y: s.y + sa * mm * MMPX, a: s.a, l: (s.len - mm) * MMPX, t: S.t, c: s.c, vx: (s.c - .5) * 120 });
      s.len = mm; n++;
    }
    return n;
  }
  function score() {
    const out = zones(S.L).map(z => {
      const mm = G(z.g).mm, ss = S.strands.filter(s => z.keys.includes(s.z));
      const ok = ss.filter(s => Math.abs(s.len - mm) < .01).length, short = ss.filter(s => s.len < mm - .01).length;
      return { label: z.label, g: z.g, n: ss.length, ok, short, pct: ok / ss.length };
    });
    const all = out.reduce((a, z) => a + z.ok, 0) / S.strands.length;
    return { zones: out, all, stars: all >= .9 ? 3 : all >= .75 ? 2 : all >= .6 ? 1 : 0, short: out.reduce((a, z) => a + z.short, 0) };
  }
  function finish() {
    if (S.state !== 'play') return;
    S.result = score(); S.state = 'finish'; S.down = false; motor(false);   // score the cut, then tidy up before the verdict
    startRitual('finish');
  }
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; pause(); } }

  // test autopilot: longest guard first, never letting the head touch a zone that wants longer hair
  function autopilot() {
    if (!S.ap) S.ap = { order: zones(S.L).sort((a, b) => G(b.g).mm - G(a.g).mm), zi: 0 };
    const z = S.ap.order[S.ap.zi];
    if (!z) { S.down = false; S.apDone = true; if (API.autopilot === 'style') finish(); return; }
    if (S.guard !== z.g) { S.down = false; equip(z.g); return; }
    const mm = G(z.g).mm;
    const want = s => G(S.L.style[s.z]).mm;
    for (const s of S.strands) {
      if (!z.keys.includes(s.z) || s.len <= mm + 1e-9 || s.skip) continue;
      const tries = [[0, 0]]; for (const d of [.5, .9]) for (let k = 0; k < 12; k++) tries.push([Math.cos(k * Math.PI / 6) * BRUSH * d, Math.sin(k * Math.PI / 6) * BRUSH * d]);
      const c = tries.map(([dx, dy]) => ({ x: s.x + dx, y: s.y + dy }))
        .find(c => S.strands.every(q => (q.x - c.x) ** 2 + (q.y - c.y) ** 2 > BRUSH * BRUSH || q.len <= mm + 1e-9 || want(q) <= mm + 1e-9));
      if (!c) { s.skip = true; continue; }
      S.ptr = c; S.down = true; return;
    }
    S.ap.zi++;
  }

  function update(dt) {
    S.t += dt; S.lt += dt; S.equipT += dt;
    Cozy.start(); Cozy.tick();
    S.bits = S.bits.filter(b => S.t - b.t < 1.2); S.mist = S.mist.filter(m => S.t - m.t < .7); S.brushT += dt;
    S.cape += (S.capeTo - S.cape) * Math.min(1, dt * 7); if (S.settle) S.h += (mid() - S.h) * Math.min(1, dt * 5); S.hv += (S.h - S.hv) * Math.min(1, dt * 12);
    if (S.state === 'result') { S.resT += dt; return; }
    if (S.state === 'prep' || S.state === 'finish') { ritUpdate(dt); return; }
    if (S.state !== 'play') return;
    if (API.autopilot === 'style') autopilot();
    else {
      const dx = (S.keys.ArrowRight ? 1 : 0) - (S.keys.ArrowLeft ? 1 : 0), dy = (S.keys.ArrowDown ? 1 : 0) - (S.keys.ArrowUp ? 1 : 0);
      if (dx || dy) { S.ptr = { x: clamp(S.ptr.x + dx * 420 * dt, 0, W), y: clamp(S.ptr.y + dy * 420 * dt, 0, H) }; S.down = true; S.kb = true; }
      else if (S.kb) { S.down = false; S.kb = false; }
    }
    const n = S.down && S.ptr ? cutAt(S.ptr.x, S.ptr.y) : 0;
    S.cutting = n ? .12 : Math.max(0, S.cutting - dt);
    motor(S.down, S.cutting > 0);
    // the crunch: little bursts of noise as strands go, louder for thicker passes
    if (Cozy.on) Cozy.snip(n); else { S.snipT -= dt; if (n && S.snipT <= 0) { Audio.noise(.028, Math.min(.22, .05 + n * .012)); S.snipT = .035; } }
  }

  // ---------- drawing ----------
  function salonBack() {
    cx.fillStyle = '#e8d8c8'; cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#d8c4ae'; for (let k = 0; k < 8; k++) cx.fillRect(k * 100, 0, 50, 760);
    cx.fillStyle = '#d8c0a0'; cx.fillRect(0, 760, W, H - 760);
  }
  function customer(skin, mood) {
    cx.save(); cx.translate(HX, HY);
    cx.fillStyle = skin; cx.fillRect(-45, 150, 90, 110);   // neck
    cx.fillStyle = '#4a7ad0'; cx.beginPath(); cx.moveTo(-230, 720); cx.quadraticCurveTo(-210, 250, 0, 250); cx.quadraticCurveTo(210, 250, 230, 720); cx.fill();   // shirt
    if (S.cape > .01) {   // the cape rises into place and drops away
      cx.save(); cx.translate(Math.sin(S.t * 3) * 8 * (1 - S.cape), (1 - S.cape) * 560); cx.globalAlpha = Math.min(1, S.cape * 1.6);
      cx.fillStyle = '#e8e8f0'; cx.beginPath(); cx.moveTo(-250, 720); cx.quadraticCurveTo(-220, 230, 0, 230); cx.quadraticCurveTo(220, 230, 250, 720); cx.fill();
      cx.strokeStyle = '#c8c8d8'; cx.lineWidth = 3; for (const k of [-120, -40, 40, 120]) { cx.beginPath(); cx.moveTo(k * .4, 280); cx.quadraticCurveTo(k * .9, 480, k * 1.4, 720); cx.stroke(); }
      cx.fillStyle = '#333'; circ(0, 236, 9); cx.restore();
    }
    cx.fillStyle = skin; cx.beginPath(); cx.ellipse(0, 0, 150, 190, 0, 0, 7); cx.fill(); circ(-150, 10, 30); circ(150, 10, 30);
    cx.fillStyle = '#fff'; circ(-55, -10, 24); circ(55, -10, 24);
    cx.fillStyle = '#222'; circ(-55, -6, 11); circ(55, -6, 11);
    cx.strokeStyle = '#7a3a2a'; cx.lineWidth = 7; cx.lineCap = 'round'; cx.beginPath();
    if (mood > 0) cx.arc(0, 60, 36, .3, Math.PI - .3); else if (mood < 0) cx.arc(0, 112, 36, Math.PI + .4, -.4); else { cx.moveTo(-30, 80); cx.lineTo(30, 80); }
    cx.stroke(); cx.restore();
  }
  const REL = { x: 520, y: 960, w: 150, h: 76 };
  function props() {
    const R = S.rit, st = R && RITUALS[R.kind][R.i]; if (!st) return;
    const k = clamp(R.t / .35), pump = st.id === 'pump';
    // the chair pedal, bottom left: it dips on every pump
    if (S.state === 'prep') {
      const P = S.pump, ready = P.pedalT >= PEDAL, dip = pump && P.pedalT < PEDAL ? Math.sin(clamp(P.pedalT / PEDAL) * Math.PI) * .28 : 0;
      // the foot pedal: a chrome base and a lever that dips on each stroke and glows green when it's back up
      cx.fillStyle = '#6a6a78'; rr(20, 1040, 190, 30, 10); cx.fill(); cx.fillStyle = '#9a9aa8'; circ(50, 1040, 20);
      cx.save(); cx.translate(50, 1040); cx.rotate(-.35 + dip);
      if (pump && ready) { cx.fillStyle = '#4ad05a55'; rr(-16, -26, 196, 52, 22); cx.fill(); }
      cx.fillStyle = !pump ? '#888' : ready ? '#4ad05a' : '#ffd23a'; rr(0, -16, 170, 32, 12); cx.fill(); cx.strokeStyle = '#0006'; cx.lineWidth = 3; cx.stroke();
      cx.fillStyle = '#000a'; cx.font = '900 18px system-ui'; cx.textAlign = 'center'; cx.fillText('PUMP', 90, 7); cx.restore();
    }
    if (pump) {
      const [lo, hi] = band(), G = { x: 640, y: 380, w: 44, h: 560 }, yAt = v => G.y + G.h * (1 - v);
      cx.fillStyle = '#000a'; rr(G.x - 6, G.y - 6, G.w + 12, G.h + 12, 16); cx.fill();
      cx.fillStyle = '#3a3a4a'; rr(G.x, G.y, G.w, G.h, 10); cx.fill();
      cx.fillStyle = S.pump.lockT > 0 ? '#7af08a' : '#4ad05a'; cx.fillRect(G.x, yAt(hi), G.w, yAt(lo) - yAt(hi));
      cx.fillStyle = '#ffffff22'; cx.fillRect(G.x, yAt(S.h), G.w, G.y + G.h - yAt(S.h));
      const my = yAt(S.hv); cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(G.x - 22, my - 12); cx.lineTo(G.x - 4, my); cx.lineTo(G.x - 22, my + 12); cx.fill();
      if (S.pump.lockT > 0) { cx.strokeStyle = '#fff'; cx.lineWidth = 6; cx.beginPath(); cx.arc(G.x + G.w / 2, G.y - 40, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(S.pump.lockT / HOLD)); cx.stroke(); }
      const B = REL; cx.fillStyle = S.releasing ? '#ff6a6a' : '#5a3a3a'; rr(B.x, B.y, B.w, B.h, 20); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 3; cx.stroke();
      cx.fillStyle = '#fff'; cx.font = '800 18px system-ui'; cx.textAlign = 'center'; cx.fillText('HOLD TO', B.x + B.w / 2, B.y + 30); cx.fillText('RELEASE', B.x + B.w / 2, B.y + 54);
      if (S.h > hi) Draw.bigText(cx, 'TOO HIGH!', 360, 300, 36, '#ff6a6a');
      else if (!S.pump.n) Draw.bigText(cx, 'TAP WHEN THE PEDAL IS GREEN', 360, 300, 26, '#fff');
    }
    if (st.id === 'spray' || (st.id === 'clean' && R.n % 2 === 1)) {   // spray bottle
      const x = st.id === 'spray' ? 640 : 520, y = st.id === 'spray' ? 400 : 860, sq = k < 1 ? Math.sin(k * Math.PI) * 6 : 0;
      cx.fillStyle = '#5ab8ff'; rr(x - 10, y + 10, 52, 90, 14); cx.fill(); cx.fillStyle = '#fff'; rr(x - 26, y - 14, 50, 26, 6); cx.fill(); cx.fillStyle = '#ff5ab0'; rr(x - 4 - sq, y - 4, 16, 34, 6); cx.fill();
    }
    for (const m of S.mist) { const q = (S.t - m.t) / .7; cx.globalAlpha = .5 * (1 - q); cx.fillStyle = '#d8f0ff'; circ(m.x + m.vx * q, m.y + m.vy * q, 4 + q * 8); }
    cx.globalAlpha = 1;
    if (st.id === 'brush' || (st.id === 'clean' && R.n % 2 === 0 && R.n)) {   // neck duster / clipper brush sweeping across
      const q = clamp(S.brushT / .35), x = st.id === 'brush' ? 260 + q * 200 : 300 + q * 140, y = st.id === 'brush' ? 790 : 860;
      cx.save(); cx.translate(x, y); cx.rotate(-.3 + q * .6); cx.fillStyle = '#a0603a'; rr(-8, -90, 16, 70, 6); cx.fill(); cx.fillStyle = '#f0e0c0'; rr(-26, -26, 52, 34, 12); cx.fill(); cx.restore();
    }
    if (st.id === 'clean') {   // the clippers laid on a towel, getting looked after
      cx.fillStyle = '#ffffff'; rr(200, 880, 320, 90, 16); cx.fill(); cx.fillStyle = '#c8e0f0'; for (let i = 0; i < 4; i++) cx.fillRect(210, 892 + i * 20, 300, 6);
      const knock = R.n === st.taps && k < 1 ? Math.sin(k * Math.PI * 2) * 10 : 0;
      cx.save(); cx.translate(360, 900 - Math.abs(knock)); cx.rotate(Math.PI / 2); cx.fillStyle = '#2a2a34'; rr(-22, -60, 44, 120, 14); cx.fill(); cx.fillStyle = '#c8c8d8'; rr(-26, -76, 52, 22, 4); cx.fill(); cx.restore();
    }
    // the prompt
    const steps = RITUALS[R.kind];
    cx.globalAlpha = paused() ? .25 + .75 * (1 - (S.lockUntil - S.t) / PAUSE) : 1;
    cx.fillStyle = '#000c'; rr(50, 1080, 620, 160, 26); cx.fill();
    cx.font = '800 22px system-ui'; cx.textAlign = 'center'; cx.fillStyle = '#ffe14a';
    cx.fillText(`${R.kind === 'prep' ? 'GETTING READY' : 'FINISHING UP'} · ${R.i + 1}/${steps.length}`, W / 2, 1118);
    Draw.bigText(cx, st.text, W / 2, 1160, 32, '#fff');
    for (let i = 0; i < st.taps; i++) { cx.fillStyle = i < R.n ? '#4ad05a' : '#ffffff44'; circ(W / 2 + (i - (st.taps - 1) / 2) * 34, 1210, 10); }
    cx.globalAlpha = 1;
  }
  const hairCol = s => `hsl(${20 + S.L.hair}, 50%, ${14 + s.c * 22}%)`;
  function hairDraw() {
    cx.lineCap = 'round'; cx.lineWidth = 3.5;
    for (const s of S.strands) {
      const l = Math.max(2, s.len * MMPX), ca = Math.cos(s.a), sa = Math.sin(s.a);
      cx.strokeStyle = hairCol(s); cx.beginPath(); cx.moveTo(s.x, s.y);
      cx.quadraticCurveTo(s.x + Math.cos(s.a + .35) * l * .55, s.y + Math.sin(s.a + .35) * l * .55, s.x + ca * l, s.y + sa * l); cx.stroke();
    }
    // clippings fall and fade
    for (const b of S.bits) {
      const k = (S.t - b.t) / 1.2, x = b.x + b.vx * k, y = b.y + 700 * k * k, a = b.a + k * 2.5;
      cx.globalAlpha = 1 - k; cx.strokeStyle = hairCol(b); cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(a) * b.l, y + Math.sin(a) * b.l); cx.stroke();
    }
    cx.globalAlpha = 1;
  }
  function guideLines() {
    if (zones(S.L).length < 2) return;
    cx.save(); cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 2; cx.setLineDash([6, 8]); cx.beginPath();
    cx.moveTo(HX - 105, 330); cx.lineTo(HX - 105, 430); cx.lineTo(HX + 105, 430); cx.lineTo(HX + 105, 330);
    if (zones(S.L).length > 2) { cx.moveTo(180, 520); cx.lineTo(232, 520); cx.moveTo(488, 520); cx.lineTo(540, 520); }
    cx.stroke(); cx.restore();
  }
  function clipper(x, y, on) {
    const j = on ? Math.sin(S.t * 90) * 2 : 0, gi = GUARDS.indexOf(G(S.guard)), g = G(S.guard);
    const pop = S.equipT < .25 ? back(lin(S.equipT, 0, .25)) : 1;
    cx.save(); cx.translate(x + j, y); cx.rotate(-.35);
    cx.fillStyle = '#f2c79a'; cx.strokeStyle = '#7a4a2a'; cx.lineWidth = 3; rr(-26, 50, 52, 120, 24); cx.fill(); cx.stroke();
    cx.fillStyle = '#2a2a34'; rr(-22, 0, 44, 120, 14); cx.fill();
    cx.fillStyle = '#c8c8d8'; rr(-26, -16, 52, 22, 4); cx.fill();
    cx.fillStyle = on ? '#4ad05a' : '#555'; circ(0, 50, 5);
    if (gi > 0) {   // the guard: a comb whose depth shows the length it leaves
      cx.save(); cx.translate(0, -16); cx.scale(pop, pop);
      const d = 8 + g.mm * 1.3;
      cx.fillStyle = g.col; cx.strokeStyle = '#0006'; cx.lineWidth = 2; rr(-28, -6, 56, 12, 4); cx.fill(); cx.stroke();
      for (let k = -24; k <= 22; k += 7) { rr(k, -d, 5, d, 2); cx.fill(); }
      cx.fillStyle = '#000'; cx.font = '900 14px system-ui'; cx.textAlign = 'center'; cx.fillText(g.k, 0, 5); cx.restore();
    } else { cx.fillStyle = '#8a8a9a'; for (let k = -22; k <= 18; k += 6) cx.fillRect(k, -22, 3, 8); }
    cx.restore();
  }
  // the photo the customer brought: the target cut, drawn with the real strands
  function refCard() {
    const X = 560, Y = 136, Wd = 145, Hd = 175;
    cx.fillStyle = '#fff'; cx.strokeStyle = '#000'; cx.lineWidth = 4; rr(X, Y, Wd, Hd, 10); cx.fill(); cx.stroke();
    cx.save(); cx.beginPath(); cx.rect(X + 4, Y + 4, Wd - 8, Hd - 30); cx.clip();
    cx.translate(X + Wd / 2, Y + 100); cx.scale(.33, .33); cx.translate(-HX, -HY);
    cx.fillStyle = S.L.skin; cx.beginPath(); cx.ellipse(HX, HY, 150, 190, 0, 0, 7); cx.fill();
    cx.lineCap = 'round'; cx.lineWidth = 6;
    S.strands.forEach((s, i) => { if (i % 2) return; const l = Math.max(3, G(S.L.style[s.z]).mm * MMPX); cx.strokeStyle = hairCol(s); cx.beginPath(); cx.moveTo(s.x, s.y); cx.lineTo(s.x + Math.cos(s.a) * l, s.y + Math.sin(s.a) * l); cx.stroke(); });
    cx.restore();
    cx.fillStyle = '#111'; cx.font = '800 15px system-ui'; cx.textAlign = 'center'; cx.fillText('THE GOAL', X + Wd / 2, Y + Hd - 10);
  }
  const BAR = { x: 18, y: 1176, w: 92, h: 88, gap: 6 }, DONE = { x: 520, y: 1068, w: 180, h: 84 };
  const barRect = i => ({ x: BAR.x + i * (BAR.w + BAR.gap), y: BAR.y, w: BAR.w, h: BAR.h });
  function hud() {
    Draw.bigText(cx, `${S.li + 1}/${LEVELS.length} · ${S.L.name}`, 360, 100, 38, '#ffe14a');
    // the order, zone by zone, with live progress
    const sc = score();
    sc.zones.forEach((z, i) => {
      const y = 160 + i * 40, g = G(z.g);
      cx.fillStyle = '#000a'; rr(20, y - 24, 400, 34, 10); cx.fill();
      cx.fillStyle = g.col; rr(20, y - 24, 400 * z.pct, 34, 10); cx.fill();
      cx.fillStyle = '#fff'; cx.font = '800 20px system-ui'; cx.textAlign = 'left'; cx.fillText(`${z.label}: ${g.name}`, 32, y);
      cx.textAlign = 'right'; cx.fillText(z.short ? `${Math.round(z.pct * 100)}% · ${z.short} TOO SHORT` : `${Math.round(z.pct * 100)}%`, 410, y);
    });
    refCard();
    // guard tray
    GUARDS.forEach((g, i) => {
      const r = barRect(i), on = g.k === S.guard;
      cx.fillStyle = on ? g.col : '#2a2a34'; rr(r.x, r.y, r.w, r.h, 14); cx.fill();
      cx.strokeStyle = on ? '#fff' : g.col; cx.lineWidth = on ? 5 : 3; cx.stroke();
      cx.fillStyle = on ? '#000' : '#fff'; cx.textAlign = 'center'; cx.font = '900 30px system-ui'; cx.fillText(i ? g.k : '0', r.x + r.w / 2, r.y + 44);
      cx.font = '700 13px system-ui'; cx.fillText(`${g.mm}MM`, r.x + r.w / 2, r.y + 70);
    });
    cx.fillStyle = '#4ad05a'; rr(DONE.x, DONE.y, DONE.w, DONE.h, 40); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 4; cx.stroke();
    Draw.bigText(cx, 'DONE', DONE.x + DONE.w / 2, DONE.y + DONE.h / 2 + 2, 36, '#fff');
  }
  function bubble(text, x, y) {
    cx.save(); cx.font = '800 30px system-ui'; const w = Math.min(640, cx.measureText(text).width + 44), bx = clamp(x - w / 2, 30, W - 30 - w), by = y - 80;
    cx.fillStyle = '#fff'; cx.strokeStyle = '#000'; cx.lineWidth = 4; rr(bx, by, w, 62, 24); cx.fill(); cx.stroke();
    const tx = clamp(x, bx + 30, bx + w - 30); cx.beginPath(); cx.moveTo(tx - 14, by + 60); cx.lineTo(x, y); cx.lineTo(tx + 14, by + 60); cx.fill(); cx.stroke();
    cx.fillStyle = '#111'; cx.textAlign = 'center'; cx.fillText(text, bx + w / 2, by + 42); cx.restore();
  }
  function render(ctx) {
    cx = ctx;
    if (S.state === 'done') {
      cx.fillStyle = '#2a1a4a'; cx.fillRect(0, 0, W, H);
      Draw.bigText(cx, 'DEMO COMPLETE', W / 2, 520, 64, '#ffe14a');
      Draw.bigText(cx, 'FIVE CUSTOMERS. FIVE CUTS.', W / 2, 610, 34, '#fff');
      Draw.bigText(cx, 'TAP OR PRESS ESC FOR THE DISC MENU', W / 2, 820, 24, '#9ad8ff');
      return;
    }
    const res = S.state === 'result' ? S.result : null;
    salonBack();
    cx.save(); cx.translate(0, clamp((mid() - S.hv) * 420, -90, 300));   // the chair carries them; working height puts the head where the cut happens
    customer(S.L.skin, res ? (res.stars >= 2 ? 1 : res.stars ? 0 : -1) : 0);
    hairDraw(); cx.restore();
    if (S.state === 'play') guideLines();
    if (S.state === 'prep' || S.state === 'finish') { props(); if (S.state === 'prep' && S.rit.i === 0) bubble(S.L.ask, 360, 330); return; }
    if (S.state === 'play') {
      if (S.ptr) clipper(S.ptr.x, S.ptr.y, S.down);
      hud();
      if (S.lt < 2.6) bubble(S.L.ask, 360, 330);
      else if (S.lt < 6 && !S.down && S.strands.every(s => s.len > 25)) { cx.globalAlpha = .5 + .5 * Math.sin(S.t * 5); Draw.bigText(cx, 'DRAG TO SHAVE', 260, 1110, 36, '#fff'); cx.globalAlpha = 1; }
      return;
    }
    // result card
    const k = clamp(S.resT / .3); cx.fillStyle = `rgba(0,0,0,${.45 * k})`; cx.fillRect(0, 0, W, H);
    const line = res.stars === 3 ? 'Perfect. Same again next time.' : res.stars === 2 ? 'Nice. Close enough.' : res.stars === 1 ? "...It'll grow back." : "That's not what I asked for.";
    bubble(line, 360, 330);
    for (let i = 0; i < 3; i++) { const kk = back(lin(S.resT, .2 + i * .15, .5 + i * .15)); if (kk > 0) { cx.save(); cx.translate(W / 2 + (i - 1) * 110, 860 - (i === 1 ? 20 : 0)); cx.scale(kk, kk); Draw.star(cx, 0, 0, 46, i < res.stars ? '#ffd23a' : '#4a3a4a'); cx.restore(); } }
    Draw.bigText(cx, `${Math.round(res.all * 100)}% TO STYLE`, W / 2, 960, 48, '#fff');
    if (res.short) Draw.bigText(cx, `${res.short} STRANDS TOO SHORT`, W / 2, 1012, 28, '#ff8a8a');
    if (S.resT > 1) {   // a bad cut never blocks you: move on, or redo this customer
      const b = (r, col, label, size) => { cx.fillStyle = col; rr(r.x, r.y, r.w, r.h, r.h / 2); cx.fill(); cx.strokeStyle = '#fff'; cx.lineWidth = 4; cx.stroke(); Draw.bigText(cx, label, r.x + r.w / 2, r.y + r.h / 2 + 2, size, '#fff'); };
      b(RES.next, '#4ad05a', S.li < LEVELS.length - 1 ? 'NEXT CUSTOMER' : 'FINISH', 30); b(RES.retry, '#ff9a3a', 'TRY AGAIN', 24);
    }
  }

  // ---------- input: drag to shave; tap a guard to snap it on; 0-8 keys swap guards ----------
  const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const RES = { next: { x: 190, y: 1060, w: 340, h: 80 }, retry: { x: 250, y: 1160, w: 220, h: 64 } };
  function proceed(retry) { if (S.resT < 1) return; if (retry) load(S.li); else next(); }
  function onPointer(type, x, y) {
    if (type === 'down' && paused()) return;
    if (S.state === 'done') { if (type === 'down') Engine.exit(); return; }
    if (S.state === 'result') { if (type === 'down') proceed(hit(RES.retry, x, y)); return; }
    if (S.state === 'prep' || S.state === 'finish') {
      const onPump = S.state === 'prep' && RITUALS.prep[S.rit.i].id === 'pump';
      if (type === 'down') { Audio.unlock(); if (onPump && hit(REL, x, y)) S.releasing = true; else ritTap(); }
      else if (type === 'up' || type === 'cancel') S.releasing = false;
      return;
    }
    if (type === 'down') {
      Audio.unlock();
      const gi = GUARDS.findIndex((g, i) => hit(barRect(i), x, y)); if (gi >= 0) { equip(GUARDS[gi].k); return; }
      if (hit(DONE, x, y)) { finish(); return; }
      S.down = true; S.ptr = { x, y: y - 40 }; motor(true);   // start the buzz now, not on the next tick
    } else if (type === 'move' && S.down) S.ptr = { x, y: y - 40 };     // the head sits just above the finger
    else if (type === 'up' || type === 'cancel') { S.down = false; motor(false); }
  }
  function onKey(key, down) {
    S.keys[key] = down;
    if (key === 'ArrowDown' || key === 'Shift') S.releasing = down && S.state === 'prep';   // hold to bleed the chair down
    if (!down || paused()) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'result') { if (key === 'Enter' || key === ' ') proceed(false); else if (key === 'r' || key === 'R') proceed(true); return; }
    if (S.state === 'prep' || S.state === 'finish') { if (key === 'Enter' || key === ' ') ritTap(); return; }
    if (G(key)) equip(key);
    else if (key === 'Tab') { const i = GUARDS.indexOf(G(S.guard)); equip(GUARDS[(i + 1) % GUARDS.length].k); }
    else if (key === 'Enter') finish();
  }
  window.addEventListener('keydown', e => { if (e.key === 'Tab') e.preventDefault(); });

  const API = { LEVELS, GUARDS, S, load, equip, cutAt, finish, score, tap: () => ritTap(), autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  Audio.unlock(); motor(false);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
