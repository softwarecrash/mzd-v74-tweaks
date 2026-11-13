#!/bin/sh
# No killall, no wlan0 changes and no native AA/Bluetooth service restart.
mzd_aaw_stop_runtime() (
    mode=$(lua "$HERE/assets/service/lifecycle-cli.lua" stop "$PAYLOAD_DIR") || exit 1
    case "$mode" in inactive) exit 0;;owned) ;;*) exit 1;;esac
    state=/tmp/mzd-aaw-runtime
    if [ -f "$state/firewall-added" ]; then
        if iptables -C INPUT -i wlan1 -j ACCEPT 2>/dev/null; then
            iptables -D INPUT -i wlan1 -j ACCEPT || exit 1
        fi
        rm -f "$state/firewall-added" || exit 1
    fi
    if [ -d /sys/class/net/wlan1 ]; then
        ifconfig wlan1 down || exit 1
        iw dev wlan1 set type managed || exit 1
    fi
    rm -f /tmp/aa-hostapd-wlan1.conf /tmp/aa-hostapd-wlan1.conf.tmp /tmp/aa-udhcpd.conf /tmp/aa-udhcpd.leases /tmp/aaw_listend.log /tmp/mzd-aaw-boot.log /tmp/mzd-aaw-dongle-reset.log || exit 1
    # Keep only RAM ownership/disabled markers until reboot to prevent recovery restart.
)
