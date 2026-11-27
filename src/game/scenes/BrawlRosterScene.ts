import Phaser from 'phaser';
import { FONT_SMALL, FONT_TITLE } from '../config';
import { attackPose, FIGHT_STYLES, swipeFrame } from '../data/brawl';
import { CHARACTERS, COURIERS, type CharacterId } from '../data/characters';
import { SaveManager } from '../systems/SaveManager';
import { AudioManager } from '../systems/AudioManager';
import type { BrawlSetupScene, RosterSide } from './BrawlSetupScene';
import { bindGamepadActions } from '../ui/MenuInput';

export class BrawlRosterScene extends Phaser.Scene {
  private side: RosterSide = 'player';
  private selected: CharacterId = 'pip';
  private cols = 4;
  private preview!: Phaser.GameObjects.Sprite;
  private swipe!: Phaser.GameObjects.Sprite;
  private previewStart = 0;
  private previewX = 0;
  private previewY = 0;
  private layout = '';
  constructor() { super('BrawlRoster'); }
  init(data: { side: RosterSide; current: CharacterId }): void { this.side = data.side; this.selected = data.current; }
  create(): void {
    this.draw();
    bindGamepadActions(this, action => {
      if (action === 'back' || action === 'pause') { this.close(); return; }
      if (action === 'confirm' || action === 'attack') { this.confirm(); return; }
      const delta: Partial<Record<typeof action, number>> = { left: -1, right: 1, up: -this.cols, down: this.cols };
      const step = delta[action];
      if (step !== undefined) this.select(COURIERS[Phaser.Math.Wrap(COURIERS.indexOf(this.selected) + step, 0, COURIERS.length)]);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); this.confirm(); return; }
      const delta: Record<string, number> = { ArrowRight: 1, d: 1, ArrowLeft: -1, a: -1, ArrowDown: this.cols, s: this.cols, ArrowUp: -this.cols, w: -this.cols };
      if (e.key in delta) {
        e.stopPropagation();
        this.select(COURIERS[Phaser.Math.Wrap(COURIERS.indexOf(this.selected) + delta[e.key], 0, COURIERS.length)]);
      }
    };
    const resize = () => { if (this.layout !== `${this.scale.width}/${this.scale.height}`) this.draw(); };
    this.input.keyboard?.on('keydown', onKey); this.scale.on('resize', resize);
    this.events.once('shutdown', () => { this.input.keyboard?.off('keydown', onKey); this.scale.off('resize', resize); });
  }
  private select(id: CharacterId): void {
    if (this.selected === id) return;
    this.selected = id; AudioManager.sfx('ui_move', { volume: 0.35 }); this.draw();
  }
  private close(): void { this.scene.stop(); this.scene.resume('BrawlSetup'); }
  private confirm(): void {
    (this.scene.get('BrawlSetup') as BrawlSetupScene).chooseFighter(this.side, this.selected);
    AudioManager.sfx('select', { volume: 0.4 }); this.close();
  }
  override update(time: number): void {
    if (!this.preview || SaveManager.get().settings.reducedMotion) return;
    // Slow the contact frames in the picker so the full move can be inspected.
    const id = this.selected, style = FIGHT_STYLES[id], scale = this.preview.scaleX;
    const progress = ((time - this.previewStart) % 2400 - 520) / (style.activeMs * 2.4);
    this.swipe.setVisible(progress >= 0 && progress < 1);
    if (progress < -0.7 || progress > 1.4) {
      this.preview.setPosition(this.previewX, this.previewY).setAngle(0).play(`${id}-idle`, true); return;
    }
    this.preview.anims.stop();
    const travel = Math.sin(Math.PI * Phaser.Math.Clamp(progress, 0, 1));
    this.preview.setFrame(attackPose(id, progress)).setAngle(progress < 0 ? -9 : 10 * travel)
      .setPosition(this.previewX + (id === 'fenn' ? 6 * scale * travel : 0), this.previewY - (id === 'clover' ? 6 * scale * travel : 0));
    if (this.swipe.visible) {
      const { key, frame } = swipeFrame(id, id === 'clover' ? 1 : 0, progress);
      this.swipe.setTexture(key, frame).setPosition(this.preview.x + 10 * scale, this.preview.y - 9 * scale)
        .setFlipY(id === 'clover').setDisplaySize(23 * scale, 19 * scale);
    }
  }
  private draw(): void {
    this.children.removeAll(true);
    const W = this.scale.width, H = this.scale.height, tall = H > W * 1.2;
    this.layout = `${W}/${H}`; this.cols = tall ? 2 : COURIERS.length;
    this.cameras.main.setSize(W, H).setScroll(0, 0);
    this.add.rectangle(0, 0, W, H, 0x101528).setOrigin(0);
    this.add.text(W / 2, tall ? H * 0.065 : H * 0.09, this.side === 'player' ? 'YOUR FIGHTER' : 'CPU FIGHTER',
      { fontFamily: FONT_TITLE, fontSize: tall ? '23px' : '16px', color: this.side === 'player' ? '#9ff5ff' : '#ffaa93' }).setOrigin(0.5);
    const width = Math.min(W - 32, 760), left = (W - width) / 2, gap = 8;
    const cardW = (width - (this.cols - 1) * gap) / this.cols, cardH = tall ? Math.min(H * 0.145, 155) : H * 0.39;
    const top = H * 0.155;
    for (const [i, id] of COURIERS.entries()) {
      const x = left + (i % this.cols) * (cardW + gap) + cardW / 2, y = top + Math.floor(i / this.cols) * (cardH + gap);
      const active = id === this.selected;
      const card = this.add.rectangle(x, y, cardW, cardH, active ? 0x2b3446 : 0x192238).setOrigin(0.5, 0)
        .setStrokeStyle(active ? 3 : 1, active ? FIGHT_STYLES[id].color : 0x65758c)
        .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(id));
      card.setData('fighter', id);
      this.add.ellipse(x, y + cardH * 0.59, cardW * 0.46, 9, 0x0c1421, 0.85);
      const sprite = this.add.sprite(x, y + cardH * 0.59, id).setOrigin(0.5, 35 / 45).setScale(Math.min(3.4, cardH / 65))
        .play(`${id}-idle`);
      if (active) {
        this.preview = sprite; this.previewStart = this.time.now; this.previewX = x; this.previewY = sprite.y;
        this.swipe = this.add.sprite(x, sprite.y, 'slash-circular').setTint(FIGHT_STYLES[id].color).setVisible(false);
      }
      this.add.text(x, y + cardH * 0.72, CHARACTERS[id].name, { fontFamily: FONT_TITLE, fontSize: tall ? '18px' : '10px', color: '#f5ead3' }).setOrigin(0.5);
      this.add.text(x, y + cardH * 0.89, FIGHT_STYLES[id].role, { fontFamily: FONT_SMALL, fontSize: tall ? '12px' : '7px', color: '#c3cfdf' }).setOrigin(0.5);
    }
    const detail = top + Math.ceil(COURIERS.length / this.cols) * (cardH + gap);
    const style = FIGHT_STYLES[this.selected];
    this.add.text(W / 2, detail + (tall ? 32 : 10), style.move, { fontFamily: FONT_TITLE, fontSize: tall ? '18px' : '11px', color: '#f0c060' }).setOrigin(0.5);
    this.add.text(W / 2, detail + (tall ? 60 : 24), style.description, { fontFamily: 'Roboto, Arial, sans-serif', fontSize: tall ? '19px' : '12px', color: '#f0e7dc', align: 'center', wordWrap: { width: width - 24 } }).setOrigin(0.5, 0);
    this.add.text(W / 2, detail + (tall ? 122 : 48), `${style.damage}% PER HIT   /   ${(style.cooldown / 1000).toFixed(2)}s BETWEEN ATTACKS`,
      { fontFamily: FONT_SMALL, fontSize: tall ? '14px' : '8px', color: '#adc8d9' }).setOrigin(0.5);
    const controlY = H - (tall ? Math.min(100, H * 0.09) : 23);
    this.add.text(left + width * 0.20, controlY, 'BACK', { fontFamily: FONT_SMALL, fontSize: tall ? '18px' : '10px', color: '#c3cfdf', padding: { x: 16, y: 12 } })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());
    this.add.text(left + width * 0.64, controlY, `PICK ${CHARACTERS[this.selected].name}`,
      { fontFamily: FONT_SMALL, fontSize: tall ? '18px' : '10px', color: '#101528', backgroundColor: '#f0c060', padding: { x: 16, y: 12 } })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.confirm());
  }
}
