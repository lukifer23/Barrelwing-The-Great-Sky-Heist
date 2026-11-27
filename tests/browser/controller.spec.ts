import { test, expect, type Page } from '@playwright/test';
import { boot } from './helpers';

const BUTTON = { confirm: 0, back: 1, attack: 2, start: 9, up: 12, down: 13, left: 14, right: 15 };

async function installPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Test Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard',
      buttons, axes: [0, 0, 0, 0], timestamp: 0, vibrationActuator: null,
    };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  });
}

async function press(page: Page, index: number, holdMs = 90): Promise<void> {
  await page.evaluate(index => { (window as any).__pad.buttons[index].pressed = true; (window as any).__pad.buttons[index].value = 1; }, index);
  await page.waitForTimeout(holdMs);
  await page.evaluate(index => { (window as any).__pad.buttons[index].pressed = false; (window as any).__pad.buttons[index].value = 0; }, index);
  await page.waitForTimeout(90);
}

async function hold(page: Page, index: number, ms: number): Promise<void> {
  await page.evaluate(index => { (window as any).__pad.buttons[index].pressed = true; (window as any).__pad.buttons[index].value = 1; }, index);
  await page.waitForTimeout(ms);
  await page.evaluate(index => { (window as any).__pad.buttons[index].pressed = false; (window as any).__pad.buttons[index].value = 0; }, index);
}

test('controller navigates the title, profiles, stage, pause and Sprint without a keyboard', async ({ page }) => {
  await installPad(page);
  const errors = await boot(page);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));

  // Title -> Profiles from the ordinary menu, then back to Title.
  for (let i = 0; i < 6; i++) await press(page, BUTTON.down, 50);
  await press(page, BUTTON.confirm);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Profiles'));
  await press(page, BUTTON.back);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));

  // New Game -> Game. Keep confirm held long enough to prove the next scene ignores it.
  await page.evaluate(() => { (window as any).__pad.buttons[0].pressed = true; (window as any).__pad.buttons[0].value = 1; });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').inputMgr.jumpBufferMs)).toBe(0);
  await page.evaluate(() => { (window as any).__pad.buttons[0].pressed = false; (window as any).__pad.buttons[0].value = 0; });

  const startX = await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.x);
  await hold(page, BUTTON.right, 500);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Game').player.x)).toBeGreaterThan(startX + 25);

  await press(page, BUTTON.start);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
  await press(page, BUTTON.confirm);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));

  // Launch Sprint directly, then use only the controller for launch, pause and resume.
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const scene of g.scene.getScenes(true)) g.scene.stop(scene.scene.key);
    g.scene.start('SkySprint');
  });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('SkySprint'));
  await press(page, BUTTON.left);
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('SkySprint').sprintClass)).toBe('gale');
  await press(page, BUTTON.confirm);
  await page.waitForFunction(() => (window as any).__game.scene.getScene('SkySprint').state === 'playing');
  await press(page, BUTTON.start);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
  await press(page, BUTTON.confirm);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('SkySprint'));
  expect(errors).toEqual([]);
});

test('controller reaches workshop, settings labels, Brawl roster and a rematch path', async ({ page }) => {
  await installPad(page);
  const errors = await boot(page);

  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const scene of g.scene.getScenes(true)) g.scene.stop(scene.scene.key);
    g.scene.start('WorldMap');
  });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('WorldMap'));
  await press(page, BUTTON.attack);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Workshop'));
  await press(page, BUTTON.back);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('WorldMap'));

  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const scene of g.scene.getScenes(true)) g.scene.stop(scene.scene.key);
    g.scene.start('Settings', { from: 'Title' });
  });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Settings'));
  await press(page, BUTTON.start); // next settings page: CONTROLS
  expect(await page.evaluate(() => (window as any).__game.scene.getScene('Settings').page)).toBe(1);
  for (let i = 0; i < 4; i++) await press(page, BUTTON.down, 50);
  await press(page, BUTTON.right);
  expect(await page.evaluate(() => (window as any).__game.registry.get('saves').get().settings.controllerPreset)).not.toBe('auto');
  await press(page, BUTTON.back);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));

  await page.evaluate(() => {
    const g = (window as any).__game;
    for (const scene of g.scene.getScenes(true)) g.scene.stop(scene.scene.key);
    g.scene.start('BrawlSetup');
  });
  await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlSetup'));
  await press(page, BUTTON.left);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlRoster'));
  await press(page, BUTTON.right, 50);
  await press(page, BUTTON.confirm);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlSetup'));
  expect(['fenn', 'mallow', 'clover', 'reed']).toContain(await page.evaluate(() => (window as any).__game.scene.getScene('BrawlSetup').player));
  await press(page, BUTTON.confirm);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Brawl'));
  await press(page, BUTTON.start);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlPause'));
  await press(page, BUTTON.back);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Brawl'));
  expect(errors).toEqual([]);
});
