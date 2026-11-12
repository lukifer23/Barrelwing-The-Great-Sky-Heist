import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager';
import { createFxTextures } from '../ui/fx-textures';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#070a14');
    createFxTextures(this);

    const ready = async () => {
      try {
        await SaveManager.initialize();
        await Promise.all([
          document.fonts.load('12px "Press Start 2P"'),
          document.fonts.load('8px Silkscreen'),
        ]);
        await document.fonts.ready;
      } catch {
        /* fonts still render with a fallback */
      }
      this.scene.start('Preload');
    };
    void ready();
  }
}
