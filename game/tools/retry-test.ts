import { newWorld, cloneWorld, type World } from '../src/core/world';
import { step, chooseCard } from '../src/core/sim';
const w0 = newWorld({ seed: 11, armor: 'light', weapon: 'longsword', pet: 'raven' });
let cp: World | null = null, t = 0;
const run = (w: World, until: (w: World) => boolean, max = 60 * 60 * 20, god = false) => {
  for (let i = 0; i < max && !until(w); i++) {
    t += 1 / 60;
    if (w.mode === 'levelup' || w.mode === 'relic') { chooseCard(w, 0); continue; }
    if (w.mode === "over") break; if (god) w.p.hp = w.p.maxHp;
    step(w, { mx: Math.cos(t * 0.7), my: Math.sin(t * 0.7), roll: i % 120 === 0 }, 1 / 60);
    let gate = false; for (const e of w.events) if (e.t === 'gate') gate = true; w.events.length = 0;
    if (gate && !cp) cp = cloneWorld(w);
  }
};
run(w0, w => !!cp, 60 * 60 * 20, true);
const snap = (w: World) => JSON.stringify({ t: w.t, real: w.real, hp: w.p.hp, lv: w.p.level, xp: w.p.xp, en: w.enemies.length, gems: w.gems.length, gate: w.gateIdx, lock: w.lock, rng: w.rng.state, wep: w.p.weapons.map(s => s.id + s.lv) });
const atGate = snap(cp!);
console.log('checkpoint at gate', cp!.gateIdx + 1, atGate);
run(w0, w => w.mode === 'over');
console.log('original continued ->', w0.result, 'bosses', w0.bossesDead, 't', w0.t.toFixed(1));
const r1 = cloneWorld(cp!), r2 = cloneWorld(cp!);
console.log('restore == checkpoint:', snap(r1) === atGate, '| restored worlds independent:', r1 !== r2 && r1.p !== r2.p);
// a restored run must play out deterministically: two restores with identical inputs give identical results
t = 0; run(r1, w => w.mode === 'over' || w.bossesDead > cp!.bossesDead, 60 * 60 * 3); const a = snap(r1);
t = 0; run(r2, w => w.mode === 'over' || w.bossesDead > cp!.bossesDead, 60 * 60 * 3); const b = snap(r2);
console.log('two retries identical:', a === b, '| boss killed in retry:', r1.bossesDead > cp!.bossesDead, 'mode', r1.mode);
