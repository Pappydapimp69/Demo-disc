// FARO - playable demo.
// The ad is a casino: find the ace, hit the jackpot. The game is a quiet card puzzle about perfect shuffles.
// A faro shuffle cuts the deck exactly in half and interleaves the halves card by card. An OUT faro keeps
// the top card on top; an IN faro tucks it to second. That is all you can do, and it is enough: a magician
// can send the top card to any position by writing the position in binary (1 = IN, 0 = OUT), and eight OUT
// faros put a 52-card deck back in its starting order.
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const W = 540, H = 960;

  // ---------- the shuffles (pure) ----------
  const outFaro = d => { const n = d.length, h = n / 2, r = []; for (let i = 0; i < h; i++) r.push(d[i], d[h + i]); return r; };
  const inFaro = d => { const n = d.length, h = n / 2, r = []; for (let i = 0; i < h; i++) r.push(d[h + i], d[i]); return r; };
  const where = (p, n, kind) => p < n / 2 ? 2 * p + (kind === 'in' ? 1 : 0) : 2 * (p - n / 2) + (kind === 'in' ? 0 : 1);
  const binary = p => p.toString(2).split('').map(b => b === '1' ? 'in' : 'out');   // Elmsley's rule
  const newDeck = n => Array.from({ length: n }, (_, i) => i);
  // fewest shuffles that move the card at position a to position b (search over one card's position)
  function plan(a, b, n) {
    const prev = new Map([[a, null]]), q = [a];
    while (q.length) { const p = q.shift(); if (p === b) break; for (const k of ['out', 'in']) { const np = where(p, n, k); if (!prev.has(np)) { prev.set(np, [p, k]); q.push(np); } } }
    const path = []; let p = b; while (prev.get(p)) { const [pp, k] = prev.get(p); path.unshift(k); p = pp; } return path;
  }
  // fewest shuffles that put several cards in their slots at once (search over the tuple of their positions)
  function planMulti(d, goals, n) {
    const key = ps => ps.join(','), start = goals.map(([c]) => d.indexOf(c)), want = key(goals.map(([, p]) => p));
    const prev = new Map([[key(start), null]]), q = [start];
    while (q.length) { const ps = q.shift(), k = key(ps); if (k === want) break; for (const m of ['out', 'in']) { const np = ps.map(p => where(p, n, m)), nk = key(np); if (!prev.has(nk)) { prev.set(nk, [k, m]); q.push(np); } } }
    if (!prev.has(want)) return null;
    const path = []; let k = want; while (prev.get(k)) { const [pk, m] = prev.get(k); path.unshift(m); k = pk; } return path;
  }
  // every joint position the given cards can reach, with its shuffle distance (for dealing solvable hands)
  function reachable(ps, n) {
    const key = x => x.join(','), seen = new Map([[key(ps), { ps, d: 0 }]]), q = [ps];
    while (q.length) { const x = q.shift(), d = seen.get(key(x)).d; for (const m of ['out', 'in']) { const y = x.map(p => where(p, n, m)); if (!seen.has(key(y))) { seen.set(key(y), { ps: y, d: d + 1 }); q.push(y); } } }
    return [...seen.values()];
  }
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // the house deals forever: goals are drawn only from positions the shuffles can reach, at least 4 shuffles away
  function houseDeal(k) {
    const r = mkRng(9000 + k * 7919), base = LEVELS[LEVELS.length - 1];
    if (k % 3 === 2) {   // a buried ace in a full deck
      const start = Array.from({ length: 3 }, () => r() < .5 ? 'in' : 'out'), d = deal({ n: 52, start });
      const far = reachable([d.indexOf(0)], 52).filter(x => x.d >= 4), g = far[Math.floor(r() * far.length)];
      return { ...base, n: 52, start, goal: { card: 0, pos: g.ps[0] }, tip: 'THE ACE IS ALREADY BURIED. GET IT TO THE GOLD SLOT.' };
    }
    const c2 = 1 + Math.floor(r() * 14), far = reachable([0, c2], 16).filter(x => x.d >= 4), g = far[Math.floor(r() * far.length)];
    return { ...base, n: 16, start: [], goal: { cards: [[0, g.ps[0]], [c2, g.ps[1]]] }, tip: 'TWO CARDS, TWO SLOTS, ONE SEQUENCE.' };
  }
  const goalsOf = L => L.goal.cards || (L.goal.order ? null : [[L.goal.card, L.goal.pos]]);
  const LEVELS = [
    { name: 'THE TOP CARD', n: 8, start: [], goal: { card: 0, pos: 3 }, tip: 'OUT KEEPS THE TOP CARD ON TOP. IN TUCKS IT TO SECOND. PUT THE ACE IN THE GOLD SLOT.' },
    { name: 'SIXTEEN', n: 16, start: [], goal: { card: 0, pos: 9 }, tip: 'SAME ACE, BIGGER DECK. EVERY SHUFFLE ROUGHLY DOUBLES ITS POSITION.' },
    { name: 'THE BOTTOM CARD', n: 16, start: [], goal: { card: 0, pos: 15 }, tip: 'OUT KEEPS THE BOTTOM CARD ON THE BOTTOM TOO. SO HOW DOES THE ACE EVER GET THERE?' },
    { name: 'THE FULL DECK', n: 52, start: [], goal: { card: 0, pos: 37 }, tip: 'MAGICIANS SPELL IT IN BINARY: 37 IS 100101. A 1 IS AN IN, A 0 IS AN OUT.' },
    { name: 'TWO CARDS', n: 16, start: [], goal: { cards: [[0, 9], [5, 3]] }, tip: 'BOTH AT ONCE: THE ACE AND THE 6 OF SPADES INTO THEIR SLOTS. EVERY SHUFFLE MOVES BOTH.' },
    { name: 'NEW DECK ORDER', n: 52, start: ['out', 'out', 'out'], goal: { order: true }, tip: 'SOMEONE DID THREE OUT FAROS. PUT EVERY CARD BACK IN ITS STARTING PLACE.' },
    { name: 'BRING IT HOME', n: 16, start: ['in', 'out', 'in', 'in'], goal: { card: 0, pos: 0 }, tip: 'NOW THE ACE IS BURIED. SHUFFLE IT BACK TO THE TOP.' },
    { name: 'HOUSE DEAL', house: true, n: 16, start: [], goal: { card: 0, pos: 5 }, tip: 'THE HOUSE DEALS FOREVER.' },
  ];
  function deal(L) { let d = newDeck(L.n); for (const k of L.start) d = k === 'in' ? inFaro(d) : outFaro(d); return d; }
  const solved = (L, d) => L.goal.order ? d.every((c, i) => c === i) : goalsOf(L).every(([c, p]) => d[p] === c);
  function par(L) { const d = deal(L); if (L.goal.order) { let k = 0, e = d; while (!e.every((c, i) => c === i)) { e = outFaro(e); k++; } return k; } return planMulti(d, goalsOf(L), L.n).length; }

  const S = { house: 0, li: 0, L: null, deck: [], prev: [], moves: 0, hist: [], state: 'intro', t: 0, lockUntil: 0, anim: null, endT: 0, par: 0, ap: null };
  function load(i) { const L = LEVELS[i].house ? { ...houseDeal(S.house), name: `HOUSE DEAL #${S.house + 1}` } : LEVELS[i]; Object.assign(S, { li: i, L, deck: deal(L), prev: null, moves: 0, hist: [], state: 'intro', anim: null, endT: 0, par: par(L), ap: null }); pause(); API.autopilot = null; }
  function pause() { S.lockUntil = S.t + .6; }
  const paused = () => S.t < S.lockUntil;
  function start() { S.state = 'play'; pause(); }
  function shuffle(kind) {
    if (S.state !== 'play' || S.anim) return;
    S.hist.push(S.deck); S.prev = S.deck; S.deck = kind === 'in' ? inFaro(S.deck) : outFaro(S.deck); S.moves++;
    S.anim = { t: 0, kind }; Snd.riffle(S.L.n);
  }
  function undo() { if (S.state !== 'play' || S.anim || !S.hist.length) return; S.deck = S.hist.pop(); S.moves++; Audio.sfx('select'); }
  function reset() { if (S.state !== 'play' || S.anim) return; S.deck = deal(S.L); S.hist = []; S.moves = 0; Audio.sfx('select'); }
  function update(dt) {
    S.t += dt;
    if (S.state === 'intro') { if (API.autopilot && !paused()) start(); return; }
    if (S.state === 'win') { S.endT += dt; return; }
    if (S.state !== 'play') return;
    if (S.anim) { S.anim.t += dt / .75; if (S.anim.t >= 1) { S.anim = null; if (solved(S.L, S.deck)) { S.state = 'win'; S.endT = 0; Snd.win(); pause(); } } return; }
    if (API.autopilot) {
      if (!S.ap) S.ap = S.L.goal.order ? Array(S.par).fill('out') : planMulti(S.deck, goalsOf(S.L), S.L.n);
      const k = S.ap.shift(); if (k) shuffle(k);
    }
  }

  // ---------- sound: a riffle is a run of tiny clicks, one per card ----------
  const Snd = {
    riffle(n) { const c = Audio.ctx; if (!c || Audio.muted) return; for (let i = 0; i < Math.min(n, 52); i++) Audio.noise(.008, .12 + (i % 3) * .03, .25 + i * .009); Audio.noise(.06, .1, .2); Audio.noise(.08, .14, .25 + n * .009 + .05); },
    win() { [72, 76, 79, 84].forEach((m, i) => Audio.tone(440 * 2 ** ((m - 69) / 12), .5, 'sine', .13, null, i * .1)); },
  };

  // ---------- drawing ----------
  let ctx;
  const SUITS = ['♠', '♥', '♣', '♦'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  function layout(n) {
    const per = n <= 8 ? 8 : n <= 16 ? 8 : 13, rows = Math.ceil(n / per), cw = n <= 16 ? 58 : 36, ch = cw * 1.42, gx = n <= 16 ? 6 : 3, gy = n <= 16 ? 26 : 18;
    const x0 = (W - per * cw - (per - 1) * gx) / 2, y0 = n <= 16 ? 330 : 300;
    return { per, rows, cw, ch, at: i => ({ x: x0 + (i % per) * (cw + gx), y: y0 + Math.floor(i / per) * (ch + gy) }) };
  }
  function cardFace(x, y, w, h, id, glow) {
    const r = id % 13, s = Math.floor(id / 13) % 4, red = s % 2 === 1;
    if (glow) { ctx.fillStyle = '#ffd23a88'; Draw.rr(ctx, x - 4, y - 4, w + 8, h + 8, 8); ctx.fill(); }
    ctx.fillStyle = glow ? '#fff8d8' : '#fafafa'; Draw.rr(ctx, x, y, w, h, 5); ctx.fill(); ctx.strokeStyle = glow ? '#c8a02a' : '#b8b8b8'; ctx.lineWidth = glow ? 2.5 : 1; ctx.stroke();
    ctx.fillStyle = red ? '#c02a2a' : '#1a1a1a'; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(w * .34)}px system-ui`; ctx.fillText(RANKS[r], x + w / 2, y + h * .42);
    ctx.font = `${Math.round(w * .42)}px system-ui`; ctx.fillText(SUITS[s], x + w / 2, y + h * .82);
  }
  const name = id => RANKS[id % 13] + SUITS[Math.floor(id / 13) % 4];
  function deckView() {
    const L = layout(S.L.n), A = S.anim, n = S.L.n;
    // goal slot
    const goals = goalsOf(S.L) || [];
    for (const [c, pos] of goals) { const g = L.at(pos); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4; ctx.setLineDash([6, 4]); Draw.rr(ctx, g.x - 6, g.y - 6, L.cw + 12, L.ch + 12, 8); ctx.stroke(); ctx.setLineDash([]); ctx.font = '800 12px system-ui'; ctx.fillStyle = '#ffd23a'; ctx.textAlign = 'center'; ctx.fillText(goals.length > 1 ? name(c) : 'GOAL', g.x + L.cw / 2, g.y - 10); }
    // row labels: the position of the first card in each row (counting from the top, the top card is 1)
    ctx.font = '700 12px system-ui'; ctx.fillStyle = '#9ac8a8'; ctx.textAlign = 'right';
    for (let r = 0; r < L.rows; r++) { const p = L.at(r * L.per); ctx.fillText(String(r * L.per + 1), p.x - 6, p.y + L.ch / 2 + 4); }
    for (let i = 0; i < n; i++) {
      const id = S.deck[i]; let p = L.at(i);
      if (A) {   // cut into halves, then each card flies to its new place, in interleaved order
        const from = L.at(S.prev.indexOf(id)), half = S.prev.indexOf(id) < n / 2 ? -1 : 1, k1 = clamp(A.t / .35), k2 = clamp((A.t - .35 - i / n * .3) / .35);
        const split = { x: from.x + half * 18 * k1, y: from.y - 14 * k1 };
        p = { x: split.x + (p.x - split.x) * k2, y: split.y + (p.y - split.y) * k2 - Math.sin(k2 * Math.PI) * 30 };
      }
      cardFace(p.x, p.y, L.cw, L.ch, id, goals.some(([c]) => c === id));
    }
  }
  const BTN = { out: { x: 40, y: 760, w: 210, h: 100 }, in: { x: 290, y: 760, w: 210, h: 100 }, undo: { x: 40, y: 880, w: 210, h: 54 }, reset: { x: 290, y: 880, w: 210, h: 54 } };
  function hud() {
    Draw.bigText(ctx, `${S.li + 1}/${LEVELS.length} · ${S.L.name}`, W / 2, 70, 28, '#ffe14a', '#0a2a1a');
    ctx.font = '800 18px system-ui'; ctx.fillStyle = '#e8f8e8'; ctx.textAlign = 'center';
    const gs = goalsOf(S.L), n = S.L.n, at = c => S.deck.indexOf(c);
    ctx.fillText(!gs ? `CARDS IN PLACE: ${S.deck.filter((c, i) => c === i).length}/${n}` : gs.map(([c, p]) => `${gs.length > 1 ? name(c) : 'ACE'} AT ${at(c) + 1} · GOAL ${p + 1}`).join('   '), W / 2, 112);
    // what each button would do next: the goal cards' new positions, or how many cards would be home
    const preview = k => !gs ? `→ ${(k === 'in' ? inFaro(S.deck) : outFaro(S.deck)).filter((c, i) => c === i).length} IN PLACE` : gs.map(([c]) => `${gs.length > 1 ? name(c) : 'ACE'} → ${where(at(c), n, k) + 1}`).join('  ');
    ctx.font = '700 15px system-ui'; ctx.fillStyle = '#9ac8a8'; ctx.fillText(`SHUFFLES ${S.moves} · PAR ${S.par}`, W / 2, 138);
    // the number that matters is how many cards sit above each goal card; written in binary it is the IN/OUT recipe from the top
    if (gs) { ctx.font = '800 14px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#ffe9a0';
      ctx.fillText(gs.map(([c, p]) => `${gs.length > 1 ? name(c) + ' ' : ''}ABOVE ${at(c)}=${at(c).toString(2)} · GOAL ${p}=${p.toString(2)}`).join('   '), W / 2, 160); }
    wrapText(S.L.tip, W / 2, 190, 460, 22, '700 16px system-ui', '#cfe8d0');
    const b = (r, label, sub, col) => { ctx.fillStyle = col; Draw.rr(ctx, r.x, r.y, r.w, r.h, 20); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); Draw.bigText(ctx, label, r.x + r.w / 2, r.y + (sub ? r.h / 2 - 8 : r.h / 2 + 2), sub ? 36 : 22, '#fff', '#0a2a1a'); if (sub) { ctx.font = '700 13px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(sub, r.x + r.w / 2, r.y + r.h - 16); } };
    b(BTN.out, 'OUT', preview('out'), '#2a7a4a'); b(BTN.in, 'IN', preview('in'), '#a0602a'); b(BTN.undo, 'UNDO', null, '#3a4a3a'); b(BTN.reset, 'RESET', null, '#3a4a3a');
  }
  function wrapText(s, x, y, maxW, lh, font, col) { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y; for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; } ctx.fillText(line, x, yy); }
  function felt() { const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 700); g.addColorStop(0, '#1a5a34'); g.addColorStop(1, '#0a2a1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  function card(title, col, lines, prompt) {
    ctx.fillStyle = '#04140aee'; ctx.fillRect(0, 0, W, H); Draw.bigText(ctx, title, W / 2, 260, 46, col);
    lines.forEach((l, i) => wrapText(l, W / 2, 350 + i * 90, 440, 30, '700 21px system-ui', '#d8f0dc'));
    if (!paused()) { ctx.globalAlpha = .6 + .4 * Math.sin(S.t * 4); Draw.bigText(ctx, prompt, W / 2, 760, 30, '#fff'); ctx.globalAlpha = 1; }
  }
  function render(c) {
    ctx = c; felt();
    if (S.state === 'done') { card('THE HOUSE IS IMPRESSED', '#ffe14a', ['NO CHEATING. JUST HALVES, PERFECTLY INTERLEAVED.', 'DEMO COMPLETE'], 'TAP FOR THE DISC MENU'); return; }
    deckView(); hud();
    if (S.state === 'intro') card(`HAND ${S.li + 1}: ${S.L.name}`, '#ffe14a', [S.L.tip, `PAR: ${S.par} SHUFFLES`], 'TAP TO DEAL');
    if (S.state === 'win') {
      const stars = S.moves <= S.par ? 3 : S.moves <= S.par + 2 ? 2 : 1;
      card('PERFECT!', '#7af08a', [`${S.moves} SHUFFLES · PAR ${S.par}`, S.L.goal.order ? 'EIGHT OUT FAROS BRING A 52-CARD DECK HOME.' : S.L.goal.cards ? 'ONE SEQUENCE, TWO CARDS. THE DECK HAS NO FREE MOVES.' : `${S.L.goal.pos} IN BINARY IS ${S.L.goal.pos.toString(2)}.`], S.L.house ? 'TAP FOR ANOTHER DEAL' : 'TAP FOR THE NEXT HAND');
      for (let i = 0; i < 3; i++) { const kk = back(clamp((S.endT - .3 - i * .15) / .3)); if (kk > 0) { ctx.save(); ctx.translate(W / 2 + (i - 1) * 80, 600); ctx.scale(kk, kk); Draw.star(ctx, 0, 0, 30, i < stars ? '#ffd23a' : '#2a4a3a'); ctx.restore(); } }
    }
  }

  // ---------- input ----------
  const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function next() { if (S.L.house) { S.house++; load(S.li); } else if (S.li < LEVELS.length - 1) load(S.li + 1); else { S.state = 'done'; pause(); } }
  function onPointer(type, x, y) {
    if (type !== 'down' || paused()) return;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'intro') { start(); return; }
    if (S.state === 'win') { if (S.endT > 1) next(); return; }
    if (hit(BTN.out, x, y)) shuffle('out'); else if (hit(BTN.in, x, y)) shuffle('in'); else if (hit(BTN.undo, x, y)) undo(); else if (hit(BTN.reset, x, y)) reset();
  }
  function onKey(key, down) {
    if (!down || paused()) return;
    if (key === 'Enter' || key === ' ') { if (S.state === 'done') Engine.exit(); else if (S.state === 'intro') start(); else if (S.state === 'win' && S.endT > 1) next(); return; }
    if (key === 'o' || key === 'O' || key === 'ArrowLeft') shuffle('out');
    else if (key === 'i' || key === 'I' || key === 'ArrowRight') shuffle('in');
    else if (key === 'u' || key === 'U' || key === 'Backspace') undo();
    else if (key === 'r' || key === 'R') reset();
  }

  const API = { LEVELS, S, houseDeal, reachable, next, load, start, shuffle, outFaro, inFaro, binary, plan, planMulti, newDeck, par, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
