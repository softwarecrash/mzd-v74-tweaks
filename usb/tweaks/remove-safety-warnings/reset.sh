#!/bin/sh
# Restore originals handles the .org files; this hook verifies image ownership.
set -u
[ "$#" = 1 ] || exit 1
case "$1" in check|prepare|finish) phase=$1 ;; *) exit 1 ;; esac
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
for lib in report system manifest shim; do . "$ROOT/lib/$lib.sh" || exit 1; done
mzd_manifest_load "$HERE/manifest.conf" || exit 1
. "$HERE/camera.sh" || exit 1
mzd_validate_firmware "$FIRMWARE" && camera_assets || exit 1
if [ "$phase" != check ]; then
    [ "${ACTION:-}" = run ] && [ -d "${MZD_RESET_DIR:-}" ] && [ -d "${MZD_SYSTEM:-}" ] || exit 1
fi
tab=$(printf '\t')
while IFS="$tab" read -r name hash asset; do
    target="$CAMERA_ROOT/$name"
    mzd_shim_parent_ok "$target" && mzd_asset_readable "$target" || exit 1
    if [ -e "$target.org" ] || [ -L "$target.org" ]; then
        mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$hash" ] || exit 1
    fi
    if [ "$(mzd_hash "$target")" != "$hash" ]; then
        [ "$phase" != finish ] && cmp -s "$target" "$HERE/assets/$asset" &&
            mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$hash" ] || {
            printf 'Unknown or unrestored camera image: %s\n' "$target" >&2; exit 1;
        }
    fi
done < "$CAMERA_TABLE"
if [ "$phase" = prepare ]; then
    cp "$CAMERA_TABLE" "$MZD_RESET_DIR/camera-images.tsv" &&
        cmp -s "$CAMERA_TABLE" "$MZD_RESET_DIR/camera-images.tsv" || exit 1
fi
