import { installPlayClock, playTime } from '../systems/PlayClock';
import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { ARENA_NAMES, type BrawlOptions } from '../data/brawl';
import { THEMES } from '../data/levels/types';
import { Fighter, neutralFightInput, type FightInput } from '../brawl/Fighter';
import { Barrel } from '../entities/Barrel';
import { InputManager } from '../systems/InputManager';
import { SaveManager } from '../systems/SaveManager';
import { AudioManager } from '../systems/AudioManager';
import { Effects } from '../systems/Effects';

export class BrawlScene extends Phaser.Scene {
  options!: BrawlOptions;
  private human!: Fighter;
  private cpu!: Fighter;
  private inputMgr!: InputManager;
  private fx!: Effects;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private plates: { sprite: Phaser.GameObjects.TileSprite; x: number; lift: number; width: number }[] = [];
  private background!: Phaser.GameObjects.TileSprite;
  private barrels!: Phaser.GameObjects.Group;
  private humanHud!: Phaser.GameObjects.Text;
  private cpuHud!: Phaser.GameObjects.Text;
  private timerHud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private elapsedMs = 0;
  private startAt = 0;
  private nextHazard = 14000;
  private nextSave = 0;
  private nextThink = 0;
  private nextCpuJump = 0;
  private nextCpuDash = 0;
  private nextCpuAttack = 0;
  private cpuJumpHeldUntil = 0;
  private cpuIntent = neutralFightInput();
  private previousWidth = 0;
  private previousHeight = 0;
  private ended = false;
  private suddenDeath = false;
  private bannerUntil = 0;
  private knockedOut = 0;
  private readonly appPause = () => this.pauseForApp();
  private get W(): number { return this.scale.width; }
  private get H(): number { return this.scale.height; }
  private get floor(): number { return this.H * 0.72; }

  constructor() { super('Brawl'); }
  init(options: BrawlOptions): void {
    this.options = { arena: options.arena ?? 'forest', difficulty: options.difficulty ?? 'normal', player: options.player ?? 'pip', cpu: options.cpu ?? 'fenn', resume: options.resume };
    this.previousWidth = 0; this.previousHeight = 0;
    this.plates = []; this.elapsedMs = 0; this.ended = false; this.suddenDeath = false; this.knockedOut = 0;
    this.nextSave = 0; this.nextThink = 0; this.nextCpuJump = 0; this.nextCpuDash = 0; this.nextHazard = 14000;
    this.cpuIntent = neutralFightInput();
    this.nextCpuAttack = 0; this.cpuJumpHeldUntil = 0;
    this.bannerUntil = 0;
  }
  create(): void {
    installPlayClock(this, 40);
    const theme = THEMES[this.options.arena];
    this.cameras.main.setBackgroundColor(theme.sky).setSize(this.W, this.H).setScroll(0, 0);
    this.background = this.add.tileSprite(0, 0, this.W, this.H, theme.far).setOrigin(0).setAlpha(0.75).setDepth(-20);
    this.platforms = this.physics.add.staticGroup(); this.barrels = this.add.group();
    this.addPlate(0.5, 0, 0.78); this.addPlate(0.28, 72, 0.23); this.addPlate(0.72, 72, 0.23); this.addPlate(0.5, 140, 0.22);
    this.human = new Fighter(this, this.W * 0.34, this.floor - 30, this.options.player, false);
    this.cpu = new Fighter(this, this.W * 0.66, this.floor - 30, this.options.cpu, true); this.cpu.facing = -1; this.cpu.setFlipX(true);
    for (const fighter of [this.human, this.cpu]) {
      this.physics.add.collider(fighter, this.platforms, undefined, (_f, platform) => {
        const body = (platform as Phaser.GameObjects.TileSprite).body as Phaser.Physics.Arcade.StaticBody;
        return fighter.body.velocity.y >= 0 && fighter.body.prev.y + fighter.body.height <= body.top + 8;
      });
      this.physics.add.overlap(fighter, this.barrels, (_f, barrel) => {
        const b = barrel as unknown as Barrel;
        if (fighter.receiveHazard(b.dir)) { this.fx.hit(fighter.x, fighter.y - 15, 0xffbd72); b.smash(); }
      });
    }
    this.physics.add.collider(this.barrels, this.platforms);
    this.inputMgr = new InputManager(this); this.fx = new Effects(this);
    this.humanHud = this.add.text(12, 12, '', { fontFamily: FONT_SMALL, fontSize: '10px', color: '#9ff5ff', backgroundColor: '#101528', padding: { x: 8, y: 5 } }).setDepth(100);
    this.cpuHud = this.add.text(this.W - 12, 12, '', { fontFamily: FONT_SMALL, fontSize: '10px', color: '#ffb0a0', align: 'right', backgroundColor: '#101528', padding: { x: 8, y: 5 } }).setOrigin(1, 0).setDepth(100);
    this.timerHud = this.add.text(this.W / 2, 18, '', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060', backgroundColor: '#101528', padding: { x: 6, y: 4 } }).setOrigin(0.5, 0).setDepth(101);
    this.banner = this.add.text(this.W / 2, 94, ARENA_NAMES[this.options.arena], { fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#f0c060', backgroundColor: '#101528', align: 'center', padding: { x: 8, y: 6 }, wordWrap: { width: this.W - 40 } }).setOrigin(0.5).setDepth(110);
    const saved = this.options.resume ? SaveManager.get().brawlRun : null;
    if (saved) {
      this.human.stocks = saved.playerStocks; this.cpu.stocks = saved.cpuStocks;
      this.human.damage = saved.playerDamage; this.cpu.damage = saved.cpuDamage; this.elapsedMs = saved.elapsedMs;
      this.knockedOut = 3 - this.cpu.stocks; this.nextHazard = this.elapsedMs + 12000;
    }
    this.startAt = playTime(this) + 2500; this.human.invulnerableUntil = this.startAt; this.cpu.invulnerableUntil = this.startAt;
    this.events.on('brawl-swing', this.swing, this); this.events.on('brawl-hit', this.hit, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.resumeMatch, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeArena, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.appPause); this.game.events.on(Phaser.Core.Events.HIDDEN, this.appPause);
    window.addEventListener('pagehide', this.appPause);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    AudioManager.playMusic(this.options.arena, { fade: 350 }); this.resizeArena(); this.persistMatch();
  }

  private addPlate(x: number, lift: number, width: number): void {
    const theme = THEMES[this.options.arena];
    const sprite = this.add.tileSprite(this.W * x, this.floor - lift, this.W * width, 16, theme.topTex).setOrigin(0.5, 0).setDepth(8);
    this.physics.add.existing(sprite, true); this.platforms.add(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = false; body.checkCollision.left = false; body.checkCollision.right = false;
    this.plates.push({ sprite, x, lift, width });
  }
  private resizeArena(): void {
    if (this.previousWidth > 0 && this.previousHeight > 0) {
      const oldFloor = this.previousHeight * 0.72;
      for (const fighter of [this.human, this.cpu]) if (fighter) {
        const vx = fighter.body.velocity.x, vy = fighter.body.velocity.y;
        fighter.body.reset(fighter.x / this.previousWidth * this.W, fighter.y - oldFloor + this.floor);
        fighter.body.velocity.set(vx, vy);
      }
    }
    this.previousWidth = this.W; this.previousHeight = this.H;
    this.cameras.main.setSize(this.W, this.H);
    this.background.setSize(this.W, this.H);
    const image = this.background.texture.getSourceImage() as HTMLImageElement;
    this.background.setTileScale(Math.max(1, this.H / image.height));
    for (const plate of this.plates) {
      plate.sprite.setPosition(this.W * plate.x, this.floor - plate.lift).setSize(this.W * plate.width, 16);
      const body = plate.sprite.body as Phaser.Physics.Arcade.StaticBody; body.setSize(this.W * plate.width, 16); body.updateFromGameObject();
    }
    if (this.cpuHud) this.cpuHud.x = this.W - 12;
    if (this.timerHud) this.timerHud.x = this.W / 2;
    if (this.banner) this.banner.setX(this.W / 2).setWordWrapWidth(this.W - 40);
  }

  override update(_time: number, delta: number): void {
    const time = playTime(this);
    if (this.ended) return;
    const dt = Math.min(delta, 40); this.inputMgr.update(dt);
    if (this.inputMgr.pressedPause) { this.pauseForApp(); return; }
    if (time < this.startAt) {
      this.banner.setText(`${ARENA_NAMES[this.options.arena]}\n${Math.ceil((this.startAt - time) / 1000)}`);
      this.human.updateFighter(dt, neutralFightInput()); this.cpu.updateFighter(dt, neutralFightInput());
      this.inputMgr.consumeJump(); this.inputMgr.consumeAttack(); this.inputMgr.consumeDash(); this.inputMgr.clearFrameFlags(); this.updateHud(); return;
    }
    this.elapsedMs += dt;
    if (this.elapsedMs > 180000 && !this.suddenDeath) {
      if (this.human.stocks !== this.cpu.stocks || this.human.damage !== this.cpu.damage) {
        this.finish(this.human.stocks > this.cpu.stocks || this.human.stocks === this.cpu.stocks && this.human.damage < this.cpu.damage); return;
      }
      this.suddenDeath = true; this.human.stocks = 1; this.cpu.stocks = 1;
      this.human.damage = 300; this.cpu.damage = 300; this.showBanner('SUDDEN DELIVERY', 2200);
    }
    const input: FightInput = { move: this.inputMgr.horizontal, jump: this.inputMgr.consumeJump(), heldJump: this.inputMgr.jumpHeld,
      dash: this.inputMgr.consumeDash(), attack: this.inputMgr.consumeAttack() || this.inputMgr.attackHeld, aim: this.inputMgr.up ? -1 : this.inputMgr.down ? 1 : 0 };
    this.human.updateFighter(dt, input); this.cpu.updateFighter(dt, this.think(time));
    this.human.strike(this.cpu, this.suddenDeath); this.cpu.strike(this.human, this.suddenDeath);
    for (const fighter of [this.human, this.cpu]) {
      if (fighter.x < -110 || fighter.x > this.W + 110 || fighter.y > this.H + 120 || fighter.y < -220) this.ringOut(fighter);
      if (this.options.arena === 'storm' && Math.floor(this.elapsedMs / 14000) % 2 === 1 && !fighter.grounded) fighter.body.velocity.x += 45 * dt / 1000;
      if (this.options.arena === 'factory' && fighter.grounded) fighter.x += Math.sin(this.elapsedMs / 3500) * 22 * dt / 1000;
    }
    if (this.elapsedMs >= this.nextHazard) { this.nextHazard += this.options.difficulty === 'hard' ? 11000 : 16000; this.deliverBarrel(); }
    for (const barrel of [...this.barrels.getChildren()] as Barrel[]) barrel.updateBarrel(time, dt / 1000, this.H + 100);
    if (time > this.bannerUntil) this.banner.setVisible(false);
    this.background.tilePositionX += dt * 0.004;
    if (time > this.nextSave) { this.nextSave = time + 2500; this.persistMatch(); }
    this.updateHud(); this.inputMgr.clearFrameFlags();
  }
  private think(time: number): FightInput {
    const reaction = this.options.difficulty === 'easy' ? 260 : this.options.difficulty === 'hard' ? 75 : 140;
    const intent = { ...this.cpuIntent, jump: false, dash: false, attack: false };
    if (time < this.nextThink) return intent;
    this.nextThink = time + reaction;
    const dx = this.human.x - this.cpu.x, dy = this.human.y - this.cpu.y;
    const offstage = this.cpu.x < this.W * 0.15 || this.cpu.x > this.W * 0.85 || this.cpu.y > this.floor + 20;
    const targetX = offstage ? this.W / 2 : this.human.x;
    intent.move = Math.abs(targetX - this.cpu.x) < 36 ? 0 : Math.sign(targetX - this.cpu.x);
    if ((offstage || dy < -50 || this.cpu.grounded && Math.abs(dx) > 85 && Math.abs(dx) < 170) && time > this.nextCpuJump) {
      intent.jump = true; this.nextCpuJump = time + (offstage ? 340 : 650); this.cpuJumpHeldUntil = time + 300;
    }
    intent.heldJump = offstage || dy < -35 || time < this.cpuJumpHeldUntil;
    const reach = this.options.difficulty === 'easy' ? 43 : 65;
    intent.attack = time >= this.nextCpuAttack && !this.cpu.stunned && Math.abs(dx) < reach && Math.abs(dy) < 62;
    if (intent.attack) this.nextCpuAttack = time + (this.options.difficulty === 'easy' ? 1200 : this.options.difficulty === 'hard' ? 650 : 950);
    intent.aim = dy < -28 ? -1 : dy > 35 ? 1 : 0;
    if (!offstage && this.options.difficulty === 'hard' && Math.abs(dx) > 170 && time > this.nextCpuDash) { intent.dash = true; this.nextCpuDash = time + 2600; }
    this.cpuIntent = intent; return intent;
  }
  private swing(fighter: Fighter): void {
    const x = fighter.x + (fighter.attackAim === 0 ? fighter.facing * 34 : 0), y = fighter.y - 18 + fighter.attackAim * 24;
    const ring = this.add.ellipse(x, y, fighter.attackAim === 0 ? 62 : 36, fighter.attackAim === 0 ? 34 : 62, fighter.isCpu ? 0xff9f89 : 0x9ff5ff, 0.15).setStrokeStyle(2, fighter.isCpu ? 0xff9f89 : 0x9ff5ff, 0.8).setDepth(22);
    this.tweens.add({ targets: ring, alpha: 0.65, scale: 1.15, duration: fighter.attackWindup, onComplete: () => {
      ring.setFillStyle(fighter.isCpu ? 0xff9f89 : 0x9ff5ff, 0.45);
      this.tweens.add({ targets: ring, alpha: 0, scale: 1.5, duration: 125, onComplete: () => ring.destroy() });
    } });
  }
  private hit(fighter: Fighter): void { this.fx.hit(fighter.x, fighter.y - 16, fighter.isCpu ? 0xff9f89 : 0x9ff5ff); this.fx.shake(0.003, 80); }
  private ringOut(fighter: Fighter): void {
    if (this.ended || fighter.stocks <= 0) return;
    fighter.stocks--; if (fighter.isCpu) this.knockedOut++;
    this.fx.sparkle(Phaser.Math.Clamp(fighter.x, 30, this.W - 30), Math.min(fighter.y, this.H - 30), 0xffdf78);
    AudioManager.sfx('defeat', { volume: 0.4 });
    if (fighter.stocks <= 0) { this.finish(fighter.isCpu); return; }
    fighter.respawn(this.W * (fighter.isCpu ? 0.66 : 0.34), this.floor - 70);
    this.showBanner(fighter.isCpu ? 'RETURN TO SENDER!' : 'TAIL WARRANTY CLAIMED.', 1300); this.persistMatch();
  }
  private deliverBarrel(): void {
    this.showBanner('UNSCHEDULED DELIVERY!\nBARREL INCOMING', 1600);
    this.time.delayedCall(1000, () => {
      if (this.ended) return;
      const left = Math.floor(this.elapsedMs / 14000) % 2 === 0;
      this.barrels.add(new Barrel(this, this.W * (left ? 0.19 : 0.81), this.floor - 180, left ? 1 : -1, 'standard'));
    });
  }
  private showBanner(text: string, duration: number): void { this.banner.setText(text).setVisible(true); this.bannerUntil = playTime(this) + duration; }
  private updateHud(): void {
    this.humanHud.setText(`${this.human.courier.name}  /  YOU\n${this.human.stocks} STOCKS   ${Math.floor(this.human.damage)}%`);
    this.cpuHud.setText(`${this.cpu.courier.name}  /  CPU\n${this.cpu.stocks} STOCKS   ${Math.floor(this.cpu.damage)}%`);
    const remaining = Math.max(0, Math.ceil((180000 - this.elapsedMs) / 1000));
    this.timerHud.setText(this.suddenDeath ? 'SUDDEN\nDELIVERY' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
  }
  private finish(won: boolean): void {
    if (this.ended) return; this.ended = true; this.physics.pause();
    SaveManager.recordBrawl(won, this.knockedOut); SaveManager.saveBrawlRun(null);
    AudioManager.sfx(won ? 'life' : 'defeat', { volume: 0.5 });
    this.time.delayedCall(500, () => this.scene.start('BrawlResults', { won, options: this.options, knockouts: this.knockedOut, elapsedMs: this.elapsedMs }));
  }
  persistMatch(): void {
    if (this.ended || !this.human || !this.cpu) return;
    SaveManager.saveBrawlRun({ ...this.options, playerStocks: this.human.stocks, cpuStocks: this.cpu.stocks, playerDamage: this.human.damage, cpuDamage: this.cpu.damage, elapsedMs: this.elapsedMs });
  }
  pauseForApp(): void {
    if (this.ended || !this.scene.isActive()) return;
    this.persistMatch(); this.inputMgr.reset(); this.scene.launch('BrawlPause', { options: this.options }); this.scene.pause();
  }
  private resumeMatch(): void { this.inputMgr.reset(); }
  private cleanup(): void {
    this.persistMatch(); this.inputMgr.destroy(); this.fx.destroy();
    this.events.off('brawl-swing', this.swing, this); this.events.off('brawl-hit', this.hit, this);
    this.events.off(Phaser.Scenes.Events.RESUME, this.resumeMatch, this); this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeArena, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.appPause); this.game.events.off(Phaser.Core.Events.HIDDEN, this.appPause); window.removeEventListener('pagehide', this.appPause);
  }
}
