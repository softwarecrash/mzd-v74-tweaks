#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
. "$HERE/diagnostics.sh" || exit 1
mzd_bundle_reset_main "$@"
code=$?
if [ "$code" = 0 ] && [ "${1:-}" = finish ]; then driver_diagnostics_remove || code=1; fi
exit "$code"
