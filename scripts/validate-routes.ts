import { chromium, type Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { LEVELS } from '../src/game/data/levels/index';
import { CHARACTERS, type CharacterId } from '../src/game/data/characters';

// An acceptance aid, separate from the fast regression suite. The controller
// reads the actual game and sends keyboard input. It never moves actors,
// changes health, grants powers, completes a stage, or bypasses collisions.
const option = (name: string, fallback: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const ids = option('levels', '1,2,3,4,5,6,7,8,9').split(',').map(Number);
const seconds = Number(option('seconds', '120'));
const character = option('character', 'pip') as CharacterId;
const collectFlightGems = option('gems', 'false') === 'true';
if (!Object.hasOwn(CHARACTERS, character) || !Number.isFinite(seconds) || seconds < 5 || ids.some(id => !LEVELS.some(level => level.id === id))) throw new Error('Use valid --levels=1,2 --seconds=120 --character=pip options.');
const port = Number(option('port', '5175'));
const url = `http://127.0.0.1:${port}`;
const directory = `artifacts/routes/${new Date().toISOString().replaceAll(':', '-')}`;
await mkdir(directory, { recursive: true });
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
await cp('dist', `${directory}/site`, { recursive: true });
await writeFile(`${directory}/build.json`, JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), ids, character, seconds }, null, 2));
// A private production snapshot prevents later source edits from reloading an
// acceptance run halfway through a route.
const browser = await chromium.launch();
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', `${directory}/site`, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverError = '';
server.stderr.on('data', chunk => { serverError += String(chunk); });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const results: unknown[] = [];

async function read(page: Page) {
  return page.evaluate(() => {
    const game = (window as any).__game, scene = game.scene.getScene('Game'), p = scene.player;
    const zone = scene.flightZones.find((z: any) => z.active);
    const gate = zone?.gates.find((g: any) => g.rectTop.right + 6 > p.body.left);
    const enemies = scene.enemies.getChildren().filter((e: any) => e.active && !e.defeated && Math.abs(e.y - p.y) < 42 && Math.abs(e.x - p.x) < 70);
    return {
      active: game.scene.isActive('Game'), over: game.scene.isActive('GameOver'), done: scene.levelDone,
      x: p.x, y: p.y, vy: p.body.velocity.y, mode: p.mode, grounded: p.grounded, dead: p.dead,
      flaps: p.flapCharges, dashReady: p.dashReady, time: p.now, elapsedMs: scene.elapsedMs,
      lastFlap: p.lastFlapAt,
      lives: scene.lives, hearts: p.hearts, deaths: scene.deaths, gems: [...scene.gemsCollected],
      nearbyEnemy: enemies.length > 0,
      nextGem: scene.gems.getChildren().filter((g: any) => !g.getData('wind') && g.x >= p.x - 12).sort((a: any, b: any) => a.x - b.x).map((g: any) => ({ x: g.x, y: g.y }))[0] ?? null,
      zone: zone ? { top: zone.bounds.top, bottom: zone.bounds.bottom, right: zone.bounds.right } : null,
      gate: gate ? { x: gate.rectTop.centerX, top: gate.rectTop.bottom, bottom: gate.rectBottom.top } : null,
      boss: scene.boss && scene.boss.bossActive ? { x: scene.boss.body.center.x, state: scene.boss.bossState, engaged: scene.boss.engaged, hp: scene.boss.hp } : null,
    };
  });
}

try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverError || 'Route server stopped before it was ready.');
    try { if ((await fetch(url)).ok) break; } catch { /* Wait for the local server. */ }
    if (attempt === 99) throw new Error('Route server did not become ready.');
    await delay(100);
  }
  for (const id of ids) {
    const level = LEVELS.find(l => l.id === id)!;
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors: string[] = [], trace: unknown[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
    // Stage selection is the only setup operation; all route actions use keys.
    await page.evaluate(({ id, character }) => {
      const game = (window as any).__game;
      game.registry.get('saves').selectCharacter(character);
      game.scene.stop('Title'); game.scene.start('Game', { levelId: id });
    }, { id, character });
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').player?.active);
    const exit = level.objects.find(o => o.t === 'exit')!;
    const exitX = (exit.x + 0.5) * level.tile;
    const ladders = level.objects.filter(o => o.t === 'ladder').sort((a, b) => b.y - a.y);
    const completedLadders = new Set<number>();
    const held = new Set<string>();
    const key = async (name: string, down: boolean) => {
      if (down === held.has(name)) return;
      if (down) { await page.keyboard.down(name); held.add(name); }
      else { await page.keyboard.up(name); held.delete(name); }
    };
    let jumpAt = -9999, jumpUntil = 0, dashUntil = 0, continues = 0, wasDead = false;
    let nextLog = 0, lastProgress = Date.now(), farthest = 0, highest = level.spawn.y * level.tile;
    const began = Date.now();
    let state = await read(page);
    console.log(`Starting ${id}: ${level.name} as ${character}.`);
    while (Date.now() - began < seconds * 1000 && !state.done && errors.length === 0) {
      state = await read(page);
      if (state.done) break;
      if (state.over) {
        if (continues >= 3) break;
        for (const name of [...held]) await key(name, false);
        await page.keyboard.press('Enter'); continues++; await delay(250); continue;
      }
      if (!state.active) break;
      if (state.dead || wasDead) {
        for (const name of [...held]) await key(name, false);
        completedLadders.clear(); jumpUntil = 0; dashUntil = 0;
      }
      wasDead = state.dead;
      if (state.dead) { await delay(80); continue; }
      // Release expired pulses before scheduling another. A slow inspection
      // round trip must not turn successive taps into one continuous hold.
      if (state.time >= jumpUntil) await key('Space', false);
      if (state.time >= dashUntil) await key('j', false);
      const vertical = ladders.length > 3;
      if (state.x > farthest + 20 || state.y < highest - 20) {
        farthest = Math.max(farthest, state.x); highest = Math.min(highest, state.y); lastProgress = Date.now();
      }
      if (Date.now() - began >= nextLog) {
        trace.push({ wallMs: Date.now() - began, ...state }); nextLog += 2000;
        console.log(`  ${id}: x=${Math.round(state.x)} y=${Math.round(state.y)} ${state.mode}, ${state.hearts} hearts / ${state.lives} lives, ${state.gems.filter(Boolean).length} gems${state.boss?.engaged ? `, boss ${state.boss.hp} hp` : ''}`);
      }
      // Finishing a ladder or respawning above one makes its lower route moot.
      ladders.forEach((ladder, index) => {
        if (state.y <= ladder.y * level.tile + 3 && (state.mode === 'climb' || state.grounded)) completedLadders.add(index);
      });
      const ladder = vertical ? ladders.find((_, index) => !completedLadders.has(index)) : undefined;
      let targetX = ladder ? (ladder.x + 0.5) * level.tile : exitX;
      const fighting = state.boss && (state.boss.engaged || Math.abs(state.boss.x - state.x) < 230);
      if (fighting && state.boss) targetX = state.boss.state === 'vulnerable' ? state.boss.x : state.boss.x + (state.x < state.boss.x ? -90 : 90);
      const close = Math.abs(targetX - state.x) < (ladder ? 9 : 10);
      await key('a', !close && targetX < state.x);
      await key('d', !close && targetX > state.x);
      await key('w', !!ladder && close && state.mode !== 'flight');
      if (state.mode === 'flight' && state.zone) {
        let targetY = state.gate ? (state.gate.top + state.gate.bottom) / 2 + 12 : state.zone.top + (state.zone.bottom - state.zone.top) * 0.45;
        if (collectFlightGems && state.nextGem && state.nextGem.x - state.x < 95) {
          targetY = state.nextGem.y + 12;
          if (state.gate && state.gate.x - state.x < 38 && state.gate.x <= state.nextGem.x + 18) targetY = Math.max(state.gate.top + 26, Math.min(state.gate.bottom - 3, targetY));
        }
        if (!state.gate) {
          const landing = level.terrain.filter(t => !t.decor && t.x * level.tile <= state.zone!.right + 16 && (t.x + t.w) * level.tile > state.zone!.right + 16 && t.y * level.tile >= state.zone!.top && t.y * level.tile <= state.zone!.bottom).sort((a, b) => a.y - b.y)[0];
          if (landing) targetY = landing.y * level.tile - 30;
        }
        targetY = Math.max(state.zone.top + 28, Math.min(state.zone.bottom - 12, targetY));
        const predicted = state.y + state.vy * 0.18 + 310 * 0.18 ** 2;
        const risingRoute = state.y - targetY > 30;
        if (predicted > targetY && state.vy > (risingRoute ? -190 : 75) && state.time - jumpAt > 170) { jumpAt = state.time; jumpUntil = state.time + 50; }
      } else if (state.mode !== 'climb') {
        const nearExit = !ladder && !fighting && Math.abs(exitX - state.x) < 110;
        const wantsJump = state.grounded || state.flaps > 0 && state.vy > -60;
        if (!nearExit && wantsJump && state.time - jumpAt > 360) { jumpAt = state.time; jumpUntil = state.time + 270; }
        if (state.dashReady && (state.nearbyEnemy || fighting && state.boss?.state === 'vulnerable')) dashUntil = state.time + 60;
      }
      await key('Space', state.mode !== 'climb' && state.time < jumpUntil);
      await key('j', state.time < dashUntil);
      if (Date.now() - lastProgress > 30000 && !fighting) break;
      await delay(60);
    }
    for (const name of [...held]) await key(name, false);
    await delay(state.done ? 2200 : 100);
    const result = { id, name: level.name, character, cleared: state.done, wallMs: Date.now() - began, continues, errors, final: state, trace };
    results.push(result);
    await page.screenshot({ path: `${directory}/stage-${id}.png` });
    await writeFile(`${directory}/report.json`, JSON.stringify(results, null, 2));
    console.log(`${state.done ? 'CLEARED' : 'INCOMPLETE'} ${id}: ${level.name}; ${state.deaths} deaths, ${continues} continues, ${state.gems.filter(Boolean).length}/3 gems. Report: ${directory}`);
    await context.close();
  }
} finally {
  await browser.close(); server.kill('SIGTERM');
}
if (results.some((result: any) => !result.cleared || result.errors.length)) process.exitCode = 1;
