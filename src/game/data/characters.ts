export const CHARACTERS = {
  pip: { name: 'PIP', species: 'SQUIRREL COURIER', sheet: 'pip', speed: 1, extraHeart: 0,
    trait: 'Balanced speed. Two air flaps. Fully insured tail.', quip: 'Neither rain nor sleet nor airborne barrels.' },
  fenn: { name: 'FENN', species: 'EXPRESS FOX', sheet: 'fenn', speed: 1.1, extraHeart: 0,
    trait: 'Runs 10% faster. Same jump and air flaps.', quip: 'Guaranteed next-day delivery. Yesterday is extra.' },
  mallow: { name: 'MALLOW', species: 'THE UNFLAPPABLE', sheet: 'mallow', speed: 0.92, extraHeart: 1,
    trait: 'One extra heart. Runs 8% slower. No rush.', quip: 'The package says fragile. So do I.' },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export function characterId(value: unknown): CharacterId {
  return typeof value === 'string' && Object.hasOwn(CHARACTERS, value) ? value as CharacterId : 'pip';
}
