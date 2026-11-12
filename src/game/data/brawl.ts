import type { CharacterId } from './characters';
import type { ThemeId } from './levels/types';

export type BrawlDifficulty = 'easy' | 'normal' | 'hard';
export interface BrawlOptions { arena: ThemeId; difficulty: BrawlDifficulty; player: CharacterId; cpu: CharacterId; resume?: boolean }
export interface BrawlRun extends BrawlOptions { playerStocks: number; cpuStocks: number; playerDamage: number; cpuDamage: number; elapsedMs: number }
export interface BrawlRecord { wins: number; losses: number; streak: number; bestStreak: number; knockouts: number }
export const emptyBrawlRecord = (): BrawlRecord => ({ wins: 0, losses: 0, streak: 0, bestStreak: 0, knockouts: 0 });
export const ARENA_NAMES: Record<ThemeId, string> = { forest: 'CANOPY COURT', factory: 'UNSAFE WORKPLACE', storm: 'RETURN TO THUNDER' };
