#!/bin/sh
# Widescreen compensation for Mazda firmware 74.00.324.
# Launcher worker; shared runtime helpers are in ../../lib/.
set -u

mzd_worker_usage() {
    echo 'Usage: sh run.sh <install|uninstall|status>'
    echo 'No arguments or --help: show usage without changing anything.'
}

if [ "$#" -gt 1 ]; then
    echo 'Expected exactly one action, or no arguments for usage.' >&2
    mzd_worker_usage >&2
    exit 1
fi
ACTION=${1:-}
case "$ACTION" in
    ''|--help|-h)
        mzd_worker_usage
        exit 0
        ;;
    install|uninstall|status)
        ;;
    *)
        echo 'Unknown action. Use install, uninstall or status.' >&2
        exit 1
        ;;
esac

SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
if [ "${MZD_WORKER_DIRECT:-}" != 1 ]; then
    exec sh "$ROOT/installer.sh" action "$(basename "$HERE")" "$ACTION"
fi

for library in manifest report system patch status; do
    file="$ROOT/lib/$library.sh"
    [ -f "$file" ] && [ ! -L "$file" ] && [ -r "$file" ] || {
        printf 'ERROR: Missing or unreadable library: %s\n' "$library" >&2
        exit 1
    }
    . "$file" || exit 1
done

mzd_manifest_load "$HERE/manifest.conf" || exit 1
PATCH_FILE="$HERE/assets/gui-index.patch"
. "$ROOT/lib/restore.sh" || exit 1
. "$ROOT/lib/shim.sh" || exit 1

GUI_CSS_DIR=/jci/gui/common/css
FONT_DIR=/jci/fonts/CHN

widescreen_pairs() {
    printf '%s\t%s\n' "$GUI_CSS_DIR/widescreen.css" "$HERE/assets/widescreen.css"
    printf '%s\t%s\n' "$FONT_DIR/SairaExtraCondensed-Regular.ttf" "$HERE/assets/fonts/SairaExtraCondensed-Regular.ttf"
    printf '%s\t%s\n' "$FONT_DIR/SairaExtraCondensed-Medium.ttf" "$HERE/assets/fonts/SairaExtraCondensed-Medium.ttf"
}

widescreen_assets() {
    tab=$(printf '\t')
    widescreen_pairs | while IFS="$tab" read -r target asset; do
        mzd_asset_readable "$asset" || exit 1
    done
}

widescreen_files_state() (
    widescreen_assets || { printf 'Widescreen assets are missing or unreadable.\n' >&2; exit 1; }
    present=0; absent=0; unknown=0
    tab=$(printf '\t')
    while IFS="$tab" read -r target asset; do
        mzd_shim_parent_ok "$target" || {
            printf 'Invalid or missing parent directory for: %s\n' "$target" >&2
            unknown=1; continue
        }
        parent=$(dirname "$target")
        [ -d "$parent" ] && [ ! -L "$parent" ] || {
            printf 'Target directory is missing or linked: %s\n' "$parent" >&2
            unknown=1; continue
        }
        if [ -e "$target" ] || [ -L "$target" ]; then
            if mzd_asset_readable "$target" && cmp -s "$target" "$asset"; then
                present=$((present + 1))
            else
                printf 'Unknown or altered file at widescreen path; nothing overwritten: %s\n' "$target" >&2
                unknown=1
            fi
        else
            absent=$((absent + 1))
        fi
    done <<EOF
$(widescreen_pairs)
EOF
    if [ "$unknown" = 1 ]; then
        if [ "$present" -gt 0 ]; then printf 'broken\n'; else printf 'unavailable\n'; fi
    elif [ "$present" = 3 ]; then
        printf 'installed\n'
    elif [ "$absent" = 3 ]; then
        printf 'uninstalled\n'
    else
        printf 'Widescreen CSS and font files are only partly installed.\n' >&2
        printf 'broken\n'
    fi
)

widescreen_status() (
    index_state=$(mzd_read_status) || exit 1
    files_state=$(widescreen_files_state) || exit 1
    case "$index_state:$files_state" in
        installed:installed) printf 'installed\n' ;;
        uninstalled:uninstalled) printf 'uninstalled\n' ;;
        *broken*|installed:*|*:installed)
            printf 'Widescreen index.html patch and payload files are incomplete or inconsistent.\n' >&2
            printf 'broken\n' ;;
        *)
            printf 'Widescreen target or payload state is unsupported.\n' >&2
            printf 'unavailable\n' ;;
    esac
)

widescreen_cleanup() (
    result=0
    if [ -f "$MZD_REPORT/temp.path" ]; then
        temp=$(cat "$MZD_REPORT/temp.path") || temp=
        case "$temp" in *.mzd-restore-*) rm -f "$temp" || result=1 ;; esac
    fi
    if [ "${WIDESCREEN_COMMITTED:-0}" != 1 ]; then
        if [ -f "$MZD_REPORT/created" ]; then
            while IFS= read -r target; do
                [ -n "$target" ] || continue
                rm -f "$target" || result=1
            done < "$MZD_REPORT/created"
        fi
        if [ -f "$MZD_REPORT/removed" ]; then
            while IFS= read -r entry; do
                target=${entry%%	*}
                backup=${entry#*	}
                [ -n "$target" ] && [ -f "$backup" ] || continue
                mzd_restore_write "$target" "$backup" "$backup" || result=1
            done < "$MZD_REPORT/removed"
        fi
        if [ -d "$MZD_REPORT/index" ] && [ -f "$MZD_REPORT/index/target.path" ]; then
            mzd_patch_rollback "$MZD_REPORT/index" || result=1
        fi
        mzd_system_cleanup || result=1
    elif [ "${ACTION:-}" = uninstall ]; then
        mzd_system_cleanup allow-busy-remount || result=1
    else
        mzd_system_cleanup || result=1
    fi
    exit "$result"
)

if [ "$ACTION" = status ]; then widescreen_status; exit $?; fi
state=$(widescreen_status) || exit 1
case "$state" in
    installed|uninstalled) ;;
    *) printf 'Unsupported or incomplete widescreen state; nothing changed.\n' >&2; exit 1 ;;
esac

WIDESCREEN_COMMITTED=0
mzd_begin "$SELF" "$ID" widescreen_cleanup
mzd_system_begin
mzd_require_tools awk md5sum cp cmp chmod patch diff readlink dirname mv rm cat sync || exit 1
mzd_validate_firmware "$FIRMWARE" || exit 1
mzd_system_lock "$LOCK" || exit 1

CONTEXT="$MZD_REPORT/index"
mzd_patch_prepare "$APP" "$PATCH_FILE" "$ORIGINAL" "$CONTEXT" || exit 1
mzd_patch_validate_backup "$CONTEXT" || exit 1
index_state=$(mzd_patch_state "$CONTEXT") || exit 1
files_state=$(widescreen_files_state) || exit 1
case "$index_state:$files_state" in
    installed:installed|uninstalled:uninstalled) ;;
    *) mzd_fail 'Widescreen target and payload files are not in a consistent state.' ;;
esac

mzd_report_start
if [ "$ACTION:$index_state" != install:installed ] && [ "$ACTION:$index_state" != uninstall:uninstalled ]; then
    mzd_system_watchdog_disable || exit 1
    gui_mount=$(mzd_shim_mount "$APP") || exit 1
    mzd_system_remount_rw "$gui_mount" || exit 1
    css_mount=$(mzd_shim_mount "$GUI_CSS_DIR") || exit 1
    mzd_system_remount_rw "$css_mount" || exit 1
    font_mount=$(mzd_shim_mount "$FONT_DIR") || exit 1
    mzd_system_remount_rw "$font_mount" || exit 1

    tab=$(printf '\t')
    if [ "$ACTION" = install ]; then
        : > "$MZD_REPORT/created" || mzd_fail 'Cannot initialize created file log.'
        while IFS="$tab" read -r target asset; do
            [ ! -e "$target" ] && [ ! -L "$target" ] || mzd_fail "Target already exists before widescreen install: $target"
            printf '%s\n' "$target" >> "$MZD_REPORT/created" || mzd_fail 'Cannot record created file.'
            mzd_restore_create "$target" "$asset" || mzd_fail "Failed to install widescreen file: $target"
        done <<EOF
$(widescreen_pairs)
EOF
        mzd_patch_apply "$CONTEXT" install || mzd_fail 'Failed to patch index.html; restoring entry state.'
    else
        mkdir -p "$MZD_REPORT/removed-backup" || mzd_fail 'Cannot create rollback backup directory.'
        : > "$MZD_REPORT/removed" || mzd_fail 'Cannot initialize removed file log.'
        n=0
        while IFS="$tab" read -r target asset; do
            n=$((n + 1))
            backup="$MZD_REPORT/removed-backup/$n"
            cp "$target" "$backup" && cmp -s "$target" "$backup" || mzd_fail "Cannot archive $target before removal."
            printf '%s\t%s\n' "$target" "$backup" >> "$MZD_REPORT/removed" || mzd_fail 'Cannot record removed file.'
            rm -f "$target" || mzd_fail "Failed to remove widescreen file: $target"
        done <<EOF
$(widescreen_pairs)
EOF
        mzd_patch_apply "$CONTEXT" uninstall || mzd_fail 'Failed to restore index.html; restoring entry state.'
    fi
    sync
fi
WIDESCREEN_COMMITTED=1
MZD_SUCCESS="Widescreen compensation verified. Restart to apply.
Reports: $MZD_REPORT"
