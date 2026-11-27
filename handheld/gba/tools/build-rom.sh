#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
GBA_DIR="$ROOT/handheld/gba"
BUTANO_ROOT="${BUTANO_ROOT:-$HOME/.local/butano/butano-21.10.1}"
CONTAINER_IMAGE="${BARRELWING_GBA_IMAGE:-docker.io/devkitpro/devkitarm:20260610}"
OUT_DIR="$ROOT/artifacts/handheld"
ROM="$GBA_DIR/barrelwing-sky-sprint.gba"

if [[ ! -d "$BUTANO_ROOT/butano" ]]; then
  echo "Butano 21.10.1 not found at $BUTANO_ROOT" >&2
  echo "Set BUTANO_ROOT to a Butano 21.10.1 checkout; see docs/HANDHELD.md." >&2
  exit 1
fi

cd "$ROOT"
npm run export:handheld

rm -rf "$GBA_DIR/graphics" "$GBA_DIR/audio"
mkdir -p "$GBA_DIR/graphics" "$GBA_DIR/audio"
cp "$ROOT"/build/handheld/v1/assets/sprites/pip.{bmp,json} "$GBA_DIR/graphics/"
cp "$ROOT"/build/handheld/v1/assets/sprites/acorn.{bmp,json} "$GBA_DIR/graphics/"
cp "$ROOT"/build/handheld/v1/assets/sprites/storm_fill.{bmp,json} "$GBA_DIR/graphics/"
cp "$ROOT"/build/handheld/v1/assets/sprites/ui_heart.{bmp,json} "$GBA_DIR/graphics/"
cp "$ROOT"/build/handheld/v1/assets/sprites/ui_wing.{bmp,json} "$GBA_DIR/graphics/"
cp "$ROOT"/build/handheld/v1/assets/bg/*.{bmp,json} "$GBA_DIR/graphics/"
cp "$ROOT"/build/handheld/v1/assets/audio/*.wav "$GBA_DIR/audio/"
cp "$ROOT"/build/handheld/v1/assets/audio/sprint_loop.mod "$GBA_DIR/audio/"

VERSION_FILE="$GBA_DIR/build-toolchain.json"
mkdir -p "$OUT_DIR"
if command -v arm-none-eabi-g++ >/dev/null 2>&1 && [[ -n "${DEVKITARM:-}" ]]; then
  echo "Building with native devkitARM"
  make -C "$GBA_DIR" -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" BUTANO_ROOT="$BUTANO_ROOT"
  TOOLCHAIN="native devkitARM: $(arm-none-eabi-g++ --version | head -1)"
elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
  echo "Building with $CONTAINER_IMAGE"
  podman run --rm \
    -v "$ROOT":/work \
    -v "$BUTANO_ROOT":/butano:ro \
    -w /work/handheld/gba \
    "$CONTAINER_IMAGE" \
    bash -lc 'export PATH=$DEVKITARM/bin:$DEVKITPRO/tools/bin:$PATH; make -j4 BUTANO_ROOT=/butano'
  TOOLCHAIN="container $CONTAINER_IMAGE / devkitARM 16.1.0"
elif command -v docker >/dev/null 2>&1; then
  echo "Building with $CONTAINER_IMAGE"
  docker run --rm \
    -v "$ROOT":/work \
    -v "$BUTANO_ROOT":/butano:ro \
    -w /work/handheld/gba \
    "$CONTAINER_IMAGE" \
    bash -lc 'export PATH=$DEVKITARM/bin:$DEVKITPRO/tools/bin:$PATH; make -j4 BUTANO_ROOT=/butano'
  TOOLCHAIN="container $CONTAINER_IMAGE / devkitARM 16.1.0"
else
  echo "No GBA toolchain found. Install devkitARM or a container runtime; see docs/HANDHELD.md." >&2
  exit 1
fi

test -f "$ROM"
cp "$ROM" "$OUT_DIR/barrelwing-sky-sprint.gba"
if command -v shasum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && shasum -a 256 barrelwing-sky-sprint.gba > barrelwing-sky-sprint.gba.sha256)
else
  (cd "$OUT_DIR" && sha256sum barrelwing-sky-sprint.gba > barrelwing-sky-sprint.gba.sha256)
fi
cat > "$VERSION_FILE" <<EOF
{
  "rom": "barrelwing-sky-sprint.gba",
  "butano": "21.10.1",
  "contentVersion": "handheld-1",
  "toolchain": "$TOOLCHAIN",
  "commit": "$(git rev-parse HEAD)",
  "sha256": "$(cut -d' ' -f1 "$OUT_DIR/barrelwing-sky-sprint.gba.sha256")"
}
EOF
cp "$VERSION_FILE" "$OUT_DIR/barrelwing-sky-sprint.toolchain.json"
echo "ROM: $OUT_DIR/barrelwing-sky-sprint.gba"
cat "$OUT_DIR/barrelwing-sky-sprint.gba.sha256"
