import { playTime } from '../systems/PlayClock';
import Phaser from 'phaser';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { AudioManager } from '../systems/AudioManager';

export interface FightInput { move: number; jump: boolean; heldJump: boolean; dash: boolean; attack: boolean; aim: number; dashAim?: number; attackAim?: number }
export const neutralFightInput = (): FightInput => ({ move: 0, jump: false, heldJump: false, dash: false, attack: false, aim: 0 });

export class Fighter extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  readonly courier: typeof CHARACTERS[CharacterId];
  stocks = 3;
  damage = 0;
  facing = 1;
  airJumps = 2;
  invulnerableUntil = 0;
  attackAt = -9999;
  attackAim = 0;
  hitThisSwing = false;
  private stunUntil = 0;
  private attackReady = 0;
  private jumpReady = 0;
  private dashReady = 0;
  private dashUntil = 0;
  private guardUntil = 0;
  private liftSpent = false;
  private attackFacing = 1;
  private bufferedDashAim = 0;
  private readonly swingCue: Phaser.GameObjects.Ellipse;
  private groundAt = -9999;
  private lastAnimation = '';
  private bufferedJump = 0;
  private bufferedDash = 0;
  private bufferedAttack = 0;
  private bufferedAim = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly id: CharacterId, readonly isCpu: boolean) {
    super(scene, x, y, CHARACTERS[id].sheet, 0);
    this.courier = CHARACTERS[id];
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 35 / 45).setDepth(20).setScale(1.25);
    this.body.setSize(18, 24).setOffset(19, 11).setMaxVelocity(800, 650);
    this.play(`${this.courier.sheet}-idle`);
    const color = isCpu ? 0xff9f89 : 0x9ff5ff;
    this.swingCue = scene.add.ellipse(x, y, 60, 40, color, 0.12).setStrokeStyle(2, color, 0.9).setDepth(22).setVisible(false);
    this.once('destroy', () => this.swingCue.destroy());
  }

  get grounded(): boolean { return this.body.blocked.down || this.body.touching.down; }
  get now(): number { return playTime(this.scene); }
  get attackWindup(): number { return this.isCpu ? 200 : 65; }
  get attackCooldown(): number { return this.id === 'fenn' ? 360 : this.id === 'mallow' ? 570 : 450; }
  get attackProgress(): number { return Phaser.Math.Clamp(1 - (this.attackReady - this.now) / this.attackCooldown, 0, 1); }
  private get dashCooldown(): number { return this.id === 'clover' ? 1150 : 1000; }
  get dashProgress(): number { return Phaser.Math.Clamp(1 - (this.dashReady - this.now) / this.dashCooldown, 0, 1); }
  get stunned(): boolean { return this.now < this.stunUntil; }
  get guarding(): boolean { return this.now < this.guardUntil; }
  get canLift(): boolean { return !this.liftSpent; }
  get windingUp(): boolean { return this.now >= this.attackAt && this.now < this.attackAt + this.attackWindup; }
  get attacking(): boolean { const t = this.now - this.attackAt; return t >= this.attackWindup && t <= this.attackWindup + 125; }

  updateFighter(dtMs: number, input: FightInput): void {
    const now = this.now, dt = dtMs / 1000;
    if (this.stocks <= 0) return;
    if (input.jump) this.bufferedJump = now + 140;
    if (input.dash) { this.bufferedDash = now + 140; this.bufferedDashAim = input.dashAim ?? input.aim; }
    if (input.attack) { this.bufferedAttack = now + 160; this.bufferedAim = input.attackAim ?? input.aim; }
    if (this.grounded) { this.liftSpent = false; this.airJumps = 2; this.groundAt = now; }
    this.setAlpha(now < this.invulnerableUntil ? 0.45 + Math.abs(Math.sin(now / 75)) * 0.5 : 1);
    if (now >= this.stunUntil) {
      if (!this.guarding && !this.windingUp && !this.attacking && Math.abs(input.move) > 0.1) {
        this.facing = Math.sign(input.move); this.setFlipX(this.facing < 0);
      }
      const target = this.guarding ? 0 : input.move * 180 * this.courier.speed;
      if (now < this.dashUntil) this.body.velocity.x = this.facing * 390;
      else this.body.velocity.x = Phaser.Math.Linear(this.body.velocity.x, target, 1 - Math.exp(-(this.grounded ? 18 : 8) * dt));
      if (!this.guarding && this.bufferedJump > now && now >= this.jumpReady && (now - this.groundAt < 100 || this.airJumps > 0)) {
        this.bufferedJump = 0;
        if (now - this.groundAt < 100) {
          this.body.velocity.y = this.id === 'clover' ? -381 : -340; this.groundAt = -9999;
        } else if (this.airJumps > 0) { this.airJumps--; this.body.velocity.y = -285; }
        this.jumpReady = now + 160;
        AudioManager.sfx('flap', { volume: this.isCpu ? 0.1 : 0.25 });
      }
      if (this.bufferedDash > now && now >= this.dashReady) {
        this.bufferedDash = 0;
        if (this.bufferedDashAim > 0) {
          this.guardUntil = now + 220;
          this.dashReady = now + this.dashCooldown;
          this.attackAt = -9999;
          this.body.velocity.x *= 0.25;
        } else if (this.bufferedDashAim < 0 && this.canLift) {
          this.liftSpent = true;
          this.dashReady = now + this.dashCooldown;
          this.body.velocity.y = -380;
          this.body.velocity.x = this.facing * 85;
          AudioManager.sfx('flap', { volume: 0.35 });
        } else if (this.bufferedDashAim === 0) {
          this.dashUntil = now + 120; this.dashReady = now + this.dashCooldown;
          this.body.velocity.x = this.facing * 390; this.body.velocity.y = Math.min(this.body.velocity.y, 0);
          AudioManager.sfx('throw', { volume: 0.2 });
        }
      }
      if (!this.guarding && this.bufferedAttack > now && now >= this.attackReady) {
        this.bufferedAttack = 0;
        this.attackFacing = this.facing; this.attackAt = now; this.attackAim = this.bufferedAim; this.hitThisSwing = false;
        this.attackReady = now + this.attackCooldown;
        this.scene.events.emit('brawl-swing', this);
        AudioManager.sfx('throw', { volume: 0.2, rate: 1.4 });
      }
      if (!input.heldJump && this.body.velocity.y < -50) this.body.velocity.y += 700 * dt;
    }
    let animation = this.grounded ? Math.abs(this.body.velocity.x) > 20 ? 'run' : 'idle' : '';
    if (this.guarding || this.windingUp) animation = 'crouch';
    if (now < this.stunUntil) animation = 'hurt';
    if (animation) {
      const key = `${this.courier.sheet}-${animation}`;
      if (key !== this.lastAnimation || !this.anims.isPlaying) { this.play(key, true); this.lastAnimation = key; }
    } else { this.anims.stop(); this.setFrame(this.body.velocity.y < 0 ? 14 : 17); this.lastAnimation = ''; }
    this.rotation = Phaser.Math.Linear(this.rotation, now < this.stunUntil ? this.facing * -0.22 : 0, 1 - Math.exp(-14 * dt));
    this.updateCue();
  }

  private get strikeX(): number { return this.x + (this.attackAim === 0 ? this.attackFacing * 36 : 0); }
  private get strikeY(): number { return this.y - 16 + (this.attackAim < 0 ? -30 : this.attackAim > 0 ? 24 : 0); }

  private updateCue(): void {
    const guard = this.guarding;
    this.swingCue.setVisible(guard || this.windingUp || this.attacking && !this.hitThisSwing);
    if (!this.swingCue.visible) return;
    this.swingCue.setPosition(guard ? this.x : this.strikeX, guard ? this.y - 16 : this.strikeY);
    const width = guard ? 48 : this.attackAim === 0 ? 92 : 58;
    if (this.swingCue.width !== width) this.swingCue.setSize(width, guard ? 56 : this.attackAim === 0 ? 55 : 70);
    this.swingCue.setAlpha(guard || this.attacking ? 1 : 0.55);
  }

  canStrike(target: Fighter): boolean {
    if (!this.attacking || this.hitThisSwing || target.now < target.invulnerableUntil || target.stocks <= 0) return false;
    return Math.abs(target.x - this.strikeX) <= (this.attackAim === 0 ? 55 : 40)
      && Math.abs(target.y - 16 - this.strikeY) <= (this.attackAim === 0 ? 38 : 48);
  }

  landStrike(target: Fighter, suddenDeath: boolean): void {
    this.hitThisSwing = true;
    if (target.guarding) {
      this.stunUntil = this.now + 320;
      this.body.velocity.x = this.x < target.x ? -125 : 125;
      target.scene.events.emit('brawl-parry', target);
      return;
    }
    target.damage += this.id === 'mallow' ? 13 : this.id === 'fenn' ? 8 : 10;
    const weight = target.id === 'mallow' ? 1.18 : target.id === 'fenn' ? 0.92 : 1;
    const force = (suddenDeath ? 640 : 160 + target.damage * 4.1) / weight;
    const dir = target.x >= this.x ? 1 : -1;
    target.body.velocity.set(this.attackAim === 0 ? dir * force : dir * force * 0.45, this.attackAim < 0 ? -force * 1.1 : this.attackAim > 0 ? force * 0.8 : -100 - force * 0.40);
    target.stunUntil = target.now + Math.min(450, 160 + target.damage * 1.4);
    target.invulnerableUntil = target.now + 280;
    target.attackAt = -9999; target.hitThisSwing = true;
    target.scene.events.emit('brawl-hit', target);
    AudioManager.sfx('stomp', { volume: 0.35, rate: 1 + target.damage / 350 });
  }

  receiveHazard(dir: number): boolean {
    if (this.now < this.invulnerableUntil || this.stocks <= 0) return false;
    this.damage += 8;
    this.body.velocity.set(dir * (140 + this.damage * 2), -190);
    this.stunUntil = this.now + 180; this.invulnerableUntil = this.now + 600;
    this.attackAt = -9999; this.hitThisSwing = true;
    return true;
  }

  respawn(x: number, y: number): void {
    this.guardUntil = 0; this.liftSpent = false; this.swingCue.setVisible(false);
    this.damage = 0; this.airJumps = 2; this.body.reset(x, y); this.body.velocity.set(0, 0);
    this.body.setAllowGravity(true); this.body.enable = true; this.setVisible(true).setAngle(0);
    this.invulnerableUntil = this.now + 1700; this.stunUntil = 0; this.dashUntil = 0;
    this.attackAt = -9999; this.attackReady = this.now + 300;
    this.bufferedJump = 0; this.bufferedDash = 0; this.bufferedAttack = 0;
    this.jumpReady = 0; this.dashReady = 0; this.groundAt = -9999;
  }
}
