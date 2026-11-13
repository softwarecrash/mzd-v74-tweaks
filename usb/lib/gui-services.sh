#!/bin/sh
# Optional shared capabilities. Source from gui-extension.sh, never from a view.
MZD_GUI_SERVICES="$MZD_GUI_DATA/mzd-gui-services.tsv"
MZD_GUI_STARTUP=/jci/scripts/stage_wifi.sh
MZD_GUI_STARTUP_MOUNT=/
MZD_GUI_USER_DATA=/tmp/mnt/data_persist/mzd-tweaks/gui-data
mzd_gui_data_owned() (
    [ -d "$1" ] && [ ! -L "$1" ] && [ "$(readlink -f "$1")" = "$1" ] &&
        [ -f "$1/owner" ] && [ ! -L "$1/owner" ] || exit 1
    printf 'MZD_GUI_DATA_V1\n%s\n' "$2" | cmp -s - "$1/owner"
)
# The GUI API level (api= in gui-runtime/api.conf) is one integer that only grows. A tweak declares
# the lowest level it needs in gui_api. The installed provider and every saved GUI consumer (their
# saved copies run on uninstall) must be at least that, otherwise nothing is changed.
mzd_gui_capabilities() (
    want=$GUI_API
    [ -z "$GUI_RESIDENT" ] || [ -f "$HERE/$GUI_RESIDENT" ] && [ ! -L "$HERE/$GUI_RESIDENT" ] || exit 1
    [ -z "$GUI_SERVICE" ] || [ -f "$HERE/$GUI_SERVICE" ] && [ ! -L "$HERE/$GUI_SERVICE" ] || exit 1
    for receipt in "$MZD_GUI_PROVIDER" "$MZD_PACKAGE_STORE"/*; do
        [ -d "$receipt" ] || continue
        if [ "$receipt" != "$MZD_GUI_PROVIDER" ]; then
            mzd_manifest_load "$receipt/package/tweaks/${receipt##*/}/manifest.conf" || exit 1
            [ "$TYPE" = gui-extension ] || [ -n "${GUI_API:-}" ] || continue
        fi
        have=$(mzd_gui_api_level "$receipt/package/lib/gui-runtime/api.conf") || {
            mzd_gui_error 'The installed GUI helper or a saved consumer has no valid GUI API level. Uninstall ALL GUI tweaks, then reinstall them from this USB package. Settings can be kept when offered. Nothing has been changed.'; exit 1;
        }
        [ "$have" -ge "$want" ] || {
            mzd_gui_error "The installed GUI helper or a saved consumer is too old (this tweak needs GUI API $want, found $have). Uninstall ALL GUI tweaks, then reinstall them from this USB package. Settings can be kept when offered. Nothing has been changed."; exit 1;
        }
    done
)

mzd_gui_startup_ok() {
    [ -f "$MZD_GUI_STARTUP" ] && [ ! -L "$MZD_GUI_STARTUP" ] || return 1
    awk '
      $0=="# MZD shared GUI services" {markers++; adjacent=1;next}
      $0=="sh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &" {commands++;if(adjacent)pairs++}
      {adjacent=0}
      END {exit !(markers==1 && commands==1 && pairs==1)}' "$MZD_GUI_STARTUP"
}
mzd_gui_services_preflight() (
    [ ! -L "$MZD_GUI_SERVICES" ] && [ ! -L "$MZD_GUI_USER_DATA" ] || exit 1
    [ -z "$GUI_SERVICE" ] || {
        for command in lua setsid; do command -v "$command" >/dev/null || mzd_gui_error "Missing GUI service prerequisite: $command"; done
        lua -e 'require("socket"); require("posix"); require("lfs"); require("cjson")' >/dev/null 2>&1 || mzd_gui_error 'Factory GUI service Lua modules are unavailable.'
        [ -f "$MZD_GUI_STARTUP" ] && [ ! -L "$MZD_GUI_STARTUP" ] && head -n 1 "$MZD_GUI_STARTUP" | grep -q '^#!/bin/sh' || mzd_gui_error 'Unsupported GUI service startup target.'
    }
    if [ -s "$MZD_GUI_SERVICES" ]; then mzd_gui_startup_ok || mzd_gui_error 'Shared GUI service startup hook is missing or changed.'; fi
    if [ -f "$MZD_GUI_STARTUP" ] && ! mzd_gui_startup_ok; then
        ! grep -qF '# MZD shared GUI services' "$MZD_GUI_STARTUP" && ! grep -qF '/mzd-gui-runtime/service/supervisor.sh' "$MZD_GUI_STARTUP" || mzd_gui_error 'Partial shared GUI startup hook; nothing changed.'
    fi
)
mzd_gui_services_stop() {
    [ ! -s "$MZD_GUI_SERVICES" ] || sh "$MZD_GUI_RUNTIME/service/supervisor.sh" stop
}
mzd_gui_services_start() {
    [ -s "$MZD_GUI_SERVICES" ] || return 0
    # A session independent of the installer. Standard streams cannot hold it open.
    setsid sh "$MZD_GUI_RUNTIME/service/supervisor.sh" boot </dev/null >/dev/null 2>&1 &
}
mzd_gui_startup_write() {
    enabled=$1
    if [ "$enabled" = 1 ]; then
        mzd_gui_startup_ok && return 0
    else
        mzd_gui_startup_ok || return 0
    fi
    mzd_system_lock /tmp/mzd-stage_wifi-tweak.lock || return 1
    mzd_system_remount_rw "$MZD_GUI_STARTUP_MOUNT" || return 1
    mzd_gui_mark startup || return 1
    if [ "$enabled" = 1 ]; then
        awk 'NR==1 {print;print "# MZD shared GUI services";print "sh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &";next} {print}' "$MZD_GUI_STARTUP" > "$GUI_TX/startup.new" || return 1
    else
        awk '$0=="# MZD shared GUI services" {getline;next} {print}' "$MZD_GUI_STARTUP" > "$GUI_TX/startup.new" || return 1
    fi
    cp "$GUI_TX/startup.new" "$MZD_GUI_STARTUP" && cmp -s "$GUI_TX/startup.new" "$MZD_GUI_STARTUP"
}
mzd_gui_services_write() {
    # Registry records are literal and validated before these paths are used.
    awk 'BEGIN {FS="\t"} NF>=6 && $6!="-" {print $1 "\t" $6}' "$GUI_TX/sorted" > "$GUI_TX/services.tsv" || return 1
    if [ -s "$GUI_TX/services.tsv" ] || [ -e "$MZD_GUI_SERVICES" ]; then
        mzd_gui_mark services || return 1
        cp "$GUI_TX/services.tsv" "$MZD_GUI_SERVICES" && cmp -s "$GUI_TX/services.tsv" "$MZD_GUI_SERVICES" || return 1
    fi
    if [ -e "$MZD_GUI_SERVICES" ]; then
        mzd_gui_mark provider || return 1
        cp "$GUI_TX/services.tsv" "$MZD_GUI_PROVIDER/services.tsv" && cmp -s "$GUI_TX/services.tsv" "$MZD_GUI_PROVIDER/services.tsv" || return 1
    fi
    if [ -s "$GUI_TX/services.tsv" ]; then mzd_gui_startup_write 1; else mzd_gui_startup_write 0; fi
}
mzd_gui_data_prepare() (
    [ -n "$GUI_SERVICE" ] || exit 0
    parent=$MZD_GUI_USER_DATA
    [ ! -L "$parent" ] || exit 1
    mkdir -p "$parent" || exit 1
    [ "$(readlink -f "$parent")" = "$parent" ] || exit 1
    target="$parent/$ID"
    if [ -e "$target" ] || [ -L "$target" ]; then
        mzd_gui_data_owned "$target" "$ID" || mzd_gui_error 'Unknown existing module data directory; nothing adopted.'
    else
        mkdir "$target" || exit 1
        printf 'MZD_GUI_DATA_V1\n%s\n' "$ID" > "$target/owner" || exit 1
    fi
)
