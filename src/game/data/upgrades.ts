export const UPGRADES = {
  vitality: { label: 'MORE HEARTS', description: '+1 maximum heart per tier', tex: 'ui_heart_gold' },
  reserves: { label: 'MORE LIVES', description: '+1 starting life per tier', tex: 'ui_wing' },
  dash: { label: 'FASTER DASH', description: '15% shorter dash cooldown per tier', tex: 'power_swift' },
  duration: { label: 'LONGER POWERS', description: '25% longer timed powers per tier', tex: 'power_triple' },
} as const;

export type UpgradeKind = keyof typeof UPGRADES;
export type Upgrades = Record<UpgradeKind, number>;
export const UPGRADE_COSTS = [3, 6] as const;
export const emptyUpgrades = (): Upgrades => ({ vitality: 0, reserves: 0, dash: 0, duration: 0 });

export function upgradeStats(u: Upgrades) {
  return {
    maxHearts: 3 + u.vitality,
    startingLives: 3 + u.reserves,
    dashCooldown: 1 - u.dash * 0.15,
    powerDuration: 1 + u.duration * 0.25,
  };
}
