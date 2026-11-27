# Handheld / GBA edition

Barrelwing Sky Sprint is the first Game Boy Advance release. It is a separate Butano C++ runtime fed by the deterministic exporter in `scripts/export-handheld.ts`. The web game remains the reference for flap feel, gravity, camera lead and collision forgiveness.

## Current status

- Exporter: working and deterministic from a clean checkout without `_assets_src/`.
- GBA toolchain: proven. Butano 21.10.1 builds its official `keypad` example with devkitARM GCC 16.1.0.
- GBA project: title, class select, challenge code entry, fixed-tick sprint simulation, gates, acorns, hearts, HUD, pause, results, retry and SRAM save code are written.
- ROM: **not yet built**. The remaining blocker is GBA sprite packing: Butano requires sprite sheets with valid dimensions and widths divisible by 8, while the exporter currently emits browser-sized frames (Pip 57x45, acorn 20x20, heart 12x12, storm fill 128x16). GBA-specific `exportGbaSpriteSheet` and `exportGbaSingleCell` helpers exist but are not yet wired into `writeAssets`.
- No mGBA run, screenshot or save-reload acceptance has been recorded. No Tekko hardware has been tested.

## Pinned toolchain

- Butano `21.10.1` — https://github.com/GValiente/butano/releases/tag/21.10.1
- devkitARM container `docker.io/devkitpro/devkitarm:20260610` (devkitARM GCC 16.1.0, GBA libraries and Maxmod tools)
- mGBA 0.10.5 for emulator checks
- Node 22 for the exporter and asset preparation

The Apple Silicon path uses a user-local container because the system-wide devkitPro installer requires an administrator install. It is reproducible without changing `/opt`:

```sh
brew install podman
podman machine init --cpus 4 --memory 4096 --disk-size 20
podman machine start
podman pull docker.io/devkitpro/devkitarm:20260610

# Butano release checkout, outside the repository:
git clone --branch 21.10.1 --depth 1 \
  https://github.com/GValiente/butano.git \
  "$HOME/.local/butano/butano-21.10.1"

export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm ci
npm run rom:gba
```

On Linux with a native devkitARM installation, the same command uses `arm-none-eabi-g++` when `DEVKITARM` is set. The official Butano `keypad` example was built first and produced a 135 KB `keypad.gba`, confirming the toolchain independently of this project.

## Commands

```sh
npm run export:handheld          # build/handheld/v1
npm run export:handheld:verify   # two exports, byte-for-byte comparison
npm run test:handheld            # deterministic/stability/clean-clone coverage
npm run rom:gba                  # export, copy assets, compile the ROM
```

ROM output when complete: `artifacts/handheld/barrelwing-sky-sprint.gba` plus its SHA-256 and `barrelwing-sky-sprint.toolchain.json`.

## Controls

- D-pad: menus, class select, challenge-code cursor and letter changes.
- A: confirm, jump/flap.
- B: back, open Family Challenge from the title.
- Start: pause/resume in play.
- In the challenge code, Up/Down changes the current letter, Left/Right moves the cursor, A confirms and B goes back.

## Save contract

The GBA save is independent from the web/Android journal. It uses two SRAM slots with a magic value, format version, increasing sequence, CRC32 and recoverable defaults if both copies are invalid. It stores separate Classic and Gale bests plus separate Family Challenge bests, the last challenge seed and class.

Family Challenge codes use `BW1-XXXXXX`: a fixed version prefix, a 20-bit seed, a 2-bit class and an 8-bit CRC. The code is versioned with the course contract. Bad codes remain on the entry screen and do not start a run or overwrite a best.

## Next implementation step

1. Wire the GBA sprite path in `writeAssets`:
   - Pip: 32x32 frames, preserving the foot baseline (exported `feetY`).
   - Acorn: 16x16 frames.
   - Heart: 16x16 frame.
   - Storm fill: 16x16 tile.
2. Remove the temporary 0.5 sprite scales in `handheld/gba/src/main.cpp` and use the exported anchor metadata.
3. Rebuild with `npm run rom:gba`, then run the emulator acceptance in `docs/VALIDATION.md`.
4. Compare the generated course vectors against the TypeScript fixture before treating web and GBA challenge scores as comparable.

## Tekko arrival checklist

- Record boot screen, firmware, emulator/core version, partition names and boot-file names.
- Copy the original SD card read-only; use a spare card for experiments.
- Do not flash a guessed firmware image.
- Follow the actual unit’s EASYROMS folder structure from https://thetekko.com/pages/help-center.
- Install the ROM through the normal game menu, not by altering the boot partition.
- Test natural launch, a full round, physical controls, pause, audio, scaling, clean exit and save retention after reboot on both kids’ units.
- If the firmware can host WebGL, probe WebGL, gamepad events, audio unlock, local persistence and stock performance before considering an offline web build.
- Treat USB/OTG networking as unproven until LAN netplay is demonstrated with two devices and the same known-good emulator/core.
