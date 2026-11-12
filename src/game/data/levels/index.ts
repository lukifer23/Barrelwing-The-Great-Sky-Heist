import type { LevelDef } from './types';
import { LEVEL_1, LEVEL_2, LEVEL_3 } from './world1';
import { LEVEL_4, LEVEL_5, LEVEL_6 } from './world2';
import { LEVEL_7, LEVEL_8, LEVEL_9 } from './world3';
import { TRIAL_13, TRIAL_14, TRIAL_15 } from './extraTrials';
import { TRIAL_10, TRIAL_11, TRIAL_12 } from './trials';

export const LEVELS: LevelDef[] = [
  LEVEL_1, LEVEL_2, LEVEL_3,
  LEVEL_4, LEVEL_5, LEVEL_6,
  LEVEL_7, LEVEL_8, LEVEL_9,
  TRIAL_10, TRIAL_11, TRIAL_12, TRIAL_13, TRIAL_14, TRIAL_15,
];

export const MAIN_LEVELS: LevelDef[] = LEVELS.filter(l => l.id <= 9);
export const TRIALS: LevelDef[] = LEVELS.filter(l => l.id >= 10);

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find(l => l.id === id);
}

export const WORLD_NAMES: Record<number, string> = {
  1: 'VERDANT CANOPY',
  2: 'COPPERWORKS',
  3: 'THE STORM ABOVE',
};

export const WORLD_SUBTITLES: Record<number, string> = {
  1: 'Sunlit woodland and old wooden scaffolds.',
  2: 'Copper, steam and relentless machinery.',
  3: 'High altitude. Higher stakes.',
};
