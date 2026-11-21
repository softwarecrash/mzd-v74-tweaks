#!/bin/sh
# Shared lifecycle for read-only System tools. Only the originating USB is written.
mzd_export_progress() {
    if [ -n "${MZD_PROGRESS_FILE:-}" ]; then
        printf '%s\n%s\n%s\n' "$1" "$2" "$3" > "$MZD_PROGRESS_FILE.tmp.$$" &&
            mv "$MZD_PROGRESS_FILE.tmp.$$" "$MZD_PROGRESS_FILE"
    fi
}
mzd_export_mount() {
    EXPORT_MOUNT=$ROOT
    while [ "$EXPORT_MOUNT" != / ]; do
        EXPORT_MODE=$(awk -v p="$EXPORT_MOUNT" '$2==p {print $4; exit}' /proc/mounts)
        [ -z "$EXPORT_MODE" ] || break
        EXPORT_MOUNT=$(dirname "$EXPORT_MOUNT")
    done
    # Exclude internal flash and the navigation card. No fixed USB drive letter.
    case "$EXPORT_MOUNT" in /tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*) ;;
        *) printf 'Cannot identify the originating USB mount.\n' >&2; return 1 ;;
    esac
}
mzd_export_check() {
    [ -r /jci/version.ini ] || { printf 'Cannot read firmware version.\n' >&2; return 1; }
    EXPORT_FIRMWARE=${FIRMWARE:-74.00.324}
    awk -v expected="JCI_SW_VER=\"MAZ_CMU-150_$EXPORT_FIRMWARE\"" '$0==expected {found=1} END {exit !found}' /jci/version.ini || {
        printf 'Requires firmware %s.\n' "$EXPORT_FIRMWARE" >&2; return 2;
    }
    mzd_export_mount || return 2
    [ -n "${EXPORT_SOURCE:-}" ] && [ -d "$EXPORT_SOURCE" ] && [ -r "$EXPORT_SOURCE" ] || {
        printf 'Source directory is unavailable: %s\n' "${EXPORT_SOURCE:-}" >&2; return 2;
    }
    for tool in df du awk find cp mv mkdir date sync ${EXPORT_TOOLS:-}; do
        command -v "$tool" >/dev/null 2>&1 || { printf 'Required tool is missing: %s\n' "$tool" >&2; return 2; }
    done
    EXPORT_SOURCE=$(readlink -f "$EXPORT_SOURCE") || return 1
    if command -v mzd_export_ready >/dev/null 2>&1; then mzd_export_ready || return $?; fi
    NEEDED_KB=${EXPORT_MIN_KB:-16384}
    # Status stays cheap: only run scans the source tree for a size estimate.
    if [ "$1" = run ]; then
        SOURCE_KB=$(du -sk "$EXPORT_SOURCE" | awk 'NR==1 {print $1}')
        case "$SOURCE_KB" in ''|*[!0-9]*) printf 'Cannot determine source size.\n' >&2; return 1 ;; esac
        [ "$((SOURCE_KB + 16384))" -le "$NEEDED_KB" ] || NEEDED_KB=$((SOURCE_KB + 16384))
    fi
    AVAILABLE_KB=$(df -Pk "$EXPORT_MOUNT" | awk 'NR==2 {print $4}')
    case "$AVAILABLE_KB" in ''|*[!0-9]*) printf 'Cannot determine USB free space.\n' >&2; return 1 ;; esac
    [ "$AVAILABLE_KB" -ge "$NEEDED_KB" ] || {
        printf 'Not enough free space on the originating USB (need at least %s KiB).\n' "$NEEDED_KB" >&2; return 2;
    }
}
mzd_export_finish() {
    code=$?; trap - 0
    if [ -n "${EXPORT_PARTIAL:-}" ] && [ -d "$EXPORT_PARTIAL" ]; then
        printf 'Incomplete export retained at: %s\n' "$EXPORT_PARTIAL" >&2
    fi
    # Real dates instead of 1970/1980 for the folder and the files the export writes
    # itself (EXPORT_OWN_FILES from the tweak). Copied files keep their own dates.
    for folder in "${EXPORT_PARTIAL:-}" "${EXPORT_OUTPUT:-}"; do
        [ -n "$folder" ] && [ -d "$folder" ] || continue
        set -- "$folder" "$folder/run.log" "$folder/settings.conf"
        for file in ${EXPORT_OWN_FILES:-}; do set -- "$@" "$folder/$file"; done
        mzd_datetime_touch "$@" 2>/dev/null || :
    done
    sync
    if [ "$code" = 0 ]; then printf 'Saved to USB: %s\n' "$EXPORT_OUTPUT"; fi
    exit "$code"
}
mzd_export_main() {
    [ "$#" -le 1 ] || { printf 'Expected one action.\n' >&2; return 1; }
    case "${1:-}" in
        ''|-h|--help) printf 'Usage: sh run.sh <run|status>\n'; return 0 ;;
        run|status) ;;
        *) printf 'Unsupported action. Use run or status.\n' >&2; return 1 ;;
    esac
    . "$ROOT/lib/datetime.sh" || return 1
    if [ "$1" = status ]; then
        reason=$(mzd_export_check status 2>&1); result=$?
        case "$result" in
            0) printf 'uninstalled\n' ;;
            2) printf 'unavailable\n'; printf '%s\n' "$reason" >&2 ;;
            *) printf '%s\n' "$reason" >&2; return 1 ;;
        esac
        return 0
    fi
    mzd_export_progress 0 0 'Checking source size and USB free space'
    mzd_export_check run || return 1
    EXPORT_PARTIAL=; EXPORT_OUTPUT=
    trap mzd_export_finish 0
    trap 'exit 130' INT
    trap 'exit 143' TERM
    case ",$EXPORT_MODE," in *,ro,*) mount -o rw,remount "$EXPORT_MOUNT" || return 1 ;; esac
    EXPORT_ID=${ID:-${HERE##*/}}
    mkdir -p "$EXPORT_MOUNT/exports/$EXPORT_ID" || return 1
    # Car local time in the name and the Start line: one reading (development/CMU-time.md).
    mzd_datetime_snapshot
    EXPORT_PARTIAL=$(mktemp -d "$EXPORT_MOUNT/exports/$EXPORT_ID/$(mzd_datetime_name)-XXXXXX") || return 1
    EXPORT_OUTPUT="$EXPORT_PARTIAL-complete"
    { mzd_datetime_start
      printf 'Installer version: %s\nExport source: %s\nOriginating USB: %s\n' "${MZD_INSTALLER_VERSION:-unknown}" "$EXPORT_SOURCE" "$EXPORT_MOUNT"; } > "$EXPORT_PARTIAL/run.log"
    if [ -n "${MZD_SETTINGS_FILE:-}" ] && [ -s "$MZD_SETTINGS_FILE" ]; then
        [ ! -L "$MZD_SETTINGS_FILE" ] && cp "$MZD_SETTINGS_FILE" "$EXPORT_PARTIAL/settings.conf" && cmp -s "$MZD_SETTINGS_FILE" "$EXPORT_PARTIAL/settings.conf" || return 1
    fi
    : > "$EXPORT_PARTIAL/.incomplete"
    mzd_export_progress 0 0 'Preparing export'
    mzd_export_run || return 1
    rm -f "$EXPORT_PARTIAL/.incomplete" || return 1
    mv "$EXPORT_PARTIAL" "$EXPORT_OUTPUT" || return 1
    EXPORT_PARTIAL=
    mzd_export_progress 1 1 'Export complete'
}
