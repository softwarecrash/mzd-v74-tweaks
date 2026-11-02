#!/bin/sh
# Mutable data declarations are separate from executable package inventories.
mzd_config_error() { printf 'Config: %s\n' "$*" >&2; return 1; }
mzd_config_records() (
    folder=$1
    mzd_manifest_load "$folder/manifest.conf" || exit 1
    [ -n "$CONFIGS" ] || exit 0
    output=$(awk -v base="${MZD_PACKAGE_MOUNT:-/tmp/mnt/data_persist}" -f "$folder/../../lib/configs.awk" "$folder/manifest.conf") || { printf '%s\n' "$output" >&2;exit 1; }
    [ -z "$output" ] || printf '%s\n' "$output"
)
mzd_config_safe() (
    trap 'code=$?;trap - 0;if [ "$code" != 0 ];then printf "Config: Unsafe or unreadable path: %s\n" "$1" >&2;fi;exit "$code"' 0
    path=$1
    while [ "$path" != / ]; do
        [ ! -L "$path" ] || { mzd_config_error "Linked config path: $path";exit 1; }
        [ ! -e "$path" ] || [ -d "$path" ] || [ "$path" = "$1" ] || exit 1
        path=${path%/*};[ -n "$path" ] || path=/
    done
    if [ -e "$1" ]; then
        case "$2" in file) [ -f "$1" ] && [ "$(stat -c %h "$1")" = 1 ] || exit 1;;
        dir) [ -d "$1" ] || exit 1
             unsupported=$(find "$1" ! -type f ! -type d -print) || exit 1
             [ -z "$unsupported" ] || exit 1
             files=$(find "$1" -type f -print) || exit 1
             if [ -n "$files" ];then
                 printf '%s\n' "$files" | while IFS= read -r file;do [ "$(stat -c %h "$file")" = 1 ] || exit 1;done || exit 1
             fi;; esac
    fi
)
mzd_config_owner_root() { printf '%s/mzd-tweaks/config-owners\n' "${MZD_PACKAGE_MOUNT:-/tmp/mnt/data_persist}"; }
mzd_config_preflight() (
    folder=$1;mzd_manifest_load "$folder/manifest.conf" || exit 1;records=$(mzd_config_records "$folder") || exit 1
    [ -n "$records" ] || exit 0
    owners=$(mzd_config_owner_root)
    mzd_config_safe "$owners" dir || exit 1
    tmp=$(mktemp /tmp/mzd-config.XXXXXX) || exit 1
    trap 'rm -f "$tmp"' 0
    printf '%s\n' "$records" > "$tmp"
    for record in "$owners"/*.tsv; do
        [ -e "$record" ] || [ -L "$record" ] || continue
        mzd_config_safe "$record" file || exit 1
        if [ "${record##*/}" = "$ID.tsv" ]; then
            awk -F "$(printf '\t')" 'NR==FNR {a[$1]=$2 FS $3;next} a[$1]!=$2 FS $3 {bad=1} END {exit bad}' "$tmp" "$record" || { mzd_config_error 'Removing or moving retained config declarations requires a full uninstall first.';exit 1; }
        else
            awk -F "$(printf '\t')" 'NR==FNR {a[$3]=1;next} {for(p in a)if(p==$3 || index(p,$3 "/")==1 || index($3,p "/")==1)bad=1} END {exit bad}' "$tmp" "$record" || { mzd_config_error 'Config path belongs to another tweak.';exit 1; }
        fi
    done
    tab=$(printf '\t')
    while IFS="$tab" read -r key kind target source; do
        mzd_config_safe "$target" "$kind" || exit 1
        [ "$source" = - ] || {
            mzd_config_safe "$folder/$source" "$kind" && [ -e "$folder/$source" ] || { mzd_config_error "Missing or unsafe template: $source";exit 1; }
        }
    done < "$tmp"
)
mzd_config_copy_missing() (
    [ ! -e "$2" ] || exit 0
    # noclobber prevents an app-created file being overwritten between checks.
    (umask 077;set -C;cat "$1" > "$2") || { mzd_config_error 'Could not initialize missing config.';exit 1; }
)
mzd_config_seed() (
    folder=$1;mzd_manifest_load "$folder/manifest.conf" || exit 1;mzd_config_preflight "$folder" || exit 1
    records=$(mzd_config_records "$folder") || exit 1
    [ -n "$records" ] || exit 0
    owners=$(mzd_config_owner_root)
    mkdir -p "$owners" || exit 1
    printf '%s\n' "$records" > "$owners/$ID.next" && mv "$owners/$ID.next" "$owners/$ID.tsv" || exit 1
    tab=$(printf '\t')
    printf '%s\n' "$records" | while IFS="$tab" read -r key kind target source; do
        mzd_config_safe "$target" "$kind" || exit 1
        if [ "$kind" = dir ]; then
            [ "$source" != - ] || continue
            mkdir -p "$target" || exit 1
            (cd "$folder/$source" && find . -type f -print) | while IFS= read -r rel; do
                case "$rel" in *[!A-Za-z0-9_./-]*|*/../*|*/./*) exit 1;;esac
                destination="$target/${rel#./}"
                mzd_config_safe "$destination" file || exit 1
                [ ! -e "$destination" ] || continue
                mkdir -p "${destination%/*}" && mzd_config_copy_missing "$folder/$source/${rel#./}" "$destination" || exit 1
            done || exit 1
        elif [ ! -e "$target" ] && [ "$source" != - ]; then
            mkdir -p "${target%/*}" && mzd_config_copy_missing "$folder/$source" "$target" || exit 1
        fi
    done || exit 1
    sync
)
mzd_config_remove() (
    folder=$1;mzd_manifest_load "$folder/manifest.conf" || exit 1;records=$(mzd_config_records "$folder") || exit 1
    [ -n "$records" ] || exit 0
    tab=$(printf '\t')
    # Check the whole deletion scope before deleting the first path.
    printf '%s\n' "$records" | while IFS="$tab" read -r key kind target source; do mzd_config_safe "$target" "$kind" || exit 1;done || exit 1
    printf '%s\n' "$records" | while IFS="$tab" read -r key kind target source; do
        [ -e "$target" ] || continue
        case "$kind" in file) rm -f "$target";;dir) rm -rf "$target";;esac || exit 1
    done || exit 1
    owners=$(mzd_config_owner_root)
    mzd_config_safe "$owners/$ID.tsv" file && rm -f "$owners/$ID.tsv" "$owners/$ID.next" || exit 1
    sync
)

mzd_config_contains() (
    records=$(mzd_config_records "$1") || exit 1
    printf '%s\n' "$records" | awk -F "$(printf '\t')" -v p="$2" '$3==p || ($2=="dir" && index(p,$3 "/")==1) {found=1} END {exit !found}'
)
