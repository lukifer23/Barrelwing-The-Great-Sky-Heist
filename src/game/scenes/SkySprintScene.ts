import { installPlayClock, playTime } from '../systems/PlayClock';
import Phaser from 'phaser';
import { SPRINT_CLASSES, type SprintClass } from '../data/sprint';
import { FONT_SMALL } from '../config';
import { Player } from '../player/Player';
import { InputManager } from '../systems/InputManager';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { Effects } from '../systems/Effects';
import { addPanel, Menu } from '../ui/Menu';
import { bindGamepadActions } from '../ui/MenuInput';

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
  gate: Gate;
  offsetY: number;
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
  private sprintClass: SprintClass = 'classic';
  private get rules() { return SPRINT_CLASSES[this.sprintClass]; }
  private get best(): number { return SaveManager.get()[this.rules.best]; }
  private hudPanel!: Phaser.GameObjects.Rectangle;
  private nextGap = 110;
  private elapsed = 0;
  private hudScore!: Phaser.GameObjects.Text;
  private hudCaption!: Phaser.GameObjects.Text;
  private hudBest!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private startPrompt!: Phaser.GameObjects.Text;
  private readySub!: Phaser.GameObjects.Text;
  private flashTimer = 0;
  private overMenu?: Menu;
  private overLayer?: Phaser.GameObjects.Container;
  private overDim?: Phaser.GameObjects.Rectangle;
  private readonly appPause = () => this.pauseForApp();
  private readonly onResume = () => this.inputMgr.reset();

  get controlsActive(): boolean { return this.state !== 'over'; }

  private get viewWidth(): number { return this.scale.gameSize.width; }
  private get viewHeight(): number { return this.scale.gameSize.height; }

  constructor() { super('SkySprint'); }

  init(data?: { sprintClass?: SprintClass }): void {
    this.sprintClass = data?.sprintClass === 'gale' ? 'gale' : 'classic';
  }

  create(): void {
    installPlayClock(this, 50);
    this.state = 'ready';
    this.coinScore = 0; this.hearts = []; this.overMenu = undefined; this.overLayer = undefined; this.overDim = undefined;
    this.flashTimer = 0;
    this.gates = [];
    this.coins = [];
    this.bg = [];
    this.clouds = [];
    this.speed = this.rules.speed;
    this.score = 0;
    this.distance = 0;
    this.nextGap = 110;
    this.elapsed = 0;

    this.buildBg();
    this.player = new Player(this, 112, 132);
    this.player.setFlightBounds(new Phaser.Geom.Rectangle(0, 56, this.viewWidth, this.viewHeight - 86));
    this.player.body.velocity.x = 0;
    this.player.body.setAllowGravity(false);
    this.inputMgr = new InputManager(this);
    this.fx = new Effects(this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume);
    this.game.events.on(Phaser.Core.Events.BLUR, this.appPause);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.appPause);
    window.addEventListener('pagehide', this.appPause);

    this.buildHud();
    this.refreshClass();
    this.resizeViewport();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    AudioManager.playMusic('sprint', { fade: 500 });
    this.events.on('sfx', (key: Parameters<typeof AudioManager.sfx>[0], opts: Parameters<typeof AudioManager.sfx>[1]) => AudioManager.sfx(key, opts), this);
    this.events.on('fx-gust', (x: number, y: number, d: number, s: boolean) => this.fx.gust(x, y, d, s), this);
    this.events.on('fx-dust', (x: number, y: number, n: number) => this.fx.dust(x, y, n), this);
    this.events.on('fx-step', (x: number, y: number, d: number) => this.fx.step(x, y, d), this);
    this.events.on('fx-dash', (x: number, y: number, d: number) => this.fx.dash(x, y, d), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume);
      this.game.events.off(Phaser.Core.Events.BLUR, this.appPause);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.appPause);
      window.removeEventListener('pagehide', this.appPause);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
      this.inputMgr.destroy();
      this.fx.destroy();
      for (const e of ['sfx', 'fx-gust', 'fx-dust', 'fx-step', 'fx-dash']) this.events.removeAllListeners(e);
    });
    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.state === 'ready' && !over.includes(this.readySub)) this.startSprint();
    });
    const onKey = (e: KeyboardEvent) => this.handleKey(e);
    this.input.keyboard?.on('keydown', onKey);
    bindGamepadActions(this, action => {
      if (this.state === 'over') {
        if (action === 'up') this.overMenu?.move(-1);
        else if (action === 'down') this.overMenu?.move(1);
        else if (action === 'confirm') this.overMenu?.confirm();
        else if (action === 'back' || action === 'pause') this.scene.start('Title');
      } else if (this.state === 'ready') {
        if (action === 'left' || action === 'right') this.changeClass();
        else if (action === 'confirm') this.startSprint();
      }
    }, { repeat: false });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  private resizeViewport(): void {
    this.cameras.main.setSize(this.viewWidth, this.viewHeight);
    const vx = this.player.body.velocity.x, vy = this.player.body.velocity.y;
    this.player.setFlightBounds(new Phaser.Geom.Rectangle(0, 56, this.viewWidth, this.viewHeight - 86));
    this.player.body.setVelocity(vx, vy).setAllowGravity(this.state === 'playing');
    this.hudPanel.setPosition(this.viewWidth / 2, 18).setSize(this.viewWidth - 12, 30);
    const portrait = this.viewHeight > this.viewWidth;
    this.hudBest.setPosition(this.viewWidth - 12, 9).setFontSize(portrait ? 12 : 9);
    this.hudScore.setPosition(78, 5).setFontSize(portrait ? 14 : 11);
    this.hudCaption.setPosition(78, 21).setFontSize(portrait ? 9 : 7);
    this.hearts.forEach((heart, i) => heart.setX(16 + i * 17));
    this.overDim?.setSize(this.viewWidth, this.viewHeight);
    this.overLayer?.setPosition(this.viewWidth / 2, this.viewHeight / 2).setScale(Math.min(1.6, Math.max(1, this.viewHeight / 360)));
    for (const image of [...this.bg, ...this.clouds]) {
      const source = image.texture.getSourceImage() as HTMLImageElement;
      image.setSize(this.viewWidth, this.viewHeight).setTileScale(Math.max(1, this.viewHeight / source.height));
    }
    for (const child of this.children.list) if (child instanceof Phaser.GameObjects.Rectangle && child.depth < 0) child.setSize(this.viewWidth, this.viewHeight);
    for (const g of this.gates) {
      g.gapY = Phaser.Math.Clamp(g.gapY, 50 + g.gapH / 2, this.viewHeight - 34 - g.gapH / 2);
      const topH = g.gapY - g.gapH / 2, botY = g.gapY + g.gapH / 2;
      g.top.setSize(g.w, topH); g.bottom.setY(botY).setSize(g.w, this.viewHeight - botY);
      g.trimTop.y = topH; g.trimBottom.y = botY;
    }
    for (const coin of this.coins) coin.sprite.y = coin.gate.gapY + coin.offsetY;
    const last = this.gates.at(-1);
    if (last) this.nextGap = last.gapY;
    if (this.state === 'ready') {
      this.startPrompt.setPosition(this.viewWidth / 2, this.viewHeight * 0.46).setFontSize(portrait ? 14 : 10);
      this.readySub.setPosition(this.viewWidth / 2, this.viewHeight * 0.46 + (portrait ? 55 : 40)).setFontSize(portrait ? 15 : 11);
    }
  }

  private buildBg(): void {
    this.add.rectangle(0, 0, this.viewWidth, this.viewHeight, 0x0e1730).setOrigin(0).setDepth(-10);
    this.bg.push(this.add.tileSprite(0, 0, this.viewWidth, this.viewHeight, 'bg_storm_sky').setOrigin(0).setAlpha(0.8).setDepth(-9));
    this.clouds.push(
      this.add.tileSprite(0, 0, this.viewWidth, this.viewHeight, 'bg_clouds').setOrigin(0).setAlpha(0.35).setDepth(-8),
      this.add.tileSprite(0, 0, this.viewWidth, this.viewHeight, 'bg_storm_trees').setOrigin(0).setAlpha(0.2).setDepth(-8),
    );
    this.add.rectangle(0, 0, this.viewWidth, this.viewHeight, 0x0b1020, 0.25).setOrigin(0).setDepth(-7);
    this.add.particles(0, 0, 'fx_streak', {
      x: { min: this.viewWidth, max: this.viewWidth + 40 },
      y: { min: 10, max: this.viewHeight - 10 },
      lifespan: 900, speedX: { min: -220, max: -120 }, scaleX: { start: 1, end: 0.2 },
      alpha: { start: 0.35, end: 0 }, frequency: 70, tint: 0x9fd8ff,
    }).setDepth(2);
  }

  private buildHud(): void {
    this.hudPanel = addPanel(this, this.viewWidth / 2, 18, 460, 26, 0x101528, 0.55, 0x3a4460);
    for (let i = 0; i < 3; i++) {
      this.hearts.push(this.add.image(42 + i * 14, 18, 'ui_heart').setScale(0.9));
    }
    this.hudScore = this.add.text(120, 12, '0', {
      fontFamily: FONT_SMALL, fontSize: '9px', color: '#f4e6c8',
    });
    this.hudBest = this.add.text(this.viewWidth - 12, 12, '', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060',
    }).setOrigin(1, 0);
    this.hudCaption = this.add.text(120, 24, 'DISTANCE + ACORNS', {
      fontFamily: FONT_SMALL, fontSize: '5px', color: '#8a93b2',
    });

    this.startPrompt = this.add.text(this.viewWidth / 2, 130, window.matchMedia('(pointer: coarse)').matches ? 'TAP FLAP TO START' : 'SPACE TO START', {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#f0c060',
    }).setOrigin(0.5).setDepth(30).setShadow(2, 2, '#000000', 0, true, true);
    if (!SaveManager.get().settings.reducedMotion) this.tweens.add({ targets: this.startPrompt, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
    this.readySub = this.add.text(this.viewWidth / 2, 170, '', {
      fontFamily: FONT_SMALL, fontSize: '10px', color: '#9ff5ff',
      align: 'center', backgroundColor: '#141a2e', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setDepth(30).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.changeClass());
  }

  private refreshClass(): void {
    const rules = this.rules;
    this.player.maxHearts = this.player.hearts = rules.hearts;
    this.updateHearts();
    this.readySub.setText(`◀  ${rules.label}  ▶\n${rules.hearts} ${rules.hearts === 1 ? 'HEART' : 'HEARTS'}${this.sprintClass === 'gale' ? '  /  FAST, NARROW GATES' : ''}`);
    this.hudBest.setText(`${rules.label} BEST ${this.best.toLocaleString('en-US')}`);
  }

  private changeClass(): void {
    this.sprintClass = this.sprintClass === 'classic' ? 'gale' : 'classic';
    this.refreshClass();
    AudioManager.sfx('ui_move', { volume: 0.4 });
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.state === 'ready' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.stopPropagation(); this.changeClass(); return;
    }
    if (this.state === 'ready' && (e.key === ' ' || e.key === 'Enter')) {
      this.startSprint();
      return;
    }
    if (this.state === 'over') {
      this.overMenu?.handleKey(e);
      return;
    }
  }

  private startSprint(): void {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.player.body.setAllowGravity(true);
    this.player.body.setVelocity(0, -150);
    this.inputMgr.consumeJump();
    this.startPrompt.destroy(); this.readySub.destroy();
    AudioManager.sfx('ui_confirm', { volume: 0.5 });
    // Use the same approach distance on every display.
    this.speed = this.rules.speed;
    this.emitGate(this.player.x + 398);
    this.extendCourse();
  }

  pauseForApp(): void {
    if (!this.scene.isActive() || this.state === 'over') return;
    SaveManager.setBonusBest(this.score, this.sprintClass);
    this.inputMgr.reset();
    this.scene.launch('Pause', { target: 'SkySprint', sprintClass: this.sprintClass });
    this.scene.pause();
  }

  override update(_time: number, delta: number): void {
    const time = playTime(this);
    const dt = Math.min(delta, 50);
    this.inputMgr.update(dt);
    if (this.inputMgr.pressedPause && this.state !== 'over') { this.pauseForApp(); return; }
    if (this.state === 'ready' && this.inputMgr.jumpBufferMs > 0) this.startSprint();

    this.bg.forEach((b, i) => { b.tilePositionX += dt * (0.004 + i * 0.002); });
    this.clouds.forEach((c, i) => { c.tilePositionX += dt * (0.02 + i * 0.03) * (this.state === 'playing' ? 2 : 0.4); });

    if (this.state !== 'playing') {
      if (this.state === 'ready') this.player.setY(132 + Math.sin(time / 700) * 4);
      this.player.body.velocity.x = 0;
      return;
    }

    this.elapsed += dt;
    this.speed = Math.min(this.rules.topSpeed, this.rules.speed + this.elapsed / 900);
    this.distance += this.speed * (dt / 1000);

    // keep the courier anchored while the world scrolls
    this.player.body.velocity.x = 0;
    this.player.x = 112;
    this.player.updatePlayer(dt, this.inputMgr, []);

    this.player.body.velocity.x = 0;
    this.player.x = 112;

    this.moveGates(dt);
    this.extendCourse();
    this.moveCoins(dt);
    this.score = Math.floor(this.distance / 6) + this.coinScore;
    this.checkCollisions();
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

  private extendCourse(): void {
    let tail = this.gates[this.gates.length - 1].x;
    const spacing = this.speed * (1.5 - Math.min(0.45, this.elapsed / 90000));
    while (tail < this.viewWidth) {
      tail += spacing;
      this.emitGate(tail);
    }
  }

  private emitGate(x: number): void {
    const gapH = Phaser.Math.Between(this.rules.gap[0], this.rules.gap[1]);
    const minY = 50 + gapH / 2;
    const maxY = this.viewHeight - 34 - gapH / 2;
    const gapY = Phaser.Math.Clamp(this.nextGap + Phaser.Math.Between(-36, 36), minY, maxY);
    this.nextGap = gapY;

    const w = 34;
    const topH = Math.max(4, gapY - gapH / 2);
    const botY = gapY + gapH / 2;
    const top = this.add.tileSprite(x, 0, w, topH, 'storm_fill').setOrigin(0.5, 0).setDepth(6);
    const bottom = this.add.tileSprite(x, botY, w, this.viewHeight - botY, 'storm_fill').setOrigin(0.5, 0).setDepth(6);
    const trimTop = this.add.rectangle(x, gapY - gapH / 2, w + 4, 4, 0xe4546a, 0.85).setDepth(7);
    const trimBottom = this.add.rectangle(x, gapY + gapH / 2, w + 4, 4, 0xe4546a, 0.85).setDepth(7);
    const gate = { x, w, gapY, gapH, top, bottom, trimTop, trimBottom };
    this.gates.push(gate);

    // a coin trail inside the gap
    if (Math.random() < 0.7) {
      for (let i = 0; i < 3; i++) {
        const s = this.add.sprite(x - 30 - i * 22, gapY + Math.sin(i) * 6, 'acorn').setDepth(8);
        s.play('acorn-spin');
        this.coins.push({ sprite: s, gate, offsetY: s.y - gapY });
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
      c.sprite.x -= dx;
      if (Math.abs(c.sprite.x - this.player.x) < 12 && Math.abs(c.sprite.y - (this.player.y - 12)) < 14) {
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
    for (const g of this.gates) {
      if (pb.right - 3 < g.x - g.w / 2 || pb.left + 3 > g.x + g.w / 2) continue;
      if (pb.top + 3 <= g.gapY - g.gapH / 2 - 3 || pb.bottom - 3 >= g.gapY + g.gapH / 2 + 3) {
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
    if (this.startPrompt.active) this.startPrompt.destroy();
    if (this.readySub.active) this.readySub.destroy();
    this.player.controlLocked = true;
    this.player.kill();
    this.inputMgr.reset();
    this.player.body.velocity.set(0, -90);
    AudioManager.stopMusic(500);
    AudioManager.sfx('defeat', { volume: 0.5, rate: 0.7 });
    SaveManager.setBonusBest(this.score, this.sprintClass);
    this.hudBest.setText(`${this.rules.label} BEST ${this.best.toLocaleString('en-US')}`);

    this.time.delayedCall(500, () => {
      this.player.body.setVelocity(0);
      this.overDim = this.add.rectangle(0, 0, this.viewWidth, this.viewHeight, 0x05070d, 0.78).setOrigin(0).setDepth(50);
      const before = new Set(this.children.list);
      addPanel(this, this.viewWidth / 2, 132, 280, 190, 0x141a2e, 0.98, 0xc8b48a).setDepth(51);
      this.add.text(this.viewWidth / 2, 78, `${this.rules.label} SPRINT OVER`, {
        fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#e4546a',
      }).setOrigin(0.5).setDepth(52).setShadow(2, 2, '#000000', 0, true, true);
      this.add.text(this.viewWidth / 2, 104, `SCORE ${this.score.toLocaleString('en-US')}   ·   ${Math.floor(this.distance)}m`, {
        fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
      }).setOrigin(0.5).setDepth(52);
      this.add.text(this.viewWidth / 2, 118, `BEST ${this.best.toLocaleString('en-US')}`, {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060',
      }).setOrigin(0.5).setDepth(52);
      const items = [
        { label: 'FLY AGAIN', action: () => this.scene.restart({ sprintClass: this.sprintClass }) },
        { label: 'WORLD MAP', action: () => this.scene.start('WorldMap') },
        { label: 'TITLE', action: () => this.scene.start('Title') },
      ];
      this.overMenu = new Menu(this, items, { x: this.viewWidth / 2, y: 152, spacing: 24, align: 'center', fontSize: '10px', showHints: false });
      const objects = this.children.list.filter(o => !before.has(o)) as (Phaser.GameObjects.GameObject & { x: number; y: number })[];
      for (const object of objects) { object.x -= this.viewWidth / 2; object.y -= 132; }
      this.overLayer = this.add.container(this.viewWidth / 2, this.viewHeight / 2, objects).setDepth(51);
      this.resizeViewport();
    });
  }
}
