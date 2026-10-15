// Render a canvas trailer to trailers/<name>.mp4 (+ .jpg poster): node trailers/src/render.mjs <name>
let chromium; try { ({ chromium } = await import('playwright')); } catch (_) { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }
import { spawnSync } from 'child_process';
import fs from 'fs'; import path from 'path'; import os from 'os';
const name = process.argv[2], here = path.dirname(new URL(import.meta.url).pathname), out = path.resolve(here, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'film-')), FPS = 24;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 720, height: 1280 } });
await p.goto(`file://${here}/film.html?film=${name}`); p.on('pageerror', e => console.error('film error:', e.message));
await p.waitForFunction(() => typeof FILM !== 'undefined');
const dur = await p.evaluate(() => FILM.dur);
for (let f = 0; f < dur * FPS; f++) {
  const url = await p.evaluate(t => { const c = document.getElementById('c'), ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); FILM.draw(ctx, t); return c.toDataURL('image/png'); }, f / FPS);
  fs.writeFileSync(path.join(tmp, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
const wav = await p.evaluate(async () => {
  const sr = 44100, ac = new OfflineAudioContext(2, Math.ceil(FILM.dur * sr), sr); FILM.score(ac); const buf = await ac.startRendering();
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), dv = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let s = ''; const u = new Uint8Array(dv.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s);
});
fs.writeFileSync(path.join(tmp, 'a.wav'), Buffer.from(wav, 'base64'));
await b.close();
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png'), '-i', path.join(tmp, 'a.wav'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', path.join(out, `${name}.mp4`)], { stdio: 'inherit' });
spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(tmp, 'f0072.png'), '-q:v', '5', path.join(out, `${name}.jpg`)], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true });
console.log(r.status === 0 ? `wrote trailers/${name}.mp4` : 'ffmpeg failed');
