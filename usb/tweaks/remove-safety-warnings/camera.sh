#!/bin/sh
# Native warning images only. Never modify a native executable or camera control.
CAMERA_ROOT=/jci/nativegui/images
CAMERA_LOCK=/tmp/mzd-camera-warning-images.lock
CAMERA_TABLE="$HERE/assets/camera-images.tsv"

camera_assets() (
    mzd_asset_readable "$CAMERA_TABLE" || exit 1
    awk -F "$(printf '\t')" 'NF!=3 || $1!~/^SafetyText_[A-Za-z_]+[.]png$/ || $2!~/^[0-9a-f]+$/ || length($2)!=32 || $3!~/^transparent-80[01]x50[.]png$/ || seen[$1]++ {bad=1} END {exit bad || NR!=46}' "$CAMERA_TABLE" || exit 1
    mzd_asset_readable "$HERE/assets/transparent-800x50.png" &&
        mzd_asset_readable "$HERE/assets/transparent-801x50.png"
)

# A state is recognized only with a known image and, when needed, its OEM backup.
camera_state() (
    camera_assets || { printf 'Camera assets are missing or invalid.\n' >&2; exit 1; }
    installed=0; original=0; unknown=0
    tab=$(printf '\t')
    while IFS="$tab" read -r name hash asset; do
        target="$CAMERA_ROOT/$name"
        mzd_shim_parent_ok "$target" || exit 1
        if ! mzd_asset_readable "$target"; then
            printf 'Missing or unsupported camera image: %s\n' "$target" >&2
            unknown=1; continue
        fi
        if [ -e "$target.org" ] || [ -L "$target.org" ]; then
            if ! mzd_asset_readable "$target.org" || [ "$(mzd_hash "$target.org")" != "$hash" ]; then
                printf 'Invalid camera OEM backup: %s.org\n' "$target" >&2
                unknown=1; continue
            fi
        fi
        if [ "$(mzd_hash "$target")" = "$hash" ]; then original=$((original+1))
        elif cmp -s "$target" "$HERE/assets/$asset"; then
            installed=$((installed+1))
            if ! mzd_asset_readable "$target.org" || [ "$(mzd_hash "$target.org")" != "$hash" ]; then
                printf 'Transparent camera image has no verified original: %s\n' "$target" >&2
                unknown=1
            fi
        else
            printf 'Unknown camera image; nothing overwritten: %s\n' "$target" >&2
            unknown=1
        fi
    done < "$CAMERA_TABLE"
    if [ "$unknown" = 1 ]; then
        if [ "$installed" -gt 0 ]; then printf 'broken\n'; else printf 'unavailable\n'; fi
    elif [ "$installed" = 46 ]; then printf 'installed\n'
    elif [ "$original" = 46 ]; then printf 'uninstalled\n'
    else printf 'Camera images are only partly replaced.\n' >&2; printf 'broken\n'; fi
)

warnings_startup_status() (
    # Saved packages have no sibling USB workers. A missing saved old ID means
    # no managed old installation, not an unresolved dependency worker.
    . "$ROOT/lib/packages.sh" || exit 1
    if [ -e "$MZD_PACKAGE_STORE/no-more-disclaimer" ] || [ -L "$MZD_PACKAGE_STORE/no-more-disclaimer" ]; then
        printf 'Remove the saved No More Disclaimer installation first.\n' >&2
        printf 'unavailable\n'; exit 0
    fi
    CONFLICTS=
    # Restore owns this same target lock while verifying saved workers. Ignore
    # only that parent's recorded lock; ordinary status still refuses busy files.
    if [ "${MZD_PACKAGE_STATE:-}" = restoring ] && [ -n "${MZD_REPORT:-}" ] &&
        [ "${MZD_SYSTEM:-}" = "$MZD_REPORT/system" ] &&
        mzd_line_is "$LOCK" "$MZD_SYSTEM/locks"; then LOCK=; fi
    mzd_read_status
)

warnings_status() (
    [ ! -e "$CAMERA_LOCK" ] || { printf 'Camera images are busy; retry later.\n' >&2; exit 1; }
    startup=$(warnings_startup_status) || exit 1
    camera=$(camera_state) || exit 1
    case "$startup:$camera" in
        installed:installed) printf 'installed\n' ;;
        uninstalled:uninstalled) printf 'uninstalled\n' ;;
        *broken*|installed:*|*:installed)
            printf 'Startup disclaimer and camera image state are incomplete or inconsistent.\n' >&2
            printf 'broken\n' ;;
        *) printf 'Startup disclaimer or camera images are unsupported.\n' >&2; printf 'unavailable\n' ;;
    esac
)

# Stage all 47 before/after pairs and validate every backup before any write.
warnings_plan() {
    mkdir "$MZD_REPORT/files" || return 1
    CONTEXT="$MZD_REPORT/startup"
    mzd_patch_prepare "$APP" "$PATCH_FILE" "$ORIGINAL" "$CONTEXT" || return 1
    mzd_patch_validate_backup "$CONTEXT" || return 1
    startup=$(mzd_patch_state "$CONTEXT") || return 1
    camera=$(camera_state) || return 1
    case "$startup:$camera" in
        installed:installed|uninstalled:uninstalled) ;;
        *) mzd_fail 'The selected files are not in a complete supported state.' ;;
    esac
    folder="$MZD_REPORT/files/1"; mkdir "$folder" || return 1
    cp -a "$CONTEXT/before.data" "$folder/before.data" || return 1
    printf '%s\n' "$APP" > "$folder/target.path"
    if [ "$ACTION:$startup" = install:uninstalled ]; then
        cp "$CONTEXT/install/target.data" "$folder/after.data" || return 1
    elif [ "$ACTION:$startup" = uninstall:installed ]; then
        cp "$CONTEXT/uninstall/target.data" "$folder/after.data" || return 1
    else cp "$folder/before.data" "$folder/after.data" || return 1; fi
    printf '%s\n' "$ORIGINAL" > "$folder/oem.md5"
    number=1; tab=$(printf '\t')
    while IFS="$tab" read -r name hash asset; do
        number=$((number+1)); folder="$MZD_REPORT/files/$number"
        mkdir "$folder" || return 1
        target="$CAMERA_ROOT/$name"
        printf '%s\n' "$target" > "$folder/target.path"
        printf '%s\n' "$hash" > "$folder/oem.md5"
        cp -a "$target" "$folder/before.data" && cmp -s "$target" "$folder/before.data" || return 1
        if [ "$ACTION" = install ]; then cp "$HERE/assets/$asset" "$folder/after.data" || return 1
        elif [ "$(mzd_hash "$target")" = "$hash" ]; then cp "$target" "$folder/after.data" || return 1
        else cp "$target.org" "$folder/after.data" || return 1; fi
    done < "$CAMERA_TABLE"
    for folder in "$MZD_REPORT/files/"*; do
        mzd_hash "$folder/before.data" > "$folder/before.md5" || return 1
        mzd_hash "$folder/after.data" > "$folder/after.md5" || return 1
    done
    printf '%s\n' "$number" > "$MZD_REPORT/count"
    : > "$MZD_REPORT/changed"
}

# Track failed writer temporaries before rollback writes replace its RAM ledger.
warnings_write() (
    mzd_restore_write "$@"; code=$?
    if [ -f "$MZD_REPORT/temp.path" ]; then
        cat "$MZD_REPORT/temp.path" >> "$MZD_REPORT/pending-temps" || exit 2
    fi
    exit "$code"
)

warnings_cleanup() (
    result=0
    if [ -f "$MZD_REPORT/temp.path" ]; then
        cat "$MZD_REPORT/temp.path" >> "$MZD_REPORT/pending-temps" || result=1
    fi
    if [ "${WARNINGS_COMMITTED:-0}" != 1 ] && [ -f "$MZD_REPORT/changed" ]; then
        awk '{a[NR]=$0} END{for(i=NR;i>0;i--)print a[i]}' "$MZD_REPORT/changed" > "$MZD_REPORT/reverse" || result=1
        while IFS= read -r number; do
            folder="$MZD_REPORT/files/$number"
            target=$(cat "$folder/target.path") || { result=1; continue; }
            if [ "$(mzd_hash "$folder/before.data")" != "$(cat "$folder/before.md5")" ]; then
                printf 'Rollback archive changed. Do NOT reboot.\n' >&4; result=1; continue
            fi
            cmp -s "$target" "$folder/before.data" && continue
            if cmp -s "$target" "$folder/after.data"; then
                warnings_write "$target" "$folder/before.data" || result=1
            else printf 'Concurrent change prevents rollback: %s. Do NOT reboot.\n' "$target" >&4; result=1; fi
        done < "$MZD_REPORT/reverse"
    fi
    if [ -f "$MZD_REPORT/pending-temps" ]; then
        while IFS= read -r temp; do
            owned=0
            for folder in "$MZD_REPORT/files/"*; do
                [ -f "$folder/target.path" ] || continue
                target=$(cat "$folder/target.path") || continue
                for path in "$target" "$target.org"; do
                    case "$temp" in "$path".mzd-restore-*)
                        suffix=${temp#"$path.mzd-restore-"}
                        case "$suffix" in ''|*[!0-9]*) ;; *) owned=1 ;; esac ;;
                    esac
                done
            done
            if [ "$owned" = 1 ]; then rm -f "$temp" || result=1; else result=1; fi
        done < "$MZD_REPORT/pending-temps"
    fi
    mzd_system_cleanup || result=1
    exit "$result"
)

warnings_apply() {
    # Create verified OEM backups. Managed uninstall removes owned backups after final verification.
    for folder in "$MZD_REPORT/files/"*; do
        target=$(cat "$folder/target.path") || return 1
        hash=$(cat "$folder/oem.md5") || return 1
        cmp -s "$target" "$folder/before.data" || mzd_fail 'Target changed after preflight.'
        if [ -e "$target.org" ] || [ -L "$target.org" ]; then
            mzd_asset_readable "$target.org" && [ "$(mzd_hash "$target.org")" = "$hash" ] || mzd_fail 'OEM backup changed after preflight.'
        elif ! cmp -s "$folder/before.data" "$folder/after.data"; then
            [ "$(mzd_hash "$target")" = "$hash" ] || mzd_fail 'No verified original; backup refused.'
            # Reuse the atomic writer so a failed copy never publishes a partial backup.
            warnings_write "$target.org" "$folder/before.data" "$target" || return 1
            [ "$(mzd_hash "$target.org")" = "$hash" ] || return 1
        fi
    done
    for folder in "$MZD_REPORT/files/"*; do
        target=$(cat "$folder/target.path") || return 1
        [ "$(mzd_hash "$folder/before.data")" = "$(cat "$folder/before.md5")" ] &&
            [ "$(mzd_hash "$folder/after.data")" = "$(cat "$folder/after.md5")" ] || mzd_fail 'Transaction archive changed.'
        cmp -s "$target" "$folder/before.data" || mzd_fail 'Target changed before commit.'
        cmp -s "$folder/before.data" "$folder/after.data" && continue
        printf '%s\n' "${folder##*/}" >> "$MZD_REPORT/changed" || return 1
        warnings_write "$target" "$folder/after.data" || return 1
    done
    for folder in "$MZD_REPORT/files/"*; do
        target=$(cat "$folder/target.path") || return 1
        cmp -s "$target" "$folder/after.data" || return 1
    done
    WARNINGS_COMMITTED=1
}
