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
  const PITCH = !!window.STONEWAKE_PITCH || location.hash === '#pitch';   // the guided pitch; otherwise this is the game
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
    FIREBALL: { w: 2, target: 'foe', desc: 'fire', fire: true, cast: true }, HEAL: { w: 1, target: 'ally', desc: '+HP', cast: true }, VOLLEY: { w: 2, target: 'all', desc: 'hits all', pierce: true },
  };
  const FOES = {
    slime: { name: 'SLIME', hp: 26, atk: 9, spd: 5, xp: 6, pat: 's', brkMax: 2, draw: 'slime' }, wolf: { name: 'WOLF', hp: 34, atk: 13, spd: 11, xp: 9, pat: 'ss', brkMax: 3, draw: 'wolf' },
    bat: { name: 'GLOOMBAT', hp: 30, atk: 12, spd: 14, xp: 9, pat: 'sss', brkMax: 3, draw: 'bat', weak: 'pierce' }, scorp: { name: 'DUNE STINGER', hp: 44, atk: 15, spd: 9, xp: 12, pat: 'sh', brkMax: 3, draw: 'scorp', weak: 'fire' },
    gforest: { name: 'MOSS GOLEM', hp: 200, atk: 10, spd: 4, xp: 30, pat: 's', brkMax: 5, draw: 'golem', tint: ['g1', 'g2'], weak: 'fire', boss: true },
    gcave: { name: 'CRYSTAL GOLEM', hp: 460, atk: 18, spd: 5, xp: 40, pat: 'ss', brkMax: 6, draw: 'golem', tint: ['p0', 'p1'], weak: 'fire', boss: true },
    gdesert: { name: 'SAND GOLEM', hp: 660, atk: 23, spd: 6, xp: 55, pat: 'sh', brkMax: 6, draw: 'golem', tint: ['d0', 'd1'], boss: true },
    wraith: { name: 'SHARD WRAITH', hp: 800, atk: 23, spd: 15, xp: 60, pat: 'ssh', brkMax: 6, draw: 'golem', tint: ['n1', 'p1'], weak: 'fire', boss: true },
    eye: { name: 'TITAN EYE', hp: 680, atk: 20, spd: 7, xp: 0, pat: 'hs', brkMax: 6, draw: 'eye', weak: 'shard', boss: true },
    tgolem: { name: 'MOSS GOLEM', weak: 'fire', hp: 240, atk: 12, spd: 8, xp: 0, pat: 'sh', brkMax: 4, draw: 'golem', tint: ['g1', 'g2'], boss: true },
    thand: { name: 'STONE HAND', weak: 'fire', hp: 240, atk: 12, spd: 8, xp: 0, pat: 'sh', brkMax: 4, draw: 'hand', boss: true },
    lhand: { short: 'LH', name: 'LEFT HAND', hp: 190, atk: 18, spd: 9, xp: 0, pat: 'h', brkMax: 3, draw: 'hand', boss: true }, rhand: { short: 'RH', name: 'RIGHT HAND', hp: 190, atk: 18, spd: 10, xp: 0, pat: 's', brkMax: 3, draw: 'hand', boss: true },
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
    if (k === 'wake') say([['elder', 'KAEL! The mountain... it was never a mountain.'], ['elder', 'Its heart broke into three shards. They fell in the forest, the cave and the dunes.'], ['elder', 'Bring them back before it walks. North, through the forest.'], [null, 'SLIDE ON THE LOWER LEFT TO WALK. HOLD THE RIGHT BUTTON TO DASH.'], [null, 'WALK INTO THINGS TO USE THEM, OR TAP A TILE TO GO THERE.']]);
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
    S.hero.px = S.hero.x; S.hero.py = S.hero.y; S.hero.x = nx; S.hero.y = ny; S.hero.k = 0; mapStepped();
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
    else if (b.type === 'boss' && S.demo && S.demo.map) startDemoFight();
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
    h.k = Math.min(1, h.k + dt * SPEED * (S.dash || S.botDash || ((S.keys.z || S.keys.Z) && S.demo && S.demo.map) ? 1.8 : 1));
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
      wake: 2, hits: [], lock: { L: 0, R: 0 }, pressFx: { L: -9, R: -9 }, stats: { parry: 0, block: 0, crushed: 0, taken: 0, perfect: 0, breaks: 0, actions: 0, taps: 0, skills: 0, strings: 0 }, slow: 1, noLose: false };
    S.mode = 'battle'; S.flash = .3; S.battle.pick = firstAlive(); S.stick = null; S.dash = null; S.path = []; touches.clear();
    Audio.noise(.3, .15); [523, 659, 784, 1047].forEach((f, i) => Audio.tone(f, .08, 'square', .05, null, i * .05));
  }
  const aliveParty = () => G.party.filter(p => p.hp > 0), aliveFoes = () => S.battle.foes.filter(f => f.hp > 0);
  function gainWake(B, n, x, y) { const was = B.wake; B.wake = Math.min(WAKE_MAX, B.wake + n); if (B.wake > was && x !== undefined) { pop(B, `+${B.wake - was} WAKE`, x, y, 'c2'); FXS.wake(); } }
  function addBreak(B, f, n) {
    if (f.hp <= 0 || f.stun > 0) return;
    f.brk = Math.min(f.brkMax, f.brk + n);
    if (f.brk >= f.brkMax) {
      // it loses its next action (both, for a boss that acts twice); its queued turns come round as STUNNED skips
      f.stun = f.boss && f.id !== 'lhand' && f.id !== 'rhand' ? 2 : 1; f.shell = false; f.burrowed = false; f.phased = false; f.intent = null;
      B.stats.breaks++; B.breakT = S.t; burst(foeX(f.i), aimY(f.i), ['c2', 'c3', 'au', 's4'], 30, 70, .7); shock(foeX(f.i), aimY(f.i), 'au', 4, 30, .35); S.fieldFlash = .08; shake(.8); S.hitstop = .12; buzz(30); gainWake(B, 1);
      FXS.breakIt();
    }
  }
  function nextTurn() {
    const B = S.battle;
    if (!aliveFoes().length) return winBattle();
    if (!aliveParty().length) { B.phase = 'lose'; B.t = 0; Audio.sfx('fail'); return; }
    B.slow = 1;
    if (B.kind === 'dojo' && S.dojo) return void dojoTurn(B);   // the tutorial picks every turn
    if (S.demo && demoTurn(B)) return;   // the playable pitch picks who acts while it is teaching
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
    if (nx.who === 'p') { if (nx.p.hp <= 0) return nextTurn(); partyAct(B, nx.p); }
    else {
      const f = nx.f;
      if (f.hp <= 0) return nextTurn();
      if (f.stun > 0) { f.stun--; if (!f.stun) f.brk = 0; pop(B, f.stun ? 'BROKEN' : 'STUNNED', foeX(f.i), aimY(f.i) - 14, 'au'); B.actor = f; B.phase = 'after'; B.t = 0; return; }
      const tr = !nx.extra && f.intent && TRICK[f.intent];
      if (tr && !tr.pat) { B.actor = f; B.phase = 'after'; B.t = 0; return; }   // shell / burrow / phase: the trick is its turn
      if (tr && f.intent === 'erupt') f.burrowed = false;
      if (nx.extra && f.burrowed) { B.actor = f; B.phase = 'after'; B.t = 0; return; }
      foeAct(B, f, tr ? tr.pat : f.pat, tr, nx.extra);
    }
  }
  function partyAct(B, p) { B.actor = p; B.phase = 'menu'; B.sub = null; B.t = 0; if (!B.foes[B.pick] || B.foes[B.pick].hp <= 0) B.pick = firstAlive(); }
  function foeAct(B, f, pat, tr, extra) {
    B.actor = f; B.phase = 'foeWind'; B.t = 0; const ps = aliveParty(); B.victim = ps[Math.floor(hash(B.round * 7 + f.i + (extra ? 3 : 0)) * ps.length)];
    const per = tr ? tr.big : [1, .65, .5, .42][pat.length - 1];
    B.aoe = !!(tr && tr.aoe); B.big = !!tr;
    B.hits = [...pat].map((k, j) => ({ kind: k, at: WIND + j * (k === 'h' ? HIT_GAP * 1.25 : HIT_GAP) * (f.id === 'wraith' || f.id === 'bat' ? .8 : 1), res: null, done: false, mult: per }));
    B.lock = { L: 0, R: 0 };
  }
  function pop(B, s, x, y, c = 'wt', big = false) { B.pops.push({ s, x, y, c, t: S.t, big }); }
  function banner(B, s) { B.banner = { s, t: S.t }; }
  // impact effects in battle-field pixels: sparks, expanding rings, counter slashes (one event fires several layers at once)
  const FX = [];
  function burst(x, y, cols, n, spd = 40, life = .45) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + hash(i * 13 + Math.floor(S.t * 60)) * .8, v = spd * (.45 + hash(i * 7 + Math.floor(S.t * 90)) * .8); FX.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * .25, t: 0, life: life * (.7 + hash(i + 3) * .6), c: cols[i % cols.length] }); } }
  function shock(x, y, c, r0, r1, life = .25) { FX.push({ k: 'r', x, y, c, r0, r1, t: 0, life }); }
  function slash(x0, y0, x1, y1, c) { FX.push({ k: 's', x0, y0, x1, y1, c, t: 0, life: .22 }); }
  function updateFX(dt) { for (const f of FX) { f.t += dt; if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 90 * dt; f.vx *= .96; } } for (let i = FX.length - 1; i >= 0; i--) if (FX[i].t >= FX[i].life) FX.splice(i, 1); }
  function drawFX() {
    for (const f of FX) { const k = f.t / f.life;
      if (f.k === 'p') { const c = k < .3 ? 'wt' : f.c; px(f.x, f.y, c); if (k < .5) px(f.x - Math.sign(f.vx), f.y - Math.sign(f.vy), f.c); }
      else if (f.k === 'r') ring(f.x, f.y, mix(f.r0, f.r1, easeOut(k)), k < .5 ? f.c : 's3');
      else if (f.k === 's') { const n = 24, e = easeOut(Math.min(1, k * 2.5)); for (let i = 0; i < n * e; i++) { const q = i / n; rect(mix(f.x0, f.x1, q), mix(f.y0, f.y1, q) + Math.sin(q * 3.1) * -6, 2, 2, k < .5 ? 'wt' : f.c); } } }
  }
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
    // the left thumb picks the stance (ATTACK or MAGIC), the right pad shows that stance's actions
    const sk = a.skills, out = [{ o: 'ITEM', b: [x, y, 41, 22] }, { o: 'RUN', b: [x + 45, y, 41, 22] }];
    if (stanceOf(a) === 'magic') { if (sk.length === 1) out.push({ o: sk[0], b: [x, y + 26, 86, 56] }); else sk.forEach((s, i) => out.push({ o: s, b: [x + i * 45, y + 26, 41, 56] })); }
    else out.push({ o: 'STRIKE', b: [x, y + 26, 86, 56] });
    return out;
  }
  const stanceOf = a => (a && a.stance) || 'attack';
  const SWAP = [LPAD[0], PAD_Y + 26, 86, 56];
  function swapStance() { const B = S.battle, a = B.actor; if (!a || B.phase !== 'menu' || B.sub) return; a.stance = stanceOf(a) === 'magic' ? 'attack' : 'magic'; S.swapT = S.t; FXS.castNote(a.stance === 'magic' ? 'L' : 'R', 1.2); ghost(SWAP[0] + 43, SWAP[1] + 28, 'L'); }
  // the left pad: one chip per foe, laid out like the field, so the left thumb aims without reaching up
  function foeChips() {
    const B = S.battle, [x, y] = LPAD, n = B.foes.length, w = n === 1 ? 86 : n === 2 ? 41 : 26;
    return B.foes.map((f, i) => ({ i, b: [x + i * (w + 4) - (n === 3 ? 1 : 0), y, w, 22] }));
  }
  function choose(cmd) {
    const B = S.battle, a = B.actor;
    if (a && SKILL[cmd] && stanceOf(a) !== 'magic') { a.stance = 'magic'; S.swapT = S.t; ghost(SWAP[0] + 43, SWAP[1] + 28, 'L'); }
    if (a && cmd === 'STRIKE' && stanceOf(a) === 'magic') { a.stance = 'attack'; S.swapT = S.t; ghost(SWAP[0] + 43, SWAP[1] + 28, 'L'); }
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
    const sk = B.cmd.kind === 'skill' && SKILL[B.cmd.name];
    if (B.cmd.kind === 'item' || (sk && sk.target === 'ally' && !sk.cast)) return resolveAction(target, 1);
    B.target = target; B.targetAlly = !!(sk && sk.target === 'ally'); B.phase = 'timing'; B.t = 0; B.hitT = null;
    // MAGIC is two-handed: a ring closes on the left pad, then one on the right; tap each as it closes
    B.ring = sk && sk.cast ? { dur: 1.05, cast: true, t1: .7, t2: 1.05, gL: null, gR: null } : { dur: .85 };
    if (B.ring.cast) B.stats.casts = (B.stats.casts || 0) + 1;
  }
  const gradeOf = q => q < .07 ? 1.45 : q < .16 ? 1.2 : 1;
  function castTap(B, hand) {   // one hand of a two-hand cast; the spell resolves when both are in (or the second ring passes)
    const r = B.ring, key = hand === 'L' ? 'gL' : 'gR'; if (r[key] !== null) return;
    if (hand === 'R' && r.gL === null && B.t < r.t1 + .16) { r.gL = 1; pop(B, 'LEFT FIRST', 45, 54, 'r2'); }   // the right hand cannot start the spell
    const e = B.t - (hand === 'L' ? r.t1 : r.t2), g = gradeOf(Math.abs(e)); r[key] = g; r[hand === 'L' ? 'eL' : 'eR'] = e; ghost(hand === 'L' ? LPAD[0] + 43 : RPAD[0] + 43, PAD_Y + 36, hand);
    pop(B, g > 1.4 ? 'PERFECT' : g > 1 ? 'GOOD' : 'OK', hand === 'L' ? 30 : 60, 54, g > 1.4 ? 'au' : g > 1 ? 'c3' : 's4');
    FXS.castNote(hand, g); if (g > 1.4) { B.stats.perfect++; buzz(12); }
    if (r.gL !== null && r.gR !== null) { B.hitT = B.t; B.grade = (r.gL + r.gR) / 2 * (r.gL > 1.4 && r.gR > 1.4 ? 1.15 : 1); if (B.grade > 1.6) { pop(B, 'TWO-HAND!', 45, 40, 'p2', true); S.hitstop = .1; shake(.4); } }
  }
  function timingTap(hand = 'R') {
    const B = S.battle;
    if (B.phase === 'timing' && B.ring.cast) return castTap(B, hand);
    if (B.phase === 'timing' && B.hitT === null) { B.hitT = B.t; ghost(RPAD[0] + 43, PAD_Y + 36, 'R'); const q = Math.abs(B.t - B.ring.dur); const grade = q < .07 ? 1.45 : q < .16 ? 1.2 : 1; B.combo = grade > 1.4 ? (B.combo || 0) + 1 : 0; pop(B, grade > 1.4 ? (B.combo > 1 ? `PERFECT x${B.combo}` : 'PERFECT!') : grade > 1 ? 'GOOD' : 'OK', 45, 54, grade > 1.4 ? 'au' : grade > 1 ? 'c3' : 's4'); if (grade > 1.4) { B.stats.perfect++; S.hitstop = .08; shake(.35); buzz(20); } Audio.tone(grade > 1.5 ? 1320 : 990, .06, 'square', .06); B.grade = grade; }
  }
  // a thumb pressed during their attack: L blocks, R parries. Judged against the next hit that has not landed yet.
  function defend(hand) {
    const B = S.battle; if (B.phase !== 'foeWind') return;
    const h = B.hits.find(q => !q.done && q.res === null); if (!h) return;
    B.pressFx[hand] = S.t; ghost(hand === 'L' ? LPAD[0] + 43 : RPAD[0] + 43, PAD_Y + 36, hand);
    if (B.lock[hand] > B.t) return;
    const d = B.t - h.at, win = hand === 'L' ? BLOCK_WIN + (G.gear.mirror ? .07 : 0) : h.kind === 'h' ? BLOCK_WIN : PARRY_WIN + (G.gear.mirror ? .03 : 0);
    if (Math.abs(d) <= win) {
      h.err = d;
      h.res = hand === 'L' ? 'block' : h.kind === 'h' ? 'crushed' : 'parry';
      if (h.res === 'parry') { pop(B, 'PARRY!', 66, 58, 'c2', true); S.fieldFlash = .07; FXS.parry(); S.hitstop = .09; buzz(20); }
      else if (h.res === 'block') { pop(B, 'BLOCK', 66, 58, 'c3', true); FXS.block(); S.hitstop = .05; buzz(15); }
      else { pop(B, 'CRUSHED!', 66, 58, 'r2', true); FXS.crushed(); }
    } else if (d < -win) { B.lock[hand] = h.at + .06; h.locked = true; h.err = d; pop(B, 'EARLY', hand === 'L' ? 20 : 70, 90, 's3'); Audio.tone(200, .05, 'square', .03); }
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
      f.hp = Math.max(0, f.hp - d); lessonFloor(f);
      pop(B, String(d), foeX(f.i), aimY(f.i) - 6, f.stun > 0 ? 'au' : 'wt', grade > 1.4 || f.stun > 0);
      burst(foeX(f.i), aimY(f.i), grade > 1.4 ? ['au', 'wt', 'n6'] : ['wt', 's4'], grade > 1.4 ? 16 : 8, grade > 1.4 ? 55 : 35); if (grade > 1.4) shock(foeX(f.i), aimY(f.i), 'au', 4, 18);
      if (brk) addBreak(B, f, brk);
      return d; };
    if (grade > 1.4) gainWake(B, 1, 45, 44);
    if (c.kind === 'fight') { const f = B.foes[target]; dmg((a.atk + (a.id === 'hero' && G.gear.sun ? 4 : 0)) * 1.4, f, a.id === 'archer' ? 'pierce' : 'phys'); FXS.strike(grade); }
    else if (c.kind === 'skill') {
      const sk = SKILL[c.name]; B.wake -= sk.w; B.stats.skills++;
      if (c.name === 'SHARD STRIKE') { const f = B.foes[target]; dmg((a.atk + (G.gear.sun ? 4 : 0)) * (1.3 + G.shards * .4), f, 'shard'); Audio.tone(1800, .3, 'square', .06, 400); B.fx = { kind: 'shard', t: S.t, i: target }; }
      else if (c.name === 'FIREBALL') { const f = B.foes[target]; dmg(a.mag * 2.2, f, 'fire'); FXS.fire(grade); B.fx = { kind: 'fire', t: S.t, i: target }; burst(foeX(target), aimY(target), ['n6', 'n7', 'r2'], 22, 50, .6); }
      else if (c.name === 'VOLLEY') { for (const f of aliveFoes()) dmg(a.atk * 1.0, f, 'pierce'); Audio.tone(2400, .2, 'square', .04, 900); B.fx = { kind: 'volley', t: S.t }; }
      else if (c.name === 'GUARD') { B.guard = 2; pop(B, 'GUARD UP', 66, 50, 'c3'); Audio.tone(440, .2, 'triangle', .07); }
      else if (c.name === 'HEAL') { const p = G.party[target], hp = Math.round(24 * grade); p.hp = Math.min(p.maxhp, p.hp + hp); pop(B, '+' + hp, memberX(target) + 4, memberY(target), 'g4', grade > 1.4); burst(memberX(target) + 5, memberY(target) + 7, ['g4', 'g3', 'wt'], 12, 30, .6); FXS.heal(); }
    } else if (c.kind === 'item') {
      G.items[c.name]--; B.stats.items = (B.stats.items || 0) + 1;
      FXS.potion();
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
      const vi = G.party.indexOf(v), vx = memberX(vi) + 5, vy = memberY(vi) + 7;
      if (h.res === 'parry') { burst(vx - 3, vy, ['c2', 'c3', 'wt'], 14, 55); shock(vx, vy, 'c3', 3, 14); }
      else if (h.res === 'block') { shock(vx, vy, 'b2', 9, 13, .2); burst(vx - 6, vy, ['s4', 'b2'], 7, 30, .3); }
      else burst(vx, vy, ['r2', 'n6', 'r1'], 12, 45);
      if (h.res !== 'parry') { d = Math.max(1, d); v.hp = Math.max(0, v.hp - d); if (B.noLose) v.hp = Math.max(1, v.hp); B.stats.taken += d; v.hurtT = S.t; pop(B, String(d), vx - 1, vy - 9, h.res === 'block' ? 'c3' : 'r2'); }
    }
    if (h.res) B.stats[h.res]++;
    dojoHit(B, h);
    f.lungeT = S.t;
    if (h.res === 'parry') {   // the counter: a free riposte, a wake pip and a notch of break
      const cd = Math.max(1, Math.round(counter * (B.aoe ? .5 : 1)));
      if (!f.burrowed && !f.phased) { f.hp = Math.max(0, f.hp - cd); lessonFloor(f); f.hurtT = S.t; pop(B, String(cd), foeX(f.i), aimY(f.i) - 6, 'c2'); const v0 = B.aoe ? aliveParty()[0] : B.victim, vi = G.party.indexOf(v0); slash(memberX(vi) + 2, memberY(vi) + 6, foeX(f.i) + 4, aimY(f.i), 'c2'); burst(foeX(f.i), aimY(f.i), ['c3', 'wt'], 8, 35); }
      if (f.hp <= 0) for (const q of B.hits) q.done = true;   // a dead attacker's string ends here
      gainWake(B, 1, 66, 52); addBreak(B, f, 1);
      Audio.noise(.06, .12); shake(.3);
    } else { if (h.res !== 'block') FXS.hurt(B.big || h.kind === 'h'); S.flash = h.res === 'block' ? 0 : .06; shake(h.res === 'block' ? .25 : B.big ? .8 : .45); if (B.big && h.res !== 'block') { S.hitstop = .1; buzz(40); } }
  }
  function winBattle() {
    const B = S.battle; B.phase = 'win'; B.t = 0;
    const xp = B.foes.reduce((s, f) => s + f.xp, 0); B.lvups = [];
    for (const p of G.party) { if (p.hp <= 0) p.hp = 1; p.xp += xp; while (p.xp >= p.lv * 20) { p.xp -= p.lv * 20; p.lv++; p.maxhp += 8; p.maxmp += 3; p.atk += 2; p.mag += 2; p.def += 1; p.hp = p.maxhp; p.mp = p.maxmp; B.lvups.push(p.name); } }
    Audio.sfx('win');
  }
  function endBattle() {
    const B = S.battle;
    if (S.demo && (B.kind === 'demo1' || B.kind === 'demo2')) { S.battle = null; demoAfterBattle(B); S.lockUntil = S.t + .6; return; } S.battle = null; S.mode = 'map'; S.lockUntil = S.t + .4; API.lastBattle = B.stats;
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
    else startCalm();
  }
  function ending(which) {
    G.endings[which] = true; saveEndings();
    if (S.demo) { S.demo.ending = which; S.mode = 'card'; S.card = { t: 0 }; API.autopilot = null; Audio.sfx('win'); return; }
    S.mode = 'ending'; S.ending = { which, t: 0 };
    Audio.sfx('win');
  }

  // ---------- sound ----------
  // One tune, one bar grid, layered stems faded by game state (vertical, never cut: turns do not land on the bar grid,
  // Brain sandbox horizontal-vs-vertical). A minor, i-VI-III-VII, 128 bpm, square/triangle chiptune with the fifth
  // dropped from the arpeggio (the root's 3rd harmonic already sounds it). Hits get a countdown of ticks on the audio
  // clock: heavy low and left, swift high and right, the last tick exactly on the impact, so the timing can be heard.
  const SND = { on: true, bus: null, music: null, stems: {}, noiseBuf: null, next: 0, step: 0, timer: null, want: {} };
  try { SND.on = localStorage.getItem('stonewake-sound') !== 'off'; } catch (_) {}
  Audio.muted = !SND.on;
  const BPM = 128, S16 = 60 / BPM / 4;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G (roots in octave 3)
  // the Stonewake motif, 4 bars of 16ths: [step, midi, length in 16ths]
  const MOTIF = [[0, 69, 4], [4, 72, 2], [6, 76, 2], [8, 74, 4], [12, 72, 2], [14, 71, 2], [16, 69, 6], [22, 64, 2], [24, 65, 4], [28, 67, 4],
    [32, 72, 4], [36, 76, 2], [38, 79, 2], [40, 77, 4], [44, 76, 2], [46, 74, 2], [48, 71, 6], [54, 67, 2], [56, 69, 8]];
  function sndInit() {
    const c = Audio.ctx; if (!c || SND.bus) return !!SND.bus;
    try {
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
      SND.bus = c.createGain(); SND.bus.gain.value = SND.on ? .9 : 0; SND.bus.connect(comp);
      SND.music = c.createGain(); SND.music.gain.value = .55; SND.music.connect(SND.bus);
      for (const k of ['bass', 'arp', 'drums', 'lead', 'danger']) { const g = c.createGain(); g.gain.value = 0; g.connect(SND.music); SND.stems[k] = g; }
      const n = c.sampleRate * 1, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); let r = 7; for (let i = 0; i < n; i++) { r = (r * 1103515245 + 12345) >>> 0; d[i] = (r / 4294967296) * 2 - 1; } SND.noiseBuf = buf;
      SND.next = c.currentTime + .1; SND.timer = setInterval(schedule, 25);
      return true;
    } catch (_) { return false; }
  }
  function voice(dest, type, f, t0, dur, g, slideTo, pan) {
    const c = Audio.ctx, o = c.createOscillator(), a = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(g, t0 + .004); a.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    let out = a; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; a.connect(p); out = p; }
    o.connect(a); out.connect(dest); o.start(t0); o.stop(t0 + dur + .02);
  }
  function hiss(dest, t0, dur, g, freq, q = 1, type = 'highpass', pan) {
    const c = Audio.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), a = c.createGain(); s.buffer = SND.noiseBuf;
    f.type = type; f.frequency.value = freq; f.Q.value = q; a.gain.setValueAtTime(g, t0); a.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    let out = a; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; a.connect(p); out = p; }
    s.connect(f).connect(a); out.connect(dest); s.start(t0, Math.random() * .5); s.stop(t0 + dur + .02);
  }
  function schedule() {   // lookahead scheduler on the audio clock
    const c = Audio.ctx; if (!c || !SND.bus) return;
    try {
      mixTo(musicState());
      while (SND.next < c.currentTime + .12) {
        const t = SND.next, st = SND.step, bar = Math.floor(st / 16), s16 = st % 16, ch = PROG[bar % 4], fin = SND.want.fast;
        if (s16 % 2 === 0) voice(SND.stems.bass, 'triangle', mtof(ch[0] - 12), t, S16 * 1.8, .5);
        if (s16 % 8 === 6) voice(SND.stems.bass, 'triangle', mtof(ch[0]), t, S16 * .9, .3);
        const arpN = [ch[0], ch[1], ch[0] + 12, ch[1] + 12][s16 % 4]; voice(SND.stems.arp, 'square', mtof(arpN + 12), t, S16 * .7, .07);
        if (s16 % 8 === 0 || (fin && s16 % 8 === 4 && s16 !== 4)) voice(SND.stems.drums, 'sine', 130, t, .18, .7, 42);
        if (s16 % 8 === 4) hiss(SND.stems.drums, t, .14, .32, 1800, .7, 'bandpass');
        hiss(SND.stems.drums, t, s16 % 4 === 2 ? .06 : .025, s16 % 4 === 2 ? .13 : .07, 7000);
        if (s16 % 4 === 0) voice(SND.stems.danger, 'sawtooth', mtof(45), t, S16 * 3.6, .16);
        if (s16 % 8 === 0) voice(SND.stems.danger, 'square', mtof(57 + (bar % 2 ? 1 : 0)), t, S16 * 2, .05);   // a semitone rub: menace
        const ms = st % 64; for (const [at, m, len] of MOTIF) if (at === ms) { voice(SND.stems.lead, 'square', mtof(m), t, S16 * len * .95, .12); voice(SND.stems.lead, 'triangle', mtof(m - 12), t, S16 * len * .9, .1); }
        SND.next += S16; SND.step++;
      }
    } catch (_) {}
  }
  function musicState() {   // stem levels for what is on screen now
    const m = S.mode, B = S.battle, fin = S.demo && S.demo.finale;
    let w = { bass: 0, arp: 0, drums: 0, lead: 0, danger: 0, fast: false };
    if (m === 'title') w = { bass: .5, arp: .35, drums: 0, lead: .9, danger: 0 };
    else if (m === 'map' || m === 'cut') w = { bass: .6, arp: .5, drums: 0, lead: .5, danger: 0 };
    else if (m === 'inter') w = { bass: .3, arp: 0, drums: 0, lead: 0, danger: 1 };
    else if (m === 'card' || m === 'ending') w = { bass: .6, arp: .6, drums: .25, lead: 1, danger: 0 };
    else if (m === 'battle' && B) {
      const theirs = B.phase === 'foeWind';
      w = { bass: 1, arp: theirs ? .35 : .8, drums: theirs ? 1 : .55, lead: theirs ? .15 : .55, danger: theirs ? .9 : 0, fast: fin };
      if (fin) { w.drums = Math.max(w.drums, .8); w.lead = theirs ? .25 : .8; }
      if (B.phase === 'win') w = { bass: .6, arp: .8, drums: .3, lead: 1, danger: 0 };
      if (B.phase === 'lose') w = { bass: .2, arp: 0, drums: 0, lead: 0, danger: .6 };
    }
    return w;
  }
  function mixTo(w) {
    SND.want = w; const c = Audio.ctx;
    for (const k in SND.stems) { const v = w[k] || 0, g = SND.stems[k].gain; if (Math.abs(g.value - v) > .001 || g._to !== v) { g.setTargetAtTime(v, c.currentTime, .09); g._to = v; } }   // ~0.25 s glide
  }
  // effects (all on the same bus as the music, so the compressor keeps them together)
  const FXS = {
    ok() { return SND.on && sndInit(); },
    tick(heavy, last, at) { if (!this.ok()) return; const t = Audio.ctx.currentTime + Math.max(0, at || 0), pan = heavy ? -.55 : .55;
      if (heavy) { voice(SND.bus, 'square', last ? 196 : 98, t, last ? .12 : .07, last ? .2 : .12, null, pan); if (last) voice(SND.bus, 'sine', 90, t, .2, .4, 45, pan); }
      else { voice(SND.bus, 'square', last ? 1760 : 1175, t, last ? .07 : .04, last ? .11 : .07, null, pan); } },
    parry() { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'triangle', 1400, t, .25, .25, 3200, .4); voice(SND.bus, 'triangle', 1413, t, .25, .2, 3300, .4); hiss(SND.bus, t, .18, .3, 5000, 1, 'highpass', .4); voice(SND.bus, 'square', 2637, t + .05, .18, .08); },
    block() { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'square', 523, t, .09, .18, 300, -.4); voice(SND.bus, 'square', 784, t, .12, .1, 500, -.4); hiss(SND.bus, t, .1, .35, 2500, 4, 'bandpass', -.4); },
    crushed() { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'sawtooth', 110, t, .35, .35, 40); hiss(SND.bus, t, .3, .5, 400, 1, 'lowpass'); },
    hurt(big) { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'sine', big ? 120 : 160, t, .2, .45, 50); hiss(SND.bus, t, .12, big ? .45 : .3, 900, 1, 'lowpass'); },
    strike(grade) { if (!this.ok()) return; const t = Audio.ctx.currentTime; hiss(SND.bus, t, .08, .35, 3000, 1, 'bandpass'); voice(SND.bus, 'square', grade > 1.4 ? 880 : 440, t, .08, .1, grade > 1.4 ? 1760 : 220);
      if (grade > 1.4) [69, 72, 76, 81].forEach((m, i) => voice(SND.bus, 'square', mtof(m + 12), t + .03 + i * .035, .12, .07)); },
    breakIt() { if (!this.ok()) return; const t = Audio.ctx.currentTime; for (let i = 0; i < 7; i++) { hiss(SND.bus, t + i * .045, .12, .35, 3000 + i * 900, 3, 'bandpass', (i % 2 ? .5 : -.5)); voice(SND.bus, 'triangle', mtof(96 - i * 3), t + i * .045, .14, .1); } voice(SND.bus, 'sine', 70, t, .5, .5, 35); },
    wake() { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'sine', 1320, t, .12, .1, 1980); },
    lesson() { if (!this.ok()) return; const t = Audio.ctx.currentTime; [76, 79, 84].forEach((m, i) => voice(SND.bus, 'square', mtof(m), t + i * .07, .14, .09)); },
    castNote(hand, g) { if (!this.ok()) return; const t = Audio.ctx.currentTime, m = hand === 'L' ? 69 : 76; voice(SND.bus, 'triangle', mtof(m + 12), t, .3, .2, null, hand === 'L' ? -.5 : .5); if (g > 1.4) voice(SND.bus, 'square', mtof(m + 24), t + .03, .2, .07, null, hand === 'L' ? -.5 : .5); },
    fire(g) { if (!this.ok()) return; const t = Audio.ctx.currentTime; hiss(SND.bus, t, .5, .5, 700, 1, 'lowpass'); voice(SND.bus, 'sawtooth', 220, t, .45, .2, 60); if (g > 1.6) voice(SND.bus, 'square', mtof(81), t, .3, .08, mtof(93)); },
    heal() { if (!this.ok()) return; const t = Audio.ctx.currentTime; [72, 76, 79, 84].forEach((m, i) => voice(SND.bus, 'triangle', mtof(m), t + i * .06, .3, .1)); },
    potion() { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'sine', 300, t, .12, .2, 900); voice(SND.bus, 'sine', 600, t + .1, .15, .15, 1200); },
    tap() { if (!this.ok()) return; voice(SND.bus, 'square', 990, Audio.ctx.currentTime, .03, .05); },
    rumble() { if (!this.ok()) return; const t = Audio.ctx.currentTime; voice(SND.bus, 'sawtooth', 55, t, 2.4, .35, 35); hiss(SND.bus, t, 2.4, .4, 300, 1, 'lowpass'); },
  };
  function setSound(on) { SND.on = on; try { localStorage.setItem('stonewake-sound', on ? 'on' : 'off'); } catch (_) {} if (SND.bus) SND.bus.gain.setTargetAtTime(on ? .9 : 0, Audio.ctx.currentTime, .05); Audio.muted = !on; if (on) { Audio.unlock(); sndInit(); } }
  const SPK = [156, 0, 24, 22];   // the sound toggle: a rarely used control, so it lives in the top corner
  function drawSpeaker() { const [x, y] = SPK; rect(x + 8, y + 7, 3, 6, 'wt'); rect(x + 11, y + 5, 2, 10, 'wt'); if (SND.on) { px(x + 15, y + 8, 'wt'); px(x + 15, y + 11, 'wt'); px(x + 16, y + 9, 'wt'); px(x + 16, y + 10, 'wt'); px(x + 18, y + 6, 's4'); px(x + 18, y + 13, 's4'); rect(x + 19, y + 7, 1, 6, 's4'); } else { for (let i = 0; i < 5; i++) { px(x + 15 + i, y + 7 + i, 'r2'); px(x + 19 - i, y + 7 + i, 'r2'); } } }
  // hit countdown: three ticks a fixed game time apart, the last on the impact; each scheduled on the audio clock when it is
  // under 60 ms of game time away, so hit-stop and slow motion cannot push it off the hit
  const TICKS = [-.5, -.25, 0];
  function cueHits(B) {
    if (B.phase !== 'foeWind' || !SND.on) return;
    B.hits.forEach((h, j) => { const tk = j ? [-.2, 0] : TICKS; h.cued = h.cued || 0; while (h.cued < tk.length && B.t >= h.at + tk[h.cued] - .06) { const ahead = (h.at + tk[h.cued] - B.t) / (B.slow || 1); FXS.tick(h.kind === 'h', h.cued === tk.length - 1, ahead); h.cued++; } });   // later hits in a string get a short count, so ticks never overlap
  }

  // ---------- the dojo: a tutorial on attacking, parrying and spell casting ----------
  // Each chapter SHOWS the move (an animated card: the ring, the pad, a ghost thumb tapping on the beat), then you
  // PRACTISE it against a training hand that never dies, and every try gets a TIMING METER: where you tapped against the
  // window, with EARLY / LATE in milliseconds. A chapter passes after enough good tries; the parry slows down after two
  // misses in a row. It runs on the real battle code, so what you learn here is exactly what the fight checks.
  const DOJO = [
    { id: 'attack', title: 'ATTACK', actor: 'hero', need: 3, hand: 'R', c: 'au',
      lines: ['TAP STRIKE.', 'A RING CLOSES ON', 'THE FOE: TAP WHEN', 'THE RINGS MEET.', 'PERFECT = MORE DAMAGE'] },
    { id: 'parry', title: 'PARRY', need: 3, hand: 'R', c: 'c2',
      lines: ['BLUE HIT = SWIFT.', 'TAP THE RIGHT PAD', 'AS ITS RING CLOSES.', 'NO DAMAGE + COUNTER.', 'EARLY = THUMB LOCKED.'] },
    { id: 'cast', title: 'CAST', actor: 'mage', need: 2, hand: 'B', c: 'p2',
      lines: ['TAP LEFT: MAGIC.', 'TAP FIREBALL, THEN', 'LEFT RING, THEN RIGHT', 'BOTH PERFECT = THE', 'STRONGEST HIT.'] },
  ];
  function startDojo(after = 'pitch') {
    if (!G.gear || !G.items) { newGame(); S.cut = null; S.dialog = null; }   // a fresh load has only G.endings
    S.dojo = { after, ch: 0, phase: 'explain', t: 0, reps: 0, fails: 0, streak: 0, fb: null };
    G.party = [newMember('hero'), newMember('knight'), newMember('mage')]; API.setLevel(3); G.shards = 1; G.region = 'forest';
    startBattle(['thand'], 'dojo'); S.battle.noLose = true; S.battle.foes[0].name = 'TRAINING HAND';
  }
  const dojoCh = () => S.dojo && DOJO[S.dojo.ch];
  function dojoTurn(B) {   // the chapter decides every turn
    const d = S.dojo, C = dojoCh(), f = B.foes[0]; f.hp = f.maxhp; f.brk = 0; f.stun = 0; f.intent = null;
    for (const p of G.party) p.hp = p.maxhp;
    if (!C) return true;
    if (C.id === 'attack') { B.wake = Math.max(B.wake, 2); partyAct(B, G.party[0]); }
    else if (C.id === 'parry') { foeAct(B, f, 's', null, false); B.victim = G.party[0]; B.slow = d.reps === 0 || d.streak >= 2 ? .5 : .8; }
    else { B.wake = WAKE_MAX; partyAct(B, G.party[2]); }
    return true;
  }
  function dojoTry(ok, fb) {   // one attempt judged: feedback, count, maybe the chapter is done
    const d = S.dojo; if (!d || d.phase !== 'practice') return;
    d.fb = { ...fb, ok, t: S.t };
    if (ok) { d.reps++; d.streak = 0; } else { d.fails++; d.streak++; }
    if (d.reps >= dojoCh().need) { d.phase = 'clear'; d.t = 0; FXS.lesson(); }
  }
  // hooks the battle code calls
  function dojoStrike(B) { if (!S.dojo || B.kind !== 'dojo') return; const C = dojoCh(); if (!C) return;
    if (C.id === 'attack') { const err = B.hitT === null ? null : B.hitT - B.ring.dur; dojoTry(B.grade >= 1.2 && B.hitT !== null, { kind: 'strike', err, grade: B.hitT === null ? 0 : B.grade, win: [.07, .16] }); }
    else if (C.id === 'cast') {
      if (!B.ring.cast) return dojoTry(false, { kind: 'msg', msg: 'TAP LEFT FOR MAGIC' });
      const r = B.ring; dojoTry((r.gL || 0) >= 1.2 && (r.gR || 0) >= 1.2, { kind: 'cast', eL: r.eL ?? null, eR: r.eR ?? null, gL: r.gL, gR: r.gR, win: [.07, .16] });
    } }
  function dojoHit(B, h) { if (!S.dojo || B.kind !== 'dojo' || dojoCh().id !== 'parry') return;
    dojoTry(h.res === 'parry', { kind: 'parry', err: h.err ?? null, res: h.res, locked: !!h.locked, win: [PARRY_WIN, PARRY_WIN] }); }
  function dojoNext() {   // explain -> practice -> clear -> next chapter ... -> into the fight
    const d = S.dojo;
    if (d.phase === 'explain') { d.phase = 'practice'; d.t = 0; d.fb = null; S.battle.phase = 'after'; S.battle.t = .4; return; }
    if (d.phase === 'clear') { d.ch++; d.reps = 0; d.fails = 0; d.streak = 0; d.fb = null; d.t = 0; d.phase = d.ch < DOJO.length ? 'explain' : 'done'; S.battle.phase = 'after'; S.battle.t = 0; return; }
    if (d.phase === 'done') leaveDojo();
  }
  function dojoUpdate(dt) {   // true while the battle should hold still (a card is up)
    const d = S.dojo; if (!d) return false; d.t += dt;
    if (d.phase === 'clear' && d.t > 1.3) dojoNext();
    else if (d.phase !== 'practice' && S.demo && S.demo.watch && d.t > (d.phase === 'explain' ? 3.2 : 2)) dojoNext();
    return d.phase !== 'practice';
  }
  function dojoTotals() { const B = S.battle; if (S.demo && B && B.kind === 'dojo') for (const k in S.demo.tot) S.demo.tot[k] += B.stats[k] || 0; }   // the card counts the dojo too
  function leaveDojo() { const after = S.dojo.after; S.dojo = null; if (after === 'pitch') { dojoTotals(); return startDemoMap(); } markTrained(); S.battle = null; if (after === 'game') newGame(); else { S.mode = 'title'; S.idleT = S.t; } S.lockUntil = S.t + .4; }
  function skipDojo() { leaveDojo(); }
  const DOJO_BTNS = { skip: [LPAD[0], PAD_Y + 50, 86, 30], go: [RPAD[0], PAD_Y + 50, 86, 30] };
  function meter(x0, y, w, err, win, c) {   // a timing bar: centre = the beat; gold = perfect window, light = good
    const sc = w / .6, cx0 = x0 + w / 2; rect(x0, y, w, 7, 'k'); rect(cx0 - win[1] * sc, y + 1, win[1] * 2 * sc, 5, 's2'); rect(cx0 - win[0] * sc, y + 1, win[0] * 2 * sc, 5, 'au');
    rect(cx0, y - 2, 1, 11, 'wt'); text('EARLY', x0, y + 9, 's3', 'left', null); text('LATE', x0 + w, y + 9, 's3', 'right', null);
    if (err !== null && err !== undefined) { const mx = clamp(cx0 + err * sc, x0 + 1, x0 + w - 2); rect(mx - 1, y - 3, 3, 13, c); }
  }
  function verdict(err, g, short) { if (err === null || err === undefined) return ['NO TAP', 'r2']; if (g > 1.4) return [short ? 'PERFECT' : 'PERFECT!', 'au']; const ms = Math.round(Math.abs(err) * 1000); return [(err < 0 ? 'EARLY ' : 'LATE ') + ms + (short ? '' : 'MS'), g > 1 ? 'c3' : 'r2']; }
  function drawDojo(t) {
    const d = S.dojo, C = dojoCh(), B = S.battle; if (!d) return;
    // chapter strip
    rect(0, 13, 152, 13, 'k');   // one row down: the disc's back button owns the top-left corner
    DOJO.forEach((q, i) => { const x = [4, 60, 108][i], done = i < d.ch || (i === d.ch && d.phase === 'clear'); text(q.title, x, 16, done ? 'g4' : i === d.ch ? q.c : 's2', 'left', null); if (done) rect(x, 24, q.title.length * 8 - 1, 1, 'g4'); });
    if (d.phase === 'done') { panel(6, 60, 168, 92, 'g3'); text('DOJO', 90, 66, 's4', 'center', null); text('CLEARED!', 90, 76, 'g4', 'center', 'k', 16); ['YOU CAN ATTACK,', 'PARRY AND CAST.', '', d.after === 'pitch' ? 'NOW A REAL FIGHT.' : d.after === 'game' ? 'NOW, THE MOUNTAIN.' : 'BACK TO THE TITLE.'].forEach((l, i) => text(l, 90, 94 + i * 11, i === 3 ? 'au' : 'wt', 'center', null)); button(DOJO_BTNS.go, d.after === 'pitch' ? 'FIGHT' : 'GO', true, 'r1'); return; }
    if (!C) return;
    if (d.phase === 'explain') {   // the card: words on top, the move animated on the real pads below
      rect(0, 26, W, 210, 'n0'); for (let i = 0; i < 30; i++) px(hash(i) * W, 26 + hash(i + 9) * 200, 'n1');
      text(C.title, 90, 32, C.c, 'center', 'k', 16);
      C.lines.forEach((l, i) => text(l, 90, 54 + i * 11, i >= 3 ? 's4' : 'wt', 'center', null));
      const loop = 2.2, k = (t % loop) / 1.6, beat = k >= 1 && k < 1.12, bx = 90, by = 150;
      if (C.id === 'attack') { const r = Math.round(mix(26, 7, clamp(k))); ring(bx, by, 7, 'au'); if (k < 1) ring(bx, by, r, 'wt'); if (beat) { burst(bx, by, ['au', 'wt'], 2, 30); text('PERFECT!', bx, by - 30, 'au', 'center'); } }
      if (C.id === 'parry') { const r = Math.round(mix(26, 9, clamp(k))); swordIcon(bx, by - 16, Math.floor(t * 8) % 2 ? 'c2' : 'wt'); ring(bx, by, 9, 'au'); if (k < 1) ring(bx, by, r, 'c2'); if (beat) text('PARRY!', bx, by - 34, 'c2', 'center'); }
      if (C.id === 'cast') { const k1 = clamp(k / .67), k2 = clamp(k); ring(60, by, 8, 'p2'); ring(120, by, 8, 'p2'); if (k1 < 1) ring(60, by, Math.round(mix(24, 8, k1)), 'wt'); if (k2 < 1) ring(120, by, Math.round(mix(24, 8, k2)), 'wt'); text('1', 60, by - 4, 'wt', 'center'); text('2', 120, by - 4, 'wt', 'center'); if (beat) text('TWO-HAND!', 90, by - 34, 'p2', 'center'); }
      text('YOUR PADS BELOW', 90, 196, 's3', 'center', null); text('WORK THE SAME WAY', 90, 206, 's3', 'center', null);
      // the pads, with a ghost thumb on the beat
      rect(0, 196 + 40, W, 84, 'k');
      for (const [h, P0] of [['L', LPAD], ['R', RPAD]]) { const used = C.hand === 'B' || C.hand === h; panel(P0[0], P0[1], P0[2], 46, used ? (h === 'L' ? 'au' : C.c) : 's1'); text(h === 'L' ? 'LEFT' : 'RIGHT', P0[0] + 43, P0[1] + 6, used ? 'wt' : 's2', 'center', null); }
      const tapL = C.id === 'cast' && k >= .67 && k < .8, tapR = (C.id !== 'cast' && beat) || (C.id === 'cast' && beat);
      if (tapL) { disc(LPAD[0] + 43, PAD_Y + 28, 8, 'au'); ring(LPAD[0] + 43, PAD_Y + 28, 12, 'wt'); }
      if (tapR) { disc(RPAD[0] + 43, PAD_Y + 28, 8, 'c2'); ring(RPAD[0] + 43, PAD_Y + 28, 12, 'wt'); }
      button(DOJO_BTNS.skip, d.ch === 0 ? 'SKIP DOJO' : 'SKIP', false); button(DOJO_BTNS.go, 'TRY IT', true, 'r1');
      return;
    }
    // practice: what to do, the reps, and the last try on a meter
    rect(0, 28, W, 12, 'k'); const need = C.need;
    text(C.id === 'attack' ? 'STRIKE ON THE RING' : C.id === 'parry' ? 'PARRY THE BLUE HIT' : 'LEFT: MAGIC, FIREBALL', 4, 30, C.c, 'left', null);
    for (let i = 0; i < need; i++) { const x = 176 - (need - i) * 9; rect(x, 30, 7, 7, 'k'); rect(x + 1, 31, 5, 5, i < d.reps ? 'g4' : 's1'); }
    if (B && B.slow < 1 && C.id === 'parry') text('SLOW MOTION', 90, 42, 's3', 'center', null);
    const fb = d.fb; if (fb && S.t - fb.t < 2.2) {
      const y = 140; rect(0, y - 4, W, 40, 'k');
      if (fb.kind === 'msg') text(fb.msg, 90, y + 8, 'r2', 'center');
      else if (fb.kind === 'cast') { const [v1, c1] = verdict(fb.eL, fb.gL, true), [v2, c2] = verdict(fb.eR, fb.gR, true); text(v1, 46, y, c1, 'center', null); text(v2, 134, y, c2, 'center', null); meter(8, y + 14, 76, fb.eL, fb.win, 'au'); meter(96, y + 14, 76, fb.eR, fb.win, 'c2'); }
      else { const [v, c] = fb.kind === 'parry' && fb.res === 'block' ? ['BLOCKED: USE RIGHT', 'n6'] : fb.kind === 'parry' && fb.locked ? ['TOO EARLY: LOCKED', 'r2'] : verdict(fb.err, fb.kind === 'parry' ? (fb.res === 'parry' ? 1.45 : 1) : fb.grade); text(v, 90, y, fb.ok ? (c === 'r2' ? 'c3' : c) : c, 'center'); meter(30, y + 14, 120, fb.err, fb.win, fb.kind === 'parry' ? 'c2' : 'au'); }
    }
    if (B && B.phase === 'menu' && Math.floor(t * 3) % 2) { const want = C.id === 'cast' ? 'FIREBALL' : 'STRIKE', bb = (rightButtons().find(q => q.o === want) || { b: SWAP }).b, x = bb[0] + bb[2] / 2, y = bb[1] - 6; for (let i = 0; i < 4; i++) rect(x - 4 + i, y + i, 9 - i * 2, 1, 'au'); }
    if (d.phase === 'clear') { rect(0, 80, W, 34, 'k'); text(C.title, 90, 83, C.c, 'center', null); text('LEARNED!', 90, 94, 'g4', 'center', 'k', 16); }
  }

  // ---------- the pitch's walk: two thumbs on the map ----------
  // Between the dojo and the fight: steer with the floating stick, hold DASH with the other thumb, open a chest, then
  // walk into the golem. Each step is pinned to a real map event (steps taken, steps taken while dashing, the chest's
  // found flag), not to a timer.
  const MAP_LESSONS = [
    { id: 'move', hand: 'L', l1: 'WALK THE PATH', c1: 'au', verb: 'MOVE', sub: 'SLIDE ON LOWER LEFT', keys: 'ARROW KEYS', ok: m => m.steps >= 4 },
    { id: 'dash', hand: 'R', l1: 'BOTH THUMBS AT ONCE', c1: 'c2', verb: 'HOLD DASH', sub: 'STEER WITH THE LEFT', keys: 'HOLD Z + ARROWS', ok: m => m.dashSteps >= 5 },
    { id: 'chest', l1: 'A CHEST, FAR LEFT', c1: 'au', verb: 'OPEN IT', sub: 'WALK INTO IT', target: [1, 8], ok: () => !!G.found['forest:1,8'] },
    { id: 'golem', l1: 'IT GUARDS THE SHARD', c1: 'r2', verb: 'FIGHT IT', sub: 'WALK INTO THE GOLEM', target: [7, 2], ok: () => false },
  ];
  function startDemoMap() {
    G.party = [newMember('hero'), newMember('knight'), newMember('mage')]; API.setLevel(3); G.shards = 0; G.found = {}; G.cleared = {}; G.items = { POTION: 3, ETHER: 1 };
    enterRegion('forest'); API.finish(); for (const f of S.foes) f.alive = false;
    S.demo.map = { i: 0, steps: 0, dashSteps: 0, shown: S.t, bot: 0 }; S.lockUntil = S.t + .4;
  }
  const mapLesson = () => S.demo && S.demo.map && MAP_LESSONS[S.demo.map.i];
  function mapStepped() { const m = S.demo && S.demo.map; if (!m) return; m.steps++; if (S.dash || S.keys.z || S.keys.Z || S.botDash) m.dashSteps++; }
  function updateMapLesson(dt) {
    const m = S.demo && S.demo.map; if (!m) return; const L = MAP_LESSONS[m.i];
    if (L && L.ok(m)) { m.i++; m.shown = S.t; FXS.lesson(); }
    if (!S.demo.watch) return;
    // WATCH: the autopilot walks it (path-following), shows a ghost thumb on the stick and one on DASH
    if (S.dialog) { if (S.t - S.dialog.t > 1.2) advanceDialog(); return; }
    const N = MAP_LESSONS[m.i]; S.botDash = !!N && N.id !== 'move';
    if (S.t - m.bot > .35) { m.bot = S.t; ghost(40, 282, 'L'); if (S.botDash) ghost(ACT[0], ACT[1], 'R'); }
    if (!S.path.length && S.hero.k >= 1 && N) S.path = bfs(...(N.target || [1, 8]));
  }
  function drawMapLesson(t) {
    const L = mapLesson(); if (!L || S.dialog) return;
    const d = S.demo.map, k = Math.min(1, (S.t - d.shown) * 4), keys = S.scheme === 'keys';
    rect(0, 0, W, 47, 'k'); rect(0, 46, W * k, 1, L.c1);
    text(L.l1, 90, 3, L.c1, 'center', null);
    text(L.hand ? handName(L.hand) : ' ', 90, 14, L.hand === 'L' ? 'au' : 'c2', 'center', null);
    text(L.verb, 90, 24, 'wt', 'center', 'k', L.verb.length <= 11 ? 16 : 8);
    if (L.target && Math.floor(t * 3) % 2) { const x = L.target[0] * TS + 6, y = MAP_Y + L.target[1] * TS - 4; for (let i = 0; i < 4; i++) rect(x - 4 + i, y - 4 + i, 9 - i * 2, 1, 'au'); }
    const sub = keys && L.keys ? L.keys : L.sub; rect(0, 47, W, 10, 'k'); text(sub, 90, 48, 's4', 'center', null);
  }
  // ---------- the choice at the titan, and calming it with both hands ----------
  function startInter() {
    S.mode = 'inter'; S.inter = { t: 0 }; S.battle = null; FXS.rumble();
    G.party = ['hero', 'knight', 'mage', 'archer'].map(newMember); API.setLevel(7); G.shards = 3; G.region = 'titan';
  }
  const CHOICE = { L: [LPAD[0], PAD_Y + 20, 86, 50], R: [RPAD[0], PAD_Y + 20, 86, 50] };
  function interPick(h) { if (!S.inter || S.inter.t < 2) return; if (h === 'L') startCalm(); else startFinale(); }
  function startCalm() { S.demo && (S.demo.finale = true); S.mode = 'calm'; S.calm = { n: 0, t: 0, gL: null, gR: null, eL: null, eR: null, fails: 0, res: null }; S.lockUntil = S.t + .3; }
  const CALM_T = { L: .9, R: 1.3 };
  function timingTapCalm(hand = 'R') {   // hand the shard back: left as it nears, right as it touches the eye
    const c = S.calm; if (c.res) return; const k = hand === 'L' ? 'gL' : 'gR'; if (c[k] !== null) return;
    if (hand === 'R' && c.gL === null) { c.gL = 99; c.eL = null; }   // the right hand alone cannot hand it back
    const e = c.t - CALM_T[hand]; c[k] = Math.abs(e); c[hand === 'L' ? 'eL' : 'eR'] = e; FXS.castNote(hand, Math.abs(e) < .07 ? 1.45 : 1.2);
    ghost(hand === 'L' ? LPAD[0] + 43 : RPAD[0] + 43, PAD_Y + 45, hand);
  }
  function updateCalm(dt) {
    const c = S.calm; c.t += dt;
    if (c.res) { if (c.t > 1.0) { c.res = null; c.t = 0; c.gL = c.gR = null; if (c.n >= 3) ending('sleeps'); } return; }
    if (API.autopilot === 'perfect') { if (c.gL === null && c.t >= CALM_T.L - .01) timingTapCalm('L'); if (c.gR === null && c.gL !== null && c.t >= CALM_T.R - .01) timingTapCalm('R'); }
    const done = (c.gL !== null && c.gR !== null) || c.t > CALM_T.R + .5;
    if (done) {
      if ((c.gL ?? 9) < .18 && (c.gR ?? 9) < .18) { c.n++; c.res = 'ok'; Audio.tone(784 + c.n * 200, .3, 'triangle', .07); FXS.heal(); }
      else { c.res = 'bad'; c.fails++; for (const p of G.party) p.hp = Math.max(0, p.hp - 12); FXS.hurt(true); S.flash = .15; if (!aliveParty().length) { S.mode = 'over'; S.mt = 0; } }
      c.t = 0;
    }
  }
  function drawCalm(t) {
    const c = S.calm;
    rect(0, 0, W, H, 's1'); for (let i = 0; i < 60; i++) px(hash(i) * W, hash(i + 3) * H, 's2');
    const droop = c.n / 3, ex = 90, ey = 100, oh = Math.round(30 * (1 - droop * .85));
    rect(ex - 70, ey - 40 + droop * 20, 140, 5, 's0');
    for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(66 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(ex - w, ey + dy, w * 2 + 1, 1, dy < -oh * .4 ? 'n6' : 'n7'); }
    if (oh > 3) rect(ex - 3, ey - oh + 2, 7, oh * 2 - 3, 'k');
    G.party.forEach((p, i) => spr(p.spr, 52 + i * 20, 196, 0));
    if (!c.res && c.n < 3) { const k = clamp(c.t / CALM_T.R), sx = mix(80, ex, k), sy = mix(196, ey + 2, ease(k)); shard(sx, sy, t); ring(ex, ey, 8, 'au'); }
    rect(0, 0, W, 26, 'k'); text(`RETURN SHARD ${Math.min(3, c.n + 1)}/3`, 90, 3, 'c3', 'center');
    text(c.res === 'ok' ? 'IT EASES...' : c.res === 'bad' ? 'IT ROARS! AGAIN' : 'LEFT, THEN RIGHT', 90, 14, c.res === 'bad' ? 'r2' : c.res === 'ok' ? 'g4' : 'wt', 'center', null);
    rect(0, PAD_Y - 6, W, H - PAD_Y + 6, 'k');
    for (const h of ['L', 'R']) { const P0 = h === 'L' ? LPAD : RPAD, x = P0[0] + 43, y = PAD_Y + 38, g = c[h === 'L' ? 'gL' : 'gR'], k = clamp(c.t / CALM_T[h]);
      panel(P0[0], P0[1], P0[2], P0[3], g === null ? 'c1' : g < .18 ? 'au' : 'r1'); ring(x, y, 10, 'c3'); if (g === null && !c.res) ring(x, y, Math.round(mix(34, 10, k)), 'wt'); else if (g !== null) disc(x, y, 6, g < .18 ? 'au' : 'r2');
      text(h === 'L' ? '1' : '2', x, y - 4, 'wt', 'center', 'k'); }
    G.party.forEach((p, i) => text(`${p.hp}`, 10 + i * 44, 222, p.hp < 15 ? 'r2' : 'g4'));
  }

  // ---------- the playable pitch ----------
  // Opens on a two-thumb hold, then teaches by doing inside one real fight (a stone hand of the titan), one verb at a
  // time, then throws everything at once (the titan's eye and both hands), then shows the player's own numbers and the
  // plan. Each lesson is an observer on the real battle stats (Brain the-game-prologue#E15), so there is no separate
  // tutorial rule set: the fight IS the game. WATCH mode plays the same flow with the autopilot and ghost thumbs.
  const LESSONS = [
    { id: 'block', who: 'foe', pat: 'h', slow: .4, hand: 'L', l1: 'HEAVY HIT', c1: 'r2', verb: 'BLOCK', ok: (s, b) => s.block > b.block, again: 'BLOCK AS THE RING CLOSES' },
    { id: 'guard', who: 'p', actor: 'knight', hand: 'B', l1: 'BRUNA SHIELDS EVERYONE', c1: 'c3', verb: 'GUARD', sub: 'HALF DAMAGE, 2 ROUNDS', pre: B => { B.wake = Math.max(B.wake, 1); }, ok: (s, b) => s.skills > b.skills },
    { id: 'string', who: 'foe', pat: 'shs', slow: .8, l1: 'A STRING', c1: 'wt', verb: 'READ EACH HIT', sub: 'RED=LEFT  BLUE=RIGHT', ok: (s, b) => s.strings > b.strings },
    { id: 'skill', who: 'p', actor: 'hero', hand: 'B', l1: 'WAKE PAYS FOR SKILLS', c1: 'c2', verb: 'SHARD STRIKE', sub: 'PARRY+PERFECT REFILL', pre: B => { B.wake = Math.max(B.wake, 3); }, ok: (s, b) => s.skills > b.skills },
    { id: 'item', who: 'p', actor: 'mage', hand: 'R', l1: 'BRUNA IS HURT', c1: 'g4', verb: 'POTION', sub: 'ITEM > POTION > BRUNA', pre: () => { const k = G.party.find(p => p.id === 'knight'); k.hp = Math.min(k.hp, Math.round(k.maxhp * .3)); }, ok: (s, b) => (s.items || 0) > (b.items || 0) },
    { id: 'break', who: 'free', l1: 'FILL ITS BREAK BAR', c1: 'au', verb: 'BREAK IT', sub: 'PERFECTS + PARRIES', ok: (s, b) => s.breaks > b.breaks },
    { id: 'finish', who: 'free', l1: 'IT IS OPEN', c1: 'au', verb: 'FINISH IT', ok: () => false },
  ];
  function startDemo(watch) {
    newGame(); S.cut = null; S.dialog = null;
    G.party = [newMember('hero'), newMember('knight'), newMember('mage')]; API.setLevel(3); G.shards = 1; G.region = 'forest'; G.items = { POTION: 3, ETHER: 1 };
    S.demo = { i: 0, base: null, watch: !!watch, shown: S.t, fails: 0, tot: { parry: 0, block: 0, crushed: 0, perfect: 0, breaks: 0, actions: 0, taps: 0, skills: 0, casts: 0, items: 0 }, finale: false };
    API.autopilot = watch ? 'perfect' : null; API.botThink = watch ? .8 : 0;
    startDojo();
    S.lockUntil = S.t + .5;
  }
  function startDemoFight() {
    G.party = [newMember('hero'), newMember('knight'), newMember('mage')]; API.setLevel(3); G.shards = 1; G.region = 'forest'; G.items = { POTION: 3, ETHER: 1 };
    S.demo.i = 0; S.demo.base = null; S.demo.shown = S.t;
    S.demo.map = null; S.botDash = false; startBattle(['tgolem'], 'demo1'); S.battle.noLose = true;
  }
  // the lesson fight cannot end before every verb is taught: until the break lesson, the foe stays above 30% HP
  const FINALE_LESSONS = [
    { id: 'volley', who: 'p', actor: 'archer', hand: 'B', l1: 'WREN HITS EVERY FOE', c1: 'g4', verb: 'VOLLEY', sub: 'ONE ARROW EACH', pre: B => { B.wake = Math.max(B.wake, 2); }, ok: (s, b) => s.skills > b.skills },
    { id: 'eye', who: 'free', l1: 'THE EYE OPENS EVERY', c1: 'au', verb: 'OTHER ROUND', sub: 'SHARD STRIKE IT THEN', ok: () => false },
  ];
  function lessonFloor(f) { if (S.battle && S.battle.kind === 'dojo') { f.hp = Math.max(f.hp, 1); return; } const L = lesson(); if (L && !S.demo.finale && LESSONS.indexOf(L) < LESSONS.findIndex(q => q.id === 'break')) f.hp = Math.max(f.hp, Math.round(f.maxhp * .3)); }
  function lesson() { const d = S.demo; if (!d || S.dojo || !S.battle || S.battle.kind === 'dojo') return null; return d.finale ? (S.battle.kind === 'demo2' ? FINALE_LESSONS[d.i] : null) : LESSONS[d.i]; }
  function demoTurn(B) {   // returns true when the lesson chose this turn
    const d = S.demo, L = lesson(); if (!L) return false;
    if (d.base && L.ok(B.stats, d.base)) { d.i++; d.base = null; d.shown = S.t; d.fails = 0; FXS.lesson(); }
    else if (d.base && L.who === 'foe') { d.fails++; d.shown = S.t; }
    else if (d.base && L.who === 'p' && ++d.fails >= 3) { d.i++; d.base = null; d.shown = S.t; d.fails = 0; }
    else if (d.base && L.who === 'p') d.shown = S.t;
    const N = lesson(); if (!N) return false;
    if (!d.base) { d.base = { ...B.stats }; if (N.pre) N.pre(B); }
    const f = aliveFoes()[0];
    if (N.who === 'foe') { foeAct(B, f, N.pat, null, false); B.victim = G.party[0]; B.slow = N.slow; return true; }
    if (N.who === 'p') { partyAct(B, G.party.find(p => p.id === N.actor)); return true; }
    return false;   // 'free': the normal turn order runs, the prompt stays up
  }
  function demoAfterBattle(B) {
    const d = S.demo; for (const k in d.tot) d.tot[k] += B.stats[k] || 0;
    if (B.kind === 'demo1') startInter();
    else { G.endings.fell = true; saveEndings(); S.demo.ending = 'fell'; S.mode = 'card'; S.card = { t: 0 }; API.autopilot = null; }
  }
  function startFinale() {
    const d = S.demo; d.finale = true; d.shown = S.t; d.i = 0; d.base = null;
    G.party = ['hero', 'knight', 'mage', 'archer'].map(newMember); API.setLevel(7); G.shards = 3; G.region = 'titan';
    startBattle(['lhand', 'eye', 'rhand'], 'demo2'); for (const f of S.battle.foes) { f.maxhp = Math.round(f.maxhp * .5); f.hp = f.maxhp; }   // a demo-length encounter

  }
  const handName = h => h === 'B' ? (S.scheme === 'keys' ? 'X THEN Z' : 'BOTH THUMBS') : S.scheme === 'keys' ? (h === 'L' ? 'X KEY' : 'Z KEY') : (h === 'L' ? 'LEFT THUMB' : 'RIGHT THUMB');
  function drawLesson(t) {   // the coach: big, short, on the field; an arrow over the pad that answers it
    const B = S.battle, L = lesson(); if (!L || !B) return;
    const busy = ['intro', 'after', 'win'].includes(B.phase); if (busy && L.who !== 'free') return;
    if (L.who === 'p' && !['menu', 'timing', 'allyTarget'].includes(B.phase)) return;
    const d = S.demo, k = Math.min(1, (S.t - d.shown) * 4), y0 = 2, big = L.verb.length <= 11, hgt = 8 + (L.hand ? 11 : 0) + (big ? 18 : 11) + (L.sub ? 11 : 0);
    rect(0, y0, W, hgt + 4, 'k'); rect(0, y0 + hgt + 3, W * k, 1, L.c1);
    let y = y0 + 3;
    text(d.fails && L.again ? 'AGAIN! ' + L.again : d.fails && L.who === 'p' ? 'TAP WHERE THE ARROW IS' : L.l1, 90, y, d.fails ? 'n6' : L.c1, 'center', null); y += 11;
    if (L.hand) { text(handName(L.hand), 90, y, L.hand === 'L' ? 'au' : L.hand === 'B' ? 'p2' : 'c2', 'center', null); y += 11; }
    text(L.verb, 90, y, 'wt', 'center', 'k', big ? 16 : 8); y += big ? 18 : 11;
    if (L.sub) text(L.sub, 90, y, 's4', 'center', null);
    if (L.hand && Math.floor(t * 3) % 2 && (B.phase === 'foeWind' || B.phase === 'menu' || B.phase === 'timing')) {   // point at the answer
      let x = L.hand === 'L' ? LPAD[0] + 43 : RPAD[0] + 43, y = PAD_Y - 6;
      if (B.phase === 'allyTarget') { const i = G.party.findIndex(p => p.id === 'knight'); x = 4 + (i % 2) * 88 + 20; y = 193 + Math.floor(i / 2) * 13; }
      if (B.phase === 'menu') { const want = { skill: 'SHARD STRIKE', magic: 'FIREBALL', guard: 'GUARD', volley: 'VOLLEY', item: B.sub === 'item' ? 'POTION' : 'ITEM' }[L.id] || 'STRIKE', b = rightButtons().find(q => q.o === want) || { b: SWAP }; if (b) { x = b.b[0] + b.b[2] / 2; y = b.b[1] - 6; } }
      for (let i = 0; i < 4; i++) rect(x - 4 + i, y + i, 9 - i * 2, 1, 'au');
    }
  }
  // ghost thumbs (WATCH mode): where the autopilot pressed, drawn like a fingertip
  const GHOSTS = [];
  function ghost(x, y, hand) { if (S.demo && S.demo.watch) GHOSTS.push({ x, y, hand, t: S.t }); }
  function drawGhosts() { for (let i = GHOSTS.length - 1; i >= 0; i--) { const g = GHOSTS[i], k = (S.t - g.t) / .35; if (k > 1) { GHOSTS.splice(i, 1); continue; } const c = g.hand === 'L' ? 'au' : 'c2'; disc(g.x, g.y, Math.round(9 - k * 3), c); ring(g.x, g.y, Math.round(11 + k * 6), 'wt'); } }
  function drawInter(t) {   // between the lesson and the climax: the mountain stands up
    const k = S.inter.t;
    ['n0', 'n1', 'n2', 'n3', 'n4'].forEach((c, i) => rect(0, i * 48, W, 49, c));
    const rise = easeOut(clamp(k / 1.6)) * 40, sh = k < 1.6 ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0;
    cx.fillStyle = P('s1'); cx.beginPath(); cx.moveTo(-40 + sh, 320); cx.lineTo(20 + sh, 200 - rise); cx.lineTo(90 + sh, 160 - rise); cx.lineTo(160 + sh, 200 - rise); cx.lineTo(220 + sh, 320); cx.fill();
    const e = easeOut(clamp((k - .8) / .5)), oh = Math.max(1, Math.round(9 * e)), ex = 90 + sh, ey = 205 - rise;
    for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(22 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(ex - w, ey + dy, w * 2 + 1, 1, dy < -oh / 2 ? 'n6' : 'n7'); }
    if (e > .6) rect(ex - 2, ey - oh + 1, 5, oh * 2 - 1, 'k');
    rect(0, 40, W, 40, 'k'); text('YOU HAVE THE VERBS.', 90, 46, 'wt', 'center'); text('NOW IT STANDS UP.', 90, 62, 'au', 'center');
    if (k > 2) { rect(0, PAD_Y - 2, W, H - PAD_Y + 2, 'k'); text('CHOOSE YOUR ENDING', 90, PAD_Y + 6, 'wt', 'center', null);
      button(CHOICE.L, 'CALM IT', false, 'c1'); button(CHOICE.R, 'FIGHT IT', true, 'r1');
      text('TWO ENDINGS', 90, PAD_Y + 74, 's3', 'center', null); }
  }
  function drawCard(t) {   // the pitch, after the player has felt it
    const d = S.demo.tot, k = S.card.t, n = d.actions || 1;
    rect(0, 0, W, H, 'n0'); for (let i = 0; i < 40; i++) px(hash(i) * W, hash(i + 5) * H, Math.floor(t * 2 + i) % 7 ? 'n1' : 'n2');
    text('YOU JUST PLAYED', 90, 14, 's4', 'center'); text('TWO HANDS', 90, 26, 'au', 'center', 'k', 16);
    const rows = [['PARRIES', d.parry, 'c2'], ['BLOCKS', d.block, 'b2'], ['PERFECT HITS', d.perfect, 'au'], ['BREAKS', d.breaks, 'n6'], ['SPELLS CAST', d.casts, 'p2']];
    const en = Object.keys(G.endings || {}).length; text(`ENDING ${en}/2: ${S.demo.ending === 'sleeps' ? 'IT SLEEPS' : 'IT FELL'}`, 90, 44, S.demo.ending === 'sleeps' ? 'c3' : 'n6', 'center', null);
    rows.forEach(([l, v, c], i) => { if (k < .25 + i * .15) return; text(l, 12, 58 + i * 11, 'wt'); text(String(v), 168, 58 + i * 11, c, 'right'); });
    if (k > 1.1) { panel(6, 116, 168, 32, 'b1'); text('TAPS TO ATTACK', 12, 122, 's4'); text('3', 140, 122, 'r2'); text('2', 166, 122, 'g4', 'right'); rect(148, 125, 7, 2, 'wt'); text('AIM WITHOUT REACHING', 12, 134, 'wt', 'left', null); }
    if (k > 1.5) {
      text('THE PLAN', 12, 156, 'au');
      const plan = [['M1', 'TWO THUMBS: BUILT', 'g4', ''], ['M2', 'A RHYTHM PER HERO', 'wt', ''], ['M3', 'FOES THAT FEINT', 'wt', ''], ['M4', 'DOJO + LEFTY MODE', 'wt', ''], ['M5', '10 REAL PLAYERS', 'wt', '']];
      plan.forEach(([m, l, c, tag], i) => { text(m, 12, 168 + i * 11, c === 'g4' ? 'g4' : 's3'); text(l, 34, 168 + i * 11, c); if (tag) text(tag, 168, 168 + i * 11, 'g4', 'right'); });
    }
    if (k > 2) CARD_BTNS.forEach(b => button(b.b, b.o, b.o === 'PLAY AGAIN', b.o === 'PLAY AGAIN' ? 'r1' : 'b0'));
  }
  const CARD_BTNS = [{ o: 'PLAY AGAIN', b: [92, 236, 84, 32] }, { o: 'WATCH IT', b: [4, 236, 84, 32] }, { o: 'OTHER END', b: [4, 274, 84, 32] }, { o: 'FULL GAME', b: [92, 274, 84, 32] }];
  function cardPress(o) { if (o === 'OTHER END') { S.demo.watch = false; startInter(); S.inter.t = 1.6; return; } if (o === 'PLAY AGAIN') startDemo(false); else if (o === 'WATCH IT') startDemo(true); else { S.demo = null; API.autopilot = null; newGame(); } }
  // title: hold both thumbs to begin (the first thing the pitch asks for is the thing it is about)
  const HOLD = { L: [44, 274], R: [136, 274] };
  const COARSE = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (_) { return true; } })();   // no touch screen: the keyboard (or one click) starts it
  function drawDemoTitle(t) {
    ['n0', 'n0', 'n1', 'n1', 'n2', 'n3'].forEach((c, i) => rect(0, i * 54, W, 55, c));
    for (let i = 0; i < 50; i++) px(hash(i) * W, hash(i + 5) * 200, Math.floor(t * 3 + i) % 6 ? 'n7' : 'c3');
    cx.fillStyle = P('s1'); cx.beginPath(); cx.moveTo(-30, 250); cx.lineTo(30, 170); cx.lineTo(90, 140); cx.lineTo(150, 166); cx.lineTo(220, 250); cx.fill();
    const blink = Math.floor(t * .7) % 5 === 0 && (t * .7) % 1 < .2; for (let dy = -4; dy <= 4; dy++) { const w = Math.round(12 * Math.sqrt(Math.max(0, 1 - (dy / 4.5) ** 2))); rect(90 - w, 186 + dy, w * 2 + 1, blink ? 0 : 1, dy < -2 ? 'n6' : 'n7'); }
    if (!blink) rect(89, 183, 3, 7, 'k');
    cx.font = `16px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.fillStyle = P('k'); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) cx.fillText('STONEWAKE', 90 + dx, 54 + dy); cx.fillStyle = P('au'); cx.fillText('STONEWAKE', 90, 54);
    text('TWO HANDS', 90, 78, 'c3', 'center');
    text('ONE THUMB DEFENDS.', 90, 100, 'au', 'center'); text('ONE THUMB ATTACKS.', 90, 112, 'c2', 'center');
    rect(0, 236, W, 84, 'k');
    const hl = S.titleHold || {}, k = clamp((S.holdT || 0) / .7);
    for (const h of ['L', 'R']) { const [x, y] = HOLD[h], on = !!hl[h], c = h === 'L' ? 'au' : 'c2'; ring(x, y, 20, on ? c : 's2'); ring(x, y, 19, on ? c : 's1'); if (on) disc(x, y, Math.round(4 + 13 * k), c); text(S.scheme === 'keys' ? (h === 'L' ? 'X' : 'Z') : h === 'L' ? 'LEFT' : 'RIGHT', x, y - 4, on ? 'k' : 'wt', 'center', null); }
    text(S.scheme === 'keys' ? 'HOLD X AND Z' : 'HOLD BOTH THUMBS', 90, 240, Math.floor(t * 2) % 2 ? 'wt' : 's4', 'center');
    text(S.scheme === 'keys' ? 'OR CLICK HERE' : 'TO BEGIN', 90, 303, 's4', 'center');
    if (PITCH) { button(TITLE_BTNS[0].b, 'WATCH IT', false); button(TITLE_BTNS[1].b, 'FULL GAME', false); }
    else { button(TRAIN_BTN, 'TRAINING', false); const n = Object.keys(G.endings || {}).length; if (n) text(`ENDINGS ${n}/2`, 90, 222, 'c2', 'center', null); }
    if (PITCH && S.t - (S.idleT || 0) > 11 && Math.floor(t * 2) % 2) text('OR WAIT: IT PLAYS ITSELF', 90, 222, 's3', 'center', null);
  }
  const TRAIN_BTN = [40, 196, 100, 22];
  // the game: a first-time player gets the dojo before the story (skippable); TRAINING replays it from the title
  const trained = () => { try { return localStorage.getItem('stonewake-trained') === '1'; } catch (_) { return false; } };
  function markTrained() { try { localStorage.setItem('stonewake-trained', '1'); } catch (_) {} }
  function startGame() { S.demo = null; API.autopilot = null; if (trained()) newGame(); else startDojo('game'); }
  const TITLE_BTNS = [{ o: 'WATCH', b: [8, 196, 80, 22] }, { o: 'FULL', b: [92, 196, 80, 22] }];   // labels fit 10 characters
  function updateTitle(dt) {
    const hl = S.titleHold || {}, keyHold = S.keys.x || S.keys.X, keyHold2 = S.keys.z || S.keys.Z;
    const both = (hl.L || keyHold) && (hl.R || keyHold2);
    if (keyHold) hl.L = hl.L || 'key'; if (keyHold2) hl.R = hl.R || 'key';
    if (!keyHold && hl.L === 'key') delete hl.L; if (!keyHold2 && hl.R === 'key') delete hl.R;
    S.titleHold = hl;
    if (both) { S.holdT = (S.holdT || 0) + dt; if (Math.floor(S.holdT * 20) !== Math.floor((S.holdT - dt) * 20)) Audio.tone(300 + S.holdT * 900, .03, 'square', .03); if (S.holdT > .7) { S.holdT = 0; S.titleHold = {}; touches.clear(); buzz(30); if (PITCH) startDemo(false); else startGame(); } }
    else S.holdT = 0;
    if (hl.L || hl.R) S.idleT = S.t;
    if (PITCH && S.t - (S.idleT || 0) > 14) startDemo(true);   // attract mode (the pitch only)
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
    if (S.dojo && dojoCh() && dojoCh().id === 'cast') return { cmd: 'FIREBALL', pick: 0 };
    if (lesson() && lesson().id === 'skill' && a.id === 'hero') return { cmd: 'SHARD STRIKE', pick: at(plain) };
    if (lesson() && lesson().id === 'magic' && a.id === 'mage') return { cmd: 'FIREBALL', pick: at(plain) };
    if (lesson() && lesson().id === 'guard' && a.id === 'knight') return { cmd: 'GUARD' };
    if (lesson() && lesson().id === 'volley' && a.id === 'archer') return { cmd: 'VOLLEY' };
    if (lesson() && lesson().id === 'item') return { cmd: 'POTION', ally: G.party.findIndex(p => p.id === 'knight') };
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
    if (d.cmd === 'POTION' || d.cmd === 'ETHER') { const ib = rightButtons().find(q => q.o === 'ITEM'); if (ib) ghost(ib.b[0] + ib.b[2] / 2, ib.b[1] + ib.b[3] / 2, 'R'); choose('ITEM'); choose(d.cmd); if (B.phase === 'allyTarget') startTiming(d.ally); return; }
    if (d.pick !== undefined && d.pick !== B.pick) { const c = foeChips().find(q => q.i === d.pick); if (c) ghost(c.b[0] + c.b[2] / 2, c.b[1] + c.b[3] / 2, 'L'); }
    if (d.pick !== undefined) B.pick = d.pick;
    const btn = rightButtons().find(q => q.o === d.cmd); if (btn) ghost(btn.b[0] + btn.b[2] / 2, btn.b[1] + btn.b[3] / 2, 'R');
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
    S.t += dt; S.mt += dt; S.flash = Math.max(0, S.flash - dt); S.fieldFlash = Math.max(0, (S.fieldFlash || 0) - dt); updateFX(dt);
    if (S.mode === 'title') { updateTitle(dt); return; }
    if (S.mode === 'inter') { S.inter.t += dt; if (S.demo && S.demo.watch && S.inter.t > 4) interPick(G.endings.fell && !G.endings.sleeps ? 'L' : 'R'); return; }
    if (S.mode === 'card') { S.card.t += dt; if (S.demo.watch && S.card.t > 9) { S.demo = null; S.mode = 'title'; S.idleT = S.t; } return; }
    if (S.mode === 'cut') { S.cut.t += dt; if (S.cut.t > 6.5) endCut(); return; }
    if (S.mode === 'map') { updateMapLesson(dt); if (!S.dialog && !S.choice) updateMap(dt); return; }
    if (S.mode === 'calm') { updateCalm(dt); return; }
    if (S.mode === 'ending') { S.ending.t += dt; return; }
    if (S.mode !== 'battle') return;
    const B = S.battle;
    if (B.kind === 'dojo' && S.dojo && dojoUpdate(dt)) return;
    B.t += dt * (B.phase === 'foeWind' ? B.slow || 1 : 1);
    if (B.phase === 'lose' && S.demo && S.demo.watch && B.t > 1.5) return startFinale();
    cueHits(B);
    const auto = API.autopilot;
    if (B.phase === 'intro' && B.t > .7) nextTurn();
    else if (B.phase === 'menu' && auto && B.t > (API.botThink || 0)) botPlan(B);
    else if (B.phase === 'timing') {
      if (auto && B.ring.cast) { const sd = auto === 'human' ? (API.human || { sd: .06 }).sd : 0; B.botCast = B.botCast || { L: B.ring.t1 + gauss() * sd, R: B.ring.t2 + gauss() * sd }; if (B.ring.gL === null && B.t >= B.botCast.L - .01) timingTap('L'); if (B.ring.gR === null && B.ring.gL !== null && B.t >= B.botCast.R - .01) timingTap('R'); }
      else if (auto && B.hitT === null) { const off = auto === 'human' ? (B.botOff = B.botOff ?? gauss() * (API.human || { sd: .06 }).sd) : 0; if (B.t >= B.ring.dur - .01 + off) { timingTap(); B.botOff = undefined; } }
      if (B.ring.cast && B.hitT === null && B.t > B.ring.t2 + .3) { const r = B.ring; B.grade = ((r.gL ?? .85) + (r.gR ?? .85)) / 2; B.hitT = B.t; }
      if (B.t > B.ring.dur + .3 && (!B.ring.cast || B.hitT !== null)) { B.botCast = null; B.botOff = undefined; const g = B.hitT === null ? 1 : B.grade; B.grade = g; dojoStrike(B); if (B.cmd.kind === 'skill' && SKILL[B.cmd.name].target === 'all') resolveAction(null, g); else resolveAction(B.target, g); }
    }
    else if (B.phase === 'foeWind') {
      if (auto && !B.botPress) botDefend(B);
      if (B.botPress) for (const p of B.botPress) if (!p.used && B.t >= p.at) { p.used = true; defend(p.hand); }
      for (const h of B.hits) if (!h.done && (h.res !== null ? B.t >= h.at : B.t > h.at + BLOCK_WIN + .07)) landHit(h);
      if (B.hits.every(h => h.done)) { B.phase = 'after'; B.t = 0; B.botPress = null; if (B.hits.length > 1) B.stats.strings++; }
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
  const memberX = i => 62 + (i % 2) * 10, memberY = i => 30 + i * 13;
  const aimY = i => S.battle.foes[i].id === 'eye' ? foeY(i) : foeY(i) - (S.battle.foes[i].boss ? 16 : 5);
  function drawFoe(f, t) {
    const [x, y] = foePos(f.i), hurt = S.battle.pops.some(p => S.t - p.t < .3 && Math.abs(p.x - x) < 3);
    if (f.hp <= 0) return;
    const B = S.battle, attacking = B.phase === 'foeWind' && B.actor === f, nh = attacking && B.hits.find(q => !q.done);
    const wind = nh ? clamp(1 - (nh.at - B.t) / WIND) : 0, lunge = f.lungeT && S.t - f.lungeT < .12 ? 6 : 0;
    const kb = (f.hurtT && S.t - f.hurtT < .15 ? -3 : 0) - Math.round(easeOut(wind) * 3) + lunge, sink = f.burrowed ? 14 : 0;
    if (nh && Math.floor(t * 12) % 2) { const c = nh.kind === 'h' ? 'r2' : 'c2', r = f.boss ? 20 : 10; for (let a = 0; a < 28; a++) { const q = a / 28 * 6.283; px(x + kb + Math.cos(q) * r, aimY(f.i) + Math.sin(q) * r * .8, c); } }   // anticipation: it glows the colour of the hit it is about to throw
    if (f.draw === 'golem') { cx.save(); cx.translate(x + kb, y + sink); cx.scale(.62, .62); if (f.phased) cx.globalAlpha = .45; golemArt(0, 0, t, f.tint, hurt); cx.restore(); if (sink) rect(x - 20, y - 2, 40, 6, 'd1'); }
    else if (f.draw === 'eye') { const oh = 12; rect(x - 30, y - 18, 60, 3, 's0'); for (let dy = -oh; dy <= oh; dy++) { const w = Math.round(28 * Math.sqrt(Math.max(0, 1 - (dy / (oh + .5)) ** 2))); rect(x - w, y + dy, w * 2 + 1, 1, f.open ? (dy < -oh / 2 ? 'n6' : 'n7') : dy === 0 ? 'k' : dy < 0 ? 's3' : 's2'); } if (f.open) { rect(x - 2, y - oh + 2, 5, oh * 2 - 3, 'k'); px(x + 1, y - 6, 'wt'); } else for (let i = -3; i <= 3; i++) rect(x + i * 7, y + 1, 1, 3, 'k'); }   // closed: a stone lid with lashes
    else if (f.draw === 'hand') { const bob = Math.round(Math.sin(t * 3 + f.i) * 2) - Math.round(wind * 4), sc = f.id === 'thand' ? 1.7 : 1.15; cx.save(); cx.translate(x + kb, y); cx.scale(sc, sc); cx.translate(-x, -y); rect(x - 10, y - 17 + bob, 20, 15, 'k'); for (let k = 0; k < 4; k++) rect(x - 10 + k * 5, y - 24 + bob + (k % 2) * 2, 5, 9, 'k'); rect(x - 9, y - 16 + bob, 18, 13, 's3'); for (let k = 0; k < 4; k++) rect(x - 9 + k * 5, y - 23 + bob + (k % 2) * 2, 4, 8, 's4'); rect(x - 9, y - 16 + bob, 18, 2, 'wt'); rect(x - 9, y - 6 + bob, 18, 3, 's2'); px(x - 4, y - 11 + bob, f.stun ? 's3' : 'r2'); px(x + 3, y - 11 + bob, f.stun ? 's3' : 'r2'); cx.restore(); }
    else spr(f.draw, x - 6 + kb, y - 10, Math.floor(t * 4) % 2);
    if (f.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.09; px(x + Math.cos(a) * 9, aimY(f.i) - 14 + Math.sin(a) * 2, 'au'); }
    if (f.shell) { for (let i = 0; i < 7; i++) px(x - 12 + i * 4, y - 22 + (i % 2) * 3, 'c3'); rect(x - 13, y - 24, 26, 1, 'c2'); }
    if (f.intent && TRICK[f.intent].big && Math.floor(t * 4) % 2) { rect(x - 1, y - 34, 3, 6, 'r2'); rect(x - 1, y - 26, 3, 2, 'r2'); }   // ! the trick is coming this round
    const bw = f.boss ? 26 : 14, by = f.id === 'eye' ? y + 15 : y + 3; rect(x - bw / 2, by, bw, 2, 'k'); rect(x - bw / 2, by, bw * f.hp / f.maxhp, 2, f.hp / f.maxhp < .3 ? 'r1' : 'g3'); if (f.brkMax) { rect(x - bw / 2, by + 3, bw, 1, 'k'); rect(x - bw / 2, by + 3, Math.round(bw * (f.stun > 0 ? 1 : f.brk / f.brkMax)), 1, 'au'); }
  }
  function drawField(t) {
    const B = S.battle, th = MAPS[G.region].theme;
    const sky = th === 'cave' ? ['n0', 'n1', 'n1', 'n2'] : th === 'sand' ? ['n5', 'n6', 'n6', 'n7'] : th === 'titan' ? ['n1', 'n2', 'n3', 'n4'] : ['n1', 'n2', 'g1', 'g1'];
    sky.forEach((c, i) => rect(0, i * 12, FW, 12, c));
    if (th === 'titan') { rect(0, 0, FW, 48, 's1'); for (let i = 0; i < 20; i++) px(hash(i) * FW, hash(i + 3) * 48, 's2'); }
    rect(0, 46, FW, FH - 46, th === 'cave' ? 'n1' : th === 'sand' ? 'd1' : th === 'titan' ? 's2' : 'g2');
    for (let x = 0; x < FW; x += 4) px(x + (x * 7 % 3), 50 + (x * 13 % 44), th === 'sand' ? 'd0' : th === 'cave' ? 'p0' : th === 'titan' ? 's3' : 'g3');
    for (const f of B.foes) drawFoe(f, t);
    G.party.forEach((p, i) => { const act = B.actor === p && ['menu', 'timing', 'allyTarget'].includes(B.phase), ko = p.hp <= 0; const hurt = p.hurtT && S.t - p.hurtT < .18; spr(p.spr, memberX(i) - (act ? 5 : 0) + (hurt ? 2 : 0), memberY(i), 0, true, ko ? 's1' : hurt && Math.floor(t * 30) % 2 ? 'wt' : null); if (B.guard > 0 && !ko) px(memberX(i) + 11, memberY(i), 'c3'); });
    if (B.fx && S.t - B.fx.t < .5) { const k = (S.t - B.fx.t) / .5;
      if (B.fx.kind === 'fire') { const x = foeX(B.fx.i), y = aimY(B.fx.i); disc(x, y, 9 * (1 - k) + 1, 'n6'); disc(x, y, 5 * (1 - k), 'n7'); }
      if (B.fx.kind === 'shard') { const x = foeX(B.fx.i), y = aimY(B.fx.i); for (let r = 0; r < 2; r++) for (let a = 0; a < 16; a++) px(x + Math.cos(a / 16 * 6.28) * (k * 18 + r * 3), y + Math.sin(a / 16 * 6.28) * (k * 18 + r * 3), 'c3'); }
      if (B.fx.kind === 'volley') for (let i = 0; i < 5; i++) rect(mix(64, 8, k) + i * 5, 40 + i * 6, 3, 1, 'w3'); }
    if (B.phase === 'timing' && B.ring.cast) { const i = G.party.indexOf(B.actor), x = memberX(i) + 3, y = memberY(i) + 8, n = 6 + Math.floor(B.t * 10);   // a rune circle builds around the caster
      for (let a = 0; a < Math.min(32, n); a++) { const q = a / 32 * 6.283 + B.t; px(x + Math.cos(q) * 11, y + Math.sin(q) * 5, a % 4 ? 'p2' : 'wt'); } }
    if (B.phase === 'timing') {   // the ring shrinks onto the target; tap as it meets the inner circle
      const hasT = B.target !== null && B.target !== undefined, tx = B.targetAlly ? memberX(B.target) + 5 : hasT ? foeX(B.target) : 30, ty = B.targetAlly ? memberY(B.target) + 7 : hasT ? aimY(B.target) : 60, k = clamp(B.t / B.ring.dur), r = Math.round(mix(24, 6, k));
      for (let a = 0; a < 40; a++) { const q = a / 40 * 6.28; px(tx + Math.cos(q) * 6, ty + Math.sin(q) * 6, 'au'); if (B.hitT === null) px(tx + Math.cos(q) * r, ty + Math.sin(q) * r, 'wt'); }
    }
    if (B.phase === 'foeWind') {   // each hit of the string drops onto the victim, red for heavy, blue for swift
      for (const v of B.aoe ? aliveParty() : [B.victim]) { const i = G.party.indexOf(v), x = memberX(i) + 5, y = memberY(i) - 2;
        const h = B.hits.find(q => !q.done);
        if (h) { const k = clamp(1 - (h.at - B.t) / WIND), c = h.kind === 'h' ? 'r2' : 'c2', cy = y + 9;
          ring(x, cy, 9, 'au'); if (k > 0) ring(x, cy, Math.round(mix(26, 9, k)), c);
          if (h.kind === 'h') shieldIcon(x, y - 10, Math.floor(t * 8) % 2 ? 'r2' : 'wt'); else swordIcon(x, y - 10, Math.floor(t * 8) % 2 ? 'c2' : 'wt'); }
        rect(x - 4, y + 15, 9, 1, 'au'); }
      if (B.actor.draw !== 'eye' && Math.floor(t * 8) % 2) rect(foeX(B.actor.i) - 1, aimY(B.actor.i) - 14, 3, 3, 'r2');
    }
    drawFX();
    if (S.fieldFlash > 0) rect(0, 0, FW, FH, 'wt');
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
      for (const c of foeChips()) { const f = B.foes[c.i], b = c.b, dead = f.hp <= 0, on = B.pick === c.i && !dead;
        panel(b[0], b[1], b[2], b[3], dead ? 's0' : on ? 'au' : f.stun > 0 ? 'n6' : 'b0');
        if (!dead) { const nm = f.name.split(' ').pop(); text(b[2] > 80 ? nm : f.short || nm.slice(0, b[2] > 40 ? 5 : 3), b[0] + b[2] / 2, b[1] + 4, on ? 'au' : 'wt', 'center', null);
          rect(b[0] + 3, b[1] + 15, b[2] - 6, 3, 'k'); rect(b[0] + 3, b[1] + 15, Math.round((b[2] - 6) * f.hp / f.maxhp), 3, 'g3'); } }
      { const st = stanceOf(B.actor), mg = st === 'magic', b = SWAP, pulse = S.swapT && S.t - S.swapT < .15;   // the stance swap: one tap of the left thumb
        panel(b[0], b[1], b[2], b[3], pulse ? 'wt' : mg ? 'p1' : 'r1');
        if (mg) { for (let a = 0; a < 20; a++) { const q = a / 20 * 6.283 + t * 2; px(b[0] + 43 + Math.cos(q) * 9, b[1] + 20 + Math.sin(q) * 5, a % 3 ? 'p2' : 'wt'); } disc(b[0] + 43, b[1] + 20, 2, 'p2'); }
        else swordIcon(b[0] + 43, b[1] + 20, 'au');
        text(mg ? 'MAGIC' : 'ATTACK', b[0] + 43, b[1] + 33, mg ? 'p2' : 'au', 'center', null);
        text('TAP: SWAP', b[0] + 43, b[1] + 44, 's3', 'center', null); }
      for (const btn of rightButtons()) { const o = btn.o, sk = SKILL[o]; let lab = o;
        if (sk) lab = btn.b[2] < 50 ? o.split(' ')[0].slice(0, 4) : o.split(' ').pop();
        if (o === 'POTION' || o === 'ETHER') lab = `${o} x${G.items[o]}`;
        const off = (sk && B.wake < sk.w) || ((o === 'POTION' || o === 'ETHER') && !G.items[o]);
        button(btn.b, lab, o === 'STRIKE', o === 'STRIKE' ? 'r1' : 'b0', off ? 's2' : null);
        if (sk) { for (let j = 0; j < sk.w; j++) rect(btn.b[0] + btn.b[2] / 2 - sk.w * 3 + j * 6 + 1, btn.b[1] + btn.b[3] - 7, 4, 3, off ? 's2' : 'c2'); } }
    } else if (B.phase === 'allyTarget') { text('TAP AN ALLY ABOVE', 90, 252, 'au', 'center'); button([RPAD[0], RPAD[1] + 52, 86, 28], 'BACK', false); }
    else if (B.phase === 'timing' && B.ring.cast) {   // two rings: left closes first, then right
      const r = B.ring;
      for (const [h, P0, tt, g] of [['L', L, r.t1, r.gL], ['R', R, r.t2, r.gR]]) { const x = P0[0] + 43, y = P0[1] + 36, k = clamp(B.t / tt);
        panel(P0[0], P0[1], P0[2], P0[3], g !== null ? (g > 1.4 ? 'au' : 'b1') : 'p1'); ring(x, y, 10, 'p2'); if (g === null) ring(x, y, Math.round(mix(34, 10, k)), 'wt'); else disc(x, y, 6, g > 1.4 ? 'au' : 'p2');
        text(h === 'L' ? '1' : '2', x, y - 4, 'wt', 'center', 'k'); }
      text('CAST', 90, PAD_Y + 66, 'p2', 'center', 'k'); text('LEFT', L[0] + 43, L[1] + 66, 'wt', 'center', null); text('RIGHT', R[0] + 43, R[1] + 66, 'wt', 'center', null);
    }
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
    for (const p of B.pops) { const k = (S.t - p.t) / (p.big ? 1.1 : .9); if (k < 1) text(p.s, p.x * 2, p.y * 2 - (p.big ? easeOut(Math.min(1, k * 4)) * 8 : k * 14), p.c, 'center', 'k', p.big && k < .85 ? 16 : 8); }
    if (B.breakT && S.t - B.breakT < 1.1) { const k = (S.t - B.breakT) / 1.1; rect(0, 78, W, 30, 'k'); rect(0, 79, W * Math.min(1, k * 5), 1, 'au'); rect(W * (1 - Math.min(1, k * 5)), 106, W, 1, 'au'); text('BREAK!', 90, 85, Math.floor(k * 12) % 2 ? 'au' : 'wt', 'center', 'k', 16); }
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
    if (S.mode === 'title') drawDemoTitle(t);
    else if (S.mode === 'inter') drawInter(t);
    else if (S.mode === 'card') { drawCard(t); drawGhosts(); }
    else if (S.mode === 'cut') drawCut(t);
    else if (S.mode === 'map') drawMap(t);
    else if (S.mode === 'battle') { drawBattle(t); if (S.dojo) drawDojo(t); else drawLesson(t); drawGhosts(); }
    else if (S.mode === 'calm') drawCalm(t);
    else if (S.mode === 'ending') drawEnding(t);
    else if (S.mode === 'over') { text('THE PARTY FELL', 90, 140, 'r2', 'center'); text('TAP TO TRY AGAIN', 90, 160, 's4', 'center'); }
    if (S.mode === 'map') { drawControls(t); drawDialog(t); drawChoice(); drawMapLesson(t); drawGhosts(); }
    if (S.flash > 0) rect(0, 0, W, H, 'wt');
    if (['title', 'battle', 'card', 'inter'].includes(S.mode)) drawSpeaker();
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
    if (type === 'up' || type === 'cancel') { if (S.titleHold) for (const h of ['L', 'R']) if (S.titleHold[h] === id) delete S.titleHold[h]; const tc = touches.get(id); touches.delete(id); if (tc && tc.kind === 'stick' && S.stick === tc) S.stick = null; if (tc && tc.kind === 'dash' && S.dash === tc) S.dash = null; if (tc && tc.kind === 'swipe' && tc.swap && !tc.done) swapStance(); return; }
    if (type !== 'down') return;
    Audio.unlock(); if (SND.on) sndInit(); S.scheme = COARSE ? 'touch' : 'keys'; S.idleT = S.t;
    if (['title', 'battle', 'card', 'inter'].includes(S.mode) && inBox(x, y, SPK)) { setSound(!SND.on); return; }
    if (S.demo && S.demo.watch && S.mode !== 'card') { S.demo = null; API.autopilot = null; S.battle = null; S.mode = 'title'; S.lockUntil = S.t + .4; return; }
    if (S.battle) S.battle.stats.taps++;
    if (S.lockUntil && S.t < S.lockUntil) return;   // after a stage change, ignore presses for a beat (Brain demo-disc#E5)
    if (S.mode === 'title') {
      if (PITCH && inBox(x, y, TITLE_BTNS[0].b)) return startDemo(true);
      if (PITCH && inBox(x, y, TITLE_BTNS[1].b)) { S.demo = null; return newGame(); }
      if (!PITCH && inBox(x, y, TRAIN_BTN)) { S.demo = null; return startDojo('title'); }
      if (y >= 236 && !COARSE) return PITCH ? startDemo(false) : startGame();
      if (y >= 236) { (S.titleHold = S.titleHold || {})[x < 90 ? 'L' : 'R'] = id; Audio.tone(x < 90 ? 330 : 440, .05, 'square', .04); }
      return;
    }
    if (S.mode === 'inter') { if (inBox(x, y, CHOICE.L)) interPick('L'); else if (inBox(x, y, CHOICE.R)) interPick('R'); return; }
    if (S.mode === 'card') { if (S.card.t > 2) for (const b of CARD_BTNS) if (inBox(x, y, b.b)) cardPress(b.o); return; }
    if (S.mode === 'cut') { if (S.cut.t > 5) endCut(); return; }
    if (S.mode === 'over') { if (S.demo) { healParty(1); return startCalm(); } healParty(1); enterRegion(G.region); return; }
    if (S.mode === 'ending') { if (S.ending.t > 1.5) S.mode = 'title'; return; }
    if (S.mode === 'calm') { timingTapCalm(x < 90 ? 'L' : 'R'); return; }
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
      if (S.dojo && S.dojo.phase !== 'practice') { if (S.dojo.phase === 'explain' && inBox(x, y, DOJO_BTNS.skip)) return skipDojo(); if (S.dojo.phase !== 'clear' && (inBox(x, y, DOJO_BTNS.go) || S.dojo.t > 1.2)) dojoNext(); return; }
      if (B.phase === 'win') { endBattle(); return; }
      if (B.phase === 'lose') { if (S.demo) return startFinale(); S.battle = null; healParty(1); enterRegion(G.region); return; }
      if (B.phase === 'timing') { timingTap(x < 90 ? 'L' : 'R'); return; }
      if (B.phase === 'foeWind') { defend(x < 90 ? 'L' : 'R'); return; }
      if (B.phase === 'menu') {
        if (x < 90 && y >= PAD_Y) {
          for (const c of foeChips()) if (inBox(x, y, c.b) && B.foes[c.i].hp > 0) { B.pick = c.i; Audio.tone(990, .03, 'square', .04); return; }
          touches.set(id, { kind: 'swipe', x0: x, done: false, swap: inBox(x, y, SWAP) && !B.sub }); return; }
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
  // keys: arrows move / aim, Z = right thumb (STRIKE, PARRY, ACT), X = left thumb (BLOCK); 1-2 skills, I items, R run
  function onKey(key, down) {
    S.keys[key] = down; if (!down) return;
    S.scheme = 'keys'; S.idleT = S.t; if (SND.on) sndInit();
    const ok = key === 'Enter' || key === ' ' || key === 'z' || key === 'Z', left = key === 'x' || key === 'X';
    if (key === 'm' || key === 'M') return setSound(!SND.on);
    if (S.demo && S.demo.watch && S.mode !== 'card') { S.demo = null; API.autopilot = null; S.battle = null; S.mode = 'title'; return; }
    if (S.mode === 'title') { if (PITCH && (key === 'w' || key === 'W')) startDemo(true); if (PITCH && (key === 'f' || key === 'F')) { S.demo = null; newGame(); } if (!PITCH && (key === 't' || key === 'T')) startDojo('title'); if (key === 'Enter') { if (PITCH) startDemo(false); else startGame(); } return; }
    if (S.mode === 'inter') { if (left) interPick('L'); else if (ok) interPick('R'); return; }
    if (S.mode === 'card') { if (S.card.t > 2) { if (key === 'Enter' || key === ' ') cardPress('PLAY AGAIN'); if (key === 'w' || key === 'W') cardPress('WATCH IT'); if (key === 'f' || key === 'F') cardPress('FULL GAME'); } return; }
    if (S.mode === 'title' && ok) return newGame();
    if (S.mode === 'cut' && ok && S.cut.t > 5) return endCut();
    if (S.mode === 'over' && ok) { healParty(1); return enterRegion(G.region); }
    if (S.mode === 'ending' && ok && S.ending.t > 1.5) { S.mode = 'title'; return; }
    if (S.mode === 'calm' && (ok || left)) return timingTapCalm(left ? 'L' : 'R');
    if (S.mode === 'map') {
      if (S.choice) { if (key === 'ArrowUp' || key === 'ArrowDown') S.choice.sel = 1 - S.choice.sel; if (ok) pickChoice(S.choice.sel); return; }
      if (S.dialog && ok) return advanceDialog();
      if (ok) return act();
      return;
    }
    if (S.mode === 'battle') {
      const B = S.battle;
      if (S.dojo && S.dojo.phase !== 'practice') { if (key === 'Backspace' || key === 's' || key === 'S') return skipDojo(); if (ok && S.dojo.phase !== 'clear') dojoNext(); return; }
      if (B.phase === 'win' && ok) return endBattle();
      if (B.phase === 'lose' && ok) { if (S.demo) return startFinale(); S.battle = null; healParty(1); return enterRegion(G.region); }
      if (B.phase === 'timing' && (ok || left)) return timingTap(left ? 'L' : 'R');
      if (B.phase === 'foeWind' && (ok || left)) return defend(left ? 'L' : 'R');
      if (B.phase === 'menu') {
        if (key === 'ArrowLeft' || key === 'ArrowRight') return cycleTarget(key === 'ArrowRight' ? 1 : -1);
        if (B.sub === 'item') { if (key === '1') choose('POTION'); if (key === '2') choose('ETHER'); if (left || key === 'Backspace') B.sub = null; return; }
        if (left) return swapStance();
        if (ok) { const main = rightButtons().filter(q => q.o !== 'ITEM' && q.o !== 'RUN')[0]; return main && choose(main.o); }
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
    G, S, MAPS, FINDS, newGame, startDemo, startInter, interPick, mapLesson: () => mapLesson() && mapLesson().id, dojo: () => S.dojo && { ...S.dojo, id: dojoCh() && dojoCh().id }, startFinale, lesson: () => lesson(), enterRegion, startBattle, pickChoice, autopilot: null, human: null, botThink: 0, step: n => game.step(n),
    get state() { return S.mode; },
    decide: () => botDecide(S.battle), ui: () => S.battle ? { right: S.battle.actor && G.party.includes(S.battle.actor) ? rightButtons() : [], chips: foeChips(), L: LPAD, R: RPAD, act: ACT } : { act: ACT },
    seed(n) { botSeed = n >>> 0 || 1; },
    nextStep(x, y) { const p = bfs(x, y); return p[0] || null; },
    snd: SND,
    // give the party a region's companion without playing it (tests jump straight to later fights)
    recruit(id) { if (!G.party.some(p => p.id === id)) G.party.push(newMember(id)); },
    setLevel(lv) { for (const p of G.party) { while (p.lv < lv) { p.lv++; p.maxhp += 8; p.maxmp += 3; p.atk += 2; p.mag += 2; p.def += 1; } p.hp = p.maxhp; p.mp = p.maxmp; } },
    finish() { while (S.dialog) { S.dialog.t = -999; advanceDialog(); } },
  };
  G.endings = loadEndings(); S.scheme = COARSE ? 'touch' : 'keys';
  const game = createGame({ canvas: document.getElementById('c'), width: LW, height: LH, update, render, onPointer, onKey });
  window.__game = API;
})();
