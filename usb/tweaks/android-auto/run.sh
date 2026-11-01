#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
. "$ROOT/lib/vehicle.sh" || exit 1

mzd_bundle_prerequisites() {
    # mzd_vehicle_hud always exits 0; it encodes dbus failures as the string 'unknown'.
    hud=$(mzd_vehicle_hud)
    case "$hud" in
        WHUD_color)
            printf 'Detected supported Windshield HUD. Displaying street names should work.\n'
            ;;
        CHUD_mono)
            printf 'warning\tDetected Combiner HUD (monochrome). Displaying street names will not work.\n'
            ;;
        CHUD_color)
            printf 'warning\tDetected Combiner HUD (color). Displaying street names will not work.\n'
            ;;
        none)
            printf 'warning\tThis vehicle has no HUD. Displaying navigation information will not work.\n'
            ;;
        unknown|*)
            printf 'warning\tUnknown HUD type. Displaying street names may not work.\n'
            ;;
    esac
    return 0
}

mzd_bundle_patch() {
    patch_source=$1; patch_target=$2
    dpi=$(mzd_setting resolution_dpi) || return 1
    par=$(mzd_setting resolution_par) || return 1
    awk -v dpi="$dpi" -v par="$par" '
        /^-[ \t]*<density>141<\/density>/ { if (dpi == "141") next }
        /^\+[ \t]*<density>/ {
            if (dpi == "141") { sub(/^\+/, " "); print; next }
            sub(/<density>[0-9]+<\/density>/, "<density>" dpi "</density>")
        }
        /^\+[ \t]*<real_density>/ { sub(/<real_density>[0-9]+<\/real_density>/, "<real_density>" dpi "</real_density>") }
        /^\+[ \t]*<par>/ { sub(/<par>[0-9]+<\/par>/, "<par>" par "</par>") }
        { print }
    ' "$patch_source" > "$patch_target" || return 1
}

mzd_bundle_main "$@"
