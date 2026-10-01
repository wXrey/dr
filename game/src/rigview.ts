// Dev page (/rig.html): every cut-out rig side by side, large, to tune LAYOUT in src/render/rig.ts.
// ?mode=idle|walk|attack|roll  &joints=1 draws joint pivots  &t=1.3 freezes time at t seconds
import { Application, Container, Graphics } from 'pixi.js';
import { loadAssets, pieces } from './render/assets';
import { Rig, type RigKind } from './render/rig';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') || 'walk', joints = q.has('joints'), freeze = q.has('t') ? +q.get('t')! : null;
const app = new Application();
await app.init({ resizeTo: window, background: '#2b2e36', antialias: true, autoDensity: true, resolution: Math.min(2, devicePixelRatio) });
document.body.appendChild(app.canvas);
await loadAssets(app.renderer);
const kinds: [RigKind, string[]][] = [['light', ['player', 'light', 'parts']], ['heavy', ['player', 'heavy', 'parts']], ['skeleton', ['enemies', 'skeleton', 'parts']], ['zombie', ['enemies', 'zombie', 'parts']]];
const rigs: { rig: Rig; c: Container; dots: Graphics }[] = [];
kinds.forEach(([k, qry], i) => {
  const tex = pieces(qry); if (tex.length < 8) return;
  const rig = new Rig(tex, k, 280), c = new Container(), dots = new Graphics();
  c.position.set(innerWidth * (i + 0.5) / 4, innerHeight * 0.5 + 170); c.addChild(new Graphics().ellipse(0, 0, 70, 14).fill({ color: 0, alpha: 0.3 }), rig.root, dots);
  app.stage.addChild(c); rigs.push({ rig, c, dots });
});
(window as any).rigs = rigs;
document.getElementById("hud")!.textContent = `mode=${mode} · ${rigs.map(r => r.rig.kind).join(', ')}`;
let t = 0;
app.ticker.add(tk => {
  const dt = freeze !== null ? 0 : tk.deltaMS / 1000; t += dt;
  for (const { rig, dots } of rigs) {
    if (freeze !== null && rig.t === 0) { rig.t = freeze; rig.phase = freeze * 7; }
    const cyc = (t % 1.2) / 1.2;
    rig.update(freeze !== null ? 1 / 60 : dt, { moving: mode === 'walk' ? 1 : 0, speed: 180, dirX: 1, aim: mode === 'attack' ? 0.2 : 0.4,
      mode: rig.kind === 'zombie' ? 'claw' : rig.kind === 'skeleton' || mode === 'attack' ? 'melee' : 'gun', swing: mode === 'attack' ? Math.min(1, cyc * 2) : -1,
      roll: mode === 'roll' ? cyc : 0, rollDir: 1 });
    dots.clear();
    if (joints) for (const [name, jt] of Object.entries(rig.j)) {
      if (!jt) continue; const p = dots.toLocal(jt.c.getGlobalPosition());
      dots.circle(p.x, p.y, 4).fill({ color: name.startsWith('arm') || name === 'hand' ? 0x44ff88 : 0xff4466 });
    }
  }
});
