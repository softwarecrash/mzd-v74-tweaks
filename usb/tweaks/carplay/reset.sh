#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
mzd_bundle_reset_main "$@"
