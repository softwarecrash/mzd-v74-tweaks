#!/bin/sh
# Reset hook for this managed payload only. Called by Restore originals.
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
SERVICE=/tmp/mnt/resources/mzd-tweaks/ssh
RAM=/tmp/mzd-aio-ssh
TARGET=/jci/scripts/stage_wifi.sh
fail() { printf 'SSH reset: %s\n' "$*" >&2; exit 1; }
critical() { printf 'SSH reset: %s Do NOT reboot.\n' "$*" >&2; exit 2; }
check() {
    [ ! -L "$SERVICE" ] || fail 'Service directory is a symbolic link.'
    if [ ! -e "$SERVICE" ]; then
        [ ! -e "$RAM" ] || fail 'Runtime exists without its verified service payload.'
        if [ -f "$TARGET" ] && grep -qF '# MZD v74 SSH' "$TARGET"; then
            [ -f "$TARGET.org" ] && [ ! -L "$TARGET.org" ] || fail 'Startup hook has no .org backup.'
        fi
        return 0
    fi
    [ -d "$SERVICE" ] || fail 'Service path is not a directory.'
    # Missing files are repairable; changed or additional files are not deleted.
    for path in "$SERVICE"/* "$SERVICE"/.[!.]* "$SERVICE"/..?*; do
        [ -e "$path" ] || [ -L "$path" ] || continue
        case "${path##*/}" in
            service.sh|sshd_config|password.hash|authorized_keys.conf)
                [ ! -L "$path" ] && cmp -s "$path" "$HERE/assets/${path##*/}" || fail 'Unknown or altered service file; manual review required.' ;;
            settings.conf)
                expected=${MZD_SETTINGS_FILE:-$HERE/assets/settings.conf}
                [ ! -L "$path" ] && cmp -s "$path" "$expected" || fail 'Unknown or altered SSH settings.' ;;
            enabled)
                [ -f "$path" ] && [ ! -L "$path" ] || fail 'Invalid enabled marker.'
                [ "$(cat "$path")" = enabled ] || fail 'Unknown enabled marker.' ;;
            *) fail 'Additional service files found; nothing deleted.' ;;
        esac
    done
    if [ -e "$RAM" ]; then
        [ -f "$SERVICE/service.sh" ] && [ -f "$SERVICE/sshd_config" ] || fail 'Running service cannot be safely stopped with missing payload files.'
    fi
    if [ -f "$TARGET" ] && grep -qF '# MZD v74 SSH' "$TARGET"; then
        [ -f "$TARGET.org" ] && [ ! -L "$TARGET.org" ] || fail 'Startup hook has no .org backup.'
    fi
}
[ "$#" = 1 ] || exit 1
if [ "$1" != check ]; then
    [ "${ACTION:-}" = run ] && [ -n "${MZD_REPORT:-}" ] && [ -d "${MZD_SYSTEM:-}" ] &&
        [ -n "${MZD_RESET_DIR:-}" ] && [ -d "$MZD_RESET_DIR" ] || fail 'Use the Restore originals worker; reset session is missing.'
fi
case "$1" in
    check) check ;;
    prepare)
        check || exit 1
        [ -e "$SERVICE" ] || exit 0
        [ -n "${MZD_RESET_DIR:-}" ] && [ -d "$MZD_RESET_DIR" ] || fail 'Reset archive is missing.'
        cp -R "$SERVICE" "$MZD_RESET_DIR/payload" || fail 'Cannot archive service files.'
        for path in "$SERVICE"/*; do
            [ -f "$path" ] || continue
            cmp -s "$path" "$MZD_RESET_DIR/payload/${path##*/}" || fail 'Service archive verification failed.'
        done
        sync
        . "$ROOT/lib/report.sh" || exit 1
        . "$ROOT/lib/system.sh" || exit 1
        mzd_system_remount_rw /tmp/mnt/resources || exit 1
        rm -f "$SERVICE/enabled" || fail 'Cannot disable SSH.'
        if [ -f "$SERVICE/service.sh" ]; then
            sh "$SERVICE/service.sh" stop || critical 'Service cleanup failed; payload retained.'
        fi
        ;;
    finish)
        check || exit 1
        [ -e "$SERVICE" ] || exit 0
        # Runtime must already have been removed by the prepare phase.
        [ ! -e "$RAM" ] || critical 'SSH runtime still exists; payload retained.'
        rm -f "$SERVICE/enabled" "$SERVICE/service.sh" "$SERVICE/sshd_config" "$SERVICE/password.hash" "$SERVICE/authorized_keys.conf" "$SERVICE/settings.conf" || exit 1
        rmdir "$SERVICE" || fail 'Service directory could not be removed.'
        # Remove the now-empty owned parent, retaining any other tweak folders.
        rmdir "$(dirname "$SERVICE")" 2>/dev/null || :
        if [ -n "${MZD_USB:-}" ] && [ -f "$MZD_USB/mzd-ssh-log-marker.txt" ] &&
            [ ! -L "$MZD_USB/mzd-ssh-log-marker.txt" ] && cmp -s "$MZD_USB/mzd-ssh-log-marker.txt" "$HERE/assets/usb-log-marker.txt"; then
            cp "$MZD_USB/mzd-ssh-log-marker.txt" "$MZD_RESET_DIR/usb-log-marker.txt" &&
                cmp -s "$MZD_USB/mzd-ssh-log-marker.txt" "$MZD_RESET_DIR/usb-log-marker.txt" || fail 'Cannot archive USB log marker.'
            rm -f "$MZD_USB/mzd-ssh-log-marker.txt" || fail 'Cannot remove owned USB log marker.'
        fi
        printf 'Managed SSH payload removed; native OEM SSH is unchanged.\n'
        ;;
    *) fail 'Expected check, prepare or finish.' ;;
esac
