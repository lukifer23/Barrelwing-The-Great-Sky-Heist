import { _android, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { delay, option } from './browser-harness';

const pkg = 'com.barrelwing.skyheist';
const devices = await _android.devices({ omitDriverInstall: true });
const device = process.env.ANDROID_SERIAL ? devices.find(d => d.serial() === process.env.ANDROID_SERIAL) : devices.length === 1 ? devices[0] : undefined;
if (!device) throw new Error('Connect one authorized device, or set ANDROID_SERIAL.');
const directory = option('out', `artifacts/device/${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(directory, { recursive: true });
const command = (...args: string[]) => execFileSync('adb', ['-s', device.serial(), ...args], { timeout: 20000, maxBuffer: 25000000 });
const gameInFront = () => command('shell', 'dumpsys', 'activity', 'activities').toString().split('\n')
  .some(line => line.includes('topResumedActivity=') && line.includes(pkg + '/'));
const adb = (...args: string[]) => {
  if (args[0] === 'shell' && args[1] === 'input' && !gameInFront()) throw new Error('The game lost foreground before the gesture.');
  return command(...args);
};
const results: { check: string; details?: unknown }[] = [];
const errors: string[] = [];
const unfolded = option('unfolded', 'false') === 'true';
const recordMatch = option('video', 'false') === 'true';
const deviceState = () => command('shell', 'dumpsys', 'device_state').toString().split('\n')
  .find(line => line.includes('mBaseState='))?.match(/name='([^']+)'/)?.[1];
const sampleSeconds = Number(option('sample-seconds', '0'));
if (!Number.isFinite(sampleSeconds) || sampleSeconds < 0) throw new Error('Use a non-negative sample duration.');
let page: Page;
let original: any;
let restored = false;
const check = (condition: unknown, label: string, details?: unknown) => {
  if (!condition) throw new Error(`${label}: ${JSON.stringify(details)}`);
  results.push({ check: label, details }); console.log(`PASS ${label}`);
};
async function attach() {
  const pid = adb('shell', 'pidof', pkg).toString().trim();
  if (!/^\d+$/.test(pid)) throw new Error('The game has no single running process.');
  // Playwright prioritizes pkg over socketName when both are supplied. Select
  // the current process socket so force-stop cannot return a cached old page.
  page = await (await device.webView({ socketName: `webview_devtools_remote_${pid}` })).page();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !!(window as any).__game?.registry.get('saves'));
}
async function screenshot(name: string) {
  if (!gameInFront()) throw new Error('The game lost foreground before the display capture.');
  const displays = adb('shell', 'dumpsys', 'display').toString().split('\n');
  const active = displays.find(line => line.includes('DisplayDeviceInfo{') && line.includes(', state ON,'));
  const id = active?.match(/uniqueId="local:(\d+)"/)?.[1];
  if (!id) throw new Error('Cannot identify the active physical display for evidence.');
  const bytes = adb('exec-out', 'screencap', '-p', '-d', id);
  const start = bytes.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (start < 0) throw new Error('Physical display capture returned no PNG.');
  await writeFile(`${directory}/${name}.png`, bytes.subarray(start));
}
async function tapCss(x: number, y: number) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  adb('shell', 'input', 'tap', String(Math.round(x * dpr)), String(Math.round(y * dpr)));
}
async function tapText(sceneKey: string, label: string) {
  await delay(100);
  const point = await page.evaluate(({ sceneKey, label }) => {
    const game = (window as any).__game, scene = game.scene.getScene(sceneKey);
    const objects = [...scene.children.list];
    for (let i = 0; i < objects.length; i++) if (objects[i].list) objects.push(...objects[i].list);
    const text = objects.find(o => o.type === 'Text' && o.text.startsWith(label) && o.input?.enabled);
    if (!text) throw new Error(`No interactive ${label} in ${sceneKey}`);
    const bounds = text.getBounds(), canvas = game.canvas.getBoundingClientRect();
    return { x: canvas.x + bounds.centerX * canvas.width / game.scale.width, y: canvas.y + bounds.centerY * canvas.height / game.scale.height };
  }, { sceneKey, label });
  await tapCss(point.x, point.y);
}
async function tapCard(sceneKey: string, field: string, value: string) {
  await delay(100);
  const point = await page.evaluate(({ sceneKey, field, value }) => {
    const game = (window as any).__game, scene = game.scene.getScene(sceneKey);
    const card = scene.children.list.find((o: any) => o.input?.enabled && o.getData(field) === value);
    const b = card.getBounds(), canvas = game.canvas.getBoundingClientRect();
    return { x: canvas.left + b.centerX * canvas.width / game.scale.width, y: canvas.top + b.centerY * canvas.height / game.scale.height };
  }, { sceneKey, field, value });
  await tapCss(point.x, point.y);
}
async function tapDom(selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  if (!bounds) throw new Error(`${selector} is not visible.`);
  await tapCss(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
async function state() {
  return page.evaluate(() => {
    const game = (window as any).__game, scene = game.scene.getScene('Game'), p = scene.player;
    return { active: game.scene.isActive('Game'), paused: game.scene.isPaused('Game'), pauseMenu: game.scene.isActive('Pause'),
      level: scene.level.id, x: p.x, y: p.y, now: p.now, elapsedMs: scene.elapsedMs, lives: scene.lives, hearts: p.hearts,
      coins: scene.coinsCollected, score: scene.score, gems: [...scene.gemsCollected], checkpoint: { ...scene.checkpoint } };
  });
}
async function diskCopies(filename: string, expected: unknown): Promise<boolean> {
  const xml = adb('exec-out', 'run-as', pkg, 'cat', 'shared_prefs/CapacitorStorage.xml');
  await writeFile(`${directory}/${filename}.xml`, xml);
  const copies = await page.evaluate(xml => {
    const prefs = new DOMParser().parseFromString(xml, 'application/xml');
    return ['barrelwing.save.v1', 'barrelwing.save.v1.backup'].map(key =>
      JSON.parse(prefs.querySelector(`string[name="${key}"]`)?.textContent ?? 'null'));
  }, xml.toString('utf8'));
  return copies.every(copy => isDeepStrictEqual(copy, expected));
}
async function checkControls(label: string) {
  const bounds = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#joystick, #touch-controls button, #audio-toggle')]
    .filter(o => o.offsetWidth > 0 && o.offsetHeight > 0).map(o => {
      const b = o.getBoundingClientRect();
      return { name: o.dataset.action || o.id, left: b.left, right: b.right, top: b.top, bottom: b.bottom,
        inside: b.left >= 0 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1 };
    }));
  const collisions = bounds.flatMap((a, i) => bounds.slice(i + 1).filter(b =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top).map(b => [a.name, b.name]));
  check(bounds.length > 2 && bounds.every(o => o.inside) && !collisions.length, label, { bounds, collisions });
}

async function unfoldedFlight() {
  // Load the authored flight trial at its normal spawn on the test device.
  // Use Android gestures for every movement, channel entry and flap.
  await page.evaluate(() => (window as any).__game.scene.getScene('Game').scene.restart({ levelId: 10 }));
  await page.waitForFunction(() => {
    const s = (window as any).__game.scene.getScene('Game'); return s.level.id === 10 && s.player.grounded;
  });
  const stick = await page.locator('#joystick').boundingBox();
  if (!stick) throw new Error('Flight test cannot find the joystick.');
  const dpr = await page.evaluate(() => devicePixelRatio);
  const x = String(Math.round((stick.x + stick.width * 0.83) * dpr)), y = String(Math.round((stick.y + stick.height / 2) * dpr));
  adb('shell', 'input', 'swipe', x, y, x, y, '2300');
  await page.waitForFunction(() => (window as any).__game.scene.getScene('Game').player.mode === 'flight');
  await page.evaluate(() => { const s = (window as any).__game.scene.getScene('Game'); s.events.once('player-flap', () => { s.registry.set('observedFlightFlap', s.player.body.velocity.y); }); });
  await tapDom('[data-action="jump"]');
  const rise = await page.waitForFunction(() => (window as any).__game.registry.get('observedFlightFlap') < 0);
  check(await rise.jsonValue(), 'Inner-display joystick enters the flight channel and FLAP produces upward velocity');
  await checkControls('Flight controls fit the inner display without overlap');
  await screenshot('unfolded-flight');
}
async function flush() { await page.evaluate(async () => { await (window as any).__game.registry.get('saves').flush(); }); }
try {
  if (unfolded) check(deviceState() === 'OPENED', 'Fold7 begins physically unfolded', deviceState());
  adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
  await attach(); await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));
  original = await page.evaluate(() => structuredClone((window as any).__game.registry.get('saves').get()));
  await writeFile(`${directory}/save-before.json`, JSON.stringify(original, null, 2));
  await screenshot('title');
  let run = original.run;
  if (!run) {
    // A player between stages has no active run. Open the selected unlocked
    // stage normally and leave via Pause to exercise its real checkpoint.
    await tapText('Title', 'LEVEL SELECT');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('WorldMap'));
    adb('shell', 'input', 'keyevent', '66');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
    await tapDom('[data-action="pause"]');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
    await tapText('Pause', 'RETURN TO TITLE');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));
    await flush();
    run = await page.evaluate(() => structuredClone((window as any).__game.registry.get('saves').get().run));
  }
  check(!!run, 'A campaign checkpoint is available for ordinary Continue', { level: run?.levelId, existing: !!original.run });
  await tapText('Title', 'CONTINUE');
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  const resumed = await state();
  check(resumed.level === run.levelId && resumed.lives === run.lives && JSON.stringify(resumed.gems) === JSON.stringify(run.gems), 'Continue retains checkpoint, lives, and gems', resumed);
  check(Math.abs(resumed.x - run.checkpoint.x) < 2 && Math.abs(resumed.y - run.checkpoint.y) < 3, 'Continue places the courier on the saved checkpoint', resumed);
  await delay(350);
  const stick = await page.locator('#joystick').boundingBox();
  if (!stick) throw new Error('Native touch joystick is not visible.');
  const dpr = await page.evaluate(() => devicePixelRatio), sx = stick.x + stick.width / 2, sy = stick.y + stick.height / 2;
  const beforeMove = await state();
  adb('shell', 'input', 'swipe', String(Math.round(sx * dpr)), String(Math.round(sy * dpr)), String(Math.round((sx - stick.width * 0.32) * dpr)), String(Math.round(sy * dpr)), '400');
  const afterMove = await state();
  check(afterMove.x < beforeMove.x - 5, 'Physical Android joystick gesture moves the real courier', { before: beforeMove.x, after: afterMove.x });
  const jump = await page.locator('[data-action="jump"]').boundingBox();
  if (!jump) throw new Error('Native jump button is not visible.');
  const beforeJump = await state(), jx = String(Math.round((jump.x + jump.width / 2) * dpr)), jy = String(Math.round((jump.y + jump.height / 2) * dpr));
  adb('shell', 'input', 'swipe', jx, jy, jx, jy, '180');
  const afterJump = await state();
  check(afterJump.y < beforeJump.y - 8, 'Physical Android jump gesture raises the courier', { before: beforeJump.y, after: afterJump.y });
  await screenshot('native-touch-gameplay');
  adb('shell', 'input', 'keyevent', '4');
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
  const paused = await state(); await delay(1000); const stillPaused = await state();
  check(stillPaused.now === paused.now && stillPaused.elapsedMs === paused.elapsedMs, 'Android Back freezes gameplay time in Pause', { paused, after: stillPaused });
  await tapText('Pause', 'CONTROLS');
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Controls'));
  const outside = await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('Controls');
    return scene.children.list.filter((o: any) => o.type === 'Text').filter((o: any) => { const b = o.getBounds(); return b.left < 0 || b.top < 0 || b.right > scene.scale.width || b.bottom > scene.scale.height; }).map((o: any) => o.text);
  });
  check(outside.length === 0, 'Field guide text fits the physical-device viewport', outside);
  await screenshot('field-guide'); adb('shell', 'input', 'keyevent', '4');
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
  await tapDom('#audio-toggle'); await flush();
  const muted = await page.evaluate(() => ({ setting: (window as any).__game.registry.get('saves').get().settings.muted, manager: (window as any).__game.sound.mute }));
  check(muted.setting !== original.settings.muted && muted.manager === muted.setting, 'Native master mute updates saved settings and the sound manager', muted);
  await tapDom('#audio-toggle'); await flush();
  adb('shell', 'input', 'keyevent', '4'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  await page.evaluate(() => {
    const scene = (window as any).__game.scene.getScene('Game');
    scene.events.once('pause', () => scene.registry.set('homePauseSnapshot',
      { now: scene.player.now, elapsedMs: scene.elapsedMs, lives: scene.lives, score: scene.score }));
  });
  adb('shell', 'input', 'keyevent', '3'); await delay(1200);
  adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
  await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
  const afterHome = await state();
  const pausedAtHome = await page.evaluate(() => (window as any).__game.registry.get('homePauseSnapshot'));
  check(pausedAtHome && afterHome.now === pausedAtHome.now && afterHome.elapsedMs === pausedAtHome.elapsedMs &&
    afterHome.lives === pausedAtHome.lives && afterHome.score === pausedAtHome.score,
    'Background and foreground retain a paused session without consuming its clock', { pausedAtHome, afterHome });
  await flush();
  const durable = await page.evaluate(() => structuredClone((window as any).__game.registry.get('saves').get()));
  await writeFile(`${directory}/save-before-force-stop.json`, JSON.stringify(durable, null, 2));
  check(await diskCopies('native-before-force-stop', durable), 'Both Android save copies are on disk before force-stop');
  adb('shell', 'am', 'force-stop', pkg); await delay(350);
  adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
  await attach(); await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));
  const recovered = await page.evaluate(() => structuredClone((window as any).__game.registry.get('saves').get()));
  check(isDeepStrictEqual(recovered.run, durable.run), 'Force-stop recovery retains the flushed run snapshot', { revision: recovered.revision, level: recovered.run?.levelId });
  await tapText('Title', 'CONTINUE'); await page.waitForFunction(() => (window as any).__game.scene.isActive('Game'));
  const checkpoint = await state();
  check(checkpoint.level === durable.run.levelId && checkpoint.lives === durable.run.lives && Math.abs(checkpoint.x - durable.run.checkpoint.x) < 2, 'Continue after force-stop restores the actual checkpoint', checkpoint);
  await screenshot('force-stop-recovery');
  const cover = await page.evaluate(() => matchMedia('(pointer: coarse) and (orientation: portrait)').matches);
  if (unfolded) {
    await checkControls('Campaign controls fit the inner display without overlap');
    await unfoldedFlight();
  }
  if (cover && !unfolded) {
    await page.evaluate(() => (window as any).__game.registry.get('saves').patchSettings({ oneHanded: true }));
    await page.waitForSelector('#touch-controls.one-handed');
    const stick = (await page.locator('#joystick').boundingBox())!;
    const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
    const px = (v: number) => String(Math.round(v * dpr));
    adb('shell', 'input', 'swipe', px(x), px(y), px(x + stick.width * 0.31), px(y), '220');
    const latched = await state();
    await tapDom('[data-action="jump"]'); await delay(220);
    const airborne = await state();
    check(airborne.x > latched.x + 8 && airborne.y < latched.y - 4,
      'Folded one-thumb movement continues through a physical jump tap', { latched, airborne });
    await tapDom('[data-action="stop"]');
    await page.waitForFunction(() => document.querySelector('.stick-guide')?.textContent === 'MOVE');
    check(await page.locator('#joystick').evaluate(el => !el.classList.contains('held')), 'Physical STOP clears the folded movement latch');
    const extent = await page.evaluate(() => {
      const box = (window as any).__game.canvas.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, width: box.width, height: innerHeight };
    });
    check(Math.abs(extent.top) <= 1 && Math.abs(extent.bottom - extent.height) <= 1, 'Cover gameplay fills the physical WebView behind the controls', extent);
    await screenshot('cover-campaign');
  }
  if (sampleSeconds > 0) {
    await tapDom('[data-action="pause"]');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('Pause'));
    await tapText('Pause', 'RETURN TO TITLE');
    await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));
    const screen = unfolded ? 'unfolded' : cover ? 'cover' : 'device';
    await tapText('Title', 'BARREL BRAWL'); await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlSetup'));
    for (const [side, fighter] of [['player', 'clover'], ['cpu', 'mallow']]) {
      await tapCard('BrawlSetup', 'side', side);
      await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlRoster'));
      await tapCard('BrawlRoster', 'fighter', fighter);
      if (side === 'player') await screenshot(screen + '-roster');
      await tapText('BrawlRoster', 'PICK ' + fighter.toUpperCase());
      await page.waitForFunction(() => (window as any).__game.scene.isActive('BrawlSetup'));
    }
    const rules = unfolded ? 'stock' : 'timed';
    if (await page.evaluate(rules => (window as any).__game.scene.getScene('BrawlSetup').rules !== rules, rules)) await tapText('BrawlSetup', 'RULES');
    if (unfolded) {
      for (const [field, value, label] of [['arena', 'forest', 'ARENA'], ['difficulty', 'hard', 'CPU LEVEL']]) {
        for (let i = 0; i < 2 && await page.evaluate(([k,v]) => (window as any).__game.scene.getScene('BrawlSetup')[k] !== v, [field,value]); i++) await tapText('BrawlSetup', label);
      }
    }
    await screenshot(screen + '-brawl-setup');
    await tapText('BrawlSetup', original.brawlRun ? 'NEW MATCH' : 'START MATCH');
    await page.waitForFunction(() => (window as any).__game.scene.getScene('Brawl').elapsedMs > 0);
    // Keep listener setup and observation separate so a WebView error reaches
    // the outer restoration handler immediately.
    await page.evaluate(record => {
      const scene = (window as any).__game.scene.getScene('Brawl');
      if (record) {
        const stream: MediaStream = scene.game.canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 800000 });
        const parts: Blob[] = [];
        recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
        const video = new Promise<string>((resolve, reject) => {
          recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(new Blob(parts, { type: 'video/webm' }));
          };
        });
        scene.registry.set('deviceRecording', { recorder, video });
        recorder.start(1000);
      }
      const meter = { started: performance.now(), last: 0, intervals: [] as number[], swings: [0, 0], hits: [0, 0],
        collect() {
          if (!scene.scene.isActive() || scene.ended) return;
          const now = performance.now();
          meter.intervals.push(now - meter.last); meter.last = now;
        } };
      meter.last = meter.started;
      scene.registry.set('deviceFrameSample', meter);
      scene.game.events.on('poststep', meter.collect);
      const observer = {
        swing(f: any) { meter.swings[Number(f.isCpu)]++; },
        hit(f: any) { meter.hits[Number(!f.isCpu)]++; },
      };
      const { swing, hit } = observer;
      scene.events.on('brawl-swing', swing); scene.events.on('brawl-hit', hit);
      scene.events.once('shutdown', () => { scene.events.off('brawl-swing', swing); scene.events.off('brawl-hit', hit); });
    }, recordMatch);
    const picked = await page.evaluate(() => {
      const s = (window as any).__game.scene.getScene('Brawl'); return [s.human.id, s.cpu.id, s.options.rules, s.options.arena, s.options.difficulty];
    });
    check(isDeepStrictEqual(picked.slice(0, 3), ['clover', 'mallow', rules]) && (!unfolded || picked[3] === 'forest' && picked[4] === 'hard'),
      'Physical roster and rule choices reach the live match', picked);
    if (unfolded) {
      await checkControls('Brawl controls fit the inner display without overlap');
      const gap = await page.evaluate(() => {
        const g = (window as any).__game, s = g.scene.getScene('Brawl');
        const canvas = g.canvas.getBoundingClientRect(), pause = document.querySelector('[data-action="pause"]')!.getBoundingClientRect();
        const bottom = Math.max(s.humanHud.getBounds().bottom, s.cpuHud.getBounds().bottom);
        return pause.top - (canvas.top + bottom * canvas.height / g.scale.height);
      });
      check(gap >= 4, 'Pause clears both fighters’ stock and damage readouts', { gapCssPx: gap });
    }
    await screenshot(screen + '-brawl-live');
    const deadline = Date.now() + sampleSeconds * 1000;
    while (Date.now() < deadline && await page.locator('[data-action="attack"]').isVisible()) {
      if (unfolded) {
        const { move, holdMs, jump } = await page.evaluate(() => {
          const s = (window as any).__game.scene.getScene('Brawl');
          const p = s.human, c = s.cpu, base = s.plates[0].sprite;
          const left = base.x - base.width / 2, right = base.x + base.width / 2;
          const recovering = p.x < left + 15 || p.x > right - 15 || p.y > s.floor + 5;
          const target = recovering ? base.x : Math.min(right - 20, Math.max(left + 20, c.x));
          const dx = target - p.x, turn = Math.sign(c.x - p.x) !== p.facing;
          return { move: Math.abs(dx) > 36 || turn ? Math.sign(dx) : 0,
            holdMs: Math.round(Math.min(300, Math.max(65, (Math.abs(dx) - 26) * 5))),
            jump: recovering && p.body.velocity.y > -70 || p.grounded && c.y < p.y - 38 };
        });
        const stick = await page.locator('#joystick').boundingBox();
        if (stick && move) {
          const x = String(Math.round((stick.x + stick.width * (0.5 + move * 0.32)) * dpr));
          const y = String(Math.round((stick.y + stick.height / 2) * dpr));
          adb('shell', 'input', 'swipe', x, y, x, y, String(holdMs));
        }
        if (jump && await page.locator('[data-action="jump"]').isVisible()) await tapDom('[data-action="jump"]');
      }
      if (await page.locator('[data-action="attack"]').isVisible()) await tapDom('[data-action="attack"]');
      await delay(unfolded ? 150 : 1800);
    }
    if (recordMatch) {
      const video = await page.evaluate(async () => {
        const registry = (window as any).__game.registry, capture = registry.get('deviceRecording');
        capture.recorder.stop(); registry.remove('deviceRecording'); return await capture.video as string;
      });
      await writeFile(`${directory}/canopy-court.webm`, Buffer.from(video, 'base64'));
    }
    const stats = await page.evaluate(() => {
      const scene = (window as any).__game.scene.getScene('Brawl'), meter = scene.registry.get('deviceFrameSample');
      scene.game.events.off('poststep', meter.collect); scene.registry.remove('deviceFrameSample');
      const values: number[] = meter.intervals.sort((a: number, b: number) => a - b);
      return { seconds: (meter.last - meter.started) / 1000, frames: values.length,
        p50: values[Math.floor((values.length - 1) * 0.5)], p95: values[Math.floor((values.length - 1) * 0.95)],
        p99: values[Math.floor((values.length - 1) * 0.99)], over50ms: values.filter(t => t > 50).length,
        swings: meter.swings, hits: meter.hits,
        result: scene.game.scene.isActive('BrawlResults') ? scene.game.scene.getScene('BrawlResults').result : null,
        activeMatchAtEnd: scene.scene.isActive(), viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
    });
    await writeFile(`${directory}/frame-intervals.json`, JSON.stringify(stats, null, 2));
    if (gameInFront()) await screenshot(screen + '-brawl');
    if (unfolded) check(deviceState() === 'OPENED', 'Fold7 remains physically unfolded during the run', deviceState());
    check(stats.frames > 0 && stats.seconds > 0, 'Collected physical WebView frame intervals during live Brawl', stats);
  }
  check(errors.length === 0, 'Native smoke test has no JavaScript runtime errors', errors);
} catch (error) {
  errors.push(String(error)); console.error(error);
} finally {
  if (original) {
    try {
      if (!page || page.isClosed()) {
        adb('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`); await attach();
        await page.waitForFunction(() => (window as any).__game.scene.isActive('Title'));
      }
      await page.evaluate(async original => {
        const game = (window as any).__game, saves = game.registry.get('saves');
        const capture = game.registry.get('deviceRecording');
        if (capture?.recorder.state === 'recording') capture.recorder.stop();
        game.registry.remove('deviceRecording');
        for (const scene of game.scene.getScenes(false)) if (scene.scene.isActive() || scene.scene.isPaused()) game.scene.stop(scene.scene.key);
        const revision = saves.get().revision;
        Object.assign(saves.get(), original); saves.get().revision = revision;
        saves.save(); await saves.flush(); game.registry.get('audioRefresh')?.(); game.scene.start('Title');
      }, original);
      const after = await page.evaluate(() => structuredClone((window as any).__game.registry.get('saves').get()));
      const expected = { ...original, revision: after.revision };
      restored = isDeepStrictEqual(after, expected);
      await writeFile(`${directory}/save-restored.json`, JSON.stringify(after, null, 2));
      const diskRestored = await diskCopies('native-restored', expected);
      const nativeValue = await page.evaluate(async () => {
        const result = await (window as any).Capacitor.Plugins.Preferences.get({ key: 'barrelwing.save.v1' });
        return JSON.parse(result.value);
      });
      restored = restored && diskRestored && isDeepStrictEqual(nativeValue, expected);
      check(restored, 'Original user progress and settings are restored in memory and native storage');
    } catch (error) { errors.push(`Restoration: ${String(error)}`); }
  }
  await writeFile(`${directory}/device-smoke.json`, JSON.stringify({ results, errors, restored, completedAt: new Date().toISOString() }, null, 2));
  await device.close();
}
console.log(`Device report: ${directory}; ${results.length} passed checks, ${errors.length} errors; original save restored: ${restored}.`);
if (errors.length || !restored) process.exitCode = 1;
