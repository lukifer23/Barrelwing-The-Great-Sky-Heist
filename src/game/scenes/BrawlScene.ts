import { installPlayClock, playTime } from '../systems/PlayClock';
import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { ARENA_NAMES, ARENA_PLATFORMS, MATCH_LENGTH, type BrawlOptions } from '../data/brawl';
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
  private scenery!: Phaser.GameObjects.TileSprite;
  private hud!: Phaser.GameObjects.Container;
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
  private cpuKOs = 0;
  private get timed(): boolean { return this.options.rules === 'timed'; }
  private get matchLength(): number { return MATCH_LENGTH[this.options.rules ?? 'stock']; }
  private readonly appPause = () => this.pauseForApp();
  private get W(): number { return this.scale.width; }
  private get H(): number { return this.scale.height; }
  private floorAt(width: number, height: number): number { return height * (height > width * 1.3 ? 0.60 : 0.72); }
  private get floor(): number { return this.floorAt(this.W, this.H); }

  constructor() { super('Brawl'); }
  init(options: BrawlOptions): void {
    this.options = { rules: options.rules ?? 'stock', arena: options.arena ?? 'forest', difficulty: options.difficulty ?? 'normal', player: options.player ?? 'pip', cpu: options.cpu ?? 'fenn', resume: options.resume };
    this.previousWidth = 0; this.previousHeight = 0;
    this.plates = []; this.elapsedMs = 0; this.ended = false; this.suddenDeath = false; this.knockedOut = 0; this.cpuKOs = 0;
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
    this.scenery = this.add.tileSprite(0, 0, this.W, this.H, theme.mid).setOrigin(0, 1).setAlpha(0.42).setDepth(-19);
    this.platforms = this.physics.add.staticGroup(); this.barrels = this.add.group();
    for (const plate of ARENA_PLATFORMS[this.options.arena]) this.addPlate(...plate);
    this.human = new Fighter(this, this.W * 0.34, this.floor - 30, this.options.player, false);
    this.cpu = new Fighter(this, this.W * 0.66, this.floor - 30, this.options.cpu, true); this.cpu.face(-1);
    if (this.options.cpu === this.options.player) this.cpu.setTint(0xffa69d);
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
    this.hud = this.add.container(0, 0, [this.humanHud, this.cpuHud, this.timerHud, this.banner]).setScrollFactor(0).setDepth(100);
    const saved = this.options.resume ? SaveManager.get().brawlRun : null;
    if (saved) {
      this.human.stocks = saved.playerStocks; this.cpu.stocks = saved.cpuStocks;
      this.human.damage = saved.playerDamage; this.cpu.damage = saved.cpuDamage; this.elapsedMs = saved.elapsedMs;
      this.knockedOut = saved.playerKOs; this.cpuKOs = saved.cpuKOs; this.suddenDeath = saved.suddenDeath; this.nextHazard = this.elapsedMs + 12000;
    }
    this.startAt = playTime(this) + 2500; this.human.invulnerableUntil = this.startAt; this.cpu.invulnerableUntil = this.startAt;
    this.events.on('brawl-swing', this.swing, this); this.events.on('brawl-parry', this.parry, this); this.events.on('brawl-hit', this.hit, this);
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
      const oldFloor = this.floorAt(this.previousWidth, this.previousHeight);
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
    const middle = this.scenery.texture.getSourceImage() as HTMLImageElement;
    this.scenery.setPosition(0, this.H).setSize(this.W, this.H).setTileScale(Math.max(1, this.H / middle.height));
    const cover = this.H > this.W * 1.3;
    this.humanHud?.setFontSize(cover ? 17 : 10);
    this.cpuHud?.setX(this.W - 12).setFontSize(cover ? 17 : 10);
    this.timerHud?.setFontSize(cover ? 16 : 9);
    this.banner?.setFontSize(cover ? 15 : 10);
    if (this.timerHud) this.timerHud.x = this.W / 2;
    if (this.banner) this.banner.setX(this.W / 2).setWordWrapWidth(this.W - 40);
    this.frameFighters(1);
  }

  private frameFighters(blend: number): void {
    const camera = this.cameras.main;
    if (this.H <= this.W * 1.3 || SaveManager.get().settings.reducedMotion) {
      if (camera.zoom !== 1 || camera.scrollX || camera.scrollY) {
        camera.setZoom(1).setScroll(0, 0); this.hud.setScale(1).setPosition(0, 0);
      }
      return;
    }
    const span = Math.abs(this.human.x - this.cpu.x) + 130;
    const zoom = Phaser.Math.Linear(camera.zoom, Phaser.Math.Clamp(this.W / span, 1, 1.85), blend);
    const halfW = this.W / (2 * zoom), halfH = this.H / (2 * zoom);
    const x = Phaser.Math.Clamp((this.human.x + this.cpu.x) / 2, halfW, this.W - halfW);
    const y = Phaser.Math.Clamp((this.human.y + this.cpu.y) / 2 - halfH * 0.20, halfH, this.H - halfH);
    camera.setZoom(zoom).setScroll(Phaser.Math.Linear(camera.scrollX, x - this.W / 2, blend),
      Phaser.Math.Linear(camera.scrollY, y - this.H / 2, blend));
    // Cancel the world zoom around the viewport center for the fixed match readouts.
    this.hud.setScale(1 / zoom).setPosition(this.W / 2 - halfW, this.H / 2 - halfH);
  }

  override update(_time: number, delta: number): void {
    const time = playTime(this);
    if (this.ended) return;
    const dt = Math.min(delta, 40); this.frameFighters(1 - Math.exp(-7 * dt / 1000)); this.inputMgr.update(dt);
    if (this.inputMgr.pressedPause) { this.pauseForApp(); return; }
    if (time < this.startAt) {
      this.banner.setText(`${ARENA_NAMES[this.options.arena]}\n${Math.ceil((this.startAt - time) / 1000)}`);
      this.human.updateFighter(dt, neutralFightInput()); this.cpu.updateFighter(dt, neutralFightInput());
      this.inputMgr.consumeJump(); this.inputMgr.consumeAttack(); this.inputMgr.consumeDash(); this.inputMgr.clearFrameFlags(); this.updateHud(); return;
    }
    this.elapsedMs += dt;
    const pressedAttack = this.inputMgr.consumeAttack();
    const input: FightInput = { move: this.inputMgr.horizontal, jump: this.inputMgr.consumeJump(), heldJump: this.inputMgr.jumpHeld,
      dash: this.inputMgr.consumeDash(), dashAim: this.inputMgr.dashAim, attack: pressedAttack || this.inputMgr.attackHeld,
      attackAim: pressedAttack ? this.inputMgr.attackAim : undefined, aim: this.inputMgr.up ? -1 : this.inputMgr.down ? 1 : 0 };
    this.human.updateFighter(dt, input); this.cpu.updateFighter(dt, this.think(time));
    // Sample both hitboxes before either strike can interrupt the other.
    const humanHit = this.human.canStrike(this.cpu);
    const cpuHit = this.cpu.canStrike(this.human);
    if (humanHit) this.human.landStrike(this.cpu, this.suddenDeath);
    if (cpuHit) this.cpu.landStrike(this.human, this.suddenDeath);
    const out = [this.human, this.cpu].filter(f => f.x < -110 || f.x > this.W + 110 || f.y > this.floor + 196 || f.y < this.floor - 414);
    if (out.length) this.resolveRingOuts(out);
    if (this.ended) return;
    if (this.elapsedMs >= this.matchLength && !this.suddenDeath) {
      const lead = this.timed ? this.knockedOut - this.cpuKOs
        : this.human.stocks - this.cpu.stocks || this.cpu.damage - this.human.damage;
      if (lead) { this.finish(lead > 0); return; }
      this.startOvertime();
    }
    for (const fighter of [this.human, this.cpu]) {
      if (this.options.arena === 'storm' && Math.floor(this.elapsedMs / 14000) % 2 === 1 && !fighter.grounded) fighter.body.velocity.x += 45 * dt / 1000;
      if (this.options.arena === 'factory' && fighter.grounded) fighter.x += Math.sin(this.elapsedMs / 3500) * 22 * dt / 1000;
    }
    if (this.elapsedMs >= this.nextHazard) { this.nextHazard += this.options.difficulty === 'hard' ? 11000 : 16000; this.deliverBarrel(); }
    for (const barrel of this.barrels.children as Set<Barrel>) barrel.updateBarrel(time, dt / 1000, this.H + 100);
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
    const base = this.plates[0].sprite;
    const left = base.x - base.width / 2, right = base.x + base.width / 2;
    const offstage = this.cpu.x < left || this.cpu.x > right || this.cpu.y > this.floor + 20;
    const hard = this.options.difficulty === 'hard';
    const cpu = this.cpu, rival = this.human;
    const headroom = cpu.y > this.floor - 245;
    const airborne = !cpu.grounded;
    intent.aim = 0; intent.dashAim = 0;
    const readyTarget = time + cpu.attackWindup >= rival.invulnerableUntil && !rival.guarding;
    const canAttack = readyTarget && !cpu.stunned && !cpu.guarding && time >= this.nextCpuAttack;
    if (offstage) {
      intent.move = Math.sign(this.W / 2 - cpu.x);
      intent.face = intent.move;
      const falling = cpu.body.velocity.y > -70;
      const low = cpu.y > this.floor + 55;
      const lift = falling && cpu.canLift && cpu.dashProgress === 1 && (low || cpu.airJumps === 0 && cpu.y > this.floor);
      intent.heldJump = headroom && (falling || cpu.body.velocity.y < 0);
      if (lift) { intent.dash = true; intent.dashAim = -1; }
      else if (headroom && falling && time > this.nextCpuJump && (cpu.grounded || cpu.airJumps > 0)) {
        intent.jump = true; this.nextCpuJump = time + 240;
      }
      intent.attack = canAttack && cpu.canRefundKick && intent.face * dx > 0 &&
        Math.abs(dx - intent.face * cpu.style.reach) <= cpu.style.radius && Math.abs(dy) <= 38;
      this.cpuIntent = intent; return intent;
    }

    const easy = this.options.difficulty === 'easy';
    const centerSide = rival.x >= this.W / 2 ? -1 : 1;
    const rivalOffstage = rival.x < left || rival.x > right || rival.y > this.floor + 20;
    const missedSwing = !rival.hitThisSwing && time >= rival.attackAt + rival.attackWindup + rival.style.activeMs && rival.attackProgress < 1;
    const counter = rival.stunned || missedSwing;
    const spacing = cpu.id === 'fenn' && counter ? 10 : cpu.id === 'clover' ? 16 : cpu.style.reach;
    // Set up on the stage side of an escaping opponent to launch toward the edge.
    const offset = rivalOffstage || Math.abs(dx) < cpu.style.reach * 1.4 ? centerSide : -Math.sign(dx);
    const targetX = Phaser.Math.Clamp(rival.x + offset * spacing, left + 15, right - 15);
    intent.move = Math.abs(targetX - cpu.x) > 9 ? Math.sign(targetX - cpu.x) : 0;
    intent.face = Math.abs(dx) > 3 ? Math.sign(dx) : cpu.facing;

    const pursue = !rivalOffstage && dy < -46 && Math.abs(dx) < 140;
    const vault = cpu.id === 'clover' && cpu.grounded && !rivalOffstage && Math.abs(dx) < 72 && Math.abs(dy) < 35;
    intent.heldJump = headroom && (time < this.cpuJumpHeldUntil || pursue);
    if (headroom && (pursue || vault) && time > this.nextCpuJump && (cpu.grounded || cpu.airJumps > 0 && cpu.body.velocity.y > -45)) {
      intent.jump = true; intent.heldJump = true;
      this.nextCpuJump = time + (vault ? 1000 : 390); this.cpuJumpHeldUntil = time + (vault ? 150 : 260);
    }

    // Anticipate travel during the visible wind-up without reading player input.
    const lead = easy ? 0 : hard ? 0.14 : 0.08;
    const futureY = dy + Phaser.Math.Clamp((rival.body.velocity.y - cpu.body.velocity.y) * lead, -32, 32);
    const futureX = dx + Phaser.Math.Clamp((rival.body.velocity.x - cpu.body.velocity.x) * lead, -30, 30);
    const vertical = Math.abs(futureX) < 40 && (futureY < -24 || futureY > 25);
    intent.aim = vertical ? Math.sign(futureY) : 0;
    const reach = cpu.style.reach + cpu.style.radius - (easy ? 23 : 8);
    const inRange = vertical ? Math.abs(futureY) < 72 : Math.abs(futureX) < reach && Math.abs(futureY) < 38;
    intent.attack = inRange && canAttack;
    if (cpu.id === 'clover' && intent.jump && !airborne && !counter) intent.attack = false;

    if (hard && !cpu.stunned && (rival.windingUp || rival.attacking) && !rival.hitThisSwing &&
        Math.abs(dx) < rival.style.reach + rival.style.radius && Math.abs(dy) < 42 && !cpu.attacking) {
      if (cpu.dashProgress === 1) {
        intent.dashAim = 1; intent.dash = true; intent.attack = false;
      } else if (!cpu.windingUp && !counter) {
        const retreatX = Phaser.Math.Clamp(cpu.x - Math.sign(dx) * 35, left + 15, right - 15);
        intent.move = Math.abs(retreatX - cpu.x) > 6 ? Math.sign(retreatX - cpu.x) : 0;
      }
    } else if (hard && !rivalOffstage && cpu.dashProgress === 1 && time >= this.nextCpuDash &&
        (Math.abs(dx) > 170 || cpu.id === 'fenn' && counter && Math.abs(dx) > reach && Math.abs(dx) < 130)) {
      intent.dash = true; this.nextCpuDash = time + 1700;
    }
    this.cpuIntent = intent; return intent;
  }
  private swing(fighter: Fighter): void {
    if (!fighter.isCpu) return;
    const delay = this.options.difficulty === 'easy' ? 620 : this.options.difficulty === 'normal' ? 220 : 45;
    this.nextCpuAttack = fighter.now + fighter.attackCooldown + delay;
  }

  private parry(fighter: Fighter): void {
    if (fighter.isCpu) { this.nextThink = 0; this.nextCpuAttack = 0; }
    this.fx.sparkle(fighter.x, fighter.y - 16, 0x9ff5ff);
    AudioManager.sfx('bump', { volume: 0.45 });
    this.showBanner('PARRY!', 550);
  }
  private hit(fighter: Fighter): void { this.fx.hit(fighter.x, fighter.y - 16, fighter.isCpu ? 0xff9f89 : 0x9ff5ff); this.fx.shake(0.003, 80); }
  private startOvertime(): void {
    this.suddenDeath = true;
    this.barrels.clear(true, true);
    for (const fighter of [this.human, this.cpu]) {
      this.respawn(fighter);
      fighter.stocks = 1;
      fighter.damage = 300;
    }
    this.showBanner('SUDDEN DELIVERY / NEXT KO WINS', 2200);
    this.persistMatch();
  }

  private respawn(fighter: Fighter): void {
    fighter.respawn(this.W * (fighter.isCpu ? 0.66 : 0.34), this.floor - 70);
  }

  private resolveRingOuts(out: Fighter[]): void {
    for (const fighter of out) {
      this.events.emit('brawl-ring-out', fighter);
      if (fighter.isCpu) this.knockedOut++;
      else this.cpuKOs++;
      if (!this.timed || this.suddenDeath) fighter.stocks--;
      this.fx.sparkle(Phaser.Math.Clamp(fighter.x, 30, this.W - 30), Phaser.Math.Clamp(fighter.y, 30, this.H - 30), 0xffdf78);
    }
    AudioManager.sfx('defeat', { volume: 0.4 });
    if (!this.human.stocks && !this.cpu.stocks) { this.startOvertime(); return; }
    if (!this.human.stocks || !this.cpu.stocks) { this.finish(this.cpu.stocks === 0); return; }
    for (const fighter of out) this.respawn(fighter);
    this.showBanner(out.length === 2 ? 'DOUBLE RING-OUT' : out[0].isCpu ? 'RETURN TO SENDER!' : 'TAIL WARRANTY CLAIMED.', 1300);
    this.persistMatch();
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
    const timed = this.timed && !this.suddenDeath;
    this.humanHud.setText(`${this.human.courier.name}  /  YOU\n${timed ? `${this.knockedOut} KOs` : `${this.human.stocks} STOCKS`}   ${Math.floor(this.human.damage)}%`);
    this.cpuHud.setText(`${this.cpu.courier.name}  /  CPU\n${timed ? `${this.cpuKOs} KOs` : `${this.cpu.stocks} STOCKS`}   ${Math.floor(this.cpu.damage)}%`);
    const remaining = Math.max(0, Math.ceil((this.matchLength - this.elapsedMs) / 1000));
    this.timerHud.setText(this.suddenDeath ? 'SUDDEN\nDELIVERY' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
  }
  private finish(won: boolean): void {
    if (this.ended) return; this.ended = true; this.physics.pause();
    SaveManager.recordBrawl(won, this.knockedOut);
    AudioManager.sfx(won ? 'life' : 'defeat', { volume: 0.5 });
    this.time.delayedCall(500, () => this.scene.start('BrawlResults', { won, options: this.options, knockouts: this.knockedOut, cpuKOs: this.cpuKOs, suddenDeath: this.suddenDeath, elapsedMs: this.elapsedMs }));
  }
  persistMatch(): void {
    if (this.ended || !this.human || !this.cpu) return;
    SaveManager.saveBrawlRun({ ...this.options, playerKOs: this.knockedOut, cpuKOs: this.cpuKOs, suddenDeath: this.suddenDeath, playerStocks: this.human.stocks, cpuStocks: this.cpu.stocks, playerDamage: this.human.damage, cpuDamage: this.cpu.damage, elapsedMs: this.elapsedMs });
  }
  pauseForApp(): void {
    if (this.ended || !this.scene.isActive()) return;
    this.persistMatch(); this.inputMgr.reset(); this.scene.launch('BrawlPause', { options: this.options }); this.scene.pause();
  }
  private resumeMatch(): void { this.inputMgr.reset(); }
  private cleanup(): void {
    this.persistMatch(); this.inputMgr.destroy(); this.fx.destroy();
    this.events.off('brawl-swing', this.swing, this); this.events.off('brawl-parry', this.parry, this); this.events.off('brawl-hit', this.hit, this);
    this.events.off(Phaser.Scenes.Events.RESUME, this.resumeMatch, this); this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeArena, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.appPause); this.game.events.off(Phaser.Core.Events.HIDDEN, this.appPause); window.removeEventListener('pagehide', this.appPause);
  }
}
