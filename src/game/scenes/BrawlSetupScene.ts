import Phaser from 'phaser';
import { FONT_SMALL, FONT_TITLE } from '../config';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { ARENA_NAMES, FIGHT_STYLES, type BrawlRules, type BrawlDifficulty } from '../data/brawl';
import type { ThemeId } from '../data/levels/types';
import { SaveManager } from '../systems/SaveManager';
import { Menu } from '../ui/Menu';

export type RosterSide = 'player' | 'cpu';
export class BrawlSetupScene extends Phaser.Scene {
  private arena: ThemeId = 'forest';
  private difficulty: BrawlDifficulty = 'normal';
  private rules: BrawlRules = 'stock';
  private player: CharacterId = 'pip';
  private cpu: CharacterId = 'fenn';
  private menu!: Menu;
  private values: Phaser.GameObjects.Text[] = [];
  private summary?: Phaser.GameObjects.Text;
  private width = 0;
  private height = 0;
  constructor() { super('BrawlSetup'); }
  init(): void {
    const save = SaveManager.get(), preset = save.brawlPreset;
    this.player = preset?.player ?? save.selectedCharacter; this.cpu = preset?.cpu ?? 'fenn';
    this.arena = preset?.arena ?? 'forest'; this.rules = preset?.rules ?? 'stock'; this.difficulty = preset?.difficulty ?? 'normal';
  }
  private saveChoices(): void {
    SaveManager.setBrawlPreset({ player: this.player, cpu: this.cpu, arena: this.arena, difficulty: this.difficulty, rules: this.rules });
  }
  create(): void {
    this.draw();
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation(); this.openRoster(e.key === 'ArrowLeft' ? 'player' : 'cpu');
      } else if (e.key === 'Escape') {
        e.stopPropagation(); this.scene.start('Title');
      } else if (this.menu.handleKey(e)) e.stopPropagation();
    };
    const resize = () => { if (this.scene.isActive() && (this.width !== this.scale.width || this.height !== this.scale.height)) this.draw(); };
    this.scale.on('resize', resize); this.events.on('resume', this.draw, this);
    this.input.keyboard?.on('keydown', onKey);
    this.events.once('shutdown', () => {
      this.scale.off('resize', resize); this.events.off('resume', this.draw, this); this.input.keyboard?.off('keydown', onKey);
    });
  }
  chooseFighter(side: RosterSide, id: CharacterId): void { this[side] = id; this.saveChoices(); }
  private openRoster(side: RosterSide): void {
    this.scene.pause();
    this.scene.launch('BrawlRoster', { side, current: this[side] });
  }
  private draw(): void {
    this.tweens.killAll(); this.children.removeAll(true); this.values = []; this.summary = undefined;
    const W = this.width = this.scale.width, H = this.height = this.scale.height, tall = H > W * 1.2;
    this.cameras.main.setSize(W, H).setScroll(0, 0);
    const area = Math.min(W - 32, 660), left = (W - area) / 2;
    const cardH = tall ? Math.min(210, H * 0.24) : Math.min(105, H * 0.30);
    const cardW = area / 2 - 5, top = tall ? H * 0.12 : H * 0.16;
    this.add.rectangle(0, 0, W, H, 0x101528).setOrigin(0);
    this.add.text(W / 2, tall ? H * 0.054 : 15, 'BARREL BRAWL', { fontFamily: FONT_TITLE, fontSize: tall ? '25px' : '15px', color: '#f0c060' }).setOrigin(0.5);
    const record = SaveManager.get().brawl;
    this.add.text(W / 2, tall ? H * 0.09 : 32, `${record.wins} WINS   /   ${record.losses} LOSSES   /   BEST STREAK ${record.bestStreak}`, {
      fontFamily: FONT_SMALL, fontSize: tall ? '13px' : '7px', color: '#bed0dc',
    }).setOrigin(0.5);
    for (const [i, side] of (['player', 'cpu'] as const).entries()) {
      const x = left + cardW / 2 + i * (cardW + 10), y = top + cardH / 2;
      const id = this[side], style = FIGHT_STYLES[id], cpu = side === 'cpu';
      const color = cpu ? 0xffaa93 : 0x9ff5ff;
      const hit = this.add.rectangle(x, y, cardW, cardH, cpu ? 0x362431 : 0x1a3041).setStrokeStyle(2, color)
        .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openRoster(side));
      hit.setData('side', side);
      this.add.text(x, top + cardH * 0.12, cpu ? 'CPU OPPONENT' : 'YOUR FIGHTER', { fontFamily: FONT_SMALL, fontSize: tall ? '15px' : '8px', color: cpu ? '#ffaa93' : '#9ff5ff' }).setOrigin(0.5);
      this.add.sprite(x, top + cardH * 0.61, id).setOrigin(0.5, 35 / 45).setScale(Math.min(cardH / 70, 3.2)).setFlipX(cpu).play(`${id}-idle`);
      this.add.text(x, top + cardH * 0.72, CHARACTERS[id].name, { fontFamily: FONT_TITLE, fontSize: tall ? '17px' : '9px', color: '#fff3de' }).setOrigin(0.5);
      this.add.text(x, top + cardH * 0.89, style.move, { fontFamily: FONT_SMALL, fontSize: tall ? '13px' : '7px', color: '#e3d5ab' }).setOrigin(0.5);
    }
    const cycle = <T extends string>(list: T[], current: T): T => list[(list.indexOf(current) + 1) % list.length];
    const saved = SaveManager.get().brawlRun;
    const items = [
      ...(saved ? [{ label: 'RESUME SAVED MATCH', action: () => this.scene.start('Brawl', { ...saved, resume: true }) }] : []),
      { label: saved ? 'NEW MATCH' : 'START MATCH', action: () => this.scene.start('Brawl', { arena: this.arena, difficulty: this.difficulty, rules: this.rules, player: this.player, cpu: this.cpu }) },
      { label: 'RULES', action: () => { this.rules = this.rules === 'stock' ? 'timed' : 'stock'; this.saveChoices(); this.refresh(); } },
      { label: 'ARENA', action: () => { this.arena = cycle<ThemeId>(['forest', 'factory', 'storm'], this.arena); this.saveChoices(); this.refresh(); } },
      { label: 'CPU LEVEL', action: () => { this.difficulty = cycle<BrawlDifficulty>(['easy', 'normal', 'hard'], this.difficulty); this.saveChoices(); this.refresh(); } },
      { label: 'BACK TO TITLE', action: () => this.scene.start('Title') },
    ];
    const y = top + cardH + (tall ? 52 : 20), spacing = Math.min(tall ? 62 : 26, (H - y - (tall ? 75 : 19)) / (items.length - 0.5));
    this.menu = new Menu(this, items, { x: left + 16, y, align: 'left', spacing, fontSize: tall ? '18px' : '9px', showHints: false });
    for (let i = 0; i < 3; i++) this.values.push(this.add.text(left + area - 6, y + (i + (saved ? 2 : 1)) * spacing, '',
      { fontFamily: FONT_SMALL, fontSize: tall ? '16px' : '9px', color: '#9ff5ff' }).setOrigin(1, 0.5));
    const summaryY = y + (items.length - 0.20) * spacing;
    if (tall && H - summaryY > 210) {
      this.summary = this.add.text(left + 16, summaryY, '', { fontFamily: 'Roboto, Arial, sans-serif', fontSize: '19px',
        color: '#cfdae5', lineSpacing: 5, wordWrap: { width: area - 32 } });
    }
    this.add.text(W / 2, tall ? H - 60 : H - 9, window.matchMedia('(pointer: coarse)').matches ? 'TAP A FIGHTER TO CHANGE COURIER' : 'LEFT: YOUR FIGHTER   /   RIGHT: CPU FIGHTER',
      { fontFamily: FONT_SMALL, fontSize: tall ? '14px' : '7px', color: '#c4d0de' }).setOrigin(0.5);
    this.refresh();
  }
  private refresh(): void {
    const values = [this.rules === 'stock' ? '3 STOCKS' : '90s KO RACE', ARENA_NAMES[this.arena], this.difficulty.toUpperCase()];
    this.values.forEach((text, i) => text.setText(values[i]));
    if (this.summary) {
      const rule = this.rules === 'stock' ? 'Knock your opponent out three times.' : 'Score the most ring-outs in 90 seconds.';
      const terrain = { forest: 'Use the high center platform for aerial attacks.', factory: 'The conveyor shifts direction during the match.', storm: 'Gusts push airborne fighters across staggered ledges.' };
      this.summary.setText(rule + '\n' + terrain[this.arena]);
    }
  }
}
