import type { LevelObject, TerrainRect, TileStyle } from './types';

export const T = (x: number, y: number, w: number, h: number, style?: TileStyle): TerrainRect =>
  style ? { x, y, w, h, style } : { x, y, w, h };

export const coin = (x: number, y: number): LevelObject => ({ t: 'coin', x, y });
export const gem = (x: number, y: number): LevelObject => ({ t: 'gem', x, y });

export function coinLine(x: number, y: number, n: number, step = 1): LevelObject[] {
  return Array.from({ length: n }, (_, i) => coin(x + i * step, y));
}

export function coinArc(x: number, y: number, n: number, height = 2): LevelObject[] {
  const out: LevelObject[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const lift = Math.round(Math.sin(t * Math.PI) * height);
    out.push(coin(x + i, y - lift));
  }
  return out;
}

export function coinColumn(x: number, y: number, n: number, step = 1): LevelObject[] {
  return Array.from({ length: n }, (_, i) => coin(x, y + i * step));
}
