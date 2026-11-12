import Phaser from 'phaser';

type LayoutObject = Phaser.GameObjects.GameObject & {
  x: number; y: number; width?: number; height?: number;
  setPosition(x: number, y: number): unknown;
  setSize?(w: number, h: number): unknown;
  setScale?(x: number, y: number): unknown;
};
type BaseLayout = { x: number; y: number; w: number; h: number };

/** Expand world units and reflow menu positions without stretching text or sprites. */
export function installViewport(game: Phaser.Game): void {
  const parent = document.getElementById('game')!;
  let pending = false;
  const update = () => {
    pending = false;
    const box = parent.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const aspect = box.width / box.height;
    const width = Math.max(480, Math.round(270 * aspect));
    const height = Math.max(270, Math.round(480 / aspect));
    if (game.scale.gameSize.width !== width || game.scale.gameSize.height !== height) game.scale.setGameSize(width, height);
    game.scale.refresh();
  };
  const queue = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  const observer = new ResizeObserver(queue);
  observer.observe(parent);
  window.visualViewport?.addEventListener('resize', queue);
  const base = new WeakMap<Phaser.GameObjects.GameObject, BaseLayout>();
  const apply = (object: Phaser.GameObjects.GameObject, sx: number, sy: number) => {
    const o = object as LayoutObject;
    if (!o.setPosition || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
    let b = base.get(o);
    if (!b) { b = { x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0 }; base.set(o, b); }
    // Menu markers and animated decorations keep their local movement; layout
    // is applied only when size or the display-list membership changes.
    o.setPosition(b.x * sx, b.y * sy);
    if (o instanceof Phaser.GameObjects.TileSprite || o instanceof Phaser.GameObjects.Rectangle) o.setSize(b.w * sx, b.h * sy);
    else if (o instanceof Phaser.GameObjects.Graphics) o.setScale(sx, sy);
    if (o instanceof Phaser.GameObjects.Container) for (const child of o.list) apply(child, sx, sy);
  };
  const seen = new WeakMap<Phaser.Scene, string>();
  const layout = () => {
    const { width, height } = game.scale.gameSize;
    for (const scene of game.scene.getScenes(true)) {
      if (['Game', 'SkySprint', 'Title'].includes(scene.scene.key)) continue;
      const key = `${width}:${height}:${scene.children.length}:${scene.sys.settings.status}`;
      if (seen.get(scene) === key) continue;
      seen.set(scene, key);
      scene.cameras.main.setSize(width, height).setScroll(0, 0);
      for (const object of scene.children.list) apply(object, width / 480, height / 270);
    }
  };
  game.events.on('poststep', layout);
  game.events.once('ready', queue);
  game.events.once('destroy', () => { observer.disconnect(); window.visualViewport?.removeEventListener('resize', queue); game.events.off('poststep', layout); });
  queue();
}
