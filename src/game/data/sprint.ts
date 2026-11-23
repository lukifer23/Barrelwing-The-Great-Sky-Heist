export const SPRINT_CLASSES = {
  classic: { label: 'CLASSIC', hearts: 3, speed: 110, topSpeed: 195, gap: [56, 78], best: 'bonusBest' },
  gale: { label: 'GALE', hearts: 1, speed: 145, topSpeed: 215, gap: [50, 62], best: 'galeBest' },
} as const;

export type SprintClass = keyof typeof SPRINT_CLASSES;
