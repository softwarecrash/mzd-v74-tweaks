#!/bin/sh
set -u

mzd_worker_usage() {
    echo 'Usage: sh run.sh <install|uninstall|status>'
    echo 'No arguments or --help: show usage without changing anything.'
}

if [ "$#" -gt 1 ]; then
    echo 'Expected exactly one action, or no arguments for usage.' >&2
    mzd_worker_usage >&2
    exit 1
fi
ACTION=${1:-}
case "$ACTION" in
    ''|--help|-h)
        mzd_worker_usage
        exit 0
        ;;
    install|uninstall|status)
        ;;
    *)
        echo 'Unknown action. Use install, uninstall or status.' >&2
        exit 1
        ;;
esac

SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1

if [ "${MZD_WORKER_DIRECT:-}" != 1 ]; then
    exec sh "$ROOT/installer.sh" action "$(basename "$HERE")" "$ACTION"
fi

for library in manifest report system patch status; do
    file="$ROOT/lib/$library.sh"
    [ -f "$file" ] && [ ! -L "$file" ] && [ -r "$file" ] || {
        printf 'ERROR: Missing or unreadable library: %s\n' "$library" >&2
        exit 1
    }
    . "$file" || exit 1
done
. "$ROOT/lib/vehicle.sh" || exit 1

mzd_manifest_load "$HERE/manifest.conf" || exit 1
PATCH_FILE="$HERE/assets/change.patch"

mzd_check_prerequisites() {
    case "${MZD_PACKAGE_STATE:-}" in
        uninstalling|restoring)
            return 0 ;;
    esac
    case "$ACTION" in
        status|install)
            # mzd_vehicle_hud always exits 0; it encodes dbus failures as the string 'unknown'.
            hud=$(mzd_vehicle_hud)
            case "$hud" in
                WHUD_color)
                    printf 'Detected compatible color windshield HUD.\n' >&2
                    return 0 ;;
                CHUD_mono) printf 'Detected unsupported Combiner HUD (monochrome).\n' >&2 ;;
                CHUD_color) printf 'Detected unsupported Combiner HUD (color).\n' >&2 ;;
                none) printf 'This vehicle has no HUD.\n' >&2 ;;
                unknown|*) printf 'Unable to detect the HUD type and determine compatibility.\n' >&2 ;;
            esac
            return 1 ;;
        *)
            return 0 ;;
    esac
}

if [ "$ACTION" = status ]; then
    mzd_read_status
    exit $?
fi
mzd_action_preflight || exit 1

mzd_begin "$SELF" "$ID" mzd_system_cleanup
mzd_system_begin
mzd_require_tools awk md5sum cp cmp || exit 1
mzd_require_assets "$SELF" "$HERE/manifest.conf" "$PATCH_FILE" || exit 1
mzd_validate_firmware "$FIRMWARE" || exit 1
mzd_system_lock "$LOCK" || exit 1

CONTEXT="$MZD_REPORT/target"
mzd_patch_prepare "$APP" "$PATCH_FILE" "$ORIGINAL" "$CONTEXT" || exit 1
STATE=$(mzd_patch_state "$CONTEXT") || exit 1

NO_CHANGE=0
case "$ACTION:$STATE" in
    install:installed|uninstall:uninstalled) NO_CHANGE=1 ;;
esac
if [ "$NO_CHANGE" = 0 ]; then
    mzd_patch_validate_backup "$CONTEXT" || exit 1
fi

USB=$MZD_USB
REPORT=$MZD_REPORT
mzd_report_start
if [ "$NO_CHANGE" = 0 ]; then
    mzd_system_watchdog_disable || exit 1
    mzd_system_remount_rw / || exit 1
    mzd_patch_apply "$CONTEXT" "$ACTION" || exit $?
fi

if [ "$NO_CHANGE" = 1 ]; then
    MZD_SUCCESS="Requested setting is already present.
Reports: $MZD_REPORT"
else
    MZD_SUCCESS="$MZD_ACTION_LABEL completed. Other changes were preserved.
Reports: $MZD_REPORT"
fi
