// Asset pipeline: ../assets/<category>/* (Grok output, magenta background) -> public/assets/**
//  - sprites: background keyed out (edge-connected flood + soft matte + despill), trimmed, downscaled
//  - sheets (*parts*, props/*, *icons*, *gems*): keyed, then split into one PNG per piece
//  - tiles: resized square textures, no keying
//  - screens: resized backgrounds, no keying
// Writes public/assets/manifest.json describing everything produced.
// usage: node tools/process-assets.mjs [--only <substring>] [--preview]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.resolve(ROOT, '../assets');
const OUT = path.resolve(ROOT, 'public/assets');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const preview = args.includes('--preview');

const MAX = { player: 512, enemies: 384, bosses: 640, pets: 256, weapons: 256, items: 256, props: 384 };
const T_LO = 34, T_HI = 66;          // chroma-weighted distance to the background colour: <LO = clear, >HI = solid
const IMG = /\.(jpe?g|png|webp)$/i;

const isSheet = (cat, name) => /parts|icons|gems|sheet/.test(name) || cat === 'props';

function bgColor(d, w, h) {
  const rs = [], gs = [], bs = [];
  const take = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  for (let x = 0; x < w; x += 2) for (const y of [0, 1, 2, h - 1, h - 2, h - 3]) take(x, y);
  for (let y = 0; y < h; y += 2) for (const x of [0, 1, 2, w - 1, w - 2, w - 3]) take(x, y);
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}
const ycc = (r, g, b) => [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, 128 + 0.5 * r - 0.4187 * g - 0.0813 * b];

// returns RGBA buffer with background removed
function key(d, w, h) {
  const bg = bgColor(d, w, h), [by, bcb, bcr] = ycc(...bg);
  const n = w * h, dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [y, cb, cr] = ycc(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    dist[i] = Math.sqrt(((y - by) * 0.45) ** 2 + (cb - bcb) ** 2 + (cr - bcr) ** 2);
  }
  // flood from the border through background-like pixels only
  const isBg = new Uint8Array(n), stack = [];
  const push = i => { if (!isBg[i] && dist[i] < T_HI) { isBg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  // enclosed pockets of background (e.g. between cloak and arm): regions very close to the bg colour
  // that the border flood could not reach
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (isBg[s] || seen[s] || dist[s] >= T_LO) continue;
    const region = [s], st = [s]; seen[s] = 1;
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || seen[j] || isBg[j] || dist[j] >= T_HI) continue;
        seen[j] = 1; st.push(j); region.push(j);
      }
    }
    if (region.length >= 24) for (const i of region) isBg[i] = 1;
  }
  const out = Buffer.from(d);
  for (let i = 0; i < n; i++) {
    let a = 255;
    if (isBg[i]) a = Math.round(255 * Math.min(1, Math.max(0, (dist[i] - T_LO) / (T_HI - T_LO))));
    out[i * 4 + 3] = a;
  }
  // despill magenta on pixels at or next to the matte edge
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (out[i * 4 + 3] === 0) continue;
    let edge = out[i * 4 + 3] < 255;
    if (!edge) for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < n && out[j * 4 + 3] < 255) { edge = true; break; }
    if (!edge) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2], m = Math.min(r, b);
    if (m > g) { out[i * 4] = r - (m - g) * 0.85; out[i * 4 + 2] = b - (m - g) * 0.85; }
  }
  return out;
}

// connected pieces of the alpha mask (dilated so nearby fragments like scarf strands merge)
function pieces(rgba, w, h, dilate = 7, minFrac = 0.0008) {
  const n = w * h, solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  // box dilation via two separable passes
  const tmp = new Uint8Array(n), dil = new Uint8Array(n);
  for (let y = 0; y < h; y++) { let run = -1e9; for (let x = 0; x < w; x++) { if (solid[y * w + x]) run = x; tmp[y * w + x] = x - run <= dilate ? 1 : 0; }
    run = 1e9; for (let x = w - 1; x >= 0; x--) { if (solid[y * w + x]) run = x; if (run - x <= dilate) tmp[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let run = -1e9; for (let y = 0; y < h; y++) { if (tmp[y * w + x]) run = y; dil[y * w + x] = y - run <= dilate ? 1 : 0; }
    run = 1e9; for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) run = y; if (run - y <= dilate) dil[y * w + x] = 1; } }
  const lab = new Int32Array(n).fill(-1), boxes = [];
  for (let s = 0; s < n; s++) {
    if (!dil[s] || lab[s] >= 0) continue;
    const id = boxes.length, st = [s]; lab[s] = id;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      if (solid[i]) { area++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || lab[j] >= 0 || !dil[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        lab[j] = id; st.push(j);
      }
    }
    boxes.push({ x0, y0, x1, y1, area });
  }
  const keep = boxes.filter(b => b.area >= n * minFrac && b.x1 > b.x0);
  // reading order: rows (by centre y, banded), then x
  const band = h / 8;
  keep.sort((a, b) => Math.round((a.y0 + a.y1) / 2 / band) - Math.round((b.y0 + b.y1) / 2 / band) || a.x0 - b.x0);
  return keep;
}

async function saveSprite(rgba, w, h, box, file, maxSide, fixedScale) {
  const pad = 4;
  const left = Math.max(0, box.x0 - pad), top = Math.max(0, box.y0 - pad);
  const width = Math.min(w, box.x1 + pad + 1) - left, height = Math.min(h, box.y1 + pad + 1) - top;
  let img = sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extract({ left, top, width, height });
  const scale = fixedScale ?? Math.min(1, maxSide / Math.max(width, height));
  const ow = Math.max(1, Math.round(width * scale)), oh = Math.max(1, Math.round(height * scale));
  if (scale < 1) img = sharp(await img.png().toBuffer()).resize(ow, oh, { kernel: 'lanczos3' });
  await img.png({ compressionLevel: 9 }).toFile(file);
  return { w: ow, h: oh, src: [left, top, width, height] };
}

function alphaBox(rgba, w, h) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

const manifest = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : {};
const watch = args.includes('--watch'), force = args.includes('--force');

async function processFile(cat, f) {
  const name = f.replace(IMG, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const key_ = `${cat}/${name}`;
  if (only && !key_.includes(only)) return false;
  const srcFile = path.join(SRC, cat, f);
  const mtime = fs.statSync(srcFile).mtimeMs;
  if (!force && !only && manifest[key_]?.srcMtime === mtime) return false;
  const outDir = path.join(OUT, cat); fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  if (cat === 'tiles') {
    await sharp(srcFile).resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(path.join(outDir, name + '.png'));
    manifest[key_] = { kind: 'tile', file: `assets/${cat}/${name}.png`, w: 512, h: 512 };
  } else if (cat === 'screens') {
    await sharp(srcFile).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 86 }).toFile(path.join(outDir, name + '.jpg'));
    manifest[key_] = { kind: 'screen', file: `assets/${cat}/${name}.jpg` };
  } else {
    const { data, info } = await sharp(srcFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = key(data, info.width, info.height);
    const maxSide = MAX[cat] || 384;
    if (isSheet(cat, name)) {
      // Limb grids need narrow joining: a long cloak must not merge with the arm below it.
      const limbSheet = /parts/.test(name);
      const ps = pieces(rgba, info.width, info.height, limbSheet ? 2 : 7);
      if (limbSheet) ps.sort((a, b) =>
        Math.round(a.y0 / (info.height / 3)) - Math.round(b.y0 / (info.height / 3)) || a.x0 - b.x0);
      // one scale for the whole sheet so pieces keep their relative sizes (essential for rigs)
      const biggest = Math.max(1, ...ps.map(b => Math.max(b.x1 - b.x0, b.y1 - b.y0)));
      const sheetScale = Math.min(1, (limbSheet ? 420 : Math.round(maxSide * 0.75)) / biggest);
      const list = [];
      for (let k = 0; k < ps.length; k++) {
        const file = `${name}_${String(k).padStart(2, '0')}.png`;
        const r = await saveSprite(rgba, info.width, info.height, ps[k], path.join(outDir, file), 0, sheetScale);
        list.push({ file: `assets/${cat}/${file}`, ...r, center: [(ps[k].x0 + ps[k].x1) / 2 / info.width, (ps[k].y0 + ps[k].y1) / 2 / info.height] });
      }
      manifest[key_] = { kind: 'sheet', sheetSize: [info.width, info.height], scale: sheetScale, pieces: list };
      if (preview) {
        const svg = `<svg width="${info.width}" height="${info.height}">${ps.map((b, k) =>
          `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#0f0" stroke-width="3"/><text x="${b.x0 + 4}" y="${b.y0 + 34}" font-size="34" font-family="Arial" fill="#0f0" stroke="#000" stroke-width="1.5">${k}</text>`).join('')}</svg>`;
        await sharp({ create: { width: info.width, height: info.height, channels: 4, background: '#202020' } })
          .composite([{ input: await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer() }, { input: Buffer.from(svg) }])
          .jpeg().toFile(path.join(ROOT, 'tools', `preview_${cat}_${name}.jpg`));
      }
    } else {
      const r = await saveSprite(rgba, info.width, info.height, alphaBox(rgba, info.width, info.height), path.join(outDir, name + '.png'), maxSide);
      manifest[key_] = { kind: 'sprite', file: `assets/${cat}/${name}.png`, w: r.w, h: r.h };
      if (preview) await sharp(path.join(outDir, name + '.png')).flatten({ background: '#202020' }).jpeg().toFile(path.join(ROOT, 'tools', `preview_${cat}_${name}.jpg`));
    }
  }
  manifest[key_].srcMtime = mtime;
  console.log(`${key_.padEnd(36)} ${manifest[key_].kind.padEnd(6)} ${manifest[key_].pieces ? manifest[key_].pieces.length + ' pieces ' : ''}${Date.now() - t0}ms`);
  return true;
}
function save() { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1)); }
async function runAll() {
  let count = 0;
  for (const cat of fs.readdirSync(SRC).filter(c => fs.statSync(path.join(SRC, c)).isDirectory()))
    for (const f of fs.readdirSync(path.join(SRC, cat)).filter(f => IMG.test(f))) {
      try { if (await processFile(cat, f)) count++; } catch (e) { console.error(`failed ${cat}/${f}:`, e.message); }
    }
  if (count) save();
  return count;
}
const n = await runAll();
console.log(`processed ${n} new/changed file(s) -> public/assets/manifest.json (${Object.keys(manifest).length} entries)`);
if (watch) {
  console.log(`watching ${SRC} for new art…`);
  let timer = null, busy = false;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { if (busy) return; busy = true; try { const k = await runAll(); if (k) console.log(`  +${k} file(s) processed, manifest updated`); } finally { busy = false; } }, 800);
  });
}
