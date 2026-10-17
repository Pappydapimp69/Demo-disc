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
  // the game frame's scripts may still be loading on a slow machine: wait for its engine before marking a win
  const gf = page.frameLocator('#play'); await gf.locator('canvas').waitFor();
  const swarm = page.frames().find(f => f.url().includes('stickswarm'));
  await swarm.waitForFunction(() => !!window.Engine && !!window.__game, null, { timeout: 8000 });
  await swarm.evaluate(() => Engine.Audio.sfx('win'));
  await page.waitForTimeout(200);
  await page.frameLocator('#play').locator('a.back').click();
  await page.waitForFunction(() => !window.__menu.game, null, { timeout: 4000 }).catch(() => {});
  check(!(await page.evaluate(() => window.__menu.game)) && page.url().endsWith('/index.html'), 'the game\'s back link returns to the catalog without reloading it');
  const stats = await page.evaluate(() => window.__menu.stats());
  check(['start', 'play/stickswarm', 'game/stickswarm/win', 'time/stickswarm/under-10s'].every(p => stats.includes(p)) && stats.some(p => /^ad\/stickswarm\//.test(p)),
    `stats record the funnel: ${stats.join(', ')}`);
  check(!(await page.evaluate(() => Stats.live)), 'stats stay local when run from a file (nothing is sent)');
  check(stats.includes('game/stickswarm/win-1'), 'stats count how far a player got (win-1)');
  await page.evaluate(() => { window.__menu.go(2); }); await page.waitForTimeout(700); await page.evaluate(() => { window.__menu.go(3); }); await page.waitForTimeout(700);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const st2 = await page.evaluate(() => window.__menu.stats());
  check(st2.some(p => /^ad\/[\w-]+\/skipped$/.test(p)) && st2.some(p => /^visit\/(under-30s|30s-2min|2-10min|10min\+)$/.test(p)) && st2.includes('visit/games-1'),
    `stats count skipped ads and the visit (${st2.filter(p => /skipped|visit/.test(p)).join(', ')})`);
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

// a game opened by a direct link counts itself
{
  const { page, errors } = await open('games/faro/index.html');
  await page.waitForFunction(() => window.Stats && Stats.sent.length, null, { timeout: 4000 }).catch(() => {});
  const st = await page.evaluate(() => window.Stats ? Stats.sent.map(e => e.path) : []);
  check(st.includes('play/faro/direct'), `stats: a game opened by a direct link counts the visit (${st.join(', ')})`);
  check(errors.length === 0, `direct-link stats run without errors ${errors.join(' | ')}`);
  await page.close();
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
    const ok = await page.evaluate(() => { const S = window.__game.S; return S.jars.every(j => j.length === 0 || j.length === S.L.cap) && !!window.__game.solve(); });
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
  // a hint shows the solver's next move from where you are, and following hints alone sorts the board
  const h = await page.evaluate(() => { const g = window.__game; g.load(2); let used = 0;
    for (let k = 0; k < 200 && g.state === 'play'; k++) { g.S.hints = 0; g.hint(); used++; const m = g.S.hint; if (!m) break; g.act(m.a); g.act(m.b); g.step(12); }
    return { st: g.state, used, par: g.S.par, moves: g.S.movesN }; });
  check(h.st === 'win' && h.moves === h.par, `swarm: following the hints sorts the board at par (${h.moves}/${h.par} moves)`);
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
  // she reacts: a line when you start, a cheer when he lands one, and an outraged one if you hit him
  const said = await page.evaluate(() => { const g = window.__game, S = g.S, out = {}; g.load(0); out.start = S.saidKind;
    S.kx = 200; g.fireAt(200); g.step(40); out.oops = S.saidKind;
    g.load(0); g.autopilot = 'good'; let ouch = false; for (let k = 0; k < 120 && g.state === 'play'; k++) { g.step(30); if (S.saidKind === 'ouch' || S.saidKind === 'win') ouch = true; } out.cheer = ouch; out.final = S.saidKind; return out; });
  check(said.start === 'start' && said.oops === 'oops' && said.cheer && said.final === 'win', `boss: the daughter reacts (start ${said.start}, hit him ${said.oops}, cheers ${said.cheer}, at the end ${said.final})`);
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
  // the rules are on screen before the song: it waits on the how-to card until you tap
  const intro = await page.evaluate(() => { const g = window.__game; g.load(0); g.step(240); return { st: g.state, tilesPlayed: g.S.tiles.filter(x => x.res).length }; });
  check(intro.st === 'intro' && intro.tilesPlayed === 0, 'lastnote: each funeral opens on a how-to card and waits for a tap');
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
  // pacing: a full bar lasts at least 45 s of every night, and a flick of a glance barely warms (hands take a moment to catch the heat)
  const pace = await page.evaluate(() => { const g = window.__game; return { last: Math.min(...g.LEVELS.map(L => 100 / L.cold)), flick: g.heatRate(.3), held: g.heatRate(3) }; });
  check(pace.last >= 45 && pace.flick < pace.held / 2, `embers: a full bar of warmth lasts ${Math.round(pace.last)} s at worst; hands warm ${pace.flick.toFixed(1)}/s at a flick vs ${pace.held.toFixed(1)}/s held`);
  // you can only drive off what you can see
  const sh = await page.evaluate(() => { const g = window.__game; g.load(0); g.start(); g.step(40); g.S.debt = 17; g.S.beasts = [{ a: g.S.look, d: .2, v: 0, flee: 0, snapT: 9, id: 1 }]; g.step(1); return g.S.beasts[0]; });
  await page.mouse.click(270, 440);
  const after = await page.evaluate(() => window.__game.S.beasts[0].flee);
  check(!after, 'embers: right after staring at the fire you cannot see (or shoo) what is at the treeline');
  const sr = await page.evaluate(() => { const g = window.__game; g.load(0); g.start(); g.step(40); g.S.debt = 0;
    const far = { a: g.S.look, d: .1, v: 0, flee: 0, snapT: 9, id: 2 }, near = { a: g.S.look, d: .6, v: 0, flee: 0, snapT: 9, id: 3 }; g.S.beasts = [far, near];
    const r = [g.shoo(far), g.shoo(near)]; g.S.voice = 0; const near2 = { a: g.S.look, d: .6, v: 0, flee: 0, snapT: 9, id: 4 }; r.push(g.shoo(near2));
    g.S.debt = 9; const eye = { a: g.S.look, d: .5, v: 0, flee: 0, snapT: 9, id: 5 }; g.S.beasts = [eye]; return [...r, g.eyesOnly(eye)].join(); });
  check(sr === 'false,true,false,true', `embers: a shout at the treeline is wasted, a close one works, no voice no shout, and eyes show before the body (${sr})`);
  const told = await page.evaluate(() => { const g = window.__game; g.autopilot = null; g.load(0); g.start(); g.step(40); g.S.debt = 0; g.S.voice = 3; g.shoo({ a: g.S.look, d: .1, v: 0, flee: 0, snapT: 9, id: 7 }); return g.S.callout && g.S.callout.text; });
  check(/TOO FAR/.test(told || ''), `embers: the first wasted shout explains itself (${told})`);
  const moon = await page.evaluate(() => { const g = window.__game, i = g.LEVELS.findIndex(L => L.dark); g.load(i); g.start(); g.step(40); g.S.debt = 0; g.S.voice = 3;
    const b = { a: g.S.look, d: .45, v: 0, flee: 0, snapT: 9, id: 9, pack: 1 }; g.S.beasts = [b]; return { eyes: g.eyesOnly(b), shooed: g.shoo(b) }; });
  check(moon.eyes && moon.shooed, `embers NEW MOON: even rested eyes see only eyeshine at middle distance, and a shout at the eyes works (${JSON.stringify(moon)})`);
  const rush = await page.evaluate(() => { const g = window.__game; g.load(2); g.start(); g.step(40); g.S.nextSpawn = 99;
    const a = { a: 0, d: .5, v: .08, flee: 0, snapT: 9, id: 1, pack: 7 }, b = { a: 2, d: .3, v: .08, flee: 0, snapT: 9, id: 2, pack: 7, lurk: true }; g.S.beasts = [a, b];
    g.step(120); const held = b.d; a.flee = 1; const v0 = b.v; g.step(2); return { held: +held.toFixed(2), faster: +(b.v / v0).toFixed(1), lurk: b.lurk }; });
  check(rush.held <= .38 && rush.faster > 2 && !rush.lurk, `embers: a pack's second one waits at the edge of the light (${rush.held}) and rushes ${rush.faster}x faster once you scare the first`);
  await page.evaluate(() => window.__game.load(0)); await page.mouse.click(270, 500);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'embers: an accidental tap as the night opens is ignored');
  check(errors.length === 0, `embers runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- IQ TEST 2026 (the ad is a ten-minute IQ test; the game is a week of spaced review, and an experiment) ----------
{
  const { page, errors } = await open('games/iqtest/index.html');
  const m = await page.evaluate(() => { const g = window.__game; return [g.miss(4, 'reset'), g.miss(4, 'drop'), g.miss(1, 'drop')]; });
  check(m.join() === '1,3,1', `iqtest: a miss from box 4 goes to box 1 under reset, box 3 under drop (${m})`);
  for (const rule of ['reset', 'drop']) {
    await page.goto('file://' + path.join(root, 'games/iqtest/index.html') + '?lab-miss=' + rule); await page.waitForFunction(() => !!window.__game);
    const r = await page.evaluate(() => { const g = window.__game, base = Date.UTC(2026, 9, 1, 12); let day = 0;
      g.lab.clock = () => base + day * 864e5; g.lab.reset();
      // a learner who misses every third card on its first two reviews, then knows it
      const seen = {}; g.autopilot = c => { seen[c.id] = (seen[c.id] || 0) + 1; return !(c.id % 3 === 0 && seen[c.id] <= 3); };
      const order = []; let dropOk = true;
      for (day = 0; day < 15; day++) { g.open(); const st = g.lab.events.length;
        for (let k = 0; k < 400 && g.state !== 'done'; k++) g.step(40);
        const ev = g.lab.events.slice(st), kinds = ev.filter(e => e.type === 'answer').map(e => e.kind);
        order.push({ day, reviews: kinds.filter(k => k === 'review').length, examFirst: !kinds.includes('exam') || kinds.indexOf('exam') < (kinds.indexOf('review') + 1 || 1e9) && kinds.lastIndexOf('exam') < (kinds.indexOf('review') < 0 ? 1e9 : kinds.indexOf('review')) });
        for (const e of ev) if (e.type === 'answer' && e.kind === 'review' && !e.ok && e.to !== (g.S.rule === 'reset' ? 1 : Math.max(1, e.from - 1))) dropOk = false; }
      return { rule: g.S.rule, maxReviews: Math.max(...order.map(o => o.reviews)), examFirst: order.every(o => o.examFirst), exams: g.lab.data.exams, dropOk,
        misses: g.lab.events.filter(e => e.type === 'answer' && e.kind === 'review' && !e.ok).length, json: (() => { try { return JSON.parse(g.lab.export()).arms.miss; } catch (_) { return null; } })() }; });
    check(r.rule === rule && r.json === rule, `iqtest ${rule}: the pinned arm is the one played and exported (${r.rule}, ${r.json})`);
    check(r.dropOk && r.misses > 0, `iqtest ${rule}: every missed review moved by its rule (${r.misses} misses)`);
    check(r.maxReviews <= 6, `iqtest ${rule}: never more than the daily budget of reviews (${r.maxReviews})`);
    check(r.exams[7] && r.exams[14] && !r.exams[28] && r.examFirst, `iqtest ${rule}: day 7 and 14 tests ran before that day's reviews (${JSON.stringify(r.exams)})`);
    const rep = await page.evaluate(() => window.__game.lab.events.filter(e => e.type === 'report').map(e => e.name));
    check(rep.includes(`lab-iq-${rule}-start`) && rep.some(n => n.startsWith(`lab-iq-${rule}-d7-`)) && rep.some(n => n.startsWith(`lab-iq-${rule}-day15-`)) && rep.every(n => /^[\w-]{1,40}$/.test(n)),
      `iqtest ${rule}: the start, each day and each test report anonymous counts the stats accept (${rep.length}, e.g. ${rep.filter(n => n.includes('-d7-'))[0]})`);
  }
  await page.screenshot({ path: path.join(shots, 'iqtest-done.png') });
  // the arm survives a reload; a fresh player can draw either
  await page.goto('file://' + path.join(root, 'games/iqtest/index.html')); await page.waitForFunction(() => !!window.__game);
  const arms = await page.evaluate(() => { const out = new Set(); for (let i = 0; i < 40; i++) { const l = Lab.create('iq-probe-' + i); out.add(l.arm('miss', ['reset', 'drop'])); l.reset(); } return [...out].sort().join(); });
  const a1 = await page.evaluate(() => window.__game.S.rule); await page.reload(); await page.waitForFunction(() => !!window.__game);
  const a2 = await page.evaluate(() => window.__game.S.rule);
  check(arms === 'drop,reset' && a1 === a2, `iqtest: both arms get drawn across players (${arms}) and a player keeps theirs across visits (${a1} = ${a2})`);
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForFunction(() => !!window.__game);
  await page.mouse.click(270, 830);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'iqtest: an accidental tap as the day opens is ignored');
  check(errors.length === 0, `iqtest runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- POP IT (the ad is a fidget board; the game is a game-feel experiment) ----------
{
  const { page, errors } = await open('games/popit/index.html');
  const r = await page.evaluate(() => { const g = window.__game, out = {};
    for (const [k, j] of [['on', true], ['off', false]]) { g.autopilot = true; g.startRound(42, j); let n = 0; while (g.state === 'play' && n++ < 300) g.step(30); out[k] = g.S.result; }
    g.autopilot = false; return out; });
  check(r.on.score === r.off.score && r.on.pops === r.off.pops && r.on.escaped === r.off.escaped && r.on.stopTicks > 0 && r.off.stopTicks === 0,
    `popit: juice changes nothing a score depends on (on ${r.on.score}/${r.on.pops} popped, off ${r.off.score}/${r.off.pops}; hit-stop ${r.on.stopTicks} vs ${r.off.stopTicks} ticks)`);
  const spread = await page.evaluate(() => { const g = window.__game, out = []; for (const re of [.5, .9]) { g.reaction = re; g.autopilot = true; g.startRound(9, false); let n = 0; while (g.state === 'play' && n++ < 300) g.step(30); out.push(g.S.result.escaped); } g.autopilot = false; g.reaction = .45; return out; });
  check(spread[1] > spread[0] && spread[1] > 5, `popit: a slower player lets more get away, so scores have room to differ (${spread[0]} vs ${spread[1]} escaped)`);
  const flow = await page.evaluate(() => { const g = window.__game; g.lab.reset(); const seen = new Set();
    g.startRound(); for (let i = 0; i < 4; i++) { seen.add(g.S.juice); g.autopilot = true; let n = 0; while (g.state === 'play' && n++ < 300) g.step(30); g.autopilot = false; g.step(60); g.rate(3); g.step(40); g.again(i < 3); g.step(40); }
    const ev = g.lab.events; return { both: seen.size, results: ev.filter(e => e.type === 'result').length, choices: ev.filter(e => e.type === 'choice').length, rated: ev.filter(e => e.type === 'result').every(e => e.rating === 3 && typeof e.juice === 'boolean'), state: g.state,
      on: ev.filter(e => e.type === 'round' && e.juice).length }; });
  await page.screenshot({ path: path.join(shots, 'popit-end.png') });
  const prep = await page.evaluate(() => window.__game.lab.events.filter(e => e.type === 'report').map(e => e.name));
  check(prep.filter(n => /-rate3$/.test(n)).length === 4 && prep.filter(n => /-(again|stop)$/.test(n)).length === 4 && prep.some(n => n.startsWith('lab-pop-on-')) && prep.some(n => n.startsWith('lab-pop-off-')) && prep.every(n => /^[\w-]{1,40}$/.test(n)),
    `popit: every round reports its rating, score band, escapes and choice as anonymous counts (${prep.length} reports)`);
  check(flow.both === 2 && flow.on === 2 && flow.results === 4 && flow.choices === 4 && flow.rated && flow.state === 'end',
    `popit: four rounds draw juice on twice and off twice, each logs a result, a rating and a choice, then stops (${JSON.stringify(flow)})`);
  // multi-touch: three fingers landing at once on three bubbles pop all three, juice on (hit-stop after the first) or off
  const cdp = await page.context().newCDPSession(page);
  for (const juice of [true, false]) {
    const pts = await page.evaluate(j => { const g = window.__game; g.autopilot = false; g.startRound(5, j); g.step(20);
      g.S.bubbles = [[120, 500], [270, 600], [420, 700]].map(([x, y], i) => ({ id: 900 + i, x, y, r: 40, v: 0, col: '#f00', wob: 0, born: 0, seen: 0, age: 0 }));
      g.S.nextSpawn = 99; return g.S.bubbles.map(b => ({ x: b.x, y: b.y })); }, juice);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const mt = await page.evaluate(() => { const g = window.__game; return { pops: g.S.pops, taps: g.S.taps, left: g.S.bubbles.filter(b => !b.gone).length }; });
    check(mt.pops === 3 && mt.taps === 3 && mt.left === 0, `popit: three fingers at once pop three bubbles with juice ${juice ? 'on' : 'off'} (${JSON.stringify(mt)})`);
  }
  // two fingers on the same bubble during hit-stop pop it once, not twice
  const dbl = await page.evaluate(() => { const g = window.__game; g.startRound(6, true); g.step(20); g.S.bubbles = [{ id: 1, x: 270, y: 500, r: 40, v: 0, col: '#f00', wob: 0, born: 0, seen: 0, age: 0 }]; g.S.nextSpawn = 99;
    g.tap(270, 500); g.tap(272, 502); return { pops: g.S.pops, whiffs: g.S.whiffs }; });
  check(dbl.pops === 1 && dbl.whiffs === 1, `popit: a second finger on a bubble already popped doesn't pop it again (${JSON.stringify(dbl)})`);
  await page.goto('file://' + path.join(root, 'games/popit/index.html')); await page.waitForFunction(() => !!window.__game); await page.mouse.click(270, 800);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'popit: an accidental tap as the game opens is ignored');
  check(errors.length === 0, `popit runs without errors ${errors.join(' | ')}`);
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
  // zoning is a trade: on the down-peak it bounds the longest wait (nobody takes the stairs) at a worse average
  const bell = await page.evaluate(() => { const g = window.__game, i = g.LEVELS.findIndex(L => L.bell), L = g.LEVELS[i]; g.load(i); g.start(); g.step(40); let inWin = 0, before = 0, seen = new Set();
    for (let k = 0; k < 4000 && g.S.clock < L.bell.at + L.bell.len; k++) { g.S.waiting.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); if (p.at >= L.bell.at) inWin++; else before++; } }); g.step(1); g.S.waiting.forEach(p => { p.at = p.at; }); g.S.hearts = 3; }
    return { inWin, before }; });
  check(bell.inWin >= 25, `goingup LUNCH BELL: the bell brings a real surge (${bell.inWin} people in 15 s after ${bell.before} in 45 s)`);
  const fz = await runDay(4, 'zoned'), fs = await runDay(4, 'sweep');
  check(fz.s === 'win' && fz.hearts === 3 && fz.max < fs.max, `goingup: on FIVE O'CLOCK zones cut the longest wait to ${fz.max} s from the sweep's ${fs.max} s`);
  // manual: tapping a floor sends the lift there
  const man = await page.evaluate(() => { const g = window.__game; g.load(0); g.start(); g.step(40); g.send(g.S.cars[0], 3); g.step(150); return Math.round(g.S.cars[0].y); });
  check(man === 3, 'goingup: a tapped floor gets the lift');
  const pk = await page.evaluate(() => { const g = window.__game; g.load(1); g.start(); g.step(40); const c = g.S.cars[0]; g.S.waiting = []; c.y = 4; c.target = null; c.stops = []; g.park(c, 0); g.step(200); return Math.round(c.y); });
  check(pk === 0, `goingup: an idle lift goes to its parking floor (${pk})`);
  const q = await page.evaluate(() => { const g = window.__game; g.load(0); g.start(); g.step(40); const c = g.S.cars[0]; c.y = 0;
    g.send(c, 4); g.send(c, 2); g.send(c, 3); g.send(c, 3); const queued = [c.target, ...c.stops].join();
    let first = null; for (let k = 0; k < 400 && first === null; k++) { g.step(1); if (c.door > 0) first = Math.round(c.y); }
    return { queued, first }; });
  check(q.queued === '4,2' && q.first === 2, `goingup: taps queue stops, a second tap cancels one, and a queued floor on the way is served on the way (queued ${q.queued}, first stop ${q.first})`);
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

// ---------- LOBBY (the ad is a ten-million-player battle royale; the game is the matchmaking terminal) ----------
{
  const { page, errors } = await open('games/lobby/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(i => { const g = window.__game; const out = {};
      for (const pol of ['smart', 'fifo']) { g.load(i); g.autopilot = pol; for (let k = 0; k < 600 && g.state !== 'report'; k++) g.step(10); out[pol] = g.result(); }
      g.load(i); g.autopilot = 'smart'; for (let k = 0; k < 600 && g.state !== 'report'; k++) g.step(10); return out; }, i);
    await page.screenshot({ path: path.join(shots, `lobby-S${i + 1}-report.png`) });
    check(r.smart.pass && r.smart.happy > r.fifo.happy, `lobby shift ${i + 1}: waiting for fair lobbies passes (${r.smart.happy} happy, ${r.smart.quits} quits); first-come matching doesn't beat it (${r.fifo.happy} happy)`);
  }
  const law = await page.evaluate(() => { const g = window.__game, i = g.LEVELS.findIndex(L => L.name === 'LAUNCH DAY'), L = g.LEVELS[i]; g.load(i); g.autopilot = 'smart'; for (let k = 0; k < 600 && g.state !== 'report'; k++) g.step(10);
    return { served: g.S.matched, cap: Math.floor(L.servers * L.n * L.len / L.dur), arrived: g.arrivals(i).length }; });
  check(law.served <= law.cap && law.arrived > law.cap, `lobby launch day: three servers cap the shift at ${law.cap} players however you play (served ${law.served} of ${law.arrived})`);
  const v = await page.evaluate(() => { const g = window.__game, L = g.LEVELS[2], p = (skill, reg, at) => ({ skill, reg, at });
    return [g.tol(0), g.tol(16), g.verdict([p(3, 'EU', 0), p(4, 'EU', 0), p(4, 'EU', 0), p(5, 'EU', 0)], 0, L).happy, g.verdict([p(3, 'EU', 0), p(4, 'EU', 0), p(4, 'EU', 0), p(5, 'EU', 0)], 16, L).happy, g.verdict([p(4, 'EU', 0), p(4, 'NA', 0), p(4, 'EU', 0), p(4, 'EU', 0)], 30, L).happy]; });
  check(v.join() === '1,3,0,4,0', `lobby rules: the window widens with waiting and mixed regions please nobody (${v.join()})`);
  const party = await page.evaluate(() => { const g = window.__game; g.load(3); g.start(); g.step(60); g.step(1500); const p = g.S.queue.find(q => q.party); if (!p) return 'none'; g.toggle(p); return g.S.sel.size; });
  check(party === 2, `lobby: tapping one party member selects the whole party (${party})`);
  const fit = await page.evaluate(() => { const g = window.__game; g.load(1); g.start(); g.step(60); g.S.clock = 0; const P = (id, skill) => ({ id, name: 'p' + id, skill, reg: 'EU', at: 0, pat: 99, party: null });
    g.S.queue = [P(1, 5), P(2, 5), P(3, 9)]; g.S.sel = new Set([1]); return [g.fits(g.S.queue[1]), g.fits(g.S.queue[2]), g.fits(g.S.queue[0])].join(); });
  check(fit === 'true,false,', `lobby: rows show whether adding them keeps the lobby fair (${fit})`);
  const rentCurve = await page.evaluate(() => { const g = window.__game, i = g.LEVELS.findIndex(L => L.rent), out = {};
    for (const c of [2, 6, 9]) { g.load(i); g.rent(c); g.autopilot = 'smart'; for (let k = 0; k < 700 && g.state !== 'report'; k++) g.step(10); out[c] = { net: g.net(), pass: g.result().pass }; } return out; });
  check(rentCurve[6].pass && !rentCurve[2].pass && rentCurve[6].net > rentCurve[9].net && rentCurve[6].net > rentCurve[2].net,
    `lobby SEASON 2: renting about the load wins (6 servers net ${rentCurve[6].net}); too few (2: ${rentCurve[2].net}) or too many (9: ${rentCurve[9].net}) lose happy players`);
  const bf = await page.evaluate(() => { const g = window.__game, i = g.LEVELS.findIndex(L => L.leave), out = {};
    for (const pol of ['smart', 'fifo']) { g.load(i); g.autopilot = pol; for (let k = 0; k < 600 && g.state !== 'report'; k++) g.step(10); out[pol] = { filled: g.S.filled, abandoned: g.S.abandoned, happy: g.S.happy }; } return out; });
  check(bf.smart.filled > 0 && bf.smart.abandoned === 0 && bf.fifo.abandoned > 0, `lobby backfill: filling open seats saves matches (${bf.smart.filled} filled, 0 abandoned); ignoring them abandons ${bf.fifo.abandoned / 3}`);
  await page.evaluate(() => window.__game.load(0)); await page.mouse.click(270, 500);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'lobby: an accidental tap as the shift opens is ignored');
  check(errors.length === 0, `lobby runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- TROLLEY DASH (the ad is a quiet cart-return puzzle; the game is a kart racer) ----------
{
  const { page, errors } = await open('games/trolleydash/index.html');
  const tr = await page.evaluate(() => { const g = window.__game, out = [];
    for (let i = 0; i < g.TRACKS.length; i++) { g.load(i); const t = g.S.trk, p = t.line[0]; out.push({ L: Math.round(t.L), start: t.ter[(p.y | 0) * t.N + (p.x | 0)] }); } return out; });
  check(tr.every(t => t.L > 1500 && t.start === 7), `trolleydash: every track builds a closed road with the start line on it (${tr.map(t => t.L).join(', ')} units)`);
  const ph = await page.evaluate(() => { const g = window.__game, t = g.S.trk, dt = 1 / 60, out = {}, G = { steer: 0, gas: 1, brake: 0, drift: false };
    const flat = code => ({ N: t.N, ter: new Uint8Array(t.N * t.N).fill(code) }), run = (k, tr, inp, n) => { for (let i = 0; i < n; i++) { g.stepKart(k, inp, tr, dt); k.x = 500; k.y = 500; } };
    for (const [name, code] of [['road', g.T.ROAD], ['grass', g.T.GRASS]]) { const k = g.newKart(500, 500, 0, {}); run(k, flat(code), G, 600); out[name] = Math.round(g.speedOf(k)); }
    { const tr = flat(g.T.ROAD), k = g.newKart(500, 500, 0, {}); run(k, tr, G, 300); run(k, tr, { ...G, steer: 1, drift: true }, 150); run(k, tr, G, 1); out.boost = k.boost; let mx = 0; for (let i = 0; i < 60; i++) { run(k, tr, G, 1); mx = Math.max(mx, g.speedOf(k)); } out.boostSpeed = Math.round(mx); }
    { const k = g.newKart(t.line[0].x, t.line[0].y, Math.atan2(t.line[0].dy, t.line[0].dx) - 1.4, {}); out.inWall = 0; for (let i = 0; i < 600; i++) { g.stepKart(k, { ...G, steer: -.5 }, t, dt); if (g.terrainAt(t, k.x, k.y) === g.T.WALL) out.inWall++; } }
    return out; });
  check(ph.grass < ph.road * .6 && ph.boost >= 1 && ph.boostSpeed > ph.road * 1.25 && ph.inWall === 0,
    `trolleydash physics: road ${ph.road}, grass ${ph.grass}; a long drift fires a mini-turbo to ${ph.boostSpeed}; driving into the wall never ends up inside it`);
  const ros = await page.evaluate(() => { const g = window.__game, blank = [], sums = [];
    for (let c = 0; c < g.CHARS.length; c++) for (let v = 0; v < g.VEHS.length; v++) { const cv = g.kartSprite(c, v), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let px = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) px++; if (px < 60) blank.push(c + ':' + v); }
    for (const x of [...g.CHARS, ...g.VEHS]) sums.push(Object.values(x.pts).reduce((a, b) => a + b, 0));
    return { blank, sums, traits: new Set(g.CHARS.map(c => c.trait)).size }; });
  check(!ros.blank.length && ros.sums.every(x => x === 0) && ros.traits === 8, `trolleydash roster: all 24 shopper+vehicle sprites drawn, every stat line adds to zero, 8 different traits (${ros.blank.join() || 'ok'})`);
  for (let ti = 0; ti < 3; ti++) {
    const race = await page.evaluate(ti => { const g = window.__game; g.load(ti, 1); g.S.auto = true; for (let i = 0; i < 400 && g.S.state !== 'results'; i++) g.step(120);
      return { name: g.S.trk.def.name, state: g.S.state, done: g.S.order.filter(k => k.done).length, rescues: g.S.karts.reduce((a, k) => a + (k.rescues || 0), 0), first: g.S.order[0].finishT, last: g.S.order[7].finishT, skips: g.S.trk.shortcuts.map(c => Math.round(c.skip)) }; }, ti);
    await page.screenshot({ path: path.join(shots, `trolleydash-T${ti + 1}-results.png`) });
    check(race.state === 'results' && race.done >= 7 && race.rescues <= 4 && race.skips.every(x => x < 600), `trolleydash ${race.name}: ${race.done}/8 karts finish 3 laps within 30 s of the player (${race.first.toFixed(1)}-${(race.last || 0).toFixed(1)} s, ${race.rescues} rescues); every shortcut skips under 600 units so laps count (${race.skips.join(', ')})`);
  }
  const sc = await page.evaluate(() => { const g = window.__game, out = [];
    for (let ti = 0; ti < 3; ti++) { g.load(ti, 1); g.S.trk.shortcuts.forEach((c, si) => out.push({ name: c.name, road: c.ter === 'ROAD', main: g.timeShortcut(ti, si, false, false), cut: g.timeShortcut(ti, si, true, false), mainB: g.timeShortcut(ti, si, false, true), cutB: g.timeShortcut(ti, si, true, true) })); }
    return out; });
  for (const c of sc) {
    if (c.road) check(c.cut < c.main - .5, `trolleydash ${c.name} (alley): saves ${(c.main - c.cut).toFixed(2)} s on the main line`);
    else check(c.cut > c.main - .1 && c.cutB < c.mainB - .2, `trolleydash ${c.name} (off-road): ${(c.cut - c.main).toFixed(2)} s slower without a boost, ${(c.mainB - c.cutB).toFixed(2)} s faster with a coffee`);
  }
  const it = await page.evaluate(() => { const g = window.__game, r = g.mkRng(5), counts = {}; for (const pl of [1, 8]) { counts[pl] = {}; for (let i = 0; i < 2000; i++) { const x = g.rollItem(pl, r); counts[pl][x] = (counts[pl][x] || 0) + 1; } }
    g.load(0, 1); g.S.state = 'race'; const a = g.S.karts[0], b = g.S.karts[1]; b.x = a.x + Math.cos(a.a) * 40; b.y = a.y + Math.sin(a.a) * 40; b.vx = b.vy = 0; a.item = 'melon'; g.useItem(a); for (let i = 0; i < 40; i++) g.step(1);
    return { first: counts[1], last: counts[8], hit: (b.hits || 0) > 0 }; });
  check(!it.first.espresso && !it.first.tannoy && !it.last.banana && it.last.espresso > 300 && it.first.banana > 500 && it.hit,
    `trolleydash items: 1st gets defence (${it.first.banana} peels in 2000), 8th gets speed (${it.last.espresso} espressos) and never a peel; a thrown melon spins the kart ahead`);
  const ev = await page.evaluate(() => { const g = window.__game, combos = new Set(); for (let seed = 1; seed <= 10; seed++) { const p = g.planEvents(seed, 0); combos.add(p.list.map(e => e.kind).join('+') + ':' + p.door); }
    let door = null; for (let seed = 1; seed < 30 && !door; seed++) { g.load(0, seed); const sc = g.S.trk.shortcuts.find(c => c.closed); if (sc) { const d = sc.doorAt; door = { wall: g.terrainAt(g.S.trk, d.x, d.y) === g.T.WALL, seed }; g.S.auto = true; let took = false; for (let i = 0; i < 400 && g.S.state !== 'results'; i++) { g.step(60); if (g.S.karts.some(k => k.route && g.S.trk.shortcuts[k.route.sc] === sc)) took = true; } door.took = took; door.finished = g.S.order.filter(k => !k.est).length; } }
    g.load(0, 3); const leak = g.S.trk.shortcuts.some(c => c.closed) === (g.planEvents(3, 0).door >= 0);
    return { combos: combos.size, door, leak }; });
  check(ev.combos >= 5 && ev.door && ev.door.wall && !ev.door.took && ev.door.finished >= 7 && ev.leak,
    `trolleydash events: 10 seeds give ${ev.combos} different event plans; a shut roller door walls the alley, no CPU tries it, the race still finishes (${ev.door && ev.door.finished}/8)`);
  const juice = await page.evaluate(() => { const g = window.__game, res = []; for (const shake of [false, true]) { g.load(0, 2); g.S.auto = true; for (let i = 0; i < 400 && g.S.state !== 'results'; i++) { if (shake) g.S.shake = 1; g.step(60); } res.push(g.S.order.map(k => k.id + ':' + k.finishT.toFixed(3)).join(' ')); } return res[0] === res[1]; });
  check(juice, 'trolleydash: screen shake and speed lines are presentation only (the same seed finishes identically with them on)');
  const cheat = await page.evaluate(() => { const g = window.__game; g.load(0, 1); g.S.state = 'race'; g.S.auto = true; const k = g.S.player, t = g.S.trk, L = t.line, n = L.length;
    for (let i = 0; i < 400; i++) g.step(1);   // over the line: lap 0
    const lap0 = k.lap; const p = L[n - 5]; Object.assign(k, { x: p.x, y: p.y, li: n - 5 });   // jump back to just before the line, skipping both checkpoints
    for (let i = 0; i < 200; i++) g.step(1); return { lap0, lap: k.lap }; });
  check(cheat.lap === cheat.lap0, `trolleydash: crossing the line without passing the checkpoints doesn't count a lap (${cheat.lap0} -> ${cheat.lap})`);
  check(errors.length === 0, `trolleydash runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- FARO (the ad is a casino; the game is a perfect-shuffle puzzle) ----------
{
  const { page, errors } = await open('games/faro/index.html');
  const m = await page.evaluate(() => { const g = window.__game, id = d => d.every((c, i) => c === i);
    let d = g.newDeck(52), outs = 0; do { d = g.outFaro(d); outs++; } while (!id(d));
    d = g.newDeck(52); let ins = 0; do { d = g.inFaro(d); ins++; } while (!id(d));
    let wrong = 0, notShortest = 0; for (let p = 1; p < 52; p++) { let e = g.newDeck(52); for (const s of g.binary(p)) e = s === 'in' ? g.inFaro(e) : g.outFaro(e); if (e[p] !== 0) wrong++; if (g.plan(0, p, 52).length < g.binary(p).length) notShortest++; }
    return { outs, ins, wrong, notShortest }; });
  check(m.outs === 8 && m.ins === 52, `faro: 8 out faros restore 52 cards, in faros need ${m.ins}`);
  check(m.wrong === 0 && m.notShortest === 0, 'faro: writing the position in binary (1 = in, 0 = out) puts the top card there, in the fewest shuffles, for every position');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => { window.__game.load(i); window.__game.autopilot = 'solve'; }, i);
    await runUntil(page, () => window.__game.state === 'win', 1200, 30);
    const st = await page.evaluate(() => ({ s: window.__game.state, m: window.__game.S.moves, par: window.__game.S.par }));
    await page.screenshot({ path: path.join(shots, `faro-L${i + 1}-win.png`) });
    check(st.s === 'win' && st.m === st.par, `faro hand ${i + 1} solved at par (${st.m}/${st.par})`);
  }
  const poss = await page.evaluate(() => { const g = window.__game, n = 8, key = d => d.join(','), seen = new Set([key(g.newDeck(n))]), q = [g.newDeck(n)];
    while (q.length) { const d = q.shift(); for (const f of [g.inFaro, g.outFaro]) { const e = f(d); if (!seen.has(key(e))) { seen.add(key(e)); q.push(e); } } }
    const anyOdd = [...seen].some(k => g.odd(k.split(',').map(Number)));
    const calls = g.LEVELS.filter(L => L.goal.target).map(L => g.possible(L) + (g.odd(L.goal.target) ? ':odd' : ':even'));
    const i = g.LEVELS.findIndex(L => L.goal.target && g.possible(L)); g.load(i); g.start(); g.step(60); const m0 = g.S.moves; g.declare(); const penalty = g.S.moves - m0, still = g.state;
    return { reach: seen.size, anyOdd, calls: calls.join(), penalty, still }; });
  check(poss.reach === 24 && !poss.anyOdd && poss.calls === 'true:even,false:odd,false:even' && poss.penalty === 3 && poss.still === 'play',
    `faro POSSIBLE?: 8 cards reach ${poss.reach} orders, none odd; hands are possible / odd / even-but-unreachable (${poss.calls}); a wrong IMPOSSIBLE call costs ${poss.penalty}`);
  const house = await page.evaluate(() => { const g = window.__game; let bad = 0, min = 99; for (let k = 0; k < 30; k++) { const L = g.houseDeal(k), p = g.par(L); if (!(p >= 4)) bad++; min = Math.min(min, p); } return { bad, min }; });
  check(house.bad === 0, `faro: 30 house deals are all solvable and at least 4 shuffles deep (shallowest ${house.min})`);
  await page.evaluate(() => window.__game.load(0)); await page.mouse.click(270, 500);
  check(await page.evaluate(() => window.__game.state === 'intro'), 'faro: an accidental tap as the hand opens is ignored');
  check(errors.length === 0, `faro runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- THE INTERN ----------
{
  const { page, errors } = await open('games/intern/index.html');
  for (let i = 0; i < 3; i++) for (const [pol, want, stars] of [['good', 'win', 3], ['unplug', 'win', 1], [null, 'fail', 0]]) {
    await page.evaluate(([i, pol]) => { window.__game.load(i); window.__game.autopilot = pol; }, [i, pol]);
    await runUntil(page, () => window.__game.state !== 'play', 6000, 60);
    const st = await page.evaluate(() => ({ s: window.__game.state, stars: window.__game.S.stars }));
    check(st.s === want && (want !== 'win' || st.stars === stars), `intern day ${i + 1} ${pol || 'idle'} -> ${st.s} ${st.stars}*`);
  }
  check(errors.length === 0, `intern runs without errors ${errors.join(' | ')}`);
  await page.close();
}

// ---------- STONEWAKE ----------
{
  const { page, errors } = await open('games/stonewake/index.html');
  for (const [r, boss, allies, lv] of [['forest', 'gforest', [], 1], ['cave', 'gcave', ['knight'], 3], ['desert', 'gdesert', ['knight', 'mage'], 5]]) {
    const res = await page.evaluate(([r, boss, allies, lv]) => { const g = window.__game; g.newGame(); g.finish(); g.enterRegion(r); g.finish(); allies.forEach(a => g.recruit(a)); g.G.shards = allies.length; g.setLevel(lv); g.autopilot = 'perfect'; g.startBattle([boss], 'boss'); for (let k = 0; k < 6000 && g.S.mode === 'battle'; k++) g.step(10); return { mode: g.state, shards: g.G.shards, n: g.G.party.length }; }, [r, boss, allies, lv]);
    check(res.mode === 'map' && res.shards === allies.length + 1 && res.n === allies.length + 2, `stonewake ${r}: the golem falls to timed hits, shard + companion (${JSON.stringify(res)})`);
  }
  // tactics matter: tapping FIGHT with perfect timing cannot break the crystal golem's shell; the counter (SHARD STRIKE) can
  const shellTest = await page.evaluate(() => { const g = window.__game, out = {}; for (const auto of ['fightonly', 'perfect']) { g.newGame(); g.finish(); g.enterRegion('cave'); g.finish(); g.recruit('knight'); g.G.shards = 1; g.setLevel(3); g.autopilot = auto; g.startBattle(['gcave'], 'boss'); for (let k = 0; k < 9000 && g.S.mode === 'battle' && !['win', 'lose'].includes(g.S.battle.phase); k++) g.step(10); out[auto] = g.S.battle ? g.S.battle.phase : g.S.mode; } return out; });
  check(shellTest.fightonly === 'lose' && shellTest.perfect === 'win', `stonewake: the crystal golem needs its counter (${JSON.stringify(shellTest)})`);
  // things to find: a chest, a secret, the one-night campfire
  const finds = await page.evaluate(() => { const g = window.__game; g.newGame(); g.finish(); g.autopilot = null; g.enterRegion('forest'); g.finish(); const p0 = g.G.items.POTION;
    const walk = (x, y) => { g.S.hero.x = x; g.S.hero.y = y; g.S.hero.px = x; g.S.hero.py = y; g.S.hero.k = 1; };
    walk(2, 8); g.S.keys.ArrowLeft = true; g.step(20); g.S.keys.ArrowLeft = false; g.finish(); const chest = g.G.items.POTION - p0;
    walk(6, 15); g.S.keys.ArrowRight = true; g.step(20); g.S.keys.ArrowRight = false; g.finish(); const charm = !!g.G.gear.iron;
    for (const m of g.G.party) m.hp = 1; walk(7, 10); g.S.keys.ArrowUp = true; g.step(20); g.S.keys.ArrowUp = false; g.finish(); const healed = g.G.party[0].hp;
    for (const m of g.G.party) m.hp = 1; walk(7, 10); g.S.keys.ArrowUp = true; g.step(20); g.S.keys.ArrowUp = false; g.finish(); const second = g.G.party[0].hp;
    return { chest, charm, healed, second }; });
  check(finds.chest === 2 && finds.charm && finds.healed > 1 && finds.second === 1, `stonewake: chest, secret and a one-night campfire (${JSON.stringify(finds)})`);
  for (const [choice, want] of [[0, 'fell'], [1, 'sleeps']]) {
    const res = await page.evaluate(choice => { const g = window.__game; g.newGame(); g.finish(); ['knight', 'mage', 'archer'].forEach(a => g.recruit(a)); g.G.shards = 3; g.setLevel(7); g.enterRegion('titan'); g.finish(); g.autopilot = 'perfect'; g.pickChoice(choice); for (let k = 0; k < 8000 && g.S.mode !== 'ending' && g.S.mode !== 'over'; k++) g.step(10); return g.S.ending && g.S.ending.which; }, choice);
    check(res === want, `stonewake finale ${choice ? 'CALM' : 'FIGHT'} -> ending "${res}"`);
  }
  // tap-to-walk: tapping a tile walks the hero there
  const walked = await page.evaluate(() => { const g = window.__game; g.newGame(); g.finish(); g.S.cut && (g.S.cut.t = 6.6); g.step(2); g.finish(); return true; });
  const box = await page.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + (3 * 12 + 6) / 180 * box.w, box.y + (36 + 18 * 12 + 6) / 320 * box.h);
  await runUntil(page, () => false, 120, 30);
  const hero = await page.evaluate(() => [window.__game.S.hero.x, window.__game.S.hero.y]);
  check(walked && hero[0] === 3 && hero[1] === 18, `stonewake: tapping a tile walks there (${hero})`);
  check(errors.length === 0, `stonewake runs without errors ${errors.join(' | ')}`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
