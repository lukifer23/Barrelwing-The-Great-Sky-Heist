import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { LEVELS } from '../src/game/data/levels/index';
import { IMAGES, SHEETS, BOSS_SHEETS, MUSIC, SFX, ANIMS } from '../src/game/data/assets';
import { evaluateMastery } from '../src/game/data/mastery';

for (const level of LEVELS) test(`${level.id}: ${level.name} has complete, valid content`, () => {
  assert.equal(LEVELS.filter(l => l.id === level.id).length, 1);
  assert.equal(level.objects.filter(o => o.t === 'gem').length, 3);
  assert.equal(level.objects.filter(o => o.t === 'exit' || o.t === 'goalZone').length, 1);
  assert.equal(level.objects.filter(o => o.t === 'boss').length, level.hasBoss ? 1 : 0);
  assert.ok(level.thresholds.gold > level.thresholds.silver && level.thresholds.silver > level.thresholds.bronze);
  const platforms = level.terrain.filter(t => !t.decor);
  const hasFloor = (x: number, y: number) => platforms.some(t => x + 0.5 >= t.x && x + 0.5 <= t.x + t.w && Math.abs(y - t.y) < 0.1);
  assert.ok(hasFloor(level.spawn.x, level.spawn.y), 'spawn has a stable floor');
  for (const o of level.objects) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y));
    assert.ok(o.x >= 0 && o.x <= level.width && o.y >= 0 && o.y <= level.height, `out of bounds ${JSON.stringify(o)}`);
    if (['coin', 'gem', 'powerup', 'windCrystal'].includes(o.t)) {
      assert.ok(!platforms.some(t => t.style !== 'wood' && o.x + 0.5 > t.x && o.x + 0.5 < t.x + t.w && o.y + 0.5 > t.y && o.y + 0.5 < t.y + t.h), `pickup buried in solid terrain: ${JSON.stringify(o)}`);
      for (const zone of level.objects.filter(z => z.t === 'flight')) {
        if (o.x + 0.5 < zone.x || o.x + 0.5 >= zone.x + zone.w || o.y < zone.y - 1 || o.y > zone.y + zone.h + 1) continue;
        const center = (o.y + 0.5) * level.tile;
        const reach = o.t === 'coin' ? 16 : o.t === 'powerup' ? 19 : 17;
        assert.ok(center > zone.y * level.tile + 12 - reach && center < (zone.y + zone.h) * level.tile - 16 + reach, `pickup outside flight reach: ${JSON.stringify(o)}`);
      }
    }
    if (o.persistentId !== undefined) assert.ok(Number.isInteger(o.persistentId) && o.persistentId >= 0 && o.persistentId <= 0xffffffff);
    if (o.t === 'checkpoint' || o.t === 'exit') assert.ok(hasFloor(o.x, o.y), `${o.t} at ${o.x},${o.y} needs a stable floor`);
    if (o.t === 'gate') assert.ok(o.id === 'escape' && level.hasBoss || level.objects.some(s => s.t === 'switch' && s.id === o.id));
    if (o.t === 'flight') {
      assert.ok(o.x + o.w <= level.width && o.y + o.h <= level.height);
      for (const g of o.gates) {
        assert.ok(g.at > 0 && g.at < o.w);
        assert.ok(g.size * level.tile >= 56, 'gate fits a player with maneuvering room');
        assert.ok(g.gap - g.size / 2 >= 0 && g.gap + g.size / 2 <= o.h, 'gap stays in channel');
      }
    }
  }
});

test('delivery stamps enforce complete gems, par boundaries, and the entire run history', () => {
  const clean = { gems: [true, true, true], timeMs: 110000, deaths: 0, damageTaken: 0 };
  assert.deepEqual(evaluateMastery(clean, 110), { collector: true, express: true, untouched: true });
  assert.deepEqual(evaluateMastery({ ...clean, timeMs: 110001, damageTaken: 1 }, 110), { collector: true, express: false, untouched: false });
  assert.deepEqual(evaluateMastery({ ...clean, deaths: 1, timeMs: 500 }, 110), { collector: true, express: false, untouched: false });
  assert.deepEqual(evaluateMastery({ ...clean, gems: [true, false, true] }, 110), { collector: false, express: true, untouched: true });
  assert.equal(evaluateMastery({ ...clean, timeMs: 0 }, 110).express, false);
});

test('runtime texture keys are unique and no image redundantly loads a sprite sheet', () => {
  const allSheets = [...SHEETS, ...BOSS_SHEETS];
  const keys = [...Object.keys(IMAGES), ...allSheets.map(s => s.key)];
  assert.equal(new Set(keys).size, keys.length);
  for (const file of Object.values(IMAGES)) assert.ok(!allSheets.some(s => s.path === file), `redundant full-sheet texture ${file}`);
});

test('relocated pickups retain their released save IDs', async () => {
  const { objectIds } = await import('../src/game/data/objectIds');
  for (const [levelId, id] of [[2, 3948057148], [4, 3042373520], [9, 3626503116], [10, 79742306], ...[533317531, 1312657372, 3923452012, 29579533, 4165041695, 1962812971].map(id => [7, id])]) {
    assert.equal(objectIds(LEVELS[levelId - 1]).filter(value => value === id).length, 1);
  }
});

test('every runtime asset exists and each animation fits its sheet', async () => {
  for (const file of [...Object.values(IMAGES), ...Object.values(MUSIC), ...Object.values(SFX)]) assert.ok(fs.statSync('public/' + file).size > 0, file);
  for (const sheet of [...SHEETS, ...BOSS_SHEETS]) {
    const meta = await sharp('public/' + sheet.path).metadata();
    const count = Math.floor(meta.width! / sheet.frameWidth) * Math.floor(meta.height! / sheet.frameHeight);
    assert.ok(count >= sheet.frames, sheet.key);
    for (const anim of ANIMS.filter(a => a.sheet === sheet.key)) assert.ok(anim.start >= 0 && anim.end < count, anim.key);
  }
});

test('persistent object IDs survive unrelated authored insertions', async () => {
  const { objectIds } = await import('../src/game/data/objectIds');
  for (const level of LEVELS) {
    const before = objectIds(level);
    assert.equal(new Set(before).size, before.length, `${level.id}: ID collision`);
    const after = objectIds({ ...level, objects: [{ t: 'tutorial', x: 0, y: 0, text: 'new content' }, ...level.objects] });
    assert.deepEqual(after.slice(1), before);
  }
});
