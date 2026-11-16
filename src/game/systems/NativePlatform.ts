import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type Phaser from 'phaser';
import { SaveManager } from './SaveManager';

export async function installNativePlatform(game: Phaser.Game): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  document.body.classList.add('native');
  const pauseAndSave = async () => {
    for (const key of ['Game', 'Brawl', 'SkySprint']) {
      const scene = game.scene.getScene(key) as (Phaser.Scene & { pauseForApp(): void }) | null;
      if (scene?.scene.isActive()) scene.pauseForApp();
    }
    SaveManager.save();
    await SaveManager.flush().catch(() => undefined);
  };
  // Android emits pause from Activity.onPause; appStateChange waits for onStop,
  // whose notification can arrive after the WebView returns to the foreground.
  await App.addListener('pause', pauseAndSave);
  await App.addListener('appStateChange', async ({ isActive }) => { if (!isActive) await pauseAndSave(); });
  await App.addListener('backButton', () => {
    const active = game.scene.getScenes(true).at(-1);
    if (!active) return;
    // Send through each scene's existing navigation logic.
    active.input.keyboard?.emit('keydown', new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    if (['Game', 'Brawl', 'SkySprint'].includes(active.scene.key)) (active as Phaser.Scene & { pauseForApp(): void }).pauseForApp();
  });
}
