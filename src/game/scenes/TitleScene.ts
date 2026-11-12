import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { Menu, addPanel } from '../ui/Menu';

export class TitleScene extends Phaser.Scene {
  private menu!: Menu;
  private clouds: Phaser.GameObjects.TileSprite[] = [];
  private pip!: Phaser.GameObjects.Sprite;
  private gem!: Phaser.GameObjects.Image;
  private barrels: Phaser.GameObjects.Image[] = [];
  private modal: Phaser.GameObjects.Container | null = null;
  private floorY = 0;
  private pipX = 0;
  private gemY = 0;
  private startedMusic = false;
  private readonly resize = () => { if (this.scene.isActive()) this.scene.restart(); };

  constructor() { super('Title'); }

  create(): void {
    this.clouds = []; this.barrels = []; this.modal = null; this.startedMusic = false;
    const { width: W, height: H } = this.scale.gameSize;
    this.cameras.main.setSize(W, H).setScroll(0, 0).setBackgroundColor('#87c6e8');
    this.floorY = H - Math.max(30, H * 0.15);
    this.pipX = Math.min(92, W * 0.18);
    this.gemY = H * 0.48;
    this.buildBackdrop(W, H);
    this.buildLogo(W, H);
    this.buildMenu(W, H);
    this.add.text(10, H - 8, window.matchMedia('(pointer: coarse)').matches ? 'TAP TO PLAY. ACORNS SOLD SEPARATELY.' : 'ENTER SELECT  ·  ARROWS MOVE  ·  M MUTE  ·  F FULLSCREEN', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#e8dcc0',
    }).setOrigin(0, 1).setDepth(12);
    this.add.text(W - 8, H - 8, 'v1.1', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#e8dcc0' }).setOrigin(1, 1).setDepth(12);

    const startMusic = () => {
      if (this.startedMusic) return;
      this.startedMusic = true; AudioManager.playMusic('title', { fade: 500 });
    };
    this.input.once('pointerdown', startMusic);
    this.input.keyboard?.once('keydown', startMusic);
    this.time.delayedCall(120, () => { if (!this.game.sound.locked) startMusic(); });
    const onKey = (e: KeyboardEvent) => { if (!this.modal) this.menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resize);
      this.input.keyboard?.off('keydown', onKey);
      this.input.keyboard?.off('keydown', startMusic);
      this.input.removeAllListeners();
    });
  }

  private buildBackdrop(W: number, H: number): void {
    const sky = this.add.graphics().setDepth(-50);
    sky.fillGradientStyle(0x2f5f8a, 0x4f86a8, 0x9fc6c4, 0xf0d9a8, 1).fillRect(0, 0, W, H);
    const layer = (key: string, alpha: number, depth: number, tint = 0xffffff) => {
      const image = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const scale = Math.max(1, H / image.height);
      const plate = this.add.tileSprite(0, 0, W, H, key).setOrigin(0).setDepth(depth).setAlpha(alpha).setTint(tint).setTileScale(scale);
      this.clouds.push(plate);
    };
    layer('bg_forest_clouds', 0.55, -40);
    layer('bg_forest_mountains', 0.55, -36);
    layer('bg_forest_mid', 0.25, -35);
    layer('bg_forest_trees', 0.82, -34, 0x6a8a6a);
    this.add.tileSprite(0, this.floorY, W, 32, 'forest_top').setOrigin(0).setDepth(3);
    if (H > this.floorY + 32) this.add.tileSprite(0, this.floorY + 32, W, H - this.floorY - 32, 'forest_fill').setOrigin(0).setDepth(2);
    this.add.image(this.pipX, this.floorY - 6, 'branch3').setOrigin(0.5, 0.78).setDepth(4);
    for (const x of [W * 0.47, W * 0.52, W * 0.57]) this.barrels.push(this.add.image(x, this.floorY - 8, 'barrel').setDepth(5));
    this.pip = this.add.sprite(this.pipX, this.floorY - 9, 'pip', 0).setOrigin(0.5, 1).setScale(1.15).setDepth(7).play('pip-idle');
    this.gem = this.add.image(W * 0.31, this.gemY, 'gem_blue').setScale(1.15).setDepth(6);
    const glow = this.add.image(W * 0.31, this.gemY, 'fx_glow').setTint(0x9fe9ff).setAlpha(0.3).setScale(1.6).setDepth(5);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 1400, yoyo: true, repeat: -1 });
    this.add.particles(0, 0, 'fx_glow', {
      x: { min: 0, max: W }, y: { min: H * 0.45, max: this.floorY }, lifespan: { min: 3000, max: 6000 },
      speedX: { min: -6, max: 14 }, speedY: { min: -12, max: -3 }, scale: { start: 0.12, end: 0 },
      alpha: { start: 0.35, end: 0 }, frequency: 380, tint: [0xffe9a0, 0xbfe8a0],
    }).setDepth(8);
  }

  private buildLogo(W: number, H: number): void {
    const y = Math.max(42, Math.min(90, H * 0.17));
    this.add.text(W / 2, y, 'BARRELWING', {
      fontFamily: '"Press Start 2P"', fontSize: '23px', color: '#f8ecc9', stroke: '#4b2f1a', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11).setShadow(3, 3, '#1a1020', 0, true, true);
    this.add.rectangle(W / 2, y + 24, Math.min(W - 60, 300), 2, 0x6b4a2a).setDepth(10);
    this.add.text(W / 2, y + 37, 'THE GREAT SKY HEIST', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060' }).setOrigin(0.5).setDepth(11).setShadow(1, 1, '#1a1020', 0, true, true);
    for (const x of [W / 2 - 194, W / 2 + 194]) this.add.sprite(x, y + 7, 'acorn', 0).play('acorn-spin').setDepth(10);
  }

  private buildMenu(W: number, H: number): void {
    const save = SaveManager.get();
    const hasSave = SaveManager.hasProgress();
    const items = [
      { label: hasSave ? 'CONTINUE' : 'NEW GAME', action: () => hasSave ? this.continueGame() : this.startNewGame() },
      ...(hasSave ? [{ label: 'NEW GAME', action: () => this.confirmNewGame() }] : []),
      { label: 'LEVEL SELECT', action: () => this.scene.start('WorldMap') },
      ...(save.completedGame ? [{ label: 'SKY TRIALS', action: () => this.scene.start('WorldMap', { trials: true }) }] : []),
      { label: save.bonusUnlocked ? 'SKY SPRINT' : 'SKY SPRINT [LOCKED]', disabled: !save.bonusUnlocked, action: () => this.scene.start('SkySprint') },
      { label: 'BARREL BRAWL', action: () => this.scene.start('BrawlSetup') },
      { label: 'COURIERS', action: () => this.openOverlay('Characters') },
      { label: 'CONTROLS', action: () => this.openOverlay('Controls') },
      { label: 'SETTINGS', action: () => this.openOverlay('Settings') },
      { label: 'CREDITS', action: () => this.openOverlay('Credits') },
    ];
    const tall = H / W > 1.2;
    const top = tall ? H * 0.30 : Math.max(102, Math.min(160, H * 0.37));
    const spacing = tall ? Math.max(30, Math.min(52, (H - top - 80) / items.length)) : Math.max(14, Math.min(30, (H - top - 36) / items.length));
    const x = tall ? W / 2 : W * 0.61;
    const panelW = tall ? W * 0.76 : Math.min(200, W - x - 10);
    const panelH = spacing * items.length + 8;
    this.add.rectangle(tall ? x - panelW / 2 - 10 : x - 14, top - spacing / 2 - 4, panelW + 20, panelH, 0x101528, 0.9).setOrigin(0).setStrokeStyle(1, 0x6b5a3a).setDepth(9);
    this.menu = new Menu(this, items, { x, y: top, spacing, align: tall ? 'center' : 'left', fontSize: tall ? '16px' : '9px', showHints: false, depth: 12 });
  }

  private continueGame(): void {
    const run = SaveManager.get().run;
    if (run) this.scene.start('Game', { levelId: run.levelId, resume: true }); else this.scene.start('WorldMap');
  }
  private startNewGame(): void { SaveManager.resetProgress(); AudioManager.stopMusic(300); this.scene.start('Game', { levelId: 1 }); }

  private confirmNewGame(): void {
    if (this.modal) return;
    const W = this.scale.width, H = this.scale.height;
    const c = this.add.container(0, 0).setDepth(300); this.modal = c;
    const dim = this.add.rectangle(0, 0, W, H, 0x05070d, 0.8).setOrigin(0);
    const panel = addPanel(this, W / 2, H / 2, 340, 116, 0x141a2e, 1, 0xc98a52);
    const title = this.add.text(W / 2, H / 2 - 34, 'START OVER?', { fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#f0c060' }).setOrigin(0.5);
    const body = this.add.text(W / 2, H / 2 - 10, 'Progress, gems and upgrades will be erased.', { fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0' }).setOrigin(0.5);
    const yes = this.add.text(W / 2 - 76, H / 2 + 28, 'START OVER', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#9fb0d0', padding: { x: 12, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const no = this.add.text(W / 2 + 76, H / 2 + 28, 'CANCEL', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060', padding: { x: 12, y: 10 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add([dim, panel, title, body, yes, no]);
    let selection = 1;
    const close = () => { this.input.keyboard?.off('keydown', key); c.destroy(); this.modal = null; };
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { selection = 1 - selection; yes.setColor(selection === 0 ? '#f0c060' : '#9fb0d0'); no.setColor(selection === 1 ? '#f0c060' : '#9fb0d0'); }
      else if (e.key === 'Enter' || e.key === ' ') { close(); if (selection === 0) this.startNewGame(); }
    };
    yes.on('pointerdown', () => { close(); this.startNewGame(); }); no.on('pointerdown', close);
    this.input.keyboard?.on('keydown', key);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', key));
  }

  private openOverlay(key: 'Controls' | 'Settings' | 'Credits' | 'Characters'): void { this.scene.pause(); this.scene.launch(key, { from: 'Title' }); }

  override update(time: number, delta: number): void {
    this.clouds.forEach((plate, i) => { plate.tilePositionX += delta * (0.003 + i * 0.004); });
    this.pip.y = this.floorY - 9 + Math.sin(time / 700) * 1.5;
    this.gem.y = this.gemY + Math.sin(time / 750) * 4;
    this.barrels.forEach((barrel, i) => { barrel.y = this.floorY - 8 + Math.sin(time / 800 + i); barrel.angle = Math.sin(time / 900 + i) * 4; });
  }
}
