// Procedural effect textures (canvas gradients), drawn additively.
import { Texture } from 'pixi.js';

const cache = new Map<string, Texture>();
function canvasTex(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  let t = cache.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  t = Texture.from(c); cache.set(key, t); return t;
}

/** bullet tracer: faint tail on the left, white-hot head on the right (anchor the head) */
export function tracerTex(kind: 'ball' | 'pellet' | 'long') {
  const len = kind === 'long' ? 120 : kind === 'pellet' ? 34 : 56, th = kind === 'pellet' ? 6 : 8;
  return canvasTex('tr_' + kind, len + 8, th * 2, x => {
    const cy = th, g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, 'rgba(255,170,60,0)'); g.addColorStop(0.7, 'rgba(255,200,110,0.55)'); g.addColorStop(1, 'rgba(255,240,200,1)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, cy); x.lineTo(len, cy - th * 0.45); x.lineTo(len, cy + th * 0.45); x.closePath(); x.fill();
    const r = x.createRadialGradient(len, cy, 0, len, cy, th); r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(0.4, 'rgba(255,220,150,0.8)'); r.addColorStop(1, 'rgba(255,160,60,0)');
    x.fillStyle = r; x.beginPath(); x.arc(len, cy, th, 0, Math.PI * 2); x.fill();
  });
}
/** muzzle flash: hot core + forward-biased spikes (points along +x) */
export function flashTex() {
  return canvasTex('flash', 96, 64, x => {
    const cx = 24, cy = 32;
    const spike = (ang: number, len: number, wd: number) => {
      const g = x.createLinearGradient(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(1, 'rgba(255,160,40,0)');
      x.fillStyle = g; x.beginPath();
      x.moveTo(cx + Math.cos(ang + Math.PI / 2) * wd, cy + Math.sin(ang + Math.PI / 2) * wd);
      x.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      x.lineTo(cx + Math.cos(ang - Math.PI / 2) * wd, cy + Math.sin(ang - Math.PI / 2) * wd); x.closePath(); x.fill();
    };
    spike(0, 70, 9); spike(0.55, 34, 6); spike(-0.55, 34, 6); spike(1.4, 18, 4); spike(-1.4, 18, 4); spike(Math.PI, 12, 4);
    const r = x.createRadialGradient(cx, cy, 0, cx, cy, 18); r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(1, 'rgba(255,190,80,0)');
    x.fillStyle = r; x.beginPath(); x.arc(cx, cy, 18, 0, Math.PI * 2); x.fill();
  });
}
/** short bright streak for sparks (points along +x) */
export function sparkTex() {
  return canvasTex('spark', 32, 6, x => {
    const g = x.createLinearGradient(0, 0, 32, 0); g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,250,220,1)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 3); x.lineTo(32, 1); x.lineTo(32, 5); x.closePath(); x.fill();
  });
}

/** small jagged shard (bone chips, debris) — tint it */
export function shardTex(i: number) {
  return canvasTex('shard' + (i % 3), 16, 16, x => {
    x.fillStyle = '#fff'; x.beginPath();
    const pts = [[[2, 7], [9, 2], [14, 6], [8, 13]], [[1, 9], [6, 3], [15, 8], [7, 12]], [[3, 4], [13, 3], [11, 12], [4, 11]]][i % 3];
    x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.closePath(); x.fill();
  });
}
/** soft droplet with a highlight — tint it */
export function dropTex() {
  return canvasTex('drop', 12, 12, x => {
    const r = x.createRadialGradient(5, 5, 0, 6, 6, 6); r.addColorStop(0, '#fff'); r.addColorStop(0.7, '#ddd'); r.addColorStop(1, 'rgba(200,200,200,0)');
    x.fillStyle = r; x.beginPath(); x.arc(6, 6, 6, 0, Math.PI * 2); x.fill();
  });
}
