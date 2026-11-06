#!/bin/sh
# Explicit reset of internal .org snapshots. Workers retain ownership of extras.
mzd_restore_catalog() (
    while IFS= read -r manifest; do
        mzd_manifest_load "$manifest" || exit 1
        [ "$FIRMWARE" = "$RESTORE_FIRMWARE" ] || continue
        if [ -n "${COMPONENTS:-}" ]; then
            mzd_components catalog || exit 1
        elif [ "$TYPE" != command ] && [ "$TYPE" != gui-extension ]; then
            printf '%s\t%s\t%s\n' "$APP" "$ORIGINAL" "$LOCK"
            if [ -n "${SHIM_PATH:-}" ]; then
                for pair in $SHIM_EXTRA_TARGETS; do printf '%s\t%s\t%s\n' "${pair%:*}" "${pair##*:}" "$LOCK"; done
            fi
        fi
    done < "$MZD_REPORT/manifests"
)
# Hooks use their own saved schema/configuration, never new USB defaults.
mzd_restore_run_hook() (
    hook=$1; action=$2
    unset MZD_SETTINGS_FILE
    config="${hook%/tweaks/*}/settings.conf"
    if [ -f "$config" ] || [ -L "$config" ]; then
        . "${hook%/tweaks/*}/lib/settings.sh" || exit 1
        mzd_settings_check "${hook%/*}/manifest.conf" "$config" || exit 1
        MZD_SETTINGS_FILE=$config; export MZD_SETTINGS_FILE
    fi
    sh "$hook" "$action"
)
mzd_restore_hooks() (
    while IFS= read -r manifest; do
        mzd_manifest_load "$manifest" || exit 1
        [ "$FIRMWARE" = "$RESTORE_FIRMWARE" ] || continue
        [ -n "$RESET_ENTRYPOINT" ] || continue
        hook="${manifest%/*}/$RESET_ENTRYPOINT"
        [ -f "$hook" ] && [ ! -L "$hook" ] || exit 1
        printf '%s\n' "$hook"
    done < "$MZD_REPORT/manifests"
)
mzd_restore_mount_for() {
    awk -v path="$1" '
        $3!="rootfs" && ($2=="/" || path==$2 || index(path,$2 "/")==1) {
            if(length($2)>length(best))best=$2
        } END {if(best=="")exit 1; print best}
    ' /proc/mounts
}
# Publish whole files by same-directory rename, retaining current target metadata.
mzd_restore_write() (
    target=$1; data=$2; temp="$1.mzd-restore-$$"
    [ ! -e "$temp" ] && [ ! -L "$temp" ] || exit 1
    printf '%s\n' "$temp" > "$MZD_REPORT/temp.path" || exit 1
    metadata=$target
    [ -e "$metadata" ] || metadata=${3:-}
    [ -n "$metadata" ] && [ -f "$metadata" ] && [ ! -L "$metadata" ] || exit 1
    cp -a "$metadata" "$temp" && cat "$data" > "$temp" && cmp -s "$temp" "$data" || exit 1
    sync
    mv -f "$temp" "$target" && sync && cmp -s "$target" "$data" || exit 1
    rm -f "$MZD_REPORT/temp.path"
)
mzd_restore_before_matches() {
    if [ -f "$1/before.absent" ]; then
        [ ! -e "$2" ] && [ ! -L "$2" ]
    else
        [ "$(mzd_hash "$1/before.data")" = "$(cat "$1/before.hash")" ] && cmp -s "$2" "$1/before.data"
    fi
}
# Old saved GUI reset hooks remove their startup block during prepare. Accept
# only that exact deletion; every other byte and the OEM backup stay verified.
mzd_restore_gui_block_removed() (
    folder=$1; target=$2
    [ "$target" = /jci/scripts/stage_wifi.sh ] &&
        [ -f "$target" ] && [ ! -L "$target" ] &&
        [ -f "$folder/before.data" ] &&
        [ "$(mzd_hash "$folder/before.data")" = "$(cat "$folder/before.hash")" ] || exit 1
    awk '
        $0=="# MZD shared GUI services" {
            markers++
            if (getline <= 0 || $0!="sh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &") exit 1
            pairs++; next
        }
        $0=="sh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &" {exit 1}
        {print}
        END {if(markers!=1 || pairs!=1)exit 1}
    ' "$folder/before.data" > "$folder/without-gui.data" || exit 1
    # awk must not silently repair a missing final newline.
    block_bytes=$(printf '%s\n' '# MZD shared GUI services' 'sh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &' | wc -c)
    [ "$(( $(wc -c < "$folder/before.data") - $(wc -c < "$folder/without-gui.data") ))" = "$block_bytes" ] &&
        cmp -s "$target" "$folder/without-gui.data"
)
mzd_restore_cleanup() (
    result=0
    if [ -f "$MZD_REPORT/temp.path" ]; then
        temp=$(cat "$MZD_REPORT/temp.path")
        rm -f "$temp" || result=1
    fi
    if [ "${RESTORE_COMMITTED:-0}" = 0 ] && [ -f "$MZD_REPORT/changed" ]; then
        awk '{item[NR]=$0} END {for(i=NR;i>0;i--)print item[i]}' "$MZD_REPORT/changed" > "$MZD_REPORT/rollback-order" || result=1
        while IFS= read -r index; do
            folder="$MZD_REPORT/files/$index"; target=$(cat "$folder/target.path") || { result=1; continue; }
            mzd_restore_before_matches "$folder" "$target" && continue
            # Never overwrite an unexpected concurrent edit during rollback.
            if cmp -s "$target" "$folder/original.data"; then
                if [ -f "$folder/before.absent" ]; then
                    rm -f "$target" && [ ! -e "$target" ] || result=1
                else
                    if [ "$(mzd_hash "$folder/before.data")" = "$(cat "$folder/before.hash")" ]; then
                        mzd_restore_write "$target" "$folder/before.data" || result=1
                    else
                        printf 'USB rollback archive changed: %s. Do NOT reboot.\n' "$target" >&4
                        result=1
                    fi
                fi
            else
                printf 'Rollback target changed unexpectedly: %s. Do NOT reboot.\n' "$target" >&4
                result=1
            fi
        done < "$MZD_REPORT/rollback-order"
        printf 'Restore did not commit; file changes were rolled back where verifiable. Managed services may remain stopped. Original .org backups were retained.\n' >&4
    fi
    if [ -f "$MZD_REPORT/temp.path" ]; then
        temp=$(cat "$MZD_REPORT/temp.path")
        rm -f "$temp" || result=1
    fi
    mzd_system_cleanup || result=1
    [ "$result" = 0 ] || printf 'Restore rollback or cleanup failed. Do NOT reboot. Check the USB report.\n' >&4
    exit "$result"
)
mzd_restore_run() {
    RESTORE_FIRMWARE=$FIRMWARE
    . "$ROOT/lib/packages.sh" || exit 1
    mzd_system_lock "$MZD_PACKAGE_LOCK" || exit 1
    mzd_package_manifests > "$MZD_REPORT/manifests" || mzd_fail 'Saved package catalog cannot be verified.'
    mzd_restore_catalog > "$MZD_REPORT/catalog" || mzd_fail 'Cannot read the target catalog.'
    mzd_restore_hooks > "$MZD_REPORT/hooks" || mzd_fail 'Cannot read reset hooks.'
    # Acquire every known target lock, including shared targets, before scanning.
    cut -f3 "$MZD_REPORT/catalog" | sort -u > "$MZD_REPORT/target-locks" || exit 1
    while IFS= read -r lock; do
        [ -n "$lock" ] || continue
        mzd_system_lock "$lock" || exit 1
    done < "$MZD_REPORT/target-locks"
    while IFS= read -r hook; do
        mzd_restore_run_hook "$hook" check || mzd_fail 'A managed tweak cannot be safely reset; see the report.'
    done < "$MZD_REPORT/hooks"
    mzd_export_progress 0 0 'Finding internal .org backups'
    # USB/navigation FAT filesystems and RAM/pseudo mounts are never scanned.
    awk '$3!="rootfs" && ($2=="/" || ($1 ~ /^\/dev\/(mmcblk|mtdblock|ubi|root)/ && $3 !~ /^(vfat|msdos|exfat)$/)) && !seen[$2]++ {print $2}' /proc/mounts > "$MZD_REPORT/scan-mounts" || exit 1
    [ -s "$MZD_REPORT/scan-mounts" ] || mzd_fail 'No internal filesystem mounts were identified.'
    : > "$MZD_REPORT/discovered"
    while IFS= read -r path; do
        # Reject record delimiters before converting paths to newline records.
        find "$path" -xdev -path "$MZD_PACKAGE_STORE" -prune -o -name '*.org' -exec /bin/sh -c '
            case "$1" in
                *"
"*|*"	"*) printf "__INVALID_BACKUP_PATH__\n" ;;
                *) printf "%s\n" "$1" ;;
            esac
        ' sh '{}' \; >> "$MZD_REPORT/discovered" || mzd_fail 'Could not inspect an internal filesystem.'
    done < "$MZD_REPORT/scan-mounts"
    sort -u "$MZD_REPORT/discovered" > "$MZD_REPORT/backups" || exit 1
    # Full preflight before any internal file changes. Stage data on USB only.
    required=16384
    while IFS= read -r backup; do
        case "$backup" in /*.org) ;; *) mzd_fail 'Unsupported backup path; newline/tab paths cannot be restored.' ;; esac
        target=${backup%.org}
        mzd_asset_readable "$backup" || mzd_fail "Backup is not a readable regular file: $backup"
        [ ! -L "$target" ] || mzd_fail "Target is a symbolic link: $target"
        if [ -e "$target" ]; then
            mzd_asset_readable "$target" || mzd_fail "Target is not a readable regular file: $target"
        fi
        mzd_system_path "$backup" || exit 1
        case "$backup" in *"$(printf '\t')"*) mzd_fail 'Tabs in backup paths are unsupported.' ;; esac
        known=$(awk -F "$(printf '\t')" -v path="$target" '$1==path {print $2; exit}' "$MZD_REPORT/catalog")
        if [ -n "$known" ]; then
            [ "$(mzd_hash "$backup")" = "$known" ] || mzd_fail "The .org backup does not match the known OEM original: $backup"
        else
            printf 'Uncatalogued backup; OEM provenance cannot be verified: %s\n' "$backup"
        fi
        size_target=$target; [ -e "$target" ] || size_target=$backup
        size=$(du -sk "$backup" "$size_target" | awk '{sum+=$1} END {printf "%.0f",sum}')
        case "$size" in ''|*[!0-9]*) mzd_fail 'Cannot estimate restore archive size.' ;; esac
        required=$((required+size))
    done < "$MZD_REPORT/backups"
    available=$(df -Pk "$MZD_USB" | awk 'NR==2{print $4}')
    case "$available" in ''|*[!0-9]*) mzd_fail 'Cannot read USB free space.' ;; esac
    [ "$available" -ge "$required" ] || mzd_fail 'Not enough USB space to archive current files and original backups.'
    mkdir "$MZD_REPORT/files" "$MZD_REPORT/reset-hooks" || exit 1
    index=0
    while IFS= read -r backup; do
        index=$((index+1)); target=${backup%.org}; folder="$MZD_REPORT/files/$index"
        mkdir "$folder" || exit 1
        printf '%s\n' "$target" > "$folder/target.path" || exit 1
        original_hash=$(mzd_hash "$backup")
        printf '%s\n' "$original_hash" > "$folder/original.hash" || exit 1
        cp "$backup" "$folder/original.data" && cmp -s "$backup" "$folder/original.data" &&
            [ "$(mzd_hash "$folder/original.data")" = "$original_hash" ] || mzd_fail 'USB archive verification failed; no internal file was restored.'
        if [ -e "$target" ]; then
            before_hash=$(mzd_hash "$target")
            printf '%s\n' "$before_hash" > "$folder/before.hash" || exit 1
            cp "$target" "$folder/before.data" && cmp -s "$target" "$folder/before.data" &&
                [ "$(mzd_hash "$folder/before.data")" = "$before_hash" ] || mzd_fail 'Current-file archive verification failed.'
        else
            : > "$folder/before.absent" || exit 1
        fi
        known=$(awk -F "$(printf '\t')" -v path="$target" '$1==path {print $2; exit}' "$MZD_REPORT/catalog")
        [ -z "$known" ] || [ "$(mzd_hash "$folder/original.data")" = "$known" ] || mzd_fail 'OEM backup changed while staging the USB archive.'
        printf '%s\t%s\n' "$index" "$target" >> "$MZD_REPORT/plan.tsv" || exit 1
    done < "$MZD_REPORT/backups"
    total=$index
    sync
    # Export session context for reset hooks using the same mount cleanup ledger.
    export MZD_REPORT MZD_SYSTEM MZD_USB ACTION
    mzd_package_mark_restoring || mzd_fail 'Cannot record reset state; no original file restored.'
    mzd_export_progress 0 0 'Stopping managed tweak services'
    while IFS= read -r hook; do
        hook_id=$(basename "$(dirname "$hook")")
        MZD_RESET_DIR="$MZD_REPORT/reset-hooks/$hook_id"; export MZD_RESET_DIR
        mkdir "$MZD_RESET_DIR" || exit 1
        mzd_restore_run_hook "$hook" prepare; hook_code=$?
        [ "$hook_code" != 2 ] || mzd_fatal 'Managed-service cleanup is incomplete. Do NOT reboot; backups were retained.'
        [ "$hook_code" = 0 ] || mzd_fail 'Managed-service preparation failed. Backups were retained.'
    done < "$MZD_REPORT/hooks"
    index=0
    while IFS= read -r backup; do
        index=$((index+1)); target=${backup%.org}; folder="$MZD_REPORT/files/$index"
        [ "$(mzd_hash "$folder/original.data")" = "$(cat "$folder/original.hash")" ] || mzd_fail 'USB original archive changed before restore.'
        cmp -s "$backup" "$folder/original.data" &&
            { mzd_restore_before_matches "$folder" "$target" || mzd_restore_gui_block_removed "$folder" "$target"; } || mzd_fail 'A target or backup changed after preflight; restore aborted.'
        mount_point=$(mzd_restore_mount_for "$target") || mzd_fail 'Cannot identify target mount.'
        mzd_system_watchdog_disable || exit 1
        mzd_system_remount_rw "$mount_point" || exit 1
        printf '%s\n' "$index" >> "$MZD_REPORT/changed" || exit 1
        mzd_export_progress "$((index-1))" "$total" "Restoring $target"
        mzd_restore_write "$target" "$folder/original.data" "$backup" || mzd_fail 'Restore write failed; rolling back file changes.'
    done < "$MZD_REPORT/backups"
    # Every target must be verified before cleanup or deletion of any .org.
    index=0
    while IFS= read -r backup; do
        index=$((index+1))
        cmp -s "${backup%.org}" "$MZD_REPORT/files/$index/original.data" || mzd_fail 'Final restore verification failed.'
    done < "$MZD_REPORT/backups"
    RESTORE_COMMITTED=1
    while IFS= read -r hook; do
        hook_id=$(basename "$(dirname "$hook")")
        MZD_RESET_DIR="$MZD_REPORT/reset-hooks/$hook_id"; export MZD_RESET_DIR
        mzd_restore_run_hook "$hook" finish; hook_code=$?
        [ "$hook_code" != 2 ] || mzd_fatal 'Files restored, but service cleanup is incomplete. Do NOT reboot; backups were retained.'
        [ "$hook_code" = 0 ] || mzd_fail 'Files restored, but managed-tweak cleanup failed. Remaining .org backups were retained; rerun Restore originals.'
    done < "$MZD_REPORT/hooks"
    mzd_package_forget_restored || mzd_fatal 'Saved installation cleanup failed. Do NOT reboot; .org backups retained.'
    mzd_export_progress 0 0 'Removing verified .org backups'
    index=0
    while IFS= read -r backup; do
        index=$((index+1))
        cmp -s "${backup%.org}" "$MZD_REPORT/files/$index/original.data" || mzd_fatal 'Restored target changed before backup removal. Do NOT reboot.'
        cmp -s "$backup" "$MZD_REPORT/files/$index/original.data" || mzd_fatal 'Backup changed before removal. Do NOT reboot; check the USB archive.'
        rm -f "$backup" && [ ! -e "$backup" ] && [ ! -L "$backup" ] || mzd_fail 'Files restored, but some .org backups could not be removed; rerun Restore originals.'
    done < "$MZD_REPORT/backups"
    mzd_export_progress "$total" "$total" 'Restore complete'
    MZD_SUCCESS="Restore completed: $total file(s). Internal .org backups removed after verification.
Current files, .org snapshots and managed payloads are archived at: $MZD_REPORT
All patches on restored files were reset. Restart the CMU manually after closing the installer."
}
