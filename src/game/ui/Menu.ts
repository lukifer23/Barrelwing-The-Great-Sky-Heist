import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { AudioManager } from '../systems/AudioManager';

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  hint?: string;
}

export interface MenuOptions {
  x: number;
  y: number;
  spacing?: number;
  align?: 'left' | 'center';
  fontSize?: string;
  width?: number;
  showHints?: boolean;
  depth?: number;
}

/** Keyboard + mouse menu with an animated acorn marker. */
export class Menu {
  readonly items: MenuItem[];
  index = 0;
  private scene: Phaser.Scene;
  private labels: Phaser.GameObjects.Text[] = [];
  private markers: Phaser.GameObjects.Image[] = [];
  private hint?: Phaser.GameObjects.Text;
  private opts: Required<MenuOptions>;
  private enabled: boolean[] = [];

  constructor(scene: Phaser.Scene, items: MenuItem[], opts: MenuOptions) {
    this.scene = scene;
    this.items = items;
    this.opts = {
      spacing: 20, align: 'center', fontSize: '9px', width: 260, showHints: true, depth: 0,
      ...opts,
    } as Required<MenuOptions>;
    if (window.matchMedia('(pointer: coarse)').matches) this.opts.fontSize = `${Math.max(9, parseInt(this.opts.fontSize))}px`;
    this.enabled = items.map(i => !i.disabled);

    const first = this.enabled.findIndex(Boolean);
    this.index = first >= 0 ? first : 0;

    items.forEach((it, i) => {
      const x = this.opts.x;
      const y = this.opts.y + i * this.opts.spacing;
      const t = scene.add.text(x, y, it.label, {
        fontFamily: FONT_SMALL,
        fontSize: this.opts.fontSize,
        color: it.disabled ? '#5a6480' : '#f4e6c8',
      }).setOrigin(this.opts.align === 'center' ? 0.5 : 0, 0.5).setInteractive({ useHandCursor: !it.disabled });
      t.on('pointerover', () => { if (!it.disabled) { this.index = i; this.repaint(); } });
      t.setPadding(4, Math.max(2, (this.opts.spacing - t.height) / 2));
      t.on('pointerdown', () => { if (!it.disabled) { this.index = i; this.confirm(); } });
      t.setDepth(this.opts.depth);
      this.labels.push(t);

      const marker = scene.add.image(0, y, 'acorn', 0).setScale(0.7).setVisible(false);
      marker.setDepth(this.opts.depth);
      this.markers.push(marker);
    });

    if (this.opts.showHints) {
      this.hint = scene.add.text(this.opts.x, Math.min(this.opts.y + items.length * this.opts.spacing + 8, 238), '', {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
      }).setOrigin(0.5, 0).setAlpha(0.9);
    }
    this.hint?.setDepth(this.opts.depth);
    this.repaint();
  }


  repaint(): void {
    this.labels.forEach((t, i) => {
      const active = i === this.index;
      t.setColor(this.enabled[i] ? (active ? '#f0c060' : '#f4e6c8') : '#5a6480');
      t.setScale(active ? 1.04 : 1);
      const m = this.markers[i];
      this.scene.tweens.killTweensOf(m);
      if (active && this.enabled[i]) {
        m.setVisible(true);
        m.setPosition(t.x - t.displayWidth * t.originX - 12, t.y);
        this.scene.tweens.add({ targets: m, angle: { from: -8, to: 8 }, duration: 700, yoyo: true, repeat: -1 });
        if (this.hint) this.hint.setText(this.items[i].hint ?? '');
      } else {
        m.setVisible(false);
      }
    });
  }

  move(dir: number): void {
    if (this.enabled.filter(Boolean).length === 0) return;
    let next = this.index;
    for (let i = 0; i < this.items.length; i++) {
      next = (next + dir + this.items.length) % this.items.length;
      if (this.enabled[next]) break;
    }
    if (next !== this.index) {
      this.index = next;
      AudioManager.sfx('ui_move', { volume: 0.4 });
      this.repaint();
    }
  }

  confirm(): void {
    const it = this.items[this.index];
    if (!it || !this.enabled[this.index]) return;
    AudioManager.sfx('ui_confirm', { volume: 0.5 });
    it.action();
  }

  handleKey(e: KeyboardEvent): boolean {
    if (e.repeat) return true;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { this.move(-1); return true; }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { this.move(1); return true; }
    if (e.key === 'Enter' || e.key === ' ') { this.confirm(); return true; }
    return false;
  }


}

/** Shared menu panel. */
export function addPanel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  fill = 0x141a2e, alpha = 0.92, stroke = 0x6b5a3a,
): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, w, h, fill, alpha).setStrokeStyle(1, stroke, 1);
}
