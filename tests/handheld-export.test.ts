import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportHandheld } from '../scripts/export-handheld';
import { LEVELS } from '../src/game/data/levels';
import { objectIds } from '../src/game/data/objectIds';

const ROOT = process.cwd();

test('handheld export is deterministic and covers every authored stage', async () => {
  const a = await exportHandheld({ outDir: 'build/handheld/test-a' });
  const b = await exportHandheld({ outDir: 'build/handheld/test-b' });
  const am = JSON.parse(fs.readFileSync(a.manifestFile, 'utf8'));
  const bm = JSON.parse(fs.readFileSync(b.manifestFile, 'utf8'));
  assert.equal(am.contentHash, bm.contentHash);
  assert.deepEqual(a.files.map(f => [f.path, f.sha256]), b.files.map(f => [f.path, f.sha256]));
  assert.equal(am.stageCount, LEVELS.length);
  assert.deepEqual(am.playableStages, []);
  const stages = JSON.parse(fs.readFileSync(path.join(a.outDir, 'data/stages.json'), 'utf8')).stages;
  assert.equal(stages.length, LEVELS.length);
  for (const [i, level] of LEVELS.entries()) {
    const stage = stages[i];
    assert.equal(stage.recordId, level.id);
    assert.equal(stage.playable, false);
    assert.deepEqual(stage.objects.map((o: { id: number }) => o.id), objectIds(level));
    assert.equal(new Set(stage.objects.map((o: { id: number }) => o.id)).size, stage.objects.length);
    assert.deepEqual(stage.spawn.tile, level.spawn);
    assert.equal(stage.dimensions.width, level.width * level.tile);
  }
});

test('export fails clearly when a committed asset is missing', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'barrelwing-export-'));
  try {
    await assert.rejects(
      () => exportHandheld({ outDir: path.join(temp, 'out'), assetRoot: path.join(temp, 'public') }),
      /missing committed asset/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a playable stage with unsupported required objects is rejected', async () => {
  await assert.rejects(
    () => exportHandheld({ outDir: 'build/handheld/test-unsupported', playableStages: [1] }),
    /selected as playable but requires unsupported objects/,
  );
});

test('export does not read the optional upstream asset archives', async () => {
  const archive = path.join(ROOT, '_assets_src');
  const hidden = path.join(ROOT, '_assets_src_export_test_hidden');
  if (!fs.existsSync(archive)) return;
  fs.renameSync(archive, hidden);
  try {
    const result = await exportHandheld({ outDir: 'build/handheld/test-clean-clone' });
    assert.ok(fs.existsSync(result.manifestFile));
  } finally {
    fs.renameSync(hidden, archive);
  }
});
