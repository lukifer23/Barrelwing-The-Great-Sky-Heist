import Phaser from 'phaser';
import { FONT_SMALL } from '../config';
import { CHARACTERS, COURIERS, type CharacterId } from '../data/characters';
import { ARENA_NAMES, type BrawlRules, type BrawlDifficulty } from '../data/brawl';
import type { ThemeId } from '../data/levels/types';
import { SaveManager } from '../systems/SaveManager';
import { Menu } from '../ui/Menu';

export class BrawlSetupScene extends Phaser.Scene {
  private arena: ThemeId = 'forest';
  private difficulty: BrawlDifficulty = 'normal';
  private rules: BrawlRules = 'stock';
  private player: CharacterId = 'pip';
  private cpu: CharacterId = 'fenn';
  private values: Phaser.GameObjects.Text[] = [];
  constructor() { super('BrawlSetup'); }
  create(): void {
    this.values = [];
    this.player = SaveManager.get().selectedCharacter;
    this.add.rectangle(0, 0, 480, 270, 0x101528).setOrigin(0);
    this.add.text(240, 24, 'BARREL BRAWL', { fontFamily: '"Press Start 2P"', fontSize: '17px', color: '#f0c060' }).setOrigin(0.5);
    this.add.text(240, 45, 'STOCK SURVIVAL OR A 90-SECOND KNOCKOUT RACE', { fontFamily: FONT_SMALL, fontSize: '7px', color: '#9ff5ff' }).setOrigin(0.5);
    const record = SaveManager.get().brawl;
    this.add.text(240, 62, `${record.wins} WINS  /  ${record.losses} LOSSES  /  BEST STREAK ${record.bestStreak}`, { fontFamily: FONT_SMALL, fontSize: '7px', color: '#bed0dc' }).setOrigin(0.5);
    const cycle = <T extends string>(list: T[], current: T): T => list[(list.indexOf(current) + 1) % list.length];
    const items = [
      ...(SaveManager.get().brawlRun ? [{ label: 'RESUME SAVED MATCH', action: () => this.scene.start('Brawl', { ...SaveManager.get().brawlRun, resume: true }) }] : []),
      { label: SaveManager.get().brawlRun ? 'NEW MATCH' : 'START MATCH', action: () => this.scene.start('Brawl', { arena: this.arena, difficulty: this.difficulty, rules: this.rules, player: this.player, cpu: this.cpu }) },
      { label: 'RULES', action: () => { this.rules = this.rules === 'stock' ? 'timed' : 'stock'; this.refresh(); } },
      { label: 'YOUR COURIER', action: () => { this.player = cycle<CharacterId>(COURIERS, this.player); this.refresh(); } },
      { label: 'ARENA', action: () => { this.arena = cycle<ThemeId>(['forest', 'factory', 'storm'], this.arena); this.refresh(); } },
      { label: 'CPU LEVEL', action: () => { this.difficulty = cycle<BrawlDifficulty>(['easy', 'normal', 'hard'], this.difficulty); this.refresh(); } },
      { label: 'CPU COURIER', action: () => { this.cpu = cycle<CharacterId>(COURIERS, this.cpu); this.refresh(); } },
      { label: 'BACK TO TITLE', action: () => this.scene.start('Title') },
    ];
    const spacing = SaveManager.get().brawlRun ? 18 : 20;
    const menu = new Menu(this, items, { x: 36, y: 86, align: 'left', spacing, fontSize: '9px', showHints: false });
    const offset = SaveManager.get().brawlRun ? 1 : 0;
    for (let i = 0; i < 5; i++) this.values.push(this.add.text(448, 86 + (offset + 1 + i) * spacing, '', { fontFamily: FONT_SMALL, fontSize: '8px', color: '#9ff5ff' }).setOrigin(1, 0.5).setData('portraitWidth', 190));
    this.add.text(240, 244, 'AIM UP + DASH TO RISE  /  DOWN + DASH TO PARRY', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#bed0dc' }).setOrigin(0.5);
    this.add.text(240, 258, window.matchMedia('(pointer: coarse)').matches ? 'HOLD HIT TO ATTACK AGAIN' : 'KEYBOARD: SPACE JUMP  /  J DASH  /  K ATTACK  /  ESC PAUSE', { fontFamily: FONT_SMALL, fontSize: '6px', color: '#8a93b2' }).setOrigin(0.5);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.scene.start('Title'); else menu.handleKey(e); };
    this.input.keyboard?.on('keydown', onKey); this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey)); this.refresh();
  }
  private refresh(): void {
    const values = [this.rules === 'stock' ? '3 STOCKS' : '90s KO RACE', CHARACTERS[this.player].name, ARENA_NAMES[this.arena], this.difficulty.toUpperCase(), CHARACTERS[this.cpu].name];
    this.values.forEach((text, i) => text.setText(values[i]));
  }
}
