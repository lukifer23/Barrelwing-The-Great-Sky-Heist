import Phaser from 'phaser';
import { COLORS, FONT_SMALL, GAME_HEIGHT, GAME_WIDTH, PHYSICS, FLIGHT } from '../config';
import { getLevel } from '../data/levels';
import { THEMES, type LevelDef, type LevelObject, type TerrainRect, type TileStyle, type FlightGate, type PowerKind } from '../data/levels/types';
import { objectIds } from '../data/objectIds';
import { POWER_META } from '../data/powerups';
import { Player } from '../player/Player';
import { Enemy } from '../entities/Enemy';
import { Barrel, BarrelSpawner, type BarrelVariant } from '../entities/Barrel';
import { MovingPlatform } from '../entities/MovingPlatform';
import { Boss } from '../entities/Boss';
import { InputManager } from '../systems/InputManager';
import { AudioManager } from '../systems/AudioManager';
import { SaveManager, type RunSnapshot } from '../systems/SaveManager';
import { Effects } from '../systems/Effects';
import { Hud } from '../ui/Hud';

interface GameData {
  levelId: number;
  fromMap?: boolean;
  resume?: boolean;
}

interface FlightGateRuntime {
  at: number;
  gap: number;
  size: number;
  rectTop: Phaser.Geom.Rectangle;
  rectBottom: Phaser.Geom.Rectangle;
  visTop: Phaser.GameObjects.TileSprite;
  visBottom: Phaser.GameObjects.TileSprite;
  trimTop: Phaser.GameObjects.Rectangle;
  trimBottom: Phaser.GameObjects.Rectangle;
  baseTopY: number;
  baseBottomY: number;
  moving?: 'y';
  amp: number;
  speed: number;
  phase: number;
}

interface FlightRuntime {
  bounds: Phaser.Geom.Rectangle;
  gates: FlightGateRuntime[];
  def: Extract<LevelObject, { t: 'flight' }>;
  active: boolean;
  tile: number;
  startX: number;
  endX: number;
}

interface GateRuntime {
  id: string;
  sprite: Phaser.GameObjects.TileSprite;
  body: Phaser.Physics.Arcade.StaticBody;
  open: boolean;
}

export class GameScene extends Phaser.Scene {
  level!: LevelDef;
  private player!: Player;
  private inputMgr!: InputManager;
  private hud!: Hud;
  private fx!: Effects;

  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private oneWays!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.GameObjects.Group;
  private barrels!: Phaser.GameObjects.Group;
  private coins!: Phaser.GameObjects.Group;
  private gems!: Phaser.GameObjects.Group;
  private springs!: Phaser.Physics.Arcade.StaticGroup;
  private dangers!: Phaser.Physics.Arcade.StaticGroup;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private exits!: Phaser.Physics.Arcade.StaticGroup;

  private spawners: BarrelSpawner[] = [];
  private movers: MovingPlatform[] = [];
  private ladders: { sprite: Phaser.GameObjects.TileSprite; rect: Phaser.Geom.Rectangle }[] = [];
  private ladderRects: Phaser.Geom.Rectangle[] = [];
  private conveyors: { sprite: Phaser.GameObjects.TileSprite; dir: number; speed: number; x: number; y: number; w: number }[] = [];
  private gates: GateRuntime[] = [];
  private switches: { sprite: Phaser.GameObjects.Image; id: string; used: boolean }[] = [];
  private spikes: Phaser.GameObjects.TileSprite[] = [];
  private steamVents: { x: number; y: number; period: number; phase: number; spout: Phaser.GameObjects.Rectangle; warn: Phaser.GameObjects.Rectangle }[] = [];
  private lightnings: { x: number; y: number; w: number; period: number; phase: number; beam: Phaser.GameObjects.Rectangle; warn: Phaser.GameObjects.Rectangle }[] = [];
  private updrafts: { rect: Phaser.Geom.Rectangle; power: number }[] = [];
  private fallingPlats: { sprite: Phaser.GameObjects.TileSprite; body: Phaser.Physics.Arcade.StaticBody; used: boolean }[] = [];
  private flightZones: FlightRuntime[] = [];
  private tutorials: { x: number; y: number; text: string; shown: boolean }[] = [];
  private decorSprites: Phaser.GameObjects.Image[] = [];
  private powerups: Phaser.GameObjects.Image[] = [];
  private boss: Boss | null = null;
  private bossBarVisible = false;

  private hearts = 3;
  private lives = 3;
  private coinsCollected = 0;
  private coinCombo = 0;
  private lastCoinAt = 0;
  private score = 0;
  private scoreAtLevelStart = 0;
  private gemsCollected: [boolean, boolean, boolean] = [false, false, false];
  private elapsedMs = 0;
  private levelStartScore = 0;
  private checkpoint = { x: 0, y: 0 };
  private levelDone = false;
  private gameOver = false;
  private paused = false;
  private introUntil = 0;
  private deathAt = 0;
  private respawning = false;
  private bossDefeated = false;
  private escapeMode = false;
  private exitSprite!: Phaser.GameObjects.Image;
  private exitGlow!: Phaser.GameObjects.Image;
  private projGroup!: Phaser.GameObjects.Group;
  private bossBolts: { sprite: Phaser.Physics.Arcade.Sprite; vx: number; vy: number; life: number }[] = [];
  private bossFlameRect: Phaser.Geom.Rectangle | null = null;
  private bossFlameDir = -1;
  private bossFlameUntil = 0;
  private shakeTimer = 0;
  private bgLayers: { sprite: Phaser.GameObjects.TileSprite; factor: number; baseY: number }[] = [];
  private killY = 0;
  private musicKey: 'forest' | 'factory' | 'storm' = 'forest';
  private shownTutorials = new Set<number>();
  private lastFlapAt = 0;
  private resumeRun: RunSnapshot | null = null;
  private collected = new Set<number>();
  private defeated = new Set<number>();
  private autosaveAt = 0;
  private gameOverContainer?: Phaser.GameObjects.Container;
  private gameOverKey?: (e: KeyboardEvent) => void;
  private saveOnHide = () => { this.persistRun(); this.openPause(); };
  private pageHide = () => this.persistRun();

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    const level = getLevel(data.levelId ?? 1);
    if (!level) throw new Error('Unknown level ' + data.levelId);
    this.level = level;
    this.resumeRun = data.resume && SaveManager.get().run?.levelId === level.id ? SaveManager.get().run : null;
    this.collected = new Set(this.resumeRun?.collected ?? []);
    this.defeated = new Set(this.resumeRun?.defeated ?? []);
    this.coinCombo = 0;
    this.lastCoinAt = 0;
    this.autosaveAt = 0;
    this.gameOverContainer = undefined;
    this.gameOverKey = undefined;
    this.levelDone = false;
    this.gameOver = false;
    this.paused = false;
    this.respawning = false;
    this.deathAt = 0;
    this.boss = null;
    this.bossDefeated = false;
    this.escapeMode = false;
    this.spawners = [];
    this.movers = [];
    this.ladders = [];
    this.ladderRects = [];
    this.conveyors = [];
    this.gates = [];
    this.switches = [];
    this.spikes = [];
    this.steamVents = [];
    this.lightnings = [];
    this.updrafts = [];
    this.fallingPlats = [];
    this.flightZones = [];
    this.tutorials = [];
    this.decorSprites = [];
    this.powerups = [];
    this.bgLayers = [];
    this.bossBolts = [];
    this.bossFlameRect = null;
    this.coinsCollected = 0;
    this.gemsCollected = [false, false, false];
    this.score = 0;
    this.elapsedMs = 0;
    this.hearts = 3;
    this.lives = SaveManager.stats.startingLives;
    this.shownTutorials.clear();
  }

  create(): void {
    const L = this.level;
    const ts = L.tile;
    const W = L.width * ts;
    const H = L.height * ts;
    this.killY = H + 60;
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(THEMES[L.theme].sky);
    this.cameras.main.roundPixels = true;

    this.score = 0;
    this.scoreAtLevelStart = 0;

    this.buildBackground(W, H);
    this.buildTerrain();
    this.buildObjects();
    this.buildPlayer();
    this.buildCollisions();
    this.buildCamera();
    this.buildHud();
    this.restoreRun();
    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.buildIntro();
    this.resizeViewport();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);

    this.inputMgr = new InputManager(this);
    this.fx = new Effects(this);
    this.wireEvents();

    this.musicKey = L.music;
    AudioManager.playMusic(L.music, { fade: 500 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.saveOnHide);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.saveOnHide);
    window.addEventListener('pagehide', this.pageHide);
    this.persistRun();

  }

  // ---------------------------------------------------------------- build
  private buildBackground(W: number, H: number): void {
    const th = THEMES[this.level.theme];
    this.add.rectangle(0, 0, GAME_WIDTH + 4, GAME_HEIGHT + 4, th.sky)
      .setOrigin(0).setScrollFactor(0).setDepth(-40);

    const layers: { key: string; factor: number; alpha: number; y: number; depth: number; tint?: number }[] = [
      { key: th.far, factor: 0.06, alpha: 0.62, y: 44, depth: -38, tint: this.level.theme === 'forest' ? 0xa8c8e0 : 0xffffff },
      { key: th.mid, factor: 0.16, alpha: 0.92, y: 30, depth: -36, tint: this.level.theme === 'forest' ? 0xa8c8b0 : 0xd8c0b0 },
      { key: th.near, factor: 0.32, alpha: this.level.theme === 'storm' ? 0.8 : 0.96, y: 62, depth: -35, tint: this.level.theme === 'forest' ? 0x6a8a6a : this.level.theme === 'storm' ? 0x5a4a8a : 0x9a8aa0 },
    ];
    for (const l of layers) {
      if (!this.textures.exists(l.key)) continue;
      const src = this.textures.get(l.key).getSourceImage() as HTMLImageElement;
      const sw = Math.max(1, src.width), sh = Math.max(1, src.height);
      const sprite = this.add.tileSprite(0, l.y, GAME_WIDTH, sh, l.key)
        .setOrigin(0).setScrollFactor(0).setDepth(l.depth).setAlpha(l.alpha);
      if (l.tint) sprite.setTint(l.tint);
      this.bgLayers.push({ sprite, factor: l.factor, baseY: l.y });
    }
    // soft cloud band that tiles cleanly (not used inside the copperworks)
    if (this.level.theme !== 'factory' && this.textures.exists('bg_forest_clouds')) {
      const clouds = this.add.tileSprite(0, -6, GAME_WIDTH, 208, 'bg_forest_clouds')
        .setOrigin(0).setScrollFactor(0).setDepth(-33)
        .setAlpha(this.level.theme === 'storm' ? 0.3 : 0.14);
      this.bgLayers.push({ sprite: clouds, factor: 0.45, baseY: -6 });
    }
    // cool atmosphere wash between background and playfield
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, th.sky, 0.10)
      .setOrigin(0).setScrollFactor(0).setDepth(-20);

    // ambient life per world
    if (this.level.theme === 'forest') {
      this.add.particles(0, 0, 'fx_glow', {
        x: { min: 0, max: GAME_WIDTH }, y: { min: 100, max: GAME_HEIGHT },
        lifespan: { min: 3000, max: 6000 }, speedX: { min: -10, max: 10 },
        speedY: { min: -10, max: -2 }, scale: { start: 0.14, end: 0 },
        alpha: { start: 0.35, end: 0 }, frequency: 260, tint: [0xffe9a0, 0xbfe8a0],
      }).setScrollFactor(0).setDepth(19);
    } else if (this.level.theme === 'factory') {
      this.add.particles(0, 0, 'fx_spark', {
        x: { min: 0, max: GAME_WIDTH }, y: GAME_HEIGHT + 6,
        lifespan: { min: 1800, max: 3400 }, speedY: { min: -70, max: -28 },
        speedX: { min: -14, max: 14 }, scale: { start: 0.5, end: 0 },
        alpha: { start: 0.55, end: 0 }, frequency: 210, tint: [0xff9a40, 0xffd27a],
      }).setScrollFactor(0).setDepth(22);
    } else {
      this.add.particles(0, 0, 'fx_streak', {
        x: { min: 0, max: GAME_WIDTH + 30 }, y: -12,
        lifespan: { min: 900, max: 1400 }, speedY: { min: 240, max: 330 },
        speedX: { min: -40, max: -10 }, scaleX: 0.5, scaleY: 1.4,
        alpha: { start: 0.22, end: 0 }, frequency: 26, rotate: 90,
        tint: 0x9fd8ff,
      }).setScrollFactor(0).setDepth(23);
      this.time.addEvent({
        delay: 10500, loop: true, callback: () => {
          if (!this.scene.isActive()) return;
          this.cameras.main.flash(160, 190, 215, 255);
          AudioManager.sfx('throw', { volume: 0.14, rate: 0.35 });
        },
      });
    }
  }

  private styleTextures(style: TileStyle | undefined): { top: string; fill: string; tile: number } {
    const th = THEMES[this.level.theme];
    if (style === 'metal' || this.level.theme === 'factory') {
      return { top: 'factory_top', fill: 'factory_fill', tile: 18 };
    }
    if (style === 'cloud') {
      return { top: th.topTex, fill: th.fillTex, tile: this.level.tile };
    }
    return { top: th.topTex, fill: th.fillTex, tile: this.level.tile };
  }

  private buildTerrain(): void {
    const ts = this.level.tile;
    this.solids = this.physics.add.staticGroup();
    this.oneWays = this.physics.add.staticGroup();

    for (const r of this.level.terrain) {
      const px = r.x * ts, py = r.y * ts, w = r.w * ts, h = r.h * ts;
      if (r.decor) {
        this.drawTerrainVisual(r, px, py, w, h, 0.6);
        continue;
      }
      if (r.style === 'wood') {
        this.addOneWayPlank(px, py, w);
        continue;
      }
      this.drawTerrainVisual(r, px, py, w, h, 1);
      const body = this.add.rectangle(px + w / 2, py + h / 2, w, h, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.solids.add(body);
      this.decorateTerrain(r, px, py, w);
    }
  }

  private drawTerrainVisual(r: TerrainRect, px: number, py: number, w: number, h: number, alpha: number): void {
    const tex = this.styleTextures(r.style);
    const factory = this.level.theme === 'factory';
    const scale = factory ? 2 : 1;
    const topH = Math.min(h, (tex.tile === 18 ? 18 : 32) * scale);
    const top = this.add.tileSprite(px + w / 2, py + topH / 2, w, topH, tex.top)
      .setDepth(5).setAlpha(alpha);
    if (scale !== 1) top.setTileScale(scale, scale);
    if (factory) top.setTint(0xffd8b8);
    if (this.level.theme === 'storm' && r.style === 'metal') top.setTint(0x9fb0d8);
    if (h > topH) {
      const fh = h - topH;
      const fill = this.add.tileSprite(px + w / 2, py + topH + fh / 2, w, fh, tex.fill)
        .setDepth(4).setAlpha(alpha);
      if (scale !== 1) fill.setTileScale(scale, scale);
      if (factory) fill.setTint(0xd8b498);
      if (this.level.theme === 'storm' && r.style === 'metal') fill.setTint(0x8a9ac0);
    }
  }

  private addOneWayPlank(px: number, py: number, w: number): void {
    const key = this.level.theme === 'factory' ? 'factory_plate' : THEMES[this.level.theme].topTex;
    const sprite = this.add.tileSprite(px + w / 2, py + 8, w, 16, key).setDepth(6);
    this.physics.add.existing(sprite, true);
    const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(w, 10);
    body.setOffset(0, 0);
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    this.oneWays.add(sprite);
  }

  private decorateTerrain(r: TerrainRect, px: number, py: number, w: number): void {
    const rng = new Phaser.Math.RandomDataGenerator([String(this.level.id) + r.x + ':' + r.y]);
    const theme = this.level.theme;
    const count = Math.max(1, Math.floor(w / 110));
    for (let i = 0; i < count; i++) {
      const x = px + 30 + rng.frac() * Math.max(1, w - 60);
      const roll = rng.frac();
      if (theme === 'forest') {
        if (roll < 0.3) this.addDecor('vine', x, py, 1, 5);
        else if (roll < 0.55) this.addDecor(rng.frac() < 0.5 ? 'mushroom_red' : 'mushroom_brown', x, py, 1, 8);
        else if (roll < 0.75) this.addDecor('prop_plant', x, py, 1, 7);
        else this.addDecor('rock', x, py, 1, 6);
      } else if (theme === 'factory') {
        if (roll < 0.4) this.addDecor('crate', x, py, 1, 7);
        else if (roll < 0.7) this.addDecor('pipe', x, py, 1, 7);
      } else {
        if (roll < 0.5) this.addDecor('cloud', x, py, 1, 3);
      }
    }
  }

  private addDecor(kind: string, x: number, y: number, scale: number, depth: number): void {
    const key = kind === 'pipe' ? 'crate' : kind === 'cloud' ? 'bg_clouds' : kind === 'plant' ? 'prop_plant' : kind;
    if (!this.textures.exists(key)) return;

    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth);
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const targetH = kind === 'tree' ? 130 : kind === 'crate' ? 18 : kind === 'cloud' ? 26 : kind === 'rock' ? 16 : 20;
    const fit = Math.min(1.2, targetH / Math.max(1, src.height));
    img.setScale(scale * fit);
    if (kind === 'vine') img.setOrigin(0.5, 0).setY(y + 2).setAlpha(0.85);
    if (kind === 'pipe') img.setTint(0x9aa0b0);
    if (kind === 'cloud') img.setAlpha(0.5);
    this.decorSprites.push(img);
  }

  private buildObjects(): void {
    const ts = this.level.tile;
    this.enemies = this.add.group();
    this.barrels = this.add.group();
    this.coins = this.add.group();
    this.gems = this.add.group();
    this.springs = this.physics.add.staticGroup();
    this.dangers = this.physics.add.staticGroup();
    this.checkpoints = this.physics.add.staticGroup();
    this.exits = this.physics.add.staticGroup();
    this.projGroup = this.add.group();

    const cx = (t: number) => t * ts + ts / 2;

    let gemIndex = 0;
    const stableIds = objectIds(this.level);
    for (const [objectIndex, o] of this.level.objects.entries()) {
      const objectId = stableIds[objectIndex];
      const index = o.t === 'gem' ? gemIndex++ : -1;
      if (this.collected.has(objectId) || (o.t === 'enemy' && this.defeated.has(objectId))) continue;
      switch (o.t) {
        case 'coin': this.addCoin(cx(o.x), o.y * ts + ts / 2, objectId); break;
        case 'gem': this.addGem(cx(o.x), o.y * ts + ts / 2, index, objectId); break;
        case 'enemy': {
          const e = new Enemy(this, { kind: o.kind, x: cx(o.x), y: o.y * ts, patrol: o.patrol, amp: o.amp, speed: o.speed, tile: ts });
          e.setData('objectId', objectId);
          this.enemies.add(e);
          if (o.kind === 'plant') e.setY(o.y * ts + 4);
          break;
        }
        case 'barrelSpawner':
          this.spawners.push(new BarrelSpawner(this, {
            x: cx(o.x), y: o.y * ts + 8, dir: o.dir, interval: o.interval,
            variant: o.variant, phase: o.phase,
          }, this.barrels));
          break;
        case 'barrel': {
          const b = new Barrel(this, cx(o.x), o.y * ts, o.dir, o.variant ?? 'standard');
          this.barrels.add(b);
          break;
        }
        case 'checkpoint': this.addCheckpoint(cx(o.x), o.y * ts); break;
        case 'spring': this.addSpring(cx(o.x), o.y * ts, o.power ?? 470); break;
        case 'ladder': this.addLadder(cx(o.x), o.y * ts, o.h * ts); break;
        case 'mover': {
          const key = this.level.theme === 'factory' ? 'factory_plate' : this.level.theme === 'storm' ? 'storm_top' : 'plank';
          const mp = new MovingPlatform(this, cx(o.x), o.y * ts, o.w * ts, key, o.axis, o.dist * ts, o.speed);
          this.movers.push(mp);
          break;
        }
        case 'conveyor': this.addConveyor(cx(o.x), o.y * ts, o.w * ts, o.dir, o.speed ?? 80); break;
        case 'switch': this.addSwitch(cx(o.x), o.y * ts, o.id); break;
        case 'gate': this.addGate(cx(o.x), o.y * ts, o.w * ts, o.h * ts, o.id); break;
        case 'flight': this.addFlight(o); break;
        case 'windCrystal': this.addWindCrystal(cx(o.x), o.y * ts + ts / 2, objectId); break;
        case 'spikes': this.addSpikes(cx(o.x), o.y * ts, o.w * ts); break;
        case 'steam': this.addSteam(cx(o.x), o.y * ts, o.period, o.phase ?? 0); break;
        case 'lightning': this.addLightning(o.x * ts, o.y * ts, o.w * ts, o.period, o.phase ?? 0); break;
        case 'updraft': {
          const rect = new Phaser.Geom.Rectangle(o.x * ts, o.y * ts, o.w * ts, o.h * ts);
          this.updrafts.push({ rect, power: o.power ?? 1 });
          this.add.particles(rect.left, rect.bottom, 'fx_streak', { x: { min: 0, max: rect.width }, lifespan: rect.height / 90 * 1000, speedY: -90, speedX: 0, frequency: 180, scaleX: 0.4, scaleY: 0.8, alpha: { start: 0.35, end: 0 }, tint: 0x9ff5ff }).setDepth(8);
          break;
        }
        case 'fallingPlatform': this.addFallingPlatform(cx(o.x), o.y * ts, o.w * ts); break;
        case 'exit': this.addExit(cx(o.x), o.y * ts); break;
        case 'tutorial': this.tutorials.push({ x: cx(o.x), y: o.y * ts, text: o.text, shown: false }); break;
        case 'powerup': this.addPowerup(o.kind, cx(o.x), o.y * ts + ts / 2, objectId); break;
        case 'decor': this.addDecor(o.kind, cx(o.x), o.y * ts, o.scale ?? 1, o.kind === 'tree' ? 2 : 7); break;
        case 'boss':
          this.boss = new Boss(this, cx(o.x), o.y * ts, {
            left: (o.x - 9) * ts, right: (o.x + 9) * ts,
            top: (o.y - 3) * ts, floorY: (o.y + 3) * ts,
          }, this.level.bossPhase ?? 1);
          this.bossBarVisible = true;
          break;
        case 'goalZone': {
          const goal = this.add.rectangle((o.x + o.w / 2) * ts, (o.y + o.h / 2) * ts, o.w * ts, o.h * ts, 0xffe08a, 0.12);
          this.physics.add.existing(goal, true);
          this.exits.add(goal);
          break;
        }
      }
    }
  }

  private addCoin(x: number, y: number, objectId: number): void {
    const c = this.add.sprite(x, y, 'acorn').setDepth(10);
    c.setData('objectId', objectId);
    this.coins.add(c);
    this.tweens.add({ targets: c, y: y - 3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 500 });
    c.play('acorn-spin');
  }

  private addGem(x: number, y: number, index: number, objectId: number): void {
    const idx = index >= 0 ? index : 0;
    const g = this.add.image(x, y, 'gem_blue').setDepth(11).setScale(0.95);
    g.setData('gemIndex', idx).setData('objectId', objectId);
    this.gems.add(g);
    const glow = this.add.image(x, y, 'fx_glow').setTint(0x8fe9ff).setDepth(9).setAlpha(0.5).setScale(1.4);
    this.tweens.add({ targets: g, y: y - 5, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: glow, alpha: 0.2, scale: 1.8, duration: 900, yoyo: true, repeat: -1 });
    g.setData('glow', glow);
  }

  private addCheckpoint(x: number, y: number): void {
    const pole = this.add.rectangle(x, y - 22, 2, 44, 0x6b4a2a).setDepth(9);
    const flag = this.add.image(x + 8, y - 34, 'flag_a').setDepth(10).setScale(0.9);
    const glow = this.add.image(x, y - 18, 'fx_glow').setTint(0x9fe0a0).setDepth(8).setAlpha(0);
    const body = this.add.rectangle(x, y - 10, 26, 26, 0x000000, 0);
    this.physics.add.existing(body, true);
    body.setData('x', x).setData('y', y).setData('flag', flag).setData('glow', glow).setData('pole', pole);
    this.checkpoints.add(body);
    this.tweens.add({ targets: flag, angle: { from: -2, to: 2 }, duration: 1600, yoyo: true, repeat: -1 });
  }

  private addSpring(x: number, y: number, power: number): void {
    const s = this.add.image(x, y, 'spring').setOrigin(0.5, 1).setDepth(9);
    this.physics.add.existing(s, true);
    (s.body as Phaser.Physics.Arcade.StaticBody).setSize(16, 8).setOffset(0, 8);
    s.setData('power', power);
    this.springs.add(s);
  }

  private addLadder(x: number, y: number, h: number): void {
    const sp = this.add.tileSprite(x, y + h / 2, 14, h, 'vine').setDepth(8).setAlpha(0.35);
    // readable wooden ladder rails + rungs
    const railL = this.add.rectangle(x - 6, y + h / 2, 2, h, 0x7a5230).setDepth(9);
    const railR = this.add.rectangle(x + 6, y + h / 2, 2, h, 0x7a5230).setDepth(9);
    for (let ry = 8; ry < h; ry += 10) {
      this.add.rectangle(x, y + ry, 12, 2, 0x9a6a3c).setDepth(9);
    }
    railL.setAlpha(0.9); railR.setAlpha(0.9);
    const rect = new Phaser.Geom.Rectangle(x - 10, y + 2, 20, h + 4);
    this.ladders.push({ sprite: sp, rect });
    this.ladderRects.push(rect);
  }

  private addConveyor(x: number, y: number, w: number, dir: number, speed: number): void {
    const sp = this.add.tileSprite(x, y + 8, w, 14, 'conveyor_0').setDepth(7);
    this.physics.add.existing(sp, true);
    (sp.body as Phaser.Physics.Arcade.StaticBody).setSize(w, 14);
    this.conveyors.push({ sprite: sp, dir, speed, x: x - w / 2, y: y + 1, w });
  }

  private addSwitch(x: number, y: number, id: string): void {
    const sw = this.add.image(x, y, 'switch_off').setOrigin(0.5, 1).setDepth(9);
    const body = this.add.rectangle(x, y - 10, 18, 22, 0x000000, 0);
    this.physics.add.existing(body, true);
    body.setData('id', id).setData('sprite', sw);
    this.dangers.add(body);
    this.switches.push({ sprite: sw, id, used: false });
  }

  private addGate(x: number, y: number, w: number, h: number, id: string): void {
    const key = this.level.theme === 'factory' ? 'factory_plate' : this.level.theme === 'storm' ? 'storm_top' : 'plank';
    const sp = this.add.tileSprite(x, y + h / 2, w, h, key).setDepth(7);
    this.physics.add.existing(sp, true);
    const body = sp.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(w, h);
    this.solids.add(sp);
    this.gates.push({ id, sprite: sp, body, open: false });
  }

  private addFlight(o: Extract<LevelObject, { t: 'flight' }>): void {
    const ts = this.level.tile;
    const bounds = new Phaser.Geom.Rectangle(o.x * ts, o.y * ts, o.w * ts, o.h * ts);
    const tex = this.level.theme === 'factory'
      ? { top: 'factory_top', fill: 'factory_fill' }
      : { top: THEMES[this.level.theme].topTex, fill: THEMES[this.level.theme].fillTex };
    const gates: FlightGateRuntime[] = o.gates.map((g, i) => {
      const gapRel = g.gap * ts;
      const size = g.size * ts;
      const topH = Math.max(4, gapRel - size / 2);
      const botY = gapRel + size / 2;
      const gx = bounds.left + g.at * ts;
      const visTop = this.add.tileSprite(gx, bounds.top, 22, topH, tex.top).setOrigin(0.5, 0).setDepth(6);
      const visBottom = this.add.tileSprite(gx, bounds.top + botY, 22, Math.max(4, bounds.height - botY), tex.fill).setOrigin(0.5, 0).setDepth(6);
      const trimTop = this.add.rectangle(gx, bounds.top + topH, 26, 4, 0xe4546a, 0.9).setDepth(7);
      const trimBottom = this.add.rectangle(gx, bounds.top + botY, 26, 4, 0xe4546a, 0.9).setDepth(7);
      const warn = this.add.rectangle(gx, bounds.top + gapRel, 3, size, 0x9ff5ff, 0.14).setDepth(7);
      this.tweens.add({ targets: warn, alpha: 0.04, duration: 600, yoyo: true, repeat: -1 });
      return {
        at: g.at * ts,
        gap: bounds.top + gapRel,
        size,
        rectTop: new Phaser.Geom.Rectangle(gx - 11, bounds.top, 22, topH),
        rectBottom: new Phaser.Geom.Rectangle(gx - 11, bounds.top + botY, 22, Math.max(4, bounds.height - botY)),
        visTop, visBottom, trimTop, trimBottom,
        baseTopY: bounds.top,
        baseBottomY: bounds.top + botY,
        moving: g.moving,
        amp: (g.amp ?? 0) * ts,
        speed: g.speed ?? 1,
        phase: i * 1.7,
      };
    });
    this.flightZones.push({
      bounds, gates, def: o, active: false,
      tile: ts, startX: bounds.left, endX: bounds.right,
    });
    const entry = this.add.image(bounds.left + 8, bounds.centerY, 'fx_glow').setTint(0x9ff5ff).setScale(3).setAlpha(0.35).setDepth(6);
    this.tweens.add({ targets: entry, alpha: 0.1, scale: 4.4, duration: 1200, yoyo: true, repeat: -1 });
    const exit = this.add.image(bounds.right - 4, bounds.centerY, 'fx_glow').setTint(0xffe08a).setScale(2).setAlpha(0.28).setDepth(6);
    this.tweens.add({ targets: exit, alpha: 0.08, duration: 900, yoyo: true, repeat: -1 });
  }

  private addPowerup(kind: PowerKind, x: number, y: number, objectId: number): void {
    const meta = POWER_META[kind];
    const glow = this.add.image(x, y, 'fx_glow').setTint(meta.color).setScale(1.8).setAlpha(0.45).setDepth(11);
    const img = this.add.image(x, y, meta.tex).setDepth(12).setScale(1.25);
    const label = this.add.text(x, y - 16, meta.label, { fontFamily: FONT_SMALL, fontSize: '6px', color: meta.hex, backgroundColor: '#101528', padding: { x: 3, y: 2 } }).setOrigin(0.5).setDepth(12);
    img.setData('label', label);
    img.setData('kind', kind).setData('glow', glow).setData('objectId', objectId);
    this.tweens.add({ targets: img, y: y - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: glow, alpha: 0.14, scale: 2.3, duration: 800, yoyo: true, repeat: -1 });
    this.powerups.push(img);
  }

  private collectPowerup(img: Phaser.GameObjects.Image): void {
    if (!img.active) return;
    this.collected.add(img.getData('objectId'));
    const kind = img.getData('kind') as PowerKind;
    const meta = POWER_META[kind];
    (img.getData('glow') as Phaser.GameObjects.Image | undefined)?.destroy();
    (img.getData('label') as Phaser.GameObjects.Text | undefined)?.destroy();
    img.destroy();
    this.powerups = this.powerups.filter(p => p !== img);
    if (kind === 'shield') this.player.activateShield();
    else if (kind === 'swift') this.player.grantSwift();
    else if (kind === 'magnet') this.player.grantMagnet();
    else if (kind === 'triple') this.player.grantTriple();
    else if (kind === 'life') this.grantExtraLife();
    else if (kind === 'nova') {
      const blast = this.add.sprite(this.player.x, this.player.y - 20, 'energy_smack').setDepth(25).setScale(1.8).play('energy-burst');
      blast.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => blast.destroy());
      for (const enemy of [...this.enemies.getChildren()] as Enemy[]) if (enemy.active && Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < 150) enemy.damage(3, this.player.x);
      for (const barrel of [...this.barrels.getChildren()] as Barrel[]) if (barrel.active && !barrel.indestructible && Phaser.Math.Distance.Between(barrel.x, barrel.y, this.player.x, this.player.y) < 150) barrel.smash();
      this.fx.shake(0.004, 180); AudioManager.sfx('magic', { volume: 0.5, rate: 0.8 });
    }
    else if (kind === 'heart') {
      if (this.player.hearts < this.player.maxHearts) this.player.hearts += 1;
      this.fx.sparkle(img.x, img.y, 0xff9aa8);
    }
    this.addScore(100);
    this.fx.sparkle(img.x, img.y, meta.color);
    this.fx.flash(meta.color, 120, 0.15);
    AudioManager.sfx('gem', { volume: 0.45, rate: kind === 'shield' ? 0.9 : 1.3 });
    this.hud.toast(`${meta.label}: ${meta.blurb}${meta.durationMs ? ` (${Math.round(meta.durationMs * this.player.powerDuration / 1000)}s)` : ''}`, meta.hex, 1600);
  }

  private addWindCrystal(x: number, y: number, objectId: number): void {
    const c = this.add.image(x, y, 'gem_red').setTint(0x8ff5ff).setScale(1.1).setDepth(11);
    c.setData('wind', true).setData('objectId', objectId);
    this.gems.add(c);
    this.tweens.add({ targets: c, angle: 360, duration: 3800, repeat: -1 });
    this.tweens.add({ targets: c, y: y - 4, duration: 900, yoyo: true, repeat: -1 });
  }

  private addSpikes(x: number, y: number, w: number): void {
    const sp = this.add.tileSprite(x, y, w, 16, 'spikes').setOrigin(0.5, 1).setDepth(9);
    this.physics.add.existing(sp, true);
    (sp.body as Phaser.Physics.Arcade.StaticBody).setSize(w, 10).setOffset(0, 6);
    this.dangers.add(sp);
    this.spikes.push(sp);
  }

  private addSteam(x: number, y: number, period: number, phase: number): void {
    const warn = this.add.rectangle(x, y - 26, 10, 52, 0xffc46a, 0).setDepth(8);
    const spout = this.add.rectangle(x, y - 26, 8, 52, 0xfff0d0, 0).setDepth(9);
    this.steamVents.push({ x, y, period, phase, spout, warn });
  }

  private addLightning(x: number, y: number, w: number, period: number, phase: number): void {
    const warn = this.add.rectangle(x + w / 2, y - 90, w, 180, 0x9ff5ff, 0).setDepth(8);
    const beam = this.add.rectangle(x + w / 2, y - 90, w * 0.6, 180, 0xffffff, 0).setDepth(22);
    this.lightnings.push({ x, y, w, period, phase, beam, warn });
  }

  private addFallingPlatform(x: number, y: number, w: number): void {
    const key = this.level.theme === 'factory' ? 'factory_plate' : THEMES[this.level.theme].topTex;
    const sp = this.add.tileSprite(x, y, w, 14, key).setDepth(8);
    this.physics.add.existing(sp, true);
    const body = sp.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(w, 12);
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
    this.oneWays.add(sp);
    sp.setData('homeX', x).setData('homeY', y);
    this.fallingPlats.push({ sprite: sp, body, used: false });
  }

  private addExit(x: number, y: number): void {
    const glow = this.add.image(x, y - 26, 'fx_glow').setTint(0xffe08a).setScale(2.2).setAlpha(0.4).setDepth(8);
    const door = this.add.image(x, y, 'door').setOrigin(0.5, 1).setScale(1.6).setDepth(9);
    this.exitSprite = door;
    this.exitGlow = glow;
    this.tweens.add({ targets: glow, alpha: 0.15, scale: 2.8, duration: 900, yoyo: true, repeat: -1 });
    const body = this.add.rectangle(x, y - 20, 30, 40, 0x000000, 0);
    this.physics.add.existing(body, true);
    this.exits.add(body);
  }

  private buildPlayer(): void {
    const ts = this.level.tile;
    const sp = this.level.spawn;
    this.player = new Player(this, sp.x * ts + ts / 2, sp.y * ts, this.resumeRun?.character ?? SaveManager.get().selectedCharacter);
    this.checkpoint = { x: this.player.x, y: this.player.y };
    this.player.hearts = this.player.maxHearts;
    this.player.invulnUntil = this.time.now + 1200;
  }

  private buildCollisions(): void {
    this.physics.add.collider(this.player, this.solids, undefined, () => this.player.mode !== 'climb');
    for (const m of this.movers) {
      this.physics.add.collider(this.player, m);
      this.physics.add.collider(this.barrels, m);
    }
    this.physics.add.collider(this.player, this.oneWays, undefined, (_p, platform) => {
      const body = (platform as Phaser.GameObjects.GameObject & { body: Phaser.Physics.Arcade.StaticBody }).body;
      return this.player.mode !== 'climb' && this.time.now > this.player.dropThroughUntil && this.player.body.velocity.y >= 0 && this.player.body.prev.y + this.player.body.height <= body.top + 6;
    });
    this.physics.add.collider(this.enemies, this.solids);
    this.physics.add.collider(this.enemies, this.oneWays);
    this.physics.add.collider(this.barrels, this.solids);
    this.physics.add.collider(this.barrels, this.oneWays);
    for (const c of this.conveyors) this.physics.add.collider(this.player, c.sprite);

    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.enemyContact(e as unknown as Enemy));
    this.physics.add.overlap(this.player, this.barrels, (_p, b) => this.barrelContact(b as unknown as Barrel));
    this.physics.add.overlap(this.player, this.springs, (_p, s) => this.springContact(s as Phaser.GameObjects.Image));
    this.physics.add.overlap(this.player, this.dangers, (_p, d) => this.dangerContact(d as Phaser.GameObjects.GameObject));
    this.physics.add.overlap(this.player, this.checkpoints, (_p, c) => this.checkpointContact(c as Phaser.GameObjects.Rectangle));
    this.physics.add.overlap(this.player, this.exits, () => this.reachExit());
    this.physics.add.overlap(this.player, this.projGroup, (_p, b) => this.projectileHit(b as Phaser.Physics.Arcade.Sprite));
  }

  private buildCamera(): void {
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.11, 0.11);
    cam.setDeadzone(50, 34);
    cam.setFollowOffset(0, -10);
  }

  private buildHud(): void {
    this.hud = new Hud(this);
    this.hud.setLevelName(this.level.world, this.level.name);
  }

  private buildIntro(): void {
    this.introUntil = this.time.now + 1900;
    this.player.invulnUntil = this.time.now + 2600;
    const th = THEMES[this.level.theme];
    const card = this.add.container(this.scale.width / 2, Math.min(this.scale.height / 2, 150)).setScrollFactor(0).setDepth(210);
    const bg = this.add.rectangle(0, 0, 300, 62, 0x101528, 0.94).setStrokeStyle(2, th.accent, 1);
    const w = this.add.text(0, -18, `WORLD ${this.level.world}`, {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#f0c060',
    }).setOrigin(0.5);
    const t = this.add.text(0, 2, this.level.name.toUpperCase(), {
      fontFamily: '"Press Start 2P"', fontSize: '13px', color: '#f4e6c8',
    }).setOrigin(0.5);
    const s = this.add.text(0, 20, this.level.subtitle, {
      fontFamily: FONT_SMALL, fontSize: '7px', color: '#9fb0d0',
    }).setOrigin(0.5);
    card.add([bg, w, t, s]);
    card.setAlpha(0).setScale(0.94);
    this.tweens.add({ targets: card, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: card, alpha: 0, y: 100, delay: 1450, duration: 320,
      onComplete: () => { card.destroy(); },
    });
    AudioManager.sfx('select', { volume: 0.5, rate: 0.8 });
  }

  private wireEvents(): void {
    this.events.on('sfx', (key: any, opts: any) => AudioManager.sfx(key, opts), this);
    this.events.on('fx-dust', (x: number, y: number, n: number) => this.fx.dust(x, y, n), this);
    this.events.on('fx-step', (x: number, y: number, d: number) => this.fx.step(x, y, d), this);
    this.events.on('fx-gust', (x: number, y: number, d: number, s: boolean) => this.fx.gust(x, y, d, s), this);
    this.events.on('fx-dash', (x: number, y: number, d: number) => this.fx.dash(x, y, d), this);
    this.events.on('fx-defeat', (x: number, y: number) => this.fx.defeat(x, y), this);
    this.events.on('fx-shield-break', (x: number, y: number) => {
      this.fx.sparkle(x, y, 0x8fd0ff);
      this.fx.flash(0x8fd0ff, 120, 0.3);
      this.fx.shake(0.004, 120);
      this.hud.toast('SHIELD BROKEN', '#8fd0ff', 1000);
    }, this);
    this.events.on('enemy-defeated', (score: number, x: number, y: number, id: number) => { this.defeated.add(id); this.addScore(score); this.fx.pickup(x, y, 0xffe6a8); }, this);
    this.events.on('barrel-smash', (x: number, y: number) => { this.addScore(50); }, this);
    this.events.on('player-flap', () => { this.lastFlapAt = this.time.now; }, this);
    this.events.on('enemy-projectile', (x: number, y: number, tx: number, ty: number) => this.spawnBolt(x, y, tx, ty), this);
    this.events.on('boss-hit-player', (x: number) => this.hurtPlayer(x), this);
    this.events.on('boss-barrel', (x: number, y: number) => {
      const b = new Barrel(this, x, y, Math.random() < 0.5 ? -1 : 1, 'standard');
      this.barrels.add(b);
    }, this);
    this.events.on('boss-bolt', (x: number, y: number, dir: number) => this.spawnBoltDir(x, y, dir), this);
    this.events.on('boss-gust', (x: number, y: number, dir: number) => {
      for (let i = 0; i < 3; i++) this.time.delayedCall(i * 160, () => this.spawnBoltDir(x + dir * 40, y - 10 + (i - 1) * 20, dir));
      this.fx.shake(0.004, 200);
    }, this);
    this.events.on('boss-breath-start', (x: number, y: number, dir: number) => {
      this.bossFlameDir = dir;
      this.bossFlameUntil = this.time.now + 1000;
      this.bossFlameRect = new Phaser.Geom.Rectangle(dir < 0 ? x - 190 : x, y - 46, 190, 54);
      const beam = this.add.rectangle(x + dir * 95, y - 26, 190, 44, 0xff7a3a, 0.28).setDepth(24);
      this.tweens.add({ targets: beam, alpha: 0.08, duration: 120, yoyo: true, repeat: 5, onComplete: () => beam.destroy() });
      AudioManager.sfx('magic', { volume: 0.4, rate: 0.7 });
    }, this);
    this.events.on('boss-defeated', () => this.onBossDefeated(), this);
    this.events.on('boss-vulnerable', () => {
      this.hud.toast('▼ STOMP THE BARON!', '#ffe08a', 1500);
      if (!this.boss) return;
      const glow = this.add.image(this.boss.x, this.boss.y - 50, 'fx_glow').setTint(0xffe08a).setScale(3).setAlpha(0.5).setDepth(23);
      this.tweens.add({ targets: glow, alpha: 0.1, scale: 4, duration: 700, yoyo: true, repeat: 2, onComplete: () => glow.destroy() });
    }, this);
    this.events.on('boss-telegraph', (attack: string) => {
      const labels: Record<string, string> = {
        sweep: 'SWEEP INCOMING — GET AIRBORNE!',
        breath: 'FLAME BREATH — MOVE!',
        barrels: 'BARREL BARRAGE!',
        gust: 'WIND BURST — DODGE!',
      };
      this.hud.toast(labels[attack] ?? 'INCOMING!', '#ff9a9a', 800);
      this.fx.flash(0xff3040, 80, 0.1);
      if (!this.boss) return;
      const glow = this.add.image(this.boss.x, this.boss.y - 40, 'fx_glow').setTint(0xff5030).setScale(2.4).setDepth(23).setAlpha(0.55);
      this.tweens.add({ targets: glow, alpha: 0.1, scale: 3.2, duration: 240, yoyo: true, repeat: 2, onComplete: () => glow.destroy() });
    }, this);
    this.events.on('boss-sweep', (x: number, y: number, dir: number) => {
      const cx = (this.boss?.body.center.x ?? x) + dir * 120;
      const band = this.add.rectangle(cx, y, 260, 6, 0xff3b52, 0.35).setDepth(24);
      this.tweens.add({ targets: band, alpha: 0, duration: 420, onComplete: () => band.destroy() });
    }, this);
    this.events.on('boss-phase', (p: number) => {
      this.hud.toast(`PHASE ${p} — THE STORM RISES!`, '#ff9a9a', 1100);
      this.fx.flash(0xffffff, 220, 0.4);
    }, this);
    this.events.on('boss-enter', () => {
      this.hud.toast('THE STORM BARON', '#ffb0a0', 1400);
      AudioManager.playMusic('boss', { fade: 400 });
    }, this);
  }

  // ---------------------------------------------------------------- update
  override update(time: number, delta: number): void {
    if (this.gameOver || this.levelDone) return;
    const dt = Math.min(delta, 48);
    if (!this.paused) this.elapsedMs += dt;

    this.inputMgr.update(dt);

    if (this.inputMgr.pressedPause) { this.inputMgr.clearFrameFlags(); this.openPause(); return; }
    if (this.inputMgr.pressedRestart && this.lives > 0) { this.restartFromCheckpoint(); return; }

    if (time >= this.autosaveAt) { this.autosaveAt = time + 2500; this.persistRun(); }
    if (this.respawning) {
      this.updateEntities(time, dt);
      return;
    }
    if (this.deathAt > 0 && time > this.deathAt) {
      this.deathAt = 0;
      this.finishDeath();
      return;
    }
    if (this.deathAt > 0) {
      this.updateEntities(time, dt);
      return;
    }

    if (time > this.introUntil) this.player.controlLocked = false;

    // flight zones
    this.updateFlightZones(time);

    this.player.updatePlayer(dt, this.inputMgr, this.ladderRects);
    this.updatePlatformCarry();
    this.updateConveyors(dt);
    this.updateHazards(time);
    this.updateUpdrafts(dt);
    this.updateEntities(time, dt);
    this.updatePickups(dt);
    this.updateBoss(time, dt);
    this.updateTutorials();
    this.updateBackground();
    this.updateHud();

    // pit death
    if (this.player.y > this.killY && !this.player.dead && this.deathAt === 0) {
      this.killPlayer(true);
    }

    // boss flame damage
    if (this.bossFlameRect && time < this.bossFlameUntil) {
      const pb = this.player.body;
      const pr = new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(this.bossFlameRect, pr)) this.hurtPlayer(this.player.x - this.bossFlameDir * 40);
      if (time % 80 < 20) this.fx.sparkle(this.bossFlameRect.centerX + Phaser.Math.Between(-70, 70), Phaser.Math.Between(this.bossFlameRect.top, this.bossFlameRect.bottom), 0xffb060);
    }

    this.inputMgr.clearFrameFlags();
  }

  private updateEntities(time: number, dt: number): void {
    for (const s of this.spawners) s.update(time);
    for (const b of this.barrels.getChildren() as unknown as Barrel[]) {
      if (b.active) b.updateBarrel(time, dt / 1000, this.killY);
    }
    for (const e of this.enemies.getChildren() as unknown as Enemy[]) {
      if (e.active) {
        if (e.y > this.killY) e.destroy();
        else e.updateAI(time, dt / 1000, this.player);
      }
    }
    // projectiles
    for (let i = this.bossBolts.length - 1; i >= 0; i--) {
      const p = this.bossBolts[i];
      p.life -= dt;
      p.sprite.x += p.vx * (dt / 1000);
      p.sprite.y += p.vy * (dt / 1000);
      p.sprite.rotation += dt / 220;
      if (p.life <= 0) { p.sprite.destroy(); this.bossBolts.splice(i, 1); }
    }
    // falling platforms check
    for (const f of this.fallingPlats) {
      if (f.used) continue;
      if (this.player.grounded && Math.abs(this.player.y - f.sprite.y) < 14 &&
          this.player.x > f.sprite.x - f.sprite.width / 2 && this.player.x < f.sprite.x + f.sprite.width / 2) {
        f.used = true;
        this.tweens.add({
          targets: f.sprite, y: f.sprite.y + 90, alpha: 0.2, angle: 8, duration: 900,
          onStart: () => { f.body.enable = false; },
          onComplete: () => f.sprite.setVisible(false),
        });
        this.fx.dust(f.sprite.x, f.sprite.y, 4, 0x8a6a44);
      }
    }
  }

  private updatePlatformCarry(): void {
    for (const m of this.movers) {
      if (m.deltaX === 0 && m.deltaY === 0) continue;
      const p = this.player;
      const withinX = p.x > m.x - m.width / 2 - 6 && p.x < m.x + m.width / 2 + 6;
      const onTop = Math.abs(p.y - (m.y - 6)) < 9 && p.body.velocity.y >= -20;
      if (withinX && onTop) {
        p.x += m.deltaX;
        if (m.deltaY !== 0 && p.body.velocity.y >= 0) p.y += m.deltaY;
      }
    }
  }

  private updateConveyors(dt: number): void {
    if (!this.player.grounded || this.player.mode !== 'normal') return;
    for (const c of this.conveyors) {
      if (this.player.x > c.x - 10 && this.player.x < c.x + c.w + 10 &&
          Math.abs(this.player.y - c.y) < 16) {
        this.player.x += c.dir * c.speed * dt / 1000;
      }
    }
    // conveyor animation
    const frame = Math.floor(this.time.now / 140) % 2;
    for (const c of this.conveyors) c.sprite.setTexture(frame ? 'conveyor_1' : 'conveyor_0');
  }

  private updateHazards(time: number): void {
    for (const s of this.steamVents) {
      const t = ((time + s.phase * 1000) % s.period) / s.period;
      const warn = t < 0.18;
      const active = t > 0.22 && t < 0.46;
      s.warn.setFillStyle(0xffc46a, warn ? 0.18 + Math.sin(time / 40) * 0.1 : 0);
      s.spout.setFillStyle(0xfff2dd, active ? 0.85 : 0);
      if (active) {
        const r = new Phaser.Geom.Rectangle(s.x - 6, s.y - 52, 12, 52);
        const pb = this.player.body;
        if (Phaser.Geom.Intersects.RectangleToRectangle(r, new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) {
          this.hurtPlayer(s.x);
        }
      }
    }
    for (const l of this.lightnings) {
      const t = ((time + l.phase * 1000) % l.period) / l.period;
      const warn = t < 0.24;
      const active = t > 0.26 && t < 0.36;
      l.warn.setFillStyle(0x9ff5ff, warn ? 0.12 + Math.sin(time / 60) * 0.06 : 0);
      l.beam.setFillStyle(0xffffff, active ? 0.9 : 0);
      if (active) {
        const r = new Phaser.Geom.Rectangle(l.x, l.y - 180, l.w, 180);
        const pb = this.player.body;
        if (Phaser.Geom.Intersects.RectangleToRectangle(r, new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) {
          this.hurtPlayer(l.x + l.w / 2);
        }
      }
    }
  }

  private updateUpdrafts(dt: number): void {
    for (const u of this.updrafts) {
      if (Phaser.Geom.Rectangle.Contains(u.rect, this.player.x, this.player.y - 12)) {
        this.player.body.velocity.y -= 1680 * u.power * dt / 1000;
        if (this.player.body.velocity.y < -190) this.player.body.velocity.y = -190;
        if (Math.random() < 0.25) this.fx.step(this.player.x, this.player.y, 1);
      }
    }
  }

  private updateFlightZones(time: number): void {
    for (const z of this.flightZones) {
      const inside = z.bounds.contains(this.player.x, this.player.y - 10);
      if (!z.active && inside) {
        z.active = true;
        this.player.setFlightBounds(z.bounds);
        this.cameras.main.setFollowOffset(40, 0);
        this.hud.toast('WINDTAIL — RIDE THE WIND!', '#9ff5ff', 1300);
        AudioManager.sfx('magic', { volume: 0.4, rate: 1.2 });
      } else if (z.active && this.player.x > z.endX - 6) {
        z.active = false;
        this.player.setFlightBounds(null);
        this.cameras.main.setFollowOffset(0, -10);
      }
      if (!z.active) continue;
      // moving gates (visuals and collision stay locked together)
      for (const g of z.gates) {
        if (g.moving === 'y' && g.amp) {
          const off = Math.sin((time / 1000) * g.speed + g.phase) * g.amp;
          g.rectTop.y = g.baseTopY + off;
          g.rectBottom.y = g.baseBottomY + off;
          g.visTop.y = g.baseTopY + off;
          g.visBottom.y = g.baseBottomY + off;
          g.trimTop.y = g.baseTopY + g.rectTop.height + off;
          g.trimBottom.y = g.baseBottomY + off;
        }
      }
      // collision
      const pb = this.player.body;
      const pr = new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height);
      for (const g of z.gates) {
        const topR = g.rectTop;
        const botR = g.rectBottom;
        if (Phaser.Geom.Intersects.RectangleToRectangle(pr, topR) || Phaser.Geom.Intersects.RectangleToRectangle(pr, botR)) {
          const gapCenter = (topR.bottom + botR.top) / 2;
          this.hurtPlayer(this.player.x - 10);
          // never trap the courier against a gate: place them in the opening
          this.player.setPosition(topR.centerX - 4, gapCenter + 10);
          this.player.body.velocity.set(FLIGHT.forwardSpeed * 0.6, 0);
          this.player.x -= 24;
          this.fx.hit(this.player.x, this.player.y - 12, 0x9ff5ff);
          this.cameras.main.shake(120, 0.004);
          break;
        }
      }
    }
  }

  private updateBoss(time: number, dt: number): void {
    if (!this.boss || !this.boss.bossActive) return;
    this.boss.updateBoss(time, dt / 1000, this.player);
    // player vs boss
    const bb = this.boss.body;
    const pb = this.player.body;
    const br = new Phaser.Geom.Rectangle(bb.x, bb.y, bb.width, bb.height);
    const pr = new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height);
    if (Phaser.Geom.Intersects.RectangleToRectangle(br, pr)) {
      const stomp = this.player.body.velocity.y > 0 && pb.bottom < bb.bottom - 2;
      const dash = this.player.dashActive;
      if (this.boss.bossState === 'vulnerable' && (stomp || dash)) {
        if (this.boss.takeHit(stomp ? 'stomp' : 'dash')) {
          this.player.bounce(stomp ? -300 : -240);
        }
      } else if (this.boss.bossState !== 'vulnerable') {
        this.hurtPlayer(this.boss.x);
      }
    }
  }

  private updatePickups(dt: number): void {
    const px = this.player.x, py = this.player.y - 12;
    for (const c of this.coins.getChildren() as Phaser.GameObjects.Sprite[]) {
      if (c.active && Math.abs(c.x - px) < 14 && Math.abs(c.y - py) < 16) this.collectCoin(c);
    }
    for (const g of this.gems.getChildren() as Phaser.GameObjects.Image[]) {
      if (g.active && Math.abs(g.x - px) < 15 && Math.abs(g.y - py) < 17) this.collectGem(g);
    }
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if (!p.active) { this.powerups.splice(i, 1); continue; }
      if (Math.abs(p.x - px) < 17 && Math.abs(p.y - py) < 19) this.collectPowerup(p);
    }
    if (this.player.magnetActive) {
      for (const c of this.coins.getChildren() as Phaser.GameObjects.Sprite[]) {
        if (!c.active) continue;
        const dx = px - c.x, dy = py - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 96 && d > 0.01) {
          if (!c.getData('magnet')) { c.setData('magnet', true); this.tweens.killTweensOf(c); }
          const pull = 1 - Math.exp(-10.46 * dt / 1000);
          c.x += dx * pull;
          c.y += dy * pull;
        }
      }
    }
  }

  private updateTutorials(): void {
    for (let i = 0; i < this.tutorials.length; i++) {
      const t = this.tutorials[i];
      if (t.shown) continue;
      if (Math.abs(this.player.x - t.x) < 90 && Math.abs(this.player.y - t.y) < 80) {
        t.shown = true;
        this.hud.toast(window.matchMedia('(pointer: coarse)').matches ? t.text.replace('A / D  —  RUN', 'JOYSTICK — MOVE').replace('W / S', 'JOYSTICK UP / DOWN').replaceAll('SPACE', 'JUMP').replace('J —', 'DASH —') : t.text, '#f4e6c8', 2600);
      }
    }
  }

  private updateBackground(): void {
    const cam = this.cameras.main;
    for (const l of this.bgLayers) {
      l.sprite.tilePositionX = cam.scrollX * l.factor;
      l.sprite.y = l.baseY + Math.sin(this.time.now / 4200) * 1.2;
    }
  }

  private updateHud(): void {
    this.hud.resize(this.scale.width);
    this.hud.update({
      hearts: this.player.hearts,
      maxHearts: this.player.maxHearts,
      lives: this.lives,
      coins: this.coinsCollected,
      score: this.score,
      gems: this.gemsCollected,
      flapCharges: this.player.mode === 'flight' ? 2 : this.player.flapCharges,
      maxFlaps: this.player.maxFlapCharges,
      dashReady: this.player.dashReady,
      timeMs: this.elapsedMs,
      flight: this.player.mode === 'flight',
      bossHp: this.boss?.bossActive && this.boss.engaged ? this.boss.hp : null,
      bossMax: this.boss?.maxHp ?? 6,
      bossName: 'THE STORM BARON',
      powers: (() => { const now = this.time.now; const out: { kind: PowerKind; ratio: number }[] = [];
        if (this.player.shield) out.push({ kind: 'shield', ratio: 1 });
        if (this.player.swiftUntil > now) out.push({ kind: 'swift', ratio: (this.player.swiftUntil - now) / (12000 * this.player.powerDuration) });
        if (this.player.magnetUntil > now) out.push({ kind: 'magnet', ratio: (this.player.magnetUntil - now) / (12000 * this.player.powerDuration) });
        if (this.player.tripleUntil > now) out.push({ kind: 'triple', ratio: (this.player.tripleUntil - now) / (15000 * this.player.powerDuration) });
        return out; })(),
      bossPhase: this.boss?.phase ?? 1,
    });
  }

  // -------------------------------------------------------------- gameplay
  private addScore(n: number): void {
    this.score += n;
  }

  private collectCoin(c: Phaser.GameObjects.Sprite): void {
    if (!c.active) return;
    this.collected.add(c.getData('objectId'));
    c.destroy();
    this.coinsCollected++;
    const now = this.time.now;
    this.coinCombo = now - this.lastCoinAt < 1500 ? Math.min(9, this.coinCombo + 1) : 1;
    this.lastCoinAt = now;
    const points = 20 + (this.coinCombo - 1) * 5;
    this.addScore(points);
    this.floatText(c.x, c.y - 10, `+${points}`, this.coinCombo >= 4 ? '#f0c060' : '#f4e6c8');
    this.fx.pickup(c.x, c.y, 0xffd76a);
    AudioManager.sfx('coin', { volume: 0.4, rate: 1 + Math.random() * 0.1 });
    if (this.coinsCollected % 100 === 0) this.grantExtraLife();
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT_SMALL, fontSize: '6px', color,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 520, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  private collectGem(g: Phaser.GameObjects.Image): void {
    if (!g.active) return;
    this.collected.add(g.getData('objectId'));
    if (g.getData('wind')) {
      g.destroy();
      this.player.flapCharges = this.player.maxFlapCharges;
      this.fx.sparkle(g.x, g.y, 0x9ff5ff);
      this.hud.toast('WINDTAIL RECHARGED', '#9ff5ff', 800);
      AudioManager.sfx('gem', { volume: 0.35, rate: 1.4 });
      return;
    }
    const idx = g.getData('gemIndex') as number;
    this.gemsCollected[idx] = true;
    const glow = g.getData('glow') as Phaser.GameObjects.Image | undefined;
    glow?.destroy();
    g.destroy();
    this.addScore(500);
    this.fx.sparkle(g.x, g.y, 0x9fe9ff);
    this.fx.flash(0x9fe9ff, 140, 0.18);
    AudioManager.sfx('gem', { volume: 0.5, rate: 1.1 });
    this.hud.toast('SKY GEM FOUND', '#9fe9ff', 1000);
  }

  private enemyContact(e: Enemy): void {
    if (!e.active || e.defeated) return;
    const stomping = this.player.body.velocity.y > -20 && this.player.body.bottom <= e.body.top + 8;
    if (stomping && e.stompable) {
      if (e.damage(1, this.player.x)) {
        this.player.bounce(-285);
        this.fx.shake(0.0025, 80);
      }
    } else if (this.player.dashActive) {
      e.damage(1, this.player.x);
      this.player.bounce(-120);
    } else {
      this.hurtPlayer(e.x);
    }
  }

  private barrelContact(b: Barrel): void {
    if (!b.active) return;
    const dropping = this.player.body.velocity.y > 20 && this.player.body.center.y < b.body.center.y;
    if (dropping && !b.indestructible) {
      b.smash();
      this.player.bounce(-270);
      return;
    }
    if (this.player.dashActive && !b.indestructible) {
      b.smash();
      return;
    }
    this.hurtPlayer(b.x);
  }

  private springContact(s: Phaser.GameObjects.Image): void {
    const power = (s.getData('power') as number) ?? 470;
    if (this.player.body.velocity.y > -40) {
      this.player.body.velocity.y = -power;
      this.player.flapCharges = this.player.maxFlapCharges;
      s.setTexture('spring_out');
      this.time.delayedCall(140, () => s.setTexture('spring'));
      AudioManager.sfx('jump', { volume: 0.45, rate: 0.8 });
      this.fx.dust(s.x, s.y, 5);
      this.hud.toast('BOING!', '#f0c060', 500);
    }
  }

  private dangerContact(d: Phaser.GameObjects.GameObject): void {
    const id = d.getData('id') as string | undefined;
    if (id) {
      const sw = this.switches.find(s => s.id === id && !s.used);
      if (sw) {
        sw.used = true;
        sw.sprite.setTexture('switch_on');
        this.openGate(id);
        this.addScore(150);
        AudioManager.sfx('switch', { volume: 0.5 });
        this.hud.toast('SOMETHING OPENED…', '#f0c060', 1000);
      }
      return;
    }
    this.hurtPlayer(this.player.x);
  }

  private checkpointContact(c: Phaser.GameObjects.Rectangle): void {
    if (c.getData('active')) return;
    c.setData('active', true);
    const x = c.getData('x') as number;
    const y = c.getData('y') as number;
    this.checkpoint = { x, y };
    const flag = c.getData('flag') as Phaser.GameObjects.Image;
    const glow = c.getData('glow') as Phaser.GameObjects.Image;
    flag.setTexture('flag_b');
    this.tweens.add({ targets: flag, y: flag.y - 8, scaleY: 1.15, duration: 260, ease: 'Back.easeOut' });
    glow.setAlpha(0.6);
    this.player.hearts = this.player.maxHearts;
    this.fx.sparkle(x, y - 24, 0x9fe0a0);
    AudioManager.sfx('checkpoint', { volume: 0.55 });
    this.persistRun();
    this.hud.toast(SaveManager.storageAvailable ? 'CHECKPOINT SAVED' : 'CHECKPOINT — STORAGE UNAVAILABLE', '#9fe0a0', 1100);
  }

  private openGate(id: string): void {
    for (const g of this.gates) {
      if (g.id !== id || g.open) continue;
      g.open = true;
      g.body.enable = false;
      this.tweens.add({ targets: g.sprite, alpha: 0, y: g.sprite.y - 12, duration: 420, onComplete: () => g.sprite.setVisible(false) });
      AudioManager.sfx('defeat', { volume: 0.3, rate: 0.8 });
    }
  }

  private hurtPlayer(fromX: number): void {
    if (this.levelDone || this.gameOver || this.respawning || this.player.dead || this.deathAt > 0) return;
    if (!this.player.hurt(fromX)) return;
    this.player.hearts -= 1;
    this.fx.shake(0.005, 160);
    this.fx.flash(0xe4546a, 110, 0.22);
    this.fx.hit(this.player.x, this.player.y - 14, 0xff9a9a);
    AudioManager.sfx('hurt', { volume: 0.5, rate: 1 });
    if (this.player.hearts <= 0) this.killPlayer(false);
  }

  private grantExtraLife(): void {
    this.lives++;
    this.player.hearts = this.player.maxHearts;
    AudioManager.sfx('life', { volume: 0.55 });
    this.hud.toast('EXTRA LIFE!', '#f0c060', 1200);
    this.fx.sparkle(this.player.x, this.player.y - 20, 0xf0c060);
  }

  private killPlayer(pit: boolean): void {
    if (this.levelDone || this.gameOver || this.respawning || this.player.dead || this.deathAt > 0) return;
    this.player.kill();
    this.player.hearts = 0;
    AudioManager.sfx('defeat', { volume: 0.55, rate: 0.7 });
    this.fx.shake(0.008, 300);
    this.fx.flash(0x000000, 300, 0.4);
    this.deathAt = this.time.now + 1050;
    this.persistRun();
  }

  private finishDeath(): void {
    this.lives--;
    this.persistRun();
    if (this.lives <= 0) {
      this.showGameOver();
      return;
    }
    this.respawning = true;
    this.cameras.main.fadeOut(240, 0, 0, 0);
    this.time.delayedCall(280, () => {
      this.clearTransient();
      this.player.respawnAt(this.checkpoint.x, this.checkpoint.y);
      this.cameras.main.fadeIn(320, 0, 0, 0);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.hud.toast(`LIVES LEFT: ${this.lives}`, '#f4e6c8', 900);
      this.respawning = false;
    });
  }

  private clearTransient(): void {
    for (const b of [...this.barrels.getChildren()] as Barrel[]) b.destroy();
    for (const p of this.bossBolts) p.sprite.destroy();
    this.bossBolts = [];
    this.bossFlameRect = null;
    this.bossFlameUntil = 0;
    this.inputMgr.reset();
    for (const z of this.flightZones) z.active = false;
    this.cameras.main.setFollowOffset(0, -10);
    for (const f of this.fallingPlats) {
      this.tweens.killTweensOf(f.sprite);
      f.sprite.setPosition(f.sprite.getData('homeX'), f.sprite.getData('homeY')).setAlpha(1).setVisible(true);
      f.body.updateFromGameObject(); f.body.enable = true; f.used = false;
    }
    if (this.boss?.bossActive) this.boss.resetEncounter();
    for (const e of this.enemies.getChildren() as unknown as Enemy[]) {
      if (e.active) e.setAlpha(1);
    }
  }

  restartFromCheckpoint(): void {
    if (this.levelDone || this.gameOver || this.player.dead || this.respawning) return;
    this.lives--;
    this.persistRun();
    if (this.lives <= 0) { this.showGameOver(); return; }
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.respawning = true;
    this.time.delayedCall(200, () => {
      this.clearTransient();
      this.player.respawnAt(this.checkpoint.x, this.checkpoint.y);
      this.cameras.main.fadeIn(260, 0, 0, 0);
      this.respawning = false;
      this.hud.toast(`RESTARTED — LIVES LEFT: ${this.lives}`, '#f4e6c8', 900);
    });
  }

  private showGameOver(): void {
    this.gameOver = true;
    SaveManager.saveRun(null);
    this.inputMgr.reset();
    this.player.dead = true;
    this.physics.pause();
    this.cameras.main.flash(200, 30, 0, 0);
    AudioManager.stopMusic(600);
    const container = this.add.container((this.scale.width - GAME_WIDTH) / 2, (this.scale.height - GAME_HEIGHT) / 2).setScrollFactor(0).setDepth(250);
    this.gameOverContainer = container;
    const dim = this.add.rectangle(-(this.scale.width - GAME_WIDTH) / 2, -(this.scale.height - GAME_HEIGHT) / 2, this.scale.width, this.scale.height, 0x05070d, 0.82).setOrigin(0);
    const logo = this.add.text(GAME_WIDTH / 2, 82, 'GAME OVER', {
      fontFamily: '"Press Start 2P"', fontSize: '22px', color: '#e4546a',
    }).setOrigin(0.5).setShadow(3, 3, '#000000', 0, true, true);
    const sub = this.add.text(GAME_WIDTH / 2, 112, `${this.level.name.toUpperCase()}  ·  SCORE ${this.score.toLocaleString('en-US')}`, {
      fontFamily: FONT_SMALL, fontSize: '8px', color: '#9fb0d0',
    }).setOrigin(0.5);
    container.add([dim, logo, sub]);

    const items = [
      { label: `CONTINUE  (${SaveManager.stats.startingLives} LIVES)`, action: () => { container.destroy(); this.continueLevel(); } },
      { label: 'RETURN TO MAP', action: () => { this.scene.start('WorldMap'); } },
      { label: 'TITLE SCREEN', action: () => { this.scene.start('Title'); } },
    ];
    let sel = 0;
    const buttons: Phaser.GameObjects.Text[] = [];
    items.forEach((it, i) => {
      const t = this.add.text(GAME_WIDTH / 2, 152 + i * 22, it.label, {
        fontFamily: FONT_SMALL, fontSize: '9px', color: '#f4e6c8',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { sel = i; repaint(); });
      t.on('pointerdown', () => { AudioManager.sfx('ui_confirm', { volume: 0.5 }); it.action(); });
      buttons.push(t);
      container.add(t);
    });
    const repaint = () => {
      buttons.forEach((b, i) => {
        b.setColor(i === sel ? '#f0c060' : '#8a93b2');
        b.setText((i === sel ? '▶ ' : '  ') + items[i].label);
      });
    };
    repaint();
    const keyHandler = (e: KeyboardEvent) => {
      if (e.repeat || !this.gameOver) return;
      if (e.key === 'ArrowUp' || e.key === 'w') { sel = (sel + items.length - 1) % items.length; repaint(); AudioManager.sfx('ui_move'); }
      if (e.key === 'ArrowDown' || e.key === 's') { sel = (sel + 1) % items.length; repaint(); AudioManager.sfx('ui_move'); }
      if (e.key === 'Enter' || e.key === ' ') { AudioManager.sfx('ui_confirm', { volume: 0.5 }); items[sel].action(); }
    };
    this.input.keyboard?.on('keydown', keyHandler);
    this.gameOverKey = keyHandler;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', keyHandler));
  }

  private continueLevel(): void {
    if (this.gameOverKey) this.input.keyboard?.off('keydown', this.gameOverKey);
    this.gameOverKey = undefined;
    this.gameOverContainer?.destroy();
    this.gameOverContainer = undefined;
    this.clearTransient();
    this.gameOver = false;
    this.physics.resume();
    this.lives = SaveManager.stats.startingLives;
    this.scoreAtLevelStart = 0;
    this.score = 0;
    this.player.respawnAt(this.checkpoint.x, this.checkpoint.y);
    this.elapsedMs = 0;
    this.deathAt = 0;
    this.persistRun();
    AudioManager.playMusic(this.musicKey, { fade: 300 });
    this.hud.toast('CONTINUE!', '#f0c060', 900);
  }

  private spawnBolt(x: number, y: number, tx: number, ty: number): void {
    const angle = Math.atan2(ty - y, tx - x);
    this.spawnBoltDir(x, y, Math.cos(angle) >= 0 ? 1 : -1, Math.sin(angle));
  }

  private spawnBoltDir(x: number, y: number, dir: number, vy = 0): void {
    const s = this.physics.add.sprite(x, y, 'fireball').setDepth(23).setScale(1.1);
    s.play('fireball-fly');
    s.body.setAllowGravity(false);
    s.body.setVelocity(0, 0);
    this.projGroup.add(s);
    this.bossBolts.push({ sprite: s, vx: dir * 120, vy: vy * 90, life: 4200 });
    if (dir < 0) s.setFlipX(true);
  }

  private projectileHit(s: Phaser.Physics.Arcade.Sprite): void {
    if (!s.active) return;
    s.destroy();
    const i = this.bossBolts.findIndex(b => b.sprite === s);
    if (i >= 0) this.bossBolts.splice(i, 1);
    this.hurtPlayer(s.x);
  }

  private reachExit(): void {
    if (this.levelDone || this.player.dead || this.gameOver || this.respawning) return;
    if (this.level.hasBoss && !this.bossDefeated) {
      this.hud.toast('DEFEAT THE STORM BARON!', '#ff9a9a', 1100);
      this.player.x -= 20;
      return;
    }
    this.completeLevel();
  }

  private completeLevel(): void {
    if (this.levelDone) return;
    this.levelDone = true;
    SaveManager.saveRun(null);
    this.player.victory = true;
    this.player.controlLocked = true;
    this.player.body.velocity.set(0, 0);
    this.player.body.setAllowGravity(false);
    this.player.play(this.player.animation('idle'), true);
    AudioManager.stopMusic(600);
    AudioManager.sfx('life', { volume: 0.6 });
    this.cameras.main.flash(180, 255, 240, 200);
    this.fx.sparkle(this.player.x, this.player.y - 20, 0xffe9a0);
    for (let i = 0; i < 14; i++) {
      this.time.delayedCall(90 * i, () => {
        this.fx.sparkle(this.player.x + Phaser.Math.Between(-40, 40), this.player.y - Phaser.Math.Between(10, 80), 0xffe9a0);
        AudioManager.sfx('coin', { volume: 0.18, rate: 1.3 });
      });
    }
    const prevBest = SaveManager.get().levels[this.level.id]?.bestScore ?? 0;
    const bonus = 1000 + this.player.hearts * 200 + Math.max(0, Math.floor((this.level.parTime - this.elapsedMs / 1000) * 10));
    this.score += bonus;
    const newBest = this.score > prevBest;
    this.time.delayedCall(1500, () => this.cameras.main.fadeOut(380, 0, 0, 0));
    const rating = this.computeRating(this.score);
    SaveManager.recordLevel(this.level.id, {
        score: this.score,
        timeMs: this.elapsedMs,
        gems: [...this.gemsCollected] as [boolean, boolean, boolean],
        completed: true,
      });
    SaveManager.setRating(this.level.id, rating);
    SaveManager.addTotalScore(this.score);
    this.time.delayedCall(1950, () => {
      if (this.level.id === 9) {
        SaveManager.get().completedGame = true;
        SaveManager.save();
        this.scene.start('Ending', { score: this.score, timeMs: this.elapsedMs, gems: this.gemsCollected });
      } else {
        this.scene.start('Results', {
          levelId: this.level.id,
          score: this.score,
          timeMs: this.elapsedMs,
          gems: this.gemsCollected,
          rating,
          bonus,
          newBest,
        });
      }
    });
  }

  private computeRating(score: number): 1 | 2 | 3 {
    if (score >= this.level.thresholds.gold) return 3;
    if (score >= this.level.thresholds.silver) return 2;
    return 1;
  }

  private onBossDefeated(): void {
    this.bossDefeated = true;
    this.persistRun();
    this.openGate('escape');
    this.bossBarVisible = false;
    this.escapeMode = true;
    this.cameras.main.shake(1200, 0.01);
    this.hud.toast('THE AIRSHIP IS FALLING — ESCAPE!', '#ff9a9a', 2600);
    AudioManager.stopMusic(400);
    AudioManager.playMusic('storm', { fade: 300 });
    // Unlock the exit and add a dramatic escape corridor of rising wind.
    if (this.exitSprite) {
      this.exitGlow.setAlpha(0.8);
      this.tweens.add({ targets: this.exitSprite, scale: 1.9, duration: 600, yoyo: true, repeat: 3 });
    }
    this.time.delayedCall(2600, () => {
      this.hud.toast('GET TO THE SKY SEEDS!', '#f0c060', 2000);
    });
  }

  pauseForApp(): void { this.openPause(); }

  private openPause(): void {
    if (this.paused || this.gameOver || this.levelDone || this.deathAt > 0) return;
    this.persistRun();
    this.inputMgr.reset();
    this.paused = true;
    this.scene.launch('Pause', { levelId: this.level.id, music: this.musicKey });
    this.scene.pause();
  }

  private resizeViewport(): void {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setSize(width, height);
    const worldW = this.level.width * this.level.tile, worldH = this.level.height * this.level.tile;
    const top = Math.min(0, worldH - height);
    this.cameras.main.setBounds(0, top, worldW, Math.max(worldH, height));
    this.hud?.resize(width);
    for (const layer of this.bgLayers) {
      const image = layer.sprite.texture.getSourceImage() as HTMLImageElement;
      layer.sprite.setSize(width, height).setTileScale(Math.max(1, height / image.height));
    }
    for (const child of this.children.list) {
      if (child instanceof Phaser.GameObjects.Rectangle && child.depth < 0) child.setSize(width + 4, height + 4);
    }
  }

  private onResume(): void {
    this.paused = false;
    this.inputMgr.reset();
  }

  persistRun(): void {
    if (!this.player || this.levelDone || this.gameOver) return;
    const lives = this.lives - (this.deathAt > 0 ? 1 : 0);
    if (lives <= 0) { SaveManager.saveRun(null); return; }
    SaveManager.saveRun({
      levelId: this.level.id, checkpoint: { ...this.checkpoint }, lives,
      hearts: this.player.dead ? this.player.maxHearts : this.player.hearts,
      score: this.score, coins: this.coinsCollected, elapsedMs: this.elapsedMs,
      gems: [...this.gemsCollected], collected: [...this.collected], defeated: [...this.defeated],
      switches: this.switches.filter(s => s.used).map(s => s.id),
      bossDefeated: this.bossDefeated, bossHp: this.boss?.hp ?? 6, bossPhase: this.boss?.phase ?? 1,
      character: this.player.characterId, objectVersion: 2,
    });
  }

  private restoreRun(): void {
    const r = this.resumeRun;
    if (!r) return;
    const W = this.level.width * this.level.tile, H = this.level.height * this.level.tile;
    this.checkpoint = { x: Phaser.Math.Clamp(r.checkpoint.x, 8, W - 8), y: Phaser.Math.Clamp(r.checkpoint.y, 24, H) };
    this.lives = r.lives; this.score = r.score; this.coinsCollected = r.coins;
    this.elapsedMs = r.elapsedMs; this.gemsCollected = [...r.gems];
    this.player.respawnAt(this.checkpoint.x, this.checkpoint.y);
    this.player.hearts = Phaser.Math.Clamp(r.hearts, 1, this.player.maxHearts);
    for (const id of r.switches) {
      const sw = this.switches.find(s => s.id === id);
      if (sw) { sw.used = true; sw.sprite.setTexture('switch_on'); }
      this.openGate(id);
    }
    for (const c of this.checkpoints.getChildren()) {
      if (c.getData('x') === this.checkpoint.x && c.getData('y') === this.checkpoint.y) {
        c.setData('active', true);
        (c.getData('flag') as Phaser.GameObjects.Image).setTexture('flag_b');
      }
    }
    this.bossDefeated = r.bossDefeated;
    if (this.boss) {
      if (r.bossDefeated) { this.boss.bossActive = false; this.boss.body.enable = false; this.boss.setVisible(false); this.openGate('escape'); }
      else this.boss.restoreProgress(r.bossHp, r.bossPhase);
    }
  }

  cleanup(): void {
    this.persistRun();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeViewport, this);
    this.inputMgr?.destroy();
    window.removeEventListener('pagehide', this.pageHide);
    this.game.events.off(Phaser.Core.Events.BLUR, this.saveOnHide);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.saveOnHide);
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    for (const name of ['sfx', 'fx-dust', 'fx-step', 'fx-gust', 'fx-dash', 'fx-defeat', 'fx-shield-break', 'enemy-defeated', 'barrel-smash', 'player-flap', 'enemy-projectile', 'boss-hit-player', 'boss-barrel', 'boss-bolt', 'boss-gust', 'boss-breath-start', 'boss-defeated', 'boss-vulnerable', 'boss-telegraph', 'boss-sweep', 'boss-phase', 'boss-enter']) this.events.removeAllListeners(name);
    this.fx?.destroy();
    this.hud?.destroy();
    for (const s of this.spawners) s.destroy();
    this.boss?.destroyBoss();
    this.bgLayers = [];

  }
}
