import sharp from 'sharp';
import path from 'node:path';

// usage: node scripts/tile-sheet.mjs <atlas.png> <cols> <out.png> <index,index,...>
const [atlas, colsArg, out, list] = process.argv.slice(2);
const cols = +colsArg;
const idxs = list.split(',').map(Number);
const tw = 16, th = 16, scale = 6, pad = 14;
const cw = tw * scale, ch = th * scale + pad;
const W = cw * Math.min(idxs.length, 10);
const H = ch * Math.ceil(idxs.length / 10);
const composites = [];
for (let i = 0; i < idxs.length; i++) {
  const idx = idxs[i];
  const sx = (idx % cols) * tw, sy = Math.floor(idx / cols) * th;
  const buf = await sharp(atlas).extract({ left: sx, top: sy, width: tw, height: th })
    .resize(cw, tw * scale, { kernel: 'nearest' }).png().toBuffer();
  const x = (i % 10) * cw, y = Math.floor(i / 10) * ch;
  composites.push({ input: buf, left: x, top: y + pad });
}
let labels = '';
idxs.forEach((idx, i) => {
  const x = (i % 10) * cw, y = Math.floor(i / 10) * ch;
  labels += `<text x="${x + 2}" y="${y + 11}" font-family="monospace" font-size="11" fill="#ff66ff">${idx}</text>`;
});
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`;
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 30, g: 30, b: 40, alpha: 1 } } })
  .composite([...composites, { input: Buffer.from(svg) }]).png().toFile(out);
console.log('wrote', out);
