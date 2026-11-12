import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Player } from '../player/Player';
import { InputManager } from '../systems/InputManager';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { Effects } from '../systems/Effects';
import { addPanel, Menu } from '../ui/Menu';

interface Gate {
  x: number;
  w: number;
  gapY: number;
  gapH: number;
  top: Phaser.GameObjects.TileSprite;
  bottom: Phaser.GameObjects.TileSprite;
  trimTop: Phaser.GameObjects.Rectangle;
  trimBottom: Phaser.GameObjects.Rectangle;
}

interface Coin {
  sprite: Phaser.GameObjects.Image;
  taken: boolean;
}

export class SkySprintScene extends Phaser.Scene {
  private player!: Player;
  private inputMgr!: InputManager;
  private fx!: Effects;
  private gates: Gate[] = [];
  private coins: Coin[] = [];
  private bg: Phaser.GameObjects.TileSprite[] = [];
  private clouds: Phaser.GameObjects.TileSprite[] = [];
  private state: 'ready' | 'playing' | 'over' = 'ready';
  private speed = 110;
  private score = 0;
  private distance = 0;
  private spawnTimer = 0;
  private nextGap = 110;
  private elapsed = 0;
  private hudScore!: Phaser.GameObjects.Text;
  private hudBest!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private startPrompt!: Phaser.GameObjects.Text;
  private readySub!: Phaser.GameObjects.Text;
  private lastFlap = 0;
  private flashTimer = 0;
  private overMenu?: Menu;

  private get viewWidth(): number { return this.scale.gameSize.width; }
  private get viewHeight(): number { return this.scale.gameSize.height; }

  constructor() { super('SkySprint'); }

  create(): void {
    this.state = 'ready';
    this.coinScore = 0; this.hearts = []; this.overMenu = undefined;
    this.flashTimer = 0; this.lastFlap = 0;
    this.gates = [];
    this.coins = [];
    this.bg = [];
    this.clouds = [];
    this.speed = 110;
    this.score = 0;
    this.distance = 0;
    this.spawnTimer = 0;
    this.nextGap = 110;
    this.elapsed = 0;

    this.buildBg();
    this.player = new Player(this, 112, 132);
    this.player.setFlightBounds(new Phaser.Geom.Rectangle(0, 56, this.viewWidth, this.viewHeight - 86));
    this.player.body.velocity.x = 0;
    this.player.maxHearts = 3; this.player.hearts = 3;
    this.player.body.setAllowGravity(false);
    this.inputMgr = new InputManager(this);
    this.fx = new Effects(this);

    this.buildHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    AudioManager.playMusic('sprint', { fade: 500 });
    this.events.on('sfx', (key: any, opts: any) => AudioManager.sfx(key, opts), this);
    this.events.on('fx-gust', (x: number, y: number, d: number, s: boolean) => this.fx.gust(x, y, d, s), this);
    this.events.on('fx-dust', (x: number, y: number, n: number) => this.fx.dust(x, y, n), this);
    this.events.on('fx-step', (x: number, y: number, d: number) => this.fx.step(x, y, d), this);
    this.events.on('fx-dash', (x: number, y: number, d: number) => this.fx.dash(x, y, d), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
      this.inputMgr.destroy();
      this.fx.destroy();
      for (const e of ['sfx', 'fx-gust', 'fx-dust', 'fx-step', 'fx-dash']) this.events.removeAllListeners(e);
    });
    this.input.on('pointerdown', () => { if (this.state === 'ready') this.startSprint(); });
    const onKey = (e: KeyboardEvent) => this.handleKey(e);
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  private resizeViewport(): void {
    this.cameras.main.setSize(this.viewWidth, this.viewHeight);
    this.player.setFlightBounds(new Phaser.Geom.Rectangle(0, 56, this.viewWidth, this.viewHeight - 86));
    this.hudBest.x = this.viewWidth - 12;
    for (const image of [...this.bg, ...this.clouds]) image.setSize(this.viewWidth, this.viewHeight);
    for (const g of this.gates) {
      g.gapY = Phaser.Math.Clamp(g.gapY, 50 + g.gapH / 2, this.viewHeight - 34 - g.gapH / 2);
      const topH = g.gapY - g.gapH / 2, botY = g.gapY + g.gapH / 2;
      g.top.setSize(g.w, topH); g.bottom.setY(botY).setSize(g.w, this.viewHeight - botY);
      g.trimTop.y = topH; g.trimBottom.y = botY;
    }
    if (this.state === 'ready') { this.startPrompt.x = this.viewWidth / 2; this.readySub.x = this.viewWidth / 2; }
  }

  private buildBg(): void {
    this.add.rectangle(0, 0, this.viewWidth, this.viewHeight, 0x0e1730).setOrigin(0);
    this.bg.push(this.add.tileSprite(0, 0, this.viewWidth, this.viewHeight, 'bg_storm_sky').setOrigin(0).setAlpha(0.8));
    this.clouds.push(
      this.add.tileSprite(0, 20, this.viewWidth, 150, 'bg_clouds').setOrigin(0).setAlpha(0.35),
      this.add.tileSprite(0, 110, this.viewWidth, 160, 'bg_storm_trees').setOrigin(0).setAlpha(0.2),
    );
    this.add.rectangle(0, 0, this.viewWidth, this.viewHeight, 0x0b1020, 0.25).setOrigin(0);
    this.add.particles(0, 0, 'fx_streak', {
      x: { min: this.viewWidth, max: this.viewWidth + 40 },
      y: { min: 10, max: this.viewHeight - 10 },
      lifespan: 900, speedX: { min: -220, max: -120 }, scaleX: { start: 1, end: 0.2 },
      alpha: { start: 0.35, end: 0 }, frequency: 70, tint: 0x9fd8ff,
    }).setDepth(2);
  }

  private buildHud(): void {
    addPanel(this, this.viewWidth / 2, 18, 460, 26, 0x101528, 0.55, 0x3a4460);
    for (let i = 0; i < 3; i++) {
      this.hearts.push(this.add.image(42 + i * 14, 18, 'ui_heart').setScale(0.9));
    }
    this.hudScore = this.add.text(120, 12, '0', {
      fontFamily: FONT_SMALL, fontSize: '9px', color: '#f4e6c8',
    });
    this.hudBest = this.add.text(this.viewWidth - 12, 12, `BEST ${SaveManager.get().bonusBest.toLocaleString('en-US')}`, {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060',
    }).setOrigin(1, 0);
    this.add.text(120, 24, 'DISTANCE + ACORNS', {
      fontFamily: FONT_SMALL, fontSize: '5px', color: '#8a93b2',
    });

    this.startPrompt = this.add.text(this.viewWidth / 2, 130, 'SPACE / TAP FLAP TO START', {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#f0c060',
    }).setOrigin(0.5).setDepth(30).setShadow(2, 2, '#000000', 0, true, true);
    this.tweens.add({ targets: this.startPrompt, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.readySub = this.add.text(this.viewWidth / 2, 152, 'SKY SPRINT  ·  ONE WIND  ·  NO FLOOR', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    }).setOrigin(0.5).setDepth(30);
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.state === 'ready' && (e.key === ' ' || e.key === 'Enter')) {
      this.startSprint();
      return;
    }
    if (this.state === 'over') {
      this.overMenu?.handleKey(e);
      return;
    }
    if (e.key === 'Escape') { this.quit(); }
  }

  private startSprint(): void {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.player.body.setAllowGravity(true);
    this.player.body.setVelocity(0, -150);
    this.inputMgr.consumeJump();
    this.startPrompt.destroy(); this.readySub.destroy();
    AudioManager.sfx('ui_confirm', { volume: 0.5 });
    this.spawnTimer = 1500;
    this.emitGate();
  }

  private quit(): void {
    if (this.state === 'playing') SaveManager.setBonusBest(this.score);
    AudioManager.stopMusic(250);
    this.scene.start('Title');
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.inputMgr.update(dt);
    if (this.inputMgr.pressedPause) { this.quit(); return; }
    if (this.state === 'ready' && this.inputMgr.jumpBufferMs > 0) this.startSprint();

    this.bg.forEach((b, i) => { b.tilePositionX += dt * (0.004 + i * 0.002); });
    this.clouds.forEach((c, i) => { c.tilePositionX += dt * (0.02 + i * 0.03) * (this.state === 'playing' ? 2 : 0.4); });

    if (this.state !== 'playing') {
      this.player.setY(132 + Math.sin(time / 700) * 4);
      this.player.body.velocity.x = 0;
      return;
    }

    this.elapsed += dt;
    this.speed = Math.min(195, 110 + this.elapsed / 900);
    this.distance += this.speed * (dt / 1000);
    this.score = Math.floor(this.distance / 6) + this.coinScore;

    // keep the courier anchored while the world scrolls
    this.player.body.velocity.x = 0;
    this.player.x = 112;
    this.player.updatePlayer(dt, this.inputMgr, []);

    this.player.body.velocity.x = 0;
    this.player.x = 112;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.emitGate();
      this.spawnTimer = 1500 - Math.min(450, this.elapsed / 90);
    }

    this.moveGates(dt);
    this.moveCoins(dt);
    this.checkCollisions();
    this.updateHearts();
    this.hudScore.setText(`${this.score.toLocaleString('en-US')}   ·   ${Math.floor(this.distance)}m`);

    this.flashTimer -= dt;
    if (this.flashTimer <= 0 && !SaveManager.get().settings.reducedMotion) {
      this.flashTimer = 4200 + Math.random() * 3000;
      const bolt = this.add.rectangle(Phaser.Math.Between(60, 420), 0, 2, this.viewHeight, 0xffffff, 0.0).setOrigin(0.5, 0);
      this.tweens.add({ targets: bolt, alpha: 0.5, duration: 60, yoyo: true, onComplete: () => bolt.destroy() });
      AudioManager.sfx('bump', { volume: 0.08, rate: 0.5 });
    }

    this.inputMgr.clearFrameFlags();
  }

  private coinScore = 0;

  private emitGate(): void {
    const gapH = Phaser.Math.Between(56, 78);
    const minY = 50 + gapH / 2;
    const maxY = this.viewHeight - 34 - gapH / 2;
    let gapY = Phaser.Math.Clamp(this.nextGap + Phaser.Math.Between(-36, 36), minY, maxY);
    this.nextGap = gapY;

    const x = this.viewWidth + 30;
    const w = 34;
    const topH = Math.max(4, gapY - gapH / 2);
    const botY = gapY + gapH / 2;
    const top = this.add.tileSprite(x, 0, w, topH, 'storm_fill').setOrigin(0.5, 0).setDepth(6);
    const bottom = this.add.tileSprite(x, botY, w, this.viewHeight - botY, 'storm_fill').setOrigin(0.5, 0).setDepth(6);
    const trimTop = this.add.rectangle(x, gapY - gapH / 2, w + 4, 4, 0xe4546a, 0.85).setDepth(7);
    const trimBottom = this.add.rectangle(x, gapY + gapH / 2, w + 4, 4, 0xe4546a, 0.85).setDepth(7);
    this.gates.push({ x, w, gapY, gapH, top, bottom, trimTop, trimBottom });

    // a coin trail inside the gap
    if (Math.random() < 0.7) {
      for (let i = 0; i < 3; i++) {
        const s = this.add.sprite(x - 30 - i * 22, gapY + Math.sin(i) * 6, 'acorn').setDepth(8);
        s.play('acorn-spin');
        this.coins.push({ sprite: s, taken: false });
      }
    }
  }

  private moveGates(dt: number): void {
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      const dx = this.speed * (dt / 1000);
      g.x -= dx;
      g.top.x = g.x; g.bottom.x = g.x;
      g.trimTop.x = g.x; g.trimBottom.x = g.x;
      if (g.x < -50) {
        g.top.destroy(); g.bottom.destroy(); g.trimTop.destroy(); g.trimBottom.destroy();
        this.gates.splice(i, 1);
      }
    }
  }

  private moveCoins(dt: number): void {
    const dx = this.speed * (dt / 1000);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.taken) continue;
      c.sprite.x -= dx;
      if (Math.abs(c.sprite.x - this.player.x) < 12 && Math.abs(c.sprite.y - (this.player.y - 12)) < 14) {
        c.taken = true;
        c.sprite.destroy();
        this.coins.splice(i, 1);
        this.coinScore += 25;
        this.fx.pickup(this.player.x, this.player.y - 10, 0xffd76a);
        AudioManager.sfx('coin', { volume: 0.35, rate: 1.1 });
      } else if (c.sprite.x < -20) {
        c.sprite.destroy();
        this.coins.splice(i, 1);
      }
    }
  }

  private checkCollisions(): void {
    if (this.player.isInvulnerable) return;
    const pb = this.player.body;
    const pr = new Phaser.Geom.Rectangle(pb.x + 3, pb.y + 3, pb.width - 6, pb.height - 6);
    for (const g of this.gates) {
      const topRect = new Phaser.Geom.Rectangle(g.x - g.w / 2, 0, g.w, g.gapY - g.gapH / 2 - 3);
      const botRect = new Phaser.Geom.Rectangle(g.x - g.w / 2, g.gapY + g.gapH / 2 + 3, g.w, this.viewHeight);
      if (Phaser.Geom.Intersects.RectangleToRectangle(pr, topRect) || Phaser.Geom.Intersects.RectangleToRectangle(pr, botRect)) {
        this.player.hearts--;
        this.player.paintInvulnerable();
        this.fx.shake(0.007, 160);
        this.fx.hit(this.player.x, this.player.y - 12, 0xff9a9a);
        AudioManager.sfx('hurt', { volume: 0.45, rate: 1.1 });
        this.updateHearts();
        if (this.player.hearts <= 0) this.gameOver();
        return;
      }
    }
  }

  private updateHearts(): void {
    this.hearts.forEach((h, i) => h.setVisible(i < this.player.hearts));
  }

  private gameOver(): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.player.controlLocked = true;
    this.player.dead = true;
    this.player.body.setAllowGravity(false);
    this.inputMgr.reset();
    this.player.body.velocity.set(0, -110);
    AudioManager.stopMusic(500);
    AudioManager.sfx('defeat', { volume: 0.5, rate: 0.7 });
    SaveManager.setBonusBest(this.score);
    this.hudBest.setText(`BEST ${SaveManager.get().bonusBest.toLocaleString('en-US')}`);

    this.time.delayedCall(500, () => {
      const dim = this.add.rectangle(0, 0, this.viewWidth, this.viewHeight, 0x05070d, 0.78).setOrigin(0).setDepth(50);
      addPanel(this, this.viewWidth / 2, 132, 280, 150, 0x141a2e, 0.98, 0xc8b48a).setDepth(51);
      this.add.text(this.viewWidth / 2, 78, 'SPRINT OVER', {
        fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#e4546a',
      }).setOrigin(0.5).setDepth(52).setShadow(2, 2, '#000000', 0, true, true);
      this.add.text(this.viewWidth / 2, 104, `SCORE ${this.score.toLocaleString('en-US')}   ·   ${Math.floor(this.distance)}m`, {
        fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
      }).setOrigin(0.5).setDepth(52);
      this.add.text(this.viewWidth / 2, 118, `BEST ${SaveManager.get().bonusBest.toLocaleString('en-US')}`, {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060',
      }).setOrigin(0.5).setDepth(52);
      const items = [
        { label: 'FLY AGAIN', action: () => this.scene.restart() },
        { label: 'WORLD MAP', action: () => this.scene.start('WorldMap') },
        { label: 'TITLE', action: () => this.scene.start('Title') },
      ];
      this.overMenu = new Menu(this, items, { x: this.viewWidth / 2, y: 152, spacing: 16, align: 'center', fontSize: '8px', showHints: false });
    });
  }
}
