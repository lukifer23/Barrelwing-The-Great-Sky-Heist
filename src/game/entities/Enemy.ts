import Phaser from 'phaser';
import type { EnemyKind } from '../data/levels/types';

export interface EnemyConfig {
  kind: EnemyKind;
  x: number;
  y: number;
  patrol?: number;
  amp?: number;
  speed?: number;
  tile?: number;
}

const STATS: Record<EnemyKind, { hp: number; sheet: string; anim: string; body: [number, number]; stompable: boolean; score: number }> = {
  slug: { hp: 1, sheet: 'slug', anim: 'slug-move', body: [18, 12], stompable: true, score: 60 },
  bee: { hp: 1, sheet: 'bee', anim: 'bee-fly', body: [18, 16], stompable: true, score: 80 },
  ant: { hp: 1, sheet: 'ant', anim: 'ant-run', body: [26, 18], stompable: true, score: 90 },
  hopper: { hp: 1, sheet: 'hopper', anim: 'hopper-idle', body: [20, 20], stompable: true, score: 70 },
  gator: { hp: 3, sheet: 'gator', anim: 'gator-walk', body: [30, 22], stompable: false, score: 220 },
  wisp: { hp: 2, sheet: 'wisp', anim: 'wisp-float', body: [26, 26], stompable: false, score: 150 },
  bird: { hp: 1, sheet: 'bird', anim: 'bird-fly', body: [18, 14], stompable: true, score: 100 },
  plant: { hp: 2, sheet: 'plant', anim: 'plant-idle', body: [18, 26], stompable: false, score: 120 },
  crawler: { hp: 1, sheet: 'slug', anim: 'slug-move', body: [18, 12], stompable: true, score: 75 },
  stormbee: { hp: 1, sheet: 'bee', anim: 'bee-fly', body: [18, 16], stompable: true, score: 95 },
  diver: { hp: 1, sheet: 'bird', anim: 'bird-fly', body: [18, 14], stompable: true, score: 120 },
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  kind: EnemyKind;
  hp: number;
  stompable: boolean;
  scoreValue: number;
  defeated = false;
  private anchorX: number;
  private anchorY: number;
  private patrolPx: number;
  private ampPx: number;
  private baseSpeed: number;
  private dir = 1;
  private timer = 0;
  private plantTimer = 0;
  private nextDiveAt = 0;
  private nextShotAt = 0;
  private aiState: 'patrol' | 'alert' | 'charge' | 'shoot' | 'hurt' = 'patrol';
  private stateUntil = 0;
  private hitUntil = 0;

  constructor(scene: Phaser.Scene, cfg: EnemyConfig) {
    const st = STATS[cfg.kind];
    super(scene, cfg.x, cfg.y, st.sheet, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.kind = cfg.kind;
    this.hp = st.hp;
    this.stompable = st.stompable;
    this.scoreValue = st.score;
    this.anchorX = cfg.x;
    this.anchorY = cfg.y;
    this.patrolPx = (cfg.patrol ?? 3) * (cfg.tile ?? 16);
    this.ampPx = cfg.amp ?? 22;
    this.baseSpeed = cfg.speed ?? (cfg.kind === 'ant' ? 48 : 32);
    this.dir = Math.random() < 0.5 ? -1 : 1;

    this.setOrigin(0.5, 1);
    this.body.setSize(Math.max(10, st.body[0] - 4), Math.max(10, st.body[1] - 2));
    this.body.setOffset((this.width - this.body.width) / 2, this.height - this.body.height);
    this.body.setAllowGravity(!this.isFlyer);
    this.body.setCollideWorldBounds(false);
    this.setDepth(15);
    this.play(st.anim);
    if (cfg.kind === 'gator') this.setScale(1.1);

    if (this.isFlyer) {
      this.body.setAllowGravity(false);
      if (cfg.kind === 'wisp') this.setAlpha(0.92);
    } else {
      this.body.setDragX(0);
    }
    if (cfg.kind === 'plant') {
      this.body.setAllowGravity(false);
      this.body.setImmovable(true);
    }
    if (cfg.kind === 'crawler') this.setTint(0xe8a36b);
    if (cfg.kind === 'stormbee') this.setTint(0xb7b0ff);
    if (cfg.kind === 'diver') this.setTint(0xffb0a0);
    this.setFlipX(this.dir < 0);
  }

  get isFlyer(): boolean {
    return this.kind === 'bee' || this.kind === 'wisp' || this.kind === 'bird' || this.kind === 'stormbee' || this.kind === 'diver';
  }

  get isArmored(): boolean {
    return this.kind === 'gator';
  }

  updateAI(time: number, dt: number, player: Phaser.Physics.Arcade.Sprite): void {
    if (this.defeated || !this.active) return;
    if (this.kind !== 'diver' && this.kind !== 'wisp' && time < this.stateUntil) {
      if (this.aiState === 'charge') {
        this.body.velocity.x = this.dir * 205;
        this.setFlipX(this.dir < 0);
      } else if (this.aiState === 'alert') {
        this.body.velocity.x = 0;
      }
      return;
    }

    if (time < this.hitUntil) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    switch (this.kind) {
      case 'slug':
      case 'hopper':
      case 'gator':
        this.patrol(time, dt, player);
        break;
      case 'plant':
        this.plantAI(time, dt);
        break;
      case 'ant':
        this.antAI(time, dx, dy, dist);
        break;
      case 'bee':
      case 'stormbee':
        this.beeAI(time, dt, dx, dy);
        break;
      case 'crawler':
        this.patrol(time, dt, player);
        break;
      case 'diver':
        this.diverAI(time, dt, dx, dy, dist);
        break;
      case 'bird':
        this.birdAI(time, dt, dx, dy, dist);
        break;
      case 'wisp':
        this.wispAI(time, dt, player, dist);
        break;
    }
  }

  private plantAI(time: number, dt: number): void {
    this.body.velocity.set(0, 0);
    this.plantTimer += dt;
    if (this.plantTimer > 2.1) {
      this.plantTimer = 0;
      this.play('plant-idle', true);
      this.scene.tweens.add({
        targets: this, scaleY: 1.3, y: this.y - 7, duration: 150,
        yoyo: true, hold: 120, ease: 'Quad.easeOut',
      });
      this.scene.time.delayedCall(130, () => {
        if (this.active) this.scene.events.emit('sfx', 'throw', { volume: 0.12, rate: 1.6 });
      });
    }
  }

  private patrol(time: number, dt: number, player: Phaser.Physics.Arcade.Sprite): void {
    if (this.kind === 'plant') {
      this.body.velocity.set(0, 0);
      return;
    }
    if (this.kind === 'hopper') {
      this.timer += dt;
      if (this.timer > 1.1 && this.grounded) {
        this.timer = 0;
        this.body.velocity.y = -230;
        this.body.velocity.x = this.dir * 65;
        this.play('hopper-jump', true);
        this.scene.time.delayedCall(650, () => { if (this.active) this.play('hopper-idle', true); });
      }
      if (this.grounded) {
        this.body.velocity.x *= 0.9;
      }
    } else {
      if (this.grounded && Math.abs(this.body.velocity.y) < 1) {
        this.body.velocity.x = this.dir * (this.kind === 'crawler' ? this.baseSpeed * (Math.sin(time / 420) > 0 ? 2.4 : 0.35) : this.baseSpeed);
      }
    }
    this.setFlipX(this.dir < 0);
    // authored patrol bounds + edge/wall turnaround
    if (this.x > this.anchorX + this.patrolPx) this.dir = -1;
    if (this.x < this.anchorX - this.patrolPx) this.dir = 1;
    if (this.body.blocked.left) this.dir = 1;
    if (this.body.blocked.right) this.dir = -1;
  }

  private antAI(time: number, dx: number, dy: number, dist: number): void {
    if (this.aiState === 'patrol') {
      this.body.velocity.x = this.dir * this.baseSpeed;
      this.setFlipX(this.dir < 0);
      if (this.x > this.anchorX + this.patrolPx) this.dir = -1;
      if (this.x < this.anchorX - this.patrolPx) this.dir = 1;
      if (dist < 128 && Math.abs(dy) < 40) {
        this.aiState = 'alert';
        this.stateUntil = time + 340;
        this.setTint(0xffb0a0);
        this.scene.time.delayedCall(340, () => this.clearTint());
      }
    } else if (this.aiState === 'alert') {
      this.dir = dx > 0 ? 1 : -1;
      this.setFlipX(this.dir < 0);
      this.aiState = 'charge';
      this.stateUntil = time + 620;
      this.scene.events.emit('sfx', 'throw', { volume: 0.16, rate: 1.7 });
    } else if (this.aiState === 'charge') {
      this.aiState = 'hurt';
      this.stateUntil = time + 500;
    } else if (this.aiState === 'hurt') {
      this.aiState = 'patrol';
    }
    if (this.body.blocked.left) this.dir = 1;
    if (this.body.blocked.right) this.dir = -1;
  }

  private beeAI(time: number, dt: number, dx: number, dy: number): void {
    const speed = this.kind === 'stormbee' ? 1.45 : 1;
    this.timer += dt * speed;
    const targetX = this.anchorX + Math.sin(this.timer * 0.9) * this.patrolPx;
    const targetY = this.anchorY + Math.sin(this.timer * 1.7) * this.ampPx;
    this.body.velocity.x = (targetX - this.x) * 1.6 * speed;
    this.body.velocity.y = (targetY - this.y) * 1.6 * speed;
    this.setFlipX(dx < 0);
    if (this.kind === 'stormbee' && time > this.nextShotAt && Math.abs(dx) < 220 && Math.abs(dy) < 100) {
      this.nextShotAt = time + 2800;
      this.setTint(0x9ff5ff);
      const targetX = this.x + dx, targetY = this.y + dy;
      this.scene.time.delayedCall(350, () => {
        if (!this.active || this.defeated) return;
        this.setTint(0xb7b0ff);
        this.scene.events.emit('enemy-projectile', this.x, this.y - 8, targetX, targetY);
      });
    }
  }

  private diverAI(time: number, dt: number, dx: number, dy: number, dist: number): void {
    if (this.aiState === 'hurt') {
      this.body.velocity.x *= 0.92;
      this.body.velocity.y = -90;
      if (time > this.stateUntil) this.aiState = 'patrol';
      return;
    }
    if (this.aiState === 'alert') {
      this.body.velocity.set(0, -12);
      if (time > this.stateUntil) {
        this.aiState = 'charge';
        this.stateUntil = time + 520;
        this.dir = dx > 0 ? 1 : -1;
      }
      return;
    }
    if (this.aiState === 'charge') {
      this.body.velocity.x = this.dir * 250;
      this.body.velocity.y = 210;
      if (time > this.stateUntil) {
        this.aiState = 'hurt';
        this.stateUntil = time + 750;
        this.nextDiveAt = time + 2400;
        this.clearTint();
        this.setTint(0xffb0a0);
      }
      return;
    }
    // patrol / hover
    this.timer += dt;
    this.body.velocity.x = Math.sin(this.timer * 1.3) * 24;
    this.body.velocity.y = Math.cos(this.timer * 1.9) * 18;
    this.setFlipX(dx < 0);
    if (time > this.nextDiveAt && dist < 200 && dy > -30) {
      this.aiState = 'alert';
      this.stateUntil = time + 380;
      this.setTint(0xff6a5a);
    }
  }

  private birdAI(time: number, dt: number, dx: number, dy: number, dist: number): void {
    this.timer += dt;
    this.body.setAllowGravity(false);
    if (dist < 150 && Math.abs(dy) < 70) {
      const tx = dx > 0 ? this.x + 60 : this.x - 60;
      const ty = this.y + Phaser.Math.Clamp(dy, -40, 40);
      this.body.velocity.x = (tx - this.x) * 0.9;
      this.body.velocity.y = (ty - this.y) * 2.1;
    } else {
      this.body.velocity.x = this.dir * this.baseSpeed * 1.4;
      this.body.velocity.y = Math.sin(this.timer * 2.2) * 34;
      if (this.x > this.anchorX + this.patrolPx * 2) this.dir = -1;
      if (this.x < this.anchorX - this.patrolPx * 2) this.dir = 1;
    }
    this.setFlipX(dx < 0);
  }

  private wispAI(time: number, dt: number, player: Phaser.Physics.Arcade.Sprite, dist: number): void {
    this.timer += dt;
    this.body.velocity.x = Math.sin(this.timer * 0.7) * 22 + (this.anchorX - this.x) * 0.4;
    this.body.velocity.y = Math.cos(this.timer * 1.1) * 16 + (this.anchorY - this.y) * 0.4;
    if (time > this.stateUntil) {
      this.stateUntil = time + 1900;
      if (dist < 280) {
        this.scene.events.emit('enemy-projectile', this.x, this.y + 4, player.x, player.y);
        this.scene.events.emit('sfx', 'magic', { volume: 0.14, rate: 1.5 });
      }
    }
    this.setAlpha(dist < 200 ? 1 : 0.7);
  }

  damage(amount = 1, fromX = this.x): boolean {
    if (this.defeated || this.scene.time.now < this.hitUntil) return false;
    this.hp -= amount;
    this.hitUntil = this.scene.time.now + 180;
    if (this.hp <= 0) {
      this.defeat();
      return true;
    }
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => { if (this.active) this.clearTint(); });
    this.body.velocity.x += (this.x < fromX ? -1 : 1) * 60;
    this.scene.events.emit('sfx', 'bump', { volume: 0.25, rate: 1.4 });
    return true;
  }

  defeat(): void {
    if (this.defeated) return;
    this.defeated = true;
    this.body.enable = false;
    this.scene.events.emit('fx-defeat', this.x, this.y - 10);
    this.scene.events.emit('sfx', 'stomp', { volume: 0.4, rate: 1.05 });
    this.scene.tweens.add({
      targets: this, alpha: 0, y: this.y - 22, scaleX: 1.4, scaleY: 1.4,
      duration: 300, ease: 'Cubic.easeOut', onComplete: () => this.destroy(),
    });
    this.scene.events.emit('enemy-defeated', this.scoreValue, this.x, this.y, this.getData('objectId'));
  }

  private get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }
}
