// STONEWAKE - a pixel RPG vertical slice for the demo disc.
// The mountain behind the village was a sleeping titan. It woke, its heart shattered into three shards,
// and you go after them: forest, crystal cave, desert ruins. Each shard is guarded by a golem made of
// shards; beat it and a companion joins. At the titan you choose: FIGHT it, or CALM it by giving the shards back.
//
// TWO HANDS prototype. Left thumb: a floating stick on the map, target + BLOCK in battle. Right thumb: ACT / hold to DASH on the map,
// STRIKE / skills + PARRY in battle. Tap-to-walk and the keyboard still work. See the battle section for the rules.
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
      rows: ['TTTTTTT^TTTTTTT', 'TTT...=.=...TTT', 'TT...=...=...TT', 'TT..=.....=..TT', 'T...=.TTT.=...T', 'T..==.TTT.==..T', 'T..=...T...=..T', 'T..=..f.f..=..T', 'TX.=.......=..T', 'T..===...===..T', 'TT...=...=...TT', 'TTT..=.T.=..TTT', 'TT...=...=...TT', 'T...==...==...T', 'T..==..T..==..T', 'T..=...S...=..T', 'T..=..fTf..=..T', 'T..===...===..T', 'TT....=.=....TT', 'TTT...=.=...TTT', 'TTTT..=.=..TTTT', 'TTTTT.=.=.TTTTT', 'TTTTTTT.TTTTTTT'],
      foes: [{ kind: 'slime', x: 4, y: 14 }, { kind: 'wolf', x: 10, y: 6 }, { kind: 'slime', x: 11, y: 15 }] },
    cave: { name: 'GLIMMERDEEP', theme: 'cave', next: 'desert', start: [7, 21], fire: [7, 12], altar: [9, 2], boss: [7, 3], bossKind: 'cave', ally: 'mage',
      rows: ['WWWWWWW^WWWWWWW', 'WWWccccccccCWWW', 'WWcccC.cc..ccWW', 'WccccccccccccWW', 'WcC.ccWWWcc.cCW', 'Wcc..cWWWc..ccW', 'WWcc.ccWcc.ccWW', 'WWWcc.....ccWWW', 'WWcc..C.C..ccWW', 'WXc.........ccW', 'WcC....c....CcW', 'Wcc...ccc...ccW', 'WWcc.......ccWW', 'WWWcc.WWW.ccWWW', 'WWcc..WQW..ccWW', 'Wcc....S....ccW', 'WcC.........CcW', 'Wccc..C.C..cccW', 'WWccc.....cccWW', 'WWWccc...cccWWW', 'WWWWcc...ccWWWW', 'WWWWWcc.ccWWWWW', 'WWWWWWW.WWWWWWW'],
      foes: [{ kind: 'bat', x: 3, y: 9 }, { kind: 'bat', x: 11, y: 10 }, { kind: 'bat', x: 7, y: 16 }] },
    desert: { name: 'SUNKEN DUNES', theme: 'sand', next: 'titan', start: [7, 21], fire: [10, 12], altar: [4, 2], boss: [7, 3], bossKind: 'desert', ally: 'archer',
      rows: ['PPPPPPP^PPPPPPP', 'Psss...=...sssP', 'Pss.s..=..s.ssP', 'Ps..P..=..P..sP', 'PsX....=.....sP', 'Pss..=====..ssP', 'Ps...=...=...sP', 'Ps.P.=.P.=.P.sP', 'Ps...=...=...sP', 'Pss..=====..ssP', 'Ps.....=.....sP', 'Ps..P..=..P..sP', 'Pss....=.....sP', 'Ps..s..=..s..sP', 'Ps.....=.....sP', 'Pss.S..=..P.ssP', 'Ps.....=.....sP', 'Ps..s.===.s..sP', 'Pss...=.=...ssP', 'Ps....=.=....sP', 'Pss...=.=...ssP', 'Psss..=.=..sssP', 'PPPPPPP.PPPPPPP'],
      foes: [{ kind: 'scorp', x: 3, y: 8 }, { kind: 'scorp', x: 11, y: 14 }, { kind: 'scorp', x: 4, y: 18 }] },
    titan: { name: 'THE STONE FACE', theme: 'titan', next: null, start: [7, 21], fire: [11, 18],
      rows: ['###############', '###############', '###############', '###############', '###############', '###############', '###############', '###############', '###############', '###############', '#####.....#####', '####.......####', '###.........###', '###.........###', '##...........##', '##...........##', '##...........##', '###.........###', '###.........###', '####.......####', '#####.....#####', '######...######', '#######.#######'],
      foes: [] },
  };
  const SOLID = new Set(['T', '~', '#', 'H', 'W', 'C', 'P']);
  // things to find: a chest on each map, a secret (a tile that looks solid but has a tell) and one optional fight
  const FINDS = {
    'forest:1,8': { items: { POTION: 2 }, msg: 'FOUND 2 POTIONS!' },
    'forest:7,15': { gear: 'iron', msg: 'A HOLLOW TREE! FOUND THE IRON CHARM: PARTY DEFENSE +3.' },
    'cave:1,9': { items: { POTION: 1, ETHER: 1 }, msg: 'FOUND A POTION AND AN ETHER!' },
    'cave:7,15': { open: true, msg: 'THE CRACKED WALL CRUMBLES. SOMETHING GLOWS BEHIND IT.' },
    'desert:2,4': { items: { POTION: 2 }, msg: 'FOUND 2 POTIONS!' },
    'desert:4,15': { gear: 'sun', msg: 'THE PILLAR WAS HOLLOW! FOUND THE SUNSTONE: KAEL ATTACK +4.' },
  };
  const GEAR = { iron: 'IRON CHARM', sun: 'SUNSTONE', mirror: 'MIRROR CHARM' };
  const tileAt = (m, x, y) => { if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return '#'; const ch = m.rows[y][x]; return (ch === 'S' || ch === 'X' || ch === 'Q') && G.found && G.found[G.region + ':' + x + ',' + y] ? (ch === 'X' ? 'x' : '.') : ch; };

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
      case 'X': case 'x': rect(X + 1, Y + 4, 10, 7, 'w1'); rect(X + 1, Y + 4, 10, 1, 'w3'); rect(X + 1, Y + 7, 10, 1, 'w0'); rect(X + 5, Y + 6, 2, 3, ch === 'X' ? 'au' : 'w0'); if (ch === 'x') rect(X + 1, Y + 2, 10, 2, 'w2'); else if (Math.floor(t * 2 + x) % 4 === 0) px(X + 9, Y + 4, 'wt'); break;
      case 'S': if (theme === 'grass') { rect(X + 5, Y + 6, 2, 6, 'w0'); disc(X + 6, Y + 5, 5, 'g1'); disc(X + 5, Y + 4, 3, 'g2'); rect(X + 5, Y + 8, 2, 2, 'k'); }   // a hollow in the trunk
        else if (theme === 'cave') { rect(X, Y, TS, TS, 'n0'); px(X + 3, Y + 2, 'n2'); px(X + 4, Y + 3, 'n2'); px(X + 4, Y + 4, 'n2'); px(X + 5, Y + 5, 'n2'); px(X + 7, Y + 7, 'n2'); px(X + 6, Y + 8, 'n2'); }   // cracks
        else { rect(X, Y, TS, TS, 'd2'); rect(X + 2, Y, 8, TS, 'd1'); rect(X + 8, Y, 2, TS, 'd0'); rect(X + 1, Y, 10, 2, 'w4'); px(X + 5, Y + 5, 'd0'); px(X + 6, Y + 6, 'd0'); px(X + 5, Y + 7, 'd0'); }
        break;
      case 'Q': rect(X, Y, TS, TS, 'n1'); rect(X + 3, Y + 3, 6, 9, 's2'); rect(X + 4, Y + 1, 4, 3, 's3'); shard(X + 6, Y + 7, t); if (Math.floor(t * 3) % 2) px(X + 5, Y + 2, 'r2'); break;
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
    'SHARD STRIKE': { w: 2, target: 'foe', desc: 'shards x dmg' }, GUARD: { w: 1, target: 'none', desc: 'party dmg /2' },
    FIREBALL: { w: 2, target: 'foe', desc: 'fire', fire: true }, HEAL: { w: 1, target: 'ally', desc: '+30 HP' }, VOLLEY: { w: 2, target: 'all', desc: 'hits all', pierce: true },
  };
  const FOES = {
    slime: { name: 'SLIME', hp: 26, atk: 9, spd: 5, xp: 6, pat: 's', brkMax: 2, draw: 'slime' }, wolf: { name: 'WOLF', hp: 34, atk: 13, spd: 11, xp: 9, pat: 'ss', brkMax: 3, draw: 'wolf' },
    bat: { name: 'GLOOMBAT', hp: 30, atk: 12, spd: 14, xp: 9, pat: 'sss', brkMax: 3, draw: 'bat', weak: 'pierce' }, scorp: { name: 'DUNE STINGER', hp: 44, atk: 15, spd: 9, xp: 12, pat: 'sh', brkMax: 3, draw: 'scorp', weak: 'fire' },
    gforest: { name: 'MOSS GOLEM', hp: 200, atk: 10, spd: 4, xp: 30, pat: 's', brkMax: 5, draw: 'golem', tint: ['g1', 'g2'], weak: 'fire', boss: true },
    gcave: { name: 'CRYSTAL GOLEM', hp: 460, atk: 18, spd: 5, xp: 40, pat: 'ss', brkMax: 6, draw: 'golem', tint: ['p0', 'p1'], weak: 'fire', boss: true },
    gdesert: { name: 'SAND GOLEM', hp: 660, atk: 23, spd: 6, xp: 55, pat: 'sh', brkMax: 6, draw: 'golem', tint: ['d0', 'd1'], boss: true },
    wraith: { name: 'SHARD WRAITH', hp: 800, atk: 23, spd: 15, xp: 60, pat: 'ssh', brkMax: 6, draw: 'golem', tint: ['n1', 'p1'], weak: 'fire', boss: true },
    eye: { name: 'TITAN EYE', hp: 680, atk: 20, spd: 7, xp: 0, pat: 'hs', brkMax: 6, draw: 'eye', weak: 'shard', boss: true },
    lhand: { name: 'LEFT HAND', hp: 190, atk: 18, spd: 9, xp: 0, pat: 'h', brkMax: 3, draw: 'hand', boss: true }, rhand: { name: 'RIGHT HAND', hp: 190, atk: 18, spd: 10, xp: 0, pat: 's', brkMax: 3, draw: 'hand', boss: true },
  };
  function newMember(id) { const b = MEMBERS[id]; return { id, name: b.name, spr: b.spr, lv: 1, xp: 0, maxhp: b.hp, hp: b.hp, maxmp: b.mp, mp: b.mp, atk: b.atk, mag: b.mag, def: b.def, spd: b.spd, skills: b.skills.slice() }; }

  // ---------- game state ----------
  const G = {};
  function newGame() {
    Object.assign(G, { party: [newMember('hero')], shards: 0, region: 'village', items: { POTION: 3, ETHER: 1 }, cleared: {}, beaten: {}, flags: {}, found: {}, gear: {}, fireUsed: {}, endings: G.endings || loadEndings() });
    enterRegion('village', true);
  }
  function loadEndings() { try { return JSON.parse(localStorage.getItem('stonewake-endings') || '{}'); } catch (_) { return {}; } }
  function saveEndings() { try { localStorage.setItem('stonewake-endings', JSON.stringify(G.endings)); } catch (_) {} }
  function shake(k) { S.trauma = Math.max(S.trauma || 0, k); }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }
  const S = { mode: 'title', t: 0, mt: 0, hero: { x: 7, y: 20, px: 7, py: 20, k: 1, dir: 1, fx: 0, fy: -1 }, stick: null, path: [], dialog: null, battle: null, foes: [], cut: null, keys: {}, choice: null, ending: null, flash: 0, lastStep: 0 };

  function enterRegion(id, fresh) {
    G.region = id; const m = MAPS[id];
    S.hero = { x: m.start[0], y: m.start[1], px: m.start[0], py: m.start[1], k: 1, dir: 1, fx: 0, fy: -1 };
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
    const ch = tileAt(m, x, y);
    if (ch === 'X' || ch === 'S') return { type: 'find', key: G.region + ':' + x + ',' + y };
    if (ch === 'Q') return { type: 'shrine', key: G.region + ':' + x + ',' + y };
    return null;
  }
  function walkable(m, x, y, isTarget) { const ch = tileAt(m, x, y); if (SOLID.has(ch) || ch === 'x') return false; if (blocker(x, y)) return !!isTarget; return true; }
  function tryStep(dx, dy) {
    const m = MAPS[G.region], nx = S.hero.x + dx, ny = S.hero.y + dy;
    if (dx) S.hero.dir = dx; S.hero.fx = dx; S.hero.fy = dy;
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
    else if (b.type === 'fire' && G.fireUsed[G.region]) say([[null, 'THE EMBERS ARE COLD. THEY ONLY HAD ONE NIGHT IN THEM.']]);
    else if (b.type === 'fire') { G.fireUsed[G.region] = true; healParty(1); Audio.tone(523, .1, 'triangle', .06); Audio.tone(784, .2, 'triangle', .06, null, .1); say([[null, 'You rest by the fire. HP and MP restored.']]); }
    else if (b.type === 'boss') startBattle([MAPS[G.region].bossKind === 'forest' ? 'gforest' : MAPS[G.region].bossKind === 'cave' ? 'gcave' : 'gdesert'], 'boss');
    else if (b.type === 'altar') say([[null, G.cleared[G.region] ? 'The altar is empty now.' : 'A shard glows on the altar. A golem stands guard.']]);
    else if (b.type === 'eye') finaleChoice();
    else if (b.type === 'find') {
      const f = FINDS[b.key]; G.found[b.key] = true;
      if (f.items) for (const k in f.items) G.items[k] += f.items[k];
      if (f.gear) G.gear[f.gear] = true;
      Audio.tone(784, .08, 'square', .05); Audio.tone(1047, .08, 'square', .05, null, .08); Audio.tone(1568, .2, 'square', .05, null, .16);
      say([[null, f.msg]]);
    }
    else if (b.type === 'shrine') say([[null, 'A STATUE OF SHARDS. SOMETHING MOVES INSIDE IT.'], [null, 'IT IS STRONGER THAN ANY GOLEM. FIGHT IT?']], () => { S.choice = { opts: ['FIGHT IT', 'LEAVE IT'], sel: 0, shrine: b.key }; });
  }
  function updateMap(dt) {
    const h = S.hero;
    h.k = Math.min(1, h.k + dt * SPEED * (S.dash ? 1.8 : 1));
    if (h.k >= 1 && !S.dialog) {
      if (S.path.length) { const [nx, ny] = S.path.shift(); tryStep(Math.sign(nx - h.x), Math.sign(ny - h.y)); }
      else { const sd = stickDir(), kx = sd ? sd[0] : (S.keys.ArrowRight ? 1 : 0) - (S.keys.ArrowLeft ? 1 : 0), ky = sd ? sd[1] : (S.keys.ArrowDown ? 1 : 0) - (S.keys.ArrowUp ? 1 : 0); if (kx) tryStep(kx, 0); else if (ky) tryStep(0, ky); }
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
  // TWO HANDS. The right thumb attacks and parries, the left thumb picks targets and blocks.
  // Your turn: the target is already picked (change it on the left pad), STRIKE is one tap, then tap as the ring closes.
  // Their turn: every attack is a string of hits. Each hit is HEAVY (red, the ring closes on the left pad: BLOCK it)
  // or SWIFT (blue, the ring closes on the right pad: PARRY it for no damage, a counter and a WAKE pip, or BLOCK it safely).
  // Parrying a heavy is CRUSHED. A tap before the window locks that thumb until the hit lands, so mashing fails.
  // WAKE (0-5 pips, shared, refills each battle) pays for skills; perfect hits, parries and breaks earn it.
  // BREAK: perfects, weaknesses, shard strikes and parries fill a foe's break bar; full = it loses its next action,
  // its trick (shell, burrow, phase) falls off and it takes x1.5 until it recovers. Counters expose a boss, they are not the only key.
  const WAKE_MAX = 5, BLOCK_WIN = .13, PARRY_WIN = .075, HIT_GAP = .42, WIND = .9;
  const PAD_Y = 236, LPAD = [2, PAD_Y, 86, 82], RPAD = [92, PAD_Y, 86, 82];
  function startBattle(foeIds, kind) {
    // a boss's output is fixed per action while the party's damage grows with its size, so scale bosses by party size (Brain demo-disc#E33)
    const n = G.party.length, hs = 1 + .25 * (n - 1), as = 1 + .12 * (n - 1);
    const foes = foeIds.map((id, i) => { const b = FOES[id], hp = b.boss ? Math.round(b.hp * hs) : b.hp; return { id, ...b, atk: b.boss ? Math.round(b.atk * as) : b.atk, maxhp: hp, hp, i, open: id !== 'eye', brk: 0, stun: 0 }; });
    S.battle = { kind, foes, phase: 'intro', t: 0, turnQ: [], actor: null, sub: null, pick: 0, msg: null, pops: [], guard: 0, round: 0, cmd: null, ring: null, hitT: 0, combo: 0, banner: null,
      wake: 2, hits: [], lock: { L: 0, R: 0 }, pressFx: { L: -9, R: -9 }, stats: { parry: 0, block: 0, crushed: 0, taken: 0, perfect: 0, breaks: 0, actions: 0, taps: 0 } };
    S.mode = 'battle'; S.flash = .3; S.battle.pick = firstAlive(); S.stick = null; S.dash = null; S.path = []; touches.clear();
    Audio.noise(.3, .15); [523, 659, 784, 1047].forEach((f, i) => Audio.tone(f, .08, 'square', .05, null, i * .05));
  }
  const aliveParty = () => G.party.filter(p => p.hp > 0), aliveFoes = () => S.battle.foes.filter(f => f.hp > 0);
  function gainWake(B, n, x, y) { const was = B.wake; B.wake = Math.min(WAKE_MAX, B.wake + n); if (B.wake > was && x !== undefined) pop(B, `+${B.wake - was} WAKE`, x, y, 'c2'); }
  function addBreak(B, f, n) {
    if (f.hp <= 0 || f.stun > 0) return;
    f.brk = Math.min(f.brkMax, f.brk + n);
    if (f.brk >= f.brkMax) {
      // it loses its next action (both, for a boss that acts twice); its queued turns come round as STUNNED skips
      f.stun = f.boss && f.id !== 'lhand' && f.id !== 'rhand' ? 2 : 1; f.shell = false; f.burrowed = false; f.phased = false; f.intent = null;
      B.stats.breaks++; pop(B, 'BREAK!', foeX(f.i), aimY(f.i) - 22, 'au'); shake(.8); S.hitstop = .12; buzz(30); gainWake(B, 1);
      Audio.tone(220, .25, 'square', .07, 110); Audio.noise(.25, .2);
    }
  }
  function nextTurn() {
    const B = S.battle;
    if (!aliveFoes().length) return winBattle();
    if (!aliveParty().length) { B.phase = 'lose'; B.t = 0; Audio.sfx('fail'); return; }
    if (!B.turnQ.length) {
      B.round++;
      if (B.foes.some(f => f.id === 'eye')) { const eye = B.foes.find(f => f.id === 'eye'); eye.open = B.round % 2 === 0; if (eye.open && eye.hp > 0) pop(B, 'THE EYE OPENS', 45, 22, 'au'); }
      B.turnQ = [...aliveParty().map(p => ({ who: 'p', p })), ...aliveFoes().map(f => ({ who: 'f', f }))].sort((a, b) => (b.p || b.f).spd - (a.p || a.f).spd);
      if (aliveParty().length > 1) for (const f of aliveFoes()) if (f.boss && f.id !== 'lhand' && f.id !== 'rhand') B.turnQ.push({ who: 'f', f, extra: true });   // bosses act twice a round, so their threat grows with the party
      for (const f of aliveFoes()) { f.intent = f.stun > 0 ? null : intentFor(f, B.round); if (f.intent && TRICK[f.intent].on) TRICK[f.intent].on(f); }
      const loud = aliveFoes().find(f => f.intent); if (loud) banner(B, TRICK[loud.intent].say);
      if (B.guard > 0) B.guard--;
    }
    const nx = B.turnQ.shift();
    if (nx.who === 'p') { if (nx.p.hp <= 0) return nextTurn(); B.actor = nx.p; B.phase = 'menu'; B.sub = null; B.t = 0; if (!B.foes[B.pick] || B.foes[B.pick].hp <= 0) B.pick = firstAlive(); }
    else {
      const f = nx.f;
      if (f.hp <= 0) return nextTurn();
      if (f.stun > 0) { f.stun--; if (!f.stun) f.brk = 0; pop(B, f.stun ? 'BROKEN' : 'STUNNED', foeX(f.i), aimY(f.i) - 14, 'au'); B.actor = f; B.phase = 'after'; B.t = 0; return; }
      const tr = !nx.extra && f.intent && TRICK[f.intent];
      if (tr && !tr.pat) { B.actor = f; B.phase = 'after'; B.t = 0; return; }   // shell / burrow / phase: the trick is its turn
      if (tr && f.intent === 'erupt') f.burrowed = false;
      if (nx.extra && f.burrowed) { B.actor = f; B.phase = 'after'; B.t = 0; return; }
      B.actor = f; B.phase = 'foeWind'; B.t = 0; const ps = aliveParty(); B.victim = ps[Math.floor(hash(B.round * 7 + f.i + (nx.extra ? 3 : 0)) * ps.length)];
      const pat = tr ? tr.pat : f.pat, per = tr ? tr.big : [1, .65, .5, .42][pat.length - 1];
      B.aoe = !!(tr && tr.aoe); B.big = !!tr;
      B.hits = [...pat].map((k, j) => ({ kind: k, at: WIND + j * (k === 'h' ? HIT_GAP * 1.25 : HIT_GAP) * (f.id === 'wraith' || f.id === 'bat' ? .8 : 1), res: null, done: false, mult: per }));
      B.lock = { L: 0, R: 0 };
    }
  }
  function pop(B, s, x, y, c = 'wt') { B.pops.push({ s, x, y, c, t: S.t }); }
  function banner(B, s) { B.banner = { s, t: S.t }; }
  // each boss has a trick, announced at the start of the round it happens in (the party is faster, so it can answer)
  const TRICK = {
    slam: { say: 'IT WINDS UP A SLAM! HEAVY: BLOCK IT WITH YOUR LEFT THUMB!', pat: 'h', big: 2.4 },
    shell: { say: 'CRYSTALS GROW OVER IT! SHARD STRIKE OR A BREAK WILL CRACK THEM.', on: f => { f.shell = true; } },
    rain: { say: 'CRYSTAL RAIN ON EVERYONE! THREE SWIFT DROPS: PARRY THEM!', pat: 'sss', big: .55, aoe: true },
    burrow: { say: 'IT SINKS INTO THE SAND! FIREBALL OR A BREAK DIGS IT OUT.', on: f => { f.burrowed = true; } },
    erupt: { say: 'THE SAND BOILS! A HEAVY ERUPTION UNDER EVERYONE!', pat: 'h', big: 1.6, aoe: true },
    phase: { say: 'IT TURNS TO LIGHT! ONLY A SHARD STRIKE CAN PIN IT.', on: f => { f.phased = true; } },
    glare: { say: 'THE EYE OPENS! HEAVY, SWIFT, HEAVY!', pat: 'hsh', big: .9 },
  };
  function intentFor(f, r) {
    if (f.id === 'gforest') return r % 3 === 0 ? 'slam' : null;
    if (f.id === 'gcave') return r % 3 === 1 ? 'shell' : r % 3 === 0 ? 'rain' : null;
    if (f.id === 'gdesert') return f.burrowed ? 'erupt' : r % 3 === 1 ? 'burrow' : null;
    if (f.id === 'wraith') return r % 2 === 1 ? 'phase' : 'slam';
    if (f.id === 'eye') return f.open ? 'glare' : null;
    return null;
  }
  // the right pad: STRIKE (nearest the thumb), the actor's skills by name (no sub-menu), ITEM and RUN up top
  function rightButtons() {
    const B = S.battle, a = B.actor, [x, y] = RPAD;
    if (B.sub === 'item') return [{ o: 'POTION', b: [x, y, 86, 24] }, { o: 'ETHER', b: [x, y + 28, 86, 24] }, { o: 'BACK', b: [x, y + 56, 86, 24] }];
    const sk = a.skills, out = [{ o: 'ITEM', b: [x, y, 41, 22] }, { o: 'RUN', b: [x + 45, y, 41, 22] }];
    if (sk.length === 1) out.push({ o: sk[0], b: [x, y + 25, 86, 24] }); else sk.forEach((s, i) => out.push({ o: s, b: [x + i * 45, y + 25, 41, 24] }));
    out.push({ o: 'STRIKE', b: [x, y + 52, 86, 28] });
    return out;
  }
  // the left pad: one chip per foe, laid out like the field, so the left thumb aims without reaching up
  function foeChips() {
    const B = S.battle, [x, y] = LPAD, n = B.foes.length, w = n === 1 ? 86 : n === 2 ? 41 : 26;
    return B.foes.map((f, i) => ({ i, b: [x + i * (w + 4) - (n === 3 ? 1 : 0), y + 26, w, 40] }));
  }
  function choose(cmd) {
    const B = S.battle, a = B.actor;
    if (cmd === 'STRIKE') { B.cmd = { kind: 'fight' }; startTiming(validPick()); }
    else if (cmd === 'ITEM') { B.sub = 'item'; }
    else if (cmd === 'BACK') { B.sub = null; }
    else if (cmd === 'RUN') { if (B.kind === 'foe' || B.kind === 'optional') { Audio.tone(300, .2, 'square', .05, 600); S.battle = null; S.mode = 'map'; S.lockUntil = S.t + .4; } else pop(B, "CAN'T RUN", 45, 50, 'r2'); }
    else if (SKILL[cmd]) {
      const sk = SKILL[cmd];
      if (B.wake < sk.w) { pop(B, `NEEDS ${sk.w} WAKE`, 45, 50, 'r2'); Audio.tone(200, .08, 'square', .04); return; }
      if (cmd === 'SHARD STRIKE' && G.shards < 1) { pop(B, 'NO SHARDS YET', 45, 50, 'r2'); return; }
      B.cmd = { kind: 'skill', name: cmd };
      if (sk.target === 'foe') startTiming(validPick());
      else if (sk.target === 'ally') { B.phase = 'allyTarget'; B.t = 0; }
      else startTiming(null);
    } else if (cmd === 'POTION' || cmd === 'ETHER') {
      if (!G.items[cmd]) { pop(B, 'NONE LEFT', 45, 50, 'r2'); return; }
      B.cmd = { kind: 'item', name: cmd };
      if (cmd === 'ETHER') resolveAction(null, 1); else { B.phase = 'allyTarget'; B.t = 0; }
    }
  }
  function firstAlive() { const f = S.battle.foes; for (let i = 0; i < f.length; i++) if (f[i].hp > 0 && f[i].open !== false) return i; for (let i = 0; i < f.length; i++) if (f[i].hp > 0) return i; return 0; }
  function validPick() { const B = S.battle; if (!B.foes[B.pick] || B.foes[B.pick].hp <= 0) B.pick = firstAlive(); return B.pick; }
  function startTiming(target) {
    const B = S.battle; B.stats.actions++;
    if (B.cmd.kind === 'item' || (B.cmd.kind === 'skill' && SKILL[B.cmd.name].target === 'ally')) return resolveAction(target, 1);
    B.target = target; B.phase = 'timing'; B.t = 0; B.ring = { dur: .85 }; B.hitT = null;
  }
  function timingTap() {
    const B = S.battle;
    if (B.phase === 'timing' && B.hitT === null) { B.hitT = B.t; const q = Math.abs(B.t - B.ring.dur); const grade = q < .07 ? 1.45 : q < .16 ? 1.2 : 1; B.combo = grade > 1.4 ? (B.combo || 0) + 1 : 0; pop(B, grade > 1.4 ? (B.combo > 1 ? `PERFECT x${B.combo}` : 'PERFECT!') : grade > 1 ? 'GOOD' : 'OK', 45, 54, grade > 1.4 ? 'au' : grade > 1 ? 'c3' : 's4'); if (grade > 1.4) { B.stats.perfect++; S.hitstop = .08; shake(.35); buzz(20); } Audio.tone(grade > 1.5 ? 1320 : 990, .06, 'square', .06); B.grade = grade; }
  }
  // a thumb pressed during their attack: L blocks, R parries. Judged against the next hit that has not landed yet.
  function defend(hand) {
    const B = S.battle; if (B.phase !== 'foeWind') return;
    const h = B.hits.find(q => !q.done && q.res === null); if (!h) return;
    B.pressFx[hand] = S.t;
    if (B.lock[hand] > B.t) return;
    const d = B.t - h.at, win = hand === 'L' ? BLOCK_WIN + (G.gear.mirror ? .07 : 0) : h.kind === 'h' ? BLOCK_WIN : PARRY_WIN + (G.gear.mirror ? .03 : 0);
    if (Math.abs(d) <= win) {
      h.res = hand === 'L' ? 'block' : h.kind === 'h' ? 'crushed' : 'parry';
      if (h.res === 'parry') { pop(B, 'PARRY!', 66, 62, 'c2'); Audio.tone(1760, .06, 'square', .07); Audio.tone(2637, .08, 'square', .05, null, .04); S.hitstop = .09; buzz(20); }
      else if (h.res === 'block') { pop(B, 'BLOCK', 66, 62, 'c3'); Audio.tone(1500, .05, 'square', .06); S.hitstop = .05; buzz(15); }
      else { pop(B, 'CRUSHED!', 66, 62, 'r2'); Audio.tone(140, .2, 'square', .07); }
    } else if (d < -win) { B.lock[hand] = h.at + .06; pop(B, 'EARLY', hand === 'L' ? 20 : 70, 90, 's3'); Audio.tone(200, .05, 'square', .03); }
  }
  function resolveAction(target, grade) {
    const B = S.battle, a = B.actor, c = B.cmd;
    const dmg = (base, f, kind) => {
      if (f.burrowed && kind !== 'fire') { pop(B, 'UNDERGROUND', foeX(f.i), aimY(f.i) - 6, 's4'); return 0; }
      if (f.phased && kind !== 'shard') { pop(B, 'PASSES THROUGH', foeX(f.i), aimY(f.i) - 6, 's4'); return 0; }
      let d = Math.max(1, Math.round(base * grade * (1 + .05 * Math.min(4, Math.max(0, B.combo - 1))) * (0.9 + hash(Math.floor(S.t * 100)) * .2)));
      let brk = grade > 1.4 ? 1 : 0;
      if (f.shell) { if (kind === 'shard') { f.shell = false; pop(B, 'SHATTERED!', foeX(f.i), aimY(f.i) - 22, 'c3'); shake(.7); } else { d = Math.max(1, Math.round(d * .1)); pop(B, 'SHELL', foeX(f.i), aimY(f.i) - 22, 'c2'); } }
      if (f.burrowed && kind === 'fire') { f.burrowed = false; f.stun = Math.max(f.stun, 1); pop(B, 'GLASSED!', foeX(f.i), aimY(f.i) - 22, 'n6'); shake(.7); }
      if (f.phased && kind === 'shard') { f.phased = false; pop(B, 'PINNED!', foeX(f.i), aimY(f.i) - 22, 'g4'); }
      if (kind === 'shard') brk += 2;
      f.hurtT = S.t; if (f.weak && f.weak === kind) { d = Math.round(d * 1.5); brk++; pop(B, 'WEAK!', foeX(f.i), aimY(f.i) - 14, 'n6'); }
      if (f.id === 'eye' && !f.open) { d = Math.round(d * .15); brk = 0; pop(B, 'CLOSED', foeX(f.i), aimY(f.i) - 14, 's3'); }
      if (f.stun > 0) d = Math.round(d * 1.5);
      f.hp = Math.max(0, f.hp - d); pop(B, String(d), foeX(f.i), aimY(f.i) - 6, f.stun > 0 ? 'au' : 'wt');
      if (brk) addBreak(B, f, brk);
      return d; };
    if (grade > 1.4) gainWake(B, 1, 45, 44);
    if (c.kind === 'fight') { const f = B.foes[target]; dmg((a.atk + (a.id === 'hero' && G.gear.sun ? 4 : 0)) * 1.4, f, a.id === 'archer' ? 'pierce' : 'phys'); Audio.noise(.08, .2); }
    else if (c.kind === 'skill') {
      const sk = SKILL[c.name]; B.wake -= sk.w;
      if (c.name === 'SHARD STRIKE') { const f = B.foes[target]; dmg((a.atk + (G.gear.sun ? 4 : 0)) * (1.3 + G.shards * .4), f, 'shard'); Audio.tone(1800, .3, 'square', .06, 400); B.fx = { kind: 'shard', t: S.t, i: target }; }
      else if (c.name === 'FIREBALL') { const f = B.foes[target]; dmg(a.mag * 2.2, f, 'fire'); Audio.noise(.4, .2); B.fx = { kind: 'fire', t: S.t, i: target }; }
      else if (c.name === 'VOLLEY') { for (const f of aliveFoes()) dmg(a.atk * 1.0, f, 'pierce'); Audio.tone(2400, .2, 'square', .04, 900); B.fx = { kind: 'volley', t: S.t }; }
      else if (c.name === 'GUARD') { B.guard = 2; pop(B, 'GUARD UP', 66, 50, 'c3'); Audio.tone(440, .2, 'triangle', .07); }
      else if (c.name === 'HEAL') { const p = G.party[target]; p.hp = Math.min(p.maxhp, p.hp + 30); pop(B, '+30', memberX(target) + 4, memberY(target), 'g4'); Audio.tone(880, .2, 'triangle', .06, 1320); }
    } else if (c.kind === 'item') {
      G.items[c.name]--;
      if (c.name === 'POTION') { const p = G.party[target]; p.hp = Math.min(p.maxhp, p.hp + 35); pop(B, '+35 HP', memberX(target), memberY(target), 'g4'); } else gainWake(B, 2, 45, 44);
      Audio.tone(880, .15, 'triangle', .06, 1320);
    }
    B.phase = 'after'; B.t = 0;
  }
  // one hit of their string lands: the outcome was fixed by the thumb (or by nothing)
  function landHit(h) {
    const B = S.battle, f = B.actor; h.done = true;
    let counter = 0;
    for (const v of B.aoe ? aliveParty() : [B.victim]) {
      if (v.hp <= 0) continue;
      let d = Math.round(f.atk * h.mult * (h.kind === 'h' ? 1.25 : 1) * (0.9 + hash(Math.floor(S.t * 100) + 3 + v.spd) * .2) - (v.def + (G.gear.iron ? 3 : 0)) * .5);
      if (h.res === 'block') d = Math.round(d * .35);
      if (h.res === 'parry') { d = 0; counter += v.atk * .6; }
      if (h.res === 'crushed') d = Math.round(d * 1.3);
      if (B.guard > 0) d = Math.round(d * .5);
      if (h.res !== 'parry') { d = Math.max(1, d); v.hp = Math.max(0, v.hp - d); B.stats.taken += d; pop(B, String(d), memberX(G.party.indexOf(v)) + 4, memberY(G.party.indexOf(v)) - 2, h.res === 'block' ? 'c3' : 'r2'); }
    }
    if (h.res) B.stats[h.res]++;
    if (h.res === 'parry') {   // the counter: a free riposte, a wake pip and a notch of break
      const cd = Math.max(1, Math.round(counter * (B.aoe ? .5 : 1)));
      if (!f.burrowed && !f.phased) { f.hp = Math.max(0, f.hp - cd); f.hurtT = S.t; pop(B, String(cd), foeX(f.i), aimY(f.i) - 6, 'c2'); }
      gainWake(B, 1, 66, 52); addBreak(B, f, 1);
      Audio.noise(.06, .12); shake(.3);
    } else { Audio.noise(.1, h.res === 'block' ? .08 : .2); S.flash = h.res === 'block' ? 0 : .06; shake(h.res === 'block' ? .25 : B.big ? .8 : .45); if (B.big && h.res !== 'block') { S.hitstop = .1; buzz(40); } }
  }
  function winBattle() {
    const B = S.battle; B.phase = 'win'; B.t = 0;
    const xp = B.foes.reduce((s, f) => s + f.xp, 0); B.lvups = [];
    for (const p of G.party) { if (p.hp <= 0) p.hp = 1; p.xp += xp; while (p.xp >= p.lv * 20) { p.xp -= p.lv * 20; p.lv++; p.maxhp += 8; p.maxmp += 3; p.atk += 2; p.mag += 2; p.def += 1; p.hp = p.maxhp; p.mp = p.maxmp; B.lvups.push(p.name); } }
    Audio.sfx('win');
  }
  function endBattle() {
    const B = S.battle; S.battle = null; S.mode = 'map'; S.lockUntil = S.t + .4; API.lastBattle = B.stats;
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
    if (B.kind === 'optional') { G.found[S.shrineKey] = true; G.gear.mirror = true; Audio.tone(1047, .1, 'square', .05); Audio.tone(1568, .3, 'square', .05, null, .1); say([[null, 'THE WRAITH BREAKS APART. IN ITS LIGHT: THE MIRROR CHARM.'], [null, 'BLOCKING IS EASIER NOW: THE WINDOW IS WIDER.']]); }
  }

  // ---------- the finale ----------
  function finaleChoice() {
    if (S.choice) return;
    say([['hero', 'Three shards. Its heart. What do we do with it?'], ['knight', 'We fight.'], ['mage', 'Or we give it back. It was asleep before.']], () => { S.choice = { opts: ['FIGHT IT', 'CALM IT'], sel: 0 }; });
  }
  function pickChoice(i) {
    const c = S.choice; S.choice = null;
    if (c && c.shrine) { if (i === 0) { S.shrineKey = c.shrine; startBattle(['wraith'], 'optional'); } return; }
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
  // bots for tests and the attract film. 'perfect' parries swift and blocks heavy on the frame; 'fightonly' strikes on time
  // and blocks everything; 'human' is a seeded player with real timing spread (API.human: sd seconds, parry true/false).
  let botSeed = 1;
  const botRand = () => { botSeed = (botSeed * 1664525 + 1013904223) >>> 0; return botSeed / 4294967296; };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += botRand(); return (u - 3) / Math.sqrt(.5); };
  function botDecide(B) {   // what the autopilot would press this turn: { cmd, pick (foe), ally }
    const auto = API.autopilot, a = B.actor, can = n => a.skills.includes(n) && B.wake >= SKILL[n].w && (n !== 'SHARD STRIKE' || G.shards > 0);
    const eye = B.foes.find(f => f.id === 'eye' && f.open && f.hp > 0), shelled = B.foes.find(f => f.shell && f.hp > 0), sunk = B.foes.find(f => f.burrowed && f.hp > 0), lit = B.foes.find(f => f.phased && f.hp > 0);
    const rainy = B.foes.find(f => f.hp > 0 && f.intent && TRICK[f.intent].aoe), hurt = G.party.find(p => p.hp > 0 && p.hp < p.maxhp * .35);
    const at = f => B.foes.indexOf(f), plain = B.foes.find(f => f.hp > 0 && f.open !== false && !f.shell && !f.burrowed && !f.phased) || B.foes.find(f => f.hp > 0);
    if (auto === 'fightonly') return { cmd: 'STRIKE', pick: at(B.foes.find(f => f.hp > 0 && f.open !== false) || plain) };
    if (hurt && can('HEAL')) return { cmd: 'HEAL', ally: G.party.indexOf(hurt) };
    if (eye && can('SHARD STRIKE')) return { cmd: 'SHARD STRIKE', pick: at(eye) };
    if (shelled && can('SHARD STRIKE')) return { cmd: 'SHARD STRIKE', pick: at(shelled) };
    if (sunk && can('FIREBALL')) return { cmd: 'FIREBALL', pick: at(sunk) };
    if (rainy && can('GUARD') && !B.guard && !API.noGuard) return { cmd: 'GUARD' };
    if (lit && can('SHARD STRIKE')) return { cmd: 'SHARD STRIKE', pick: at(lit) };
    const weakTo = B.foes.find(f => f.hp > 0 && f.weak === 'fire'); if (weakTo && can('FIREBALL') && B.wake >= 3) return { cmd: 'FIREBALL', pick: at(weakTo) };
    return { cmd: 'STRIKE', pick: at(plain) };
  }
  function botPlan(B) {
    const d = botDecide(B);
    if (d.pick !== undefined) B.pick = d.pick;
    choose(d.cmd);
    if (d.ally !== undefined && B.phase === 'allyTarget') startTiming(d.ally);
  }
  function botDefend(B) {   // schedule one press per hit the moment the wind-up starts
    const auto = API.autopilot, hp = API.human || { sd: .06, parry: true };
    B.botPress = B.hits.map(h => {
      if (auto === 'perfect') return { at: h.at, hand: h.kind === 'h' ? 'L' : 'R' };
      if (auto === 'fightonly') return { at: h.at, hand: 'L' };
      if (botRand() < (hp.miss || 0)) return { at: 99, hand: 'L' };
      let hand = h.kind === 's' && hp.parry ? 'R' : 'L';
      if (hp.parry && botRand() < (hp.misread || 0)) hand = hand === 'L' ? 'R' : 'L';   // read the colour wrong (a bot reading ground truth never does: Brain demo-disc / mirage#E26)
      return { at: h.at + gauss() * hp.sd + (hp.bias || 0), hand };
    });
    if (auto === 'human' && hp.mash) { B.botPress = []; for (let t = .3; t < B.hits[B.hits.length - 1].at + .3; t += .09) B.botPress.push({ at: t, hand: B.botPress.length % 2 ? 'R' : 'L' }); }
  }
  function update(dt) {
    S.trauma = Math.max(0, (S.trauma || 0) - dt * 1.8);
    if (S.hitstop > 0) { S.hitstop -= dt; return; }   // hit-stop: the world holds still for a few frames on a big hit
    S.t += dt; S.mt += dt; S.flash = Math.max(0, S.flash - dt);
    if (S.mode === 'cut') { S.cut.t += dt; if (S.cut.t > 6.5) endCut(); return; }
    if (S.mode === 'map') { if (!S.dialog && !S.choice) updateMap(dt); return; }
    if (S.mode === 'calm') { updateCalm(dt); return; }
    if (S.mode === 'ending') { S.ending.t += dt; return; }
    if (S.mode !== 'battle') return;
    const B = S.battle; B.t += dt;
    const auto = API.autopilot;
    if (B.phase === 'intro' && B.t > .7) nextTurn();
    else if (B.phase === 'menu' && auto && B.t > (API.botThink || 0)) botPlan(B);
    else if (B.phase === 'timing') {
      if (auto && B.hitT === null) { const off = auto === 'human' ? (B.botOff = B.botOff ?? gauss() * (API.human || { sd: .06 }).sd) : 0; if (B.t >= B.ring.dur - .01 + off) { timingTap(); B.botOff = undefined; } }
      if (B.t > B.ring.dur + .3) { B.botOff = undefined; const g = B.hitT === null ? 1 : B.grade; if (B.cmd.kind === 'skill' && SKILL[B.cmd.name].target === 'all') resolveAction(null, g); else resolveAction(B.target, g); }
    }
    else if (B.phase === 'foeWind') {
      if (auto && !B.botPress) botDefend(B);
      if (B.botPress) for (const p of B.botPress) if (!p.used && B.t >= p.at) { p.used = true; defend(p.hand); }
      for (const h of B.hits) if (!h.done && (h.res !== null ? B.t >= h.at : B.t > h.at + BLOCK_WIN + .07)) landHit(h);
      if (B.hits.every(h => h.done)) { B.phase = 'after'; B.t = 0; B.botPress = null; }
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
    const kb = f.hurtT && S.t - f.hurtT < .15 ? -2 : 0, sink = f.burrowed ? 14 : 0;
    if (f.draw === 'golem') { cx.save(); cx.translate(x + kb, y + sink); cx.scale(.62, .62); if (f.phased) cx.globalAlpha = .45; golemArt(0, 0, t, f.tint, hurt); cx.restore(); if (sink) rect(x - 20, y - 2, 40, 6, 'd1'); }
    else if (f.draw === 'eye') { const oh = f.open ? 12 : 2; rect(x - 30, y - 18, 60, 3, 's0'); for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(28 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(x - w, y + dy, w * 2 + 1, 1, dy < -oh / 2 ? 'n6' : 'n7'); } if (f.open) rect(x - 2, y - oh + 2, 5, oh * 2 - 3, 'k'); }
    else if (f.draw === 'hand') { const bob = Math.round(Math.sin(t * 3 + f.i) * 2); rect(x - 9, y - 16 + bob, 18, 13, 's1'); for (let k = 0; k < 4; k++) rect(x - 9 + k * 5, y - 23 + bob + (k % 2) * 2, 4, 8, 's2'); rect(x - 9, y - 16 + bob, 18, 2, 's3'); }
    else spr(f.draw, x - 6, y - 10, Math.floor(t * 4) % 2);
    if (f.shell) { for (let i = 0; i < 7; i++) px(x - 12 + i * 4, y - 22 + (i % 2) * 3, 'c3'); rect(x - 13, y - 24, 26, 1, 'c2'); }
    if (f.intent && TRICK[f.intent].big && Math.floor(t * 4) % 2) { rect(x - 1, y - 34, 3, 6, 'r2'); rect(x - 1, y - 26, 3, 2, 'r2'); }   // ! the trick is coming this round
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
    G.party.forEach((p, i) => { const act = B.actor === p && ['menu', 'timing', 'allyTarget'].includes(B.phase), ko = p.hp <= 0; spr(p.spr, memberX(i) - (act ? 5 : 0), memberY(i), 0, true, ko ? 's1' : null); if (B.guard > 0 && !ko) px(memberX(i) + 11, memberY(i), 'c3'); });
    if (B.fx && S.t - B.fx.t < .5) { const k = (S.t - B.fx.t) / .5;
      if (B.fx.kind === 'fire') { const x = foeX(B.fx.i), y = aimY(B.fx.i); disc(x, y, 9 * (1 - k) + 1, 'n6'); disc(x, y, 5 * (1 - k), 'n7'); }
      if (B.fx.kind === 'shard') { const x = foeX(B.fx.i), y = aimY(B.fx.i); for (let r = 0; r < 2; r++) for (let a = 0; a < 16; a++) px(x + Math.cos(a / 16 * 6.28) * (k * 18 + r * 3), y + Math.sin(a / 16 * 6.28) * (k * 18 + r * 3), 'c3'); }
      if (B.fx.kind === 'volley') for (let i = 0; i < 5; i++) rect(mix(64, 8, k) + i * 5, 40 + i * 6, 3, 1, 'w3'); }
    if (B.phase === 'timing') {   // the ring shrinks onto the target; tap as it meets the inner circle
      const hasT = B.target !== null && B.target !== undefined, tx = hasT ? foeX(B.target) : 30, ty = hasT ? aimY(B.target) : 60, k = clamp(B.t / B.ring.dur), r = Math.round(mix(24, 6, k));
      for (let a = 0; a < 40; a++) { const q = a / 40 * 6.28; px(tx + Math.cos(q) * 6, ty + Math.sin(q) * 6, 'au'); if (B.hitT === null) px(tx + Math.cos(q) * r, ty + Math.sin(q) * r, 'wt'); }
    }
    if (B.phase === 'foeWind') {   // each hit of the string drops onto the victim, red for heavy, blue for swift
      for (const v of B.aoe ? aliveParty() : [B.victim]) { const i = G.party.indexOf(v), x = memberX(i) + 5, y = memberY(i) - 2;
        for (const h of B.hits) { if (h.done) continue; const k = clamp(1 - (h.at - B.t) / WIND); if (k <= 0) continue; rect(x - 1, Math.round(mix(y - 26, y, k)), 3, 3, h.kind === 'h' ? 'r2' : 'c2'); }
        rect(x - 4, y + 15, 9, 1, 'au'); }
      if (B.actor.draw !== 'eye' && Math.floor(t * 8) % 2) rect(foeX(B.actor.i) - 1, aimY(B.actor.i) - 14, 3, 3, 'r2');
    }
    if (B.phase === 'menu' && Math.floor(t * 4) % 2) { const i = B.pick; if (B.foes[i] && B.foes[i].hp > 0) { const x = foeX(i), y = aimY(i) - 16; rect(x - 2, y, 5, 2, 'au'); rect(x - 1, y + 2, 3, 1, 'au'); px(x, y + 3, 'au'); } }
  }
  function ring(x, y, r, c) { for (let a = 0; a < 48; a++) { const q = a / 48 * 6.28; px(x + Math.cos(q) * r, y + Math.sin(q) * r, c); } }
  function button(b, label, on, c = 'b0', lc) { panel(b[0], b[1], b[2], b[3], on ? 'au' : c); text(label, b[0] + b[2] / 2, b[1] + Math.round(b[3] / 2) - 4, lc || (on ? 'au' : 'wt'), 'center', null); }
  function shieldIcon(x, y, c) { rect(x - 5, y - 6, 11, 7, c); rect(x - 4, y + 1, 9, 2, c); rect(x - 2, y + 3, 5, 2, c); px(x, y + 5, c); rect(x - 3, y - 4, 7, 1, 'k'); }
  function swordIcon(x, y, c) { for (let i = 0; i < 9; i++) px(x - 4 + i, y + 4 - i, c); for (let i = 0; i < 9; i++) px(x - 3 + i, y + 4 - i, c); rect(x - 6, y + 2, 5, 1, c); rect(x - 4, y, 1, 5, c); }
  function drawDeck(t) {   // the bottom 40%: everything a thumb needs lives here
    const B = S.battle;
    panel(0, 196, W, 124, 'b1');
    // party strip: tap a member here when a heal needs a target
    G.party.forEach((p, i) => { const x = 4 + (i % 2) * 88, y = 199 + Math.floor(i / 2) * 13, sel = B.phase === 'allyTarget';
      if (sel) panel(x - 2, y - 2, 88, 13, p.hp < p.maxhp ? 'g3' : 'b0');
      text(p.name, x, y + 2, B.actor === p ? 'au' : p.hp <= 0 ? 's2' : 'wt', 'left', 'k', 8);
      rect(x + 42, y + 3, 38, 5, 'k'); rect(x + 42, y + 3, Math.round(38 * p.hp / p.maxhp), 5, p.hp < p.maxhp * .3 ? 'r1' : 'g3'); text(`${p.hp}`, x + 61, y + 3, 'wt', 'center', 'k', 8); });
    // WAKE: shared pips
    text('WAKE', 6, 226, 'c2', 'left', null); for (let i = 0; i < WAKE_MAX; i++) { const x = 44 + i * 12; rect(x, 226, 9, 7, 'k'); if (i < B.wake) { rect(x + 1, 227, 7, 5, 'c2'); if (Math.floor(t * 6 + i) % 9 === 0) px(x + 2, 228, 'c3'); } }
    const L = LPAD, R = RPAD;
    if (B.phase === 'foeWind') {   // their turn: two big thumb pads, the ring closes on the one this hit wants
      const h = B.hits.find(q => !q.done), lx = L[0] + L[2] / 2, rx = R[0] + R[2] / 2, cy = L[1] + 40;
      const pl = S.t - B.pressFx.L < .12, pr = S.t - B.pressFx.R < .12;
      panel(L[0], L[1], L[2], L[3], pl ? 'wt' : B.lock.L > B.t ? 's1' : h && h.kind === 'h' ? 'r1' : 'b0');
      panel(R[0], R[1], R[2], R[3], pr ? 'wt' : B.lock.R > B.t ? 's1' : h && h.kind === 's' ? 'c1' : 'b0');
      shieldIcon(lx, cy - 4, h && h.kind === 'h' ? 'r2' : 's4'); swordIcon(rx, cy - 4, h && h.kind === 's' ? 'c2' : 's4');
      text('BLOCK', lx, L[1] + 62, 'wt', 'center', null); text('PARRY', rx, R[1] + 62, 'wt', 'center', null);
      if (h) { const k = clamp(1 - (h.at - B.t) / WIND), r = Math.round(mix(34, 12, k)), x = h.kind === 'h' ? lx : rx; ring(x, cy - 4, 12, 'au'); if (k > 0) ring(x, cy - 4, r, 'wt');
        if (h.kind === 's') ring(lx, cy - 4, 12, 's2'); }
      B.hits.forEach((q, i) => { const x = 90 - (B.hits.length - 1) * 6 + i * 12; rect(x - 4, 306, 9, 9, 'k'); rect(x - 3, 307, 7, 7, q.done ? (q.res === 'parry' ? 'c2' : q.res === 'block' ? 's3' : 'r1') : q.kind === 'h' ? 'r2' : 'c1'); });
      return;
    }
    if (B.phase === 'menu') {
      text('TARGET', L[0] + L[2] / 2, L[1] + 6, 's3', 'center', null);
      for (const c of foeChips()) { const f = B.foes[c.i], b = c.b, dead = f.hp <= 0, on = B.pick === c.i && !dead;
        panel(b[0], b[1], b[2], b[3], dead ? 's0' : on ? 'au' : f.stun > 0 ? 'n6' : 'b0');
        if (!dead) { const nm = f.name.split(' ').pop(); text(b[2] > 40 ? nm : nm.slice(0, 3), b[0] + b[2] / 2, b[1] + 6, on ? 'au' : 'wt', 'center', null);
          rect(b[0] + 3, b[1] + 20, b[2] - 6, 3, 'k'); rect(b[0] + 3, b[1] + 20, Math.round((b[2] - 6) * f.hp / f.maxhp), 3, 'g3');
          if (f.brkMax) { const n = f.brkMax, w = Math.max(2, Math.floor((b[2] - 6) / n) - 1); for (let j = 0; j < n; j++) rect(b[0] + 3 + j * (w + 1), b[1] + 26, w, 3, j < f.brk ? 'au' : 's1'); }
          if (f.weak && b[2] > 30) text(f.weak === 'fire' ? 'FIRE!' : f.weak === 'pierce' ? 'ARROW' : 'SHARD', b[0] + b[2] / 2, b[1] + 31, 'n6', 'center', null);
        } }
      text('◀ SWIPE ▶', L[0] + L[2] / 2, L[1] + 70, 's2', 'center', null);
      for (const btn of rightButtons()) { const o = btn.o, sk = SKILL[o]; let lab = o;
        if (sk) lab = (btn.b[2] < 50 ? o.split(' ')[0].slice(0, 4) : o.split(' ').pop()) + ' ' + '◆'.repeat(sk.w);
        if (o === 'POTION' || o === 'ETHER') lab = `${o} x${G.items[o]}`;
        const off = (sk && B.wake < sk.w) || ((o === 'POTION' || o === 'ETHER') && !G.items[o]);
        button(btn.b, lab, o === 'STRIKE', o === 'STRIKE' ? 'r1' : 'b0', off ? 's2' : null); }
    } else if (B.phase === 'allyTarget') { text('TAP AN ALLY ABOVE', 90, 252, 'au', 'center'); button([RPAD[0], RPAD[1] + 52, 86, 28], 'BACK', false); }
    else if (B.phase === 'timing') { const k = clamp(B.t / B.ring.dur), r = Math.round(mix(30, 10, k)); panel(R[0], R[1], R[2], R[3], 'r1'); swordIcon(R[0] + 43, R[1] + 36, 'au'); ring(R[0] + 43, R[1] + 36, 10, 'au'); if (B.hitT === null) ring(R[0] + 43, R[1] + 36, r, 'wt'); text('TAP!', R[0] + 43, R[1] + 64, 'wt', 'center', null); text('WAIT FOR', 46, 262, 's4', 'center', null); text('THE RING', 46, 274, 's4', 'center', null); }
  }
  function drawTimeline(t) {   // who acts next: party in blue, foes in red, the current actor first
    const B = S.battle, q = [B.actor ? { who: B.actor.spd !== undefined && G.party.includes(B.actor) ? 'p' : 'f', p: B.actor, f: B.actor, now: true } : null, ...B.turnQ].filter(Boolean).slice(0, 8);
    rect(0, 184, W, 12, 'k');
    q.forEach((e, i) => { const x = 4 + i * 16, me = e.who === 'p' ? e.p : e.f, foe = e.who === 'f', stun = foe && me.stun > 0;
      rect(x, 185, 14, 10, e.now ? 'au' : foe ? (stun ? 's2' : 'r1') : 'b1'); text(me.name[0], x + 7, 186, 'wt', 'center', null, 8); if (e.extra) px(x + 12, 186, 'n7'); });
  }
  function drawBattle(t) {
    const B = S.battle;
    cx = fieldCx; cx.setTransform(1, 0, 0, 1, 0, 0); drawField(t); cx = mainCx;
    const tr = (S.trauma || 0) ** 2, ox = Math.round((hash(Math.floor(S.t * 60)) - .5) * 8 * tr), oy = Math.round((hash(Math.floor(S.t * 60) + 7) - .5) * 8 * tr);   // trauma^2 shake
    cx.imageSmoothingEnabled = false; rect(0, 0, W, FH * 2, 'k'); cx.drawImage(field, 0, 0, FW, FH, ox, oy, FW * 2, FH * 2);
    for (const p of B.pops) { const k = (S.t - p.t) / .9; if (k < 1) text(p.s, p.x * 2, p.y * 2 - k * 14, p.c, 'center'); }
    if (B.banner && S.t - B.banner.t < 2.6) { const ls = wrap(B.banner.s, 21), y0 = 182 - ls.length * 10; rect(0, y0 - 3, W, 3 + ls.length * 10, 'k'); ls.forEach((l, i) => text(l, 90, y0 + i * 10, 'au', 'center')); }
    else if (B.phase === 'foeWind') { const h = B.hits.find(q => !q.done); if (h) { rect(0, 170, W, 13, 'k'); text(h.kind === 'h' ? '◀ HEAVY: BLOCK' : 'SWIFT: PARRY ▶', 90, 172, h.kind === 'h' ? 'r2' : 'c2', 'center'); } }
    if (B.combo > 1 && B.phase !== 'foeWind' && !(B.banner && S.t - B.banner.t < 2.6)) text(`COMBO x${B.combo}`, 176, 160, 'au', 'right');
    drawTimeline(t);
    drawDeck(t);
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
    if (m.fire) { if (G.fireUsed[G.region]) { const X = m.fire[0] * TS + 6, Y = MAP_Y + m.fire[1] * TS + 8; rect(X - 4, Y + 2, 8, 2, 'w0'); px(X, Y + 1, 's3'); } else campfire(m.fire[0], m.fire[1], t); }
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
    if (S.mode === 'map') { drawControls(t); drawDialog(t); drawChoice(); }
    if (S.flash > 0) rect(0, 0, W, H, 'wt');
    lockPalette();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, W, H, 0, 0, LW, LH);
  }

  // ---------- input ----------
  // Two thumbs, tracked by pointer id. On the map: a floating stick spawns where the left thumb lands in the lower
  // left, ACT / hold-to-DASH sits under the right thumb; a tap anywhere else on the map still walks there.
  // In battle: left half of the deck = left thumb (target / BLOCK), right half = right thumb (actions / PARRY).
  const STICK_ZONE = y => y >= 196, ACT = [150, 282, 20];
  const touches = new Map();   // pointer id -> what that thumb is doing
  function inBox(x, y, b, b1, b2, b3) { if (Array.isArray(b)) [b, b1, b2, b3] = b; return x >= b && x < b + b2 && y >= b1 && y < b1 + b3; }
  function onPointer(type, X, Y, id = 0) {
    const x = X / SC, y = Y / SC;
    if (type === 'move') { const tc = touches.get(id); if (tc && tc.kind === 'stick') { tc.x = x; tc.y = y; } else if (tc && tc.kind === 'swipe') swipeMove(tc, x); return; }
    if (type === 'up' || type === 'cancel') { const tc = touches.get(id); touches.delete(id); if (tc && tc.kind === 'stick' && S.stick === tc) S.stick = null; if (tc && tc.kind === 'dash' && S.dash === tc) S.dash = null; return; }
    if (type !== 'down') return;
    Audio.unlock();
    if (S.battle) S.battle.stats.taps++;
    if (S.lockUntil && S.t < S.lockUntil) return;   // after a stage change, ignore presses for a beat (Brain demo-disc#E5)
    if (S.mode === 'title') { newGame(); return; }
    if (S.mode === 'cut') { if (S.cut.t > 5) endCut(); return; }
    if (S.mode === 'over') { healParty(1); enterRegion(G.region); return; }
    if (S.mode === 'ending') { if (S.ending.t > 1.5) S.mode = 'title'; return; }
    if (S.mode === 'calm') { timingTapCalm(); return; }
    if (S.mode === 'map') {
      if (S.choice) { S.choice.opts.forEach((o, i) => { if (inBox(x, y, 20, 252 + i * 26, 140, 22)) pickChoice(i); }); return; }
      if (S.dialog) { advanceDialog(); return; }
      if (Math.hypot(x - ACT[0], y - ACT[1]) < ACT[2] + 6) { if (frontOf()) act(); else { const tc = { kind: 'dash', id }; touches.set(id, tc); S.dash = tc; } return; }
      if (x < 100 && STICK_ZONE(y)) { const tc = { kind: 'stick', ox: x, oy: y, x, y, id }; touches.set(id, tc); S.stick = tc; S.path = []; return; }
      if (y < MAP_Y) return;
      S.path = bfs(Math.floor(x / TS), Math.floor((y - MAP_Y) / TS));
      return;
    }
    if (S.mode === 'battle') {
      const B = S.battle;
      if (B.phase === 'win') { endBattle(); return; }
      if (B.phase === 'lose') { S.battle = null; healParty(1); enterRegion(G.region); return; }
      if (B.phase === 'timing') { timingTap(); return; }
      if (B.phase === 'foeWind') { defend(x < 90 ? 'L' : 'R'); return; }
      if (B.phase === 'menu') {
        if (x < 90 && y >= PAD_Y) { touches.set(id, { kind: 'swipe', x0: x, done: false });
          for (const c of foeChips()) if (inBox(x, y, c.b) && B.foes[c.i].hp > 0) { B.pick = c.i; Audio.tone(990, .03, 'square', .04); }
          return; }
        if (y < 184) {   // a tap on a foe up on the field still aims (two-handed players will not need it)
          let best = -1, bd = 1e9; B.foes.forEach((f, i) => { if (f.hp <= 0) return; const d = Math.hypot(x / 2 - foeX(i), y / 2 - aimY(i)); if (d < bd) { bd = d; best = i; } });
          if (best >= 0 && bd < 30) B.pick = best; return;
        }
        for (const btn of rightButtons()) if (inBox(x, y, btn.b)) { Audio.tone(990, .03, 'square', .04); choose(btn.o); return; }
        return;
      }
      if (B.phase === 'allyTarget') {
        if (inBox(x, y, RPAD[0], RPAD[1] + 52, 86, 28)) { B.phase = 'menu'; return; }
        G.party.forEach((p, i) => { if (inBox(x / 2, y / 2, memberX(i) - 3, memberY(i) - 2, 16, 16) || inBox(x, y, 2 + (i % 2) * 88, 197 + Math.floor(i / 2) * 13, 88, 13)) startTiming(i); });
      }
    }
  }
  function swipeMove(tc, x) {   // drag along the left pad to walk the target through the foes
    const B = S.battle; if (!B || B.phase !== 'menu' || tc.done || Math.abs(x - tc.x0) < 10) return;
    tc.done = true; cycleTarget(x > tc.x0 ? 1 : -1);
  }
  function cycleTarget(d) { const B = S.battle, alive = B.foes.map((f, i) => i).filter(i => B.foes[i].hp > 0); const j = alive.indexOf(B.pick); B.pick = alive[(j + d + alive.length) % alive.length]; Audio.tone(990, .03, 'square', .04); }
  // ACT: use whatever is in front of the hero (talk, open, rest, fight); with nothing in front, hold it to DASH
  function frontOf() { const h = S.hero; return blocker(h.x + h.fx, h.y + h.fy); }
  function act() { const b = frontOf(); if (b) { S.path = []; interact(b); } else Audio.tone(330, .04, 'square', .03); }
  function actLabel() { const b = frontOf(); if (!b) return 'DASH'; return { npc: 'TALK', fire: 'REST', altar: 'LOOK', boss: 'FIGHT', eye: 'FACE', find: 'OPEN', shrine: 'LOOK' }[b.type] || 'ACT'; }
  function stickDir() { const s = S.stick; if (!s) return null; const dx = s.x - s.ox, dy = s.y - s.oy; if (Math.hypot(dx, dy) < 3) return null; return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; }
  function drawControls(t) {   // drawn as outlines so they never hide the map (control visibility: Brain SYSTEM/input)
    if (S.dialog || S.choice) return;
    const s = S.stick;
    if (s) { const dx = s.x - s.ox, dy = s.y - s.oy, m = Math.hypot(dx, dy), k = m > 14 ? 14 / m : 1; ring(s.ox, s.oy, 16, 'wt'); ring(s.ox, s.oy, 15, 'k'); disc(s.ox + dx * k, s.oy + dy * k, 6, 'au'); }
    else { ring(40, 282, 16, 's3'); text('MOVE', 40, 278, 's3', 'center', null); }
    const lab = actLabel(), on = lab !== 'DASH' || !!S.dash;
    ring(ACT[0], ACT[1], ACT[2], on ? 'au' : 's3'); ring(ACT[0], ACT[1], ACT[2] - 1, 'k'); if (on && Math.floor(t * 3) % 2) ring(ACT[0], ACT[1], ACT[2] + 2, 'au');
    text(lab, ACT[0], ACT[1] - 4, on ? 'au' : 's3', 'center', 'k');
  }
  function timingTapCalm() { if (!S.calm.res && S.calm.hitT === null) S.calm.hitT = S.calm.t; }
  // keys: arrows move / aim, Z = right thumb (STRIKE, PARRY, ACT), X = left thumb (BLOCK); 1-2 skills, I items, R run
  function onKey(key, down) {
    S.keys[key] = down; if (!down) return;
    const ok = key === 'Enter' || key === ' ' || key === 'z' || key === 'Z', left = key === 'x' || key === 'X';
    if (S.mode === 'title' && ok) return newGame();
    if (S.mode === 'cut' && ok && S.cut.t > 5) return endCut();
    if (S.mode === 'over' && ok) { healParty(1); return enterRegion(G.region); }
    if (S.mode === 'ending' && ok && S.ending.t > 1.5) { S.mode = 'title'; return; }
    if (S.mode === 'calm' && (ok || left)) return timingTapCalm();
    if (S.mode === 'map') {
      if (S.choice) { if (key === 'ArrowUp' || key === 'ArrowDown') S.choice.sel = 1 - S.choice.sel; if (ok) pickChoice(S.choice.sel); return; }
      if (S.dialog && ok) return advanceDialog();
      if (ok) return act();
      return;
    }
    if (S.mode === 'battle') {
      const B = S.battle;
      if (B.phase === 'win' && ok) return endBattle();
      if (B.phase === 'lose' && ok) { S.battle = null; healParty(1); return enterRegion(G.region); }
      if (B.phase === 'timing' && (ok || left)) return timingTap();
      if (B.phase === 'foeWind' && (ok || left)) return defend(left ? 'L' : 'R');
      if (B.phase === 'menu') {
        if (key === 'ArrowLeft' || key === 'ArrowRight') return cycleTarget(key === 'ArrowRight' ? 1 : -1);
        if (B.sub === 'item') { if (key === '1') choose('POTION'); if (key === '2') choose('ETHER'); if (left || key === 'Backspace') B.sub = null; return; }
        if (ok) return choose('STRIKE');
        if (key === '1' || key === '2') { const s = B.actor.skills[+key - 1]; if (s) choose(s); return; }
        if (key === 'i' || key === 'I') return choose('ITEM');
        if (key === 'r' || key === 'R') return choose('RUN');
        return;
      }
      if (B.phase === 'allyTarget') { if (key === 'ArrowUp' || key === 'ArrowLeft') B.pick2 = Math.max(0, (B.pick2 || 0) - 1); if (key === 'ArrowDown' || key === 'ArrowRight') B.pick2 = Math.min(G.party.length - 1, (B.pick2 || 0) + 1); if (ok) startTiming(B.pick2 || 0); if (left) B.phase = 'menu'; }
    }
  }

  // ---------- test hooks ----------
  const API = {
    G, S, MAPS, FINDS, newGame, enterRegion, startBattle, pickChoice, autopilot: null, human: null, botThink: 0, step: n => game.step(n),
    get state() { return S.mode; },
    decide: () => botDecide(S.battle), ui: () => S.battle ? { right: S.battle.actor && G.party.includes(S.battle.actor) ? rightButtons() : [], chips: foeChips(), L: LPAD, R: RPAD, act: ACT } : { act: ACT },
    seed(n) { botSeed = n >>> 0 || 1; },
    // give the party a region's companion without playing it (tests jump straight to later fights)
    recruit(id) { if (!G.party.some(p => p.id === id)) G.party.push(newMember(id)); },
    setLevel(lv) { for (const p of G.party) { while (p.lv < lv) { p.lv++; p.maxhp += 8; p.maxmp += 3; p.atk += 2; p.mag += 2; p.def += 1; } p.hp = p.maxhp; p.mp = p.maxmp; } },
    finish() { while (S.dialog) { S.dialog.t = -999; advanceDialog(); } },
  };
  G.endings = loadEndings();
  const game = createGame({ canvas: document.getElementById('c'), width: LW, height: LH, update, render, onPointer, onKey });
  window.__game = API;
})();
