import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { addPanel } from '../ui/Menu';

export class ControlsScene extends Phaser.Scene {
  private from = 'Title';

  constructor() { super('Controls'); }

  init(data: { from?: string }): void { this.from = data?.from ?? 'Title'; }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.82).setOrigin(0);
    addPanel(this, 240, 136, 356, 226, 0x141a2e, 0.99, 0xc8b48a);
    this.add.text(240, 40, 'CONTROLS', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#f4e6c8',
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 0, true, true);
    this.add.text(240, 56, 'KEYBOARD FIRST. NO MOUSE REQUIRED.', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
    }).setOrigin(0.5);

    const rows: [string, string][] = [
      ['A / D  or  ← / →', 'RUN'],
      ['SPACE', 'JUMP  ·  HOLD FOR HEIGHT'],
      ['SPACE IN AIR', 'WINDTAIL FLAP (2 CHARGES)'],
      ['W / S  or  ↑ / ↓', 'CLIMB VINES  ·  DROP THROUGH'],
      ['J', 'DASH — SMASHES WOODEN BARRELS'],
      ['R', 'RESTART FROM CHECKPOINT'],
      ['ESC / P', 'PAUSE'],
      ['M', 'MUTE'],
      ['F', 'FULLSCREEN'],
      ['ENTER', 'CONFIRM'],
    ];
    rows.forEach((r, i) => {
      const y = 74 + i * 14;
      this.add.text(96, y, r[0], {
        fontFamily: FONT_SMALL, fontSize: '8px', color: '#f0c060',
      }).setOrigin(0, 0.5);
      this.add.text(246, y, r[1], {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#f4e6c8',
      }).setOrigin(0, 0.5);
    });

    this.add.text(240, 226, 'DODGE BARRELS · CLIMB TOWERS · RIDE THE WIND', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#8a93b2',
    }).setOrigin(0.5);
    this.add.text(240, 242, 'ESC / ENTER  —  BACK', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    }).setOrigin(0.5);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.close();
    };
    this.input.keyboard?.on('keydown', onKey);
    this.input.once('pointerdown', () => this.close());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  private close(): void {
    AudioManager.sfx('ui_move', { volume: 0.4 });
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
