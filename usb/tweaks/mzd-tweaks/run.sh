#!/bin/sh
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ]; then . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1; fi
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
mzd_bundle_main "$@"
