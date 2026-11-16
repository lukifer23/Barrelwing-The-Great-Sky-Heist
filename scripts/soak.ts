import { writeFile } from 'node:fs/promises';
import { LEVELS } from '../src/game/data/levels/index';
import { delay, option, prepareBrowserRun } from './browser-harness';

const cycles = Number(option('cycles', '15')), dwell = Number(option('dwell', '20'));
if (!Number.isInteger(cycles) || cycles < 1 || !Number.isFinite(dwell) || dwell < 2) throw new Error('Use --cycles=15 --dwell=20 options.');
const harness = await prepareBrowserRun('soak', Number(option('port', '5176')), { cycles, dwell, purpose: 'Desktop scene lifecycle and heap sampling; not device frame-pacing acceptance.' });
const { browser, directory, url } = harness;
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [], samples: unknown[] = [];
page.on('pageerror', error => errors.push(error.message));
const cdp = await page.context().newCDPSession(page);
const percentile = (values: number[], fraction: number) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * fraction))] : 0;
try {
  await page.goto(url); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  await page.evaluate(() => {
    const game = (window as any).__game;
    const sample = { frames: [] as number[], previous: performance.now() };
    (window as any).__soak = sample;
    game.events.on('poststep', () => {
      const now = performance.now();
      if (sample.frames.length < 12000) sample.frames.push(now - sample.previous);
      sample.previous = now;
    });
  });
  for (let cycle = 0; cycle < cycles && errors.length === 0; cycle++) {
    const level = LEVELS[cycle % LEVELS.length];
    await page.keyboard.up('a'); await page.keyboard.up('d'); await page.keyboard.up('Space');
    await page.evaluate(id => {
      const game = (window as any).__game;
      for (const scene of game.scene.getScenes(false)) if (scene.scene.isActive() || scene.scene.isPaused()) game.scene.stop(scene.scene.key);
      game.scene.start('Game', { levelId: id });
      (window as any).__soak.frames = [];
    }, level.id);
    await page.waitForFunction(id => {
      const scene = (window as any).__game.scene.getScene('Game');
      return scene.scene.isActive() && scene.level.id === id && scene.player?.active;
    }, level.id);
    const started = Date.now();
    let direction = 'd', jumping = false;
    await page.keyboard.down(direction);
    while (Date.now() - started < dwell * 1000) {
      const elapsed = Date.now() - started;
      const nextDirection = Math.floor(elapsed / 900) % 2 === 0 ? 'd' : 'a';
      if (direction !== nextDirection) { await page.keyboard.up(direction); direction = nextDirection; await page.keyboard.down(direction); }
      const nextJump = elapsed % 700 < 280;
      if (jumping !== nextJump) { jumping = nextJump; if (jumping) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); }
      await delay(70);
    }
    const state = await page.evaluate(() => {
      const game = (window as any).__game, scene = game.scene.getScene('Game');
      return { frames: (window as any).__soak.frames, objects: scene.children.length, barrels: scene.barrels.getLength(), projectiles: scene.bossBolts.length,
        enemyHandlers: scene.events.listenerCount('enemy-defeated'), resumeHandlers: scene.events.listenerCount('resume'),
        blurHandlers: game.events.listenerCount('blur'), resizeHandlers: game.scale.listenerCount('resize'),
        activeScenes: game.scene.getScenes(true).map((s: any) => s.scene.key), lives: scene.lives, dead: scene.player.dead };
    });
    // Collect after shutdown to distinguish retained ownership from temporary
    // particle, tween, and rendering allocations during ordinary gameplay.
    await page.evaluate(() => {
      const game = (window as any).__game;
      for (const scene of game.scene.getScenes(false)) if (scene.scene.isActive() || scene.scene.isPaused()) game.scene.stop(scene.scene.key);
      game.scene.start('Title');
    });
    await delay(150); await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const frames = [...state.frames].filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
    const { frames: _frames, ...ownership } = state;
    const sample = { cycle: cycle + 1, level: level.id, name: level.name, heapMiB: heap.usedSize / 1048576,
      frameSamples: frames.length, medianMs: percentile(frames, 0.5), p95Ms: percentile(frames, 0.95), ...ownership };
    samples.push(sample);
    await writeFile(`${directory}/report.json`, JSON.stringify({ errors, samples }, null, 2));
    if ((cycle + 1) % 15 === 0 || cycle + 1 === cycles) await page.screenshot({ path: `${directory}/cycle-${cycle + 1}.png` });
    console.log(`Cycle ${cycle + 1}/${cycles}: stage ${level.id}, heap ${sample.heapMiB.toFixed(2)} MiB after GC; ${state.objects} objects, ${state.barrels} barrels, handlers ${state.enemyHandlers}/${state.resumeHandlers}.`);
    if (state.enemyHandlers !== 1 || state.resumeHandlers !== 1) errors.push(`Stage ${level.id} duplicated gameplay event handlers.`);
  }
  console.log(`Soak report: ${directory}; ${errors.length} runtime errors.`);
  await writeFile(`${directory}/report.json`, JSON.stringify({ errors, samples }, null, 2));
} finally { await harness.close(); }
if (errors.length) process.exitCode = 1;
