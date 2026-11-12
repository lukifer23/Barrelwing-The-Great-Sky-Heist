import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type Phaser from 'phaser';
import { SaveManager } from './SaveManager';

export async function installNativePlatform(game: Phaser.Game): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  document.body.classList.add('native');
  await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      const scene = game.scene.getScene('Game') as Phaser.Scene & { persistRun(): void; pauseForApp(): void };
      if (scene.scene.isActive()) { scene.persistRun(); scene.pauseForApp(); }
      const brawl = game.scene.getScene('Brawl') as Phaser.Scene & { pauseForApp(): void };
      if (brawl.scene.isActive()) brawl.pauseForApp();
      const sprint = game.scene.getScene('SkySprint') as Phaser.Scene & { pauseForApp(): void };
      if (sprint.scene.isActive()) sprint.pauseForApp();
      SaveManager.save();
    }
  });
  await App.addListener('backButton', () => {
    const active = game.scene.getScenes(true).at(-1);
    if (!active) return;
    // Send through each scene's existing navigation logic.
    active.input.keyboard?.emit('keydown', new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    if (['Game', 'Brawl', 'SkySprint'].includes(active.scene.key)) (active as Phaser.Scene & { pauseForApp(): void }).pauseForApp();
  });
}
