import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { LEVELS } from '../src/game/data/levels/index';
import { objectIds } from '../src/game/data/objectIds';
import { ANIMS, IMAGES, SHEETS, SFX } from '../src/game/data/assets';
import { CHARACTERS } from '../src/game/data/characters';
import { FIGHT_STYLES } from '../src/game/data/brawl';
import { SPRINT_CLASSES } from '../src/game/data/sprint';
import { FLIGHT, GAME_HEIGHT, GAME_WIDTH, PHYSICS } from '../src/game/config';
import { contactSheet, exportBackground, exportSingleImage, exportSpriteSheet } from './handheld/image';
import { buildSprintModule, sprintModuleInfo } from './handheld/mod';

const CONTENT_VERSION = 'handheld-1';
const SCHEMA_VERSION = 1;
const IMPLEMENTED_OBJECT_TYPES = ['gate', 'acorn', 'terrain', 'spawn'] as const;
const ROM_SELECTION = 'handheld/gba/rom.json';
const SPRINT_SFX = ['flap', 'coin', 'hurt', 'ui_confirm', 'defeat'] as const;

export interface ExportOptions {
  outDir?: string;
  assetRoot?: string;
  playableStages?: number[];
  verify?: boolean;
}

interface ExportedFile { path: string; sha256: string; bytes: number }

function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, sort(val)]));
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}

function sha256(data: string | Buffer): string { return crypto.createHash('sha256').update(data).digest('hex'); }
function sha256File(file: string): string { return sha256(fs.readFileSync(file)); }

function requireFile(file: string, label: string): string {
  if (!fs.existsSync(file)) throw new Error(`${label}: missing committed asset ${file}`);
  return file;
}

function gitValue(args: string[]): string {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

function world(tile: number, x: number, y: number): { x: number; y: number } {
  return { x: Math.round(x * tile * 1000) / 1000, y: Math.round(y * tile * 1000) / 1000 };
}

function exportedStage(level: typeof LEVELS[number], playable: boolean) {
  const ids = objectIds(level);
  const objects = level.objects.map((o, i) => {
    const item: Record<string, unknown> = { ...o, id: ids[i], tile: { x: o.x, y: o.y }, world: world(level.tile, o.x, o.y) };
    if (o.t === 'flight') {
      item.gates = o.gates.map(gate => ({
        ...gate, worldAt: world(level.tile, o.x + gate.at, o.y + gate.gap),
        worldGapTop: world(level.tile, o.x + gate.at, o.y + gate.gap - gate.size / 2),
      }));
    }
    return item;
  });
  const unsupportedRequired = [...new Set(level.objects.map(o => o.t).filter(t => !IMPLEMENTED_OBJECT_TYPES.includes(t as never)))];
  if (playable && unsupportedRequired.length) {
    throw new Error(`stage ${level.id} ${level.name} is selected as playable but requires unsupported objects: ${unsupportedRequired.join(', ')}`);
  }
  return {
    recordId: level.id,
    name: level.name,
    subtitle: level.subtitle,
    world: level.world,
    theme: level.theme,
    tileSize: level.tile,
    widthTiles: level.width,
    heightTiles: level.height,
    dimensions: { width: level.width * level.tile, height: level.height * level.tile },
    spawn: { tile: level.spawn, world: world(level.tile, level.spawn.x, level.spawn.y) },
    checkpoints: level.objects.filter(o => o.t === 'checkpoint').map(o => ({ tile: { x: o.x, y: o.y }, world: world(level.tile, o.x, o.y) })),
    exit: level.objects.filter(o => o.t === 'exit' || o.t === 'goalZone').map(o => ({ type: o.t, tile: { x: o.x, y: o.y }, world: world(level.tile, o.x, o.y) })),
    terrain: level.terrain.map(rect => ({ ...rect, world: world(level.tile, rect.x, rect.y), dimensions: { width: rect.w * level.tile, height: rect.h * level.tile } })),
    objects,
    parTimeSeconds: level.parTime,
    thresholds: level.thresholds,
    music: level.music,
    hasBoss: !!level.hasBoss,
    bossPhase: level.bossPhase ?? 1,
    intro: level.intro,
    playable,
    unsupportedRequired,
  };
}

function objectIdReport(stage: ReturnType<typeof exportedStage>) {
  const ids = stage.objects.map(o => o.id as number);
  return { stageId: stage.recordId, count: ids.length, unique: new Set(ids).size, ids };
}

function readPlayableStages(options: ExportOptions): number[] {
  if (options.playableStages) return options.playableStages;
  if (!fs.existsSync(ROM_SELECTION)) return [];
  const selection = JSON.parse(fs.readFileSync(ROM_SELECTION, 'utf8')) as { playableStages?: number[] };
  return Array.isArray(selection.playableStages) ? selection.playableStages : [];
}

async function writeAssets(outDir: string, assetRoot: string) {
  const files: ExportedFile[] = [];
  const assetDir = path.join(outDir, 'assets');
  const register = (file: string) => { files.push({ path: path.relative(outDir, file), sha256: sha256File(file), bytes: fs.statSync(file).size }); };
  const root = (relative: string) => requireFile(path.join(assetRoot, relative), 'asset export');

  const pip = SHEETS.find(s => s.key === 'pip')!;
  const acorn = SHEETS.find(s => s.key === 'acorn')!;
  const spriteDefs = [
    { key: 'pip', def: pip, anchor: { originX: 0.5, originY: 35 / 45, body: { width: 14, height: 24, offsetX: 20, offsetY: 11 }, feetY: 35 } },
    { key: 'acorn', def: acorn, anchor: { originX: 0.5, originY: 0.5 } },
  ];
  const sprites: Record<string, unknown> = {};
  for (const { key, def, anchor } of spriteDefs) {
    const source = root(def.path);
    const exported = await exportSpriteSheet(source, path.join(assetDir, 'sprites', key), def.frameWidth, def.frameHeight, def.frames, { bpp: 4, maxColors: 16 });
    register(exported.file); register(exported.jsonFile);
    sprites[key] = {
      ...exported, source: def.path, anchor,
      animations: ANIMS.filter(a => a.sheet === key).map(a => ({ key: a.key, start: a.start, end: a.end, frameRate: a.frameRate, repeat: a.repeat })),
    };
  }

  const singleKeys = ['ui_heart', 'ui_wing', 'storm_fill', 'storm_top'] as const;
  for (const key of singleKeys) {
    const source = root(IMAGES[key]);
    const exported = await exportSingleImage(source, path.join(assetDir, 'sprites', key));
    register(exported.file); register(exported.jsonFile);
    sprites[key] = { ...exported, source: IMAGES[key] };
  }

  const backgrounds: Record<string, unknown> = {};
  for (const key of ['bg_storm_sky', 'bg_storm_mid', 'bg_storm_trees', 'bg_clouds'] as const) {
    const source = root(IMAGES[key]);
    const exported = await exportBackground(source, path.join(assetDir, 'bg', key));
    register(exported.file); register(exported.jsonFile);
    backgrounds[key] = { ...exported, source: IMAGES[key] };
  }

  const audio: Record<string, unknown> = {};
  for (const key of SPRINT_SFX) {
    const source = root(SFX[key]);
    const output = path.join(assetDir, 'audio', `${key}.wav`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    try {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', source, '-map_metadata', '-1', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_u8', output]);
    } catch {
      throw new Error(`audio export failed for ${source}; ffmpeg is required for committed MP3 cues`);
    }
    register(output);
    audio[key] = { source: SFX[key], file: path.relative(outDir, output), format: 'pcm_u8', sampleRate: 22050, channels: 1 };
  }
  const musicFile = path.join(assetDir, 'audio', 'sprint_loop.mod');
  fs.mkdirSync(path.dirname(musicFile), { recursive: true });
  fs.writeFileSync(musicFile, buildSprintModule());
  register(musicFile);
  audio.sprintLoop = { ...sprintModuleInfo(), file: path.relative(outDir, musicFile), license: 'Original composition generated by scripts/handheld/mod.ts' };

  await contactSheet([
    { label: 'Pip idle', source: root(pip.path), frame: { x: 0, y: 0, w: pip.frameWidth, h: pip.frameHeight } },
    { label: 'Pip run', source: root(pip.path), frame: { x: pip.frameWidth * 8, y: 0, w: pip.frameWidth, h: pip.frameHeight } },
    { label: 'Pip flap', source: root(pip.path), frame: { x: pip.frameWidth * 14, y: 0, w: pip.frameWidth, h: pip.frameHeight } },
    { label: 'Pip hurt', source: root(pip.path), frame: { x: pip.frameWidth * 18, y: 0, w: pip.frameWidth, h: pip.frameHeight } },
    { label: 'Acorn', source: root(acorn.path), frame: { x: 0, y: 0, w: acorn.frameWidth, h: acorn.frameHeight } },
    { label: 'Heart', source: root(IMAGES.ui_heart), frame: { x: 0, y: 0, w: (await sharp(root(IMAGES.ui_heart)).metadata()).width!, h: (await sharp(root(IMAGES.ui_heart)).metadata()).height! } },
  ], path.join(outDir, 'contact-sheet.png'));
  register(path.join(outDir, 'contact-sheet.png'));

  return { files, sprites, backgrounds, audio };
}

export async function exportHandheld(options: ExportOptions = {}): Promise<{ outDir: string; manifestFile: string; contentHash: string; files: ExportedFile[] }> {
  const outDir = path.resolve(options.outDir ?? 'build/handheld/v1');
  const assetRoot = path.resolve(options.assetRoot ?? 'public');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const playableStages = readPlayableStages(options);
  const stages = LEVELS.map(level => exportedStage(level, playableStages.includes(level.id)));
  const idReports = stages.map(objectIdReport);
  const dataDir = path.join(outDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const stageFile = path.join(dataDir, 'stages.json');
  fs.writeFileSync(stageFile, canonicalJson({ stages, objectIds: idReports }));

  const sprintFile = path.join(dataDir, 'sprint.json');
  fs.writeFileSync(sprintFile, canonicalJson({
    version: 1,
    canonical: { width: GAME_WIDTH, height: GAME_HEIGHT, scaleToGba: 0.5, gbaWidth: 240, gbaHeight: 160, playfieldHeight: 135 },
    classes: SPRINT_CLASSES,
    physics: { ...PHYSICS, ...FLIGHT },
    course: { minY: 50, maxY: GAME_HEIGHT - 34, gateWidth: 34, gateSpacingBase: 1.5, gateSpacingMin: 1.05 },
  }));

  const characterFile = path.join(dataDir, 'characters.json');
  fs.writeFileSync(characterFile, canonicalJson({ characters: CHARACTERS, fightStyles: FIGHT_STYLES }));

  const assets = await writeAssets(outDir, assetRoot);
  const files: ExportedFile[] = [
    { path: path.relative(outDir, stageFile), sha256: sha256File(stageFile), bytes: fs.statSync(stageFile).size },
    { path: path.relative(outDir, sprintFile), sha256: sha256File(sprintFile), bytes: fs.statSync(sprintFile).size },
    { path: path.relative(outDir, characterFile), sha256: sha256File(characterFile), bytes: fs.statSync(characterFile).size },
    ...assets.files,
  ].sort((a, b) => a.path.localeCompare(b.path));

  const report = {
    stages: stages.length,
    playableStageIds: playableStages,
    implementedObjectTypes: IMPLEMENTED_OBJECT_TYPES,
    unsupportedByStage: Object.fromEntries(stages.map(s => [s.recordId, s.unsupportedRequired])),
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    sprites: Object.keys(assets.sprites).length,
    backgrounds: Object.keys(assets.backgrounds).length,
    audio: Object.keys(assets.audio).length,
  };
  const reportFile = path.join(outDir, 'resource-report.json');
  fs.writeFileSync(reportFile, canonicalJson(report));
  files.push({ path: path.relative(outDir, reportFile), sha256: sha256File(reportFile), bytes: fs.statSync(reportFile).size });
  files.sort((a, b) => a.path.localeCompare(b.path));

  const contentHash = sha256(canonicalJson({
    schemaVersion: SCHEMA_VERSION, contentVersion: CONTENT_VERSION,
    implementedObjectTypes: IMPLEMENTED_OBJECT_TYPES,
    playableStages, files,
  }));
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    source: { commit: gitValue(['rev-parse', 'HEAD']), dirty: gitValue(['status', '--porcelain']) !== '' },
    sourceOfTruth: ['src/game/data/levels', 'src/game/data/objects', 'src/game/data/assets.ts', 'src/game/config.ts', 'public/assets'],
    implementedObjectTypes: IMPLEMENTED_OBJECT_TYPES,
    playableStages,
    stageCount: stages.length,
    stageFile: path.relative(outDir, stageFile),
    contentHash,
    font: { family: 'Butano common_variable_8x16', license: 'Butano 21.10.1 (zlib)', note: 'Built-in bitmap font; no browser WOFF2 enters the ROM runtime.' },
    licenses: { credits: 'CREDITS.md', notices: 'licenses/' },
    files,
  };
  const manifestFile = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestFile, canonicalJson(manifest));
  return { outDir, manifestFile, contentHash, files };
}

async function main(): Promise<void> {
  const verify = process.argv.includes('--verify');
  const playableArg = process.argv.find(arg => arg.startsWith('--playable='));
  const playableStages = playableArg ? playableArg.slice('--playable='.length).split(',').map(Number).filter(Number.isFinite) : undefined;
  if (!verify) {
    const result = await exportHandheld({ playableStages });
    console.log(`exported ${result.files.length} files to ${path.relative(process.cwd(), result.outDir)}`);
    console.log(`content ${result.contentHash}`);
    return;
  }
  const a = await exportHandheld({ outDir: 'build/handheld/verify-a', playableStages, assetRoot: 'public' });
  const b = await exportHandheld({ outDir: 'build/handheld/verify-b', playableStages, assetRoot: 'public' });
  const aManifest = JSON.parse(fs.readFileSync(a.manifestFile, 'utf8')) as { contentHash: string };
  const bManifest = JSON.parse(fs.readFileSync(b.manifestFile, 'utf8')) as { contentHash: string };
  const aHashes = new Map(a.files.map(f => [f.path, f.sha256]));
  const bHashes = new Map(b.files.map(f => [f.path, f.sha256]));
  const mismatch = [...aHashes].filter(([file, hash]) => bHashes.get(file) !== hash);
  if (aManifest.contentHash !== bManifest.contentHash || mismatch.length || aHashes.size !== bHashes.size) {
    throw new Error(`non-deterministic export: ${mismatch.map(([file]) => file).join(', ') || 'content hash mismatch'}`);
  }
  console.log(`deterministic export verified: ${aHashes.size} files, content ${aManifest.contentHash}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
}
