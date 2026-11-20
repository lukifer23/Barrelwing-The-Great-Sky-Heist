# Project audit and improvement record

The November 16, 2026 review covers the game runtime, all fifteen authored stages, player and enemy behavior, boss combat, Sprint, Brawl, menus, assets, saves, Android host, build tools, tests, and project documentation. The game has substantial playable content and no identified runtime mock services or stub implementations. Its largest risks are route acceptance, combat balance, sustained device performance, and save behavior under process termination.

## Implemented corrections

| Area | Finding | Result |
| --- | --- | --- |
| HUD performance | Gameplay reapplied HUD wrapping every frame. Phaser's wrapping setter redraws the text canvas even when its width is unchanged. | HUD layout runs on viewport changes; a browser regression counts actual canvas updates and requires zero redraws during steady frames. |
| Assets | Three boss images loaded both as full images and as animation sheets. Five other image textures had no runtime consumers. | Eight unnecessary preload entries removed. Source art remains available to the asset pipeline. |
| Campaign boundaries | The world configured side collisions, but the player disabled world-bound collision. | Campaign players stop at the authored side boundaries; pits remain lethal. Sprint and Brawl retain their own boundary rules. |
| Flight collisions | Invulnerable players were repositioned repeatedly when touching gates. | A protected contact passes through without another teleport; lethal contact retains the death sequence. |
| Moving flight gates | Translating both complete columns left holes at the channel edges and could move openings beyond their intended envelope. | Column heights change around a bounded opening; columns remain anchored to the channel's top and bottom. |
| Flight transitions | Leaving a channel slightly before its right edge could immediately reenter it. Remaining air flaps could also be depleted on exit. | The exit edge cannot reactivate the same channel, and normal air flaps refill on exit. Flight faces the courier forward. |
| Controls | Dash and flight-flap requests were consumed before their cooldowns finished. | Requests remain buffered until the action is available or the buffer expires. |
| Ladders | Jumping from the ladder's top could have its velocity overwritten. Holding Up could immediately reattach after departure. | Ladder jumps return immediately. Summit exits refill flaps and grant ground-jump grace; a short regrab delay preserves departure input. |
| Enemy movement | Ground patrols had authored bounds and wall turns but no actual floor-edge check. | Ground enemies inspect nearby static support at a bounded interval and turn before walking off a ledge. |
| Enemy readability | Hoppers jumped immediately when their wait expired. | A visible, audible 240 ms preparation precedes the leap. Hopper and diver damping uses elapsed time. |
| Flying enemies | Ground terrain colliders also separated flyers from terrain, disrupting their movement. | Flying enemies follow their aerial patterns through terrain; ground enemies retain collisions. |
| Projectiles | Aimed shots replaced the horizontal vector with a left/right sign, making nearly vertical shots travel sideways. | Aim uses both normalized components at a constant speed. Projectiles use their Arcade velocity and a smaller collision body. |
| Boss attacks | The boss and scene both spawned the gust volley, producing six overlapping shots. | The boss owns one three-shot volley; the scene owns gust effects. Duplicate contact-damage ownership was removed too. |
| Boss recovery | Queued attack callbacks could survive encounter resets. Saving at a phase boundary could restore the wrong phase. | Encounter timers cancel on reset, defeat, and destruction; phase recovery reconciles remaining health and the rematch's starting phase. |
| Death interactions | Overlaps could still trigger springs, checkpoints, switches, or enemy attacks after player death. | Stage interactions require a live, interactive player. |
| Checkpoint machinery | Moving platforms retained arbitrary positions through a checkpoint reset. | Platforms reset their tween, visual position, physics body, and movement deltas together. |
| Level pickups | Three acorns were inside solid terrain; six storm acorns exceeded flight collection reach. Nine flight gems also failed an optimistic approach-speed envelope between gates, including the trial gem above its channel ceiling. | Eighteen pickups repositioned. Flight gems now have possible approaches within the speed envelope; complete collection routes remain acceptance work. Released collection IDs remain stable, including legacy index-save migration. |
| Native backgrounding | Android onStop notification could arrive late, advancing gameplay while leaving the app; death could not pause. | Handle onPause and retain the onStop fallback, flush saves, and allow death sequences to pause. Native Home/return and browser death-clock regressions passed. |
| Native recovery | Startup preferred native Preferences without comparing its age to the synchronous journal. | Saves carry increasing revisions. Loading chooses the newest valid copy, and native writes maintain a recovery copy. |
| Characters | The ending always named and displayed Pip. | The ending names and animates the courier who completed the stage. |
| Maintenance | Unused scene fields, obsolete menu helpers, duplicate bookkeeping, and loose event argument types obscured ownership. | Removed unused code and enabled TypeScript's unused-local and unused-parameter checks for subsequent builds. |
| Asset tooling | The main asset command omitted the later courier and icon generators. | The full command now includes characters and icons. Regeneration still requires the separately obtained upstream source packs. |
| Confirmation input | The New Game modal allowed pointer activation of menu items behind it. | The underlying menu suspends input until confirmation is dismissed. A real pointer regression checks both capture and restoration. |
| Ending navigation | Skip input was installed late, and the duplicate-menu guard lived on a destroyed credits container. | Skip works from the first frame, one scene-owned menu handles navigation, queued narrative events cancel, and replaying with another courier resets ownership. |

## Delivery progression

Each stage now offers three permanent delivery stamps. All Gems requires collecting all three gems during the stage run. Express requires a clear within par without a death or checkpoint restart. Untouched requires no health damage, deaths, or checkpoint restarts. A shield may absorb damage without losing Untouched.

Each newly earned stamp awards one Sky Shard. Stamps can be earned on different clears, merge with existing records, and cannot pay twice. They add up to 45 optional rewards across the fifteen existing stages. Gems, ratings, upgrade costs, and existing upgrade purchases retain their previous meaning.

The HUD shows current eligibility. The map shows saved stamps and par, results identify newly earned stamps and shards, and the Workshop and field guide explain the rewards. Damage and death history survive reload and Continue. Older snapshots without that history receive conservative defaults; existing completed stages do not receive unearned stamps.

## Review coverage

| Domain | Current evidence | Acceptance still required |
| --- | --- | --- |
| All authored stages | Geometry, checkpoints, exit presence, three gems, switches, asset frames, pickup reach, stable IDs, and real-engine construction checks | Complete every route from its spawn and checkpoints, including optional paths, with unupgraded couriers. |
| Campaign movement | Keyboard and touch movement, grounded feet, jumping, ladder departure, buffering, death, Continue, pause, boundaries, and flight collision checks | Physical thumb reach, teaching clarity, and repeated difficult transitions on the device. |
| Campaign playthrough | Acorn Trail completed from its ordinary spawn using keyboard movement/jump/flap input, without changing position, health, upgrades, or physics; two gems, no deaths | Further route records must identify the stage, start point, controls, and outcome. A constructor check is not a completed route. |
| Combat and boss | Actual damage, attacks, warnings, volley counts, reset cancellation, phase recovery, Nova, and Brawl stocks/persistence | Full boss fights, all courier/difficulty combinations, fairness during checkpoint recovery, and balance through fresh progression. |
| Sprint and Brawl | Existing mode integration, restart ownership, held attacks, pause timing, backgrounding, responsive results, and stock/damage preservation | Long sessions and real-device combat/flight feel. |
| Animation and presentation | Valid sprite frames, courier-specific animation keys and ending, warning poses, result/map screenshots, responsive field guide | Full animation-transition and audio-mix review on small screens. Mallow remains a recolored squirrel, as documented. |
| Persistence | Browser recovery/revision/migration checks; device update retention, Home/resume, and force-stop after native flush; original progress restored | Interruption during an unfinished native write and injected native-storage failures. |
| Performance | Removed a confirmed per-frame text redraw, duplicate texture preloads, and redundant group snapshot copies; existing culling and transient lifetimes retained | Sustained device frame intervals, memory growth, audio/touch load, and thermal behavior. Desktop or short menu results do not establish mobile frame pacing. |
| Build and distribution | Production build, Android debug APK, CI configuration, and dependency audit | Installed update retained existing progress; 13 native smoke checks and paused physical fold/portrait checks passed. Remaining device checks are tracked in VALIDATION.md. The APK is for personal debug installation. |

## Route acceptance tooling

`npm run test:routes -- --levels=1,2,3 --seconds=120 --character=pip` builds an isolated production snapshot and drives it with keyboard input. It records position, health, deaths, gems, continues, errors, screenshots, and source/build provenance under ignored `artifacts/routes/`. `--gems=true` asks the flight controller to pursue gems. The controller never changes actor positions, health, powers, collisions, or completion state. It allows up to three normal Continue choices and reports them explicitly.

Initial route probes cleared stages 1 through 5 with unupgraded Pip. Barrel Bridge and Copper Mill cleared without deaths; a refined Acorn Trail run cleared without deaths, and Furnace Ladder cleared with one death. The initial Cloudvine Drift controller needed eight deaths and two continues. These outcomes establish ordinary-input completion for those attempts, not balanced difficulty or all-gem acceptance. Later gem-layout revisions and controller changes need their own reports. A failed controller run is a reproduction to inspect, not automatic proof that a human route is blocked.

`npm run check` now runs the browser regressions against the minified production build. `npm run test:browser` remains available for development-server checks. The approach envelope is deliberately optimistic: it uses maximum rise/fall speeds and full moving-gate ranges, without claiming a complete trajectory simulation.

The route, soak, and Brawl acceptance tools share an isolated production-build server. Each writes build provenance and reports into ignored artifacts. `npm run test:soak -- --cycles=45 --dwell=20` exercises ordinary keyboard movement through repeated stage lifecycles and samples heap after shutdown and garbage collection. `npm run test:brawl` runs a keyboard controller through the available couriers and three CPU difficulties, with arenas rotated across the matrix. Neither changes health, stocks, damage, actor positions, or the match timer.

All 45 soak cycles completed with no runtime errors or duplicated enemy/resume handlers. Post-GC JavaScript heap stayed within 8.04–9.81 MiB, including warmup; round means were 9.30, 9.52, and 9.67 MiB. Nine Brawl matches across all couriers/difficulties finished through real stock losses without runtime errors. The controller won all nine; human balance review remains necessary. These are desktop lifecycle and combat-completion results. Native acceptance, physical fold/portrait checks, and their limits are recorded in [VALIDATION.md](VALIDATION.md#device-evidence).

## Next work priorities

Session handoff and local evidence locations are recorded in [SESSION.md](SESSION.md). The November 20 pass below implements one-thumb portrait controls.

1. Record campaign and trial routes with ordinary controls, starting with the vertical ladder stages and moving flight gates. Treat failed automation as a reproduction to investigate, not automatic proof that a human route is impossible.
2. Validate the new reward pacing through a fresh campaign. Check whether Express and Untouched encourage useful routes and whether shard income makes upgrades trivial before their intended encounters.
3. Run the physical acceptance checklist in `ANDROID.md`, including folding/rotation, simultaneous touch actions, Back, backgrounding, force-stop, update retention, and sustained combat performance.
4. Deepen existing encounter and world presentation after route validation. Additional content should provide readable mechanics and distinct route choices rather than increase the number of nominal stages alone.

No new network services, accounts, monetization, fabricated scores, or placeholder content were introduced. Remaining acceptance work is tracked explicitly instead of being represented as completed validation.

## November 20 gameplay and cover-screen pass

The 1.2 pass covers profile isolation, atomic stage settlement, rank-based recruitment, courier-specific movement, an additional trial, an aimed enemy, Brawl rules and simultaneous hits, and touch and keyboard input. Old single-player saves open in slot one. Courier selection, workshop spending, campaign records and Brawl results were exercised through the production game.

The Phaser frame limiter accelerated gameplay deadlines on the browser test host. Movement now uses display-paced frames with fixed-step Arcade physics. A separate regression compares elapsed campaign time to wall time. The ordinary route probe also exposed a shared-landing error on vertically adjoining ladders. Climb direction now determines which segment accepts input at the junction.

The Fold7 cover review found small HUD type, excessive space between map objects and a persistent sound button covering menu space, and a blank lower control band. Portrait campaign framing now shows 352 world units across. The canvas reaches the bottom of the cover, including behind the thumb controls. The map groups each world on its own row. Supporting text, input targets, match readouts and the field guide use portrait sizing. One-thumb play keeps horizontal movement until the player taps STOP and clears held input on cancellation or pause.

Across the November 20 production route runs, keyboard input reached the exit from the ordinary spawn on all nine campaign stages and all seven trials. The controller climbed vertically adjoining ladders, opened the flagship gate and defeated the Baron. Above the Storm cleared with unupgraded Mallow, two gems, and no deaths after the controller started anticipating the moving openings. The moving gates’ illuminated centerlines now follow the same positions as their collision edges. The reports cover multiple builds during this pass. The subsequent fresh-profile run is recorded below. Collection of all optional gems remains open.

Brawl setup now presents both fighters and a separate roster for picking either side. The selection demonstrates each courier’s strike and keeps match preferences per profile. Reviewing live cover captures led to closer combat framing, side markers, Mallow’s frame-by-frame parcel, distinct startup/contact/recovery poses and directional swipes. Rapid navigation also exposed Phaser delivering the same keyboard event multiple times before a frame ended. Roster navigation now consumes each handled event.

The Fold7’s raw preferences file briefly lagged the plugin’s acknowledged save. The Android bridge now commits the existing primary and backup keys together before reporting success. A settings change, immediate force-stop, reload and restoration verified both copies on disk. The final capture matched the pre-install player state field-for-field, allowing for the revision counter and new schema fields.


## Unfolded Fold7, opponent behavior and campaign pacing

An instrumented match exposed two causes of missed CPU attacks. An attempted attack could start the AI wait interval while the fighter was still stunned, guarding or recovering. A successful guard also consumed much of the time available to counter. AI attack intervals now begin when a fighter actually commits to a swing. A connecting guard releases the defender immediately while spending the normal dash charge. The CPU can face a rival while backing up. Its reach, movement, anticipation and recovery decisions use the selected courier.

A fresh-profile run stalled at the second and third channel approaches in Above the Storm after twelve deaths and three Continues. Two lower wooden landings now give a low approach a way back onto the island. An additional checkpoint between those channels shortens the repeat after a fall. Arcade physics previously accepted a whole delayed frame while the scene clock and controls advanced by at most 40–50 ms. They now use the same elapsed interval and retain fixed-step collision handling. A regression feeds a 500 ms frame through the real campaign scene and compares actual physics steps with the active clock.

On the physical inner display the time readout faded against bright sky and Pause touched the CPU score panel. The clock and score gained dark backgrounds, the stage title and stamp text grew, and the landscape Brawl pause position now clears both readouts. The measured gap was 15.9 CSS pixels on the Fold7.
