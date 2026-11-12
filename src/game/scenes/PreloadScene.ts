import Phaser from 'phaser';
import { ANIMS, BOSS_SHEETS, IMAGES, MUSIC, SHEETS, SFX } from '../data/assets';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }

  preload(): void {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.cameras.main.setBackgroundColor('#0b1020');

    this.add.text(cx, cy - 52, 'BARRELWING', {
      fontFamily: '"Press Start 2P"', fontSize: '20px', color: '#f4e6c8',
    }).setOrigin(0.5).setShadow(3, 3, '#000000', 0, true, true);
    this.add.text(cx, cy - 26, 'THE GREAT SKY HEIST', {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f0c060',
    }).setOrigin(0.5);

    const frame = this.add.rectangle(cx, cy + 12, 244, 12, 0x101528).setStrokeStyle(1, 0x6b5a3a);
    const bar = this.add.rectangle(cx - 119, cy + 12, 0, 8, 0xf0c060).setOrigin(0, 0.5);
    const label = this.add.text(cx, cy + 30, 'LOADING THE CANOPY…', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    }).setOrigin(0.5);

    const hints = ['WAKING THE WINDTAIL', 'STACKING THE BARRELS', 'OILING THE COGS', 'RAISING THE STORM'];
    this.load.on('progress', (p: number) => {
      bar.width = 238 * p;
      label.setText(hints[Math.min(hints.length - 1, Math.floor(p * hints.length))] + '…');
    });

    for (const [key, path] of Object.entries(IMAGES)) this.load.image(key, path);
    for (const s of [...SHEETS, ...BOSS_SHEETS]) this.load.spritesheet(s.key, s.path, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
    for (const [key, path] of Object.entries(MUSIC)) this.load.audio('music_' + key, path);
    for (const [key, path] of Object.entries(SFX)) this.load.audio('sfx_' + key, path);

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error('Asset failed to load:', file.key, file.src);
    });
  }

  create(): void {
    for (const a of ANIMS) {
      if (this.anims.exists(a.key)) continue;
      this.anims.create({
        key: a.key,
        frames: this.anims.generateFrameNumbers(a.sheet, { start: a.start, end: a.end }),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }
    // small fade + drop the HTML boot splash
    document.getElementById('boot')?.classList.add('hidden');
    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.time.delayedCall(280, () => this.scene.start('Title'));
  }
}
