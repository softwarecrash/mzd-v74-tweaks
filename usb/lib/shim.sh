#!/bin/sh
# Persistent LD_PRELOAD payloads. Never load a library or restart CMU services here.
MZD_SHIM_ROOT=/
mzd_shim_error() { printf 'Shim: %s\n' "$*" >&2; return 1; }
mzd_shim_targets() (
    printf '%s:%s\n' "$APP" "$ORIGINAL"
    for pair in $SHIM_EXTRA_TARGETS; do printf '%s\n' "$pair"; done
)
mzd_shim_transform() (
    input=$1; mode=$2; no_reset=${3:-0}
    output=$(mktemp /tmp/mzd-shim-transform.XXXXXX) || exit 1
    trap 'rm -f "$output"' 0
    # Do not capture file bytes in a shell variable: that strips trailing newlines.
    if awk -v service="$SHIM_SERVICE" -v library="$SHIM_PATH" -v mode="$mode" \
        -v no_reset="$no_reset" \
        -f "$ROOT/lib/shim-preload.awk" "$input" > "$output"; then
        cat "$output"
    else
        cat "$output" >&2; exit 1
    fi
)
mzd_loader_env_transform() (
    input=$1; mode=$2; service=$3; env_name=$4; env_value=$5; keep=${6:-}
    output=$(mktemp /tmp/mzd-loader-env-transform.XXXXXX) || exit 1
    trap 'rm -f "$output"' 0
    if awk -v service="$service" -v env_name="$env_name" -v env_value="$env_value" -v mode="$mode" \
        -v keep="$keep" \
        -f "$ROOT/lib/loader-env.awk" "$input" > "$output"; then
        cat "$output"
    else
        cat "$output" >&2; exit 1
    fi
)
mzd_shim_elf() (
    # ELF32 little endian, ET_DYN, ARM, EABI5; no hard-float ABI.
    header=$(dd if="$1" bs=1 count=40 2>/dev/null | od -An -tx1) || exit 1
    set -f
    # Hexadecimal bytes from od contain no shell syntax.
    # shellcheck disable=SC2086
    set -- $header
    [ "$#" = 40 ] || exit 1
    [ "$1:$2:$3:$4:$5:$6:$7" = 7f:45:4c:46:01:01:01 ] || exit 1
    shift 16
    [ "$1:$2:$3:$4" = 03:00:28:00 ] || exit 1
    shift 20
    [ "$4" = 05 ] || exit 1
    case "$2" in ?[4-7c-f]) exit 1 ;; esac
)
mzd_shim_parent_ok() (
    path=$1
    while [ "$path" != / ]; do
        [ ! -L "$path" ] || { mzd_shim_error "Symbolic link in shim path: $path"; exit 1; }
        path=$(dirname "$path")
    done
)
mzd_shim_mount() (
    path=$1
    # Deepest actual mount, not a device-name guess or writable parent fallback.
    awk -v p="$path" -v root="$MZD_SHIM_ROOT" '
      $3!="rootfs" && ($2=="/" || p==$2 || index(p,$2 "/")==1) {
        if(length($2)>=length(best)){best=$2;fs=$3}
      }
      END {internal=(best==root || best=="/jci" || best=="/tmp/mnt/data" || best=="/mnt/data" || best=="/tmp/mnt/data_persist" || best=="/mnt/data_persist" || best=="/tmp/mnt/resources" || best=="/mnt/resources");if(!internal || fs!~/^(relfs|ext2|ext3|ext4|ubifs|jffs2)$/)exit 1;print best}
    ' /proc/mounts
)
mzd_shim_compat() (
    for pair in $SHIM_CHECKS; do
        target=${pair%:*}; original=${pair##*:}
        mzd_asset_readable "$target" && [ "$(mzd_hash "$target")" = "$original" ] || {
            mzd_shim_error "Unsupported native module: $target (expected MD5 $original)."; exit 1;
        }
    done
)
mzd_shim_inspect() (
    scratch=$(mktemp -d /tmp/mzd-shim-status.XXXXXX) || exit 1
    trap 'rm -rf "$scratch"' 0
    installed=0; total=0; payload=0
    [ ! -e "$SHIM_PATH" ] && [ ! -L "$SHIM_PATH" ] || payload=1
    state=unavailable; [ "$payload" = 0 ] || state=broken
    mzd_validate_firmware "$FIRMWARE" 2> "$scratch/reason" || {
        printf '%s\n' "$state"; cat "$scratch/reason" >&2; exit 0;
    }
    mzd_asset_readable "$HERE/$SHIM_ASSET" && mzd_shim_elf "$HERE/$SHIM_ASSET" || {
        printf '%s\n' "$state"; mzd_shim_error 'Missing or unsupported ARM EABI5 soft-float .so asset.' || :; exit 0;
    }
    for path in "${SHIM_PATH%/*}"/* "${SHIM_PATH%/*}"/.[!.]* "${SHIM_PATH%/*}"/..?*; do
        [ -e "$path" ] || [ -L "$path" ] || continue
        [ "$path" = "$SHIM_PATH" ] || { printf '%s\n' "$state"; mzd_shim_error 'Unknown files in the owned shim directory.' || :; exit 0; }
    done
    targets=$(mzd_shim_targets) || exit 1
    printf '%s\n' "$targets" | awk -F: 'NF!=2 || seen[$1]++ {bad=1} END {exit bad || NR>8}' || {
        printf '%s\n' "$state"; mzd_shim_error 'Duplicate targets or more than eight loader configurations.' || :; exit 0;
    }
    printf '%s\n' "$targets" > "$scratch/targets"
    while IFS=: read -r target original; do
        mzd_asset_readable "$target" && mzd_shim_parent_ok "$target" || {
            printf '%s\n' "$state"; mzd_shim_error "Loader configuration is missing or linked: $target" || :; exit 0;
        }
        probe=$(mzd_shim_transform "$target" status 2> "$scratch/reason") || {
            printf '%s\n' "$state"; cat "$scratch/reason" >&2; exit 0;
        }
        total=$((total+1))
        if [ "$probe" = installed ]; then installed=$((installed+1)); state=broken; fi
        if [ -e "$target.org" ] || [ -L "$target.org" ]; then
            mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || {
                printf '%s\n' "$state"; mzd_shim_error "Invalid OEM .org backup: $target.org" || :; exit 0;
            }
        elif [ "$probe" = installed ] || [ "$(mzd_hash "$target")" != "$original" ]; then
            printf '%s\n' "$state"; mzd_shim_error "Modified loader configuration has no verified OEM .org: $target" || :; exit 0
        fi
    done < "$scratch/targets"
    mzd_shim_parent_ok "$SHIM_PATH" || { printf '%s\n' "$state"; exit 0; }
    if [ "$payload" = 1 ]; then
        mzd_asset_readable "$SHIM_PATH" && cmp -s "$SHIM_PATH" "$HERE/$SHIM_ASSET" || {
            printf 'broken\n'; mzd_shim_error 'Installed shim payload differs from its saved asset.' || :; exit 0;
        }
    fi
    if [ "$installed" = "$total" ] && [ "$payload" = 1 ]; then printf 'installed\n'; exit 0; fi
    if [ "$installed:$payload" != 0:0 ]; then
        printf 'broken\n'; mzd_shim_error 'Only part of the shim payload/loader configuration is present.' || :; exit 0
    fi
    case "${MZD_PACKAGE_STATE:-}" in
        uninstalling|restoring) : ;; # Verify absence, not fresh-install prerequisites.
        *) if ! mzd_shim_compat 2> "$scratch/reason"; then
               printf 'unavailable\n'; cat "$scratch/reason" >&2; exit 0
           fi ;;
    esac
    printf 'uninstalled\n'
)
mzd_shim_cleanup() (
    result=0
    : > "$MZD_REPORT/shim-temps" || result=1
    if [ -f "$MZD_REPORT/temp.path" ]; then cat "$MZD_REPORT/temp.path" >> "$MZD_REPORT/shim-temps" || result=1; fi
    if [ "${SHIM_COMMITTED:-0}" = 0 ] && [ -n "${MZD_REPORT:-}" ]; then
        # Restore the library before restoring any configuration that references it.
        if [ -f "$MZD_REPORT/payload-removed" ]; then
            if [ ! -e "$SHIM_PATH" ] && [ ! -L "$SHIM_PATH" ]; then
                cp "$MZD_REPORT/payload.data" "$SHIM_PATH" && cmp -s "$MZD_REPORT/payload.data" "$SHIM_PATH" || result=1
            else cmp -s "$MZD_REPORT/payload.data" "$SHIM_PATH" || result=1; fi
        fi
        if [ -f "$MZD_REPORT/changed" ]; then
            awk '{a[NR]=$0} END {for(i=NR;i>0;i--)print a[i]}' "$MZD_REPORT/changed" > "$MZD_REPORT/rollback-order" || result=1
            while IFS= read -r number; do
                folder="$MZD_REPORT/files/$number"; target=$(cat "$folder/target.path") || { result=1; continue; }
                if cmp -s "$target" "$folder/before.data"; then continue; fi
                if cmp -s "$target" "$folder/after.data"; then
                    mzd_restore_write "$target" "$folder/before.data" || result=1
                    [ ! -f "$MZD_REPORT/temp.path" ] || cat "$MZD_REPORT/temp.path" >> "$MZD_REPORT/shim-temps" || result=1
                else result=1; fi
            done < "$MZD_REPORT/rollback-order"
        fi
        if [ -f "$MZD_REPORT/payload-created" ] && [ -e "$SHIM_PATH" ]; then
            if cmp -s "$SHIM_PATH" "$HERE/$SHIM_ASSET"; then rm -f "$SHIM_PATH" || result=1
            else result=1; fi
        fi
    fi
    [ ! -e "$SHIM_PATH" ] || [ -f "$SHIM_PATH" ] || result=1
    if [ ! -e "$SHIM_PATH" ] && [ -d "${SHIM_PATH%/*}" ]; then rmdir "${SHIM_PATH%/*}" 2>/dev/null || result=1; fi
    while IFS= read -r temp; do
        owned=0
        while IFS=: read -r target original; do
            case "$temp" in "$target".mzd-restore-*)
                suffix=${temp#"$target.mzd-restore-"}
                case "$suffix" in ''|*[!0-9]*) ;; *) owned=1 ;; esac ;;
            esac
        done < "$MZD_REPORT/targets"
        if [ "$owned" = 1 ]; then rm -f "$temp" || result=1; else result=1; fi
    done < "$MZD_REPORT/shim-temps"
    mzd_system_cleanup || result=1
    exit "$result"
)
mzd_shim_apply() {
    SHIM_COMMITTED=0
    mzd_begin "$SELF" "$ID" mzd_shim_cleanup
    mzd_system_begin
    mzd_system_lock "$LOCK" || exit 1
    scratch="$MZD_REPORT/files"; mkdir "$scratch" || exit 1
    : > "$MZD_REPORT/changed"
    targets=$(mzd_shim_targets) || exit 1
    printf '%s\n' "$targets" > "$MZD_REPORT/targets"
    number=0
    while IFS=: read -r target original; do
        number=$((number+1)); folder="$scratch/$number"; mkdir "$folder" || exit 1
        printf '%s\n' "$target" > "$folder/target.path"
        printf '%s\n' "$original" > "$folder/original.md5"
        cp "$target" "$folder/before.data" || exit 1
        mzd_shim_transform "$target" "$ACTION" > "$folder/after.data" || exit 1
        if [ "$ACTION" = install ]; then
            mzd_shim_transform "$folder/after.data" uninstall > "$folder/inverse.data" || exit 1
            cmp -s "$folder/before.data" "$folder/inverse.data" || mzd_fail 'Loader insertion is not exactly reversible; nothing changed.'
        else
            # Re-adding a removed shim appends it, so it cannot reconstruct an
            # earlier ordering with other shims. Rollback uses the full snapshot.
            probe=$(mzd_shim_transform "$folder/after.data" status) || exit 1
            [ "$probe" = uninstalled ] || mzd_fail 'Shim reference removal could not be verified.'
        fi
        mount_point=$(mzd_shim_mount "$target") || mzd_fail 'Unsupported loader filesystem.'
        printf '%s\n' "$mount_point" > "$folder/mount.path"
        mzd_system_remount_rw "$mount_point" || exit 1
    done < "$MZD_REPORT/targets"
    mount_point=$(mzd_shim_mount "$SHIM_PATH") || mzd_fail 'Unsupported persistent shim filesystem.'
    [ "$mount_point" = /tmp/mnt/data_persist ] || mzd_fail 'Shim storage must be the mounted persistent partition.'
    mzd_system_remount_rw "$mount_point" || exit 1
    needed=$(du -sk "$HERE/$SHIM_ASSET" | awk '{print $1+1024}')
    available=$(df -Pk "$mount_point" | awk 'NR==2{print $4}')
    case "$needed:$available" in *[!0-9:]*|:*|*:) mzd_fail 'Cannot determine shim storage space.' ;; esac
    [ "$available" -ge "$needed" ] || mzd_fail 'Insufficient persistent shim storage.'
    mzd_system_watchdog_disable || exit 1
    mzd_report_start
    if [ "$ACTION" = install ]; then
        # Publish a verified library before adding the first load reference.
        [ ! -e "$SHIM_PATH" ] && [ ! -L "$SHIM_PATH" ] || mzd_fail 'Shim destination appeared during preparation.'
        mkdir -p "${SHIM_PATH%/*}" || exit 1
        : > "$MZD_REPORT/payload-created"
        cp "$HERE/$SHIM_ASSET" "$SHIM_PATH" || exit 1
        cmp -s "$HERE/$SHIM_ASSET" "$SHIM_PATH" || mzd_fail 'Shim copy verification failed.'
    else
        cp "$SHIM_PATH" "$MZD_REPORT/payload.data" && cmp -s "$SHIM_PATH" "$MZD_REPORT/payload.data" || exit 1
    fi
    number=0
    while IFS=: read -r target original; do
        number=$((number+1)); folder="$scratch/$number"
        cmp -s "$target" "$folder/before.data" || mzd_fail 'Loader configuration changed during preparation.'
        if [ -e "$target.org" ] || [ -L "$target.org" ]; then
            mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || mzd_fail 'OEM backup changed during preparation.'
        else
            [ "$(mzd_hash "$target")" = "$original" ] || mzd_fail 'Cannot create an OEM backup from modified content.'
            cp -a "$target" "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || mzd_fail 'OEM backup failed.'
        fi
        printf '%s\n' "$number" >> "$MZD_REPORT/changed"
        mzd_restore_write "$target" "$folder/after.data" || mzd_fail 'Loader write failed; rolling back.'
    done < "$MZD_REPORT/targets"
    number=0
    while IFS=: read -r target original; do
        number=$((number+1))
        cmp -s "$target" "$scratch/$number/after.data" || mzd_fail 'Loader configuration changed after publication.'
    done < "$MZD_REPORT/targets"
    if [ "$ACTION" = uninstall ]; then
        cmp -s "$SHIM_PATH" "$MZD_REPORT/payload.data" || mzd_fail 'Shim payload changed before removal.'
        : > "$MZD_REPORT/payload-removed"
        rm -f "$SHIM_PATH" || mzd_fail 'Cannot remove the shim payload.'
    fi
    sync
    SHIM_COMMITTED=1
    MZD_SUCCESS="$(printf '%s' "$ACTION" | awk '{print toupper(substr($0,1,1)) substr($0,2)}') completed. Restart the CMU to apply the loader change.
Reports: $MZD_REPORT"
}
mzd_shim_reset_main() (
    [ "$#" = 1 ] || exit 1
    phase=$1
    case "$phase" in check|prepare|finish) ;; *) exit 1 ;; esac
    for library in manifest report system; do . "$ROOT/lib/$library.sh" || exit 1; done
    mzd_manifest_load "$HERE/manifest.conf" || exit 1
    mzd_shim_parent_ok "$SHIM_PATH" || exit 1
    for path in "${SHIM_PATH%/*}"/* "${SHIM_PATH%/*}"/.[!.]* "${SHIM_PATH%/*}"/..?*; do
        [ -e "$path" ] || [ -L "$path" ] || continue
        [ "$path" = "$SHIM_PATH" ] || { mzd_shim_error 'Unknown files in the owned shim directory.'; exit 1; }
    done
    if [ -e "$SHIM_PATH" ] || [ -L "$SHIM_PATH" ]; then
        mzd_asset_readable "$SHIM_PATH" && cmp -s "$SHIM_PATH" "$HERE/$SHIM_ASSET" || {
            mzd_shim_error 'Unknown shim payload; nothing removed.'; exit 1;
        }
    fi
    targets=$(mzd_shim_targets) || exit 1
    # System Restore owns restoration of the configuration files and .org cleanup.
    for pair in $targets; do
        target=${pair%:*}; original=${pair##*:}
        mzd_asset_readable "$target" || exit 1
        if [ "$phase" = finish ]; then
            probe=0; grep -Fq "$SHIM_PATH" "$target" || probe=$?
            case "$probe" in
                0) mzd_shim_error 'A loader still references the shim.'; exit 1 ;;
                1) : ;;
                *) mzd_shim_error 'Cannot verify loader references; payload retained.'; exit 1 ;;
            esac
        elif [ "$(mzd_hash "$target")" != "$original" ]; then
            mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$original" ] || {
                mzd_shim_error 'Reset requires the verified OEM loader backup.'; exit 1;
            }
        fi
    done
    [ "$phase" != check ] || exit 0
    [ "${ACTION:-}" = run ] && [ -d "${MZD_RESET_DIR:-}" ] && [ -d "${MZD_SYSTEM:-}" ] || {
        mzd_shim_error 'Use System Restore for shim cleanup.'; exit 1;
    }
    if [ "$phase" = prepare ]; then
        if [ -e "$SHIM_PATH" ]; then
            cp "$SHIM_PATH" "$MZD_RESET_DIR/shim.so" && cmp -s "$SHIM_PATH" "$MZD_RESET_DIR/shim.so" || exit 1
        fi
        # Running processes retain their mapped code until the requested reboot.
        exit 0
    fi
    mount_point=$(mzd_shim_mount "$SHIM_PATH") || exit 1
    mzd_system_remount_rw "$mount_point" || exit 1
    [ ! -e "$SHIM_PATH" ] || rm -f "$SHIM_PATH" || exit 1
    if [ -d "${SHIM_PATH%/*}" ]; then rmdir "${SHIM_PATH%/*}" || exit 1; fi
    sync
)
mzd_shim_main() (
    [ "$#" -le 1 ] || { mzd_shim_error 'Expected one action.'; exit 1; }
    case "${1:-}" in
        ''|-h|--help) printf 'Usage: sh run.sh <install|uninstall|status>\n'; exit 0 ;;
        install|uninstall|status) ACTION=$1 ;; *) mzd_shim_error 'Unsupported action.'; exit 1 ;;
    esac
    if [ "${MZD_WORKER_DIRECT:-}" != 1 ]; then
        . "$ROOT/lib/manifest.sh" && . "$ROOT/lib/packages.sh" || exit 1
        mzd_package_action "$ROOT" "${HERE##*/}" "$ACTION"; exit $?
    fi
    for library in manifest report system restore; do . "$ROOT/lib/$library.sh" || exit 1; done
    mzd_manifest_load "$HERE/manifest.conf" || exit 1
    [ -n "$SHIM_ASSET$SHIM_PATH$SHIM_SERVICE" ] || exit 1
    mzd_require_tools awk md5sum cut cmp cp dd od mktemp readlink cat dirname rm || exit 1
    if [ "$ACTION" = status ]; then mzd_shim_inspect; exit $?; fi
    mzd_require_tools mkdir rmdir mount mv sync date du df grep || exit 1
    state=$(mzd_shim_inspect) || exit 1
    case "$ACTION:$state" in install:installed|uninstall:uninstalled) printf 'Requested state is already present.\n'; exit 0 ;;
        install:uninstalled|uninstall:installed) ;; *) mzd_fail "Shim is not ready for $ACTION: $state"; exit 1 ;;
    esac
    mzd_shim_apply
)
