# Validation and review

The initial review covered the original application source, authored stages, asset manifests, build scripts, README, credits, runtime assets, and package configuration. Upstream source archives are optional build inputs, not part of the application source maintained here.

## November 23 local acceptance

The final working tree passed all 24 content and asset checks, TypeScript, the production web build and all 59 Chromium regressions. The run log is `artifacts/review/2026-11-23/check.log`. All 29 relative links across the twelve project Markdown files resolved locally.

Unupgraded Pip collected all three gems in both new trials on the packaged game version. Lightning Exchange took 15.1 seconds of active play and Reedbank Crossing took 12.3 seconds. Both beat par with zero deaths and zero Continues. Reed also cleared both exits without a death or Continue on direct routes, collecting one gem on Lightning Exchange and zero on Reedbank Crossing. A separate run restored the previously earned Mallow campaign profile, selected its recruited Clover and completed Reedbank Crossing with all three gems and zero deaths. Clover had the profile’s purchased heart upgrade.

| Run | Local evidence |
| --- | --- |
| Pip, both three-gem routes on the final game version | `artifacts/routes/2026-11-23T18-25-55.406Z-oxtxlb/report.json` |
| Pip, independent probes of all 18 stages | `artifacts/routes/2026-11-23T18-14-21.212Z-rPH7Bk/report.json` |
| Reed, both direct routes | `artifacts/routes/2026-11-23T18-12-57.131Z-uF64vj/report.json` |
| Recruited Clover, Reedbank Crossing | `artifacts/routes/2026-11-23T18-20-10.668Z-TXcEtm/report.json` |
| Reed vs. Mallow, Easy stock at Canopy Court | `artifacts/brawl/2026-11-23T18-22-29.507Z-qcAzGM/report.json` |
| Pip vs. Reed, Normal stock in the factory | `artifacts/brawl/2026-11-23T18-21-31.000Z-UZXrOo/report.json` |
| Desktop lifecycle, 54 stage starts | `artifacts/soak/2026-11-23T18-21-41.279Z-pKJiYc/report.json` |
| Reed vs. Clover, Hard KO Race in the storm arena | `artifacts/brawl/2026-11-23T18-12-57.154Z-GJXQzR/report.json` |

The eighteen-stage sweep reached all eighteen exits with zero runtime errors on an earlier build during this review. It used ordinary keyboard input with unupgraded Pip and collected 12 of 54 gems. It recorded 19 deaths and three Continues. The flagship accounted for seven deaths and two Continues. The Baron rematch accounted for four deaths and one Continue. These independent attempts do not measure a first-time player’s difficulty or a continuous campaign’s upgrade economy.

An intermediate collection run stalled below Lightning Exchange’s high route. The controller had been jumping beneath its target while lower approach platforms were off to one side. It now steers to a reachable shelf when a ground gem is too high for a direct approach. The final three-gem routes above include this correction.

The route controller reads player and stage state and sends normal keyboard input. Each isolated probe begins at the authored spawn. The optional `--profile` reads the two game journal keys from a saved local campaign. The runner checks the active courier before recording the route. Use `npm run test:routes -- --levels=17,18 --character=pip --gems=true --seconds=120` to repeat the collection runs. A previous campaign profile can be supplied as `--profile=artifacts/campaign/<run>/profile.json` for a recruited courier.

All three Brawl matches finished without runtime errors. The controller won the Easy and Normal stock matches. The Hard timed match went to sudden death. Reed landed 56 strikes, Clover landed 24 and parried 11, and Clover won. Browser layout captures at 1280 × 720, 411 × 960, 860 × 880 and 915 × 412 CSS pixels are under `artifacts/review/2026-11-23/`. The roster, Sprint ready screen and trial map kept their text in bounds. An earned campaign profile also opened the trial picker from Title, selected Reed and started both new stages. Gameplay captures show the live storm discharge and Copper Mill’s steam jet.

The desktop lifecycle check visited all eighteen stages three times with three seconds of ordinary-input play per visit. Every load had one enemy-defeat handler and one resume handler. The report recorded zero runtime errors. Post-GC JavaScript heap ranged from 7.93–9.80 MiB on the first circuit, 9.71–10.01 MiB on the second and 9.93–10.14 MiB on the third. The upward drift warrants a longer session. The run preceded the final weather-art pass. A further eighteen-load sweep against the packaged game version recorded zero runtime errors, stable handlers and 7.87–9.69 MiB of post-GC heap. Its report is `artifacts/soak/2026-11-23T18-27-07.999Z-C6WDCW/report.json`.

The full asset pipeline regenerated 124 browser and Android assets in an isolated directory. All audio and visible pixels matched. Thirty-eight PNGs had different encodings with identical dimensions and visible pixels. The new courier and enemy sheets matched byte for byte.

A separate debug APK was built for later physical checks at `artifacts/review/2026-11-23/barrelwing-review-debug.apk`. Its SHA-256 is `e080b2d296a7b29a6ee02f866f8d783c29442f94ed1b9c665d86d27d76e48981`. Android Build Tools verified its v2 signature and the signing certificate matches the retained debug APK. All 116 web distribution files matched the packaged bytes. Device installation, fold gestures, audio mix, sustained frame pacing and native process termination on this revision remain deferred.

## Reproducing the unfolded and campaign checks

- With the Fold7 open, run `ANDROID_SERIAL="$(adb -d get-serialno)" npm run test:device -- --unfolded=true --sample-seconds=210 --video=true`. The runner reads Android’s physical posture, uses the inner display for touch gestures, checks control bounds, and saves a game-canvas recording plus frame intervals under `artifacts/device`. The flight segment starts the authored trial at spawn. The roster and match selections use the on-screen menus. The runner restores the original profile in memory and on disk.
- Run `npm run test:routes -- --campaign=true --character=mallow --seconds=280` to start with empty browser storage and follow the normal campaign menus. The runner buys the first heart upgrade when affordable and writes a progress report and profile snapshot after each stage.
- Run `npm run test:brawl -- --players=clover --cpu=mallow --difficulty=hard --arena=forest --display=unfolded --video=true` to compare the keyboard controller in Chromium at the inner display’s CSS dimensions. The report records committed swings, contacts, parries, interrupted attacks and the boundary crossed for each ring-out.

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

A November native acceptance run passed 13 checks on the Fold7: ordinary Continue, checkpoint placement, Android-injected joystick/jump gestures, Back pause, field-guide bounds, master mute, Home/resume, flushed force-stop recovery, runtime errors, and restoration of the original user progress/settings. The installed update retained the pre-existing save. `npm run test:device` reproduces this test using one authorized ADB device (or `ANDROID_SERIAL`), a running debug build at Title, and either an existing campaign checkpoint or a profile between stages. For the latter it opens the selected unlocked stage from the map and saves from Pause. It records local evidence and restores the original normalized save; it never clears application data.

Home testing exposed late native lifecycle handling: relying on Android onStop allowed about 1.1 seconds of unintended simulation. Handling the earlier onPause event reduced the observed transition advance to 94.5 ms, within the test's 250 ms bound. The game remains paused after returning. An in-progress death can now pause too.

Physical folding from the inner display to the cover, followed by upright portrait rotation (411 × 960 CSS pixels), retained the exact paused run state and clocks. Pause text stayed inside the viewport in all three shapes. Physical-display screenshots confirmed rendering; CDP screenshots on this WebView omit the accelerated game canvas and must not be used as rendering evidence.

A desktop production soak completed 45 stage cycles of 20 seconds with zero runtime errors, stable enemy/resume handler counts, and post-GC JavaScript heap within 8.04–9.81 MiB. Nine ordinary-keyboard Brawl matches covered all three couriers and all three CPU difficulties; every match ended through three real stock losses without runtime errors. The controller won all nine, so these runs establish completion rather than balanced difficulty.

Sustained gameplay frame-time measurements, physical folding during active play, extended audio checks, and complete route playthroughs remain separate acceptance checks. Successful builds, smoke tests, and GPU detection do not establish a sustained 60 fps guarantee or prove that every possible route has been playtested.

Local screenshots, diagnostic logs, generated APKs, and device identifiers are excluded from version control.


## Build artifact retention

Route, Brawl and soak runs compile a private production copy under their timestamped evidence directory. The harness removes that copy when the run exits through its cleanup handler, including on test failure. The report, screenshots, commit and build fingerprint stay in the directory. After an interrupted run, its `site/` directory can be removed once its preview server has stopped.

The Android build replaces `artifacts/barrelwing-debug.apk`. GitHub Actions retains each uploaded APK for seven days. Device rollback APKs and save backups live separately under `artifacts/device/`.

## November 20 cover and gameplay acceptance

The final application revision passed all 22 content checks and 53 production-browser tests locally. Its clean-runner web and Android jobs also passed. [GitHub Actions run](https://github.com/lukifer23/Barrelwing-The-Great-Sky-Heist/actions/runs/44830378879)

The production route runs reached all 16 exits using keyboard controls from each stage’s normal spawn across the implementations tested on November 20. This includes the campaign flagship, the trial rematch and the new Sorting Office. These runs selected individual stages and couriers without granting upgrades. The later fresh-profile run is recorded below. Optional-gem coverage and human difficulty ratings remain open. The 32-cycle desktop soak visited every stage twice with zero runtime errors, one enemy handler and one resume handler after each load. Post-GC heap ranged from 7.89 to 10.00 MiB.

The Fold7 cover displayed the game at 411 × 960 CSS pixels. The debug APK from `944c489` passed 18 hardware checks. The test continued an actual campaign checkpoint, moved and jumped using Android touch events, paused with Back, switched away and returned, force-stopped and recovered, latched movement through a jump and stopped it explicitly. The game canvas filled the cover behind the controls. The player picked Clover and CPU Mallow through the two rosters and started KO Race. The normalized original save and native Preferences matched after restoration apart from the advancing revision.

The physical cover run on `944c489` sampled 3,591 active Brawl frames over 59.51 seconds. Median interval was 16.6 ms, p95 was 17.1 ms, p99 was 17.7 ms and no interval exceeded 50 ms. Foreground play ended before the requested 90 seconds. A preceding build completed an 89.96-second active sample over 5,428 frames with p95 of 17.2 ms. Both used the folded outer screen. Active physical folding, prolonged thermal performance, and one-handed comfort still need separate acceptance.

The four-courier stock matrix completed 12 ordinary-keyboard matches across Easy, Normal and Hard. Three earlier timed Clover matches also finished. After revising ledge defense and recovery, Mallow completed an additional stock match at each difficulty. The controller won all 18. The CPU dealt damage and took stocks in the matrix, but consistent controller wins leave competitive balance open.

Comparing the WebView and the raw Android preferences file revealed that the Preferences plugin could acknowledge a change before its asynchronous disk write completed. Build `df53c38` commits both save copies together on Capacitor's plugin thread and resolves the write after disk completion. On the Fold7, three rapid settings changes were flushed and the process was immediately force-stopped. Both disk copies held the acknowledged revision. The relaunched game recovered the entire profile. After restoring the original setting, both copies matched the saved state. The test used a secondary display on the physical phone. All fields present in the original pre-install backup at revision 202 matched the final on-disk revision 486 except the advancing revision itself.

The installed debug APK and `artifacts/barrelwing-debug.apk` have SHA-256 `0fb224ea5ef33a8fd35d4253e144b35fe601a1a09bfabd6374d81a91a1e3756c`. The cover report and screenshots are in `artifacts/device/2026-11-20T22-05-16Z/accepted/`. The final disk and restart evidence is in its sibling `journal/` directory.

Cleanup removed 14 superseded CI APKs totaling 147,804,003 bytes. The two latest successful Android artifacts were retained. Local cleanup removed the generated Gradle intermediates and private route, soak and Brawl preview builds while retaining the signed APK, rollback APKs, player backups and test reports.

## November 20 unfolded acceptance

The physical SM-F966U stayed open at 2184 × 1968, with a WebView of 832 × 749 CSS pixels and DPR 2.625. All 23 checks passed on the final installed build. ADB gestures exercised walking, jumping, entering Windward Gauntlet, flapping, choosing both fighters, and fighting. Visible controls stayed inside the viewport and clear of each other. Pause cleared both Brawl readouts by 15.9 CSS pixels. Android Home and Back, force-stop recovery, and both native save copies passed. The restored player data matched the pre-update snapshot apart from the revision. Installed APK SHA-256 was `f8a144c803ce164df476b13af177144d3886d82e8cb82b7ecb2c0c30831bdc4c`.

Clover fought CPU Mallow on Hard at Canopy Court. Mallow won 3–0. Clover landed seven hits and Mallow landed nine. The device recorded 949 active-frame intervals over 15.8 seconds with p50 16.7 ms, p95 17.4 ms, p99 18.2 ms and zero intervals over 50 ms. The silent game-canvas video is stored alongside the device report and full-display screenshots. A separate inner-size Chromium keyboard match went 3–1 to Clover over 64.3 seconds. Input methods and controllers differ. These runs cover live combat and short-term pacing. Human matchup balance and sustained thermal performance remain open.

One uninterrupted Chromium campaign used a new local profile, selected Mallow, bought More Hearts for three shards after stage one, and recruited Clover after stage two. The controller reached the ending with 38 unspent shards. Stages one through eight cleared without a death. The flagship cost two lives and zero Continues. This run took the main route and collected five of the 27 optional campaign gems.

The final production suite passed 22 content checks and 54 Chromium tests. GitHub’s [web and Android jobs](https://github.com/lukifer23/Barrelwing-The-Great-Sky-Heist/actions/runs/44833640860) passed. Local cleanup removed 67.2 MiB of older APKs and Gradle outputs plus 15.1 MiB of superseded recording files. The current APK, the immediately preceding installed APK, save backups and the verified MP4 are retained. Remote cleanup removed three superseded APK artifacts totaling 31,735,314 bytes and kept the two distinct validated application builds.
