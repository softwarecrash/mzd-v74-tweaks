#!/bin/sh
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ];then . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1;fi
# Touch While Driving for Mazda firmware 74.00.324.
# Launcher worker; shared runtime helpers are in ../../lib/.
#
# Reading guide:
#   1. Validate the requested action without changing the system.
#   2. Define local reporting, system-state and patch helpers.
#   3. Load this tweak's configuration from manifest.conf.
#   4. Run the installation flow at the end of the file.
# The manifest describes the tweak for discovery; this script executes it.
set -u

# Help and invalid actions return before reports, mounts or system changes.
mzd_worker_usage() {
    echo 'Usage: sh run.sh <install|uninstall|status|preflight>'
    echo 'No arguments or --help: show usage without changing anything.'
}

if [ "$#" -gt 1 ]
then
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
    install|uninstall|status|preflight)
        ;;
    *)
        echo 'Unknown action. Use install, uninstall, status or preflight.' >&2
        exit 1
        ;;
esac

# Run directly from the ready-to-use repository; no build step is needed.
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")

# Load the shared runtime from the ready-to-run USB layout.
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
# Public actions go through persistent package management. The controller
# sets MZD_WORKER_DIRECT only for its saved worker and deep inspection calls.
if [ "${MZD_WORKER_DIRECT:-}" != 1 ] && [ "$ACTION" != preflight ]; then
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

# Metadata and execution settings have one source of truth.
mzd_manifest_load "$HERE/manifest.conf" || exit 1
PATCH_FILE="$HERE/assets/change.patch"

. "$ROOT/lib/settings.sh" || exit 1
. "$HERE/touch.sh" || exit 1

touch_preflight() {
    touch_require || return 1
    if [ "$(touch_read lvds_speed_restriction)" = disable ]; then
        printf 'info\tTouchscreen while driving is already enabled. Install to disable additional menu operation restriction.\n'
    fi
}

if [ "$ACTION" = preflight ]; then
    touch_preflight
    exit $?
fi

if [ "$ACTION" = status ]; then mzd_read_status; exit $?; fi
mzd_action_preflight || exit 1
mzd_settings_check "$HERE/manifest.conf" "${MZD_SETTINGS_FILE:-/dev/null}" || exit 1
BUS_MODE=$(mzd_setting general_speed_restriction) || exit 1
mzd_begin "$SELF" "$ID" touch_cleanup
mzd_system_begin
mzd_validate_firmware "$FIRMWARE" || exit 1
mzd_system_lock "$LOCK" || exit 1
touch_require || mzd_fail 'Touch prerequisites changed; nothing modified.'
CONTEXT="$MZD_REPORT/target"
mzd_patch_prepare "$APP" "$PATCH_FILE" "$ORIGINAL" "$CONTEXT" || exit 1
STATE=$(mzd_patch_state "$CONTEXT") || exit 1
mzd_patch_validate_backup "$CONTEXT" || exit 1
mzd_report_start
ENTRY_BUS=$(touch_read bus_bcm_speed_restriction) || exit 1
ENTRY_LVDS=$(touch_read lvds_speed_restriction) || exit 1
# Persist the baseline before any NVRAM or GUI change. Never recapture it.
if [ -e "$TOUCH_STATE" ]; then
    touch_baseline || mzd_fail 'Original settings backup is invalid.'
elif [ "$ACTION:$STATE" = install:uninstalled ]; then
    mzd_system_remount_rw /tmp/mnt/resources || exit 1
    mkdir -p "$(dirname "$TOUCH_STATE")" || exit 1
    mkdir "$TOUCH_STATE" || exit 1
    BASE_BUS=$ENTRY_BUS; BASE_LVDS=$ENTRY_LVDS
    DESIRED_BUS=$BASE_BUS
    [ "$BUS_MODE" != disabled ] || DESIRED_BUS=disable
    printf 'mzd-touch-v1\n%s\n%s\n%s\n' "$BASE_BUS" "$BASE_LVDS" "$DESIRED_BUS" > "$MZD_REPORT/new-original-settings.txt" || exit 1
    cp "$MZD_REPORT/new-original-settings.txt" "$TOUCH_STATE/original.txt" &&
        cmp -s "$MZD_REPORT/new-original-settings.txt" "$TOUCH_STATE/original.txt" || exit 1
    sync
    touch_baseline || mzd_fail 'Cannot verify the original settings backup.'
else
    [ "$ACTION:$STATE" = uninstall:uninstalled ] || mzd_fail 'No original settings backup; legacy installations are not adopted.'
    MZD_SUCCESS="Touch tweak is already absent. Reports: $MZD_REPORT"
    exit 0
fi
cp "$TOUCH_STATE/original.txt" "$MZD_REPORT/original-settings.txt" &&
    cmp -s "$TOUCH_STATE/original.txt" "$MZD_REPORT/original-settings.txt" || exit 1
if [ "$ACTION" = install ]; then
    WANT_BUS=$DESIRED_BUS; WANT_LVDS=disable
else
    WANT_BUS=$BASE_BUS; WANT_LVDS=$BASE_LVDS
fi
mzd_system_watchdog_disable || exit 1
mzd_system_remount_rw / || exit 1
mzd_system_remount_rw /tmp/mnt/resources || exit 1
TOUCH_ACTIVE=1
# Always commit through the OEM setters, even when live keys already match.
touch_pair "$WANT_BUS" "$WANT_LVDS" || mzd_fail 'NVRAM update failed; restoring entry state.'
mzd_patch_apply "$CONTEXT" "$ACTION" || exit $?
TOUCH_ACTIVE=0
if [ "$ACTION" = uninstall ]; then touch_remove || mzd_fail 'Settings restored, but backup cleanup failed.'; fi
MZD_SUCCESS="Touch settings and GUI patch verified. Restart to apply. Reports: $MZD_REPORT"

