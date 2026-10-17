// LOBBY - playable demo.
// The ad is a battle royale with ten million players and a screaming streamer. The game is the green-screen
// terminal behind it: you are the matchmaker. Players queue with a skill from 1 to 9; tap a lobby's worth
// of them and hit MATCH. A player is happy when the lobby's skill spread is inside their window, and the
// window widens the longer they wait (that is how real matchmakers trade quality for queue time). Wait too
// long and they rage-quit. On launch day the ad's ten million show up and you have three servers.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const W = 540, H = 960;
  const GREEN = '#39ff7a', DIM = '#1a8a44', DARK = '#0b3a1e', BG = '#020c06', RED = '#ff5a4a', AMBER = '#ffcf4a';

  // ---------- rules (pure) ----------
  const tol = wait => Math.min(8, 1 + Math.floor(wait / 8));          // the skill spread a player accepts after waiting
  const LEVELS = [
    { name: 'NIGHT SHIFT', n: 2, gap: 3.0, len: 45, servers: 9, dur: 6, regions: false, party: 0, need: 8, quits: 2,
      tip: 'TWO PLAYERS PER MATCH. TAP TWO OF A SIMILAR SKILL, THEN MATCH.' },
    { name: 'AFTER SCHOOL', n: 4, gap: 1.3, len: 60, servers: 9, dur: 8, regions: false, party: 0, need: 24, quits: 4,
      tip: 'FOUR PER LOBBY. A PLAYER\'S WINDOW (±) WIDENS AS THEY WAIT. TOO LONG AND THEY QUIT.' },
    { name: 'TWO CONTINENTS', n: 4, gap: 1.1, len: 60, servers: 9, dur: 8, regions: true, party: 0, need: 26, quits: 5,
      tip: 'EU AND NA. MIX THEM AND EVERYONE LAGS: NOBODY IN THAT LOBBY IS HAPPY.' },
    { name: 'BRING A FRIEND', n: 4, gap: 1.4, len: 60, servers: 9, dur: 8, regions: false, party: .4, need: 24, quits: 5,
      tip: 'PARTIES (A, B, C...) QUEUE TOGETHER AND PLAY TOGETHER. TAP ONE, YOU GET BOTH.' },
    { name: 'LAUNCH DAY', n: 4, gap: .55, len: 60, servers: 3, dur: 12, regions: false, party: .2, need: 40, quits: 99,
      tip: 'THE AD SAID TEN MILLION PLAYERS. YOU HAVE THREE SERVERS. MAKE THE MATCHES YOU CAN.' },
  ];
  function rng(s) { return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const PRE = ['xX_', '', 'lil', 'big', 'not', 'the', '', 'mr', 'its'], MID = ['d00m', 'sk8r', 'n00b', 'gamer', 'pro', 'tank', 'sweat', 'camper', 'yeet', 'bot', 'goblin', 'ghost', 'toast', 'noodle', 'clutch', 'lag', 'grandma', 'potato'], SUF = ['_Xx', '99', '2009', '_ttv', 'HD', '_YT', '7', '', '', '_irl'];
  function arrivals(li) {
    const L = LEVELS[li], r = rng(1000 + li * 77), out = []; let t = .8, id = 0, pi = 0;
    const name = () => (PRE[Math.floor(r() * PRE.length)] + MID[Math.floor(r() * MID.length)] + SUF[Math.floor(r() * SUF.length)]).slice(0, 14);
    const skill = () => 1 + Math.min(8, Math.floor((r() + r() + r()) / 3 * 9));   // bunched in the middle, like real ratings
    while (t < L.len - 2) {
      const reg = L.regions && r() < .5 ? 'NA' : 'EU', pat = 24 + Math.floor(r() * 18);
      if (L.party && r() < L.party) {
        const s = skill(), tag = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[pi++ % 26];
        out.push({ id: id++, name: name(), skill: s, reg, at: t, pat, party: tag });
        out.push({ id: id++, name: name(), skill: Math.max(1, Math.min(9, s + (r() < .5 ? -1 : 1))), reg, at: t, pat, party: tag });
      } else out.push({ id: id++, name: name(), skill: skill(), reg, at: t, pat, party: null });
      t += -Math.log(1 - r()) * L.gap;
    }
    return out;
  }
  // who in this group would be happy if it were matched at time `now`
  function verdict(group, now, L) {
    const sk = group.map(p => p.skill), spread = Math.max(...sk) - Math.min(...sk);
    const mixed = L.regions && new Set(group.map(p => p.reg)).size > 1;
    const happy = group.filter(p => !mixed && spread <= tol(now - p.at)).length;
    return { spread, mixed, happy };
  }
  const units = q => { const m = new Map(); for (const p of q) { const k = p.party ? 'p' + p.party + p.at : 'i' + p.id; if (!m.has(k)) m.set(k, []); m.get(k).push(p); } return [...m.values()]; };
  // every way to fill one lobby from the queue's units (parties stay whole)
  function lobbies(q, n) {
    const us = units(q), out = [];
    (function rec(i, pick, size) {
      if (size === n) { out.push(pick.flat()); return; }
      if (i >= us.length || out.length > 6000) return;
      if (size + us[i].length <= n) rec(i + 1, [...pick, us[i]], size + us[i].length);
      rec(i + 1, pick, size);
    })(0, [], 0);
    return out;
  }

  // ---------- state ----------
  const S = { li: 0, L: null, state: 'intro', t: 0, clock: 0, lockUntil: 0, incoming: [], queue: [], sel: new Set(), servers: [], log: [],
    happy: 0, matched: 0, quits: 0, unhappy: 0, flash: null, cursor: 0, ap: 0, endT: 0, boot: 0, sort: 'arrival' };
  const API = { S, LEVELS, tol, verdict, lobbies, arrivals, autopilot: null, step: n => game.step(n),
    get state() { return S.state; }, visible: () => visible(), resort, fits, load, start, tap: (x, y) => onPointer('down', x, y), match, toggle,
    result: () => ({ happy: S.happy, matched: S.matched, quits: S.quits, unhappy: S.unhappy, pass: passed(), stars: stars() }) };
  function load(i) {
    const L = LEVELS[i];
    Object.assign(S, { li: i, L, state: 'intro', clock: 0, incoming: arrivals(i), queue: [], sel: new Set(), servers: Array(Math.min(L.servers, 9)).fill(0),
      log: [], happy: 0, matched: 0, quits: 0, unhappy: 0, flash: null, cursor: 0, ap: 0, endT: 0, boot: 0 });
    pause(); API.autopilot = null;
  }
  function pause() { S.lockUntil = S.t + .6; }
  const paused = () => S.t < S.lockUntil;
  function start() { if (S.state !== 'intro') return; S.state = 'play'; pause(); Snd.boot(); }
  const passed = () => S.happy >= S.L.need && S.quits <= S.L.quits;
  function stars() { if (!passed()) return 0; const f = S.happy / Math.max(1, S.matched + S.quits); return f >= .8 ? 3 : f >= .6 ? 2 : 1; }
  function say(s, col = GREEN) { S.log.push({ s, col }); if (S.log.length > 5) S.log.shift(); }
  // the queue as shown: by arrival, or by skill (ties: whoever has waited longest first) so close skills sit together
  const visible = () => (S.sort === 'skill' ? S.queue.slice().sort((a, b) => a.skill - b.skill || a.at - b.at) : S.queue).slice(0, ROWS);
  function resort() { S.sort = S.sort === 'skill' ? 'arrival' : 'skill'; Snd.key(); }
  // would adding p (and their party) keep every selected player happy right now? null when it doesn't apply
  function fits(p) {
    if (!S.sel.size || S.sel.has(p.id)) return null;
    const mates = p.party ? S.queue.filter(q => q.party === p.party && q.at === p.at) : [p];
    const g = S.queue.filter(q => S.sel.has(q.id)).concat(mates);
    if (g.length > S.L.n) return null;
    const v = verdict(g, S.clock, S.L); return v.happy === g.length;
  }
  function toggle(p) {
    if (S.state !== 'play' || paused()) return;
    const mates = p.party ? S.queue.filter(q => q.party === p.party && q.at === p.at) : [p];
    if (S.sel.has(p.id)) { mates.forEach(m => S.sel.delete(m.id)); Snd.key(); return; }
    if (S.sel.size + mates.length > S.L.n) { S.flash = { s: 'LOBBY FULL', t: S.t }; Snd.err(); return; }
    mates.forEach(m => S.sel.add(m.id)); Snd.key();
  }
  function match() {
    if (S.state !== 'play' || paused()) return false;
    const g = S.queue.filter(p => S.sel.has(p.id));
    if (g.length !== S.L.n) { S.flash = { s: `NEED ${S.L.n} PLAYERS`, t: S.t }; Snd.err(); return false; }
    const k = S.servers.findIndex(f => f <= S.clock);
    if (k < 0) { S.flash = { s: 'NO FREE SERVER', t: S.t }; Snd.err(); return false; }
    const v = verdict(g, S.clock, S.L);
    S.servers[k] = S.clock + S.L.dur; S.queue = S.queue.filter(p => !S.sel.has(p.id)); S.sel.clear();
    S.happy += v.happy; S.unhappy += g.length - v.happy; S.matched += g.length;
    const what = v.mixed ? 'LAG. EVERYONE IS MAD' : v.happy === g.length ? 'GG' : v.spread >= 5 ? 'STOMP' : `${g.length - v.happy} SALTY`;
    say(`> MATCH SRV${k + 1} SPREAD ${v.spread}  ${what}`, v.happy === g.length ? GREEN : v.happy ? AMBER : RED);
    v.happy === g.length ? Snd.gg() : Snd.meh();
    return true;
  }

  // ---------- autopilot (tests): 'smart' waits for lobbies that please everyone; 'fifo' takes the queue in order ----------
  function autopilot() {
    if ((S.ap += 1) % 15) return;                      // decide four times a second
    if (S.servers.every(f => f > S.clock) || S.queue.length < S.L.n) return;
    let pick = null;
    if (API.autopilot === 'fifo') { const g = []; for (const u of units(S.queue)) if (g.length + u.length <= S.L.n) g.push(...u); if (g.length === S.L.n) pick = g; }
    else {
      let best = null;
      for (const g of lobbies(S.queue, S.L.n)) {
        const v = verdict(g, S.clock, S.L), urgent = g.some(p => S.clock - p.at >= p.pat - 3), old = g.reduce((a, p) => a + S.clock - p.at, 0);
        const key = v.happy * 1000 + old;
        if (!best || key > best.key) best = { key, g, v, urgent };
      }
      if (best && (best.v.happy === S.L.n || (best.urgent && best.v.happy >= S.L.n - 1) || S.queue.length > 3 * S.L.n && best.v.happy >= S.L.n - 1)) pick = best.g;
    }
    if (!pick) return;
    S.sel = new Set(pick.map(p => p.id)); match();
  }

  function update(dt) {
    S.t += dt;
    if (S.state === 'intro') { S.boot += dt; if (API.autopilot && !paused()) start(); return; }
    if (S.state === 'report') { S.endT += dt; return; }
    S.clock += dt;
    while (S.incoming.length && S.incoming[0].at <= S.clock) { S.queue.push(S.incoming.shift()); Snd.arrive(); }
    for (const p of S.queue) if (S.clock - p.at >= p.pat && !p.gone) {
      const mates = p.party ? S.queue.filter(q => q.party === p.party && q.at === p.at) : [p];
      mates.forEach(m => { m.gone = true; S.sel.delete(m.id); }); S.quits += mates.length;
      say(`X ${p.name}${mates.length > 1 ? ' +1' : ''} RAGE-QUIT`, RED); Snd.quit();
    }
    S.queue = S.queue.filter(p => !p.gone);
    if (API.autopilot && !paused()) autopilot();
    if (S.clock >= S.L.len) { S.state = 'report'; S.endT = 0; S.sel.clear(); pause(); passed() ? Audio.sfx('win') : Audio.sfx('fail'); }
  }

  // ---------- sound: a terminal's clicks and beeps ----------
  const Snd = {
    key() { Audio.noise(.015, .1); Audio.tone(2200, .012, 'square', .02); },
    err() { Audio.tone(110, .18, 'square', .09); },
    arrive() { Audio.tone(1500, .03, 'sine', .025); },
    gg() { Audio.tone(880, .07, 'sine', .1); Audio.tone(1320, .12, 'sine', .1, null, .07); },
    meh() { Audio.tone(660, .08, 'sine', .08); Audio.tone(520, .14, 'sine', .08, null, .08); },
    quit() { Audio.tone(440, .3, 'sawtooth', .05, 110); },
    boot() { [0, .06, .12, .18].forEach((d, i) => Audio.tone(600 + i * 300, .04, 'square', .04, null, d)); },
  };

  // ---------- drawing: everything is monospace text on a phosphor screen ----------
  const FONT = "bold 19px 'Courier New', Courier, monospace", ROWS = 11, ROW0 = 168, RH = 38;
  let CW = 11.4;
  const BTN = { match: [24, 660, 230, 56], clear: [286, 660, 230, 56], sort: [376, 86, 146, 36] };
  function T(c, s, x, y, col = GREEN) { c.fillStyle = col; c.fillText(s, x, y); }
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function box(c, [x, y, w, h], label, on) {
    c.strokeStyle = on ? GREEN : DIM; c.lineWidth = 2; c.strokeRect(x + .5, y + .5, w, h);
    if (on) { c.fillStyle = DARK; c.fillRect(x + 3, y + 3, w - 5, h - 5); }
    T(c, label, x + w / 2 - label.length * CW / 2, y + h / 2 + 1, on ? GREEN : DIM);
  }
  function render(c) {
    c.fillStyle = BG; c.fillRect(0, 0, W, H);
    c.font = FONT; c.textBaseline = 'middle'; CW = c.measureText('M').width;
    c.save(); c.shadowColor = GREEN; c.shadowBlur = 6;
    const L = S.L;
    T(c, `LOBBY v0.9 // MATCHMAKER`, 18, 70); T(c, `SHIFT ${S.li + 1}/${LEVELS.length}`, W - 18 - 9 * CW, 70, DIM);
    if (S.state === 'intro') drawIntro(c);
    else if (S.state === 'report') drawReport(c);
    else drawPlay(c);
    c.restore();
    // CRT: scanlines, vignette, a faint roll bar
    c.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
    const roll = (S.t * 90) % (H + 200) - 100; c.fillStyle = 'rgba(57,255,122,.035)'; c.fillRect(0, roll, W, 70);
    const g = c.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.7)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function drawIntro(c) {
    const L = S.L, lines = ['> BOOT MATCHMAKER.EXE', '> 10,000,000 PLAYERS WANT A GAME.', '> YOU ARE THE ONE WHO PICKS IT.', '', `> SHIFT ${S.li + 1}: ${L.name}`, ''];
    const tip = wrap(L.tip, 40), shown = Math.floor(S.boot * 110);
    let k = 0, y = 150;
    for (const s of [...lines, ...tip]) { const vis = s.slice(0, Math.max(0, shown - k)); k += s.length + 4; T(c, vis, 24, y, s.startsWith('> SHIFT') ? AMBER : GREEN); y += 34; }
    y += 20;
    T(c, `GOAL: ${L.need} HAPPY PLAYERS`, 24, y); y += 34;
    if (L.quits < 99) { T(c, `      ${L.quits} RAGE-QUITS MAX`, 24, y); y += 34; }
    T(c, `SERVERS ${L.servers}   MATCH ${L.dur}s   LOBBY ${L.n}`, 24, y, DIM);
    if (!paused() && Math.floor(S.t * 2) % 2) T(c, '[ TAP TO START SHIFT ]_', W / 2 - 11.5 * CW, 820);
  }
  function wrap(s, n) { const out = []; let cur = ''; for (const w of s.split(' ')) { if ((cur + ' ' + w).trim().length > n) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) out.push(cur.trim()); return out; }
  function drawPlay(c) {
    const L = S.L, free = S.servers.filter(f => f <= S.clock).length;
    T(c, `T-${mmss(Math.max(0, L.len - S.clock))}  QUEUE ${String(S.queue.length).padStart(2)}  HAPPY ${S.happy}/${L.need}`, 18, 104, GREEN);
    T(c, `SERVERS FREE ${free}/${S.servers.length}   QUITS ${S.quits}${L.quits < 99 ? '/' + L.quits : ''}`, 18, 130, S.quits > L.quits ? RED : DIM);
    T(c, '  PLAYER         SK SKILL     WAIT  ±' + (L.regions ? ' RG' : '') + (L.party ? ' P' : ''), 18, 152, DIM);
    const vis = visible();
    vis.forEach((p, i) => {
      const y = ROW0 + i * RH + RH / 2, w = S.clock - p.at, sel = S.sel.has(p.id), late = p.pat - w < 6;
      if (sel) { c.fillStyle = DARK; c.fillRect(12, y - RH / 2 + 3, W - 24, RH - 6); }
      if (i === S.cursor) { c.strokeStyle = DIM; c.strokeRect(12.5, y - RH / 2 + 3.5, W - 25, RH - 7); }
      const bar = '#'.repeat(p.skill) + '.'.repeat(9 - p.skill);
      const row = `${sel ? '>' : ' '} ${pad(p.name, 14)} ${p.skill}  ${bar} ${mmss(w).padStart(4)} ${tol(w)}` + (L.regions ? ' ' + p.reg : '') + (L.party ? ' ' + (p.party || ' ') : '');
      T(c, row, 18, y, late ? RED : sel ? '#c8ffdc' : GREEN);
      // with a lobby started, mark who would keep everyone in it happy if added now
      const f = fits(p); if (f !== null) T(c, f ? '✓' : '·', W - 30, y, f ? '#c8ffdc' : DIM);
    });
    if (S.queue.length > ROWS) T(c, `  ... +${S.queue.length - ROWS} MORE IN QUEUE`, 18, ROW0 + ROWS * RH + 8, AMBER);
    // the lobby being built
    const g = S.queue.filter(p => S.sel.has(p.id));
    let ly = 648 - 22;
    if (g.length) {
      const v = verdict(g, S.clock, L);
      T(c, `LOBBY ${g.length}/${L.n}  SPREAD ${v.spread}${v.mixed ? '  MIXED REGIONS' : ''}  HAPPY ${v.happy}/${g.length}`, 18, ly, v.mixed || v.happy < g.length ? AMBER : GREEN);
    } else T(c, `LOBBY 0/${L.n}  TAP ${L.n} PLAYERS`, 18, ly, DIM);
    box(c, BTN.sort, S.sort === 'skill' ? 'BY SKILL' : 'BY ARRIVAL', S.sort === 'skill'); box(c, BTN.match, '[ MATCH ]', g.length === L.n); box(c, BTN.clear, '[ CLEAR ]', g.length > 0);
    // servers
    let sx = 18; T(c, 'SRV', sx, 744, DIM); sx += 4 * CW;   // each server shows the seconds its match has left
    S.servers.forEach(f => { const busy = f > S.clock; T(c, busy ? `[${Math.min(9, Math.ceil(f - S.clock))}]` : '[ ]', sx, 744, busy ? GREEN : DIM); sx += 3.6 * CW; });
    S.log.forEach((l, i) => T(c, l.s.slice(0, 44), 18, 786 + i * 30, l.col));
    if (S.flash && S.t - S.flash.t < 1.2) { c.fillStyle = BG; c.fillRect(W / 2 - 150, 560, 300, 50); c.strokeStyle = RED; c.strokeRect(W / 2 - 150, 560, 300, 50); T(c, S.flash.s, W / 2 - S.flash.s.length * CW / 2, 586, RED); }
  }
  function drawReport(c) {
    const L = S.L, ok = passed(), st = stars();
    const lines = [`> SHIFT ${S.li + 1} REPORT: ${L.name}`, '', `  MATCHED      ${S.matched}`, `  HAPPY        ${S.happy}  (GOAL ${L.need})`, `  SALTY        ${S.unhappy}`,
      `  RAGE-QUITS   ${S.quits}${L.quits < 99 ? '  (MAX ' + L.quits + ')' : ''}`, `  STILL QUEUED ${S.queue.length + S.incoming.length}`, '', ok ? `  RATING  ${'* '.repeat(st)}${'. '.repeat(3 - st)}` : '  RATING  ---'];
    let y = 160; for (const s of lines) { T(c, s, 24, y, s.startsWith('> ') ? AMBER : GREEN); y += 36; }
    const verdictLine = ok ? (S.li === LEVELS.length - 1 ? '> TEN MILLION? WE SERVED ' + S.matched + '. SHIP IT.' : '> SHIFT PASSED. NEXT SHIFT LOADING.') : S.quits > L.quits ? '> TOO MANY RAGE-QUITS. AGAIN.' : '> NOT ENOUGH HAPPY PLAYERS. AGAIN.';
    wrap(verdictLine, 40).forEach((s, i) => T(c, s, 24, y + 20 + i * 34, ok ? GREEN : RED));
    if (!paused() && Math.floor(S.t * 2) % 2) { const s = ok ? (S.li === LEVELS.length - 1 ? '[ TAP TO START OVER ]_' : '[ TAP FOR NEXT SHIFT ]_') : '[ TAP TO RETRY ]_'; T(c, s, W / 2 - s.length * CW / 2, 820); }
  }

  // ---------- input ----------
  const inBox = ([x, y, w, h], px, py) => px >= x && px <= x + w && py >= y && py <= y + h;
  function onPointer(type, x, y) {
    if (type !== 'down' || paused()) return;
    Audio.unlock();
    if (S.state === 'intro') { start(); return; }
    if (S.state === 'report') { load(passed() ? (S.li + 1) % LEVELS.length : S.li); return; }
    if (inBox(BTN.match, x, y)) { match(); return; }
    if (inBox(BTN.sort, x, y)) { resort(); return; }
    if (inBox(BTN.clear, x, y)) { if (S.sel.size) { S.sel.clear(); Snd.key(); } return; }
    const i = Math.floor((y - ROW0) / RH), vis = visible();
    if (y >= ROW0 && i >= 0 && i < vis.length) { S.cursor = i; toggle(vis[i]); }
  }
  function onKey(k, down) {
    if (!down) return;
    if (S.state !== 'play') { if (k === 'Enter' || k === ' ') onPointer('down', 0, 0); return; }
    const n = visible().length;
    if (k === 'ArrowDown') S.cursor = Math.min(n - 1, S.cursor + 1);
    else if (k === 'ArrowUp') S.cursor = Math.max(0, S.cursor - 1);
    else if (k === ' ' || k === 'x') { const p = visible()[S.cursor]; if (p) toggle(p); }
    else if (k === 'Enter') match();
    else if (k === 'c' || k === 'Backspace') S.sel.clear();
    else if (k === 's' || k === 'Tab') resort();
  }

  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
