#!/bin/sh
# Executed by the original ARM BusyBox shell inside the isolated VM only.
set -eu
BASE=/tmp/original-shell-packages
mkdir -p "$BASE/usb/tweaks/fixture" "$BASE/persist" "$BASE/bin"
cp -R /experiment/package/lib "$BASE/usb/lib"
sed -e 's|^id=.*|id=fixture|' -e 's|^version=.*|version=1.0.0|' \
    -e "s|^target=.*|target=$BASE/target|" \
    /experiment/package/tweaks/patch-example/manifest.conf > "$BASE/usb/tweaks/fixture/manifest.conf"
cat >> "$BASE/usb/tweaks/fixture/manifest.conf" <<'SETTINGS'
settings=limit
setting.limit.type=number
setting.limit.label=Limit
setting.limit.default=20
setting.limit.min=5
setting.limit.max=100
setting.limit.step=5
SETTINGS
cat > "$BASE/usb/tweaks/fixture/run.sh" <<'WORKER'
#!/bin/sh
set -eu
HERE=$(CDPATH= cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH= cd "$HERE/../.." && pwd)
. "$ROOT/lib/fixture.sh"
. "$ROOT/lib/settings.sh"
TARGET=/tmp/original-shell-packages/target
case "$1" in
status) if [ ! -e "$TARGET" ]; then echo uninstalled; elif [ "$(cat "$TARGET")" = "$VALUE" ]; then echo installed; else echo broken; fi ;;
install) if [ -f "$TARGET.fail" ]; then printf 'fixture install failure: configuration refused\n' >&2; exit 1; fi; printf '%s\n' "$VALUE" > "$TARGET"; mzd_setting limit > "$TARGET.options" ;;
uninstall) [ "$(cat "$TARGET")" = "$VALUE" ]; [ "$(cat "$TARGET.options")" = "$(mzd_setting limit)" ]; rm "$TARGET" "$TARGET.options" ;;
*) exit 1 ;;
esac
WORKER
printf 'VALUE=original\n' > "$BASE/usb/lib/fixture.sh"
sed -e "s|^MZD_PACKAGE_STORE=.*|MZD_PACKAGE_STORE=$BASE/persist/installed|" \
    -e "s|^MZD_PACKAGE_MOUNT=.*|MZD_PACKAGE_MOUNT=$BASE/persist|" \
    -e "s|^MZD_PACKAGE_MOUNTS=.*|MZD_PACKAGE_MOUNTS=$BASE/mounts|" \
    -e "s|^MZD_PACKAGE_LOCK=.*|MZD_PACKAGE_LOCK=$BASE/lock|" \
    "$BASE/usb/lib/packages.sh" > "$BASE/packages.next"
mv "$BASE/packages.next" "$BASE/usb/lib/packages.sh"
printf '/dev/test %s/persist relfs rw 0 0\n/dev/usb %s/usb vfat rw 0 0\n' "$BASE" "$BASE" > "$BASE/mounts"
cat > "$BASE/bin/df" <<'DF'
#!/bin/sh
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 1000000 100000 900000 10%% persist\n'
DF
printf '#!/bin/sh\nexit 0\n' > "$BASE/bin/sync"
chmod 700 "$BASE/bin/df" "$BASE/bin/sync"
PATH="$BASE/bin:$PATH"; export PATH
. "$BASE/usb/lib/manifest.sh"
. "$BASE/usb/lib/packages.sh"
mzd_package_action "$BASE/usb" fixture install limit=35
[ "$(cat "$BASE/target.options")" = 35 ]
[ "$(cat "$BASE/target")" = original ]
[ "$(mzd_package_action "$BASE/usb" fixture status)" = installed ]
# If an uninstall accidentally sourced the replacement USB helper, it would fail.
printf 'exit 97\n' > "$BASE/usb/lib/fixture.sh"
[ "$(mzd_package_action "$BASE/usb" fixture status)" = installed ]
mzd_package_action "$BASE/usb" fixture uninstall
[ ! -e "$BASE/target" ]
[ ! -e "$BASE/persist/installed/fixture" ]
[ ! -e "$BASE/lock" ]
# A later status must retain the actual failure, using only factory commands.
printf 'VALUE=original\n' > "$BASE/usb/lib/fixture.sh"
: > "$BASE/target.fail"
if mzd_package_action "$BASE/usb" fixture install; then exit 1; else [ "$?" = 1 ]; fi
[ -f "$BASE/persist/installed/fixture/failure.log" ]
[ "$(mzd_package_action "$BASE/usb" fixture status 2> "$BASE/reason")" = broken ]
grep -q 'phase=install' "$BASE/reason"
grep -q 'exit_code=1' "$BASE/reason"
grep -q 'fixture install failure: configuration refused' "$BASE/reason"
[ ! -e "$BASE/lock" ]
echo ORIGINAL_FAILURE_DIAGNOSTICS_PASSED
echo ORIGINAL_SHELL_PACKAGES_PASSED
