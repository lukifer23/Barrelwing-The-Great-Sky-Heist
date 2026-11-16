# Saves and progression

The save key is `barrelwing.save.v1`; the companion browser recovery key adds `.backup`. The format remains version 1 so the original game's level records can migrate without losing progress. Missing newly introduced fields receive defaults. Invalid settings and numeric fields are bounded during loading.

A save contains stage records, campaign and bonus unlocks, Sprint best score, aggregate score, settings, permanent upgrade tiers, and an optional active run.

## Stage records

Each of fifteen records tracks completion, best score, fastest successful clear, three distinct gem flags, and best rating. A replay merges gems and ratings without discarding earlier achievements. An incomplete attempt does not overwrite a successful best time. Completing stages 1 through 9 advances the campaign. Stage 3 unlocks Sky Sprint; stage 9 unlocks the Sky Trials.

Records also store `mastery`, with boolean `collector`, `express`, and `untouched` delivery stamps. Missing fields default to false. Earned stamps merge across clears, each awarding one shard once. Active snapshots store `deaths` and `damageTaken`; legacy runs without that history cannot establish Express or Untouched eligibility. New campaign progress resets stamps along with stage records.

## Upgrades

Every unique saved gem and rating star earns one Sky Shard. Available shards are calculated from saved achievements minus the costs of purchased tiers. Each upgrade has two tiers costing 3 and 6 shards. Replaying without improving achievements does not create extra currency.

Each earned delivery stamp contributes one additional shard. Upgrade sanitation includes stamp income when retaining purchases after reload.

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

An object's optional `persistentId` preserves its released hash when a placement is corrected. The flight coin-arc helper retains original IDs for ceiling corrections. Existing legacy maps continue to reference these same IDs.

Completing a stage records results before its celebration finishes. The active run is cleared so reopening the app cannot accidentally resume a finished attempt.

## Storage behavior

On Android, initialization reads Capacitor Preferences before gameplay starts. Writes are serialized so an older asynchronous write cannot overwrite a newer one. Local storage holds a synchronous journal. In browsers, progress uses local storage only. A corrupt primary browser save can recover from its companion copy. If storage is unavailable, gameplay remains usable in memory and checkpoint feedback reports the failure.

Each save increments `revision`, including campaign resets. Loading compares valid primary and recovery copies and selects the greatest revision, including the local journal and both native copies on Android. Saves without a revision migrate as revision zero. Revision ordering prevents an older native write from superseding newer journal progress after a process interruption; it does not guarantee that the operating system allows a pending native write to finish before termination.

`SaveManager.flush()` awaits queued native writes so lifecycle handlers and device validation can distinguish a queued save from a completed write. The background handler awaits it; the synchronous journal remains available if native persistence fails or the process terminates first.

The game has no account, backend, cloud backup, telemetry, or shared leaderboard. Removing application data removes local progress. Android operating-system backup behavior depends on device configuration and is not a game-managed synchronization service.

## Independent modes

Brawl records and active matches are stored separately from the campaign run. Starting a new campaign retains Brawl records, its active match, the Sprint personal best, settings, and the chosen courier. Campaign stage records and upgrades reset. See [BRAWL.md](BRAWL.md) for match restoration details.
