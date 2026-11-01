#!/bin/sh
# One transaction for payload files, generated configuration, shims and patches.
# Workers may define mzd_bundle_prerequisites: data-only block/warning records.
# Workers may define mzd_bundle_patch: dynamic patch configuration hook.
mzd_bundle_load() {
    for bundle_library in defines manifest report system patch restore settings components shim; do
        . "$ROOT/lib/$bundle_library.sh" || return 1
    done
    mzd_manifest_load "$HERE/manifest.conf" || return 1
    [ -n "$COMPONENTS" ] || return 1
    mzd_require_tools awk cat cp cmp chmod md5sum cut mktemp readlink dirname rm patch dd od grep mkdir mv || return 1
}
mzd_bundle_validate_install() (
    scratch=$(mktemp -d /tmp/mzd-bundle-assets.XXXXXX) || exit 1
    trap 'rm -rf "$scratch"' 0
    mzd_validate_firmware "$FIRMWARE" || exit 1
    mzd_components records > "$scratch/components" || exit 1
    mzd_settings_check "$HERE/manifest.conf" "$MZD_SETTINGS_FILE" || exit 1
    tab=$(printf '\t')
    while IFS="$tab" read -r kind target source service original; do
        asset_file=$(mzd_tweak_asset "$source") || exit 1
        case "$kind" in
            check) mzd_asset_readable "$target" && [ "$(mzd_hash "$target")" = "$original" ] || { printf 'Unsupported native module: %s (expected MD5 %s).\n' "$target" "$original" >&2; exit 1; } ;;
            shim) mzd_asset_readable "$asset_file" && mzd_shim_elf "$asset_file" || { printf 'Missing or unsupported ARM library: %s\n' "$source" >&2; exit 1; } ;;
            config) mzd_component_config "$asset_file" "$scratch/config" || exit 1 ;;
            file) mzd_asset_readable "$asset_file" || exit 1 ;;
            patch)
                mzd_asset_readable "$asset_file" || exit 1
                if command -v mzd_bundle_patch >/dev/null 2>&1; then
                    mzd_bundle_patch "$asset_file" "$scratch/patch.test" || exit 1
                    awk '/^--- /{a++;if($0!="--- target.data")bad=1} /^\+\+\+ /{b++;if($0!="+++ target.data")bad=1} END{exit bad || a!=1 || b!=1}' "$scratch/patch.test" || exit 1
                fi
                ;;
        esac
    done < "$scratch/components"
    mzd_bundle_preflight
)
mzd_bundle_preflight() (
    reason=$(mktemp /tmp/mzd-prerequisites.XXXXXX) || exit 1
    trap 'rm -f "$reason" "$reason.error"' 0
    if command -v mzd_bundle_prerequisites >/dev/null 2>&1; then
        if ! mzd_bundle_prerequisites > "$reason" 2> "$reason.error"; then
            printf 'block\tVehicle compatibility could not be verified.\n'
            cat "$reason.error" >&2; exit 1
        fi
    fi
    awk -F "$(printf '\t')" 'NR>16 || length($0)>512 || NF!=2 || $1!~/^(block|warning)$/ || $2=="" || $2~/[[:cntrl:]]/ {bad=1} END {exit bad}' "$reason" || {
        printf 'block\tInvalid compatibility response.\n'; exit 1;
    }
    cat "$reason"
    awk -F "$(printf '\t')" '$1=="block"{bad=1} END{exit bad}' "$reason"
)
mzd_bundle_transform() (
    input=$1; operation=$2; output=$3; table=$4
    cp "$input" "$output" || exit 1
    tab=$(printf '\t')
    while IFS="$tab" read -r kind dest source service original; do
        [ "$kind" = shim ] || continue
        SHIM_SERVICE=$service; SHIM_PATH=$dest
        mzd_shim_transform "$output" "$operation" > "$output.next" || exit 1
        mv "$output.next" "$output" || exit 1
    done < "$table"
)
# Build a plan on RAM for status or in the USB report for a modifying action.
# The plan contains full before/after snapshots; no system target is changed.
mzd_bundle_plan() (
    plan=$1; requested=$2
    mzd_validate_firmware "$FIRMWARE" || exit 1
    mzd_components records > "$plan/components" || exit 1
    mzd_settings_check "$HERE/manifest.conf" "$MZD_SETTINGS_FILE" || exit 1
    tab=$(printf '\t'); number=0; present=0; absent=0; evidence=0
    while IFS="$tab" read -r kind target source service original; do
        if [ "$kind" = check ]; then
            if [ "$requested" = install ]; then
                mzd_asset_readable "$target" && [ "$(mzd_hash "$target")" = "$original" ] || {
                    printf 'Unsupported native module: %s (expected MD5 %s).\n' "$target" "$original" >&2; exit 1;
                }
            fi
            continue
        fi
        number=$((number+1)); folder="$plan/$number"; mkdir "$folder" || exit 1
        printf '%s\n' "$kind" > "$folder/kind"
        printf '%s\n' "$target" > "$folder/target.path"
        printf '%s\n' "$original" > "$folder/original.md5"
        mzd_shim_parent_ok "$target" || exit 1
        if [ -e "$target" ] || [ -L "$target" ]; then
            mzd_asset_readable "$target" || exit 1
            cp -a "$target" "$folder/before.data" || exit 1
            evidence=$((evidence+1))
        else : > "$folder/before.absent"; fi
        asset_file=$(mzd_tweak_asset "$source") || exit 1
        case "$kind" in
            file|config|shim)
                case "$kind" in
                    config) mzd_component_config "$asset_file" "$folder/expected.data" || exit 1 ;;
                    *) mzd_asset_readable "$asset_file" && cp "$asset_file" "$folder/expected.data" || exit 1 ;;
                esac
                [ "$kind" != shim ] || mzd_shim_elf "$folder/expected.data" || {
                    printf 'Unsupported ARM library: %s\n' "$source" >&2; exit 1;
                }
                if [ -f "$folder/before.absent" ]; then state=uninstalled
                elif cmp -s "$target" "$folder/expected.data"; then state=installed
                else printf 'Owned payload differs from its saved configuration: %s\n' "$target" >&2; exit 1; fi
                cp "$folder/expected.data" "$folder/after.data" || exit 1
                chmod 644 "$folder/after.data" || exit 1
                ;;
            patch|loader)
                [ -f "$folder/before.data" ] || { printf 'Missing target: %s\n' "$target" >&2; exit 1; }
                if [ "$kind" = patch ]; then
                    patch_source="$asset_file"
                    if command -v mzd_bundle_patch >/dev/null 2>&1; then
                        mzd_bundle_patch "$patch_source" "$folder/prepared.patch" || exit 1
                        patch_source="$folder/prepared.patch"
                    fi
                    mzd_asset_readable "$patch_source" || exit 1
                    awk '/^--- /{a++;if($0!="--- target.data")bad=1} /^\+\+\+ /{b++;if($0!="+++ target.data")bad=1} END{exit bad || a!=1 || b!=1}' "$patch_source" || exit 1
                    forward=0; reverse=0
                    mzd_patch_probe "$folder" install "$patch_source" && forward=1
                    mzd_patch_probe "$folder" uninstall "$patch_source" && reverse=1
                    [ ! -e "$folder/probe-error" ] || exit 1
                    case "$forward:$reverse" in
                        1:0) state=uninstalled; direction=install ;;
                        0:1) state=installed; direction=uninstall ;;
                        *) printf 'Unknown or ambiguous patch state: %s\n' "$target" >&2; exit 1 ;;
                    esac
                    cp "$folder/$direction/target.data" "$folder/after.data" || exit 1
                else
                    mzd_bundle_transform "$target" uninstall "$folder/removed.data" "$plan/components" || exit 1
                    mzd_bundle_transform "$folder/removed.data" install "$folder/added.data" "$plan/components" || exit 1
                    if cmp -s "$target" "$folder/removed.data"; then
                        state=uninstalled
                        cp "$folder/added.data" "$folder/after.data" || exit 1
                        mzd_bundle_transform "$folder/after.data" uninstall "$folder/inverse.data" "$plan/components" || exit 1
                        cmp -s "$target" "$folder/inverse.data" || { printf 'Loader insertion is not exactly reversible.\n' >&2; exit 1; }
                    else
                        # Check each own reference, allowing other preload tokens/order.
                        while IFS="$tab" read -r k d s svc h; do
                            [ "$k" = shim ] || continue
                            SHIM_SERVICE=$svc; SHIM_PATH=$d
                            [ "$(mzd_shim_transform "$target" status)" = installed ] || { printf 'Partial loader configuration.\n' >&2; exit 1; }
                        done < "$plan/components"
                        state=installed; cp "$folder/removed.data" "$folder/after.data" || exit 1
                    fi
                fi
                if [ -e "$target.org" ] || [ -L "$target.org" ]; then
                    mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || {
                        printf 'Invalid OEM backup: %s.org (expected MD5 %s).\n' "$target" "$original" >&2; exit 1;
                    }
                elif [ "$(mzd_hash "$target")" != "$original" ]; then
                    printf 'Modified target has no verified OEM backup: %s\n' "$target" >&2; exit 1
                fi
                ;;
        esac
        printf '%s\n' "$state" > "$folder/state"
        if [ "$state" = installed ]; then present=$((present+1)); else absent=$((absent+1)); fi
        # Prepare only the state transition requested; never toggle a component.
        case "$requested:$state" in install:installed|uninstall:uninstalled) : > "$folder/noop" ;; esac
    done < "$plan/components"
    printf '%s\n' "$number" > "$plan/count"
    # Only this package's declared files may occupy the private payload directory.
    payload_dir="${PAYLOAD_DIR:-$MZD_COMPONENT_STORAGE/mzd-tweaks/shims/$ID}"
    for existing in "$payload_dir"/* "$payload_dir"/.[!.]* "$payload_dir"/..?*; do
        [ -e "$existing" ] || [ -L "$existing" ] || continue
        awk -F "$(printf '\t')" -v p="$existing" '$2==p && $1~/^(file|config|shim)$/{found=1} END{exit !found}' "$plan/components" || {
            printf 'Unknown file in the owned payload directory: %s\n' "$existing" >&2; exit 1;
        }
    done
    if [ "$present" = 0 ]; then printf 'uninstalled\n'
    elif [ "$absent" = 0 ]; then printf 'installed\n'
    else printf 'Partial component installation.\n' >&2; exit 1; fi
)
mzd_bundle_cleanup() (
    result=0
    if [ -f "$MZD_REPORT/temp.path" ]; then cat "$MZD_REPORT/temp.path" >> "$MZD_REPORT/temps" || result=1; fi
    if [ "${BUNDLE_COMMITTED:-0}" = 0 ] && [ -f "$MZD_REPORT/changed" ]; then
        awk '{a[NR]=$0} END{for(i=NR;i>0;i--)print a[i]}' "$MZD_REPORT/changed" > "$MZD_REPORT/reverse" || result=1
        while IFS= read -r number; do
            # If a dependent restore fails, retain libraries/configuration and
            # do not restore any further load references to missing payloads.
            [ "$result" = 0 ] || break
            folder="$MZD_REPORT/plan/$number"; target=$(cat "$folder/target.path") || { result=1; continue; }
            if [ -f "$folder/before.absent" ]; then
                if [ ! -e "$target" ] && [ ! -L "$target" ]; then continue; fi
                if cmp -s "$target" "$folder/after.data"; then rm -f "$target" || result=1; else result=1; fi
            elif cmp -s "$target" "$folder/before.data"; then :
            elif cmp -s "$target" "$folder/after.data" || { [ -f "$folder/deleting" ] && [ ! -e "$target" ] && [ ! -L "$target" ]; }; then
                mzd_restore_write "$target" "$folder/before.data" "$folder/before.data" || result=1
                if [ -f "$MZD_REPORT/temp.path" ]; then cat "$MZD_REPORT/temp.path" >> "$MZD_REPORT/temps" || result=1; fi
            else printf 'Concurrent change prevents rollback: %s. Do NOT reboot.\n' "$target" >&4; result=1; fi
        done < "$MZD_REPORT/reverse"
    fi
    # Only unlink explicitly recorded temporaries belonging to a declared target.
    for ledger in "$MZD_REPORT/temp.path" "$MZD_REPORT/temps"; do
        [ -f "$ledger" ] || continue
        while IFS= read -r temp; do
            owned=0
            for folder in "$MZD_REPORT/plan/"[0-9]*; do
                [ -d "$folder" ] || continue
                target=$(cat "$folder/target.path") || continue
                case "$temp" in "$target".mzd-restore-*) suffix=${temp#"$target.mzd-restore-"}; case "$suffix" in ''|*[!0-9]*) ;; *) owned=1 ;; esac ;; esac
            done
            if [ "$owned" = 1 ]; then rm -f "$temp" || result=1; else result=1; fi
        done < "$ledger"
    done
    if [ -f "$MZD_REPORT/created-directory" ]; then
        dir=$(cat "$MZD_REPORT/created-directory") || exit 1
        if [ "${BUNDLE_COMMITTED:-0}" = 0 ] && [ "$result" = 0 ]; then rmdir "$dir" || result=1; fi
    fi
    mzd_system_cleanup || result=1
    exit "$result"
)
mzd_bundle_apply() {
    BUNDLE_COMMITTED=0
    mzd_begin "$SELF" "$ID" mzd_bundle_cleanup
    mzd_system_begin
    # All mixed transactions also serialize with single-shim workers.
    mzd_system_lock /tmp/mzd-sm-config-tweak.lock || exit 1
    [ "$LOCK" = /tmp/mzd-sm-config-tweak.lock ] || mzd_system_lock "$LOCK" || exit 1
    mkdir "$MZD_REPORT/plan" || exit 1
    : > "$MZD_REPORT/changed"; : > "$MZD_REPORT/temps"
    state=$(mzd_bundle_plan "$MZD_REPORT/plan" "$ACTION") || mzd_fail 'Component preflight failed; nothing changed.'
    case "$ACTION:$state" in
        install:installed|uninstall:uninstalled) BUNDLE_COMMITTED=1; MZD_SUCCESS='Requested state is already present.'; return ;;
        install:uninstalled|uninstall:installed) ;;
        *) mzd_fail 'Components are not in a complete supported state.' ;;
    esac
    if [ "$ACTION" = install ]; then mzd_bundle_preflight || mzd_fail 'Vehicle requirements are not met.'; fi
    payload_dir="${PAYLOAD_DIR:-$MZD_COMPONENT_STORAGE/mzd-tweaks/shims/$ID}"
    for folder in "$MZD_REPORT/plan/"[0-9]*; do
        target=$(cat "$folder/target.path") || exit 1
        mount_point=$(mzd_shim_mount "$target") || mzd_fail 'Unsupported internal component filesystem.'
        kind=$(cat "$folder/kind") || exit 1
        case "$kind" in file|config|shim)
            [ "$mount_point" = "$MZD_COMPONENT_STORAGE" ] || mzd_fail 'Payload storage must be the mounted persistent partition.' ;;
        esac
        mzd_system_remount_rw "$mount_point" || exit 1
    done
    needed=$(du -sk "$MZD_REPORT/plan" | awk '{print $1+1024}')
    available=$(df -Pk "$MZD_COMPONENT_STORAGE" | awk 'NR==2{print $4}')
    case "$needed:$available" in *[!0-9:]*|:*|*:) mzd_fail 'Cannot determine payload storage space.' ;; esac
    [ "$available" -ge "$needed" ] || mzd_fail 'Insufficient persistent storage space.'
    mzd_system_watchdog_disable || exit 1
    mzd_report_start
    # Install publishes all payloads before references. Uninstall does the reverse.
    if [ "$ACTION" = install ]; then phases='payload target'; else phases='target payload'; fi
    for phase in $phases; do
        number=0
        while [ "$number" -lt "$(cat "$MZD_REPORT/plan/count")" ]; do
            number=$((number+1)); folder="$MZD_REPORT/plan/$number"
            [ ! -f "$folder/noop" ] || continue
            kind=$(cat "$folder/kind"); target=$(cat "$folder/target.path")
            case "$kind:$phase" in file:payload|config:payload|shim:payload|loader:target|patch:target) ;; *) continue ;; esac
            if [ -f "$folder/before.absent" ]; then
                [ ! -e "$target" ] && [ ! -L "$target" ] || mzd_fail 'Component appeared during preparation.'
            else cmp -s "$target" "$folder/before.data" || mzd_fail 'Component changed during preparation.'; fi
            case "$kind" in
                loader|patch)
                    original=$(cat "$folder/original.md5")
                    if [ -e "$target.org" ] || [ -L "$target.org" ]; then
                        mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || mzd_fail 'OEM backup changed.'
                    else
                        [ "$(mzd_hash "$target")" = "$original" ] || mzd_fail 'Cannot back up modified content.'
                        cp -a "$target" "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || mzd_fail 'OEM backup verification failed.'
                    fi ;;
                *)
                    if [ "$ACTION" = install ] && [ ! -d "$payload_dir" ]; then
                        printf '%s\n' "$payload_dir" > "$MZD_REPORT/created-directory" || exit 1
                        mkdir -p "$payload_dir" || exit 1
                    fi ;;
            esac
            printf '%s\n' "$number" >> "$MZD_REPORT/changed" || exit 1
            case "$kind:$ACTION" in
                file:uninstall|config:uninstall|shim:uninstall)
                    : > "$folder/deleting"
                    rm -f "$target" || mzd_fail 'Payload removal failed.' ;;
                *)
                    mzd_restore_write "$target" "$folder/after.data" "$folder/after.data" || mzd_fail 'Component write failed; rolling back.' ;;
            esac
        done
    done
    verify=$(mktemp -d /tmp/mzd-bundle-verify.XXXXXX) || exit 1
    verified=$(mzd_bundle_plan "$verify" verify); code=$?; rm -rf "$verify"
    case "$ACTION:$code:$verified" in install:0:installed|uninstall:0:uninstalled) ;; *) mzd_fail 'Final component verification failed; rolling back.' ;; esac
    if [ "$ACTION" = uninstall ] && [ -d "$payload_dir" ]; then rmdir "$payload_dir" || mzd_fail 'Payload directory is not empty.'; fi
    sync; BUNDLE_COMMITTED=1
    MZD_SUCCESS="$(printf '%s' "$ACTION" | awk '{print toupper(substr($0,1,1)) substr($0,2)}') completed. Restart the CMU to apply the changes.
Reports: $MZD_REPORT"
}
mzd_bundle_main() (
    [ "$#" -le 1 ] || { printf 'Expected one action.\n' >&2; exit 1; }
    case "${1:-}" in
        ''|-h|--help) printf 'Usage: sh run.sh <install|uninstall|status|preflight>\n'; exit 0 ;;
        install|uninstall|status|preflight|validate-install) ACTION=$1 ;; *) printf 'Unsupported action.\n' >&2; exit 1 ;;
    esac
    if [ "${MZD_WORKER_DIRECT:-}" != 1 ] && [ "$ACTION" != preflight ] && [ "$ACTION" != validate-install ]; then
        . "$ROOT/lib/manifest.sh" && . "$ROOT/lib/packages.sh" || exit 1
        mzd_package_action "$ROOT" "${HERE##*/}" "$ACTION"; exit $?
    fi
    mzd_bundle_load || exit 1
    if [ "$ACTION" = preflight ]; then mzd_bundle_preflight; exit $?; fi
    if [ -z "${MZD_SETTINGS_FILE:-}" ] && [ "$ACTION" != status ]; then
        printf 'Normalized settings from the package controller are required.\n' >&2; exit 1
    fi
    if [ "$ACTION" = validate-install ]; then mzd_bundle_validate_install; exit $?; fi
    if [ "$ACTION" = status ]; then
        scratch=$(mktemp -d /tmp/mzd-bundle-status.XXXXXX) || exit 1
        trap 'rm -rf "$scratch"' 0
        if [ -z "${MZD_SETTINGS_FILE:-}" ]; then
            mzd_settings_normalize "$HERE/manifest.conf" > "$scratch/settings.conf" || exit 1
            MZD_SETTINGS_FILE="$scratch/settings.conf"
        fi
        if state=$(mzd_bundle_plan "$scratch" status 2> "$scratch/reason"); then printf '%s\n' "$state"
        else
            payload_dir="${PAYLOAD_DIR:-$MZD_COMPONENT_STORAGE/mzd-tweaks/shims/$ID}"
            if [ -d "$payload_dir" ]; then printf 'broken\n'; else printf 'unavailable\n'; fi
            cat "$scratch/reason" >&2
        fi
        exit 0
    fi
    mzd_require_tools mkdir rmdir mv mount sync du df date || exit 1
    mzd_bundle_apply
)
mzd_bundle_reset_main() (
    [ "$#" = 1 ] || exit 1
    phase=$1
    case "$phase" in check|prepare|finish) ;; *) exit 1 ;; esac
    mzd_bundle_load || exit 1
    scratch=$(mktemp -d /tmp/mzd-bundle-reset.XXXXXX) || exit 1
    trap 'rm -rf "$scratch"' 0
    mzd_components records > "$scratch/components" || exit 1
    mzd_settings_check "$HERE/manifest.conf" "${MZD_SETTINGS_FILE:-}" || exit 1
    tab=$(printf '\t'); number=0
    payload_dir="${PAYLOAD_DIR:-$MZD_COMPONENT_STORAGE/mzd-tweaks/shims/$ID}"
    mzd_shim_parent_ok "$payload_dir" || exit 1
    for existing in "$payload_dir"/* "$payload_dir"/.[!.]* "$payload_dir"/..?*; do
        [ -e "$existing" ] || [ -L "$existing" ] || continue
        awk -F "$(printf '\t')" -v p="$existing" '$2==p && $1~/^(file|config|shim)$/{found=1} END{exit !found}' "$scratch/components" || { printf 'Unknown owned-directory file: %s\n' "$existing" >&2; exit 1; }
    done
    while IFS="$tab" read -r kind target source service original; do
        mzd_shim_parent_ok "$target" || exit 1
        case "$kind" in
            loader|patch)
                mzd_asset_readable "$target" || exit 1
                if [ "$phase" = finish ]; then
                    [ "$(mzd_hash "$target")" = "$original" ] || { printf 'Loader/patch target has not been restored: %s\n' "$target" >&2; exit 1; }
                elif [ "$(mzd_hash "$target")" != "$original" ]; then
                    mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || { printf 'Reset requires the verified OEM backup: %s\n' "$target" >&2; exit 1; }
                fi ;;
            file|config|shim)
                number=$((number+1))
                if [ -e "$target" ] || [ -L "$target" ]; then
                    mzd_asset_readable "$target" || exit 1
                    if [ "$kind" = config ]; then mzd_component_config "$HERE/$source" "$scratch/expected" || exit 1
                    else cp "$HERE/$source" "$scratch/expected" || exit 1; fi
                    cmp -s "$target" "$scratch/expected" || { printf 'Unknown payload; reset refused: %s\n' "$target" >&2; exit 1; }
                    if [ "$phase" = prepare ]; then
                        [ "${ACTION:-}" = run ] && [ -d "${MZD_RESET_DIR:-}" ] || exit 1
                        cp -a "$target" "$MZD_RESET_DIR/payload-$number" && cmp -s "$target" "$MZD_RESET_DIR/payload-$number" || exit 1
                    fi
                    printf '%s\n' "$target" >> "$scratch/payloads" || exit 1
                fi ;;
        esac
    done < "$scratch/components"
    [ "$phase" = finish ] || exit 0
    [ "${ACTION:-}" = run ] && [ -d "${MZD_RESET_DIR:-}" ] && [ -d "${MZD_SYSTEM:-}" ] || exit 1
    mount_point=$(mzd_shim_mount "$payload_dir") || exit 1
    [ "$mount_point" = "$MZD_COMPONENT_STORAGE" ] || exit 1
    mzd_system_remount_rw "$mount_point" || exit 1
    if [ -f "$scratch/payloads" ]; then
        while IFS= read -r target; do rm -f "$target" || exit 2; done < "$scratch/payloads"
    fi
    if [ -d "$payload_dir" ]; then rmdir "$payload_dir" || exit 2; fi
    sync
)
