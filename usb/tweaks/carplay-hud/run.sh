#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
. "$ROOT/lib/vehicle.sh" || exit 1

mzd_bundle_prerequisites() (
    # Never load CarPlay HUD Mod shim beside ones installed by another standalone installer.
    records=$(mzd_components records) || exit 1
    own=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="shim"{printf "%s ", $2}') || exit 1
    configs=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="loader"{print $2}') || exit 1
    for config in $configs; do
        [ -f "$config" ] && [ ! -L "$config" ] || {
            printf 'block\tA required service configuration is missing or linked.\n'; exit 0;
        }
        if ! awk -v own="$own" '
          BEGIN {
            n_own=split(own,o," ")
            for(j=1;j<=n_own;j++)if(o[j]!="")own_set[o[j]]=1
          }
          index($0,"libpatch-") {
            n=split($0,tokens,/[" :<>\t=]+/)
            for(i=1;i<=n;i++)if(tokens[i] ~ /(^|\/)libpatch-blmjcicarplay\.so$/ && !(tokens[i] in own_set))bad=1
          }
          END{exit bad}
        ' "$config"; then
            printf 'block\tAnother CarPlay HUD Mod shim is already referenced. Uninstall it with its original installer before using this tweak.\n'
            exit 0
        fi
    done
    # mzd_vehicle_hud always exits 0; it encodes dbus failures as the string 'unknown'.
    hud=$(mzd_vehicle_hud)
    case "$hud" in
        WHUD_color)
            printf 'info\tDetected supported Windshield HUD. Displaying street names should work.\n'
            ;;
        CHUD_mono)
            printf 'warning\tDetected Combiner HUD (monochrome). Displaying street names will not work.\n'
            ;;
        CHUD_color)
            printf 'warning\tDetected Combiner HUD (color). Displaying street names will not work.\n'
            ;;
        none)
            printf 'block\tThis vehicle has no HUD.\n'
            ;;
        unknown|*)
            printf 'block\tUnknown HUD type or cannot determine HUD compatibility.\n'
            ;;
    esac
)

mzd_bundle_main "$@"
