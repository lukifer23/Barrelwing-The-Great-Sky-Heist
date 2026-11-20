import { writeFile } from 'node:fs/promises';
import { delay, option, prepareBrowserRun } from './browser-harness';
import { COURIERS, type CharacterId } from '../src/game/data/characters';
import type { BrawlDifficulty } from '../src/game/data/brawl';
import type { ThemeId } from '../src/game/data/levels/types';

const seconds = Number(option('seconds', '220'));
if (!Number.isFinite(seconds) || seconds < 10) throw new Error('Use --seconds=220 for a full match.');
const characters = option('players', COURIERS.join(',')).split(',') as CharacterId[];
if (!characters.every(id => COURIERS.includes(id))) throw new Error('Unknown courier.');
const rules = option('rules', 'stock');
if (rules !== 'stock' && rules !== 'timed') throw new Error('Use --rules=stock or --rules=timed.');
const difficulties: BrawlDifficulty[] = ['easy', 'normal', 'hard'];
const arenas: ThemeId[] = ['forest', 'factory', 'storm'];
const opponent = option('cpu', ''), arena = option('arena', ''), difficulty = option('difficulty', '');
if (opponent && !COURIERS.includes(opponent as CharacterId) || arena && !arenas.includes(arena as ThemeId) ||
    difficulty && !difficulties.includes(difficulty as BrawlDifficulty)) throw new Error('Unknown opponent, arena or difficulty.');
const display = option('display', 'desktop'), record = option('video', 'false') === 'true';
if (!['desktop', 'unfolded'].includes(display)) throw new Error('Use --display=desktop or unfolded.');
const cases = characters.flatMap((player, i) => difficulties.filter(value => !difficulty || difficulty === value).map((difficulty, j) => ({ player, rules, cpu: opponent || COURIERS[(COURIERS.indexOf(player) + j + 1) % COURIERS.length], difficulty, arena: arena || arenas[(i + j) % 3] })));
const harness = await prepareBrowserRun('brawl', Number(option('port', '5177')), { seconds, cases, display, purpose: 'Ordinary keyboard matches; controller outcomes are not human balance scores.' });
const { browser, directory, url } = harness;
const viewport = display === 'unfolded' ? { width: 832, height: 749 } : { width: 1280, height: 720 };
const context = await browser.newContext({ viewport, hasTouch: display === 'unfolded', isMobile: display === 'unfolded',
  recordVideo: record ? { dir: directory, size: viewport } : undefined });
const page = await context.newPage();
const errors: string[] = [], results: { finished: boolean; [key: string]: unknown }[] = [];
page.on('pageerror', error => errors.push(error.message));
const held = new Set<string>();
const key = async (name: string, down: boolean) => {
  if (down === held.has(name)) return;
  if (down) { await page.keyboard.down(name); held.add(name); }
  else { await page.keyboard.up(name); held.delete(name); }
};
try {
  await page.goto(url); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  for (const options of cases) {
    for (const name of [...held]) await key(name, false);
    await page.evaluate(options => {
      const game = (window as any).__game;
      for (const scene of game.scene.getScenes(false)) if (scene.scene.isActive() || scene.scene.isPaused()) game.scene.stop(scene.scene.key);
      game.scene.start('Brawl', options);
    }, options);
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').human?.active);
    await page.evaluate(() => {
      const g = (window as any).__game, scene = g.scene.getScene('Brawl');
      const report = { swings: [0, 0], hits: [0, 0], parries: [0, 0], interruptedWindups: [0, 0], punishedMisses: [0, 0], ringOuts: [] as object[] };
      const last = [{ at: -10000, connected: false }, { at: -10000, connected: false }];
      g.registry.set('matchObservation', report);
      const observeSwing = (f: any) => {
        const side = Number(f.isCpu);
        report.swings[side]++; last[side] = { at: f.now, connected: false };
      };
      const observeHit = (f: any) => {
        const target = Number(f.isCpu), source = 1 - target, age = f.now - last[target].at;
        report.hits[source]++; last[source].connected = true;
        if (!last[target].connected && age < f.attackWindup) report.interruptedWindups[target]++;
        else if (!last[target].connected && age >= f.attackWindup + f.style.activeMs && age < f.attackCooldown) report.punishedMisses[target]++;
      };
      const observeParry = (f: any) => { const side = Number(f.isCpu); report.parries[side]++; last[1 - side].connected = true; };
      const observeRingOut = (f: any) => report.ringOuts.push({ side: f.isCpu ? 'cpu' : 'player',
        at: Math.round(scene.elapsedMs), x: Math.round(f.x), yFromFloor: Math.round(f.y - scene.floor), damage: f.damage,
        boundary: f.x < -110 ? 'left' : f.x > scene.W + 110 ? 'right' : f.y > scene.floor ? 'bottom' : 'top',
        airJumps: f.airJumps, liftReady: f.canLift && f.dashProgress === 1, stunned: f.stunned });
      const observers = { 'brawl-swing': observeSwing, 'brawl-hit': observeHit, 'brawl-parry': observeParry, 'brawl-ring-out': observeRingOut };
      for (const [event, handler] of Object.entries(observers)) scene.events.on(event, handler);
      scene.events.once('shutdown', () => {
        for (const [event, handler] of Object.entries(observers)) scene.events.off(event, handler);
      });
    });
    const started = Date.now(), trace: unknown[] = [];
    let jumpAt = -9999, jumpUntil = 0, dashUntil = 0, nextLog = 0;
    console.log(`Starting ${options.player} vs ${options.cpu}, ${options.difficulty}, ${options.arena}.`);
    let finished = false;
    while (Date.now() - started < seconds * 1000 && errors.length === 0) {
      const state = await page.evaluate(() => {
        const game = (window as any).__game;
        if (game.scene.isActive('BrawlResults') || !game.scene.isActive('Brawl')) return { finished: game.scene.isActive('BrawlResults'), active: false };
        const scene = game.scene.getScene('Brawl');
        const p = scene.human, cpu = scene.cpu;
        return { active: game.scene.isActive('Brawl'), finished: game.scene.isActive('BrawlResults'), now: p.now,
          x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y, grounded: p.grounded, jumps: p.airJumps,
          stocks: p.stocks, damage: p.damage, dash: p.dashProgress, stun: p.stunned,
          cpuX: cpu.x, cpuY: cpu.y, cpuStocks: cpu.stocks, cpuDamage: cpu.damage,
          W: scene.W, floor: scene.floor, elapsedMs: scene.elapsedMs };
      });
      if (state.finished) { finished = true; break; }
      if (!state.active) break;
      if (state.now >= jumpUntil) await key('Space', false);
      if (state.now >= dashUntil) await key('j', false);
      const offstage = state.x < state.W * 0.14 || state.x > state.W * 0.86 || state.y > state.floor + 12;
      const cpuOffstage = state.cpuX < state.W * 0.17 || state.cpuX > state.W * 0.83;
      const targetX = offstage || cpuOffstage ? state.W / 2 : state.cpuX;
      const dx = targetX - state.x, dy = state.cpuY - state.y;
      await key('a', dx < -27); await key('d', dx > 27);
      await key('w', dy < -28); await key('s', dy > 35);
      await key('k', true);
      if (!state.stun && state.now - jumpAt > 280 && (offstage && state.vy > -50 && (state.grounded || state.jumps > 0) || state.grounded && dy < -42)) {
        jumpAt = state.now; jumpUntil = state.now + 250;
      }
      if (!state.stun && state.dash === 1 && (offstage && Math.abs(dx) > 30 || Math.abs(dx) > 170 && state.x > state.W * 0.2 && state.x < state.W * 0.8)) dashUntil = state.now + 60;
      await key('Space', state.now < jumpUntil); await key('j', state.now < dashUntil);
      if (Date.now() - started >= nextLog) {
        trace.push({ wallMs: Date.now() - started, ...state }); nextLog += 10000;
        console.log(`  ${options.player}/${options.difficulty}: ${state.stocks} stocks ${Math.floor(state.damage)}% vs ${state.cpuStocks} stocks ${Math.floor(state.cpuDamage)}%, ${Math.floor(state.elapsedMs / 1000)}s.`);
      }
      await delay(60);
    }
    for (const name of [...held]) await key(name, false);
    const outcome = await page.evaluate(() => {
      const game = (window as any).__game;
      return { combat: game.registry.get('matchObservation'), result: game.scene.isActive('BrawlResults') ? game.scene.getScene('BrawlResults').result : null, record: { ...game.registry.get('saves').get().brawl } };
    });
    results.push({ ...options, finished, wallMs: Date.now() - started, ...outcome, trace });
    await page.screenshot({ path: `${directory}/${options.player}-${options.difficulty}.png` });
    await writeFile(`${directory}/report.json`, JSON.stringify({ errors, results }, null, 2));
    console.log(`${finished ? 'FINISHED' : 'INCOMPLETE'} ${options.player}/${options.difficulty}: ${!finished ? 'time limit or error' : outcome.result?.won ? 'controller win' : 'CPU win'}. Report: ${directory}`);
  }
} finally { await context.close(); await harness.close(); }
if (errors.length || results.some(result => !result.finished)) process.exitCode = 1;
