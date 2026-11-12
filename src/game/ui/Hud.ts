import Phaser from 'phaser';
import { COLORS, FONT_SMALL } from '../config';
import { SaveManager } from '../systems/SaveManager';
import { POWER_META } from '../data/powerups';
import type { PowerKind } from '../data/levels/types';

export interface HudState {
  hearts: number;
  maxHearts: number;
  lives: number;
  coins: number;
  score: number;
  gems: [boolean, boolean, boolean];
  flapCharges: number;
  maxFlaps: number;
  dashReady: boolean;
  timeMs: number;
  flight: boolean;
  bossHp: number | null;
  bossMax: number;
  bossName: string;
  bossPhase: number;
  powers: { kind: PowerKind; ratio: number }[];
}

/** Viewport-anchored HUD. Lives inside GameScene but owns its own layout. */
export class Hud {
  private scene: Phaser.Scene;
  private hearts: Phaser.GameObjects.Image[] = [];
  private heartEmpty: Phaser.GameObjects.Image[] = [];
  private coinText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private livesText: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private namePlate!: Phaser.GameObjects.Rectangle;
  private gemIcons: Phaser.GameObjects.Image[] = [];
  private wings: Phaser.GameObjects.Image[] = [];
  private dashBar: Phaser.GameObjects.Rectangle;
  private dashBarBg: Phaser.GameObjects.Rectangle;
  private timeText: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Rectangle;
  private bossBg?: Phaser.GameObjects.Rectangle;
  private bossFill?: Phaser.GameObjects.Rectangle;
  private bossText?: Phaser.GameObjects.Text;
  private bossPhaseText?: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;
  private scoreShown = 0;
  private lastHearts = -1;
  private flightBadge: Phaser.GameObjects.Text;
  private powerIcons: Phaser.GameObjects.Image[] = [];
  private powerText: Phaser.GameObjects.Text;
  private powerBars: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const D = 120;
    this.panel = scene.add.rectangle(4, 4, 164, 26, 0x101528, 0.78)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(D).setStrokeStyle(1, 0x3a4460, 0.8);

    for (let i = 0; i < 6; i++) {
      const e = scene.add.image(12 + i * 10, 14, 'ui_heart_empty').setScrollFactor(0).setDepth(D + 1);
      const h = scene.add.image(12 + i * 10, 14, 'ui_heart').setScrollFactor(0).setDepth(D + 2);
      this.heartEmpty.push(e);
      this.hearts.push(h);
    }

    scene.add.image(69, 14, 'acorn', 0).setScrollFactor(0).setDepth(D + 1).setScale(0.8);
    this.coinText = scene.add.text(79, 10, '0', {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
    }).setScrollFactor(0).setDepth(D + 1);

    this.livesText = scene.add.text(108, 10, '×3', {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
    }).setScrollFactor(0).setDepth(D + 1);

    for (let i = 0; i < 3; i++) {
      const g = scene.add.image(134 + i * 10, 14, 'ui_gem').setScrollFactor(0).setDepth(D + 1).setAlpha(0.22);
      this.gemIcons.push(g);
    }

    this.scoreText = scene.add.text(474, 29, '0', {
      fontFamily: FONT_SMALL, fontSize: '9px', color: '#f0c060',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 1);

    this.timeText = scene.add.text(474, 17, '0:00', {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#8a93b2',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 1);

    this.namePlate = scene.add.rectangle(295, 12, 220, 12, 0x101528, 0.8).setScrollFactor(0).setDepth(129);
    this.nameText = scene.add.text(295, 8, '', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#ffffff',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(130).setShadow(1, 1, '#000000', 0, true, true);

    this.flightBadge = scene.add.text(240, 40, 'WINDTAIL — FLAP!', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#67e8f9',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 1).setAlpha(0);

    for (let i = 0; i < 3; i++) {
      this.wings.push(scene.add.image(11 + i * 12, 34, 'ui_wing').setScrollFactor(0).setDepth(D + 1));
    }
    this.dashBarBg = scene.add.rectangle(50, 34, 22, 4, 0x2a3350).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D);
    this.dashBar = scene.add.rectangle(50, 34, 22, 4, 0x67e8f9).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 1);

    for (let i = 0; i < 4; i++) {
      this.powerIcons.push(scene.add.image(14 + i * 20, 50, 'power_shield').setScrollFactor(0).setDepth(D + 1).setVisible(false).setScale(0.85));
      this.powerBars.push(scene.add.rectangle(7 + i * 20, 58, 14, 2, 0x9fe0ff).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 1).setVisible(false));
    }

    this.powerText = scene.add.text(86, 44, '', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#f4e6c8', lineSpacing: 2, backgroundColor: '#101528', padding: { x: 3, y: 2 } }).setScrollFactor(0).setDepth(D + 1).setVisible(false);

    this.toastText = scene.add.text(240, 76, '', {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f4e6c8',
      wordWrap: { width: 420 }, align: 'center', backgroundColor: '#101528', padding: { x: 6, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 12).setAlpha(0);
  }

  resize(width: number): void {
    const center = width / 2;
    this.scoreText.x = width - 6; this.timeText.x = width - 6;
    const nameCenter = (170 + width - 55) / 2;
    this.namePlate.x = nameCenter; this.nameText.x = nameCenter;
    this.namePlate.width = Math.max(120, width - 235);
    this.flightBadge.x = center; this.toastText.x = center;
    this.toastText.setWordWrapWidth(Math.min(width - 24, 420));
    if (this.bossBg) {
      this.bossBg.x = center; this.bossFill!.x = center - 82;
      this.bossText!.x = center; this.bossPhaseText!.x = center + 120;
    }
  }

  setLevelName(world: number, name: string): void {
    this.nameText.setText(`WORLD ${world}  ·  ${name.toUpperCase()}`);
    if (this.nameText.width > 212) this.nameText.setScale(212 / this.nameText.width);
  }

  update(s: HudState): void {
    for (let i = 0; i < this.hearts.length; i++) {
      const on = i < s.hearts;
      this.hearts[i].setVisible(on);
      this.heartEmpty[i].setVisible(!on && i < s.maxHearts);
    }
    if (s.hearts !== this.lastHearts) {
      if (s.hearts < this.lastHearts) {
        const h = this.hearts[Math.max(0, s.hearts)];
        if (h) this.scene.tweens.add({ targets: h, scale: 1.5, yoyo: true, duration: 110 });
      }
      this.lastHearts = s.hearts;
    }
    this.coinText.setText(String(s.coins));
    this.scoreShown = Math.floor(Phaser.Math.Linear(this.scoreShown, s.score, 0.25));
    if (Math.abs(this.scoreShown - s.score) < 2) this.scoreShown = s.score;
    this.scoreText.setText(this.scoreShown.toLocaleString('en-US'));
    this.livesText.setText(`×${Math.max(0, s.lives)}`);
    for (let i = 0; i < 3; i++) this.gemIcons[i].setAlpha(s.gems[i] ? 1 : 0.22);
    for (let i = 0; i < this.wings.length; i++) {
      this.wings[i].setVisible(i < s.maxFlaps);
      this.wings[i].setAlpha(i < s.flapCharges ? 1 : 0.2);
      this.wings[i].setTint(i < s.flapCharges ? 0xffffff : 0x556080);
    }
    const t = Math.floor(s.timeMs / 1000);
    this.timeText.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.dashBar.width = s.dashReady ? 22 : 4;
    this.dashBar.setFillStyle(s.dashReady ? 0x67e8f9 : 0x3a4460);
    this.flightBadge.setAlpha(s.flight ? 1 : 0);
    if (s.flight) this.flightBadge.setAlpha(0.65 + Math.sin(this.scene.time.now / 160) * 0.3);

    for (let i = 0; i < this.powerIcons.length; i++) {
      const p = s.powers[i];
      const icon = this.powerIcons[i];
      const bar = this.powerBars[i];
      if (!p) { icon.setVisible(false); bar.setVisible(false); continue; }
      const meta = POWER_META[p.kind];
      icon.setTexture(meta.tex).setVisible(true).setAlpha(1);
      bar.setVisible(p.ratio < 1).setFillStyle(meta.color);
      bar.width = 14 * Phaser.Math.Clamp(p.ratio, 0, 1);
      bar.x = 7 + i * 20;
    }

    this.powerText.setVisible(s.powers.length > 0).setText(s.powers.map(p => {
      const meta = POWER_META[p.kind];
      return p.kind === 'shield' ? 'SHIELD: 1 HIT' : `${meta.label}: ${Math.ceil(p.ratio * meta.durationMs * SaveManager.stats.powerDuration / 1000)}s`;
    }).join('\n'));

    if (s.bossHp !== null) {
      this.ensureBossBar(s.bossName);
      const pct = Phaser.Math.Clamp(s.bossHp / s.bossMax, 0, 1);
      this.bossFill!.width = 164 * pct;
      this.bossFill!.setFillStyle(pct > 0.55 ? 0xe4546a : pct > 0.28 ? 0xf0a04a : 0x67e8f9);
      this.bossPhaseText?.setText(`PHASE ${s.bossPhase}/3`);
    } else {
      this.bossBg?.setVisible(false);
      this.bossFill?.setVisible(false);
      this.bossText?.setVisible(false);
      this.bossPhaseText?.setVisible(false);
    }
  }

  private ensureBossBar(name: string): void {
    if (!this.bossBg) {
      this.bossBg = this.scene.add.rectangle(240, 46, 172, 10, 0x101528, 0.85)
        .setScrollFactor(0).setDepth(119).setStrokeStyle(1, 0x6b5a3a);
      this.bossFill = this.scene.add.rectangle(158, 46, 164, 6, 0xe4546a)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(120);
      this.bossText = this.scene.add.text(240, 54, name, {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#f4e6c8',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(120);
      this.bossPhaseText = this.scene.add.text(360, 54, 'PHASE 1/3', {
        fontFamily: FONT_SMALL, fontSize: '6px', color: '#f0c060',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(120);
    }
    this.bossBg.setVisible(true);
    this.bossFill!.setVisible(true);
    this.bossText!.setVisible(true);
    this.bossText!.setText(name);
    this.bossPhaseText!.setVisible(true);
  }

  toast(text: string, color = '#f4e6c8', hold = 1200): void {
    this.toastTween?.remove();
    this.toastText.setText(text).setColor(color).setAlpha(0).setY(74);
    this.toastTween = this.scene.tweens.add({
      targets: this.toastText, alpha: 1, y: 72, duration: 180, hold, yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  destroy(): void {
    this.toastTween?.remove();
  }
}
