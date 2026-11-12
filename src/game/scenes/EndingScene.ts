import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { Menu } from '../ui/Menu';

interface EndingData {
  score: number;
  timeMs: number;
  gems: boolean[];
}

export class EndingScene extends Phaser.Scene {
  private ending!: EndingData;
  private stage = 0;
  private sky!: Phaser.GameObjects.TileSprite;
  private overlay!: Phaser.GameObjects.Rectangle;
  private credits?: Phaser.GameObjects.Container;

  constructor() { super('Ending'); }

  init(data: EndingData): void {
    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.ending = data ?? { score: 0, timeMs: 0, gems: [] };
    this.stage = 0;
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0f1c).setOrigin(0);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x141b3d).setOrigin(0);
    this.sky = this.add.tileSprite(0, 0, GAME_WIDTH, 240, 'bg_storm_sky').setOrigin(0);
    this.add.tileSprite(0, 60, GAME_WIDTH, 210, 'bg_clouds').setOrigin(0).setAlpha(0.4);
    this.add.tileSprite(0, 150, GAME_WIDTH, 130, 'bg_forest_trees').setOrigin(0).setAlpha(0.5);
    this.overlay = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x2a1a2e, 0.55).setOrigin(0);

    AudioManager.stopMusic(500);
    AudioManager.playMusic('ending', { fade: 900 });

    // dawn breaks in
    this.tweens.add({ targets: this.overlay, alpha: 0, duration: 5000, ease: 'Sine.easeOut' });

    const seq = [
      { at: 400, text: 'THE SKY SEEDS RETURN', sub: 'The roots remember how to hold the sky.' },
      { at: 2600, text: 'THE CLOUDS PART', sub: 'Sunlight finds the forest again.' },
      { at: 4700, text: 'PIP MADE IT HOME', sub: 'The courier. The wind. The great sky heist.' },
    ];
    for (const s of seq) {
      this.time.delayedCall(s.at, () => this.showCard(s.text, s.sub));
    }
    this.time.delayedCall(6600, () => this.showFinale());
  }

  private showCard(title: string, sub: string): void {
    const t = this.add.text(GAME_WIDTH / 2, 104, title, {
      fontFamily: '"Press Start 2P"', fontSize: '15px', color: '#f4e6c8',
    }).setOrigin(0.5).setDepth(10).setShadow(2, 2, '#000000', 0, true, true).setAlpha(0);
    const s = this.add.text(GAME_WIDTH / 2, 126, sub, {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f0d8a0',
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: [t, s], alpha: 1, y: '-=4', duration: 500 });
    this.tweens.add({ targets: [t, s], alpha: 0, delay: 1900, duration: 600, onComplete: () => { t.destroy(); s.destroy(); } });

    const em = this.add.particles(GAME_WIDTH / 2, 90, 'fx_spark', {
      lifespan: 1500, speed: { min: 20, max: 90 }, angle: { min: 200, max: 340 },
      gravityY: 40, scale: { start: 0.7, end: 0 }, alpha: { start: 0.8, end: 0 },
      frequency: 30, tint: [0xffe9a0, 0x9fe9ff, 0xf4e6c8],
    }).setDepth(9);
    this.time.delayedCall(1000, () => em.stop());
  }

  private showFinale(): void {
    const pip = this.add.sprite(GAME_WIDTH / 2, 196, 'pip', 0).setOrigin(0.5, 1).setScale(1.4).setDepth(12);
    pip.play('pip-idle');
    this.add.image(GAME_WIDTH / 2, 198, 'branch3').setOrigin(0.5, 0.7).setDepth(11).setScale(1.2);
    const title = this.add.text(GAME_WIDTH / 2, 62, 'BARRELWING', {
      fontFamily: '"Press Start 2P"', fontSize: '20px', color: '#f8ecc9',
    }).setOrigin(0.5).setDepth(12).setShadow(3, 3, '#1a1020', 0, true, true);
    const sub = this.add.text(GAME_WIDTH / 2, 84, 'THE GREAT SKY HEIST', {
      fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060',
    }).setOrigin(0.5).setDepth(12);

    const d = SaveManager.get();
    const total = Object.entries(d.levels).filter(([id]) => Number(id) <= 9).map(([, record]) => record).reduce((n, l) => n + (l.completed ? l.bestScore : 0), 0);
    const gems = Object.entries(d.levels).filter(([id]) => Number(id) <= 9).map(([, record]) => record).reduce((n, l) => n + l.gems.filter(Boolean).length, 0);
    const all = Object.entries(d.levels).filter(([id]) => Number(id) <= 9).map(([, record]) => record).filter(l => l.completed).length;
    const summary = this.add.text(GAME_WIDTH / 2, 112, [
      `STAGES CLEARED   ${all} / 9`,
      `SKY GEMS         ${gems} / 27`,
      `TOTAL SCORE      ${total.toLocaleString('en-US')}`,
      `SKY SPRINT BEST  ${d.bonusBest.toLocaleString('en-US')}`,
    ].join('\n'), {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#e8dcc0', align: 'center', lineSpacing: 5,
    }).setOrigin(0.5).setDepth(12);

    this.tweens.add({ targets: pip, y: 190, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.time.delayedCall(500, () => this.showCreditsRoll());
  }

  private showCreditsRoll(): void {
    const c = this.add.container(0, 0).setDepth(20);
    this.credits = c;
    const lines = [
      'BARRELWING',
      'THE GREAT SKY HEIST',
      '',
      'A game built with Phaser 4 + TypeScript',
      '',
      'ART',
      'SunnyLand Forest — Ansimuz (CC0)',
      'SunnyLand Woods — Ansimuz (CC0)',
      'Sideview Fantasy Collection — Ansimuz (CC0)',
      'Kenney New Platformer Pack — Kenney (CC0)',
      'Kenney Pixel Platformer Industrial — Kenney (CC0)',
      '',
      'MUSIC',
      'Louswan · HydroGene · pmiller · Juhani Junkala (CC0)',
      '',
      'SOUND',
      'Kenney + SunnyLand demo SFX (CC0)',
      '',
      'CODE & DESIGN',
      'Original world, characters and level design',
      '',
      'THANK YOU FOR PLAYING',
    ];
    const text = this.add.text(GAME_WIDTH / 2, 0, lines.join('\n'), {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#e8dcc0', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0);
    c.add(text);
    text.y = GAME_HEIGHT + 4;
    this.add.rectangle(0, 0, GAME_WIDTH, 26, 0x0a0f1c, 0.85).setOrigin(0).setDepth(21);
    const skip = this.add.text(GAME_WIDTH - 8, 8, 'ESC — SKIP', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
    }).setOrigin(1, 0).setDepth(22).setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.tweens.killTweensOf(text); this.openMenu(); });

    const totalHeight = text.height + GAME_HEIGHT;
    this.tweens.add({
      targets: text, y: -text.height - 10, duration: 26000, ease: 'Linear',
      onComplete: () => this.openMenu(),
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.tweens.killTweensOf(text);
        this.openMenu();
      }
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  private openMenu(): void {
    if (this.credits?.getData('done')) return;
    this.credits?.setData('done', true);
    this.credits?.destroy();
    const panel = this.add.rectangle(240, 160, 300, 116, 0x101528, 0.95).setStrokeStyle(2, 0x6b5a3a).setDepth(30);
    this.add.text(240, 126, 'THE END', {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#f0c060',
    }).setOrigin(0.5).setDepth(31);
    const items = [
      { label: 'WORLD MAP', action: () => this.scene.start('WorldMap') },
      { label: 'SKY TRIALS', action: () => this.scene.start('WorldMap', { trials: true }) },
      { label: 'SKY SPRINT', action: () => this.scene.start('SkySprint') },
      { label: 'TITLE SCREEN', action: () => this.scene.start('Title') },
    ];
    const menu = new Menu(this, items, { x: 240, y: 140, spacing: 16, align: 'center', fontSize: '7px', showHints: false, depth: 32 });
    const onKey = (e: KeyboardEvent) => menu.handleKey(e);
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  override update(_t: number, delta: number): void {
    this.sky.tilePositionX += delta * 0.003;
  }
}
