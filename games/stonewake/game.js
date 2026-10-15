// STONEWAKE - a pixel RPG vertical slice for the demo disc.
// The mountain behind the village was a sleeping titan. It woke, its heart shattered into three shards,
// and you go after them: forest, crystal cave, desert ruins. Each shard is guarded by a golem made of
// shards; beat it and a companion joins. At the titan you choose: FIGHT it, or CALM it by giving the shards back.
//
// Walk: tap a tile (the hero walks there) or use the arrow keys. Talk/use: walk into it.
// Battles are turn-based with timed hits: when you attack, tap as the ring closes on the target (GOOD / PERFECT);
// when an enemy attacks, tap the moment it lands to BLOCK.
// Pixel rules (Brain ART/pixel-art): one 180x320 grid blitted at x4, one fixed palette, hue-shifted ramps,
// characters animate at 10 fps.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const LW = 720, LH = 1280, W = 180, H = 320, SC = 4, TS = 12, MAP_Y = 36, COLS = 15, ROWS = 23;
  const low = document.createElement('canvas'); low.width = W; low.height = H;
  const mainCx = low.getContext('2d', { willReadFrequently: true });
  let cx = mainCx;
  // the battle field is drawn on its own 90x98 grid and shown at x2 (bigger sprites on a phone), the UI stays x1
  const FW = 90, FH = 98, field = document.createElement('canvas'); field.width = FW; field.height = FH; const fieldCx = field.getContext('2d');
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const easeOut = x => 1 - (1 - x) * (1 - x);
  const mix = (a, b, k) => a + (b - a) * k;
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

  // ---------- palette (shared with the trailer) ----------
  const PAL = {
    k: '#10101a', n0: '#1a1c2c', n1: '#2a2448', n2: '#3b2d5a', n3: '#5d3a6e', n4: '#9a4a78', n5: '#e0705a', n6: '#ffb060', n7: '#ffe09a',
    g0: '#0f2a2a', g1: '#1e4a3a', g2: '#2e7a4a', g3: '#5aa04a', g4: '#a8d860',
    s0: '#24243a', s1: '#3a3a56', s2: '#56566e', s3: '#7c7a8c', s4: '#b0a8a8',
    w0: '#3a2018', w1: '#6a3a24', w2: '#a8643a', w3: '#e0a058', w4: '#f8d8a0',
    c0: '#1a3a6a', c1: '#2a7ab0', c2: '#5ae0ff', c3: '#c8f8ff',
    r0: '#6a1a2a', r1: '#c0303a', r2: '#ff6a4a', p0: '#3a2060', p1: '#7040a0', p2: '#b080e0',
    b0: '#203a7a', b1: '#3a6ad0', b2: '#7ab0f8', sk: '#f0b888', sk2: '#b87a58', wt: '#f8f8ec', au: '#ffd23a', d0: '#8a6a3a', d1: '#c8a060', d2: '#f0d890',
  };
  const PAL_RGB = Object.values(PAL).map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const P = k => PAL[k] || k;
  function rect(x, y, w, h, c) { cx.fillStyle = P(c); cx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function px(x, y, c) { rect(x, y, 1, 1, c); }
  function disc(x, y, r, c) { cx.fillStyle = P(c); r = Math.max(0, Math.round(r)); for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); cx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1); } }
  let FONT = '"Press Start 2P", monospace';
  try { document.fonts && document.fonts.load('8px "Press Start 2P"').then(() => {}, () => {}); } catch (_) {}
  function text(s, x, y, c = 'wt', align = 'left', shadow = 'k', size = 8) {
    cx.font = `${size}px ${FONT}`; cx.textAlign = align; cx.textBaseline = 'top';
    if (shadow) { cx.fillStyle = P(shadow); cx.fillText(s, Math.round(x) + 1, Math.round(y) + 1); }
    cx.fillStyle = P(c); cx.fillText(s, Math.round(x), Math.round(y));
  }
  function wrap(s, max) { const words = s.split(' '), lines = []; let l = ''; for (const w of words) { if ((l + ' ' + w).trim().length > max) { lines.push(l.trim()); l = w; } else l += ' ' + w; } if (l.trim()) lines.push(l.trim()); return lines; }
  function panel(x, y, w, h, edge = 'b1') { rect(x, y, w, h, 'k'); rect(x + 1, y + 1, w - 2, h - 2, edge); rect(x + 2, y + 2, w - 4, h - 4, 'n0'); }

  // ---------- sprites ----------
  const KEY = { o: 'k', h: 'w1', H: 'w2', s: 'sk', S: 'sk2', r: 'r1', R: 'r0', b: 'b1', B: 'b0', p: 'w0', w: 'wt', g: 's3', G: 's2', a: 's4', y: 'au', m: 'p1', M: 'p0', l: 'p2', e: 'g2', E: 'g1', f: 'g3', c: 'c2', C: 'c3', d: 'w2', t: 'w3', x: 's4', q: 'g4', u: 'r2', z: 'd1', Z: 'd0' };
  const SPR = {
    hero: [['...oooo...', '..ohhhHo..', '.ohhhhhHo.', '.ohssssho.', '..osSso...', '..orrrro..', '.obbbbbbo.', 'obbbbbbbow', 'obBbbbbo.w', '.obbbbbo.w', '..opppo...', '..op.po...', '..op.po...', '..oo.oo...'],
      ['...oooo...', '..ohhhHo..', '.ohhhhhHo.', '.ohssssho.', '..osSso...', '..orrrro..', '.obbbbbbo.', 'obbbbbbbow', 'obBbbbbo.w', '.obbbbbo.w', '..opppo...', '.opo.op...', '.oo...op..', '......oo..']],
    knight: [['....rr....', '...rro....', '..ogggo...', '.ogaaago..', '.ogoosgo..', '..ogggo...', '.ogggggo..', 'ogaggggGoy', 'ogggggGoyy', '.ogggggo.y', '..oGGGo...', '..oG.Go...', '..oG.Go...', '..oo.oo...']],
    mage: [['....o.....', '...omo....', '...omMo...', '..ommmMo..', '.oMmmmmMo.', '..ossso.c.', '..oSsSo.Co', '.ommmmmo.d', 'ommlmmmmod', 'ommmlmmMod', '.ommmmmo.d', '.oMmmmMo.d', '.oMMMMMo..', '..oooooo..']],
    archer: [['...oooo...', '..oeeeEo..', '.oeeeeeEo.', '.oessssEo.', '..osSso.d.', '..oEeeo..d', '.oeeeeeo.d', 'oeeEeeeeod', 'oeeeeeeo.d', '.oeeeeeo.d', '..otttto..', '..ot.to...', '..ot.to...', '..oo.oo...']],
    elder: [['...oooo...', '..oxxxxo..', '.oxxxxxxo.', '.oxssssxo.', '..oswwso..', '..owwwwo..', '.ommwwmmo.', 'ommmwwmmmo', 'ommmmmmmod', '.ommmmmo.d', '.ommmmmo.d', '.oMMMMMo.d', '.oMMMMMo..', '..oooooo..']],
    slime: [['..........', '...oooo...', '..offffo..', '.offqffEo.', '.ofoffoEo.', 'offffffEEo', 'oEEEEEEEEo', '.oooooooo.'], ['...oooo...', '..offffo..', '.offqffEo.', '.ofoffoEo.', '.offfffEo.', 'offffffEEo', '.oEEEEEEo.', '..oooooo..']],
    wolf: [['.........oo.', '........ogGo', 'oo.....oggwo', 'ogooooogggo.', '.ogggggggo..', '.ogGgggGgo..', '.og.og.og...', '.oo.oo.oo...'], ['.........oo.', '........ogGo', 'oo.....oggwo', 'ogooooogggo.', '.ogggggggo..', '.ogGgggGgo..', '..ogo..ogo..', '..oo...oo...']],
    bat: [['o........o', 'mo..oo..om', 'mmoommoomm', '.ommuummo.', '..ommmmo..', '...o..o...'], ['..........', '...oooo...', '.oommmmoo.', 'ommmuummmo', 'mo.mmmm.om', 'o..o..o..o']],
    scorp: [['......ooo.', '.......ozo', '..ooo...oz', '.ozzzo..oz', 'ozzZzzooz.', 'ozzzzzzzo.', '.oZoZoZo..', '.o.o.o.o..'], ['.....ooo..', '......ozo.', '..ooo..oz.', '.ozzzo.oz.', 'ozzZzzooz.', 'ozzzzzzzo.', '.oZoZoZo..', 'o.o.o.o...']],
  };
  function spr(name, x, y, frame = 0, flip = false, tint = null) {
    const fr = SPR[name][frame % SPR[name].length];
    for (let j = 0; j < fr.length; j++) for (let i = 0; i < fr[j].length; i++) { const ch = fr[j][flip ? fr[j].length - 1 - i : i]; if (ch !== '.') px(x + i, y + j, tint || KEY[ch]); }
  }
  function shard(x, y, t) { rect(x - 1, y - 3, 3, 6, 'c2'); rect(x, y - 4, 1, 8, 'c3'); if (Math.floor(t * 8) % 3) { px(x - 3, y, 'c2'); px(x + 3, y - 1, 'c2'); } }
  function golemArt(x, y, t, tint, hurt) {
    const f = Math.floor(t * 4) % 2, sx = hurt ? (Math.floor(t * 30) % 2 ? 2 : -2) : 0, [a, b] = tint;
    rect(x - 18 + sx, y - 32 + f, 36, 30, a); rect(x - 18 + sx, y - 32 + f, 36, 3, b);
    rect(x - 25 + sx, y - 24, 8, 20, a); rect(x + 17 + sx, y - 24, 8, 20, a);
    rect(x - 11 + sx, y - 2, 8, 8, 's0'); rect(x + 3 + sx, y - 2, 8, 8, 's0');
    for (let i = 0; i < 4; i++) shard(x - 9 + i * 6 + sx, y - 16 + (i % 2) * 5 + f, t);
    rect(x - 7 + sx, y - 27 + f, 4, 3, 'n7'); rect(x + 3 + sx, y - 27 + f, 4, 3, 'n7');
  }

  // ---------- world ----------
  const MAPS = {
    village: { name: 'HOLLOWMERE', theme: 'grass', next: 'forest', start: [7, 20], fire: [7, 8],
      rows: ['TTTTTTT^TTTTTTT', 'T.....f=f.....T', 'T.HH...=...HH.T', 'T.HD...=...DH.T', 'T......=......T', 'T.f....=....f.T', 'T....=====....T', 'T....=...=....T', 'T.HH.=...=.HH.T', 'T.HD.=...=.DH.T', 'T....=====....T', 'T......=......T', 'T..f...=...f..T', 'T......=......T', 'T~~~...=...~~~T', 'T~~~...=...~~~T', 'T......=......T', 'T.f..........fT', 'T.............T', 'T.....f.f.....T', 'T.............T', 'T.............T', 'TTTTTTTTTTTTTTT'],
      npcs: [{ id: 'elder', x: 5, y: 11 }], foes: [] },
    forest: { name: 'GREENWOOD', theme: 'grass', next: 'cave', start: [7, 21], fire: [7, 9], altar: [5, 2], boss: [7, 2], bossKind: 'forest', ally: 'knight',
      rows: ['TTTTTTT^TTTTTTT', 'TTT...=.=...TTT', 'TT...=...=...TT', 'TT..=.....=..TT', 'T...=.TTT.=...T', 'T..==.TTT.==..T', 'T..=...T...=..T', 'T..=..f.f..=..T', 'T..=.......=..T', 'T..===...===..T', 'TT...=...=...TT', 'TTT..=.T.=..TTT', 'TT...=...=...TT', 'T...==...==...T', 'T..==..T..==..T', 'T..=...T...=..T', 'T..=..fTf..=..T', 'T..===...===..T', 'TT....=.=....TT', 'TTT...=.=...TTT', 'TTTT..=.=..TTTT', 'TTTTT.=.=.TTTTT', 'TTTTTTT.TTTTTTT'],
      foes: [{ kind: 'slime', x: 4, y: 14 }, { kind: 'wolf', x: 10, y: 6 }, { kind: 'slime', x: 11, y: 15 }] },
    cave: { name: 'GLIMMERDEEP', theme: 'cave', next: 'desert', start: [7, 21], fire: [7, 12], altar: [9, 2], boss: [7, 3], bossKind: 'cave', ally: 'mage',
      rows: ['WWWWWWW^WWWWWWW', 'WWWccccccccCWWW', 'WWcccC.cc..ccWW', 'WccccccccccccWW', 'WcC.ccWWWcc.cCW', 'Wcc..cWWWc..ccW', 'WWcc.ccWcc.ccWW', 'WWWcc.....ccWWW', 'WWcc..C.C..ccWW', 'Wcc.........ccW', 'WcC....c....CcW', 'Wcc...ccc...ccW', 'WWcc.......ccWW', 'WWWcc.WWW.ccWWW', 'WWcc..WWW..ccWW', 'Wcc....W....ccW', 'WcC.........CcW', 'Wccc..C.C..cccW', 'WWccc.....cccWW', 'WWWccc...cccWWW', 'WWWWcc...ccWWWW', 'WWWWWcc.ccWWWWW', 'WWWWWWW.WWWWWWW'],
      foes: [{ kind: 'bat', x: 3, y: 9 }, { kind: 'bat', x: 11, y: 10 }, { kind: 'bat', x: 7, y: 16 }] },
    desert: { name: 'SUNKEN DUNES', theme: 'sand', next: 'titan', start: [7, 21], fire: [10, 12], altar: [4, 2], boss: [7, 3], bossKind: 'desert', ally: 'archer',
      rows: ['PPPPPPP^PPPPPPP', 'Psss...=...sssP', 'Pss.s..=..s.ssP', 'Ps..P..=..P..sP', 'Ps.....=.....sP', 'Pss..=====..ssP', 'Ps...=...=...sP', 'Ps.P.=.P.=.P.sP', 'Ps...=...=...sP', 'Pss..=====..ssP', 'Ps.....=.....sP', 'Ps..P..=..P..sP', 'Pss....=.....sP', 'Ps..s..=..s..sP', 'Ps.....=.....sP', 'Pss.P..=..P.ssP', 'Ps.....=.....sP', 'Ps..s.===.s..sP', 'Pss...=.=...ssP', 'Ps....=.=....sP', 'Pss...=.=...ssP', 'Psss..=.=..sssP', 'PPPPPPP.PPPPPPP'],
      foes: [{ kind: 'scorp', x: 3, y: 8 }, { kind: 'scorp', x: 11, y: 14 }, { kind: 'scorp', x: 4, y: 18 }] },
    titan: { name: 'THE STONE FACE', theme: 'titan', next: null, start: [7, 21], fire: [11, 18],
      rows: ['###############', '###############', '###############', '###############', '###############', '###############', '###############', '###############', '###############', '###############', '#####.....#####', '####.......####', '###.........###', '###.........###', '##...........##', '##...........##', '##...........##', '###.........###', '###.........###', '####.......####', '#####.....#####', '######...######', '#######.#######'],
      foes: [] },
  };
  const SOLID = new Set(['T', '~', '#', 'H', 'W', 'C', 'P']);
  const tileAt = (m, x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? '#' : m.rows[y][x];

  function drawTile(ch, x, y, t, theme) {
    const X = x * TS, Y = MAP_Y + y * TS, hs = hash(x * 31 + y * 17);
    const ground = theme === 'cave' ? 'n2' : theme === 'sand' ? 'd2' : theme === 'titan' ? 's2' : 'g2';
    rect(X, Y, TS, TS, ground);
    if (theme === 'grass' && ch === '.') { if (hs > .6) px(X + 3, Y + 5, 'g3'); if (hs > .8) px(X + 8, Y + 2, 'g3'); }
    if (theme === 'sand' && ch === '.' && hs > .7) px(X + 4, Y + 7, 'd1');
    if (theme === 'cave' && (ch === '.' || ch === 'c')) { rect(X, Y, TS, TS, ch === 'c' ? 'n1' : 'n2'); if (hs > .8) px(X + 6, Y + 6, 'p0'); }
    if (theme === 'titan' && ch === '.') { if (hs > .7) px(X + 4, Y + 4, 's3'); }
    switch (ch) {
      case 'T': rect(X + 5, Y + 6, 2, 6, 'w0'); disc(X + 6, Y + 5, 5, 'g1'); disc(X + 5, Y + 4, 3, 'g2'); px(X + 4, Y + 2, 'g3'); break;
      case '~': rect(X, Y, TS, TS, 'c0'); if ((Math.floor(t * 3) + x + y) % 3 === 0) rect(X + 2, Y + 5, 5, 1, 'c1'); break;
      case '=': rect(X, Y, TS, TS, theme === 'sand' ? 'd1' : 'd0'); if (hs > .6) px(X + hs * 10, Y + 6, theme === 'sand' ? 'd2' : 'd1'); break;
      case '#': rect(X, Y, TS, TS, 's1'); rect(X, Y, TS, 2, 's2'); if (hs > .5) px(X + 3, Y + 6, 's0'); break;
      case 'H': rect(X, Y, TS, TS, 'w1'); rect(X, Y, TS, 4, 'r0'); rect(X, Y + 3, TS, 1, 'r1'); if (hs > .5) { rect(X + 4, Y + 6, 3, 3, 'n6'); } break;
      case 'D': rect(X, Y, TS, TS, 'w1'); rect(X + 3, Y + 3, 6, 9, 'w0'); px(X + 7, Y + 7, 'au'); break;
      case 'f': px(X + 3, Y + 4, 'r2'); px(X + 8, Y + 7, 'n7'); px(X + 5, Y + 9, 'p2'); break;
      case 'W': rect(X, Y, TS, TS, 'n0'); if (hs > .6) px(X + 5, Y + 5, 'n1'); break;
      case 'C': rect(X, Y, TS, TS, 'n1'); cx.fillStyle = P(Math.floor(t * 2 + x) % 4 ? 'p1' : 'p2'); cx.beginPath(); cx.moveTo(X + 2, Y + 12); cx.lineTo(X + 6, Y + 1); cx.lineTo(X + 10, Y + 12); cx.fill(); px(X + 6, Y + 3, 'c3'); break;
      case 'P': rect(X, Y, TS, TS, 'd2'); rect(X + 2, Y, 8, TS, 'd1'); rect(X + 8, Y, 2, TS, 'd0'); rect(X + 1, Y, 10, 2, 'w4'); break;
      case 's': rect(X, Y, TS, TS, 'd2'); px(X + 2 + hs * 6, Y + 4, 'd1'); px(X + 7, Y + 8, 'd1'); break;
      case '^': rect(X, Y, TS, TS, theme === 'cave' ? 'n2' : theme === 'sand' ? 'd1' : 'd0'); if (Math.floor(t * 3) % 2) { px(X + 5, Y + 3, 'wt'); rect(X + 4, Y + 4, 3, 1, 'wt'); } break;
    }
  }
  function campfire(x, y, t) {
    const X = x * TS + 6, Y = MAP_Y + y * TS + 8, f = Math.floor(t * 10) % 3;
    rect(X - 4, Y + 2, 8, 2, 'w0');
    disc(X, Y - 1, 3, 'r1'); disc(X, Y - 2 - f % 2, 2, 'n6'); px(X, Y - 5 - f, 'n7');
  }
  function altar(x, y, t, has) { const X = x * TS, Y = MAP_Y + y * TS; rect(X + 2, Y + 6, 8, 6, 's3'); rect(X + 1, Y + 5, 10, 2, 's4'); if (has) shard(X + 6, Y + 1 + Math.round(Math.sin(t * 4)), t); }

  // ---------- party & foes ----------
  const MEMBERS = {
    hero: { name: 'KAEL', spr: 'hero', hp: 60, mp: 14, atk: 12, mag: 6, def: 5, spd: 10, skills: ['SHARD STRIKE'] },
    knight: { name: 'BRUNA', spr: 'knight', hp: 80, mp: 10, atk: 11, mag: 3, def: 9, spd: 6, skills: ['GUARD'] },
    mage: { name: 'ODO', spr: 'mage', hp: 42, mp: 30, atk: 5, mag: 14, def: 4, spd: 8, skills: ['FIREBALL', 'HEAL'] },
    archer: { name: 'WREN', spr: 'archer', hp: 50, mp: 18, atk: 10, mag: 6, def: 5, spd: 13, skills: ['VOLLEY'] },
  };
  const SKILL = {
    'SHARD STRIKE': { mp: 6, target: 'foe', desc: 'shards x dmg' }, GUARD: { mp: 4, target: 'none', desc: 'party dmg /2' },
    FIREBALL: { mp: 6, target: 'foe', desc: 'fire', fire: true }, HEAL: { mp: 5, target: 'ally', desc: '+30 HP' }, VOLLEY: { mp: 6, target: 'all', desc: 'hits all', pierce: true },
  };
  const FOES = {
    slime: { name: 'SLIME', hp: 26, atk: 7, spd: 5, xp: 6, draw: 'slime' }, wolf: { name: 'WOLF', hp: 34, atk: 10, spd: 11, xp: 9, draw: 'wolf' },
    bat: { name: 'GLOOMBAT', hp: 30, atk: 9, spd: 14, xp: 9, draw: 'bat', weak: 'pierce' }, scorp: { name: 'DUNE STINGER', hp: 44, atk: 12, spd: 9, xp: 12, draw: 'scorp', weak: 'fire' },
    gforest: { name: 'MOSS GOLEM', hp: 120, atk: 11, spd: 4, xp: 30, draw: 'golem', tint: ['g1', 'g2'], weak: 'fire', boss: true },
    gcave: { name: 'CRYSTAL GOLEM', hp: 170, atk: 13, spd: 5, xp: 40, draw: 'golem', tint: ['p0', 'p1'], weak: 'fire', boss: true },
    gdesert: { name: 'SAND GOLEM', hp: 230, atk: 15, spd: 6, xp: 55, draw: 'golem', tint: ['d0', 'd1'], weak: 'pierce', boss: true },
    eye: { name: 'TITAN EYE', hp: 420, atk: 20, spd: 7, xp: 0, draw: 'eye', weak: 'shard', boss: true },
    lhand: { name: 'LEFT HAND', hp: 120, atk: 13, spd: 9, xp: 0, draw: 'hand', boss: true }, rhand: { name: 'RIGHT HAND', hp: 120, atk: 13, spd: 10, xp: 0, draw: 'hand', boss: true },
  };
  function newMember(id) { const b = MEMBERS[id]; return { id, name: b.name, spr: b.spr, lv: 1, xp: 0, maxhp: b.hp, hp: b.hp, maxmp: b.mp, mp: b.mp, atk: b.atk, mag: b.mag, def: b.def, spd: b.spd, skills: b.skills.slice() }; }

  // ---------- game state ----------
  const G = {};
  function newGame() {
    Object.assign(G, { party: [newMember('hero')], shards: 0, region: 'village', items: { POTION: 3, ETHER: 1 }, cleared: {}, beaten: {}, flags: {}, endings: G.endings || loadEndings() });
    enterRegion('village', true);
  }
  function loadEndings() { try { return JSON.parse(localStorage.getItem('stonewake-endings') || '{}'); } catch (_) { return {}; } }
  function saveEndings() { try { localStorage.setItem('stonewake-endings', JSON.stringify(G.endings)); } catch (_) {} }
  const S = { mode: 'title', t: 0, mt: 0, hero: { x: 7, y: 20, px: 7, py: 20, k: 1, dir: 1 }, path: [], dialog: null, battle: null, foes: [], cut: null, keys: {}, choice: null, ending: null, flash: 0, lastStep: 0 };

  function enterRegion(id, fresh) {
    G.region = id; const m = MAPS[id];
    S.hero = { x: m.start[0], y: m.start[1], px: m.start[0], py: m.start[1], k: 1, dir: 1 };
    S.path = []; S.mode = 'map'; S.mt = 0;
    S.foes = (m.foes || []).map((f, i) => ({ ...f, hx: f.x, hy: f.y, id: id + i, alive: !G.beaten[id + i], tt: hash(i) * 1 }));
    healParty(1);
    if (id === 'village' && fresh) cutscene('wake');
    else if (id !== 'village') say([[null, m.name]]);
    if (id === 'titan') say([['hero', 'Here it is. The eye.'], [null, 'WALK UP TO THE EYE.']]);
  }
  function healParty(f) { for (const p of G.party) { p.hp = Math.max(p.hp, Math.round(p.maxhp * f)); p.mp = Math.max(p.mp, Math.round(p.maxmp * f)); } }

  // ---------- dialog ----------
  function say(lines, then) { S.dialog = { lines, i: 0, t: S.t, then }; }
  function advanceDialog() {
    const d = S.dialog; if (!d) return;
    const full = (d.lines[d.i][1] || '').length;
    if ((S.t - d.t) * 40 < full) { d.t = -999; return; }   // first tap finishes the line
    d.i++; d.t = S.t;
    if (d.i >= d.lines.length) { S.dialog = null; Audio.tone(660, .05, 'square', .04); if (d.then) d.then(); }
    else Audio.tone(880, .03, 'square', .03);
  }

  // ---------- cutscenes ----------
  function cutscene(kind) { S.cut = { kind, t: 0 }; S.mode = 'cut'; }
  function endCut() {
    const k = S.cut.kind; S.cut = null; S.mode = 'map';
    if (k === 'wake') say([['elder', 'KAEL! The mountain... it was never a mountain.'], ['elder', 'Its heart broke into three shards. They fell in the forest, the cave and the dunes.'], ['elder', 'Bring them back before it walks. North, through the forest.'], [null, 'TAP A TILE TO WALK. WALK INTO THINGS TO USE THEM.']]);
  }

  // ---------- map play ----------
  const SPEED = 7;   // tiles per second
  function bfs(tx, ty) {
    const m = MAPS[G.region], start = [S.hero.x, S.hero.y], key = (x, y) => x + y * COLS, prev = new Map([[key(...start), null]]), q = [start];
    while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (prev.has(key(nx, ny)) || !walkable(m, nx, ny, nx === tx && ny === ty)) continue; prev.set(key(nx, ny), [x, y]); q.push([nx, ny]); } }
    if (!prev.has(key(tx, ty))) return [];
    const path = []; let c = [tx, ty]; while (c && !(c[0] === start[0] && c[1] === start[1])) { path.unshift(c); c = prev.get(key(...c)); }
    return path;
  }
  function blocker(x, y) {
    const m = MAPS[G.region];
    if (m.fire && m.fire[0] === x && m.fire[1] === y) return { type: 'fire' };
    for (const n of m.npcs || []) if (n.x === x && n.y === y) return { type: 'npc', n };
    if (m.altar && m.altar[0] === x && m.altar[1] === y) return { type: 'altar' };
    if (m.boss && !G.cleared[G.region] && m.boss[0] === x && m.boss[1] === y) return { type: 'boss' };
    if (G.region === 'titan' && y <= 10) return { type: 'eye' };
    return null;
  }
  function walkable(m, x, y, isTarget) { const ch = tileAt(m, x, y); if (SOLID.has(ch)) return false; if (blocker(x, y)) return !!isTarget; return true; }
  function tryStep(dx, dy) {
    const m = MAPS[G.region], nx = S.hero.x + dx, ny = S.hero.y + dy;
    if (dx) S.hero.dir = dx;
    const b = blocker(nx, ny);
    if (b) { S.path = []; return interact(b); }
    if (!walkable(m, nx, ny)) return;
    S.hero.px = S.hero.x; S.hero.py = S.hero.y; S.hero.x = nx; S.hero.y = ny; S.hero.k = 0;
    if (tileAt(m, nx, ny) === '^') leaveRegion();
  }
  function leaveRegion() {
    const m = MAPS[G.region];
    if (m.boss && !G.cleared[G.region]) { say([['hero', 'Not without the shard.']]); S.hero.y += 1; S.hero.py = S.hero.y; return; }
    if (G.region === 'village' && !S.dialog) { /* on to the forest */ }
    Audio.tone(440, .1, 'square', .05); Audio.tone(660, .15, 'square', .05, null, .1);
    enterRegion(m.next);
  }
  function interact(b) {
    if (b.type === 'npc') say([['elder', G.shards < 3 ? 'The shards. North. Hurry, child.' : 'You have them all. Go to the titan.']]);
    else if (b.type === 'fire') { healParty(1); Audio.tone(523, .1, 'triangle', .06); Audio.tone(784, .2, 'triangle', .06, null, .1); say([[null, 'You rest by the fire. HP and MP restored.']]); }
    else if (b.type === 'boss') startBattle([MAPS[G.region].bossKind === 'forest' ? 'gforest' : MAPS[G.region].bossKind === 'cave' ? 'gcave' : 'gdesert'], 'boss');
    else if (b.type === 'altar') say([[null, G.cleared[G.region] ? 'The altar is empty now.' : 'A shard glows on the altar. A golem stands guard.']]);
    else if (b.type === 'eye') finaleChoice();
  }
  function updateMap(dt) {
    const h = S.hero;
    h.k = Math.min(1, h.k + dt * SPEED);
    if (h.k >= 1 && !S.dialog) {
      if (S.path.length) { const [nx, ny] = S.path.shift(); tryStep(Math.sign(nx - h.x), Math.sign(ny - h.y)); }
      else { const kx = (S.keys.ArrowRight ? 1 : 0) - (S.keys.ArrowLeft ? 1 : 0), ky = (S.keys.ArrowDown ? 1 : 0) - (S.keys.ArrowUp ? 1 : 0); if (kx) tryStep(kx, 0); else if (ky) tryStep(0, ky); }
    }
    // wandering foes: a step every second or so; touching the hero starts a fight
    const m = MAPS[G.region];
    for (const f of S.foes) {
      if (!f.alive) continue;
      f.tt -= dt;
      if (f.tt <= 0 && !S.dialog) { f.tt = .9 + hash(Math.floor(S.t * 10) + f.x) * .8; const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], d = dirs[Math.floor(hash(Math.floor(S.t * 7) + f.y * 3) * 4)]; const nx = f.x + d[0], ny = f.y + d[1]; if (walkable(m, nx, ny) && Math.abs(nx - f.hx) <= 2 && Math.abs(ny - f.hy) <= 2 && !(nx === h.x && ny === h.y)) { f.x = nx; f.y = ny; } }
      if (!S.dialog && Math.abs(f.x - h.x) + Math.abs(f.y - h.y) <= (h.k < 1 ? 0 : 0) || (f.x === h.x && f.y === h.y)) { f.alive = false; G.beaten[f.id] = true; startBattle(f.kind === 'slime' ? ['slime', 'slime'] : [f.kind, f.kind === 'wolf' ? 'slime' : f.kind], 'foe'); return; }
    }
  }

  // ---------- battle ----------
  function startBattle(foeIds, kind) {
    const foes = foeIds.map((id, i) => { const b = FOES[id]; return { id, ...b, maxhp: b.hp, hp: b.hp, i, open: id !== 'eye' }; });
    S.battle = { kind, foes, phase: 'intro', t: 0, turnQ: [], actor: null, menu: 0, sub: null, pick: 0, msg: null, pops: [], guard: 0, round: 0, cmd: null, ring: null, hitT: 0 };
    S.mode = 'battle'; S.flash = .3;
    Audio.noise(.3, .15); [523, 659, 784, 1047].forEach((f, i) => Audio.tone(f, .08, 'square', .05, null, i * .05));
  }
  const aliveParty = () => G.party.filter(p => p.hp > 0), aliveFoes = () => S.battle.foes.filter(f => f.hp > 0);
  function nextTurn() {
    const B = S.battle;
    if (!aliveFoes().length) return winBattle();
    if (!aliveParty().length) { B.phase = 'lose'; B.t = 0; Audio.sfx('fail'); return; }
    if (!B.turnQ.length) {
      B.round++;
      if (B.foes.some(f => f.id === 'eye')) { const eye = B.foes.find(f => f.id === 'eye'); eye.open = B.round % 2 === 0; if (eye.open && eye.hp > 0) pop(B, 'THE EYE OPENS', 45, 22, 'au'); }
      B.turnQ = [...aliveParty().map(p => ({ who: 'p', p })), ...aliveFoes().map(f => ({ who: 'f', f }))].sort((a, b) => (b.p || b.f).spd - (a.p || a.f).spd);
      if (B.guard > 0) B.guard--;
    }
    const nx = B.turnQ.shift();
    if (nx.who === 'p') { if (nx.p.hp <= 0) return nextTurn(); B.actor = nx.p; B.phase = 'menu'; B.menu = 0; B.sub = null; }
    else { if (nx.f.hp <= 0) return nextTurn(); B.actor = nx.f; B.phase = 'foeWind'; B.t = 0; const ps = aliveParty(); B.victim = ps[Math.floor(hash(B.round * 7 + nx.f.i) * ps.length)]; B.blocked = null; B.big = nx.f.id === 'eye' && nx.f.open; }
  }
  function pop(B, s, x, y, c = 'wt') { B.pops.push({ s, x, y, c, t: S.t }); }
  function choose(cmd) {
    const B = S.battle, a = B.actor;
    if (cmd === 'FIGHT') { B.cmd = { kind: 'fight' }; B.phase = 'target'; B.pick = firstAlive(); }
    else if (cmd === 'SKILL') { B.sub = 'skill'; B.menu = 0; }
    else if (cmd === 'ITEM') { B.sub = 'item'; B.menu = 0; }
    else if (cmd === 'RUN') { if (B.kind === 'foe') { Audio.tone(300, .2, 'square', .05, 600); S.battle = null; S.mode = 'map'; } else pop(B, "CAN'T RUN", 45, 50, 'r2'); }
    else if (SKILL[cmd]) {
      const sk = SKILL[cmd];
      if (a.mp < sk.mp) { pop(B, 'NOT ENOUGH MP', 45, 50, 'r2'); return; }
      if (cmd === 'SHARD STRIKE' && G.shards < 1) { pop(B, 'NO SHARDS YET', 45, 50, 'r2'); return; }
      B.cmd = { kind: 'skill', name: cmd };
      if (sk.target === 'foe') { B.phase = 'target'; B.pick = firstAlive(); }
      else if (sk.target === 'ally') { B.phase = 'allyTarget'; B.pick = 0; }
      else startTiming(null);
    } else if (cmd === 'POTION' || cmd === 'ETHER') {
      if (!G.items[cmd]) { pop(B, 'NONE LEFT', 45, 50, 'r2'); return; }
      B.cmd = { kind: 'item', name: cmd }; B.phase = 'allyTarget'; B.pick = 0;
    }
  }
  function firstAlive() { const f = S.battle.foes; for (let i = 0; i < f.length; i++) if (f[i].hp > 0 && f[i].open !== false) return i; for (let i = 0; i < f.length; i++) if (f[i].hp > 0) return i; return 0; }
  function startTiming(target) {
    const B = S.battle;
    if (B.cmd.kind === 'item' || (B.cmd.kind === 'skill' && SKILL[B.cmd.name].target === 'ally')) return resolveAction(target, 1);
    B.target = target; B.phase = 'timing'; B.t = 0; B.ring = { dur: .85 }; B.hitT = null;
  }
  function timingTap() {
    const B = S.battle;
    if (B.phase === 'timing' && B.hitT === null) { B.hitT = B.t; const q = Math.abs(B.t - B.ring.dur); const grade = q < .07 ? 1.6 : q < .16 ? 1.25 : 1; pop(B, grade > 1.5 ? 'PERFECT!' : grade > 1 ? 'GOOD' : 'OK', 45, 54, grade > 1.5 ? 'au' : grade > 1 ? 'c3' : 's4'); Audio.tone(grade > 1.5 ? 1320 : 990, .06, 'square', .06); B.grade = grade; }
    else if (B.phase === 'foeWind' && B.blocked === null) { const q = B.t - .9; B.blocked = q > -.2 && q < .06; if (B.blocked) { pop(B, 'BLOCK!', 66, 70, 'c3'); Audio.tone(1500, .05, 'square', .06); } else Audio.tone(200, .05, 'square', .03); }
    else if (B.phase === 'calm' && B.hitT === null) { B.hitT = B.t; }
  }
  function resolveAction(target, grade) {
    const B = S.battle, a = B.actor, c = B.cmd;
    const dmg = (base, f, kind) => { let d = Math.max(1, Math.round(base * grade * (0.9 + hash(Math.floor(S.t * 100)) * .2))); if (f.weak && f.weak === kind) { d = Math.round(d * 1.5); pop(B, 'WEAK!', foeX(f.i), aimY(f.i) - 14, 'n6'); } if (f.id === 'eye' && !f.open) { d = Math.round(d * .15); pop(B, 'CLOSED', foeX(f.i), aimY(f.i) - 14, 's3'); } f.hp = Math.max(0, f.hp - d); pop(B, String(d), foeX(f.i), aimY(f.i) - 6, 'wt'); return d; };
    if (c.kind === 'fight') { const f = B.foes[target]; dmg(a.atk * 1.4, f, a.id === 'archer' ? 'pierce' : 'phys'); Audio.noise(.08, .2); }
    else if (c.kind === 'skill') {
      const sk = SKILL[c.name]; a.mp -= sk.mp;
      if (c.name === 'SHARD STRIKE') { const f = B.foes[target]; const kind = f.id === 'eye' ? 'shard' : 'phys'; dmg(a.atk * (1.6 + G.shards * .8), f, kind); Audio.tone(1800, .3, 'square', .06, 400); B.fx = { kind: 'shard', t: S.t, i: target }; }
      else if (c.name === 'FIREBALL') { const f = B.foes[target]; dmg(a.mag * 2.2, f, 'fire'); Audio.noise(.4, .2); B.fx = { kind: 'fire', t: S.t, i: target }; }
      else if (c.name === 'VOLLEY') { for (const f of aliveFoes()) dmg(a.atk * 1.0, f, 'pierce'); Audio.tone(2400, .2, 'square', .04, 900); B.fx = { kind: 'volley', t: S.t }; }
      else if (c.name === 'GUARD') { B.guard = 2; pop(B, 'GUARD UP', 66, 50, 'c3'); Audio.tone(440, .2, 'triangle', .07); }
      else if (c.name === 'HEAL') { const p = G.party[target]; p.hp = Math.min(p.maxhp, p.hp + 30); pop(B, '+30', memberX(target) + 4, memberY(target), 'g4'); Audio.tone(880, .2, 'triangle', .06, 1320); }
    } else if (c.kind === 'item') {
      const p = G.party[target]; G.items[c.name]--;
      if (c.name === 'POTION') { p.hp = Math.min(p.maxhp, p.hp + 35); pop(B, '+35 HP', memberX(target), memberY(target), 'g4'); } else { p.mp = Math.min(p.maxmp, p.mp + 15); pop(B, '+15 MP', memberX(target), memberY(target), 'c2'); }
      Audio.tone(880, .15, 'triangle', .06, 1320);
    }
    B.phase = 'after'; B.t = 0;
  }
  function foeHit() {
    const B = S.battle, f = B.actor, v = B.victim;
    let d = Math.round((B.big ? f.atk * 2.2 : f.atk) * (0.9 + hash(Math.floor(S.t * 100) + 3) * .2) - v.def * .5);
    if (B.blocked) d = Math.round(d * .35);
    if (B.guard > 0) d = Math.round(d * .5);
    d = Math.max(1, d); v.hp = Math.max(0, v.hp - d);
    pop(B, String(d), memberX(G.party.indexOf(v)) + 4, memberY(G.party.indexOf(v)) - 2, B.blocked ? 'c3' : 'r2');
    Audio.noise(.1, B.blocked ? .08 : .2); S.flash = B.blocked ? 0 : .08;
    B.phase = 'after'; B.t = 0;
  }
  function winBattle() {
    const B = S.battle; B.phase = 'win'; B.t = 0;
    const xp = B.foes.reduce((s, f) => s + f.xp, 0); B.lvups = [];
    for (const p of G.party) { if (p.hp <= 0) p.hp = 1; p.xp += xp; while (p.xp >= p.lv * 20) { p.xp -= p.lv * 20; p.lv++; p.maxhp += 8; p.maxmp += 3; p.atk += 2; p.mag += 2; p.def += 1; p.hp = p.maxhp; p.mp = p.maxmp; B.lvups.push(p.name); } }
    Audio.sfx('win');
  }
  function endBattle() {
    const B = S.battle; S.battle = null; S.mode = 'map';
    if (B.kind === 'boss') {
      G.cleared[G.region] = true; G.shards++;
      const ally = MAPS[G.region].ally, joined = newMember(ally);
      joined.lv = G.party[0].lv; for (let i = 1; i < joined.lv; i++) { joined.maxhp += 8; joined.maxmp += 3; joined.atk += 2; joined.mag += 2; joined.def += 1; }
      joined.hp = joined.maxhp; joined.mp = joined.maxmp; G.party.push(joined);
      Audio.tone(1047, .1, 'square', .05); Audio.tone(1319, .1, 'square', .05, null, .1); Audio.tone(1568, .3, 'square', .05, null, .2);
      const lines = { knight: [['knight', "I'm BRUNA. I've been tracking that golem for a week."], ['knight', "You hit like a farmer. I'm coming with you."]], mage: [['mage', 'ODO. I study crystals. And you just broke the biggest one.'], ['mage', "Fine. I'll come. Someone has to set things on fire properly."]], archer: [['archer', 'WREN. I could have shot it from the dunes, you know.'], ['archer', "Three shards. The titan won't wait. Let's go."]] }[ally];
      say([[null, `YOU GOT SHARD ${G.shards}/3!`], ...lines, [null, `${MEMBERS[ally].name} JOINED THE PARTY!`]]);
    }
    if (B.kind === 'finale') ending('fell');
  }

  // ---------- the finale ----------
  function finaleChoice() {
    if (S.choice) return;
    say([['hero', 'Three shards. Its heart. What do we do with it?'], ['knight', 'We fight.'], ['mage', 'Or we give it back. It was asleep before.']], () => { S.choice = { opts: ['FIGHT IT', 'CALM IT'], sel: 0 }; });
  }
  function pickChoice(i) {
    S.choice = null;
    if (i === 0) startBattle(['lhand', 'eye', 'rhand'], 'finale');
    else { S.mode = 'calm'; S.calm = { n: 0, t: 0, hitT: null, fails: 0, res: null }; }
  }
  function updateCalm(dt) {
    const c = S.calm; c.t += dt;
    const DUR = 1.2;
    if (c.res) { if (c.t > 1.0) { c.res = null; c.t = 0; c.hitT = null; if (c.n >= 3) ending('sleeps'); } return; }
    const auto = API.autopilot;
    if (auto === 'perfect' && c.hitT === null && c.t >= DUR - .01) c.hitT = c.t;
    if (c.hitT !== null) {
      const q = Math.abs(c.hitT - DUR);
      if (q < .18) { c.n++; c.res = 'ok'; Audio.tone(784 + c.n * 200, .3, 'triangle', .07); }
      else { c.res = 'bad'; c.fails++; for (const p of G.party) p.hp = Math.max(0, p.hp - 12); Audio.noise(.4, .2); S.flash = .15; if (!aliveParty().length) { S.mode = 'over'; S.mt = 0; } }
      c.t = 0;
    } else if (c.t > DUR + .5) { c.hitT = c.t; }
  }
  function ending(which) {
    G.endings[which] = true; saveEndings();
    S.mode = 'ending'; S.ending = { which, t: 0 };
    Audio.sfx('win');
  }

  // ---------- update ----------
  function update(dt) {
    S.t += dt; S.mt += dt; S.flash = Math.max(0, S.flash - dt);
    if (S.mode === 'cut') { S.cut.t += dt; if (S.cut.t > 6.5) endCut(); return; }
    if (S.mode === 'map') { if (!S.dialog && !S.choice) updateMap(dt); return; }
    if (S.mode === 'calm') { updateCalm(dt); return; }
    if (S.mode === 'ending') { S.ending.t += dt; return; }
    if (S.mode !== 'battle') return;
    const B = S.battle; B.t += dt;
    const auto = API.autopilot;
    if (B.phase === 'intro' && B.t > .7) nextTurn();
    else if (B.phase === 'menu' && auto) {   // tests: fight the first open foe, use shard strike on an open eye
      const eye = B.foes.find(f => f.id === 'eye' && f.open && f.hp > 0);
      if (eye && B.actor.id === 'hero' && B.actor.mp >= 6) { B.cmd = { kind: 'skill', name: 'SHARD STRIKE' }; startTiming(B.foes.indexOf(eye)); }
      else { B.cmd = { kind: 'fight' }; startTiming(firstAlive()); }
    }
    else if (B.phase === 'timing') {
      if (auto === 'perfect' && B.hitT === null && B.t >= B.ring.dur - .01) timingTap();
      if (B.t > B.ring.dur + .3) { const g = B.hitT === null ? 1 : B.grade; if (B.cmd.kind === 'skill' && SKILL[B.cmd.name].target === 'all') resolveAction(null, g); else resolveAction(B.target, g); }
    }
    else if (B.phase === 'foeWind') {
      if (auto === 'perfect' && B.blocked === null && B.t >= .88) timingTap();
      if (B.t > .9) foeHit();
    }
    else if (B.phase === 'after' && B.t > .55) nextTurn();
    else if (B.phase === 'win' && B.t > 1.6 && auto) endBattle();
  }

  // ---------- drawing ----------
  function foePos(i) {
    const F = S.battle.foes, f = F[i];
    if (f.id === 'eye') return [32, 44]; if (f.id === 'lhand') return [12, 84]; if (f.id === 'rhand') return [48, 90];
    if (F.length === 1) return [24, f.boss ? 80 : 70];
    return [12 + i * 22, 66 + (i % 2) * 10];
  }
  const foeX = i => foePos(i)[0], foeY = i => foePos(i)[1];
  const memberX = i => 62 + (i % 2) * 10, memberY = i => 20 + i * 15;
  const aimY = i => S.battle.foes[i].id === 'eye' ? foeY(i) : foeY(i) - (S.battle.foes[i].boss ? 16 : 5);
  function drawFoe(f, t) {
    const [x, y] = foePos(f.i), hurt = S.battle.pops.some(p => S.t - p.t < .3 && Math.abs(p.x - x) < 3);
    if (f.hp <= 0) return;
    if (f.draw === 'golem') { cx.save(); cx.translate(x, y); cx.scale(.62, .62); golemArt(0, 0, t, f.tint, hurt); cx.restore(); }
    else if (f.draw === 'eye') { const oh = f.open ? 12 : 2; rect(x - 30, y - 18, 60, 3, 's0'); for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(28 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(x - w, y + dy, w * 2 + 1, 1, dy < -oh / 2 ? 'n6' : 'n7'); } if (f.open) rect(x - 2, y - oh + 2, 5, oh * 2 - 3, 'k'); }
    else if (f.draw === 'hand') { const bob = Math.round(Math.sin(t * 3 + f.i) * 2); rect(x - 9, y - 16 + bob, 18, 13, 's1'); for (let k = 0; k < 4; k++) rect(x - 9 + k * 5, y - 23 + bob + (k % 2) * 2, 4, 8, 's2'); rect(x - 9, y - 16 + bob, 18, 2, 's3'); }
    else spr(f.draw, x - 6, y - 10, Math.floor(t * 4) % 2);
    const bw = f.boss ? 26 : 14, by = f.id === 'eye' ? y + 15 : y + 3; rect(x - bw / 2, by, bw, 2, 'k'); rect(x - bw / 2, by, bw * f.hp / f.maxhp, 2, f.hp / f.maxhp < .3 ? 'r1' : 'g3');
  }
  function drawField(t) {
    const B = S.battle, th = MAPS[G.region].theme;
    const sky = th === 'cave' ? ['n0', 'n1', 'n1', 'n2'] : th === 'sand' ? ['n5', 'n6', 'n6', 'n7'] : th === 'titan' ? ['n1', 'n2', 'n3', 'n4'] : ['n1', 'n2', 'g1', 'g1'];
    sky.forEach((c, i) => rect(0, i * 12, FW, 12, c));
    if (th === 'titan') { rect(0, 0, FW, 48, 's1'); for (let i = 0; i < 20; i++) px(hash(i) * FW, hash(i + 3) * 48, 's2'); }
    rect(0, 46, FW, FH - 46, th === 'cave' ? 'n1' : th === 'sand' ? 'd1' : th === 'titan' ? 's2' : 'g2');
    for (let x = 0; x < FW; x += 4) px(x + (x * 7 % 3), 50 + (x * 13 % 44), th === 'sand' ? 'd0' : th === 'cave' ? 'p0' : th === 'titan' ? 's3' : 'g3');
    for (const f of B.foes) drawFoe(f, t);
    G.party.forEach((p, i) => { const act = B.actor === p && ['menu', 'timing', 'target', 'allyTarget'].includes(B.phase), ko = p.hp <= 0; spr(p.spr, memberX(i) - (act ? 5 : 0), memberY(i), 0, true, ko ? 's1' : null); if (B.guard > 0 && !ko) px(memberX(i) + 11, memberY(i), 'c3'); });
    if (B.fx && S.t - B.fx.t < .5) { const k = (S.t - B.fx.t) / .5;
      if (B.fx.kind === 'fire') { const x = foeX(B.fx.i), y = aimY(B.fx.i); disc(x, y, 9 * (1 - k) + 1, 'n6'); disc(x, y, 5 * (1 - k), 'n7'); }
      if (B.fx.kind === 'shard') { const x = foeX(B.fx.i), y = aimY(B.fx.i); for (let r = 0; r < 2; r++) for (let a = 0; a < 16; a++) px(x + Math.cos(a / 16 * 6.28) * (k * 18 + r * 3), y + Math.sin(a / 16 * 6.28) * (k * 18 + r * 3), 'c3'); }
      if (B.fx.kind === 'volley') for (let i = 0; i < 5; i++) rect(mix(64, 8, k) + i * 5, 40 + i * 6, 3, 1, 'w3'); }
    if (B.phase === 'timing') {   // the ring shrinks onto the target; tap as it meets the inner circle
      const hasT = B.target !== null && B.target !== undefined, tx = hasT ? foeX(B.target) : 30, ty = hasT ? aimY(B.target) : 60, k = clamp(B.t / B.ring.dur), r = Math.round(mix(24, 6, k));
      for (let a = 0; a < 40; a++) { const q = a / 40 * 6.28; px(tx + Math.cos(q) * 6, ty + Math.sin(q) * 6, 'au'); if (B.hitT === null) px(tx + Math.cos(q) * r, ty + Math.sin(q) * r, 'wt'); }
    }
    if (B.phase === 'foeWind') {   // a marker drops onto the victim: tap as it lands to block
      const i = G.party.indexOf(B.victim), x = memberX(i) + 5, y = memberY(i) - 2, k = clamp(B.t / .9);
      rect(x - 1, Math.round(mix(y - 26, y, k)), 3, 3, B.big ? 'r2' : 'n6'); rect(x - 4, y + 15, 9, 1, 'au');
      if (B.actor.draw !== 'eye') { if (Math.floor(t * 8) % 2) rect(foeX(B.actor.i) - 1, aimY(B.actor.i) - 14, 3, 3, 'r2'); }
    }
    if (B.phase === 'target' && Math.floor(t * 4) % 2) { const i = B.pick; if (B.foes[i] && B.foes[i].hp > 0) rect(foeX(i) - 2, aimY(i) - 16, 5, 4, 'au'); }
  }
  function drawBattle(t) {
    const B = S.battle;
    cx = fieldCx; cx.setTransform(1, 0, 0, 1, 0, 0); drawField(t); cx = mainCx;
    cx.imageSmoothingEnabled = false; cx.drawImage(field, 0, 0, FW, FH, 0, 0, FW * 2, FH * 2);
    for (const p of B.pops) { const k = (S.t - p.t) / .9; if (k < 1) text(p.s, p.x * 2, p.y * 2 - k * 14, p.c, 'center'); }
    if (B.phase === 'timing' && B.t < .4) text('TAP!', 90, 6, 'au', 'center');
    if (B.phase === 'foeWind') text(B.big ? 'GLARE! BLOCK IT!' : 'BLOCK!', 90, 6, B.big ? 'r2' : 'n6', 'center');
    panel(0, 196, W, 124, 'b1');
    text('HP', 82, 200, 's3', 'right', null); text('MP', 112, 200, 's3', 'right', null);
    G.party.forEach((p, i) => { const y = 210 + i * 10; text(p.name, 6, y, B.actor === p ? 'au' : p.hp <= 0 ? 's2' : 'wt'); text(`${p.hp}`, 82, y, p.hp < p.maxhp * .3 ? 'r2' : 'wt', 'right'); text(`${p.mp}`, 112, y, 'c2', 'right'); });
    if (B.phase === 'menu') {
      const opts = B.sub === 'skill' ? B.actor.skills.concat(['BACK']) : B.sub === 'item' ? ['POTION', 'ETHER', 'BACK'] : ['FIGHT', 'SKILL', 'ITEM', 'RUN'];
      opts.forEach((o, i) => { const bx = 4 + (i % 2) * 88, by = 254 + Math.floor(i / 2) * 22; panel(bx, by, 84, 20, B.menu === i ? 'au' : 'b0'); let lab = o; if (SKILL[o]) lab = `${o.split(' ')[0]} ${SKILL[o].mp}`; if (o === 'POTION' || o === 'ETHER') lab = `${o.slice(0, 5)} x${G.items[o]}`; text(lab, bx + 42, by + 6, B.menu === i ? 'au' : 'wt', 'center', null); });
    } else if (B.phase === 'target' || B.phase === 'allyTarget') {
      text(B.phase === 'target' ? 'TAP A FOE' : 'TAP AN ALLY', 90, 262, 'au', 'center');
      panel(4, 294, 172, 20, 'b0'); text('BACK', 90, 300, 'wt', 'center', null);
    } else if (B.phase === 'timing') text('TAP AS THE RING CLOSES', 90, 266, 'wt', 'center');
    else if (B.phase === 'foeWind') text('TAP AS IT LANDS', 90, 266, 'wt', 'center');
    if (B.phase === 'win') { panel(20, 70, 140, 50, 'au'); text('VICTORY!', 90, 80, 'au', 'center'); text(B.lvups.length ? `${B.lvups[0]} LV UP!` : 'TAP TO GO ON', 90, 100, B.lvups.length ? 'g4' : 's4', 'center'); }
    if (B.phase === 'lose') { panel(20, 70, 140, 50, 'r1'); text('PARTY DOWN', 90, 80, 'r2', 'center'); text('TAP TO RETRY', 90, 100, 's4', 'center'); }
  }
  function drawMap(t) {
    const m = MAPS[G.region];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawTile(m.rows[y][x], x, y, t, m.theme);
    if (G.region === 'titan') {   // the titan's face fills the top of the map
      rect(0, MAP_Y, W, 10 * TS + 4, 's1');
      for (let i = 0; i < 40; i++) px(hash(i) * W, MAP_Y + hash(i + 3) * 120, 's2');
      const ex = 90, ey = MAP_Y + 64, oh = 18;
      rect(ex - 56, ey - 30, 112, 5, 's0');
      for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(52 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(ex - w, ey + dy, w * 2 + 1, 1, dy < -oh * .4 ? 'n6' : 'n7'); }
      rect(ex - 3, ey - oh + 2, 7, oh * 2 - 3, 'k');
    }
    if (m.fire) campfire(m.fire[0], m.fire[1], t);
    if (m.altar) altar(m.altar[0], m.altar[1], t, !G.cleared[G.region]);
    for (const n of m.npcs || []) spr(n.id, n.x * TS + 1, MAP_Y + n.y * TS - 3, 0, S.hero.x < n.x);
    if (m.boss && !G.cleared[G.region]) { const [bx, by] = m.boss; cx.save(); cx.translate(bx * TS + 6, MAP_Y + by * TS + 11); cx.scale(.45, .45); golemArt(0, 0, t, FOES['g' + m.bossKind].tint, false); cx.restore(); }
    for (const f of S.foes) if (f.alive) spr(FOES[f.kind].draw, f.x * TS + 1, MAP_Y + f.y * TS + (f.kind === 'bat' ? 2 : 4), Math.floor(t * 4) % 2);
    // the party: the hero leads, the others follow in a little line
    const h = S.hero, k = ease(h.k), hx = mix(h.px, h.x, k) * TS + 1, hy = mix(h.py, h.y, k) * TS + MAP_Y - 3;
    G.party.slice(1).forEach((p, i) => spr(p.spr, hx - (i + 1) * 3 * h.dir, hy + (i + 1) * 2, 0, h.dir < 0));
    spr('hero', hx, hy, h.k < 1 ? Math.floor(t * 10) % 2 : 0, h.dir < 0);
    // HUD
    rect(0, 0, W, MAP_Y, 'k');
    text(m.name, 176, 4, 'au', 'right'); text(`SHARDS ${G.shards}/3`, 176, 16, 'c2', 'right');
    text(`LV${G.party[0].lv} HP${G.party[0].hp}`, 4, 26, 'g4');
    if (S.path.length) { const [tx, ty] = S.path[S.path.length - 1]; if (Math.floor(t * 6) % 2) { rect(tx * TS + 4, MAP_Y + ty * TS + 4, 4, 4, 'wt'); } }
  }
  function drawDialog(t) {
    const d = S.dialog; if (!d) return;
    const [who, line] = d.lines[d.i];
    panel(2, 244, 176, 74, 'b1');
    if (who) { spr(SPR[who] ? who : 'hero', 8, 254, 0); text(who === 'elder' ? 'ELDER' : MEMBERS[who] ? MEMBERS[who].name : '', 24, 252, 'au'); }
    const shown = line.slice(0, Math.floor((S.t - d.t) * 40));
    wrap(shown, who ? 18 : 21).forEach((l, i) => text(l, who ? 24 : 8, (who ? 264 : 254) + i * 11, 'wt'));
    if (Math.floor(t * 3) % 2) text('▼', 170, 306, 'au', 'right', null);
  }
  function drawChoice() {
    const c = S.choice; if (!c) return;
    panel(10, 230, 160, 80, 'au'); text('WHAT DO YOU DO?', 90, 238, 'au', 'center');
    c.opts.forEach((o, i) => { panel(20, 252 + i * 26, 140, 22, c.sel === i ? 'au' : 'b0'); text(o, 90, 259 + i * 26, c.sel === i ? 'au' : 'wt', 'center', null); });
  }
  function drawCut(t) {
    const k = S.cut.t;
    // the trailer's opening, playable: the mountain wakes
    ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'].forEach((c, i) => rect(0, i * 30, W, 31, c));
    for (let i = 0; i < 30; i++) px(hash(i) * W, hash(i + 5) * 90, Math.floor(t * 4 + i) % 5 ? 'n7' : 'n4');
    const shake = k > 1 && k < 4 ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0;
    cx.fillStyle = P('s1'); cx.beginPath(); cx.moveTo(-30 + shake, 236); cx.lineTo(14 + shake, 146); cx.lineTo(54 + shake, 106); cx.lineTo(94 + shake, 98); cx.lineTo(134 + shake, 116); cx.lineTo(194 + shake, 176); cx.lineTo(224 + shake, 236); cx.fill();
    cx.fillStyle = P('g1'); cx.beginPath(); cx.moveTo(44 + shake, 112); cx.lineTo(94 + shake, 96); cx.lineTo(128 + shake, 112); cx.lineTo(94 + shake, 106); cx.fill();
    const eye = easeOut(lin(k, 1.8, 2.4)), ex = 92 + shake, ey = 140;
    if (eye > 0) { const ow = Math.round(16 * eye), oh = Math.max(1, Math.round(7 * eye)); for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(ow * Math.sqrt(1 - (dy / (oh + .5)) ** 2)); rect(ex - w, ey + dy, w * 2 + 1, 1, dy < -oh / 2 ? 'n6' : 'n7'); } if (eye > .5) rect(ex - 2, ey - oh + 1, 5, oh * 2 - 1, 'k'); }
    rect(0, 236, W, 84, 'g1');
    for (let i = 0; i < 6; i++) { const x = 30 + i * 13; rect(x, 228, 10, 10, 'w0'); px(x + 3, 231, 'n6'); }
    spr('hero', 130, 250, 0, true);
    if (k > 3.6) for (let i = 0; i < 3; i++) { const q = lin(k, 3.6 + i * .15, 4.8 + i * .15); shard(mix(92, [-20, 200, 60][i], q), mix(120, [60, 40, -20][i], q) - Math.sin(q * Math.PI) * 30, t); }
    rect(0, 20, W, 34, 'k');
    text(k < 3.6 ? 'IT WAS NEVER A' : 'ITS HEART SHATTERED', 90, 26, 'wt', 'center'); text(k < 3.6 ? 'MOUNTAIN.' : 'INTO THREE SHARDS.', 90, 40, 'wt', 'center');
    if (k > 5) text('TAP TO CONTINUE', 90, 300, 's4', 'center');
  }
  function drawCalm(t) {
    const c = S.calm;
    rect(0, 0, W, H, 's1'); for (let i = 0; i < 60; i++) px(hash(i) * W, hash(i + 3) * H, 's2');
    const droop = c.n / 3, ex = 90, ey = 110, oh = Math.round(30 * (1 - droop * .85));
    rect(ex - 70, ey - 40 + droop * 20, 140, 5, 's0');
    for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(66 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(ex - w, ey + dy, w * 2 + 1, 1, dy < -oh * .4 ? 'n6' : 'n7'); }
    if (oh > 3) rect(ex - 3, ey - oh + 2, 7, oh * 2 - 3, 'k');
    G.party.forEach((p, i) => spr(p.spr, 52 + i * 20, 236, 0));
    if (!c.res && c.n < 3) {
      const k = clamp(c.t / 1.2), sx = mix(80, ex, k), sy = mix(230, ey + 2, ease(k));
      shard(sx, sy, t);
      for (let a = 0; a < 48; a++) { const q = a / 48 * 6.28, r = mix(30, 8, k); px(ex + Math.cos(q) * 8, ey + Math.sin(q) * 8, 'au'); px(ex + Math.cos(q) * r, ey + Math.sin(q) * r, 'wt'); }
    }
    panel(0, 270, W, 50, 'c1');
    text(`RETURN SHARD ${Math.min(3, c.n + 1)}/3`, 90, 278, 'c3', 'center');
    text(c.res === 'ok' ? 'IT EASES...' : c.res === 'bad' ? 'IT ROARS! TRY AGAIN' : 'TAP AS IT REACHES THE EYE', 90, 294, c.res === 'bad' ? 'r2' : 'wt', 'center');
    G.party.forEach((p, i) => text(`${p.hp}`, 10 + i * 44, 306, p.hp < 15 ? 'r2' : 'g4'));
  }
  function drawEnding(t) {
    const e = S.ending, k = e.t;
    ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'].forEach((c, i) => rect(0, i * 30, W, 31, c));
    for (let i = 0; i < 40; i++) px(hash(i) * W, hash(i + 5) * 120, Math.floor(t * 3 + i) % 6 ? 'n7' : 'c3');
    if (e.which === 'sleeps') {
      cx.fillStyle = P('s1'); cx.beginPath(); cx.moveTo(-30, 236); cx.lineTo(14, 146); cx.lineTo(54, 106); cx.lineTo(94, 98); cx.lineTo(134, 116); cx.lineTo(194, 176); cx.lineTo(224, 236); cx.fill();
      for (let i = 0; i < 12; i++) px(50 + i * 7, 110 + (i % 3), i % 2 ? 'r2' : 'n7');
      rect(78, 140, 28, 1, 's0');
    } else {
      cx.fillStyle = P('g2'); cx.beginPath(); cx.moveTo(-30, 236); cx.quadraticCurveTo(90, 150, 224, 236); cx.fill();
      for (let i = 0; i < 16; i++) px(20 + i * 10, 200 + (i % 4) * 6, i % 2 ? 'r2' : 'n7');
    }
    rect(0, 236, W, 84, 'g1');
    for (let i = 0; i < 6; i++) { const x = 30 + i * 13; rect(x, 228, 10, 10, 'w0'); px(x + 3, 231, 'n6'); }
    G.party.forEach((p, i) => spr(p.spr, 100 + i * 14, 250, 0));
    panel(8, 10, 164, 70, 'au');
    const lines = e.which === 'sleeps' ? ['THE GIANT SLEEPS', '', 'YOU GAVE ITS HEART', 'BACK. FLOWERS GROW', 'ON ITS BROW.'] : ['THE GIANT FELL', '', 'THE MOUNTAIN IS A', 'HILL NOW. THE', 'VILLAGE HAS A VIEW.'];
    lines.forEach((l, i) => text(l, 90, 18 + i * 11, i ? 'wt' : 'au', 'center'));
    const n = Object.keys(G.endings).length;
    if (k > 1.5) { panel(20, 270, 140, 40, 'b1'); text(`ENDINGS ${n}/2`, 90, 278, 'c2', 'center'); text(n < 2 ? 'TRY THE OTHER PATH' : 'THANK YOU FOR PLAYING', 90, 292, 'wt', 'center'); }
  }
  function drawTitle(t) {
    ['n0', 'n0', 'n1', 'n1', 'n2', 'n3'].forEach((c, i) => rect(0, i * 54, W, 55, c));
    for (let i = 0; i < 50; i++) px(hash(i) * W, hash(i + 5) * 200, Math.floor(t * 3 + i) % 6 ? 'n7' : 'c3');
    cx.fillStyle = P('s1'); cx.beginPath(); cx.moveTo(-30, 330); cx.lineTo(30, 230); cx.lineTo(90, 200); cx.lineTo(150, 226); cx.lineTo(220, 330); cx.fill();
    cx.font = `16px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'top';
    cx.fillStyle = P('k'); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) cx.fillText('STONEWAKE', 90 + dx, 80 + dy);
    cx.fillStyle = P('au'); cx.fillText('STONEWAKE', 90, 80);
    text('A PIXEL RPG', 90, 104, 'c3', 'center');
    if (Math.floor(t * 2) % 2) text('TAP TO START', 90, 160, 'wt', 'center');
    const n = Object.keys(G.endings || {}).length; if (n) text(`ENDINGS ${n}/2`, 90, 178, 'c2', 'center');
    ['hero', 'knight', 'mage', 'archer'].forEach((s, i) => spr(s, 58 + i * 16, 286, 0));
  }
  function lockPalette() {
    const img = cx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      let c = NEAR.get(key);
      if (!c) { let best = 1e9; for (const p of PAL_RGB) { const e = (p[0] - d[i]) ** 2 + (p[1] - d[i + 1]) ** 2 + (p[2] - d[i + 2]) ** 2; if (e < best) { best = e; c = p; } } NEAR.set(key, c); }
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
  }
  const NEAR = new Map();
  function render(ctx) {
    cx.setTransform(1, 0, 0, 1, 0, 0); rect(0, 0, W, H, 'k');
    const t = S.t;
    if (S.mode === 'title') drawTitle(t);
    else if (S.mode === 'cut') drawCut(t);
    else if (S.mode === 'map') drawMap(t);
    else if (S.mode === 'battle') drawBattle(t);
    else if (S.mode === 'calm') drawCalm(t);
    else if (S.mode === 'ending') drawEnding(t);
    else if (S.mode === 'over') { text('THE PARTY FELL', 90, 140, 'r2', 'center'); text('TAP TO TRY AGAIN', 90, 160, 's4', 'center'); }
    if (S.mode === 'map') { drawDialog(t); drawChoice(); }
    if (S.flash > 0) rect(0, 0, W, H, 'wt');
    lockPalette();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, W, H, 0, 0, LW, LH);
  }

  // ---------- input ----------
  function inBox(x, y, bx, by, bw, bh) { return x >= bx && x < bx + bw && y >= by && y < by + bh; }
  function onPointer(type, X, Y) {
    if (type !== 'down') return;
    const x = X / SC, y = Y / SC;
    Audio.unlock();
    if (S.mode === 'title') { newGame(); return; }
    if (S.mode === 'cut') { if (S.cut.t > 5) endCut(); return; }
    if (S.mode === 'over') { healParty(1); enterRegion(G.region); return; }
    if (S.mode === 'ending') { if (S.ending.t > 1.5) S.mode = 'title'; return; }
    if (S.mode === 'calm') { timingTapCalm(); return; }
    if (S.mode === 'map') {
      if (S.choice) { S.choice.opts.forEach((o, i) => { if (inBox(x, y, 20, 252 + i * 26, 140, 22)) pickChoice(i); }); return; }
      if (S.dialog) { advanceDialog(); return; }
      if (y < MAP_Y) return;
      const tx = Math.floor(x / TS), ty = Math.floor((y - MAP_Y) / TS);
      S.path = bfs(tx, ty);
      return;
    }
    if (S.mode === 'battle') {
      const B = S.battle;
      if (B.phase === 'win') { endBattle(); return; }
      if (B.phase === 'lose') { S.battle = null; healParty(1); enterRegion(G.region); return; }
      if (B.phase === 'timing' || B.phase === 'foeWind') { timingTap(); return; }
      if (B.phase === 'menu') {
        const opts = B.sub === 'skill' ? B.actor.skills.concat(['BACK']) : B.sub === 'item' ? ['POTION', 'ETHER', 'BACK'] : ['FIGHT', 'SKILL', 'ITEM', 'RUN'];
        opts.forEach((o, i) => { if (inBox(x, y, 4 + (i % 2) * 88, 254 + Math.floor(i / 2) * 22, 84, 20)) { B.menu = i; if (o === 'BACK') { B.sub = null; B.menu = 0; } else choose(o); Audio.tone(990, .03, 'square', .04); } });
        return;
      }
      if (B.phase === 'target') {
        if (inBox(x, y, 4, 294, 172, 20)) { B.phase = 'menu'; return; }
        let best = -1, bd = 1e9; B.foes.forEach((f, i) => { if (f.hp <= 0) return; const d = Math.hypot(x / 2 - foeX(i), y / 2 - aimY(i)); if (d < bd) { bd = d; best = i; } });
        if (best >= 0 && bd < 30) startTiming(best);
        return;
      }
      if (B.phase === 'allyTarget') {
        if (inBox(x, y, 4, 294, 172, 20)) { B.phase = 'menu'; return; }
        G.party.forEach((p, i) => { if (inBox(x / 2, y / 2, memberX(i) - 3, memberY(i) - 2, 16, 16) || inBox(x, y, 0, 208 + i * 10, 120, 10)) startTiming(i); });
      }
    }
  }
  function timingTapCalm() { if (!S.calm.res && S.calm.hitT === null) S.calm.hitT = S.calm.t; }
  function onKey(key, down) {
    S.keys[key] = down; if (!down) return;
    const ok = key === 'Enter' || key === ' ' || key === 'z' || key === 'Z';
    if (S.mode === 'title' && ok) return newGame();
    if (S.mode === 'cut' && ok && S.cut.t > 5) return endCut();
    if (S.mode === 'over' && ok) { healParty(1); return enterRegion(G.region); }
    if (S.mode === 'ending' && ok && S.ending.t > 1.5) { S.mode = 'title'; return; }
    if (S.mode === 'calm' && ok) return timingTapCalm();
    if (S.mode === 'map') {
      if (S.choice) { if (key === 'ArrowUp' || key === 'ArrowDown') S.choice.sel = 1 - S.choice.sel; if (ok) pickChoice(S.choice.sel); return; }
      if (S.dialog && ok) return advanceDialog();
      return;
    }
    if (S.mode === 'battle') {
      const B = S.battle;
      if (B.phase === 'win' && ok) return endBattle();
      if (B.phase === 'lose' && ok) { S.battle = null; healParty(1); return enterRegion(G.region); }
      if ((B.phase === 'timing' || B.phase === 'foeWind') && ok) return timingTap();
      if (B.phase === 'menu') {
        const opts = B.sub === 'skill' ? B.actor.skills.concat(['BACK']) : B.sub === 'item' ? ['POTION', 'ETHER', 'BACK'] : ['FIGHT', 'SKILL', 'ITEM', 'RUN'];
        const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[key]; if (mv) { B.menu = clamp(B.menu + mv, 0, opts.length - 1); return; }
        if (ok) { const o = opts[B.menu]; if (o === 'BACK') { B.sub = null; B.menu = 0; } else choose(o); }
        if (key === 'x' || key === 'X' || key === 'Backspace') { B.sub = null; B.menu = 0; }
        return;
      }
      if (B.phase === 'target') {
        const alive = B.foes.map((f, i) => i).filter(i => B.foes[i].hp > 0);
        if (key === 'ArrowLeft' || key === 'ArrowRight') { const j = alive.indexOf(B.pick); B.pick = alive[(j + (key === 'ArrowRight' ? 1 : alive.length - 1)) % alive.length]; }
        if (ok) startTiming(B.pick); if (key === 'x' || key === 'X') B.phase = 'menu'; return;
      }
      if (B.phase === 'allyTarget') { if (key === 'ArrowUp') B.pick = Math.max(0, B.pick - 1); if (key === 'ArrowDown') B.pick = Math.min(G.party.length - 1, B.pick + 1); if (ok) startTiming(B.pick); if (key === 'x' || key === 'X') B.phase = 'menu'; }
    }
  }

  // ---------- test hooks ----------
  const API = {
    G, S, MAPS, newGame, enterRegion, startBattle, pickChoice, autopilot: null, step: n => game.step(n),
    get state() { return S.mode; },
    // give the party a region's companion without playing it (tests jump straight to later fights)
    recruit(id) { if (!G.party.some(p => p.id === id)) G.party.push(newMember(id)); },
    setLevel(lv) { for (const p of G.party) { while (p.lv < lv) { p.lv++; p.maxhp += 8; p.maxmp += 3; p.atk += 2; p.mag += 2; p.def += 1; } p.hp = p.maxhp; p.mp = p.maxmp; } },
    finish() { while (S.dialog) { S.dialog.t = -999; advanceDialog(); } },
  };
  G.endings = loadEndings();
  const game = createGame({ canvas: document.getElementById('c'), width: LW, height: LH, update, render, onPointer, onKey });
  window.__game = API;
})();
