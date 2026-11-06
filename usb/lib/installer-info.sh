#!/bin/sh
# JSON-lines responses keep individual errors isolated in a single bridge call.
mzd_info_json_string() {
    # Encode bytes so NUL and embedded control characters survive exactly.
    LC_ALL=C od -An -v -tu1 "$1" | LC_ALL=C awk '
      BEGIN {printf "\""}
      {for (i=1;i<=NF;i++) {
          n=$i+0
          if(n==34)printf "\\\""
          else if(n==92)printf "\\\\"
          else if(n<32)printf "\\u%04x",n
          else printf "%c",n
      }}
      END {printf "\""}'
}
mzd_info_capture() {
    key=$1; shift
    mzd_installer_main "$@" > "$info_scratch/out" 2> "$info_scratch/err"; code=$?
    printf '{"key":"%s","exitCode":%s,"stdout":' "$key" "$code"
    mzd_info_json_string "$info_scratch/out" || return 1
    printf ',"stderr":'
    mzd_info_json_string "$info_scratch/err" || return 1
    printf '}\n'
}
mzd_installer_info() (
    mode=$1; shift
    mzd_installer_packages || exit 1
    info_scratch=$(mktemp -d /tmp/mzd-info.XXXXXX) || exit 1
    trap 'rm -rf "$info_scratch"' 0
    trap 'exit 1' INT TERM
    if [ "$mode" = manifests ]; then
        [ "$#" = 0 ] || fail 'Manifest discovery takes no arguments.'
        mzd_installer_main list > "$info_scratch/ids" || exit 1
        while IFS= read -r info_id; do
            valid_id "$info_id" || exit 1
            mzd_info_capture "$info_id" manifest "$info_id" || exit 1
        done < "$info_scratch/ids"
    else
        [ "$#" = 2 ] && mzd_manifest_id "$1" || fail 'Expected tweak ID and detail sections.'
        info_id=$1; sections=$2
        set -f; set -- $sections; set +f
        [ "$#" -gt 0 ] && [ "$#" -le 6 ] || fail 'Invalid detail section count.'
        seen=' '
        for section do
            case "$section" in package-info|settings-info|update-info|preflight-info|uninstall-check|restore-check) ;; *) fail 'Unsupported detail section.' ;; esac
            case "$seen" in *" $section "*) fail 'Duplicate detail section.' ;; esac
            seen="$seen$section "
        done
        # Read-only requests never own the global mutation lock or its cache.
        # Each inspection verifies what it uses; actions independently recheck.
        for section do
            mzd_info_capture "$section" "$section" "$info_id" || exit 1
        done
    fi
)
