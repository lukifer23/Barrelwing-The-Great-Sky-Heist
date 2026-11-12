import Phaser from 'phaser';
import { PHYSICS, FLIGHT } from '../config';
import { SaveManager } from '../systems/SaveManager';
import type { InputManager } from '../systems/InputManager';

export type PlayerMode = 'normal' | 'climb' | 'flight';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  mode: PlayerMode = 'normal';
  hearts = 3;
  maxHearts = 3;
  powerDuration = 1;
  dashCooldown = 1;
  flapCharges = PHYSICS.maxFlaps;
  shield = false;
  swiftUntil = 0;
  magnetUntil = 0;
  tripleUntil = 0;
  private shieldAura?: Phaser.GameObjects.Sprite;
  invulnUntil = 0;
  controlLocked = false;
  victory = false;
  dead = false;

  private lastGroundedAt = -9999;
  private lastFlapAt = -9999;
  private lastAnim = '';
  private dashUntil = 0;
  private dashReadyAt = 0;
  private facing = 1;
  private hurtUntil = 0;
  private climbRect: Phaser.Geom.Rectangle | null = null;
  private flightBounds: Phaser.Geom.Rectangle | null = null;
  private wasGrounded = false;
  private stepTimer = 0;
  private squashTween?: Phaser.Tweens.Tween;
  private flapPoseUntil = 0;
  private trailTimer = 0;
  private climbPaws: Phaser.GameObjects.Image[] = [];
  private climbPhase = false;
  private climbPhaseAt = 0;
  dropThroughUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'pip', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.maxHearts = SaveManager.stats.maxHearts;
    this.hearts = this.maxHearts;
    this.powerDuration = SaveManager.stats.powerDuration;
    this.dashCooldown = SaveManager.stats.dashCooldown;
    this.setOrigin(0.5, 35 / 45);
    this.body.setSize(14, 24);
    this.body.setOffset(20, 11);
    this.body.setMaxVelocity(PHYSICS.dashSpeed, PHYSICS.maxFall);
    this.body.setGravityY(0);
    this.setDepth(20);
    this.setCollideWorldBounds(false);
    this.play('pip-idle');
  }

  get now(): number { return this.scene.time.now; }
  get isInvulnerable(): boolean { return this.now < this.invulnUntil; }
  get dashReady(): boolean { return this.now >= this.dashReadyAt; }
  get dashActive(): boolean { return this.now < this.dashUntil; }
  get maxFlapCharges(): number { return this.now < this.tripleUntil ? 3 : PHYSICS.maxFlaps; }
  get speedMultiplier(): number { return this.now < this.swiftUntil ? 1.35 : 1; }
  get magnetActive(): boolean { return this.now < this.magnetUntil; }
  get grounded(): boolean { return this.body.blocked.down || this.body.touching.down; }

  setFlightBounds(rect: Phaser.Geom.Rectangle | null): void {
    this.flightBounds = rect;
    if (rect) {
      this.mode = 'flight';
      this.body.setAllowGravity(true);
      this.body.setGravityY(FLIGHT.gravity - PHYSICS.gravity);
      this.body.setDragX(0);
      this.body.velocity.x = FLIGHT.forwardSpeed;
      this.setFrame(14);
    } else if (this.mode === 'flight') {
      this.mode = 'normal';
      this.body.setGravityY(0);
      this.setFrame(16);
    }
  }

  updatePlayer(dtMs: number, input: InputManager, ladders: Phaser.Geom.Rectangle[]): void {
    const dt = dtMs / 1000;
    const now = this.now;
    this.shieldAura?.setPosition(this.x, this.y - 18);

    if (this.dead || this.victory) {
      this.updateAnim();
      return;
    }

    if (this.mode === 'flight') {
      this.updateFlight(dtMs, input);
      this.updateAnim();
      return;
    }

    if (this.mode === 'climb') {
      this.updateClimb(dtMs, input, ladders);
      this.updateAnim();
      return;
    }

    // --- ground state tracking -------------------------------------------
    if (this.grounded) {
      this.lastGroundedAt = now;
      this.flapCharges = this.maxFlapCharges;
    }
    if (this.now >= this.tripleUntil && this.flapCharges > PHYSICS.maxFlaps) this.flapCharges = PHYSICS.maxFlaps;
    if (this.shieldAura) this.shieldAura.setPosition(this.x, this.y - 18);
    const coyote = now - this.lastGroundedAt < PHYSICS.coyoteMs;

    // --- horizontal movement ---------------------------------------------
    if (this.controlLocked) {
      this.body.setAccelerationX(0);
      this.body.setDragX(900);
    } else if (this.dashActive) {
      this.body.setAccelerationX(0);
      this.body.setDragX(0);
      this.body.velocity.x = this.facing * PHYSICS.dashSpeed;
    } else {
      const dir = input.horizontal;
      if (Math.abs(dir) > 0.1) {
        this.facing = Math.sign(dir);
        this.setFlipX(dir < 0);
        const maxRun = PHYSICS.runSpeed * this.speedMultiplier * Math.abs(dir);
        const accel = (this.grounded ? PHYSICS.groundAccel : PHYSICS.airAccel) * this.speedMultiplier;
        this.body.setAccelerationX(dir * accel);
        this.body.setDragX(0);
        if (Math.abs(this.body.velocity.x) > maxRun) {
          this.body.setAccelerationX(0);
          this.body.velocity.x = Phaser.Math.Linear(this.body.velocity.x, Math.sign(dir) * maxRun, 0.2);
        }
      } else {
        this.body.setAccelerationX(0);
        this.body.setDragX(this.grounded ? PHYSICS.groundDecel : PHYSICS.airDrag);
      }
    }

    // --- dash -------------------------------------------------------------
    if (input.consumeDash() && this.dashReady && !this.controlLocked) {
      this.dashUntil = now + PHYSICS.dashMs;
      this.dashReadyAt = now + PHYSICS.dashCooldownMs * this.dashCooldown;
      this.body.velocity.x = this.facing * PHYSICS.dashSpeed;
      this.body.velocity.y = Math.min(this.body.velocity.y, 30);
      this.scene.events.emit('fx-dash', this.x, this.y, this.facing);
      this.scene.events.emit('sfx', 'throw', { volume: 0.35, rate: 1.4 });
    }

    // --- jump -------------------------------------------------------------
    if (input.jumpBufferMs > 0 && !this.controlLocked) {
      if (coyote && !this.dashActive) {
        input.consumeJump();
        this.jump();
      } else if (this.flapCharges > 0 && now - this.lastFlapAt > PHYSICS.flapCooldownMs) {
        input.consumeJump();
        this.flap();
      } else if (coyote) {
        input.consumeJump();
        this.jump();
      }
    }

    // variable jump height: releasing early adds extra gravity while rising
    if (!input.jumpHeld && this.body.velocity.y < 0) {
      this.body.velocity.y += PHYSICS.jumpCutGravity * dt;
    }

    // drop through one-way platforms
    if (input.down && this.grounded && !this.controlLocked) {
      this.dropThroughUntil = now + 240;
      this.y += 2;
      this.lastGroundedAt = -9999;
    }

    // --- ladders ----------------------------------------------------------
    const inLadder = this.findLadder(ladders);
    if (inLadder && !this.controlLocked) {
      const wantsUp = input.up;
      const wantsDown = input.down;
      if (wantsUp || wantsDown) {
        this.mode = 'climb';
        this.climbRect = inLadder;
        this.ensureClimbPaws();
        if (wantsDown && this.y <= inLadder.top + 12) this.y = inLadder.top + 12;
        this.setDepth(7);
        this.setFlipX(false);
        this.body.setAllowGravity(false);
        this.body.velocity.set(0, 0);
        this.body.setAcceleration(0, 0);
        this.body.setDrag(0, 0);
        this.x = Phaser.Math.Linear(this.x, inLadder.centerX, 0.5);
      }
    }

    // landing feedback
    if (this.grounded && !this.wasGrounded && this.body.velocity.y >= 0) {
      this.squash(1.14, 0.86);
      this.scene.events.emit('fx-dust', this.x, this.y, 5);
      this.scene.events.emit('sfx', 'land', { volume: 0.28, rate: 1.1 });
    }
    if (this.grounded && Math.abs(this.body.velocity.x) > 40) {
      this.stepTimer += dtMs;
      if (this.stepTimer > 210) {
        this.stepTimer = 0;
        this.scene.events.emit('fx-step', this.x - this.facing * 5, this.y, this.facing);
      }
    }
    this.wasGrounded = this.grounded;

    this.updateAnim();
  }

  private updateFlight(dtMs: number, input: InputManager): void {
    const now = this.now;
    if (this.flightBounds) {
      // keep the bird inside the channel
      const b = this.flightBounds;
      if (this.y < b.top + 24) { this.y = b.top + 24; this.body.velocity.y = Math.max(0, this.body.velocity.y); }
      if (this.y > b.bottom - 4) { this.y = b.bottom - 4; this.body.velocity.y = Math.min(0, this.body.velocity.y); }
      this.body.velocity.x = FLIGHT.forwardSpeed;
    }
    if (input.consumeJump() && now - this.lastFlapAt > FLIGHT.minFlapGapMs) {
      this.body.velocity.y = Math.max(FLIGHT.maxRise, this.body.velocity.y + FLIGHT.flapImpulse);
      this.lastFlapAt = now;
      this.setFrame(14);
      this.flapPoseUntil = now + 130;
      this.scene.events.emit('fx-gust', this.x, this.y, this.facing, true);
      this.scene.events.emit('sfx', 'flap', { volume: 0.45, rate: 1.05 });
      this.scene.events.emit('player-flap', true);
    }
  }

  private updateClimb(dtMs: number, input: InputManager, ladders: Phaser.Geom.Rectangle[]): void {
    const rect = this.climbRect;
    if (!rect) { this.exitClimb(); return; }
    const still = ladders.some(l => Phaser.Geom.Rectangle.Contains(l, this.x, this.y - 10));
    if (!still && !input.up && !input.down) { this.exitClimb(); return; }
    this.body.setAllowGravity(false);
    this.body.setAcceleration(0, 0);
    this.body.velocity.x = 0;
    this.x = Phaser.Math.Linear(this.x, rect.centerX, 0.35);
    const vy = input.up ? -PHYSICS.climbSpeed : input.down ? PHYSICS.climbSpeed : 0;
    this.body.velocity.y = vy;
    if (vy !== 0) {
      this.stepTimer += dtMs;
      if (this.stepTimer > 260) {
        this.stepTimer = 0;
        this.scene.events.emit('fx-dust', this.x + (Math.random() < 0.5 ? -5 : 5), this.y - 18, 1);
        this.scene.events.emit('sfx', 'bump', { volume: 0.1, rate: 1.8 });
      }
      if (this.now > this.climbPhaseAt) {
        this.climbPhaseAt = this.now + 170;
        this.climbPhase = !this.climbPhase;
      }
      this.setRotation(0);
      this.climbPaws.forEach((paw, i) => {
        const onLeft = i === 0;
        const lift = (this.climbPhase === onLeft) ? -6 : 4;
        paw.setPosition(rect.centerX + (onLeft ? -8 : 8), this.y - 16 + lift).setVisible(true).setAlpha(1);
      });
    } else {
      this.setRotation(0);
      this.climbPaws.forEach((paw, i) => paw.setPosition(rect.centerX + (i === 0 ? -8 : 8), this.y - 14).setVisible(true).setAlpha(0.9));
    }
    // jump off the ladder
    if (input.consumeJump()) {
      this.exitClimb();
      this.body.velocity.y = PHYSICS.jumpVelocity * 0.9;
      this.scene.events.emit('sfx', 'jump', { volume: 0.35, rate: 1.1 });
    }
    // reached the top: step off onto the platform
    if (this.y <= rect.top + 6) {
      this.y = rect.top - 1;
      this.exitClimb();
      this.body.velocity.y = 0;
      this.body.velocity.x = this.facing * 60;
    }
    if (this.y >= rect.bottom - 2) {
      this.y = rect.bottom - 2;
      this.exitClimb();
    }
  }

  private ensureClimbPaws(): void {
    if (this.climbPaws.length) return;
    for (let i = 0; i < 2; i++) {
      this.climbPaws.push(this.scene.add.image(this.x, this.y, 'ui_paw').setDepth(10).setVisible(false).setScale(1.6));
    }
  }

  private exitClimb(): void {
    this.mode = 'normal';
    this.setRotation(0);
    this.climbPaws.forEach(p => p.setVisible(false));
    this.setDepth(20);
    this.climbRect = null;
    this.body.setAllowGravity(true);
    this.body.setDrag(PHYSICS.groundDecel, 0);
    this.body.setDragX(PHYSICS.groundDecel);
    this.setFrame(14);
  }

  private findLadder(ladders: Phaser.Geom.Rectangle[]): Phaser.Geom.Rectangle | null {
    const px = this.x, py = this.y - 12;
    for (const l of ladders) {
      if (px > l.left - 12 && px < l.right + 12 && py > l.top - 30 && py < l.bottom + 4) return l;
    }
    return null;
  }

  jump(): void {
    this.body.velocity.y = PHYSICS.jumpVelocity;
    this.lastGroundedAt = -9999;
    this.squash(0.86, 1.16);
    this.scene.events.emit('fx-dust', this.x, this.y, 4);
    this.scene.events.emit('sfx', 'jump', { volume: 0.36, rate: 1 + Math.random() * 0.06 });
    this.setFrame(15);
  }

  flap(): void {
    const now = this.now;
    this.flapCharges--;
    this.lastFlapAt = now;
    this.body.velocity.y = Math.min(this.body.velocity.y, 40);
    this.body.velocity.y = PHYSICS.flapImpulse;
    this.squash(0.9, 1.12);
    this.setFrame(14);
    this.scene.events.emit('fx-gust', this.x, this.y - 10, this.facing, false);
    this.scene.events.emit('sfx', 'flap', { volume: 0.42, rate: 1 + Math.random() * 0.08 });
    this.scene.events.emit('player-flap', false);
  }

  activateShield(): void {
    this.shield = true;
    if (!this.shieldAura) {
      this.shieldAura = this.scene.add.sprite(this.x, this.y - 18, 'shield_aura')
        .setScale(0.95).setDepth(21).setAlpha(0.9);
      this.shieldAura.play('shield-aura');
      this.scene.tweens.add({ targets: this.shieldAura, alpha: 0.55, duration: 900, yoyo: true, repeat: -1 });
    }
  }

  grantTriple(): void {
    this.tripleUntil = this.now + 15000 * this.powerDuration;
    this.flapCharges = 3;
  }

  grantSwift(): void {
    this.swiftUntil = this.now + 12000 * this.powerDuration;
  }

  grantMagnet(): void {
    this.magnetUntil = this.now + 12000 * this.powerDuration;
  }

  bounce(strength = -275): void {
    this.body.velocity.y = strength;
    this.squash(0.9, 1.12);
  }

  paintInvulnerable(): void {
    this.invulnUntil = this.now + PHYSICS.hurtIFramesMs;
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(90, () => this.clearTint());
    this.scene.tweens.add({
      targets: this, alpha: 0.35, duration: 110, yoyo: true, repeat: 4,
      onComplete: () => { this.alpha = 1; },
    });
  }

  hurt(fromX: number): boolean {
    if (this.isInvulnerable || this.dead || this.victory) return false;
    if (this.shield) {
      this.shield = false;
      this.shieldAura?.destroy();
      this.shieldAura = undefined;
      this.paintInvulnerable();
      this.scene.events.emit('fx-shield-break', this.x, this.y - 14);
      this.scene.events.emit('sfx', 'bump', { volume: 0.5, rate: 1.25 });
      return false;
    }
    if (this.mode === 'climb') this.exitClimb();
    this.dashUntil = 0;
    const dir = this.x < fromX ? -1 : 1;
    this.body.velocity.set(dir * PHYSICS.knockbackX, PHYSICS.knockbackY);
    this.paintInvulnerable();
    this.hurtUntil = this.now + 320;
    this.play('pip-hurt', true);
    this.squash(1.1, 0.9);
    return true;
  }

  kill(): void {
    if (this.dead) return;
    this.dead = true;
    this.body.setAllowGravity(false);
    this.body.velocity.set(0, -170);
    this.play('pip-hurt', true);
    this.setTint(0xff8a8a);
    this.scene.tweens.add({ targets: this, angle: this.facing * 90, alpha: 0.1, duration: 900, ease: 'Cubic.easeIn' });
  }

  respawnAt(x: number, y: number): void {
    this.scene.tweens.killTweensOf(this);
    this.squashTween = undefined;
    this.setScale(1);
    this.exitClimb();
    this.flightBounds = null;
    this.lastGroundedAt = -9999;
    this.lastFlapAt = -9999;
    this.dashUntil = 0;
    this.dashReadyAt = 0;
    this.hurtUntil = 0;
    this.dropThroughUntil = 0;
    this.wasGrounded = false;
    this.lastAnim = '';
    this.dead = false;
    this.victory = false;
    this.controlLocked = false;
    this.mode = 'normal';
    this.setAngle(0);
    this.setAlpha(1);
    this.clearTint();
    this.body.reset(x, y);
    this.body.setAllowGravity(true);
    this.body.setGravityY(0);
    this.body.velocity.set(0, 0);
    this.body.setAcceleration(0, 0);
    this.flapCharges = PHYSICS.maxFlaps;
    this.hearts = this.maxHearts;
    this.invulnUntil = this.now + 1500;
    this.shield = false;
    this.swiftUntil = 0;
    this.magnetUntil = 0;
    this.tripleUntil = 0;
    this.shieldAura?.destroy();
    this.shieldAura = undefined;
    this.setFrame(0);
    this.play('pip-idle');
    this.alpha = 1;
  }

  private squash(sx: number, sy: number): void {
    this.squashTween?.remove();
    this.setScale(sx, sy);
    this.squashTween = this.scene.tweens.add({
      targets: this, scaleX: 1, scaleY: 1, duration: 150, ease: 'Back.easeOut',
    });
  }

  private updateAnim(): void {
    const now = this.now;
    if (this.dead || this.victory) return;
    if (now < this.hurtUntil) return;
    let key = 'pip-idle';
    if (this.mode === 'climb') {
      key = 'pip-climb';
      this.anims.msPerFrame = 140;
    } else if (this.mode === 'flight') {
      // glide pose, with a brief tuck on each flap
      const vy = this.body.velocity.y;
      if (this.anims.isPlaying) this.anims.stop();
      this.setFrame(now < this.flapPoseUntil ? 14 : 8);
      this.setRotation(Phaser.Math.Clamp(vy / 1600, -0.16, 0.2));
      return;
    } else if (!this.grounded) {
      const vy = this.body.velocity.y;
      const f = vy < -90 ? 14 : vy < 40 ? 15 : 17;
      if (this.anims.isPlaying) this.anims.stop();
      this.setFrame(f);
      this.setRotation(Phaser.Math.Clamp(vy / 1400, -0.1, 0.14));
      return;
    } else if (Math.abs(this.body.velocity.x) > 18) {
      key = 'pip-run';
      this.anims.msPerFrame = 1000 / 14;
    } else {
      key = 'pip-idle';
      this.anims.msPerFrame = 130;
    }
    this.setRotation(Phaser.Math.Linear(this.rotation, 0, 0.2));
    if (this.lastAnim !== key || !this.anims.isPlaying) {
      this.lastAnim = key;
      this.play(key, true);
    }
  }
}
