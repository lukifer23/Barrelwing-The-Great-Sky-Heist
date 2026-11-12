import sharp from 'sharp';
import path from 'node:path';

const [src, out, twArg = '16', thArg = '16', scaleArg = '4'] = process.argv.slice(2);
const tw = +twArg, th = +thArg, scale = +scaleArg;
const img = sharp(src);
const meta = await img.metadata();
const cols = Math.floor(meta.width / tw);
const rows = Math.floor(meta.height / th);
const W = meta.width * scale;
const H = meta.height * scale;

let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const idx = y * cols + x;
    const px = x * tw * scale, py = y * th * scale;
    svg += `<rect x="${px}" y="${py}" width="${tw * scale}" height="${th * scale}" fill="none" stroke="#ff00ff" stroke-width="1"/>`;
    svg += `<rect x="${px}" y="${py}" width="${tw * scale}" height="10" fill="#000" opacity="0.55"/>`;
    svg += `<text x="${px + 1}" y="${py + 8}" font-family="monospace" font-size="9" fill="#fff">${idx}</text>`;
  }
}
svg += '</svg>';

await sharp(src)
  .resize(W, H, { kernel: 'nearest' })
  .composite([{ input: Buffer.from(svg) }])
  .png()
  .toFile(out);
console.log(out, cols, 'x', rows, 'tiles');
