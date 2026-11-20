#!/bin/sh
# Explicit file-backup reset; no reboot, GUI or automatic repair.
set -u
case "${1:-}" in
    ''|-h|--help) [ "$#" -le 1 ] || exit 1; printf 'Usage: sh run.sh <run|status>\n'; exit 0 ;;
    run|status) [ "$#" = 1 ] || exit 1 ;;
    *) printf 'Unsupported action. Use run or status.\n' >&2; exit 1 ;;
esac
ACTION=$1
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
for library in manifest report system export restore; do
    . "$ROOT/lib/$library.sh" || exit 1
done
mzd_manifest_load "$HERE/manifest.conf" || exit 1
EXPORT_SOURCE='/jci'
EXPORT_TOOLS='md5sum cmp cut sort mktemp'
if [ "$ACTION" = status ]; then
    reason=$(mzd_export_check status 2>&1); code=$?
    case "$code" in
        0) printf 'uninstalled\n' ;;
        2) printf 'unavailable\n'; printf '%s\n' "$reason" >&2 ;;
        *) printf '%s\n' "$reason" >&2; exit 1 ;;
    esac
    exit 0
fi
mzd_export_check status || exit 1
mzd_begin "$SELF" "$ID" mzd_restore_cleanup
mzd_system_begin
RESTORE_COMMITTED=0
: > "$MZD_REPORT/changed"
: > "$MZD_REPORT/hooks"
mzd_system_lock /tmp/mzd-restore-originals.lock || exit 1
mzd_restore_run
