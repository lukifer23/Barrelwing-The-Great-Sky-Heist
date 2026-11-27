# Development handoff

## 2026-11-27 handheld branch

Branch `feat/barrelwing-handheld`, based on the reviewed `2e0781c` commit.

Completed:
- Baseline on Node 22.23.5: 24 content checks, production build and 59 Chromium tests passed before edits.
- Preserved and verified the in-progress boss/tutorial work as a separate commit.
- Shared gamepad action layer across menus, gameplay, pause/background handling and controller label settings. Virtual-gamepad regression passes; physical controller remains pending.
- Deterministic handheld exporter with clean-clone, missing-asset, stable-ID and unsupported-playable-stage tests.
- Butano 21.10.1 GBA project and devkitARM container setup. The official Butano example compiles.
- GBA title, class select, challenge-code entry, course, gates, acorns, hearts, HUD, pause, results, retry and SRAM save source.

Blocked:
- The Barrelwing ROM does not compile yet because Butano rejects the browser-sized sprite sheets. GBA-specific 32x32 Pip, 16x16 acorn, 16x16 heart and 16x16 storm-fill export is the next change. No mGBA round or device test has been claimed.
- Podman is stopped after the handoff to free resources. Butano and the pulled image remain available under `$HOME/.local/butano` and Podman storage.

## 2026-11-23 local review

The current working tree adds Reed, lane drakes, Storm Coat, two Sky Trials and Gale Sprint. The [audit](AUDIT.md) records the implementation findings and remaining priorities. The [validation record](VALIDATION.md) identifies the browser routes, Brawl match, lifecycle checks and Android build for this revision. The November 20 entry below identifies the last hardware-tested milestone.

## 2026-11-20 unfolded Fold7

The installed application contains the gameplay, layout and HUD changes through `98eb9bc`. The final physical gesture runner is `b7cc4e7`. On the open inner display, 23 device checks passed. The original profile and settings matched their pre-update values in memory and in both on-disk save copies, apart from the revision counter. A full Hard stock match, a flight capture and a frame-interval report are available locally in `artifacts/device/2026-11-20-inner/accepted/`. The current APK and the previous installed APK are retained locally.

One fresh Mallow profile completed the nine-stage campaign through the normal menus. Mallow bought a heart upgrade after Acorn Trail, unlocked Clover after Barrel Bridge, and reached the ending with two deaths on the flagship. Detailed outcomes and acceptance limits are in [VALIDATION.md](VALIDATION.md).

## Earlier 2026-11-20 milestone

This pass added local profiles, campaign scoring, courier skills, the Sorting Office trial, full-height one-thumb cover play, a four-fighter Brawl roster, signature moves and KO Race. Ordinary keyboard routes reached all 16 exits across the pass. Current verification is recorded in [VALIDATION.md](VALIDATION.md). That milestone installed `df53c38`. Its durable Android write passed an immediate force-stop and disk-copy comparison. The November 16 notes below describe the earlier installed milestone.

## Archived checkpoint — 2026-11-16

Work stopped at the user's request. Implementation at that checkpoint was committed on `main`. The latest application-code milestone is `8e4ee11` (prompt Android lifecycle pause and native acceptance tooling). The final documentation commit records this stopping point.

### Preserved work

- Delivery stamps and optional shard rewards across all fifteen stages; durable run/save migration and recovery.
- Campaign physics, ladders, flight gates, pickup reach/identity, enemies, projectiles, boss reset ownership, and death interaction fixes.
- HUD redraw and preload cleanup; stronger unused-code checks; modal and ending navigation fixes.
- Production-browser route, soak, Brawl, and native-device acceptance tools. Full detail and unresolved acceptance work remain in [AUDIT.md](AUDIT.md) and [VALIDATION.md](VALIDATION.md).

### Verified milestone

- Production checks: 21 content/asset checks and 41 browser integration tests passed.
- Desktop soak: 45 stage cycles of 20 seconds; zero runtime errors; stable enemy/resume handler counts; post-GC JS heap within 8.04–9.81 MiB.
- Brawl: nine real-keyboard matches across all couriers and difficulties completed without runtime errors. Controller wins do not establish balance.
- Android: update retained existing progress; 13 native acceptance checks passed, including touch, Back, Home/resume, and flushed force-stop recovery. Early lifecycle pause reduced observed background-transition simulation from about 1.1 seconds to 94.5 ms.
- Physical inner-to-cover fold and subsequent upright rotation preserved the paused run exactly. Portrait cover viewport was 411 × 960 CSS pixels; Pause text stayed in bounds. This was paused-state validation, not active-fold gameplay acceptance.

### Device and local artifacts

The installed debug APK contains the application changes now committed in `8e4ee11`. It was built and tested before that commit; its build record identifies the prior base and pending source diff. No new APK was rebuilt merely for the stopping-point documentation.

Local evidence is intentionally ignored by Git. Preserve these directories when resuming:

- `artifacts/device/2026-11-16T20-39-43.054Z/`: original APK/data backup, update-retention record, candidate build provenance, `full-native-verification/device-smoke.json`, physical screenshots, and final save/native-preferences snapshots.
- `artifacts/soak/2026-11-16T20-34-14.982Z/report.json`: completed 45-cycle soak.
- `artifacts/brawl/2026-11-16T20-39-27.456Z/report.json`: completed nine-match matrix.
- `artifacts/routes/`: route attempts, traces, screenshots, and controller limitations. Incomplete automated routes are not established human blockers.
- `artifacts/barrelwing-debug.apk`: locally tested lifecycle-fix build. SHA-256: `09b800dbb3de3610cf7c28c43b63a80313c96d9a1743df186f547acfbab04283`.

At shutdown, the original normalized user progress/settings were restored and compared field-for-field (except the advancing save revision), then flushed to native storage. The existing level-2 checkpoint and two lives were retained. The device app was stopped without uninstalling or clearing data. The project Vite server and Gradle daemon were terminated, and the project WebView port forward was removed.

### Priorities recorded on November 16

1. Implement the requested optional one-handed portrait controls. No implementation has started. A candidate approach is a dominant-side control cluster, horizontal movement retained after lifting the thumb, and a large explicit Stop target; this needs real movement/jump/stop, cancellation, ladder, flight, Brawl, handedness, and small-screen verification before adoption.
2. Record sustained native gameplay frame intervals and simultaneous touch actions. Test thumb reach with a person; automation cannot establish comfort.
3. Continue difficult campaign/trial and boss routes with ordinary controls, then review fresh-campaign stamp/upgrade pacing and CPU balance.
4. Complete active-fold, extended audio, native write-interruption, and thermal acceptance. Existing desktop, paused-fold, and short native measurements do not prove these properties.
