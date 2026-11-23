import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { LEVELS } from '../src/game/data/levels/index';
import { IMAGES, SHEETS, BOSS_SHEETS, MUSIC, SFX, ANIMS } from '../src/game/data/assets';
import { FIGHT_STYLES } from '../src/game/data/brawl';
import { COURIERS } from '../src/game/data/characters';
import { evaluateMastery } from '../src/game/data/mastery';
import type { LevelDef, LevelObject } from '../src/game/data/levels/types';
import { FLIGHT, PHYSICS } from '../src/game/config';

/** An optimistic speed envelope: failing it proves a pickup needs a gate hit.
 * Passing it is only a necessary condition, not a full flight simulation. */
function hasFlightApproach(level: LevelDef, pickup: LevelObject, zone: Extract<LevelObject, { t: 'flight' }>): boolean {
  const x = (pickup.x + 0.5) * level.tile, y = (pickup.y + 0.5) * level.tile;
  for (let offset = -14; offset <= 14; offset++) {
    const px = x + offset;
    let top = Math.max(zone.y * level.tile + 24, y + 12 - 16);
    let bottom = Math.min((zone.y + zone.h) * level.tile - 4, y + 12 + 16);
    for (const gate of zone.gates) {
      const gx = (zone.x + gate.at) * level.tile;
      const low = (zone.y + gate.gap - gate.size / 2 - (gate.amp ?? 0)) * level.tile + 24;
      const high = (zone.y + gate.gap + gate.size / 2 + (gate.amp ?? 0)) * level.tile;
      const seconds = Math.max(0, Math.abs(px - gx) - 16) / FLIGHT.forwardSpeed;
      top = Math.max(top, low - (gx < px ? -FLIGHT.maxRise : PHYSICS.maxFall) * seconds);
      bottom = Math.min(bottom, high + (gx < px ? PHYSICS.maxFall : -FLIGHT.maxRise) * seconds);
    }
    if (top <= bottom) return true;
  }
  return false;
}

for (const level of LEVELS) test(`${level.id}: ${level.name} has complete, valid content`, () => {
  assert.equal(LEVELS[level.id - 1], level, 'save record IDs must remain consecutive');
  assert.equal(level.objects.filter(o => o.t === 'gem').length, 3);
  assert.equal(level.objects.filter(o => o.t === 'exit' || o.t === 'goalZone').length, 1);
  assert.equal(level.objects.filter(o => o.t === 'boss').length, level.hasBoss ? 1 : 0);
  assert.ok(level.thresholds.gold > level.thresholds.silver && level.thresholds.silver > 0);
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
        if (o.t === 'gem') assert.ok(hasFlightApproach(level, o, zone), `gem requires exceeding flight speed between gates: ${JSON.stringify(o)}`);
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

test('flight approach checks reject released gem placements that required a gate hit', () => {
  for (const [id, x, y] of [[3, 53, 8], [3, 72, 7], [3, 131, 6], [6, 133, 8], [7, 103, 6], [7, 136, 6], [9, 58, 10], [10, 96, 5], [10, 150, 4]]) {
    const level = LEVELS[id - 1];
    const zone = level.objects.find(o => o.t === 'flight' && x + 0.5 > o.x && x + 0.5 < o.x + o.w) as Extract<LevelObject, { t: 'flight' }>;
    assert.equal(hasFlightApproach(level, { t: 'gem', x, y }, zone), false, `${id}: ${x},${y}`);
  }
});

test('runtime texture keys are unique and no image redundantly loads a sprite sheet', () => {
  const allSheets = [...SHEETS, ...BOSS_SHEETS];
  const keys = [...Object.keys(IMAGES), ...allSheets.map(s => s.key)];
  assert.equal(new Set(keys).size, keys.length);
  for (const file of Object.values(IMAGES)) assert.ok(!allSheets.some(s => s.path === file), `redundant full-sheet texture ${file}`);
});

test('relocated pickups retain their released save IDs', async () => {
  const { objectIds } = await import('../src/game/data/objectIds');
  for (const [levelId, id] of [[2, 3948057148], [4, 3042373520], [9, 3626503116], [10, 79742306], [10, 1131319420], [6, 2585903463], [9, 3506672990], ...[533317531, 1312657372, 3923452012, 29579533, 4165041695, 1962812971, 2737106020, 1076062324].map(id => [7, id]), ...[2538732052, 3602375236, 4081961275].map(id => [3, id])]) {
    assert.equal(objectIds(LEVELS[levelId - 1]).filter(value => value === id).length, 1);
  }
});

test('every runtime asset exists and each animation fits its sheet', async () => {
  for (const file of [...Object.values(IMAGES), ...Object.values(MUSIC), ...Object.values(SFX)]) assert.ok(fs.statSync('public/' + file).size > 0, file);
  for (const sheet of [...SHEETS, ...BOSS_SHEETS]) {
    const meta = await sharp('public/' + sheet.path).metadata();
    const count = Math.floor(meta.width! / sheet.frameWidth) * Math.floor(meta.height! / sheet.frameHeight);
    assert.ok(count >= sheet.frames, sheet.key);
    const courier = COURIERS.find(id => id === sheet.key);
    if (courier) for (const frame of FIGHT_STYLES[courier].frames) assert.ok(frame >= 0 && frame < sheet.frames, courier);
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
