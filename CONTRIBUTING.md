# Contributing

Use a current Node.js release, install dependencies with `npm ci`, and run `npm run check` before proposing a change. Browser tests require Chromium: `npx playwright install chromium`.

For Android changes, also run `npm run android:apk` and the foldable checks in [docs/ANDROID.md](docs/ANDROID.md). Test on a physical device when changing input, viewport behavior, audio, native lifecycle, or frame pacing.

Keep authored content playable without upgrades. Give hazards visible warnings, ensure checkpoints have stable footing, and preserve distinct gem IDs. Document any change that affects save compatibility. Prefer a root-cause fix and a test of observable behavior over a duplicate code path.

Do not commit personal paths, device identifiers, credentials, local settings, keystores, logs, generated build outputs, upstream asset archives, or browser profiles. The ignore files cover common cases; inspect staged changes before committing.

Original contributions use the project's MIT license. Third-party assets must have documented redistribution rights and a preserved notice in `licenses/` where required. Include their origin in `CREDITS.md`.
