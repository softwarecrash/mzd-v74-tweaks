#!/bin/sh
# Shared resource coordinator. Called only by managed gui-extension workers.
MZD_GUI_DATA=/tmp/mnt/data/integration
MZD_GUI_PROVIDER=/tmp/mnt/data_persist/mzd-tweaks/gui-provider
MZD_GUI_MODULES="$MZD_GUI_DATA/mzd-gui-modules"
MZD_GUI_RUNTIME="$MZD_GUI_DATA/mzd-gui-runtime"
MZD_GUI_HOOK="$MZD_GUI_DATA/developer_mode_GuiConfig.js"
MZD_GUI_REGISTRY="$MZD_GUI_DATA/mzd-gui-registry.js"
mzd_gui_error() { printf 'GUI: %s\n' "$*" >&2; exit 1; }
mzd_gui_assets() (
    folder=$1
    [ -d "$folder/assets" ] && [ ! -L "$folder/assets" ] && mzd_package_tree_ok "$folder/assets" || exit 1
    find "$folder/assets" -print | LC_ALL=C awk -v p="$folder/" 'index($0,p)!=1 {bad=1} {s=substr($0,length(p)+1);if(s!~/^[A-Za-z0-9_.\/-]+$/ || s~/(^|\/)\.\.?($|\/)/)bad=1;n++} END {exit(bad || n>512)}' || mzd_gui_error 'Unsupported or excessive GUI asset paths.'
    for capability in "$GUI_RESIDENT" "$GUI_SERVICE" "$GUI_TRANSLATIONS"; do
        [ -z "$capability" ] || { [ -f "$folder/$capability" ] && [ ! -L "$folder/$capability" ]; } || mzd_gui_error 'Declared GUI capability is missing.'
    done
    [ -f "$folder/$GUI_ENTRYPOINT" ] && [ ! -L "$folder/$GUI_ENTRYPOINT" ] || mzd_gui_error 'GUI entrypoint is missing.'
)
mzd_gui_paths() (
    mzd_gui_assets "$1" || exit 1
    printf 'create\t%s/%s\ncreate\t%s/%s/manifest.conf\n' "$MZD_GUI_MODULES" "$ID" "$MZD_GUI_MODULES" "$ID"
    find "$1/assets" -print | LC_ALL=C sort | while IFS= read -r path; do printf 'create\t%s/%s/%s\n' "$MZD_GUI_MODULES" "$ID" "${path#"$1/"}"; done
)
mzd_gui_locations() (
    [ -d "$MZD_GUI_DATA" ] && [ ! -L "$MZD_GUI_DATA" ] || mzd_gui_error 'GUI integration directory is missing or a link.'
    [ "$(readlink -f "$MZD_GUI_DATA")" = "$MZD_GUI_DATA" ] || mzd_gui_error 'GUI data path is not canonical.'
    parent=$(dirname "$MZD_GUI_PROVIDER")
    while [ ! -e "$parent" ] && [ ! -L "$parent" ]; do parent=$(dirname "$parent"); done
    [ "$(readlink -f "$parent")" = "$parent" ] || mzd_gui_error 'GUI provider parent is not canonical.'
    if [ -e "$MZD_GUI_MODULES" ]; then [ -d "$MZD_GUI_MODULES" ] || mzd_gui_error 'GUI modules path is not a directory.'; fi
    [ ! -L "$MZD_GUI_MODULES" ] && [ ! -L "$MZD_GUI_RUNTIME" ] && [ ! -L "$MZD_GUI_PROVIDER" ] &&
        [ ! -L "$MZD_GUI_HOOK" ] && [ ! -L "$MZD_GUI_REGISTRY" ] || mzd_gui_error 'A GUI resource is a symbolic link.'
)
# Existing files must match this package; missing files may be removed safely.
mzd_gui_module_owned() (
    source=$1; target=$2
    [ ! -L "$target" ] || mzd_gui_error 'GUI module is a symbolic link.'
    [ -e "$target" ] || exit 0
    mzd_package_tree_ok "$target" || mzd_gui_error 'GUI module contains unsupported files.'
    find "$target" -print | while IFS= read -r path; do
        [ "$path" != "$target" ] || continue
        rel=${path#"$target/"}
        case "$rel" in manifest.conf|assets|assets/*) ;; *) mzd_gui_error 'Unknown module file; nothing removed.'; exit 1 ;; esac
        if [ -d "$path" ]; then [ -d "$source/$rel" ] || exit 1
        else [ -f "$source/$rel" ] && cmp -s "$source/$rel" "$path" || { mzd_gui_error 'Changed module file; nothing removed.'; exit 1; }; fi
    done
)
# A complete module needs one content comparison, not per-file cmp plus diff.
mzd_gui_module_complete() (
    source=$1; target=$2
    mzd_package_tree_ok "$target" || exit 1
    for path in "$target"/* "$target"/.[!.]* "$target"/..?*; do
        [ -e "$path" ] || continue
        case "${path##*/}" in manifest.conf|assets) ;; *) exit 1 ;; esac
    done
    [ -f "$target/manifest.conf" ] && [ -d "$target/assets" ] &&
        cmp -s "$source/manifest.conf" "$target/manifest.conf" &&
        diff -r "$source/assets" "$target/assets" >/dev/null
)
mzd_gui_support() (
    if [ ! -e "$MZD_GUI_PROVIDER" ]; then
        [ ! -e "$MZD_GUI_HOOK" ] && [ ! -e "$MZD_GUI_RUNTIME" ] && [ ! -e "$MZD_GUI_REGISTRY" ] && [ ! -e "$MZD_GUI_SERVICES" ] || mzd_gui_error 'Foreign GUI hook/runtime exists; nothing overwritten.'
        exit $?
    fi
    mzd_package_tree_ok "$MZD_GUI_PROVIDER" || exit 1
    mzd_package_tree_ok "$MZD_GUI_RUNTIME" || exit 1
    for path in "$MZD_GUI_PROVIDER"/* "$MZD_GUI_PROVIDER"/.[!.]* "$MZD_GUI_PROVIDER"/..?*; do
        [ -e "$path" ] || continue
        case "${path##*/}" in package|provider.files|format|registry.js|services.tsv) ;; *) mzd_gui_error 'Unknown provider receipt file.'; exit 1 ;; esac
    done
    awk 'NR==1 {if($0!="MZD_GUI_PROVIDER_V1")bad=1;next} NR==2 {if($0!="modules-root-owned")bad=1;next} {bad=1} END {exit(bad || NR<1)}' "$MZD_GUI_PROVIDER/format" &&
        mzd_line_is api=1 "$MZD_GUI_PROVIDER/package/lib/gui-runtime/api.conf" || mzd_gui_error 'Incompatible GUI provider API.'
    scratch=$(mktemp /tmp/mzd-gui-inventory.XXXXXX) || exit 1
    trap 'rm -f "$scratch"' 0
    mzd_package_inventory "$MZD_GUI_PROVIDER" > "$scratch" && cmp -s "$scratch" "$MZD_GUI_PROVIDER/provider.files" || mzd_gui_error 'GUI provider snapshot is changed.'
    if [ -e "$MZD_GUI_SERVICES" ] || [ -e "$MZD_GUI_PROVIDER/services.tsv" ]; then
        [ ! -L "$MZD_GUI_SERVICES" ] && [ ! -L "$MZD_GUI_PROVIDER/services.tsv" ] && cmp -s "$MZD_GUI_SERVICES" "$MZD_GUI_PROVIDER/services.tsv" || mzd_gui_error 'Shared service registry is missing or changed.'
    fi
    cmp -s "$MZD_GUI_HOOK" "$MZD_GUI_PROVIDER/package/lib/gui-runtime/boot.js" &&
        diff -r "$MZD_GUI_PROVIDER/package/lib/gui-runtime" "$MZD_GUI_RUNTIME" >/dev/null &&
        cmp -s "$MZD_GUI_REGISTRY" "$MZD_GUI_PROVIDER/registry.js" || mzd_gui_error 'Deployed GUI support is missing or changed.'
)
# Caller has loaded this exact manifest; verification helpers use subshells.
mzd_gui_record_loaded() (
    resident=-; service=-; translations=-
    [ -z "$GUI_RESIDENT" ] || resident="/data/integration/mzd-gui-modules/$ID/$GUI_RESIDENT"
    [ -z "$GUI_SERVICE" ] || service=$GUI_SERVICE
    [ -z "$GUI_TRANSLATIONS" ] || translations="/data/integration/mzd-gui-modules/$ID/$GUI_TRANSLATIONS"
    printf '%s\t%s\t%s\t/data/integration/mzd-gui-modules/%s/%s\t%s\t%s\t%s\n' "$ID" "$GUI_MENU_PATH" "$GUI_LABEL" "$ID" "$GUI_ENTRYPOINT" "$resident" "$service" "$translations"
)
# Caller/candidate is excluded; all other consumers come from verified receipts.
mzd_gui_collect() (
    exclude=$1; consumers=' '
    for entry in "$MZD_PACKAGE_STORE"/*; do
        [ -d "$entry" ] || continue
        [ "${entry##*/}" != "$exclude" ] || continue
        mzd_manifest_load "$entry/package/tweaks/${entry##*/}/manifest.conf" || exit 1
        [ "$TYPE" = gui-extension ] || [ -n "${GUI_API:-}" ] || continue
        mzd_package_check "$entry" || exit 1
        state=$(mzd_package_state "$entry") || exit 1
        consumers="$consumers${entry##*/} "
        path="$MZD_GUI_MODULES/${entry##*/}"
        if [ "$state" = restoring ] && [ ! -e "$path" ]; then continue; fi
        [ "$state" = installed ] || [ "$state" = restoring ] || { mzd_gui_error 'Resolve incomplete GUI consumers before changing shared support.'; exit 1; }
        mzd_gui_module_complete "$entry/package/tweaks/${entry##*/}" "$path" || exit 1
        mzd_gui_record_loaded || exit 1
    done
    for path in "$MZD_GUI_MODULES"/* "$MZD_GUI_MODULES"/.[!.]* "$MZD_GUI_MODULES"/..?*; do
        [ -e "$path" ] || [ -L "$path" ] || continue
        [ "${path##*/}" != "$exclude" ] || continue
        mzd_manifest_id "${path##*/}" && [ -d "$MZD_PACKAGE_STORE/${path##*/}" ] || { mzd_gui_error 'Unregistered GUI directory; nothing deleted.'; exit 1; }
        # Only consumers already checked above may own deployed directories.
        case "$consumers" in *" ${path##*/} "*) ;; *) exit 1 ;; esac
    done
)
mzd_gui_status() (
    if [ -e "$LOCK" ] || [ -L "$LOCK" ]; then
        # Restore verifies saved absence while retaining its own shared lock.
        [ "${MZD_PACKAGE_STATE:-}" = restoring ] && [ -n "${MZD_REPORT:-}" ] &&
            [ "${MZD_SYSTEM:-}" = "$MZD_REPORT/system" ] && mzd_line_is "$LOCK" "$MZD_SYSTEM/locks" || {
            printf 'GUI resources are busy; retry status after the other operation.\n' >&2; exit 1;
        }
    fi
    module_complete=0
    mzd_gui_locations && mzd_gui_support && {
        if mzd_gui_module_complete "$HERE" "$MZD_GUI_MODULES/$ID"; then
            module_complete=1
        else
            # On incomplete/changed modules retain the ownership diagnosis and
            # allow safe removal of missing files. Healthy modules skip this scan.
            mzd_gui_module_owned "$HERE" "$MZD_GUI_MODULES/$ID"
        fi
    } || {
        if [ -e "$MZD_GUI_MODULES/$ID" ] && mzd_package_check "$MZD_PACKAGE_STORE/$ID" >/dev/null 2>&1; then printf 'broken\n'; else printf 'unavailable\n'; fi
        exit 0
    }
    if [ ! -e "$MZD_GUI_MODULES/$ID" ]; then
        if [ "$(mzd_package_state "$MZD_PACKAGE_STORE/$ID" 2>/dev/null)" = installed ] &&
            mzd_package_check "$MZD_PACKAGE_STORE/$ID" >/dev/null 2>&1; then
            printf 'broken\n'; printf 'Registered GUI module directory is missing.\n' >&2
        else printf 'uninstalled\n'; fi
        exit 0
    fi
    if [ "$module_complete" != 1 ] || [ ! -e "$MZD_GUI_PROVIDER" ]; then
        printf 'broken\n'; printf 'GUI module is incomplete.\n' >&2; exit 0
    fi
    if [ -n "$GUI_SERVICE" ]; then
        mzd_gui_startup_ok && mzd_gui_data_owned "$MZD_GUI_USER_DATA/$ID" "$ID" || {
                printf 'broken\n'; printf 'GUI service startup or data ownership is incomplete.\n' >&2; exit 0;
            }
    fi
    printf 'installed\n'
)
mzd_gui_target() {
    case "$1" in
        module) printf '%s/%s\n' "$MZD_GUI_MODULES" "$ID" ;;
        provider) printf '%s\n' "$MZD_GUI_PROVIDER" ;;
        runtime) printf '%s\n' "$MZD_GUI_RUNTIME" ;;
        hook) printf '%s\n' "$MZD_GUI_HOOK" ;;
        services) printf '%s\n' "$MZD_GUI_SERVICES" ;;
        startup) printf '%s\n' "$MZD_GUI_STARTUP" ;;
        registry) printf '%s\n' "$MZD_GUI_REGISTRY" ;;
        *) return 1 ;;
    esac
}
mzd_gui_backup() {
    for key in module provider runtime hook registry services startup; do
        path=$(mzd_gui_target "$key") || return 1
        if [ -e "$path" ]; then
            cp -a "$path" "$GUI_TX/before/$key" || return 1
            if [ -d "$path" ]; then diff -r "$path" "$GUI_TX/before/$key" >/dev/null || return 1
            else cmp -s "$path" "$GUI_TX/before/$key" || return 1; fi
        fi
    done
}
mzd_gui_mark() { mzd_line_is "$1" "$GUI_TX/changed" || printf '%s\n' "$1" >> "$GUI_TX/changed"; }
mzd_gui_remove() {
    path=$(mzd_gui_target "$1") || return 1
    mzd_gui_mark "$1" || return 1
    [ ! -L "$path" ] || return 1
    rm -rf "$path"
}
mzd_gui_put() {
    key=$1; prepared=$2
    path=$(mzd_gui_target "$key") || return 1
    mzd_gui_mark "$key" || return 1
    [ ! -e "$path" ] && [ ! -L "$path" ] || return 1
    cp -a "$prepared" "$path" || return 1
    if [ -d "$prepared" ]; then diff -r "$prepared" "$path" >/dev/null
    else cmp -s "$prepared" "$path"; fi
}
mzd_gui_write_registry() {
    mzd_gui_mark provider && mzd_gui_mark registry || return 1
    # The runtime snapshot stays unchanged; only the derived provider state moves.
    cp "$GUI_TX/registry.js" "$MZD_GUI_PROVIDER/registry.new" && cmp -s "$GUI_TX/registry.js" "$MZD_GUI_PROVIDER/registry.new" || return 1
    mv "$MZD_GUI_PROVIDER/registry.new" "$MZD_GUI_PROVIDER/registry.js" || return 1
    cp "$GUI_TX/registry.js" "$MZD_GUI_DATA/.mzd-gui-registry-$$" && cmp -s "$GUI_TX/registry.js" "$MZD_GUI_DATA/.mzd-gui-registry-$$" || return 1
    mv "$MZD_GUI_DATA/.mzd-gui-registry-$$" "$MZD_GUI_REGISTRY"
}
mzd_gui_undo() {
    result=0
    # Restore every asset before exposing the previous boot hook again.
    if mzd_line_is hook "$GUI_TX/changed"; then rm -f "$MZD_GUI_HOOK" || result=1; fi
    for key in module runtime provider registry services startup hook; do
        mzd_line_is "$key" "$GUI_TX/changed" || continue
        path=$(mzd_gui_target "$key") || { result=1; continue; }
        [ ! -L "$path" ] || { result=1; continue; }
        rm -rf "$path" || result=1
        if [ -e "$GUI_TX/before/$key" ]; then
            mkdir -p "$(dirname "$path")" && cp -a "$GUI_TX/before/$key" "$path" || result=1
            if [ -d "$path" ]; then diff -r "$GUI_TX/before/$key" "$path" >/dev/null || result=1
            else cmp -s "$GUI_TX/before/$key" "$path" || result=1; fi
        fi
    done
    return "$result"
}
mzd_gui_transaction_finish() {
    code=$?; trap - 0
    rollback_failed=0
    if [ "$code" != 0 ]; then
        if ! mzd_gui_undo; then
            rollback_failed=1; code=2
        fi
    fi
    rm -f "$MZD_GUI_DATA/.mzd-gui-registry-$$"
    if [ "$code" != 0 ] && [ ! -f "$GUI_TX/had-modules-root" ]; then rmdir "$MZD_GUI_MODULES" 2>/dev/null || :; fi
    sync
    if [ "$rollback_failed" = 0 ]; then mzd_gui_services_start || code=2; fi
    [ "$rollback_failed" != 1 ] || mzd_fatal 'GUI rollback failed. Do NOT reboot.'
    [ "$code" != 2 ] || mzd_fatal 'GUI operation was interrupted. Do NOT reboot; inspect the retained report.'
    exit "$code"
}
mzd_gui_mutate() (
    operation=$1
    mzd_gui_locations && mzd_gui_support && mzd_gui_module_owned "$HERE" "$MZD_GUI_MODULES/$ID" || exit 1
    mzd_gui_services_preflight || exit 1
    [ "$operation" != install ] || mzd_gui_capabilities || exit 1
    if [ -n "$GUI_SERVICE" ] || [ -s "$MZD_GUI_SERVICES" ]; then mzd_system_lock /tmp/mzd-stage_wifi-tweak.lock || exit 1; fi
    GUI_TX=$(mktemp -d "${2:-$MZD_REPORT}/gui-transaction.XXXXXX") || exit 1
    mkdir "$GUI_TX/before" || exit 1
    : > "$GUI_TX/changed"
    [ ! -d "$MZD_GUI_MODULES" ] || : > "$GUI_TX/had-modules-root"
    mzd_gui_backup || exit 1
    mzd_gui_collect "$ID" > "$GUI_TX/records" || exit 1
    if [ "$operation" = install ]; then
        [ ! -e "$MZD_GUI_MODULES/$ID" ] || { mzd_gui_error 'Existing module must be removed by its saved worker.'; exit 1; }
        mzd_gui_record_loaded >> "$GUI_TX/records" || exit 1
    fi
    LC_ALL=C sort "$GUI_TX/records" > "$GUI_TX/sorted" || exit 1
    awk -f "$ROOT/lib/gui-registry.awk" "$GUI_TX/sorted" > "$GUI_TX/registry.js" || exit 1
    trap mzd_gui_transaction_finish 0
    trap 'exit 2' INT TERM
    mzd_gui_services_stop || exit 1
    if [ "$operation" = install ]; then
        mkdir -p "$MZD_GUI_MODULES" "$(dirname "$MZD_GUI_PROVIDER")" || exit 1
        mkdir "$GUI_TX/module" || exit 1
        cp "$HERE/manifest.conf" "$GUI_TX/module/manifest.conf" && cp -R "$HERE/assets" "$GUI_TX/module/assets" || exit 1
        mzd_gui_data_prepare || exit 1
        mzd_gui_put module "$GUI_TX/module" || exit 1
        if [ ! -e "$MZD_GUI_PROVIDER" ]; then
            [ -f "$ROOT/lib/gui-runtime/api.conf" ] && mzd_line_is api=1 "$ROOT/lib/gui-runtime/api.conf" || exit 1
            mkdir -p "$GUI_TX/provider/package/lib" || exit 1
            cp -R "$ROOT/lib/gui-runtime" "$GUI_TX/provider/package/lib/gui-runtime" || exit 1
            cp "$ROOT/lib/lua-bridge/process.lua" "$GUI_TX/provider/package/lib/gui-runtime/service/process.lua" || exit 1
            printf 'MZD_GUI_PROVIDER_V1\n' > "$GUI_TX/provider/format"
            [ -f "$GUI_TX/had-modules-root" ] || printf 'modules-root-owned\n' >> "$GUI_TX/provider/format"
            mzd_package_inventory "$GUI_TX/provider" > "$GUI_TX/provider/provider.files" || exit 1
            mzd_gui_put provider "$GUI_TX/provider" && mzd_gui_put runtime "$GUI_TX/provider/package/lib/gui-runtime" || exit 1
            mzd_gui_write_registry || exit 1
            mzd_gui_services_write || exit 1
            # Optional boot hook is always last on the first consumer install.
            mzd_gui_put hook "$GUI_TX/provider/package/lib/gui-runtime/boot.js" || exit 1
        else mzd_gui_write_registry && mzd_gui_services_write || exit 1; fi
    else
        if [ -e "$MZD_GUI_PROVIDER" ]; then mzd_gui_write_registry || exit 1; fi
        mzd_gui_services_write || exit 1
        mzd_gui_remove module || exit 1
        if [ ! -s "$GUI_TX/records" ] && [ "${MZD_GUI_REPLACEMENT:-0}" != 1 ]; then
            owned_root=0
            if [ -f "$MZD_GUI_PROVIDER/format" ] && mzd_line_is modules-root-owned "$MZD_GUI_PROVIDER/format"; then owned_root=1; fi
            # No consumer remains; remove only the verified support we own.
            for key in hook registry services runtime provider; do mzd_gui_remove "$key" || exit 1; done
            [ "$owned_root" != 1 ] || rmdir "$MZD_GUI_MODULES" || exit 1
        fi
    fi
    sync
)
mzd_gui_main() {
    [ "$#" -le 1 ] || { printf 'Expected one action.\n' >&2; exit 1; }
    ACTION=${1:-}
    case "$ACTION" in ''|-h|--help) printf 'Usage: sh run.sh <install|uninstall|status>\n'; exit 0 ;; install|uninstall|status|validate-install) ;; *) printf 'Unsupported action.\n' >&2; exit 1 ;; esac
    SELF=$(readlink -f "$0") || exit 1
    HERE=$(dirname "$SELF"); ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
    if [ "${MZD_WORKER_DIRECT:-}" != 1 ] && [ "$ACTION" != validate-install ]; then exec sh "$ROOT/installer.sh" action "$(basename "$HERE")" "$ACTION"; fi
    for library in manifest report system packages gui-services; do . "$ROOT/lib/$library.sh" || exit 1; done
    mzd_manifest_load "$HERE/manifest.conf" || exit 1
    [ "$TYPE" = gui-extension ] || [ -n "${GUI_API:-}" ] || exit 1
    mzd_gui_assets "$HERE" || exit 1
    if [ "$ACTION" = validate-install ]; then
        mzd_validate_firmware "$FIRMWARE" && mzd_gui_locations && mzd_gui_support && mzd_gui_capabilities && mzd_gui_services_preflight
        exit $?
    fi
    if [ "$ACTION" = status ]; then
        [ -r /jci/version.ini ] || { printf 'Cannot read firmware version.\n' >&2; exit 1; }
        if ! mzd_validate_firmware "$FIRMWARE"; then printf 'unavailable\n'; exit 0; fi
        mzd_gui_status; exit $?
    fi
    if [ "$ACTION" = install ]; then mzd_validate_firmware "$FIRMWARE" || exit 1; fi
    mzd_begin "$SELF" "$ID" mzd_system_cleanup
    mzd_system_begin
    mzd_system_lock "$LOCK" || exit 1
    mzd_system_remount_rw /tmp/mnt/data && mzd_system_remount_rw /tmp/mnt/data_persist || exit 1
    mzd_gui_mutate "$ACTION" || exit $?
    MZD_SUCCESS="GUI extension $ACTION completed. Restart to apply. Reports: $MZD_REPORT"
}
mzd_gui_reset() {
    [ "$#" = 1 ] || exit 1
    SELF=$(readlink -f "$0") || exit 1; HERE=${HERE:-$(dirname "$SELF")}; ROOT=${ROOT:-$(CDPATH= cd "$HERE/../.." && pwd)} || exit 1
    for library in manifest report system packages gui-services; do . "$ROOT/lib/$library.sh" || exit 1; done
    mzd_manifest_load "$HERE/manifest.conf" || exit 1
    case "$1" in check|prepare|finish) ;; *) exit 1 ;; esac
    # Restore also visits uninstalled USB tweaks. Retained user data alone is not
    # an installation: do not initialize its service or rewrite shared support.
    if [ ! -e "$MZD_GUI_MODULES/$ID" ] && [ ! -L "$MZD_GUI_MODULES/$ID" ] &&
        [ ! -e "$MZD_PACKAGE_STORE/$ID" ] && [ ! -L "$MZD_PACKAGE_STORE/$ID" ]; then exit 0; fi
    mzd_gui_locations && mzd_gui_support && mzd_gui_module_owned "$HERE" "$MZD_GUI_MODULES/$ID" || exit 1
    [ "$1" != check ] || exit 0
    [ "${ACTION:-}" = run ] && [ -d "${MZD_SYSTEM:-}" ] && [ -d "${MZD_RESET_DIR:-}" ] || exit 1
    if [ "$1" = prepare ]; then
        mzd_system_lock /tmp/mzd-gui-extension.lock && mzd_system_lock "$LOCK" && mzd_system_remount_rw /tmp/mnt/data && mzd_system_remount_rw /tmp/mnt/data_persist || exit 1
        mzd_gui_mutate uninstall "$MZD_RESET_DIR" || exit $?
    else [ ! -e "$MZD_GUI_MODULES/$ID" ] || exit 1; fi
}
