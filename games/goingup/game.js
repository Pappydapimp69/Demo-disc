// GOING UP - playable demo.
// The ad is a tower stacker. The game runs the lifts in the tower. People press call buttons and wait;
// you tap a floor to send a lift there. Doors open, people get off, people get on, and their floors light up.
// The trap is the obvious rule: always go to the nearest request. It keeps the busy floors happy and leaves the
// far floor waiting forever, until they give up and take the stairs. A sweep (keep going one way while there
// is work ahead, then turn around) bounds everyone's wait. An AUTO switch runs either rule for you.
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const HOLD = .45, W = 540, H = 960, TOP = 170, BOT = 860, CAP = 8, SPEED = 2.4, DOOR = .9, PATIENCE = 40, ANGRY = 25;

  // traffic: (rng, floors) -> [from, to]; rate = new people per second
  const anywhere = (r, F) => { const a = Math.floor(r() * F); let b = Math.floor(r() * (F - 1)); if (b >= a) b++; return [a, b]; };
  const LEVELS = [
    { name: 'FIRST DAY', floors: 5, cars: 1, rate: .3, goal: 20, time: 120, tip: 'TAP FLOORS TO QUEUE STOPS; TAP ONE AGAIN TO CANCEL. HOLD A FLOOR TO PARK THE LIFT THERE WHEN IT IS IDLE. LIT FLOORS ARE WHERE RIDERS WANT TO GO; ▲▼ SHOW WHICH WAY THE WAITING ONES ARE GOING.', traffic: anywhere },
    { name: 'MORNING RUSH', floors: 7, cars: 1, rate: .55, goal: 50, time: 135, tip: 'EVERYONE ARRIVES AT THE LOBBY AND GOES UP. HOLD L TO PARK THE LIFT THERE BETWEEN TRIPS.', traffic: (r, F) => [0, 1 + Math.floor(r() * (F - 1))] },
    { name: 'THE TOP FLOOR', floors: 9, cars: 1, rate: .9, goal: 75, time: 130, tip: "THE LOW FLOORS ARE BUSY. DON'T FORGET WHO IS WAITING AT THE TOP.",
      traffic: (r, F) => r() < .1 ? [F - 1, 0] : (() => { const a = Math.floor(r() * 4); let b = Math.floor(r() * 3); if (b >= a) b++; return [a, b]; })() },
    { name: 'LUNCH', floors: 10, cars: 2, rate: 1.0, goal: 90, time: 130, tip: 'TWO LIFTS NOW. TAP A LIFT TO PICK IT, THEN TAP A FLOOR.', traffic: (r, F) => r() < .5 ? anywhere(r, F) : r() < .5 ? [0, 1 + Math.floor(r() * (F - 1))] : [1 + Math.floor(r() * (F - 1)), 0] },
    { name: "FIVE O'CLOCK", floors: 12, cars: 2, rate: 1.2, goal: 110, time: 140, tip: 'EVERYONE WANTS TO GO HOME. ALL THE WAY DOWN.', traffic: (r, F) => r() < .85 ? [1 + Math.floor(r() * (F - 1)), 0] : anywhere(r, F) },
  ];
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const S = { li: 0, L: null, state: 'intro', t: 0, lt: 0, lockUntil: 0, clock: 0, cars: [], waiting: [], delivered: 0, hearts: 3, sel: 0, auto: null, rng: null, nextP: 0, pops: [], maxWait: 0, waits: [], endT: 0 };
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, state: 'intro', lt: 0, clock: 0, waiting: [], delivered: 0, hearts: 3, sel: 0, auto: null, rng: mkRng(500 + i * 13), nextP: 1, pops: [], maxWait: 0, waits: [], endT: 0, usedAuto: false,
      cars: Array.from({ length: L.cars }, (_, k) => ({ y: k ? L.floors - 1 : 0, target: null, stops: [], park: null, door: 0, riders: [], dir: 1, id: k })) });
    pause();
  }
  function pause() { S.lockUntil = S.t + .6; }
  const paused = () => S.t < S.lockUntil;
  const FH = () => (BOT - TOP) / S.L.floors;
  const floorY = f => BOT - (f + .5) * FH();
  function start() { S.state = 'play'; pause(); }

  // ---------- the lifts ----------
  // manual control queues stops: tap floors in the order you want them; tap a queued floor again to cancel it
  function send(car, f) {
    if (S.state !== 'play') return;
    if (car.target === f) { car.target = car.stops.shift() ?? null; Snd.cancel(); return; }
    const i = car.stops.indexOf(f); if (i >= 0) { car.stops.splice(i, 1); Snd.cancel(); return; }
    if (car.target === null) car.target = f; else car.stops.push(f);
    Snd.beep(f);
  }
  // hold a floor to park: an idle lift (no stops, manual) goes and waits there; hold it again to unpark
  function park(car, f) { if (S.state !== 'play') return; car.park = car.park === f ? null : f; Snd.park(); }
  function goNow(car, f) { if (S.state !== 'play') return; car.target = f; car.stops = car.stops.filter(x => x !== f); Snd.beep(f); }
  function setAuto(rule) { S.auto = rule; if (rule) S.cars.forEach(c => { c.stops = []; }); }
  function arrive(car, f) {
    car.door = DOOR; car.target = null; Snd.ding();
    const off = car.riders.filter(p => p.to === f); car.riders = car.riders.filter(p => p.to !== f);
    for (const p of off) { S.delivered++; S.pops.push({ t: S.t, f, car: car.id }); }
    const here = S.waiting.filter(p => p.from === f);
    for (const p of here) { if (car.riders.length >= CAP) break; car.riders.push(p); S.waits.push(S.clock - p.at); S.maxWait = Math.max(S.maxWait, S.clock - p.at); p.on = true; }
    S.waiting = S.waiting.filter(p => !p.on);
  }
  function cars(dt) {
    for (const c of S.cars) {
      if (c.door > 0) { c.door -= dt; continue; }
      if (S.auto && c.target === null) {
        const here = Math.round(c.y);   // people waiting right where the doors are: let them on first
        if (c.riders.length < CAP && S.waiting.some(p => p.from === here) && !S.cars.some(o => o !== c && Math.abs(o.y - here) < .01 && o.door > 0)) { arrive(c, here); continue; }
        c.target = pick(c, S.auto);
      }
      if (!S.auto && c.target === null && c.stops.length) c.target = c.stops.shift();
      if (!S.auto && c.target === null && c.park !== null && Math.abs(c.y - c.park) > .01) c.target = c.park;
      if (c.target === null) continue;
      // a queued floor on the way gets served on the way, like a real car call
      if (!S.auto) { const on = c.stops.filter(f => (f - c.y) * Math.sign(c.target - c.y) > .02 && Math.abs(f - c.y) < Math.abs(c.target - c.y)).sort((a, b) => Math.abs(a - c.y) - Math.abs(b - c.y))[0];
        if (on !== undefined) { c.stops.splice(c.stops.indexOf(on), 1); c.stops.unshift(c.target); c.target = on; } }
      const d = c.target - c.y;
      if (Math.abs(d) <= SPEED * dt) { c.y = c.target; arrive(c, c.target); }
      else { c.y += Math.sign(d) * SPEED * dt; c.dir = Math.sign(d); }
    }
  }
  // the two rules. requests = floors with someone waiting, plus floors this lift's riders want
  function requests(c) {
    const fs = new Set(c.riders.map(p => p.to));
    for (const p of S.waiting) if (!S.cars.some(o => o !== c && o.target === p.from)) fs.add(p.from);   // leave calls another lift is already heading to
    return [...fs];
  }
  function pick(c, rule) {
    // a full lift can only serve its riders' floors; and it never "goes" to the floor it is already standing at
    const full = c.riders.length >= CAP, here = Math.round(c.y);
    const fs = requests(c).filter(f => (!full || c.riders.some(p => p.to === f)) && !(f === here && Math.abs(c.y - here) < .01)); if (!fs.length) return null;
    if (rule === 'nearest') return fs.sort((a, b) => Math.abs(a - c.y) - Math.abs(b - c.y) || a - b)[0];
    // sweep: nearest request ahead in the current direction; if none, turn around
    const ahead = fs.filter(f => (f - c.y) * c.dir >= 0).sort((a, b) => Math.abs(a - c.y) - Math.abs(b - c.y));
    if (ahead.length) return ahead[0];
    c.dir = -c.dir; return fs.sort((a, b) => Math.abs(a - c.y) - Math.abs(b - c.y))[0];
  }
  function people(dt) {
    S.nextP -= dt;
    while (S.nextP <= 0) { const [from, to] = S.L.traffic(S.rng, S.L.floors); S.waiting.push({ from, to, at: S.clock, id: Math.floor(S.rng() * 1e9) }); S.nextP += -Math.log(1 - S.rng()) / S.L.rate; Snd.call(); }
    for (const p of S.waiting) if (S.clock - p.at > PATIENCE) { p.gone = true; S.hearts--; S.maxWait = Math.max(S.maxWait, PATIENCE); S.pops.push({ t: S.t, f: p.from, stairs: true }); Snd.huff(); }
    S.waiting = S.waiting.filter(p => !p.gone);
  }
  function update(dt) {
    S.t += dt; S.lt += dt;
    if (S.state === 'intro') { if (API.autopilot && !paused()) { start(); S.auto = API.autopilot; } return; }
    if (S.state !== 'play') { S.endT += dt; return; }
    S.clock += dt; if (S.auto) S.usedAuto = true; people(dt); cars(dt);
    if (S.delivered >= S.L.goal) { S.state = 'win'; S.endT = 0; Audio.sfx('win'); pause(); }
    else if (S.hearts <= 0 || S.clock >= S.L.time) { S.state = 'lost'; S.why = S.hearts <= 0 ? 'THREE PEOPLE TOOK THE STAIRS' : 'THE DAY ENDED'; S.endT = 0; Audio.sfx('fail'); pause(); }
  }

  // ---------- sound ----------
  const Snd = {
    ding() { Audio.tone(1568, .5, 'sine', .1); Audio.tone(1319, .6, 'sine', .08, null, .12); },
    beep(f) { Audio.tone(700 + f * 40, .05, 'square', .05); },
    cancel() { Audio.tone(300, .06, 'square', .04); },
    park() { Audio.tone(520, .08, 'sine', .07); Audio.tone(390, .12, 'sine', .07, null, .08); },
    call() { Audio.tone(1200, .03, 'sine', .04); },
    huff() { Audio.noise(.3, .15); Audio.tone(200, .3, 'sawtooth', .06, 120); },
  };

  // ---------- drawing ----------
  let ctx;
  const SHAFT0 = 250, SHAFTW = 70, SHAFTGAP = 16;
  const shaftX = k => SHAFT0 + k * (SHAFTW + SHAFTGAP) - (S.L.cars - 1) * (SHAFTW + SHAFTGAP) / 2 + 40;
  function stick(x, y, col, s = 1, up = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; Draw.circ(ctx, 0, -22, 5); ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(0, -6); ctx.moveTo(0, -6); ctx.lineTo(-4, 2); ctx.moveTo(0, -6); ctx.lineTo(4, 2); ctx.moveTo(0, -14); ctx.lineTo(-5, -9); ctx.moveTo(0, -14); ctx.lineTo(5, -9); ctx.stroke(); ctx.restore(); }
  function building() {
    const F = S.L.floors, fh = FH();
    ctx.fillStyle = '#c8d8f0'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(14, TOP - 10, W - 28, BOT - TOP + 20);
    for (let f = 0; f < F; f++) {
      const y = floorY(f);
      ctx.fillStyle = f % 2 ? '#efe8da' : '#e4dccb'; ctx.fillRect(14, y - fh / 2, W - 28, fh);
      ctx.fillStyle = '#9a8a6a'; ctx.fillRect(14, y + fh / 2 - 3, W - 28, 3);
      ctx.font = `800 ${Math.min(20, fh * .45)}px system-ui`; ctx.fillStyle = '#5a4a3a'; ctx.textAlign = 'left'; ctx.fillText(f === 0 ? 'L' : String(f), 24, y + 7);
      // who is waiting here, and how annoyed
      const here = S.waiting.filter(p => p.from === f);
      here.slice(0, 7).forEach((p, k) => { const w = S.clock - p.at, col = w > ANGRY ? '#e02a2a' : w > ANGRY / 2 ? '#e09a2a' : '#3a5a8a'; stick(64 + k * 18, y + fh / 2 - 4, col, Math.min(1, fh / 48)); });
      if (here.length > 7) { ctx.font = '800 14px system-ui'; ctx.fillStyle = '#5a4a3a'; ctx.fillText('+' + (here.length - 7), 64 + 7 * 18, y + 5); }
      const oldest = here.reduce((m, p) => Math.max(m, S.clock - p.at), 0);
      if (here.length) { const up = here.some(p => p.to > f), dn = here.some(p => p.to < f); ctx.font = `800 ${Math.min(16, fh * .4)}px system-ui`; ctx.textAlign = 'left'; ctx.fillStyle = '#2a5ac0'; ctx.fillText((up ? '▲' : '') + (dn ? '▼' : ''), 190, y - fh / 2 + 14); }
      if (here.length) { ctx.fillStyle = '#0002'; Draw.rr(ctx, 64, y - fh / 2 + 4, 120, 5, 2); ctx.fill(); ctx.fillStyle = oldest > ANGRY ? '#e02a2a' : '#3a8a3a'; Draw.rr(ctx, 64, y - fh / 2 + 4, 120 * (1 - oldest / PATIENCE), 5, 2); ctx.fill(); }
      // destination lamps: a floor any rider wants lights up on the right
      const want = S.cars.some(c => c.riders.some(p => p.to === f));
      ctx.fillStyle = want ? '#ffd23a' : '#0001'; Draw.circ(ctx, W - 44, y, Math.min(11, fh * .25));
      if (want) { ctx.fillStyle = '#5a4a3a'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(S.cars.reduce((n, c) => n + c.riders.filter(p => p.to === f).length, 0), W - 44, y + 4); }
    }
    // shafts and cars
    S.cars.forEach((c, k) => {
      const x = shaftX(k);
      ctx.fillStyle = '#5a5a6a'; ctx.fillRect(x - SHAFTW / 2, TOP - 10, SHAFTW, BOT - TOP + 20);
      if (c.park !== null) { ctx.fillStyle = '#3a7ad0'; Draw.rr(ctx, x - SHAFTW / 2 - 26, floorY(c.park) - 11, 22, 22, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('P', x - SHAFTW / 2 - 15, floorY(c.park) + 5); }
      c.stops.forEach((f, i) => { ctx.fillStyle = '#ffd23a'; Draw.circ(ctx, x + SHAFTW / 2 + 12, floorY(f), 10); ctx.fillStyle = '#1a2a4a'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(i + 2, x + SHAFTW / 2 + 12, floorY(f) + 4); });
      if (c.target !== null && !S.auto) { ctx.fillStyle = '#ff9a2a'; Draw.circ(ctx, x + SHAFTW / 2 + 12, floorY(c.target), 10); ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(1, x + SHAFTW / 2 + 12, floorY(c.target) + 4); }
      if (c.target !== null) { ctx.strokeStyle = '#ffd23a'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, floorY(c.y)); ctx.lineTo(x, floorY(c.target)); ctx.stroke(); ctx.setLineDash([]); }
      const y = floorY(c.y), hh = fh * .86, open = c.door > 0 ? Math.sin(clamp(c.door / DOOR) * Math.PI) : 0;
      ctx.fillStyle = k === S.sel && S.L.cars > 1 ? '#ffe9a0' : '#d8d8e0'; Draw.rr(ctx, x - SHAFTW / 2 + 4, y - hh / 2, SHAFTW - 8, hh, 6); ctx.fill();
      ctx.strokeStyle = k === S.sel && S.L.cars > 1 ? '#ff9a2a' : '#8a8a9a'; ctx.lineWidth = 3; ctx.stroke();
      c.riders.slice(0, 6).forEach((p, i) => stick(x - 20 + (i % 3) * 20, y + hh / 2 - 4 - Math.floor(i / 3) * 6, '#3a5a8a', Math.min(.8, fh / 60)));
      const dw = (SHAFTW - 8) / 2 * (1 - open); ctx.fillStyle = '#9aa0b0cc'; ctx.fillRect(x - SHAFTW / 2 + 4, y - hh / 2, dw, hh); ctx.fillRect(x + SHAFTW / 2 - 4 - dw, y - hh / 2, dw, hh);
      ctx.font = '800 12px system-ui'; ctx.fillStyle = '#1a1a2a'; ctx.textAlign = 'center'; ctx.fillText(`${c.riders.length}/${CAP}`, x, y - hh / 2 + 13);
    });
    for (const p of S.pops) { const k = (S.t - p.t) / 1; if (k > 0 && k < 1) { ctx.globalAlpha = 1 - k; Draw.bigText(ctx, p.stairs ? 'TOOK THE STAIRS' : '+1', p.stairs ? 150 : W - 90, floorY(p.f) - k * 30, p.stairs ? 18 : 24, p.stairs ? '#e02a2a' : '#2a9a3a', '#fff'); ctx.globalAlpha = 1; } }
  }
  const AUTO = [{ x: 20, y: H - 84, w: 160, h: 64, rule: null, label: 'MANUAL' }, { x: 190, y: H - 84, w: 160, h: 64, rule: 'nearest', label: 'AUTO: NEAREST' }, { x: 360, y: H - 84, w: 160, h: 64, rule: 'sweep', label: 'AUTO: SWEEP' }];
  function hud() {
    Draw.bigText(ctx, `${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 66, 26, '#1a2a4a', '#fff');
    const hh = Math.floor(9 + S.clock / S.L.time * 8), mm = Math.floor((S.clock / S.L.time * 8 * 60) % 60);
    ctx.font = '800 18px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#1a2a4a';
    ctx.fillText(`🕘 ${hh > 12 ? hh - 12 : hh}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`, 24, 112);
    ctx.textAlign = 'center'; ctx.fillText(`DELIVERED ${S.delivered}/${S.L.goal}`, W / 2, 112);
    ctx.textAlign = 'right'; ctx.fillStyle = '#e02a2a'; ctx.fillText('♥'.repeat(Math.max(0, S.hearts)) + '♡'.repeat(3 - Math.max(0, S.hearts)), W - 24, 112);
    ctx.font = '700 13px system-ui'; ctx.fillStyle = '#3a4a6a'; ctx.textAlign = 'center'; ctx.fillText(`LONGEST WAIT ${Math.round(S.maxWait)} s · PEOPLE GIVE UP AT ${PATIENCE} s`, W / 2, 140);
    for (const b of AUTO) { const on = S.auto === b.rule; ctx.fillStyle = on ? '#3a7ad0' : '#ffffffcc'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 18); ctx.fill(); ctx.strokeStyle = '#3a7ad0'; ctx.lineWidth = 3; ctx.stroke(); ctx.font = '800 15px system-ui'; ctx.fillStyle = on ? '#fff' : '#1a2a4a'; ctx.textAlign = 'center'; ctx.fillText(b.label, b.x + b.w / 2, b.y + 38); }
  }
  function wrapText(s, x, y, maxW, lh, font, col) { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y; for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; } ctx.fillText(line, x, yy); }
  function card(title, col, lines, prompt) {
    ctx.fillStyle = '#0a1a3aee'; ctx.fillRect(0, 0, W, H);
    Draw.bigText(ctx, title, W / 2, 260, 48, col);
    lines.forEach((l, i) => wrapText(l, W / 2, 350 + i * 90, 440, 30, '700 21px system-ui', '#d8e4ff'));
    if (!paused()) { ctx.globalAlpha = .6 + .4 * Math.sin(S.t * 4); Draw.bigText(ctx, prompt, W / 2, 760, 30, '#fff'); ctx.globalAlpha = 1; }
  }
  function render(c) {
    ctx = c;
    if (S.state === 'done') { ctx.fillStyle = '#0a1a3a'; ctx.fillRect(0, 0, W, H); card('5 PM', '#ffe14a', ['EVERYONE GOT WHERE THEY WERE GOING.', 'DEMO COMPLETE'], 'TAP FOR THE DISC MENU'); return; }
    building(); hud();
    if (S.state === 'intro') card(`DAY ${S.li + 1}: ${S.L.name}`, '#ffe14a', [S.L.tip, `DELIVER ${S.L.goal} PEOPLE. NOBODY WAITS ${PATIENCE} SECONDS.`], 'TAP TO OPEN THE DOORS');
    if (S.state === 'lost') card(S.why, '#ff8a8a', [`LONGEST WAIT ${Math.round(S.maxWait)} s.`], 'TAP TO TRY AGAIN');
    if (S.state === 'win') {
      const avg = S.waits.length ? S.waits.reduce((a, b) => a + b, 0) / S.waits.length : 0, stars = Math.min(S.usedAuto ? 2 : 3, S.maxWait < 20 ? 3 : S.maxWait < 32 ? 2 : 1);
      card('SHIFT DONE!', '#7af08a', [`AVERAGE WAIT ${avg.toFixed(1)} s · LONGEST ${Math.round(S.maxWait)} s`, S.usedAuto ? 'STARS GO BY THE LONGEST WAIT. AUTO CAPS YOU AT TWO.' : 'STARS GO BY THE LONGEST WAIT, NOT THE AVERAGE.'], S.li < LEVELS.length - 1 ? 'TAP FOR THE NEXT DAY' : 'TAP TO FINISH');
      for (let i = 0; i < 3; i++) { const kk = back(clamp((S.endT - .3 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 80, 640); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 30, i < stars ? '#ffd23a' : '#3a4a6a'); ctx.restore(); } }
    }
  }

  // ---------- input: tap a lift to pick it, tap a floor to send it; AUTO switches ----------
  const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; pause(); } }
  let press = null;
  function onPointer(type, x, y) {
    if (type === 'up' && press) { const p = press; press = null; if (S.state !== 'play') return; setAuto(null); (S.t - p.t >= HOLD ? park : send)(S.cars[S.sel], p.f); return; }
    if (type === 'cancel') press = null;
    if (type !== 'down' || paused()) return;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'intro') { start(); return; }
    if (S.state === 'lost') { load(S.li); return; }
    if (S.state === 'win') { if (S.endT > 1) next(); return; }
    for (const b of AUTO) if (hit(b, x, y)) { setAuto(b.rule); Audio.sfx('select'); return; }
    for (const c of S.cars) { const sx = shaftX(c.id); if (Math.abs(x - sx) < SHAFTW / 2 && Math.abs(y - floorY(c.y)) < FH() / 2) { S.sel = c.id; Audio.sfx('select'); return; } }
    if (y > TOP - 10 && y < BOT + 10) press = { f: clamp(Math.floor((BOT - y) / FH()), 0, S.L.floors - 1), t: S.t };
  }
  function onKey(key, down) {
    if (!down || paused()) return;
    if (key === 'Enter' || key === ' ') { if (S.state === 'done') Engine.exit(); else if (S.state === 'intro') start(); else if (S.state === 'lost') load(S.li); else if (S.state === 'win' && S.endT > 1) next(); return; }
    if (S.state !== 'play') return;
    if (key === 'Tab') { S.sel = (S.sel + 1) % S.L.cars; return; }
    const c = S.cars[S.sel];
    if (key === 'ArrowUp') { setAuto(null); goNow(c, Math.min(S.L.floors - 1, (c.target ?? Math.round(c.y)) + 1)); }
    if (key === 'ArrowDown') { setAuto(null); goNow(c, Math.max(0, (c.target ?? Math.round(c.y)) - 1)); }
    if (key === 'n' || key === 'N') setAuto('nearest');
    if (key === 's' || key === 'S') setAuto('sweep');
    if (key === 'm' || key === 'M') setAuto(null);
    if (key === 'p' || key === 'P') park(c, Math.round(c.y));
  }
  window.addEventListener('keydown', e => { if (e.key === 'Tab') e.preventDefault(); });

  const API = { LEVELS, S, load, start, send, goNow, setAuto, park, pick, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
