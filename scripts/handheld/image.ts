import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export interface PaletteColor { r: number; g: number; b: number }
export interface QuantizedImage { indices: Uint8Array; palette: PaletteColor[] }

const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** Pick a deterministic palette from visible pixels, with index 0 reserved for transparency. */
export function quantize(rgba: Buffer, maxColors: number): QuantizedImage {
  const counts = new Map<number, number>();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, Math.max(1, maxColors - 1))
    .map(([key]) => ({ r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff }));
  const palette = [{ r: 0, g: 0, b: 0 }, ...colors];
  const cache = new Map<number, number>();
  const nearest = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let best = 1, bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 1; i < palette.length; i++) {
      const c = palette[i];
      const distance = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    }
    cache.set(key, best);
    return best;
  };
  const indices = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    indices[p] = rgba[i + 3] < 128 ? 0 : nearest(rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  return { indices, palette };
}

function writeHeaders(buf: Buffer, width: number, height: number, bpp: 4 | 8, paletteSize: number): { pixelOffset: number; stride: number } {
  const paletteBytes = paletteSize * 4;
  const pixelOffset = 14 + 40 + paletteBytes;
  const rowBytes = Math.ceil(width * bpp / 8);
  const stride = Math.ceil(rowBytes / 4) * 4;
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(pixelOffset + stride * height, 2);
  buf.writeUInt32LE(pixelOffset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(bpp, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(stride * height, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(paletteSize, 46);
  buf.writeUInt32LE(paletteSize, 50);
  return { pixelOffset, stride };
}

function writePalette(buf: Buffer, palette: PaletteColor[], size: number): void {
  for (let i = 0; i < size; i++) {
    const c = palette[i] ?? { r: 0, g: 0, b: 0 };
    const offset = 54 + i * 4;
    buf[offset] = channel(c.b); buf[offset + 1] = channel(c.g); buf[offset + 2] = channel(c.r); buf[offset + 3] = 0;
  }
}

export function writeBmp4(file: string, width: number, height: number, image: QuantizedImage): void {
  const paletteSize = 16;
  const rowBytes = Math.ceil(width * 4 / 8);
  const stride = Math.ceil(rowBytes / 4) * 4;
  const buf = Buffer.alloc(14 + 40 + paletteSize * 4 + stride * height);
  const { pixelOffset } = writeHeaders(buf, width, height, 4, paletteSize);
  writePalette(buf, image.palette, paletteSize);
  for (let y = 0; y < height; y++) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const index = image.indices[sourceY * width + x] & 0x0f;
      const offset = pixelOffset + y * stride + Math.floor(x / 2);
      buf[offset] |= x % 2 === 0 ? index << 4 : index;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

export function writeBmp8(file: string, width: number, height: number, image: QuantizedImage): void {
  const paletteSize = 256;
  const rowBytes = width;
  const stride = Math.ceil(rowBytes / 4) * 4;
  const buf = Buffer.alloc(14 + 40 + paletteSize * 4 + stride * height);
  const { pixelOffset } = writeHeaders(buf, width, height, 8, paletteSize);
  writePalette(buf, image.palette, paletteSize);
  for (let y = 0; y < height; y++) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x++) buf[pixelOffset + y * stride + x] = image.indices[sourceY * width + x];
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

export interface SpriteExport {
  file: string;
  jsonFile: string;
  width: number;
  height: number;
  frames: number;
  paletteColors: number;
}

export async function exportSpriteSheet(
  source: string,
  target: string,
  frameWidth: number,
  frameHeight: number,
  frames: number,
  options: { bpp?: 4 | 8; maxColors?: number } = {},
): Promise<SpriteExport> {
  const bpp = options.bpp ?? 4;
  const maxColors = options.maxColors ?? (bpp === 4 ? 16 : 256);
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height) throw new Error(`unreadable image: ${source}`);
  if (meta.width < frameWidth * frames || meta.height < frameHeight) {
    throw new Error(`${source}: expected at least ${frameWidth * frames}x${frameHeight}, got ${meta.width}x${meta.height}`);
  }
  const raw = await sharp(source).ensureAlpha()
    .extract({ left: 0, top: 0, width: frameWidth * frames, height: frameHeight })
    .raw().toBuffer();
  const image = quantize(raw, maxColors);
  const file = target + '.bmp';
  const jsonFile = target + '.json';
  if (bpp === 4) writeBmp4(file, frameWidth * frames, frameHeight, image);
  else writeBmp8(file, frameWidth * frames, frameHeight, image);
  fs.writeFileSync(jsonFile, JSON.stringify({ type: 'sprite', width: frameWidth, height: frameHeight, bpp_mode: bpp === 4 ? 'bpp_4' : 'bpp_8' }, null, 2) + '\n');
  return { file, jsonFile, width: frameWidth, height: frameHeight, frames, paletteColors: image.palette.length };
}

export async function exportGbaSpriteSheet(
  source: string,
  target: string,
  sourceFrameWidth: number,
  sourceFrameHeight: number,
  frames: number,
  targetWidth: number,
  targetHeight: number,
  feetSourceY?: number,
): Promise<SpriteExport & { feetY?: number }> {
  const composites: sharp.OverlayOptions[] = [];
  let feetY: number | undefined;
  for (let i = 0; i < frames; i++) {
    const cell = await sharp(source).extract({ left: i * sourceFrameWidth, top: 0, width: sourceFrameWidth, height: sourceFrameHeight })
      .ensureAlpha().resize({ width: targetWidth, height: targetHeight, fit: 'inside', kernel: 'nearest' })
      .png().toBuffer({ resolveWithObject: true });
    const left = i * targetWidth + Math.floor((targetWidth - cell.info.width) / 2);
    const top = targetHeight - cell.info.height;
    composites.push({ input: cell.data, left, top });
    if (i === 0 && feetSourceY !== undefined) {
      const scale = cell.info.height / sourceFrameHeight;
      feetY = top + Math.round(feetSourceY * scale);
    }
  }
  const sheet = await sharp({ create: { width: targetWidth * frames, height: targetHeight, channels: 4, background: '#00000000' } })
    .composite(composites).ensureAlpha().raw().toBuffer();
  const image = quantize(sheet, 16);
  const file = target + '.bmp';
  const jsonFile = target + '.json';
  writeBmp4(file, targetWidth * frames, targetHeight, image);
  fs.writeFileSync(jsonFile, JSON.stringify({ type: 'sprite', width: targetWidth, height: targetHeight, bpp_mode: 'bpp_4' }, null, 2) + '\n');
  return { file, jsonFile, width: targetWidth, height: targetHeight, frames, paletteColors: image.palette.length, feetY };
}

export async function exportGbaSingleCell(
  source: string,
  target: string,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Promise<SpriteExport> {
  return exportGbaSpriteSheet(source, target, sourceWidth, sourceHeight, 1, targetWidth, targetHeight);
}

export async function exportSingleImage(source: string, target: string): Promise<SpriteExport> {
  const meta = await sharp(source).metadata();
  if (!meta.width || !meta.height) throw new Error(`unreadable image: ${source}`);
  return exportSpriteSheet(source, target, meta.width, meta.height, 1, { bpp: 8, maxColors: 256 });
}

export async function exportBackground(source: string, target: string): Promise<{ file: string; jsonFile: string; width: number; height: number; paletteColors: number }> {
  const raw = await sharp(source).resize(256, 256, { fit: 'cover', kernel: 'nearest' }).ensureAlpha().raw().toBuffer();
  const image = quantize(raw, 256);
  const file = target + '.bmp';
  const jsonFile = target + '.json';
  writeBmp8(file, 256, 256, image);
  fs.writeFileSync(jsonFile, JSON.stringify({ type: 'regular_bg', bpp_mode: 'bpp_8', colors_count: 256 }, null, 2) + '\n');
  return { file, jsonFile, width: 256, height: 256, paletteColors: image.palette.length };
}

export async function contactSheet(items: { label: string; source: string; frame?: { x: number; y: number; w: number; h: number } }[], target: string): Promise<void> {
  const scale = 4;
  const cellW = 300, cellH = 230;
  const columns = 2;
  const rows = Math.ceil(items.length / columns);
  const width = cellW * columns, height = cellH * rows;
  const composites: sharp.OverlayOptions[] = [];
  for (const [i, item] of items.entries()) {
    let image = sharp(item.source);
    if (item.frame) image = image.extract({ left: item.frame.x, top: item.frame.y, width: item.frame.w, height: item.frame.h });
    const buffer = await image.resize({ width: cellW - 24, height: cellH - 54, fit: 'inside', kernel: 'nearest' }).png().toBuffer();
    const x = (i % columns) * cellW + 12;
    const y = Math.floor(i / columns) * cellH + 12;
    composites.push({ input: buffer, left: x, top: y });
    const label = Buffer.from(`<svg width="${cellW - 24}" height="30"><text x="2" y="20" font-family="monospace" font-size="14" fill="#f4e6c8">${item.label}</text></svg>`);
    composites.push({ input: label, left: x, top: y + cellH - 42 });
  }
  await sharp({ create: { width, height, channels: 4, background: '#141a2e' } })
    .composite(composites).resize(width * scale / 2, height * scale / 2, { kernel: 'nearest' }).png().toFile(target);
}
