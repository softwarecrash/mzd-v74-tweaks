#!/bin/sh
# Read-only prerequisite regression; synthetic keys, never real CMU NVRAM.
set -eu
helper=$1
. "$helper"
scratch=$(mktemp -d /tmp/mzd-touch-reader.XXXXXX)
trap 'rm -rf "$scratch"' 0
TOUCH_STATE=$scratch/state
TOUCH_NVRAM=$scratch/nvram
TOUCH_SCRIPTS=$scratch/scripts
mkdir -p "$TOUCH_NVRAM/keys" "$TOUCH_SCRIPTS"
for setter in set_speed_restriction_config.sh set_lvds_speed_restriction_config.sh; do
    printf '#!/bin/sh\nexit 90\n' > "$TOUCH_SCRIPTS/$setter"
    chmod 755 "$TOUCH_SCRIPTS/$setter"
done
# Each probe starts a fresh shell: fixture printf calls in this process must
# not hide the CMU first-output-to-/dev/null bug in the prerequisite reader.
probe() {
    sh -c '
        . "$1"
        TOUCH_STATE=$2/state
        TOUCH_NVRAM=$2/nvram
        TOUCH_SCRIPTS=$2/scripts
        touch_require
    ' sh "$helper" "$scratch"
}
check() {
    if probe > "$scratch/out" 2> "$scratch/err"; then
        [ ! -s "$scratch/out" ] && [ ! -s "$scratch/err" ]
    else
        cat "$scratch/err" >&2
        exit 1
    fi
}
check
for value in enable disable; do
    printf '%s\n' "$value" > "$TOUCH_NVRAM/keys/bus_bcm_speed_restriction"
    printf '%s\n' "$value" > "$TOUCH_NVRAM/keys/lvds_speed_restriction"
    check
    [ "$(touch_read bus_bcm_speed_restriction)" = "$value" ]
    # Real CMU sysfs keys return a trailing NUL rather than a newline.
    printf '%s\000' "$value" > "$TOUCH_NVRAM/keys/bus_bcm_speed_restriction"
    printf '%s\000' "$value" > "$TOUCH_NVRAM/keys/lvds_speed_restriction"
    check
done
printf 'invalid\n' > "$TOUCH_NVRAM/keys/lvds_speed_restriction"
if probe > "$scratch/out" 2> "$scratch/err"; then exit 1; fi
grep -q 'Cannot read valid speed restriction settings' "$scratch/err"
rm "$TOUCH_NVRAM/keys/lvds_speed_restriction"
ln -s "$TOUCH_NVRAM/keys/bus_bcm_speed_restriction" "$TOUCH_NVRAM/keys/lvds_speed_restriction"
if probe > "$scratch/out" 2> "$scratch/err"; then exit 1; fi
rm "$TOUCH_NVRAM/keys/lvds_speed_restriction"
rm "$TOUCH_SCRIPTS/set_speed_restriction_config.sh"
if probe > "$scratch/out" 2> "$scratch/err"; then exit 1; fi
grep -q 'Missing OEM NVRAM setter' "$scratch/err"
printf 'TOUCH_READER_PASSED: fresh-process prerequisites, absent/newline/NUL keys, both values, invalid data, symlinks and missing setters.\n'
