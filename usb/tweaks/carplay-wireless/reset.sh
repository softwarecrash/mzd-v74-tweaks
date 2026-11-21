#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1

. "$ROOT/lib/bundle.sh" || exit 1

case "${1:-}" in
    prepare)
        if [ -d "${MZD_RESET_DIR:-}" ]; then
            for extra in /data_persist/wcp_force_off /data_persist/wcp_bootcnt; do
                [ ! -f "$extra" ] || cp -p "$extra" "$MZD_RESET_DIR/" 2>/dev/null || :
            done
        fi
        ;;
esac

mzd_bundle_reset_main "$@" || exit $?

if [ "$1" = finish ]; then
    rm -f /data_persist/wcp_force_off /data_persist/wcp_bootcnt /tmp/wcp_board.log 2>/dev/null || :
fi
