export type ThemeId = 'forest' | 'factory' | 'storm';
export type TileStyle = 'ground' | 'metal' | 'wood' | 'cloud' | 'stone';

export interface TerrainRect {
  x: number; y: number; w: number; h: number;
  style?: TileStyle;
  /** Visual only, no collision (decorative terrain silhouette). */
  decor?: boolean;
}

export type PowerKind = 'shield' | 'swift' | 'magnet' | 'triple' | 'heart';

export type EnemyKind = 'slug' | 'bee' | 'ant' | 'hopper' | 'gator' | 'wisp' | 'bird' | 'plant' | 'crawler' | 'stormbee' | 'diver';

export type LevelObject =
  | { t: 'coin'; x: number; y: number }
  | { t: 'gem'; x: number; y: number }
  | { t: 'enemy'; kind: EnemyKind; x: number; y: number; patrol?: number; amp?: number; speed?: number }
  | { t: 'barrelSpawner'; x: number; y: number; dir: -1 | 1; interval: number; variant?: 'standard' | 'fast' | 'bouncing' | 'armored'; phase?: number }
  | { t: 'barrel'; x: number; y: number; dir: -1 | 1; variant?: 'standard' | 'fast' | 'bouncing' | 'armored' }
  | { t: 'checkpoint'; x: number; y: number }
  | { t: 'spring'; x: number; y: number; power?: number }
  | { t: 'ladder'; x: number; y: number; h: number }
  | { t: 'mover'; x: number; y: number; w: number; axis: 'x' | 'y'; dist: number; speed: number; style?: TileStyle }
  | { t: 'conveyor'; x: number; y: number; w: number; dir: -1 | 1; speed?: number }
  | { t: 'switch'; x: number; y: number; id: string }
  | { t: 'gate'; x: number; y: number; w: number; h: number; id: string }
  | { t: 'flight'; x: number; y: number; w: number; h: number; gates: FlightGate[] }
  | { t: 'windCrystal'; x: number; y: number }
  | { t: 'spikes'; x: number; y: number; w: number }
  | { t: 'steam'; x: number; y: number; period: number; phase?: number }
  | { t: 'lightning'; x: number; y: number; w: number; period: number; phase?: number }
  | { t: 'updraft'; x: number; y: number; w: number; h: number; power?: number }
  | { t: 'fallingPlatform'; x: number; y: number; w: number }
  | { t: 'exit'; x: number; y: number }
  | { t: 'tutorial'; x: number; y: number; text: string }
  | { t: 'powerup'; kind: PowerKind; x: number; y: number }
  | { t: 'decor'; kind: 'tree' | 'vine' | 'mushroom_red' | 'mushroom_brown' | 'rock' | 'plant' | 'leaves' | 'crate' | 'cloud' | 'pipe'; x: number; y: number; scale?: number }
  | { t: 'boss'; x: number; y: number }
  | { t: 'goalZone'; x: number; y: number; w: number; h: number };

export interface FlightGate {
  /** Horizontal offset from the flight zone start, in tiles. */
  at: number;
  /** Gap centre, relative to the zone top, in tiles. */
  gap: number;
  /** Gap height in tiles. */
  size: number;
  moving?: 'y';
  amp?: number;
  speed?: number;
}

export interface TutorialHint { x: number; y: number; text: string }

export interface LevelDef {
  id: number;
  world: 1 | 2 | 3;
  name: string;
  subtitle: string;
  theme: ThemeId;
  tile: number;
  width: number;   // tiles
  height: number;  // tiles
  spawn: { x: number; y: number }; // tiles
  terrain: TerrainRect[];
  objects: LevelObject[];
  parTime: number; // seconds
  thresholds: { bronze: number; silver: number; gold: number };
  music: 'forest' | 'factory' | 'storm';
  hasBoss?: boolean;
  /** Optional starting phase for rematch encounters. */
  bossPhase?: number;
  intro: string;
}

export const THEMES: Record<ThemeId, {
  sky: number;
  fog: number;
  far: string;
  mid: string;
  near: string;
  topTex: string;
  fillTex: string;
  accent: number;
}> = {
  forest: {
    sky: 0x87c6e8, fog: 0x2c4a2a,
    far: 'bg_forest_mountains', mid: 'bg_forest_mid', near: 'bg_forest_trees',
    topTex: 'forest_top', fillTex: 'forest_fill', accent: 0x8fd14f,
  },
  factory: {
    sky: 0x2a1a1e, fog: 0x3a1f18,
    far: 'bg_factory_sky', mid: 'bg_factory_mid', near: 'bg_factory_sky',
    topTex: 'factory_top', fillTex: 'factory_fill', accent: 0xf2994a,
  },
  storm: {
    sky: 0x141b3d, fog: 0x1b2450,
    far: 'bg_storm_sky', mid: 'bg_storm_mid', near: 'bg_forest_trees',
    topTex: 'storm_top', fillTex: 'storm_fill', accent: 0x67e8f9,
  },
};

/** Scores needed (0-1000 style) per level for ratings. */
export const RATING_LABELS = ['—', 'BRONZE', 'SILVER', 'GOLD'];
export const RATING_COLORS = ['#8a93b2', '#c98a52', '#c8d4e6', '#f0c060'];
