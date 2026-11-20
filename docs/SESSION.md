# Development handoff

## 2026-11-20

This pass added local profiles, campaign scoring, courier skills, the Sorting Office trial, full-height one-thumb cover play, a four-fighter Brawl roster, signature moves and KO Race. Ordinary keyboard routes reached all 16 exits across the pass. Current verification is recorded in [VALIDATION.md](VALIDATION.md). The November 16 notes below describe the earlier installed milestone.

## Archived checkpoint — 2026-11-16

Work stopped at the user's request. Implementation at that checkpoint was committed on `main`. The latest application-code milestone is `8e4ee11` (prompt Android lifecycle pause and native acceptance tooling). The final documentation commit records this stopping point.

## Preserved work

- Delivery stamps and optional shard rewards across all fifteen stages; durable run/save migration and recovery.
- Campaign physics, ladders, flight gates, pickup reach/identity, enemies, projectiles, boss reset ownership, and death interaction fixes.
- HUD redraw and preload cleanup; stronger unused-code checks; modal and ending navigation fixes.
- Production-browser route, soak, Brawl, and native-device acceptance tools. Full detail and unresolved acceptance work remain in [AUDIT.md](AUDIT.md) and [VALIDATION.md](VALIDATION.md).

## Verified milestone

- Production checks: 21 content/asset checks and 41 browser integration tests passed.
- Desktop soak: 45 stage cycles of 20 seconds; zero runtime errors; stable enemy/resume handler counts; post-GC JS heap within 8.04–9.81 MiB.
- Brawl: nine real-keyboard matches across all couriers and difficulties completed without runtime errors. Controller wins do not establish balance.
- Android: update retained existing progress; 13 native acceptance checks passed, including touch, Back, Home/resume, and flushed force-stop recovery. Early lifecycle pause reduced observed background-transition simulation from about 1.1 seconds to 94.5 ms.
- Physical inner-to-cover fold and subsequent upright rotation preserved the paused run exactly. Portrait cover viewport was 411 × 960 CSS pixels; Pause text stayed in bounds. This was paused-state validation, not active-fold gameplay acceptance.

## Device and local artifacts

The installed debug APK contains the application changes now committed in `8e4ee11`. It was built and tested before that commit; its build record identifies the prior base and pending source diff. No new APK was rebuilt merely for the stopping-point documentation.

Local evidence is intentionally ignored by Git. Preserve these directories when resuming:

- `artifacts/device/2026-11-16T20-39-43.054Z/`: original APK/data backup, update-retention record, candidate build provenance, `full-native-verification/device-smoke.json`, physical screenshots, and final save/native-preferences snapshots.
- `artifacts/soak/2026-11-16T20-34-14.982Z/report.json`: completed 45-cycle soak.
- `artifacts/brawl/2026-11-16T20-39-27.456Z/report.json`: completed nine-match matrix.
- `artifacts/routes/`: route attempts, traces, screenshots, and controller limitations. Incomplete automated routes are not established human blockers.
- `artifacts/barrelwing-debug.apk`: locally tested lifecycle-fix build. SHA-256: `09b800dbb3de3610cf7c28c43b63a80313c96d9a1743df186f547acfbab04283`.

At shutdown, the original normalized user progress/settings were restored and compared field-for-field (except the advancing save revision), then flushed to native storage. The existing level-2 checkpoint and two lives were retained. The device app was stopped without uninstalling or clearing data. The project Vite server and Gradle daemon were terminated, and the project WebView port forward was removed.

## Resume priorities

1. Implement the requested optional one-handed portrait controls. No implementation has started. A candidate approach is a dominant-side control cluster, horizontal movement retained after lifting the thumb, and a large explicit Stop target; this needs real movement/jump/stop, cancellation, ladder, flight, Brawl, handedness, and small-screen verification before adoption.
2. Record sustained native gameplay frame intervals and simultaneous touch actions. Test thumb reach with a person; automation cannot establish comfort.
3. Continue difficult campaign/trial and boss routes with ordinary controls, then review fresh-campaign stamp/upgrade pacing and CPU balance.
4. Complete active-fold, extended audio, native write-interruption, and thermal acceptance. Existing desktop, paused-fold, and short native measurements do not prove these properties.
