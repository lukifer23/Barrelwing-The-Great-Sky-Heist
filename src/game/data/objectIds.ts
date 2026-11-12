import type { LevelDef } from './levels/types';

/** Stable across inserting tutorials, pickups, or enemies elsewhere in a stage. */
export function objectIds(level: LevelDef): number[] {
  const duplicates = new Map<string, number>();
  return level.objects.map(o => {
    const kind = 'kind' in o ? o.kind : 'id' in o ? o.id : '';
    const key = `${o.t}:${o.x}:${o.y}:${kind}`;
    const occurrence = duplicates.get(key) ?? 0; duplicates.set(key, occurrence + 1);
    let hash = 2166136261;
    for (const character of `${key}:${occurrence}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  });
}
