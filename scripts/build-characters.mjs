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
// Mallow carries the parcel on his back. Each anchor follows its pose, including
// the four rolling frames, while the original sheet keeps the shared foot baseline.
const fur = { f68f37: 'a5cee0', ad4e1a: '597d98', '4f1507': '263647',
  f5b784: 'efe0be', ae6c37: 'ac9477', e03c28: 'de7661' };
const pack = ['.dddddddd.', 'dlllltllld', 'dggggtgggd', 'dggggtgggd', 'dttttttttd',
  'dggggtgggd', 'dbbbbtbbbd', '.dddddddd.'];
const inks = { d: '452d2a', l: 'ffd294', g: 'cd854c', t: 'ffe9ad', b: '965536' };
const parcel = Buffer.alloc(10 * 8 * 4);
for (const [y, row] of pack.entries()) for (const [x, swatch] of [...row].entries()) {
  if (swatch !== '.') parcel.write(inks[swatch] + 'ff', (y * 10 + x) * 4, 4, 'hex');
}
const packSprite = await sharp(parcel, { raw: { width: 10, height: 8, channels: 4 } }).png().toBuffer();
const packPoses = [[23,18],[24,18],[24,18],[26,17],[26,17],[24,18],[24,18],[24,19],
  [24,21],[30,16],[25,17],[30,19],[29,18],[28,19],[19,20],[21,11],[39,11],[40,26],
  [24,12],[24,10],[24,20],[24,20]];
const mallow = await sharp('public/assets/sprites/pip.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < mallow.data.length; i += 4) {
  if (mallow.data[i + 3]) {
    const color = fur[mallow.data.toString('hex', i, i + 3)];
    if (color) mallow.data.write(color, i, 3, 'hex');
  }
}
const packs = [];
for (const [i, [x, y]] of packPoses.entries()) {
  const angle = i >= 14 && i <= 17 ? (i - 14) * 90 : 0;
  packs.push({ input: await sharp(packSprite).rotate(angle).png().toBuffer(), left: i * 57 + x, top: y });
}
const baseMallow = await sharp(mallow.data, { raw: mallow.info }).composite(packs).png().toBuffer();
// Draw the parcel in the fighter's hands during the slam. The airborne roll
// and normal run keep their own backpack frames for the campaign.
const slamPoses = [
  { body: 20, x: 29, y: 6, angle: 0 }, { body: 8, x: 32, y: 3, angle: 0 },
  { body: 11, x: 41, y: 25, angle: 90 }, { body: 21, x: 36, y: 25, angle: 0 },
];
const slamFrames = [];
for (const [i, pose] of slamPoses.entries()) {
  const box = await sharp(packSprite).resize(14, 11, { kernel: 'nearest' }).rotate(pose.angle).png().toBuffer();
  const body = await sharp(mallow.data, { raw: mallow.info }).extract({ left: pose.body * 57, top: 0, width: 57, height: 45 })
    .composite([{ input: box, left: pose.x, top: pose.y }]).png().toBuffer();
  slamFrames.push({ input: body, left: (22 + i) * 57, top: 0 });
}
await sharp({ create: { width: 57 * 26, height: 45, channels: 4, background: '#00000000' } })
  .composite([{ input: baseMallow, left: 0, top: 0 }, ...slamFrames]).png().toFile('public/assets/sprites/mallow.png');
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
