#!/bin/sh
# Temporary read-only CMU investigation. Never source installer/tweak code.
umask 077
usage() {
    printf 'Usage: sh collect.sh collect [seconds: 4..180]\n       sh collect.sh mark REPORT_DIRECTORY LABEL\n'
}
stamp() {
    printf 'utc=%s uptime=%s' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(cut -d ' ' -f 1 /proc/uptime)"
}
case "${1:-}" in
    mark)
        [ "$#" = 3 ] || { usage >&2; exit 1; }
        case "$3" in ''|*[!A-Za-z0-9_.-]*) printf 'Use a short label containing letters, digits, dots, underscores or hyphens.\n' >&2; exit 1 ;; esac
        [ "${#3}" -le 80 ] || exit 1
        directory=$(readlink -f "$2") || exit 1
        [ "$(dirname "$directory")" = /tmp ] && [ -d "$directory" ] && [ -f "$directory/issue-35-report" ] || exit 1
        case "${directory##*/}" in mzd-issue35.*) ;; *) exit 1 ;; esac
        printf '%s marker=%s\n' "$(stamp)" "$3" >> "$directory/timeline.txt"
        exit $? ;;
    collect) [ "$#" -le 2 ] || { usage >&2; exit 1; } ;;
    -h|--help|'') usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
esac
seconds=${2:-60}
case "$seconds" in ''|*[!0-9]*|????*) usage >&2; exit 1 ;; esac
[ "$seconds" -ge 4 ] && [ "$seconds" -le 180 ] || { usage >&2; exit 1; }
for command in awk cat cut date df dirname head md5sum mktemp ps readlink sed sleep tail wc; do
    command -v "$command" >/dev/null 2>&1 || { printf 'Missing tool: %s\n' "$command" >&2; exit 1; }
done
# No caller-selected destination: avoid accidental writes to system partitions.
available=$(df -Pk /tmp | awk 'END {print $4}')
case "$available" in ''|*[!0-9]*) printf 'Cannot establish free RAM space.\n' >&2; exit 1 ;; esac
[ "$available" -ge 49152 ] || { printf 'At least 48 MiB free in /tmp is required.\n' >&2; exit 1; }
report=$(mktemp -d /tmp/mzd-issue35.XXXXXX) || exit 1
: > "$report/issue-35-report"
readers=
stop_readers() {
    for pid in $readers; do kill "$pid" 2>/dev/null || :; done
    for pid in $readers; do wait "$pid" 2>/dev/null || :; done
    readers=
}
interrupted() {
    trap '' HUP INT TERM
    stop_readers
    printf '%s interrupted\n' "$(stamp)" >> "$report/timeline.txt"
    printf '\nPartial report: %s\n' "$report"
    exit 130
}
trap interrupted HUP INT TERM
trap stop_readers 0
printf '%s collection-start duration=%s\n' "$(stamp)" "$seconds" >> "$report/timeline.txt"
printf 'Report: %s\nCollecting for %s seconds. Leave the stuck screen untouched initially.\n' "$report" "$seconds"
printf 'Use a second SSH session to mark before-touch and after-touch. No input is injected.\n'

read_file() {
    printf '\n--- %s ---\n' "$1"
    if [ -f "$1" ] && [ -r "$1" ]; then head -c "${2:-65536}" "$1"; else printf 'Unavailable\n'; fi
}
inventory() {
    stamp; printf '\n'; uname -a; ps
    for path in /jci/version.ini /proc/cmdline /proc/mounts /proc/bus/input/devices /proc/interrupts /proc/meminfo; do read_file "$path"; done
    printf '\n--- OEM/UI fingerprints (no code execution) ---\n'
    for path in /jci/gui/apps/system/js/systemApp.js /jci/gui/apps/system/js/systemApp.js.org /jci/gui/framework/js/GuiFramework.js /jci/gui/framework/js/Utility.js /jci/scripts/stage_wifi.sh /data/integration/developer_mode_GuiConfig.js; do
        [ ! -f "$path" ] || md5sum "$path"
    done
    printf '\n--- Input nodes ---\n'
    ls -ln /dev/input /sys/class/input 2>/dev/null
}
archive_logs() {
    phase=$1; count=0
    # Preserve compressed boot history as bytes, not partial/decompressed files.
    for path in /var/log/running_log/log_*.tar.gz; do
        [ -f "$path" ] && [ ! -L "$path" ] || continue
        count=$((count+1)); [ "$count" -le 8 ] || break
        size=$(wc -c < "$path")
        if [ "$size" -le 1048576 ]; then
            head -c 1048577 "$path" > "$report/$phase-${path##*/}"
            printf '%s copied=%s before-size=%s\n' "$phase" "$path" "$size" >> "$report/log-sources.txt"
        else
            printf '%s skipped-over-1MiB=%s size=%s\n' "$phase" "$path" "$size" >> "$report/log-sources.txt"
        fi
    done
    for path in /var/log/running_log/log /var/log/messages; do
        [ ! -f "$path" ] || tail -c 1048576 "$path" > "$report/$phase-${path##*/}.txt"
    done
}
sample() {
    stamp; printf '\n'
    for path in /proc/stat /proc/loadavg /proc/meminfo /proc/interrupts; do read_file "$path" 16384; done
    # CPU counters permit before/after deltas without running top continuously.
    for directory in /proc/[0-9]*; do
        [ -r "$directory/comm" ] || continue
        name=$(cat "$directory/comm" 2>/dev/null)
        case "$name" in
            *[Oo]pera*|*MMUI*|*mmui*|*nativegui*|*[Ll][Vv][Dd][Ss]*|*tranlogo*|*looplogo*|*splash*|*syslog*)
                read_file "$directory/stat" 4096
                read_file "$directory/status" 4096
                read_file "$directory/wchan" 1024 ;;
        esac
    done
    for path in /var/log/running_log/log /var/log/messages; do
        if [ -f "$path" ]; then
            printf '\n--- latest %s (repeated windows; compare timestamps) ---\n' "$path"
            tail -c 32768 "$path"
        fi
    done
}
inventory 2>&1 | head -c 262144 > "$report/before.txt"
archive_logs before 2>> "$report/errors.txt"
if command -v dmesg >/dev/null 2>&1; then dmesg | tail -c 262144 > "$report/dmesg-before.txt"; fi
count=0
for directory in /sys/class/input/event*; do
    [ -d "$directory" ] || continue
    name=$(cat "$directory/device/name" 2>/dev/null)
    printf '%s name=%s\n' "${directory##*/}" "$name" >> "$report/input-nodes.txt"
    case "$name" in
        *[Tt]ouch*|*[Cc]ommand*|*[Rr]otary*|*[Ee]ncoder*|*[Jj]oystick*|"Virtual Keyboard"|"Virtual Mouse"|filtered-keyboard-*|filtered-mouse-*) ;;
        *) continue ;;
    esac
    node=/dev/input/${directory##*/}
    [ -c "$node" ] && [ ! -L "$node" ] && [ -r "$node" ] || continue
    count=$((count+1)); [ "$count" -le 8 ] || break
    # An independent evdev read, no EVIOCGRAB, ioctl, native query or writes.
    head -c 131072 "$node" > "$report/${directory##*/}.bin" 2>> "$report/errors.txt" &
    readers="$readers $!"
    printf 'capturing=%s max-bytes=131072\n' "$node" >> "$report/input-nodes.txt"
done
i=0
while [ "$i" -lt "$seconds" ]; do
    sample 2>&1 | head -c 131072 > "$report/sample-$i.txt"
    sleep 2
    i=$((i+2))
done
stop_readers
archive_logs after 2>> "$report/errors.txt"
inventory 2>&1 | head -c 262144 > "$report/after.txt"
if command -v dmesg >/dev/null 2>&1; then dmesg | tail -c 262144 > "$report/dmesg-after.txt"; fi
printf '%s collection-end\n' "$(stamp)" >> "$report/timeline.txt"
printf 'Complete: %s\nCopy this directory off the CMU before reboot; /tmp is temporary.\n' "$report"
