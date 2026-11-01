#!/bin/sh
# Persistent package format 1. All paths and state are data, never evaluated.
MZD_PACKAGE_STORE=/tmp/mnt/data_persist/mzd-tweaks/installed
MZD_PACKAGE_MOUNT=/tmp/mnt/data_persist
MZD_PACKAGE_MOUNTS=/proc/mounts
MZD_PACKAGE_LOCK=/tmp/mzd-packages.lock

mzd_package_error() { printf 'Packages: %s\n' "$*" >&2; return 1; }
mzd_package_state() (
    [ -f "$1/state.conf" ] && [ ! -L "$1/state.conf" ] || exit 1
    awk '
      $0=="format=1" {format++; next}
      /^state=(prepared|installing|installed|uninstalling|restoring|failed)$/ {state++; value=substr($0,7); next}
      {bad=1}
      END {if(bad || format!=1 || state!=1)exit 1; print value}
    ' "$1/state.conf"
)
mzd_package_set_state() {
    printf 'format=1\nstate=%s\n' "$2" > "$1/state.next" &&
        mv "$1/state.next" "$1/state.conf" && sync
}
mzd_package_tree_ok() (
    [ -d "$1" ] && [ ! -L "$1" ] || exit 1
    # No links, devices or delimiter-bearing names in executable snapshots.
    bad=$(find "$1" ! -type d ! -type f -print) || exit 1
    [ -z "$bad" ] || exit 1
    bad=$(find "$1" \( -name '*
*' -o -name '*	*' -o -name '*\\*' \) -print) || exit 1
    [ -z "$bad" ]
)
mzd_package_inventory() (
    cd "$1" || exit 1
    find package -type f | LC_ALL=C sort | while IFS= read -r file; do
        case "$file" in *"$(printf '\t')"*|*'\'*) exit 1 ;; esac
        hash=$(md5sum "$file") || exit 1
        printf '%s\t%s\n' "${hash%% *}" "$file" || exit 1
    done
)
# Full verification uses RAM only; stored code never comes from the new USB.
mzd_package_check() (
    entry=$1
    mzd_package_tree_ok "$entry" || { mzd_package_error 'Saved package contains unsupported files.'; exit 1; }
    for path in "$entry"/* "$entry"/.[!.]* "$entry"/..?*; do
        [ -e "$path" ] || continue
        case "${path##*/}" in package|package.files|paths.tsv|state.conf|state.next|failure.log|failure.next) ;;
            *) mzd_package_error 'Unexpected files in saved installation; nothing deleted.'; exit 1 ;;
        esac
    done
    temp=$(mktemp /tmp/mzd-package-check.XXXXXX) || exit 1
    trap 'rm -f "$temp"' 0
    mzd_package_inventory "$entry" > "$temp" && cmp -s "$temp" "$entry/package.files" || {
        mzd_package_error 'Saved package is missing or changed; nothing executed.'; exit 1;
    }
    mzd_manifest_load "$entry/package/tweaks/${entry##*/}/manifest.conf" || exit 1
    [ "$ID" = "${entry##*/}" ] || exit 1
    if [ -n "${SETTINGS:-}" ] || [ -e "$entry/package/settings.conf" ]; then
        . "$entry/package/lib/settings.sh" || exit 1
        mzd_settings_check "$entry/package/tweaks/$ID/manifest.conf" "$entry/package/settings.conf" || exit 1
    fi
    mzd_package_paths "$entry/package/tweaks/$ID" > "$temp" && cmp -s "$temp" "$entry/paths.tsv" || {
        mzd_package_error 'Saved ownership record differs from its package.'; exit 1;
    }
)
mzd_package_presence() (
    entry=$1
    [ -s "$entry/package.files" ] || { mzd_package_error "Saved inventory is missing or empty: $entry/package.files"; exit 1; }
    [ -s "$entry/paths.tsv" ] || { mzd_package_error "Saved ownership record is missing or empty: $entry/paths.tsv"; exit 1; }
    tab=$(printf '\t')
    while IFS="$tab" read -r hash file; do
        case "$hash" in ''|*[!0-9a-f]*) exit 1 ;; esac
        [ "${#hash}" = 32 ] || exit 1
        case "$file" in package/*) ;; *) exit 1 ;; esac
        case "/$file/" in *'/../'*|*'/./'*) exit 1 ;; esac
        [ -f "$entry/$file" ] && [ ! -L "$entry/$file" ] || { mzd_package_error "Saved package file is missing or invalid: $entry/$file"; exit 1; }
    done < "$entry/package.files"
    mzd_package_paths_ok "$entry/paths.tsv" || exit 1
    while IFS="$tab" read -r kind path; do
        [ -e "$path" ] || [ -L "$path" ] || { mzd_package_error "Registered target is missing: $path"; exit 1; }
    done < "$entry/paths.tsv"
)
mzd_package_status() (
    entry="$MZD_PACKAGE_STORE/$1"
    [ -d "$entry" ] && [ ! -L "$entry" ] || { printf 'broken\n'; mzd_package_error 'Saved package path is invalid.'; exit 0; }
    state=$(mzd_package_state "$entry") || state=invalid
    if [ "$state" != installed ]; then
        printf 'broken\n'; mzd_package_error "Saved installation state: $state."
        if [ -f "$entry/failure.log" ] && [ ! -L "$entry/failure.log" ]; then
            printf 'Previous worker failure (%s/failure.log):\n' "$entry" >&2
            awk 'BEGIN {left=4096} left>0 {s=substr($0,1,left-1); print s; left-=length(s)+1}' "$entry/failure.log" >&2
        else printf 'Original failure details were not recorded by that installer version; inspect its USB action report.\n' >&2; fi
        exit 0
    fi
    for file in state.conf package.files paths.tsv package/tweaks/"$1"/run.sh package/tweaks/"$1"/manifest.conf package/lib/manifest.sh package/lib/report.sh package/lib/system.sh package/lib/patch.sh package/lib/status.sh; do
        [ -f "$entry/$file" ] && [ ! -L "$entry/$file" ] || {
            printf 'broken\n'; mzd_package_error "Saved installation is incomplete: $file"; exit 0;
        }
    done
    mzd_package_presence "$entry" || {
        printf 'broken\n'; mzd_package_error 'A saved package file or registered target is missing.'; exit 0;
    }
    printf 'installed\n'
)
mzd_package_storage() (
    mode=$(awk -v p="$MZD_PACKAGE_MOUNT" '$2==p && $3!="tmpfs" && $3!="rootfs" {print $4; exit}' "$MZD_PACKAGE_MOUNTS")
    case ",$mode," in *,rw,*) ;; *) mzd_package_error 'Persistent storage is missing or not writable.'; exit 1 ;; esac
    p=$MZD_PACKAGE_STORE
    while [ "$p" != / ]; do [ ! -L "$p" ] || exit 1; p=$(dirname "$p"); done
)
mzd_package_paths() (
    mzd_manifest_load "$1/manifest.conf" || exit 1
    if [ "$TYPE" = gui-extension ]; then
        . "${1%/tweaks/*}/lib/gui-extension.sh" || exit 1
        mzd_gui_paths "$1"; exit $?
    fi
    if [ -n "${COMPONENTS:-}" ]; then mzd_components paths; exit $?; fi
    if [ -f "$1/managed-paths.tsv" ]; then
        cat "$1/managed-paths.tsv" || exit 1
        awk -F "$(printf '\t')" -v target="$APP" '$2==target {found=1} END {exit !found}' "$1/managed-paths.tsv" && [ -z "${SHIM_PATH:-}" ] && exit 0
    fi
    printf 'patch\t%s\n' "$APP"
    if [ -n "${SHIM_PATH:-}" ]; then
        for pair in $SHIM_EXTRA_TARGETS; do printf 'patch\t%s\n' "${pair%:*}"; done
        printf 'shim\t%s\ncreate\t%s\n' "$SHIM_PATH" "${SHIM_PATH%/*}"
    fi
)
mzd_package_paths_ok() {
    awk -F "$(printf '\t')" 'NF!=2 || $1!~/^(patch|create|shim)$/ || $2!~/^\// || $2~/[[:cntrl:]]/ || $2~/\/\.\.?($|\/)/ || seen[$2]++ {bad=1} END {exit bad}' "$1"
}
mzd_package_install_paths() (
    incoming=$1
    for other in "$MZD_PACKAGE_STORE"/*; do
        [ -e "$other" ] || [ -L "$other" ] || continue
        [ "$other" != "${2:-}" ] || continue
        mzd_package_check "$other" || exit 1
        state=$(mzd_package_state "$other") || state=invalid
        [ "$state" = installed ] || { mzd_package_error "Incomplete installation needs attention first: ${other##*/}"; exit 1; }
        [ -f "$other/paths.tsv" ] && mzd_package_paths_ok "$other/paths.tsv" || exit 1
        awk -F "$(printf '\t')" 'NR==FNR {used[$2]=1; kind[$2]=$1; next} {if(kind[$2]=="shim")bad=1; if($1=="create" || $1=="shim")for(p in used) if(p==$2 || index(p,$2 "/")==1) bad=1} END {exit bad}' "$other/paths.tsv" "$incoming" || {
            mzd_package_error "A managed file is already used by installed tweak: ${other##*/}"; exit 1;
        }
    done
)
mzd_package_requirements() (
    mzd_manifest_load "$1/manifest.conf" || exit 1
    for dependency in $REQUIRES; do
        [ "$dependency" != "$ID" ] && [ "$(mzd_package_state "$MZD_PACKAGE_STORE/$dependency")" = installed ] || {
            mzd_package_error "Requires a complete managed installation: $dependency"; exit 1;
        }
        mzd_package_check "$MZD_PACKAGE_STORE/$dependency" || exit 1
        result=$(mzd_package_worker "$MZD_PACKAGE_STORE/$dependency" status); code=$?
        [ "$code" = 0 ] && [ "$result" = installed ] || {
            mzd_package_error "Required installation failed its deep check: $dependency"; exit 1;
        }
    done
    for conflict in $CONFLICTS; do
        if [ -e "$MZD_PACKAGE_STORE/$conflict" ] || [ -L "$MZD_PACKAGE_STORE/$conflict" ]; then
            mzd_package_error "Conflicting saved installation: $conflict"; exit 1
        fi
    done
)
mzd_package_dependents() (
    candidate=$1
    for other in "$MZD_PACKAGE_STORE"/*; do
        [ -e "$other" ] || [ -L "$other" ] || continue
        [ "$other" != "$candidate" ] || continue
        mzd_package_check "$other" || exit 1
        mzd_manifest_load "$other/package/tweaks/${other##*/}/manifest.conf" || {
            mzd_package_error 'Another saved installation cannot be inspected.'; exit 1;
        }
        case " $REQUIRES " in *" ${candidate##*/} "*) mzd_package_error "Required by installed tweak: $ID"; exit 1 ;; esac
        [ -f "$other/paths.tsv" ] && mzd_package_paths_ok "$other/paths.tsv" || exit 1
        if ! awk -F "$(printf '\t')" 'NR==FNR {if($1=="create" || $1=="shim") owned[$2]=1; next} {for(p in owned) if(p==$2 || index($2,p "/")==1) bad=1} END {exit bad}' "$candidate/paths.tsv" "$other/paths.tsv"; then
            mzd_package_error "A managed file is used by installed tweak: $ID"; exit 1
        fi
    done
)
mzd_package_worker_raw() (
    # A remembered package layout keeps worker-relative library paths unchanged.
    worker="$1/package/tweaks/${1##*/}/run.sh"
    MZD_WORKER_DIRECT=1; export MZD_WORKER_DIRECT MZD_ORIGIN_USB
    MZD_PACKAGE_STATE=$(mzd_package_state "$1") || exit 1
    export MZD_PACKAGE_STATE
    unset MZD_SETTINGS_FILE
    mzd_manifest_load "${worker%/*}/manifest.conf" || exit 1
    if [ -n "${SETTINGS:-}" ] || [ -e "$1/package/settings.conf" ]; then
        . "$1/package/lib/settings.sh" || exit 1
        mzd_settings_check "${worker%/*}/manifest.conf" "$1/package/settings.conf" || exit 1
        MZD_SETTINGS_FILE="$1/package/settings.conf"; export MZD_SETTINGS_FILE
    fi
    sh "$worker" "$2"
)
# Persist the last failed modifying worker outside its immutable inventory.
# Status only reads this record; it never opens reports or changes the package.
mzd_package_worker() (
    if [ "$2" = status ] && [ "$#" = 2 ]; then mzd_package_worker_raw "$@"; exit $?; fi
    capture=$(mktemp -d /tmp/mzd-worker-result.XXXXXX) || exit 1
    trap 'rm -rf "$capture"' 0
    mzd_package_worker_raw "$1" "$2" > "$capture/stdout" 2> "$capture/stderr"; worker_code=$?
    worker_phase=$2
    if [ "$#" = 3 ]; then
        worker_phase="$3-verification"
        actual_state=$(cat "$capture/stdout")
        if [ "$worker_code" != 0 ] || [ "$actual_state" != "$3" ]; then
            printf 'Verification expected state=%s; actual state=%s; status exit=%s.\n' "$3" "$actual_state" "$worker_code" >> "$capture/stderr"
            worker_code=2
        fi
    fi
    if [ "$worker_code" != 0 ]; then
        if {
            printf 'phase=%s\nexit_code=%s\nworker=%s/package/tweaks/%s/run.sh\n' "$worker_phase" "$worker_code" "$1" "${1##*/}"
            printf 'saved_version='
            awk -F= '$1=="version" {print substr($0,9); exit}' "$1/package/tweaks/${1##*/}/manifest.conf"
            printf 'stderr:\n'
            awk 'BEGIN {left=4096} left>0 {s=substr($0,1,left-1); print s; left-=length(s)+1}' "$capture/stderr"
            printf 'stdout:\n'
            awk 'BEGIN {left=4096} left>0 {s=substr($0,1,left-1); print s; left-=length(s)+1}' "$capture/stdout"
        } > "$1/failure.next" && mv "$1/failure.next" "$1/failure.log"; then :
        else printf 'Packages: Could not persist worker failure diagnostics.\n' >&2; fi
    fi
    cat "$capture/stdout"
    cat "$capture/stderr" >&2
    exit "$worker_code"
)
mzd_package_remove() {
    mzd_package_check "$1" && mzd_package_dependents "$1" || return 1
    mzd_package_set_state "$1" uninstalling || return 1
    mzd_package_worker "$1" uninstall; code=$?
    if [ "$code" != 0 ]; then mzd_package_set_state "$1" failed || :; return "$code"; fi
    result=$(mzd_package_worker "$1" status uninstalled); code=$?
    if [ "$code" != 0 ] || [ "$result" != uninstalled ]; then
        mzd_package_set_state "$1" failed || :
        mzd_package_error 'Uninstall could not be verified; saved package retained. Do NOT reboot.'; return 2
    fi
    # Restrict recursive deletion to a validated direct child of the store.
    [ "$1" = "$MZD_PACKAGE_STORE/${1##*/}" ] || return 2
    if ! rm -rf "$1"; then mzd_package_error 'Uninstall succeeded but package cleanup failed.'; return 2; fi
    sync
}
mzd_package_user_check() (
    user_dir="$1/user/$2"
    [ -n "${MZD_CONFIG_SIZE_LIMIT:-}" ] || . "$1/lib/defines.sh" 2>/dev/null || :
    [ -e "$user_dir" ] || [ -L "$user_dir" ] || return 0
    [ -d "$user_dir" ] && [ ! -L "$user_dir" ] || { mzd_package_error 'Invalid user configuration directory.'; exit 1; }
    mzd_package_tree_ok "$user_dir" || exit 1
    for user_file in "$user_dir"/*; do
        [ -e "$user_file" ] || continue
        [ -f "$user_file" ] && [ ! -L "$user_file" ] || { mzd_package_error 'Configuration override must be a regular file.'; exit 1; }
        case "${user_file##*/}" in *.conf) ;; *) mzd_package_error "Unsupported configuration override: ${user_file##*/}"; exit 1 ;; esac
        file_size=$(( $(wc -c < "$user_file") ))
        [ "$file_size" -le "${MZD_CONFIG_SIZE_LIMIT:-65536}" ] || { mzd_package_error "Configuration override exceeds size limit of $(( ${MZD_CONFIG_SIZE_LIMIT:-65536} / 1024 )) KB: ${user_file##*/}"; exit 1; }
    done
)
mzd_package_stage() (
    source=$1; stage=$2; id=$3
    [ -n "${MZD_CONFIG_SIZE_LIMIT:-}" ] || . "$source/lib/defines.sh" 2>/dev/null || :
    mzd_package_tree_ok "$source/tweaks/$id" && mzd_package_tree_ok "$source/lib" || exit 1
    mzd_package_user_check "$source" "$id" || exit 1
    if [ -d "$source/user/$id" ]; then
        sizes=$(du -sk "$source/tweaks/$id" "$source/lib" "$source/user/$id") || exit 1
    else
        sizes=$(du -sk "$source/tweaks/$id" "$source/lib") || exit 1
    fi
    needed=$(printf '%s\n' "$sizes" | awk '{n+=$1} END {print n+1024}')
    df -Pk "$MZD_PACKAGE_MOUNT" | awk -v needed="$needed" 'NR==2 {reserve=$2/10; if(reserve<65536)reserve=65536; ok=($4-needed>=reserve)} END {exit !ok}' || {
        mzd_package_error 'Not enough persistent space; installation has not started.'; exit 1;
    }
    mkdir -p "$stage/package/tweaks" || exit 1
    cp -R "$source/lib" "$stage/package/lib" && cp -R "$source/tweaks/$id" "$stage/package/tweaks/$id" || exit 1
    # Compare byte inventories before publishing or touching a system target.
    for folder in lib "tweaks/$id"; do
        diff -r "$source/$folder" "$stage/package/$folder" >/dev/null || exit 1
    done
    mzd_manifest_load "$stage/package/tweaks/$id/manifest.conf" || exit 1
    [ "$ID" = "$id" ] || { mzd_package_error 'Copied package ID differs from its folder.'; exit 1; }
    [ -z "${4:-}" ] || [ "$VERSION" = "$4" ] || { mzd_package_error 'USB version changed while staging.'; exit 1; }
    mzd_package_paths "$stage/package/tweaks/$id" > "$stage/paths.tsv" && mzd_package_paths_ok "$stage/paths.tsv" || exit 1
    for asset_conf in "$stage/package/tweaks/$id/assets/"*.conf; do
        [ -f "$asset_conf" ] && [ ! -L "$asset_conf" ] || continue
        conf_name=${asset_conf##*/}
        user_conf="$source/user/$id/$conf_name"
        if [ -f "$user_conf" ] && [ ! -L "$user_conf" ]; then
            cp "$user_conf" "$asset_conf" && cmp -s "$user_conf" "$asset_conf" || exit 1
        fi
    done
    if [ -n "${SETTINGS:-}${COMPONENTS:-}" ]; then
        . "$stage/package/lib/settings.sh" || exit 1
        mzd_settings_check "$stage/package/tweaks/$id/manifest.conf" "${MZD_SETTINGS_FILE:-}" || exit 1
        cp "$MZD_SETTINGS_FILE" "$stage/package/settings.conf" && cmp -s "$MZD_SETTINGS_FILE" "$stage/package/settings.conf" || exit 1
    fi
    mzd_package_inventory "$stage" > "$stage/package.files" || exit 1
    mzd_package_set_state "$stage" prepared
)
mzd_package_action() (
    source=$1; id=$2; action=$3; shift 3
    unset MZD_PACKAGE_STATE
    MZD_WORKER_DIRECT=1; export MZD_WORKER_DIRECT
    mzd_manifest_id "$id" || exit 1
    case "$action" in install|uninstall|status) ;; *) mzd_package_error 'Unsupported package action.'; exit 1 ;; esac
    entry="$MZD_PACKAGE_STORE/$id"
    if [ "$action" = status ]; then
        if [ -e "$entry" ] || [ -L "$entry" ]; then mzd_package_status "$id"; exit $?; fi
        printf 'uninstalled\n'; exit 0
    fi
    [ "$action" = install ] || [ "$#" = 0 ] || { mzd_package_error 'Settings are accepted only for Install.'; exit 1; }
    settings_tmp=''
    if [ "$action" = install ]; then
        . "$source/lib/settings.sh" || exit 1
        mzd_manifest_load "$source/tweaks/$id/manifest.conf" || exit 1
        settings_tmp=$(mktemp /tmp/mzd-install-settings.XXXXXX) || exit 1
        mzd_settings_normalize "$source/tweaks/$id/manifest.conf" "$@" > "$settings_tmp" || { rm -f "$settings_tmp"; exit 1; }
        MZD_SETTINGS_FILE=$settings_tmp; export MZD_SETTINGS_FILE
    fi
    trap '[ -z "$settings_tmp" ] || rm -f "$settings_tmp"' 0
    mzd_package_storage || exit 1
    mkdir -p "$MZD_PACKAGE_STORE" || exit 1
    mkdir "$MZD_PACKAGE_LOCK" 2>/dev/null || { mzd_package_error 'Another package operation or Restore is active.'; exit 1; }
    stage=''
    trap 'code=$?; [ -z "$settings_tmp" ] || rm -f "$settings_tmp"; [ -z "$stage" ] || rm -rf "$stage"; rmdir "$MZD_PACKAGE_LOCK" 2>/dev/null || :; exit "$code"' 0
    trap 'exit 2' INT TERM
    MZD_ORIGIN_USB=$source; export MZD_ORIGIN_USB
    # Preserve the actual USB mount for workers executing from persistent storage.
    while [ "$MZD_ORIGIN_USB" != / ]; do
        grep -q " $MZD_ORIGIN_USB " "$MZD_PACKAGE_MOUNTS" && break
        MZD_ORIGIN_USB=$(dirname "$MZD_ORIGIN_USB")
    done
    [ "$MZD_ORIGIN_USB" != / ] || { mzd_package_error 'Originating USB mount is missing.'; exit 1; }
    requested=''; requested_type=''
    if [ "$action" = install ]; then
        mzd_package_user_check "$source" "$id" || exit 1
        mzd_manifest_load "$source/tweaks/$id/manifest.conf" || exit 1
        [ "$ID" = "$id" ] || { mzd_package_error 'Manifest ID differs from its folder.'; exit 1; }
        requested=$VERSION; requested_type=$TYPE
        awk -v expected="JCI_SW_VER=\"MAZ_CMU-150_$FIRMWARE\"" '$0==expected {found=1} END {exit !found}' /jci/version.ini || {
            mzd_package_error 'USB package does not support the current firmware; existing installation unchanged.'; exit 1;
        }
        if [ -n "${SHIM_ASSET:-}" ]; then
            # Reject an incompatible replacement before removing an old version.
            . "$source/lib/report.sh" && . "$source/lib/shim.sh" || exit 1
            mzd_asset_readable "$source/tweaks/$id/$SHIM_ASSET" && mzd_shim_elf "$source/tweaks/$id/$SHIM_ASSET" || { mzd_package_error 'Unsupported or missing shim asset.'; exit 1; }
            mzd_shim_compat || exit 1
        fi
        if [ -n "${COMPONENTS:-}" ]; then
            # Validate replacement payloads/configuration and hardware before old removal.
            sh "$source/tweaks/$id/run.sh" validate-install || exit 1
        fi
        mzd_package_requirements "$source/tweaks/$id" || exit 1
    fi
    if [ -e "$entry" ] || [ -L "$entry" ]; then
        mzd_package_check "$entry" || exit 1
        state=$(mzd_package_state "$entry") || exit 1
        old_gui=0
        mzd_manifest_load "$entry/package/tweaks/$id/manifest.conf" || exit 1
        [ "$TYPE" != gui-extension ] || old_gui=1
        if [ "$action" = install ] && { [ "$old_gui" = 1 ] || [ "$requested_type" = gui-extension ]; }; then
            [ "$old_gui:$requested_type" = 1:gui-extension ] || { mzd_package_error 'GUI type migration requires explicit saved removal first.'; exit 1; }
        fi
        if [ "$action" = install ]; then
            [ "$state" = installed ] || { mzd_package_error 'Incomplete installation; use Uninstall or Restore before installing.'; exit 1; }
            mzd_manifest_load "$entry/package/tweaks/$id/manifest.conf" || exit 1
            if [ "$VERSION" = "$requested" ]; then
                previous="$entry/package/settings.conf"; [ -f "$previous" ] || previous=/dev/null
                cmp -s "$settings_tmp" "$previous" || { mzd_package_error 'Settings differ. Uninstall the saved version before installing new settings.'; exit 1; }
                result=$(mzd_package_worker "$entry" status)
                [ "$result" = installed ] || { mzd_package_error 'Registered installation failed its target check.'; exit 1; }
                printf 'Version %s is already installed.\n' "$VERSION"; exit 0
            fi
            stage="$MZD_PACKAGE_STORE/.stage-$id-$$"
            [ ! -e "$stage" ] && [ ! -L "$stage" ] || exit 1
            mzd_package_stage "$source" "$stage" "$id" "$requested" || exit 1
            mzd_package_install_paths "$stage/paths.tsv" "$entry" || exit 1
        fi
        if [ "$action:$old_gui" = install:1 ]; then
            (MZD_GUI_REPLACEMENT=1; export MZD_GUI_REPLACEMENT; mzd_package_remove "$entry") || exit $?
        else mzd_package_remove "$entry" || exit $?; fi
        [ "$action" != uninstall ] || exit 0
    elif [ "$action" = uninstall ]; then
        # Never execute new uninstall code against an unrecognized old payload.
        result=$(sh "$source/tweaks/$id/run.sh" status); code=$?
        [ "$code" = 0 ] && [ "$result" = uninstalled ] || { mzd_package_error 'No saved uninstaller; remove the old installation with its original USB package first.'; exit 1; }
        printf 'Tweak is not installed.\n'; exit 0
    fi
    result=$(sh "$source/tweaks/$id/run.sh" status); code=$?
    [ "$code" = 0 ] && [ "$result" = uninstalled ] || {
        # A machine-readable hint only for a completed, blocked target check.
        # The separate recovery check still verifies OEM data and ownership.
        if [ "$code" = 0 ] && [ "$requested_type" = patch ]; then
            case "$result" in installed|broken|unavailable) printf 'MZD_RECOVERY_CANDIDATE\n' ;; esac
        fi
        mzd_package_error 'Target is not ready for a fresh managed installation; remove unmanaged changes with their original package first.'; exit 1;
    }
    if [ -z "$stage" ]; then
        stage="$MZD_PACKAGE_STORE/.stage-$id-$$"
        [ ! -e "$stage" ] && [ ! -L "$stage" ] || exit 1
        mzd_package_stage "$source" "$stage" "$id" "$requested" || exit 1
    fi
    mzd_package_install_paths "$stage/paths.tsv" || exit 1
    mv "$stage" "$entry" || exit 1; stage=''
    mzd_package_set_state "$entry" installing || exit 1
    mzd_package_worker "$entry" install; code=$?
    if [ "$code" != 0 ]; then mzd_package_set_state "$entry" failed || :; exit "$code"; fi
    result=$(mzd_package_worker "$entry" status installed); code=$?
    if [ "$code" != 0 ] || [ "$result" != installed ]; then
        mzd_package_set_state "$entry" failed || :
        mzd_package_error 'Installation could not be verified. Do NOT reboot.'; exit 2
    fi
    mzd_package_set_state "$entry" installed
)

# One read-only request for the whole menu. No workers, target hashes or probes.
# Each line is ID<TAB>STATE<TAB>REASON; control characters in reasons are flattened.
mzd_package_statuses() (
    source=$1; shift
    [ "$#" -le 128 ] || { mzd_package_error 'Too many status IDs.'; exit 1; }
    for id do mzd_manifest_id "$id" || exit 1; done
    scratch=$(mktemp -d /tmp/mzd-statuses.XXXXXX) || exit 1
    trap 'rm -rf "$scratch"' 0
    trap 'exit 1' INT TERM
    for id do
        reason=''
        entry="$MZD_PACKAGE_STORE/$id"
        if [ -e "$entry" ] || [ -L "$entry" ]; then
            state=$(mzd_package_status "$id" 2> "$scratch/reason"); code=$?
            reason=$(tr '\011\015\012' '   ' < "$scratch/reason")
            case "$code:$state" in
                0:installed|0:uninstalled|0:broken|0:unavailable) ;;
                *) state=error; reason='Could not read the saved installation state.' ;;
            esac
        elif [ -f "$source/tweaks/$id/manifest.conf" ] && [ ! -L "$source/tweaks/$id/manifest.conf" ]; then
            state=uninstalled
        else
            state=error; reason='Tweak manifest is missing.'
        fi
        printf '%s\t%s\t%s\n' "$id" "$state" "$reason" || exit 1
    done
)

# Effective manifests: an installed package owns its original reset contract.
mzd_package_removal_order() (
    graph=$(mktemp /tmp/mzd-package-order.XXXXXX) || exit 1
    trap 'rm -f "$graph"' 0
    for entry in "$MZD_PACKAGE_STORE"/*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        mzd_manifest_id "${entry##*/}" && mzd_package_check "$entry" || exit 1
        mzd_manifest_load "$entry/package/tweaks/${entry##*/}/manifest.conf" || exit 1
        printf 'N\t%s\n' "$ID" >> "$graph"
        for dependency in $REQUIRES; do printf 'R\t%s\t%s\n' "$ID" "$dependency" >> "$graph"; done
        awk -F "$(printf '\t')" -v id="$ID" '{print "P\t" id "\t" $1 "\t" $2}' "$entry/paths.tsv" >> "$graph" || exit 1
    done
    awk -F "$(printf '\t')" '
      function edge(a,b,k) {k=a SUBSEP b; if(a!=b && node[a] && node[b] && !edges[k]++) degree[b]++}
      $1=="N" {node[$2]=1}
      $1=="R" {requirement[++nr]=$2; provider[nr]=$3}
      $1=="P" {owner[++np]=$2; mode[np]=$3; path[np]=$4}
      END {
        for(i=1;i<=nr;i++)edge(requirement[i],provider[i])
        for(i=1;i<=np;i++)if(mode[i]=="create" || mode[i]=="shim")
          for(j=1;j<=np;j++)if(path[j]==path[i] || index(path[j],path[i] "/")==1)edge(owner[j],owner[i])
        for(n in node)remaining++
        while(remaining) {
          chosen="";for(n in node)if(!done[n] && !degree[n]){chosen=n;break}
          if(chosen=="")exit 1
          print chosen;done[chosen]=1;remaining--
          for(k in edges){split(k,p,SUBSEP);if(p[1]==chosen)degree[p[2]]--}
        }
      }
    ' "$graph" || { mzd_package_error 'Saved dependency cycle prevents a safe reset order.'; exit 1; }
)
mzd_package_manifests() (
    for manifest in "$ROOT"/tweaks/*/manifest.conf; do
        [ -f "$manifest" ] || continue
        id=$(basename "$(dirname "$manifest")")
        [ ! -e "$MZD_PACKAGE_STORE/$id" ] && [ ! -L "$MZD_PACKAGE_STORE/$id" ] || continue
        printf '%s\n' "$manifest"
    done
    order=$(mzd_package_removal_order) || exit 1
    for id in $order; do
        printf '%s\n' "$MZD_PACKAGE_STORE/$id/package/tweaks/$id/manifest.conf"
    done
)
mzd_package_forget_restored() (
    for entry in "$MZD_PACKAGE_STORE"/*; do
        [ -e "$entry" ] || continue
        mzd_package_check "$entry" || exit 1
        mzd_manifest_load "$entry/package/tweaks/${entry##*/}/manifest.conf" || exit 1
        # Do not forget unsupported/unrestored installations or unknown changes.
        if [ "$FIRMWARE" != "$RESTORE_FIRMWARE" ]; then continue; fi
        result=$(mzd_package_worker "$entry" status); code=$?
        if [ "$code" = 0 ] && [ "$result" = unavailable ] && [ -f "$APP" ] && [ ! -L "$APP" ]; then
            # A completely reset tweak need not be installable yet: its
            # prerequisites may have been reset in this same operation.
            hash=$(md5sum "$APP") || exit 1
            [ "${hash%% *}" != "$ORIGINAL" ] || result=uninstalled
        fi
        [ "$code" = 0 ] && [ "$result" = uninstalled ] || {
            mzd_package_set_state "$entry" failed || :
            mzd_package_error 'Reset could not verify an uninstalled package; receipt retained.'; exit 1;
        }
        cp -R "$entry" "$MZD_REPORT/reset-hooks/package-${entry##*/}" || exit 1
        diff -r "$entry" "$MZD_REPORT/reset-hooks/package-${entry##*/}" >/dev/null || exit 1
    done
    for entry in "$MZD_PACKAGE_STORE"/*; do
        [ -e "$entry" ] || continue
        mzd_manifest_load "$entry/package/tweaks/${entry##*/}/manifest.conf" || exit 1
        [ "$FIRMWARE" = "$RESTORE_FIRMWARE" ] || continue
        rm -rf "$entry" || exit 1
    done
    sync
)
mzd_package_mark_restoring() (
    for entry in "$MZD_PACKAGE_STORE"/*; do
        [ -e "$entry" ] || continue
        mzd_manifest_load "$entry/package/tweaks/${entry##*/}/manifest.conf" || exit 1
        [ "$FIRMWARE" = "$RESTORE_FIRMWARE" ] || continue
        mzd_package_set_state "$entry" restoring || exit 1
    done
)
