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

- Gameplay deadlines used wall time, allowing powers and combat protection to expire while paused. Campaign, Sprint, and Brawl now share an active simulation clock, including enemy and barrel deadlines.
- Sprint used pause input to quit, left touch controls over its defeat state, and drew result choices below the overlay. It now has pause/resume, lifecycle handling, a results container above the overlay, and responsive result positioning.
- The field guide assumed a keyboard and dismissed on any tap. It now provides explicit touch, keyboard, and powerup tabs plus a Back target.

## Automated checks

`npm test` validates every authored stage, gem counts, exits, checkpoint floors, flight gaps, gate switches, bundled asset availability, and animation frame bounds.

`npm run test:browser` runs the real Phaser game in Chromium with actual browser storage. It covers all stage constructors, configured flyer gravity, event counts after restarts, checkpoint recovery after reload, corrupt primary save recovery, keyboard movement and jumping, repeated pause/resume, death/Continue, earned upgrade persistence and effect, Sprint restart state, touch input across changing viewport shapes, all three playable couriers, Acorn Nova effects, actual foot alignment, title menu bounds, master mute, and pointer activation of game-over options. Barrel Brawl tests cover attacks, knockback damage, three-stock wins, saved matches, CPU movement, and pause/resume.

Additional regression checks cover paused power/protection/dash deadlines, paused Brawl countdowns, held attacks, Sprint resume and backgrounding, touch action feedback, tappable Sprint results after resizing, field-guide bounds and row spacing, and stale deadlines on Brawl rematches.

The November 16 milestone passed 21 content/asset checks and 41 browser integration tests. The audit regressions cover stamp eligibility and replay rewards, stamp-funded upgrade restoration, hit/death history, cooldown buffering, anchored moving gates and protected contact, projectile aim, boss volley/reset ownership, actual HUD canvas redraw counts, newest-copy recovery, legacy defaults, ledge turns, hopper warnings, flyer movement through terrain, simultaneous pickups, dead-player interaction guards, campaign side bounds, relocated gem identity, ladder-summit jump/regrab behavior, modal pointer capture, immediate ending skip/replay ownership, and pausing an in-progress death. Content checks also reject released gem placements that exceeded the flight approach-speed envelope.

`npm run check` runs these browser regressions against the production build through `test:production`. Development-server checks remain available through `test:browser`. The standalone route controller and its acceptance limits are described in [AUDIT.md](AUDIT.md#route-acceptance-tooling).

The November audit also completed Acorn Trail from its ordinary spawn using keyboard movement, jumping, and flapping, without changing position, health, upgrades, or physics. The run reached the real stage-clear result with two gems and no deaths. This is one route record, not evidence of complete campaign playthrough coverage. Screenshots of results and a portrait map were inspected locally. The dependency audit reported zero known npm advisories. See [AUDIT.md](AUDIT.md) for findings and acceptance boundaries.

`npm run build` typechecks and creates the production browser package. `npm run android:apk` builds the installable debug application. The GitHub workflow runs web checks and an Android build on fresh runners.

## Device evidence

An Android debug build has been installed on a Samsung Galaxy Z Fold7. WebView inspection confirmed WebGL rendering on the Adreno 830 GPU. Screenshots exposed menu letterboxing and animation-anchor problems; the layout was revised in response.

A Barrel Bridge gameplay comparison measured 52.5 fps before camera filtering and 59.5 fps after filtering 92 offscreen draw objects. The permanent filter preserves physics and logical visibility and uses a guard band around the viewport. These are short samples; sustained gameplay and thermal behavior still require extended testing.

A separate 600-frame Brawl sample measured 59.99 fps over 10 seconds, with a 17.4 ms 95th-percentile interval.

A 600-frame title-screen sample on the device measured 59.98 rendered fps over 10 seconds, with a 17.3 ms 95th-percentile interval. This is a short menu measurement, not a sustained gameplay guarantee.

A November native acceptance run passed 13 checks on the Fold7: ordinary Continue, checkpoint placement, Android-injected joystick/jump gestures, Back pause, field-guide bounds, master mute, Home/resume, flushed force-stop recovery, runtime errors, and restoration of the original user progress/settings. The installed update retained the pre-existing save. `npm run test:device` reproduces this test using one authorized ADB device (or `ANDROID_SERIAL`), a running debug build at Title, and an existing campaign checkpoint. It records local evidence and restores the original normalized save; it never clears application data.

Home testing exposed late native lifecycle handling: relying on Android onStop allowed about 1.1 seconds of unintended simulation. Handling the earlier onPause event reduced the observed transition advance to 94.5 ms, within the test's 250 ms bound. The game remains paused after returning. An in-progress death can now pause too.

Physical folding from the inner display to the cover, followed by upright portrait rotation (411 × 960 CSS pixels), retained the exact paused run state and clocks. Pause text stayed inside the viewport in all three shapes. Physical-display screenshots confirmed rendering; CDP screenshots on this WebView omit the accelerated game canvas and must not be used as rendering evidence.

A desktop production soak completed 45 stage cycles of 20 seconds with zero runtime errors, stable enemy/resume handler counts, and post-GC JavaScript heap within 8.04–9.81 MiB. Nine ordinary-keyboard Brawl matches covered all three couriers and all three CPU difficulties; every match ended through three real stock losses without runtime errors. The controller won all nine, so these runs establish completion rather than balanced difficulty.

Sustained gameplay frame-time measurements, physical folding during active play, extended audio checks, and complete route playthroughs remain separate acceptance checks. Successful builds, smoke tests, and GPU detection do not establish a sustained 60 fps guarantee or prove that every possible route has been playtested.

Local screenshots, diagnostic logs, generated APKs, and device identifiers are excluded from version control.


## Build artifact retention

Route, Brawl and soak runs compile a private production copy under their timestamped evidence directory. The harness removes that copy when the run exits through its cleanup handler, including on test failure. The report, screenshots, commit and build fingerprint stay in the directory. After an interrupted run, its `site/` directory can be removed once its preview server has stopped.

The Android build replaces `artifacts/barrelwing-debug.apk`. GitHub Actions retains each uploaded APK for seven days. Device rollback APKs and save backups live separately under `artifacts/device/`.
