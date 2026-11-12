import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  return errors;
}
async function start(page: Page, id = 1) {
  await page.evaluate(id => { const game = (window as any).__game; for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key); game.scene.start('Game', { levelId: id }); }, id);
  await page.waitForFunction(id => { const s = (window as any).__game.scene.getScene('Game'); return s.scene.isActive() && s.level.id === id && !!s.inputMgr; }, id);
}

test('all twelve stages load with unique gems and configured physics; restarts do not leak handlers', async ({ page }) => {
  const errors = await boot(page);
  for (let id = 1; id <= 12; id++) {
    await start(page, id);
    const state = await page.evaluate(() => {
      const s = (window as any).__game.scene.getScene('Game');
      return { gems: s.gems.getChildren().filter((g: any) => !g.getData('wind')).map((g: any) => g.getData('gemIndex')),
        flyers: s.enemies.getChildren().filter((e: any) => e.isFlyer).every((e: any) => !e.body.allowGravity),
        handlers: s.events.listenerCount('enemy-defeated'), resume: s.events.listenerCount('resume'),
        barrels: s.barrels.getChildren().map((b: any) => Math.abs(b.body.velocity.x)) };
    });
    expect(state.gems).toEqual([0, 1, 2]); expect(state.flyers).toBe(true);
    expect(state.handlers).toBe(1); expect(state.resume).toBe(1);
  }
  await page.screenshot({ path: 'artifacts/trial.png' });
  expect(errors).toEqual([]);
});

test('run state survives reload without duplicating collected items; old saves migrate safely', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const before = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    for (const g of [...s.gems.getChildren()]) s.collectGem(g);
    s.collectCoin(s.coins.getChildren()[0]);
    s.checkpointContact(s.checkpoints.getChildren()[0]);
    s.lives = 2; s.persistRun();
    return { score: s.score, coins: s.coinsCollected, checkpoint: s.checkpoint, gems: s.gemsCollected };
  });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  await page.keyboard.press('Enter'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  const after = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    return { score: s.score, coins: s.coinsCollected, checkpoint: s.checkpoint, gems: s.gemsCollected, remaining: s.gems.getLength(), lives: s.lives };
  });
  expect(after).toMatchObject(before); expect(after.remaining).toBe(0); expect(after.lives).toBe(2);
  await page.evaluate(() => localStorage.setItem('barrelwing.save.v1', '{broken'));
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  expect(await page.evaluate(() => localStorage.getItem('barrelwing.save.v1.backup'))).toContain('"lives":2');
  expect(errors).toEqual([]);
});

test('real keyboard movement, jump, pause, resume, death and continue work repeatedly', async ({ page }) => {
  const errors = await boot(page); await start(page); await page.waitForTimeout(2100);
  const x = await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(450); await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.x)).toBeGreaterThan(x + 30);
  const y = await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.y);
  await page.keyboard.down('Space'); await page.waitForTimeout(180); await page.keyboard.up('Space');
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.y)).toBeLessThan(y - 20);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
    await page.waitForTimeout(260); await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
    await page.waitForTimeout(80); expect(await page.evaluate(() => (window as any).__game.scene.isActive('Pause'))).toBe(false);
  }
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Game'); s.lives = 1; s.killPlayer(true); s.deathAt = s.time.now - 1; });
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').gameOver);
    await page.keyboard.press('Enter'); await page.waitForFunction(() => !(window as any).__game.scene.getScene('Game').gameOver);
    expect(await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Game'); return { lives: s.lives, dead: s.player.dead, handler: !!s.gameOverKey }; })).toEqual({ lives: 3, dead: false, handler: false });
  }
  expect(errors).toEqual([]);
});

test('earned upgrades persist, cannot be bought twice without shards, and change actual player stats', async ({ page }) => {
  const errors = await boot(page);
  const result = await page.evaluate(async () => {
    const S = (window as any).__game.registry.get('saves');
    S.recordLevel(1, { score: 3000, timeMs: 60000, gems: [true, true, true], completed: true }); S.setRating(1, 3);
    return { earned: S.shards, bought: S.buyUpgrade('vitality'), second: S.buyUpgrade('vitality'), remains: S.shards };
  });
  expect(result).toEqual({ earned: 6, bought: true, second: false, remains: 3 });
  await start(page); expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.maxHearts)).toBe(4);
  await page.evaluate(() => { const g = (window as any).__game; g.scene.stop('Game'); g.scene.start('WorldMap'); });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('WorldMap'));
  await page.keyboard.press('u'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Workshop'));
  await page.screenshot({ path: 'artifacts/workshop.png' });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  expect(await page.evaluate(async () => (window as any).__game.registry.get('saves').get().upgrades.vitality)).toBe(1);
  expect(errors).toEqual([]);
});

test('sprint restarts reset score, and long runs release collected coins and old gate objects', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { const g = (window as any).__game; g.scene.stop('Title'); g.scene.start('SkySprint'); });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('SkySprint'));
  await page.keyboard.press('Space'); await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('SkySprint').gates.length)).toBe(1);
  await page.evaluate(() => { const s = (window as any).__game.scene.getScene('SkySprint'); s.coinScore = 500; s.scene.restart(); });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => { const s = (window as any).__game.scene.getScene('SkySprint'); return { coins: s.coinScore, hearts: s.hearts.length, menu: !!s.overMenu }; })).toEqual({ coins: 0, hearts: 3, menu: false });
  expect(errors).toEqual([]);
});

test('phone touch controls move the actual player and fit portrait and landscape viewports', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors = await boot(page); await start(page); await page.waitForTimeout(2100);
  await expect(page.getByRole('button', { name: 'Jump or flap', exact: true })).toBeVisible();
  const x = await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.x);
  const box = (await page.getByRole('application', { name: 'Movement joystick', exact: true }).boundingBox())!;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.9, y: box.y + box.height / 2 }] });
  await page.waitForTimeout(450);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.x)).toBeGreaterThan(x + 30);
  await page.screenshot({ path: 'artifacts/phone-portrait.png' });
  for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(200);
    const canvas = (await page.locator('canvas').boundingBox())!;
    expect(canvas.x).toBeGreaterThanOrEqual(-1); expect(canvas.y).toBeGreaterThanOrEqual(-1);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await page.screenshot({ path: 'artifacts/phone-small.png' });
  expect(errors).toEqual([]); await context.close();
});
