import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { AudioManager } from '../systems/AudioManager';
import { POWER_META } from '../data/powerups';

type Guide = 'TOUCH' | 'KEYS' | 'POWERUPS';
const GUIDES: Record<Exclude<Guide, 'POWERUPS'>, [string, string][]> = {
  TOUCH: [
    ['JOYSTICK', 'Move gently to walk; push farther to run. Up/down climbs vines.'],
    ['JUMP', 'Hold for height. Release and tap again for two air flaps. Land to refill.'],
    ['FLIGHT', 'Tap FLAP to rise; release to fall. Aim for the gaps.'],
    ['DASH', 'Burst forward and break wooden barrels. The bar shows recharge.'],
    ['DROP THROUGH', 'Pull the joystick down while standing on a thin platform.'],
    ['BRAWL', 'Hold HIT to repeat attacks. Aim up/down with the stick. Two air jumps recover.'],
    ['PAUSE / SOUND', 'Pause safely to adjust settings. SOUND ON mutes everything.'],
  ],
  KEYS: [
    ['A / D OR ARROWS', 'Run. W/S or up/down climbs vines and aims Brawl attacks.'],
    ['SPACE', 'Hold to jump higher; release and press again for air flaps.'],
    ['J', 'Dash. Breaks wooden barrels; armored barrels must be dodged.'],
    ['K IN BRAWL', 'Hold to repeat attacks. Aim up/down; damage increases knockback.'],
    ['DOWN', 'Drop through a thin platform. Air jumps help recover in Brawl.'],
    ['ESC / P', 'Pause and resume. R restarts the campaign checkpoint for one life.'],
    ['M / F', 'Mute all audio / toggle fullscreen. Enter confirms menu choices.'],
  ],
};

export class ControlsScene extends Phaser.Scene {
  private from = 'Title';
  private guide: Guide = 'TOUCH';
  constructor() { super('Controls'); }
  init(data: { from?: string }): void { this.from = data?.from ?? 'Title'; }
  create(): void {
    this.guide = window.matchMedia('(pointer: coarse)').matches ? 'TOUCH' : 'KEYS';
    this.draw();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.draw, this);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape' || e.key === 'Enter') this.close();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tabs: Guide[] = ['TOUCH', 'KEYS', 'POWERUPS'];
        this.guide = tabs[(tabs.indexOf(this.guide) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; this.draw();
      }
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.draw, this);
      this.input.keyboard?.off('keydown', onKey);
    });
  }
  private draw(): void {
    this.children.removeAll(true);
    const W = this.scale.width, H = this.scale.height;
    const tall = H > W * 1.2;
    this.cameras.main.setSize(W, H).setScroll(0, 0);
    const size = Math.min(1.5, Math.max(1, H / 330));
    const left = Math.max(24, (W - 680) / 2), width = W - left * 2;
    this.add.rectangle(0, 0, W, H, 0x101528).setOrigin(0);
    this.add.text(W / 2, 24, 'FIELD GUIDE', { fontFamily: '"Press Start 2P"', fontSize: `${14 * size}px`, color: '#f4e6c8' }).setOrigin(0.5);
    (['TOUCH', 'KEYS', 'POWERUPS'] as Guide[]).forEach((tab, i) => {
      this.add.text(left + width * (i + 0.5) / 3, 56 * size, tab, { fontFamily: FONT_SMALL, fontSize: `${10 * size}px`, color: this.guide === tab ? '#f0c060' : '#9fb0d0' })
        .setOrigin(0.5).setPadding(8, 8).setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.guide = tab; this.draw(); });
    });
    this.add.text(W / 2, 77 * size, 'REACH THE EXIT. GEMS AND STARS BUY WORKSHOP UPGRADES.', { fontFamily: FONT_SMALL, fontSize: `${6 * size}px`, color: '#9ff5ff', align: 'center', wordWrap: { width } }).setOrigin(0.5);
    const rows: [string, string][] = this.guide === 'POWERUPS' ? Object.values(POWER_META).map(p => [p.label, `${p.blurb}${p.durationMs ? ` (${p.durationMs / 1000}s before upgrades)` : ''}`]) : GUIDES[this.guide];
    const start = 94 * size, spacing = (H - start - 28 * size) / rows.length;
    rows.forEach(([label, description], i) => {
      const y = start + i * spacing;
      this.add.text(left, y, label, { fontFamily: FONT_SMALL, fontSize: `${(tall ? 11 : 8) * size}px`, color: '#f0c060', wordWrap: { width: tall ? width : width * 0.31 } });
      this.add.text(tall ? left : left + width * 0.34, tall ? y + 18 * size : y, description, { fontFamily: FONT_SMALL, fontSize: `${(tall ? 9 : 7) * size}px`, color: '#f4e6c8', wordWrap: { width: tall ? width : width * 0.66 }, lineSpacing: 0 });
    });
    this.add.text(W / 2, H - 18 * size, 'BACK', { fontFamily: FONT_SMALL, fontSize: `${10 * size}px`, color: '#f0c060' }).setOrigin(0.5).setPadding(28, 10).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());
  }
  private close(): void {
    AudioManager.sfx('ui_move', { volume: 0.4 }); this.scene.stop(); this.scene.resume(this.from);
  }
}
