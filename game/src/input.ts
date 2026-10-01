// Keyboard + mouse-button input through the rebindable settings. The roll is edge-triggered and
// latched until the simulation consumes it, so a quick tap between two fixed steps is never lost.
import { actionOf, settings } from './settings';

export class Input {
  down = new Set<string>();
  private rollLatch = false;
  /** while set, the next key/mouse press is handed here instead of to the game (key rebinding) */
  capture: ((code: string) => void) | null = null;
  onKey: ((code: string) => void) | null = null;

  constructor() {
    const press = (code: string, repeat: boolean, e: Event) => {
      if (this.capture) { e.preventDefault(); const f = this.capture; this.capture = null; f(code); return; }
      const a = actionOf(code);
      if (!repeat && a === 'roll') this.rollLatch = true;
      this.down.add(code);
      if (!repeat) this.onKey?.(code);
    };
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) || this.capture) e.preventDefault();
      press(e.code, e.repeat, e);
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    // mouse buttons can be bound too (e.g. right click to roll); clicks on menus still work normally
    window.addEventListener('mousedown', e => { const code = 'Mouse' + e.button; if (this.capture || actionOf(code)) press(code, false, e); else this.down.add(code); });
    window.addEventListener('mouseup', e => this.down.delete('Mouse' + e.button));
    window.addEventListener('contextmenu', e => { if (actionOf('Mouse2')) e.preventDefault(); });
    window.addEventListener('blur', () => { this.down.clear(); this.rollLatch = false; });
  }
  private held(a: 'up' | 'down' | 'left' | 'right') { const [x, y] = settings.keys[a]; return (!!x && this.down.has(x)) || (!!y && this.down.has(y)); }
  read() {
    const mx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const my = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    const roll = this.rollLatch; this.rollLatch = false;
    return { mx, my, roll };
  }
  clearRoll() { this.rollLatch = false; }
}
