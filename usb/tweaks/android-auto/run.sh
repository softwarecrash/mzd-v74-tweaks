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

mzd_bundle_main "$@"
