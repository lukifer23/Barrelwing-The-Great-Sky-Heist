import Phaser from 'phaser';
import { FONT_SMALL, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS, MAIN_LEVELS, TRIALS, WORLD_NAMES } from '../data/levels';
import type { LevelDef } from '../data/levels/types';
import { RATING_COLORS, RATING_LABELS } from '../data/levels/types';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager } from '../systems/SaveManager';
import { addLabel } from '../ui/Menu';

interface NodeView {
  id: number;
  x: number;
  y: number;
  ring: Phaser.GameObjects.Arc;
  disc: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  gems: Phaser.GameObjects.Image[];
  stars: Phaser.GameObjects.Text;
  lock: Phaser.GameObjects.Text;
}

const NODE_POS = [
  [{ x: 92, y: 190 }, { x: 152, y: 142 }, { x: 92, y: 94 }],
  [{ x: 242, y: 190 }, { x: 302, y: 142 }, { x: 242, y: 94 }],
  [{ x: 392, y: 190 }, { x: 452, y: 142 }, { x: 392, y: 94 }],
];

export class WorldMapScene extends Phaser.Scene {
  private nodes: NodeView[] = [];
  private selected = 0;
  private trialMode = false;
  private list: LevelDef[] = [];
  private infoTitle!: Phaser.GameObjects.Text;
  private infoMeta!: Phaser.GameObjects.Text;
  private infoGems!: Phaser.GameObjects.Text;
  private infoHint!: Phaser.GameObjects.Text;
  private bgClouds: Phaser.GameObjects.TileSprite[] = [];
  private keyHandler!: (e: KeyboardEvent) => void;

  constructor() { super('WorldMap'); }

  init(data: { trials?: boolean }): void {
    this.trialMode = !!data?.trials;
    this.nodes = [];
    this.bgClouds = [];
    this.list = this.trialMode ? [...TRIALS] : [...MAIN_LEVELS];
    this.selected = this.trialMode ? 0 : Math.min(8, SaveManager.get().unlocked - 1);
  }

  create(): void {
    this.cameras.main.fadeIn(240, 0, 0, 0);
    this.buildBackdrop();
    this.buildHeader();
    if (!this.trialMode) this.buildPaths();
    this.buildNodes();
    this.buildInfoPanel();
    this.buildFooter();

    AudioManager.playMusic('title', { fade: 400 });
    this.keyHandler = (e) => this.handleKey(e);
    this.input.keyboard?.on('keydown', this.keyHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.keyHandler);
    });
    this.refreshSelection();
  }

  private buildBackdrop(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1020).setOrigin(0);
    this.add.tileSprite(0, 0, GAME_WIDTH, 190, 'bg_forest_sky').setOrigin(0).setAlpha(0.55);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg_storm_sky').setOrigin(0).setAlpha(0.45);
    this.bgClouds.push(
      this.add.tileSprite(0, 30, GAME_WIDTH, 200, 'bg_forest_clouds').setOrigin(0).setAlpha(0.14),
      this.add.tileSprite(0, 80, GAME_WIDTH, 190, 'bg_storm_mid').setOrigin(0).setAlpha(0.4),
    );
    // floating islands
    for (const [x, y, s] of [[70, 224, 0.9], [210, 236, 0.7], [350, 228, 0.8], [450, 240, 0.6]] as const) {
      this.add.image(x, y, 'branch3').setScale(s).setAlpha(0.35).setTint(0x5b6a9a);
    }
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1020, 0.35).setOrigin(0);
  }

  private buildHeader(): void {
    this.add.text(240, 22, this.trialMode ? 'SKY TRIALS' : 'SKY MAP', {
      fontFamily: '"Press Start 2P"', fontSize: '15px', color: this.trialMode ? '#9ff5ff' : '#f4e6c8',
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 0, true, true);
    this.add.rectangle(240, 36, 180, 1, 0x6b5a3a, 0.8);
    if (this.trialMode) {
      this.add.text(240, 46, 'POST-CAMPAIGN REMIXES  ·  THE SKY REMEMBERS', {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH - 10, 12, `TRIAL GEMS ${SaveManager.trialGems}/9`, {
        fontFamily: FONT_SMALL, fontSize: '7px', color: '#9ff5ff',
      }).setOrigin(1, 0);
      return;
    }

    const worlds = [1, 2, 3];
    worlds.forEach((w, i) => {
      const x = [92, 242, 392][i];
      const unlocked = SaveManager.get().unlocked >= (w - 1) * 3 + 1;
      this.add.text(x, 52, WORLD_NAMES[w], {
        fontFamily: FONT_SMALL, fontSize: '8px',
        color: unlocked ? '#f0c060' : '#5a6480',
      }).setOrigin(0.5);
    });

    const d = SaveManager.get();
    const total = MAIN_LEVELS.reduce((n, l) => n + (d.levels[l.id]?.completed ? 1 : 0), 0);
    const gems = MAIN_LEVELS.reduce((n, l) => n + (d.levels[l.id]?.gems.filter(Boolean).length ?? 0), 0);
    this.add.text(GAME_WIDTH - 10, 12, `${total}/9 STAGES   ·   ${gems}/27 GEMS`, {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    }).setOrigin(1, 0);
  }

  private buildPaths(): void {
    const g = this.add.graphics();
    g.lineStyle(2, 0x6b5a3a, 0.55);
    for (let w = 0; w < 3; w++) {
      const p = NODE_POS[w];
      g.strokeLineShape(new Phaser.Geom.Line(p[0].x, p[0].y, p[1].x, p[1].y));
      g.strokeLineShape(new Phaser.Geom.Line(p[1].x, p[1].y, p[2].x, p[2].y));
      if (w < 2) {
        const from = p[2];
        const to = NODE_POS[w + 1][0];
        g.strokeLineShape(new Phaser.Geom.Line(from.x, from.y, to.x, to.y));
      }
    }
    // dashed accents
    g.lineStyle(1, 0xf0c060, 0.25);
    for (let w = 0; w < 3; w++) {
      const p = NODE_POS[w];
      for (const [a, b] of [[p[0], p[1]], [p[1], p[2]]] as const) {
        for (let t = 0.15; t < 1; t += 0.2) {
          g.fillStyle(0xf0c060, 0.35);
          g.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1);
        }
      }
    }
  }

  private buildNodes(): void {
    const save = SaveManager.get();
    const trialPos = [{ x: 92, y: 148 }, { x: 242, y: 148 }, { x: 392, y: 148 }];
    this.list.forEach((level, i) => {
      const pos = this.trialMode ? trialPos[i] : NODE_POS[level.world - 1][(level.id - 1) % 3];
      const unlocked = SaveManager.isLevelAvailable(level.id);
      const rec = save.levels[level.id];

      const ring = this.add.circle(pos.x, pos.y, 20, 0x0b1020, 0.9).setStrokeStyle(2, unlocked ? 0xc8b48a : 0x3a4460);
      const disc = this.add.circle(pos.x, pos.y, 16, unlocked ? 0x1d2540 : 0x141a2e, 1).setStrokeStyle(1, unlocked ? 0x6b5a3a : 0x2a3350);
      const label = this.add.text(pos.x, pos.y - 1, String(level.id), {
        fontFamily: '"Press Start 2P"', fontSize: '10px',
        color: unlocked ? '#f4e6c8' : '#5a6480',
      }).setOrigin(0.5);
      const lock = this.add.text(pos.x, pos.y + 20, unlocked ? '' : 'LOCKED', {
        fontFamily: FONT_SMALL, fontSize: '5px', color: '#5a6480',
      }).setOrigin(0.5);
      const stars = this.add.text(pos.x, pos.y + 23, unlocked && rec.completed ? RATING_LABELS[rec.rating] : '', {
        fontFamily: FONT_SMALL, fontSize: '5px', color: RATING_COLORS[rec.rating],
      }).setOrigin(0.5);

      const gems: Phaser.GameObjects.Image[] = [];
      for (let gi = 0; gi < 3; gi++) {
        gems.push(this.add.image(pos.x - 8 + gi * 8, pos.y - 24, 'ui_gem').setScale(0.45)
          .setAlpha(rec.gems[gi] ? 1 : 0.2));
      }

      if (this.trialMode) {
        this.add.text(pos.x, pos.y - 34, ['TRIAL I', 'TRIAL II', 'TRIAL III'][i], {
          fontFamily: FONT_SMALL, fontSize: '7px', color: '#9ff5ff',
        }).setOrigin(0.5);
      }
      const hit = this.add.circle(pos.x, pos.y, 24, 0xffffff, 0.001).setInteractive({ useHandCursor: unlocked });
      hit.on('pointerover', () => { this.selected = i; this.refreshSelection(); });
      hit.on('pointerdown', () => { this.selected = i; this.refreshSelection(); this.enterSelected(); });

      this.nodes.push({ id: level.id, x: pos.x, y: pos.y, ring, disc, label, gems, stars, lock });
    });
  }

  private buildInfoPanel(): void {
    const panel = this.add.rectangle(240, 232, 448, 54, 0x101528, 0.88).setStrokeStyle(1, 0x6b5a3a, 0.9);
    this.infoTitle = this.add.text(24, 212, '', {
      fontFamily: FONT_SMALL, fontSize: '10px', color: '#f4e6c8',
    });
    this.infoMeta = this.add.text(24, 228, '', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    });
    this.infoGems = this.add.text(24, 244, '', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    });
    this.infoHint = this.add.text(GAME_WIDTH - 20, 244, this.trialMode ? 'ENTER — ENTER TRIAL' : 'ENTER — PLAY', {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060',
    }).setOrigin(1, 0);
    panel.setDepth(0);
  }

  private openWorkshop(): void { this.scene.pause(); this.scene.launch('Workshop'); }

  private buildFooter(): void {
    const button = (x: number, label: string, action: () => void) => this.add.text(x, 68, label, { fontFamily: FONT_SMALL, fontSize: '7px', color: '#f0c060', padding: { x: 4, y: 4 } }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', action);
    button(40, 'BACK', () => this.scene.start(this.trialMode ? 'WorldMap' : 'Title'));
    button(150, `U · UPGRADES (${SaveManager.shards})`, () => this.openWorkshop());
    button(270, 'COURIERS', () => { this.scene.pause(); this.scene.launch('Characters', { from: 'WorldMap' }); });
    if (SaveManager.get().completedGame) button(370, this.trialMode ? 'CAMPAIGN' : 'TRIALS', () => this.scene.restart({ trials: !this.trialMode }));
    if (SaveManager.get().bonusUnlocked) button(440, 'SPRINT', () => this.scene.start('SkySprint'));
    this.add.text(12, GAME_HEIGHT - 6, this.trialMode ? 'ARROWS SELECT   ·   ENTER PLAY   ·   ESC SKY MAP' : 'ARROWS SELECT   ·   ENTER PLAY   ·   ESC TITLE', {
      fontFamily: FONT_SMALL, fontSize: '6px', color: '#9fb0d0',
    }).setOrigin(0, 1).setAlpha(0.8);
    if (this.trialMode) return;
    if (SaveManager.get().bonusUnlocked) {
      this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 6, 'K — SKY SPRINT', {
        fontFamily: FONT_SMALL, fontSize: '6px', color: '#67e8f9',
      }).setOrigin(1, 1).setAlpha(0.9);
    }
  }

  private refreshSelection(): void {
    const save = SaveManager.get();
    this.nodes.forEach((n, i) => {
      const active = i === this.selected;
      const unlocked = SaveManager.isLevelAvailable(n.id);
      n.ring.setStrokeStyle(active ? 2 : 2, active ? 0xf0c060 : unlocked ? 0xc8b48a : 0x3a4460);
      n.ring.setScale(active ? 1.12 : 1);
      n.disc.setFillStyle(active ? 0x2a3350 : unlocked ? 0x1d2540 : 0x141a2e, 1);
      n.label.setColor(unlocked ? (active ? '#f0c060' : '#f4e6c8') : '#5a6480');
    });
    const level = this.list[this.selected];
    const rec = save.levels[level.id];
    const unlocked = SaveManager.isLevelAvailable(level.id);
    this.infoTitle.setText(`${this.trialMode ? 'TRIAL' : String(level.id).padStart(2, '0')}  ${level.name.toUpperCase()}`);
    if (!unlocked) {
      this.infoMeta.setText('CLEAR THE PREVIOUS STAGE TO UNLOCK');
      this.infoGems.setText('');
      this.infoHint.setText('');
      return;
    }
    const time = rec.bestTimeMs ? this.formatTime(rec.bestTimeMs) : '—';
    const score = rec.bestScore ? rec.bestScore.toLocaleString('en-US') : '—';
    this.infoMeta.setText(`${level.subtitle}   ·   BEST ${score}   ·   TIME ${time}`);
    const gems = rec.gems.filter(Boolean).length;
    this.infoGems.setText(`GEMS ${gems}/3   ·   RATING ${RATING_LABELS[rec.rating]}   ·   PAR ${this.formatTime(level.parTime * 1000)}`);
    this.infoHint.setText(rec.completed ? 'ENTER — REPLAY' : 'ENTER — PLAY');
  }

  private formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === 'u' || e.key === 'U') { this.openWorkshop(); return; }
    if (e.repeat) return;
    if (this.trialMode) { this.handleTrialKey(e); return; }
    const idx = this.selected;
    const level = this.list[idx];
    const col = level.world - 1;
    const row = (level.id - 1) % 3;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      const nc = Math.max(0, col - 1);
      this.selected = nc * 3 + row;
      AudioManager.sfx('ui_move', { volume: 0.4 }); this.refreshSelection();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      const nc = Math.min(2, col + 1);
      this.selected = nc * 3 + row;
      AudioManager.sfx('ui_move', { volume: 0.4 }); this.refreshSelection();
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      if (row < 2) this.selected = col * 3 + row + 1;
      AudioManager.sfx('ui_move', { volume: 0.4 }); this.refreshSelection();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      if (row > 0) this.selected = col * 3 + row - 1;
      AudioManager.sfx('ui_move', { volume: 0.4 }); this.refreshSelection();
    } else if (e.key === 'Enter' || e.key === ' ') {
      this.enterSelected();
    } else if (e.key === 'Escape') {
      if (this.trialMode) this.scene.start('WorldMap');
      else this.scene.start('Title');
    } else if (e.key === 'k' || e.key === 'K') {
      if (SaveManager.get().bonusUnlocked) this.scene.start('SkySprint');
    }
  }

  private handleTrialKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.selected = (this.selected + this.list.length - 1) % this.list.length;
      AudioManager.sfx('ui_move', { volume: 0.4 }); this.refreshSelection();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.selected = (this.selected + 1) % this.list.length;
      AudioManager.sfx('ui_move', { volume: 0.4 }); this.refreshSelection();
    } else if (e.key === 'Enter' || e.key === ' ') {
      this.enterSelected();
    } else if (e.key === 'Escape') {
      this.scene.start('WorldMap');
    }
  }

  private enterSelected(): void {
    const level = this.list[this.selected];
    if (!SaveManager.isLevelAvailable(level.id)) {
      AudioManager.sfx('bump', { volume: 0.4, rate: 0.8 });
      return;
    }
    AudioManager.sfx('ui_confirm', { volume: 0.5 });
    AudioManager.stopMusic(250);
    this.scene.start('Game', { levelId: level.id, fromMap: true });
  }

  override update(_t: number, delta: number): void {
    for (const c of this.bgClouds) c.tilePositionX += delta * 0.004;
    this.nodes.forEach((n, i) => {
      if (i === this.selected) n.ring.setScale(1.1 + Math.sin(this.time.now / 260) * 0.05);
    });
  }
}
