import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { LEVELS } from '../src/game/data/levels/index';
import { IMAGES, SHEETS, BOSS_SHEETS, MUSIC, SFX, ANIMS } from '../src/game/data/assets';

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

test('every runtime asset exists and each animation fits its sheet', async () => {
  for (const file of [...Object.values(IMAGES), ...Object.values(MUSIC), ...Object.values(SFX)]) assert.ok(fs.statSync('public/' + file).size > 0, file);
  for (const sheet of [...SHEETS, ...BOSS_SHEETS]) {
    const meta = await sharp('public/' + sheet.path).metadata();
    const count = Math.floor(meta.width! / sheet.frameWidth) * Math.floor(meta.height! / sheet.frameHeight);
    assert.ok(count >= sheet.frames, sheet.key);
    for (const anim of ANIMS.filter(a => a.sheet === sheet.key)) assert.ok(anim.start >= 0 && anim.end < count, anim.key);
  }
});
