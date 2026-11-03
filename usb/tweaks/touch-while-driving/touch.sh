#!/bin/sh
# Private helpers shared by the saved worker and Restore originals hook.
TOUCH_STATE=/tmp/mnt/resources/mzd-tweaks/touch-while-driving
TOUCH_NVRAM=/sys/class/nvram/nv-config
TOUCH_SCRIPTS=/jci/scripts

touch_read() (
    key="$TOUCH_NVRAM/keys/$1"
    [ -d "$TOUCH_NVRAM/keys" ] && [ ! -L "$TOUCH_NVRAM/keys" ] || exit 1
    [ ! -L "$key" ] || exit 1
    # The OEM default is enabled until the setter creates its key.
    if [ ! -e "$key" ]; then printf 'enable\n'; exit 0; fi
    [ -f "$key" ] && [ -r "$key" ] || exit 1
    value=$(cat "$key") || exit 1
    case "$value" in enable|disable) printf '%s\n' "$value" ;; *) exit 1 ;; esac
)

touch_baseline() {
    [ -d "$TOUCH_STATE" ] && [ ! -L "$TOUCH_STATE" ] &&
        [ -f "$TOUCH_STATE/original.txt" ] && [ ! -L "$TOUCH_STATE/original.txt" ] || return 1
    # Reject unknown extras rather than deleting someone else's files.
    for path in "$TOUCH_STATE"/* "$TOUCH_STATE"/.[!.]* "$TOUCH_STATE"/..?*; do
        [ -e "$path" ] || [ -L "$path" ] || continue
        [ "$path" = "$TOUCH_STATE/original.txt" ] || return 1
    done
    awk 'NR==1 {if($0!="mzd-touch-v1") bad=1; next}
        {if($0!="enable" && $0!="disable") bad=1}
        END {exit (bad || NR!=4)}' "$TOUCH_STATE/original.txt" || return 1
    BASE_BUS=$(sed -n '2p' "$TOUCH_STATE/original.txt") || return 1
    BASE_LVDS=$(sed -n '3p' "$TOUCH_STATE/original.txt") || return 1
    DESIRED_BUS=$(sed -n '4p' "$TOUCH_STATE/original.txt") || return 1
}

touch_require() (
    for setter in set_speed_restriction_config.sh set_lvds_speed_restriction_config.sh; do
        path="$TOUCH_SCRIPTS/$setter"
        [ -f "$path" ] && [ ! -L "$path" ] && [ -x "$path" ] || {
            printf 'Missing OEM NVRAM setter: %s\n' "$path" >&2; exit 1;
        }
    done
    # CMU BusyBox printf with a conversion can return 1 when its first output
    # goes to /dev/null. Capture validated values through pipes instead.
    # See development/CMU-BusyBox.md; nesting and AND-lists are not the cause.
    checked_bus=$(touch_read bus_bcm_speed_restriction) && checked_lvds=$(touch_read lvds_speed_restriction) || {
        printf 'Cannot read valid speed restriction settings.\n' >&2; exit 1;
    }
    [ ! -L "$TOUCH_STATE" ] && [ ! -L "$(dirname "$TOUCH_STATE")" ] || {
        printf 'Touch settings backup path is a symbolic link.\n' >&2; exit 1;
    }
    if [ -e "$TOUCH_STATE" ]; then
        touch_baseline || { printf 'Original touch settings backup is invalid; nothing overwritten.\n' >&2; exit 1; }
    fi
)

mzd_check_prerequisites() { touch_require; }
mzd_check_status() (
    if [ "$1" = installed ]; then
        if ! touch_baseline; then
            mzd_status_emit broken 'Touch GUI patch has no valid original settings backup.'; exit 0
        fi
        # Removal restores a verified baseline even after external key changes.
        if [ "${ACTION:-}" != uninstall ] && [ "${MZD_PACKAGE_STATE:-}" != restoring ]; then
            if [ "$(touch_read bus_bcm_speed_restriction)" != "$DESIRED_BUS" ] ||
                [ "$(touch_read lvds_speed_restriction)" != disable ]; then
                mzd_status_emit broken 'Touch NVRAM settings differ from the installed configuration.'; exit 0
            fi
        fi
    fi
    mzd_status_emit "$1"
)

touch_set() (
    case "$1" in
        bus_bcm_speed_restriction) setter=set_speed_restriction_config.sh ;;
        lvds_speed_restriction) setter=set_lvds_speed_restriction_config.sh ;;
        *) exit 1 ;;
    esac
    case "$2" in enable|disable) ;; *) exit 1 ;; esac
    "$TOUCH_SCRIPTS/$setter" "$2" || exit 1
    [ "$(touch_read "$1")" = "$2" ] || exit 1
    printf 'Verified %s=%s\n' "$1" "$2"
)
touch_pair() {
    touch_set bus_bcm_speed_restriction "$1" && touch_set lvds_speed_restriction "$2"
}
touch_remove() {
    touch_baseline || return 1
    rm "$TOUCH_STATE/original.txt" && rmdir "$TOUCH_STATE"
}
touch_cleanup() {
    result=0
    if [ "${TOUCH_ACTIVE:-0}" = 1 ]; then
        # Try both keys even if the first restoration fails.
        touch_set bus_bcm_speed_restriction "$ENTRY_BUS" || result=1
        touch_set lvds_speed_restriction "$ENTRY_LVDS" || result=1
        mzd_patch_rollback "$CONTEXT" || result=1
        if [ "$result" != 0 ]; then
            printf 'Touch rollback failed. Do NOT reboot.\n' >&4
            : > "$MZD_REPORT/critical-error"
        fi
    fi
    mzd_system_cleanup || result=1
    return "$result"
}
