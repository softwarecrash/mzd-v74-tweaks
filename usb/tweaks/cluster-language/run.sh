#!/bin/sh
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ];then . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1;fi
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
. "$ROOT/lib/vehicle.sh" || exit 1

mzd_bundle_prerequisites() (
    # This is a settings-service shim, not an AA Mod installation. Never load
    # another copy beside one installed by AA Mod or an older standalone tool.
    records=$(mzd_components records) || exit 1
    own=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="shim"{print $2}') || exit 1
    configs=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="loader"{print $2}') || exit 1
    for config in $configs; do
        [ -f "$config" ] && [ ! -L "$config" ] || {
            printf 'block\tA required service configuration is missing or linked.\n'; exit 0;
        }
        if ! awk -v own="$own" '
          index($0,"libpatch-svcjciblmsettings.so") {
            n=split($0,tokens,/[" :<>\t=]+/)
            for(i=1;i<=n;i++)if(tokens[i] ~ /(^|\/)libpatch-svcjciblmsettings\.so$/ && tokens[i]!=own)bad=1
          }
          END{exit bad}
        ' "$config"; then
            printf 'block\tAnother Cluster / HUD Language shim is already referenced. Remove that entry with its original installer before using this tweak.\n'
            exit 0
        fi
    done
    # The hook also affects instrument-cluster language without a HUD. HUD
    # absence/type therefore warns; it must not block this whole tweak.
    hud=$(mzd_vehicle_hud) || exit 1
    case "$hud" in
        WHUD_color) : ;;
        none) printf 'warning\tNo HUD detected. The instrument-cluster language override may still apply; there is no HUD street-name benefit.\n' ;;
        unknown) printf 'warning\tHUD type could not be read. HUD street-name compatibility is unverified; the cluster/HUD language code will still be overridden.\n' ;;
        *) printf 'warning\tHUD street-name behavior is only verified upstream for a color windshield HUD. Cluster/HUD texts follow the selected language code.\n' ;;
    esac
)
mzd_bundle_main "$@"
