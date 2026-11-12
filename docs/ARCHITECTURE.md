# Architecture

Barrelwing uses TypeScript, Phaser 4 Arcade Physics, and Vite. Capacitor provides the Android host and native preferences, lifecycle, and haptics. The same gameplay source runs in browser and Android builds.

## Scene lifecycle

Boot waits for save initialization and fonts. Preload loads bundled images, sprite sheets, music, and sounds, then registers animation metadata. Title routes to a saved run, a new game, the world map, settings, controls, or credits. Game owns stage entities, collisions, hazards, collectibles, progression, and checkpoint state. Pause is an overlay. Results and Ending lead back to the maps. Sky Sprint has its own endless flight loop. Workshop spends earned shards on persistent upgrades.

Scenes are reused by Phaser, so transient arrays and flags must reset on each create or init. Custom event subscriptions must be removed on shutdown. Input buffers and held touch states reset at pause, respawn, and scene transitions.

## Authored content

`src/game/data/levels` contains nine campaign levels and six trials. Coordinates use a per-stage tile size. Runtime construction converts these definitions into world positions. Each collectible and enemy has a stable object identifier for save restoration; each gem also has its own slot from zero through two.

Plain Phaser groups organize entities that already have configured Arcade bodies. Physics groups apply defaults when adding objects and can overwrite gravity, velocity, and body flags. Use a physics group only when that behavior is intended.

## Movement and hazards

Player handles ground movement, ladders, flight, jumps, flaps, dash, damage, and animations. Scene logic resolves enemy and barrel interactions, flight gates, timed hazards, switches, and boss contact. Enemy updates receive delta time in seconds. Scene timers use milliseconds. Forces and magnet interpolation use elapsed time so refresh rates do not change their strength.

The boss moves between dormant, entry, hover, warning, attack, vulnerability, transition, and defeated states. Sweep attacks have both positional completion and a timeout. Resetting a live encounter clears movement tweens and transient effects while retaining earned boss damage.

## Presentation and performance

The viewport service adapts logical rendering dimensions to the parent aspect ratio while keeping world units stable. Gameplay cameras expand; menus reflow to the current viewport, with a dedicated anchored title layout. The HUD anchors score and timer to the right edge and banners to the center. Touch controls are DOM buttons so their physical sizes do not shrink with the canvas.

Effects reuse particle emitters. Barrel lifetimes and projectile lifetimes bound transient physics objects. Sprint destroys offscreen gates and removes collected coins. Shared menu marker tweens are replaced rather than stacked on repeated selection. Audio fades are cancellable and honor current mute and volume settings.

## Validation boundaries

Content tests validate authored geometry invariants, asset existence, sprite frame bounds, checkpoints, exits, gates, and gem counts. Browser tests run the real Phaser engine and real storage. They test state transitions through both public input and direct scene inspection. They are not a complete playthrough of every possible route; physical Android testing remains necessary for display handoffs, audio behavior, touch feel, and sustained GPU performance.
