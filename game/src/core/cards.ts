import { MAX_TRAITS, MAX_WEAPONS, PETS, RARITY, RELICS, TRAITS, TRAIT_IDS, WEAPONS, WEAPON_IDS, type TraitId, type WeaponId } from './data';
import type { Card, World } from './world';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

function rollRarity(w: World) {
  const L = w.p.level, T = L <= 5 ? [75, 23, 2, 0] : L <= 10 ? [55, 35, 9, 1] : L <= 20 ? [35, 40, 20, 5] : [20, 40, 30, 10];
  let r = w.rng.next() * 100;
  for (let i = 0; i < 4; i++) { if (r < T[i]) return i; r -= T[i]; }
  return 0;
}
const canTrait = (w: World, k: TraitId) => k in w.p.traits || Object.keys(w.p.traits).length < MAX_TRAITS;

function traitCard(w: World, k: TraitId): Card {
  const t = TRAITS[k], rar = rollRarity(w), v = t.vals[rar];
  return { id: 't_' + k, cls: 'r' + rar, icon: t.icon, iconRef: { sheet: ['items', 'trait'], index: TRAIT_IDS.indexOf(k) }, title: t.name, tag: RARITY[rar], desc: t.desc(v), power: k === 'might',
    apply: w => { const p = w.p; p.traits[k] = (p.traits[k] || 0) + 1;
      switch (k) {
        case 'might': p.dmgMul += v; break; case 'ferocity': p.crit += v; break; case 'haste': p.cdMul += v; break; case 'executioner': p.exec += v; break;
        case 'vitality': p.maxHp += v; p.hp += v; break; case 'ironskin': p.armor += v; break; case 'regen': p.regen += v; break;
        case 'fleet': p.spdMul += v; break; case 'reach': p.reachMul += v; break; case 'magnet': p.pickMul += v; break;
        case 'tumbler': p.rollCdMul += v; p.iframeBonus += v * 0.8; break;
      } } };
}
function newWeaponCard(id: WeaponId): Card {
  const d = WEAPONS[id];
  return { id: 'wn_' + id, cls: 'wep', icon: d.kind === 'melee' ? '⚔' : '✸', img: d.sprite, title: d.name, tag: 'New weapon', desc: d.desc, power: true,
    apply: w => { w.p.weapons.push({ id, lv: 1, cd: 0.3, swings: 0, burstLeft: 0, burstT: 0, aim: 0, swingT: 0 }); } };
}
function upWeaponCard(w: World, id: WeaponId): Card {
  const d = WEAPONS[id], slot = w.p.weapons.find(s => s.id === id)!, lv = slot.lv + 1;
  return { id: 'wu_' + id, cls: 'wep', icon: d.kind === 'melee' ? '⚔' : '✸', img: d.sprite, title: `${d.name} ${ROMAN[lv]}`, tag: 'Weapon upgrade', desc: d.ups[lv - 2], power: true,
    apply: w => { const s = w.p.weapons.find(s => s.id === id); if (s) s.lv = lv; } };
}
function petCard(w: World): Card | null {
  const p = w.p, d = PETS[p.pet.id], lv = p.pet.lv + 1; if (lv > 5) return null;
  return { id: 'pet', cls: 'pet', icon: '❖', img: d.sprite, title: `${d.name} ${ROMAN[lv]}`, tag: 'Companion', desc: d.ups[lv - 2], power: true,
    apply: w => { w.p.pet.lv = lv; if (w.p.pet.id === 'cat' && lv === 3) w.p.crit += 0.05; } };
}
function healCard(): Card {
  return { id: 'heal', cls: 'r1', icon: '✚', title: 'Mend', tag: 'Restore', desc: 'Restore 25% of max HP', apply: w => { w.p.hp = Math.min(w.p.maxHp, w.p.hp + w.p.maxHp * 0.25); } };
}

function pool(w: World, cat: string): Card[] {
  const p = w.p, out: Card[] = [];
  if (cat === 'wep') {
    for (const s of p.weapons) if (s.lv < 5) out.push(upWeaponCard(w, s.id));
    if (p.weapons.length < MAX_WEAPONS) for (const id of WEAPON_IDS) if (!p.weapons.some(s => s.id === id)) out.push(newWeaponCard(id));
  } else if (cat === 'pet') { const c = petCard(w); if (c) out.push(c); }
  else for (const k of TRAIT_IDS) if (TRAITS[k].cat === cat && canTrait(w, k)) out.push(traitCard(w, k));
  return out;
}

export function genCards(w: World): Card[] {
  const p = w.p, cards: Card[] = [], used = new Set<string>();
  const add = (c: Card | null | undefined) => { if (!c || used.has(c.id) || cards.length >= 3) return; used.add(c.id); cards.push(c); };
  const wantHeal = p.hp < p.maxHp * 0.35 && !w.lastHeal; w.lastHeal = wantHeal; if (wantHeal) add(healCard());
  if (p.level <= 3 && !cards.some(c => c.power)) { const pl = pool(w, 'wep'); if (pl.length) add(w.rng.pick(pl)); }
  let g = 0;
  while (cards.length < 3 && g++ < 80) {
    const r = w.rng.next() * 100, cat = r < 34 ? 'wep' : r < 44 ? 'pet' : r < 68 ? 'off' : r < 86 ? 'def' : 'util';
    let pl = pool(w, cat); if (!pl.length) pl = pool(w, 'off').concat(pool(w, 'def'), pool(w, 'util'));
    if (pl.length) add(w.rng.pick(pl));
  }
  return cards;
}

export function relicCards(idx: number): Card[] {
  const tier = Math.min(idx, RELICS.length - 1);
  return RELICS[tier].map((r, i) => ({
    id: 'r_' + r.k, cls: 'relic', icon: '✠', iconRef: { sheet: ['items', 'relic', 'icons'], index: tier * 3 + i }, title: r.n, tag: 'Relic · ' + r.tier, desc: r.d, relic: r.k,
    apply: (w: World) => {
      const p = w.p; p.relics[r.k] = true; w.relicLog.push(r.n);
      if (r.k === 'sigil') p.crit += 0.1;
      if (r.k === 'shield') p.armor += 6;
      if (r.k === 'quick') p.cdMul += 0.12;
      if (r.k === 'hide') { p.maxHp += 25; p.hp += 25; p.armor += 8; }
      if (r.k === 'scripture') { p.extraShots += 1; p.areaMul += 0.2; }
    },
  }));
}
