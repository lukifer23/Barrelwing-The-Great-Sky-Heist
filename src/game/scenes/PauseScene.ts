import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { Menu, addPanel } from '../ui/Menu';

export class PauseScene extends Phaser.Scene {
  private levelId = 1;
  private music: 'forest' | 'factory' | 'storm' = 'forest';
  private menu!: Menu;
  private readyAt = 0;

  constructor() { super('Pause'); }

  init(data: { levelId: number; music: 'forest' | 'factory' | 'storm' }): void {
    this.levelId = data.levelId ?? 1;
    this.music = data.music ?? 'forest';
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.72).setOrigin(0);
    addPanel(this, 240, 136, 296, 200, 0x141a2e, 0.98, 0xc8b48a);
    this.add.text(240, 58, 'PAUSED', {
      fontFamily: '"Press Start 2P"', fontSize: '15px', color: '#f4e6c8',
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 0, true, true);
    this.add.text(240, 76, 'CATCH YOUR BREATH, COURIER', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    }).setOrigin(0.5);

    const items = [
      { label: 'RESUME', action: () => this.resumeGame() },
      { label: 'CHECKPOINT (-1 LIFE)', action: () => this.restartCheckpoint() },
      { label: 'RESTART LEVEL', action: () => this.restartLevel() },
      { label: 'CONTROLS', action: () => this.openOverlay('Controls') },
      { label: 'SETTINGS', action: () => this.openOverlay('Settings') },
      { label: 'RETURN TO MAP', action: () => this.returnTo('WorldMap') },
      { label: 'RETURN TO TITLE', action: () => this.returnTo('Title') },
    ];
    this.menu = new Menu(this, items, { x: 240, y: 102, spacing: 17, align: 'center', fontSize: '8px', showHints: false });
    this.readyAt = this.time.now + 240;

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || this.time.now < this.readyAt) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { this.resumeGame(); return; }
      this.menu.handleKey(e);
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  private resumeGame(): void {
    AudioManager.sfx('ui_confirm', { volume: 0.4 });
    this.scene.resume('Game');
    this.scene.stop();
  }

  private restartCheckpoint(): void {
    const game = this.scene.get('Game') as Phaser.Scene & { restartFromCheckpoint: () => void };
    this.scene.resume('Game');
    this.scene.stop();
    game.restartFromCheckpoint();
  }

  private restartLevel(): void {
    this.scene.stop('Game');
    this.scene.stop();
    this.scene.start('Game', { levelId: this.levelId });
  }

  private returnTo(key: 'WorldMap' | 'Title'): void {
    this.scene.stop('Game');
    this.scene.stop();
    this.scene.start(key, key === 'WorldMap' ? { trials: this.levelId >= 10 } : undefined);
  }

  private openOverlay(key: 'Controls' | 'Settings'): void {
    this.scene.pause();
    this.scene.launch(key, { from: 'Pause' });
  }
}
