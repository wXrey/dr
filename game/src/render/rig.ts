// Cut-out character rigs built from the generated body-part sheets (player/knight-*-parts,
// enemies/skeleton-parts, enemies/zombie-parts). Joints are containers; each part sprite hangs
// from its joint by its anchor (the pivot). Everything is animated procedurally.
import { Container, Sprite, type Texture } from 'pixi.js';
import { TAU, clamp, lerp } from '../core/math';

export type RigKind = 'light' | 'heavy' | 'skeleton' | 'zombie';
type Slot = 'cape' | 'head' | 'torso' | 'pelvis' | 'tabard' | 'scarf' | 'paulL' | 'paulR' | 'uarmL' | 'uarmR' | 'farmL' | 'farmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'held';

/** which piece of the processed sheet fills each slot (sheets are grids read row by row; L = viewer's left) */
export const PART_MAP: Record<RigKind, Partial<Record<Slot, number>>> = {
  light: { head: 0, torso: 1, cape: 2, scarf: 3, uarmL: 4, farmL: 5, uarmR: 6, farmR: 7, thighL: 8, shinL: 9, thighR: 10, shinR: 11 },
  heavy: { head: 0, torso: 1, cape: 2, tabard: 3, paulL: 4, uarmL: 5, farmL: 6, paulR: 7, uarmR: 8, farmR: 9, thighL: 10, shinL: 11, thighR: 12, shinR: 13 },
  skeleton: { head: 0, torso: 1, pelvis: 2, held: 3, uarmL: 4, farmL: 5, uarmR: 6, farmR: 7, thighL: 8, shinL: 9, thighR: 10, shinR: 11 },
  zombie: { head: 0, torso: 1, uarmL: 2, farmL: 3, uarmR: 4, farmR: 5, thighL: 6, shinL: 7, thighR: 8, shinR: 9 },
};
export const PART_COUNT: Record<RigKind, number> = { light: 12, heavy: 14, skeleton: 12, zombie: 10 };

/** assembly proportions (fractions of each part's own size), tuned per sheet in the rig viewer (rig.html) */
interface Layout { knee: number; shin: number; legX: number; hipUp: number; shX: number; shY: number; head: number; headA: number; elbow: number; hand: number; capeY: number; scarfY: number; }
export const LAYOUT: Record<RigKind, Layout> = {
  light: { knee: 0.8, shin: 0.92, legX: 0.24, hipUp: 0.08, shX: 0.4, shY: 0.86, head: 0.9, headA: 0.82, elbow: 0.86, hand: 0.9, capeY: 0.9, scarfY: 0.9 },
  heavy: { knee: 0.8, shin: 0.92, legX: 0.22, hipUp: 0.1, shX: 0.42, shY: 0.86, head: 0.92, headA: 0.86, elbow: 0.84, hand: 0.9, capeY: 0.9, scarfY: 0.9 },
  skeleton: { knee: 0.86, shin: 0.92, legX: 0.32, hipUp: 0.05, shX: 0.4, shY: 0.88, head: 0.96, headA: 0.84, elbow: 0.9, hand: 0.82, capeY: 0.9, scarfY: 0.9 },
  zombie: { knee: 0.78, shin: 0.9, legX: 0.2, hipUp: 0.12, shX: 0.4, shY: 0.82, head: 0.82, headA: 0.82, elbow: 0.82, hand: 0.88, capeY: 0.9, scarfY: 0.9 },
};

interface Joint { c: Container; s: Sprite | null; w: number; h: number; }
export interface RigPose {
  moving: number; speed: number; dirX: number; aim: number;
  mode: 'gun' | 'gun2' | 'melee' | 'claw' | 'none';
  swing: number;      // 0..1 attack progress, -1 = idle
  roll: number; rollDir: number;
}

export class Rig {
  root = new Container();      // feet at (0,0)
  body = new Container();      // everything that rotates during a roll
  j: Partial<Record<Slot | 'armL' | 'armR' | 'hand', Joint>> = {};
  weaponHolder = new Container(); offHolder = new Container();
  height: number; t = Math.random() * 10; phase = Math.random() * 10; walk = 0; facing = 1; recoil = 0; hurt = 0;
  kind: RigKind;
  private hipY = 0;

  constructor(tex: Texture[], kind: RigKind, targetH: number) {
    this.kind = kind;
    const map = PART_MAP[kind], L = LAYOUT[kind];
    const get = (s: Slot) => { const i = map[s]; return i !== undefined && tex[i] ? tex[i] : null; };
    const dims = (s: Slot) => { const t = get(s); return t ? { w: t.width, h: t.height } : { w: 0, h: 0 }; };
    const T = dims('torso'), P = dims('pelvis'), TH = dims('thighL'), SH = dims('shinL'), HD = dims('head');
    const legLen = SH.h * L.shin + TH.h * L.knee;
    this.hipY = -legLen;
    this.height = legLen + (P.h ? P.h * 0.35 : 0) + T.h * L.head + HD.h * L.headA;
    const mk = (slot: Slot | 'armL' | 'armR', parent: Container, x: number, y: number, ax = 0.5, ay = 0.08): Joint => {
      const c = new Container(); c.position.set(x, y); parent.addChild(c);
      const t = slot === 'armL' || slot === 'armR' ? null : get(slot as Slot);
      let s: Sprite | null = null;
      if (t) { s = new Sprite(t); s.anchor.set(ax, ay); c.addChild(s); }
      const jt = { c, s, w: t?.width || 0, h: t?.height || 0 }; this.j[slot] = jt; return jt;
    };
    const b = this.body; this.root.addChild(b);
    // the torso sits on the hips (on the pelvis for the skeleton)
    const torsoBase = P.h ? this.hipY - P.h * 0.35 : this.hipY + T.h * L.hipUp;
    // back to front: cape, legs, pelvis, torso (+ arms, head, pauldrons, scarf), tabard
    if (get('cape')) mk('cape', b, 0, torsoBase - T.h * L.capeY, 0.5, 0.03);
    const legX = Math.max(T.w * 0.75, P.w) * L.legX;
    const thL = mk('thighL', b, -legX, this.hipY, 0.5, 0.08), thR = mk('thighR', b, legX, this.hipY, 0.5, 0.08);
    mk('shinL', thL.c, 0, TH.h * L.knee, 0.5, 0.05); mk('shinR', thR.c, 0, TH.h * L.knee, 0.5, 0.05);
    if (get('pelvis')) mk('pelvis', b, 0, this.hipY, 0.5, 0.45);
    const torso = mk('torso', b, 0, torsoBase, 0.5, 0.96);
    const sx = T.w * L.shX, sy = -T.h * L.shY;
    for (const side of ['L', 'R'] as const) {
      const arm = mk(side === 'L' ? 'armL' : 'armR', torso.c, side === 'L' ? -sx : sx, sy);
      const U = dims(side === 'L' ? 'uarmL' : 'uarmR');
      if (get(side === 'L' ? 'uarmL' : 'uarmR')) mk(side === 'L' ? 'uarmL' : 'uarmR', arm.c, 0, 0, 0.5, 0.06);
      const fa = mk(side === 'L' ? 'farmL' : 'farmR', arm.c, 0, U.h ? U.h * L.elbow : 0, 0.5, 0.05);
      const hand = new Container(); hand.position.set(0, (fa.h || 120) * L.hand); fa.c.addChild(hand);
      if (side === 'R') { hand.addChild(this.weaponHolder); this.j.hand = { c: hand, s: null, w: 0, h: 0 }; } else hand.addChild(this.offHolder);
    }
    mk('head', torso.c, 0, -T.h * L.head, 0.5, L.headA);
    if (get('paulL')) mk('paulL', torso.c, -T.w * 0.4, -T.h * 0.9, 0.5, 0.3);
    if (get('paulR')) mk('paulR', torso.c, T.w * 0.4, -T.h * 0.9, 0.5, 0.3);
    if (get('scarf')) mk('scarf', torso.c, 0, -T.h * L.scarfY, 0.5, 0.1);
    if (get('tabard')) mk('tabard', b, 0, torsoBase - T.h * 0.12, 0.5, 0.04);
    // the skeleton's sword is a piece of its own sheet: it holds it like a weapon (blade pointing down the arm)
    const held = get('held');
    if (held) { const s = new Sprite(held); s.anchor.set(0.5, 0.2); this.weaponHolder.addChild(s); }   // art has the hilt on top: blade continues down the arm
    // measure the assembled figure (idle pose) rather than estimating it from part sizes
    const bnd = this.root.getLocalBounds();
    this.height = Math.max(1, -bnd.minY);
    this.root.scale.set(targetH / this.height);
  }

  get scale() { return this.root.scale.y; }
  /** all part sprites, back to front (death effects tear these off) */
  sprites(): Sprite[] { const out: Sprite[] = []; const walk = (c: Container) => { for (const ch of c.children) { if (ch instanceof Sprite) out.push(ch); else walk(ch as Container); } }; walk(this.root); return out; }

  update(dt: number, o: RigPose) {
    const j = this.j; this.t += dt;
    this.walk = lerp(this.walk, o.moving, Math.min(1, dt * 10));
    const zombie = this.kind === 'zombie', skel = this.kind === 'skeleton';
    this.phase += dt * (zombie ? 4 : 5 + o.speed * 0.035) * (o.moving > 0.1 ? 1 : 0.4);
    const w = this.walk, ph = this.phase, s1 = Math.sin(ph), c1 = Math.cos(ph);
    // facing: mirror the whole rig toward the aim; in rig space +x then points at the target
    const want = Math.cos(o.aim) >= 0 ? 1 : -1;
    this.facing = want; this.root.scale.x = Math.abs(this.root.scale.y) * want;
    const fx = want, aimLocal = want > 0 ? o.aim : Math.PI - o.aim;
    // legs: stride + knee lift (zombies drag their feet)
    // legs: a marching step reads better than a wide scissor in this front-facing view —
    // small stride, the lifted leg rises and its knee bends
    const stride = (zombie ? 0.22 : skel ? 0.16 : 0.26) * w, lift = (zombie ? 0.3 : 0.7) * w, rise = (zombie ? 0.03 : 0.07) * w;
    const upL = Math.max(0, -c1), upR = Math.max(0, c1);
    if (j.thighL) { j.thighL.c.rotation = s1 * stride; j.thighL.c.y = this.hipY - upL * rise * -this.hipY * 0.5; }
    if (j.thighR) { j.thighR.c.rotation = -s1 * stride; j.thighR.c.y = this.hipY - upR * rise * -this.hipY * 0.5; }
    if (j.shinL) j.shinL.c.rotation = upL * lift - s1 * stride * 0.4;
    if (j.shinR) j.shinR.c.rotation = upR * lift + s1 * stride * 0.4;
    // body bob / breathing / lean into travel (zombies slump forward and sway)
    const bob = Math.abs(s1) * (zombie ? 6 : 10) * w, breathe = Math.sin(this.t * 2.3) * 0.012 * (1 - w);
    this.body.pivot.set(0, 0); this.body.position.set(0, -bob);
    const lean = (o.dirX * fx) * (zombie ? 0.12 : 0.07) * w + (zombie ? 0.06 + Math.sin(ph * 0.5) * 0.05 * w : 0);
    if (j.torso) { j.torso.c.rotation = lean - this.recoil * 0.12 - this.hurt * 0.2; j.torso.c.scale.set(1 + breathe * 0.5, 1 + breathe); }
    if (j.pelvis) j.pelvis.c.rotation = s1 * 0.06 * w;
    if (j.head) j.head.c.rotation = -(j.torso?.c.rotation || 0) * 0.5 + Math.sin(this.t * (zombie ? 3.1 : 1.7)) * (zombie ? 0.08 : 0.02) + (skel ? Math.sin(this.t * 7) * 0.03 * w : 0);
    // cloth lags behind motion
    const flap = Math.sin(ph * 0.5) * 0.06 * w + Math.sin(this.t * 2.1) * 0.03;
    if (j.cape) j.cape.c.rotation = -(o.dirX * fx) * 0.28 * w + flap;
    if (j.scarf) j.scarf.c.rotation = -(o.dirX * fx) * 0.25 * w + flap * 1.5;
    if (j.tabard) j.tabard.c.rotation = s1 * 0.08 * w;
    // arms: the rest pose hangs down (+y = angle PI/2 in rig space)
    const restSwing = -s1 * 0.35 * w;
    const armR = j.armR!.c, armL = j.armL!.c, faR = j.farmR?.c, faL = j.farmL?.c;
    this.recoil = Math.max(0, this.recoil - dt * 7); this.hurt = Math.max(0, this.hurt - dt * 5);
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x));
    if (o.mode === 'melee') {
      if (o.swing >= 0) {
        // wind back over the shoulder, then cleave through the target direction
        const e = ease(o.swing), a = aimLocal - 1.3 + 2.6 * e;
        armR.rotation = a - Math.PI / 2; if (faR) faR.rotation = -0.15 * (1 - e);
      } else { armR.rotation = -0.45 + restSwing * 0.6; if (faR) faR.rotation = -0.85; }   // weapon raised forward, ready
      armL.rotation = -restSwing - 0.1; if (faL) faL.rotation = 0.2;
    } else if (o.mode === 'claw') {
      // zombie: arms reach toward the target and rake when attacking
      const reach = clamp(aimLocal, -1.2, 1.2) - Math.PI / 2, k = o.swing >= 0 ? Math.sin(o.swing * Math.PI) : 0;
      armR.rotation = reach + Math.sin(ph) * 0.12 - k * 0.6; armL.rotation = reach + 0.25 + Math.cos(ph) * 0.12 - k * 0.4;
      if (faR) faR.rotation = -0.35 + k * 0.6; if (faL) faL.rotation = -0.25 + k * 0.5;
    } else if (o.mode === 'gun' || o.mode === 'gun2') {
      const a = clamp(aimLocal, -2.2, 2.2) - Math.PI / 2 - this.recoil * 0.5;
      armR.rotation = a; if (faR) faR.rotation = -0.05;
      if (o.mode === 'gun2') { armL.rotation = a + 0.32; if (faL) faL.rotation = -0.5; }   // support hand under the stock
      else { armL.rotation = -restSwing - 0.1; if (faL) faL.rotation = 0.2; }
    } else { armR.rotation = restSwing; armL.rotation = -restSwing; if (faR) faR.rotation = -0.1; if (faL) faL.rotation = 0.1; }
    // roll: tuck limbs and spin the whole body around the belly
    if (o.roll > 0) {
      const k = o.roll, tuck = Math.sin(k * Math.PI), cy = this.hipY * 0.85;
      this.body.pivot.set(0, cy); this.body.position.set(0, cy - tuck * 40 - cy * 0.35 * tuck);
      this.body.rotation = o.rollDir * fx * k * TAU;
      if (j.thighL) { j.thighL.c.rotation = -1.4 * tuck; j.thighL.c.y = this.hipY; } if (j.thighR) { j.thighR.c.rotation = -1.2 * tuck; j.thighR.c.y = this.hipY; }
      if (j.shinL) j.shinL.c.rotation = 2.0 * tuck; if (j.shinR) j.shinR.c.rotation = 2.0 * tuck;
      armR.rotation = -1.6 * tuck; armL.rotation = 1.6 * tuck;
      this.body.scale.set(1, 1 - 0.12 * tuck);
    } else { this.body.rotation = 0; this.body.scale.set(1, 1); }
  }
}
