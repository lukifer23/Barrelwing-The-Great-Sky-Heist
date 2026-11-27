import { SaveManager } from '../systems/SaveManager';
import { readGamepad } from '../systems/GamepadInput';

export type InputFamily = 'keyboard' | 'touch' | 'gamepad';
export type ControllerLabels = 'standard' | 'handheld';

export function activeInputFamily(): InputFamily {
  if (readGamepad().connected) return 'gamepad';
  if (window.matchMedia('(pointer: coarse)').matches) return 'touch';
  return 'keyboard';
}

export function controllerLabels(): ControllerLabels {
  const preset = SaveManager.get().settings.controllerPreset;
  if (preset !== 'auto') return preset;
  const id = readGamepad().id;
  return /nintendo|switch|joy-con|pro controller|8bitdo|retro|anbernic|miyoo|tekko|rg\d/i.test(id) ? 'handheld' : 'standard';
}

export function actionGlyph(
  action: 'confirm' | 'back' | 'attack' | 'pause',
  family = activeInputFamily(),
): string {
  if (family === 'touch') return { confirm: 'JUMP', back: 'BACK', attack: 'HIT', pause: 'PAUSE' }[action];
  if (family === 'keyboard') return { confirm: 'SPACE', back: 'ESC', attack: 'K', pause: 'ESC' }[action];
  const labels = controllerLabels();
  if (labels === 'handheld') return { confirm: 'B', back: 'A', attack: 'Y', pause: 'START' }[action];
  return { confirm: 'A', back: 'B', attack: 'X', pause: 'START' }[action];
}

export function controlsLine(): string {
  const family = activeInputFamily();
  if (family === 'keyboard') return 'ARROWS MOVE  ·  SPACE JUMP  ·  J DASH  ·  K HIT  ·  ESC PAUSE';
  if (family === 'touch') return 'STICK MOVE  ·  JUMP  ·  DASH  ·  HIT IN BRAWL  ·  PAUSE';
  const c = actionGlyph('confirm', family), b = actionGlyph('back', family);
  const x = actionGlyph('attack', family);
  return `STICK MOVE  ·  ${c} JUMP/FLAP  ·  ${b} DASH/BACK  ·  ${x} HIT  ·  START PAUSE`;
}
