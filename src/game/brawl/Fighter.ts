import Phaser from 'phaser';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { AudioManager } from '../systems/AudioManager';

export interface FightInput { move: number; jump: boolean; heldJump: boolean; dash: boolean; attack: boolean; aim: number }
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
  private groundAt = -9999;
  private lastAnimation = '';

  constructor(scene: Phaser.Scene, x: number, y: number, readonly id: CharacterId, readonly isCpu: boolean) {
    super(scene, x, y, CHARACTERS[id].sheet, 0);
    this.courier = CHARACTERS[id];
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 35 / 45).setDepth(20).setScale(1.25);
    this.body.setSize(18, 24).setOffset(19, 11).setMaxVelocity(800, 650);
    this.play(`${this.courier.sheet}-idle`);
  }

  get grounded(): boolean { return this.body.blocked.down || this.body.touching.down; }
  get now(): number { return this.scene.time.now; }
  get attacking(): boolean { const t = this.now - this.attackAt; return t >= 65 && t <= 190; }

  updateFighter(dtMs: number, input: FightInput): void {
    const now = this.now, dt = dtMs / 1000;
    if (this.stocks <= 0) return;
    if (this.grounded) { this.airJumps = 2; this.groundAt = now; }
    this.setAlpha(now < this.invulnerableUntil ? 0.45 + Math.abs(Math.sin(now / 75)) * 0.5 : 1);
    if (now >= this.stunUntil) {
      if (Math.abs(input.move) > 0.1) {
        this.facing = Math.sign(input.move); this.setFlipX(this.facing < 0);
      }
      const target = input.move * 180 * this.courier.speed;
      if (now < this.dashUntil) this.body.velocity.x = this.facing * 390;
      else this.body.velocity.x = Phaser.Math.Linear(this.body.velocity.x, target, 1 - Math.exp(-(this.grounded ? 18 : 8) * dt));
      if (input.jump && now >= this.jumpReady) {
        if (now - this.groundAt < 100) {
          this.body.velocity.y = -340; this.groundAt = -9999;
        } else if (this.airJumps > 0) { this.airJumps--; this.body.velocity.y = -285; }
        this.jumpReady = now + 160;
        AudioManager.sfx('flap', { volume: this.isCpu ? 0.1 : 0.25 });
      }
      if (input.dash && now >= this.dashReady) {
        this.dashUntil = now + 120; this.dashReady = now + 1000;
        this.body.velocity.x = this.facing * 390; this.body.velocity.y = Math.min(this.body.velocity.y, 0);
        AudioManager.sfx('throw', { volume: 0.2 });
      }
      if (input.attack && now >= this.attackReady) {
        this.attackAt = now; this.attackAim = input.aim; this.hitThisSwing = false;
        this.attackReady = now + (this.id === 'fenn' ? 360 : this.id === 'mallow' ? 570 : 450);
        this.scene.events.emit('brawl-swing', this);
        AudioManager.sfx('throw', { volume: 0.2, rate: 1.4 });
      }
      if (!input.heldJump && this.body.velocity.y < -50) this.body.velocity.y += 700 * dt;
    }
    let animation = this.grounded ? Math.abs(this.body.velocity.x) > 20 ? 'run' : 'idle' : '';
    if (now < this.stunUntil) animation = 'hurt';
    if (animation) {
      const key = `${this.courier.sheet}-${animation}`;
      if (key !== this.lastAnimation || !this.anims.isPlaying) { this.play(key, true); this.lastAnimation = key; }
    } else { this.anims.stop(); this.setFrame(this.body.velocity.y < 0 ? 14 : 17); this.lastAnimation = ''; }
    this.rotation = Phaser.Math.Linear(this.rotation, now < this.stunUntil ? this.facing * -0.22 : 0, 1 - Math.exp(-14 * dt));
  }

  strike(target: Fighter, suddenDeath: boolean): boolean {
    if (!this.attacking || this.hitThisSwing || target.now < target.invulnerableUntil || target.stocks <= 0) return false;
    const reachX = this.attackAim === 0 ? 64 : 42;
    const x = this.x + (this.attackAim === 0 ? this.facing * 28 : 0);
    const y = this.y - 16 + (this.attackAim < 0 ? -30 : this.attackAim > 0 ? 24 : 0);
    if (Math.abs(target.x - x) > reachX || Math.abs(target.y - 16 - y) > 48) return false;
    this.hitThisSwing = true;
    target.damage += this.id === 'mallow' ? 13 : this.id === 'fenn' ? 8 : 10;
    const weight = target.id === 'mallow' ? 1.18 : target.id === 'fenn' ? 0.92 : 1;
    const force = (suddenDeath ? 640 : 160 + target.damage * 4.1) / weight;
    const dir = target.x >= this.x ? 1 : -1;
    target.body.velocity.set(this.attackAim === 0 ? dir * force : dir * force * 0.45, this.attackAim < 0 ? -force * 1.1 : this.attackAim > 0 ? force * 0.8 : -100 - force * 0.40);
    target.stunUntil = target.now + Math.min(450, 160 + target.damage * 1.4);
    target.invulnerableUntil = target.now + 280;
    target.scene.events.emit('brawl-hit', target);
    AudioManager.sfx('stomp', { volume: 0.35, rate: 1 + target.damage / 350 });
    return true;
  }

  receiveHazard(dir: number): boolean {
    if (this.now < this.invulnerableUntil || this.stocks <= 0) return false;
    this.damage += 8;
    this.body.velocity.set(dir * (140 + this.damage * 2), -190);
    this.stunUntil = this.now + 180; this.invulnerableUntil = this.now + 600;
    return true;
  }

  respawn(x: number, y: number): void {
    this.damage = 0; this.airJumps = 2; this.body.reset(x, y); this.body.velocity.set(0, 0);
    this.body.setAllowGravity(true); this.body.enable = true; this.setVisible(true).setAngle(0);
    this.invulnerableUntil = this.now + 1700; this.stunUntil = 0; this.dashUntil = 0;
    this.attackAt = -9999; this.attackReady = this.now + 300;
  }
}
