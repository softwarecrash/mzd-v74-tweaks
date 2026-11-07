#!/bin/sh
if [ "${1:-}" = uninstall ] && [ "${2:-}" = --preserve-config ];then . "$(dirname "$(readlink -f "$0")")/../../lib/config-args.sh" || exit 1;fi
# SSH Access for Mazda firmware 74.00.324.
# Launcher worker; shared runtime helpers are in ../../lib/.
#
# Reading guide:
#   1. Validate the requested action without changing the system.
#   2. Define local reporting, system-state and patch helpers.
#   3. Load this tweak's configuration from manifest.conf.
#   4. Run the installation flow at the end of the file.
# The manifest describes the tweak for discovery; this script executes it.
set -u

# Help and invalid actions return before reports, mounts or system changes.
mzd_worker_usage() {
    echo 'Usage: sh run.sh <install|uninstall|status|preflight>'
    echo 'No arguments or --help: show usage without changing anything.'
}

if [ "$#" -gt 1 ]
then
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
    install|uninstall|status|preflight)
        ;;
    *)
        echo 'Unknown action. Use install, uninstall, status or preflight.' >&2
        exit 1
        ;;
esac

# Run directly from the ready-to-use repository; no build step is needed.
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")

# Load the shared runtime from the ready-to-run USB layout.
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
# Public actions go through persistent package management. The controller
# sets MZD_WORKER_DIRECT only for its saved worker and deep inspection calls.
if [ "${MZD_WORKER_DIRECT:-}" != 1 ] && [ "$ACTION" != preflight ]; then
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

# Metadata and execution settings have one source of truth.
mzd_manifest_load "$HERE/manifest.conf" || exit 1
if [ "$ACTION" = preflight ]; then
    ssh_auth_reason=$(sh "$HERE/assets/service.sh" check-auth 2>&1); ssh_auth_code=$?
    if [ "$ssh_auth_code" != 0 ]; then
        printf '%s\n' "$ssh_auth_reason" >&2
        printf 'block\t%s\n' "$(printf '%s' "$ssh_auth_reason" | tr '\r\n\t' '   ')"
        exit 1
    fi
    printf 'info\tSSH authentication settings are valid.\n'
    exit 0
fi
PATCH_FILE="$HERE/assets/change.patch"

# --- SSH payload preparation ------------------------------------------------
# SSH owns a resources directory in addition to its patched startup hook.
# Keep service provisioning separate from the generic file-patching workflow.
SERVICE=/tmp/mnt/resources/mzd-tweaks/ssh
PAYLOAD="$HERE/assets"
PATCH_MODE=additive

resources_rw() {
    mzd_system_remount_rw /tmp/mnt/resources || exit 1
}

# The additive hook must occur exactly once, as an adjacent marker/command pair.
# Some patch versions otherwise accept inserting the same block a second time.
ssh_hook_ok() {
    awk -v command='sh /tmp/mnt/resources/mzd-tweaks/ssh/service.sh boot >/dev/null 2>&1 &' '
      $0 == "# MZD v74 SSH" {markers++; adjacent=1; next}
      $0 == command {commands++; if (adjacent) pairs++}
      {adjacent=0}
      END {exit !(markers==1 && commands==1 && pairs==1)}
    ' "$APP"
}

# Build the same two-line hook diff at its actual position. Blank lines are not
# ownership markers; status and uninstall must recognize the identical hook.
mzd_worker_patch() {
    awk '/^--- / {old++; if ($0!="--- target.data") bad=1} /^\+\+\+ / {new++; if ($0!="+++ target.data") bad=1} END {exit (bad || old!=1 || new!=1)}' "$HERE/assets/change.patch" || mzd_fail 'Invalid SSH patch target.'
    hook_dir="$MZD_REPORT/ssh-hook"
    mkdir "$hook_dir" || mzd_fail 'Cannot prepare SSH hook inspection.'
    if ssh_hook_ok; then
        cp "$APP" "$hook_dir/on" || exit 1
        awk '$0=="# MZD v74 SSH" {getline; next} {print}' "$APP" > "$hook_dir/off" || exit 1
    else
        cp "$APP" "$hook_dir/off" || exit 1
        awk 'NR==1 {print; print "# MZD v74 SSH"; print "sh /tmp/mnt/resources/mzd-tweaks/ssh/service.sh boot >/dev/null 2>&1 &"; next} {print}' "$APP" > "$hook_dir/on" || exit 1
    fi
    diff -u "$hook_dir/off" "$hook_dir/on" > "$hook_dir/raw.patch"
    diff_code=$?
    [ "$diff_code" = 1 ] || mzd_fail 'Cannot create the scoped SSH hook diff.'
    awk 'NR==1 {$0="--- target.data"} NR==2 {$0="+++ target.data"} {print}' "$hook_dir/raw.patch" > "$hook_dir/change.patch" || exit 1
    PATCH_FILE="$hook_dir/change.patch"
}

# Recognize only the exact shared GUI block. The generic helper then requires
# the remaining bytes to match the manifest OEM checksum before accepting them.
mzd_worker_original() (
    source=$1; output=$2
    marker='# MZD shared GUI services'
    command='sh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &'
    awk -v marker="$marker" -v command="$command" '
      $0==marker {
        markers++
        if(getline<=0 || $0!=command)bad=1
        else pairs++
        next
      }
      $0==command {bad=1}
      {print}
      END {exit(bad || markers!=1 || pairs!=1)}' "$source" > "$output" || exit 1
    # awk prints a final newline; do not silently normalize an altered input.
    before_size=$(wc -c < "$source") || exit 1
    after_size=$(wc -c < "$output") || exit 1
    block_size=$(printf '%s\n%s\n' "$marker" "$command" | wc -c) || exit 1
    [ "$((before_size-after_size))" -eq "$block_size" ]
)

# Never replace an unknown service payload, even if the boot hook looks known.
ssh_payload_source() {
    case "$1" in
        settings.conf) printf '%s\n' "${MZD_SETTINGS_FILE:-$PAYLOAD/settings.conf}" ;;
        *) printf '%s\n' "$PAYLOAD/$1" ;;
    esac
}

ssh_payload_ok() {
    if [ ! -d "$SERVICE" ] || [ -L "$SERVICE" ]
    then
        return 1
    fi
    for _file in service.sh sshd_config password.hash authorized_keys.conf settings.conf
    do
        _source=$(ssh_payload_source "$_file") || return 1
        if [ -L "$SERVICE/$_file" ] || ! cmp -s "$_source" "$SERVICE/$_file"
        then
            return 1
        fi
    done
}

# The supervisor's check action only reads prerequisites/configuration/ports.
# Use its deployed path when present so it recognizes its own running listener.
mzd_check_prerequisites() {
    check_dir=$PAYLOAD
    [ ! -d "$SERVICE" ] || check_dir=$SERVICE
    sh "$check_dir/service.sh" check
}

# Worker-specific persistent-state checks; shared status code knows no tweak IDs.
mzd_status_assets() {
    mzd_require_assets "$PAYLOAD/service.sh" "$PAYLOAD/sshd_config" \
        "$PAYLOAD/password.hash" "$PAYLOAD/usb-log-marker.txt" "$PAYLOAD/authorized_keys.conf" "$PAYLOAD/settings.conf"
}

mzd_status_target_missing() {
    if [ -e "$SERVICE/enabled" ] || [ -L "$SERVICE/enabled" ]; then
        mzd_status_emit broken 'SSH is enabled but its startup target is missing or invalid.'
    else
        mzd_status_emit unavailable 'The supported startup target is missing or invalid.'
    fi
}

mzd_check_status() {
    if [ "$1" = uninstalled ] && { grep -qF '# MZD v74 SSH' "$APP" || grep -qF '/mzd-tweaks/ssh/service.sh' "$APP"; }; then
        mzd_status_emit broken 'The SSH startup hook is duplicated or incomplete.'
    elif [ "$1" = uninstalled ] && ! awk 'NR==1 {valid=($0=="#!/bin/sh")} END {exit !valid}' "$APP"; then
        # The insertion-only patch has little context. Some host patch tools
        # otherwise accept unrelated text after dropping all context as fuzz.
        mzd_status_emit unavailable 'The startup target is not a supported shell script.'
    elif [ "$1" = installed ]; then
        if ! ssh_hook_ok; then
            mzd_status_emit broken 'The SSH startup hook is duplicated or incomplete.'
        elif ! ssh_payload_ok; then
            mzd_status_emit broken 'SSH hook is present but its service files are missing or changed.'
        elif [ ! -f "$SERVICE/enabled" ] || [ -L "$SERVICE/enabled" ] || ! mzd_line_is enabled "$SERVICE/enabled"; then
            mzd_status_emit broken 'SSH hook is present but its enabled marker is missing or invalid.'
        else
            mzd_status_emit installed
        fi
    elif [ -e "$SERVICE/enabled" ] || [ -L "$SERVICE/enabled" ]; then
        mzd_status_emit broken 'SSH payload is enabled but its startup hook is missing or incompatible.'
    else
        mzd_status_emit "$1"
    fi
}

ssh_prepare() {
    for _file in service.sh sshd_config password.hash usb-log-marker.txt authorized_keys.conf settings.conf
    do
        mzd_asset_readable "$PAYLOAD/$_file" || mzd_fail 'SSH asset is missing or unreadable.'
    done

    if [ -e "$SERVICE" ]
    then
        ssh_payload_ok || mzd_fail 'Existing SSH service files differ. Nothing overwritten.'
    elif [ "$STATE" = installed ]
    then
        mzd_fail 'The SSH boot hook is installed but the service payload is missing.'
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
    sh "$_check/service.sh" check || mzd_fail 'SSH prerequisites failed; an unrelated port 22 listener is never replaced.'

    if [ ! -e "$SERVICE" ]
    then
        resources_rw
        mkdir -p "$(dirname "$SERVICE")" || mzd_fail 'Cannot create SSH parent directory.'
        _stage="$SERVICE.new-$$"
        mkdir "$_stage" || mzd_fail 'Cannot prepare SSH service directory.'

        # Publish a directory only after all payload files and saved settings are verified.
        for _file in service.sh sshd_config password.hash authorized_keys.conf settings.conf
        do
            _source=$(ssh_payload_source "$_file") || exit 1
            if ! cp "$_source" "$_stage/$_file" || ! cmp -s "$_source" "$_stage/$_file"
            then
                rm -f "$_stage/service.sh" "$_stage/sshd_config" "$_stage/password.hash" "$_stage/authorized_keys.conf" "$_stage/settings.conf"
                rmdir "$_stage"
                mzd_fail 'Cannot copy and verify SSH service payload.'
            fi
        done
        if ! chmod 700 "$_stage/service.sh" ||
            ! chmod 600 "$_stage/sshd_config" "$_stage/password.hash" "$_stage/authorized_keys.conf" "$_stage/settings.conf"
        then
            mzd_fail 'Cannot set SSH payload permissions.'
        fi
        sync
        mv "$_stage" "$SERVICE" || mzd_fail 'Cannot publish SSH service directory.'
    fi

    cp "$PAYLOAD/usb-log-marker.txt" "$USB/mzd-ssh-log-marker.txt" || mzd_fail 'Cannot save USB runtime-log marker.'
}


# --- SSH activation, selective removal and startup rollback ------------------
ssh_rollback_hook() {
    if [ "$NO_CHANGE" = 0 ]
    then
        mzd_patch_rollback "$CONTEXT" || exit $?
    fi
}

ssh_wait_ready() {
    ssh_start_pid=$1
    ssh_wait_start=$(cut -d. -f1 /proc/uptime) || return 1
    while :; do
        if ssh_start_status=$(sh "$SERVICE/service.sh" status 2>&1); then
            printf '%s\n' "$ssh_start_status" >&3
            return 0
        fi
        # A dead startup process cannot become ready; keep its diagnostics.
        kill -0 "$ssh_start_pid" 2>/dev/null || return 1
        ssh_wait_now=$(cut -d. -f1 /proc/uptime) || return 1
        [ "$((ssh_wait_now-ssh_wait_start))" -lt 15 ] || return 1
        sleep 1
    done
}

ssh_complete() {
    if [ "$ACTION" = install ]
    then
        resources_rw
        if ! printf 'enabled\n' > "$SERVICE/enabled"
        then
            rm -f "$SERVICE/enabled"
            ssh_rollback_hook || exit $?
            mzd_fail 'Cannot enable the SSH service. The new boot hook was reverted.'
        fi
        sync

        # Detach caller pipes, retaining a startup log until the supervisor is ready.
        # Runtime logging is separate; WLAN need not have an address yet.
        sh "$SERVICE/service.sh" boot "$USB" > "$MZD_REPORT/ssh-start.log" 2>&1 3>&- 4>&- &
        if ! ssh_wait_ready "$!"
        then
            printf 'SSH startup readiness check failed (maximum 15 seconds). Startup diagnostics:\n' >&4
            cat "$MZD_REPORT/ssh-start.log" >&4
            rm -f "$SERVICE/enabled"
            sh "$SERVICE/service.sh" stop || mzd_fatal 'SSH startup and service cleanup failed. Do NOT reboot.'
            ssh_rollback_hook || exit $?
            mzd_fail 'SSH did not start. The new boot hook and runtime changes were reverted.'
        fi
        if grep -q '^ssh_password=enabled$' "$SERVICE/settings.conf"; then
            printf 'SSH: port 22, user cmu, password jci.\n' >&3
        else
            printf 'SSH: port 22, user cmu, public-key login; password login disabled.\n' >&3
        fi

    elif [ -d "$SERVICE" ]
    then
        # The generic inverse patch has already removed the startup hook.
        # Stop the owned service before removing only its verified payload.
        resources_rw
        rm -f "$SERVICE/enabled"
        sync
        sh "$SERVICE/service.sh" stop || mzd_fatal 'Boot hook removed; service cleanup failed. Do NOT reboot.'
        for _file in service.sh sshd_config password.hash authorized_keys.conf settings.conf
        do
            rm -f "$SERVICE/$_file"
        done
        rmdir "$SERVICE" || mzd_fail 'SSH stopped; service directory is not empty.'
        printf 'Managed SSH service, password overlay and firewall access removed.\n' >&3
    fi
}

# Declared dependencies/conflicts are enforced for direct CLI calls as well.
if [ "$ACTION" = status ]; then
    mzd_read_status
    exit $?
fi
# Recheck immediately before opening a modifying session.
mzd_action_preflight || exit 1

# --- Execution flow -------------------------------------------------------
# Open USB reports and register cleanup before acquiring a lock. Cleanup restores
# only the mount/watchdog state changed by this invocation, including on failure.
mzd_begin "$SELF" "$ID" mzd_system_cleanup
mzd_system_begin
mzd_require_tools awk md5sum cp cmp || exit 1
mzd_require_assets "$SELF" "$HERE/manifest.conf" || exit 1
mzd_validate_firmware "$FIRMWARE" || exit 1
mzd_system_lock "$LOCK" || exit 1

# Probe both patch directions on USB copies before making the target writable.
# Keep a complete pre-change copy so rollback preserves other installed tweaks.
mzd_worker_patch || exit 1
CONTEXT="$MZD_REPORT/target"
mzd_patch_prepare "$APP" "$PATCH_FILE" "$ORIGINAL" "$CONTEXT" additive || exit 1
STATE=$(mzd_patch_state "$CONTEXT") || exit 1


# Repeated install/uninstall is a successful no-op for the patch itself.
NO_CHANGE=0
case "$ACTION:$STATE" in
    install:installed|uninstall:uninstalled) NO_CHANGE=1 ;;
esac
if [ "$NO_CHANGE" = 0 ]
then
    mzd_patch_validate_backup "$CONTEXT" || exit 1
fi

# Prepare/validate the SSH payload before changing the boot hook. Activate the
# service afterwards; activation failure rolls the newly added hook back.
USB=$MZD_USB
REPORT=$MZD_REPORT
mzd_report_start
ssh_prepare || exit $?
if [ "$NO_CHANGE" = 0 ]
then
    mzd_system_watchdog_disable || exit 1
    mzd_system_remount_rw / || exit 1
    mzd_patch_apply "$CONTEXT" "$ACTION" || exit $?
fi
ssh_complete || exit $?

# Report completion; the launcher owns dialogs and any reboot decision.
if [ "$NO_CHANGE" = 1 ]
then
    MZD_SUCCESS="Requested setting is already present.
Reports: $MZD_REPORT"
else
    MZD_SUCCESS="$MZD_ACTION_LABEL completed. Other changes were preserved.
Reports: $MZD_REPORT"
fi
