#!/bin/sh
# Read-only vehicle facts. A tweak, not this library, decides compatibility.
# No dialogs, mounts, persistent caches or writes. A bounded query may fail.
mzd_vehicle_control() (
    case "${1:-}" in ''|*[!0-9]*) return 1 ;; esac
    [ "$1" -le 254 ] || exit 1
    command -v dbus-send >/dev/null 2>&1 || exit 1
    for bus in unix:path=/tmp/dbus_service_socket unix:path=/tmp/dbus_hmi_socket; do
        reply=$(dbus-send --address="$bus" --print-reply --reply-timeout=1000 \
            --dest=com.jci.vbs.settings /com/jci/vbs/settings \
            com.jci.vbs.settings.GetCMUControlReq "byte:$1" uint32:0 2>/dev/null) || continue
        value=$(printf '%s\n' "$reply" | awk '$1=="byte" && $2~/^[0-9]+$/ {print $2;exit}')
        case "$value" in ''|*[!0-9]*) continue ;; esac
        [ "$value" -le 254 ] || continue
        printf '%s\n' "$value"; exit 0
    done
    exit 1
)
mzd_vehicle_hud() (
    equip=$(mzd_vehicle_control 13) || { printf 'unknown\n'; exit 0; }
    case "$equip" in
        0) printf 'none\n' ;;
        1)
            type=$(mzd_vehicle_control 26) || { printf 'unknown\n'; exit 0; }
            case "$type" in
                0) printf 'CHUD_mono\n' ;; 1) printf 'CHUD_color\n' ;;
                2) printf 'WHUD_color\n' ;; *) printf 'unknown\n' ;;
            esac ;;
        *) printf 'unknown\n' ;;
    esac
)
mzd_vehicle_wcp_hardware() (
    tp1056=/sys/class/gpio/DI_TP1056/value
    tp1029=/sys/class/gpio/DI_TP1029/value
    [ -e "$tp1056" ] && [ -e "$tp1029" ] || { printf 'unknown\n'; exit 0; }
    v1=""
    v2=""
    for _ in 0 1 2; do
        v1=$(cat "$tp1056" 2>/dev/null || :)
        v2=$(cat "$tp1029" 2>/dev/null || :)
        if { [ "$v1" = "0" ] || [ "$v1" = "1" ]; } && { [ "$v2" = "0" ] || [ "$v2" = "1" ]; }; then
            break
        fi
        sleep 1
    done
    if [ "$v1" = "1" ] || [ "$v2" = "1" ]; then
        printf 'native_wcp\n'
    elif [ "$v1" = "0" ] && [ "$v2" = "0" ]; then
        printf 'legacy\n'
    else
        printf 'unknown\n'
    fi
)
