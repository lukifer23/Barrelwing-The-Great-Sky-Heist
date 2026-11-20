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
