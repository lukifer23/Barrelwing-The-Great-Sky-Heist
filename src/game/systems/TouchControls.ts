import type Phaser from 'phaser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { SaveManager } from './SaveManager';

type Action = 'jump' | 'dash' | 'pause';
export const touchInput = {
  held: new Set<Action>(), pressed: new Set<Action>(), axisX: 0, axisY: 0,
  reset() { this.held.clear(); this.pressed.clear(); this.axisX = 0; this.axisY = 0; },
};

/** Screen-space analog stick with independent multi-touch action buttons. */
export function installTouchControls(game: Phaser.Game): void {
  const root = document.createElement('nav'); root.id = 'touch-controls';
  root.setAttribute('aria-label', 'Game controls'); root.hidden = true;
  const stick = document.createElement('div'); stick.id = 'joystick';
  stick.setAttribute('role', 'application'); stick.setAttribute('aria-label', 'Movement joystick');
  stick.innerHTML = '<span class="stick-guide">MOVE</span><span class="stick-knob"></span>';
  const knob = stick.querySelector<HTMLElement>('.stick-knob')!;
  let stickPointer: number | null = null;
  const moveStick = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    const bounds = stick.getBoundingClientRect();
    const radius = bounds.width * 0.34;
    const dx = e.clientX - bounds.x - bounds.width / 2, dy = e.clientY - bounds.y - bounds.height / 2;
    const distance = Math.hypot(dx, dy);
    const magnitude = Math.min(1, distance / radius);
    const strength = Math.max(0, (magnitude - 0.16) / 0.84);
    touchInput.axisX = distance ? dx / distance * strength : 0;
    touchInput.axisY = distance ? dy / distance * strength : 0;
    const visual = distance ? Math.min(radius, distance) / distance : 0;
    knob.style.transform = `translate(${dx * visual}px, ${dy * visual}px)`;
  };
  stick.addEventListener('pointerdown', e => {
    if (stickPointer !== null) return;
    e.preventDefault(); stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId);
    stick.classList.add('held'); moveStick(e);
  });
  stick.addEventListener('pointermove', moveStick);
  const releaseStick = (e?: PointerEvent) => {
    if (e && e.pointerId !== stickPointer) return;
    stickPointer = null; touchInput.axisX = 0; touchInput.axisY = 0;
    knob.style.transform = ''; stick.classList.remove('held');
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) stick.addEventListener(event, releaseStick);
  root.append(stick);
  for (const [action, label, description] of [
    ['dash', 'DASH', 'Dash'], ['jump', 'JUMP', 'Jump or flap'], ['pause', 'PAUSE', 'Pause or leave sprint'],
  ] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.dataset.action = action; button.setAttribute('aria-label', description);
    const pointers = new Set<number>();
    button.addEventListener('pointerdown', e => {
      e.preventDefault(); button.setPointerCapture(e.pointerId); pointers.add(e.pointerId);
      touchInput.held.add(action); touchInput.pressed.add(action); button.classList.add('held');
      if (SaveManager.get().settings.haptics && Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    });
    const release = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) { touchInput.held.delete(action); button.classList.remove('held'); } };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(event, release);
    root.append(button);
  }
  document.getElementById('app')!.append(root);
  const fps = document.createElement('output'); fps.id = 'fps-meter'; fps.hidden = true; document.getElementById('app')!.append(fps);
  let lastFpsUpdate = 0, previous = '', previousSettings = '';
  const update = () => {
    const settings = SaveManager.get().settings;
    const key = `${settings.touchScale}:${settings.touchOpacity}:${settings.leftHanded}:${settings.showFps}`;
    if (key !== previousSettings) {
      previousSettings = key; root.style.setProperty('--control-scale', String(settings.touchScale));
      root.style.setProperty('--control-opacity', String(settings.touchOpacity)); root.classList.toggle('left-handed', settings.leftHanded); fps.hidden = !settings.showFps;
    }
    if (settings.showFps && performance.now() - lastFpsUpdate > 500) { lastFpsUpdate = performance.now(); fps.textContent = `${Math.round(game.loop.actualFps)} FPS`; }
    const scene = game.scene.isActive('Game') ? 'Game' : game.scene.isActive('SkySprint') ? 'SkySprint' : '';
    if (scene === previous) return;
    previous = scene; root.hidden = !scene; document.body.classList.toggle('playing', !!scene);
    touchInput.reset(); releaseStick(); game.scale.refresh();
  };
  game.events.on('poststep', update);
  const blur = () => { touchInput.reset(); releaseStick(); };
  window.addEventListener('blur', blur);
  game.events.once('destroy', () => { root.remove(); fps.remove(); window.removeEventListener('blur', blur); game.events.off('poststep', update); });
}
