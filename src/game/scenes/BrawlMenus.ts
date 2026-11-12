import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import type { BrawlOptions } from '../data/brawl';
import { SaveManager } from '../systems/SaveManager';
import { Menu } from '../ui/Menu';

export class BrawlPauseScene extends Phaser.Scene {
  private options!: BrawlOptions;
  constructor() { super('BrawlPause'); }
  init(data: { options: BrawlOptions }): void { this.options = data.options; }
  create(): void {
    this.add.rectangle(0, 0, 480, 270, 0x05070d, 0.92).setOrigin(0);
    this.add.text(240, 58, 'BRAWL PAUSED', { fontFamily: '"Press Start 2P"', fontSize: '15px', color: '#f0c060' }).setOrigin(0.5);
    const resume = () => { this.scene.resume('Brawl'); this.scene.stop(); };
    const menu = new Menu(this, [
      { label: 'RESUME', action: resume },
      { label: 'SETTINGS', action: () => { this.scene.pause(); this.scene.launch('Settings', { from: 'BrawlPause' }); } },
      { label: 'RESTART MATCH', action: () => { this.scene.stop('Brawl'); SaveManager.saveBrawlRun(null); this.scene.start('Brawl', { ...this.options, resume: false }); } },
      { label: 'SAVE AND LEAVE', action: () => { this.scene.stop('Brawl'); this.scene.start('BrawlSetup'); } },
    ], { x: 240, y: 108, spacing: 29, fontSize: '10px', showHints: false });
    const onKey = (e: KeyboardEvent) => { if (e.repeat) return; if (e.key === 'Escape' || e.key.toLowerCase() === 'p') resume(); else menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }
}
export class BrawlResultsScene extends Phaser.Scene {
  private result!: { won: boolean; options: BrawlOptions; knockouts: number; elapsedMs: number };
  constructor() { super('BrawlResults'); }
  init(result: BrawlResultsScene['result']): void { this.result = result; }
  create(): void {
    this.add.rectangle(0, 0, 480, 270, 0x101528).setOrigin(0);
    this.add.text(240, 44, this.result.won ? 'SPECIAL DELIVERY!' : 'RETURN TO SENDER', { fontFamily: '"Press Start 2P"', fontSize: '15px', color: this.result.won ? '#f0c060' : '#ffb0a0' }).setOrigin(0.5);
    this.add.text(240, 76, this.result.won ? 'YOU WON. THE PAPERWORK LOST.' : 'THE TAIL IS FINE. THE PRIDE IS NOT.', { fontFamily: FONT_SMALL, fontSize: '7px', color: '#bed0dc' }).setOrigin(0.5);
    const record = SaveManager.get().brawl;
    this.add.text(240, 110, `${this.result.knockouts} KNOCKOUTS  /  ${Math.floor(this.result.elapsedMs / 1000)} SECONDS\n${record.wins} WINS  /  BEST STREAK ${record.bestStreak}`, { fontFamily: FONT_SMALL, fontSize: '9px', color: '#9ff5ff', align: 'center', lineSpacing: 7 }).setOrigin(0.5);
    const menu = new Menu(this, [
      { label: 'REMATCH', action: () => this.scene.start('Brawl', { ...this.result.options, resume: false }) },
      { label: 'BRAWL SETUP', action: () => this.scene.start('BrawlSetup') },
      { label: 'TITLE', action: () => this.scene.start('Title') },
    ], { x: 240, y: 169, spacing: 25, fontSize: '10px', showHints: false });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.scene.start('BrawlSetup'); else menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }
}
