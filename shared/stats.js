// Anonymous play stats. No cookies, no ids, nothing personal: only which ad was watched, for how long,
// which game was played and for how long. Events go to GoatCounter once GC_CODE is set; until then
// (and always, for the last 300 events) they stay in this browser's localStorage under 'disc.stats'.
(function () {
  'use strict';
  const GC_CODE = '';   // your GoatCounter site code, e.g. 'demodisc' for demodisc.goatcounter.com
  const live = GC_CODE && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname);
  const sent = [];
  function event(path, title) {
    const e = { t: Date.now(), path };
    sent.push(e);
    try { const log = JSON.parse(localStorage.getItem('disc.stats') || '[]'); log.push(e); localStorage.setItem('disc.stats', JSON.stringify(log.slice(-300))); } catch (_) {}
    if (!live) return;
    const q = new URLSearchParams({ p: path, t: title || path, e: 'true', s: `${screen.width},${screen.height},${devicePixelRatio || 1}`, rnd: Math.random().toString(36).slice(2) });
    const url = `https://${GC_CODE}.goatcounter.com/count?${q}`;
    try { if (!(navigator.sendBeacon && navigator.sendBeacon(url))) new Image().src = url; } catch (_) {}
  }
  const bucket = (s, cuts) => { for (const [lim, name] of cuts) if (s < lim) return name; return cuts[cuts.length - 1][1]; };
  window.Stats = { event, bucket, sent, get live() { return !!live; } };
})();
