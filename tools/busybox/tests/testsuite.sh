#!/bin/sh
# testsuite.sh BUSYBOX
# testsuite.sh --print-fails BUSYBOX
# Runs the official BusyBox 1.19.2 testsuite (509 tests) in a closed Docker environment that mimics the box used for
# the CMU reference: only BusyBox exists (/bin/sh and every command are BusyBox applets), no network, an
# ordinary user, an empty /tmp in memory, minimal environment, qemu settings QEMU_CPU=cortex-a9 and
# QEMU_UNAME=3.0.35. This isolates the testsuite from the runner's dash and GNU tools, so results do not
# drift with Ubuntu updates. The CMU's own BusyBox gives 474 PASS, 35 FAIL; our build gives the same list.
#
# Two modes:
#   sh testsuite.sh BUSYBOX                 compare the failing tests with testsuite-fails.txt
#   sh testsuite.sh --print-fails BUSYBOX   print the sorted names of the failing tests (for writing the reference)
# Exit code: 0 equal (or printed), 1 different, 2 wrong use.
#
# Environment (all optional):
#   BUILD_DIR    the output folder of build.sh (default .cache/cmu-busybox under the repository root); the
#                script takes from it the source (the single folder in BUILD_DIR/src/) and BUILD_DIR/busybox.config
#   LIBS         folder whose files are copied into /lib of the closed root (for a dynamically linked program);
#                must contain ld-linux.so.3, libc.so.6, libm.so.6 or their real files with links
#   QEMU_STATIC  path of a static qemu-arm, mounted at /usr/libexec/qemu-binfmt/arm-binfmt-P in the container,
#                for x86 machines whose binfmt entry has no F flag. Not needed on an ARM machine that runs
#                32-bit ARM programs directly (as GitHub's ubuntu-24.04-arm runners).
#
# How it works:
#   1. Make a minimal root folder in a scratch dir: bin/busybox (the program) and one symlink per applet in bin/,
#      empty dirs tmp, work, proc, dev, sys, usr/bin, sbin, usr/sbin, etc (empty), lib (+ LIBS files if given),
#      usr/libexec/qemu-binfmt (mount point). Nothing else.
#   2. Turn it into a temporary Docker image with "docker import" (tar of the root piped in), named after this
#      run (two runs at the same time do not collide); removed at the end. The applet list for the links comes
#      from the program run inside that image, so this machine never runs an ARM program itself (macOS cannot).
#   3. Copy the source's testsuite/ into a writable scratch folder, plus bin/ with the program as busybox and
#      busybox.config as .config.
#   4. docker run with a read-only root, no network, an ordinary user, no capabilities, an empty /tmp in memory,
#      a minimal environment (PATH, TERM, HOME, QEMU_CPU, QEMU_UNAME), the writable folder at /work, optional
#      QEMU_STATIC mount: /bin/sh -c 'cd /work/testsuite && bindir=/work/bin ./runtest'. Time limit 20 minutes.
#   5. Extract the FAIL names (lines "FAIL: NAME" -> the whole NAME), sorted. --print-fails prints them. Normal mode
#      compares with testsuite-fails.txt next to this script; prints step headers like check.sh (== ...),
#      "ok    474 PASS, 35 FAIL, the same failing tests as the CMU's BusyBox" or "FAIL  ..." listing tests that
#      fail only here and tests that fail only on the CMU, and a last line "TESTSUITE failed=0|1".
set -u                 # no "set -e": a failed check must not stop cleanup
# Sort and compare in byte order, as the reference files are written, whatever the language of this machine.
LC_ALL=C
export LC_ALL

here=$(cd "$(dirname "$0")" && pwd)   # the folder of this script, where testsuite-fails.txt is
say() { printf '\n== %s\n' "$*"; }    # a step header in the output
# Git Bash on Windows rewrites paths given to Docker; give it a Windows path instead (as tools/test-in-container.sh).
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
host_path() { if (cd "$1" && pwd -W) >/dev/null 2>&1; then (cd "$1" && pwd -W); else (cd "$1" && pwd); fi; }
ok() { echo "ok    $*"; }
fails=0
fail() { echo "FAIL  $*"; fails=$((fails + 1)); }

# Parse arguments: [--print-fails] BUSYBOX
print_fails=0
if [ "${1:-}" = --print-fails ]; then print_fails=1; shift; fi
# With --print-fails the output is the list only: the progress messages go to stderr, the list to stdout
# (file descriptor 3 keeps the real stdout), so "> testsuite-fails.txt" gets nothing else.
if [ "$print_fails" = 1 ]; then exec 3>&1 1>&2; fi
bb=${1:-}
if [ -z "$bb" ] || [ ! -f "$bb" ]; then
    echo "usage: sh $0 BUSYBOX" >&2
    echo "       sh $0 --print-fails BUSYBOX" >&2
    exit 2
fi
bb=$(cd "$(dirname "$bb")" && pwd)/$(basename "$bb")

# Find the repository root (the parent of tools/)
repo=$(cd "$here/../../.." && pwd)
# BUILD_DIR: the output folder of build.sh, where the source and busybox.config live
build_dir=${BUILD_DIR:-$repo/.cache/cmu-busybox}
if [ ! -d "$build_dir" ]; then
    echo "testsuite.sh: BUILD_DIR $build_dir does not exist" >&2
    exit 2
fi
build_dir=$(cd "$build_dir" && pwd)

# Find the source: the single folder in BUILD_DIR/src/
srcdir=
if [ -d "$build_dir/src" ]; then
    for d in "$build_dir/src"/*/; do
        [ -z "$srcdir" ] || { echo "testsuite.sh: $build_dir/src holds more than one folder" >&2; exit 2; }
        srcdir=${d%/}
    done
fi
if [ -z "$srcdir" ] || [ ! -d "$srcdir/testsuite" ]; then
    echo "testsuite.sh: $build_dir/src holds no source with a testsuite/ folder" >&2
    exit 2
fi
if [ ! -f "$build_dir/busybox.config" ]; then
    echo "testsuite.sh: $build_dir/busybox.config is missing" >&2
    exit 2
fi

# A scratch folder, deleted at the end (also after Ctrl-C).
tmp=$(mktemp -d "${TMPDIR:-/tmp}/testsuite.XXXXXX")
image=cmu-busybox-testsuite:$$            # a temporary image, named after this run
image_made=''
trap 'rm -rf "$tmp"; if [ -n "$image_made" ]; then docker rmi "$image" >/dev/null 2>&1 || true; fi' EXIT
trap 'exit 1' INT TERM

say "1/5 Make a minimal root folder"
# The root holds bin/busybox and one link per applet, empty folders, and the LIBS files if given (a dynamically
# linked program needs its libraries in /lib). Nothing else.
if [ -n "${LIBS:-}" ]; then
    if [ ! -d "$LIBS" ]; then
        echo "testsuite.sh: LIBS $LIBS does not exist" >&2
        exit 2
    fi
    LIBS=$(cd "$LIBS" && pwd)
fi
root=$tmp/root
mkdir -p "$root/bin" "$root/tmp" "$root/work" "$root/proc" "$root/dev" "$root/sys" \
    "$root/usr/bin" "$root/sbin" "$root/usr/sbin" "$root/etc" "$root/lib" \
    "$root/usr/libexec/qemu-binfmt"
cp "$bb" "$root/bin/busybox"
chmod 755 "$root/bin/busybox"
if [ -n "${LIBS:-}" ]; then
    echo "copying libraries from $LIBS"
    (cd "$LIBS" && find . -type f -o -type l) | while IFS= read -r f; do
        mkdir -p "$root/lib/$(dirname "$f")"
        cp -P "$LIBS/$f" "$root/lib/$f"
    done
fi

say "2/5 Turn it into a Docker image"
# The applet list comes from the program itself, run inside the image (so this machine never has to run an ARM
# program itself, which macOS cannot). Then the links are added and the image is made again.
make_image() { tar -C "$root" -c . | docker import --platform linux/arm - "$image" >/dev/null || exit 1; image_made=1; }
make_image
set -- docker run --rm --network none -e QEMU_CPU=cortex-a9
if [ -n "${QEMU_STATIC:-}" ]; then
    set -- "$@" -v "$QEMU_STATIC:/usr/libexec/qemu-binfmt/arm-binfmt-P:ro"
fi
if ! "$@" "$image" /bin/busybox --list >"$tmp/applets" 2>"$tmp/error"; then
    echo "testsuite.sh: the program does not run: $(head -c 160 "$tmp/error" | tr '\n' ' ')" >&2
    exit 1
fi
while IFS= read -r applet; do
    [ "$applet" = busybox ] && continue   # a newer BusyBox lists itself too
    ln -s busybox "$root/bin/$applet"
done <"$tmp/applets"
make_image
echo "image $image with $(wc -l <"$tmp/applets") applets"

say "3/5 Copy the source testsuite into a writable folder"
work=$tmp/work
mkdir -p "$work"
cp -r "$srcdir/testsuite" "$work/"
chmod -R u+w "$work/testsuite"   # the source is read-only, make the copy writable
mkdir -p "$work/bin"
cp "$bb" "$work/bin/busybox"
chmod 755 "$work/bin/busybox"    # the program must be executable
cp "$build_dir/busybox.config" "$work/bin/.config"
echo "testsuite copied to $work"

say "4/5 Run the testsuite in the closed environment"
# docker run: --rm (remove after the run), --read-only (the root cannot be changed), --network none,
# --user UID:GID (not root), --cap-drop ALL and no-new-privileges (no special rights),
# --tmpfs /tmp:...,mode=1777 (an empty /tmp in memory, writable by everyone like a real /tmp),
# a minimal environment, the writable folder at /work, optional QEMU_STATIC mount.
# The log is kept next to the build results, so it can be read after a failed check.
log=$build_dir/testsuite.log
set -- docker run --rm --read-only --network none --user "$(id -u):$(id -g)" \
    --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,exec,size=256m,mode=1777 \
    -e PATH=/bin:/usr/bin:/sbin:/usr/sbin -e TERM=linux -e HOME=/ \
    -e QEMU_CPU=cortex-a9 -e QEMU_UNAME=3.0.35 \
    -v "$(host_path "$work"):/work"
if [ -n "${QEMU_STATIC:-}" ]; then
    set -- "$@" -v "$QEMU_STATIC:/usr/libexec/qemu-binfmt/arm-binfmt-P:ro"
fi
set -- "$@" "$image" /bin/sh -c 'cd /work/testsuite && bindir=/work/bin ./runtest'
# At most 20 minutes (a normal run takes about 2), well inside the 30 minutes of the CI job. runtest ends with an
# exit code other than 0 whenever a test fails, and 35 tests fail on the CMU too, so its exit code says nothing
# here; the comparison below decides.
if command -v timeout >/dev/null 2>&1; then set -- timeout 1200 "$@"; fi
"$@" >"$log" 2>&1
echo "log: $log"

say "5/5 Extract the FAIL names and compare"
# Check that the run really happened (the log has a sensible number of PASS lines, e.g. > 400)
# grep -c prints the count also when it is 0 (it then exits with 1, which does not matter here).
pass_count=$(grep -c "^PASS:" "$log")
fail_count=$(grep -c "^FAIL:" "$log")
if [ "$pass_count" -lt 400 ]; then
    echo "testsuite.sh: the testsuite did not run properly (only $pass_count PASS lines, expected > 400)" >&2
    if [ "$print_fails" = 1 ]; then
        echo "testsuite.sh: refusing to print --print-fails from a broken run" >&2
    fi
    exit 1
fi
echo "$pass_count PASS, $fail_count FAIL"
# The names of the failing tests: each line "FAIL: NAME" gives NAME, whole (many names have spaces, for example
# "mdev add /block/sda"), sorted. Every name stays, also when two tests share a name, so one more failure shows.
sed -n 's/^FAIL: //p' "$log" | sort >"$tmp/fails.this"

if [ "$print_fails" = 1 ]; then
    # --print-fails mode: print the failing tests (to the real stdout, descriptor 3) and exit
    cat "$tmp/fails.this" >&3
    exit 0
fi

# Normal mode: compare with testsuite-fails.txt
if [ ! -f "$here/testsuite-fails.txt" ]; then
    fail "testsuite-fails.txt is missing"
    echo
    echo "TESTSUITE failed=$fails"
    exit 1
fi
if cmp -s "$here/testsuite-fails.txt" "$tmp/fails.this"; then
    ok "$pass_count PASS, $fail_count FAIL, the same failing tests as the CMU's BusyBox"
else
    # Find tests that fail only here and tests that fail only on the CMU
    only_here=$(comm -13 "$here/testsuite-fails.txt" "$tmp/fails.this" | tr '\n' ' ')
    only_cmu=$(comm -23 "$here/testsuite-fails.txt" "$tmp/fails.this" | tr '\n' ' ')
    if [ -n "$only_here" ]; then
        fail "these tests fail here but not on the CMU: $only_here"
    fi
    if [ -n "$only_cmu" ]; then
        fail "these tests fail on the CMU but not here: $only_cmu"
    fi
fi

echo
echo "TESTSUITE failed=$fails"
[ "$fails" = 0 ]
