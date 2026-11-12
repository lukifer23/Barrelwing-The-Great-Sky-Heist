import { playTime } from '../systems/PlayClock';
import Phaser from 'phaser';

export type BarrelVariant = 'standard' | 'fast' | 'bouncing' | 'armored';

const TEX: Record<BarrelVariant, string> = {
  standard: 'barrel',
  fast: 'barrel_fast',
  bouncing: 'barrel',
  armored: 'barrel_iron',
};

export class Barrel extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  variant: BarrelVariant;
  dir: number;
  rolling = true;
  private bounceTimer = 0;
  private spawnedAt = 0;
  private dead = false;

  constructor(scene: Phaser.Scene, x: number, y: number, dir: number, variant: BarrelVariant = 'standard') {
    super(scene, x, y, TEX[variant], 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.variant = variant;
    this.dir = dir;
    this.setOrigin(0.5, 0.5);
    this.setDepth(16);
    this.body.setCircle(8, 1, 1);
    this.body.setBounce(variant === 'bouncing' ? 0.32 : 0.05);
    this.body.setDragX(0);
    this.body.setMaxVelocity(300, 500);
    this.body.setGravityY(0);
    const speed = variant === 'fast' ? 128 : variant === 'armored' ? 76 : 96;
    this.body.velocity.x = dir * speed;
    this.spawnedAt = playTime(scene);
    if (variant === 'bouncing') this.setTint(0xffd39a);
    if (variant === 'armored') this.setScale(1.06);
  }

  get indestructible(): boolean {
    return this.variant === 'armored';
  }

  updateBarrel(time: number, dt: number, killY: number): void {
    if (this.dead) return;
    if (time - this.spawnedAt > 16000 || this.y > killY || this.x < -80 || this.x > 20000) {
      this.destroy();
      return;
    }
    this.rotation += (this.body.velocity.x * dt) / 9;
    if (this.body.blocked.left) { this.dir = 1; this.body.velocity.x = Math.abs(this.body.velocity.x) * 0.8 + 20; }
    if (this.body.blocked.right) { this.dir = -1; this.body.velocity.x = -Math.abs(this.body.velocity.x) * 0.8 - 20; }
    if (this.variant === 'bouncing') {
      this.bounceTimer += dt * 1000;
      if (this.bounceTimer > 920 && (this.body.blocked.down || this.body.touching.down)) {
        this.bounceTimer = 0;
        this.body.velocity.y = -210;
      }
    }
    if (this.variant === 'fast') {
      this.setTint(Math.sin(time / 90) > 0 ? 0xffffff : 0xffe0a0);
    }
    this.setFlipX(false);
  }

  smash(): void {
    if (this.dead) return;
    this.dead = true;
    this.scene.events.emit('fx-dash', this.x, this.y, this.dir);
    this.scene.events.emit('fx-defeat', this.x, this.y);
    this.scene.events.emit('sfx', 'defeat', { volume: 0.35, rate: 1.2 });
    this.scene.events.emit('barrel-smash', this.x, this.y);
    this.destroy();
  }
}

/** Authored barrel dispenser. Warns before each release so patterns stay fair. */
export class BarrelSpawner {
  x: number;
  y: number;
  dir: -1 | 1;
  interval: number;
  variant: BarrelVariant;
  private nextAt: number;
  private warned = false;
  private scene: Phaser.Scene;
  private warnSprite: Phaser.GameObjects.Image;
  private barrelGroup: Phaser.GameObjects.Group;

  constructor(
    scene: Phaser.Scene,
    cfg: { x: number; y: number; dir: -1 | 1; interval: number; variant?: BarrelVariant; phase?: number },
    group: Phaser.GameObjects.Group,
  ) {
    this.scene = scene;
    this.x = cfg.x;
    this.y = cfg.y;
    this.dir = cfg.dir;
    this.interval = cfg.interval;
    this.variant = cfg.variant ?? 'standard';
    this.nextAt = playTime(scene) + (cfg.phase ?? 0) + 900;
    this.barrelGroup = group;
    this.warnSprite = scene.add.image(cfg.x, cfg.y - 8, 'fx_glow')
      .setTint(0xff7048).setDepth(17).setAlpha(0).setScale(1.6);
  }

  update(time: number): void {
    if (time > this.nextAt - 520 && time < this.nextAt) {
      const a = 0.16 + Math.abs(Math.sin(time / 60)) * 0.55;
      this.warnSprite.setAlpha(a);
      if (!this.warned) {
        this.warned = true;
        this.scene.events.emit('sfx', 'bump', { volume: 0.18, rate: 0.8 });
      }
    } else {
      this.warnSprite.setAlpha(0);
    }
    if (time > this.nextAt) {
      this.nextAt = time + this.interval;
      this.warned = false;
      const b = new Barrel(this.scene, this.x, this.y, this.dir, this.variant);
      this.barrelGroup.add(b);
      this.scene.events.emit('barrel-spawned', b);
      this.scene.events.emit('sfx', 'throw', { volume: 0.22, rate: 0.75 });
    }
  }

  destroy(): void {
    this.warnSprite.destroy();
  }
}
