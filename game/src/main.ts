import './style.css';
import { Application } from 'pixi.js';
import { cloneWorld, newWorld, type World } from './core/world';
import { chooseCard, reroll, step } from './core/sim';
import { loadAssets } from './render/assets';
import { GameRenderer } from './render/renderer';
import { Sfx } from './audio/sfx';
import { UI, type Loadout } from './ui/ui';
import { Input } from './input';
import { actionOf } from './settings';

const STEP = 1 / 60;

async function boot() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#07080b', antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
  document.getElementById('app')!.appendChild(app.canvas);
  const loading = document.getElementById('loading')!; loading.dataset.ok = '1';
  const bar = document.querySelector<HTMLElement>('#loading i')!;
  await loadAssets(app.renderer, f => { bar.style.width = `${Math.round(f * 100)}%`; });
  document.getElementById('loading')!.remove();

  const ui = new UI(), input = new Input(), sfx = new Sfx(), R = new GameRenderer(app);
  R.banner = (t, s) => ui.banner(t, s);
  let w: World | null = null, paused = false, acc = 0, lastLoadout: Loadout | null = null, endShown = false;
  let checkpoint: World | null = null, retries = 0;   // snapshot taken at the last boss gate

  const start = (l: Loadout) => {
    sfx.unlock(); lastLoadout = l; endShown = false; paused = false; acc = 0;
    w = newWorld({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, armor: l.armor, weapon: l.weapon, pet: l.pet });
    R.initPlayer(w); input.clearRoll(); checkpoint = null; retries = 0;
  };
  const retry = () => {
    if (!checkpoint) return;
    w = cloneWorld(checkpoint); retries++; endShown = false; paused = false; acc = 0;
    R.initPlayer(w); input.clearRoll(); ui.close(); ui.banner('Once more', `Retry ${retries}`);
  };
  const openSettings = (back: () => void) => ui.showSettings(back, f => { input.capture = f; }, () => sfx.applyVolumes());
  const menu = () => { w = null; paused = false; checkpoint = null; ui.hideHud(); ui.showMenu(start, () => openSettings(menu)); };
  const pick = (i: number) => { if (!w || !w.cards) return; chooseCard(w, i); ui.close(); flush(); };
  const flush = () => {
    if (!w) return;
    let gate = false;
    for (const e of w.events) { R.handle(e, w); sfx.play(e, w); if (e.t === 'gate') gate = true; }
    w.events.length = 0;
    if (gate) checkpoint = cloneWorld(w);
  };
  const setPaused = (v: boolean) => {
    if (!w || w.mode !== 'play') return; paused = v;
    if (v) { const showP = () => ui.showPause(() => setPaused(false), () => { ui.close(); menu(); }, () => openSettings(showP)); showP(); }
    else { ui.close(); input.clearRoll(); }
  };

  input.onKey = code => {
    sfx.unlock();
    if (!w) { if (code === 'Escape' && ui.settingsBack) ui.settingsBack(); return; }
    if (w.mode === 'over' && code === 'KeyR' && ui.endRetry) { ui.endRetry(); return; }
    if (code === 'Escape' && ui.settingsBack) { ui.settingsBack(); return; }
    if (code === 'Escape' || actionOf(code) === 'pause') { if (w.mode === 'play') setPaused(!paused); return; }
    if ((w.mode === 'levelup' || w.mode === 'relic') && w.cards) {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[code];
      if (n !== undefined && n < w.cards.length) pick(n);
      if (code === 'KeyR' && w.mode === 'levelup') { reroll(w); ui.cardsShown = null; }
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && w && w.mode === 'play' && !paused) setPaused(true); });
  window.addEventListener('pointerdown', () => sfx.unlock());

  // dev console: dev.start({armor,weapon,pet}), dev.god, dev.autopick, dev.give('arquebus', 3), dev.jump(170), dev.freeze
  const dev = { god: false, autopick: false, freeze: false, get w() { return w; },
    start: (l: Partial<Loadout>) => { ui.close(); start({ armor: 'light', weapon: 'longsword', pet: 'raven', ...l }); },
    give: (id: import('./core/data').WeaponId, lv = 1) => { if (!w) return; const s = w.p.weapons.find(x => x.id === id); if (s) s.lv = lv; else w.p.weapons.push({ id, lv, cd: 0, swings: 0, burstLeft: 0, burstT: 0, aim: 0, swingT: 0 }); },
    jump: (t: number) => { if (w) w.t = t; } };
  if (import.meta.env.DEV) (window as any).dev = dev;

  app.ticker.add(t => {
    const dt = Math.min(0.1, t.deltaMS / 1000);
    if (w && dev.god) w.p.hp = w.p.maxHp;
    if (w && dev.autopick && (w.mode === 'levelup' || w.mode === 'relic') && w.cards) pick(0);
    if (w && dev.freeze) { R.draw(w, 0); return; }
    if (w) {
      if (w.mode === 'play' && !paused) {
        acc += dt;
        while (acc >= STEP) { step(w, input.read(), STEP); acc -= STEP; flush(); if (w.mode !== 'play') { acc = 0; break; } }
      } else acc = 0;
      R.draw(w, w.mode === 'play' && !paused ? dt : 0);
      ui.updateHud(w);
      if ((w.mode === 'levelup' || w.mode === 'relic') && w.cards) ui.showCards(w, pick, () => { if (w) { reroll(w); ui.cardsShown = null; } });
      if (w.mode === 'over' && !endShown) {
        endShown = true;
        setTimeout(() => { if (w) ui.showEnd(w, () => { ui.close(); start(lastLoadout!); }, () => { ui.close(); menu(); },
          !w.result?.win && checkpoint ? { label: `Retry from boss ${checkpoint.gateIdx + 1}`, fn: retry } : null, retries); }, 1200);
      }
    }
    sfx.update(w, dt);
  });
  menu();

  // dev: new art processed by `npm run assets:watch` shows up automatically (only reloads on the menu, never mid-run)
  if (import.meta.env.DEV) {
    let last = '';
    setInterval(async () => {
      try { const m = await (await fetch('assets/manifest.json', { cache: 'no-cache' })).text(); if (last && m !== last && !w) location.reload(); last = m; } catch { /* dev server restarting */ }
    }, 2500);
  }
}
boot();
