# Validation and review

The initial review covered the original application source, authored stages, asset manifests, build scripts, README, credits, runtime assets, and package configuration. Upstream source archives are optional build inputs, not part of the application source maintained here.

## Corrected root causes

- All three stage gems previously shared collection slot zero. Slots now follow authored gem order.
- Physics groups reapplied default body settings to existing entities. Configured flyers, barrels, and projectiles now preserve their own gravity and velocity.
- Enemy updates mixed seconds and milliseconds; hopper jumps and flying behavior now use elapsed time consistently.
- Scene handlers, menu marker tweens, and game-over key handlers could accumulate. Shutdown, Continue, and restart paths clean up ownership explicitly.
- Respawn retained stale ladder, flight, dash, animation, and transient hazard state. These states now reset together.
- Frame-based conveyor forces and magnet motion changed with refresh rate. Their movement now uses delta time.
- Sprite transparent padding separated visible feet from collision surfaces. The player origin and hitbox use the actual grounded foot baseline.
- A flight gap extended outside its channel; a trial checkpoint stood over a pit; Skyhook Tower lacked a complete summit route. Authored geometry was corrected.
- Sprint retained coin score and heart references on restart, spawned duplicate opening gates, and retained collected coin entries. These ownership issues were corrected.
- Progress previously covered completed stages only. Active runs and permanent upgrades now persist, including native Android preferences.
- Fixed-aspect menu layouts left unused screen regions. The title uses shared anchors for the ground, props, character, and menu; other menus reflow with the viewport.

## Automated checks

`npm test` validates all fifteen authored stages, gem counts, exits, checkpoint floors, flight gaps, gate switches, bundled asset availability, and animation frame bounds.

`npm run test:browser` runs the real Phaser game in Chromium with actual browser storage. It covers all stage constructors, configured flyer gravity, event counts after restarts, checkpoint recovery after reload, corrupt primary save recovery, keyboard movement and jumping, repeated pause/resume, death/Continue, earned upgrade persistence and effect, Sprint restart state, touch input across changing viewport shapes, all three playable couriers, Acorn Nova effects, actual foot alignment, title menu bounds, master mute, and pointer activation of game-over options. Barrel Brawl tests cover attacks, knockback damage, three-stock wins, saved matches, CPU movement, and pause/resume.

The current suite has 17 content/asset checks and 17 browser integration tests.

`npm run build` typechecks and creates the production browser package. `npm run android:apk` builds the installable debug application. The GitHub workflow runs web checks and an Android build on fresh runners.

## Device evidence

An Android debug build has been installed on a Samsung Galaxy Z Fold7. WebView inspection confirmed WebGL rendering on the Adreno 830 GPU. Screenshots exposed menu letterboxing and animation-anchor problems; the layout was revised in response.

A Barrel Bridge gameplay comparison measured 52.5 fps before camera filtering and 59.5 fps after filtering 92 offscreen draw objects. The permanent filter preserves physics and logical visibility and uses a guard band around the viewport. These are short samples; sustained gameplay and thermal behavior still require extended testing.

A separate 600-frame Brawl sample measured 59.99 fps over 10 seconds, with a 17.4 ms 95th-percentile interval.

A 600-frame title-screen sample on the device measured 59.98 rendered fps over 10 seconds, with a 17.3 ms 95th-percentile interval. This is a short menu measurement, not a sustained gameplay guarantee.

Sustained gameplay frame-time measurements, physical folding during active play, extended audio checks, and complete route playthroughs remain separate acceptance checks. Successful builds, smoke tests, and GPU detection do not establish a sustained 60 fps guarantee or prove that every possible route has been playtested.

Local screenshots, diagnostic logs, generated APKs, and device identifiers are excluded from version control.
