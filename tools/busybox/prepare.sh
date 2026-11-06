#!/bin/sh
# prepare.sh [OUTDIR]
# prepare.sh --fingerprint
# Gives a checked CMU-like BusyBox in OUTDIR (default .cache/cmu-busybox): builds it (build.sh) and runs all its
# checks (tests/check.sh, tests/testsuite.sh), unless OUTDIR already holds a BusyBox that passed them with exactly
# the current files of the build and of the checks. CI (the job busybox) and tools/test-in-container.sh both use
# this script, so a BusyBox is built and checked once and the same way everywhere.
#
# After all checks pass, OUTDIR/checked holds the fingerprint of those files (a sha256 over them). The next run
# compares it and skips the build and the checks when nothing changed. A failed build or check leaves no
# fingerprint, so a BusyBox that did not pass is never taken as checked.
#
# --fingerprint only prints the fingerprint (needs no Docker): the CI job busybox makes its cache key from it, so
# the list of files below is the only one.
#
# Needs Docker. The checks run the ARM BusyBox: directly when this machine can (an ARM machine, or an x86 Linux
# machine with qemu-user-static), otherwise inside a container (Docker Desktop on macOS and Windows runs ARM
# programs in its Linux machine). QEMU_STATIC=/path/to/qemu-arm-static is passed on as for build.sh.
set -eu

here=$(cd "$(dirname "$0")" && pwd)    # tools/busybox
repo=$(cd "$here/../.." && pwd)        # the repository root

say() { printf '\n=== %s\n' "$*"; }

# Git Bash on Windows rewrites paths given to Docker; give it a Windows path instead (as tools/test-in-container.sh).
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
host_path() { if (cd "$1" && pwd -W) >/dev/null 2>&1; then (cd "$1" && pwd -W); else (cd "$1" && pwd); fi; }

# sha256 of the standard input, with the tool this system has (sha256sum on Linux, shasum on macOS).
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d ' ' -f 1; }

# The fingerprint: the name and the content of every file of the build and of the checks (the README is not one).
# Change one, and the BusyBox is built and checked again, locally and in CI (its cache key is this fingerprint).
fingerprint() {
    (cd "$here" && find prepare.sh build.sh in-container.sh source.conf cmu_defconfig tests -type f | LC_ALL=C sort) |
        while IFS= read -r f; do
            printf '%s %s\n' "$(sha256 <"$here/$f")" "$f"
        done | sha256
}
fp=$(fingerprint)
if [ "${1:-}" = --fingerprint ]; then
    printf '%s\n' "$fp"
    exit 0
fi

out=${1:-$repo/.cache/cmu-busybox}
mkdir -p "$out"
out=$(cd "$out" && pwd)

if [ -f "$out/busybox" ] && [ "$(cat "$out/checked" 2>/dev/null || true)" = "$fp" ]; then
    echo "The BusyBox in $out was already built and checked with these files; nothing to do."
    exit 0
fi
rm -f "$out/checked"

say "Build the CMU-like BusyBox"
sh "$here/build.sh" "$out"

say "Check it against the CMU's BusyBox (tests/check.sh)"
if "$out/busybox" true 2>/dev/null; then
    sh "$here/tests/check.sh" "$out/busybox"
else
    # This machine cannot start the ARM program itself: run the check in a small Debian container, where Docker
    # runs it. Its GNU tools stand in for the host's; it has no readelf, so the ELF attributes are skipped there.
    echo "this machine cannot run ARM programs directly; checking in a container"
    set -- docker run --rm --network none -v "$(host_path "$repo"):/repo:ro" -v "$(host_path "$out"):/out:ro"
    if [ -n "${QEMU_STATIC:-}" ]; then
        set -- "$@" -v "$QEMU_STATIC:/usr/libexec/qemu-binfmt/arm-binfmt-P:ro"
    fi
    "$@" debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3 \
        sh /repo/tools/busybox/tests/check.sh /out/busybox
fi

say "Run the official BusyBox 1.19.2 testsuite (tests/testsuite.sh)"
BUILD_DIR=$out sh "$here/tests/testsuite.sh" "$out/busybox"

printf '%s\n' "$fp" >"$out/checked"
echo
echo "Checked: $out/busybox"
