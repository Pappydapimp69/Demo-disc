// Smoke + completability tests. Steps the simulation through window.__game (no real-time waits):
// every level must be winnable by its stated solution and lost by its trap, the hint must solve it,
// and every page must boot without errors.
// Playwright from node_modules when installed (CI), else this container's global copy
let chromium;
try { ({ chromium } = await import('playwright')); } catch (_) { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const shots = path.join(root, 'tests', 'shots'); fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

async function open(rel, size = { width: 540, height: 960 }) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(root, rel));
  await page.waitForFunction(() => !!window.__game || !!window.__menu);
  return { page, errors };
}
// run until the predicate holds or the tick budget is spent
async function runUntil(page, fn, maxTicks, chunk = 30) {
  for (let t = 0; t < maxTicks; t += chunk) {
    await page.evaluate(n => window.__game.step(n), chunk);
    if (await page.evaluate(fn)) return t + chunk;
  }
  return -1;
}

// ---------- menu ----------
{
  const { page, errors } = await open('index.html');
  const entries = await page.evaluate(() => window.__menu.entries.map(e => e.href));
  for (const href of entries) check(fs.existsSync(path.join(root, href.split('#')[0])), `menu entry resolves: ${href}`);
  await page.waitForFunction(() => window.__menu.gagDone, null, { timeout: 8000 });
  await page.screenshot({ path: path.join(shots, 'splash.png') });
  check((await page.evaluate(() => window.__menu.word())) === 'STUPIDO', 'splash: STUDIO becomes STUPIDO');
  await page.mouse.click(270, 480, { delay: 250 }); // a slow tap must not fall through to a tile
  await page.waitForTimeout(1000);
  check(await page.evaluate(() => !document.getElementById('splash')), 'tap dismisses splash');
  check(page.url().endsWith('index.html') && await page.evaluate(() => window.__menu.cur === 0), 'tapping the splash lands on the ad catalog, not a game');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__menu.cur === 1, null, { timeout: 4000 }).catch(() => {});
  check((await page.evaluate(() => window.__menu.cur)) === 1, 'right moves to the next tile');
  // headless Chromium has no H.264 decoder, so check the intent: tile 2 is the one asked to play, tile 1 stopped
  check(await page.evaluate(() => window.__menu.playing === 1 && document.querySelectorAll('video')[0].paused), 'only the centred tile plays its ad');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(shots, 'menu.png') });
  await page.mouse.click(270, 480);
  await page.waitForFunction(() => window.__menu.game, null, { timeout: 4000 }).catch(() => {});
  check(((await page.evaluate(() => window.__menu.game)) || '').includes('games/stickswarm/'), 'tapping a tile opens its game');
  await page.frameLocator('#play').locator('a.back').click();
  await page.waitForFunction(() => !window.__menu.game, null, { timeout: 4000 }).catch(() => {});
  check(!(await page.evaluate(() => window.__menu.game)) && page.url().endsWith('/index.html'), 'the game\'s back link returns to the catalog without reloading it');
  check(errors.length === 0, `menu boots without errors ${errors.join(' | ')}`);
  await page.close();
}

// a real touch tap on the splash must land on the catalog, not fall through to a tile's game
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__menu && window.__menu.gagDone, null, { timeout: 8000 });
  await page.touchscreen.tap(195, 500);
  await page.waitForTimeout(1500);
  check(page.url().endsWith('/index.html') && !(await page.evaluate(() => window.__menu.game)), `touch tap on splash stays on the catalog (${page.url().split('/').slice(-2).join('/')})`);
  await ctx.close();
}

// ---------- ONLY 1% ----------
{
  const { page, errors } = await open('games/only1/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    // the solution wins
    await page.evaluate(i => window.__game.load(i), i);
    await page.screenshot({ path: path.join(shots, `only1-L${i + 1}-start.png`) });
    const sol = await page.evaluate(() => window.__game.LEVELS[window.__game.S.li].solution);
    for (const id of sol) { await page.evaluate(id => window.__game.act(id), id); await runUntil(page, () => false, 150); }
    const t = await runUntil(page, () => window.__game.state !== 'play', 1500);
    const st = await page.evaluate(() => ({ s: window.__game.state, r: window.__game.S.reason, c: window.__game.S.collected, g: window.__game.S.goldTotal }));
    await page.screenshot({ path: path.join(shots, `only1-L${i + 1}-solved.png`) });
    check(st.s === 'win', `only1 L${i + 1} solution wins (state=${st.s} ${st.r} after ${t} ticks, gold ${st.c}/${st.g})`);
    // every pin that is not in the solution, pulled first, loses
    const traps = await page.evaluate(() => { const L = window.__game.LEVELS[window.__game.S.li]; return L.pins.map(p => p.id).filter(id => !L.solution.includes(id) || L.solution[0] !== id); });
    for (const trap of traps) {
      await page.evaluate(i => window.__game.load(i), i);
      await page.evaluate(id => window.__game.act(id), trap);
      await runUntil(page, () => false, 150);
      const rest = await page.evaluate(() => window.__game.LEVELS[window.__game.S.li].solution);
      for (const id of rest) { if (id === trap) continue; await page.evaluate(id => window.__game.act(id), id); await runUntil(page, () => false, 150); }
      await runUntil(page, () => window.__game.state !== 'play', 1500);
      const s2 = await page.evaluate(() => ({ s: window.__game.state, r: window.__game.S.reason }));
      check(s2.s === 'fail', `only1 L${i + 1} trap "${trap}" first loses (state=${s2.s} ${s2.r})`);
    }
    // the knight's hint solves it
    await page.evaluate(i => { window.__game.load(i); window.__game.startHint(); }, i);
    const th = await runUntil(page, () => window.__game.state !== 'play', 2400);
    check((await page.evaluate(() => window.__game.state)) === 'win', `only1 L${i + 1} knight's hint solves it (${th} ticks)`);
  }
  check(errors.length === 0, `only1 runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- STICK SWARM (the ad is a crowd runner; the game is a sort puzzle) ----------
{
  const { page, errors } = await open('games/stickswarm/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => window.__game.load(i), i);
    await page.screenshot({ path: path.join(shots, `swarm-L${i + 1}-start.png`) });
    const ok = await page.evaluate(() => { const S = window.__game.S; return S.jars.every(j => j.length === 0 || j.length === 4) && !!window.__game.solve(); });
    check(ok, `swarm L${i + 1} deals a solvable board`);
    await page.evaluate(() => { window.__game.autopilot = 'solve'; });
    await runUntil(page, () => window.__game.state !== 'play', 8000, 60);
    const st = await page.evaluate(() => ({ s: window.__game.state, m: window.__game.S.movesN }));
    await page.screenshot({ path: path.join(shots, `swarm-L${i + 1}-end.png`) });
    check(st.s === 'win', `swarm L${i + 1} the solver's moves sort it (${st.s}, ${st.m} moves)`);
  }
  // a stickman can't land on another colour, and undo puts him back
  const r = await page.evaluate(() => { const g = window.__game; g.load(1); const J = g.S.jars, a = J.findIndex(j => j.length), b = J.findIndex((j, k) => k !== a && j.length && j[j.length - 1] !== J[a][J[a].length - 1]);
    const before = JSON.stringify(g.S.jars); g.act(a); const moved = g.act(b); const same = JSON.stringify(g.S.jars) === before;
    const e = g.S.jars.findIndex(j => !j.length); g.act(a); g.act(e); g.undo(); return { moved, same, undone: JSON.stringify(g.S.jars) === before }; });
  check(!r.moved && r.same && r.undone, 'swarm: wrong-colour drop is refused and undo restores the board');
  check(errors.length === 0, `swarm runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- PARKING JAM (the ad is a car puzzle; the game is a match-3) ----------
{
  const { page, errors } = await open('games/parkingjam/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => window.__game.load(i), i);
    check(await page.evaluate(() => window.__game.validMoves().length > 0), `parkingjam L${i + 1} deals a board with a move on it`);
    await page.screenshot({ path: path.join(shots, `parkingjam-L${i + 1}-start.png`) });
    await page.evaluate(() => { window.__game.autopilot = 'best'; });
    await runUntil(page, () => window.__game.state !== 'play', 6000, 60);
    const st = await page.evaluate(() => ({ s: window.__game.state, sc: window.__game.S.score, t: window.__game.S.L.target, m: window.__game.S.moves }));
    check(st.s === 'win', `parkingjam L${i + 1} good play wins (${st.s}, ${st.sc}/${st.t}, ${st.m} moves left)`);
  }
  // an invalid swap snaps back and costs nothing
  await page.evaluate(() => window.__game.load(0));
  const bad = await page.evaluate(() => { const g = window.__game, ok = new Set(g.validMoves().map(m => m.a + ',' + m.b)); for (let a = 0; a < 55; a++) if (!ok.has(a + ',' + (a + 1)) && (a % 7) < 6) return [a, a + 1]; });
  const before = await page.evaluate(() => ({ g: window.__game.S.grid.join(), m: window.__game.S.moves }));
  await page.evaluate(([a, b]) => window.__game.trySwap(a, b), bad);
  await runUntil(page, () => window.__game.S.phase === 'idle', 120, 10);
  const after = await page.evaluate(() => ({ g: window.__game.S.grid.join(), m: window.__game.S.moves }));
  check(before.g === after.g && before.m === after.m, 'parkingjam invalid swap snaps back and costs no move');
  // the last move short of the target loses
  await page.evaluate(() => { window.__game.load(0); window.__game.S.moves = 1; const m = window.__game.validMoves()[0]; window.__game.trySwap(m.a, m.b); });
  await runUntil(page, () => window.__game.state !== 'play', 600, 20);
  check((await page.evaluate(() => window.__game.state)) === 'fail', 'parkingjam out of moves short of the target loses');
  await page.screenshot({ path: path.join(shots, 'parkingjam-fail.png') });
  check(errors.length === 0, `parkingjam runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- HAIR SALON ASMR ----------
{
  const { page, errors } = await open('games/salon/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  // each guard leaves a different length
  const lens = await page.evaluate(() => { const g = window.__game; return g.GUARDS.map(q => { g.load(0); g.equip(q.k); g.cutAt(360, 400); return Math.max(...g.S.strands.filter(s => s.len < 30).map(s => s.len)); }); });
  check(new Set(lens).size === lens.length && lens.every((l, i) => !i || l > lens[i - 1]), `salon: every guard cuts to its own length (${lens.join(', ')} mm)`);
  for (let i = 0; i < n; i++) {
    // cutting to the order wins
    // the autopilot taps through the rituals (cape, chair, spray), cuts to the order, then tidies up
    await page.evaluate(i => { window.__game.load(i); window.__game.autopilot = 'style'; }, i);
    if (i === 0) { await runUntil(page, () => window.__game.S.rit.i === 1, 300, 5); await page.screenshot({ path: path.join(shots, 'salon-ritual-chair.png') }); }
    await runUntil(page, () => window.__game.state === 'result', 4000, 30);
    await runUntil(page, () => false, 90);
    await page.screenshot({ path: path.join(shots, `salon-L${i + 1}-done.png`) });
    const r = await page.evaluate(() => ({ s: window.__game.state, stars: window.__game.S.result.stars, all: window.__game.S.result.all }));
    check(r.s === 'result' && r.stars >= 2, `salon L${i + 1} cut to the order earns ${r.stars} stars (${Math.round(r.all * 100)}% to style)`);
  }
  // a tap right after a stage change is ignored; once the pause is over it counts
  await page.evaluate(() => window.__game.load(0));
  await page.mouse.click(180, 300);
  const early = await page.evaluate(() => window.__game.S.rit.n);
  await runUntil(page, () => false, 45);
  await page.mouse.click(180, 300);
  const later = await page.evaluate(() => window.__game.S.rit.n);
  check(early === 0 && later === 1, `salon: an accidental tap during a stage change doesn't count (${early} then ${later})`);

  // the chair: stamping the pedal sputters, timed strokes lift, overshooting has to be bled off, and it locks only in the green
  const ch = await page.evaluate(() => { const g = window.__game; g.load(0); g.S.rit.i = 1; g.S.capeTo = 1;
    for (let k = 0; k < 5; k++) g.tap(); const stamped = g.S.h;
    g.load(0); g.S.rit.i = 1; let timed = 0; for (let k = 0; k < 5; k++) { g.tap(); g.step(25); } timed = g.S.h;
    const [lo, hi] = g.S.L.band; for (let k = 0; k < 4; k++) { g.tap(); g.step(25); } const over = g.S.h > hi; g.step(90); const lockedHigh = g.S.pump.locked;
    return { stamped, timed, over, lockedHigh }; });
  check(ch.timed > ch.stamped * 2, `salon chair: timed pumps lift ${ch.timed.toFixed(2)}, stamping only ${ch.stamped.toFixed(2)}`);
  check(ch.over && !ch.lockedHigh, 'salon chair: above the green it will not lock');
  await page.evaluate(() => { const g = window.__game; g.S.releasing = true; });
  await runUntil(page, () => window.__game.S.h < window.__game.S.L.band[1] - .02, 300, 2);
  await page.evaluate(() => { window.__game.S.releasing = false; });
  await runUntil(page, () => window.__game.S.pump.locked, 200, 5);
  check(await page.evaluate(() => window.__game.S.pump.locked), 'salon chair: release back into the green and hold it to lock');

  // shaving everything with no guard is not what anyone asked for
  await page.evaluate(() => { window.__game.load(2); window.__game.autopilot = 'rituals'; });
  await runUntil(page, () => window.__game.state === 'play', 600, 10);
  const bad = await page.evaluate(() => { const g = window.__game; g.equip('0'); for (let x = 150; x < 580; x += 20) for (let y = 300; y < 680; y += 20) g.cutAt(x, y); g.finish(); return g.S.result; });
  await runUntil(page, () => window.__game.state === 'result', 600, 10);
  check(bad.stars === 0 && bad.short > 0, `salon: going too short scores no stars (${Math.round(bad.all * 100)}%, ${bad.short} too short)`);
  await runUntil(page, () => false, 90);
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => window.__game.S.li === 3 && window.__game.state === 'prep'), 'salon: a bad cut still moves on to the next customer');
  check(await page.evaluate(() => window.__game.S.guard === '0'), 'salon: the guard stays on between customers');
  check(errors.length === 0, `salon runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- BLOCKING ----------
{
  const { page, errors } = await open('games/blocking/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    // the opening layout (everyone in a line) is blocked, so CURTAIN UP refuses it
    await page.evaluate(i => { window.__game.load(i); window.__game.curtain(); }, i);
    const st0 = await page.evaluate(() => ({ s: window.__game.state, p: window.__game.S.ev.pairs }));
    check(st0.s === 'play' && st0.p > 0, `blocking L${i + 1} opening layout is blocked (${st0.p} sightlines) and the curtain refuses it`);
    await page.screenshot({ path: path.join(shots, `blocking-L${i + 1}-start.png`) });
    // the stated solution clears every seat and every rule
    await page.evaluate(i => { const g = window.__game; g.load(i); g.arrange(g.LEVELS[i].solution); g.curtain(); }, i);
    await runUntil(page, () => false, 90);
    const st = await page.evaluate(() => ({ s: window.__game.state, p: window.__game.S.ev.pairs, r: window.__game.S.ev.rules.map(r => r.ok) }));
    await page.screenshot({ path: path.join(shots, `blocking-L${i + 1}-solved.png`) });
    check(st.s === 'win', `blocking L${i + 1} solution wins (${st.s}, ${st.p} blocked, rules ${st.r})`);
  }
  // the lesson: a tight stagger blocks nearly as much as the straight line
  const t = await page.evaluate(() => { const g = window.__game; g.load(2); const line = g.S.ev.pairs; g.arrange(g.LEVELS[2].tight); return { line, tight: g.S.ev.pairs }; });
  check(t.tight > 0 && t.tight >= t.line * .8, `blocking: a 0.25 m nudge still blocks ${t.tight} of the line's ${t.line} sightlines`);
  // bodies can't overlap and fixed actors don't move
  const o = await page.evaluate(() => { const g = window.__game; g.load(1); const k = { ...g.S.pos[0] }; const moved = g.place(0, -3, 1); const q = g.S.pos[1]; const overlap = g.place(2, q.x, q.y); return { moved, overlap, k: g.S.pos[0].x === k.x && g.S.pos[0].y === k.y }; });
  check(!o.moved && o.k && !o.overlap, 'blocking: the king stays on his throne and actors cannot stand inside each other');
  check(errors.length === 0, `blocking runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- THE BOSS'S BAD DAY ----------
{
  const { page, errors } = await open('games/boss/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) for (const [pol, want] of [['good', 'win'], ['brute', 'fail'], [null, 'fail']]) {
    await page.evaluate(([i, pol]) => { window.__game.load(i); window.__game.autopilot = pol; }, [i, pol]);
    await runUntil(page, () => window.__game.state !== 'play', 3000, 60);
    const st = await page.evaluate(() => ({ s: window.__game.state, r: window.__game.S.reason }));
    check(st.s === want, `boss L${i + 1} ${pol || 'idle'} -> ${st.s} ${st.r}`);
  }
  check(errors.length === 0, `boss runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- THE LAST NOTE ----------
{
  const { page, errors } = await open('games/lastnote/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) for (const [pol, want] of [['groove', 'win'], ['square', 'fail'], ['masher', 'fail']]) {
    await page.evaluate(([i, pol]) => { window.__game.load(i); window.__game.autopilot = pol; }, [i, pol]);
    await runUntil(page, () => window.__game.state !== 'play', 4000, 60);
    const st = await page.evaluate(() => ({ s: window.__game.state, r: window.__game.S.reason }));
    check(st.s === want, `lastnote L${i + 1} ${pol} -> ${st.s} ${st.r}`);
  }
  check(errors.length === 0, `lastnote runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- VEER (the ad is a draw-the-path puzzle; the game is a foggy walk played by ear) ----------
{
  const { page, errors } = await open('games/veer/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  // the sound model: a forest costs ~23 dB per 100 m in Deep Woods, so a whistle dies near 150 m there but carries ~1.3 km in the open
  const snd = await page.evaluate(() => { const g = window.__game; g.load(3);
    const f = g.forestLoss(400, 760, 300, 760), near = g.levelAt(400, 760, 260, 760).L, far = g.levelAt(400, 760, 220, 760).L; g.load(0);
    const open = 100 - 20 * Math.log10(1300) - 13; return { f, near, far, open }; });
  check(Math.abs(snd.f - 23) < 1.5 && snd.near > 20 && snd.far < 20 && snd.open > 20, `veer: 100 m of deep forest costs ${snd.f.toFixed(1)} dB; heard at 140 m (${snd.near.toFixed(1)} dB) not 180 m (${snd.far.toFixed(1)} dB); open ground still carries 1.3 km`);
  // with no sun, walking "straight" curves away on its own
  const drift = await page.evaluate(() => { const g = window.__game; g.load(2); g.autopilot = 'straight'; g.step(60); const th0 = g.S.th; g.step(60 * 40); const S = g.S; return { turned: Math.abs(((S.th - th0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI), ratio: Math.hypot(S.x - S.L.start[0], S.y - S.L.start[1]) / S.walked }; });
  check(drift.turned > .3 && drift.ratio < .98, `veer: no sun, walking straight still drifts (${(drift.turned * 57.3).toFixed(0)} degrees off, ${(drift.ratio * 100).toFixed(0)}% as far as walked)`);
  // the wanderer stops once they hear you
  const wand = await page.evaluate(() => { const g = window.__game; g.load(5); g.start(); const F = g.S.friend; g.S.x = F.x + 60; g.S.y = F.y; g.step(40); g.whistle(); g.step(30); return F.stay; });
  check(wand, 'veer: the wanderer stays put once they hear your whistle');
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => { window.__game.load(i); window.__game.autopilot = 'clearing'; }, i);
    await runUntil(page, () => ['win', 'dark'].includes(window.__game.state), 40000, 600);
    const st = await page.evaluate(() => ({ s: window.__game.state, used: Math.round(window.__game.S.L.time - window.__game.S.timeLeft), of: window.__game.S.L.time, walked: Math.round(window.__game.S.walked) }));
    await runUntil(page, () => false, 180, 60);
    await page.screenshot({ path: path.join(shots, `veer-L${i + 1}-found.png`) });
    check(st.s === 'win', `veer L${i + 1} found by whistling and listening (${st.s}, ${st.used}/${st.of} s, walked ${st.walked} m)`);
  }
  // a tap right as a level opens doesn't skip its intro
  await page.evaluate(() => window.__game.load(0)); await page.mouse.click(270, 500);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'veer: an accidental tap as the level opens is ignored');
  check(errors.length === 0, `veer runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- THIRSTY ----------
{
  const { page, errors } = await open('games/thirsty/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) for (const [pol, want] of [['good', 'win'], ['greedy', 'pop']]) {
    await page.evaluate(([i, pol]) => { window.__game.load(i); window.__game.autopilot = pol; }, [i, pol]);
    await runUntil(page, () => window.__game.state !== 'play', 4000, 60);
    const st = await page.evaluate(() => ({ s: window.__game.state, r: window.__game.S.reason }));
    check(st.s === want, `thirsty L${i + 1} ${pol} -> ${st.s} ${st.r}`);
  }
  check(errors.length === 0, `thirsty runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- EMBERS (the ad is an idle fire tapper; the game is a night watch where the fire costs your eyes) ----------
{
  const { page, errors } = await open('games/embers/index.html');
  const m = await page.evaluate(() => { const g = window.__game; return { glance: g.lookCost(.3), stare: g.lookCost(40), dark: g.sight(0), blind: g.sight(17) }; });
  check(Math.abs(m.glance - 2) < .01 && Math.abs(m.stare - 17) < .05 && m.dark === 1 && m.blind === 0, `embers: a glance costs ${m.glance.toFixed(1)} night-minutes, a stare ${m.stare.toFixed(1)}`);
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => { window.__game.load(i); window.__game.autopilot = 'medium'; }, i);
    await runUntil(page, () => ['dawn', 'lost'].includes(window.__game.state), 8000, 300);
    const st = await page.evaluate(() => ({ s: window.__game.state, lives: window.__game.S.lives, why: window.__game.S.why }));
    await page.screenshot({ path: path.join(shots, `embers-L${i + 1}-end.png`) });
    check(st.s === 'dawn', `embers L${i + 1} survived to dawn with medium looks at the fire (${st.s}, ${st.lives} lives)`);
  }
  // the trade-off: only glancing leaves you cold; staring leaves you blind while things come
  const tr = await page.evaluate(async () => { const g = window.__game, out = {};
    for (const pol of ['glance', 'stare']) { g.load(4); g.autopilot = pol; for (let k = 0; k < 80 && !['dawn', 'lost'].includes(g.state); k++) g.step(120); out[pol] = { s: g.state, why: g.S.why, lives: g.S.lives }; }
    return out; });
  check(tr.glance.why === 'THE COLD GOT YOU' && tr.stare.lives < 3, `embers: glancing froze (${tr.glance.why}), staring got hurt (${tr.stare.lives} lives left)`);
  // you can only drive off what you can see
  const sh = await page.evaluate(() => { const g = window.__game; g.load(0); g.start(); g.step(40); g.S.debt = 17; g.S.beasts = [{ a: g.S.look, d: .2, v: 0, flee: 0, snapT: 9, id: 1 }]; g.step(1); return g.S.beasts[0]; });
  await page.mouse.click(270, 440);
  const after = await page.evaluate(() => window.__game.S.beasts[0].flee);
  check(!after, 'embers: right after staring at the fire you cannot see (or shoo) what is at the treeline');
  await page.evaluate(() => window.__game.load(0)); await page.mouse.click(270, 500);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'embers: an accidental tap as the night opens is ignored');
  check(errors.length === 0, `embers runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- GOING UP (the ad is a tower stacker; the game runs the lifts) ----------
{
  const { page, errors } = await open('games/goingup/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  const runDay = async (i, pol) => { await page.evaluate(([i, pol]) => { window.__game.load(i); window.__game.autopilot = pol; }, [i, pol]);
    await runUntil(page, () => ['win', 'lost'].includes(window.__game.state), 12000, 300);
    return page.evaluate(() => ({ s: window.__game.state, hearts: window.__game.S.hearts, max: Math.round(window.__game.S.maxWait), del: window.__game.S.delivered })); };
  for (let i = 0; i < n; i++) {
    const st = await runDay(i, 'sweep');
    await page.screenshot({ path: path.join(shots, `goingup-L${i + 1}-end.png`) });
    check(st.s === 'win', `goingup L${i + 1} the sweep rule finishes the day (${st.s}, ${st.del} delivered, longest wait ${st.max} s, ${st.hearts} hearts)`);
  }
  // the lesson: nearest-first strands the top floor until someone takes the stairs; the sweep bounds the wait
  const near = await runDay(2, 'nearest'), sw = await runDay(2, 'sweep');
  check(near.max >= 40 && near.hearts < 3 && sw.max < 20 && sw.hearts === 3, `goingup: on THE TOP FLOOR nearest-first left someone ${near.max} s (took the stairs), the sweep's longest wait was ${sw.max} s`);
  // manual: tapping a floor sends the lift there
  const man = await page.evaluate(() => { const g = window.__game; g.load(0); g.start(); g.step(40); g.send(g.S.cars[0], 3); g.step(150); return Math.round(g.S.cars[0].y); });
  check(man === 3, 'goingup: a tapped floor gets the lift');
  await page.evaluate(() => window.__game.load(0)); await page.mouse.click(270, 500);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'goingup: an accidental tap as the day opens is ignored');
  check(errors.length === 0, `goingup runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- SOAP OPERA SOLITAIRE ----------
{
  const { page, errors } = await open('games/soap/index.html');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(i => { window.__game.load(i); window.__game.autopilot = 'solve'; }, i);
    await runUntil(page, () => window.__game.state !== 'play', 6000, 60);
    check((await page.evaluate(() => window.__game.state)) === 'win', `soap season ${i + 1}: the solver's line clears the board`);
  }
  // no stock and nothing playable: the season is cancelled
  const st = await page.evaluate(() => { const g = window.__game, S = g.S; g.load(0); S.stock = []; S.waste = [{ r: 7, s: 'S' }]; S.tab = S.tab.map(c => c.joker ? { r: 1, s: 'S' } : { r: 1, s: c.s }); g.draw(); return S.state; });
  check(st === 'fail', 'soap: out of stock with no plays loses');
  check(errors.length === 0, `soap runs without errors ${errors.join(' | ')}`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
