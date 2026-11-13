#!/bin/sh
# Original CMU tools against isolated paths. The real shim .so is NOT loaded.
set -eu
PATH=/fixture/bin:/experiment/bin:/bin:/usr/bin
export PATH
mkdir -p /fixture/persist
/bin/mount -t tmpfs -o size=64m tmpfs /fixture/persist
echo CLUSTER_NATIVE_SETUP_READY
ROOT=/fixture/usb
worker="$ROOT/tweaks/cluster-language/run.sh"
MZD_WORKER_DIRECT=1
MZD_SETTINGS_FILE=/fixture/settings.conf
export MZD_WORKER_DIRECT MZD_SETTINGS_FILE
. "$ROOT/lib/settings.sh"
mzd_settings_normalize "$ROOT/tweaks/cluster-language/manifest.conf" > "$MZD_SETTINGS_FILE"
sh "$worker" preflight
echo CLUSTER_NATIVE_PREFLIGHT_PASSED
echo CLUSTER_NATIVE_INSTALL_START
sh "$worker" install
echo CLUSTER_NATIVE_INSTALL_PASSED
[ "$(sh "$worker" status)" = installed ]
payload=/fixture/persist/mzd-tweaks/shims/cluster-language
cmp -s "$payload/libpatch-svcjciblmsettings.so" "$ROOT/tweaks/cluster-language/assets/libpatch-svcjciblmsettings.so"
grep -q '^hud_display_language = off$' "$payload/libpatch.conf"
for config in /fixture/internal/sm.conf /fixture/internal/sm_WCP.conf; do
    grep -q 'env_name="LD_PRELOAD"' "$config"
    cmp -s "$config.org" "/fixture/original-${config##*/}"
done
echo CLUSTER_NATIVE_UNINSTALL_START
sh "$worker" uninstall
echo CLUSTER_NATIVE_UNINSTALL_PASSED
[ "$(sh "$worker" status)" = uninstalled ]
[ ! -d "$payload" ]
cmp -s /fixture/internal/sm.conf /fixture/original-sm.conf
cmp -s /fixture/internal/sm_WCP.conf /fixture/original-sm_WCP.conf
[ "$(cat /fixture/watchdog)" = 0 ]
[ ! -d /tmp/mzd-sm-config-tweak.lock ]
echo ORIGINAL_CLUSTER_WORKER_PASSED
