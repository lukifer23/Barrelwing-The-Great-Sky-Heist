import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { UPGRADES, UPGRADE_COSTS, type UpgradeKind } from '../data/upgrades';
import { SaveManager } from '../systems/SaveManager';
import { AudioManager } from '../systems/AudioManager';
import { addPanel, Menu } from '../ui/Menu';

export class WorkshopScene extends Phaser.Scene {
  private labels: Phaser.GameObjects.Text[] = [];
  private descriptions: Phaser.GameObjects.Text[] = [];
  private balance!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private menu!: Menu;

  constructor() { super('Workshop'); }

  create(): void {
    this.labels = []; this.descriptions = [];
    this.add.rectangle(0, 0, 480, 270, 0x05070d, 0.94).setOrigin(0);
    addPanel(this, 240, 135, 432, 244, 0x141a2e, 1, 0xc8b48a);
    this.add.text(240, 30, 'WINDTAIL WORKSHOP', { fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#f0c060' }).setOrigin(0.5);
    this.balance = this.add.text(240, 51, '', { fontFamily: FONT_SMALL, fontSize: '8px', color: '#9ff5ff' }).setOrigin(0.5);
    const kinds = Object.keys(UPGRADES) as UpgradeKind[];
    const items = kinds.map((kind, i) => {
      const meta = UPGRADES[kind];
      const y = 80 + i * 35;
      this.add.image(56, y, meta.tex).setScale(1.25);
      this.descriptions.push(this.add.text(78, y + 11, meta.description, { fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0' }));
      this.labels.push(this.add.text(420, y, '', { fontFamily: FONT_SMALL, fontSize: '7px', color: '#9ff5ff' }).setOrigin(1, 0.5));
      return { label: meta.label, action: () => {
        const ok = SaveManager.buyUpgrade(kind);
        AudioManager.sfx(ok ? 'life' : 'bump', { volume: 0.4 });
        this.message.setText(ok ? 'UPGRADE SAVED — READY FOR YOUR NEXT RUN' : SaveManager.get().upgrades[kind] === 2 ? 'ALREADY MASTERED' : 'FIND NEW GEMS OR IMPROVE STAGE RATINGS');
        this.refresh();
      } };
    });
    this.menu = new Menu(this, items, { x: 82, y: 80, spacing: 35, align: 'left', fontSize: '8px', showHints: false });
    this.message = this.add.text(240, 222, 'NEW GEM = 1 SHARD  /  RATING STAR = 1 SHARD', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0' }).setOrigin(0.5);
    this.add.text(240, 243, 'BACK TO MAP  ·  ESC', { fontFamily: FONT_SMALL, fontSize: '8px', color: '#f0c060' }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); else this.menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    this.refresh();
  }

  private refresh(): void {
    this.balance.setText(`${SaveManager.shards} SKY SHARDS  ·  PERMANENT UPGRADES`);
    (Object.keys(UPGRADES) as UpgradeKind[]).forEach((kind, i) => {
      const tier = SaveManager.get().upgrades[kind];
      const current = SaveManager.stats;
      const next = {
        vitality: `${current.maxHearts} HEARTS${tier < 2 ? ` -> ${current.maxHearts + 1} HEARTS` : ''}`,
        reserves: `${current.startingLives} STARTING LIVES${tier < 2 ? ` -> ${current.startingLives + 1}` : ''}`,
        dash: `DASH RECHARGE ${(0.95 * current.dashCooldown).toFixed(2)}s${tier < 2 ? ` -> ${(0.95 * (current.dashCooldown - 0.15)).toFixed(2)}s` : ''}`,
        duration: `POWER DURATION +${Math.round((current.powerDuration - 1) * 100)}%${tier < 2 ? ` -> +${Math.round((current.powerDuration - 0.75) * 100)}%` : ''}`,
      };
      this.descriptions[i].setText(next[kind]);
      this.labels[i].setText(tier === 2 ? 'MAXED' : `BUY: ${UPGRADE_COSTS[tier]} SHARDS`);
    });
  }

  private close(): void { this.scene.stop(); this.scene.resume('WorldMap'); }
}
