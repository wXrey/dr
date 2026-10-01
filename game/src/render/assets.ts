// Texture registry. Resolves keyword queries (e.g. ['enemies', 'werewolf|wolf', '!alpha']) against
// public/assets/manifest.json (written by tools/process-assets.mjs), and falls back to generated
// placeholder art for anything that has not been generated yet.
import { Assets, Graphics, Texture, type Renderer } from 'pixi.js';
import embedded from 'virtual:embedded-assets';

interface Entry { kind: 'sprite' | 'sheet' | 'tile' | 'screen'; file?: string; pieces?: { file: string; center: [number, number] }[]; }
let manifest: Record<string, Entry> = {};
const tex = new Map<string, Texture>();
let renderer: Renderer;

export async function loadAssets(r: Renderer, onProgress?: (f: number) => void) {
  renderer = r;
  if (embedded) manifest = embedded.manifest;
  else { try { manifest = await (await fetch('assets/manifest.json', { cache: 'no-cache' })).json(); } catch { manifest = {}; } }
  const files: string[] = [];
  for (const e of Object.values(manifest)) { if (e.file) files.push(e.file); if (e.pieces) for (const p of e.pieces) files.push(p.file); }
  let done = 0;
  await Promise.all(files.map(async f => {
    try {
      let t: Texture;
      if (embedded) { const img = new Image(); img.src = embedded.data[f]; await img.decode(); t = Texture.from(img); }
      else t = await Assets.load<Texture>(f);
      t.source.scaleMode = 'linear'; tex.set(f, t);
    } catch { /* missing file: placeholder */ }
    onProgress?.(++done / Math.max(1, files.length));
  }));
}

function match(key: string, terms: string[]) {
  const name = key.slice(key.indexOf('/') + 1);
  return terms.every(t => t.startsWith('!') ? !t.slice(1).split('|').some(x => name.includes(x)) : t.split('|').some(x => name.includes(x)));
}
function find(q: string[], kinds: Entry['kind'][]) {
  const [cat, ...terms] = q;
  for (const [k, e] of Object.entries(manifest)) if (k.startsWith(cat + '/') && kinds.includes(e.kind) && match(k, terms)) return e;
  return null;
}
/** single sprite (or null if not generated yet) */
export function sprite(q: string[]): Texture | null { const e = find(q, ['sprite']); return (e?.file && tex.get(e.file)) || null; }
/** pieces of a sheet in reading order */
export function pieces(q: string[]): Texture[] { const e = find(q, ['sheet']); return (e?.pieces || []).map(p => tex.get(p.file)).filter((t): t is Texture => !!t); }
export function tile(q: string[]): Texture | null { const e = find(q, ['tile']); return (e?.file && tex.get(e.file)) || null; }
/** URL usable in <img>/CSS: the file path, or its data URI in the single-file build */
export const fileUrl = (f: string | undefined | null) => (f ? (embedded ? embedded.data[f] : f) : null);
export function screenUrl(q: string[]): string | null { return fileUrl(find(q, ['screen'])?.file); }
export function spriteUrl(q: string[]): string | null { return fileUrl(find(q, ['sprite'])?.file); }
export function pieceUrls(q: string[]): string[] { return (find(q, ['sheet'])?.pieces || []).map(p => fileUrl(p.file)!); }

// ------------------------------------------------------------ placeholders
const ph = new Map<string, Texture>();
export function gen(key: string, draw: (g: Graphics) => void): Texture {
  let t = ph.get(key); if (t) return t;
  const g = new Graphics(); draw(g);
  t = renderer.generateTexture({ target: g, resolution: 2, antialias: true }); g.destroy(); ph.set(key, t); return t;
}
/** placeholder humanoid/creature: body blob with eyes, sized ~h px */
export function placeholderBody(key: string, col: number, h: number, opts: { eyes?: number; hood?: boolean; wide?: number } = {}) {
  return gen('ph_' + key, g => {
    const w = h * (opts.wide ?? 0.55);
    g.roundRect(-w / 2, -h, w, h * 0.92, w * 0.45).fill({ color: col });
    g.roundRect(-w / 2, -h, w, h * 0.92, w * 0.45).stroke({ color: 0x000000, width: 2, alpha: 0.5 });
    if (opts.hood) g.ellipse(0, -h * 0.82, w * 0.42, h * 0.16).fill({ color: 0x2a2d34 });
    const ey = -h * 0.78, ec = opts.eyes ?? 0x1b1714;
    g.circle(-w * 0.16, ey, Math.max(1.5, h * 0.035)).fill({ color: ec }); g.circle(w * 0.16, ey, Math.max(1.5, h * 0.035)).fill({ color: ec });
  });
}
export const circleTex = () => gen('circle', g => g.circle(0, 0, 16).fill({ color: 0xffffff }));
export const softTex = () => gen('soft', g => { for (let i = 10; i > 0; i--) g.circle(0, 0, i * 3).fill({ color: 0xffffff, alpha: 0.06 }); });
export const shadowTex = () => gen('shadow', g => g.ellipse(0, 0, 32, 12).fill({ color: 0x000000, alpha: 0.35 }));
export function radialTexture(size: number, stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return Texture.from(c);
}
