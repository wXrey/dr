import { Rng } from './math';
import { ARMORS, RUN_GATES, type ArmorId, type EnemyType, type PetId, type TraitId, type WeaponId } from './data';

export interface Enemy {
  id: number; type: EnemyType | 'boss' | 'anchor';
  x: number; y: number; hp: number; maxHp: number; r: number; spd: number; dmg: number; xp: number; elite: boolean;
  kx: number; ky: number; hitT: number; atkCd: number; face: number; st: number; t: number; cd: number; aim: number; wt: number;
  hitDone: boolean; sx: number; sy: number;
  bleedT: number; bleedA: number; burnT: number; burnS: number; burnA: number; vulnT: number; vulnA: number; fear: number; slowT: number;
  alpha: number; fade: number; dead: boolean; ph: number;
  // bosses
  boss?: boolean; idx?: number; atk?: number; busy?: number; guard?: number; dash?: { ang: number; t: number; sp: number } | null;
  hidden?: boolean; hiddenT?: number; drained?: boolean; stun?: number;
  anchor?: boolean;
}
export interface Shot { x: number; y: number; vx: number; vy: number; life: number; r: number; dmg: number; pierce: number; hit: Set<number>; kb: number; bleed: boolean; blast: number; src: WeaponId; ang: number; }
export interface EShot { x: number; y: number; vx: number; vy: number; life: number; dmg: number; r: number; col: number; }
export interface Zone { k: 'cloud' | 'pool' | 'rot'; hostile: boolean; x: number; y: number; r: number; life: number; max: number; tick: number; dmg: number; }
export interface Tele { kind: 'c' | 'l'; x: number; y: number; r: number; ang: number; len: number; w: number; t: number; delay: number; dmg: number; fn?: () => void; done?: boolean; }
export interface Ring { x: number; y: number; r: number; gap: number; gapW: number; speed: number; dmg: number; wait: number; hit: boolean; dead?: boolean; }
export interface Gem { x: number; y: number; v: number; fly: boolean; dead?: boolean; }
export interface Raven { x: number; y: number; a: number; st: number; cd: number; tgt: Enemy | null; fa: number; }
export interface PetBody { x: number; y: number; st: number; cd: number; t: number; tgt: Enemy | null; face: number; atkT: number; }
export interface WeaponSlot { id: WeaponId; lv: number; cd: number; swings: number; burstLeft: number; burstT: number; aim: number; swingT: number; }

export interface Player {
  x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; armor: number; armorId: ArmorId; speed: number;
  rollT: number; rollCd: number; rollDx: number; rollDy: number; inv: number; rollInv: number;
  face: number; mvx: number; mvy: number; moving: boolean;
  weapons: WeaponSlot[]; pet: { id: PetId; lv: number };
  traits: Partial<Record<TraitId, number>>; relics: Record<string, boolean>;
  dmgMul: number; crit: number; critDmg: number; cdMul: number; areaMul: number; reachMul: number; pickMul: number;
  regen: number; spdMul: number; meleeMul: number; gunMul: number; rollCdMul: number; iframeBonus: number; extraShots: number; exec: number;
  xp: number; level: number; rerolls: number;
  blockCd: number; moonT: number; frenzyT: number; bellT: number; flashBlock: number; reviveUsed: boolean; hurtT: number;
}

export type GameEvent =
  | { t: 'hit'; x: number; y: number; dmg: number; crit: boolean; col?: number; src: string }
  | { t: 'kill'; x: number; y: number; type: string; elite: boolean }
  | { t: 'swing'; x: number; y: number; ang: number; arc: number; range: number; heavy: boolean; w: WeaponId }
  | { t: 'shot'; x: number; y: number; ang: number; w: WeaponId }
  | { t: 'blast' | 'shock' | 'bell' | 'pool'; x: number; y: number; r: number }
  | { t: 'roll' | 'hurt' | 'block' | 'perfect' | 'heal' | 'pickup' | 'level' | 'frenzy' | 'chest' | 'revive'; x: number; y: number; v?: number }
  | { t: 'boss' | 'bossDead' | 'gate' | 'biome' | 'win' | 'lose' | 'banner'; text?: string; sub?: string; x?: number; y?: number }
  | { t: 'tele'; x: number; y: number } | { t: 'ring'; x: number; y: number } | { t: 'bite'; x: number; y: number } | { t: 'dive'; x: number; y: number }
  | { t: 'eshot'; x: number; y: number };

export interface Card { id: string; cls: string; icon: string; img?: string[]; iconRef?: { sheet: string[]; index: number }; title: string; tag: string; desc: string; power?: boolean; apply: (w: World) => void; relic?: string; }

export interface World {
  rng: Rng; seed: number;
  t: number; real: number; mode: 'play' | 'levelup' | 'relic' | 'over';
  gates: number[]; gateIdx: number; lock: boolean; boss: Enemy | null; bossSpawnT: number; bossDeadT: number; bossesDead: number;
  arena: { x: number; y: number; r: number } | null; drain: { t: number; left: number; anchors: Enemy[] } | null; chest: { x: number; y: number } | null;
  p: Player;
  enemies: Enemy[]; shots: Shot[]; eshots: EShot[]; zones: Zone[]; teles: Tele[]; rings: Ring[]; gems: Gem[];
  ravens: Raven[]; hound: PetBody | null; wisp: PetBody | null; cat: PetBody | null;
  delayed: { t: number; fn: () => void; done?: boolean }[];
  events: GameEvent[];
  nid: number; kills: number; dmgDealt: number; dmgBy: Record<string, number>; spawnT: number; resumeAt: number;
  biome: number; biomeFrom: number; biomeT: number;
  lvQueue: number; lvCount: number; lastHeal: boolean; ending: boolean; bellKills: number; heartKills: number; murderT: number;
  cards: Card[] | null; cardTitle: string; cardSub: string; relicLog: string[];
  result: null | { win: boolean };
}

export function newWorld(opts: { seed: number; armor: ArmorId; weapon: WeaponId; pet: PetId }): World {
  const a = ARMORS[opts.armor];
  const p: Player = {
    x: 0, y: 0, vx: 0, vy: 0, hp: a.hp, maxHp: a.hp, armor: a.armor, armorId: a.id, speed: a.speed,
    rollT: 0, rollCd: 0, rollDx: 0, rollDy: 1, inv: 0, rollInv: 0, face: 0, mvx: 0, mvy: 1, moving: false,
    weapons: [{ id: opts.weapon, lv: 1, cd: 0.4, swings: 0, burstLeft: 0, burstT: 0, aim: 0, swingT: 0 }],
    pet: { id: opts.pet, lv: 1 }, traits: {}, relics: {},
    dmgMul: 0, crit: 0.05, critDmg: 1.5, cdMul: 0, areaMul: 0, reachMul: 0, pickMul: 0, regen: 0, spdMul: 0,
    meleeMul: 0, gunMul: 0, rollCdMul: 0, iframeBonus: 0, extraShots: 0, exec: 0,
    xp: 0, level: 1, rerolls: 1, blockCd: 0, moonT: 0, frenzyT: 0, bellT: 0, flashBlock: 0, reviveUsed: false, hurtT: 0,
  };
  return {
    rng: new Rng(opts.seed), seed: opts.seed, t: 0, real: 0, mode: 'play',
    gates: RUN_GATES.slice(), gateIdx: 0, lock: false, boss: null, bossSpawnT: 0, bossDeadT: 0, bossesDead: 0,
    arena: null, drain: null, chest: null, p,
    enemies: [], shots: [], eshots: [], zones: [], teles: [], rings: [], gems: [], ravens: [], hound: null, wisp: null, cat: null,
    delayed: [], events: [], nid: 1, kills: 0, dmgDealt: 0, dmgBy: {}, spawnT: 0, resumeAt: -99,
    biome: 0, biomeFrom: 0, biomeT: 1, lvQueue: 0, lvCount: 0, lastHeal: false, ending: false, bellKills: 0, heartKills: 0, murderT: 8,
    cards: null, cardTitle: '', cardSub: '', relicLog: [], result: null,
  };
}

/** Deep copy of a run (for "retry from last boss"). Taken at the boss gate, where no boss closures
 *  are pending; pending callbacks and cards are dropped, everything else (incl. shared refs) is kept. */
export function cloneWorld(w: World): World {
  const { rng, ...rest } = w;
  const plain = { ...rest, delayed: [], events: [], cards: null, teles: w.teles.map(t => ({ ...t, fn: undefined })) };
  const c = structuredClone(plain) as unknown as World;
  c.rng = new Rng(1); c.rng.state = rng.state;
  return c;
}
