import Phaser from 'phaser';

const clocks = new WeakMap<Phaser.Scene, { now: number }>();

/** Deadlines share active simulation time; scene Clock.now also includes time spent paused. */
export function installPlayClock(scene: Phaser.Scene, maxStep: number): void {
  const clock = { now: 0 };
  clocks.set(scene, clock);
  const advance = (_time: number, delta: number) => { clock.now += Math.min(Math.max(delta, 0), maxStep); };
  scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, advance);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, advance);
    clocks.delete(scene);
  });
}

export function playTime(scene: Phaser.Scene): number {
  return clocks.get(scene)?.now ?? scene.time.now;
}
