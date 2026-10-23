#!/bin/sh
# Shared tweak library: patch. Sourcing defines functions only.
# API 1; context and lifecycle are documented in docs/tweaks/LIBRARIES.md.

mzd_patch_api() {
    printf '%s\n' '1'
}


# Lock the shared target and save the entire previous file on USB.
mzd_save_previous_file() {
    # All tweaks sharing this target use the same atomic mkdir lock.
    mkdir "$LOCK" || mzd_fail 'Another tweak for this file is running. Restart the CMU if a previous run was interrupted.'
    LOCKED=1

    cp "$APP" "$REPORT/before.data" || mzd_fail 'Cannot save the USB rollback copy.'
    BEFORE=$(mzd_hash "$APP")
    if [ "$(mzd_hash "$REPORT/before.data")" != "$BEFORE" ]
    then
        mzd_fail 'USB rollback copy mismatch.'
    fi
}


# Apply one direction on a probe copy, never directly to the system file.
mzd_patch_copy() {
    if [ "$1" = install ]
    then
        patch -N -p0 -i "$PATCH_FILE" < /dev/null
    else
        patch -N -R -p0 -i "$PATCH_FILE" < /dev/null
    fi
}


# BusyBox has no dry-run: require a changed copy and byte-exact inverse.
mzd_probe() {
    _direction=$1
    _dir="$REPORT/$_direction"
    mkdir -p "$_dir/inverse" || return 1
    cp "$REPORT/before.data" "$_dir/target.data" || return 1
    (cd "$_dir" && mzd_patch_copy "$_direction") > "$_dir/patch.log" 2>&1 || return 1

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

    (cd "$_dir/inverse" && mzd_patch_copy "$_inverse") > "$_dir/inverse.log" 2>&1 || return 1
    cmp -s "$REPORT/before.data" "$_dir/inverse/target.data"
}


# Exactly one valid patch direction determines the installed state.
mzd_detect_state() {
    FORWARD=0
    REVERSE=0
    if mzd_probe install
    then
        FORWARD=1
    fi
    if mzd_probe uninstall
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
            mzd_fail 'Patch state is unknown, partial or ambiguous. No system file changed.'
            ;;
    esac
    echo "state=$STATE"
}


# Retain the known OEM backup; never replace it with a modified file.
mzd_validate_original_backup() {
    BACKUP="${APP}.org"
    if [ -e "$BACKUP" ] || [ -L "$BACKUP" ]
    then
        if [ ! -f "$BACKUP" ] || [ -L "$BACKUP" ] ||
            [ "$(mzd_hash "$BACKUP")" != "$ORIGINAL" ]
        then
            mzd_fail 'The .org backup is not the known OEM original.'
        fi
    elif [ "$BEFORE" != "$ORIGINAL" ]
    then
        mzd_fail 'The shared OEM .org backup is missing. Nothing changed.'
    fi
}


# Verify the prepared write, retry once, then restore the previous file.
mzd_write_prepared_change() {
    DESIRED_FILE="$REPORT/$ACTION/target.data"
    DESIRED=$(mzd_hash "$DESIRED_FILE")
    diff -U 3 "$REPORT/before.data" "$DESIRED_FILE" > "$REPORT/changes.diff"
    if [ "$?" != 1 ]
    then
        mzd_fail 'Cannot record the prepared change.'
    fi

    mzd_make_rw

    # The first tweak creates the shared OEM backup; later tweaks retain it.
    if [ ! -e "$BACKUP" ]
    then
        cp -a "$APP" "$BACKUP" && sync
        if [ "$(mzd_hash "$BACKUP")" != "$ORIGINAL" ]
        then
            rm -f "$BACKUP"
            mzd_fail 'Original backup failed.'
        fi
    fi
    if [ "$(mzd_hash "$APP")" != "$BEFORE" ]
    then
        mzd_fail 'Target changed while preparing the tweak.'
    fi

    # Preserve the target's existing permissions; retry once on a bad write.
    cat "$DESIRED_FILE" > "$APP"
    sync
    if [ "$(mzd_hash "$APP")" != "$DESIRED" ]
    then
        cat "$DESIRED_FILE" > "$APP"
        sync
    fi

    # Rollback uses the complete previous file, including other active tweaks.
    if [ "$(mzd_hash "$APP")" != "$DESIRED" ]
    then
        cat "$REPORT/before.data" > "$APP"
        sync
        if [ "$(mzd_hash "$APP")" != "$BEFORE" ]
        then
            mzd_fail 'Write AND rollback failed. Do NOT reboot the CMU.'
        fi
        mzd_fail 'Write failed; the complete previous file was restored.'
    fi
}


# Repeated install/uninstall requests leave the requested state intact.
mzd_prepare_action() {
    # Repeated calls leave the already requested state intact.
    NO_CHANGE=0
    case "$ACTION:$STATE" in
        install:installed|uninstall:uninstalled)
            NO_CHANGE=1
            ;;
    esac
}


# Print the result without a dialog or automatic reboot.
mzd_report_completion() {
    if [ "$NO_CHANGE" = 1 ]
    then
        mzd_report_message "Requested setting is already present.
Reports: $REPORT"
    else
        mzd_report_message "$ACTION completed. Other changes were preserved.
Reports: $REPORT"
    fi
}


# Shared orchestration; the worker provides the two tweak-specific hooks.
mzd_patch_run() {
    mzd_begin

    mzd_validate_package
    mzd_validate_firmware
    mzd_save_previous_file
    mzd_detect_state

    if [ "$ACTION" = status ]
    then
        printf '%s\n' "$STATE" >&3
        return 0
    fi

    mzd_prepare_action
    if [ "$NO_CHANGE" = 0 ]
    then
        mzd_validate_original_backup
    fi

    mzd_report_message "$ACTION in progress. Do not remove the USB drive."
    mzd_tweak_prepare
    if [ "$NO_CHANGE" = 0 ]
    then
        mzd_write_prepared_change
    fi
    mzd_tweak_complete

    mzd_report_completion
    return 0
}
