import { test, expect, type Page } from '@playwright/test';
import { boot, start } from './helpers';

async function choose(page: Page, sceneKey: string, label: string) {
  // Scene activation precedes its first visible frame and input-list update.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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

test('a delayed campaign frame advances fixed-step physics with the gameplay clock', async ({ page }) => {
  const errors = await boot(page); await start(page);
  const sample = await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('Game'), world = scene.physics.world;
    let seconds = 0;
    const count = (step: number) => { seconds += step; };
    world.on('worldstep', count);
    const before = scene.player.now;
    scene.sys.step(performance.now(), 500);
    world.off('worldstep', count);
    return { physicsMs: seconds * 1000, clockMs: scene.player.now - before };
  });
  expect(sample.clockMs).toBeCloseTo(48);
  expect(Math.abs(sample.physicsMs - sample.clockMs)).toBeLessThan(1000 / 60);
  expect(errors).toEqual([]);
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
    s.parries = 0;
    s.events.on('brawl-parry', (f: any) => {
      if (f !== s.human) return;
      s.parries++;
      s.counterWindow = !f.guarding && s.cpu.stunned && f.dashProgress < 1;
    });
  });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').cpu.windingUp);
  await page.keyboard.press('j');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').parries === 1);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Brawl').counterWindow)).toBe(true);
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
  const canvas = (await page.locator('canvas').boundingBox())!;
  expect(Math.abs(canvas.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(canvas.y + canvas.height - 840)).toBeLessThanOrEqual(1);
  const stick = (await page.locator('#joystick').boundingBox())!;
  expect(stick.y + stick.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  await page.setViewportSize({ width: 840, height: 360 });
  await page.waitForFunction(() => !(window as any).__game.scene.getScene('Game').hud.compact);
  expect(errors).toEqual([]); await context.close();
});

test('holding climb ascends the stacked Skyhook ladders and the Return to Pressure conveyor landing', async ({ page }) => {
  const errors = await boot(page);
  for (const route of [{ id: 8, col: 12, row: 20, target: 4 }, { id: 14, col: 10, row: 50, target: 40 }]) {
    await start(page, route.id);
    await page.evaluate(({ col, row }) => {
      const scene = (window as any).__game.scene.getScene('Game');
      scene.player.body.reset((col + 0.5) * scene.level.tile, row * scene.level.tile);
    }, route);
    await page.keyboard.down('w');
    await page.waitForFunction(row => {
      const s = (window as any).__game.scene.getScene('Game');
      return s.player.y <= row * s.level.tile + 7;
    }, route.target, { timeout: 10000 });
    await page.keyboard.up('w');
  }
  expect(errors).toEqual([]);
});

test('Brawl roster picks survive reload and reach a live match independently of the campaign courier', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 411, height: 960 } });
  const page = await context.newPage(); const errors = await boot(page);
  await choose(page, 'Title', 'BARREL BRAWL'); await active(page, 'BrawlSetup');
  const tapCard = async (scene: string, field: string, value: string) => {
    const point = await page.evaluate(({ scene, field, value }) => {
      const g = (window as any).__game, s = g.scene.getScene(scene);
      const obj = s.children.list.find((o: any) => o.getData(field) === value);
      const b = obj.getBounds(), canvas = g.canvas.getBoundingClientRect();
      return { x: canvas.x + b.centerX * canvas.width / g.scale.width, y: canvas.y + b.centerY * canvas.height / g.scale.height };
    }, { scene, field, value });
    await page.touchscreen.tap(point.x, point.y);
  };
  await tapCard('BrawlSetup', 'side', 'player'); await active(page, 'BrawlRoster');
  await tapCard('BrawlRoster', 'fighter', 'clover');
  await page.waitForFunction(() => {
    const s = (window as any).__game.scene.getScene('BrawlRoster');
    return s.swipe.visible && s.swipe.texture.key === 'slash-upward';
  });
  await choose(page, 'BrawlRoster', 'PICK CLOVER');
  await active(page, 'BrawlSetup'); await page.keyboard.press('ArrowRight'); await active(page, 'BrawlRoster');
  const selected = () => page.evaluate(() => (window as any).__game.scene.getScene('BrawlRoster').selected);
  expect(await selected()).toBe('fenn');
  await page.keyboard.press('ArrowRight'); expect(await selected()).toBe('mallow');
  await page.keyboard.press('Enter'); await active(page, 'BrawlSetup');
  const preset = () => page.evaluate(() => (window as any).__game.registry.get('saves').get().brawlPreset);
  expect(await preset()).toMatchObject({ player: 'clover', cpu: 'mallow' });
  await page.reload(); await active(page, 'Title'); await choose(page, 'Title', 'BARREL BRAWL'); await active(page, 'BrawlSetup');
  expect(await preset()).toMatchObject({ player: 'clover', cpu: 'mallow' });
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('BrawlSetup').cpu)).toBe('mallow');
  await choose(page, 'BrawlSetup', 'START MATCH'); await active(page, 'Brawl');
  const fighters = await page.evaluate(() => {
    const g = (window as any).__game, s = g.scene.getScene('Brawl');
    return [s.human.id, s.cpu.id, g.registry.get('saves').get().selectedCharacter, s.cpu.teamMarker.text];
  });
  expect(fighters).toEqual(['clover', 'mallow', 'pip', 'CPU']);
  await page.waitForFunction(() => {
    const s = (window as any).__game.scene.getScene('Brawl'), c = s.cameras.main;
    return c.zoom > 1.35 && Math.abs(s.hud.scaleX * c.zoom - 1) < 0.001 &&
      c.worldView.contains(s.human.x, s.human.y) && c.worldView.contains(s.cpu.x, s.cpu.y);
  });
  await page.evaluate(() => (window as any).__game.registry.get('saves').patchSettings({ reducedMotion: true }));
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').cameras.main.zoom === 1);
  expect(errors).toEqual([]); await context.close();
});

test('Clover rebounds on an actual downward aerial hit and displays the directional strike', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__game; g.scene.stop('Title');
    g.scene.start('Brawl', { arena: 'forest', difficulty: 'easy', player: 'clover', cpu: 'mallow' });
  });
  await active(page, 'Brawl');
  await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl'); s.startAt = 0;
    s.cpu.body.reset(s.W * 0.5, s.floor); s.human.body.reset(s.W * 0.5, s.floor - 48);
    s.cpu.invulnerableUntil = 0; s.nextThink = Infinity;
    s.events.once('brawl-hit', () => { s.contact = [s.cpu.damage, s.human.body.velocity.y, s.human.swingArt.texture.key, s.human.swingArt.visible]; });
  });
  await page.keyboard.down('s'); await page.keyboard.press('k');
  await page.waitForFunction(() => !!(window as any).__game.scene.getScene('Brawl').contact);
  const [damage, rise, art, visible] = await page.evaluate(() => (window as any).__game.scene.getScene('Brawl').contact);
  expect(damage).toBe(9); expect(rise).toBeLessThan(-200); expect(art).toBe('slash-upward'); expect(visible).toBe(true);
  await page.keyboard.up('s'); expect(errors).toEqual([]);
});

test('Reed carries an air dash refund into campaign play and a kick refund into Brawl', async ({ page }) => {
  const errors = await boot(page);
  await choose(page, 'Title', 'COURIERS');
  await choose(page, 'Characters', 'REED  /  MARSH RUNNER');
  await page.keyboard.press('Escape');
  await choose(page, 'Title', 'NEW GAME'); await active(page, 'Game');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').player.grounded);
  const charges = () => page.evaluate(() => (window as any).__game.scene.getScene('Game').player.flapCharges);
  await page.keyboard.down('Space'); await page.waitForTimeout(140); await page.keyboard.up('Space');
  await page.keyboard.press('Space'); await expect.poll(charges).toBe(1);
  await page.keyboard.press('j'); await expect.poll(charges).toBe(2);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.characterId)).toBe('reed');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.scene.stop('Game'); g.scene.start('Brawl', { player: 'reed', cpu: 'pip' });
  });
  await active(page, 'Brawl');
  const chargesAfterHits = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Brawl'), r = s.human;
    r.body.reset(160, 80); r.airJumps = 0; r.attackAim = 0;
    r.landStrike(s.cpu, false);
    const first = r.airJumps;
    r.landStrike(s.cpu, false);
    const second = r.airJumps;
    r.respawn(160, 80); r.airJumps = 0;
    r.landStrike(s.cpu, false);
    return [first, second, r.airJumps];
  });
  expect(chargesAfterHits).toEqual([1, 1, 1]);
  expect(errors).toEqual([]);
});

test('Storm Coat respects hazard timing, shield priority, respawn and active-time expiry', async ({ page }) => {
  const errors = await boot(page);
  for (const id of [4, 17]) {
    await start(page, id);
    const state = await page.evaluate(id => {
      const s = (window as any).__game.scene.getScene('Game'), p = s.player;
      const item = s.powerups.find((o: any) => o.getData('kind') === 'stormcoat');
      p.body.reset(item.x, item.y + 12); s.updatePickups(16);
      const duration = p.stormcoatUntil - p.now;
      const h = s.weatherHazards.find((hazard: any) => hazard.kind === (id === 4 ? 'steam' : 'lightning'));
      const damageAt = h.period * 0.3 - h.phase * 1000;
      p.body.reset(h.bounds.centerX, h.bounds.centerY + 12); p.body.updateFromGameObject(); p.invulnUntil = 0; p.activateShield();
      s.updateHazards(damageAt);
      const protectedHit = [p.hearts, p.shield, s.damageTaken];
      const visibleArea = h.spray.visible && h.spray.displayWidth === h.bounds.width && h.spray.displayHeight === h.bounds.height;
      const nextDischarge = damageAt + Math.ceil((p.stormcoatUntil - damageAt) / h.period) * h.period;
      s.updateHazards(nextDischarge);
      const expiredHit = [p.hearts, p.shield, s.damageTaken];
      p.invulnUntil = 0; s.updateHazards(nextDischarge);
      const unprotectedHit = [p.hearts, s.damageTaken];
      p.stormcoatUntil = p.now + duration; p.respawnAt(s.checkpoint.x, s.checkpoint.y);
      return { duration, visibleArea, protectedHit, expiredHit, unprotectedHit, reset: p.stormcoatUntil };
    }, id);
    expect(state).toEqual({ duration: 6000, visibleArea: true, protectedHit: [3, true, 0], expiredHit: [3, false, 0], unprotectedHit: [2, 1], reset: 0 });
  }
  expect(errors).toEqual([]);
});

test('a lane drake locks its heading through wind-up and a hit interrupts its charge', async ({ page }) => {
  const errors = await boot(page); await start(page, 18);
  const flight = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('Game'), p = s.player;
    const drake = s.enemies.getChildren().find((e: any) => e.kind === 'drake'), now = p.now;
    p.body.reset(drake.x + 90, drake.body.center.y + 12);
    drake.updateAI(now, 0.016, p);
    const warned = drake.anims.isPaused && drake.body.speed === 0;
    p.body.reset(drake.x - 90, p.y);
    drake.updateAI(now + 549, 0.016, p);
    const waiting = drake.body.velocity.x;
    drake.updateAI(now + 550, 0.016, p);
    const charge = drake.body.velocity.x;
    drake.damage(1, p.x);
    return { warned, waiting, charge, state: drake.aiState, hp: drake.hp, movingWings: !drake.anims.isPaused };
  });
  expect(flight).toEqual({ warned: true, waiting: 0, charge: 216, state: 'patrol', hp: 1, movingWings: true });
  expect(errors).toEqual([]);
});

test('Gale selection, gate spacing on resize and a one-hit result preserve separate Sprint records', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.registry.get('saves').setBonusBest(1234);
    g.scene.stop('Title'); g.scene.start('SkySprint');
  });
  await active(page, 'SkySprint');
  const mode = () => page.evaluate(() => (window as any).__game.scene.getScene('SkySprint').sprintClass);
  await page.keyboard.press('ArrowRight'); await expect.poll(mode).toBe('gale');
  const button = await page.evaluate(() => {
    const g = (window as any).__game, b = g.scene.getScene('SkySprint').readySub.getBounds(), c = g.canvas.getBoundingClientRect();
    return { x: c.x + b.centerX * c.width / g.scale.width, y: c.y + b.centerY * c.height / g.scale.height };
  });
  await page.mouse.click(button.x, button.y); await expect.poll(mode).toBe('classic');
  await page.mouse.click(button.x, button.y); await expect.poll(mode).toBe('gale');
  await page.keyboard.press('Space');
  await page.setViewportSize({ width: 1800, height: 500 });
  await page.waitForFunction(() => (window as any).__game.scene.getScene('SkySprint').gates.length >= 3);
  await page.setViewportSize({ width: 800, height: 600 });
  const gates = await page.evaluate(() => {
    const s = (window as any).__game.scene.getScene('SkySprint');
    return { hearts: s.player.hearts, narrow: s.gates.every((g: any) => g.gapH >= 50 && g.gapH <= 62),
      spaced: s.gates.every((g: any, i: number) => i === 0 || g.x - s.gates[i - 1].x >= 145) };
  });
  expect(gates).toEqual({ hearts: 1, narrow: true, spaced: true });
  await page.waitForFunction(() => !!(window as any).__game.scene.getScene('SkySprint').overMenu);
  const records = await page.evaluate(() => {
    const g = (window as any).__game, { bonusBest, galeBest } = g.registry.get('saves').get();
    return { bonusBest, galeBest, score: g.scene.getScene('SkySprint').score };
  });
  expect(records.galeBest).toBeGreaterThan(0); expect(records.galeBest).toBe(records.score); expect(records.bonusBest).toBe(1234);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('SkySprint').state === 'ready');
  expect(await mode()).toBe('gale');
  await page.reload(); await active(page, 'Title');
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().galeBest)).toBe(records.score);
  expect(errors).toEqual([]);
});

test('moving and falling planks preserve their collision surfaces through travel and recovery', async ({ page }) => {
  const errors = await boot(page);
  await start(page, 18);
  await page.waitForFunction(() => {
    const m = (window as any).__game.scene.getScene('Game').movers[0];
    return Math.abs(m.x - m.startX) > 8;
  });
  const surfaces = await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('Game'), mover = scene.movers[0], plank = scene.fallingPlats[0];
    const aligned = () => Math.abs(mover.body.top - (mover.y - mover.height / 2 + 2)) < 0.01
      && Math.abs(mover.body.left - (mover.x - mover.width / 2)) < 0.01 && mover.body.height === 14;
    const traveled = aligned();
    scene.clearTransient();
    return { traveled, reset: aligned() && mover.x === mover.startX,
      falling: plank.body.height === 12 && plank.body.enable && !plank.used };
  });
  expect(surfaces).toEqual({ traveled: true, reset: true, falling: true });
  expect(errors).toEqual([]);
});
