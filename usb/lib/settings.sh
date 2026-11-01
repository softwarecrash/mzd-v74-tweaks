#!/bin/sh
# Settings files are literal data. Never source them or construct variable names.
mzd_settings_error() { printf 'Settings: %s\n' "$*" >&2; return 1; }
mzd_settings_process() (
    manifest=$1; mode=$2; strict=$3; shift 3
    schema="${manifest%/*}/../../lib/settings.awk"
    [ -f "$schema" ] && [ ! -L "$schema" ] || { mzd_settings_error 'Schema reader is missing.'; exit 1; }
    defaults_file=''
    if [ "$mode" != check ] && [ "$mode" != validate ]; then
        case "$manifest" in
            */*)
                tweak_dir=${manifest%/*}
                tweak_id=${tweak_dir##*/}
                user_file="${manifest%/*}/../../user/$tweak_id/settings.conf"
                ;;
            *)
                user_file="../../user/${ID:-settings}/settings.conf"
                ;;
        esac
        if [ -f "$user_file" ] && [ ! -L "$user_file" ]; then
            [ -n "${MZD_CONFIG_SIZE_LIMIT:-}" ] || . "${manifest%/*}/../../lib/defines.sh" 2>/dev/null || :
            user_size=$(( $(wc -c < "$user_file") ))
            [ "$user_size" -le "${MZD_CONFIG_SIZE_LIMIT:-65536}" ] || {
                mzd_settings_error "User configuration file exceeds size limit of $(( ${MZD_CONFIG_SIZE_LIMIT:-65536} / 1024 )) KB: ${user_file##*/}"; exit 1;
            }
            defaults_file=$user_file
        fi
    fi
    # Keep diagnostics on stderr without assuming /dev/stderr exists on the CMU.
    if [ -n "$defaults_file" ]; then
        output=$(awk -v mode="$mode" -v strict="$strict" -v defaults="$defaults_file" -f "$schema" "$manifest" "$defaults_file" "$@")
    else
        output=$(awk -v mode="$mode" -v strict="$strict" -f "$schema" "$manifest" "$@")
    fi || {
        printf '%s\n' "${output:-Settings: Cannot inspect the configuration.}" >&2; exit 1;
    }
    [ -z "$output" ] || printf '%s\n' "$output"
    exit 0
)
mzd_settings_normalize() (
    manifest=$1; shift
    [ "$#" -le 16 ] || { mzd_settings_error 'Too many values.'; exit 1; }
    for value do
        case "$value" in
            *'
'*|*"$(printf '\r')"*) mzd_settings_error 'Multiline values are not allowed.'; exit 1 ;;
        esac
    done
    # No command strings: printf receives separate, literal arguments.
    if [ "$#" -gt 0 ]; then printf '%s\n' "$@"; fi |
        mzd_settings_process "$manifest" normalize 0 -
)
mzd_settings_check() {
    [ -f "$2" ] && [ ! -L "$2" ] && [ -r "$2" ] || { mzd_settings_error 'Saved configuration is missing.'; return 1; }
    [ -n "${MZD_CONFIG_SIZE_LIMIT:-}" ] || . "${1%/*}/../../lib/defines.sh" 2>/dev/null || :
    conf_size=$(( $(wc -c < "$2") ))
    [ "$conf_size" -le "${MZD_CONFIG_SIZE_LIMIT:-65536}" ] || { mzd_settings_error "Saved configuration exceeds size limit of $(( ${MZD_CONFIG_SIZE_LIMIT:-65536} / 1024 )) KB: ${2##*/}"; return 1; }
    mzd_settings_process "$1" check 1 "$2"
}
mzd_setting() (
    case "$1" in ''|*[!a-z0-9_]*) mzd_settings_error 'Invalid setting name.'; exit 1 ;; esac
    [ -n "${MZD_SETTINGS_FILE:-}" ] && [ -f "$MZD_SETTINGS_FILE" ] && [ ! -L "$MZD_SETTINGS_FILE" ] || {
        mzd_settings_error 'No effective configuration was supplied.'; exit 1;
    }
    awk -v key="$1" 'index($0,key "=")==1 {print substr($0,length(key)+2); found++} END {exit found!=1}' "$MZD_SETTINGS_FILE"
)
