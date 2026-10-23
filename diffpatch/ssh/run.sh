#!/bin/sh
# SSH Access for Mazda firmware 74.00.324.
# Generated from templates/run.sh.in; rebuild with build_installers.py.
set -u

# --- Tweak configuration ----------------------------------------------------
# These paths are rendered from the manifest. Metadata is never sourced as code.
ID=ssh
APP=/jci/scripts/stage_wifi.sh
LOCK=/tmp/mzd-stage_wifi-tweak.lock

SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
PATCH_FILE="$HERE/assets/change.patch"
ORIGINAL=d740449dea568696660a62fce0fb35bd
ACTION=${1:-}

# Track only changes made by this invocation, so cleanup preserves prior state.
ROOT_CHANGED=0
RES_CHANGED=0
WATCHDOG_CHANGED=0
LOCKED=0


# --- Text output ------------------------------------------------------------
# A launcher can display these messages, but all decisions happen before it
# invokes this script. Direct terminal use follows exactly the same workflow.
report_message() {
    echo "$1"
    printf '%s\n' "$1" >&3
}

fail() {
    echo "ERROR: $*"
    printf 'ERROR: %s\nReports: %s\n' "$*" "$REPORT" >&4
    exit 1
}


# --- Startup medium, reports and cleanup ------------------------------------
parse_action() {
    if [ "$#" -gt 1 ]
    then
        echo 'Expected exactly one action, or no arguments for usage.' >&2
        usage >&2
        exit 1
    fi

    case "$ACTION" in
        ''|--help|-h)
            usage
            exit 0
            ;;
        install|uninstall|restore|status)
            ;;
        *)
            echo 'Unknown action. Use install, uninstall, restore or status.' >&2
            exit 1
            ;;
    esac
}

usage() {
    echo 'Usage: sh run.sh <install|uninstall|restore|status>'
    echo 'No arguments or --help: show usage without changing anything.'
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

    # Keep caller output separate from the detailed USB log. Status writes only
    # its state to fd 3; errors go to fd 4 so a launcher cannot mistake them for
    # a valid state. Help and invalid arguments return before opening a report.
    exec 3>&1
    exec 4>&2
    exec > "$REPORT/run.log" 2>&1
}

finish() {
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

# --- SSH payload preparation ------------------------------------------------
# SSH owns a resources directory in addition to its patched startup hook.
# Keep service provisioning separate from the generic file-patching workflow.
SERVICE=/tmp/mnt/resources/mzd-v74-tweaks/ssh
PAYLOAD="$HERE/assets"

resources_rw() {
    if awk '$2=="/tmp/mnt/resources" && $4 ~ /(^|,)ro(,|$)/ {f=1} END {exit !f}' /proc/mounts
    then
        mount -o rw,remount /tmp/mnt/resources || fail 'Cannot remount resources read-write.'
        RES_CHANGED=1
    fi
}

# Never replace an unknown service payload, even if the boot hook looks known.
ssh_payload_ok() {
    if [ ! -d "$SERVICE" ] || [ -L "$SERVICE" ]
    then
        return 1
    fi
    for _file in service.sh sshd_config password.hash
    do
        if [ -L "$SERVICE/$_file" ] || ! cmp -s "$PAYLOAD/$_file" "$SERVICE/$_file"
        then
            return 1
        fi
    done
}

ssh_prepare() {
    for _file in service.sh sshd_config password.hash usb-log-marker.txt
    do
        check_asset "$PAYLOAD/$_file" || fail 'SSH asset checksum mismatch.'
    done

    if [ -e "$SERVICE" ]
    then
        ssh_payload_ok || fail 'Existing SSH service files differ. Nothing overwritten.'
    elif [ "$STATE" = installed ]
    then
        fail 'The SSH boot hook is installed but the service payload is missing.'
    fi

    if [ "$ACTION" != install ]
    then
        return 0
    fi

    # Check account layout, executable/config compatibility and port ownership
    # before copying anything into resources or changing the startup hook.
    _check=$PAYLOAD
    if [ -d "$SERVICE" ]
    then
        _check=$SERVICE
    fi
    sh "$_check/service.sh" check || fail 'SSH prerequisites failed; an unrelated port 22 listener is never replaced.'

    if [ ! -e "$SERVICE" ]
    then
        resources_rw
        mkdir -p "$(dirname "$SERVICE")" || fail 'Cannot create SSH parent directory.'
        _stage="$SERVICE.new-$$"
        mkdir "$_stage" || fail 'Cannot prepare SSH service directory.'

        # Publish a directory only after all three payload files are verified.
        for _file in service.sh sshd_config password.hash
        do
            if ! cp "$PAYLOAD/$_file" "$_stage/$_file" || ! cmp -s "$PAYLOAD/$_file" "$_stage/$_file"
            then
                rm -f "$_stage/service.sh" "$_stage/sshd_config" "$_stage/password.hash"
                rmdir "$_stage"
                fail 'Cannot copy and verify SSH service payload.'
            fi
        done
        if ! chmod 700 "$_stage/service.sh" ||
            ! chmod 600 "$_stage/sshd_config" "$_stage/password.hash"
        then
            fail 'Cannot set SSH payload permissions.'
        fi
        sync
        mv "$_stage" "$SERVICE" || fail 'Cannot publish SSH service directory.'
    fi

    cp "$PAYLOAD/usb-log-marker.txt" "$USB/diffpatch-ssh-log-marker.txt" || fail 'Cannot save USB runtime-log marker.'
}


# --- SSH activation, selective removal and startup rollback ------------------
ssh_rollback_hook() {
    if [ "$NO_CHANGE" = 0 ]
    then
        cat "$REPORT/before.data" > "$APP"
        sync
        if [ "$(hash "$APP")" != "$BEFORE" ]
        then
            fail 'SSH boot-hook rollback failed. Do NOT reboot.'
        fi
    fi
}

ssh_complete() {
    if [ "$ACTION" = install ]
    then
        resources_rw
        if ! printf 'enabled\n' > "$SERVICE/enabled"
        then
            rm -f "$SERVICE/enabled"
            ssh_rollback_hook
            fail 'Cannot enable the SSH service. The new boot hook was reverted.'
        fi
        sync

        # Close both caller streams in the detached supervisor. It handles its
        # own USB runtime logs and does not require WLAN to have an address yet.
        sh "$SERVICE/service.sh" boot "$USB" >/dev/null 2>&1 3>&- 4>&- &
        sleep 2
        if ! sh "$SERVICE/service.sh" status
        then
            rm -f "$SERVICE/enabled"
            sh "$SERVICE/service.sh" stop || fail 'SSH startup and service cleanup failed. Do NOT reboot.'
            ssh_rollback_hook
            fail 'SSH did not start. The new boot hook and runtime changes were reverted.'
        fi
        printf 'SSH: port 22, user cmu, password jci.\n' >&3

    elif [ -d "$SERVICE" ]
    then
        # The generic inverse patch has already removed the startup hook.
        # Stop the owned service before removing only its verified payload.
        resources_rw
        rm -f "$SERVICE/enabled"
        sync
        sh "$SERVICE/service.sh" stop || fail 'Boot hook removed; service cleanup failed. Check the report.'
        for _file in service.sh sshd_config password.hash
        do
            rm -f "$SERVICE/$_file"
        done
        rmdir "$SERVICE" || fail 'SSH stopped; service directory is not empty.'
        printf 'Managed SSH service, password overlay and firewall access removed.\n' >&3
    fi
}

# --- Action preparation and completion -------------------------------------
prepare_action() {
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
        report_message "Requested setting is already present.
Reports: $REPORT"
    else
        report_message "$ACTION completed. Other changes were preserved.
Reports: $REPORT"
    fi
}


# --- Main flow --------------------------------------------------------------
# Keep the sequence visible: inspect first, prepare copies, write, then finish.
main() {
    parse_action "$@"
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

    prepare_action
    if [ "$NO_CHANGE" = 0 ]
    then
        validate_original_backup
    fi

    report_message "$ACTION in progress. Do not remove the USB drive."
    ssh_prepare
    if [ "$NO_CHANGE" = 0 ]
    then
        write_prepared_change
    fi
    ssh_complete

    report_completion
    return 0
}

main "$@"
