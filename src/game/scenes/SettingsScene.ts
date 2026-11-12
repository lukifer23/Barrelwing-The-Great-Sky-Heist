import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager, type Settings } from '../systems/SaveManager';
import { addPanel } from '../ui/Menu';

type Row = { label: string; key: keyof Settings | 'fullscreen'; min?: number; max?: number; step?: number };
const PAGES: { label: string; rows: Row[] }[] = [
  { label: 'AUDIO', rows: [
    { label: 'MUSIC VOLUME', key: 'music', min: 0, max: 1, step: 0.1 },
    { label: 'SOUND VOLUME', key: 'sfx', min: 0, max: 1, step: 0.1 },
    { label: 'MUTE ALL', key: 'muted' },
    { label: 'HAPTIC FEEDBACK', key: 'haptics' },
  ] },
  { label: 'CONTROLS', rows: [
    { label: 'BUTTON SIZE', key: 'touchScale', min: 0.75, max: 1.5, step: 0.125 },
    { label: 'BUTTON OPACITY', key: 'touchOpacity', min: 0.25, max: 1, step: 0.125 },
    { label: 'LEFT HANDED', key: 'leftHanded' },
  ] },
  { label: 'DISPLAY', rows: [
    { label: 'SCREEN SHAKE', key: 'shake', min: 0, max: 1, step: 0.1 },
    { label: 'REDUCED MOTION', key: 'reducedMotion' },
    { label: 'FPS DISPLAY', key: 'showFps' },
    { label: 'FULLSCREEN', key: 'fullscreen' },
  ] },
];

export class SettingsScene extends Phaser.Scene {
  private from = 'Title';
  private index = 0;
  private page = 0;
  private rows: Phaser.GameObjects.Container[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private values: Phaser.GameObjects.Text[] = [];
  private tabs: Phaser.GameObjects.Text[] = [];

  constructor() { super('Settings'); }
  init(data: { from?: string }): void { this.from = data?.from ?? 'Title'; this.page = 0; this.index = 0; }

  create(): void {
    this.rows = []; this.labels = []; this.values = []; this.tabs = [];
    this.add.rectangle(0, 0, 480, 270, 0x05070d, 0.92).setOrigin(0);
    addPanel(this, 240, 135, 448, 254, 0x141a2e, 0.99, 0xc8b48a);
    this.add.text(240, 28, 'SETTINGS', { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#f4e6c8' }).setOrigin(0.5);
    PAGES.forEach((p, i) => {
      const t = this.add.text(96 + i * 144, 55, p.label, { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060', padding: { x: 12, y: 8 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { this.page = i; this.index = 0; this.buildRows(); }); this.tabs.push(t);
    });
    this.add.text(240, 230, 'CHANGES SAVE AND APPLY IMMEDIATELY', { fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0' }).setOrigin(0.5);
    this.add.text(240, 249, 'BACK', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060', padding: { x: 48, y: 6 } })
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key === 'Tab') { e.preventDefault(); this.page = (this.page + 1) % PAGES.length; this.index = 0; this.buildRows(); return; }
      if (e.key === 'ArrowUp' || e.key === 'w') this.index = (this.index + PAGES[this.page].rows.length - 1) % PAGES[this.page].rows.length;
      else if (e.key === 'ArrowDown' || e.key === 's') this.index = (this.index + 1) % PAGES[this.page].rows.length;
      else if (e.key === 'ArrowLeft' || e.key === 'a') this.adjust(-1);
      else if (['ArrowRight', 'd', 'Enter', ' '].includes(e.key)) this.adjust(1);
      this.repaint();
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    this.buildRows();
  }

  private buildRows(): void {
    for (const row of this.rows) row.destroy();
    this.rows = []; this.labels = []; this.values = [];
    PAGES[this.page].rows.forEach((row, i) => {
      const y = 91 + i * 34;
      const container = this.add.container(0, y);
      const bg = this.add.rectangle(240, 0, 404, 30, 0x1d2540).setStrokeStyle(1, 0x3a4460);
      const label = this.add.text(50, 0, row.label, { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f4e6c8' }).setOrigin(0, 0.5);
      const value = this.add.text(352, 0, '', { fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060' }).setOrigin(0.5);
      const minus = this.add.text(290, 0, '−', { fontFamily: FONT_SMALL, fontSize: '16px', color: '#9ff5ff', padding: { x: 14, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const plus = this.add.text(414, 0, '+', { fontFamily: FONT_SMALL, fontSize: '16px', color: '#9ff5ff', padding: { x: 14, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      minus.on('pointerdown', () => { this.index = i; this.adjust(-1); });
      plus.on('pointerdown', () => { this.index = i; this.adjust(1); });
      container.add([bg, label, value, minus, plus]); this.rows.push(container); this.labels.push(label); this.values.push(value);
    });
    this.repaint();
  }

  private adjust(dir: number): void {
    const row = PAGES[this.page].rows[this.index];
    if (row.key === 'fullscreen') {
      if (this.scale.isFullscreen) this.scale.stopFullscreen(); else this.scale.startFullscreen();
    } else {
      const current = SaveManager.get().settings[row.key];
      const next = typeof current === 'boolean' ? !current : Phaser.Math.Clamp(Math.round((current + dir * row.step!) * 1000) / 1000, row.min!, row.max!);
      SaveManager.patchSettings({ [row.key]: next }); AudioManager.refreshVolumes();
    }
    AudioManager.sfx('ui_move', { volume: 0.4 }); this.repaint();
  }

  private repaint(): void {
    this.tabs.forEach((t, i) => t.setColor(i === this.page ? '#f0c060' : '#8a93b2'));
    this.labels.forEach((label, i) => label.setColor(i === this.index ? '#f0c060' : '#f4e6c8'));
    PAGES[this.page].rows.forEach((r, i) => {
      const v = r.key === 'fullscreen' ? this.scale.isFullscreen : SaveManager.get().settings[r.key];
      this.values[i].setText(typeof v === 'boolean' ? (v ? 'ON' : 'OFF') : `${Math.round(v * 100)}%`);
    });
  }

  private close(): void { AudioManager.sfx('ui_move', { volume: 0.4 }); this.scene.stop(); this.scene.resume(this.from); }
}
