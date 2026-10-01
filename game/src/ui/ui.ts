import { ARMORS, BIOMES, BOSSES, PETS, WEAPONS, needXp, type ArmorId, type PetId, type WeaponId } from '../core/data';
import type { World } from '../core/world';
import { pieceUrls, screenUrl, spriteUrl } from '../render/assets';
import { ACTIONS, bind, keyName, primaryName, resetSettings, saveSettings, settings, type Action } from '../settings';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const fmt = (s: number) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface Loadout { armor: ArmorId; weapon: WeaponId; pet: PetId; }

export class UI {
  root = $('#ui');
  hud!: HTMLElement; modal!: HTMLElement; bannerEl!: HTMLElement;
  cardsShown: string | null = null;
  endRetry: (() => void) | null = null;
  settingsBack: (() => void) | null = null;
  loadout: Loadout = { armor: 'light', weapon: 'longsword', pet: 'raven' };

  constructor() {
    try { const s = JSON.parse(localStorage.getItem('br_loadout') || 'null'); if (s && ARMORS[s.armor as ArmorId] && WEAPONS[s.weapon as WeaponId] && PETS[s.pet as PetId]) this.loadout = s; } catch { /* first run */ }
    this.root.innerHTML = `
      <div id="hud" class="hidden">
        <div class="tl"><div class="bar hp"><i></i><span></span></div><div class="row"><b class="lv"></b><span class="kills"></span></div><div class="buffs"></div></div>
        <div class="tc"><div class="time"></div><div class="biome"></div><div class="boss hidden"><div class="bar bossbar"><i></i></div><div class="bname"></div></div><div class="drain"></div></div>
        <div class="bl"><div class="slots"></div></div>
        <div class="bc"><div class="roll"><i></i><span class="rk"></span></div></div>
        <div class="xp"><i></i></div>
      </div>
      <div id="banner"><b></b><span></span></div>
      <div id="modal" class="hidden"></div>`;
    this.hud = $('#hud'); this.modal = $('#modal'); this.bannerEl = $('#banner');
  }

  // ------------------------------------------------------------ menu
  showMenu(onStart: (l: Loadout) => void, onSettings: () => void) {
    this.hud.classList.add('hidden'); this.cardsShown = null;
    const bg = screenUrl(['screens', 'menu', '!background']) || screenUrl(['screens', 'menu']);
    const opt = (group: string, id: string, name: string, desc: string, img: string | null) =>
      `<button class="opt ${(this.loadout as any)[group] === id ? 'sel' : ''}" data-g="${group}" data-id="${id}">${img ? `<img src="${img}">` : '<div class="noimg"></div>'}<b>${esc(name)}</b><small>${esc(desc)}</small></button>`;
    this.modal.className = 'menu';
    this.modal.style.backgroundImage = bg ? `linear-gradient(rgba(5,6,9,.55),rgba(5,6,9,.85)), url(${bg})` : '';
    this.modal.innerHTML = `<div class="box wide">
      <h1>BLACK<span>RELIQUARY</span></h1>
      <p class="sub">Survive the night. Every three minutes a boss, a relic and a new world.</p>
      <h3>Armor</h3><div class="opts">${Object.values(ARMORS).map(a => opt('armor', a.id, a.name, a.desc, spriteUrl(a.sprite))).join('')}</div>
      <h3>Weapon</h3><div class="opts six">${Object.values(WEAPONS).map(d => opt('weapon', d.id, d.name, d.desc, spriteUrl(d.sprite))).join('')}</div>
      <h3>Companion</h3><div class="opts">${Object.values(PETS).map(d => opt('pet', d.id, d.name, d.desc, spriteUrl(d.sprite))).join('')}</div>
      <button class="btn main" id="start">Begin the night</button>
      <button class="btn small" id="settings">Settings · controls</button>
      <p class="hint">${[ 'up', 'left', 'down', 'right'].map(a => primaryName(a as Action)).join('')} to move · ${esc(primaryName('roll'))} to roll (invulnerable while rolling) · weapons fire on their own · 1/2/3 to pick · ${esc(primaryName('pause'))} to pause</p>
    </div>`;
    this.modal.querySelectorAll<HTMLButtonElement>('.opt').forEach(b => b.onclick = () => {
      (this.loadout as any)[b.dataset.g!] = b.dataset.id; this.modal.querySelectorAll(`.opt[data-g="${b.dataset.g}"]`).forEach(x => x.classList.toggle('sel', x === b));
    });
    $('#settings').onclick = onSettings;
    $('#start').onclick = () => { try { localStorage.setItem('br_loadout', JSON.stringify(this.loadout)); } catch { /* ignore */ } this.close(); onStart({ ...this.loadout }); };
  }
  close() { this.modal.className = 'hidden'; this.modal.innerHTML = ''; this.modal.style.backgroundImage = ''; this.cardsShown = null; this.endRetry = null; this.settingsBack = null; }

  // ------------------------------------------------------------ cards
  showCards(w: World, onPick: (i: number) => void, onReroll: () => void) {
    if (!w.cards) return;
    const sig = w.cards.map(c => c.id).join('|') + w.mode;
    if (this.cardsShown === sig) return; this.cardsShown = sig;
    this.modal.className = 'cards';
    this.modal.innerHTML = `<div class="box"><h2>${esc(w.cardTitle)}</h2><p class="sub">${esc(w.cardSub)}</p>
      ${w.cards.map((c, i) => { const img = c.img ? spriteUrl(c.img) : c.iconRef ? pieceUrls(c.iconRef.sheet)[c.iconRef.index] || null : null;
        return `<button class="card ${c.cls}" data-i="${i}">${img ? `<img src="${img}">` : `<div class="ic">${c.icon}</div>`}<div><div class="h"><kbd>${i + 1}</kbd>${esc(c.title)}</div><div class="t">${esc(c.tag)}</div><div class="d">${esc(c.desc)}</div></div></button>`; }).join('')}
      ${w.mode === 'levelup' && w.p.rerolls > 0 ? `<button class="btn small" id="reroll">Reroll (${w.p.rerolls}) · R</button>` : ''}</div>`;
    this.modal.querySelectorAll<HTMLButtonElement>('.card').forEach(b => b.onclick = () => onPick(+b.dataset.i!));
    const r = this.modal.querySelector<HTMLButtonElement>('#reroll'); if (r) r.onclick = onReroll;
  }

  // ------------------------------------------------------------ pause / end
  showPause(onResume: () => void, onQuit: () => void, onSettings: () => void) {
    this.modal.className = 'cards';
    this.modal.innerHTML = `<div class="box"><h2>Paused</h2>
      <button class="btn" id="res">Resume · ${esc(primaryName('pause'))}</button>
      <button class="btn small" id="set">Settings · controls</button>
      <button class="btn small" id="quit">Main menu</button></div>`;
    $('#res').onclick = onResume; $('#quit').onclick = onQuit; $('#set').onclick = onSettings;
  }

  // ------------------------------------------------------------ settings
  /** @param capture hands the next key/mouse press to the callback (Input.capture) */
  showSettings(onBack: () => void, capture: (f: ((code: string) => void) | null) => void, onAudio: () => void) {
    this.settingsBack = onBack;
    const render = (waiting?: string) => {
      this.modal.className = 'cards';
      const row = (a: { id: Action; name: string }) => `<div class="bind"><span>${a.name}</span>${[0, 1].map(s => {
        const key = `${a.id}:${s}`;
        return `<button class="key ${waiting === key ? 'wait' : ''}" data-k="${key}">${waiting === key ? 'Press a key…' : esc(keyName(settings.keys[a.id][s]))}</button>`; }).join('')}</div>`;
      const slider = (k: 'master' | 'music' | 'sfx', name: string) => `<label class="vol"><span>${name}</span><input data-v="${k}" type="range" min="0" max="1" step="0.05" value="${settings[k]}"></label>`;
      this.modal.innerHTML = `<div class="box"><h2>Settings</h2>
        <h3>Controls</h3><div class="binds">${ACTIONS.map(row).join('')}</div>
        <p class="hint">Click a binding, then press a key or mouse button. Esc cancels, Backspace clears. Esc always pauses.</p>
        <h3>Audio</h3>${slider('master', 'Master')}${slider('music', 'Music')}${slider('sfx', 'Effects')}
        <h3>Feel</h3>
        <div class="bind"><span>Screen shake</span><button class="key" id="shake">${settings.shake ? 'On' : 'Off'}</button></div>
        <div class="bind"><span>Damage numbers</span><button class="key" id="nums">${{ crits: 'Crits only', all: 'All hits', off: 'Off' }[settings.numbers]}</button></div>
        <div class="row2"><button class="btn small" id="reset">Reset to defaults</button><button class="btn" id="back">Back</button></div></div>`;
      this.modal.querySelectorAll<HTMLButtonElement>('.key[data-k]').forEach(b => b.onclick = ev => {
        ev.stopPropagation();
        const [a, s] = b.dataset.k!.split(':') as [Action, string];
        render(b.dataset.k);
        // defer so the click that opened the prompt is not captured as the binding
        setTimeout(() => capture(code => {
          if (code === 'Escape') { render(); return; }
          bind(a, +s as 0 | 1, code === 'Backspace' || code === 'Delete' ? null : code); render();
        }), 0);
      });
      this.modal.querySelectorAll<HTMLInputElement>('input[data-v]').forEach(i => i.oninput = () => { (settings as any)[i.dataset.v!] = +i.value; saveSettings(); onAudio(); });
      $('#shake').onclick = () => { settings.shake = !settings.shake; saveSettings(); render(); };
      $('#nums').onclick = () => { settings.numbers = settings.numbers === 'crits' ? 'all' : settings.numbers === 'all' ? 'off' : 'crits'; saveSettings(); render(); };
      $('#reset').onclick = () => { capture(null); resetSettings(); onAudio(); render(); };
      $('#back').onclick = () => { capture(null); this.settingsBack = null; onBack(); };
    };
    render();
  }
  showEnd(w: World, onAgain: () => void, onMenu: () => void, retry: { label: string; fn: () => void } | null = null, retries = 0) {
    const win = !!w.result?.win, p = w.p;
    const top = Object.entries(w.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const name = (k: string) => (WEAPONS as any)[k]?.name || (PETS as any)[k]?.name || ({ bleed: 'Bleeding', rot: 'Rot' } as any)[k] || k;
    this.modal.className = 'cards';
    this.modal.innerHTML = `<div class="box"><h2>${win ? 'The Reliquary is open' : 'You have fallen'}</h2>
      <p class="sub">${win ? 'A fragment of the Black Reliquary is yours.' : 'The dead do not tire. Try another build.'}</p>
      <div class="stats">
        <div><span>Night survived</span><b>${fmt(w.t)}</b></div><div><span>Real time</span><b>${fmt(w.real)}</b></div>
        <div><span>Level</span><b>${p.level}</b></div><div><span>Kills</span><b>${w.kills}</b></div><div><span>Bosses slain</span><b>${w.bossesDead}</b></div>
        ${top.map(([k, v]) => `<div><span>${esc(name(k))}</span><b>${Math.round(v)}</b></div>`).join('')}
        <div><span>Relics</span><b>${esc(w.relicLog.join(', ') || '—')}</b></div>
        ${retries ? `<div><span>Retries</span><b>${retries}</b></div>` : ''}
      </div>
      ${retry ? `<button class="btn main" id="retry">${esc(retry.label)} · R</button>` : ''}
      <button class="btn ${retry ? '' : 'main'}" id="again">New run</button><button class="btn small" id="menu">Main menu</button></div>`;
    $('#again').onclick = onAgain; $('#menu').onclick = onMenu;
    if (retry) $('#retry').onclick = retry.fn;
    this.endRetry = retry?.fn || null;
  }

  banner(text: string, sub: string) {
    this.bannerEl.querySelector('b')!.textContent = text; this.bannerEl.querySelector('span')!.textContent = sub;
    this.bannerEl.classList.remove('show'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('show');
  }

  // ------------------------------------------------------------ hud
  private lastSlots = '';
  updateHud(w: World) {
    const p = w.p, h = this.hud; h.classList.remove('hidden');
    (h.querySelector('.hp i') as HTMLElement).style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
    h.querySelector('.hp')!.classList.toggle('low', p.hp < p.maxHp * 0.35);
    h.querySelector('.hp span')!.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    h.querySelector('.lv')!.textContent = `Lv ${p.level}`; h.querySelector('.kills')!.textContent = `☠ ${w.kills}`;
    (h.querySelector('.xp i') as HTMLElement).style.width = `${Math.min(1, p.xp / needXp(p.level + 1)) * 100}%`;
    const time = h.querySelector('.time') as HTMLElement; time.textContent = fmt(w.t); time.classList.toggle('lock', w.lock);
    h.querySelector('.biome')!.textContent = BIOMES[w.biome].n + (w.lock ? ' · time stands still' : '');
    const bossEl = h.querySelector('.boss')!; bossEl.classList.toggle('hidden', !w.boss);
    if (w.boss) { (h.querySelector('.bossbar i') as HTMLElement).style.width = `${Math.max(0, w.boss.hp / w.boss.maxHp) * 100}%`; h.querySelector('.bname')!.textContent = BOSSES[w.boss.idx!].n; }
    h.querySelector('.drain')!.textContent = w.drain ? `Anchors: ${w.drain.left} · ${Math.ceil(w.drain.t)}s` : '';
    const buffs: string[] = [];
    if (p.frenzyT > 0) buffs.push('Frenzy'); if (p.moonT > 0) buffs.push('Moonfang'); if (p.bellT > 0) buffs.push('Bell');
    if (p.relics.shield) buffs.push(p.blockCd > 0 ? `Shield ${Math.ceil(p.blockCd)}s` : 'Shield ready');
    h.querySelector('.buffs')!.textContent = buffs.join(' · ');
    const slots = p.weapons.map(s => s.id + s.lv).join() + '|' + p.pet.id + p.pet.lv;
    if (slots !== this.lastSlots) {
      this.lastSlots = slots;
      const icon = (q: string[], fallback: string) => { const u = spriteUrl(q); return u ? `<img src="${u}">` : `<span>${fallback}</span>`; };
      h.querySelector('.slots')!.innerHTML = p.weapons.map(s => `<div class="slot">${icon(WEAPONS[s.id].sprite, WEAPONS[s.id].kind === 'melee' ? '⚔' : '✸')}<em>${ROMAN[s.lv]}</em></div>`).join('')
        + `<div class="slot pet">${icon(PETS[p.pet.id].sprite, '❖')}<em>${ROMAN[p.pet.lv]}</em></div>`;
    }
    const A = ARMORS[p.armorId].roll.cd * Math.max(0.4, 1 - p.rollCdMul);
    (h.querySelector('.roll i') as HTMLElement).style.height = `${Math.max(0, Math.min(1, p.rollCd / A)) * 100}%`;
    h.querySelector('.roll')!.classList.toggle('ready', p.rollCd <= 0);
    const rk = h.querySelector('.rk')!, rn = primaryName('roll').toUpperCase(); if (rk.textContent !== rn) rk.textContent = rn;
  }
  hideHud() { this.hud.classList.add('hidden'); }
}
