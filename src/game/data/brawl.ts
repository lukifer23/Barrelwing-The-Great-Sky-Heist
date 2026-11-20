import type { CharacterId } from './characters';
import type { ThemeId } from './levels/types';

export type BrawlDifficulty = 'easy' | 'normal' | 'hard';
export type BrawlRules = 'stock' | 'timed';
export interface BrawlOptions {
  arena: ThemeId;
  difficulty: BrawlDifficulty;
  player: CharacterId;
  cpu: CharacterId;
  rules?: BrawlRules;
  resume?: boolean;
}
export type BrawlPreset = Required<Omit<BrawlOptions, 'resume'>>;
export interface BrawlRun extends BrawlOptions {
  playerStocks: number;
  cpuStocks: number;
  playerDamage: number;
  cpuDamage: number;
  elapsedMs: number;
  suddenDeath: boolean;
  playerKOs: number;
  cpuKOs: number;
}
export interface BrawlRecord { wins: number; losses: number; streak: number; bestStreak: number; knockouts: number }
export const emptyBrawlRecord = (): BrawlRecord => ({ wins: 0, losses: 0, streak: 0, bestStreak: 0, knockouts: 0 });
export const MATCH_LENGTH = { stock: 180000, timed: 90000 };
export const ARENA_NAMES: Record<ThemeId, string> = { forest: 'CANOPY COURT', factory: 'UNSAFE WORKPLACE', storm: 'RETURN TO THUNDER' };
export const ARENA_PLATFORMS: Record<ThemeId, [center: number, lift: number, width: number][]> = {
  forest: [[0.5, 0, 0.78], [0.28, 72, 0.23], [0.72, 72, 0.23], [0.5, 140, 0.22]],
  factory: [[0.5, 0, 0.72], [0.19, 48, 0.17], [0.81, 48, 0.17], [0.5, 98, 0.32]],
  storm: [[0.5, 0, 0.68], [0.28, 62, 0.21], [0.72, 96, 0.21]],
};

export const FIGHT_STYLES = {
  pip: { role: 'ALL-ROUNDER', move: 'TAIL SWEEP', description: 'Sweep a wide arc. Aim up to juggle an opponent.', color: 0xffc863,
    damage: 10, weight: 1, cooldown: 450, reach: 39, radius: 52, activeMs: 125, frames: [20, 8, 11, 16] },
  fenn: { role: 'RUSH FIGHTER', move: 'EXPRESS LUNGE', description: 'Spring forward with a quick, narrow strike.', color: 0xff956b,
    damage: 8, weight: 0.92, cooldown: 360, reach: 31, radius: 42, activeMs: 95, frames: [21, 9, 12, 13] },
  mallow: { role: 'HEAVYWEIGHT', move: 'PARCEL SLAM', description: 'A heavy blow with strong launch and a long recovery.', color: 0x9fb7ff,
    damage: 13, weight: 1.18, cooldown: 570, reach: 32, radius: 52, activeMs: 145, frames: [20, 14, 17, 21] },
  clover: { role: 'AERIAL SCOUT', move: 'VAULT KICK', description: 'Land a downward aerial kick to bounce back into the air.', color: 0xa8e6a5,
    damage: 9, weight: 0.96, cooldown: 420, reach: 36, radius: 45, activeMs: 115, frames: [21, 14, 15, 17] },
} as const satisfies Record<CharacterId, { role: string; move: string; description: string; color: number;
  damage: number; weight: number; cooldown: number; reach: number; radius: number; activeMs: number; frames: readonly number[] }>;

/** Frame indices match the wind-up, two contact poses and recovery in each courier sheet. */
export function attackPose(id: CharacterId, progress: number): number {
  return FIGHT_STYLES[id].frames[progress < 0 ? 0 : progress < 0.48 ? 1 : progress < 1 ? 2 : 3];
}

export function swipeFrame(id: CharacterId, aim: number, progress: number) {
  const key = aim !== 0 || id === 'clover' ? 'slash-upward' : id === 'fenn' ? 'slash-horizontal' : 'slash-circular';
  const count = key === 'slash-circular' ? 6 : 5;
  return { key, frame: Math.min(count - 1, Math.max(0, Math.floor(progress * count))) };
}
