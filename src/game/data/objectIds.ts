import type { LevelDef, LevelObject } from './levels/types';

function objectKey(o: LevelObject): string {
  const kind = 'kind' in o ? o.kind : 'id' in o ? o.id : '';
  return `${o.t}:${o.x}:${o.y}:${kind}`;
}

export function objectId(o: LevelObject, occurrence = 0): number {
  if (o.persistentId !== undefined) return o.persistentId;
  let hash = 2166136261;
  for (const character of `${objectKey(o)}:${occurrence}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Stable across inserting tutorials, pickups, or enemies elsewhere in a stage. */
export function objectIds(level: LevelDef): number[] {
  const duplicates = new Map<string, number>();
  return level.objects.map(o => {
    const key = objectKey(o);
    const occurrence = duplicates.get(key) ?? 0; duplicates.set(key, occurrence + 1);
    return objectId(o, occurrence);
  });
}
