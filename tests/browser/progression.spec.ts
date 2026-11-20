import { test, expect, type Page } from '@playwright/test';
import { boot, start } from './helpers';

async function choose(page: Page, sceneKey: string, label: string) {
  const point = await page.evaluate(({ sceneKey, label }) => {
    const game = (window as any).__game, scene = game.scene.getScene(sceneKey);
    const text = scene.children.list.find((o: any) => o.type === 'Text' && o.input?.enabled && o.text === label);
    if (!text) throw new Error(`Missing ${label} in ${sceneKey}`);
    const box = text.getBounds(), canvas = game.canvas.getBoundingClientRect();
    return { x: canvas.x + box.centerX * canvas.width / game.scale.width, y: canvas.y + box.centerY * canvas.height / game.scale.height };
  }, { sceneKey, label });
  await page.mouse.click(point.x, point.y);
}

const active = (page: Page, scene: string) =>
  page.waitForFunction(name => (window as any).__game?.scene.isActive(name), scene);

test('local players switch from Title and retain separate checkpoints, records and resets', async ({ page }) => {
  const errors = await boot(page);
  await start(page, 2);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.scene.stop('Game');
    const saves = g.registry.get('saves');
    saves.selectCharacter('mallow'); saves.recordBrawl(true, 2);
    saves.setBonusBest(500); saves.patchSettings({ oneHanded: true });
    g.scene.start('Title');
  });
  await active(page, 'Title');
  await choose(page, 'Title', 'PLAYER 1 / PROFILES'); await active(page, 'Profiles');
  await choose(page, 'Profiles', 'PLAYER 2'); await active(page, 'Title');
  await page.reload(); await active(page, 'Title');
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get())).toMatchObject({
    slot: 2, run: null, selectedCharacter: 'pip', bonusBest: 0, brawl: { wins: 0 }, settings: { oneHanded: true },
  });
  await choose(page, 'Title', 'NEW GAME'); await active(page, 'Game');
  await page.reload(); await active(page, 'Title');
  await choose(page, 'Title', 'PLAYER 2 / PROFILES'); await active(page, 'Profiles');
  await choose(page, 'Profiles', 'PLAYER 1'); await active(page, 'Title');
  const snapshot = await page.evaluate(() => (window as any).__game.registry.get('saves').get());
  expect(snapshot).toMatchObject({ slot: 1, selectedCharacter: 'mallow', bonusBest: 500,
    brawl: { wins: 1, knockouts: 2 }, run: { levelId: 2 }, otherProfiles: { 2: { run: { levelId: 1 } } } });
  expect(snapshot.revision).toBeGreaterThan(snapshot.otherProfiles[2].revision);
  expect(errors).toEqual([]);
});

test('stage clear banks the checkpoint, rating, score, stamps and shards in one revision', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const result = await page.evaluate(() => {
    const g = (window as any).__game, s = g.scene.getScene('Game'), saves = g.registry.get('saves');
    s.elapsedMs = 10000;
    const rev = saves.get().revision;
    s.completeLevel(); s.completeLevel();
    const durable = JSON.parse(localStorage.getItem('barrelwing.save.v1')!);
    return { writes: durable.revision - rev, run: durable.run, total: durable.totalScore, record: durable.levels[1], actual: s.score, shards: saves.shards };
  });
  expect(result).toMatchObject({ writes: 1, run: null, total: result.actual, record: { bestScore: result.actual, completed: true, mastery: { untouched: true, express: true } } });
  expect(result.shards).toBe(result.record.rating + 2);
  expect(errors).toEqual([]);
});

test('timed match keeps ring-outs and overtime through reload, simultaneous last stocks replay the tiebreak', async ({ page }) => {
  const errors = await boot(page);
  await choose(page, 'Title', 'BARREL BRAWL'); await active(page, 'BrawlSetup');
  await choose(page, 'BrawlSetup', 'RULES'); await choose(page, 'BrawlSetup', 'START MATCH'); await active(page, 'Brawl');
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl');
    s.startAt = 0; s.cpu.body.reset(-200, s.floor);
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').knockedOut === 1);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Brawl').cpu.stocks)).toBe(3);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl');
    s.elapsedMs = 89999; s.human.body.reset(-200, s.floor);
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').suddenDeath);
  await page.reload(); await active(page, 'Title');
  await choose(page, 'Title', 'BARREL BRAWL'); await active(page, 'BrawlSetup');
  await choose(page, 'BrawlSetup', 'RESUME SAVED MATCH'); await active(page, 'Brawl');
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().brawlRun)).toMatchObject({
    rules: 'timed', suddenDeath: true, playerKOs: 1, cpuKOs: 1, playerStocks: 1, cpuStocks: 1,
  });
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl');
    s.startAt = 0; s.human.body.reset(-200, s.floor); s.cpu.body.reset(s.W + 200, s.floor);
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').knockedOut === 2);
  await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Brawl'); s.cpu.body.reset(-200, s.floor); });
  await active(page, 'BrawlResults');
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get())).toMatchObject({ brawlRun: null, brawl: { wins: 1, knockouts: 3 } });
  expect(errors).toEqual([]);
});

test('one-thumb portrait keeps horizontal movement through a jump, brakes, cancels and mirrors', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors = await boot(page);
  await page.evaluate(() => (window as any).__game.registry.get('saves').patchSettings({ oneHanded: true, touchScale: 1.5 }));
  await start(page);
  const stop = page.getByRole('button', { name: 'Stop movement and clear aim' });
  await expect(stop).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const stick = page.locator('#joystick');
  for (const leftHanded of [false, true]) {
    await page.evaluate(flag => (window as any).__game.registry.get('saves').patchSettings({ leftHanded: flag }), leftHanded);
    await expect(page.locator('#touch-controls')).toHaveClass(leftHanded ? /left-handed/ : /one-handed/);
    const box = (await stick.boundingBox())!;
    const right = { x: box.x + box.width * 0.84, y: box.y + box.height / 2 };
    await page.touchscreen.tap(right.x, right.y);
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').inputMgr.horizontal > 0.85);
    await page.locator('[data-action="jump"]').tap();
    await page.waitForFunction(() => {
      const s = (window as any).__game.scene.getScene('Game');
      return s.player.body.velocity.y < -20 && s.inputMgr.horizontal > 0.85;
    });
    await stop.tap();
    expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').inputMgr.horizontal)).toBe(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').inputMgr.horizontal)).toBe(0);
  }
  await page.setViewportSize({ width: 568, height: 320 });
  await expect(stop).toBeHidden(); expect(errors).toEqual([]); await context.close();
});

test('Priority Pay and Acorn Rhythm apply to actual pickups and reset at respawn', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const saves = (window as any).__game.registry.get('saves');
    saves.recordLevel(1, { score: 3000, timeMs: 1000, completed: true, gems: [true, true, true] });
    saves.buyUpgrade('rhythm');
  });
  await start(page);
  const state = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    s.collectPowerup(s.powerups.find((p: any) => p.getData('kind') === 'priority'));
    const score = s.score;
    s.collectCoin(s.coins.getChildren()[0]);
    s.lastCoinAt = s.player.now - 1800;
    s.collectCoin(s.coins.getChildren()[0]);
    const gained = s.score - score;
    s.updateHud();
    const shown = s.hud.scoreText.text;
    s.player.respawnAt(s.checkpoint.x, s.checkpoint.y);
    return { gained, shown, score: s.score, priority: s.player.priorityUntil, window: s.comboWindowMs };
  });
  expect(state).toEqual({ gained: 90, shown: String(state.score), score: state.score, priority: 0, window: 1900 });
  expect(errors).toEqual([]);
});

test('active gameplay time follows elapsed display time', async ({ page }) => {
  await boot(page); await start(page);
  const sample = await page.evaluate(() => new Promise<{ wall: number; simulated: number }>(resolve => {
    const scene = (window as any).__game.scene.getScene('Game');
    const wall = performance.now(), now = scene.player.now;
    const observe = () => {
      const elapsed = performance.now() - wall;
      if (elapsed < 1500) return;
      scene.events.off('postupdate', observe);
      resolve({ wall: elapsed, simulated: scene.player.now - now });
    };
    scene.events.on('postupdate', observe);
  }));
  expect(sample.simulated).toBeGreaterThan(0);
  expect(sample.simulated).toBeLessThanOrEqual(sample.wall + 48);
});

test('Brawl recovery lift spends its charge, and a well-timed parry interrupts a live CPU swing', async ({ page }) => {
  const errors = await boot(page);
  await choose(page, 'Title', 'BARREL BRAWL'); await active(page, 'BrawlSetup');
  await choose(page, 'BrawlSetup', 'START MATCH'); await active(page, 'Brawl');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').elapsedMs > 0);
  await page.keyboard.down('w'); await page.keyboard.press('j'); await page.keyboard.up('w');
  await page.waitForFunction(() => {
    const s = (window as any).__game.scene.getScene('Brawl');
    return !s.human.canLift && s.human.body.velocity.y < -100;
  });
  await page.keyboard.down('s');
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl');
    s.human.body.reset(s.W / 2 - 22, s.floor); s.cpu.body.reset(s.W / 2 + 22, s.floor);
    s.cpu.facing = -1; s.nextThink = 0; s.nextCpuAttack = 0; s.human.dashReady = 0;
    s.human.invulnerableUntil = 0; s.cpu.attackReady = 0;
    s.parries = 0; s.events.on('brawl-parry', (f: any) => { if (f === s.human) s.parries++; });
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').cpu.windingUp);
  await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').parries === 1);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Brawl').human.damage)).toBe(0);
  await page.keyboard.up('s'); expect(errors).toEqual([]);
});

test('nine earned shards recruit Clover for this player across a new campaign', async ({ page }) => {
  const errors = await boot(page);
  const recruit = await page.evaluate(() => {
    const saves = (window as any).__game.registry.get('saves');
    saves.selectCharacter('clover');
    const before = saves.get().selectedCharacter;
    saves.recordLevel(1, { score: 6200, timeMs: 48000, completed: true, gems: [true, true, true],
      rating: 3, mastery: { collector: true, express: true, untouched: true } });
    saves.selectCharacter('clover');
    const selected = saves.get().selectedCharacter;
    saves.resetProgress();
    const kept = saves.get().cloverUnlocked;
    saves.switchProfile(2);
    return { before, selected, kept, independent: !saves.get().cloverUnlocked };
  });
  expect(recruit).toEqual({ before: 'pip', selected: 'clover', kept: true, independent: true });
  expect(errors).toEqual([]);
});

test('cover screen uses readable menus, campaign framing and a three-column stage map', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 840 } });
  const page = await context.newPage();
  const errors = await boot(page);
  await choose(page, 'Title', 'LEVEL SELECT'); await active(page, 'WorldMap');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('WorldMap').cover);
  const map = await page.evaluate(() => {
    const g = (window as any).__game, s = g.scene.getScene('WorldMap');
    const px = g.canvas.getBoundingClientRect().width / g.scale.width;
    return { rows: s.nodes.map((n: any) => n.ring.y), textPx: parseFloat(s.infoMeta.style.fontSize) * px,
      clipped: s.children.list.filter((o: any) => o.type === 'Text' && o.visible && o.text && (o.getBounds().left < -1 || o.getBounds().right > s.scale.width + 1)).map((o: any) => o.text) };
  });
  expect(map.rows[0]).toBe(map.rows[2]); expect(map.rows[3]).toBeGreaterThan(map.rows[0]);
  expect(map.textPx).toBeGreaterThanOrEqual(11); expect(map.clipped).toEqual([]);
  await page.keyboard.press('Enter'); await active(page, 'Game');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').hud.compact);
  await page.setViewportSize({ width: 840, height: 360 });
  await page.waitForFunction(() => !(window as any).__game.scene.getScene('Game').hud.compact);
  expect(errors).toEqual([]); await context.close();
});
