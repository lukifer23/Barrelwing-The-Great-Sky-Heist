import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// Render a Tiled JSON map to a PNG preview using sharp composites.
const [mapPath, out, scaleArg = '2', onlyLayer = 'Main Layer'] = process.argv.slice(2);
const scale = +scaleArg;
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const layer = map.layers.find(l => l.name === onlyLayer && l.type === 'tilelayer');
const ts = map.tilesets[map.tilesets.length - 1];
const imgPath = path.resolve(path.dirname(mapPath), ts.image);
const { data, info } = await sharp(imgPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
const cols = ts.columns, tw = ts.tilewidth, th = ts.tileheight;
const W = map.width * tw, H = map.height * th;
const outBuf = Buffer.alloc(W * H * 4);

for (let y = 0; y < map.height; y++) {
  for (let x = 0; x < map.width; x++) {
    const gid = layer.data[y * map.width + x];
    if (!gid) continue;
    const idx = gid - ts.firstgid;
    if (idx < 0) continue;
    const sx = (idx % cols) * tw, sy = Math.floor(idx / cols) * th;
    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        const si = ((sy + py) * info.width + (sx + px)) * 4;
        const di = ((y * th + py) * W + (x * tw + px)) * 4;
        if (data[si + 3] > 0) {
          outBuf[di] = data[si]; outBuf[di + 1] = data[si + 1];
          outBuf[di + 2] = data[si + 2]; outBuf[di + 3] = data[si + 3];
        }
      }
    }
  }
}
await sharp(outBuf, { raw: { width: W, height: H, channels: 4 } })
  .resize(W * scale, H * scale, { kernel: 'nearest' })
  .png().toFile(out);
console.log('wrote', out, W, 'x', H);
