#!/bin/sh
# Remove Safety Warnings private draft for Mazda firmware 74.00.324.
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
. "$ROOT/lib/restore.sh" || exit 1
. "$ROOT/lib/shim.sh" || exit 1
. "$HERE/camera.sh" || exit 1
if [ "$ACTION" = status ]; then warnings_status; exit $?; fi
state=$(warnings_status) || exit 1
case "$state" in installed|uninstalled) ;; *) printf 'Unsupported or incomplete safety-warning state; nothing changed.\n' >&2; exit 1 ;; esac
WARNINGS_COMMITTED=0
mzd_begin "$SELF" "$ID" warnings_cleanup
mzd_system_begin
mzd_require_tools awk md5sum cp cmp cut patch diff readlink dirname mv cat sync || exit 1
mzd_validate_firmware "$FIRMWARE" || exit 1
mzd_system_lock "$LOCK" || exit 1
mzd_system_lock "$CAMERA_LOCK" || exit 1
warnings_plan || mzd_fail 'Cannot prepare all safety-warning files; nothing changed.'
mzd_report_start
if [ "$ACTION:$startup" != install:installed ] && [ "$ACTION:$startup" != uninstall:uninstalled ]; then
    mzd_system_watchdog_disable || exit 1
    mount_point=$(mzd_shim_mount "$APP") || exit 1
    mzd_system_remount_rw "$mount_point" || exit 1
    mount_point=$(mzd_shim_mount "$CAMERA_ROOT") || exit 1
    mzd_system_remount_rw "$mount_point" || exit 1
    warnings_apply || mzd_fail 'Safety-warning transaction failed; restoring entry state.'
else WARNINGS_COMMITTED=1; fi
MZD_SUCCESS="Startup disclaimer and 46 camera warning images verified. Restart to apply.
Reports: $MZD_REPORT"
