// Deterministic simulation. No DOM, no rendering, no Math.random: everything goes through w.rng,
// so the same seed + inputs replays the same run (and it can run headless for balance sims).
import { TAU, angDiff, clamp, hyp } from './math';
import { ARMORS, BIOMES, BOSSES, BOSS_DMG, BOSS_SPEED, DENS, ENEMIES, PX, WORLD, XP_MUL, needXp, weaponStats, WEAPONS, type EnemyType } from './data';
import type { Enemy, World, GameEvent } from './world';
import { genCards, relicCards } from './cards';

export interface Input { mx: number; my: number; roll: boolean; }
export const SPAWN_DIST = 760;

const ev = (w: World, e: GameEvent) => { if (w.events.length < 600) w.events.push(e); };
export const banner = (w: World, text: string, sub = '') => ev(w, { t: 'banner', text, sub });
const later = (w: World, d: number, fn: () => void) => { w.delayed.push({ t: d, fn }); };

// ------------------------------------------------------------ derived stats
const lowHp = (w: World) => w.p.relics.chalice && w.p.hp < w.p.maxHp * 0.45;
export function dmgMulT(w: World) {
  const p = w.p; let m = 1 + p.dmgMul;
  if (p.frenzyT > 0) m += 0.15; if (p.moonT > 0) m += 0.15;
  if (p.relics.hide && p.hp >= p.maxHp - 0.01) m += 0.12; if (lowHp(w)) m += 0.4;
  return m;
}
export const critT = (w: World) => w.p.crit + (w.p.moonT > 0 ? 0.3 : 0);
export function cdFactor(w: World) {
  const p = w.p; let f = Math.max(0.35, 1 - p.cdMul);
  if (p.frenzyT > 0) f /= 1.35; if (lowHp(w)) f *= 0.8;
  return f;
}
export function moveSpd(w: World) { const p = w.p; return p.speed * (1 + p.spdMul + (p.bellT > 0 ? 0.2 : 0) + (p.frenzyT > 0 ? 0.2 : 0)); }
export const areaT = (w: World) => 1 + w.p.areaMul + w.p.reachMul * 0.6;
export const pickR = (w: World) => 2.5 * PX * (1 + w.p.pickMul);
export const effT = (w: World) => w.t;

export function nearest(w: World, x: number, y: number, maxD: number) {
  let b: Enemy | null = null, bd = maxD * maxD;
  for (const e of w.enemies) {
    if (e.dead || e.fade || e.hidden) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; b = e; }
  }
  return b;
}

// ------------------------------------------------------------ damage
interface HitOpts { kb?: number; ang?: number; noCrit?: boolean; ignoreShield?: boolean; bleed?: boolean; melee?: boolean; gun?: boolean; vuln?: number; slow?: number; }
export function hitEnemy(w: World, e: Enemy, base: number, src: string, o: HitOpts = {}) {
  if (e.dead || e.fade || e.hidden) return 0;
  const p = w.p; let d = base * dmgMulT(w);
  if (o.melee) d *= 1 + p.meleeMul + (p.relics.whetstone ? 0.25 : 0);
  if (o.gun) d *= 1 + p.gunMul + (p.relics.powder ? 0.25 : 0);
  if (e.hp < e.maxHp * 0.25) d *= 1 + p.exec;
  let crit = false;
  if (!o.noCrit && w.rng.next() < critT(w)) { crit = true; let cd = p.critDmg; if (p.relics.sigil && (e.elite || e.boss)) cd += 0.35; d *= cd; }
  if (e.vulnT > 0) d *= 1 + e.vulnA;
  if (!o.ignoreShield) {
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.type === 'shield' && Math.abs(angDiff(a, e.face)) < 1.15) d *= 0.25;
    if (e.boss && (e.guard || 0) > 0 && Math.abs(angDiff(a, e.face)) < 1.1) d *= 0.3;
  }
  e.hp -= d; e.hitT = 0.12;
  w.dmgDealt += d; w.dmgBy[src] = (w.dmgBy[src] || 0) + d;
  if (o.kb && !e.boss && !e.anchor) {
    const a = o.ang !== undefined ? o.ang : Math.atan2(e.y - p.y, e.x - p.x);
    const kb = o.kb * (e.elite ? 0.5 : 1) * (e.type === 'zombie' || e.type === 'drowned' ? 0.8 : 1);
    e.kx += Math.cos(a) * kb; e.ky += Math.sin(a) * kb;
  }
  if (o.bleed) e.bleedT = 3;
  if (o.melee && p.relics.whetstone) { e.vulnT = Math.max(e.vulnT, 2); e.vulnA = Math.max(e.vulnA, 0.15); }
  if (o.vuln) { e.vulnT = 3; e.vulnA = Math.max(e.vulnA, o.vuln); }
  if (o.slow) e.slowT = Math.max(e.slowT, o.slow);
  ev(w, { t: 'hit', x: e.x, y: e.y - e.r, dmg: d, crit, src, col: e.type === 'plague' ? 0x8aa13a : e.type === 'wraith' ? 0x7fa3d9 : e.anchor ? 0x99ffee : undefined });
  if (e.hp <= 0) killEnemy(w, e, src);
  return d;
}

function dropGem(w: World, x: number, y: number, v: number) {
  if (w.gems.length > 260) {
    let b = null, bd = 1e9; for (const g of w.gems) { const d = (g.x - x) ** 2 + (g.y - y) ** 2; if (d < bd) { bd = d; b = g; } }
    if (b) { b.v += v; return; }
  }
  w.gems.push({ x, y, v, fly: false });
}
function killEnemy(w: World, e: Enemy, src: string) {
  if (e.dead) return;
  e.dead = true; w.kills++;
  const p = w.p;
  if (e.boss) { onBossDead(w, e); return; }
  if (e.anchor) { if (w.drain) { w.drain.left--; banner(w, 'Anchor shattered', ''); } ev(w, { t: 'kill', x: e.x, y: e.y, type: 'anchor', elite: false }); return; }
  ev(w, { t: 'kill', x: e.x, y: e.y, type: e.type, elite: e.elite });
  dropGem(w, e.x, e.y, Math.round(e.xp * XP_MUL));
  if (e.type === 'plague') w.zones.push({ k: 'cloud', hostile: true, x: e.x, y: e.y, r: 56, life: 4, max: 4, tick: 0.3, dmg: 6 });
  if (p.relics.censer && w.rng.next() < 0.18) w.zones.push({ k: 'rot', hostile: false, x: e.x, y: e.y, r: 50, life: 4, max: 4, tick: 0.3, dmg: 0 });
  if (p.relics.bell) { w.bellKills++; if (w.bellKills >= 40) { w.bellKills = 0; bellPulse(w); } }
  if (p.relics.heart) { w.heartKills++; if (w.heartKills >= 60) { w.heartKills = 0; p.frenzyT = 7; ev(w, { t: 'frenzy', x: p.x, y: p.y }); } }
  void src;
}
function bellPulse(w: World) {
  const p = w.p; p.bellT = 3; ev(w, { t: 'bell', x: p.x, y: p.y, r: 160 });
  for (const e of w.enemies) {
    if (e.dead || e.boss || e.anchor) continue;
    if (hyp(e.x - p.x, e.y - p.y) < 160 + e.r) { const a = Math.atan2(e.y - p.y, e.x - p.x); e.kx += Math.cos(a) * 520; e.ky += Math.sin(a) * 520; e.fear = 1.8; }
  }
}

// ------------------------------------------------------------ player
export function hurt(w: World, dmg: number, soft = false) {
  const p = w.p;
  if (w.mode !== 'play' || p.hp <= 0) return false;
  if (p.rollInv > 0) { if (!soft && p.moonT <= 3.9) perfect(w); return false; }
  if (p.inv > 0) return false;
  if (p.relics.shield && p.blockCd <= 0) {
    p.blockCd = 14 - Math.min(5, Math.floor(w.kills / 25)); p.inv = 0.6; p.flashBlock = 0.4; ev(w, { t: 'block', x: p.x, y: p.y }); return false;
  }
  const d = Math.max(1, dmg / (1 + p.armor / 40));
  p.hp -= d; p.inv = soft ? 0.12 : 0.45; p.hurtT = 0.3;
  ev(w, { t: 'hurt', x: p.x, y: p.y, v: d });
  if (p.hp <= 0) {
    if (p.pet.id === 'wisp' && p.pet.lv >= 5 && !p.reviveUsed) { p.reviveUsed = true; p.hp = p.maxHp * 0.4; p.inv = 1.5; ev(w, { t: 'revive', x: p.x, y: p.y }); return true; }
    p.hp = 0; endRun(w, false);
  }
  return true;
}
function perfect(w: World) {
  const p = w.p; ev(w, { t: 'perfect', x: p.x, y: p.y });
  if (p.relics.moonfang) p.moonT = 4;
}

function updatePlayer(w: World, inp: Input, dt: number) {
  const p = w.p, A = ARMORS[p.armorId];
  let ix = inp.mx, iy = inp.my; const m = hyp(ix, iy); if (m > 1) { ix /= m; iy /= m; }
  p.rollCd -= dt; p.rollInv -= dt;
  if (inp.roll && p.rollCd <= 0 && p.rollT <= 0) {
    let dx = ix, dy = iy; if (!dx && !dy) { dx = p.mvx; dy = p.mvy; }
    const l = hyp(dx, dy) || 1; p.rollDx = dx / l; p.rollDy = dy / l;
    p.rollT = A.roll.time; p.rollInv = A.roll.iframes * (1 + p.iframeBonus);
    p.rollCd = A.roll.cd * Math.max(0.4, 1 - p.rollCdMul);
    if (p.relics.quick) for (const s of p.weapons) if (WEAPONS[s.id].kind === 'shot') s.cd = Math.min(s.cd, 0.05);
    ev(w, { t: 'roll', x: p.x, y: p.y });
  }
  if (p.rollT > 0) {
    const sp = A.roll.dist / A.roll.time; p.rollT -= dt;
    p.vx = p.rollDx * sp; p.vy = p.rollDy * sp;
  } else {
    const sp = moveSpd(w); p.vx = ix * sp; p.vy = iy * sp;
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.moving = hyp(p.vx, p.vy) > 5;
  if (ix || iy) { const l = hyp(ix, iy); p.mvx = ix / l; p.mvy = iy / l; }
  p.x = clamp(p.x, -WORLD, WORLD); p.y = clamp(p.y, -WORLD, WORLD);
  if (w.arena) { const a = w.arena, dx = p.x - a.x, dy = p.y - a.y, d = hyp(dx, dy), R = a.r - 14; if (d > R) { p.x = a.x + dx / d * R; p.y = a.y + dy / d * R; } }
  const rg = p.regen + (p.relics.hide ? 0.35 : 0) + wispHeal(w);
  if (rg > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + rg * dt);
  p.inv -= dt; p.blockCd -= dt; p.moonT -= dt; p.bellT -= dt; p.frenzyT -= dt; p.flashBlock -= dt; p.hurtT -= dt;
}

// ------------------------------------------------------------ weapons
function updateWeapons(w: World, dt: number) {
  const p = w.p, cdf = cdFactor(w);
  for (const s of p.weapons) {
    const st = weaponStats(s.id, s.lv), def = WEAPONS[s.id];
    s.swingT -= dt;
    if (s.burstLeft > 0) { s.burstT -= dt; if (s.burstT <= 0) { fireShot(w, s.id, st, s.aim); s.burstLeft--; s.burstT = 0.13; } }
    s.cd -= dt; if (s.cd > 0) continue;
    if (def.kind === 'melee') {
      const reach = st.range * (1 + p.reachMul) * (p.relics.scripture ? 1.1 : 1);
      const t = nearest(w, p.x, p.y, reach * 1.25 + 20); if (!t) { s.cd = 0.1; continue; }
      s.cd = st.cd * cdf; s.swings++; s.swingT = 0.2;
      const ang = Math.atan2(t.y - p.y, t.x - p.x); s.aim = ang; p.face = ang;
      const heavy = st.heavyEvery > 0 && s.swings % st.heavyEvery === 0;
      const arc = st.arc * (heavy ? 1.25 : 1);
      const list: { e: Enemy; d: number }[] = [];
      for (const e of w.enemies) {
        if (e.dead || e.fade || e.hidden) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = hyp(dx, dy); if (d - e.r > reach) continue;
        if (Math.abs(angDiff(Math.atan2(dy, dx), ang)) <= arc / 2 + Math.atan2(e.r, Math.max(d, 1))) list.push({ e, d });
      }
      list.sort((a, b) => a.d - b.d);
      const cap = heavy || s.id === 'greatsword' ? 999 : 5;
      for (let i = 0; i < list.length && i < cap; i++)
        hitEnemy(w, list[i].e, heavy ? st.dmg * 2 : st.dmg, s.id, { melee: true, kb: heavy ? st.kb * 1.8 : st.kb, ang });
      ev(w, { t: 'swing', x: p.x, y: p.y, ang, arc, range: reach, heavy, w: s.id });
      if (st.shock > 0) {
        const R = reach * 1.5 * areaT(w); ev(w, { t: 'shock', x: p.x, y: p.y, r: R });
        for (const e of w.enemies) { if (e.dead || e.fade || e.hidden) continue; if (hyp(e.x - p.x, e.y - p.y) < R + e.r) hitEnemy(w, e, st.dmg * st.shock, s.id, { melee: true, kb: 140, noCrit: true }); }
      }
    } else {
      const t = nearest(w, p.x, p.y, st.range * 0.92); if (!t) { s.cd = 0.1; continue; }
      s.cd = st.cd * cdf;
      const ang = Math.atan2(t.y - p.y, t.x - p.x); s.aim = ang; p.face = ang;
      fireShot(w, s.id, st, ang);
      if (st.burst > 1) { s.burstLeft = st.burst - 1; s.burstT = 0.13; }
    }
  }
}
function fireShot(w: World, id: import('./data').WeaponId, st: ReturnType<typeof weaponStats>, ang: number) {
  const p = w.p, n = st.pellets + (p.extraShots || 0);
  for (let i = 0; i < n; i++) {
    const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * (st.spread || 0.12) : 0) + (st.pellets > 2 ? w.rng.range(-0.04, 0.04) : 0);
    const sp = st.speed * (st.pellets > 2 ? w.rng.range(0.9, 1.08) : 1);
    w.shots.push({ x: p.x + Math.cos(ang) * 18, y: p.y - 10 + Math.sin(ang) * 18, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: st.range / sp, r: id === 'blunderbuss' ? 5 : 7,
      dmg: st.dmg, pierce: st.pierce, hit: new Set(), kb: st.kb, bleed: st.bleed, blast: st.blast, src: id, ang: a });
  }
  ev(w, { t: 'shot', x: p.x, y: p.y, ang, w: id });
}
function updateShots(w: World, dt: number) {
  for (const q of w.shots) {
    q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    for (const e of w.enemies) {
      if (e.dead || e.fade || e.hidden || q.hit.has(e.id)) continue;
      if (hyp(e.x - q.x, e.y - q.y) < e.r + q.r) {
        q.hit.add(e.id);
        hitEnemy(w, e, q.dmg, q.src, { gun: true, kb: q.kb, ang: q.ang, bleed: q.bleed });
        if (q.pierce > 0) q.pierce--; else { q.life = 0; }
        break;
      }
    }
    if (q.life <= 0 && q.blast > 0) {
      const R = q.blast * areaT(w); ev(w, { t: 'blast', x: q.x, y: q.y, r: R });
      for (const e of w.enemies) { if (e.dead || e.fade || e.hidden) continue; if (hyp(e.x - q.x, e.y - q.y) < R + e.r) hitEnemy(w, e, q.dmg * 0.4, q.src, { gun: true, kb: 160, noCrit: true }); }
      q.blast = 0;
    }
  }
  w.shots = w.shots.filter(q => q.life > 0);
}

// ------------------------------------------------------------ pets
function wispHeal(w: World) { const p = w.p; return p.pet.id === 'wisp' ? 0.9 * (p.pet.lv >= 2 ? 1.5 : 1) : 0; }
function updatePets(w: World, dt: number) {
  const p = w.p, lv = p.pet.lv, id = p.pet.id;
  // ravens
  const want = id === 'raven' ? (lv >= 3 ? 2 : 1) + (p.relics.scripture ? 1 : 0) : 0;
  while (w.ravens.length < want) w.ravens.push({ x: p.x, y: p.y, a: w.rng.range(0, TAU), st: 0, cd: w.rng.range(0, 0.4), tgt: null, fa: 0 });
  if (w.ravens.length > want) w.ravens.length = want;
  const interval = lv >= 2 ? 0.5 : 0.8;
  w.ravens.forEach((r, i) => {
    r.a += dt * 2.4;
    if (r.st === 0) {
      const ox = p.x + Math.cos(r.a + i * Math.PI) * 52, oy = p.y - 30 + Math.sin(r.a + i * Math.PI) * 40, k = Math.min(1, dt * 10);
      r.x += (ox - r.x) * k; r.y += (oy - r.y) * k; r.fa = Math.atan2(oy - r.y, ox - r.x); r.cd -= dt;
      if (r.cd <= 0) { const t = nearest(w, p.x, p.y, 380); if (t) { r.st = 1; r.tgt = t; } r.cd = interval; }
    } else {
      const t = r.tgt; if (!t || t.dead || t.fade) { r.st = 0; return; }
      const dx = t.x - r.x, dy = t.y - r.y, d = hyp(dx, dy);
      if (d < t.r + 8) { hitEnemy(w, t, 16, 'raven', { bleed: lv >= 4, kb: 60 }); ev(w, { t: 'dive', x: t.x, y: t.y }); r.st = 0; }
      else { r.x += dx / d * 700 * dt; r.y += dy / d * 700 * dt; r.fa = Math.atan2(dy, dx); }
    }
  });
  if (id === 'raven' && lv >= 5) {
    w.murderT -= dt;
    if (w.murderT <= 0) {
      const t = nearest(w, p.x, p.y, 420);
      if (t) { w.murderT = 8; for (let i = 0; i < 6; i++) { const cx = t.x + w.rng.range(-70, 70), cy = t.y + w.rng.range(-70, 70);
        later(w, i * 0.08, () => { ev(w, { t: 'dive', x: cx, y: cy }); for (const e of w.enemies) { if (e.dead || e.fade || e.hidden) continue; if (hyp(e.x - cx, e.y - cy) < 60 * areaT(w) + e.r) hitEnemy(w, e, 28, 'raven', { kb: 90 }); } }); } }
      else w.murderT = 0.5;
    }
  }
  // ground pets: hound, wisp, cat share a body
  const body = (k: 'hound' | 'wisp' | 'cat') => { if (!w[k]) w[k] = { x: p.x - 30, y: p.y + 10, st: 0, cd: 1, t: 0, tgt: null, face: 0, atkT: 0 }; return w[k]!; };
  if (id !== 'hound') w.hound = null; if (id !== 'wisp') w.wisp = null; if (id !== 'cat') w.cat = null;
  if (id === 'hound') {
    const h = body('hound'); h.t += dt; h.cd -= dt; h.atkT -= dt;
    const spd = 330 * (lv >= 4 ? 1.3 : 1), dmg = 28 * (lv >= 2 ? 1.4 : 1), rate = lv >= 4 ? 0.7 : 1.0;
    if (!h.tgt || h.tgt.dead || h.tgt.fade || hyp(h.tgt.x - p.x, h.tgt.y - p.y) > 420) h.tgt = nearest(w, p.x, p.y, 350);
    const t = h.tgt;
    const gx = t ? t.x : p.x - 40, gy = t ? t.y : p.y + 20, dx = gx - h.x, dy = gy - h.y, d = hyp(dx, dy);
    if (t && d < t.r + 16) {
      if (h.cd <= 0) { h.cd = rate; h.atkT = 0.2; hitEnemy(w, t, dmg, 'hound', { kb: 120, slow: lv >= 3 ? 1.5 : 0 }); ev(w, { t: 'bite', x: t.x, y: t.y });
        if (lv >= 5) { const t2 = w.enemies.find(e => !e.dead && !e.fade && e !== t && hyp(e.x - t.x, e.y - t.y) < 120); if (t2) hitEnemy(w, t2, dmg * 0.7, 'hound', { kb: 80 }); } }
    } else if (d > (t ? 4 : 30)) { const s = Math.min(spd * (t ? 1 : d > 200 ? 1.4 : 0.8), d / dt); h.x += dx / d * s * dt; h.y += dy / d * s * dt; }
    if (d > 2) h.face = Math.atan2(dy, dx);
  }
  if (id === 'wisp') {
    const h = body('wisp'); h.t += dt; h.cd -= dt;
    const tx = p.x + Math.cos(h.t * 1.3) * 38, ty = p.y - 50 + Math.sin(h.t * 2.1) * 10, k = Math.min(1, dt * 6);
    h.x += (tx - h.x) * k; h.y += (ty - h.y) * k;
    const R = 70 * (lv >= 3 ? 1.4 : 1) * areaT(w), dps = 8 * (lv >= 4 ? 1.5 : 1);
    if (h.cd <= 0) { h.cd = 0.5; for (const e of w.enemies) { if (e.dead || e.fade || e.hidden) continue; if (hyp(e.x - p.x, e.y - p.y) < R + e.r) hitEnemy(w, e, dps * 0.5, 'wisp', { noCrit: true }); } }
  }
  if (id === 'cat') {
    const h = body('cat'); h.t += dt; h.cd -= dt; h.atkT -= dt;
    if (h.st === 0) {
      const tx = p.x + 34, ty = p.y + 18, dx = tx - h.x, dy = ty - h.y, d = hyp(dx, dy);
      if (d > 6) { const s = Math.min(d * 5, 420); h.x += dx / d * s * dt; h.y += dy / d * s * dt; h.face = Math.atan2(dy, dx); }
      if (h.cd <= 0) { const t = nearest(w, p.x, p.y, 300); if (t) { h.st = 1; h.tgt = t; } h.cd = lv >= 4 ? 1.5 : 3; }
    } else {
      const t = h.tgt; if (!t || t.dead || t.fade) { h.st = 0; return; }
      const dx = t.x - h.x, dy = t.y - h.y, d = hyp(dx, dy); h.face = Math.atan2(dy, dx);
      if (d < t.r + 10) { h.st = 0; h.atkT = 0.25;
        if (lv >= 5) { ev(w, { t: 'shock', x: t.x, y: t.y, r: 70 }); for (const e of w.enemies) { if (e.dead || e.fade || e.hidden) continue; if (hyp(e.x - t.x, e.y - t.y) < 70 + e.r) hitEnemy(w, e, 35, 'cat', { kb: 120 }); } }
        else { hitEnemy(w, t, 35, 'cat', { kb: 120 }); ev(w, { t: 'bite', x: t.x, y: t.y }); } }
      else { h.x += dx / d * 620 * dt; h.y += dy / d * 620 * dt; }
    }
  }
}

// ------------------------------------------------------------ zones & enemy shots
function updateZones(w: World, dt: number) {
  const p = w.p;
  for (const z of w.zones) {
    z.life -= dt; z.tick -= dt;
    if (z.hostile) { if (z.tick <= 0) { z.tick = 0.5; if (hyp(p.x - z.x, p.y - z.y) < z.r) hurt(w, z.dmg, true); } }
    else if (z.k === 'rot' && z.tick <= 0) { z.tick = 0.5; for (const e of w.enemies) { if (e.dead || e.fade || e.hidden) continue; if (hyp(e.x - z.x, e.y - z.y) < z.r + e.r) hitEnemy(w, e, 10, 'rot', { noCrit: true, ignoreShield: true }); } }
  }
  w.zones = w.zones.filter(z => z.life > 0);
}
function updateEshots(w: World, dt: number) {
  const p = w.p;
  for (const q of w.eshots) {
    q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    if (hyp(p.x - q.x, p.y - 8 - q.y) < q.r + 12) { const rolling = p.rollInv > 0; hurt(w, q.dmg); if (!rolling) q.life = 0; } // rolling passes through
  }
  w.eshots = w.eshots.filter(q => q.life > 0);
}

// ------------------------------------------------------------ director
const TARGETS = [[0, 12], [60, 25], [120, 40], [180, 55], [270, 60], [360, 80], [450, 95], [540, 115], [630, 130], [720, 150], [900, 200]];
function targetCount(T: number) { for (let i = 1; i < TARGETS.length; i++) if (T <= TARGETS[i][0]) { const a = TARGETS[i - 1], b = TARGETS[i]; return a[1] + (b[1] - a[1]) * (T - a[0]) / (b[0] - a[0]); } return 200; }
function pickType(w: World, T: number): EnemyType {
  const ws: [EnemyType, number][] = [['skeleton', Math.max(4, 10 - T / 90)]];
  if (T >= 60) ws.push(['zombie', 5]); if (T >= 120) ws.push(['archer', 3]);
  if (T >= 180) { ws.push(['ghoul', 4]); ws.push(['drowned', 3]); }
  if (T >= 270) ws.push(['plague', 3]); if (T >= 360) ws.push(['shield', 3]);
  if (T >= 450) ws.push(['wolf', 2]); if (T >= 540) ws.push(['wraith', 3]); if (T >= 630) ws.push(['cultist', 3]);
  let tot = 0; for (const x of ws) tot += x[1]; let r = w.rng.next() * tot;
  for (const x of ws) { if (r < x[1]) return x[0]; r -= x[1]; } return 'skeleton';
}
function blankEnemy(w: World): Enemy {
  return { id: w.nid++, type: 'skeleton', x: 0, y: 0, hp: 1, maxHp: 1, r: 12, spd: 0, dmg: 0, xp: 0, elite: false, kx: 0, ky: 0, hitT: 0, atkCd: 0, face: 0, st: 0, t: 0,
    cd: w.rng.range(0.5, 2.5), aim: 0, wt: 0, hitDone: false, sx: 0, sy: 0, bleedT: 0, bleedA: 0, burnT: 0, burnS: 0, burnA: 0, vulnT: 0, vulnA: 0, fear: 0, slowT: 0,
    alpha: 1, fade: 0, dead: false, ph: w.rng.range(0, TAU) };
}
function spawnEnemy(w: World, type: EnemyType, T: number) {
  const p = w.p, def = ENEMIES[type], a = w.rng.range(0, TAU);
  const elite = T >= 720 && w.rng.next() < 0.1, hpm = (1 + T / 900) * (elite ? 2 : 1);
  const e = blankEnemy(w);
  Object.assign(e, { type, x: clamp(p.x + Math.cos(a) * SPAWN_DIST, -WORLD + 20, WORLD - 20), y: clamp(p.y + Math.sin(a) * SPAWN_DIST, -WORLD + 20, WORLD - 20),
    hp: def.hp * hpm, maxHp: def.hp * hpm, r: def.r * (elite ? 1.25 : 1), spd: def.spd * PX * (elite ? 1.05 : 1), dmg: def.dmg * (1 + T / 1800) * (elite ? 1.3 : 1), xp: def.xp * (elite ? 2 : 1), elite });
  w.enemies.push(e);
}
function updateDirector(w: World, dt: number) {
  if (w.lock) return;
  const T = effT(w);
  let tgt = targetCount(T) * DENS;
  const since = w.t - w.resumeAt; if (since < 10) tgt *= clamp(0.15 + since / 10 * 0.85, 0.15, 1);
  if (T > 870) tgt *= clamp((900 - T) / 30, 0, 1);
  if (T >= 870 && !w.ending) { w.ending = true; banner(w, 'The bell tolls…', 'The dead fall back'); }
  let alive = 0; for (const e of w.enemies) if (!e.dead && !e.fade) alive++;
  w.spawnT -= dt;
  if (w.spawnT <= 0 && alive < tgt) { const n = Math.min(Math.ceil((tgt - alive) * 0.15) + 1, 6); for (let i = 0; i < n; i++) spawnEnemy(w, pickType(w, T), T); w.spawnT = 0.12; }
}

// ------------------------------------------------------------ enemies
const grid = new Map<number, Enemy[]>();
function updateEnemies(w: World, dt: number) {
  const p = w.p, list = w.enemies;
  grid.clear();
  for (const e of list) { if (e.dead) continue; const k = Math.floor(e.x / 40) * 4096 + Math.floor(e.y / 40); let c = grid.get(k); if (!c) { c = []; grid.set(k, c); } c.push(e); }
  for (const e of list) {
    if (e.dead) continue;
    if (e.fade) { e.alpha -= dt * 1.1; if (e.alpha <= 0) e.dead = true; continue; }
    e.hitT -= dt; e.atkCd -= dt; e.vulnT -= dt; e.fear -= dt; e.slowT -= dt; e.t += dt;
    if (e.bleedT > 0) { e.bleedT -= dt; e.bleedA += dt; if (e.bleedA >= 0.5) { e.bleedA = 0; hitEnemy(w, e, 5, 'bleed', { noCrit: true, ignoreShield: true }); if (e.dead) continue; } }
    if (e.anchor) continue;
    if (e.boss) updateBoss(w, e, dt); else aiEnemy(w, e, dt);
    e.x += e.kx * dt; e.y += e.ky * dt; const kd = Math.exp(-8 * dt); e.kx *= kd; e.ky *= kd;
    if (!e.boss) {
      if (e.type !== 'wraith') {
        const cx = Math.floor(e.x / 40), cy = Math.floor(e.y / 40);
        for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) {
          const c = grid.get((cx + ax) * 4096 + (cy + ay)); if (!c) continue;
          for (const o of c) {
            if (o === e || o.dead || o.id < e.id || o.type === 'wraith' || o.fade) continue;
            const dx = e.x - o.x, dy = e.y - o.y, rr = e.r + o.r, d2 = dx * dx + dy * dy;
            if (d2 < rr * rr && d2 > 0.01) { const d = Math.sqrt(d2), ov = (rr - d) * 0.25; e.x += dx / d * ov; e.y += dy / d * ov; o.x -= dx / d * ov; o.y -= dy / d * ov; }
          }
        }
      }
      e.x = clamp(e.x, -WORLD, WORLD); e.y = clamp(e.y, -WORLD, WORLD);
    }
    const d = hyp(p.x - e.x, p.y - e.y);
    if (d < e.r + 12 && e.atkCd <= 0 && e.type !== 'archer' && e.type !== 'cultist') { if (hurt(w, e.dmg * (e.boss ? 0.8 : 1))) e.atkCd = 0.9; else e.atkCd = 0.3; }
  }
  w.enemies = list.filter(e => !e.dead);
}
function aiEnemy(w: World, e: Enemy, dt: number) {
  const p = w.p, dx = p.x - e.x, dy = p.y - e.y, d = hyp(dx, dy) || 1, a = Math.atan2(dy, dx), slow = e.slowT > 0 ? 0.6 : 1;
  if (e.fear > 0) { e.x -= dx / d * e.spd * 0.8 * dt; e.y -= dy / d * e.spd * 0.8 * dt; return; }
  const tr = (e.type === 'shield' ? 1.6 : 8) * dt; e.face += clamp(angDiff(a, e.face), -tr, tr);
  const T = e.type, sp = e.spd * slow;
  if (T === 'archer' || T === 'cultist') {
    const keep = T === 'archer' ? 230 : 260;
    if (e.st === 0) {
      if (d > keep + 30) { e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; } else if (d < keep - 70) { e.x -= dx / d * sp * 0.7 * dt; e.y -= dy / d * sp * 0.7 * dt; }
      e.cd -= dt; if (e.cd <= 0 && d < 420) { e.st = 1; e.aim = a; e.wt = T === 'archer' ? 0.7 : 0.95; }
    } else {
      e.wt -= dt;
      if (e.wt <= 0) {
        e.st = 0; e.cd = T === 'archer' ? w.rng.range(2, 3) : w.rng.range(2.8, 3.6);
        const n = T === 'archer' ? 1 : 3;
        for (let i = 0; i < n; i++) { const aa = e.aim + (i - (n - 1) / 2) * 0.22, s = T === 'archer' ? 340 : 260;
          w.eshots.push({ x: e.x, y: e.y - 20, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, life: 3, dmg: e.dmg, r: T === 'archer' ? 5 : 8, col: T === 'archer' ? 0xe6e0c0 : 0xd84a8a }); }
        ev(w, { t: 'eshot', x: e.x, y: e.y });
      }
    }
    return;
  }
  if (T === 'wolf') {
    if (e.st === 0) { if (d > e.r + 10) { e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; } e.cd -= dt; if (e.cd <= 0 && d < 300 && d > 90) { e.st = 1; e.aim = a; e.wt = 0.8; } }
    else if (e.st === 1) { e.wt -= dt; e.face = e.aim; if (e.wt <= 0) { e.st = 2; e.wt = 0.38; e.hitDone = false; e.sx = e.x; e.sy = e.y; } }
    else {
      e.wt -= dt; e.x += Math.cos(e.aim) * 820 * dt; e.y += Math.sin(e.aim) * 820 * dt;
      if (!e.hitDone && hyp(p.x - e.x, p.y - e.y) < e.r + 12) { e.hitDone = true; hurt(w, e.dmg * 1.4); }
      if (e.wt <= 0) { e.st = 0; e.cd = w.rng.range(2.8, 4); }
    }
    return;
  }
  if (T === 'ghoul') { const zz = Math.sin(e.t * 5 + e.ph) * 0.7, aa = a + zz * (d > 120 ? 1 : 0); e.x += Math.cos(aa) * sp * dt; e.y += Math.sin(aa) * sp * dt; return; }
  if (T === 'wraith') { const boost = 1 + 0.5 * Math.sin(e.t * 2.2 + e.ph); e.alpha = 0.55 + 0.25 * Math.sin(e.t * 3 + e.ph); e.x += dx / d * sp * boost * dt; e.y += dy / d * sp * boost * dt; return; }
  if (d > e.r + 8) { e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; }
}

// ------------------------------------------------------------ telegraphs & rings
// telegraphs and rings are boss-only, so boss tuning is applied here
function teleC(w: World, x: number, y: number, r: number, delay: number, dmg: number, fn?: () => void) { w.teles.push({ kind: 'c', x, y, r, ang: 0, len: 0, w: 0, t: 0, delay: delay / BOSS_SPEED, dmg: dmg * BOSS_DMG, fn }); ev(w, { t: 'tele', x, y }); }
function teleL(w: World, x: number, y: number, ang: number, len: number, wd: number, delay: number, dmg: number, fn?: () => void) { w.teles.push({ kind: 'l', x, y, r: 0, ang, len, w: wd, t: 0, delay: delay / BOSS_SPEED, dmg: dmg * BOSS_DMG, fn }); }
function ringBoss(w: World, x: number, y: number, gap: number, gapW: number, speed: number, dmg: number, wait: number) { w.rings.push({ x, y, r: 20, gap, gapW, speed: speed * BOSS_SPEED, dmg: dmg * BOSS_DMG, wait: wait / BOSS_SPEED, hit: false }); ev(w, { t: 'ring', x, y }); }
export function teleDist(t: { kind: string; x: number; y: number; r: number; ang: number; len: number; w: number }, px: number, py: number) {
  if (t.kind === 'c') return hyp(px - t.x, py - t.y) - t.r;
  const dx = px - t.x, dy = py - t.y, c = Math.cos(-t.ang), s = Math.sin(-t.ang), lx = dx * c - dy * s, ly = dx * s + dy * c;
  const ox = lx < 0 ? -lx : lx > t.len ? lx - t.len : 0, oy = Math.max(0, Math.abs(ly) - t.w / 2);
  return hyp(ox, oy);
}
function updateTeles(w: World, dt: number) {
  const p = w.p;
  for (const t of w.teles) {
    t.t += dt;
    if (t.t >= t.delay) { t.done = true; if (teleDist(t, p.x, p.y) <= 10) hurt(w, t.dmg); ev(w, { t: 'blast', x: t.kind === 'c' ? t.x : t.x + Math.cos(t.ang) * t.len / 2, y: t.kind === 'c' ? t.y : t.y + Math.sin(t.ang) * t.len / 2, r: t.kind === 'c' ? t.r : -1 }); if (t.fn) t.fn(); }
  }
  w.teles = w.teles.filter(t => !t.done);
  for (const r of w.rings) {
    if (r.wait > 0) { r.wait -= dt; continue; }
    r.r += r.speed * dt;
    const d = hyp(p.x - r.x, p.y - r.y);
    if (!r.hit && Math.abs(d - r.r) < 12) { const a = Math.atan2(p.y - r.y, p.x - r.x); if (Math.abs(angDiff(a, r.gap)) > r.gapW / 2) { r.hit = true; hurt(w, r.dmg); } }
    if (r.r > 760) r.dead = true;
  }
  w.rings = w.rings.filter(r => !r.dead);
}

// ------------------------------------------------------------ bosses
function spawnBoss(w: World, i: number) {
  const def = BOSSES[i], a = w.arena!;
  const b = blankEnemy(w);
  Object.assign(b, { type: 'boss', boss: true, idx: i, x: a.x, y: a.y - 240, hp: def.hp, maxHp: def.hp, r: def.r, spd: def.spd * PX, dmg: def.dmg * BOSS_DMG, xp: 0,
    face: Math.PI / 2, atk: 2, busy: 0, guard: 0, dash: null, hidden: false, hiddenT: 0, drained: false, stun: 0 });
  w.enemies.push(b); w.boss = b;
  ev(w, { t: 'boss', text: def.n, sub: `Boss ${i + 1} of 5` });
}
function updateBoss(w: World, b: Enemy, dt: number) {
  const p = w.p;
  if ((b.guard || 0) > 0) b.guard! -= dt;
  if (b.hidden) { b.hiddenT! -= dt; if (b.hiddenT! <= 0) b.hidden = false; return; }
  if ((b.stun || 0) > 0) { b.stun! -= dt; return; }
  const toP = Math.atan2(p.y - b.y, p.x - b.x);
  if (b.dash) { b.dash.t -= dt; b.x += Math.cos(b.dash.ang) * b.dash.sp * dt; b.y += Math.sin(b.dash.ang) * b.dash.sp * dt; if (b.dash.t <= 0) b.dash = null; }
  else if ((b.busy || 0) > 0) { b.busy! -= dt; b.face += clamp(angDiff(toP, b.face), -3 * dt, 3 * dt); }
  else { b.face += clamp(angDiff(toP, b.face), -5 * dt, 5 * dt); const d = hyp(p.x - b.x, p.y - b.y); if (d > b.r + 34) { const sp = (b.guard || 0) > 0 ? b.spd * 0.5 : b.spd; b.x += Math.cos(toP) * sp * dt; b.y += Math.sin(toP) * sp * dt; } }
  const a = w.arena; if (a) { const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), R = a.r - b.r; if (d > R) { b.x = a.x + dx / d * R; b.y = a.y + dy / d * R; } }
  b.atk! -= dt;
  if (b.atk! <= 0 && (b.busy || 0) <= 0 && !b.dash) bossAttack(w, b, toP);
  if (b.idx === 4 && w.drain) updateDrain(w, b, dt);
}
function bossAttack(w: World, b: Enemy, toP: number) {
  const p = w.p, f = b.hp / b.maxHp, cos = Math.cos, sin = Math.sin, R = w.rng;
  switch (b.idx) {
    case 0: { const a = R.int(3);
      if (a === 0) { teleC(w, b.x + cos(toP) * 70, b.y + sin(toP) * 70, 115, 0.9, 24); b.busy = 1.1; }
      else if (a === 1) { teleC(w, p.x, p.y, 125, 1.0, 28); if (f < 0.5) teleC(w, p.x + R.range(-120, 120), p.y + R.range(-120, 120), 100, 1.3, 26); b.busy = 0.9; }
      else { for (let i = -2; i <= 2; i++) teleL(w, b.x, b.y, toP + i * 0.32, 520, 54, 1.1, 22); b.busy = 1.2; }
      b.atk = f < 0.5 ? 1.6 : 2.4; break; }
    case 1: { const a = R.pick(['charge', 'combo', 'guard']);
      if (a === 'charge') { teleL(w, b.x, b.y, toP, 520, 64, 0.85, 30, () => { b.dash = { ang: toP, t: 0.3, sp: 1500 }; }); b.busy = 0.9; }
      else if (a === 'combo') { for (let i = 0; i < 3; i++) teleC(w, b.x + cos(toP) * (85 + i * 65), b.y + sin(toP) * (85 + i * 65), 75, 0.5 + i * 0.45, 18); b.busy = 1.7; }
      else { b.guard = 2.6 / BOSS_SPEED; later(w, 2.7 / BOSS_SPEED, () => { if (!b.dead && w.boss === b) { const aa = Math.atan2(w.p.y - b.y, w.p.x - b.x); teleL(w, b.x, b.y, aa, 520, 64, 0.7, 30, () => { b.dash = { ang: aa, t: 0.3, sp: 1500 }; }); b.busy = 0.8 / BOSS_SPEED; } }); b.busy = 0; }
      b.atk = f < 0.5 ? 2.4 : 3.0; break; }
    case 2: { const a = R.pick(['leap', 'claw', 'howl', 'fog']);
      if (a === 'leap') { const tx = p.x, ty = p.y; teleC(w, tx, ty, 115, 0.85, 34, () => { b.x = tx; b.y = ty; }); b.busy = 0.9; }
      else if (a === 'claw') { for (let i = 0; i < 3; i++) teleL(w, b.x, b.y, toP + (i - 1) * 0.36, 330, 70, 0.55 + i * 0.3, 22); b.busy = 1.5; }
      else if (a === 'howl') { ringBoss(w, b.x, b.y, R.range(0, TAU), 1.0, 230, 20, 0.9); ringBoss(w, b.x, b.y, R.range(0, TAU), 1.0, 230, 20, 1.7); b.busy = 1.4; }
      else { teleL(w, p.x - 520, p.y, 0, 1040, 100, 1.2, 26); teleL(w, p.x, p.y - 520, Math.PI / 2, 1040, 100, 1.9, 26); b.busy = 1.6; }
      b.atk = f < 0.5 ? 1.5 : 2.2; break; }
    case 3: { const a = R.pick(['pools', 'curse', 'bolts', 'tp']);
      const pool = (x: number, y: number) => teleC(w, x, y, 85, 0.9, 10, () => { w.zones.push({ k: 'pool', hostile: true, x, y, r: 85, life: 5, max: 5, tick: 0.1, dmg: 9 * BOSS_DMG }); ev(w, { t: 'pool', x, y, r: 85 }); });
      if (a === 'pools') { pool(p.x, p.y); pool(p.x + R.range(-170, 170), p.y + R.range(-170, 170)); pool(p.x + R.range(-170, 170), p.y + R.range(-170, 170)); b.busy = 1; }
      else if (a === 'curse') { for (let i = 0; i < 6; i++) teleC(w, b.x + cos(i * TAU / 6) * 150, b.y + sin(i * TAU / 6) * 150, 70, 1.2, 24); teleC(w, b.x, b.y, 90, 1.2, 24); b.busy = 1.4; }
      else if (a === 'bolts') { for (let i = -2; i <= 2; i++) { const aa = toP + i * 0.2; w.eshots.push({ x: b.x, y: b.y - 30, vx: cos(aa) * 250, vy: sin(aa) * 250, life: 3, dmg: 14 * BOSS_DMG, r: 8, col: 0x8fd04a }); } b.busy = 0.8; }
      else { b.hidden = true; b.hiddenT = 0.9 / BOSS_SPEED; const aa = R.range(0, TAU), tx = p.x + cos(aa) * 130, ty = p.y + sin(aa) * 130; teleC(w, tx, ty, 105, 0.9, 28, () => { b.x = tx; b.y = ty; }); b.busy = 1; }
      b.atk = f < 0.5 ? 1.6 : 2.3; break; }
    case 4: bishopAttack(w, b, toP, f); break;
  }
  // recovery and attack interval run 1.2x faster too (wind-ups are scaled inside teleC/teleL/ringBoss)
  b.busy = (b.busy || 0) / BOSS_SPEED; b.atk = (b.atk || 0) / BOSS_SPEED;
}
function bishopAttack(w: World, b: Enemy, toP: number, f: number) {
  const A = w.arena!, R = w.rng, ph = f > 0.6 ? 1 : f > 0.3 ? 2 : 3, rec = ph === 3 ? 0.8 : 1;
  if (ph >= 2 && !b.drained && f < 0.5) { startDrain(w); b.drained = true; b.atk = 3; return; }
  const opts = ph === 1 ? ['bell', 'spears', 'choir'] : ph === 2 ? ['cross', 'proc', 'bell', 'spears'] : ['both', 'cross', 'choir', 'proc'];
  const a = R.pick(opts);
  const bell = () => { ringBoss(w, b.x, b.y, R.range(0, TAU), 0.95, 210, 22, 0.8); ringBoss(w, b.x, b.y, R.range(0, TAU), 0.95, 210, 22, 1.6); };
  const spears = () => { for (let i = 0; i < 5; i++) teleL(w, b.x, b.y, toP + (i - 2) * 0.26, 620, 50, 0.9 + i * 0.18, 24); };
  if (a === 'bell') { bell(); b.busy = 1.6 * rec; }
  else if (a === 'spears') { spears(); b.busy = 1.8 * rec; }
  else if (a === 'both') { bell(); spears(); b.busy = 2 * rec; }
  else if (a === 'choir') { for (let i = 0; i < 7; i++) teleL(w, A.x - 380 + i * 127, A.y - 480, Math.PI / 2, 960, 64, 0.8 + i * 0.32, 22); b.busy = 2.2 * rec; }
  else if (a === 'cross') { let ang = R.range(0, TAU); for (let k2 = 0; k2 < 3; k2++) { for (let k = 0; k < 2; k++) { const aa = ang + k * Math.PI / 2; teleL(w, A.x - Math.cos(aa) * 480, A.y - Math.sin(aa) * 480, aa, 960, 60, 1 + k2 * 0.9, 26); } ang += 0.5; } b.busy = 2.6 * rec; }
  else { for (let i = 0; i < 5; i++) { const y = A.y - 360 + i * 180, left = i % 2 === 0; teleL(w, left ? A.x - 480 : A.x + 480, y, left ? 0 : Math.PI, 960, 110, 0.8 + i * 0.45, 22); } b.busy = 2.4 * rec; }
  b.atk = 2.3 * rec;
}
function startDrain(w: World) {
  const A = w.arena!, base = w.rng.range(0, TAU), anchors: Enemy[] = [];
  for (let i = 0; i < 3; i++) {
    const a = base + i * TAU / 3, e = blankEnemy(w);
    Object.assign(e, { type: 'anchor', anchor: true, x: A.x + Math.cos(a) * 300, y: A.y + Math.sin(a) * 300, hp: 140, maxHp: 140, r: 18 });
    w.enemies.push(e); anchors.push(e);
  }
  w.drain = { t: 14, left: 3, anchors };
  banner(w, 'Soul Drain', 'Shatter the 3 anchors!');
}
function updateDrain(w: World, b: Enemy, dt: number) {
  const d = w.drain!; d.t -= dt;
  if (d.left <= 0) { w.drain = null; b.stun = 2; b.busy = 2; b.vulnT = 4; b.vulnA = 0.3; banner(w, 'Interrupted!', 'The Bishop reels'); return; }
  if (d.t <= 0) { for (const a of d.anchors) a.dead = true; w.drain = null; hurt(w, w.p.maxHp * 0.5); b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.05); banner(w, 'Souls drained', ''); }
}
function onBossDead(w: World, b: Enemy) {
  w.boss = null; w.bossDeadT = 1.4; w.chest = { x: b.x, y: b.y };
  w.teles.length = 0; w.eshots.length = 0; w.rings.length = 0; w.zones = w.zones.filter(z => !z.hostile); w.drain = null;
  for (const e of w.enemies) if (e.anchor) e.dead = true;
  w.bossesDead++;
  ev(w, { t: 'bossDead', x: b.x, y: b.y, text: BOSSES[b.idx!].n });
}
function startLock(w: World) {
  const p = w.p; w.lock = true; w.t = w.gates[w.gateIdx];
  for (const e of w.enemies) if (!e.dead) e.fade = 1;
  w.eshots.length = 0; w.zones = w.zones.filter(z => !z.hostile);
  for (const g of w.gems) g.fly = true;
  w.arena = { x: clamp(p.x, -1500, 1500), y: clamp(p.y, -1500, 1500), r: 470 };
  w.bossSpawnT = 1.8;
  if (w.gateIdx === 4) { w.biomeFrom = w.biome; w.biome = 5; w.biomeT = 0; }
  ev(w, { t: 'gate', text: 'The Boss Gate', sub: 'Time stands still' });
}

// ------------------------------------------------------------ xp
function updateGems(w: World, dt: number) {
  const p = w.p, R = pickR(w) * (p.pet.id === 'cat' ? 1.6 * (p.pet.lv >= 2 ? 1.4 : 1) : 1);
  for (const g of w.gems) {
    const dx = p.x - g.x, dy = p.y - g.y, d = hyp(dx, dy);
    if (!g.fly && d < R) g.fly = true;
    if (g.fly) { const sp = 520 + Math.max(0, 300 - d); if (d < 14) { g.dead = true; addXp(w, g.v); ev(w, { t: 'pickup', x: g.x, y: g.y, v: g.v }); } else { g.x += dx / d * sp * dt; g.y += dy / d * sp * dt; } }
  }
  w.gems = w.gems.filter(g => !g.dead);
}
function addXp(w: World, v: number) {
  const p = w.p; p.xp += v;
  while (p.xp >= needXp(p.level + 1)) { p.xp -= needXp(p.level + 1); p.level++; w.lvQueue++; }
}

// ------------------------------------------------------------ flow
function endRun(w: World, win: boolean) {
  if (w.result) return;
  w.result = { win }; w.mode = 'over';
  ev(w, { t: win ? 'win' : 'lose' });
}
function openLevel(w: World) {
  w.lvCount++; w.mode = 'levelup';
  w.cards = genCards(w); w.cardTitle = `Level ${w.p.level}`; w.cardSub = 'Choose one reward';
  ev(w, { t: 'level', x: w.p.x, y: w.p.y });
}
function openRelic(w: World) {
  w.mode = 'relic';
  const final = w.bossesDead >= 5;
  w.cards = relicCards(w.gateIdx);
  w.cardTitle = final ? 'Legacy of the Bishop' : `Reliquary of ${BOSSES[w.gateIdx].n.replace('The ', '')}`;
  w.cardSub = final ? 'Choose a legacy relic' : 'Choose one relic. Time stands still.';
  ev(w, { t: 'chest', x: w.chest?.x ?? w.p.x, y: w.chest?.y ?? w.p.y });
}
export function chooseCard(w: World, i: number) {
  if (!w.cards || !w.cards[i]) return;
  const c = w.cards[i]; c.apply(w); w.cards = null;
  if (w.mode === 'levelup') { w.lvQueue--; w.mode = 'play'; return; }
  if (w.mode === 'relic') {
    if (w.bossesDead >= 5) { w.mode = 'play'; endRun(w, true); return; }
    w.lock = false; w.arena = null; w.chest = null; w.gateIdx++; w.mode = 'play';
    w.biomeFrom = w.biome; w.biome = w.bossesDead; w.biomeT = 0; w.resumeAt = w.t;
    ev(w, { t: 'biome', text: BIOMES[w.biome].n, sub: 'The world shifts…' });
  }
}
export function reroll(w: World) {
  if (w.mode !== 'levelup' || w.p.rerolls <= 0) return;
  w.p.rerolls--; w.cards = genCards(w);
}

export function step(w: World, inp: Input, dt: number) {
  if (w.mode !== 'play') return;
  w.real += dt;
  if (!w.lock) { w.t += dt; if (w.gateIdx < 5 && w.t >= w.gates[w.gateIdx]) startLock(w); }
  else {
    if (w.bossSpawnT > 0) { w.bossSpawnT -= dt; if (w.bossSpawnT <= 0) spawnBoss(w, w.gateIdx); }
    if (w.bossDeadT > 0) { w.bossDeadT -= dt; if (w.bossDeadT <= 0) { openRelic(w); return; } }
  }
  if (w.biomeT < 1) w.biomeT = Math.min(1, w.biomeT + dt / 6);
  updatePlayer(w, inp, dt); if (w.mode !== 'play') return;
  updateDirector(w, dt);
  updateEnemies(w, dt); if (w.mode !== 'play') return;
  updateWeapons(w, dt);
  updatePets(w, dt);
  updateShots(w, dt); updateEshots(w, dt); updateZones(w, dt); updateTeles(w, dt); updateGems(w, dt);
  if (w.mode !== 'play') return;
  for (const d of w.delayed) { d.t -= dt; if (d.t <= 0) { d.done = true; d.fn(); } }
  w.delayed = w.delayed.filter(d => !d.done);
  if (w.lvQueue > 0 && w.mode === 'play' && (!w.lock || (!w.boss && w.bossDeadT <= 0 && w.bossSpawnT <= 0))) openLevel(w);
}
