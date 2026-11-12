import type { PowerKind } from './levels/types';

export interface PowerMeta {
  label: string;
  tex: string;
  color: number;
  hex: string;
  durationMs: number;
  blurb: string;
}

export const POWER_META: Record<PowerKind, PowerMeta> = {
  shield: {
    label: 'SHIELD', tex: 'power_shield', color: 0x59a8e8, hex: '#8fd0ff',
    durationMs: 0, blurb: 'BLOCKS ONE HIT',
  },
  swift: {
    label: 'SPEED BOOST', tex: 'power_swift', color: 0xffd65a, hex: '#ffe08a',
    durationMs: 12000, blurb: 'RUN 35% FASTER',
  },
  magnet: {
    label: 'MAGNET', tex: 'power_magnet', color: 0xe4546a, hex: '#ff9aa8',
    durationMs: 12000, blurb: 'ATTRACTS NEARBY ACORNS',
  },
  triple: {
    label: 'EXTRA FLAP', tex: 'power_triple', color: 0x78f0ff, hex: '#9ff5ff',
    durationMs: 15000, blurb: '3 AIR FLAPS INSTEAD OF 2',
  },
  heart: {
    label: 'HEART', tex: 'ui_heart', color: 0xe4546a, hex: '#ff9aa8',
    durationMs: 0, blurb: 'RESTORES ONE HEART',
  },
};
