#!/bin/sh
# Shared tweak library: common. Sourcing defines functions only.
# API 1; context and lifecycle are documented in docs/tweaks/LIBRARIES.md.

mzd_common_api() {
    printf '%s\n' '1'
}


# Write human-readable progress to the caller and the USB log.
mzd_report_message() {
    echo "$1"
    printf '%s\n' "$1" >&3
}


# Report a fatal worker error; the installed exit trap handles cleanup.
mzd_fail() {
    echo "ERROR: $*"
    printf 'ERROR: %s\nReports: %s\n' "$*" "$REPORT" >&4
    exit 1
}


# Find the startup medium and separate caller output from detailed logs.
mzd_open_report() {
    USB=$HERE
    while [ "$USB" != / ] && ! grep -q " $USB " /proc/mounts
    do
        USB=$(dirname "$USB")
    done

    if [ "$USB" = / ]
    then
        echo 'Cannot identify the startup storage mount.' >&2
        exit 1
    fi

    mount -o rw,remount "$USB" || exit 1
    REPORT="$USB/reports/diffpatch/$ID-$(date +%Y%m%d-%H%M%S)-$$"
    mkdir -p "$REPORT" || exit 1
    : > "$REPORT/run.log" || exit 1

    # Keep caller output separate from the detailed USB log. Status writes only
    # its state to fd 3; errors go to fd 4 so a launcher cannot mistake them for
    # a valid state. Help and invalid arguments return before opening a report.
    exec 3>&1
    exec 4>&2
    exec > "$REPORT/run.log" 2>&1
}


# Restore only state changed by this invocation, including on caught signals.
mzd_finish() {
    _code=$?
    trap - 0

    if [ "$ROOT_CHANGED" = 1 ]
    then
        mount -o ro,remount / || _code=1
    fi
    if [ "$RES_CHANGED" = 1 ]
    then
        mount -o ro,remount /tmp/mnt/resources || _code=1
    fi
    if [ "$WATCHDOG_CHANGED" = 1 ]
    then
        echo 0 > /sys/class/gpio/Watchdog\ Disable/value || _code=1
    fi
    if [ "$LOCKED" = 1 ]
    then
        rmdir "$LOCK" || _code=1
    fi

    printf 'exit_code=%s\n' "$_code" > "$REPORT/status.txt"
    sync

    exit "$_code"
}


# Checksum one file using the native CMU tools.
mzd_hash() {
    md5sum "$1" | cut -d' ' -f1
}


# Reject missing, linked or corrupt files before using them.
mzd_check_asset() {
    _expected=$(cut -c1-32 "$1.md5" 2>/dev/null)
    [ -n "$_expected" ] && [ -f "$1" ] && [ ! -L "$1" ] &&
        [ "$(mzd_hash "$1")" = "$_expected" ]
}


# Check worker metadata and patch integrity after opening the USB report.
mzd_validate_package() {
    for TOOL in patch diff awk md5sum cp cmp
    do
        command -v "$TOOL" >/dev/null || mzd_fail "Missing tool: $TOOL"
    done

    if ! mzd_check_asset "$SELF" || ! mzd_check_asset "$PATCH_FILE" ||
        ! mzd_check_asset "$HERE/manifest.json"
    then
        mzd_fail 'Installer, manifest or patch checksum mismatch.'
    fi
}


# Require the verified firmware and a regular target file.
mzd_validate_firmware() {
    if ! grep -q '^JCI_SW_VER="MAZ_CMU-150_74\.00\.324"$' /jci/version.ini
    then
        mzd_fail 'This tweak requires firmware 74.00.324.'
    fi

    if [ ! -f "$APP" ] || [ -L "$APP" ]
    then
        mzd_fail 'Target is missing or is a symbolic link.'
    fi
}


# Preserve the prior watchdog/root mount state for the exit trap.
mzd_make_rw() {
    _watchdog=$(cat /sys/class/gpio/Watchdog\ Disable/value) || mzd_fail 'Cannot read watchdog state.'
    case "$_watchdog" in
        0)
            echo 1 > /sys/class/gpio/Watchdog\ Disable/value || mzd_fail 'Cannot disable watchdog.'
            WATCHDOG_CHANGED=1
            ;;
        1)
            ;;
        *)
            mzd_fail 'Unknown watchdog state.'
            ;;
    esac

    if awk '$2=="/" && $3!="rootfs" && $4 ~ /(^|,)ro(,|$)/ {f=1} END {exit !f}' /proc/mounts
    then
        mount -o rw,remount / || mzd_fail 'Cannot remount the system read-write.'
        ROOT_CHANGED=1
    fi
}


# Explicit lifecycle start. Importing the library alone performs no operations.
mzd_begin() {
    ROOT_CHANGED=0
    RES_CHANGED=0
    WATCHDOG_CHANGED=0
    LOCKED=0
    mzd_open_report
    trap mzd_finish 0
    trap 'exit 130' INT
    trap 'exit 143' TERM
}
