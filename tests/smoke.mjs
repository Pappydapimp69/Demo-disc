// Smoke + completability tests. Steps the simulation through window.__game (no real-time waits):
// every level must be winnable by its stated solution and lost by its trap, the hint must solve it,
// and every page must boot without errors.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
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
  const { page, errors } = await open('index.html', { width: 900, height: 700 });
  const entries = await page.evaluate(() => window.__menu.entries.map(e => e.href));
  for (const href of entries) check(fs.existsSync(path.join(root, href.split('#')[0])), `menu entry resolves: ${href}`);
  await page.screenshot({ path: path.join(shots, 'menu.png') });
  check(errors.length === 0, `menu boots without errors ${errors.join(' | ')}`);
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

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
