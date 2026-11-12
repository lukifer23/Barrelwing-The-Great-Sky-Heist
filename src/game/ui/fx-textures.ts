import Phaser from 'phaser';

/** Generates the tiny transient-FX textures the game reuses everywhere. */
export function createFxTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('fx_puff', 8, 8);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 3, 3);
  g.generateTexture('fx_spark', 3, 3);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 10, 2);
  g.generateTexture('fx_streak', 10, 2);

  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 1, 1);
  g.generateTexture('fx_px', 1, 1);
  g.destroy();

  // radial glow via canvas (transient FX only)
  const key = 'fx_glow';
  if (!scene.textures.exists(key)) {
    const canvas = scene.textures.createCanvas(key, 48, 48);
    if (canvas) {
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(24, 24, 1, 24, 24, 23);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 48, 48);
      canvas.refresh();
    }
  }
}
