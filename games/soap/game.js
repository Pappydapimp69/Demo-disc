// SOAP OPERA SOLITAIRE - playable demo (ukiyo-e woodblock style).
// Real TriPeaks: play a free card one rank above or below the waste card (A and K wrap), or draw from the stock.
// Every card you uncover flips over with a soap-opera revelation. The Joker on the middle peak is wild,
// and when he's uncovered he has an announcement. Clear all three peaks before the stock runs out.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const W = 720, H = 1280;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const easeIn = x => x * x;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const { P } = Soap;
  let cx = null;

  // ---------- layout: three peaks, 28 slots ----------
  const CW = 62, CH = 88, WASTE = [440, 720], STOCK = [260, 720];
  const SLOTS = [];
  [168, 360, 552].forEach(x => SLOTS.push({ x, y: 330, row: 0 }));
  [136, 200, 328, 392, 520, 584].forEach(x => SLOTS.push({ x, y: 384, row: 1 }));
  for (let i = 0; i < 9; i++) SLOTS.push({ x: 104 + i * 64, y: 438, row: 2 });
  for (let i = 0; i < 10; i++) SLOTS.push({ x: 72 + i * 64, y: 492, row: 3 });
  // which slots cover which: a slot is free when everything covering it is gone
  const COVER = SLOTS.map((s, i) => {
    if (s.row === 3) return [];
    if (s.row === 2) { const k = i - 9; return [18 + k, 19 + k]; }
    if (s.row === 1) { const j = i - 3, p = Math.floor(j / 2), q = j % 2; return [9 + p * 3 + q, 9 + p * 3 + q + 1]; }
    return [3 + i * 2, 4 + i * 2];
  });
  const JOKER_SLOT = 1;
  const LINES = ["I'M BACK FROM THE DEAD.", "I'M HIS EVIL TWIN.", "I'M YOUR SECRET SISTER.", 'I HAVE AMNESIA. WHO ARE YOU?', 'WE WERE SWITCHED AT BIRTH.',
    'I WAS IN A COMA FOR TEN YEARS.', 'I MARRIED YOUR FIANCE.', 'THE WILL HAS BEEN CHANGED.', 'IT WAS ME. AT THE GALA.', "I'M NOT A SEVEN. I'M A SIX.",
    'YOUR MOTHER IS A DIAMOND.', 'I FAKED MY OWN SHUFFLE.', "I'VE BEEN A CLUB ALL ALONG.", 'I SOLD THE FAMILY DECK.', "I'M LEAVING YOU. FOR THE STOCK.",
    'I NEVER LEFT. I WAS UNDERNEATH.', 'THE ACE WAS LOW THE WHOLE TIME.', 'I KNOW WHAT YOU DID IN SOLITAIRE.', "I'M ENGAGED. TO A KING.", 'THE TWINS ARE TRIPLETS.',
    'I CAN NEVER BE TRUMPS AGAIN.', 'I WAS DEALT A BAD HAND.', 'I HAVE A SECRET SUIT.', "I'M FACE UP. FOR YOU."];
  const LEVELS = [
    { name: 'SEASON 1: THE RETURN', seed: 101 },
    { name: 'SEASON 2: THE TWINS', seed: 211 },
    { name: 'SEASON 3: THE FATHER', seed: 307 },
  ];
  const playable = (a, w) => a.joker || w.joker || Math.abs(a.r - w.r) === 1 || Math.abs(a.r - w.r) === 12;

  function deal(seed) {
    const r = mkRng(seed), deck = [];
    for (const s of ['S', 'H', 'D', 'C']) for (let k = 1; k <= 13; k++) deck.push({ r: k, s });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const tab = []; let k = 0;
    for (let i = 0; i < 28; i++) tab.push(i === JOKER_SLOT ? { joker: true } : deck[k++]);
    const stock = deck.slice(k);   // 25 cards: the first goes straight to the waste
    return { tab, stock };
  }
  // depth-first solver over (removed mask, stock position, waste card); returns the move list or null
  function solve(tab, stock, budget = 300000) {
    const seen = new Set(); let nodes = 0;
    const free = (mask, i) => !(mask >> i & 1) && COVER[i].every(c => mask >> c & 1);
    const keyOf = (w) => w.joker ? 'J' : w.r + w.s;
    function dfs(mask, sp, waste, path) {
      if (mask === (1 << 28) - 1) return path;
      if (++nodes > budget) return null;
      const key = mask + '|' + sp + '|' + keyOf(waste);
      if (seen.has(key)) return null; seen.add(key);
      // plays first, deepest (lowest row number = top of a peak) last so peaks open up
      const moves = [];
      for (let i = 0; i < 28; i++) if (free(mask, i) && playable(tab[i], waste)) moves.push(i);
      moves.sort((a, b) => SLOTS[b].row - SLOTS[a].row);
      for (const i of moves) { const res = dfs(mask | (1 << i), sp, tab[i], path.concat([['play', i]])); if (res) return res; }
      if (sp < stock.length) return dfs(mask, sp + 1, stock[sp], path.concat([['draw']]));
      return null;
    }
    return dfs(0, 1, stock[0], []);
  }

  const S = {};
  function load(i) {
    const L = LEVELS[i];
    let seed = L.seed, d, sol = null;
    for (let tries = 0; tries < 60 && !sol; tries++, seed++) { d = deal(seed); sol = solve(d.tab, d.stock); }
    Object.assign(S, { li: i, L, t: 0, tab: d.tab, removed: new Array(28).fill(false), faceUp: SLOTS.map(s => s.row === 3), stock: d.stock.slice(1), waste: [d.stock[0]],
      state: 'play', streak: 0, best: 0, bubble: null, flips: [], anim: [], endT: 0, reason: '', mood: 'calm', moodT: 0, zoom: null, lineN: i * 7, sol, si: 0 });
    API.autopilot = null;
  }
  const isFree = i => !S.removed[i] && COVER[i].every(c => S.removed[c]);
  const wasteTop = () => S.waste[S.waste.length - 1];

  function play(i) {
    if (S.state !== 'play' || !isFree(i) || !S.faceUp[i]) return false;
    const c = S.tab[i];
    if (!playable(c, wasteTop())) { Audio.tone(200, .15, 'square', .05); S.anim.push({ shake: i, t: S.t }); return false; }
    S.removed[i] = true; S.waste.push(c); S.streak++; S.best = Math.max(S.best, S.streak);
    S.anim.push({ fly: i, t: S.t, c });
    Audio.noise(.03, .12); Audio.tone(1200, .03, 'square', .03);
    if (S.streak >= 3) S.anim.push({ pop: `PLOT TWIST x${S.streak}`, t: S.t });
    // whatever this uncovered flips over with news
    for (let k = 0; k < 28; k++) if (!S.removed[k] && !S.faceUp[k] && isFree(k)) reveal(k);
    if (S.removed.every(Boolean)) { S.state = 'win'; S.endT = 0; Audio.sfx('win'); S.mood = 'faint'; }
    else checkStuck();
    return true;
  }
  function reveal(k) {
    S.faceUp[k] = true; S.flips.push({ k, t: S.t });
    const joker = S.tab[k].joker;
    S.bubble = { lines: joker ? ["I'M THE FATHER.", '...OF ALL OF YOU.'] : [LINES[S.lineN++ % LINES.length]], t: S.t, k, joker };
    S.zoom = { k, t: S.t };
    S.mood = joker ? 'gasp' : ['gasp', 'swoon', 'gasp'][S.lineN % 3]; S.moodT = S.t;
    // dun dun DUNNN
    const st = joker ? 1.4 : 1;
    [[55, 58, 62], [54, 57, 61], [50, 53, 57]].forEach((ch, j) => ch.forEach(m => Audio.tone(440 * 2 ** ((m - 69) / 12), j < 2 ? .3 : 1.1, 'triangle', .05 * st, null, .05 + j * .3)));
    Audio.tone(55, .5, 'sine', .2 * st, null, .65);
  }
  function draw() {
    if (S.state !== 'play') return;
    if (!S.stock.length) return checkStuck(true);
    S.waste.push(S.stock.shift()); S.streak = 0;
    S.anim.push({ drawn: true, t: S.t });
    Audio.noise(.05, .1);
    checkStuck();
  }
  function checkStuck() {
    if (S.stock.length) return;
    for (let i = 0; i < 28; i++) if (isFree(i) && playable(S.tab[i], wasteTop())) return;
    S.state = 'fail'; S.endT = 0; S.reason = 'THE SEASON WAS CANCELLED.'; Audio.sfx('fail');
  }

  function update(dt) {
    S.t += dt;
    if (S.state !== 'play') { S.endT += dt; return; }
    const auto = API.autopilot;
    if (auto && S.t > .3 && !S.anim.some(a => S.t - a.t < .12)) {
      if (auto === 'solve' && S.sol && S.si < S.sol.length) { const m = S.sol[S.si++]; if (m[0] === 'draw') draw(); else play(m[1]); }
      else if (auto === 'drawer') draw();
    }
  }

  // ---------- drawing ----------
  function reaction() {
    const drop = S.state === 'win' ? lin(S.endT, .2, .9) : 0;
    cx.save(); cx.translate(360, 1010 + easeIn(drop) * 400); cx.rotate(drop * .6);
    cx.fillStyle = P.paper2; cx.fillRect(-150, -120, 300, 240);
    cx.save(); cx.beginPath(); cx.rect(-150, -120, 300, 240); cx.clip();
    const g = cx.createLinearGradient(0, -120, 0, 40); g.addColorStop(0, P.vermilion); g.addColorStop(1, 'rgba(212,67,42,0)'); cx.fillStyle = g; cx.fillRect(-150, -120, 300, 160);
    const mood = S.state === 'win' ? 'faint' : S.state === 'fail' ? 'swoon' : (S.t - S.moodT < 2.5 ? S.mood : 'calm');
    const shake = S.t - S.moodT < .3 ? Math.sin(S.t * 90) * 4 : 0;
    Soap.portrait(shake, 50, 78, 'queen', { mood, tear: mood === 'swoon' ? (S.t * .5) % 1 : 0 });
    cx.restore();
    cx.strokeStyle = P.ink; cx.lineWidth = 6; cx.strokeRect(-150, -120, 300, 240);
    Soap.cartouche(0, 140, 250, 40, ['QUEEN OF HEARTS'], 21);
    cx.restore();
  }
  function render(ctx) {
    cx = ctx; Soap.setCtx(ctx);
    Soap.paperBg(W, H); Soap.bokashi(W, 0, 240);
    if (S.state === 'done') {
      Soap.cartouche(360, 520, 600, 220, ['DEMO COMPLETE', 'THREE SEASONS.', 'EVERYONE FAINTED.'], 46);
      Soap.cartouche(360, 760, 520, 70, ['TAP OR ESC: DISC MENU'], 28);
      Soap.waves(W, 1215, S.t, .8); return;
    }
    // a melodramatic zoom on each reveal
    let zoom = 1, zx = 360, zy = 450;
    if (S.zoom) { const a = S.t - S.zoom.t, k = Math.min(lin(a, 0, .25), 1 - lin(a, 1.3, 1.7)); if (k > 0) { zoom = 1 + .5 * ease(k); zx = SLOTS[S.zoom.k].x; zy = SLOTS[S.zoom.k].y; } }
    cx.save(); cx.translate(360, 480); cx.scale(zoom, zoom); cx.translate(-mix(360, zx, (zoom - 1) / .5), -mix(480, zy, (zoom - 1) / .5));
    const jokerUp = S.faceUp[JOKER_SLOT] && !S.removed[JOKER_SLOT];
    for (let i = 0; i < 28; i++) {
      if (S.removed[i]) continue;
      const s = SLOTS[i], fl = S.flips.find(f => f.k === i && S.t - f.t < .3), sh = S.anim.find(a => a.shake === i && S.t - a.t < .25);
      const flipK = fl ? Math.abs(Math.cos(lin(S.t - fl.t, 0, .3) * Math.PI)) : 1;
      const eyes = jokerUp && i !== JOKER_SLOT && S.faceUp[i] ? [(SLOTS[JOKER_SLOT].x - s.x) / 300, (SLOTS[JOKER_SLOT].y - s.y) / 200] : null;
      const free = isFree(i) && S.faceUp[i], ok = free && playable(S.tab[i], wasteTop());
      cx.save(); const x = s.x + (sh ? Math.sin(S.t * 80) * 5 : 0); cx.translate(x, s.y); cx.scale(flipK, 1); cx.translate(-x, -s.y);
      Soap.card(x, s.y - (ok ? 6 : 0), CW, CH, S.tab[i], S.faceUp[i] && (!fl || S.t - fl.t > .15), { eyes, mood: S.tab[i].joker ? 'grin' : 'calm' });
      cx.restore();
    }
    if (zoom > 1.2) Soap.speedLines(zx, zy, 60, 420, 40, Math.floor(S.t * 12));
    cx.restore();
    // stock and waste
    if (S.stock.length) Soap.card(STOCK[0], STOCK[1], CW * 1.25, CH * 1.25, null, false);
    else { cx.strokeStyle = P.ink; cx.setLineDash([8, 8]); cx.lineWidth = 3; cx.strokeRect(STOCK[0] - CW * .62, STOCK[1] - CH * .62, CW * 1.25, CH * 1.25); cx.setLineDash([]); }
    Soap.cartouche(STOCK[0], STOCK[1] + 78, 90, 34, [String(S.stock.length)], 22);
    Soap.card(WASTE[0], WASTE[1], CW * 1.25, CH * 1.25, wasteTop(), true, { mood: S.state === 'win' ? 'faint' : 'calm' });
    for (const a of S.anim) if (a.fly !== undefined && S.t - a.t < .3) { const k = ease(lin(S.t - a.t, 0, .3)), s = SLOTS[a.fly]; Soap.card(mix(s.x, WASTE[0], k), mix(s.y, WASTE[1], k) - Math.sin(k * Math.PI) * 70, CW, CH, a.c, true); }
    // HUD
    Soap.cartouche(360, 70, 600, 60, [`${S.li + 1}/3 · ${S.L.name}`], 28);
    if (S.t < 3.5 && S.state === 'play') Soap.cartouche(360, 160, 600, 80, ['TAP A CARD ONE HIGHER OR LOWER', 'OR TAP THE DECK TO DRAW'], 24);
    // the revelation
    if (S.bubble && S.t - S.bubble.t < (S.bubble.joker ? 3.2 : 2.2)) {
      const a = S.t - S.bubble.t, lines = S.bubble.joker && a < 1.4 ? [S.bubble.lines[0]] : S.bubble.lines, k = back(lin(a, 0, .2));
      cx.save(); cx.translate(360, 210); cx.scale(k, k); Soap.cartouche(0, 0, 640, lines.length * 46 + 34, lines, S.bubble.joker ? 42 : 36, S.bubble.joker ? P.vermilion : P.ink); cx.restore();
    }
    for (const a of S.anim) if (a.pop && S.t - a.t < .8) { cx.globalAlpha = 1 - lin(S.t - a.t, .4, .8); Soap.cartouche(560, 640, 260, 48, [a.pop], 24, P.vermilion); cx.globalAlpha = 1; }
    reaction();
    Soap.waves(W, 1215, S.t, .8);
    if (S.state === 'win') {
      // everyone faints: a rain of fainted cards
      for (let i = 0; i < 28; i++) { const k = lin(S.endT, i * .03, i * .03 + 1.2); if (k > 0 && k < 1) Soap.card(SLOTS[i].x, mix(SLOTS[i].y, 1400, easeIn(k)), CW, CH, S.tab[i], true, { rot: k * 3, mood: 'faint' }); }
      if (S.endT > 1.2) { const k = back(lin(S.endT, 1.2, 1.5)); cx.save(); cx.translate(360, 380); cx.scale(k, k); Soap.cartouche(0, 0, 560, 120, ['SEASON FINALE!', 'EVERYONE FAINTED.'], 40, P.vermilion); cx.restore(); }
      if (S.endT > 2) Soap.cartouche(360, 560, 420, 90, [S.li < 2 ? 'NEXT SEASON ▶' : 'FINISH ▶'], 40);
    }
    if (S.state === 'fail') {
      cx.fillStyle = 'rgba(28,26,26,.45)'; cx.fillRect(0, 0, W, H);
      Soap.cartouche(360, 420, 600, 130, [S.reason, '(TOO MANY DRAWS)'], 34, P.vermilion);
      if (S.endT > .6) Soap.cartouche(360, 580, 380, 90, ['RE-SHOOT ▶'], 40);
    }
  }

  // ---------- input ----------
  function next() { Audio.sfx('select'); if (S.li < 2) load(S.li + 1); else S.state = 'done'; }
  function onPointer(type, x, y) {
    if (type !== 'down') return;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'win' && S.endT > 2) { next(); return; }
    if (S.state === 'fail' && S.endT > .6) { load(S.li); return; }
    if (S.state !== 'play') return;
    if (Math.abs(x - STOCK[0]) < CW * .7 && Math.abs(y - STOCK[1]) < CH * .7) { draw(); return; }
    // topmost free card under the finger
    let hit = -1;
    for (let i = 27; i >= 0; i--) { if (S.removed[i]) continue; const s = SLOTS[i]; if (Math.abs(x - s.x) < CW / 2 + 4 && Math.abs(y - s.y) < CH / 2 + 4 && isFree(i)) { hit = i; break; } }
    if (hit >= 0) play(hit);
  }
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'win' && S.endT > 2 && (key === 'Enter' || key === ' ')) { next(); return; }
    if (S.state === 'fail' && S.endT > .6 && (key === 'Enter' || key === ' ')) { load(S.li); return; }
    if (key === ' ' || key === 'ArrowDown') draw();
    if (key === 'Enter' || key === 'ArrowUp') { for (let i = 27; i >= 0; i--) if (isFree(i) && S.faceUp[i] && playable(S.tab[i], wasteTop())) { play(i); break; } }   // keyboard: play any legal card
  }

  const API = { LEVELS, S, load, play, draw, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  window.__game = API;
})();
