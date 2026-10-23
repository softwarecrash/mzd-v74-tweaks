#!/bin/sh
# No List Beep for Mazda firmware 74.00.324.
# Generated from templates/run.sh.in; rebuild with build_installers.py.
set -u

# --- Tweak configuration ----------------------------------------------------
# These paths are rendered from the manifest. Metadata is never sourced as code.
ID=list-beep
TITLE='No List Beep'
APP=/jci/gui/common/controls/List2/js/List2Ctrl.js
LOCK=/tmp/mzd-List2Ctrl-tweak.lock

SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
PATCH_FILE="$HERE/assets/change.patch"
ORIGINAL=e111883b9dcbeb6bb154521826fcacac
ACTION=${1:-dialog}

# Track only changes made by this invocation, so cleanup preserves prior state.
UI=0
ROOT_CHANGED=0
RES_CHANGED=0
WATCHDOG_CHANGED=0
LOCKED=0
REBOOT=0
PROGRESS_ACTIVE=0


# --- Interface helpers ------------------------------------------------------
# Keep jci-dialog calls here, ready to replace with another dialog backend.
# CLI calls print messages and never open dialogs or reboot automatically.
dialog_kill() {
    killall -q jci-dialog || :
    PROGRESS_ACTIVE=0
}

# Non-blocking information while a modifying action is running.
info() {
    echo "$1"
    printf '%s\n' "$1" >&3

    if [ "$UI" = 1 ]
    then
        dialog_kill
        /jci/tools/jci-dialog --info --title="$TITLE" --text="$1" --no-cancel &
        PROGRESS_ACTIVE=1
    fi
}

# Blocking information for completion or errors.
confirm() {
    printf '%s\n' "$1" >&3

    if [ "$UI" = 1 ]
    then
        dialog_kill
        /jci/tools/jci-dialog --info --title="$TITLE" --text="$1" --no-cancel
    fi
}

# Buttons return their native result: 0 = first, 1 = second, other = exit.
ask() {
    if [ "$UI" != 1 ]
    then
        return 1
    fi

    dialog_kill
    if [ -n "${4:-}" ]
    then
        /jci/tools/jci-dialog --3-button-dialog --title="$TITLE" \
            --text="$1" --ok-label="$2" --cancel-label="$3" --button3-label="$4"
    else
        /jci/tools/jci-dialog --question --title="$TITLE" \
            --text="$1" --ok-label="$2" --cancel-label="$3"
    fi
}

fail() {
    echo "ERROR: $*"
    confirm "ERROR: $*
Reports: $REPORT"
    exit 1
}


# --- Startup medium, reports and cleanup ------------------------------------
parse_action() {
    case "$ACTION" in
        --help|-h)
            echo 'Usage: sh run.sh [dialog|install|uninstall|restore|status]'
            exit 0
            ;;
        dialog)
            UI=1
            ;;
        install|uninstall|restore|status)
            ;;
        *)
            echo 'Unknown action. Use dialog, install, uninstall, restore or status.' >&2
            exit 1
            ;;
    esac
}

open_report() {
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

    # fd 3 retains the caller's stdout; detailed diagnostics go to the USB log.
    exec 3>&1
    exec > "$REPORT/run.log" 2>&1
}

finish() {
    _code=$?
    trap - 0

    if [ "$PROGRESS_ACTIVE" = 1 ]
    then
        dialog_kill
    fi
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

    # Cleanup must finish before an optional GUI-requested reboot.
    if [ "$_code" = 0 ] && [ "$REBOOT" = 1 ]
    then
        reboot
    fi
    exit "$_code"
}


# --- Package integrity and firmware validation ------------------------------
hash() {
    md5sum "$1" | cut -d' ' -f1
}

check_asset() {
    _expected=$(cut -c1-32 "$1.md5" 2>/dev/null)
    [ -n "$_expected" ] && [ -f "$1" ] && [ ! -L "$1" ] &&
        [ "$(hash "$1")" = "$_expected" ]
}

validate_package() {
    for TOOL in patch diff awk md5sum cp cmp
    do
        command -v "$TOOL" >/dev/null || fail "Missing tool: $TOOL"
    done

    if ! check_asset "$SELF" || ! check_asset "$PATCH_FILE" ||
        ! check_asset "$HERE/manifest.json"
    then
        fail 'Installer, manifest or patch checksum mismatch.'
    fi
}

validate_firmware() {
    if ! grep -q '^JCI_SW_VER="MAZ_CMU-150_74\.00\.324"$' /jci/version.ini
    then
        fail 'This tweak requires firmware 74.00.324.'
    fi

    if [ ! -f "$APP" ] || [ -L "$APP" ]
    then
        fail 'Target is missing or is a symbolic link.'
    fi
}


# --- Snapshot and patch-state detection -------------------------------------
save_previous_file() {
    # All tweaks sharing this target use the same atomic mkdir lock.
    mkdir "$LOCK" || fail 'Another tweak for this file is running. Restart the CMU if a previous run was interrupted.'
    LOCKED=1

    cp "$APP" "$REPORT/before.data" || fail 'Cannot save the USB rollback copy.'
    BEFORE=$(hash "$APP")
    if [ "$(hash "$REPORT/before.data")" != "$BEFORE" ]
    then
        fail 'USB rollback copy mismatch.'
    fi
}

patch_copy() {
    if [ "$1" = install ]
    then
        patch -N -p0 -i "$PATCH_FILE" < /dev/null
    else
        patch -N -R -p0 -i "$PATCH_FILE" < /dev/null
    fi
}

# BusyBox 1.19.2 has no --dry-run. Test each direction on its own USB copy.
# A successful patch must change bytes AND reverse to the exact previous file.
probe() {
    _direction=$1
    _dir="$REPORT/$_direction"
    mkdir -p "$_dir/inverse" || return 1
    cp "$REPORT/before.data" "$_dir/target.data" || return 1
    (cd "$_dir" && patch_copy "$_direction") > "$_dir/patch.log" 2>&1 || return 1

    if cmp -s "$REPORT/before.data" "$_dir/target.data"
    then
        return 1
    fi

    cp "$_dir/target.data" "$_dir/inverse/target.data" || return 1
    _inverse=install
    if [ "$_direction" = install ]
    then
        _inverse=uninstall
    fi

    (cd "$_dir/inverse" && patch_copy "$_inverse") > "$_dir/inverse.log" 2>&1 || return 1
    cmp -s "$REPORT/before.data" "$_dir/inverse/target.data"
}

detect_state() {
    FORWARD=0
    REVERSE=0
    if probe install
    then
        FORWARD=1
    fi
    if probe uninstall
    then
        REVERSE=1
    fi

    # Neither or both directions succeeding is not a trustworthy patch state.
    case "$FORWARD:$REVERSE" in
        1:0)
            STATE=uninstalled
            ;;
        0:1)
            STATE=installed
            ;;
        *)
            fail 'Patch state is unknown, partial or ambiguous. No system file changed.'
            ;;
    esac
    echo "state=$STATE"
}


# --- Original backup and verified system-file write -------------------------
validate_original_backup() {
    BACKUP="${APP}.org"
    if [ -e "$BACKUP" ] || [ -L "$BACKUP" ]
    then
        if [ ! -f "$BACKUP" ] || [ -L "$BACKUP" ] ||
            [ "$(hash "$BACKUP")" != "$ORIGINAL" ]
        then
            fail 'The .org backup is not the known OEM original.'
        fi
    elif [ "$BEFORE" != "$ORIGINAL" ]
    then
        fail 'The shared OEM .org backup is missing. Nothing changed.'
    fi
}

make_rw() {
    _watchdog=$(cat /sys/class/gpio/Watchdog\ Disable/value) || fail 'Cannot read watchdog state.'
    case "$_watchdog" in
        0)
            echo 1 > /sys/class/gpio/Watchdog\ Disable/value || fail 'Cannot disable watchdog.'
            WATCHDOG_CHANGED=1
            ;;
        1)
            ;;
        *)
            fail 'Unknown watchdog state.'
            ;;
    esac

    if awk '$2=="/" && $3!="rootfs" && $4 ~ /(^|,)ro(,|$)/ {f=1} END {exit !f}' /proc/mounts
    then
        mount -o rw,remount / || fail 'Cannot remount the system read-write.'
        ROOT_CHANGED=1
    fi
}

write_prepared_change() {
    DESIRED_FILE="$REPORT/$ACTION/target.data"
    DESIRED=$(hash "$DESIRED_FILE")
    diff -U 3 "$REPORT/before.data" "$DESIRED_FILE" > "$REPORT/changes.diff"
    if [ "$?" != 1 ]
    then
        fail 'Cannot record the prepared change.'
    fi

    make_rw

    # The first tweak creates the shared OEM backup; later tweaks retain it.
    if [ ! -e "$BACKUP" ]
    then
        cp -a "$APP" "$BACKUP" && sync
        if [ "$(hash "$BACKUP")" != "$ORIGINAL" ]
        then
            rm -f "$BACKUP"
            fail 'Original backup failed.'
        fi
    fi
    if [ "$(hash "$APP")" != "$BEFORE" ]
    then
        fail 'Target changed while preparing the tweak.'
    fi

    # Preserve the target's existing permissions; retry once on a bad write.
    cat "$DESIRED_FILE" > "$APP"
    sync
    if [ "$(hash "$APP")" != "$DESIRED" ]
    then
        cat "$DESIRED_FILE" > "$APP"
        sync
    fi

    # Rollback uses the complete previous file, including other active tweaks.
    if [ "$(hash "$APP")" != "$DESIRED" ]
    then
        cat "$REPORT/before.data" > "$APP"
        sync
        if [ "$(hash "$APP")" != "$BEFORE" ]
        then
            fail 'Write AND rollback failed. Do NOT reboot the CMU.'
        fi
        fail 'Write failed; the complete previous file was restored.'
    fi
}



# --- Action selection and completion ----------------------------------------
select_action() {
    if [ "$UI" = 1 ]
    then
        ask 'Mute the two long multicontroller list beeps.\nWhat would you like to do?' Install Uninstall Exit
        _choice=$?
        case "$_choice" in
            0)
                ACTION=install
                ;;
            1)
                ACTION=uninstall
                ;;
            *)
                echo 'Cancelled. Nothing changed.'
                exit 0
                ;;
        esac
    fi

    # Restore is selective removal, never a whole-file OEM overwrite.
    if [ "$ACTION" = restore ]
    then
        ACTION=uninstall
    fi

    NO_CHANGE=0
    case "$ACTION:$STATE" in
        install:installed|uninstall:uninstalled)
            NO_CHANGE=1
            ;;
    esac
}

report_completion() {
    if [ "$NO_CHANGE" = 1 ]
    then
        confirm "Requested setting is already present.
Reports: $REPORT"
    else
        printf '%s completed. Other changes were preserved.\nReports: %s\n' "$ACTION" "$REPORT" >&3
        if ask 'Completed. Reboot to reload the system.' 'Reboot now' 'Reboot later'
        then
            REBOOT=1
        fi
    fi
}


# --- Main flow --------------------------------------------------------------
# Keep the sequence visible: inspect first, prepare copies, write, then finish.
main() {
    parse_action
    open_report
    trap finish 0
    trap 'exit 130' INT
    trap 'exit 143' TERM

    validate_package
    validate_firmware
    save_previous_file
    detect_state

    if [ "$ACTION" = status ]
    then
        printf '%s\n' "$STATE" >&3
        return 0
    fi

    select_action
    if [ "$NO_CHANGE" = 0 ]
    then
        validate_original_backup
    fi

    info "$ACTION in progress. Do not remove the USB drive."
    # No extra payload to prepare for this UI tweak.
    if [ "$NO_CHANGE" = 0 ]
    then
        write_prepared_change
    fi
    # No service activation needed for this UI tweak.

    report_completion
    return 0
}

main
