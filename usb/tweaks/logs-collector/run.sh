#!/bin/sh
# Copy running logs to USB or change rotation size in syslog-ng.conf.
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1

case "${1:-}" in
    ''|-h|--help)
        printf 'Usage: sh run.sh <run|status|settings> [log_rotation_size=512|1024|5120]\n'
        printf 'Actions:\n'
        printf '  run       Copy running logs to USB, or update rotation size if setting changed\n'
        printf '  status    Check export readiness\n'
        printf '  settings  Print current rotation size setting from syslog-ng.conf\n'
        exit 0
        ;;
esac

. "$ROOT/lib/manifest.sh" || exit 1
mzd_manifest_load "$HERE/manifest.conf" || exit 1

CONF="$APP"
OEM_MD5="$ORIGINAL"

LOG_ROTATION_PATH='/var/log/running_log/'
EXPORT_SOURCE=${LOG_ROTATION_PATH%/}

EXPORT_TOOLS='wc sed mktemp'
EXPORT_OWN_FILES='source-files.txt'

logs_collector_raw_size() {
    [ -f "$CONF" ] && [ -r "$CONF" ] || return 1
    sed -n "s|.*${LOG_ROTATION_PATH} *\([0-9]*\)[\" ].*|\1|p" "$CONF" 2>/dev/null | sed -n '1p'
}

logs_collector_read_size() {
    kib=$(logs_collector_raw_size) || return 1
    case "$kib" in
        512|1024|5120) printf '%s\n' "$kib" ;;
        *) return 1 ;;
    esac
}

mzd_export_ready() {
    first=$(find "$EXPORT_SOURCE" -type f | sed -n '1p')
    [ -n "$first" ] || { printf 'No running log files are available.\n' >&2; return 2; }
}

mzd_export_run() {
    find "$EXPORT_SOURCE" -type f > "$EXPORT_PARTIAL/source-files.txt" || return 1
    total=$(wc -l < "$EXPORT_PARTIAL/source-files.txt" | awk '{print $1}')
    [ "$total" -gt 0 ] || { printf 'No running log files found.\n' >&2; return 1; }
    mkdir "$EXPORT_PARTIAL/logs" || return 1
    count=0
    while IFS= read -r file; do
        relative=${file#"$EXPORT_SOURCE"/}
        mkdir -p "$EXPORT_PARTIAL/logs/$(dirname "$relative")" || return 1
        cp "$file" "$EXPORT_PARTIAL/logs/$relative" >> "$EXPORT_PARTIAL/run.log" 2>&1 || {
            printf 'Cannot copy a running log (it may have rotated): %s\n' "$file" >&2; return 1;
        }
        count=$((count + 1))
        mzd_export_progress "$count" "$total" 'Copying running log files'
    done < "$EXPORT_PARTIAL/source-files.txt"
    printf 'Copied %s log files.\n' "$count"
}

case "${1:-}" in
    settings)
        val=$(logs_collector_read_size) || exit 1
        printf 'log_rotation_size=%s\n' "$val"
        exit 0
        ;;
    status)
        . "$ROOT/lib/export.sh" || exit 1
        mzd_export_main status
        exit $?
        ;;
    run)
        shift
        ;;
    *)
        printf 'Unsupported action. Use run, status or settings.\n' >&2
        exit 1
        ;;
esac

. "$ROOT/lib/settings.sh" || exit 1

if [ -z "${MZD_SETTINGS_FILE:-}" ]; then
    temporary=$(mktemp /tmp/mzd-logs-collector.XXXXXX) || exit 1
    trap 'rm -f "$temporary"' 0
    mzd_settings_normalize "$HERE/manifest.conf" "$@" > "$temporary" || exit 1
    MZD_SETTINGS_FILE=$temporary; export MZD_SETTINGS_FILE
else
    [ "$#" = 0 ] || { printf 'Values already supplied by the controller.\n' >&2; exit 1; }
fi
mzd_settings_check "$HERE/manifest.conf" "$MZD_SETTINGS_FILE" || exit 1

WANT_KIB=$(mzd_setting log_rotation_size) || exit 1
case "$WANT_KIB" in
    512) LABEL="Stock 512 KB" ;;
    1024) LABEL="Medium 1 MB" ;;
    5120) LABEL="Enlarged 5 MB" ;;
    *) printf 'Invalid log rotation size: %s\n' "$WANT_KIB" >&2; exit 1 ;;
esac

RAW_KIB=$(logs_collector_raw_size 2>/dev/null || :)

if [ "$WANT_KIB" != "$RAW_KIB" ] && { [ -n "$RAW_KIB" ] || [ "$WANT_KIB" != 512 ]; }; then
    [ -f "$CONF" ] || { printf 'error: configuration file not found: %s\n' "$CONF" >&2; exit 1; }
    grep -Fq "$LOG_ROTATION_PATH" "$CONF" || {
        printf 'error: running_log rotation entry not found in %s\n' "$CONF" >&2
        exit 1
    }
    warn_msg=''
    case "$RAW_KIB" in
        512|1024|5120) ;;
        *)
            warn_msg="Warning: current log rotation size (${RAW_KIB} KiB) in ${CONF} is not a recognized preset."
            ;;
    esac
    if [ "$WANT_KIB" != 512 ]; then
        if [ -e "$CONF.org" ] || [ -L "$CONF.org" ]; then
            conf_org_md5=$(md5sum "$CONF.org" 2>/dev/null | awk '{print $1}')
            if [ "$conf_org_md5" != "$OEM_MD5" ]; then
                printf 'error: OEM backup is invalid: %s.org (expected MD5 %s)\n' "$CONF" "$OEM_MD5" >&2
                exit 1
            fi
        else
            conf_md5=$(md5sum "$CONF" 2>/dev/null | awk '{print $1}')
            if [ "$conf_md5" = "$OEM_MD5" ]; then
                cp -p "$CONF" "$CONF.org" || {
                    printf 'error: failed to back up %s to %s.org\n' "$CONF" "$CONF" >&2
                    exit 1
                }
            else
                backup_warn="Warning: %s does not match OEM checksum; OEM backup (.org) was not created."
                warn_msg="${warn_msg:+${warn_msg}
}$(printf "$backup_warn" "$CONF")"
            fi
        fi
    else
        if [ -e "$CONF.org" ] || [ -L "$CONF.org" ]; then
            conf_org_md5=$(md5sum "$CONF.org" 2>/dev/null | awk '{print $1}')
            if [ "$conf_org_md5" != "$OEM_MD5" ]; then
                printf 'error: OEM backup is invalid: %s.org (expected MD5 %s)\n' "$CONF" "$OEM_MD5" >&2
                exit 1
            fi
        fi
    fi
    if ! sed -i "s|\(${LOG_ROTATION_PATH} \)[0-9]*\"|\1$WANT_KIB\"|" "$CONF" ||
       ! grep -Fq "${LOG_ROTATION_PATH} ${WANT_KIB}\"" "$CONF"; then
        printf 'error: failed to set running_log rotation size to %s KiB in %s\n' "$WANT_KIB" "$CONF" >&2
        exit 1
    fi
    if [ "$WANT_KIB" = 512 ]; then
        current_md5=$(md5sum "$CONF" 2>/dev/null | awk '{print $1}')
        if [ "$current_md5" = "$OEM_MD5" ]; then
            rm -f "$CONF.org"
        fi
    fi
    sync
    printf 'MZD_REBOOT_REQUIRED\n'
    [ -z "$warn_msg" ] || printf '%s\n' "$warn_msg"
    printf 'Running logs rotation size set to %s (%s KiB).\nReboot the CMU for changes to take effect.\n' "$LABEL" "$WANT_KIB"
    exit 0
fi

. "$ROOT/lib/export.sh" || exit 1
mzd_export_main run
