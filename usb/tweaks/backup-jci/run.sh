#!/bin/sh
# Read-only JCI backup. No root remount, watchdog changes, dialogs or reboot.
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
EXPORT_SOURCE='/jci'
EXPORT_TOOLS='zip unzip mktemp'
EXPORT_OWN_FILES='jci.zip'  # written by this export, not copied: gets the real date
EXPORT_MIN_KB=174080
mzd_export_run() {
    mzd_export_progress 0 0 'Creating JCI backup'
    source_parent=$(dirname "$EXPORT_SOURCE"); source_name=${EXPORT_SOURCE##*/}
    (cd "$source_parent" && zip -q -r -y "$EXPORT_PARTIAL/jci.zip" "$source_name") >> "$EXPORT_PARTIAL/run.log" 2>&1 || {
        printf 'JCI archive creation failed. See the incomplete export run.log.\n' >&2; return 1;
    }
    mzd_export_progress 0 0 'Verifying JCI backup'
    unzip -t "$EXPORT_PARTIAL/jci.zip" >> "$EXPORT_PARTIAL/run.log" 2>&1 || {
        printf 'JCI archive integrity check failed.\n' >&2; return 1;
    }
}
. "$ROOT/lib/export.sh" || exit 1
mzd_export_main "$@"
