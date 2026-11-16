import type { Page } from '@playwright/test';

export async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game?.scene.isActive('Title'));
  return errors;
}

export async function start(page: Page, id = 1) {
  await page.evaluate(id => {
    const game = (window as any).__game;
    for (const scene of game.scene.getScenes(true)) game.scene.stop(scene.scene.key);
    game.scene.start('Game', { levelId: id });
  }, id);
  await page.waitForFunction(id => {
    const scene = (window as any).__game.scene.getScene('Game');
    return scene.scene.isActive() && scene.level.id === id && !!scene.inputMgr;
  }, id);
}
