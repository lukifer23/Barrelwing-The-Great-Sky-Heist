import Phaser from 'phaser';

type LayoutObject = Phaser.GameObjects.GameObject & {
  x: number; y: number; width?: number; height?: number;
  setPosition(x: number, y: number): unknown;
  setSize?(w: number, h: number): unknown;
  setScale?(x: number, y: number): unknown;
};
type BaseLayout = { x: number; y: number; w: number; h: number; font?: number; wrap?: number; family?: string; padY?: number };

/** Expand world units and reflow menu positions without stretching text or sprites. */
export function installViewport(game: Phaser.Game): void {
  const parent = document.getElementById('game')!;
  let pending = false;
  const update = () => {
    pending = false;
    const box = parent.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const aspect = box.width / box.height;
    // A closer portrait campaign camera makes a courier and the next landing
    // readable on the cover display. Menus and arenas own their own layouts.
    const cover = window.matchMedia('(pointer: coarse) and (orientation: portrait)').matches;
    const minWidth = cover && aspect < 0.88 && game.scene.isActive('Game') ? 352 : 480;
    const width = Math.max(minWidth, Math.round(270 * aspect));
    const height = Math.max(270, Math.round(minWidth / aspect));
    if (game.scale.gameSize.width !== width || game.scale.gameSize.height !== height) game.scale.setGameSize(width, height);
    game.scale.refresh();
  };
  const queue = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  const observer = new ResizeObserver(queue);
  observer.observe(parent);
  window.visualViewport?.addEventListener('resize', queue);
  const base = new WeakMap<Phaser.GameObjects.GameObject, BaseLayout>();
  let layoutHeight = 270;
  const apply = (object: Phaser.GameObjects.GameObject, sx: number, sy: number) => {
    const o = object as LayoutObject;
    if (!o.setPosition || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
    let b = base.get(o);
    if (!b) {
      b = { x: o.x, y: o.y, w: o.width ?? 0, h: o.height ?? 0 };
      if (o instanceof Phaser.GameObjects.Text) {
        b.font = parseFloat(String(o.style.fontSize)); b.wrap = o.style.wordWrapWidth ?? 0;
        b.family = o.style.fontFamily; b.padY = o.padding.top;
      }
      base.set(o, b);
    }
    // Menu markers and animated decorations keep their local movement; layout
    // is applied only when size or the display-list membership changes.
    o.setPosition(b.x * sx, b.y * sy);
    if (o instanceof Phaser.GameObjects.Text && b.font !== undefined) {
      const portrait = layoutHeight > game.scale.width * 1.35;
      // Use the original coordinates for repeatable fold/unfold transitions.
      const space = o.originX === 0 ? 472 - b.x : o.originX === 1 ? b.x - 8 : 2 * Math.min(b.x - 8, 472 - b.x);
      const available = Math.max(48, o.getData('portraitWidth') ?? space);
      const size = portrait ? Math.max(o.input ? 17 : 15, Math.round(b.font * 1.6)) : b.font;
      o.setFontFamily(portrait && b.font <= 8 && !o.input ? 'Roboto, Arial, sans-serif' : b.family!);
      o.setFontSize(size);
      o.setWordWrapWidth(portrait ? Math.min(available, b.wrap || available) : b.wrap ?? 0);
      if (o.input && b.padY !== undefined) {
        const padding = portrait ? Math.max(b.padY, Math.ceil((50 - size) / 2)) : b.padY;
        o.setPadding(o.padding.left ?? 0, padding, o.padding.right ?? 0, padding);
      }
    }
    if (o instanceof Phaser.GameObjects.TileSprite || o instanceof Phaser.GameObjects.Rectangle) o.setSize(b.w * sx, b.h * sy);
    else if (o instanceof Phaser.GameObjects.Graphics) o.setScale(sx, sy);
    if (o instanceof Phaser.GameObjects.Container) for (const child of o.list) apply(child, sx, sy);
  };
  const seen = new WeakMap<Phaser.Scene, string>();
  const lastObject = new WeakMap<Phaser.Scene, Phaser.GameObjects.GameObject>();
  const layout = () => {
    const { width, height } = game.scale.gameSize;
    layoutHeight = height;
    for (const scene of game.scene.getScenes(true)) {
      if (['Game', 'SkySprint', 'Title', 'Brawl', 'Controls'].includes(scene.scene.key)) continue;
      const key = `${width}:${height}:${scene.children.length}:${scene.sys.settings.status}`;
      const last = scene.children.list.at(-1);
      if (seen.get(scene) === key && lastObject.get(scene) === last) continue;
      if (last) lastObject.set(scene, last);
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
