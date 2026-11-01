#!/bin/sh
# Fuel Consumption Values for Mazda firmware 74.00.324.
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
    echo 'Usage: sh run.sh <install|uninstall|status>'
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
    install|uninstall|status)
        ;;
    *)
        echo 'Unknown action. Use install, uninstall or status.' >&2
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

# Metadata and execution settings have one source of truth.
mzd_manifest_load "$HERE/manifest.conf" || exit 1
PATCH_FILE="$HERE/assets/change.patch"

# Declared dependencies/conflicts are enforced for direct CLI calls as well.
if [ "$ACTION" = status ]; then
    mzd_read_status
    exit $?
fi
# Recheck immediately before opening a modifying session.
mzd_action_preflight || exit 1

# --- Execution flow -------------------------------------------------------
# Open USB reports and register cleanup before acquiring a lock. Cleanup restores
# only the mount/watchdog state changed by this invocation, including on failure.
mzd_begin "$SELF" "$ID" mzd_system_cleanup
mzd_system_begin
mzd_require_tools awk md5sum cp cmp || exit 1
mzd_require_assets "$SELF" "$HERE/manifest.conf" || exit 1
mzd_validate_firmware "$FIRMWARE" || exit 1
mzd_system_lock "$LOCK" || exit 1

# Probe both patch directions on USB copies before making the target writable.
# Keep a complete pre-change copy so rollback preserves other installed tweaks.
CONTEXT="$MZD_REPORT/target"
mzd_patch_prepare "$APP" "$PATCH_FILE" "$ORIGINAL" "$CONTEXT" || exit 1
STATE=$(mzd_patch_state "$CONTEXT") || exit 1


# Repeated install/uninstall is a successful no-op for the patch itself.
NO_CHANGE=0
case "$ACTION:$STATE" in
    install:installed|uninstall:uninstalled) NO_CHANGE=1 ;;
esac
if [ "$NO_CHANGE" = 0 ]
then
    mzd_patch_validate_backup "$CONTEXT" || exit 1
fi

# Apply only this tweak's diff. Uninstall reverses that diff and keeps other
# modifications in the same target file; it does not restore the whole OEM file.
USB=$MZD_USB
REPORT=$MZD_REPORT
mzd_report_start
: # No service-specific preparation.
if [ "$NO_CHANGE" = 0 ]
then
    mzd_system_watchdog_disable || exit 1
    mzd_system_remount_rw / || exit 1
    mzd_patch_apply "$CONTEXT" "$ACTION" || exit $?
fi
: # No service-specific completion.

# Report completion; the launcher owns dialogs and any reboot decision.
if [ "$NO_CHANGE" = 1 ]
then
    MZD_SUCCESS="Requested setting is already present.
Reports: $MZD_REPORT"
else
    MZD_SUCCESS="$MZD_ACTION_LABEL completed. Other changes were preserved.
Reports: $MZD_REPORT"
fi
