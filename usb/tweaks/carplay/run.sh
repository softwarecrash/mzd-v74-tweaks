#!/bin/sh
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ];then . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1;fi
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1

mzd_bundle_patch() {
    patch_source=$1; patch_target=$2
    display_size=$(mzd_setting display_size) || return 1
    width=${display_size%x*}
    height=${display_size#*x}
    awk -v w="$width" -v h="$height" '
        /^\+[ \t]*<screenInfo/ {
            sub(/heightPhysical="[0-9]+"/, "heightPhysical=\"" h "\"")
            sub(/widthPhysical="[0-9]+"/, "widthPhysical=\"" w "\"")
        }
        { print }
    ' "$patch_source" > "$patch_target" || return 1
}

mzd_bundle_main "$@"
