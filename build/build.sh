#!/bin/sh
# Developer step only: the ready-to-run tweaks ship the compiled shims.
# Builds every shim in src/mazda/patches/<name>/ and writes it to each
# usb/tweaks/*/assets/<name>.so that already exists (the tweak declares the
# shim in its components.tsv). A source without a matching asset fails.
#
# Usage (Linux x86_64):  sh build/build.sh [path/to/m3-toolchain]
#   default toolchain: the src/mazda/m3-toolchain submodule
#   (git submodule update --init src/mazda/m3-toolchain; it uses Git LFS)
#
# The shims link only against libc/libdl/libpthread: the head unit's old glibc has
# clock_gettime in librt, so do not use time functions other than time().
set -eu
ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
TC="${1:-$ROOT/src/mazda/m3-toolchain}"
CC="$TC/bin/arm-cortexa9_neon-linux-gnueabi-gcc"
SYSROOT="$TC/arm-cortexa9_neon-linux-gnueabi/sysroot"
if [ ! -x "$CC" ]
then
  echo "ERROR: $CC not found (m3-toolchain missing or Git LFS files not pulled)" >&2
  exit 1
fi
cd "$ROOT"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
for d in src/mazda/patches/*/
do
  name=$(basename "$d")
  # Relative paths keep the output identical wherever the repo is checked out.
  "$CC" -march=armv7-a -mtune=cortex-a9 -mfpu=neon --sysroot="$SYSROOT" \
      -std=gnu99 -O2 -Wall -Wextra -fPIC -shared -fvisibility=hidden \
      -o "$OUT/${name}.so" "src/mazda/patches/${name}"/*.c -ldl -lpthread
  found=0
  for asset in usb/tweaks/*/assets/"${name}.so"
  do
    [ -f "$asset" ] || continue
    cp "$OUT/${name}.so" "$asset"
    found=1
    echo "built $asset  $(md5sum "$asset" | cut -c1-32)"
  done
  if [ "$found" = 0 ]
  then
    echo "ERROR: no usb/tweaks/*/assets/${name}.so for src/mazda/patches/${name}" >&2
    exit 1
  fi
done
