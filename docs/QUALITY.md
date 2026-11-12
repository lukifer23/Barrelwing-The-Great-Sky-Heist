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
| High | Complete campaign routes | Play every campaign stage and trial from its spawn and each checkpoint using ordinary movement; verify exits, optional gems, springs, gates, and the boss escape sequence. |
| High | Touch onboarding | Teach movement, jumping, flapping, dashing, and climbing in context with device-appropriate instructions; verify the first session without consulting documentation. |
| High | Combat balance | Play all courier/difficulty combinations, assess CPU recovery and attack readability, and tune damage and knockback from actual matches. |
| High | Fold transitions | Physically fold and unfold during campaign movement, flight, Brawl, pause, settings, and results; preserve progress and accessible controls. |
| High | Sustained performance | Record frame intervals during long runs in the busiest stages, with sound and touch enabled, including thermal behavior. Short samples are insufficient. |
| Medium | Presentation | Review animation transitions, effect readability, sound balance, text sizes, menu density, and overlapping HUD elements on the cover screen. |
| Medium | Save durability | Verify process termination, force stop, app update, recovery copies, and native write completion on a device while retaining earned progress. |
| Medium | Session pacing | Review difficulty ramps, checkpoint spacing, upgrade costs, rewards, and level-end feedback through a fresh save. |

New modes and additional levels should follow completion of these acceptance items. Existing automated geometry checks do not replace route playthroughs. Local device captures and profiling output remain outside the public repository.
