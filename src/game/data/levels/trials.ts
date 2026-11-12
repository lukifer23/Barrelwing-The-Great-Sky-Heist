import type { LevelDef } from './types';
import { T, coinLine, coinArc, gem, coinColumn } from './helpers';

/**
 * Post-campaign Sky Trials. These are unlocked by finishing the story and are
 * deliberately tighter, more demanding remixes of the three worlds.
 */
export const TRIAL_10: LevelDef = {
  id: 10,
  world: 1,
  name: 'Windward Gauntlet',
  subtitle: 'One wind. Sixteen gates. No floor worth landing on.',
  theme: 'forest',
  tile: 16,
  width: 210,
  height: 24,
  spawn: { x: 3, y: 18 },
  parTime: 110,
  thresholds: { bronze: 1400, silver: 2400, gold: 3400 },
  music: 'forest',
  intro: 'SKY TRIAL I — the long wind.',
  terrain: [
    T(0, 18, 20, 6),
    T(188, 18, 22, 6),
    T(20, 13, 4, 1, 'wood'),
    T(190, 12, 4, 1, 'wood'),
  ],
  objects: [
    { t: 'tutorial', x: 7, y: 16, text: 'SKY TRIAL — ONE CONTINUOUS WIND RUN' },
    ...coinLine(6, 16, 5, 2),
    ...coinArc(24, 14, 5, 3),
    ...coinArc(42, 10, 5, 3),
    ...coinArc(60, 14, 5, 3),
    ...coinArc(78, 8, 5, 3),
    ...coinArc(96, 14, 5, 3),
    ...coinArc(114, 9, 5, 3),
    ...coinArc(132, 14, 5, 3),
    ...coinArc(150, 8, 5, 3),
    ...coinArc(168, 12, 5, 3),
    ...coinLine(192, 16, 6, 2),

    gem(32, 6),
    gem(96, 5),
    gem(150, 4),

    { t: 'enemy', kind: 'bird', x: 74, y: 12, patrol: 5 },
    { t: 'enemy', kind: 'wisp', x: 120, y: 10, patrol: 2 },
    { t: 'enemy', kind: 'bird', x: 164, y: 9, patrol: 5 },

    { t: 'powerup', kind: 'triple', x: 11, y: 16 },
    { t: 'checkpoint', x: 8, y: 18 },

    {
      t: 'flight', x: 20, y: 5, w: 168, h: 16,
      gates: [
        { at: 8, gap: 12, size: 5 },
        { at: 18, gap: 10, size: 4, moving: 'y', amp: 1.1, speed: 1.1 },
        { at: 28, gap: 13, size: 4 },
        { at: 38, gap: 11, size: 4, moving: 'y', amp: 1.2, speed: 1.3 },
        { at: 48, gap: 9, size: 4 },
        { at: 58, gap: 12, size: 4, moving: 'y', amp: 1.2, speed: 1.0 },
        { at: 68, gap: 10, size: 4 },
        { at: 78, gap: 13, size: 4, moving: 'y', amp: 1.3, speed: 1.2 },
        { at: 88, gap: 11, size: 4 },
        { at: 98, gap: 9, size: 4, moving: 'y', amp: 1.1, speed: 1.1 },
        { at: 108, gap: 12, size: 4 },
        { at: 118, gap: 10, size: 4, moving: 'y', amp: 1.2, speed: 1.3 },
        { at: 128, gap: 13, size: 4 },
        { at: 138, gap: 11, size: 4, moving: 'y', amp: 1.1, speed: 1.0 },
        { at: 148, gap: 10, size: 5 },
        { at: 158, gap: 9, size: 5 },
      ],
    },

    { t: 'windCrystal', x: 46, y: 8 },
    { t: 'windCrystal', x: 104, y: 7 },
    { t: 'windCrystal', x: 158, y: 8 },
    { t: 'exit', x: 204, y: 18 },
  ],
};

export const TRIAL_11: LevelDef = {
  id: 11,
  world: 2,
  name: 'The Copper Crucible',
  subtitle: 'Every machine, one short run, no second chances.',
  theme: 'factory',
  tile: 18,
  width: 120,
  height: 22,
  spawn: { x: 3, y: 16 },
  parTime: 100,
  thresholds: { bronze: 1200, silver: 2100, gold: 3100 },
  music: 'factory',
  intro: 'SKY TRIAL II — the crucible.',
  terrain: [
    T(0, 16, 22, 6, 'metal'),
    T(22, 14, 8, 2, 'metal'),
    T(34, 12, 10, 2, 'metal'),
    T(48, 14, 6, 2, 'metal'),
    T(58, 16, 14, 6, 'metal'),
    T(76, 12, 10, 2, 'metal'),
    T(90, 16, 30, 6, 'metal'),
    T(24, 10, 4, 1, 'wood'),
    T(80, 9, 4, 1, 'wood'),
  ],
  objects: [
    { t: 'tutorial', x: 5, y: 14, text: 'SKY TRIAL — CONVEYORS, STEAM AND BARRELS' },
    ...coinLine(4, 14, 6, 2),
    ...coinLine(23, 12, 4, 2),
    ...coinLine(35, 10, 4, 2),
    ...coinLine(49, 12, 3, 2),
    ...coinLine(59, 14, 4, 2),
    ...coinLine(77, 10, 4, 2),
    ...coinLine(92, 14, 5, 2),
    ...coinArc(108, 13, 4, 2),

    gem(26, 8),
    gem(44, 8),
    gem(84, 7),

    { t: 'enemy', kind: 'ant', x: 27, y: 14, patrol: 3 },
    { t: 'enemy', kind: 'hopper', x: 62, y: 16, patrol: 2 },
    { t: 'enemy', kind: 'gator', x: 100, y: 16, patrol: 4 },
    { t: 'enemy', kind: 'bee', x: 70, y: 10, patrol: 3, amp: 14 },

    { t: 'conveyor', x: 58, y: 16, w: 12, dir: 1, speed: 95 },
    { t: 'steam', x: 60, y: 16, period: 2800, phase: 0.15 },
    { t: 'steam', x: 96, y: 16, period: 2500, phase: 0.55 },
    { t: 'mover', x: 44, y: 13, w: 4, axis: 'y', dist: -4, speed: 46, style: 'metal' },

    { t: 'switch', x: 66, y: 16, id: 'crucible' },
    { t: 'gate', x: 74, y: 12, w: 2, h: 4, id: 'crucible' },

    { t: 'barrelSpawner', x: 68, y: 16, dir: -1, interval: 2400 },
    { t: 'barrelSpawner', x: 108, y: 16, dir: -1, interval: 2600, variant: 'fast' },

    { t: 'powerup', kind: 'shield', x: 20, y: 14 },
    { t: 'powerup', kind: 'swift', x: 33, y: 10 },
    { t: 'powerup', kind: 'triple', x: 96, y: 14 },
    { t: 'powerup', kind: 'heart', x: 54, y: 14 },
    { t: 'enemy', kind: 'crawler', x: 92, y: 16, patrol: 4 },
    { t: 'checkpoint', x: 64, y: 16 },
    { t: 'checkpoint', x: 96, y: 16 },
    { t: 'exit', x: 116, y: 16 },
  ],
};

export const TRIAL_12: LevelDef = {
  id: 12,
  world: 3,
  name: "Baron's Revenge",
  subtitle: 'He survived the fall. He brought the storm with him.',
  theme: 'storm',
  tile: 16,
  width: 132,
  height: 28,
  spawn: { x: 3, y: 22 },
  parTime: 130,
  thresholds: { bronze: 1800, silver: 2900, gold: 4200 },
  music: 'storm',
  intro: 'SKY TRIAL III — the Baron returns.',
  hasBoss: true,
  bossPhase: 2,
  terrain: [
    T(0, 22, 26, 6, 'metal'),
    T(54, 22, 78, 6, 'metal'),
    T(30, 18, 5, 1, 'wood'),
    T(60, 19, 5, 1, 'wood'),
    T(118, 19, 5, 1, 'wood'),
  ],
  objects: [
    { t: 'tutorial', x: 5, y: 20, text: 'SKY TRIAL — THE BARON IS WAITING' },
    ...coinLine(5, 20, 6, 2),
    ...coinArc(28, 18, 5, 3),
    ...coinLine(60, 20, 5, 2),
    ...coinLine(74, 20, 4, 2),
    ...coinArc(104, 19, 5, 3),
    ...coinLine(120, 20, 5, 2),

    gem(58, 16),
    gem(84, 12),
    gem(120, 15),

    { t: 'enemy', kind: 'ant', x: 20, y: 22, patrol: 3 },
    { t: 'enemy', kind: 'bird', x: 44, y: 12, patrol: 4 },

    {
      t: 'flight', x: 26, y: 9, w: 28, h: 14,
      gates: [
        { at: 6, gap: 8, size: 4 },
        { at: 16, gap: 12, size: 4, moving: 'y', amp: 1.4, speed: 1.2 },
      ],
    },

    { t: 'spikes', x: 76, y: 22, w: 3 },
    { t: 'barrelSpawner', x: 80, y: 22, dir: 1, interval: 2800 },
    { t: 'barrelSpawner', x: 112, y: 22, dir: -1, interval: 2600, variant: 'fast' },

    { t: 'powerup', kind: 'shield', x: 70, y: 20 },
    { t: 'powerup', kind: 'triple', x: 118, y: 20 },

    { t: 'enemy', kind: 'diver', x: 66, y: 14, patrol: 3 },
    { t: 'checkpoint', x: 60, y: 22 },
    { t: 'checkpoint', x: 120, y: 22 },

    { t: 'boss', x: 96, y: 19 },
    { t: 'exit', x: 126, y: 22 },
  ],
};
