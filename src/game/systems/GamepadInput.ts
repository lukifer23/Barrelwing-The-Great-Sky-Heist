import { AudioManager } from './AudioManager';
import type { Action } from './ActionInput';

export interface GamepadState {
  connected: boolean;
  id: string;
  mapping: string;
  held: Set<Action>;
  axisX: number;
  axisY: number;
}

const DEAD_ZONE = 0.35;
let installed = false;
let audioUnlockedByPad = false;

export function installGamepadInput(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('gamepadconnected', () => { audioUnlockedByPad = false; });
  window.addEventListener('gamepaddisconnected', () => { audioUnlockedByPad = false; });
}

/** Read the first connected controller without depending on Phaser input plugins. */
export function readGamepad(): GamepadState {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find((candidate): candidate is Gamepad => !!candidate?.connected) ?? null;
  const held = new Set<Action>();
  if (!pad) return { connected: false, id: '', mapping: '', held, axisX: 0, axisY: 0 };

  const pressed = (index: number) => !!pad.buttons[index]?.pressed;
  if (pressed(0)) held.add('confirm');
  if (pressed(1) || pressed(8)) held.add('back');
  if (pressed(2) || pressed(3)) held.add('attack');
  if (pressed(9)) held.add('pause');
  if (pressed(12)) held.add('up');
  if (pressed(13)) held.add('down');
  if (pressed(14)) held.add('left');
  if (pressed(15)) held.add('right');

  const rawX = pad.axes[0] ?? 0;
  const rawY = pad.axes[1] ?? 0;
  const axisX = Math.abs(rawX) >= DEAD_ZONE ? rawX : 0;
  const axisY = Math.abs(rawY) >= DEAD_ZONE ? rawY : 0;
  if (axisX < 0) held.add('left'); else if (axisX > 0) held.add('right');
  if (axisY < 0) held.add('up'); else if (axisY > 0) held.add('down');

  if (!audioUnlockedByPad && (held.size > 0 || axisX !== 0 || axisY !== 0)) {
    audioUnlockedByPad = true;
    AudioManager.unlock();
  }
  return { connected: true, id: pad.id, mapping: pad.mapping || 'standard', held, axisX, axisY };
}

export function gamepadConnected(): boolean {
  return readGamepad().connected;
}
