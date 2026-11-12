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

test('all fifteen stages load with unique gems and configured physics; restarts do not leak handlers', async ({ page }) => {
  const errors = await boot(page);
  for (let id = 1; id <= 15; id++) {
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
    await page.waitForFunction(() => (window as any).__game.scene.isActive('GameOver'));
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

test('visible feet land on the actual platform surface', async ({ page }) => {
  const errors = await boot(page); await start(page); await page.waitForTimeout(2100);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    s.tweens.killTweensOf(s.player); s.player.setScale(1);
    s.player.body.reset(21 * 16, 150); s.player.body.setVelocity(0, 0);
  });
  await page.waitForFunction(() => {
    const p = (window as any).__game.scene.getScene('Game').player;
    return p.grounded && Math.abs(p.y - 208) < 2;
  });
  await page.waitForTimeout(250);
  const foot = await page.evaluate(() => {
    const p = (window as any).__game.scene.getScene('Game').player;
    return { visible: p.getTopLeft().y + 35 * p.scaleY, body: p.body.bottom };
  });
  expect(foot.visible).toBeCloseTo(208, 0); expect(foot.body).toBeCloseTo(208, 0);
  expect(errors).toEqual([]);
});

test('playable characters apply real traits and keep their own animation sheets', async ({ page }) => {
  const errors = await boot(page);
  for (const [id, hearts, sheet, speed] of [['pip', 3, 'pip', 1], ['fenn', 3, 'fenn', 1.1], ['mallow', 4, 'mallow', 0.92]] as const) {
    await page.evaluate(id => (window as any).__game.registry.get('saves').selectCharacter(id), id);
    await start(page);
    const state = await page.evaluate(() => { const p = (window as any).__game.scene.getScene('Game').player; return { hearts: p.maxHearts, sheet: p.texture.key, speed: p.speedMultiplier, animation: p.animation('run') }; });
    expect(state).toEqual({ hearts, sheet, speed, animation: `${sheet}-run` });
  }
  await page.evaluate(() => { const g = (window as any).__game; g.scene.stop('Game'); g.scene.start('Title'); });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));
  await page.evaluate(() => (window as any).__game.scene.getScene('Title').startNewGame());
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.characterId)).toBe('mallow');
  expect(errors).toEqual([]);
});

test('Acorn Nova actually defeats nearby enemies; extra life increases the run reserve', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const result = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    const nova = s.powerups.find((p: any) => p.getData('kind') === 'nova');
    const enemy = s.enemies.getChildren()[0]; enemy.body.reset(s.player.x + 30, s.player.y);
    s.collectPowerup(nova);
    return { defeated: enemy.defeated, consumed: !nova.active, score: s.score };
  });
  expect(result.defeated).toBe(true); expect(result.consumed).toBe(true); expect(result.score).toBeGreaterThan(100);
  await start(page, 2);
  expect(await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Game'); s.collectPowerup(s.powerups.find((p: any) => p.getData('kind') === 'life')); return s.lives; })).toBe(4);
  expect(errors).toEqual([]);
});

test('title fills a folded, unfolded, and landscape screen with the menu inside its panel', async ({ page }) => {
  const errors = await boot(page);
  for (const viewport of [{ width: 411, height: 960 }, { width: 832, height: 749 }, { width: 960, height: 411 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(250);
    const layout = await page.evaluate(() => {
      const g = (window as any).__game, s = g.scene.getScene('Title');
      const panel = s.children.list.find((o: any) => o.type === 'Rectangle' && o.depth === 9);
      const bounds = panel.getBounds();
      return { width: g.scale.width, height: g.scale.height, scrollY: s.cameras.main.scrollY,
        menuFits: s.menu.labels.every((t: any) => { const b = t.getBounds(); return b.left >= bounds.left - 2 && b.right <= bounds.right + 2 && b.top >= bounds.top - 2 && b.bottom <= bounds.bottom + 2; }) };
    });
    expect(layout.scrollY).toBe(0); expect(layout.menuFits).toBe(true);
  }
  expect(errors).toEqual([]);
});

async function startBrawl(page: Page) {
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
    g.scene.start('Brawl', { arena: 'forest', difficulty: 'normal', player: 'pip', cpu: 'fenn' });
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').human?.active);
  await page.evaluate(() => { (window as any).__game.scene.getScene('Brawl').startAt = 0; });
}

test('Barrel Brawl keyboard attacks cause real damage and three ring-outs save a victory', async ({ page }) => {
  const errors = await boot(page); await startBrawl(page);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl');
    s.human.body.reset(s.W / 2 - 25, s.floor); s.cpu.body.reset(s.W / 2 + 25, s.floor);
    s.human.facing = 1; s.human.invulnerableUntil = s.time.now + 2000; s.cpu.invulnerableUntil = 0;
  });
  await page.keyboard.press('k');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').cpu.damage > 0);
  for (let stocks = 2; stocks >= 0; stocks--) {
    await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Brawl'); s.cpu.body.reset(s.W + 200, s.floor); });
    await page.waitForFunction(stocks => (window as any).__game.scene.getScene('Brawl').cpu.stocks === stocks, stocks);
  }
  await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlResults'));
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().brawl)).toMatchObject({ wins: 1, losses: 0, bestStreak: 1, knockouts: 3 });
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().brawlRun)).toBeNull();
  expect(errors).toEqual([]);
});

test('Barrel Brawl saves separately from campaign progress and restores match stocks and damage', async ({ page }) => {
  const errors = await boot(page); await start(page);
  await page.evaluate(() => (window as any).__game.scene.getScene('Game').persistRun());
  await startBrawl(page);
  await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Brawl'); s.cpu.stocks = 2; s.human.damage = 44; s.elapsedMs = 22000; s.persistMatch(); });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  await page.evaluate(() => { const g = (window as any).__game, saved = g.registry.get('saves').get().brawlRun; g.scene.stop('Title'); g.scene.start('Brawl', { ...saved, resume: true }); });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Brawl'));
  expect(await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Brawl'); return { stocks: s.cpu.stocks, damage: s.human.damage, campaign: (window as any).__game.registry.get('saves').get().run?.levelId }; })).toEqual({ stocks: 2, damage: 44, campaign: 1 });
  expect(errors).toEqual([]);
});

test('Barrel Brawl CPU moves and attacks; pause resumes without stuck input', async ({ page }) => {
  const errors = await boot(page); await startBrawl(page);
  const initial = await page.evaluate(() => (window as any).__game.scene.getScene('Brawl').cpu.x);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Brawl').cpu.x)).not.toBe(initial);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlPause'));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Brawl'));
  await page.waitForTimeout(150); expect(await page.evaluate(() => (window as any).__game.scene.isActive('BrawlPause'))).toBe(false);
  expect(errors).toEqual([]);
});

test('one-tap master mute silences audio and survives reload', async ({ page }) => {
  const errors = await boot(page);
  await page.getByRole('button', { name: 'Mute game audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute game audio', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => ({ saved: (window as any).__game.registry.get('saves').get().settings.muted, manager: (window as any).__game.sound.mute }))).toEqual({ saved: true, manager: true });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  await expect(page.getByRole('button', { name: 'Unmute game audio', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('game-over Continue, World Map, and Title targets work with pointer input after camera scrolling', async ({ page }) => {
  const errors = await boot(page);
  for (const [label, destination] of [['CONTINUE', 'Game'], ['WORLD MAP', 'WorldMap'], ['TITLE SCREEN', 'Title']] as const) {
    await start(page, 2);
    await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Game'); s.cameras.main.setScroll(80, 430); s.showGameOver(); });
    await page.waitForFunction(() => (window as any).__game.scene.isActive('GameOver'));
    const point = await page.evaluate(label => {
      const g = (window as any).__game, s = g.scene.getScene('GameOver');
      const text = s.children.list.find((o: any) => o.type === 'Text' && o.text.startsWith(label));
      const bounds = text.getBounds(), canvas = g.canvas.getBoundingClientRect();
      return { x: canvas.x + bounds.centerX / g.scale.width * canvas.width, y: canvas.y + bounds.centerY / g.scale.height * canvas.height };
    }, label);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(key => (window as any).__game.scene.isActive(key) && !(window as any).__game.scene.isActive('GameOver'), destination);
  }
  expect(errors).toEqual([]);
});
