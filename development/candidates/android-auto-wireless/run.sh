#!/bin/sh
# Uses the standard USB layout after copying this development candidate.
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ]; then
    . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1
fi
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
usage() { printf 'Usage: run.sh install|uninstall|status|preflight\n'; }
case "${1:-}" in ''|--help|-h) [ "$#" -le 1 ] || exit 1; usage; exit 0 ;; esac
[ "$#" = 1 ] || { usage >&2; exit 1; }
case "$1" in install|uninstall|status|preflight) ;; *) usage >&2; exit 1 ;; esac
. "$ROOT/lib/manifest.sh" || exit 1
mzd_manifest_load "$HERE/manifest.conf" || exit 1
. "$HERE/upstream.sh" || exit 1
case "$1" in
    status) mzd_aaw_status ;;
    preflight) mzd_aaw_preflight ;;
    install) mzd_aaw_install ;;
    uninstall) mzd_aaw_uninstall ;;
esac
