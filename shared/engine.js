// DEMO DISC shared engine: a fixed-timestep canvas game loop, unified pointer + keyboard + gamepad input,
// fire-and-forget Web Audio synth effects, and a test hook (window.__game) that steps the simulation
// directly so tests never depend on real time.
(function () {
  'use strict';

  // ---- fixed timestep on an integer clock (microseconds), so tick counts don't depend on frame rate ----
  const TICK_US = 16667; // 60 Hz
  const DT = TICK_US / 1e6;

  // back to the disc: games run inside the catalog's frame, so ask it to close us (it keeps its sound on);
  // opened on their own, they just navigate back
  function exit() {
    if (window.parent !== window) window.parent.postMessage({ disc: 'back' }, '*');
    else location.href = '../../index.html';
  }
  // anonymous play stats: inside the disc the catalog records the event; a game opened on its own (a direct link)
  // loads the stats itself and counts the visit, its events and how long it was played
  const lastTrack = {}, framed = window.parent !== window, gameSlug = (location.pathname.match(/games\/([\w-]+)\//) || [])[1];
  function track(name) {
    const now = Date.now(); if (now - (lastTrack[name] || 0) < 1500) return; lastTrack[name] = now;
    if (framed) window.parent.postMessage({ disc: 'track', name }, '*');
    else if (window.Stats && gameSlug) Stats.event(`game/${gameSlug}/${name}`, `${gameSlug}: ${name}`);
  }
  if (!framed && gameSlug) {
    const t0 = performance.now(); let ended = false;
    const end = () => { if (ended || !window.Stats) return; ended = true;
      Stats.event(`time/${gameSlug}/${Stats.bucket((performance.now() - t0) / 1000, [[10, 'under-10s'], [60, '10-60s'], [300, '1-5min'], [Infinity, '5min+']])}`, `${gameSlug}: played (direct link)`); };
    const s = document.createElement('script'); s.src = '../../shared/stats.js';
    s.onload = () => Stats.event(`play/${gameSlug}/direct`, `${gameSlug}: opened by direct link`);
    document.head.appendChild(s);
    addEventListener('pagehide', end); document.addEventListener('visibilitychange', () => { if (document.hidden) end(); });
  }
  let wins = 0;   // how far players get: the 1st, 2nd, 3rd... win of a session
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.back'); if (a) { e.preventDefault(); exit(); } });

  function createGame(opts) {
    const { canvas, width, height, update, render, onPointer, onKey } = opts;
    const ctx = canvas.getContext('2d');
    canvas.style.touchAction = 'none'; // the canvas owns every gesture
    let scale = 1, offX = 0, offY = 0;

    function fit() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vw = window.innerWidth, vh = window.innerHeight;
      scale = Math.min(vw / width, vh / height);
      const cw = Math.floor(width * scale), ch = Math.floor(height * scale);
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
      canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
      offX = (vw - cw) / 2; offY = (vh - ch) / 2;
      canvas.style.position = 'absolute'; canvas.style.left = offX + 'px'; canvas.style.top = offY + 'px';
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    }
    window.addEventListener('resize', fit); fit();

    // ---- pointer: mouse, touch and pen through one path, mapped to logical coordinates ----
    const toLogical = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * width, y: (e.clientY - r.top) / r.height * height }; };
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      canvas.addEventListener(type, e => {
        if (type === 'pointerdown') { Audio.unlock(); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
        const p = toLogical(e); onPointer && onPointer(type.replace('pointer', ''), p.x, p.y);
        e.preventDefault();
      }, { passive: false });
    }
    window.addEventListener('keydown', e => {
      Audio.unlock();
      if (e.key === 'Escape') { exit(); return; }
      onKey && onKey(e.key, true);
    });
    window.addEventListener('keyup', e => onKey && onKey(e.key, false));

    // ---- loop ----
    let acc = 0, last = null, ticks = 0, running = true, manual = false;
    function frame(nowMs) {
      const now = Math.round(nowMs * 1000);
      if (last === null) last = now;
      acc += Math.min(now - last, 250000); last = now; // clamp long stalls (tab switches)
      if (manual) acc = 0; // a test driving step() owns the clock
      while (acc >= TICK_US) { update(DT); ticks++; acc -= TICK_US; }
      render(ctx);
      if (running) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // ---- gamepad: poll every frame (browsers hide pads until a button press) ----
    const padPrev = {};
    function pollPad() {
      let pads = []; try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (_) {} // a frame can be denied gamepad access
      for (const pad of pads) {
        if (!pad) continue;
        const map = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 0: 'Enter', 1: 'Escape', 9: 'Enter' };
        for (const [i, key] of Object.entries(map)) {
          const down = !!(pad.buttons[i] && pad.buttons[i].pressed), id = pad.index + ':' + i;
          if (down !== !!padPrev[id]) { padPrev[id] = down; if (key === 'Escape' && down) exit(); else onKey && onKey(key, down); }
        }
        const ax = pad.axes[0] || 0, id = pad.index + ':ax';
        const dir = ax < -.5 ? 'ArrowLeft' : ax > .5 ? 'ArrowRight' : null;
        if (dir !== padPrev[id]) { if (padPrev[id]) onKey && onKey(padPrev[id], false); if (dir) onKey && onKey(dir, true); padPrev[id] = dir; }
      }
      requestAnimationFrame(pollPad);
    }
    requestAnimationFrame(pollPad);

    const api = {
      ctx, width, height, DT,
      get ticks() { return ticks; },
      // test hook: advance the simulation deterministically without waiting on frames
      step(n = 1) { manual = true; for (let i = 0; i < n; i++) { update(DT); ticks++; } render(ctx); },
      stop() { running = false; },
    };
    return api;
  }

  // ---- audio: never block on unlock (some browsers leave resume() pending forever) ----
  const Audio = {
    ctx: null, muted: false,
    unlock() {
      try {
        if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); }
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (_) {}
    },
    tone(freq, dur, type = 'square', gain = .12, slideTo = null, delay = 0) {
      const c = this.ctx; if (!c || this.muted) return;
      try {
        const t0 = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + .005); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
        o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + .02);
      } catch (_) {}
    },
    noise(dur, gain = .15, delay = 0) {
      const c = this.ctx; if (!c || this.muted) return;
      try {
        const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (((i * 1103515245 + 12345) >>> 8) % 2000 / 1000 - 1) * (1 - i / n); // deterministic noise
        const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = gain;
        s.connect(g).connect(c.destination); s.start(c.currentTime + delay);
      } catch (_) {}
    },
    // named effects shared by every demo
    sfx(name) {
      if (name === 'win' || name === 'fail') track(name);   // every game marks a won or lost level with these
      if (name === 'win') track(`win-${Math.min(++wins, 20)}`);
      const T = (...a) => this.tone(...a), N = (...a) => this.noise(...a);
      switch (name) {
        case 'pin': T(300, .25, 'sawtooth', .08, 900); break;
        case 'lever': N(.08, .25); T(90, .12, 'square', .15); break;
        case 'splash': N(.4, .12); break;
        case 'sizzle': N(.6, .08); T(120, .3, 'sawtooth', .04, 60); break;
        case 'stone': N(.15, .12); T(70, .2, 'sine', .2); break;
        case 'coin': T(1800, .06, 'square', .05); T(2400, .08, 'square', .05, null, .05); break;
        case 'fail': [392, 370, 349, 330].forEach((f, i) => T(f / 2, i < 3 ? .26 : .7, 'sawtooth', .1, null, i * .28)); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => T(f, i < 3 ? .14 : .5, 'square', .1, null, i * .12)); break;
        case 'gate': [659, 880, 1175].forEach((f, i) => T(f, .1, 'sine', .15, null, i * .05)); break;
        case 'bad': T(300, .25, 'square', .1, 120); break;
        case 'hit': N(.1, .2); break;
        case 'select': T(880, .05, 'square', .06); break;
        case 'start': [523, 784, 1047].forEach((f, i) => T(f, .12, 'square', .08, null, i * .08)); break;
      }
    },
  };

  // ---- shared drawing helpers ----
  const Draw = {
    rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, r)); },
    circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fill(); }, // clamp: ease overshoot can go -1e-15
    bigText(ctx, text, x, y, size, fill, stroke = '#000') {
      ctx.save(); ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = size / 6; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y); ctx.restore();
    },
    bubble(ctx, text, x, y, W) {
      ctx.save(); ctx.font = "700 26px 'Arial Rounded MT Bold', Arial, sans-serif";
      const w = ctx.measureText(text).width + 36, h = 50, bx = Math.max(10, Math.min(W - w - 10, x - w / 2)), by = y - h;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3; Draw.rr(ctx, bx, by, w, h, 18); ctx.fill(); ctx.stroke();
      const tx = Math.max(bx + 20, Math.min(bx + w - 20, x)); ctx.beginPath(); ctx.moveTo(tx - 10, by + h - 2); ctx.lineTo(tx + 10, by + h - 2); ctx.lineTo(x, by + h + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(tx - 8, by + h - 5, 16, 5); ctx.fillStyle = '#111'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 18, by + h / 2 + 1); ctx.restore();
    },
    finger(ctx, x, y, press = 0, rot = -.35, s = .8) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * (1 - press * .12), s * (1 - press * .12));
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
      ctx.moveTo(-8, 0); ctx.quadraticCurveTo(0, -8, 8, 0); ctx.lineTo(10, 58); ctx.lineTo(24, 54); ctx.quadraticCurveTo(32, 54, 32, 64); ctx.lineTo(42, 62); ctx.quadraticCurveTo(50, 62, 50, 72);
      ctx.lineTo(58, 72); ctx.quadraticCurveTo(66, 74, 64, 90); ctx.lineTo(60, 128); ctx.quadraticCurveTo(56, 146, 36, 146); ctx.lineTo(4, 146); ctx.quadraticCurveTo(-16, 144, -22, 124);
      ctx.lineTo(-38, 86); ctx.quadraticCurveTo(-42, 74, -30, 72); ctx.lineTo(-10, 90); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    },
    star(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); ctx.stroke(); },
  };

  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  window.Engine = { createGame, exit, track, Audio, Draw, ease, back, clamp, DT };
})();
