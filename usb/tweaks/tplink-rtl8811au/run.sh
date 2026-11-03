#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
USB_DEVICES=/sys/bus/usb/devices
. "$ROOT/lib/bundle.sh" || exit 1

mzd_bundle_prerequisites() (
    # The cmu150-rtl8811au install guide adds the same boot entry and files by
    # hand. Never add a second load_wlan1 service or adopt files this package
    # did not write. The entry and files are this package's own only while it
    # is registered as installed (an older version during an upgrade).
    . "$ROOT/lib/packages.sh" || exit 1
    state=
    if [ -e "$MZD_PACKAGE_STORE/$ID" ] || [ -L "$MZD_PACKAGE_STORE/$ID" ]; then
        state=$(mzd_package_state "$MZD_PACKAGE_STORE/$ID") || exit 1
    fi
    if [ "$state" != installed ]; then
        records=$(mzd_components records) || exit 1
        configs=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="patch"{print $2}') || exit 1
        for config in $configs; do
            [ -f "$config" ] && [ ! -L "$config" ] || {
                printf 'block\tA required service configuration is missing or linked.\n'; exit 0;
            }
            if grep -q 'name="load_wlan1"' "$config"; then
                printf 'block\tA load_wlan1 boot entry is already in %s, probably added by hand from the cmu150-rtl8811au install guide. Remove it as described in that guide (Uninstall) before using this tweak.\n' "$config"
                exit 0
            fi
        done
        if [ -e "$PAYLOAD_DIR" ] || [ -L "$PAYLOAD_DIR" ]; then
            printf 'block\t%s already exists, probably from a driver installed by hand. Remove it as described in the cmu150-rtl8811au install guide (Uninstall) before using this tweak.\n' "$PAYLOAD_DIR"
            exit 0
        fi
    fi
    # Informational only: the external USB hub follows ACC/ignition, so the
    # adapter is often not powered while the installer runs.
    found=
    for device in "$USB_DEVICES"/*; do
        [ -r "$device/idVendor" ] && [ -r "$device/idProduct" ] || continue
        case "$(cat "$device/idVendor"):$(cat "$device/idProduct")" in
            2357:011e|2357:011f|2357:0120) found=1 ;;
        esac
    done
    if [ -n "$found" ]; then
        printf 'info\tA supported TP-Link Archer T2U adapter is connected.\n'
    else
        printf 'info\tNo supported adapter is connected right now. This is normal with ACC/ignition off; the driver binds when the adapter appears.\n'
    fi
)
mzd_bundle_main "$@"
