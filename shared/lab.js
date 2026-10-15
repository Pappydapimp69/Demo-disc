// DEMO DISC lab kit: the few games that run a real experiment on their players use this.
// It assigns a condition (an "arm") per player or per round and keeps the full event log on this device. Results
// leave only as anonymous counts through the disc's play stats (report), which the games disclose on screen.
// Storage can be missing (private mode, file://, blocked site data); then the log lives in memory for the visit.
(function () {
  'use strict';
  const VERSION = 1, MAX_EVENTS = 5000;
  const rid = () => Math.random().toString(36).slice(2, 10);

  function create(game) {
    const key = 'disc-lab:' + game;
    let st = null;
    try { st = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
    if (!st || st.v !== VERSION) st = { v: VERSION, pid: rid(), created: Date.now(), arms: {}, blocks: {}, events: [] };
    const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch (_) {} };
    // ?lab-<name>=<value> pins an arm (for testing a build, or running a session in a known condition)
    const pinned = name => { try { return new URLSearchParams(location.search).get('lab-' + name); } catch (_) { return null; } };

    const lab = {
      game,
      clock: () => Date.now(),                       // tests replace this to move through days
      get pid() { return st.pid; },
      get events() { return st.events; },
      get arms() { return st.arms; },
      // a between-player condition: drawn once, then the same on every visit
      arm(name, options) {
        const pin = pinned(name);
        if (pin && options.includes(pin)) { if (st.arms[name] !== pin) { st.arms[name] = pin; lab.log('arm', { name, value: pin, pinned: true }); } return pin; }
        if (!options.includes(st.arms[name])) { st.arms[name] = options[Math.floor(Math.random() * options.length)]; lab.log('arm', { name, value: st.arms[name] }); }
        return st.arms[name];
      },
      // a within-player condition: each call takes the next value from a shuffled block holding every option twice,
      // so a short session still sees both conditions about equally and never in a fixed order
      next(name, options) {
        const pin = pinned(name); if (pin && options.includes(pin)) return pin;
        let b = st.blocks[name];
        if (!b || !b.length) { b = options.concat(options); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } }
        const v = b.shift(); st.blocks[name] = b; save(); return v;
      },
      log(type, data = {}) {
        st.events.push(Object.assign({ t: lab.clock(), type }, data));
        if (st.events.length > MAX_EVENTS) st.events.splice(0, st.events.length - MAX_EVENTS);
        save();
      },
      // an anonymous result count through the disc's play stats (an event name only: no player id, no log)
      report(name) { lab.log('report', { name }); try { Engine.track(name); } catch (_) {} },
      // game state that must survive a reload (e.g. a schedule over days) rides along in the same store
      get data() { return st.data || (st.data = {}); },
      save,
      export() {
        let device = {};
        try { device = { touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0, w: screen.width, h: screen.height }; } catch (_) {}
        return JSON.stringify({ game, version: VERSION, pid: st.pid, created: st.created, exported: lab.clock(), arms: st.arms, device, events: st.events }, null, 1);
      },
      // hand the player the file; fall back to the clipboard where downloads are blocked
      download() {
        const text = lab.export(), name = `${game}-lab-${st.pid}.json`;
        try {
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return 'download';
        } catch (_) {}
        try { navigator.clipboard.writeText(text); return 'clipboard'; } catch (_) {}
        return 'none';
      },
      reset() { st = { v: VERSION, pid: rid(), created: Date.now(), arms: {}, blocks: {}, events: [] }; save(); },
    };
    return lab;
  }
  window.Lab = { create };
})();
