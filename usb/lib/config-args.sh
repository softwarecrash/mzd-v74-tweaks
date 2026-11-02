#!/bin/sh
# Source before the worker argument check. Normal actions need no config work.
if [ "${1:-}" = uninstall ] && [ "$#" = 2 ] && [ "$2" = --preserve-config ]; then
    config_worker=$(readlink -f "$0") || exit 1
    . "${config_worker%/*}/../../lib/manifest.sh" || exit 1
    mzd_manifest_load "${config_worker%/*}/manifest.conf" || exit 1
    [ -n "$CONFIGS" ] || { printf 'This tweak has no declared config.\n' >&2;exit 1; }
    MZD_PRESERVE_CONFIG=1;export MZD_PRESERVE_CONFIG
    set -- uninstall
fi
