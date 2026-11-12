import Phaser from 'phaser';

/** A tiled moving platform that genuinely carries the player. */
export class MovingPlatform extends Phaser.GameObjects.TileSprite {
  declare body: Phaser.Physics.Arcade.StaticBody;
  prevX = 0;
  prevY = 0;
  deltaX = 0;
  deltaY = 0;
  private startX: number;
  private startY: number;
  private tween: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number, y: number, w: number,
    texture: string,
    axis: 'x' | 'y',
    dist: number,
    speed: number,
  ) {
    super(scene, x, y, w, 16, texture);
    this.setOrigin(0.5, 0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.body.setSize(w, 14);
    this.body.setOffset(0, 2);
    this.startX = x;
    this.startY = y;
    this.prevX = x;
    this.prevY = y;
    this.setDepth(14);

    const duration = (Math.abs(dist) / Math.max(1, speed)) * 1000;
    this.tween = scene.tweens.add({
      targets: this,
      x: axis === 'x' ? x + dist : x,
      y: axis === 'y' ? y + dist : y,
      duration,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: 250,
    });
    // Static bodies moved by tweens must refresh their physics position.
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.syncBody, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.syncBody, this);
      this.tween.remove();
    });
  }

  private syncBody(): void {
    this.deltaX = this.x - this.prevX;
    this.deltaY = this.y - this.prevY;
    this.prevX = this.x;
    this.prevY = this.y;
    this.body.updateFromGameObject();
  }

  reset(): void {
    this.tween.restart();
    this.x = this.startX;
    this.y = this.startY;
    this.prevX = this.startX;
    this.prevY = this.startY;
    this.deltaX = 0; this.deltaY = 0;
    this.body.updateFromGameObject();
  }
}
