export const STAMPS = ['collector', 'express', 'untouched'] as const;
export type Stamp = typeof STAMPS[number];
export type Mastery = Record<Stamp, boolean>;
export const STAMP_LABELS: Record<Stamp, string> = {
  collector: 'ALL GEMS', express: 'EXPRESS', untouched: 'UNTOUCHED',
};
export const emptyMastery = (): Mastery => ({ collector: false, express: false, untouched: false });

/** Stamps can be earned on separate clears; deaths invalidate the two skill stamps. */
export function evaluateMastery(run: { gems: readonly boolean[]; timeMs: number; deaths: number; damageTaken: number }, parSeconds: number): Mastery {
  return {
    collector: run.gems.length === 3 && run.gems.every(Boolean),
    express: run.deaths === 0 && run.timeMs > 0 && run.timeMs <= parSeconds * 1000,
    untouched: run.deaths === 0 && run.damageTaken === 0,
  };
}
