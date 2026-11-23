import { playTime } from '../systems/PlayClock';
import Phaser from 'phaser';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { attackPose, FIGHT_STYLES, swipeFrame } from '../data/brawl';
import { FONT_SMALL } from '../config';
import { AudioManager } from '../systems/AudioManager';

export interface FightInput { move: number; face?: number; jump: boolean; heldJump: boolean; dash: boolean; attack: boolean; aim: number; dashAim?: number; attackAim?: number }
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
  private kickRefunded = false;
  private liftSpent = false;
  private attackFacing = 1;
  private bufferedDashAim = 0;
  private readonly swingCue: Phaser.GameObjects.Ellipse;
  private readonly swingArt: Phaser.GameObjects.Sprite;
  private readonly teamMarker: Phaser.GameObjects.Text;
  private lunged = false;
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
    this.swingArt = scene.add.sprite(x, y, 'slash-circular').setDepth(23).setVisible(false);
    this.teamMarker = scene.add.text(x, y, isCpu ? 'CPU' : 'P1', { fontFamily: FONT_SMALL, fontSize: '10px',
      color: isCpu ? '#ffb5a1' : '#b8f5ff', backgroundColor: '#101528', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1).setDepth(24);
    this.once('destroy', () => { this.swingCue.destroy(); this.swingArt.destroy(); this.teamMarker.destroy(); });
  }

  get grounded(): boolean { return this.body.blocked.down || this.body.touching.down; }
  get now(): number { return playTime(this.scene); }
  get attackWindup(): number { return this.isCpu ? 200 : 65; }
  get style() { return FIGHT_STYLES[this.id]; }
  get attackCooldown(): number { return this.style.cooldown; }
  face(direction: number): void {
    if (!direction || this.stunned || this.guarding || this.windingUp || this.attacking) return;
    this.facing = Math.sign(direction); this.setFlipX(this.facing < 0);
  }
  get attackProgress(): number { return Phaser.Math.Clamp(1 - (this.attackReady - this.now) / this.attackCooldown, 0, 1); }
  private get dashCooldown(): number { return this.id === 'clover' ? 1150 : 1000; }
  get dashProgress(): number { return Phaser.Math.Clamp(1 - (this.dashReady - this.now) / this.dashCooldown, 0, 1); }
  get stunned(): boolean { return this.now < this.stunUntil; }
  get guarding(): boolean { return this.now < this.guardUntil; }
  get canLift(): boolean { return !this.liftSpent; }
  get windingUp(): boolean { return this.now >= this.attackAt && this.now < this.attackAt + this.attackWindup; }
  get attacking(): boolean { const t = this.now - this.attackAt; return t >= this.attackWindup && t < this.attackWindup + this.style.activeMs; }

  updateFighter(dtMs: number, input: FightInput): void {
    const now = this.now, dt = dtMs / 1000;
    if (this.stocks <= 0) return;
    if (input.jump) this.bufferedJump = now + 140;
    if (input.dash) { this.bufferedDash = now + 140; this.bufferedDashAim = input.dashAim ?? input.aim; }
    if (input.attack) { this.bufferedAttack = now + 160; this.bufferedAim = input.attackAim ?? input.aim; }
    if (this.grounded) { this.kickRefunded = false; this.liftSpent = false; this.airJumps = 2; this.groundAt = now; }
    this.setAlpha(now < this.invulnerableUntil ? 0.45 + Math.abs(Math.sin(now / 75)) * 0.5 : 1);
    if (now >= this.stunUntil) {
      if (input.face || Math.abs(input.move) > 0.1) this.face(input.face || input.move);
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
        this.bufferedAttack = 0; this.lunged = false;
        this.attackFacing = this.facing; this.attackAt = now; this.attackAim = this.bufferedAim; this.hitThisSwing = false;
        this.attackReady = now + this.attackCooldown;
        this.scene.events.emit('brawl-swing', this);
        AudioManager.sfx('throw', { volume: 0.2, rate: 1.4 });
      }
      if (this.id === 'fenn' && this.attacking && this.attackAim === 0 && !this.lunged) {
        this.body.velocity.x = this.attackFacing * 270; this.lunged = true;
      }
      if (!input.heldJump && this.body.velocity.y < -50) this.body.velocity.y += 700 * dt;
    }
    this.animateFighter(dt);
    const label = this.isCpu && this.windingUp ? this.style.cue : this.isCpu ? 'CPU' : 'P1';
    if (this.teamMarker.text !== label) this.teamMarker.setText(label);
    this.teamMarker.setPosition(this.x + (this.isCpu ? 9 : -9), this.y - this.body.height - 6);
    this.updateCue();
  }

  private animateFighter(dt: number): void {
    const t = this.now - this.attackAt, style = this.style;
    const recovering = t >= this.attackWindup + style.activeMs && t < this.attackWindup + style.activeMs + 85;
    let angle = 0;
    let state = this.grounded ? Math.abs(this.body.velocity.x) > 20 ? 'run' : 'idle' : '';
    let frame = this.body.velocity.y < 0 ? 14 : 17;
    if (this.stunned) { state = 'hurt'; angle = -0.22 * this.facing; }
    else if (this.guarding) state = 'crouch';
    else if (this.windingUp || this.attacking || recovering) {
      state = '';
      const swing = Phaser.Math.Clamp((t - this.attackWindup) / style.activeMs, 0, 1);
      frame = attackPose(this.id, (t - this.attackWindup) / style.activeMs);
      angle = this.attackFacing * (this.windingUp ? -0.18 : recovering ? 0.08 : (this.attackAim || 1) * (0.18 + swing * 0.30));
    }
    if (state) {
      const key = `${this.courier.sheet}-${state}`;
      if (key !== this.lastAnimation || !this.anims.isPlaying) this.play(key, true);
      this.lastAnimation = key;
    } else { this.anims.stop(); this.setFrame(frame); this.lastAnimation = ''; }
    this.rotation = Phaser.Math.Linear(this.rotation, angle, 1 - Math.exp(-22 * dt));
  }

  private get strikeX(): number { return this.x + (this.attackAim === 0 ? this.attackFacing * this.style.reach : 0); }
  private get strikeY(): number { return this.y - 16 + (this.attackAim < 0 ? -30 : this.attackAim > 0 ? 24 : 0); }

  private updateCue(): void {
    const guard = this.guarding;
    this.swingCue.setVisible(guard || this.windingUp);
    if (this.swingCue.visible) {
      this.swingCue.setPosition(guard ? this.x : this.strikeX, guard ? this.y - 16 : this.strikeY);
      const width = guard ? 48 : this.attackAim === 0 ? this.style.radius * 2 : 58;
      if (width !== this.swingCue.width) this.swingCue.setSize(width, guard ? 56 : this.attackAim === 0 ? 55 : 70);
      this.swingCue.setAlpha(guard ? 1 : 0.45 + 0.45 * (this.now - this.attackAt) / this.attackWindup);
    }
    this.swingArt.setVisible(this.attacking && !guard);
    if (!this.swingArt.visible) return;
    const progress = (this.now - this.attackAt - this.attackWindup) / this.style.activeMs;
    const { key, frame } = swipeFrame(this.id, this.attackAim, progress);
    this.swingArt.setTexture(key, frame)
      .setTint(this.style.color).setPosition(this.strikeX, this.strikeY)
      .setFlip(this.attackFacing < 0, this.attackAim > 0).setDisplaySize(this.attackAim ? 56 : this.style.radius * 1.8, this.attackAim ? 68 : 52);
  }

  canStrike(target: Fighter): boolean {
    if (!this.attacking || this.hitThisSwing || target.now < target.invulnerableUntil || target.stocks <= 0) return false;
    return Math.abs(target.x - this.strikeX) <= (this.attackAim === 0 ? this.style.radius : 40)
      && Math.abs(target.y - 16 - this.strikeY) <= (this.attackAim === 0 ? 38 : 48);
  }

  landStrike(target: Fighter, suddenDeath: boolean): void {
    this.hitThisSwing = true;
    if (target.guarding) {
      this.stunUntil = this.now + 320;
      this.body.velocity.x = this.x < target.x ? -125 : 125;
      // Successful contact opens a counterattack. An empty guard still lasts
      // its full duration and both fighters spend the normal dash recharge.
      target.guardUntil = target.now;
      target.scene.events.emit('brawl-parry', target);
      return;
    }
    if (this.id === 'reed' && this.attackAim === 0 && !this.grounded && !this.kickRefunded && this.airJumps < 2) {
      this.kickRefunded = true;
      this.airJumps++;
    }
    target.damage += this.style.damage;
    if (this.id === 'clover' && this.attackAim > 0 && !this.grounded) this.body.velocity.y = -255;
    const weight = target.style.weight;
    const force = (suddenDeath ? 640 : 160 + target.damage * 4.1) / weight;
    const dir = target.x >= this.x ? 1 : -1;
    const launch = this.id === 'mallow' ? force * 1.11 : force;
    target.body.velocity.set(this.attackAim === 0 ? dir * launch : dir * launch * 0.45, this.attackAim < 0 ? -launch * 1.1 : this.attackAim > 0 ? launch * 0.8 : -100 - launch * 0.40);
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
    this.kickRefunded = false;
    this.guardUntil = 0; this.liftSpent = false; this.swingCue.setVisible(false); this.swingArt.setVisible(false);
    this.damage = 0; this.airJumps = 2; this.body.reset(x, y); this.body.velocity.set(0, 0);
    this.body.setAllowGravity(true); this.body.enable = true; this.setVisible(true).setAngle(0);
    this.invulnerableUntil = this.now + 1700; this.stunUntil = 0; this.dashUntil = 0;
    this.attackAt = -9999; this.attackReady = this.now + 300;
    this.bufferedJump = 0; this.bufferedDash = 0; this.bufferedAttack = 0;
    this.jumpReady = 0; this.dashReady = 0; this.groundAt = -9999;
  }
}
