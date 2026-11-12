import Phaser from 'phaser';

type BoundedObject = Phaser.GameObjects.GameObject & {
  scrollFactorX?: number; scrollFactorY?: number; alpha?: number;
  getBounds?: (out?: Phaser.Geom.Rectangle) => Phaser.Geom.Rectangle;
};

/** Filter offscreen draw submissions without disabling simulation or visibility. */
export class ViewCuller {
  private nextAt = 0;
  private readonly bounds = new Phaser.Geom.Rectangle();
  constructor(private readonly scene: Phaser.Scene) {}
  update(time: number): void {
    if (time < this.nextAt) return;
    this.nextAt = time + 100;
    const camera = this.scene.cameras.main, view = camera.worldView;
    // A dash covers less than 44 units between checks. Keep a larger guard band
    // so objects enter the renderer before they reach the viewport edge.
    const margin = 96;
    for (const child of this.scene.children.list) {
      const object = child as BoundedObject;
      if (object.scrollFactorX !== 1 || object.scrollFactorY !== 1 || !object.getBounds || object.type === 'ParticleEmitter' || object.alpha === 0) continue;
      const bounds = object.getBounds(this.bounds);
      const inView = bounds.right >= view.left - margin && bounds.left <= view.right + margin && bounds.bottom >= view.top - margin && bounds.top <= view.bottom + margin;
      object.cameraFilter = inView ? object.cameraFilter & ~camera.id : object.cameraFilter | camera.id;
    }
  }
}
