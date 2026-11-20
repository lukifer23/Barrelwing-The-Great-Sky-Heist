export const CHARACTERS = {
  pip: { name: 'PIP', species: 'SQUIRREL COURIER', sheet: 'pip', speed: 1, extraHeart: 0,
    trait: 'Hold jump on a stomp for a higher rebound.', quip: 'Neither rain nor sleet nor airborne barrels.' },
  fenn: { name: 'FENN', species: 'EXPRESS FOX', sheet: 'fenn', speed: 1.1, extraHeart: 0,
    trait: '10% faster. Dash through wood barrels to recharge.', quip: 'Guaranteed next-day delivery. Yesterday is extra.' },
  mallow: { name: 'MALLOW', species: 'THE UNFLAPPABLE', sheet: 'mallow', speed: 0.92, extraHeart: 1,
    trait: '+1 heart, 8% slower. Dashes deal 2 enemy damage.', quip: 'The package says fragile. So do I.' },
  clover: { name: 'CLOVER', species: 'ROOFTOP SCOUT', sheet: 'clover', speed: 1, extraHeart: 0,
    trait: '12% stronger ground jump. Dash recharges 15% slower.', quip: 'Stairs are for return trips.' },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export const COURIERS = Object.keys(CHARACTERS) as CharacterId[];
export function characterId(value: unknown): CharacterId {
  return typeof value === 'string' && Object.hasOwn(CHARACTERS, value) ? value as CharacterId : 'pip';
}
