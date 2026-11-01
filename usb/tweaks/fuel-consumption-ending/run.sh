#!/bin/sh
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1

mzd_bundle_prerequisites() (
    # Never load a second copy of the jciMMUI ending shim beside one installed
    # by the older fuel-consumption.sh or another standalone installer.
    records=$(mzd_components records) || exit 1
    own=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="shim"{print $2}') || exit 1
    configs=$(printf '%s\n' "$records" | awk -F "$(printf '\t')" '$1=="loader"{print $2}') || exit 1
    for config in $configs; do
        [ -f "$config" ] && [ ! -L "$config" ] || {
            printf 'block\tA required service configuration is missing or linked.\n'; exit 0;
        }
        if ! awk -v own="$own" '
          index($0,"_mmui.so") {
            n=split($0,tokens,/[" :<>\t=]+/)
            for(i=1;i<=n;i++)if(tokens[i] ~ /(^|\/)(fuel_ending_mmui|fogyend_mmui)\.so$/ && tokens[i]!=own)bad=1
          }
          END{exit bad}
        ' "$config"; then
            printf 'block\tAnother fuel ending shim is already referenced. Uninstall it with its original installer (fuel-consumption.sh) before using this tweak.\n'
            exit 0
        fi
    done
)
mzd_bundle_main "$@"
