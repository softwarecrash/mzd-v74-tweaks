#!/bin/sh
# Shared by run.sh and apply-settings.sh. Builds the XML patch for the effective
# settings in MZD_SETTINGS_FILE, so install, status, uninstall and an in-car
# change always derive the same target content from the same saved values.
mzd_bundle_patch() {
    patch_source=$1; patch_target=$2
    dpi=$(mzd_setting resolution_dpi) || return 1
    par=$(mzd_setting resolution_par) || return 1
    awk -v dpi="$dpi" -v par="$par" '
        /^-[ \t]*<density>141<\/density>/ { if (dpi == "141") next }
        /^\+[ \t]*<density>/ {
            if (dpi == "141") { sub(/^\+/, " "); print; next }
            sub(/<density>[0-9]+<\/density>/, "<density>" dpi "</density>")
        }
        /^\+[ \t]*<real_density>/ { sub(/<real_density>[0-9]+<\/real_density>/, "<real_density>" dpi "</real_density>") }
        /^\+[ \t]*<par>/ { sub(/<par>[0-9]+<\/par>/, "<par>" par "</par>") }
        { print }
    ' "$patch_source" > "$patch_target" || return 1
}
