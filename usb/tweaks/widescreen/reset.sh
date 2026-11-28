#!/bin/sh
# Restore originals hook for widescreen: verifies and removes created CSS and font files.
set -u
[ "$#" = 1 ] || exit 1
case "$1" in check|prepare|finish) phase=$1 ;; *) exit 1 ;; esac
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
for lib in report system manifest shim; do . "$ROOT/lib/$lib.sh" || exit 1; done
mzd_manifest_load "$HERE/manifest.conf" || exit 1
mzd_validate_firmware "$FIRMWARE" || exit 1

GUI_CSS_DIR=/jci/gui/common/css
FONT_DIR=/jci/fonts/CHN

widescreen_reset_pairs() {
    printf '%s\t%s\n' "$GUI_CSS_DIR/widescreen.css" "$HERE/assets/widescreen.css"
    printf '%s\t%s\n' "$FONT_DIR/SairaExtraCondensed-Regular.ttf" "$HERE/assets/fonts/SairaExtraCondensed-Regular.ttf"
    printf '%s\t%s\n' "$FONT_DIR/SairaExtraCondensed-Medium.ttf" "$HERE/assets/fonts/SairaExtraCondensed-Medium.ttf"
}

if [ "$phase" != check ]; then
    [ "${ACTION:-}" = run ] && [ -d "${MZD_RESET_DIR:-}" ] && [ -d "${MZD_SYSTEM:-}" ] || exit 1
fi

tab=$(printf '\t')
while IFS="$tab" read -r target asset; do
    mzd_asset_readable "$asset" || exit 1
    mzd_shim_parent_ok "$target" || exit 1
    if [ -e "$target" ] || [ -L "$target" ]; then
        mzd_asset_readable "$target" && cmp -s "$target" "$asset" || {
            printf 'Unknown or altered widescreen file: %s\n' "$target" >&2
            exit 1
        }
        [ "$phase" != finish ] || {
            mount_point=$(mzd_shim_mount "$target") || exit 1
            mzd_system_remount_rw "$mount_point" || exit 1
            rm -f "$target" || exit 1
        }
    fi
done <<EOF
$(widescreen_reset_pairs)
EOF
