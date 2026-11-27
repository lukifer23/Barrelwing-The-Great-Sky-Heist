import Phaser from 'phaser';
import { touchInput } from './TouchControls';
import { readGamepad } from './GamepadInput';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'confirm' | 'back' | 'jump' | 'dash' | 'attack' | 'pause' | 'restart';

type ActionSources = { keyboard?: boolean; gamepad?: boolean; touch?: boolean };

const KEY_ACTIONS: Record<string, Action[]> = {
  ArrowUp: ['up'], KeyW: ['up'],
  ArrowDown: ['down'], KeyS: ['down'],
  ArrowLeft: ['left'], KeyA: ['left'],
  ArrowRight: ['right'], KeyD: ['right'],
  Space: ['confirm', 'jump'],
  Enter: ['confirm'],
  Escape: ['back', 'pause'],
  Backspace: ['back'],
  KeyP: ['pause'],
  KeyJ: ['dash'],
  KeyK: ['attack'],
  KeyR: ['restart'],
};

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Scene-local action state. Keyboard, touch and the first connected gamepad
 * feed the same held/pressed/released vocabulary. Edges are consumed once.
 */
export class ActionInput {
  private readonly sources: Required<ActionSources>;
  private readonly keyboardHeld = new Set<Action>();
  private readonly queuedPressed = new Set<Action>();
  private previous = new Set<Action>();
  private pressedSet = new Set<Action>();
  private releasedSet = new Set<Action>();

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.sources.keyboard || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    const actions = KEY_ACTIONS[e.code];
    if (!actions) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    for (const action of actions) {
      this.keyboardHeld.add(action);
      this.queuedPressed.add(action);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (!this.sources.keyboard) return;
    for (const action of KEY_ACTIONS[e.code] ?? []) this.keyboardHeld.delete(action);
  };

  private readonly onBlur = () => this.flush();

  constructor(sources: ActionSources = {}) {
    this.sources = { keyboard: true, gamepad: true, touch: true, ...sources };
    if (this.sources.keyboard) {
      window.addEventListener('keydown', this.onKeyDown, { passive: false });
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
    }
    this.flush();
  }

  update(): void {
    const current = new Set<Action>();
    if (this.sources.keyboard) for (const action of this.keyboardHeld) current.add(action);
    if (this.sources.touch) for (const action of touchInput.held) current.add(action);
    const pad = this.sources.gamepad ? readGamepad() : null;
    if (pad) for (const action of pad.held) current.add(action);

    const pressed = new Set<Action>();
    const released = new Set<Action>();
    for (const action of current) if (!this.previous.has(action)) pressed.add(action);
    for (const action of this.previous) if (!current.has(action)) released.add(action);
    for (const action of this.queuedPressed) pressed.add(action);
    this.queuedPressed.clear();

    if (this.sources.touch) {
      for (const action of [...touchInput.pressed]) {
        pressed.add(action);
        touchInput.pressed.delete(action);
      }
    }

    this.previous = current;
    this.pressedSet = pressed;
    this.releasedSet = released;
  }

  held(action: Action): boolean {
    if (this.previous.has(action)) return true;
    if (this.sources.keyboard && this.keyboardHeld.has(action)) return true;
    if (this.sources.gamepad && readGamepad().held.has(action)) return true;
    if (this.sources.touch && touchInput.held.has(action as 'jump' | 'dash' | 'pause' | 'attack')) return true;
    return false;
  }

  pressed(action: Action): boolean { return this.pressedSet.has(action); }
  released(action: Action): boolean { return this.releasedSet.has(action); }
  consume(action: Action): boolean {
    if (!this.pressedSet.has(action)) return false;
    this.pressedSet.delete(action);
    return true;
  }

  private liveHorizontal(): number {
    const keyboard = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    if (keyboard) return keyboard;
    const pad = this.sources.gamepad ? readGamepad() : null;
    if (pad?.axisX) return pad.axisX;
    return this.sources.touch ? touchInput.axisX : 0;
  }

  private liveVertical(): number {
    const keyboard = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    if (keyboard) return keyboard;
    const pad = this.sources.gamepad ? readGamepad() : null;
    if (pad?.axisY) return pad.axisY;
    return this.sources.touch ? touchInput.axisY : 0;
  }

  get horizontal(): number { return Phaser.Math.Clamp(this.liveHorizontal(), -1, 1); }
  get vertical(): number { return Phaser.Math.Clamp(this.liveVertical(), -1, 1); }
  get up(): boolean { return this.held('up') || this.liveVertical() < -0.4; }
  get down(): boolean { return this.held('down') || this.liveVertical() > 0.55; }
  get aim(): number { return this.up ? -1 : this.down ? 1 : 0; }

  /** Clear edges and treat everything currently held as already down. */
  flush(): void {
    const current = new Set<Action>();
    if (this.sources.keyboard) for (const action of this.keyboardHeld) current.add(action);
    if (this.sources.touch) for (const action of touchInput.held) current.add(action);
    if (this.sources.gamepad) for (const action of readGamepad().held) current.add(action);
    this.previous = current;
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.queuedPressed.clear();
  }

  endFrame(): void {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }

  destroy(): void {
    if (this.sources.keyboard) {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
    }
    this.keyboardHeld.clear();
    this.previous.clear();
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.queuedPressed.clear();
  }
}
