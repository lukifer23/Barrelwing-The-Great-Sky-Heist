import { playTime } from '../systems/PlayClock';
import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager';

type BossState =
  | 'dormant' | 'enter' | 'hover' | 'telegraph' | 'sweep' | 'breath' | 'barrels' | 'gust'
  | 'vulnerable' | 'transition' | 'defeated';

export interface BossArena {
  left: number;
  right: number;
  top: number;
  floorY: number;
}

/**
 * The Storm Baron. A three-phase dragon encounter with telegraphed attacks
 * and explicit vulnerable windows.
 */
export class Boss extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  hp = 6;
  maxHp = 6;
  phase = 1;
  bossState: BossState = 'dormant';
  private arena: BossArena;
  private stateUntil = 0;
  private attackQueue: string[] = [];
  private hitsThisPhase = 0;
  private vulnerableHit = false;
  private hoverTween?: Phaser.Tweens.Tween;
  private facing = -1;
  private sweepDir = -1;
  private sweepY = 0;
  private flame?: Phaser.GameObjects.Sprite;
  private lastContact = 0;
  private homeX = 0;
  private homeY = 0;
  bossActive = true;

  constructor(scene: Phaser.Scene, x: number, y: number, arena: BossArena, startPhase = 1) {
    super(scene, x, y, 'boss_idle_sheet', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.arena = arena;
    this.phase = Phaser.Math.Clamp(startPhase, 1, 3);
    this.hp = (4 - this.phase) * 2;
    this.maxHp = this.hp;
    this.setOrigin(0.28, 0.92);
    this.setScale(2);
    this.body.setSize(54, 44);
    this.body.setOffset(12, 18);
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.setDepth(26);
    this.play('boss-idle');
    this.setFlipX(false);
    this.stateUntil = playTime(scene) + 1800;
    this.homeX = x;
    this.homeY = y;
  }

  get engaged(): boolean { return this.bossState !== 'dormant'; }

  private engage(time: number): void {
    this.bossState = 'enter';
    this.stateUntil = time + 1600;
    this.scene.events.emit('boss-enter', this.maxHp);
    // dramatic fly-in from beyond the arena
    this.x = this.arena.right + 110;
    this.y = this.arena.floorY - 150;
    this.setAlpha(0.35);
    this.scene.tweens.add({
      targets: this, x: this.homeX, y: this.homeY, alpha: 1,
      duration: 1050, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.hoverTween = this.scene.tweens.add({
          targets: this, y: this.homeY - 12, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      },
    });
    this.shake(500, 0.004);
  }

  updateBoss(time: number, dt: number, player: Phaser.Physics.Arcade.Sprite): void {
    if (!this.bossActive) return;
    if (this.bossState === 'defeated') return;
    if (this.bossState === 'dormant') {
      if (Math.abs(player.x - this.x) < 300) this.engage(time);
      else return;
    }

    switch (this.bossState) {
      case 'enter':
        if (time > this.stateUntil) this.beginHover(time);
        break;

      case 'hover':
        this.face(player);
        if (time > this.stateUntil) this.nextAttack(time, player);
        break;

      case 'telegraph':
        this.face(player);
        this.setTint(Math.sin(time / 55) > 0 ? 0xffb0a0 : 0xffffff);
        if (time > this.stateUntil) {
          this.clearTint();
          this.launchAttack(time, player);
        }
        break;

      case 'sweep':
        this.body.velocity.x = this.sweepDir * 260;
        this.body.velocity.y = (this.sweepY - this.y) * 4;
        if (time > this.stateUntil || (this.sweepDir < 0 && this.x < this.arena.left + 24) || (this.sweepDir > 0 && this.x > this.arena.right - 24)) {
          this.body.velocity.set(0, 0);
          this.endAttack(time);
        }
        break;

      case 'breath':
        this.body.velocity.set(0, 0);
        if (this.flame) {
          this.flame.setPosition(this.x + this.facing * 74, this.y - 26);
          if (time % 120 < 20) this.scene.events.emit('boss-flame-puff', this.flame.x, this.flame.y, this.facing);
        }
        if (time > this.stateUntil) {
          this.flame?.destroy();
          this.flame = undefined;
          this.endAttack(time);
        }
        break;

      case 'barrels':
        this.body.velocity.set(0, 0);
        if (time > this.stateUntil) {
          this.body.setVelocity(0, 0);
          this.endAttack(time);
        }
        break;

      case 'gust':
        this.body.velocity.set(0, 0);
        if (time > this.stateUntil) this.endAttack(time);
        break;

      case 'vulnerable':
        this.body.velocity.set(0, 0);
        this.setY(Phaser.Math.Linear(this.y, this.arena.floorY - 14, 0.18));
        this.setTint(Math.sin(time / 120) > 0 ? 0xffe9a0 : 0xffffff);
        if (time > this.stateUntil) {
          this.clearTint();
          this.setTint(0xffffff);
          if (this.hitsThisPhase >= 2) {
            if (this.phase >= 3) this.defeat();
            else this.startTransition(time);
          } else {
            this.beginHover(time);
          }
        }
        break;

      case 'transition':
        this.body.velocity.set(0, 0);
        if (time > this.stateUntil) {
          this.setTint(0xffb0a0);
          this.scene.time.delayedCall(220, () => this.clearTint());
          this.beginHover(time);
        }
        break;
    }

    // Contact damage outside vulnerable state (and never stacks every frame).
    if (this.bossState !== 'vulnerable' && time - this.lastContact > 900) {
      const b = this.body;
      const p = player.body;
      if (b && p && Phaser.Geom.Intersects.RectangleToRectangle(
        new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height),
        new Phaser.Geom.Rectangle(p.x, p.y, p.width, p.height),
      )) {
        this.lastContact = time;
        this.scene.events.emit('boss-hit-player', this.x);
      }
    }
  }

  private face(player: Phaser.Physics.Arcade.Sprite): void {
    this.facing = player.x < this.x ? -1 : 1;
    this.setFlipX(this.facing > 0);
  }

  private beginHover(time: number): void {
    this.hoverTween?.remove();
    this.scene.tweens.killTweensOf(this);
    this.body.velocity.set(0, 0);
    this.bossState = 'hover';
    this.stateUntil = time + 620;
    this.setTint(0xffffff);
    this.scene.tweens.add({
      targets: this, y: this.arena.floorY - 76 - Math.random() * 20, duration: 500, ease: 'Sine.easeInOut',
    });
  }

  private nextAttack(time: number, player: Phaser.Physics.Arcade.Sprite): void {
    if (this.attackQueue.length === 0) {
      this.attackQueue = this.phase === 1
        ? ['sweep', 'gust', 'sweep']
        : this.phase === 2
          ? ['barrels', 'sweep', 'breath', 'sweep']
          : ['breath', 'sweep', 'gust', 'barrels'];
    }
    const attack = this.attackQueue.shift()!;
    this.bossState = 'telegraph';
    this.stateUntil = time + (this.phase === 3 ? 460 : 620);
    this.scene.events.emit('boss-telegraph', attack);
    this.scene.events.emit('sfx', 'bump', { volume: 0.2, rate: 0.7 });
    this.pendingAttack = attack;
  }

  private pendingAttack = 'sweep';

  private launchAttack(time: number, player: Phaser.Physics.Arcade.Sprite): void {
    this.clearTint();
    const attack = this.pendingAttack;
    if (attack === 'sweep') {
      this.bossState = 'sweep';
      this.play('boss-tail', true);
      this.sweepDir = player.x < this.x ? -1 : 1;
      this.sweepY = player.y - 24;
      this.stateUntil = time + 1400;
      this.scene.events.emit('sfx', 'throw', { volume: 0.4, rate: 0.7 });
      this.scene.events.emit('boss-sweep', this.x, this.sweepY, this.sweepDir);
    } else if (attack === 'breath') {
      this.bossState = 'breath';
      this.stateUntil = time + 1100;
      this.play('boss-breath', true);
      this.flame = this.scene.add.sprite(this.x + this.facing * 74, this.y - 26, 'fireball')
        .setScale(2.2).setFlipX(this.facing > 0).setDepth(27);
      this.flame.play('fireball-fly');
      this.scene.events.emit('boss-breath-start', this.x, this.y, this.facing);
      this.scene.events.emit('sfx', 'magic', { volume: 0.45, rate: 0.6 });
      this.scene.time.delayedCall(1100, () => { if (this.bossActive && this.bossState === 'breath') this.play('boss-idle', true); });
    } else if (attack === 'barrels') {
      this.bossState = 'barrels';
      this.stateUntil = time + 2100;
      this.scene.events.emit('boss-barrage');
      for (let i = 0; i < 5; i++) {
        this.scene.time.delayedCall(220 + i * 300, () => {
          if (this.bossActive && this.bossState === 'barrels') {
            const x = Phaser.Math.Between(this.arena.left + 40, this.arena.right - 40);
            this.scene.events.emit('boss-barrel', x, this.arena.top + 30);
          }
        });
      }
    } else if (attack === 'gust') {
      this.bossState = 'gust';
      this.stateUntil = time + 1200;
      this.scene.events.emit('boss-gust', this.x, this.y, this.facing);
      for (let i = 0; i < 3; i++) {
        this.scene.time.delayedCall(i * 180, () => {
          if (this.bossActive && this.bossState === 'gust') {
            this.scene.events.emit('boss-bolt', this.x + this.facing * 40, this.y - 10 + (i - 1) * 22, this.facing);
          }
        });
      }
      this.scene.events.emit('sfx', 'throw', { volume: 0.35, rate: 1.1 });
    }
  }

  private endAttack(time: number): void {
    this.setTexture('boss_idle_sheet');
    this.play('boss-idle', true);
    this.attackCount++;
    // Two attacks, then a vulnerable window.
    if (this.attackCount % 2 === 0) {
      this.makeVulnerable(time);
    } else {
      this.beginHover(time);
    }
  }

  private attackCount = 0;

  private makeVulnerable(time: number): void {
    this.bossState = 'vulnerable';
    this.stateUntil = time + (this.phase === 3 ? 2300 : 2800);
    this.vulnerableHit = false;
    this.scene.tweens.add({ targets: this, x: (this.arena.left + this.arena.right) / 2, duration: 550, ease: 'Sine.easeInOut' });
    this.scene.events.emit('boss-vulnerable', true);
    this.scene.events.emit('sfx', 'magic', { volume: 0.3, rate: 1.4 });
  }

  private startTransition(time: number): void {
    if (this.phase >= 3) {
      this.defeat();
      return;
    }
    this.bossState = 'transition';
    this.stateUntil = time + 1500;
    this.phase++;
    this.hitsThisPhase = 0;
    this.attackCount = 0;
    this.attackQueue = [];
    this.body.velocity.set(0, 0);
    this.scene.events.emit('boss-phase', this.phase);
    this.scene.events.emit('sfx', 'magic', { volume: 0.5, rate: 0.6 });
    this.shake(400, 0.006);
    this.setTint(0xff8a8a);
    this.scene.tweens.add({ targets: this, scaleX: 2.2, scaleY: 1.8, duration: 220, yoyo: true });
    this.scene.time.delayedCall(1500, () => {
      if (this.bossActive) { this.clearTint(); this.setScale(2); }
    });
  }

  /** Called by the scene when the player lands a valid hit. */
  takeHit(source: 'stomp' | 'dash'): boolean {
    if (this.bossState !== 'vulnerable' || this.vulnerableHit) return false;
    this.vulnerableHit = true;
    this.hp = Math.max(0, this.hp - 1);
    this.hitsThisPhase++;
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(90, () => this.clearTint());
    this.scene.events.emit('boss-damaged', this.hp, source);
    this.scene.events.emit('fx-defeat', this.x, this.y - 30);
    this.scene.events.emit('sfx', 'stomp', { volume: 0.55, rate: 0.7 });
    this.shake(220, 0.007);
    this.body.velocity.y = 60;
    if (this.hp <= 0) {
      this.defeat();
      return true;
    }
    this.stateUntil = Math.min(this.stateUntil, playTime(this.scene) + 520);
    return true;
  }

  defeat(): void {
    if (this.bossState === 'defeated') return;
    this.bossState = 'defeated';
    this.bossActive = false;
    this.body.enable = false;
    this.hoverTween?.remove();
    this.setTint(0xffd9a0);
    this.play('boss-breath', true);
    this.scene.events.emit('boss-defeated');
    this.shake(900, 0.012);
    this.scene.tweens.add({
      targets: this, angle: 26, y: this.arena.floorY - 26, alpha: 0.25,
      duration: 1900, ease: 'Cubic.easeIn',
      onComplete: () => { this.setVisible(false); },
    });
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(160 + i * 170, () => {
        this.scene.events.emit('fx-defeat', this.x + Phaser.Math.Between(-40, 40), this.y + Phaser.Math.Between(-30, 20));
        this.scene.events.emit('sfx', 'defeat', { volume: 0.4, rate: 0.8 + Math.random() * 0.4 });
      });
    }
  }

  private shake(duration: number, intensity: number): void {
    const s = SaveManager.get().settings;
    if (!s.reducedMotion && s.shake > 0) this.scene.cameras.main.shake(duration, intensity * s.shake);
  }

  restoreProgress(hp: number, phase: number): void {
    this.hp = Phaser.Math.Clamp(hp, 1, this.maxHp);
    this.phase = Phaser.Math.Clamp(phase, 1, 3);
    this.hitsThisPhase = Math.max(0, (4 - this.phase) * 2 - this.hp);
  }

  resetEncounter(): void {
    this.scene.tweens.killTweensOf(this);
    this.hoverTween?.remove();
    this.flame?.destroy(); this.flame = undefined;
    this.body.reset(this.homeX, this.homeY);
    this.body.velocity.set(0, 0);
    this.bossState = 'dormant';
    this.clearTint(); this.setScale(2).setAlpha(1).setAngle(0);
    this.play('boss-idle', true);
  }

  destroyBoss(): void {
    this.hoverTween?.remove();
    this.flame?.destroy();
    this.destroy();
  }
}
