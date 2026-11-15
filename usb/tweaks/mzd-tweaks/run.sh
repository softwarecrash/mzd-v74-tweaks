#!/bin/sh
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ];then . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1;fi
SELF=$(readlink -f "$0") || exit 1
. "$(dirname "$SELF")/../../lib/gui-extension.sh" || exit 1
mzd_gui_main "$@"
