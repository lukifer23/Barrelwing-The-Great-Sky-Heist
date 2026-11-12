# Saves and progression

The save key is `barrelwing.save.v1`; the companion browser recovery key adds `.backup`. The format remains version 1 so the original game's level records can migrate without losing progress. Missing newly introduced fields receive defaults. Invalid settings and numeric fields are bounded during loading.

A save contains stage records, campaign and bonus unlocks, Sprint best score, aggregate score, settings, permanent upgrade tiers, and an optional active run.

## Stage records

Each of fifteen records tracks completion, best score, fastest successful clear, three distinct gem flags, and best rating. A replay merges gems and ratings without discarding earlier achievements. An incomplete attempt does not overwrite a successful best time. Completing stages 1 through 9 advances the campaign. Stage 3 unlocks Sky Sprint; stage 9 unlocks the Sky Trials.

## Upgrades

Every unique saved gem and rating star earns one Sky Shard. Available shards are calculated from saved achievements minus the costs of purchased tiers. Each upgrade has two tiers costing 3 and 6 shards. Replaying without improving achievements does not create extra currency.

| Upgrade | Effect per tier |
| --- | --- |
| More Hearts | One additional maximum heart |
| More Lives | One additional starting life |
| Faster Dash | Dash cooldown reduced by 15% of its base duration |
| Longer Powers | Timed powers last 25% longer than base duration |

Upgrades apply when a new stage instance begins. Sky Sprint retains its three-heart score-attack rules.

## Active run

Continue restores the most recent checkpoint, lives, health, score, acorns, elapsed time, gem flags, collected object IDs, defeated enemy IDs, activated switches, and boss progress. Object IDs are stable hashes of type, coordinates, kind, and duplicate occurrence. Inserting unrelated objects does not renumber existing collectibles or enemies. The original index-based snapshots migrate through a retained ID map. Moving or changing the kind of a persistent object requires an explicit migration.

Temporary power effects and transient hazards are reset on restoration. Falling platforms recover when returning to a checkpoint. A checkpoint restart spends a life. A game over clears the active run; choosing Continue grants a new set of lives and resets the attempt score and timer while retaining the checkpoint and consumed stage objects.

Completing a stage records results before its celebration finishes. The active run is cleared so reopening the app cannot accidentally resume a finished attempt.

## Storage behavior

On Android, initialization reads Capacitor Preferences before gameplay starts. Writes are serialized so an older asynchronous write cannot overwrite a newer one. Local storage holds a synchronous journal. In browsers, progress uses local storage only. A corrupt primary browser save can recover from its companion copy. If storage is unavailable, gameplay remains usable in memory and checkpoint feedback reports the failure.

The game has no account, backend, cloud backup, telemetry, or shared leaderboard. Removing application data removes local progress. Android operating-system backup behavior depends on device configuration and is not a game-managed synchronization service.

## Independent modes

Brawl records and active matches are stored separately from the campaign run. Starting a new campaign retains Brawl records, its active match, the Sprint personal best, settings, and the chosen courier. Campaign stage records and upgrades reset. See [BRAWL.md](BRAWL.md) for match restoration details.
