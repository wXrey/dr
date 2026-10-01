// Dev tool: capture a burst of screenshots around the player from the debug Chromium (CDP :9333)
// while holding keys, and tile them into one contact sheet.
// usage: node tools/burst.mjs out.jpg "KeyD:2000,Space@800:80" frames=12 every=80 w=520 h=360 delay=300
import sharp from 'sharp';
const [out, plan = '', ...kv] = process.argv.slice(2);
const o = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
const frames = o.frames || 12, every = o.every || 80, W = o.w || 520, H = o.h || 360, delay = o.delay || 300, cols = o.cols || 4;
const list = await (await fetch('http://127.0.0.1:9333/json')).json(); const t = list.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const key = (type, code) => send('Input.dispatchKeyEvent', { type, code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: code === 'Space' ? 32 : code.charCodeAt(3) });
const vp = (await send('Runtime.evaluate', { expression: '[innerWidth, innerHeight]', returnByValue: true })).result.result.value;
const jobs = [];
for (const p of plan.split(',').filter(Boolean)) { const [ca, dur] = p.split(':'); const [code, at] = ca.split('@');
  jobs.push((async () => { await new Promise(r => setTimeout(r, +(at || 0))); await key('keyDown', code); await new Promise(r => setTimeout(r, +dur)); await key('keyUp', code); })()); }
const shots = [];
jobs.push((async () => { await new Promise(r => setTimeout(r, delay));
  for (let i = 0; i < frames; i++) { const t0 = Date.now();
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { x: vp[0] / 2 - W / 2, y: vp[1] / 2 - H / 2 + (o.dy || 10), width: W, height: H, scale: o.scale || 1 } });
    shots.push(Buffer.from(r.result.data, 'base64')); await new Promise(r2 => setTimeout(r2, Math.max(0, every - (Date.now() - t0)))); } })());
await Promise.all(jobs); ws.close();
const SC = o.scale || 1; const imgs = await Promise.all(shots.map(b => sharp(b).resize(Math.round(W * SC), Math.round(H * SC)).toBuffer()));
const rows = Math.ceil(imgs.length / cols);
await sharp({ create: { width: Math.round(W * SC) * cols, height: Math.round(H * SC) * rows, channels: 3, background: '#000' } })
  .composite(imgs.map((b, i) => ({ input: b, left: (i % cols) * Math.round(W * SC), top: Math.floor(i / cols) * Math.round(H * SC) }))).jpeg({ quality: 82 }).toFile(out);
console.log('saved', out, imgs.length, 'frames');
