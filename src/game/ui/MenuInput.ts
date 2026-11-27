import Phaser from 'phaser';
import { ActionInput, type Action } from '../systems/ActionInput';
import type { Menu } from './Menu';

export interface GamepadActionOptions {
  isEnabled?: () => boolean;
  /** D-pad/stick repeat is appropriate for menus, never gameplay. */
  repeat?: boolean;
  repeatDelayMs?: number;
  repeatEveryMs?: number;
}

export interface MenuGamepadOptions extends GamepadActionOptions {
  onBack?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
}

const DIRECTIONS: Action[] = ['up', 'down', 'left', 'right'];
const EDGE_ACTIONS: Action[] = ['confirm', 'back', 'attack', 'pause', 'restart'];

/** Route controller actions to the active screen without synthesising key events. */
export function bindGamepadActions(
  scene: Phaser.Scene,
  handler: (action: Action) => void,
  options: GamepadActionOptions = {},
): ActionInput {
  const input = new ActionInput({ keyboard: false, touch: false });
  const repeat = options.repeat ?? true;
  const repeatDelay = options.repeatDelayMs ?? 350;
  const repeatEvery = options.repeatEveryMs ?? 90;
  let heldDirection: Action | null = null;
  let nextRepeat = 0;

  const step = () => {
    input.update();
    if (!scene.scene.isActive() || scene.scene.isPaused() || (options.isEnabled && !options.isEnabled())) {
      heldDirection = null;
      input.endFrame();
      return;
    }
    const now = scene.time.now;
    for (const direction of DIRECTIONS) {
      if (!input.consume(direction)) continue;
      heldDirection = direction;
      nextRepeat = now + repeatDelay;
      handler(direction);
    }
    if (heldDirection) {
      if (!input.held(heldDirection)) {
        heldDirection = null;
      } else if (repeat && now >= nextRepeat) {
        nextRepeat = now + repeatEvery;
        handler(heldDirection);
      }
    }
    for (const action of EDGE_ACTIONS) if (input.consume(action)) handler(action);
    input.endFrame();
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, step);
  const flush = () => input.flush();
  scene.events.on(Phaser.Scenes.Events.RESUME, flush);
  scene.events.on(Phaser.Scenes.Events.PAUSE, flush);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, step);
    scene.events.off(Phaser.Scenes.Events.RESUME, flush);
    scene.events.off(Phaser.Scenes.Events.PAUSE, flush);
    input.destroy();
  });
  return input;
}

export function bindMenuGamepad(
  scene: Phaser.Scene,
  menu: Menu,
  options: MenuGamepadOptions = {},
): ActionInput {
  return bindGamepadActions(scene, action => {
    if (action === 'up') menu.move(-1);
    else if (action === 'down') menu.move(1);
    else if (action === 'confirm') menu.confirm();
    else if (action === 'back') options.onBack?.();
    else if (action === 'left') options.onLeft?.();
    else if (action === 'right') options.onRight?.();
  }, options);
}
