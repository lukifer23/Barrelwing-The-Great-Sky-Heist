import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = '_assets_src/sunnyland_forest/Sunny-land-forest-files/PNG/sprites/player';
const frames = [];
const files = async name => (await fs.readdir(path.join(source, `player-${name}`))).filter(f => f.endsWith('.png')).sort().map(f => path.join(source, `player-${name}`, f));
frames.push(...(await files('idle')).slice(0, 8), ...(await files('skip')).slice(0, 6));
const jumps = await files('jump'), falls = await files('fall');
frames.push(jumps[0], jumps[1], jumps[2], falls[2], ...(await files('hurt')).slice(0, 2), ...(await files('duck')).slice(0, 2));
const composites = [];
for (const [i, file] of frames.entries()) {
  const trimmed = await sharp(file).trim().png().toBuffer({ resolveWithObject: true });
  const scale = Math.min(1, 27 / trimmed.info.height, 45 / trimmed.info.width);
  const w = Math.round(trimmed.info.width * scale), h = Math.round(trimmed.info.height * scale);
  const input = await sharp(trimmed.data).resize(w, h, { kernel: 'nearest' }).png().toBuffer();
  composites.push({ input, left: i * 57 + Math.round((57 - w) / 2), top: 35 - h });
}
await sharp({ create: { width: 57 * 22, height: 45, channels: 4, background: '#00000000' } }).composite(composites).png().toFile('public/assets/sprites/fenn.png');
await sharp('public/assets/sprites/pip.png').modulate({ hue: 155, saturation: 0.8, brightness: 1.08 }).png().toFile('public/assets/sprites/mallow.png');
const nova = '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"><path d="M8 0 10 5 15 2 12 7 16 8 11 10 14 15 9 12 8 16 6 11 1 14 4 9 0 8 5 6 2 1 7 4Z" fill="#ffe178"/><path d="M8 4 12 8 8 12 4 8Z" fill="#fff6d5"/></svg>';
await sharp(Buffer.from(nova)).png().toFile('public/assets/ui/power_nova.png');
const bunny = '_assets_src/sideview_fantasy/Sideview Fantasy Patreon Collection/Sprites/sunny-bunny/PNG';
const poses = {};
for (const [action, count] of [['idle', 4], ['run', 6], ['jump', 5]]) {
  const sheet = path.join(bunny, `sunny-bunny-${action}.png`);
  const { width, height } = await sharp(sheet).metadata();
  poses[action] = [];
  for (let i = 0; i < count; i++) {
    const frame = await sharp(sheet).extract({ left: i * width / count, top: 0, width: width / count, height }).png().toBuffer();
    poses[action].push(await sharp(frame).trim().png().toBuffer({ resolveWithObject: true }));
  }
}
const sequence = [...poses.idle.flatMap(pose => [pose, pose]), ...poses.run,
  ...[0, 1, 2, 4, 2, 3].map(i => poses.jump[i]), ...poses.idle.slice(0, 2)];
const scale = Math.min(27 / Math.max(...poses.idle.map(p => p.info.height)), ...sequence.map(p => Math.min(45 / p.info.width, 34 / p.info.height)));
const clover = [];
for (const [i, pose] of sequence.entries()) {
  const w = Math.round(pose.info.width * scale), h = Math.round(pose.info.height * scale * (i >= 20 ? 0.68 : 1));
  let frame = sharp(pose.data).resize(w, h, { fit: 'fill', kernel: 'nearest' });
  if (i === 18 || i === 19) frame = frame.modulate({ brightness: 1.35, saturation: 0.65 });
  clover.push({ input: await frame.png().toBuffer(), left: i * 57 + Math.round((57 - w) / 2), top: 35 - h });
}
await sharp({ create: { width: 57 * 22, height: 45, channels: 4, background: '#00000000' } }).composite(clover).png().toFile('public/assets/sprites/clover.png');
console.log('Built Fenn, Mallow, Clover, and Acorn Nova assets.');
