import type Phaser from 'phaser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { SaveManager } from './SaveManager';
import type { Player } from '../player/Player';
import type { Fighter } from '../brawl/Fighter';

type Action = 'jump' | 'dash' | 'pause' | 'attack';
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
  const buttons = new Map<Action, HTMLButtonElement>();
  for (const [action, label, description] of [
    ['attack', 'HIT', 'Attack'], ['dash', 'DASH', 'Dash'], ['jump', 'JUMP', 'Jump or flap'], ['pause', 'PAUSE', 'Pause'],
  ] as const) {
    const button = document.createElement('button'); button.type = 'button';
    button.innerHTML = `<span class="action-label">${label}</span><small class="action-detail"></small>`;
    buttons.set(action, button);
    button.dataset.action = action; button.setAttribute('aria-label', description);
    const pointers = new Set<number>();
    button.addEventListener('pointerdown', e => {
      e.preventDefault(); button.setPointerCapture(e.pointerId); pointers.add(e.pointerId);
      touchInput.held.add(action); touchInput.pressed.add(action); button.classList.add('held');
      if (button.getAttribute('aria-disabled') !== 'true' && SaveManager.get().settings.haptics && Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    });
    const release = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) { touchInput.held.delete(action); button.classList.remove('held'); } };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(event, release);
    root.append(button);
  }
  document.getElementById('app')!.append(root);
  const mute = document.createElement('button'); mute.id = 'audio-toggle'; mute.type = 'button';
  mute.addEventListener('click', () => {
    SaveManager.patchSettings({ muted: !SaveManager.get().settings.muted });
    game.registry.get('audioRefresh')?.();
  });
  document.getElementById('app')!.append(mute);
  const fps = document.createElement('output'); fps.id = 'fps-meter'; fps.hidden = true; document.getElementById('app')!.append(fps);
  let lastFpsUpdate = performance.now(), fpsFrames = 0, previous = '', previousSettings = '';
  const feedback = (action: Action, label: string, detail: string, progress: number, available: boolean) => {
    const button = buttons.get(action)!;
    const key = `${label}:${detail}:${Math.round(progress * 20)}:${available}`;
    if (button.dataset.feedback === key) return;
    button.dataset.feedback = key;
    button.querySelector('.action-label')!.textContent = label;
    button.querySelector('.action-detail')!.textContent = detail;
    button.style.setProperty('--ready', String(progress));
    button.setAttribute('aria-disabled', String(!available));
    button.title = `${label}: ${detail}`;
  };
  const update = () => {
    const settings = SaveManager.get().settings;
    const muted = settings.muted;
    if (mute.getAttribute('aria-pressed') !== String(muted)) {
      mute.textContent = muted ? 'MUTED' : 'SOUND ON';
      mute.setAttribute('aria-label', muted ? 'Unmute game audio' : 'Mute game audio');
      mute.setAttribute('aria-pressed', String(muted));
    }
    const key = `${settings.touchScale}:${settings.touchOpacity}:${settings.leftHanded}:${settings.showFps}`;
    if (key !== previousSettings) {
      previousSettings = key; root.style.setProperty('--control-scale', String(settings.touchScale));
      root.style.setProperty('--control-opacity', String(settings.touchOpacity)); root.classList.toggle('left-handed', settings.leftHanded); fps.hidden = !settings.showFps;
    }
    fpsFrames++;
    const elapsed = performance.now() - lastFpsUpdate;
    if (elapsed > 500) {
      if (settings.showFps) fps.textContent = `${Math.round(fpsFrames * 1000 / elapsed)} FPS`;
      fpsFrames = 0; lastFpsUpdate = performance.now();
    }
    const sprint = game.scene.getScene('SkySprint') as Phaser.Scene & { controlsActive?: boolean; player?: Player };
    const scene = game.scene.isActive('Brawl') ? 'Brawl' : game.scene.isActive('Game') ? 'Game' : game.scene.isActive('SkySprint') && sprint.controlsActive ? 'SkySprint' : '';
    if (scene) {
      const active = game.scene.getScene(scene) as Phaser.Scene & { player?: Player; human?: Fighter };
      const p = active.player, fighter = active.human;
      const flight = p?.mode === 'flight';
      root.classList.toggle('flying', !!flight);
      if (p) {
        const usable = !p.dead && !p.controlLocked;
        const air = !p.grounded && p.mode !== 'climb';
        feedback('jump', flight || air ? 'FLAP' : 'JUMP', flight ? 'TAP TO RISE' : air ? `${p.flapCharges} LEFT` : 'HOLD: HIGHER', 1, usable && (flight || !air || p.flapCharges > 0));
        feedback('dash', 'DASH', p.dashReady ? 'READY' : 'CHARGING', p.dashProgress, usable && p.dashReady);
      } else if (fighter) {
        feedback('jump', 'JUMP', fighter.grounded ? 'HOLD: HIGHER' : `${fighter.airJumps} LEFT`, 1, !fighter.stunned && (fighter.grounded || fighter.airJumps > 0));
        feedback('dash', 'DASH', fighter.dashProgress === 1 ? 'READY' : 'CHARGING', fighter.dashProgress, !fighter.stunned && fighter.dashProgress === 1);
        feedback('attack', 'HIT', fighter.attackProgress === 1 ? 'HOLD: REPEAT' : 'RECOVERING', fighter.attackProgress, !fighter.stunned && fighter.attackProgress === 1);
      }
    }
    if (scene === previous) return;
    previous = scene; root.classList.toggle('brawling', scene === 'Brawl'); root.hidden = !scene; document.body.classList.toggle('playing', !!scene);
    touchInput.reset(); releaseStick(); for (const button of buttons.values()) button.classList.remove('held'); game.scale.refresh();
  };
  game.events.on('poststep', update);
  const blur = () => { touchInput.reset(); releaseStick(); };
  window.addEventListener('blur', blur);
  game.events.once('destroy', () => { root.remove(); fps.remove(); mute.remove(); window.removeEventListener('blur', blur); game.events.off('poststep', update); });
}
