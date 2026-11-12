// Barrelwing asset pipeline.
// Extracts, crops, recolors, packs and converts the CC0 source art into
// the exact runtime assets the game loads. Idempotent: safe to re-run.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SRC = path.join(ROOT, '_assets_src');
const OUT = path.join(ROOT, 'public', 'assets');
const TMP = path.join(ROOT, '_assets_src', '_gen');

const forestTiles = path.join(SRC, 'sunnyland_forest/Sunny-land-forest-files/PNG/environment/layers/tileset.png');
const woodsSpr = path.join(SRC, 'sunnyland_woods/Sunny-land-woods-files/SPRITES');
const forestDemo = path.join(TMP, 'forest_demo.png');

const dirs = ['terrain', 'bg', 'sprites', 'objects', 'ui', 'audio', 'fonts'];
for (const d of dirs) fs.mkdirSync(path.join(OUT, d), { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const write = (name) => path.join(OUT, name);

async function rawAlpha(file) {
  return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function alphaBBox(data, info, x0 = 0, y0 = 0, x1 = info.width, y1 = info.height) {
  let bx0 = x1, by0 = y1, bx1 = -1, by1 = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        if (x < bx0) bx0 = x;
        if (y < by0) by0 = y;
        if (x > bx1) bx1 = x;
        if (y > by1) by1 = y;
      }
    }
  }
  return { x0: bx0, y0: by0, x1: bx1, y1: by1, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
}

// Pack frames from separate PNGs into a horizontal strip, aligning each
// frame inside a fixed cell on its bottom edge.
async function packFrames(files, cellW, cellH, outName, trim = true) {
  const cells = [];
  for (const f of files) {
    const buf = await sharp(f).ensureAlpha().toBuffer();
    let img = sharp(buf);
    if (trim) {
      const { data, info } = await rawAlpha(f);
      const b = alphaBBox(data, info);
      if (b.w <= 0) { cells.push(Buffer.alloc(cellW * cellH * 4)); continue; }
      img = sharp(buf).extract({ left: b.x0, top: b.y0, width: b.w, height: b.h });
    }
    let trimmed = await img.png().toBuffer({ resolveWithObject: true });
    if (trimmed.info.width > cellW || trimmed.info.height > cellH) {
      const r = Math.min(cellW / trimmed.info.width, cellH / trimmed.info.height);
      trimmed = await sharp(trimmed.data).resize(Math.max(1, Math.round(trimmed.info.width * r)), Math.max(1, Math.round(trimmed.info.height * r)), { kernel: 'nearest' }).png().toBuffer({ resolveWithObject: true });
    }
    const left = Math.floor((cellW - trimmed.info.width) / 2);
    const top = cellH - trimmed.info.height;
    const cell = await sharp({ create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: trimmed.data, left, top }]).png().toBuffer();
    cells.push(cell);
  }
  const W = cellW * cells.length, H = cellH;
  const comps = cells.map((input, i) => ({ input, left: i * cellW, top: 0 }));
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(comps).png().toFile(outName);
  console.log('packed', path.basename(outName), cells.length, 'frames', cellW + 'x' + cellH);
}

function listDir(dir, prefix = '', ext = '.png') {
  return fs.readdirSync(dir).filter(f => f.endsWith(ext) && f.startsWith(prefix)).sort().map(f => path.join(dir, f));
}

async function tileCrop(atlas, cols, idx, w = 16, h = 16, scale = 1) {
  const sx = (idx % cols) * w, sy = Math.floor(idx / cols) * h;
  let img = sharp(atlas).extract({ left: sx, top: sy, width: w, height: h });
  if (scale !== 1) img = img.resize(w * scale, h * scale, { kernel: 'nearest' });
  return img.png().toBuffer();
}

async function stripFromTiles(atlas, cols, idxs, tileW, tileH, scale = 1) {
  const cells = await Promise.all(idxs.map(i => tileCrop(atlas, cols, i, tileW, tileH, scale)));
  const W = tileW * scale * cells.length, H = tileH * scale;
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells.map((input, i) => ({ input, left: i * tileW * scale, top: 0 }))).png().toBuffer();
}

async function main() {
  // ---------------------------------------------------------------- terrain
  // Render the reference forest map at 1x to harvest clean, pre-composed
  // ground strips (tile art, not level design).
  execFileSync('node', ['scripts/render-json-map.mjs',
    path.join(SRC, 'sunnyland_forest/Sunny-land-forest-files/demo/assets/maps/map.json'),
    forestDemo, '1'], { stdio: 'ignore' });

  // The reference map's ground surface sits at row 13 (y=208). Crop a
  // seamless 64px strip of the composed grass lip + hanging roots.
  const grassY = 207;
  await sharp(forestDemo).extract({ left: 0, top: grassY, width: 64, height: 32 })
    .png().toFile(write('terrain/forest_top.png'));
  await sharp(forestDemo).extract({ left: 0, top: 330, width: 64, height: 64 })
    .png().toFile(write('terrain/forest_fill.png'));

  // Wooden treehouse platforms (real branch art)
  for (const n of [1, 2, 3, 4, 5]) {
    fs.copyFileSync(path.join(SRC, `sunnyland_woods/Sunny-land-woods-files/ENVIRONMENT/props-sliced/branch-0${n}.png`),
      write(`terrain/branch${n}.png`));
  }

  // Storm palette: shift the forest strips to violet/indigo.
  for (const [src, dst, hue] of [
    ['terrain/forest_top.png', 'terrain/storm_top.png', 205],
    ['terrain/forest_fill.png', 'terrain/storm_fill.png', 205],
  ]) {
    await sharp(write(src)).modulate({ hue, saturation: 1.1, brightness: 0.9 }).png().toFile(write(dst));
  }

  // Industrial terrain strips from Kenney's 18px sheet (brick top + fill).
  const indAtlas = path.join(SRC, 'industrial/Tilemap/tilemap.png');
  await sharp(await stripFromTiles(indAtlas, 16, [1, 1, 1, 1], 18, 18))
    .png().toFile(write('terrain/factory_top.png'));
  await sharp(await stripFromTiles(indAtlas, 16, [33, 33, 33, 33], 18, 18))
    .png().toFile(write('terrain/factory_fill.png'));
  // Wooden plank platform strip (Kenney plank tile repeated seamlessly)
  {
    const plankTile = await sharp(path.join(SRC, 'kenney/Sprites/Tiles/Default/block_plank.png'))
      .resize(16, 16, { kernel: 'nearest' }).png().toBuffer();
    await sharp({ create: { width: 64, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([0, 1, 2, 3].map(i => ({ input: plankTile, left: i * 16, top: 0 })))
      .png().toFile(write('terrain/plank.png'));
  }
  // Wind beacon switch: lantern art, lit and unlit
  await sharp(await tileCrop(forestTiles, 20, 179, 16, 16)).png().toFile(write('objects/switch_off.png'));
  await sharp(await tileCrop(forestTiles, 20, 179, 16, 16)).modulate({ saturation: 1.4, brightness: 1.25 }).png().toFile(write('objects/switch_on.png'));

  // Metal plate platform
  await sharp(await stripFromTiles(indAtlas, 16, [16, 1, 1, 16], 18, 18))
    .png().toFile(write('terrain/factory_plate.png'));

  // ------------------------------------------------------------- backgrounds
  const bgDir = path.join(SRC, 'sunnyland_forest/Sunny-land-forest-files/PNG/environment/layers');
  fs.copyFileSync(path.join(bgDir, 'background.png'), write('bg/forest_sky.png'));
  fs.copyFileSync(path.join(bgDir, 'middleground.png'), write('bg/forest_mid.png'));
  fs.copyFileSync(path.join(SRC, 'sunnyland_woods/Sunny-land-woods-files/ENVIRONMENT/bg-trees.png'), write('bg/forest_trees.png'));
  fs.copyFileSync(path.join(SRC, 'sunnyland_woods/Sunny-land-woods-files/ENVIRONMENT/bg-clouds.png'), write('bg/forest_clouds.png'));
  fs.copyFileSync(path.join(SRC, 'sunnyland_woods/Sunny-land-woods-files/ENVIRONMENT/bg-mountains.png'), write('bg/forest_mountains.png'));

  await sharp(write('bg/forest_sky.png')).modulate({ hue: 205, saturation: 1.2, brightness: 0.72 }).png().toFile(write('bg/storm_sky.png'));
  await sharp(write('bg/forest_mid.png')).modulate({ hue: 210, saturation: 1.15, brightness: 0.6 }).png().toFile(write('bg/storm_mid.png'));
  await sharp(write('bg/forest_trees.png')).modulate({ hue: 200, saturation: 1.2, brightness: 0.55 }).png().toFile(write('bg/storm_trees.png'));

  // Factory backdrop: warm copper sky + mist forest silhouettes.
  // Factory backdrop: a hand-composed copperworks wall built from real
  // industrial tiles, warm furnace light and dark structural bands.
  {
    const brick = await sharp(indAtlas).extract({ left: (33 % 16) * 18, top: Math.floor(33 / 16) * 18, width: 18, height: 18 })
      .resize(18, 18).png().toBuffer();
    const wallComps = [];
    for (let y = 0; y < 270; y += 18) for (let x = 0; x < 480; x += 18) {
      wallComps.push({ input: brick, left: x, top: y });
    }
    const svg = `<svg width="480" height="270" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="88%" r="70%">
          <stop offset="0%" stop-color="#ff8a3c" stop-opacity="0.55"/>
          <stop offset="55%" stop-color="#ff5a20" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#120a10" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1a1020" stop-opacity="0.86"/>
          <stop offset="70%" stop-color="#2a1418" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#0e0a10" stop-opacity="0.85"/>
        </linearGradient>
      </defs>
      <rect width="480" height="270" fill="url(#sky)"/>
      <g fill="#1a1118" opacity="0.85">
        <rect x="52" y="0" width="18" height="270"/><rect x="178" y="0" width="22" height="270"/>
        <rect x="316" y="0" width="20" height="270"/><rect x="430" y="0" width="22" height="270"/>
      </g>
      <g stroke="#3a2630" stroke-width="2" opacity="0.9">
        <line x1="0" y1="76" x2="480" y2="76"/><line x1="0" y1="186" x2="480" y2="186"/>
      </g>
      <g fill="#6b3a26" opacity="0.7">
        <rect x="0" y="72" width="480" height="8"/><rect x="0" y="182" width="480" height="8"/>
      </g>
      <g fill="#ff7a3a" opacity="0.16">
        <rect x="70" y="120" width="26" height="46"/><rect x="250" y="112" width="30" height="54"/>
        <rect x="366" y="124" width="26" height="42"/>
      </g>
      <rect width="480" height="270" fill="url(#glow)"/>
      <g fill="#0d0910" opacity="0.55">
        <rect x="0" y="248" width="480" height="22"/>
      </g>
    </svg>`;
    await sharp({ create: { width: 480, height: 270, channels: 4, background: { r: 20, g: 14, b: 20, alpha: 1 } } })
      .composite([...wallComps, { input: Buffer.from(svg), left: 0, top: 0 }])
      .modulate({ saturation: 1.1, brightness: 0.72 })
      .png().toFile(write('bg/factory_sky.png'));
    await sharp(write('bg/factory_sky.png')).blur(1.3).modulate({ brightness: 0.7 }).png().toFile(write('bg/factory_mid.png'));
  }
  fs.copyFileSync(path.join(SRC, 'sideview_fantasy/Sideview Fantasy Patreon Collection/Environments/Day-Platformer/PNG/clouds.png'), write('bg/clouds.png'));

  // ------------------------------------------------------------------ player
  const pipFrames = [];
  for (const [dir, count] of [['idle', 8], ['run', 6], ['jump', 4], ['hurt', 2], ['crouch', 2]]) {
    for (let i = 1; i <= count; i++) pipFrames.push(path.join(woodsSpr, `player/${dir}/player-${dir}-${i}.png`));
  }
  const PIP_X = 9, PIP_Y = 13, PIP_W = 57, PIP_H = 45;
  const pipCells = [];
  for (const f of pipFrames) {
    pipCells.push(await sharp(f).extract({ left: PIP_X, top: PIP_Y, width: PIP_W, height: PIP_H }).png().toBuffer());
  }
  await sharp({ create: { width: PIP_W * pipCells.length, height: PIP_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(pipCells.map((input, i) => ({ input, left: i * PIP_W, top: 0 })))
    .png().toFile(write('sprites/pip.png'));
  console.log('pip frames', pipCells.length);

  // ---------------------------------------------------------------- enemies
  const enemy = (n) => path.join(SRC, `sunnyland_forest/Sunny-land-forest-files/PNG/sprites/enemies/${n}`);
  const woodsEnemy = (n) => path.join(SRC, `sunnyland_woods/Sunny-land-woods-files/SPRITES/enemies/${n}`);
  const sideSprites = path.join(SRC, 'sideview_fantasy/Sideview Fantasy Patreon Collection/Sprites');

  await packFrames(listDir(enemy('slug')), 26, 22, write('sprites/slug.png'));
  await packFrames(listDir(enemy('bee')), 32, 34, write('sprites/bee.png'));
  await packFrames(listDir(woodsEnemy('ant')), 38, 34, write('sprites/ant.png'));
  await packFrames([
    ...listDir(woodsEnemy('grasshopper-idle')),
    ...listDir(woodsEnemy('grasshopper-jump')),
  ], 34, 34, write('sprites/hopper.png'));
  await packFrames(listDir(woodsEnemy('gator')), 44, 48, write('sprites/gator.png'));
  await packFrames(listDir(enemy('piranha-plant')), 30, 40, write('sprites/plant.png'));

  // Bird (already a 7x32 sheet)
  fs.copyFileSync(path.join(sideSprites, 'flying-bird/sprites/flying-creature-cycle.png'), write('sprites/bird.png'));
  // Ghost (6x64 sheet)
  await sharp(path.join(sideSprites, 'enemy-ghost/PNG/transparent-no-particles.png'))
    .resize(384, 64).png().toFile(write('sprites/wisp.png'));

  // Storm bolts (fireball FX sheet)
  fs.copyFileSync(path.join(sideSprites, 'Grotto-escape-2-FX/PNG/spritesheets/fire-ball.png'), write('sprites/fireball.png'));
  fs.copyFileSync(path.join(sideSprites, 'Grotto-escape-2-FX/PNG/spritesheets/energy-smack.png'), write('sprites/energy_smack.png'));
  fs.copyFileSync(path.join(sideSprites, 'Grotto-escape-2-FX/PNG/spritesheets/energy-shield.png'), write('sprites/shield_aura.png'));

  // Boss dragon: three native 144x64 sheets.
  const boss = path.join(sideSprites, 'Grotto-escape-2-boss-dragon/PNG/spritesheets');
  for (const a of ['idle', 'breath', 'tail']) {
    fs.copyFileSync(path.join(boss, `${a}.png`), write(`sprites/boss_${a}.png`));
  }

  // ----------------------------------------------------------------- objects
  const indTile = (n) => path.join(SRC, `industrial/Tiles/tile_${String(n).padStart(4, '0')}.png`);
  fs.copyFileSync(indTile(9), write('objects/barrel.png'));
  fs.copyFileSync(indTile(8), write('objects/barrel_iron.png'));
  await sharp(indTile(9)).modulate({ hue: 180, saturation: 1.2 }).png().toFile(write('objects/barrel_fast.png'));
  await sharp(await stripFromTiles(indAtlas, 16, [96, 97, 98, 99], 18, 18)).png().toFile(write('objects/conveyor_0.png'));
  await sharp(await stripFromTiles(indAtlas, 16, [100, 101, 102, 103], 18, 18)).png().toFile(write('objects/conveyor_1.png'));

  const kp = path.join(SRC, 'kenney/Sprites/Tiles/Default');
  const shrink = async (src, dst, w, h) => {
    await sharp(path.join(kp, src)).resize(w, h, { kernel: 'nearest' }).png().toFile(write(dst));
  };
  await shrink('spring.png', 'objects/spring.png', 20, 20);
  await shrink('spring_out.png', 'objects/spring_out.png', 20, 20);
  await shrink('spikes.png', 'objects/spikes.png', 16, 16);
  await shrink('flag_green_a.png', 'objects/flag_a.png', 16, 16);
  await shrink('flag_green_b.png', 'objects/flag_b.png', 16, 16);
  await shrink('door_closed.png', 'objects/door.png', 30, 40);
  await shrink('block_plank.png', 'objects/crate.png', 18, 18);
  await shrink('gem_blue.png', 'objects/gem_blue.png', 20, 20);
  await shrink('gem_red.png', 'objects/gem_red.png', 20, 20);

  // Acorn (animated 3 frames)
  await packFrames(listDir(path.join(woodsSpr, 'misc/acorn')), 20, 20, write('objects/acorn.png'));
  // Vine ladder + foliage props
  fs.copyFileSync(path.join(bgDir, '../props/vine.png'), write('objects/vine.png'));
  fs.copyFileSync(path.join(bgDir, '../props/tree.png'), write('objects/tree.png'));
  fs.copyFileSync(path.join(bgDir, '../props/mushroom-red.png'), write('objects/mushroom_red.png'));
  fs.copyFileSync(path.join(bgDir, '../props/mushroom-brown.png'), write('objects/mushroom_brown.png'));
  fs.copyFileSync(path.join(bgDir, '../props/plant.png'), write('objects/plant.png'));
  fs.copyFileSync(path.join(bgDir, '../props/rock.png'), write('objects/rock.png'));
  fs.copyFileSync(path.join(SRC, 'sunnyland_woods/Sunny-land-woods-files/ENVIRONMENT/props-sliced/leaves.png'), write('objects/leaves.png'));

  // Gems: 8 frames from the sideview sheet.
  await sharp(path.join(SRC, 'sideview_fantasy/Sideview Fantasy Patreon Collection/Environments/gems/spritesheets/gems-spritesheet.png'))
    .extract({ left: 0, top: 0, width: 848, height: 176 }).png().toFile(write('objects/gems.png'));

  // --------------------------------------------------------------------- ui
  await sharp(path.join(kp, 'coin_gold.png')).resize(16, 16, { kernel: 'nearest' }).png().toFile(write('ui/coin.png'));
  await sharp(path.join(kp, 'gem_red.png')).resize(16, 16, { kernel: 'nearest' }).png().toFile(write('ui/gem.png'));
  // Heart sprites authored as 12x10 pixel art in the game palette.
  const heartPx = [
    '..###..###..',
    '.##########.',
    '############',
    '############',
    '############',
    '.##########.',
    '..########..',
    '...######...',
    '....####....',
    '.....##.....',
  ];
  const mkHeart = async (fill, shine, file) => {
    const w = 12, h = 10;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const on = heartPx[y]?.[x] === '#';
      if (!on) continue;
      const i = (y * w + x) * 4;
      const c = (x < 4 && y > 1 && y < 5) ? shine : fill;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
  };
  await mkHeart([228, 72, 88], [255, 176, 176], write('ui/heart.png'));
  await mkHeart([58, 62, 92], [82, 88, 122], write('ui/heart_empty.png'));
  await mkHeart([250, 196, 92], [255, 240, 190], write('ui/heart_gold.png'));

  // Power-up icons (authored pixel art: 12x12 each).
  const icon = async (rows, palette, file) => {
    const h = rows.length, w = rows[0].length;
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const c = palette[ch];
      if (!c) continue;
      const i = (y * w + x) * 4;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
  };
  await icon([
    '..#######..',
    '.#########.',
    '###ooooo###',
    '##o#####o##',
    '##o#####o##',
    '###ooooo###',
    '.#########.',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
  ], { '#': [70, 148, 220], o: [178, 232, 255] }, write('ui/power_shield.png'));
  await icon([
    '......#....',
    '.....##....',
    '....###....',
    '...###.....',
    '..######...',
    '.#######...',
    '....###....',
    '...###.....',
    '..###......',
    '.###.......',
    '.##........',
    '.#.........',
  ], { '#': [255, 214, 90] }, write('ui/power_swift.png'));
  await icon([
    '.##.....##.',
    '.##.....##.',
    '#o#.....#o#',
    '#o#.....#o#',
    '#o#.....#o#',
    '#o#.....#o#',
    '#o#.....#o#',
    '#o#######o#',
    '.###ooooo###'.slice(0, 11),
    '..#######..',
    '...#####...',
    '...........',
  ], { '#': [214, 74, 92], o: [210, 220, 235] }, write('ui/power_magnet.png'));
  await icon([
    '..........#',
    '.........##',
    '........###',
    '.......####',
    '......####.',
    '..##.####..',
    '.###.###...',
    '####.##....',
    '.###.#.....',
    '..##.......',
    '...#.......',
    '...........',
  ], { '#': [120, 240, 255] }, write('ui/power_triple.png'));

  // Tiny paw overlay used during ladder climbs (authored 7x6).
  await icon([
    '.#...#.',
    '###.###',
    '#######',
    '.#####.',
    '..#.#..',
    '.......',
  ], { '#': [190, 120, 64] }, write('ui/paw.png'));

  // Wing icon for flap charges (authored 10x8).
  const wingPx = [
    '..........',
    '..##......',
    '.####.....',
    '.######...',
    '..#####...',
    '...###....',
    '....#.....',
    '..........',
  ];
  const wingBuf = Buffer.alloc(10 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
    if (wingPx[y][x] !== '#') continue;
    const i = (y * 10 + x) * 4;
    wingBuf[i] = 226; wingBuf[i + 1] = 246; wingBuf[i + 2] = 255; wingBuf[i + 3] = 255;
  }
  await sharp(wingBuf, { raw: { width: 10, height: 8, channels: 4 } }).png().toFile(write('ui/wing.png'));

  // ---------------------------------------------------------------- convert
  const audioOut = write('audio');
  const conv = (src, name, start = 0, dur = 0) => {
    const args = ['-y', '-loglevel', 'error', '-i', src];
    if (start) args.push('-ss', String(start));
    if (dur) args.push('-t', String(dur));
    args.push('-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '96k', path.join(audioOut, name + '.mp3'));
    execFileSync('ffmpeg', args);
  };
  // Loops trimmed to a manageable size.
  conv(path.join(SRC, 'music/platformer.ogg'), 'forest');
  conv(path.join(SRC, 'music/mechanical.mp3'), 'factory', 0, 95);
  conv(path.join(SRC, 'music/battle.ogg'), 'boss', 0, 70);
  const ch = path.join(SRC, 'music/chiptunes');
  conv(path.join(ch, 'Juhani Junkala [Retro Game Music Pack] Title Screen.wav'), 'title');
  conv(path.join(ch, 'Juhani Junkala [Retro Game Music Pack] Level 2.wav'), 'storm');
  conv(path.join(ch, 'Juhani Junkala [Retro Game Music Pack] Level 3.wav'), 'sprint');
  conv(path.join(ch, 'Juhani Junkala [Retro Game Music Pack] Ending.wav'), 'ending');

  const sfxSrc = path.join(SRC, 'kenney/Sounds');
  const sfxMap = {
    'sfx_jump': 'jump', 'sfx_jump-high': 'flap', 'sfx_coin': 'coin', 'sfx_gem': 'gem',
    'sfx_select': 'select', 'sfx_hurt': 'hurt', 'sfx_bump': 'bump', 'sfx_throw': 'throw',
    'sfx_disappear': 'defeat', 'sfx_magic': 'magic',
  };
  for (const [f, n] of Object.entries(sfxMap)) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(sfxSrc, f + '.ogg'), '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '64k', path.join(audioOut, n + '.mp3')]);
  }
  // Additional character/level SFX from the SunnyLand demos.
  const forestSfx = path.join(SRC, 'sunnyland_forest/Sunny-land-forest-files/demo/assets/sound');
  for (const [f, n] of [['chest.ogg', 'checkpoint'], ['enemy-death.ogg', 'stomp'], ['star.ogg', 'life']]) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(forestSfx, f), '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '64k', path.join(audioOut, n + '.mp3')]);
  }
  // Small synthesized UI cues (authored, not sampled).
  const tone = (file, freq, ms, vol = 0.25, slide = 0) => {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
      `sine=frequency=${freq}:duration=${ms / 1000}:sample_rate=32000`,
      '-af', `volume=${vol}${slide ? `,asetrate=32000*${1 + slide}` : ''}`,
      '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', file.replace(/\.ogg$/, '.mp3')]);
  };
  tone(path.join(audioOut, 'ui_move.ogg'), 660, 40, 0.18);
  tone(path.join(audioOut, 'ui_confirm.ogg'), 880, 90, 0.22, 0.25);
  tone(path.join(audioOut, 'land.ogg'), 110, 55, 0.3, -0.2);
  tone(path.join(audioOut, 'switch.ogg'), 440, 70, 0.25, 0.6);

  console.log('ASSETS DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
