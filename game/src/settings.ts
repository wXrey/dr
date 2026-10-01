// Player settings (key bindings, audio, feel), persisted in localStorage.
export type Action = 'up' | 'down' | 'left' | 'right' | 'roll' | 'pause';
export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'up', name: 'Move up' }, { id: 'down', name: 'Move down' }, { id: 'left', name: 'Move left' }, { id: 'right', name: 'Move right' },
  { id: 'roll', name: 'Roll' }, { id: 'pause', name: 'Pause' },
];
export interface Settings {
  keys: Record<Action, [string | null, string | null]>;   // two slots per action; codes are KeyboardEvent.code or Mouse0/1/2
  master: number; music: number; sfx: number; shake: boolean; numbers: 'crits' | 'all' | 'off';
}
export const DEFAULTS: Settings = {
  keys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], roll: ['Space', 'ShiftLeft'], pause: ['Escape', 'KeyP'] },
  master: 0.8, music: 0.5, sfx: 1, shake: true, numbers: 'crits',
};
const clone = (s: Settings): Settings => JSON.parse(JSON.stringify(s));

export const settings: Settings = (() => {
  try {
    const s = JSON.parse(localStorage.getItem('br_settings') || 'null');
    if (s && s.keys) { const d = clone(DEFAULTS); return { ...d, ...s, keys: { ...d.keys, ...s.keys } }; }
  } catch { /* first run */ }
  return clone(DEFAULTS);
})();
export function saveSettings() { try { localStorage.setItem('br_settings', JSON.stringify(settings)); } catch { /* private mode */ } }
export function resetSettings() { Object.assign(settings, clone(DEFAULTS)); saveSettings(); }

/** bind code to action/slot; a code can only belong to one action, so it is removed elsewhere */
export function bind(action: Action, slot: 0 | 1, code: string | null) {
  if (code) for (const a of Object.keys(settings.keys) as Action[]) settings.keys[a] = settings.keys[a].map(c => (c === code ? null : c)) as [string | null, string | null];
  settings.keys[action][slot] = code; saveSettings();
}
export const actionOf = (code: string): Action | null => {
  for (const a of Object.keys(settings.keys) as Action[]) if (settings.keys[a].includes(code)) return a;
  return null;
};

const NAMES: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backquote: '`',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', MetaLeft: 'L-Cmd', MetaRight: 'R-Cmd',
  Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', CapsLock: 'Caps',
};
export function keyName(code: string | null) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
export const primaryName = (a: Action) => keyName(settings.keys[a][0] || settings.keys[a][1]);
