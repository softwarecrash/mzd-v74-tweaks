#!/bin/sh
# Read-only preflight for the pinned payload; never invokes the upstream installer.
mzd_aaw_preflight() (
    NET=/sys/class/net/wlan1
    reason() { printf 'block\t%s\n' "$1"; }
    for tool in lua iw ifconfig hostapd udhcpd iptables timeout; do
        command -v "$tool" >/dev/null 2>&1 || { reason "Required tool missing: $tool"; exit 0; }
    done
    scratch=$(mktemp -d /tmp/mzd-aaw-preflight.XXXXXX) || exit 1
    trap 'rm -rf "$scratch"' 0
    . "$ROOT/lib/config-data.sh" || exit 1
    configs=$(mzd_config_records "$HERE") || exit 1
    config=$(printf '%s\n' "$configs" | awk -F "$(printf '\t')" '$1=="libpatch"{print $3}')
    if [ -e "$config" ] || [ -L "$config" ]; then
        [ -f "$config" ] && [ ! -L "$config" ] || { reason 'Wireless config is missing or linked.'; exit 0; }
    else config=$HERE/assets/libpatch.conf; fi
    if ! lua "$HERE/assets/service/config-cli.lua" "$config" > "$scratch/config" 2>/dev/null; then
        reason 'Invalid wireless config. Check SSID, WPA2 password, channel and fixed internal values.'; exit 0
    fi
    enabled=$(awk -F "$(printf '\t')" '$1=="wireless"{print $2}' "$scratch/config")
    channel=$(awk -F "$(printf '\t')" '$1=="channel"{print $2}' "$scratch/config")
    mzd_components records > "$scratch/components" || exit 1
    tab=$(printf '\t')
    while IFS="$tab" read -r kind target source service original; do
        case "$kind" in
            check)
                [ -f "$target" ] && [ ! -L "$target" ] && [ "$(mzd_hash "$target")" = "$original" ] || {
                    reason "Unsupported native module: $target"; exit 0;
                } ;;
            patch)
                case "$source" in
                    */sm.conf.patch|*/sm_WCP.conf.patch)
                        [ -f "$target" ] && [ ! -L "$target" ] || { reason 'Required service configuration is missing or linked.'; exit 0; }
                        if [ -n "$REQUIRES" ] && ! grep -q 'name="load_wlan1"' "$target"; then
                            reason 'Install the TP-Link driver first; its load_wlan1 service is missing.'; exit 0
                        fi
                        if ! awk -v own="$PAYLOAD_DIR/" '
                            index($0,"libpatch-") {
                                n=split($0,words,/[" :<>\t=]+/)
                                for(i=1;i<=n;i++){sub(/^\/data_persist\//,"/tmp/mnt/data_persist/",words[i]);if(words[i]~/libpatch-(blmjciaapa|aap_service|svcjcinavi)\.so$/ && index(words[i],own)!=1)bad=1}
                            }
                            END{exit bad}
                        ' "$target"; then
                            reason 'Another AA Mod shim is referenced. Uninstall it with its original installer first.'; exit 0
                        fi
                        ;;
                esac ;;
        esac
    done < "$scratch/components"
    if [ "$enabled" != true ]; then
        printf 'info\tWireless is disabled in libpatch.conf. Configure SSID and WPA2 password before enabling it.\n'
        exit 0
    fi
    if [ ! -d "$NET" ]; then
        reason 'wlan1 is absent. Connect the supported adapter and restart after driver installation.'; exit 0
    fi
    driver=$(readlink -f "$NET/device/driver") || { reason 'Cannot identify the wlan1 driver.'; exit 0; }
    [ "${driver##*/}" = rtl8812au ] || { reason 'wlan1 is not using the supported RTL8811AU driver.'; exit 0; }
    [ -e "$NET/phy80211" ] || { reason 'Cannot identify the wlan1 radio.'; exit 0; }
    phy=$(readlink -f "$NET/phy80211") || { reason 'Cannot identify the wlan1 radio.'; exit 0; }
    phy=${phy##*/}
    case "$phy" in phy[0-9]*) ;;*) reason 'Invalid wlan1 radio identity.'; exit 0;;esac
    if ! timeout -t 5 iw phy "$phy" info > "$scratch/radio" 2>/dev/null; then
        reason 'Cannot read wlan1 AP capabilities.'; exit 0
    fi
    if ! awk '/^[[:space:]]*\*[[:space:]]+AP[[:space:]]*$/ {ok=1} END{exit !ok}' "$scratch/radio"; then
        reason 'The wlan1 adapter does not advertise AP mode.'; exit 0
    fi
    if ! awk -v channel="$channel" 'index($0,"[" channel "]") && /5[0-9][0-9][0-9] MHz/ && $0!~/disabled|no IR|passive|radar/ {ok=1} END{exit !ok}' "$scratch/radio"; then
        reason 'The selected 5 GHz AP channel is unavailable on wlan1.'; exit 0
    fi
    printf 'info\tSupported wlan1 adapter, AP mode and selected 5 GHz channel detected.\n'
)
