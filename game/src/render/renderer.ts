import { Application, ColorMatrixFilter, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import { BIOMES, BOSSES, ENEMIES, PETS, WEAPONS, WORLD, ARMORS, type WeaponId } from '../core/data';
import { TAU, clamp, hash2, hyp, lerp } from '../core/math';
import type { Enemy, GameEvent, World } from '../core/world';
import { circleTex, gen, pieces, placeholderBody, radialTexture, shadowTex, softTex, sprite, tile } from './assets';
import { PART_COUNT, Rig, type RigKind } from './rig';
import { settings } from '../settings';
import { dropTex, flashTex, shardTex, sparkTex, tracerTex } from './fxtex';

interface View { root: Container; body: Sprite; shadow: Sprite; base: number; faceLeft: boolean; h: number; t: number; dying: number; hitT: number;
  flash: Sprite | null; px: number; py: number; lunge: number; lastAtk: number; age: number; fallDir: number;
  rig?: Rig | null; holder?: Container | null; }
/** a body part torn off a rig on death: flies, bounces on the ground line, fades */
interface Debris { s: Sprite; vx: number; vy: number; vr: number; ground: number; life: number; bounced: number; }
interface Particle { s: Sprite; vx: number; vy: number; g: number; life: number; max: number; fade: boolean; grow: number; spin: number; }
interface Slash { x: number; y: number; ang: number; arc: number; r: number; heavy: boolean; life: number; max: number; }
interface Ghost { s: Sprite; life: number; }

const mixCol = (a: number, b: number, t: number) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255, br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
};

export class GameRenderer {
  app: Application;
  world = new Container();
  groundA!: TilingSprite; groundB!: TilingSprite; groundCol = new Graphics();
  decals = new Container(); under = new Graphics(); gemsL = new Container(); ents = new Container(); shotsL = new Container(); fxG = new Graphics(); fx = new Container(); over = new Graphics(); nums = new Container();
  screen = new Container(); fog = new Graphics(); light!: Sprite; vig!: Sprite; flash = new Graphics(); amb = new Container();
  views = new Map<number, View>();
  player!: View; weapon!: Sprite; weaponId: WeaponId | null = null; weaponKick = 0; lastWeapon: WeaponId | null = null;
  rig: Rig | null = null; muzzle = { x: 0, y: 0, ok: false }; muzzleLocal = { x: 0, y: 0 }; weaponLen = 60; aimSmooth = 0; lastAttackT = -9;
  pets = new Map<string, View>(); ravens: Sprite[] = [];
  shotPool: Sprite[] = []; eshotPool: Sprite[] = []; gemPool: Sprite[] = []; propPool = new Map<string, Sprite>();
  parts: Particle[] = []; partPool: Sprite[] = []; slashes: Slash[] = []; ghosts: Ghost[] = []; ghostT = 0;
  numPool: { t: Text; life: number; vy: number }[] = [];
  debris: Debris[] = []; hitFilter = (() => { const f = new ColorMatrixFilter(); f.brightness(2.4, false); return f; })();
  chest!: Sprite;
  cam = { x: 0, y: 0, zoom: 1 }; shake = 0; flashA = 0; flashCol = 0xbe1414; lightning = 0; lightT = 6;
  ambient: { s: Sprite; x: number; y: number; z: number }[] = [];
  biomeShown = -1; biomeFromShown = -1; time = 0; banner: ((t: string, s: string) => void) | null = null;

  constructor(app: Application) {
    this.app = app;
    const stage = app.stage;
    this.groundA = new TilingSprite({ texture: circleTex(), width: 10, height: 10 });
    this.groundB = new TilingSprite({ texture: circleTex(), width: 10, height: 10 });
    this.ents.sortableChildren = true;
    this.world.addChild(this.groundCol, this.groundA, this.groundB, this.decals, this.under, this.gemsL, this.ents, this.shotsL, this.fxG, this.fx, this.over, this.nums);
    this.light = new Sprite(radialTexture(256, [[0, 'rgba(255,225,170,0.16)'], [1, 'rgba(255,225,170,0)']])); this.light.anchor.set(0.5); this.light.blendMode = 'add';
    this.vig = new Sprite(radialTexture(512, [[0.45, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.82)']]));
    this.screen.addChild(this.fog, this.amb, this.light, this.vig, this.flash);
    stage.addChild(this.world, this.screen);
    for (let i = 0; i < 90; i++) { const s = new Sprite(circleTex()); s.anchor.set(0.5); this.amb.addChild(s); this.ambient.push({ s, x: Math.random(), y: Math.random(), z: Math.random() }); }
    this.chest = new Sprite(sprite(['items', 'chest']) || gen('chest', g => { g.roundRect(-18, -24, 36, 24, 3).fill({ color: 0x3a2a18 }).stroke({ color: 0xd6b266, width: 2 }); }));
    this.chest.anchor.set(0.5, 0.85); this.chest.visible = false; this.ents.addChild(this.chest);
    this.setChestScale();
  }
  private setChestScale() { this.chest.scale.set(64 / this.chest.texture.height); }

  // ------------------------------------------------------------ views
  private makeView(tex: Texture, h: number, faceLeft: boolean, shadowW = 1): View {
    const root = new Container(), shadow = new Sprite(shadowTex()), body = new Sprite(tex);
    shadow.anchor.set(0.5); shadow.scale.set(shadowW * h / 90, shadowW * h / 90); body.anchor.set(0.5, 0.94);
    root.addChild(shadow, body); this.ents.addChild(root);
    return { root, body, shadow, base: h / tex.height, faceLeft, h, t: Math.random() * 10, dying: 0, hitT: 0, flash: null, px: NaN, py: NaN, lunge: 0, lastAtk: 0, age: 0, fallDir: 1 };
  }
  private enemyView(e: Enemy): View {
    if (e.boss) { const d = BOSSES[e.idx!]; return this.makeView(sprite(d.sprite) || placeholderBody('boss' + e.idx, d.col, d.h, { eyes: 0xe03a30, wide: 0.7 }), d.h, false, 1.6); }
    if (e.anchor) return this.makeView(gen('anchor', g => { g.poly([0, -50, 16, -25, 0, 0, -16, -25]).fill({ color: 0x183a44 }).stroke({ color: 0x88ffff, width: 2 }); }), 52, false, 0.6);
    const d = ENEMIES[e.type as keyof typeof ENEMIES];
    if (e.type === 'skeleton' || e.type === 'zombie') {
      const kind = e.type as RigKind, parts = pieces(['enemies', e.type, 'parts']);
      if (parts.length >= PART_COUNT[kind]) return this.rigView(parts, kind, d.h * 1.12 * (e.elite ? 1.2 : 1), e.elite);
    }
    const tx = sprite(d.sprite) || placeholderBody(e.type, d.col, d.h, { eyes: e.type === 'wolf' ? 0xe04030 : 0x1b1714, wide: e.type === 'ghoul' || e.type === 'wolf' ? 0.8 : 0.55 });
    const v = this.makeView(tx, d.h * (e.elite ? 1.2 : 1), true, e.type === 'wolf' || e.type === 'ghoul' ? 1.3 : 1);
    if (e.elite) v.body.tint = 0xffe2a8;
    return v;
  }
  private rigView(parts: Texture[], kind: RigKind, h: number, elite: boolean): View {
    const root = new Container(), shadow = new Sprite(shadowTex()), holder = new Container(), rig = new Rig(parts, kind, h);
    shadow.anchor.set(0.5); shadow.scale.set(h / 90); holder.addChild(rig.root); root.addChild(shadow, holder); this.ents.addChild(root);
    if (elite) rig.root.tint = 0xffe2a8;
    return { root, body: new Sprite(), shadow, base: 1, faceLeft: false, h, t: 0, dying: 0, hitT: 0, flash: null, px: NaN, py: NaN, lunge: 0, lastAtk: 0, age: 0, fallDir: 1, rig, holder };
  }
  /** rigged enemies: real walk cycle, sword slash / claw rake on attack, recoil + flash when hit, rise on spawn */
  private animRigEnemy(v: View, e: Enemy, w: World, dt: number) {
    const p = w.p, rig = v.rig!, holder = v.holder!; v.t += dt; v.age += dt;
    const vx = isNaN(v.px) ? 0 : (e.x - v.px) / Math.max(dt, 1e-3), vy = isNaN(v.py) ? 0 : (e.y - v.py) / Math.max(dt, 1e-3); v.px = e.x; v.py = e.y;
    const sp = dt > 0 ? hyp(vx, vy) : 0;
    if (e.atkCd > v.lastAtk + 0.3) v.lunge = 0.32; v.lastAtk = e.atkCd; v.lunge -= dt;
    v.hitT -= dt; if (e.hitT > 0.1) { v.hitT = 0.1; rig.hurt = 1; }
    const toP = Math.atan2(p.y - e.y, p.x - e.x), lk = v.lunge > 0 ? Math.sin((0.32 - v.lunge) / 0.32 * Math.PI) : 0;
    rig.update(dt, { moving: sp > 12 ? 1 : 0, speed: sp, dirX: Math.sign(vx), aim: e.fear > 0 ? toP + Math.PI : toP,
      mode: rig.kind === 'zombie' ? 'claw' : 'melee', swing: v.lunge > 0 ? 1 - v.lunge / 0.32 : -1, roll: 0, rollDir: 1 });
    const rise = clamp(v.age / 0.4, 0.05, 1);
    holder.scale.set(1, rise); holder.position.set(Math.cos(toP) * lk * 10, -lk * 3);
    holder.alpha = e.alpha * (v.age < 0.4 ? v.age / 0.4 : 1);
    rig.root.filters = v.hitT > 0 ? [this.hitFilter] : null;
    if (!e.elite) rig.root.tint = e.vulnT > 0 ? 0xffd8b0 : 0xffffff;
  }
  /** tear a rig apart: every body part becomes debris that flies off, bounces and fades */
  private shatter(v: View, fromX: number) {
    const rig = v.rig!, bony = rig.kind === 'skeleton', gy = v.root.y;
    for (const s of rig.sprites()) {
      const m = s.worldTransform, gp = s.getGlobalPosition(), wp = this.world.toLocal(gp);
      const d = new Sprite(s.texture); d.anchor.copyFrom(s.anchor); d.position.copyFrom(wp);
      d.rotation = Math.atan2(m.b, m.a); const sc = Math.hypot(m.a, m.b) / this.world.scale.x; d.scale.set(sc * Math.sign(m.a * m.d - m.b * m.c || 1), sc);
      d.tint = rig.root.tint; this.fx.addChild(d);
      const away = Math.sign(wp.x - fromX) || 1, spd = bony ? 1 : 0.45;
      this.debris.push({ s: d, vx: (away * (40 + Math.random() * 150) + (wp.x - v.root.x) * 2) * spd, vy: -(120 + Math.random() * 220) * spd,
        vr: (Math.random() - 0.5) * (bony ? 16 : 7), ground: gy + (Math.random() - 0.5) * 14, life: 1.3 + Math.random() * 0.4, bounced: 0 });
    }
    if (!bony) this.burst(v.root.x, gy - 30, 10, 0x7a1414, [60, 200], { size: [1.6, 3.2], g: 520, up: 60 });
    v.root.destroy({ children: true });
  }
  initPlayer(w: World) {
    if (this.player) this.player.root.destroy({ children: true });
    const A = ARMORS[w.p.armorId], targetH = A.id === 'heavy' ? 108 : 102;
    const parts = pieces(['player', A.id, 'parts']);
    this.rig = null;
    if (parts.length >= 10) {
      const root = new Container(), shadow = new Sprite(shadowTex()); shadow.anchor.set(0.5); shadow.scale.set(1.15, 1.15);
      const rig = new Rig(parts, A.id, targetH); root.addChild(shadow, rig.root); this.ents.addChild(root); this.rig = rig;
      this.player = { root, body: new Sprite(), shadow, base: 1, faceLeft: false, h: targetH, t: 0, dying: 0, hitT: 0, flash: null, px: NaN, py: NaN, lunge: 0, lastAtk: 0, age: 9, fallDir: 1 };
      this.weapon = new Sprite(circleTex()); rig.weaponHolder.addChild(this.weapon);
    } else {
      const tx = sprite(A.sprite) || placeholderBody('player_' + A.id, A.id === 'heavy' ? 0x4a4d55 : 0x8b929c, 96, { hood: true, eyes: 0x111111 });
      this.player = this.makeView(tx, targetH, false, 1.1); this.player.age = 9;
      this.weapon = new Sprite(circleTex()); this.player.root.addChild(this.weapon);
    }
    this.weaponId = null;
    for (const v of this.views.values()) v.root.destroy({ children: true }); this.views.clear();
    for (const v of this.pets.values()) v.root.destroy({ children: true }); this.pets.clear();
    for (const r of this.ravens) r.destroy(); this.ravens = [];
    this.parts.forEach(p => p.s.destroy()); this.parts = []; this.slashes = []; this.ghosts.forEach(g => g.s.destroy()); this.ghosts = [];
    this.debris.forEach(d => d.s.destroy()); this.debris = [];
    this.biomeShown = -1; this.cam.x = w.p.x; this.cam.y = w.p.y; this.lastAttackT = -9;
  }
  /** weapon art: generated sprites point up-right (diagonal), the flintlock lies flat facing left */
  private setWeapon(id: WeaponId) {
    if (this.weaponId === id) return; this.weaponId = id;
    const d = WEAPONS[id], t = sprite(d.sprite), wp = this.weapon;
    const len = d.kind === 'melee' ? (id === 'greatsword' ? 96 : 76) : id === 'flintlock' ? 34 : id === 'crossbow' ? 50 : 60;
    let ax: number, ay: number, rotOff: number, mirror = 1, tipU: number, tipV: number, texLen: number;
    if (t) {
      wp.texture = t;
      ax = d.kind === 'melee' ? 0.17 : 0.22; ay = d.kind === 'melee' ? 0.83 : 0.78; rotOff = Math.PI / 4; tipU = 0.98; tipV = 0.03; texLen = Math.hypot(t.width, t.height);
    } else {
      wp.texture = gen('wep_' + id, g => {
        if (d.kind === 'melee') { g.rect(0, -2, len * 0.25, 4).fill({ color: 0x3a2a1c }); g.rect(len * 0.22, -7, 4, 14).fill({ color: 0x8a8070 }); g.poly([len * 0.26, -3.5, len, 0, len * 0.26, 3.5]).fill({ color: 0xc4ccd6 }); }
        else { g.rect(0, -4, len * 0.35, 8).fill({ color: 0x4a3020 }); g.rect(len * 0.3, -2.5, len * 0.7, 5).fill({ color: 0x6e6a66 }); }
      });
      ax = 0.1; ay = 0.5; rotOff = 0; tipU = 1; tipV = 0.5; texLen = wp.texture.width;
    }
    wp.anchor.set(ax, ay);
    const sc = len / texLen / (this.rig ? this.rig.scale : 1);
    wp.scale.set(sc * mirror, sc);
    // in the rig the hand frame points along +y (down the arm); outside the rig we rotate per frame
    wp.rotation = this.rig ? rotOff + Math.PI / 2 : 0; (wp as any)._rotOff = rotOff;
    this.muzzleLocal = { x: (tipU - ax) * wp.texture.width, y: (tipV - ay) * wp.texture.height };
    this.weaponLen = len;
  }

  // ------------------------------------------------------------ particles
  private part(x: number, y: number, col: number, o: Partial<Particle> & { size?: number; tex?: Texture; add?: boolean } = {}) {
    if (this.parts.length > 700) return;
    const s = this.partPool.pop() || new Sprite(circleTex());
    s.texture = o.tex || circleTex(); s.anchor.set(0.5); s.tint = col; s.alpha = 1; s.rotation = 0; s.visible = true;
    s.blendMode = o.add ? 'add' : 'normal';
    const sz = (o.size ?? 3) / (s.texture.width / 2); s.scale.set(sz); s.position.set(x, y); this.fx.addChild(s);   // size = radius in world px
    this.parts.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, life: o.life ?? 0.5, max: o.life ?? 0.5, fade: o.fade ?? true, grow: o.grow ?? 0, spin: o.spin ?? 0 });
  }
  private burst(x: number, y: number, n: number, col: number, spd: [number, number], o: { size?: [number, number]; life?: [number, number]; g?: number; add?: boolean; up?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = lerp(spd[0], spd[1], Math.random());
      this.part(x, y, col, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up ?? 0), size: lerp(...(o.size ?? [2, 4]) as [number, number], Math.random()), life: lerp(...(o.life ?? [0.25, 0.55]) as [number, number], Math.random()), g: o.g ?? 0, add: o.add });
    }
  }
  private number(x: number, y: number, txt: string, col: number, big = false) {
    let n = this.numPool.find(q => q.life <= 0);
    if (!n) { if (this.numPool.length > 40) return; n = { t: new Text({ text: '', style: { fontFamily: 'Georgia, serif', fontWeight: '700', fontSize: 18, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } }), life: 0, vy: 0 }; n.t.anchor.set(0.5); this.nums.addChild(n.t); this.numPool.push(n); }
    n.t.text = txt; n.t.style.fill = col; n.t.style.fontSize = big ? 24 : 17; n.t.position.set(x + (Math.random() - 0.5) * 16, y); n.t.alpha = 1; n.t.visible = true; n.life = 0.8; n.vy = -46;
  }

  // ------------------------------------------------------------ events -> visuals
  handle(e: GameEvent, w: World) {
    const p = w.p;
    switch (e.t) {
      case 'hit': {
        const gun = e.src === 'flintlock' || e.src === 'arquebus' || e.src === 'blunderbuss' || e.src === 'crossbow';
        const by = e.y + 6;
        for (let i = 0; i < (e.crit ? 6 : 3); i++) { const a = Math.random() * TAU, sp = 60 + Math.random() * 150; this.part(e.x, by, e.col ?? 0x7a1414, { tex: dropTex(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 520, size: 1.6 + Math.random() * 1.6, life: 0.35 + Math.random() * 0.2 }); }
        if (gun) for (let i = 0; i < 4; i++) { const a = Math.random() * TAU, sp = 160 + Math.random() * 220; this.part(e.x, by, 0xffd38a, { tex: sparkTex(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 8, life: 0.12, add: true, spin: 0 }); this.parts[this.parts.length - 1].s.rotation = a; }
        if (settings.numbers === 'all' || (settings.numbers === 'crits' && e.crit)) this.number(e.x, e.y - 8, String(Math.round(e.dmg)), e.crit ? 0xffd36a : 0xe9e4d6, e.crit && e.dmg > 80);
        break;
      }
      case 'kill': {
        const col = e.type === 'plague' ? 0x8aa13a : e.type === 'wraith' ? 0x7fa3d9 : e.type === 'skeleton' || e.type === 'archer' ? 0xd8d2c0 : e.type === 'anchor' ? 0x99ffee : 0x8e1f1f;
        const bony = e.type === 'skeleton' || e.type === 'archer' || e.type === 'anchor';
        for (let i = 0; i < (e.elite ? 14 : 8); i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 90 + Math.random() * 180;
          this.part(e.x, e.y - 22, col, { tex: bony ? shardTex(i) : dropTex(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 620, size: bony ? 2.5 + Math.random() * 2.5 : 1.8 + Math.random() * 2, life: 0.5 + Math.random() * 0.3, spin: bony ? (Math.random() - 0.5) * 18 : 0 }); }
        if (Math.random() < 0.6 && this.decals.children.length < 140) { const d = new Sprite(softTex()); d.anchor.set(0.5); d.tint = 0x3a0808; d.alpha = 0.5; d.scale.set(0.5 + Math.random() * 0.5, 0.25 + Math.random() * 0.2); d.position.set(e.x, e.y); this.decals.addChild(d); }
        while (this.decals.children.length > 130) this.decals.children[0].destroy();
        break;
      }
      case 'swing': this.slashes.push({ x: e.x, y: e.y - 40, ang: e.ang, arc: e.arc, r: e.range, heavy: e.heavy, life: 0.18, max: 0.18 }); this.lastWeapon = e.w; this.lastAttackT = this.time; if (e.heavy || e.w === 'greatsword') this.shake = Math.max(this.shake, e.heavy ? 5 : 2.5); break;
      case 'shot': {
        this.lastWeapon = e.w; this.weaponKick = 1; this.lastAttackT = this.time; if (this.rig) this.rig.recoil = e.w === 'crossbow' ? 0.4 : e.w === 'flintlock' ? 0.8 : 1;
        const m = this.muzzle.ok ? this.muzzle : { x: e.x + Math.cos(e.ang) * 40, y: e.y - 46 + Math.sin(e.ang) * 40 };
        if (e.w !== 'crossbow') {
          const big = e.w === 'blunderbuss' ? 1.35 : e.w === 'arquebus' ? 1.15 : 0.85;
          this.part(m.x, m.y, 0xffe2a0, { tex: flashTex(), size: 30 * big, life: 0.07, add: true }); this.parts[this.parts.length - 1].s.rotation = e.ang;
          this.part(m.x, m.y, 0xffb050, { tex: softTex(), size: 34 * big, life: 0.09, add: true });
          for (let i = 0; i < (e.w === 'blunderbuss' ? 7 : 4); i++) { const a = e.ang + (Math.random() - 0.5) * 0.5, sp = 200 + Math.random() * 260; this.part(m.x, m.y, 0xffc870, { tex: sparkTex(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 7, life: 0.1, add: true }); this.parts[this.parts.length - 1].s.rotation = a; }
          for (let i = 0; i < (e.w === 'blunderbuss' ? 4 : 2); i++) this.part(m.x + Math.cos(e.ang) * 8, m.y, 0x8a847c, { tex: softTex(), vx: Math.cos(e.ang) * 40 + (Math.random() - 0.5) * 30, vy: -18 - Math.random() * 20, size: 12, life: 0.9, grow: 1.2 });
          this.shake = Math.max(this.shake, e.w === 'blunderbuss' || e.w === 'arquebus' ? 3.5 : 1.8);
        } else this.part(m.x, m.y, 0xd4dce6, { tex: sparkTex(), vx: Math.cos(e.ang) * 80, vy: Math.sin(e.ang) * 80, size: 10, life: 0.08, add: true });
        break;
      }
      case 'blast': if (e.r > 0) { this.burst(e.x, e.y, 22, 0xff8a5a, [80, 320], { size: [2, 5], life: [0.2, 0.5], add: true }); this.slashes.push({ x: e.x, y: e.y, ang: 0, arc: TAU, r: e.r, heavy: true, life: 0.25, max: 0.25 }); } this.shake = Math.max(this.shake, 3); break;
      case 'shock': case 'bell': this.slashes.push({ x: e.x, y: e.y, ang: 0, arc: TAU, r: e.r, heavy: e.t === 'shock', life: 0.3, max: 0.3 }); this.shake = Math.max(this.shake, 4); break;
      case 'pool': this.burst(e.x, e.y, 14, 0x8fd04a, [30, 120], { size: [3, 6], life: [0.4, 0.9] }); break;
      case 'roll': for (let i = 0; i < 5; i++) this.part(p.x + (Math.random() - 0.5) * 20, p.y - 4, 0x8a847c, { tex: softTex(), vx: (Math.random() - 0.5) * 60, vy: -10 - Math.random() * 20, size: 7 + Math.random() * 5, life: 0.45, grow: 1.4 }); break;
      case 'hurt': if (this.rig) this.rig.hurt = 1; this.flashA = 0.35; this.flashCol = 0xbe1414; this.shake = Math.max(this.shake, 4); for (let i = 0; i < 5; i++) { const a = Math.random() * TAU; this.part(p.x, p.y - 50, 0x8a1010, { tex: dropTex(), vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60, g: 520, size: 2, life: 0.45 }); } break;
      case 'block': this.slashes.push({ x: p.x, y: p.y - 40, ang: 0, arc: TAU, r: 50, heavy: false, life: 0.3, max: 0.3 }); this.number(p.x, p.y - 100, 'Block', 0x99ccff); break;
      case 'perfect': this.number(p.x, p.y - 110, 'Dodge!', 0xbbddff); this.burst(p.x, p.y - 40, 10, 0xbbddff, [60, 160], { add: true, life: [0.2, 0.4] }); break;
      case 'revive': this.number(p.x, p.y - 110, 'Revived', 0xffe08a, true); this.flashA = 0.4; this.flashCol = 0xffe8a0; break;
      case 'level': this.slashes.push({ x: p.x, y: p.y - 10, ang: 0, arc: TAU, r: 70, heavy: false, life: 0.45, max: 0.45 });
        for (let i = 0; i < 12; i++) { const x = p.x + (Math.random() - 0.5) * 50; this.part(x, p.y - Math.random() * 30, 0x9cc8ff, { tex: sparkTex(), vx: 0, vy: -90 - Math.random() * 90, size: 6, life: 0.6, add: true }); this.parts[this.parts.length - 1].s.rotation = -Math.PI / 2; } break;
      case 'frenzy': this.number(p.x, p.y - 110, 'Frenzy!', 0xff8a5a, true); break;
      case 'bossDead': this.burst(e.x!, e.y! - 60, 60, 0xccbbaa, [80, 380], { size: [2, 6], g: 200, life: [0.5, 1.1] }); this.shake = 12; this.flashA = 0.5; this.flashCol = 0xffffff; break;
      case 'dive': this.burst(e.x, e.y, 4, 0x222230, [40, 120], { size: [2, 3] }); break;
      case 'bite': this.burst(e.x, e.y - 15, 5, 0x9ec8ff, [40, 140], { size: [2, 3.5], add: true }); break;
      case 'gate': case 'boss': case 'biome': case 'banner': if (this.banner) this.banner(e.text || '', e.sub || ''); break;
    }
  }

  // ------------------------------------------------------------ frame
  draw(w: World, dt: number) {
    this.time += dt;
    const W = this.app.screen.width, H = this.app.screen.height, p = w.p;
    const zoom = clamp(Math.min(W, H) / 820, 0.6, 1.7);
    const k = Math.min(1, dt * 9); this.cam.x += (p.x - this.cam.x) * k; this.cam.y += (p.y - 40 - this.cam.y) * k; this.cam.zoom = zoom;
    this.shake = Math.max(0, this.shake - dt * 22);
    const sh = settings.shake ? this.shake : 0, sx = (Math.random() - 0.5) * 2 * sh, sy = (Math.random() - 0.5) * 2 * sh;
    this.world.scale.set(zoom); this.world.position.set(W / 2 - this.cam.x * zoom + sx, H / 2 - this.cam.y * zoom + sy);
    const vw = W / zoom, vh = H / zoom, x0 = this.cam.x - vw / 2, y0 = this.cam.y - vh / 2, x1 = x0 + vw, y1 = y0 + vh;

    this.drawGround(w, x0, y0, vw, vh);
    this.drawProps(w, x0, y0, x1, y1);
    this.drawUnder(w, x0, y0, vw, vh);
    this.over.clear(); this.drawOver(w, x0, y0, vw, vh);
    this.drawEnemies(w, dt, x0, y0, x1, y1);
    this.drawPlayer(w, dt);
    this.drawPets(w, dt);
    this.drawShots(w);
    this.drawGems(w);
    this.drawFx(dt);
    this.drawScreen(w, dt, W, H, zoom);
  }

  private drawGround(w: World, x0: number, y0: number, vw: number, vh: number) {
    if (this.biomeShown !== w.biome || this.biomeFromShown !== w.biomeFrom) {
      this.biomeShown = w.biome; this.biomeFromShown = w.biomeFrom;
      const tA = tile(BIOMES[w.biomeFrom].tile), tB = tile(BIOMES[w.biome].tile);
      this.groundA.texture = tA || circleTex(); this.groundA.visible = !!tA;
      this.groundB.texture = tB || circleTex(); this.groundB.visible = !!tB;
    }
    const gc = mixCol(BIOMES[w.biomeFrom].ground, BIOMES[w.biome].ground, w.biomeT);
    this.groundCol.clear().rect(x0 - 50, y0 - 50, vw + 100, vh + 100).fill({ color: gc });
    // checker tint so movement reads even without a tile texture
    const C = 120;
    for (let cx = Math.floor(x0 / C); cx <= Math.floor((x0 + vw) / C); cx++) for (let cy = Math.floor(y0 / C); cy <= Math.floor((y0 + vh) / C); cy++)
      if (hash2(cx, cy) > 0.5) this.groundCol.rect(cx * C + 4, cy * C + 4, C - 8, C - 8).fill({ color: 0xffffff, alpha: 0.025 });
    for (const [g, a] of [[this.groundA, 1], [this.groundB, w.biomeT]] as [TilingSprite, number][]) {
      if (!g.visible) continue;
      g.position.set(x0 - 60, y0 - 60); g.width = vw + 120; g.height = vh + 120;
      g.tileScale.set(0.75); g.tilePosition.set(-(x0 - 60), -(y0 - 60)); g.alpha = a;
    }
    if (this.groundA.visible && this.groundB.visible && w.biomeT >= 1) this.groundA.alpha = 0;
  }

  private drawProps(w: World, x0: number, y0: number, x1: number, y1: number) {
    const bi = w.biomeT < 0.5 ? w.biomeFrom : w.biome, list = pieces(BIOMES[bi].props), PC = 170, seen = new Set<string>();
    if (list.length) for (let cx = Math.floor(x0 / PC) - 1; cx <= Math.floor(x1 / PC) + 1; cx++) for (let cy = Math.floor(y0 / PC) - 1; cy <= Math.floor(y1 / PC) + 2; cy++) {
      const h = hash2(cx * 7 + 13, cy * 11 + 5); if (h > 0.3) continue;
      const px = cx * PC + hash2(cx, cy + 99) * PC, py = cy * PC + hash2(cx + 77, cy) * PC;
      if (Math.abs(px) > WORLD || Math.abs(py) > WORLD) continue;
      if (w.arena && hyp(px - w.arena.x, py - w.arena.y) < w.arena.r) continue;
      const key = `${bi}:${cx}:${cy}`; seen.add(key);
      let s = this.propPool.get(key);
      if (!s) { const t = list[Math.floor(hash2(cx + 3, cy + 9) * list.length)]; s = new Sprite(t); s.anchor.set(0.5, 0.9); const target = 70 + hash2(cx, cy) * 50; s.scale.set(target / Math.max(t.height, t.width * 0.8)); if (hash2(cx + 5, cy) > 0.5) s.scale.x *= -1; s.position.set(px, py); s.zIndex = py; this.ents.addChild(s); this.propPool.set(key, s); }
    }
    for (const [k2, s] of this.propPool) if (!seen.has(k2)) { s.destroy(); this.propPool.delete(k2); }
  }

  private drawUnder(w: World, x0: number, y0: number, vw: number, vh: number) {
    const g = this.under; g.clear();
    // world edge
    if (x0 < -WORLD) g.rect(x0, y0, -WORLD - x0, vh).fill({ color: 0, alpha: 0.65 }); if (x0 + vw > WORLD) g.rect(WORLD, y0, x0 + vw - WORLD, vh).fill({ color: 0, alpha: 0.65 });
    if (y0 < -WORLD) g.rect(x0, y0, vw, -WORLD - y0).fill({ color: 0, alpha: 0.65 }); if (y0 + vh > WORLD) g.rect(x0, WORLD, vw, y0 + vh - WORLD).fill({ color: 0, alpha: 0.65 });
    // hazard zones
    for (const z of w.zones) {
      const a = clamp(z.life, 0, 1);
      if (z.k === 'rot') g.circle(z.x, z.y, z.r).fill({ color: 0x789632, alpha: 0.22 * a });
      else g.circle(z.x, z.y, z.r).fill({ color: 0x6ebe32, alpha: 0.25 * a }).circle(z.x, z.y, z.r).stroke({ color: 0x96e646, width: 2, alpha: 0.7 * a });
    }
    // telegraphs
    for (const t of w.teles) {
      const k = clamp(t.t / t.delay, 0, 1);
      if (t.kind === 'c') {
        g.circle(t.x, t.y, t.r).fill({ color: 0xd22828, alpha: 0.12 }).circle(t.x, t.y, t.r).stroke({ color: 0xff5a46, width: 2, alpha: 0.85 });
        g.circle(t.x, t.y, t.r * k).fill({ color: 0xe63228, alpha: 0.28 });
      } else {
        const c = Math.cos(t.ang), s = Math.sin(t.ang), hw = t.w / 2, quad = (wd: number) => [t.x - s * wd, t.y + c * wd, t.x + c * t.len - s * wd, t.y + s * t.len + c * wd, t.x + c * t.len + s * wd, t.y + s * t.len - c * wd, t.x + s * wd, t.y - c * wd];
        g.poly(quad(hw)).fill({ color: 0xd22828, alpha: 0.12 }).poly(quad(hw)).stroke({ color: 0xff5a46, width: 2, alpha: 0.85 });
        g.poly(quad(hw * k)).fill({ color: 0xe63228, alpha: 0.3 });
      }
    }
    for (const r of w.rings) {
      const al = r.wait > 0 ? 0.4 + 0.3 * Math.sin(this.time * 20) : 1, a0 = r.gap + r.gapW / 2, a1 = r.gap - r.gapW / 2 + TAU;
      g.moveTo(r.x + Math.cos(a0) * r.r, r.y + Math.sin(a0) * r.r).arc(r.x, r.y, r.r, a0, a1).stroke({ color: 0xff5a46, width: 9, alpha: al });
    }
    // wolf charge lanes & archer aim lines
    for (const e of w.enemies) {
      if (e.dead || e.fade) continue;
      if (e.type === 'wolf' && e.st === 1) { const c = Math.cos(e.aim), s = Math.sin(e.aim); g.moveTo(e.x, e.y).lineTo(e.x + c * 320, e.y + s * 320).stroke({ color: 0xff4632, width: 30, alpha: 0.18 + 0.3 * (1 - e.wt / 0.8) }); }
      if ((e.type === 'archer' || e.type === 'cultist') && e.st === 1) { const c = Math.cos(e.aim), s = Math.sin(e.aim); g.moveTo(e.x, e.y - 20).lineTo(e.x + c * 380, e.y - 20 + s * 380).stroke({ color: 0xff5a46, width: 1.5, alpha: 0.7 }); }
    }
    if (w.drain && w.boss) for (const a of w.drain.anchors) if (!a.dead) g.moveTo(a.x, a.y - 25).lineTo(w.boss.x, w.boss.y - 60).stroke({ color: 0x78ffff, width: 2, alpha: 0.55 });
  }

  private animBody(v: View, dt: number, moving: boolean, faceRight: boolean, speed = 9, amp = 3) {
    v.t += dt; v.hitT -= dt;
    const flip = (faceRight === v.faceLeft) ? -1 : 1;
    const bob = moving ? Math.abs(Math.sin(v.t * speed)) * amp : 0, sway = moving ? Math.sin(v.t * speed) * 0.06 : Math.sin(v.t * 1.6) * 0.012;
    const breathe = 1 + (moving ? -Math.max(0, Math.cos(v.t * speed * 2)) * 0.04 : Math.sin(v.t * 2.2) * 0.012);
    v.body.scale.set(v.base * flip, v.base * breathe);
    v.body.y = -bob; v.body.rotation = sway;
  }
  /** enemies: waddle, lean into travel, lunge on attack, rise on spawn, punch + white flash on hit */
  private animEnemy(v: View, e: Enemy, w: World, dt: number) {
    const p = w.p; v.t += dt; v.age += dt;
    const vx = isNaN(v.px) ? 0 : (e.x - v.px) / Math.max(dt, 1e-3), vy = isNaN(v.py) ? 0 : (e.y - v.py) / Math.max(dt, 1e-3); v.px = e.x; v.py = e.y;
    const sp = dt > 0 ? hyp(vx, vy) : 0, moving = sp > 12 && !(e.boss && (e.busy || 0) > 0);
    const faceRight = e.boss ? p.x > e.x : e.type === 'wolf' && e.st > 0 ? Math.cos(e.aim) > 0 : (Math.abs(vx) > 20 ? vx > 0 : p.x > e.x);
    const flip = (faceRight === v.faceLeft) ? -1 : 1, T = e.type;
    const heavy = T === 'zombie' || T === 'drowned' || T === 'plague' || T === 'shield';
    const f = T === 'ghoul' || T === 'wolf' ? 14 : heavy ? 6.5 : e.boss ? 4.5 : 9.5;
    const ph = v.t * f + e.id;
    let bob = moving ? Math.abs(Math.sin(ph)) * (e.boss ? 6 : heavy ? 3 : 4) : 0;
    let rot = moving ? Math.sin(ph) * (heavy ? 0.13 : 0.08) : Math.sin(v.t * 1.5 + e.id) * 0.02;
    rot += clamp(vx / 320, -1, 1) * 0.12;
    if (T === 'wraith') { bob = 10 + Math.sin(v.t * 2 + e.id) * 6; rot = Math.sin(v.t * 1.3 + e.id) * 0.07 + clamp(vx / 300, -1, 1) * 0.15; }
    if (T === 'wolf' && e.st === 1) { bob = 0; rot = 0; }
    const squash = moving ? 1 - Math.max(0, Math.cos(ph * 2)) * 0.06 : 1 + Math.sin(v.t * 2.2 + e.id) * 0.015;
    if (e.atkCd > v.lastAtk + 0.3) v.lunge = 0.22; v.lastAtk = e.atkCd; v.lunge -= dt;
    const lk = v.lunge > 0 ? Math.sin((0.22 - v.lunge) / 0.22 * Math.PI) : 0, toP = Math.atan2(p.y - e.y, p.x - e.x);
    v.hitT -= dt; if (e.hitT > 0.1) v.hitT = 0.12;
    const hk = Math.max(0, v.hitT) / 0.12, punch = 1 + hk * 0.12;
    const rise = clamp(v.age / 0.35, 0.05, 1);
    const windup = e.boss && (e.busy || 0) > 0 ? 0.95 + Math.sin(v.t * 30) * 0.01 : 1;
    const stretch = T === 'wolf' && e.st === 2 ? 1.15 : 1;
    v.body.scale.set(v.base * flip * punch * (1 + lk * 0.1) * stretch, v.base * squash * punch * rise * windup / stretch);
    v.body.position.set(Math.cos(toP) * lk * 14, -bob - lk * 4);
    v.body.rotation = rot + (e.x > p.x ? 1 : -1) * 0.22 * hk + Math.cos(toP) * lk * 0.25;
    v.body.alpha = e.alpha * (e.hidden ? 0.2 : 1) * (v.age < 0.35 ? v.age / 0.35 : 1);
    v.shadow.scale.x = Math.abs(v.shadow.scale.y) * (1 - bob * 0.01);
    if (hk > 0 || v.flash) {
      if (!v.flash) { v.flash = new Sprite(v.body.texture); v.flash.blendMode = 'add'; v.root.addChild(v.flash); }
      const fl = v.flash; fl.texture = v.body.texture; fl.anchor.copyFrom(v.body.anchor); fl.position.copyFrom(v.body.position); fl.scale.copyFrom(v.body.scale); fl.rotation = v.body.rotation;
      fl.alpha = hk * 0.7; fl.visible = hk > 0;
    }
  }
  private drawEnemies(w: World, dt: number, x0: number, y0: number, x1: number, y1: number) {
    const p = w.p, alive = new Set<number>();
    for (const e of w.enemies) {
      if (e.dead) continue; alive.add(e.id);
      let v = this.views.get(e.id);
      const vis = e.x > x0 - 140 && e.x < x1 + 140 && e.y > y0 - 60 && e.y < y1 + 240;
      if (!vis) { if (v) { v.root.visible = false; v.px = NaN; } continue; }
      if (!v) { v = this.enemyView(e); if (e.boss || e.anchor) v.age = 9; this.views.set(e.id, v); }
      v.root.visible = true; v.root.position.set(e.x, e.y); v.root.zIndex = e.y;
      if (e.anchor) { v.t += dt; v.body.y = -8 + Math.sin(this.time * 3 + e.id) * 5; v.body.rotation = Math.sin(this.time * 2) * 0.05; v.body.scale.set(v.base); }
      else if (v.rig) this.animRigEnemy(v, e, w, dt);
      else { this.animEnemy(v, e, w, dt); v.body.tint = e.elite ? 0xffe2a8 : e.vulnT > 0 ? 0xffd8b0 : 0xffffff; }
      if (e.boss && (e.guard || 0) > 0) this.over.arc(e.x, e.y - 60, e.r + 30, e.face - 1.1, e.face + 1.1).stroke({ color: 0xe5ecf5, width: 8, alpha: 0.8 });
      if (!e.boss && (e.anchor || (e.hp < e.maxHp && (e.elite || e.maxHp > 90)))) {
        const bw = 30, by = e.y - v.h - 10; this.over.rect(e.x - bw / 2, by, bw, 4).fill({ color: 0, alpha: 0.6 }).rect(e.x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), 4).fill({ color: e.anchor ? 0x66ffff : 0xcc3333 });
      }
    }
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      if (v.rig) { this.shatter(v, p.x); this.views.delete(id); continue; }
      if (v.dying === 0) { v.fallDir = v.root.x > p.x ? 1 : -1; if (v.flash) v.flash.visible = false; }
      v.dying += dt;
      const k = Math.min(1, v.dying / 0.22);
      v.body.rotation = v.fallDir * (Math.PI / 2) * k * k * 0.9; v.body.y = -4 * Math.sin(k * Math.PI);
      v.body.alpha = v.dying < 0.35 ? 1 : Math.max(0, 1 - (v.dying - 0.35) * 3); v.shadow.alpha = v.body.alpha;
      if (v.dying > 0.7) { v.root.destroy({ children: true }); this.views.delete(id); }
    }
  }
  private drawPlayer(w: World, dt: number) {
    const p = w.p, v = this.player;
    v.root.position.set(p.x, p.y); v.root.zIndex = p.y;
    const slot = p.weapons.find(s => s.id === this.lastWeapon) || p.weapons[0];
    if (!slot) return;
    this.setWeapon(slot.id);
    const d = WEAPONS[slot.id];
    // aim: at the last target while fighting, otherwise drift toward the travel direction
    const fighting = this.time - this.lastAttackT < 1.4;
    const want = fighting ? slot.aim : (p.moving ? Math.atan2(p.mvy, p.mvx) : this.aimSmooth);
    const da = Math.atan2(Math.sin(want - this.aimSmooth), Math.cos(want - this.aimSmooth));
    this.aimSmooth += da * Math.min(1, dt * (fighting ? 30 : 8));
    const rollK = p.rollT > 0 ? 1 - p.rollT / ARMORS[p.armorId].roll.time : 0;
    if (this.rig) {
      const two = slot.id === 'arquebus' || slot.id === 'blunderbuss' || slot.id === 'crossbow';
      this.rig.update(dt, { moving: p.moving && p.rollT <= 0 ? 1 : 0, speed: hyp(p.vx, p.vy), dirX: Math.sign(p.vx), aim: this.aimSmooth,
        mode: d.kind === 'melee' ? 'melee' : two ? 'gun2' : 'gun', swing: d.kind === 'melee' && slot.swingT > 0 ? 1 - slot.swingT / 0.2 : -1, roll: rollK, rollDir: p.rollDx >= 0 ? 1 : -1 });
      const blink = p.inv > 0 && p.rollT <= 0 && Math.floor(this.time * 20) % 2 === 0;
      this.rig.root.tint = p.flashBlock > 0 ? 0x9cc8ff : blink ? 0xff9a9a : p.frenzyT > 0 ? 0xffc8a0 : p.moonT > 0 ? 0xd0e0ff : 0xffffff;
      this.weapon.visible = p.rollT <= 0;
    } else {
      this.animBody(v, dt, p.moving && p.rollT <= 0, Math.cos(this.aimSmooth) >= 0, 11, 3.5);
      if (p.rollT > 0) { v.body.rotation = (p.rollDx >= 0 ? 1 : -1) * rollK * TAU; v.body.y = -18 * Math.sin(rollK * Math.PI); }
      const left = Math.cos(this.aimSmooth) < 0, off = (this.weapon as any)._rotOff || 0;
      this.weapon.position.set(left ? -14 : 14, -42 + v.body.y); this.weapon.rotation = this.aimSmooth + (left ? -off : off);
      this.weapon.scale.y = Math.abs(this.weapon.scale.y) * (left ? -1 : 1); this.weapon.visible = p.rollT <= 0;
    }
    if (p.rollT > 0) { this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.025; this.part(p.x - p.vx * 0.02, p.y - 40 + (Math.random() - 0.5) * 30, 0x3a4c78, { tex: softTex(), size: 16, life: 0.22, add: true }); } }
    // muzzle position in world space (for flashes)
    const g = this.weapon.toGlobal(this.muzzleLocal), wl = this.world.toLocal(g);
    this.muzzle = { x: wl.x, y: wl.y, ok: this.weapon.visible };
  }

  private drawPets(w: World, dt: number) {
    const p = w.p, def = PETS[p.pet.id];
    const want = new Set<string>();
    const body = (key: string, x: number, y: number, h: number, faceRight: boolean, moving: boolean, col: number, fly = false) => {
      want.add(key);
      let v = this.pets.get(key);
      if (!v) { v = this.makeView(sprite(def.sprite) || placeholderBody('pet_' + p.pet.id, col, h, { wide: 0.8, eyes: 0x88ff88 }), h, false, fly ? 0.5 : 0.8); this.pets.set(key, v); }
      v.root.position.set(x, y); v.root.zIndex = y; this.animBody(v, dt, moving, faceRight, 12, 2);
      if (fly) { v.body.y = -30 + Math.sin(this.time * 4) * 4; v.shadow.alpha = 0.5; }
    };
    if (w.hound) body('hound', w.hound.x, w.hound.y, 60, Math.cos(w.hound.face) > 0, true, 0x9ec8ff);
    if (w.cat) body('cat', w.cat.x, w.cat.y, 44, Math.cos(w.cat.face) > 0, w.cat.st === 1, 0xd8d2c0);
    if (w.wisp) {
      body('wisp', w.wisp.x, w.wisp.y + 40, 46, p.x > w.wisp.x, false, 0xffd070, true);
      const R = 70 * (p.pet.lv >= 3 ? 1.4 : 1); this.over.circle(p.x, p.y, R).stroke({ color: 0xffd070, width: 1.5, alpha: 0.18 + 0.06 * Math.sin(this.time * 4) });
    }
    const ravenUp = sprite(['pets', 'raven-wings-up']), ravenDown = sprite(['pets', 'raven-wings-down']);
    w.ravens.forEach((r, i) => {
      const key = 'raven' + i; want.add(key);
      let v = this.pets.get(key);
      if (!v) { v = this.makeView(sprite(def.sprite) || gen('raven', g => { g.ellipse(0, -8, 12, 7).fill({ color: 0x14141c }); g.poly([-2, -8, -14, -22, 6, -8, -14, 6]).fill({ color: 0x14141c }); g.circle(7, -10, 1.5).fill({ color: 0xe03030 }); }), 34, false, 0.4); this.pets.set(key, v); }
      v.root.position.set(r.x, r.y + 30); v.root.zIndex = r.y + 30; v.t += dt;
      if (ravenUp && ravenDown) {
        v.body.texture = Math.sin(this.time * 18 + i) >= 0 ? ravenUp : ravenDown;
        v.body.anchor.set(0.5);
        v.base = 44 / Math.max(ravenUp.width, ravenDown.width);
      }
      v.body.y = -30; v.body.scale.set(v.base * (Math.cos(r.fa) >= 0 ? 1 : -1), v.base * (ravenUp && ravenDown ? 1 : 0.85 + 0.15 * Math.abs(Math.sin(this.time * 18 + i))));
      v.body.rotation = r.st === 1 ? clamp(Math.sin(r.fa) * 0.6, -0.6, 0.6) * (Math.cos(r.fa) >= 0 ? 1 : -1) : 0; v.shadow.alpha = 0.3;
    });
    for (const [k2, v] of this.pets) if (!want.has(k2)) { v.root.destroy({ children: true }); this.pets.delete(k2); }
  }
  /** sim shots fly at ground level; we draw them at hand height (SHOT_H) as glowing tracers */
  private drawShots(w: World) {
    const SHOT_H = 46;
    let i = 0;
    for (const q of w.shots) {
      const s = this.shotPool[i] || (this.shotPool[i] = this.shotsL.addChild(new Sprite()));
      const bolt = q.src === 'crossbow';
      s.texture = bolt ? gen('shot_bolt', g => { g.rect(-16, -1.3, 24, 2.6).fill({ color: 0x3a2a1c }); g.poly([6, -3.5, 14, 0, 6, 3.5]).fill({ color: 0xd4dce6 }); g.poly([-16, -1, -20, -4, -12, -1]).fill({ color: 0x8a2a2a }); g.poly([-16, 1, -20, 4, -12, 1]).fill({ color: 0x8a2a2a }); })
        : tracerTex(q.src === 'arquebus' ? 'long' : q.src === 'blunderbuss' ? 'pellet' : 'ball');
      s.anchor.set(bolt ? 0.5 : 0.92, 0.5); s.visible = true; s.position.set(q.x, q.y - SHOT_H); s.rotation = q.ang; s.blendMode = bolt ? 'normal' : 'add';
      s.scale.set(1); i++;
    }
    for (; i < this.shotPool.length; i++) this.shotPool[i].visible = false;
    i = 0;
    for (const q of w.eshots) {
      const s = this.eshotPool[i] || (this.eshotPool[i] = this.shotsL.addChild(new Sprite()));
      const arrow = q.col === 0xe6e0c0;
      s.texture = arrow ? gen('arrow', g => { g.rect(-16, -1, 24, 2).fill({ color: 0x6b4a2a }); g.poly([8, -3.5, 15, 0, 8, 3.5]).fill({ color: 0xe6e0c0 }); g.poly([-16, -1, -20, -4, -12, -1]).fill({ color: 0xcfc8b2 }); g.poly([-16, 1, -20, 4, -12, 1]).fill({ color: 0xcfc8b2 }); })
        : gen('orb', g => { for (let k = 6; k > 0; k--) g.circle(0, 0, 3 + k * 2).fill({ color: 0xffffff, alpha: 0.08 }); g.circle(0, 0, 5).fill({ color: 0xffffff }); });
      s.tint = arrow ? 0xffffff : q.col; s.anchor.set(0.5); s.visible = true; s.position.set(q.x, q.y); s.rotation = Math.atan2(q.vy, q.vx); s.blendMode = arrow ? 'normal' : 'add';
      s.scale.set(arrow ? 1 : 1 + 0.15 * Math.sin(this.time * 20 + i)); i++;
    }
    for (; i < this.eshotPool.length; i++) this.eshotPool[i].visible = false;
  }
  private drawGems(w: World) {
    const sheet = pieces(['items', 'gem']);
    const gt = (v: number) => {
      const tier = v >= 60 ? 2 : v >= 25 ? 1 : 0;
      if (sheet.length >= 3) return sheet[tier];
      return gen('gem' + tier, g => { const s = [4, 5, 6.5][tier], c = [0x6fe0a0, 0x7fb7ff, 0xe8c35a][tier]; g.circle(0, 0, s * 2.2).fill({ color: c, alpha: 0.18 }); g.poly([0, -s * 1.5, s, 0, 0, s * 1.5, -s, 0]).fill({ color: c }); });
    };
    let i = 0;
    for (const gm of w.gems) {
      const s = this.gemPool[i] || (this.gemPool[i] = this.gemsL.addChild(new Sprite()));
      const t = gt(gm.v); if (s.texture !== t) { s.texture = t; s.anchor.set(0.5); s.scale.set(sheet.length >= 3 ? (gm.v >= 60 ? 22 : gm.v >= 25 ? 17 : 13) / t.height : 1); }
      s.visible = true; s.position.set(gm.x, gm.y - 6 + Math.sin(this.time * 4 + i) * 2); i++;
    }
    for (; i < this.gemPool.length; i++) this.gemPool[i].visible = false;
  }
  private drawFx(dt: number) {
    for (const q of this.parts) {
      q.life -= dt; q.vy += q.g * dt; q.vx *= 0.94; q.vy *= q.g ? 0.98 : 0.94;
      q.s.x += q.vx * dt; q.s.y += q.vy * dt; if (q.grow) q.s.scale.set(q.s.scale.x * (1 + q.grow * dt)); q.s.rotation += q.spin * dt;
      if (q.fade) q.s.alpha = clamp(q.life / q.max, 0, 1);
      if (q.life <= 0) { q.s.visible = false; this.fx.removeChild(q.s); this.partPool.push(q.s); }
    }
    this.parts = this.parts.filter(q => q.life > 0);
    for (const g of this.ghosts) { g.life -= dt; g.s.alpha = Math.max(0, g.life / 0.22) * 0.45; if (g.life <= 0) g.s.destroy(); }
    this.ghosts = this.ghosts.filter(g => g.life > 0);
    const g = this.fxG; g.clear();
    for (const s of this.slashes) {
      s.life -= dt; const a = clamp(s.life / s.max, 0, 1);
      if (s.arc >= TAU - 0.01) { const k = 1 - a; g.circle(s.x, s.y, s.r * (0.6 + k * 0.5)).stroke({ color: s.heavy ? 0xffb09a : 0xe6d9a8, width: 6 * a + 1, alpha: a * 0.85 }); continue; }
      // smear: slices from the trailing edge (faint) to the leading edge (bright), band from inner to outer radius
      const N = 12, a0 = s.ang - s.arc / 2, sweep = s.arc * (0.55 + 0.45 * (1 - a)), inner = s.r * 0.45;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, b0 = a0 + sweep * t0, b1 = a0 + sweep * t1;
        const al = Math.pow(t1, 1.6) * a * (s.heavy ? 0.65 : 0.5);
        g.moveTo(s.x + Math.cos(b0) * inner, s.y + Math.sin(b0) * inner).arc(s.x, s.y, s.r, b0, b1).arc(s.x, s.y, inner, b1, b0, true).fill({ color: s.heavy ? 0xffb4a0 : 0xf2f4f8, alpha: al });
      }
      const lead = a0 + sweep;
      g.moveTo(s.x + Math.cos(a0 + sweep * 0.45) * s.r, s.y + Math.sin(a0 + sweep * 0.45) * s.r).arc(s.x, s.y, s.r, a0 + sweep * 0.45, lead).stroke({ color: 0xffffff, width: s.heavy ? 4 : 2.5, alpha: a * 0.9 });
    }
    this.slashes = this.slashes.filter(s => s.life > 0);
    for (const d of this.debris) {
      d.life -= dt; d.vy += 900 * dt; d.s.x += d.vx * dt; d.s.y += d.vy * dt; d.s.rotation += d.vr * dt;
      if (d.s.y > d.ground && d.vy > 0) { d.s.y = d.ground; d.vy *= -0.32; d.vx *= 0.55; d.vr *= 0.5; d.bounced++; if (d.bounced > 2) { d.vy = 0; d.vx *= 0.8; } }
      d.s.alpha = Math.min(1, d.life / 0.5);
      if (d.life <= 0) d.s.destroy();
    }
    this.debris = this.debris.filter(d => d.life > 0);
    for (const n of this.numPool) { if (n.life <= 0) continue; n.life -= dt; n.t.y += n.vy * dt; n.t.alpha = clamp(n.life / 0.8, 0, 1); if (n.life <= 0) n.t.visible = false; }
  }
  private drawOver(w: World, x0: number, y0: number, vw: number, vh: number) {
    const g = this.over;
    if (w.arena) {
      const a = w.arena;
      g.rect(x0 - 20, y0 - 20, vw + 40, vh + 40).fill({ color: 0, alpha: 0.5 }).circle(a.x, a.y, a.r).cut();
      g.circle(a.x, a.y, a.r).stroke({ color: 0xd6b266, width: 3, alpha: 0.55 });
    }
    this.chest.visible = !!w.chest;
    if (w.chest) { this.chest.position.set(w.chest.x, w.chest.y); this.chest.zIndex = w.chest.y; const s = 64 / this.chest.texture.height * (1 + 0.04 * Math.sin(this.time * 5)); this.chest.scale.set(s); }
  }
  private drawScreen(w: World, dt: number, W: number, H: number, zoom: number) {
    const bf = BIOMES[w.biomeFrom], bt = BIOMES[w.biome], k = w.biomeT;
    this.fog.clear().rect(0, 0, W, H).fill({ color: mixCol(bf.fog, bt.fog, k), alpha: lerp(bf.fogA, bt.fogA, k) });
    this.vig.width = W; this.vig.height = H;
    this.light.position.set(W / 2 + (w.p.x - this.cam.x) * zoom, H / 2 + (w.p.y - 40 - this.cam.y) * zoom); this.light.scale.set(Math.min(W, H) / 256 * 1.1);
    this.flashA = Math.max(0, this.flashA - dt * 1.6);
    const type = BIOMES[w.biome].part;
    if (type === 'rain') { this.lightT -= dt; if (this.lightT <= 0) { this.lightT = 4 + Math.random() * 6; this.lightning = 0.45; } }
    this.lightning = Math.max(0, this.lightning - dt * 1.6);
    this.flash.clear();
    if (this.lightning > 0) this.flash.rect(0, 0, W, H).fill({ color: 0xdce6ff, alpha: this.lightning * 0.5 });
    if (this.flashA > 0) this.flash.rect(0, 0, W, H).fill({ color: this.flashCol, alpha: this.flashA * 0.4 });
    if (w.p.hp < w.p.maxHp * 0.3 && w.mode === 'play') this.flash.rect(0, 0, W, H).fill({ color: 0x8a0000, alpha: 0.08 + 0.05 * Math.sin(this.time * 6) });
    for (const a of this.ambient) {
      let vx = 0, vy = 0;
      if (type === 'snow') { vy = 0.05; vx = 0.025; } else if (type === 'mire') { vy = 0.004; vx = 0.01; } else if (type === 'fog') { vx = 0.02; } else if (type === 'ash') { vy = 0.03; vx = -0.012; } else { vy = 0.6; vx = -0.14; }
      a.x += vx * dt * (0.5 + a.z); a.y += vy * dt * (0.5 + a.z); if (a.x > 1) a.x -= 1; if (a.x < 0) a.x += 1; if (a.y > 1) a.y -= 1;
      const s = a.s; s.position.set(a.x * W, a.y * H); s.rotation = 0;
      if (type === 'snow') { s.texture = circleTex(); s.tint = 0xebf2fa; s.alpha = 0.7; s.scale.set((1.5 + a.z * 1.5) / 32); }
      else if (type === 'mire' || type === 'fog') { s.texture = softTex(); s.tint = type === 'mire' ? 0x6eb46e : 0xb4bec8; s.alpha = 0.18; s.scale.set((type === 'mire' ? 24 + a.z * 40 : 40 + a.z * 70) / 30); }
      else if (type === 'ash') { s.texture = circleTex(); s.tint = a.z > 0.7 ? 0xff8c3c : 0xaaa096; s.alpha = a.z > 0.7 ? 0.8 : 0.55; s.scale.set((1.5 + a.z) / 32); }
      else { s.texture = circleTex(); s.tint = 0xb4c3e6; s.alpha = 0.35; s.scale.set(0.6 / 32, 14 / 32); s.rotation = -0.27; }
    }
  }
}
