import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { Menu } from '../ui/Menu';
import type { GameScene } from './GameScene';
import { SaveManager } from '../systems/SaveManager';

export class GameOverScene extends Phaser.Scene {
  private data_!: { levelId: number; name: string; score: number };
  constructor() { super('GameOver'); }
  init(data: GameOverScene['data_']): void { this.data_ = data; }
  create(): void {
    this.add.rectangle(0, 0, 480, 270, 0x05070d, 0.94).setOrigin(0);
    this.add.text(240, 56, 'GAME OVER', { fontFamily: '"Press Start 2P"', fontSize: '22px', color: '#e4546a' }).setOrigin(0.5);
    this.add.text(240, 85, this.data_.name.toUpperCase(), { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f4e6c8' }).setOrigin(0.5);
    this.add.text(240, 104, `SCORE ${this.data_.score.toLocaleString('en-US')}`, { fontFamily: FONT_SMALL, fontSize: '9px', color: '#9fb0d0' }).setOrigin(0.5);
    const menu = new Menu(this, [
      { label: `CONTINUE (${SaveManager.stats.startingLives} LIVES)`, action: () => {
        const game = this.scene.get('Game') as GameScene;
        game.continueAfterGameOver(); this.scene.resume('Game'); this.scene.stop();
      } },
      { label: 'WORLD MAP', action: () => { this.scene.stop('Game'); this.scene.start('WorldMap', { trials: this.data_.levelId >= 10 }); } },
      { label: 'TITLE SCREEN', action: () => { this.scene.stop('Game'); this.scene.start('Title'); } },
    ], { x: 240, y: 145, spacing: 30, fontSize: '11px', showHints: false });
    this.add.text(240, 239, 'CONTINUE RESETS ATTEMPT SCORE AND TIMER', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#8a93b2' }).setOrigin(0.5);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { this.scene.stop('Game'); this.scene.start('WorldMap', { trials: this.data_.levelId >= 10 }); }
      else menu.handleKey(e);
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }
}
