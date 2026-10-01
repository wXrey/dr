import { newWorld } from '../src/core/world';
import { step, chooseCard } from '../src/core/sim';
const w = newWorld({ seed: 7, armor: 'light', weapon: 'flintlock', pet: 'raven' });
let t = 0, rolls = 0, evs: Record<string, number> = {};
for (let i = 0; i < 60 * 60 * 8 && !w.result; i++) {
  t += 1 / 60;
  if (w.mode === 'levelup' || w.mode === 'relic') { chooseCard(w, 0); continue; }
  const roll = i % 90 === 0; if (roll) rolls++;
  step(w, { mx: Math.cos(t * 0.6), my: Math.sin(t * 0.6), roll }, 1 / 60);
  for (const e of w.events) evs[e.t] = (evs[e.t] || 0) + 1; w.events.length = 0;
  if (w.t >= 240 && !w.lock) break;
}
console.log({ horde: w.t.toFixed(1), real: w.real.toFixed(1), mode: w.mode, hp: Math.round(w.p.hp), lv: w.p.level, kills: w.kills, bosses: w.bossesDead,
  weapons: w.p.weapons.map(s => s.id + s.lv).join(','), pet: w.p.pet.id + w.p.pet.lv, enemies: w.enemies.length, result: w.result });
console.log(evs);
