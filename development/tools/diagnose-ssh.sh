#!/bin/sh
# Standalone CMU diagnosis. Never execute installed scripts or alter system state.
# The only output on storage is a new report directory beside this script.
set -u
umask 077
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
TAB=$(printf '\t')

section() { printf '\n=== %s ===\n' "$*"; }
finding() { printf '[FINDING] %s\n' "$*"; }
run() {
    printf '\n$'; printf ' %s' "$@"; printf '\n'
    "$@"
    code=$?
    [ "$code" = 0 ] || printf '[CHECK EXIT %s]\n' "$code"
    return 0
}
metadata() {
    for file do
        if [ -e "$file" ] || [ -L "$file" ]; then ls -ld "$file"; else printf 'Missing: %s\n' "$file"; fi
    done
}
config_check() {
    file=$1
    [ -f "$file" ] && [ ! -L "$file" ] || return 0
    printf '\nConfiguration: %s\n' "$file"
    awk '$1 ~ /^(Port|ListenAddress|AddressFamily|HostKey|PidFile|AllowUsers|UsePAM|UsePrivilegeSeparation|PasswordAuthentication|PubkeyAuthentication)$/ {print NR ": " $0}' "$file"
    sshd_tool=$(command -v sshd 2>/dev/null) || sshd_tool=''
    if [ -n "$sshd_tool" ]; then run "$sshd_tool" -t -f "$file"; else finding 'sshd is not in PATH.'; fi
}
inventory() (
    package=$1; count=0; missing=0; changed=0
    [ -f "$package/package.files" ] && [ ! -L "$package/package.files" ] || { finding 'No readable saved package inventory.'; exit 0; }
    while IFS="$TAB" read -r expected file; do
        count=$((count+1))
        [ "$count" -le 1024 ] || { finding 'Inventory limit reached.'; break; }
        case "$expected" in ''|*[!0-9a-f]*) finding 'Invalid inventory hash.'; continue ;; esac
        [ "${#expected}" = 32 ] || { finding 'Invalid inventory hash length.'; continue; }
        case "$file" in package/*) ;; *) finding 'Invalid inventory path.'; continue ;; esac
        case "/$file/" in *'/../'*|*'/./'*) finding 'Unsafe inventory path skipped.'; continue ;; esac
        if [ ! -f "$package/$file" ] || [ -L "$package/$file" ]; then
            finding "Saved file missing or invalid: $file"; missing=$((missing+1)); continue
        fi
        actual=$(md5sum "$package/$file") || { finding "Cannot hash: $file"; continue; }
        if [ "${actual%% *}" != "$expected" ]; then finding "Saved file MD5 mismatch: $file"; changed=$((changed+1)); fi
    done < "$package/package.files"
    printf 'Inventory: checked=%s missing=%s changed=%s\n' "$count" "$missing" "$changed"
)
collect() {
    section 'SSH diagnostic v1 - read-only system inspection'
    printf 'No services started/stopped; no remount, cleanup or installation.\n'
    printf 'Private keys and password/hash file contents are not collected.\n'
    run id
    run date
    run date -u '+%Y-%m-%d %H:%M:%S UTC'
    run date '+%Y%m%d-%H%M%S'
    run cat /proc/uptime
    [ ! -r /jci/version.ini ] || run cat /jci/version.ini
    section 'Relevant mounts, account link and host-key metadata'
    run awk '$2=="/" || $2=="/config-mfg/passwd" || $2 ~ /resources|data_persist|\/sd[a-d]1$/ {print}' /proc/mounts
    run readlink /etc/passwd
    metadata /etc/ssh/ssh_host_rsa_key
    if [ -r /config-mfg/passwd ]; then
        awk -F: '$1=="cmu" {printf "cmu account: uid=%s gid=%s home=%s shell=%s password_field=%s\n",$3,$4,$6,$7,($2==""?"empty":"set (redacted)")}' /config-mfg/passwd
    fi
    section 'SSH startup hook and original backup'
    metadata /jci/scripts/stage_wifi.sh /jci/scripts/stage_wifi.sh.org
    if [ -r /jci/scripts/stage_wifi.sh ]; then
        run md5sum /jci/scripts/stage_wifi.sh
        run awk '/MZD.*SSH|mzd.*ssh|sshd|dropbear|start-ssh/ {print NR ": " $0}' /jci/scripts/stage_wifi.sh
    fi
    [ ! -r /jci/scripts/stage_wifi.sh.org ] || run md5sum /jci/scripts/stage_wifi.sh.org
    found=0
    for namespace in mzd-v74-tweaks mzd-tweaks; do
        saved="/tmp/mnt/data_persist/$namespace/installed/ssh"
        payload="/tmp/mnt/resources/$namespace/ssh"
        section "$namespace - saved installation and deployed payload"
        metadata "$saved" "$payload"
        for leftover in "${payload}.new-"* "${saved%/ssh}/.stage-ssh-"*; do
            if [ -e "$leftover" ] || [ -L "$leftover" ]; then
                finding "Unpublished staging path remains: $leftover"; ls -ld "$leftover"
            fi
        done
        if [ -d "$saved" ] && [ ! -L "$saved" ]; then
            found=$((found+1))
            for file in state.conf failure.log; do
                if [ -f "$saved/$file" ] && [ ! -L "$saved/$file" ]; then
                    printf '\n%s/%s:\n' "$saved" "$file"
                    awk 'BEGIN {left=12288} left>0 {s=substr($0,1,left-1); print s; left-=length(s)+1}' "$saved/$file"
                fi
            done
            [ ! -r "$saved/paths.tsv" ] || run awk 'NR<=64 {print}' "$saved/paths.tsv"
            manifest="$saved/package/tweaks/ssh/manifest.conf"
            [ ! -r "$manifest" ] || run awk '/^(id|version|type|target|actions)=/ {print}' "$manifest"
            inventory "$saved"
            for file in service.sh sshd_config password.hash; do
                if [ -f "$payload/$file" ] && [ -f "$saved/package/tweaks/ssh/assets/$file" ]; then
                    if cmp -s "$payload/$file" "$saved/package/tweaks/ssh/assets/$file"; then
                        printf 'Payload matches saved asset: %s\n' "$file"
                    else finding "Payload differs from saved asset: $payload/$file"; fi
                fi
            done
            config_check "$saved/package/tweaks/ssh/assets/sshd_config"
        fi
        if [ -d "$payload" ] && [ ! -L "$payload" ]; then
            run ls -la "$payload"
            metadata "$payload/enabled" "$payload/service.sh" "$payload/sshd_config" "$payload/password.hash"
            [ -d "$saved" ] || finding "Payload exists without a saved package in $namespace."
            config_check "$payload/sshd_config"
        fi
    done
    [ "$found" -lt 2 ] || finding 'Both old and new saved SSH installations exist; review both ownership records.'
    section 'Current USB configuration (if script is at USB root)'
    for assets in "$HERE/tweaks/ssh/assets" "$HERE/usb/tweaks/ssh/assets"; do
        [ ! -r "$assets/../manifest.conf" ] || run awk '/^(id|version)=/ {print}' "$assets/../manifest.conf"
        config_check "$assets/sshd_config"
    done
    section 'SSH processes - process presence does not prove installer ownership'
    for proc in /proc/[0-9]*; do
        [ -r "$proc/cmdline" ] || continue
        cmd=$(tr '\000' ' ' < "$proc/cmdline" 2>/dev/null) || continue
        case "$cmd" in
            *sshd*|*dropbear*|*mzd*ssh*service.sh*|*start-ssh.sh*)
                printf 'PID %s: %s\n' "${proc##*/}" "$cmd"
                readlink "$proc/exe" 2>/dev/null || : ;;
        esac
    done
    section 'Managed RAM state (password overlay contents omitted)'
    run ls -ld /tmp/mzd-ssh
    for file in owner supervisor.pid daemon.pid sshd.pid; do
        if [ -f "/tmp/mzd-ssh/$file" ] && [ ! -L "/tmp/mzd-ssh/$file" ]; then
            printf '%s: ' "$file"; awk 'NR<=3 {print}' "/tmp/mzd-ssh/$file"
        fi
    done
    section 'Network addresses and routes (inspection only)'
    if command -v ip >/dev/null 2>&1; then
        run ip addr show
        run ip route show
    fi
    section 'TCP listeners and firewall (inspection only)'
    run netstat -lntp
    run iptables -S INPUT
    run iptables -S MZD_SSH
    section 'Completed - no repair attempted'
}

# Do not remount a read-only stick just to collect diagnostics.
REPORT_DIR=$(mktemp -d "$HERE/ssh-diagnostic-XXXXXX" 2>/dev/null) || REPORT_DIR=''
if [ -n "$REPORT_DIR" ]; then
    collect > "$REPORT_DIR/report.txt" 2>&1
    cat "$REPORT_DIR/report.txt"
    printf '\nReport saved: %s/report.txt\n' "$REPORT_DIR"
else
    printf 'Cannot write beside the script; printing diagnostics only.\n'
    collect
fi
