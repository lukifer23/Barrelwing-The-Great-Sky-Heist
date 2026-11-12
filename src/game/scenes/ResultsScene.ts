import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import { RATING_COLORS, RATING_LABELS } from '../data/levels/types';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { Menu } from '../ui/Menu';

interface ResultsData {
  levelId: number;
  score: number;
  timeMs: number;
  gems: [boolean, boolean, boolean];
  rating: 1 | 2 | 3;
  bonus: number;
  newBest?: boolean;
}

export class ResultsScene extends Phaser.Scene {
  private result!: ResultsData;

  constructor() { super('Results'); }

  init(data: ResultsData): void { this.result = data; }

  create(): void {
    this.cameras.main.fadeIn(280, 0, 0, 0);
    const level = LEVELS.find(l => l.id === this.result.levelId)!;
    const next = LEVELS.find(l => l.id === this.result.levelId + 1);
    const d = this.result;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0f1c).setOrigin(0);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, level.theme === 'factory' ? 'bg_factory_sky' : level.theme === 'storm' ? 'bg_storm_sky' : 'bg_forest_sky')
      .setOrigin(0).setAlpha(0.5);
    this.add.tileSprite(0, 120, GAME_WIDTH, 150, 'bg_clouds').setOrigin(0).setAlpha(0.16);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0f1c, 0.55).setOrigin(0);

    const panel = this.add.rectangle(240, 142, 340, 218, 0x101528, 0.95).setStrokeStyle(2, 0x6b5a3a);
    this.add.text(240, 48, 'STAGE CLEAR', {
      fontFamily: '"Press Start 2P"', fontSize: '18px', color: '#f0c060',
    }).setOrigin(0.5).setShadow(3, 3, '#000000', 0, true, true);
    if (this.result.newBest) {
      const nb = this.add.text(240, 84, '★ NEW BEST ★', {
        fontFamily: FONT_SMALL, fontSize: '8px', color: '#f0c060',
      }).setOrigin(0.5).setDepth(4);
      this.tweens.add({ targets: nb, alpha: 0.35, duration: 500, yoyo: true, repeat: 3 });
    }
    this.add.text(240, 68, level.name.toUpperCase(), {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
    }).setOrigin(0.5);

    const rows: [string, string][] = [
      ['SCORE', d.score.toLocaleString('en-US')],
      ['TIME', this.formatTime(d.timeMs)],
      ['GEMS', `${d.gems.filter(Boolean).length} / 3`],
      ['CLEAR BONUS', `+${d.bonus.toLocaleString('en-US')}`],
      ['BEST', (SaveManager.get().levels[level.id]?.bestScore ?? d.score).toLocaleString('en-US')],
    ];
    rows.forEach((r, i) => {
      this.add.text(112, 92 + i * 14, r[0], {
        fontFamily: FONT_SMALL, fontSize: '8px', color: '#9fb0d0',
      });
      this.add.text(368, 92 + i * 14, r[1], {
        fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
      }).setOrigin(1, 0);
    });

    // gems visual
    for (let i = 0; i < 3; i++) {
      this.add.image(150 + i * 18, 170, 'ui_gem').setScale(0.9).setAlpha(d.gems[i] ? 1 : 0.2);
    }

    const rating = this.add.text(300, 168, RATING_LABELS[d.rating], {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: RATING_COLORS[d.rating],
    }).setOrigin(0.5);
    this.add.text(300, 182, 'RATING', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
    }).setOrigin(0.5);

    // celebratory particles
    const em = this.add.particles(240, 90, 'fx_spark', {
      lifespan: 1400, speed: { min: 30, max: 140 }, angle: { min: 200, max: 340 },
      gravityY: 90, scale: { start: 0.8, end: 0 }, alpha: { start: 0.9, end: 0 },
      frequency: 60, tint: [0xf0c060, 0xf4e6c8, 0x9fe9ff],
    }).setDepth(3);
    this.time.delayedCall(1400, () => em.stop());

    const items = [
      ...(next && SaveManager.isLevelAvailable(next.id) ? [{
        label: 'NEXT STAGE', hint: next.name, action: () => { AudioManager.stopMusic(200); this.scene.start('Game', { levelId: next.id }); },
      }] : []),
      { label: 'REPLAY', hint: 'Score attack', action: () => this.scene.start('Game', { levelId: level.id }) },
      { label: level.id >= 10 ? 'SKY TRIALS' : 'WORLD MAP', hint: 'Return to the map', action: () => this.scene.start('WorldMap', { trials: level.id >= 10 }) },
      ...(level.id < 10 && SaveManager.get().completedGame ? [{ label: 'SKY TRIALS', hint: 'Post-campaign remixes', action: () => this.scene.start('WorldMap', { trials: true }) }] : []),
    ];
    const menu = new Menu(this, items, { x: 240, y: 198, spacing: 15, align: 'center', fontSize: '7px', showHints: false });

    const onKey = (e: KeyboardEvent) => menu.handleKey(e);
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    AudioManager.playMusic('title', { fade: 500 });
  }

  private formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
