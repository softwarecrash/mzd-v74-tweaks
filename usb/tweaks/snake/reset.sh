#!/bin/sh
SELF=$(readlink -f "$0") || exit 1
. "$(dirname "$SELF")/../../lib/gui-extension.sh" || exit 1
mzd_gui_reset "$@"
