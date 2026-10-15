// THE LAST NOTE - playable demo (1-bit).
// Play the funeral hymn on falling tiles. On the beat is solemn (Grandma approves, nothing moves).
// Half a beat LATE is GROOVE: the chapel starts tapping and the casket rolls toward the door.
// Wrong lane, mashing or a dropped tile is SOUR and Grandma's patience runs out.
// Get the casket to the door, then land the last note dead on the beat.
(function () {
  'use strict';
  const { createGame, Audio } = Engine;
  const W = 240, H = 427, SCALE = 3, LW = W * SCALE, LH = 1280;
  const low = document.createElement('canvas'); low.width = W; low.height = H;
  const cx = low.getContext('2d', { willReadFrequently: true });
  const INK = [28, 26, 34], PAPER = [232, 226, 210];
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const back = x => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const mix = (a, b, k) => a + (b - a) * k;
  const g = v => { const c = Math.round(clamp(v) * 255); return `rgb(${c},${c},${c})`; };
  function rect(x, y, w, h, v) { cx.fillStyle = g(v); cx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function circ(x, y, r, v) { cx.fillStyle = g(v); cx.beginPath(); cx.arc(x, y, Math.max(0, r), 0, 7); cx.fill(); }
  // text is NOT drawn into the 1-bit buffer (dithering at this size made it unreadable): it is queued with its
  // on-screen position and drawn crisp at full resolution on top, in the same two inks
  const TQ = [];
  function text(s, x, y, size, v, align = 'center') { const m = cx.getTransform(); TQ.push({ s, x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, size: Math.max(8, size) * Math.hypot(m.a, m.b), v, align, a: cx.globalAlpha }); }
  function drawText(ctx) {
    for (const q of TQ) {
      const ink = q.v >= .5 ? PAPER : INK, edge = q.v >= .5 ? INK : PAPER, px = q.size * SCALE * 1.05;
      ctx.save(); ctx.globalAlpha = q.a; ctx.font = `900 ${px}px Inter, system-ui, sans-serif`; ctx.textAlign = q.align; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, px * .22); ctx.strokeStyle = `rgb(${edge})`; ctx.strokeText(q.s, q.x * SCALE, q.y * SCALE);
      ctx.fillStyle = `rgb(${ink})`; ctx.fillText(q.s, q.x * SCALE, q.y * SCALE); ctx.restore();
    }
    TQ.length = 0;
  }
  function mkRng(seed) { let s = seed >>> 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  let B = .75;   // seconds per beat; the characters bob to it

// ---------- characters (1-bit: solid ink silhouettes, paper highlights) ----------
function mourner(x, y, h, hat, t, k) {
  // k: 0 = solemn, 1 = dancing; bob + foot tap scale with it
  const bob = Math.abs(Math.sin(t * Math.PI / B)) * 2.5 * k, foot = Math.sin(t * Math.PI * 2 / B + x) > .3 ? 2 * Math.min(1, k * 3) : 0;
  rect(x - 5, y - h * .55 - bob, 10, h * .55, 0);                         // coat
  circ(x, y - h * .62 - bob, 5, .85);                                      // face (pale)
  if (hat === 1) { rect(x - 7, y - h * .7 - bob, 14, 2, 0); rect(x - 4, y - h * .82 - bob, 8, 6, 0); }
  else if (hat === 2) { cx.fillStyle = g(0); cx.beginPath(); cx.arc(x, y - h * .64 - bob, 6, Math.PI, 0); cx.fill(); rect(x - 6, y - h * .64 - bob, 12, 5, .35); }   // veil
  else { cx.fillStyle = g(0); cx.beginPath(); cx.arc(x, y - h * .64 - bob, 5.5, Math.PI * 1.1, -.1); cx.fill(); }
  rect(x - 4, y - h * .62 - bob - 1, 2, 1, 0); rect(x + 2, y - h * .62 - bob - 1, 2, 1, 0);   // eyes
  rect(x - 4, y - bob - 2, 3, 2 + bob, 0); rect(x + 1, y - foot - 2, 3, 2, 0);                 // legs, the right foot taps
}
function grandma(x, y, t, drag, glare) {
  const lean = drag * .5;
  cx.save(); cx.translate(x, y); cx.rotate(lean);
  rect(-6, -26, 12, 24, 0); circ(0, -30, 5.5, .85);
  rect(-8, -37, 16, 3, 0); rect(-4, -42, 8, 5, 0); circ(5, -41, 2, .7);   // hat with a flower
  rect(-4, -31, 3, 1, 0); rect(1, -31, 3, 1, 0);
  if (glare) { rect(-5, -34, 4, 1, 0); rect(1, -34, 4, 1, 0); }           // the glare: brows
  rect(-5, -2, 3, 3, 0); rect(2, -2, 3, 3, 0);
  if (drag > 0) { rect(4, -22, 10, 2, 0); }                              // arm out, holding the trolley
  cx.restore();
  if (drag > 0) for (let i = 0; i < 3; i++) rect(x - 10 - i * 5, y - 1 + (i % 2), 3, 1, .2);   // skid marks
}
function casket(x, y, t) {
  rect(x - 34, y - 18, 68, 18, 0);
  rect(x - 32, y - 16, 64, 2, .6);                                       // lid highlight
  rect(x - 4, y - 14, 8, 2, .8); rect(x - 1, y - 17, 2, 8, .8);          // cross
  rect(x - 30, y, 60, 3, .25);                                           // trolley
  for (const wx of [x - 24, x + 24]) { const a = t * 6; circ(wx, y + 6, 4, 0); rect(wx + Math.cos(a) * 2 - .5, y + 6 + Math.sin(a) * 2 - .5, 1.5, 1.5, .8); }
}
function portrait(x, y, smile) {
  rect(x - 13, y - 18, 26, 30, 0); rect(x - 11, y - 16, 22, 26, .75);
  circ(x, y - 4, 6, .9); cx.fillStyle = g(0); cx.beginPath(); cx.arc(x, y - 7, 6, Math.PI * 1.05, -.05); cx.fill();
  rect(x - 3, y - 5, 2, 1, 0); rect(x + 1, y - 5, 2, 1, 0);
  if (smile) { cx.strokeStyle = g(0); cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y - 2, 2.5, .3, Math.PI - .3); cx.stroke(); } else rect(x - 2, y - 1, 4, 1, 0);
  rect(x - 8, y + 12, 3, 14, 0); rect(x + 5, y + 12, 3, 14, 0);          // easel legs
}
function hand(x, y, press) {
  const p = press ? 2 : 0;
  rect(x - 3, y - 2 + p, 6, 14, 1); rect(x - 7, y + 10 + p, 16, 14, 1);
  cx.strokeStyle = g(0); cx.lineWidth = 1; cx.strokeRect(x - 3 + .5, y - 2 + p + .5, 6, 13); cx.strokeRect(x - 7 + .5, y + 10 + p + .5, 16, 13);
}


  // ---------- levels ----------
  // ten funerals, ten requests. Every song is ORIGINAL: it borrows only an era's tempo, drum pattern,
  // bass style and a common chord progression, never a real melody, bassline, lyric or title.
  const DR = {   // drum patterns over one 4-beat bar: kick, snare, hat offsets in beats
    ballad: { k: [0, 2.5], s: [1, 3], h: [0, 1, 2, 3] },
    synthpop: { k: [0, 2], s: [1, 3], h: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5] },
    dance: { k: [0, 1, 2, 3], s: [1, 3], h: [.5, 1.5, 2.5, 3.5] },
    swing: { k: [0, 1.67, 2.5], s: [1, 3], h: [0, .67, 1, 1.67, 2, 2.67, 3, 3.67] },
    rnb: { k: [0, 1.5, 2.25], s: [1, 3], h: [0, .25, .5, .75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75] },
    dembow: { k: [0, 1, 2, 3], s: [.75, 1.5, 2.75, 3.5], h: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5] },
    four: { k: [0, 1, 2, 3], s: [1, 3], h: [.5, 1.5, 2.5, 3.5] },
    punk: { k: [0, .5, 2, 2.5], s: [1, 3], h: [0, .5, 1, 1.5, 2, 2.5, 3, 3.5] },
    funk: { k: [0, 1.5, 2.5], s: [1, 3], h: [0, .25, .5, .75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75] },
  };
  const BASS = {   // [beat in bar, semitones above the chord root]
    ballad: [[0, 0], [2, 7]],
    octaves: [[0, 0], [.5, 12], [1, 0], [1.5, 12], [2, 0], [2.5, 12], [3, 0], [3.5, 12]],
    synco: [[0, 0], [.75, 0], [1.5, 7], [2, 0], [2.75, 0], [3.5, 10]],
    swing: [[0, 0], [.67, 12], [1.67, 10], [2, 0], [2.67, 7], [3.67, 5]],
    rnb: [[0, 0], [1.5, 7], [2.25, 10], [3, 12]],
    dembow: [[0, 0], [.75, 0], [2, 0], [2.75, 0]],
    offbeat: [[.5, 0], [1.5, 0], [2.5, 0], [3.5, 0]],
    eighths: [[0, 0], [.5, 0], [1, 0], [1.5, 0], [2, 0], [2.5, 0], [3, 0], [3.5, 0]],
    funk: [[0, 0], [.5, 12], [.75, 0], [1.5, 10], [2, 0], [2.5, 12], [3.25, 7], [3.5, 10]],
  };
  const LEVELS = [
    { who: 'AUNT DEB', name: 'LIGHTERS UP', year: 1987, bpm: 72, chords: [50, 45, 47, 43], minor: [0, 0, 1, 0], drums: 'ballad', bass: 'ballad', lead: 'triangle', pad: true,
      mel: [66, 69, 71, 69, 66, 64, 62, 64, 66, 69, 74, 73, 71, 69, 71, 69] },
    { who: 'UNCLE RAY', name: 'NEON GOODBYE', year: 1984, bpm: 80, chords: [57, 53, 48, 55], minor: [1, 0, 0, 0], drums: 'synthpop', bass: 'octaves', lead: 'square',
      mel: [76, 72, 74, 76, 79, 76, 74, 72, 69, 72, 74, 72, 71, 67, 71, 74] },
    { who: 'COUSIN VINNIE', name: 'STREETLIGHT STRUT', year: 1983, bpm: 84, chords: [52, 50, 48, 50], minor: [1, 0, 0, 0], drums: 'dance', bass: 'synco', lead: 'square',
      mel: [71, 71, 74, 76, 74, 71, 69, 67, 71, 74, 76, 79, 76, 74, 71, 74] },
    { who: 'BIG MIKE', name: 'BOOM BOX BOOGIE', year: 1991, bpm: 88, chords: [43, 48, 43, 48], minor: [1, 0, 1, 0], drums: 'swing', bass: 'swing', lead: 'sawtooth',
      mel: [67, 70, 72, 70, 74, 72, 70, 67, 65, 67, 70, 72, 70, 67, 65, 67] },
    { who: 'MISS PEARL', name: 'VELVET FLIP PHONE', year: 2004, bpm: 92, chords: [53, 46, 51, 44], minor: [1, 1, 0, 0], drums: 'rnb', bass: 'rnb', lead: 'triangle', pad: true,
      mel: [72, 75, 77, 75, 72, 70, 68, 70, 72, 77, 80, 77, 75, 72, 70, 72] },
    { who: 'ABUELA ROSA', name: 'TROPICAL WAKE', year: 2017, bpm: 96, chords: [47, 43, 50, 45], minor: [1, 0, 0, 0], drums: 'dembow', bass: 'dembow', lead: 'square',
      mel: [71, 74, 76, 74, 71, 69, 66, 69, 71, 74, 78, 76, 74, 73, 71, 73] },
    { who: 'AUNTIE GLO', name: 'RAVE RECEPTION', year: 1995, bpm: 100, chords: [48, 44, 51, 46], minor: [1, 0, 0, 0], drums: 'four', bass: 'offbeat', lead: 'square',
      mel: [72, 75, 79, 77, 75, 72, 70, 72, 75, 77, 79, 82, 80, 79, 75, 77] },
    { who: 'LIL TONY', name: 'SKATE PARK SKYLINE', year: 2003, bpm: 104, chords: [52, 47, 49, 45], minor: [0, 0, 1, 0], drums: 'punk', bass: 'eighths', lead: 'sawtooth',
      mel: [76, 76, 78, 80, 80, 78, 76, 73, 71, 73, 76, 78, 76, 73, 71, 73] },
    { who: 'DR. LOU', name: 'BRASS SUIT SWAGGER', year: 2014, bpm: 112, chords: [50, 55, 50, 55], minor: [1, 0, 1, 0], drums: 'funk', bass: 'funk', lead: 'sawtooth',
      mel: [74, 77, 74, 72, 69, 72, 74, 77, 79, 77, 74, 72, 74, 72, 69, 72] },
    { who: 'GRANDPA', name: 'SUNSET DROP', year: 2013, bpm: 120, chords: [53, 48, 50, 46], minor: [0, 0, 1, 0], drums: 'four', bass: 'offbeat', lead: 'square',
      mel: [77, 81, 84, 81, 79, 77, 76, 72, 74, 77, 81, 79, 77, 76, 74, 76] },
  ];
  LEVELS.forEach((L, i) => { L.tiles = 30 + i * 2; L.need = Math.round(8 + i * 1.2); });
  const LANE_X = l => 20 + l * 50, HIT_Y = 322, TILE_H = 32, LANES_Y = 215, KEYS_Y = 386, GROOVE_AT = .27;
  const ON = .09, LATE_MIN = .09, LATE_MAX = .55, DROP = .6;   // forgiving: almost any tap that isn't dead on the beat grooves

  const S = {};
  function load(i) {
    const L = LEVELS[i], tiles = []; B = 60 / L.bpm;
    // the melody picks the lane: low notes left, high notes right, like a keyboard
    const lo = Math.min(...L.mel), hi = Math.max(...L.mel);
    for (let k = 0; k < L.tiles; k++) { const m = L.mel[k % L.mel.length]; tiles.push({ t: 2.4 + k * B, lane: Math.min(3, Math.floor((m - lo) / (hi - lo + 1) * 4)), m, res: null, at: 0, n: k }); }
    Object.assign(S, { li: i, L, B, tiles, t: 0, state: 'intro', lockUntil: 0, solemn: 0, groove: 0, anger: 0, last: null, roll: 0, pops: [], endT: 0, reason: '', press: [-1, -1, -1, -1], beatN: -1 });
    API.autopilot = null;
  }
  const fallSpeed = () => 150 * (S.B / .75);   // px per second: one beat is always the same height on screen
  function pop(text, big) { S.pops.push({ text, t: S.t, big }); }
  function organ(m, d, g = .05) { const f = 440 * 2 ** ((m - 69) / 12); Audio.tone(f, d, 'sine', g); Audio.tone(f * 2, d, 'sine', g * .45); Audio.tone(f * 3, d * .8, 'sine', g * .25); Audio.tone(f / 2, d, 'triangle', g * .5); }

  const hz = m => 440 * 2 ** ((m - 69) / 12);
  function lead(m, d) { const t = S.L.lead; Audio.tone(hz(m), d, t, t === 'triangle' ? .09 : .045); Audio.tone(hz(m) * 1.005, d, t, t === 'triangle' ? .03 : .02); }
  function chordOf(bar) { const r = S.L.chords[bar % 4] + 12, mi = S.L.minor[bar % 4]; return [r, r + (mi ? 3 : 4), r + 7]; }
  // one beat of the band, scheduled ahead with the audio clock's own delay; it fades in as the chapel grooves
  function backing(bn) {
    const L = S.L, bar = Math.floor(bn / 4), bib = ((bn % 4) + 4) % 4, root = L.chords[((bar % 4) + 4) % 4], B = S.B;
    const band = clamp(S.groove / Math.max(1, L.need * .6)) * .9;
    Audio.tone(hz(root - 12), B * .6, 'sine', .05);                                   // the organ pedal: always there, so there is a beat
    if (band <= 0) return;
    const at = (list, fn) => { for (const o of list) if (o >= bib && o < bib + 1) fn((o - bib) * B); };
    const D = DR[L.drums];
    at(D.k, d => Audio.tone(110, .18, 'sine', .22 * band, 45, d));
    at(D.s, d => { Audio.noise(.12, .14 * band, d); Audio.tone(190, .08, 'triangle', .05 * band, null, d); });
    at(D.h, d => Audio.noise(.025, .045 * band, d));
    at(BASS[L.bass].map(x => x[0]), d => { const iv = BASS[L.bass].find(x => Math.abs(x[0] - (bib + d / B)) < 1e-6)[1]; Audio.tone(hz(root + iv), B * .4, 'triangle', .12 * band, null, d); });
    if (L.pad && bib === 0) for (const m of chordOf(bar)) Audio.tone(hz(m), B * 3.6, 'triangle', .025 * band);
  }
  function tap(lane) {
    if (S.state !== 'play') return;
    Audio.unlock(); S.press[lane] = S.t;
    // the last note
    if (S.last) {
      const d = S.t - S.last.t;
      // the last note spans every lane: tap anywhere when it reaches the line
      if (Math.abs(d) < .3) { S.last.res = 'on'; S.state = 'win'; S.endT = 0; chordOf(0).concat(S.L.chords[0] - 12).forEach(m => organ(m, 2.2, .045)); Audio.sfx('win'); }
      else if (d > -1.2) bump();
      return;
    }
    // nearest unplayed tile in that lane
    let best = null;
    // the earliest tile in that lane whose window this tap is inside (a late tap belongs to the tile it is late FOR,
    // not to the next one in the lane, which at fast tempos can be just as close)
    for (const x of S.tiles) if (x.res === null && x.lane === lane) { const d = S.t - x.t; if (d > -(ON + .05) && d < LATE_MAX) { best = x; break; } }
    if (!best) for (const x of S.tiles) if (x.res === null && x.lane === lane && Math.abs(S.t - x.t) < .5) { if (!best || Math.abs(S.t - x.t) < Math.abs(S.t - best.t)) best = x; }
    // a near-miss on the lane next door still counts
    if (!best) for (const l of [lane - 1, lane + 1]) for (const x of S.tiles) if (x.res === null && x.lane === l) { const d = S.t - x.t; if (d > -(ON + .05) && d < LATE_MAX) { best = x; break; } }
    if (!best) return sour('wrong');
    const d = S.t - best.t;
    best.at = S.t;
    if (Math.abs(d) < ON) {
      best.res = 'on'; S.anger = Math.max(0, S.anger - 6); S.solemn++;
      organ(best.m, S.B * .9); pop('TOO STIFF');
    } else if (d > LATE_MIN && d < LATE_MAX) {
      best.res = 'late'; S.groove++;
      lead(best.m, S.B * .5);
      pop(S.groove < 2 ? 'groove?' : S.groove < 5 ? 'GROOVE!' : `GROOVE x${S.groove}`);
      if (S.groove >= S.L.need && !S.last) spawnLast();
    } else { best.res = 'sour'; sour(); }
  }
  function sour() {
    S.anger += 12; Audio.tone(277, .3, 'sawtooth', .04); Audio.tone(294, .3, 'sawtooth', .04); pop('SOUR', true);
    if (S.anger >= 100) fail('GRANDMA THREW YOU OUT.');
  }
  // the casket bumps the door; the last note comes round again
  function bump() { S.last = { t: S.t + 2.0, lane: 1, res: null }; pop('BUMP! AGAIN...', true); Audio.tone(70, .3, 'sine', .2); }
  function spawnLast() {
    // the song stops; the doors are shut; one slow tile
    S.last = { t: S.t + 2.4, lane: 1, res: null };
    for (const x of S.tiles) if (x.res === null && x.t > S.t) x.res = 'skip';
  }
  function fail(reason) { if (S.state !== 'play') return; S.state = 'fail'; S.reason = reason; S.endT = 0; Audio.sfx('fail'); }

  function start() { S.state = 'play'; S.t = 0; S.lockUntil = .4; }
  function update(dt) {
    S.t += dt;
    if (S.state === 'intro') { if (API.autopilot) start(); return; }
    if (S.state !== 'play') { S.endT += dt; return; }
    S.roll = Math.min(S.roll + dt * .8, S.groove / S.L.need);
    // a soft pedal note on every beat so there is a beat to be late against
    const bn = Math.floor((S.t - 2.0) / S.B);
    if (!S.last && bn !== S.beatN && bn >= -1 && bn < S.L.tiles) { S.beatN = bn; backing(bn + 1); }
    const auto = API.autopilot; if (auto) autopilot(auto);
    // dropped tiles are sour
    for (const x of S.tiles) if (x.res === null && S.t - x.t > DROP) { x.res = 'miss'; S.anger += 6; if (S.anger >= 100) { fail('GRANDMA THREW YOU OUT.'); return; } }
    S.anger = Math.max(0, S.anger - dt * 3);   // Grandma calms down if you let her
    if (S.last && S.last.res === null && S.t - S.last.t > .35) bump();
    if (!S.last && S.tiles.every(x => x.res !== null)) fail('THE SONG ENDED. NOBODY MOVED.');
  }
  // test policies: 'groove' plays it late (on-beat when Grandma is cross), 'square' plays it perfectly, 'masher' mashes
  function autopilot(kind) {
    if (S.last) { if (S.last.res === null && S.t >= S.last.t) tap(S.last.lane); return; }
    for (const x of S.tiles) if (x.res === null) {
      const lateBy = kind === 'groove' && S.anger < 50 ? .24 : 0;
      if (kind === 'masher') { if (S.t >= x.t - .3) { tap((x.lane + 1) % 4); } break; }
      if (S.t >= x.t + lateBy) tap(x.lane);
      break;
    }
  }

  // ---------- the chapel, driven by state ----------
  function chapel() {
    const t = S.t, k = clamp(S.groove / 6), won = S.state === 'win', e = S.endT;
    rect(0, 40, W, 175, .42);
    for (const wx of [50, 120, 190]) {
      cx.fillStyle = g(.95); cx.beginPath(); cx.moveTo(wx - 9, 70); cx.lineTo(wx - 9, 56); cx.arc(wx, 56, 9, Math.PI, 0); cx.lineTo(wx + 9, 70); cx.fill();
      const lg = cx.createLinearGradient(0, 70, 0, 215); lg.addColorStop(0, g(.75)); lg.addColorStop(1, g(.42)); cx.fillStyle = lg; cx.beginPath(); cx.moveTo(wx - 9, 70); cx.lineTo(wx + 9, 70); cx.lineTo(wx + 26, 215); cx.lineTo(wx - 4, 215); cx.fill();
    }
    rect(0, 213, W, 37, .2); rect(0, 213, W, 1, 0);
    const open = won ? lin(e, .05, .4) : 0;
    rect(204, 120, 34, 94, 0);
    if (open > 0) { rect(206, 122, 30, 90, 1); rect(214, 170, 30, 30, 0); rect(214, 168, 30, 2, .6); const hd = lin(e, 1.2, 1.5); if (hd > 0) rect(212, 170, 4, 30 * hd, .5); }
    else { rect(206, 122, 14, 90, .3); rect(222, 122, 14, 90, .3); rect(219, 160, 2, 8, .9); }
    portrait(186, 172, won && e > 2.2);
    let cxp = mix(120, 168, ease(S.roll)) + (S.groove > 2 && !S.last ? Math.sin(t * Math.PI * 2 / S.B) * 1.5 : 0);
    if (won) cxp = mix(168, 232, ease(lin(e, .15, 1.1)));
    const casketY = won ? mix(205, 198, lin(e, .15, 1.1)) : 205;
    const ROW = [[60, 1], [80, 2], [100, 0], [140, 1], [160, 0], [180, 2]];
    const conga = lin(S.roll, .35, .6), leadX = Math.min(cxp, 168) - 46;
    const frozen = !!S.last && !won;
    ROW.forEach(([x0, hat], i) => {
      const kk = clamp((S.groove - i) / 3);
      const lineX = leadX - 16 - i * 13 + Math.sin(t * Math.PI / S.B + i) * 2 * conga;
      mourner(mix(x0, lineX, ease(conga)), mix(198, 212, ease(conga)), 40, hat, frozen ? 0 : t, frozen ? 0 : Math.max(kk, conga));
    });
    const dragging = S.roll > .08 && !(won && e > .3);
    grandma(dragging ? leadX : 64, 214, t, dragging ? (won ? .3 : 1) : 0, S.anger > 40);
    if (!(won && e > 1.2)) casket(cxp, casketY, S.roll > 0 && S.roll < 1 ? t : 0);
    for (const p of S.pops) { const d = t - p.t; if (d < .7) text(p.text, camX(), p.big ? 168 - d * 10 : 166 - d * 30, p.big ? 14 : 10, p.big ? 0 : 1); }
  }
  const camX = () => mix(112, 158, ease(S.roll)) + (S.state === 'win' ? 12 * lin(S.endT, .2, 1.1) : 0);

  function lanes() {
    const t = S.t;
    const fs = fallSpeed(), GY = HIT_Y + GROOVE_AT * fs;
    rect(0, LANES_Y, W, H - LANES_Y, 0);
    for (let l = 0; l <= 4; l++) rect(LANE_X(l) - 1, LANES_Y, 1, H - LANES_Y, .3);
    // two targets: the thin BEAT line (solemn) and, just below it, the bold GROOVE line (late = groove)
    // the last note is played ON the beat, so during it the labels swap
    rect(20, HIT_Y, 200, 1, .55); text(S.last ? 'LAST NOTE: TAP HERE' : 'too early', 222, HIT_Y + (S.last ? 14 : 3), S.last ? 8 : 7, S.last ? 1 : .7, 'right');
    rect(20, GY - 1, 200, 3, S.last ? .3 : 1); if (!S.last) text('TAP HERE', 222, GY + 13, 8, 1, 'right');
    for (let l = 0; l < 4; l++) if (t - S.press[l] < .12) rect(LANE_X(l) + 2, GY - 5, 46, 10, .7);
    for (const x of S.tiles) {
      if (x.res === 'skip') continue;
      const yy = x.res && x.res !== 'miss' ? HIT_Y - TILE_H + (t - x.at) * 400 : HIT_Y - (x.t - t) * fs - TILE_H;
      if (yy > KEYS_Y || yy + TILE_H < LANES_Y) continue;
      if (x.res && x.res !== 'miss' && t - x.at > .25) continue;
      rect(LANE_X(x.lane) + 3, Math.max(LANES_Y, yy), 44, Math.min(TILE_H, KEYS_Y - yy, yy + TILE_H - LANES_Y), x.res === 'late' ? .55 : x.res === 'on' ? .8 : x.res ? .3 : 1);
    }
    if (S.last && S.last.res === null) { const y = HIT_Y - (S.last.t - t) * 60 - TILE_H; rect(20, HIT_Y - 1, 200, 3, 1); const k = .5 + .5 * Math.sin(t * 10); rect(22, y, 196, TILE_H, 1); rect(25, y + 3, 190, TILE_H - 6, 0); text('LAST NOTE', 120, y + 20, 12, .7 + k * .3); }
    // the organ keys: each lane's keys light up as its tile reaches the GROOVE line, and flash when pressed
    const glow = [0, 0, 0, 0];
    for (const x of S.tiles) if (x.res === null) { const d = (x.t + GROOVE_AT) - t; if (d > -.15 && d < .6) glow[x.lane] = Math.max(glow[x.lane], 1 - Math.max(0, d) / .6); }
    if (S.last && S.last.res === null) { const d = S.last.t - t; if (d < 1.2) glow.fill(1 - Math.max(0, d) / 1.2); }
    for (let kk = 0; kk < 12; kk++) { const l = Math.min(3, Math.floor((kk * 17 + 8) / 50)); rect(20 + kk * 17, KEYS_Y + 2, 16, H - KEYS_Y - 2, .45 + glow[l] * .55); }
    for (const kk of [0, 1, 3, 4, 5, 7, 8, 10]) rect(32 + kk * 17, KEYS_Y + 2, 9, 22, 0);
    for (let l = 0; l < 4; l++) {
      if (glow[l] > .85) { rect(LANE_X(l) + 1, KEYS_Y - 3, 48, 3, 1); }
      if (t - S.press[l] < .15) { rect(LANE_X(l) + 1, KEYS_Y + 2, 48, H - KEYS_Y - 2, 0); rect(LANE_X(l) + 4, KEYS_Y + 6, 42, H - KEYS_Y - 10, 1); }
    }
  }
  function hud() {
    rect(0, 0, W, 40, 0);
    text(`${S.li + 1}/${LEVELS.length} ${S.L.name} '${String(S.L.year).slice(2)}`, 234, 13, 9, 1, 'right');
    // groove bar (casket to the door) and Grandma's patience
    rect(20, 19, 96, 7, .3); rect(20, 19, 96 * clamp(S.groove / S.L.need), 7, 1); text(`CASKET ▸ DOOR ${Math.min(S.groove, S.L.need)}/${S.L.need}`, 20, 36, 8, 1, 'left');
    rect(124, 19, 96, 7, .3); rect(124, 19, 96 * clamp(1 - S.anger / 100), 7, 1); text(`GRANDMA'S PATIENCE`, 124, 36, 8, 1, 'left');
    if (S.t < 2.4 && S.state === 'play' && S.groove === 0) { rect(8, 224, 224, 46, 0); text(`${S.L.who}'S LAST REQUEST`, 120, 240, 10, 1); text('TAP EACH TILE ON THE BOLD LINE', 120, 260, 10, 1); }
    if (S.last && S.last.res === null) text('ON THE BEAT THIS TIME. TAP ANYWHERE.', 120, 300, 9, 1);
  }
  function overlay() {
    if (S.state === 'intro') {
      rect(0, 0, W, H, 0); rect(10, 30, 220, 360, 1); rect(12, 32, 216, 356, 0);
      text(`FUNERAL ${S.li + 1}/${LEVELS.length}`, 120, 58, 11, 1);
      text(`${S.L.who}'S LAST REQUEST:`, 120, 82, 10, 1);
      text(`"${S.L.name}" (${S.L.year})`, 120, 100, 11, 1);
      const rules = ['HOW TO PLAY', 'TILES FALL IN 4 LANES.', 'TAP A TILE AS IT REACHES', 'THE BOLD LINE: A LITTLE LATE.', 'LATE = GROOVE. THE MOURNERS', 'DANCE AND THE CASKET ROLLS', 'TOWARD THE DOOR.', 'ON THE BEAT = TOO STIFF.', 'WRONG LANE OR MISSED TILES', 'ANNOY GRANDMA.', `GROOVE ${S.L.need} TIMES, THEN TAP`, 'THE LAST NOTE TO FINISH.'];
      rules.forEach((r, i) => text(r, 120, 132 + i * 17 + (i ? 6 : 0), i ? 9 : 11, i ? .85 : 1));
      if (S.t > .6) text('TAP TO START', 120, 370, 12, Math.sin(S.t * 5) > -.3 ? 1 : .7);
    }
    if (S.state === 'win') {
      const e = S.endT;
      if (e > 1.4) { rect(20, 60, 200, 60, 0); const k = back(lin(e, 1.4, 1.8)); cx.save(); cx.translate(120, 88); cx.scale(k, k); text('PERFECT', 0, 0, 22, 1); cx.restore(); text('★ ★ ★', 120, 110, 12, 1); }
      if (e > 2.6) { rect(40, 300, 160, 40, 1); rect(42, 302, 156, 36, 0); text(S.li < LEVELS.length - 1 ? 'NEXT FUNERAL' : 'FINISH', 120, 325, 13, 1); }
    }
    if (S.state === 'fail') {
      rect(10, 90, 220, 110, 0); text('FAIL', 120, 128, 30, 1);
      const words = S.reason.split(' '); let line = '', y = 152; for (const w of words) { if ((line + w).length > 20) { text(line, 120, y, 11, 1); line = ''; y += 15; } line += w + ' '; } text(line, 120, y, 11, 1);
      if (S.endT > .6) { rect(40, 300, 160, 40, 1); rect(42, 302, 156, 36, 0); text('TRY AGAIN', 120, 325, 14, 1); }
    }
    if (S.state === 'done') {
      rect(0, 0, W, H, 0);
      text('DEMO COMPLETE', 120, 150, 18, 1); text('TEN FUNERALS.', 120, 190, 12, 1); text('NOBODY CRIED.', 120, 208, 12, 1); text('GRANDPA WOULD BE PROUD.', 120, 236, 10, .85);
      text('TAP OR ESC: DISC MENU', 120, 320, 9, .8);
    }
  }
  function dither() {
    const img = cx.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, on = d[i] / 255 > (BAYER[y & 3][x & 3] + .5) / 16, c = on ? PAPER : INK; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    cx.putImageData(img, 0, 0);
  }
  function render(ctx) {
    TQ.length = 0; cx.setTransform(1, 0, 0, 1, 0, 0); rect(0, 0, W, H, 0);
    if (S.state !== 'done' && S.state !== 'intro') {
      const sh = S.groove > 4 && S.state === 'play' && !S.last ? Math.round(Math.sin(S.t * 40)) : 0;
      cx.save(); cx.beginPath(); cx.rect(0, 40, W, LANES_Y - 40); cx.clip(); cx.translate(120, 206 + sh); cx.scale(1.7, 1.7); cx.translate(-camX(), -214); chapel(); cx.restore();
      lanes(); hud();
    }
    overlay();
    dither();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, W, H, 0, 0, LW, LH);
    drawText(ctx);
  }

  // ---------- input ----------
  function next() { if (S.li < LEVELS.length - 1) load(S.li + 1); else S.state = 'done'; }
  function onPointer(type, x, y) {
    if (type !== 'down') return;
    const lx = x / SCALE, ly = y / SCALE;
    if (S.state === 'intro') { if (S.t > .6) start(); return; }
    if (S.state === 'play' && S.t < S.lockUntil) return;
    if (S.state === 'done') { Engine.exit(); return; }
    if (S.state === 'fail' && S.endT > .6) { load(S.li); return; }
    if (S.state === 'win' && S.endT > 2.6) { next(); return; }
    if (ly > LANES_Y) { const lane = Math.floor((lx - 20) / 50); if (lane >= 0 && lane < 4) tap(lane); }
  }
  const KEYS = { d: 0, D: 0, f: 1, F: 1, j: 2, J: 2, k: 3, K: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
  function onKey(key, down) {
    if (!down) return;
    if (S.state === 'intro') { if (S.t > .6 && (key === 'Enter' || key === ' ')) start(); return; }
    if (S.state === 'done' && (key === 'Enter' || key === ' ')) { Engine.exit(); return; }
    if (S.state === 'fail' && S.endT > .6 && (key === 'Enter' || key === ' ')) { load(S.li); return; }
    if (S.state === 'win' && S.endT > 2.6 && (key === 'Enter' || key === ' ')) { next(); return; }
    if (key in KEYS) tap(KEYS[key]);
  }

  const API = { LEVELS, S, load, start, tap, autopilot: null, step: n => game.step(n), get state() { return S.state; } };
  load(0);
  const game = createGame({ canvas: document.getElementById('c'), width: LW, height: LH, update, render, onPointer, onKey });
  window.__game = API;
})();
