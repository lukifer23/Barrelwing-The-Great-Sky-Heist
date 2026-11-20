# Quality priorities

Barrelwing is a playable development build. Authored content and working modes do not establish that its routes, balance, presentation, or device behavior are finished. This document tracks concrete acceptance work beyond successful compilation and smoke tests.

## Current quality pass

- Pause all gameplay deadlines together, including temporary powers, protection, dash recharge, enemy patterns, and Brawl countdowns. Opening settings or leaving the foreground must not consume their remaining time.
- Give Sky Sprint a real pause/resume flow, including Android Back and backgrounding, and keep its results choices visible and tappable after resizing.
- Explain available touch actions through flap counts and recharge indicators. Hide actions that cannot be used in flight and hide gameplay controls after Sprint defeat.
- Add a touch-first field guide with powerup effects and Brawl instructions.
- Give CPU attacks a visible preparation period and an interval between attempts. Buffer short player requests during recovery and allow held attacks to repeat.
- Route campaign screen flashes and shakes through the saved accessibility settings.

The implementation and focused regression tests cover these behaviors. They do not establish a finished balance pass or complete campaign playthrough coverage.

## Remaining acceptance work

| Priority | Area | Evidence required |
| --- | --- | --- |
| High | Complete campaign routes | All 16 exits have ordinary-input clears across the November 20 pass. Verify all optional gems, each checkpoint route and an uninterrupted fresh-profile campaign. |
| High | Touch onboarding | Teach movement, jumping, flapping, dashing, and climbing in context with device-appropriate instructions; verify the first session without consulting documentation. |
| High | Combat balance | Play all courier/difficulty combinations, assess CPU recovery and attack readability, and tune damage and knockback from actual matches. |
| High | Fold transitions | Physically fold and unfold during campaign movement, flight, Brawl, pause, settings, and results; preserve progress and accessible controls. |
| High | Sustained performance | Record frame intervals during long runs in the busiest stages, with sound and touch enabled, including thermal behavior. Short samples are insufficient. |
| Medium | Presentation | Review animation transitions, effect readability, sound balance, text sizes, menu density, and overlapping HUD elements on the cover screen. |
| Medium | Save durability | Back, background, update retention and flushed force-stop recovery passed on the Fold7. Exercise a kill during a pending native write and recovery from a damaged primary copy on hardware. |
| Medium | Session pacing | Review difficulty ramps, checkpoint spacing, upgrade costs, rewards, and level-end feedback through a fresh save. |

Existing automated geometry checks do not replace route playthroughs. Local device captures and profiling output remain outside the public repository.

## November audit pass

The [project audit](AUDIT.md) tracks concrete corrections and evidence. This pass adds delivery stamps to existing stages and addresses text redraws, asset duplication, world boundaries, flight/input fairness, enemy warnings, projectile aim, boss reset ownership, pickup reach, recovery ordering, and unused code. Geometry checks now reject pickups inside solid terrain or beyond nearby flight collection reach. TypeScript rejects unused locals and parameters. Native save ordering and mobile frame pacing still require physical acceptance checks.

## Cover-screen acceptance

Check the physical cover in portrait with normal and maximum control sizes, both handedness settings and a saved campaign. Read the stage title, health, time, score, stamp and power information while moving. In Brawl, read both damage totals and the clock while watching the CPU attack. Record any required grip changes separately from touch-event and geometry results.
