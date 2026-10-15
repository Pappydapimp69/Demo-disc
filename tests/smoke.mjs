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

// ---------- STICK SWARM ----------
if (fs.existsSync(path.join(root, 'games/stickswarm/game.js'))) {
  const { page, errors } = await open('games/stickswarm/index.html');
  const n = await page.evaluate(() => window.__game.LEVELS.length);
  for (let i = 0; i < n; i++) {
    for (const policy of ['best', 'worst']) {
      await page.evaluate(([i, policy]) => { window.__game.load(i); window.__game.autopilot = policy; }, [i, policy]);
      await runUntil(page, () => ['win', 'fail'].includes(window.__game.state), 6000, 60);
      const st = await page.evaluate(() => ({ s: window.__game.state, c: window.__game.S.count, hp: window.__game.S.L.boss }));
      if (policy === 'best') await page.screenshot({ path: path.join(shots, `swarm-L${i + 1}-end.png`) });
      check(st.s === (policy === 'best' ? 'win' : 'fail'), `swarm L${i + 1} ${policy} gates -> ${st.s} (count ${st.c} vs boss ${st.hp})`);
    }
  }
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
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => { window.__game.load(i); window.__game.autopilot = 'rows'; }, i);
    await runUntil(page, () => window.__game.S.done, 1500, 30);
    await page.screenshot({ path: path.join(shots, `salon-L${i + 1}-done.png`) });
    check(await page.evaluate(() => window.__game.S.done), `salon L${i + 1} can be shaved clean`);
  }
  await runUntil(page, () => window.__game.state === 'ufo', 400, 30);
  await runUntil(page, () => false, 150, 30);
  await page.screenshot({ path: path.join(shots, 'salon-ufo.png') });
  check((await page.evaluate(() => window.__game.state)) === 'ufo', 'salon: shaving the Earth brings the alien');
  check(errors.length === 0, `salon runs without errors ${errors.join(' | ')}`);
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

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
