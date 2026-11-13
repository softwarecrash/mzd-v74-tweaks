#!/bin/sh
# In-car settings change for the saved Android Auto package. This is not a worker
# action: the GUI service runs the saved copy with one key=value argument and no
# USB. Under the package and target locks it republishes the saved settings.conf
# with its package.files line first, then re-patches the XML targets, so status,
# Update and Uninstall always derive the applied content from the saved settings.
# Exit: 0 applied or unchanged, 1 refused with nothing changed, 2 uncertain state.
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
ROOT=$(CDPATH= cd "$HERE/../.." && pwd) || exit 1
. "$ROOT/lib/bundle.sh" || exit 1
. "$HERE/settings-patch.sh" || exit 1

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# Only the setting exposed in the car is accepted; others need the launcher.
case "$#:${1:-}" in
    1:resolution_dpi=*) ;;
    *) fail 'Usage: apply-settings.sh resolution_dpi=N' ;;
esac
key=${1%%=*}; value=${1#*=}

mzd_bundle_load || exit 1
entry="$MZD_PACKAGE_STORE/$ID"
package="$entry/package"
saved="$package/settings.conf"
[ "$ROOT" = "$package" ] || fail 'Only the saved package copy can change installed settings.'

scratch=$(mktemp -d /tmp/mzd-aa-settings.XXXXXX) || exit 1
MZD_REPORT=$scratch; export MZD_REPORT
# Shared helpers repeat their reason on descriptor 4 with a report path; this
# script has no report, so stdout/stderr alone carry the reason to the caller.
exec 4>/dev/null
# The cleanup records live in scratch: restore mounts, watchdog and locks first.
trap 'code=$?; if ! mzd_system_cleanup; then printf "ERROR: Could not restore mount, watchdog or lock state. Do NOT reboot.\n" >&2; code=2; fi; rm -rf "$scratch"; exit "$code"' 0
trap 'exit 2' INT TERM

mzd_system_begin || exit 1
mzd_system_lock "$MZD_PACKAGE_LOCK" || fail 'Another package operation or Restore is active; nothing changed.'
mzd_system_lock "$LOCK" || exit 1

[ "$(mzd_package_state "$entry")" = installed ] || fail 'The saved installation is incomplete; use the launcher. Nothing changed.'
mzd_package_check_full "$entry" || fail 'The saved package failed its integrity check; nothing changed.'

# Keep every other saved value; the manifest schema validates the new one.
MZD_SETTINGS_FILE=$saved; export MZD_SETTINGS_FILE
set --
for name in $SETTINGS; do
    if [ "$name" = "$key" ]; then current=$value
    else current=$(mzd_setting "$name") || fail "Saved setting is missing: $name"; fi
    set -- "$@" "$name=$current"
done
mzd_settings_normalize "$HERE/manifest.conf" "$@" > "$scratch/settings.conf" || fail 'Invalid setting value; nothing changed.'
mzd_settings_check "$HERE/manifest.conf" "$scratch/settings.conf" || exit 1
if cmp -s "$scratch/settings.conf" "$saved"; then
    printf 'Settings are unchanged.\n'; exit 0
fi

# Plan in RAM: reverse the saved patch from the current target (proving its
# state and keeping unrelated edits), then apply the new patch to the result.
mzd_components records > "$scratch/components" || exit 1
tab=$(printf '\t'); count=0
: > "$scratch/plan" || exit 1
while IFS="$tab" read -r kind target source service original; do
    [ "$kind" = patch ] || continue
    count=$((count+1)); folder="$scratch/target.$count"
    mkdir -p "$folder/new" || exit 1
    asset_file=$(mzd_tweak_asset "$source") && mzd_asset_readable "$asset_file" || exit 1
    [ -f "$target" ] && [ ! -L "$target" ] || fail "Missing target: $target"
    cp -a "$target" "$folder/before.data" || exit 1
    MZD_SETTINGS_FILE=$saved mzd_bundle_patch "$asset_file" "$folder/old.patch" || exit 1
    MZD_SETTINGS_FILE="$scratch/settings.conf" mzd_bundle_patch "$asset_file" "$folder/new.patch" || exit 1
    for patch_file in "$folder/old.patch" "$folder/new.patch"; do
        awk '/^--- /{a++;if($0!="--- target.data")bad=1} /^\+\+\+ /{b++;if($0!="+++ target.data")bad=1} END{exit bad || a!=1 || b!=1}' "$patch_file" || fail "Invalid generated patch for: $target"
    done
    mzd_patch_probe "$folder" uninstall "$folder/old.patch" && [ ! -e "$folder/probe-error" ] ||
        fail "Target does not match the saved settings: $target. Nothing changed."
    cp "$folder/uninstall/target.data" "$folder/new/before.data" || exit 1
    mzd_patch_probe "$folder/new" install "$folder/new.patch" && [ ! -e "$folder/new/probe-error" ] ||
        fail "The new settings cannot be applied to: $target. Nothing changed."
    printf '%s\t%s\n' "$target" "$folder" >> "$scratch/plan" || exit 1
done < "$scratch/components"
[ "$count" -gt 0 ] || fail 'No XML patch components are declared.'

# Only the settings.conf line of the saved inventory may change.
new_hash=$(mzd_hash "$scratch/settings.conf") || exit 1
awk -F "$tab" -v hash="$new_hash" 'BEGIN {OFS="\t"} $2=="package/settings.conf" {$1=hash; found++} {print} END {exit found!=1}' \
    "$entry/package.files" > "$scratch/package.files" || fail 'Saved inventory has no settings record.'
cp "$saved" "$scratch/settings.old" && cp "$entry/package.files" "$scratch/package.files.old" || exit 1

while IFS="$tab" read -r target folder; do
    mount_point=$(mzd_shim_mount "$target") || fail "Unsupported target filesystem: $target"
    mzd_system_remount_rw "$mount_point" || exit 1
done < "$scratch/plan"
mzd_system_watchdog_disable || exit 1

# A temp file left by a failed write is removed before rollback continues.
discard_temp() {
    if [ -f "$MZD_REPORT/temp.path" ]; then
        rm -f "$(cat "$MZD_REPORT/temp.path")" && rm -f "$MZD_REPORT/temp.path"
    fi
}
# Restore in reverse order everything already published; failure is critical.
rollback() {
    discard_temp || :
    rollback_ok=1
    if [ -f "$scratch/written" ]; then
        awk '{line[NR]=$0} END {for(i=NR;i>0;i--)print line[i]}' "$scratch/written" > "$scratch/undo" || rollback_ok=0
        while IFS="$tab" read -r path data; do
            mzd_restore_write "$path" "$data" || { discard_temp || :; rollback_ok=0; }
        done < "$scratch/undo"
    fi
    if [ "$rollback_ok" = 1 ] && mzd_package_check_full "$entry" && mzd_package_set_state "$entry" installed &&
        rm -f "$entry/failure.log"; then
        printf 'ERROR: %s Previous settings restored; nothing changed.\n' "$1" >&2; exit 1
    fi
    printf 'ERROR: %s Rollback failed; saved settings and XML targets may disagree. Do NOT reboot.\n' "$1" >&2
    exit 2
}
publish() {
    # path<TAB>previous content, recorded before the write for rollback.
    printf '%s\t%s\n' "$1" "$3" >> "$scratch/written" || return 1
    mzd_restore_write "$1" "$2"
}

# An interruption between these writes leaves a broken receipt with a reason.
mzd_package_set_state "$entry" failed || fail 'Cannot mark the saved installation as changing; nothing changed.'
printf 'phase=in-car-settings\nAn in-car %s change did not finish. Saved settings and XML targets may disagree.\n' "$key" > "$entry/failure.next" &&
    mv "$entry/failure.next" "$entry/failure.log" || rollback 'Cannot record the change state.'
publish "$saved" "$scratch/settings.conf" "$scratch/settings.old" || rollback 'Cannot save the new settings.'
publish "$entry/package.files" "$scratch/package.files" "$scratch/package.files.old" || rollback 'Cannot update the saved inventory.'
while IFS="$tab" read -r target folder; do
    publish "$target" "$folder/new/install/target.data" "$folder/before.data" || rollback "Cannot write target: $target."
done < "$scratch/plan"
sync
mzd_package_check_full "$entry" || rollback 'The saved package failed verification after the change.'
mzd_package_set_state "$entry" installed || rollback 'Cannot mark the saved installation as complete.'
rm -f "$entry/failure.log" && sync || printf 'Could not remove the finished change record: %s/failure.log\n' "$entry" >&2
applied=$(mzd_setting "$key") || applied=$value
printf '%s is now %s. Restart the CMU to apply it to Android Auto.\n' "$key" "$applied"
