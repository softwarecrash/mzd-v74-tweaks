#!/bin/sh
# in-container.sh
# Steps 4-8 of build.sh, inside the Debian squeeze armel container. build.sh starts it; do not run it
# yourself. What the container sees:
#   /src            the BusyBox source, read-only
#   /cmu_defconfig  the decisions, read-only
#   /w              the output folder: busybox, busybox.config, apt.log, make.log go there
#   OWNER           uid:gid of the user who started build.sh; the files in /w are given back to them
set -eu

# The build date the CMU's BusyBox prints in its banner: "BusyBox v1.19.2 (DATE) multi-call binary."
banner_date='2020-02-14 18:04:06 JST'

say() { printf '\n== %s\n' "$*"; }

# Whatever happens below, the files in /w belong to the user afterwards, not to root.
trap 'chown -R "$OWNER" /w 2>/dev/null || true' EXIT

say "4/8 Install the compilers"
# squeeze's apt fails on IPv6 addresses: prefer IPv4.
echo 'precedence ::ffff:0:0/96 100' >/etc/gai.conf
# Their output goes to /w/apt.log (kept as the CI artifact of a failed build); on a failure its end is shown here.
if ! { apt-get update -qq &&
        apt-get install -y -qq --force-yes build-essential bzip2; } >/w/apt.log 2>&1; then  # --force-yes: the archive keys expired
    echo "installing the compilers failed; the end of apt.log:" >&2
    tail -n 30 /w/apt.log >&2
    exit 1
fi
gcc --version | head -n 1
ldd --version | head -n 1

say "5/8 Generate the configuration"
# BusyBox's own configurator reads the decisions and writes the complete .config (defaults for the rest).
# O=/tmp/out: build outside the read-only source.
mkdir /tmp/out
cd /src
make -s O=/tmp/out defconfig KBUILD_DEFCONFIG=/cmu_defconfig KCONFIG_NOTIMESTAMP=1 </dev/null >/dev/null
cp /tmp/out/.config /w/busybox.config         # kept also when a later step fails
echo "/w/busybox.config"

say "6/8 Check the configuration"
# Every decision line of cmu_defconfig must be in the .config exactly. The configurator does not stop on a
# decision it cannot apply: an option whose dependency is off gets the default without a message, a
# misspelt name only gives a warning (README.md, step 6). Then nothing is compiled.
missing=$(grep -E '^CONFIG_|^# CONFIG_.* is not set$' /cmu_defconfig | while IFS= read -r line; do
    grep -qxF -- "$line" /tmp/out/.config || printf '%s\n' "$line"
done)
if [ -n "$missing" ]; then
    echo "these decisions of cmu_defconfig are not in the generated .config; nothing was compiled:" >&2
    printf '%s\n' "$missing" | head -n 20 >&2
    exit 3
fi
echo "all $(grep -cE '^CONFIG_|^# CONFIG_.* is not set$' /cmu_defconfig) decisions are in the .config"

say "7/8 Compile"
# BusyBox takes the banner date from the macro BB_BT. Set it for the three files that print it
# (libbb/messages.c, editors/vi.c, e2fsprogs/fsck.c) with kbuild's per-file flags; the source is not changed.
bt="-UBB_BT -DBB_BT=\"\\\"$banner_date\\\"\""
if ! make -s O=/tmp/out -j"$(nproc)" \
        CFLAGS_messages.o="$bt" CFLAGS_vi.o="$bt" CFLAGS_fsck.o="$bt" >/w/make.log 2>&1; then
    echo "the compiler failed; the end of make.log:" >&2
    tail -n 30 /w/make.log >&2
    exit 1
fi
/tmp/out/busybox | head -n 1 || true          # the banner (exit code of busybox without arguments is 1)

say "8/8 Save the results"
cp /tmp/out/busybox /w/busybox
echo "/w/busybox, /w/busybox.config, /w/apt.log, /w/make.log"
