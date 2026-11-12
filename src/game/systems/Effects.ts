import Phaser from 'phaser';
import { SaveManager } from './SaveManager';

/** Particle-driven game feel. All shapes here are transient FX, never game art. */
export class Effects {
  private scene: Phaser.Scene;
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private windEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private glowEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.dustEmitter = scene.add.particles(0, 0, 'fx_puff', {
      lifespan: { min: 280, max: 520 },
      speed: { min: 12, max: 58 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.7, end: 0 },
      gravityY: -20,
      emitting: false,
    }).setDepth(18);

    this.sparkEmitter = scene.add.particles(0, 0, 'fx_spark', {
      lifespan: { min: 180, max: 420 },
      speed: { min: 40, max: 150 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      gravityY: 150,
      emitting: false,
    }).setDepth(22);

    this.windEmitter = scene.add.particles(0, 0, 'fx_streak', {
      lifespan: { min: 220, max: 420 },
      speedX: { min: -160, max: -60 },
      speedY: { min: -16, max: 16 },
      scaleX: { start: 1, end: 0.2 },
      scaleY: { start: 0.8, end: 0 },
      alpha: { start: 0.8, end: 0 },
      emitting: false,
    }).setDepth(19);

    this.glowEmitter = scene.add.particles(0, 0, 'fx_glow', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 8, max: 36 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      emitting: false,
    }).setDepth(21);

    this.trailEmitter = scene.add.particles(0, 0, 'fx_glow', {
      lifespan: 260,
      speed: 0,
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.5, end: 0 },
      emitting: false,
    }).setDepth(17);
  }

  dust(x: number, y: number, n = 5, tint = 0xd9c08a): void {
    this.dustEmitter.setParticleTint(tint);
    this.dustEmitter.explode(n, x, y - 2);
  }

  step(x: number, y: number, dir: number): void {
    this.dustEmitter.setParticleTint(0xc7b07e);
    this.dustEmitter.emitParticleAt(x - dir * 3, y - 2, 1);
  }

  gust(x: number, y: number, dir: number, strong: boolean): void {
    this.windEmitter.setParticleTint(strong ? 0xa8f0ff : 0xdff8ff);
    this.windEmitter.explode(strong ? 12 : 7, x - dir * 8, y + 4);
    this.glowEmitter.setParticleTint(0xd8f7ff);
    this.glowEmitter.explode(strong ? 5 : 3, x - dir * 4, y);
  }

  dash(x: number, y: number, dir: number): void {
    this.trailEmitter.setParticleTint(0x9ff5ff);
    for (let i = 0; i < 6; i++) {
      this.trailEmitter.emitParticleAt(x - dir * i * 5, y - 8 - i, 1);
    }
  }

  hit(x: number, y: number, tint = 0xffd27a): void {
    this.sparkEmitter.setParticleTint(tint);
    this.sparkEmitter.explode(9, x, y);
  }

  defeat(x: number, y: number): void {
    this.sparkEmitter.setParticleTint(0xffe6a8);
    this.sparkEmitter.explode(14, x, y);
    this.dustEmitter.setParticleTint(0x54452e);
    this.dustEmitter.explode(6, x, y);
  }

  sparkle(x: number, y: number, tint = 0xffe9a0): void {
    this.glowEmitter.setParticleTint(tint);
    this.glowEmitter.explode(7, x, y);
  }

  pickup(x: number, y: number, tint = 0xffd76a): void {
    this.sparkEmitter.setParticleTint(tint);
    this.sparkEmitter.explode(5, x, y);
  }

  shake(intensity = 0.0035, duration = 120): void {
    const s = SaveManager.get().settings;
    if (s.shake <= 0 || s.reducedMotion) return;
    this.scene.cameras.main.shake(duration, intensity * s.shake);
  }

  flash(color = 0xffffff, duration = 90, alpha = 0.32): void {
    if (SaveManager.get().settings.reducedMotion) return;
    const cam = this.scene.cameras.main;
    const r = this.scene.add.rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, color, alpha)
      .setScrollFactor(0).setDepth(200);
    this.scene.tweens.add({ targets: r, alpha: 0, duration, onComplete: () => r.destroy() });
  }

  destroy(): void {
    this.dustEmitter.destroy();
    this.sparkEmitter.destroy();
    this.windEmitter.destroy();
    this.glowEmitter.destroy();
    this.trailEmitter.destroy();
  }
}
