#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1

. "$ROOT/lib/manifest.sh" || exit 1
. "$ROOT/lib/report.sh" || exit 1
. "$ROOT/lib/system.sh" || exit 1
. "$ROOT/lib/vehicle.sh" || exit 1
. "$ROOT/lib/bundle.sh" || exit 1

mzd_bundle_prerequisites() (
    # Never install Wireless CarPlay beside standalone modifications.
    records=$(mzd_components records) || exit 1
    gbt_target=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="patch" && $3=="assets/get_board_type.patch"{print $2}') || exit 1
    gbt_stock=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="patch" && $3=="assets/get_board_type.patch"{print $5}') || exit 1
    autostart_target=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="patch" && $3=="assets/autostart.patch"{print $2}') || exit 1

    [ -f "$gbt_target" ] && [ ! -L "$gbt_target" ] && [ -f "$autostart_target" ] && [ ! -L "$autostart_target" ] || {
        printf 'block\tA required system script is missing or linked.\n'
        exit 0
    }

    if grep -Fq '# WCP mod: do not create ublox.txt' "$autostart_target"; then
        printf 'block\tAnother Wireless CarPlay mod is already referenced. Uninstall it with its original installer before using this tweak.\n'
        exit 0
    fi

    if [ "$(mzd_hash "$gbt_target")" != "$gbt_stock" ]; then
        if ! grep -Fq '# MZD Tweaks' "$gbt_target"; then
            printf 'block\tAnother Wireless CarPlay mod is already referenced. Uninstall it with its original installer before using this tweak.\n'
            exit 0
        fi
    fi

    hw_type=$(mzd_vehicle_wcp_hardware)
    case "$hw_type" in
        native_wcp)
            printf 'block\tVehicle has newer hardware revision with native wireless CP; mod is not required.\n'
            ;;
        legacy)
            printf 'info\tLegacy CMU150 hardware detected; Wireless CarPlay is supported.\n'
            ;;
        *)
            printf 'block\tUnable to determine CMU hardware type (GPIO unreadable or invalid).\n'
            ;;
    esac
)

case "${1:-}" in
    install)
        if [ "${MZD_WORKER_DIRECT:-0}" = 1 ]; then
            rm -f /data_persist/wcp_force_off /data_persist/wcp_bootcnt /data_persist/ublox.txt 2>/dev/null || :
        fi
        ;;
    uninstall)
        if [ "${MZD_WORKER_DIRECT:-0}" = 1 ]; then
            rm -f /data_persist/wcp_force_off /tmp/wcp_board.log 2>/dev/null || :
        fi
        ;;
esac

mzd_bundle_main "$@"
