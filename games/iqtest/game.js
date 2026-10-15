// IQ TEST 2026 - playable demo, and a real experiment.
// The ad: "only geniuses remember all 10", IQ 160 in ten minutes. The game: memory takes days. Learn the twelve
// symbols of a lost alphabet a few minutes a day, scheduled by Leitner boxes (a card you know moves up a box and
// comes back later; box intervals 1, 2, 4, 8, 16 days). On day 7 (and 14, 28) a cold test, before that day's reviews.
// The experiment: what a MISS does. Each player is assigned one rule for good: 'reset' sends a missed card back to
// box 1, 'drop' moves it down one box. Every player gets the same daily review budget, so the rules compete on
// equal effort. The answer feeds Brain's open question: for real learners, which miss rule wins, and where it flips.
(function () {
  'use strict';
  const { createGame, Audio, Draw, back, clamp } = Engine;
  const W = 540, H = 960;
  const INTERVAL = [0, 1, 2, 4, 8, 16];          // days until a card in box b comes back
  const BUDGET = 6, NEW_PER_DAY = 4, EXAMS = [7, 14, 28];
  const MEANINGS = ['SUN', 'MOON', 'WATER', 'FIRE', 'TREE', 'STONE', 'BIRD', 'FISH', 'HOUSE', 'ROAD', 'KING', 'CHILD'];
  const RULES = ['reset', 'drop'];
  const miss = (box, rule) => rule === 'reset' ? 1 : Math.max(1, box - 1);

  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // twelve glyphs of a lost alphabet: a connected 4-stroke walk on a 3x3 dot grid that spans the grid, all different
  const GLYPHS = (() => {
    const r = mkRng(2026), out = [], seen = new Set(), key = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
    while (out.length < MEANINGS.length) {
      const strokes = [], used = new Set(); let p = Math.floor(r() * 9);
      for (let k = 0; k < 4; k++) {
        const nb = [];
        for (let q = 0; q < 9; q++) { const dx = Math.abs(q % 3 - p % 3), dy = Math.abs(Math.floor(q / 3) - Math.floor(p / 3)); if (q !== p && dx <= 1 && dy <= 1 && !used.has(key(p, q))) nb.push(q); }
        if (!nb.length) break;
        const q = nb[Math.floor(r() * nb.length)]; used.add(key(p, q)); strokes.push([p, q]); p = q;
      }
      const pts = strokes.flat(), cols = new Set(pts.map(q => q % 3)), rows = new Set(pts.map(q => Math.floor(q / 3)));
      const sig = [...used].sort().join(',');
      if (strokes.length < 4 || cols.size < 3 || rows.size < 3 || seen.has(sig)) continue;
      seen.add(sig); out.push(strokes);
    }
    return out;
  })();

  const lab = Lab.create('iqtest');
  const S = { state: 'intro', t: 0, lockUntil: 0, rule: null, day: 0, q: null, opts: [], pick: -1, shownAt: 0, fb: 0, sent: '', examScore: null };
  const D = () => lab.data;
  // local calendar day (a new day at local midnight, not 24 h after the last session)
  const calDay = ms => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 864e5);
  const today = () => calDay(lab.clock()) - D().startDay;
  function pause(s = .5) { S.lockUntil = S.t + s; }
  const paused = () => S.t < S.lockUntil;

  // ---------- the schedule ----------
  function open() {
    S.rule = lab.arm('miss', RULES);
    const d = D();
    if (d.startDay === undefined) { d.startDay = calDay(lab.clock()); d.cards = MEANINGS.map((_, id) => ({ id, box: 0, due: 0, intro: null })); d.exams = {}; d.done = {}; lab.log('start', { rule: S.rule }); }
    S.day = today();
    const s = d.session;
    if (s && s.day === S.day && s.i < s.queue.length) { S.state = 'intro'; S.resume = true; }
    else if (d.done[S.day]) S.state = 'done';
    else { S.state = 'intro'; S.resume = false; }
    lab.save(); pause();
  }
  const examDue = () => { const d = D(); return EXAMS.find(e => S.day >= e && !d.exams[e] && (EXAMS[EXAMS.indexOf(e) + 1] || 1e9) > S.day); };
  // today's queue: an exam first if one is due (before any review can prime it), then due cards lowest box first
  // up to the budget, then new cards (shown, then checked)
  function buildQueue() {
    const d = D(), q = [], ex = examDue();
    if (ex !== undefined) for (const c of shuffle(d.cards.filter(c => c.intro !== null).map(c => c.id))) q.push({ kind: 'exam', id: c, exam: ex });
    const due = d.cards.filter(c => c.intro !== null && c.due <= S.day).sort((a, b) => a.box - b.box || a.due - b.due || a.id - b.id);
    q.backlog = Math.max(0, due.length - BUDGET);
    for (const c of due.slice(0, BUDGET)) q.push({ kind: 'review', id: c.id });
    const fresh = d.cards.filter(c => c.intro === null).slice(0, NEW_PER_DAY);
    for (const c of fresh) q.push({ kind: 'learn', id: c.id });
    for (const c of fresh) q.push({ kind: 'check', id: c.id });
    return q;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function begin() {
    const d = D();
    if (!S.resume) { const queue = buildQueue(); d.session = { day: S.day, queue, i: 0, right: 0, asked: 0 }; queue.backlog = queue.backlog || 0; lab.log('session', { day: S.day, queue: d.session.queue.length, due: d.session.queue.filter(x => x.kind === 'review').length, backlog: d.session.queue.backlog || 0 }); }
    S.resume = false; lab.save(); Audio.sfx('start'); nextItem();
  }
  function nextItem() {
    const s = D().session;
    if (s.i >= s.queue.length) { finishDay(); return; }
    S.q = s.queue[s.i]; S.pick = -1; S.shownAt = S.t;
    if (S.q.kind === 'learn') { S.state = 'learn'; }
    else { S.state = 'quiz'; S.opts = shuffle([S.q.id].concat(shuffle(MEANINGS.map((_, i) => i).filter(i => i !== S.q.id)).slice(0, 5))); }
    pause(.35);
  }
  function learnSeen() {
    const c = D().cards[S.q.id]; c.intro = S.day; c.box = 1; c.due = S.day + INTERVAL[1];
    lab.log('learn', { day: S.day, id: c.id, ms: Math.round((S.t - S.shownAt) * 1000) });
    advance();
  }
  function answer(k) {
    if (S.state !== 'quiz' || paused()) return;
    const d = D(), c = d.cards[S.q.id], ok = S.opts[k] === S.q.id, ms = Math.round((S.t - S.shownAt) * 1000), from = c.box;
    S.pick = k; S.ok = ok; d.session.asked++; if (ok) d.session.right++;
    if (S.q.kind === 'review') { if (ok) c.box = Math.min(5, c.box + 1); else c.box = miss(c.box, S.rule); c.due = S.day + INTERVAL[c.box]; }
    lab.log('answer', { day: S.day, kind: S.q.kind, id: c.id, ok, ms, from, to: c.box, exam: S.q.exam });
    if (S.q.kind === 'exam') { d.examRun = d.examRun || {}; const r = d.examRun[S.q.exam] || (d.examRun[S.q.exam] = { right: 0, n: 0 }); r.n++; if (ok) r.right++; }
    lab.save();
    Audio.sfx(S.q.kind === 'exam' ? 'select' : ok ? 'coin' : 'bad');
    S.state = 'feedback'; S.fb = S.t; pause(S.q.kind === 'exam' ? .25 : ok ? .45 : 1.1);
  }
  function advance() {
    const d = D(); d.session.i++;
    // an exam's last item closes it
    const s = d.session, cur = s.queue[s.i - 1], nx = s.queue[s.i];
    if (cur.kind === 'exam' && (!nx || nx.kind !== 'exam')) { const r = d.examRun[cur.exam]; d.exams[cur.exam] = { right: r.right, n: r.n, day: S.day }; S.examScore = d.exams[cur.exam]; lab.log('exam', { day: S.day, exam: cur.exam, right: r.right, n: r.n, rule: S.rule }); lab.save(); S.state = 'examDone'; Audio.sfx('win'); pause(.8); return; }
    lab.save(); nextItem();
  }
  function finishDay() {
    const d = D(), s = d.session; d.done[S.day] = { right: s.right, asked: s.asked };
    lab.log('done', { day: S.day, right: s.right, asked: s.asked, boxes: d.cards.map(c => c.box) }); lab.save();
    S.state = 'done'; Audio.sfx('win'); pause(.8);
  }

  // ---------- test autopilot: a learner whose recall falls with time since the card was last seen ----------
  function update(dt) {
    S.t += dt;
    if (!API.autopilot || paused()) return;
    if (S.state === 'intro') begin();
    else if (S.state === 'learn') learnSeen();
    else if (S.state === 'quiz') { const ok = API.autopilot(D().cards[S.q.id], S.q); answer(ok ? S.opts.indexOf(S.q.id) : (S.opts.indexOf(S.q.id) + 1) % 6); }
    else if (S.state === 'feedback') advance();
    else if (S.state === 'examDone') nextItem();
  }

  // ---------- drawing ----------
  let ctx;
  const BTN = k => ({ x: 40 + (k % 2) * 240, y: 600 + Math.floor(k / 2) * 92, w: 220, h: 76 });
  const BIG = { x: 120, y: 790, w: 300, h: 84 }, SEND = { x: 120, y: 840, w: 300, h: 66 };
  function glyph(id, cx, cy, s, col) {
    const pt = q => [cx + (q % 3 - 1) * s, cy + (Math.floor(q / 3) - 1) * s];
    ctx.strokeStyle = col; ctx.lineWidth = s * .26; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [a, b] of GLYPHS[id]) { const [x1, y1] = pt(a), [x2, y2] = pt(b); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  }
  function button(b, label, col, on, size = 26) {
    ctx.fillStyle = on ? col : '#fff'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 18); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = `800 ${size}px system-ui`; ctx.fillStyle = on ? '#fff' : '#1a2340'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1); ctx.textBaseline = 'alphabetic';
  }
  function text(s, x, y, size, col, weight = 700, maxW = 460, lh = size * 1.35) {
    ctx.font = `${weight} ${size}px system-ui`; ctx.fillStyle = col; ctx.textAlign = 'center'; let line = '', yy = y;
    for (const w of s.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
    ctx.fillText(line, x, yy); return yy;
  }
  function header(sub) {
    ctx.fillStyle = '#1a2340'; ctx.fillRect(0, 0, W, 130);
    Draw.bigText(ctx, 'IQ TEST 2026', W / 2, 62, 40, '#ffe14a', '#000');
    ctx.font = '800 16px system-ui'; ctx.fillStyle = '#9fb0ff'; ctx.textAlign = 'center'; ctx.fillText(sub, W / 2, 104);
  }
  // the five Leitner boxes, with each card's glyph filed in its box
  function boxes(y) {
    const d = D();
    for (let b = 1; b <= 5; b++) {
      const x = 30 + (b - 1) * 98; ctx.fillStyle = '#e6ebff'; Draw.rr(ctx, x, y, 88, 150, 12); ctx.fill();
      ctx.font = '800 13px system-ui'; ctx.fillStyle = '#5a6aa0'; ctx.textAlign = 'center'; ctx.fillText(b === 1 ? 'DAILY' : `EVERY ${INTERVAL[b]}`, x + 44, y + 20);
      d.cards.filter(c => c.box === b).forEach((c, k) => glyph(c.id, x + 17 + (k % 3) * 27, y + 44 + Math.floor(k / 3) * 28, 6, '#1a2340'));
    }
  }
  function render(c) {
    ctx = c; ctx.fillStyle = '#f4f6ff'; ctx.fillRect(0, 0, W, H);
    const d = D(), s = d.session;
    if (S.state === 'intro') {
      header(`DAY ${S.day + 1}`);
      if (S.day === 0 && !S.resume) {
        text('THE AD SAID TEN MINUTES TO GENIUS.', W / 2, 200, 24, '#c0283a', 900);
        text('REAL MEMORY TAKES A WEEK. LEARN THE TWELVE SYMBOLS OF A LOST ALPHABET, A FEW MINUTES A DAY. ON DAY 7, A TEST.', W / 2, 260, 22, '#1a2340');
        GLYPHS.slice(0, 6).forEach((_, i) => glyph(i, 70 + i * 80, 440, 18, '#1a2340'));
        text('THIS GAME IS ALSO A REAL EXPERIMENT ON HOW TO REVIEW. YOUR ANSWERS STAY ON THIS DEVICE UNLESS YOU CHOOSE TO SEND THEM.', W / 2, 540, 16, '#5a6aa0', 600, 440);
      } else {
        const ex = examDue(), q = buildQueue();
        text(S.resume ? 'PICK UP WHERE YOU LEFT OFF.' : ex !== undefined ? `DAY ${ex} TEST FIRST: EVERY SYMBOL, NO HINTS.` : 'TODAY\'S REVIEW', W / 2, 220, 26, '#1a2340', 900);
        if (!S.resume) text(`${q.filter(x => x.kind === 'review').length} TO REVIEW · ${q.filter(x => x.kind === 'learn').length} NEW`, W / 2, 270, 20, '#5a6aa0');
        boxes(330);
      }
      if (!paused()) button(BIG, 'START', '#3a5bff', true, 30);
      return;
    }
    if (S.state === 'learn') {
      header(`DAY ${S.day + 1} · NEW SYMBOL`);
      ctx.fillStyle = '#fff'; Draw.rr(ctx, 120, 190, 300, 300, 30); ctx.fill();
      glyph(S.q.id, W / 2, 340, 70, '#1a2340');
      Draw.bigText(ctx, MEANINGS[S.q.id], W / 2, 560, 54, '#3a5bff', '#fff');
      text('SAY IT OUT LOUD. PICTURE IT.', W / 2, 640, 18, '#5a6aa0');
      if (!paused()) button(BIG, 'GOT IT', '#3a5bff', true, 30);
      return;
    }
    if (S.state === 'quiz' || S.state === 'feedback') {
      const exam = S.q.kind === 'exam';
      header(exam ? `DAY ${S.q.exam} TEST · ${s.i - s.queue.findIndex(x => x.kind === 'exam') + 1} OF ${s.queue.filter(x => x.kind === 'exam').length}` : `DAY ${S.day + 1} · ${s.i + 1} OF ${s.queue.length}`);
      ctx.fillStyle = '#fff'; Draw.rr(ctx, 120, 170, 300, 300, 30); ctx.fill();
      glyph(S.q.id, W / 2, 320, 70, '#1a2340');
      text(exam ? 'NO HINTS TODAY.' : 'WHAT DOES IT MEAN?', W / 2, 530, 22, '#5a6aa0', 800);
      for (let k = 0; k < 6; k++) {
        let col = '#3a5bff', on = false;
        if (S.state === 'feedback' && !exam) { if (S.opts[k] === S.q.id) { col = '#1fa45a'; on = true; } else if (k === S.pick) { col = '#d0283a'; on = true; } }
        else if (S.state === 'feedback' && k === S.pick) on = true;
        button(BTN(k), MEANINGS[S.opts[k]], col, on);
      }
      return;
    }
    if (S.state === 'examDone') {
      header(`DAY ${S.examScore.day + 1}`);
      Draw.bigText(ctx, `${S.examScore.right} / ${S.examScore.n}`, W / 2, 300, 96, '#3a5bff', '#fff');
      text(S.examScore.right === S.examScore.n ? 'EVERY ONE. THAT IS WHAT A WEEK BUYS.' : 'REMEMBERED AFTER A WEEK, COLD. NOW TODAY\'S REVIEW.', W / 2, 420, 24, '#1a2340', 800);
      if (!paused()) button(BIG, 'CONTINUE', '#3a5bff', true, 30);
      return;
    }
    if (S.state === 'done') {
      header(`DAY ${S.day + 1} · DONE`);
      const r = d.done[S.day] || { right: 0, asked: 0 };
      ctx.save(); ctx.translate(W / 2, 220); ctx.rotate(-.06); Draw.bigText(ctx, 'IQ 160', 0, 0, 64, '#c0c6dd', '#fff'); ctx.strokeStyle = '#d0283a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-130, 6); ctx.lineTo(130, -6); ctx.stroke(); ctx.restore();
      text(r.asked ? `${r.right} OF ${r.asked} TODAY. MEMORY NEEDS SLEEP: COME BACK TOMORROW.` : 'NOTHING DUE TODAY. THE SPACING IS THE POINT: COME BACK TOMORROW.', W / 2, 300, 22, '#1a2340', 800);
      boxes(370);
      const next = EXAMS.find(e => !d.exams[e] && e > S.day);
      const taken = EXAMS.filter(e => d.exams[e]).map(e => `DAY ${e}: ${d.exams[e].right}/${d.exams[e].n}`).join(' · ');
      text(taken || (next ? `THE TEST: IN ${next - S.day} DAY${next - S.day > 1 ? 'S' : ''}` : ''), W / 2, 580, 20, '#3a5bff', 800);
      if (next && taken) text(`NEXT TEST IN ${next - S.day} DAYS`, W / 2, 612, 18, '#5a6aa0');
      text('A REAL EXPERIMENT: PLAYERS ARE SPLIT BETWEEN TWO RULES FOR WHAT A MISS DOES. SENDING YOUR FILE HELPS SETTLE WHICH ONE WINS.', W / 2, 680, 15, '#5a6aa0', 600, 440);
      button(SEND, S.sent || 'SEND MY DATA', '#5a6aa0', !!S.sent, 22);
    }
  }

  // ---------- input ----------
  const hit = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  function press(x, y) {
    if (paused()) return;
    if (S.state === 'intro' && (x === null || hit(BIG, x, y))) begin();
    else if (S.state === 'learn' && (x === null || hit(BIG, x, y))) learnSeen();
    else if (S.state === 'quiz' && x !== null) { for (let k = 0; k < 6; k++) if (hit(BTN(k), x, y)) answer(k); }
    else if (S.state === 'feedback') advance();
    else if (S.state === 'examDone' && (x === null || hit(BIG, x, y))) nextItem();
    else if (S.state === 'done' && x !== null && hit(SEND, x, y)) { const how = lab.download(); S.sent = how === 'clipboard' ? 'COPIED: PASTE IT TO US' : how === 'download' ? 'SAVED: SEND THE FILE' : 'COULD NOT SAVE'; lab.log('export', { how }); }
  }
  function onPointer(type, x, y) { if (type === 'down') press(x, y); }
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'quiz' && key >= '1' && key <= '6') answer(+key - 1);
    else if (key === 'Enter' || key === ' ') press(null, null);
  }

  const API = { S, lab, GLYPHS, MEANINGS, INTERVAL, BUDGET, miss, open, begin, answer, advance, learnSeen, buildQueue, today, autopilot: null,
    step: n => game.step(n), get state() { return S.state; } };
  open();
  const game = createGame({ canvas: document.getElementById('c'), width: W, height: H, update, render, onPointer, onKey });
  Audio.unlock();
  window.__game = API;
})();
