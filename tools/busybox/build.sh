#!/bin/sh
# build.sh [OUTDIR]
# Builds the CMU-like BusyBox: the official BusyBox 1.19.2 source with the decisions of cmu_defconfig,
# for ARM, statically linked, with gcc 4.4.5 and eglibc 2.11.3 (Debian squeeze armel), compilers of the
# period of the CMU firmware. No file of the car is used.
#
# Result, in OUTDIR (default .cache/cmu-busybox/):
#   busybox         the program
#   busybox.config  the complete .config it was built with
#   make.log        what the compiler printed
#
# Needs Docker. On an ARM machine whose processor runs 32-bit ARM programs (as GitHub's ubuntu-24.04-arm
# runners) nothing else is needed. On an x86 machine qemu-arm must be registered for ARM programs (binfmt):
# on Debian or Ubuntu the package qemu-user-static. If that registration cannot start ARM programs inside
# containers (no "F" flag), give a static qemu-arm:
#   QEMU_STATIC=/path/to/qemu-arm-static sh tools/busybox/build.sh
#
# Steps 1-3 run here, steps 4-8 in the container (in-container.sh); README.md explains each step.
# Every step stops the build with an error if it fails.
set -eu

here=$(cd "$(dirname "$0")" && pwd)    # tools/busybox
repo=$(cd "$here/../.." && pwd)        # the repository root
out=${1:-$repo/.cache/cmu-busybox}
mkdir -p "$out"
out=$(cd "$out" && pwd)

# Debian squeeze, pinned by digest (an image tag can be moved; a digest cannot). The digest is the
# multi-platform index; --platform linux/arm/v5 picks its armel image.
image=debian/eol:squeeze@sha256:80ed3d6f933f102b35efaa1a9a7513e5ed9937c5a93c289dd6e2e1db51d6f331

say() { printf '\n== %s\n' "$*"; }                     # a step header in the output
fail() { printf 'build.sh: %s\n' "$*" >&2; exit 1; }   # stop with a message

# Git Bash on Windows rewrites paths given to Docker; give it a Windows path instead (as tools/test-in-container.sh).
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
host_path() { if (cd "$1" && pwd -W) >/dev/null 2>&1; then (cd "$1" && pwd -W); else (cd "$1" && pwd); fi; }

# sha256 of a file, with the tool this system has (sha256sum on Linux, shasum on macOS).
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f 1; }

# setting KEY: the value of the line KEY=value in source.conf (the file is read, never run).
setting() { sed -n "s/^$1=//p" "$here/source.conf"; }
url=$(setting url)
sum=$(setting sha256)
[ -n "$url" ] || fail "source.conf has no url="
[ -n "$sum" ] || fail "source.conf has no sha256="

# Never leave the result of an earlier run behind: after a failed build it would look like a new one.
rm -f "$out/busybox" "$out/busybox.config" "$out/make.log"

say "1/8 Download the source"
tarball=$out/download/$(basename "$url")
if [ -f "$tarball" ]; then
    echo "already downloaded: $tarball"
else
    mkdir -p "$out/download"
    echo "from $url"
    curl -fsSL -o "$tarball.part" "$url"        # .part: an interrupted download is never taken as complete
    mv "$tarball.part" "$tarball"
fi

say "2/8 Check the download"
if [ "$(sha256 "$tarball")" != "$sum" ]; then
    rm -f "$tarball"
    fail "the sha256 of $(basename "$tarball") is not the one in source.conf; the file was deleted"
fi
echo "sha256 OK"

say "3/8 Unpack"
src=$out/src
if [ -d "$src" ]; then chmod -R u+w "$src"; rm -rf "$src"; fi   # the earlier copy is read-only
mkdir -p "$src"
tar -xjf "$tarball" -C "$src"
# The tarball holds one folder (busybox-1.19.2/): take its name from there.
srcdir=
for d in "$src"/*/; do
    [ -z "$srcdir" ] || fail "the tarball holds more than one folder"
    srcdir=${d%/}
done
[ -d "$srcdir" ] || fail "the tarball holds no folder"
chmod -R a-w "$src"                            # read-only, so the build cannot change the source
echo "$srcdir"

# Steps 4-8 in the container. It sees:
#   /src              the source, read-only
#   /cmu_defconfig    the decisions, read-only
#   /in-container.sh  the script of steps 4-8, read-only
#   /w                OUTDIR, where the results go
# It runs as root (it installs packages); OWNER gives the results back to you at the end.
# --network host: the container downloads the compilers; the host network also works behind a VPN.
set -- docker run --rm --platform linux/arm/v5 --network host
if [ -n "${QEMU_STATIC:-}" ]; then
    set -- "$@" -v "$QEMU_STATIC:/usr/libexec/qemu-binfmt/arm-binfmt-P:ro"
fi
set -- "$@" \
    -v "$(host_path "$srcdir"):/src:ro" \
    -v "$(host_path "$here")/cmu_defconfig:/cmu_defconfig:ro" \
    -v "$(host_path "$here")/in-container.sh:/in-container.sh:ro" \
    -v "$(host_path "$out"):/w" \
    -e OWNER="$(id -u):$(id -g)" \
    "$image" sh /in-container.sh
"$@"

echo
echo "Built $out/busybox ($(wc -c <"$out/busybox") bytes)"
