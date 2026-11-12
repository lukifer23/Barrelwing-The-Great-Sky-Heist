import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { addPanel } from '../ui/Menu';

export class CreditsScene extends Phaser.Scene {
  private from = 'Title';

  constructor() { super('Credits'); }

  init(data: { from?: string }): void { this.from = data?.from ?? 'Title'; }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.84).setOrigin(0);
    addPanel(this, 240, 136, 376, 230, 0x141a2e, 0.99, 0xc8b48a);
    this.add.text(240, 38, 'CREDITS', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#f4e6c8',
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 0, true, true);

    const left: [string, string][] = [
      ['ART', ''],
      ['SunnyLand Forest', 'Ansimuz · CC0'],
      ['SunnyLand Woods', 'Ansimuz · CC0'],
      ['SunnyLand Tall Forest', 'Ansimuz · CC0'],
      ['Sideview Fantasy', 'Ansimuz · CC0'],
      ['Kenney Platformer', 'Kenney.nl · CC0'],
      ['Pixel Platformer Industrial', 'Kenney.nl · CC0'],
      ['', ''],
      ['MUSIC', ''],
      ['Forest theme', 'Louswan · CC0'],
      ['Mechanical Complex', 'HydroGene · CC0'],
      ['Battle theme', 'pmiller · CC0'],
      ['Action Chiptunes', 'Juhani Junkala · CC0'],
    ];
    left.forEach(([a, b], i) => {
      const y = 60 + i * 11;
      this.add.text(72, y, a, {
        fontFamily: FONT_SMALL, fontSize: '6px', color: b ? '#f4e6c8' : '#f0c060',
      });
      if (b) this.add.text(250, y, b, {
        fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
      });
    });

    this.add.text(GAME_WIDTH / 2, 212, 'SOUND EFFECTS: KENNEY + SUNNYLAND DEMO (CC0)', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 224, 'FONT: PRESS START 2P & SILKSCREEN — SIL OFL', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 238, 'MADE WITH PHASER 4 · TYPESCRIPT · VITE', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#8a93b2',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 252, 'ESC / ENTER — BACK', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060',
    }).setOrigin(0.5);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.close();
    };
    this.input.once('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  private close(): void {
    AudioManager.sfx('ui_move', { volume: 0.4 });
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
