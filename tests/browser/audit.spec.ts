import { test, expect } from '@playwright/test';
import { boot, start } from './helpers';

test('delivery stamps pay once, fund upgrades, and survive replay and reload', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const clear = () => page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    for (const gem of [...s.gems.getChildren()]) s.collectGem(gem);
    s.elapsedMs = 60000; s.completeLevel();
  });
  await clear();
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Results'));
  expect(await page.evaluate(() => {
    const g = (window as any).__game, saves = g.registry.get('saves');
    return { mastery: saves.get().levels[1].mastery, shards: saves.shards, earned: g.scene.getScene('Results').result.shardsEarned };
  })).toEqual({ mastery: { collector: true, express: true, untouched: true }, shards: 9, earned: 9 });
  expect(await page.evaluate(() => {
    const saves = (window as any).__game.registry.get('saves');
    return ['vitality', 'reserves', 'dash'].map(kind => saves.buyUpgrade(kind));
  })).toEqual([true, true, true]);
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().upgrades)).toEqual({ vitality: 1, reserves: 1, dash: 1, duration: 0 });
  await start(page); await clear();
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Results'));
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Results').result)).toMatchObject({ newStamps: [], shardsEarned: 0 });
  expect(errors).toEqual([]);
});

test('damage, checkpoint restarts, and Continue retain stamp eligibility history', async ({ page }) => {
  const errors = await boot(page); await start(page);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    s.player.invulnUntil = 0; s.hurtPlayer(s.player.x + 30); s.persistRun();
  });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  await page.keyboard.press('Enter'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').damageTaken)).toBe(1);
  await page.evaluate(() => (window as any).__game.scene.getScene('Game').restartFromCheckpoint());
  await page.waitForFunction(() => !(window as any).__game.scene.getScene('Game').respawning);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').deaths)).toBe(1);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    s.lives = 1; s.killPlayer(true); s.deathAt = s.player.now - 1;
  });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('GameOver'));
  await page.keyboard.press('Enter'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    for (const gem of [...s.gems.getChildren()]) s.collectGem(gem);
    s.elapsedMs = 1000; s.completeLevel();
  });
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().levels[1].mastery)).toEqual({ collector: true, express: false, untouched: false });
  expect(errors).toEqual([]);
});

test('quick dash and flight flap inputs wait for their remaining cooldown', async ({ page }) => {
  const errors = await boot(page); await start(page);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    s.dashes = 0; s.events.on('fx-dash', () => s.dashes++);
    s.player.dashReadyAt = s.player.now + 70;
  });
  await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').dashes === 1);
  await start(page, 3);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), z = s.flightZones[0];
    s.player.body.reset(z.bounds.left + 25, z.bounds.centerY);
    s.player.setFlightBounds(z.bounds); z.active = true;
    s.player.lastFlapAt = s.player.now - 70;
    s.flaps = 0; s.events.on('player-flap', () => s.flaps++);
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').flaps === 1);
  expect(errors).toEqual([]);
});

test('moving flight gates stay anchored and protected contact never teleports again', async ({ page }) => {
  const errors = await boot(page); await start(page, 3);
  const state = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), p = s.player, z = s.flightZones[0], gate = z.gates[1];
    z.active = true; p.setFlightBounds(z.bounds); p.invulnUntil = 0;
    p.body.reset(gate.rectTop.centerX, gate.rectTop.bottom - 2);
    p.body.updateFromGameObject();
    s.updateFlightZones(1500);
    const hearts = p.hearts;
    p.body.reset(gate.rectTop.centerX, gate.rectTop.bottom - 2);
    p.body.updateFromGameObject();
    const before = { x: p.x, y: p.y };
    s.updateFlightZones(1500);
    return { before, after: { x: p.x, y: p.y }, hearts, finalHearts: p.hearts,
      top: gate.rectTop.top, zoneTop: z.bounds.top, bottom: gate.rectBottom.bottom, zoneBottom: z.bounds.bottom,
      gap: gate.rectBottom.top - gate.rectTop.bottom, expectedGap: gate.size };
  });
  expect(state.after).toEqual(state.before); expect(state.finalHearts).toBe(state.hearts);
  expect(state.hearts).toBe(2); expect(state.top).toBe(state.zoneTop); expect(state.bottom).toBe(state.zoneBottom);
  expect(state.gap).toBeCloseTo(state.expectedGap);
  expect(errors).toEqual([]);
});

test('aimed projectiles travel toward vertical and diagonal targets at a constant speed', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const shots = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    return [[100, 40, 100, 200], [100, 40, 220, 160], [200, 40, 80, 40]].map(args => {
      s.spawnBolt(...args); const body = s.bossBolts.at(-1).sprite.body;
      return { x: body.velocity.x, y: body.velocity.y, speed: body.velocity.length() };
    });
  });
  expect(shots[0].x).toBeCloseTo(0); expect(shots[0].y).toBeCloseTo(120);
  expect(shots[1].x).toBeCloseTo(shots[1].y); expect(shots[2].x).toBeCloseTo(-120);
  for (const shot of shots) expect(shot.speed).toBeCloseTo(120);
  expect(errors).toEqual([]);
});

test('boss gusts emit one three-shot volley and resets cancel queued attacks', async ({ page }) => {
  const errors = await boot(page); await start(page, 9);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    s.boss.pendingAttack = 'gust'; s.boss.launchAttack(s.player.now, s.player);
  });
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').bossBolts.length)).toBe(3);
  const restored = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), b = s.boss;
    s.barrageBarrels = 0; s.events.on('boss-barrel', () => s.barrageBarrels++);
    b.pendingAttack = 'barrels'; b.launchAttack(s.player.now, s.player); b.resetEncounter();
    b.hp = 4; b.phase = 1; b.resetEncounter();
    return { phase: b.phase, hits: b.hitsThisPhase, timers: b.encounterTimers.length };
  });
  expect(restored).toEqual({ phase: 2, hits: 0, timers: 0 });
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').barrageBarrels)).toBe(0);
  expect(errors).toEqual([]);
});

test('HUD wrapping is unchanged on steady frames and resizes once with the viewport', async ({ page }) => {
  const errors = await boot(page); await start(page);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    const text = s.hud.toastText, original = text.updateText;
    s.toastRedraws = 0;
    // Count real canvas updates without changing their behavior.
    text.updateText = function (...args: any[]) { s.toastRedraws++; return original.apply(this, args); };
  });
  const initial = await page.evaluate(() => (window as any).__game.scene.getScene('Game').hud.layoutWidth);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').toastRedraws)).toBe(0);
  await page.setViewportSize({ width: 1600, height: 720 });
  await page.waitForFunction(width => (window as any).__game.scene.getScene('Game').hud.layoutWidth > width, initial);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').toastRedraws)).toBe(1);
  expect(errors).toEqual([]);
});

test('the newest save copy wins and old saves receive conservative stamp defaults', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const data = (window as any).__game.registry.get('saves').get();
    const older = { ...data, revision: 10, bonusBest: 12 };
    const newer = { ...data, revision: 11, bonusBest: 99 };
    localStorage.setItem('barrelwing.save.v1', JSON.stringify(older));
    localStorage.setItem('barrelwing.save.v1.backup', JSON.stringify(newer));
  });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().bonusBest)).toBe(99);
  await start(page);
  await page.evaluate(() => {
    const game = (window as any).__game, saves = game.registry.get('saves');
    game.scene.stop('Game');
    const data = saves.get(); delete data.revision; delete data.run.deaths; delete data.run.damageTaken;
    for (const level of Object.values(data.levels) as any[]) delete level.mastery;
    localStorage.setItem('barrelwing.save.v1', JSON.stringify(data)); localStorage.removeItem('barrelwing.save.v1.backup');
  });
  await page.reload(); await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  expect(await page.evaluate(() => {
    const saves = (window as any).__game.registry.get('saves');
    return { mastery: saves.get().levels[1].mastery, deaths: saves.get().run.deaths, damage: saves.get().run.damageTaken };
  })).toEqual({ mastery: { collector: false, express: false, untouched: false }, deaths: 1, damage: 1 });
  expect(errors).toEqual([]);
});

test('ground enemies turn at ledges and hoppers warn before leaving the ground', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const state = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    const slug = s.enemies.getChildren().find((e: any) => e.kind === 'slug');
    slug.body.reset(26 * 16 - 7, 256); slug.body.updateFromGameObject();
    slug.anchorX = slug.x; slug.dir = 1; slug.nextEdgeCheck = 0; slug.body.blocked.down = true;
    slug.updateAI(s.player.now, 0.016, s.player);
    const turned = slug.body.velocity.x < 0;
    const hopper = s.enemies.getChildren().find((e: any) => e.kind === 'hopper');
    hopper.body.blocked.down = true; hopper.body.setVelocity(0, 0); hopper.timer = 1.2;
    const now = s.player.now;
    hopper.updateAI(now, 0.016, s.player);
    const warned = hopper.hopAt > now && hopper.body.velocity.y === 0;
    hopper.updateAI(now + 120, 0.016, s.player);
    const stillGrounded = hopper.body.velocity.y === 0;
    hopper.updateAI(now + 250, 0.016, s.player);
    return { turned, warned, stillGrounded, jumped: hopper.body.velocity.y < 0 };
  });
  expect(state).toEqual({ turned: true, warned: true, stillGrounded: true, jumped: true });
  expect(errors).toEqual([]);
});

test('flying enemies cross terrain instead of getting stuck on its collision bodies', async ({ page }) => {
  const errors = await boot(page); await start(page);
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game');
    const bee = s.enemies.getChildren().find((e: any) => e.kind === 'bee');
    bee.anchorX = 160; bee.anchorY = 320; bee.patrolPx = 0; bee.ampPx = 0;
    bee.body.reset(160, 240); bee.body.updateFromGameObject();
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').enemies.getChildren().find((e: any) => e.kind === 'bee').y > 265);
  expect(errors).toEqual([]);
});

test('simultaneous pickups all register and dead players cannot trigger stage interactions', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const state = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), p = s.player;
    for (const pickup of [...s.coins.getChildren().slice(0, 3), ...s.gems.getChildren()]) pickup.setPosition(p.x, p.y - 12);
    s.updatePickups(16);
    const coins = s.coinsCollected, gems = [...s.gemsCollected];
    s.killPlayer(true);
    const checkpoint = s.checkpoints.getChildren()[0], enemy = s.enemies.getChildren()[0];
    const hp = enemy.hp;
    p.dashUntil = p.now + 100; s.enemyContact(enemy); s.checkpointContact(checkpoint); s.springContact(s.springs.getChildren()[0]);
    return { coins, gems, hp, enemyHp: enemy.hp, hearts: p.hearts, checkpoint: !!checkpoint.getData('active'), vy: p.body.velocity.y };
  });
  expect(state).toMatchObject({ coins: 3, gems: [true, true, true], hearts: 0, checkpoint: false, vy: -170 });
  expect(state.enemyHp).toBe(state.hp);
  expect(errors).toEqual([]);
});

test('campaign side bounds stop players running out of the authored world', async ({ page }) => {
  const errors = await boot(page); await start(page);
  await page.keyboard.down('a'); await page.waitForTimeout(700); await page.keyboard.up('a');
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.body.left)).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('Windward Gauntlet final gem is inside flight bounds and retains its save identity', async ({ page }) => {
  const errors = await boot(page); await start(page, 10);
  const state = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), z = s.flightZones[0];
    const gem = s.gems.getChildren().find((g: any) => g.getData('gemIndex') === 2);
    const id = gem.getData('objectId');
    s.player.setFlightBounds(z.bounds); s.player.setPosition(gem.x, gem.y + 12);
    s.updatePickups(16);
    return { collected: s.gemsCollected[2], id, saved: s.collected.has(id) };
  });
  expect(state).toEqual({ collected: true, id: 79742306, saved: true });
  expect(errors).toEqual([]);
});

test('stepping off a ladder summit gives a full ground jump and fresh air flaps', async ({ page }) => {
  const errors = await boot(page); await start(page, 2);
  await page.keyboard.down('w');
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), p = s.player, ladder = s.ladderRects[0];
    p.body.reset(ladder.centerX, ladder.top + 5); p.body.updateFromGameObject();
    p.mode = 'climb'; p.climbRect = ladder; p.lastGroundedAt = -9999; p.flapCharges = 0;
    p.updatePlayer(16, s.inputMgr, s.ladderRects);
  });
  await page.keyboard.down('Space');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').player.body.velocity.y < -250);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.flapCharges)).toBe(2);
  await page.keyboard.up('Space');
  await page.keyboard.up('w');
  expect(errors).toEqual([]);
});
