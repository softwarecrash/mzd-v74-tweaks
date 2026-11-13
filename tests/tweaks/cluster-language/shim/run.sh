#!/bin/sh
# Runs usb/tweaks/cluster-language/assets/libpatch-svcjciblmsettings.so under qemu-arm
# against stand-in libraries (fixture.c; the Mazda libraries cannot be in the repo),
# in a small root with the /jci paths the shim looks for.
#
# Usage (Linux x86_64, needs qemu-user):  sh tests/tweaks/cluster-language/shim/run.sh [path/to/m3-toolchain]
# Exit code: 0 if every check passed.
set -u
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
TC="${1:-$ROOT/src/mazda/m3-toolchain}"
TARGET=arm-cortexa9_neon-linux-gnueabi
CC="$TC/bin/$TARGET-gcc"
READELF="$TC/bin/$TARGET-readelf"
SYSROOT="$TC/$TARGET/sysroot"
SHIM="$ROOT/usb/tweaks/cluster-language/assets/libpatch-svcjciblmsettings.so"
FIXTURE="$ROOT/tests/tweaks/cluster-language/shim/fixture.c"
LOG=/tmp/cluster-language.log
A="-march=armv7-a -mtune=cortex-a9 -mfpu=neon --sysroot=$SYSROOT -std=gnu99 -O2 -Wall"
command -v qemu-arm >/dev/null || { echo "ERROR: qemu-arm not found (qemu-user)"; exit 2; }
[ -x "$CC" ] || { echo "ERROR: $CC not found"; exit 2; }

W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
R="$W/root"
mkdir -p "$R/jci/lib" "$R/jci/settings" "$R/shim" "$R/other"
for d in lib usr etc; do
  if [ -e "$SYSROOT/$d" ]; then ln -s "$SYSROOT/$d" "$R/$d"; fi
done
set -e
"$CC" $A -shared -fPIC -DCLIENT -o "$R/jci/lib/libjcivbssettingsclient.so" "$FIXTURE"
"$CC" $A -shared -fPIC -DSERVICE -o "$R/jci/settings/svcjciblmsettings.so" "$FIXTURE" \
    -L"$R/jci/lib" -ljcivbssettingsclient
cp "$R/jci/settings/svcjciblmsettings.so" "$R/other/service.so"
"$CC" $A -o "$R/sm_svclauncher" "$FIXTURE" -ldl
cp "$SHIM" "$R/shim/shim.so"
set +e

FAILS=0
CHECKS=0
OUT=""

# run <config text or "-" for no file> <preload 0|1> <launcher arguments...>
run() {
  rm -f "$LOG" "$R/shim/libpatch.conf"
  [ "$1" = - ] || printf '%b' "$1" > "$R/shim/libpatch.conf"
  _env="LD_LIBRARY_PATH=/jci/lib"
  [ "$2" = 1 ] && _env="$_env,LD_PRELOAD=/shim/shim.so"
  shift 2
  OUT=$(QEMU_LD_PREFIX="$R" QEMU_SET_ENV="$_env" qemu-arm "$R/sm_svclauncher" "$@" 2>&1)
  RC=$?
  [ -f "$LOG" ] && OUT="$OUT
$(sed 's/^@[0-9]* /log: /' "$LOG")"
}
fail() { FAILS=$((FAILS + 1)); echo "    FAIL $*"; }
check() {  # check <name> <0|1: must contain> <pattern>
  CHECKS=$((CHECKS + 1))
  if echo "$OUT" | grep -q -- "$3"; then _has=1; else _has=0; fi
  if [ "$_has" != "$2" ]; then
    if [ "$2" = 1 ]; then fail "($1): missing: $3"; else fail "($1): unexpected: $3"; fi
    echo "$OUT" | sed 's/^/      | /'
  fi
}
exit_ok() { CHECKS=$((CHECKS + 1)); [ "$RC" = 0 ] || fail "($1): exit code $RC"; }
# untouched <name>: all four requests reached the original unchanged
untouched() {
  exit_ok "$1"
  check "$1" 1 'type=3 value=1 '
  check "$1" 1 'type=2 value=21 '
  check "$1" 1 'type=4 value=21 '
  check "$1" 1 'type=2 value=7 '
  check "$1" 0 'Display Characters'
}
# forced <name> <code>: both type 2 requests carry <code>, others are unchanged
forced() {
  exit_ok "$1"
  _n=$(echo "$OUT" | grep -c "type=2 value=$2 ")
  CHECKS=$((CHECKS + 1))
  if [ "$_n" != 2 ]; then
    fail "($1): type 2 with code $2: $_n of 2"
    echo "$OUT" | sed 's/^/      | /'
  fi
  check "$1" 1 'type=3 value=1 '
  check "$1" 1 'type=4 value=21 '
  check "$1" 1 'ret=42'
  check "$1" 1 'conn=0x11 .*info=572662306 cb=0x33 user=0x44'
}
SVC=/jci/settings/svcjciblmsettings.so

run - 0 "$SVC";                                    untouched "no shim"
run 'hud_display_language = off\n' 1 "$SVC";       untouched "off"
run - 1 "$SVC";                                    untouched "no config file"
check "no config file" 1 'log: config: cannot read'
run '# nothing\n' 1 "$SVC";                        untouched "no key"
run 'hud_display_code = 0\n' 1 "$SVC";             untouched "code 0"
run 'hud_display_code = 256\n' 1 "$SVC";           untouched "code 256"
check "code 256" 1 'log: config: unknown hud_display_code="256" -> off'
run 'hud_display_code = 7x\n' 1 "$SVC";            untouched "code with suffix"
run 'hud_display_code = -7\n' 1 "$SVC";            untouched "negative code"
run 'hud_display_code =\n' 1 "$SVC";               untouched "empty code"
run 'hud_display_language = 21\n' 1 "$SVC";        untouched "number as language"
run 'hud_display_language = english\n' 1 "$SVC";   untouched "unknown name"
check "unknown name" 1 'log: config: unknown hud_display_language="english" -> off'
run 'hud_display_language = en-ukx\n' 1 "$SVC";    untouched "name with suffix"
run 'hud_display_language = en\n' 1 "$SVC";        untouched "name prefix"
run 'hud_display_language =\n' 1 "$SVC";           untouched "empty value"

run 'hud_display_language = en-uk\n' 1 "$SVC";     forced "en-uk" 7
check "en-uk" 1 'log: Display Characters 21 -> 7'
run 'hud_display_language = EN_UK\n' 1 "$SVC";     forced "EN_UK" 7
run 'hud_display_code = 200\n' 1 "$SVC";           forced "code 200" 200
run 'hud_display_code = 255\n' 1 "$SVC";           forced "code 255" 255
run 'hud_display_code = 1\n' 1 "$SVC";             forced "code 1" 1
run 'hud_display_language = off\nhud_display_code = 9\n' 1 "$SVC";   forced "code without language" 9
run 'hud_display_language = hu\nhud_display_code = 9\n' 1 "$SVC";    forced "code wins" 9
run 'hud_display_code = 9\nhud_display_language = hu\n' 1 "$SVC";    forced "code wins, either order" 9
run 'hud_display_language = hu\nhud_display_code = 0\n' 1 "$SVC";    forced "code 0 keeps language" 21
run '# c\n\nother_key = 3\r\n  HUD_DISPLAY_LANGUAGE\t=\thu \r\n' 1 "$SVC"; forced "CRLF, spaces, comment" 21
run '#hud_display_language = de\nhud_display_language = fr\n' 1 "$SVC";    forced "commented out key" 8

# Every language of the shipped list, against the stock head-unit codes.
for pair in en-uk:7 en-us:4 en-au:2 ar:26 cs:19 da:16 de:9 es:11 es-mx:6 fi:18 fr:8 fr-ca:5 \
            hu:21 it:10 ja:1 nl:14 no:17 pl:23 pt:13 ru:12 sk:20 sv:15 tr:22 uk:27 zh-cn:24 zh-tw:25
do
  run "hud_display_language = ${pair%:*}\n" 1 "$SVC"; forced "language ${pair%:*}" "${pair#*:}"
done

# Not the settings service: passthrough, even with a language configured.
run 'hud_display_language = en-uk\n' 1 /other/service.so; untouched "other process"

# The original is not available yet: -1, no crash, then found on a later call.
run 'hud_display_language = en-uk\n' 1 direct
exit_ok "no original"
check "no original" 1 'ret=-1'
check "no original" 1 'log: original VBS_SETTINGS_SetCMUControlReq not found'
run 'hud_display_language = off\n' 1 direct /jci/lib/libjcivbssettingsclient.so
exit_ok "late original"
check "late original" 1 'ret=-1'
check "late original" 1 'ret=42'
check "late original" 1 'type=2 value=21 '

# Nothing runs at load time: no config read, no log file.
run 'hud_display_language = en-uk\n' 1 idle
exit_ok "idle"
CHECKS=$((CHECKS + 1))
[ ! -e "$LOG" ] || fail "(idle): log created at load"

# Log cap.
run 'hud_display_language = en-uk\n' 1 "$SVC"
head -c 40000 /dev/zero > "$LOG"
QEMU_LD_PREFIX="$R" QEMU_SET_ENV="LD_LIBRARY_PATH=/jci/lib,LD_PRELOAD=/shim/shim.so" \
  qemu-arm "$R/sm_svclauncher" "$SVC" >/dev/null 2>&1
CHECKS=$((CHECKS + 1))
[ "$(wc -c < "$LOG")" = 40000 ] || fail "(log cap)"
rm -f "$LOG"

# The head unit's glibc: only libc, libdl and libpthread, no symbol newer than GLIBC_2.4.
if [ -x "$READELF" ]; then
  _needed=$("$READELF" -d "$SHIM" | sed -n 's/.*(NEEDED).*\[\(.*\)\]/\1/p' | sort | tr '\n' ' ')
  CHECKS=$((CHECKS + 1))
  [ "$_needed" = "libc.so.6 libdl.so.2 libpthread.so.0 " ] || fail "(NEEDED): $_needed"
  _new=$("$READELF" -V "$SHIM" | sed -n 's/.*Name: GLIBC_\([0-9.]*\).*/\1/p' | sort -t. -k1,1n -k2,2n | tail -1)
  CHECKS=$((CHECKS + 1))
  case "$_new" in 2.4|2.[0-3]|2.[0-3].*) ;; *) fail "(glibc): needs GLIBC_$_new";; esac
fi

echo "cluster-language shim: $CHECKS checks, $FAILS failed"
[ "$FAILS" = 0 ]
