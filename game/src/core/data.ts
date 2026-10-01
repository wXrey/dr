// All game content is data. Balance numbers start from the original demo (which was tuned and
// verified with headless sims) and extend it with armor, weapons, pets and the dodge roll.

export const PX = 40;          // world pixels per metre
export const WORLD = 2000;     // half-size of the world square
export const XP_MUL = 1.25;
export const DENS = 0.8;
export const RUN_GATES = [180, 360, 540, 720, 900];
export const BOSS_DMG = 1.3;     // all boss damage (telegraphs, rings, contact, bolts, pools)
export const BOSS_SPEED = 1.2;   // boss wind-ups, recoveries, attack intervals and ring expansion

// ---------------------------------------------------------------- armor
export type ArmorId = 'light' | 'heavy';
export interface ArmorDef {
  id: ArmorId; name: string; desc: string; hp: number; armor: number; speed: number;
  roll: { dist: number; time: number; iframes: number; cd: number }; kbResist: number; sprite: string[];
}
export const ARMORS: Record<ArmorId, ArmorDef> = {
  light: { id: 'light', name: 'Light leathers', desc: 'Fast. Long roll with generous i-frames.',
    hp: 100, armor: 4, speed: 205, roll: { dist: 175, time: 0.3, iframes: 0.3, cd: 1.7 }, kbResist: 0, sprite: ['player', 'light', '!parts'] },
  heavy: { id: 'heavy', name: 'Blackened plate', desc: 'Tanky and steady. Short, heavy roll.',
    hp: 140, armor: 20, speed: 168, roll: { dist: 118, time: 0.34, iframes: 0.2, cd: 2.5 }, kbResist: 0.6, sprite: ['player', 'heavy', '!parts'] },
};

// ---------------------------------------------------------------- weapons
export type WeaponId = 'longsword' | 'greatsword' | 'flintlock' | 'blunderbuss' | 'arquebus' | 'crossbow';
export interface WeaponStats {
  dmg: number; cd: number; range: number; kb: number;
  arc: number;                 // melee: swing arc (rad)
  pellets: number; spread: number; speed: number; pierce: number;
  burst: number;               // shots fired in quick succession
  heavyEvery: number;          // melee: every Nth swing is heavy (0 = never)
  shock: number;               // melee: radial shockwave dmg fraction on heavy/each swing
  blast: number;               // shot: explosion radius at end of flight
  bleed: boolean;
}
export interface WeaponDef { id: WeaponId; name: string; kind: 'melee' | 'shot'; desc: string; ups: string[]; sprite: string[]; base: WeaponStats; }
const W = (s: Partial<WeaponStats>): WeaponStats => ({ dmg: 10, cd: 1, range: 100, kb: 100, arc: 0, pellets: 1, spread: 0, speed: 800, pierce: 0, burst: 1, heavyEvery: 0, shock: 0, blast: 0, bleed: false, ...s });
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  longsword: { id: 'longsword', name: 'Longsword', kind: 'melee', desc: 'Fast arcing slashes at the nearest foe.', sprite: ['weapons', 'longsword'],
    ups: ['+30% damage', '+18% attack speed', '+30% arc, +15% reach', 'Every 3rd swing is a heavy cleave'],
    base: W({ dmg: 22, cd: 0.8, range: 96, arc: 1.9, kb: 160 }) },
  greatsword: { id: 'greatsword', name: 'Greatsword', kind: 'melee', desc: 'Slow, huge sweeping cleaves.', sprite: ['weapons', 'greatsword'],
    ups: ['+25% damage', '+15% reach', '-20% swing time', 'Swings send out a shockwave'],
    base: W({ dmg: 55, cd: 1.6, range: 132, arc: 2.95, kb: 320 }) },
  flintlock: { id: 'flintlock', name: 'Flintlock pistol', kind: 'shot', desc: 'A heavy ball at the nearest foe.', sprite: ['weapons', 'flintlock|pistol'],
    ups: ['+25% damage', 'Fires twice', 'Shots pierce one enemy', '-25% reload, +10% crit'],
    base: W({ dmg: 32, cd: 1.0, range: 560, speed: 980, kb: 120 }) },
  blunderbuss: { id: 'blunderbuss', name: 'Blunderbuss', kind: 'shot', desc: 'A cone of shot. Brutal up close.', sprite: ['weapons', 'blunderbuss'],
    ups: ['+2 pellets', '+30% damage', '-20% reload', 'Pellets pierce, +50% knockback'],
    base: W({ dmg: 13, cd: 1.5, range: 300, pellets: 6, spread: 0.8, speed: 760, kb: 140 }) },
  arquebus: { id: 'arquebus', name: 'Arquebus', kind: 'shot', desc: 'Long-range shot that pierces a line.', sprite: ['weapons', 'arquebus|musket'],
    ups: ['+25% damage', '+3 pierce', '-20% reload', 'Shots explode at the end'],
    base: W({ dmg: 52, cd: 1.9, range: 820, speed: 1400, pierce: 4, kb: 200 }) },
  crossbow: { id: 'crossbow', name: 'Heavy crossbow', kind: 'shot', desc: 'Quick piercing bolts.', sprite: ['weapons', 'crossbow'],
    ups: ['+1 bolt', '+25% damage', '+2 pierce', 'Bolts cause bleeding'],
    base: W({ dmg: 26, cd: 0.85, range: 600, speed: 840, pierce: 1, kb: 90 }) },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const MAX_WEAPONS = 4;

export function weaponStats(id: WeaponId, lv: number): WeaponStats {
  const s = { ...WEAPONS[id].base };
  const at = (n: number) => lv >= n;
  switch (id) {
    case 'longsword': if (at(2)) s.dmg *= 1.3; if (at(3)) s.cd /= 1.18; if (at(4)) { s.arc *= 1.3; s.range *= 1.15; } if (at(5)) s.heavyEvery = 3; break;
    case 'greatsword': if (at(2)) s.dmg *= 1.25; if (at(3)) s.range *= 1.15; if (at(4)) s.cd *= 0.8; if (at(5)) s.shock = 0.4; break;
    case 'flintlock': if (at(2)) s.dmg *= 1.25; if (at(3)) s.burst = 2; if (at(4)) s.pierce = 1; if (at(5)) s.cd *= 0.75; break;
    case 'blunderbuss': if (at(2)) s.pellets += 2; if (at(3)) s.dmg *= 1.3; if (at(4)) s.cd *= 0.8; if (at(5)) { s.pierce = 1; s.kb *= 1.5; } break;
    case 'arquebus': if (at(2)) s.dmg *= 1.25; if (at(3)) s.pierce += 3; if (at(4)) s.cd *= 0.8; if (at(5)) s.blast = 70; break;
    case 'crossbow': if (at(2)) { s.pellets = 2; s.spread = 0.14; } if (at(3)) s.dmg *= 1.25; if (at(4)) s.pierce += 2; if (at(5)) s.bleed = true; break;
  }
  return s;
}

// ---------------------------------------------------------------- pets
export type PetId = 'raven' | 'hound' | 'wisp' | 'cat';
export interface PetDef { id: PetId; name: string; desc: string; ups: string[]; sprite: string[]; }
export const PETS: Record<PetId, PetDef> = {
  raven: { id: 'raven', name: 'Raven', desc: 'Dives at enemies from above.', sprite: ['pets', 'raven', '!wings'],
    ups: ['Attacks faster', 'A second raven', 'Dives cause bleeding', 'A murder of ravens strikes every 8s'] },
  hound: { id: 'hound', name: 'Spectral hound', desc: 'Hunts down and mauls nearby foes.', sprite: ['pets', 'hound'],
    ups: ['+40% bite damage', 'Bites slow enemies', '+30% speed, bites faster', 'Bites chain to a second target'] },
  wisp: { id: 'wisp', name: 'Lantern wisp', desc: 'Heals you and burns what gets close.', sprite: ['pets', 'wisp|lantern'],
    ups: ['+50% healing', 'Larger burning aura', '+50% aura damage', 'Once per run: revive at 40% HP'] },
  cat: { id: 'cat', name: 'Bone cat', desc: 'Pulls in souls, sharpens your crits, pounces.', sprite: ['pets', 'cat'],
    ups: ['+40% pickup radius', '+5% crit chance', 'Pounces twice as often', 'Pounce hits all around it'] },
};
export const PET_IDS = Object.keys(PETS) as PetId[];

// ---------------------------------------------------------------- enemies
export type EnemyType = 'skeleton' | 'zombie' | 'archer' | 'ghoul' | 'drowned' | 'plague' | 'shield' | 'wolf' | 'wraith' | 'cultist';
export interface EnemyDef { n: string; hp: number; dmg: number; spd: number; xp: number; r: number; h: number; sprite: string[]; col: number; }
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  skeleton: { n: 'Skeleton', hp: 30, dmg: 8, spd: 3.2, xp: 10, r: 12, h: 64, sprite: ['enemies', 'skeleton', '!archer'], col: 0xd8d2c0 },
  zombie: { n: 'Zombie', hp: 70, dmg: 12, spd: 2.2, xp: 14, r: 15, h: 70, sprite: ['enemies', 'zombie'], col: 0x5f7a58 },
  archer: { n: 'Skeleton archer', hp: 40, dmg: 10, spd: 2.6, xp: 16, r: 11, h: 64, sprite: ['enemies', 'archer'], col: 0xc9c3ad },
  ghoul: { n: 'Ghoul', hp: 45, dmg: 10, spd: 4.6, xp: 14, r: 12, h: 50, sprite: ['enemies', 'ghoul'], col: 0x8a7d6e },
  drowned: { n: 'Drowned', hp: 85, dmg: 14, spd: 2.0, xp: 18, r: 16, h: 72, sprite: ['enemies', 'drown'], col: 0x2f5a55 },
  plague: { n: 'Plague corpse', hp: 75, dmg: 16, spd: 2.3, xp: 22, r: 15, h: 72, sprite: ['enemies', 'plague'], col: 0x78883a },
  shield: { n: 'Shield bearer', hp: 100, dmg: 14, spd: 2.6, xp: 24, r: 15, h: 74, sprite: ['enemies', 'shield'], col: 0x8b8f96 },
  wolf: { n: 'Werewolf', hp: 130, dmg: 18, spd: 3.6, xp: 45, r: 19, h: 84, sprite: ['enemies', 'werewolf|wolf'], col: 0x3b2f28 },
  wraith: { n: 'Wraith', hp: 80, dmg: 16, spd: 3.8, xp: 28, r: 12, h: 74, sprite: ['enemies', 'wraith'], col: 0x7fa3d9 },
  cultist: { n: 'Cultist', hp: 65, dmg: 18, spd: 2.7, xp: 30, r: 12, h: 70, sprite: ['enemies', 'cultist'], col: 0x6d1f2b },
};

export interface BossDef { n: string; hp: number; r: number; spd: number; dmg: number; h: number; col: number; sprite: string[]; }
export const BOSSES: BossDef[] = [
  { n: 'The Gravedigger', hp: 900, r: 34, spd: 1.7, dmg: 22, h: 150, col: 0x7d8a96, sprite: ['bosses', 'grave'] },
  { n: 'The Hanged Knight', hp: 2200, r: 32, spd: 2.4, dmg: 26, h: 150, col: 0x6a6d76, sprite: ['bosses', 'hanged|knight'] },
  { n: 'The Alpha Hunter', hp: 4500, r: 34, spd: 3.4, dmg: 30, h: 150, col: 0x54402f, sprite: ['bosses', 'alpha|hunter|wolf'] },
  { n: 'The Plague Priest', hp: 8500, r: 30, spd: 1.9, dmg: 30, h: 160, col: 0x58773f, sprite: ['bosses', 'priest|plague'] },
  { n: 'The Bishop of Ash', hp: 18000, r: 36, spd: 1.6, dmg: 34, h: 175, col: 0x3a2c44, sprite: ['bosses', 'bishop|ash'] },
];

// ---------------------------------------------------------------- biomes
export interface BiomeDef { n: string; tile: string[]; props: string[]; fog: number; fogA: number; ground: number; part: 'snow' | 'mire' | 'fog' | 'ash' | 'rain'; music: number[]; }
export const BIOMES: BiomeDef[] = [
  { n: 'Frozen Graveyard', tile: ['tiles', 'grave|frozen|snow'], props: ['props', 'grave'], fog: 0x82a0be, fogA: 0.1, ground: 0x28323e, part: 'snow', music: [55, 82.4] },
  { n: 'Drowned Mire', tile: ['tiles', 'mire|swamp|drown'], props: ['props', 'swamp|mire'], fog: 0x3c7d46, fogA: 0.17, ground: 0x0f1913, part: 'mire', music: [49, 73.4] },
  { n: 'Rotwood', tile: ['tiles', 'rot|forest|wood'], props: ['props', 'forest|rot|wood'], fog: 0x878f9b, fogA: 0.15, ground: 0x16181b, part: 'fog', music: [46.2, 69.3] },
  { n: 'Ash Ruins', tile: ['tiles', 'ash|ruin'], props: ['props', 'ash|ruin'], fog: 0xaf5c32, fogA: 0.1, ground: 0x1f1816, part: 'ash', music: [43.7, 65.4] },
  { n: 'Black Cathedral', tile: ['tiles', 'black|slate'], props: ['props', 'cathedral'], fog: 0x37305a, fogA: 0.12, ground: 0x0d0d13, part: 'rain', music: [41.2, 61.7] },
  { n: 'Cathedral Nave', tile: ['tiles', 'nave'], props: ['props', 'cathedral'], fog: 0x5f3228, fogA: 0.08, ground: 0x17110f, part: 'ash', music: [36.7, 55] },
];

// ---------------------------------------------------------------- traits & relics
export type TraitId = 'might' | 'ferocity' | 'haste' | 'executioner' | 'vitality' | 'ironskin' | 'regen' | 'fleet' | 'reach' | 'magnet' | 'tumbler';
export interface TraitDef { cat: 'off' | 'def' | 'util'; name: string; icon: string; vals: number[]; desc: (v: number) => string; }
export const TRAITS: Record<TraitId, TraitDef> = {
  might: { cat: 'off', name: 'Might', icon: '⚔', vals: [0.1, 0.14, 0.18, 0.25], desc: v => `+${Math.round(v * 100)}% all damage` },
  ferocity: { cat: 'off', name: 'Ferocity', icon: '✦', vals: [0.04, 0.06, 0.08, 0.12], desc: v => `+${Math.round(v * 100)}% crit chance` },
  haste: { cat: 'off', name: 'Haste', icon: '≫', vals: [0.06, 0.08, 0.11, 0.15], desc: v => `-${Math.round(v * 100)}% weapon cooldowns` },
  executioner: { cat: 'off', name: 'Executioner', icon: '☠', vals: [0.15, 0.2, 0.3, 0.4], desc: v => `+${Math.round(v * 100)}% damage to foes under 25% HP` },
  vitality: { cat: 'def', name: 'Vitality', icon: '♥', vals: [15, 22, 30, 45], desc: v => `+${v} max HP (and heal it)` },
  ironskin: { cat: 'def', name: 'Ironskin', icon: '◈', vals: [2, 3, 5, 8], desc: v => `+${v} armor` },
  regen: { cat: 'def', name: 'Regeneration', icon: '✚', vals: [0.15, 0.25, 0.4, 0.65], desc: v => `+${v} HP per second` },
  fleet: { cat: 'util', name: 'Fleet foot', icon: '➤', vals: [0.05, 0.07, 0.1, 0.15], desc: v => `+${Math.round(v * 100)}% move speed` },
  reach: { cat: 'util', name: 'Reach', icon: '◠', vals: [0.1, 0.15, 0.22, 0.3], desc: v => `+${Math.round(v * 100)}% melee reach and area` },
  magnet: { cat: 'util', name: 'Soul magnet', icon: '◎', vals: [0.2, 0.3, 0.45, 0.7], desc: v => `+${Math.round(v * 100)}% pickup radius` },
  tumbler: { cat: 'util', name: 'Tumbler', icon: '↻', vals: [0.08, 0.11, 0.15, 0.2], desc: v => `-${Math.round(v * 100)}% roll cooldown, longer i-frames` },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];
export const RARITY = ['Common', 'Uncommon', 'Rare', 'Epic'];
export const MAX_TRAITS = 5;

export interface RelicDef { k: string; n: string; d: string; tier: string; }
export const RELICS: RelicDef[][] = [
  [{ k: 'whetstone', n: "Gravedigger's Whetstone", d: '+25% melee damage. Melee hits make foes take +15% damage for 2s.', tier: 'Rare' },
   { k: 'powder', n: 'Black Powder Horn', d: '+25% firearm and crossbow damage.', tier: 'Rare' },
   { k: 'bell', n: 'Bell of the Dead', d: 'Every 40 kills: a pulse of fear and knockback, +20% speed for 3s.', tier: 'Rare' }],
  [{ k: 'sigil', n: "Executioner's Seal", d: '+10% crit. Crits on elites and bosses deal +35% more.', tier: 'Rare+' },
   { k: 'shield', n: 'Broken Tower Shield', d: '+6 armor. Blocks one hit every 14s.', tier: 'Rare+' },
   { k: 'quick', n: 'Quickdraw Charm', d: '-12% weapon cooldowns. Rolling reloads your firearms.', tier: 'Rare+' }],
  [{ k: 'heart', n: 'Heart of the Alpha', d: 'Every 60 kills: frenzy for 7s (+35% attack speed, +20% speed, +15% damage).', tier: 'Epic' },
   { k: 'moonfang', n: 'Moonfang', d: 'Rolling through an attack: +30% crit and +15% damage for 4s.', tier: 'Epic' },
   { k: 'hide', n: 'Hide of the First Beast', d: '+25 max HP, +8 armor, +0.35 HP/s. +12% damage at full HP.', tier: 'Epic' }],
  [{ k: 'censer', n: 'Censer of Rot', d: 'Kills have an 18% chance to leave a rot cloud.', tier: 'Legendary' },
   { k: 'chalice', n: "Martyr's Chalice", d: 'Below 45% HP: +40% damage and -20% cooldowns.', tier: 'Legendary' },
   { k: 'scripture', n: 'Ash Scripture', d: 'Every weapon fires +1 projectile/pellet. +20% area.', tier: 'Legendary' }],
  [{ k: 'crown', n: 'Ash Crown', d: 'Legacy: the reliquary is open.', tier: 'Legacy' },
   { k: 'rosary', n: "Bishop's Rosary", d: 'Legacy: the reliquary is open.', tier: 'Legacy' },
   { k: 'key', n: 'Bone Key', d: 'Legacy: the reliquary is open.', tier: 'Legacy' }],
];

export const needXp = (lv: number) => { const n = lv - 2; return Math.round((100 + 30 * n + 3 * n * n) / 5) * 5; };
