#!/bin/sh
# SSH Access for Mazda firmware 74.00.324. All assets are local to this folder.
set -u
ID=ssh
TITLE='SSH Access'
APP=/jci/scripts/stage_wifi.sh
ORIGINAL=d740449dea568696660a62fce0fb35bd
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
PATCH_FILE="$HERE/assets/change.patch"
ACTION=${1:-dialog}
case "$ACTION" in
  --help|-h) echo 'Usage: sh run.sh [install|uninstall|restore|status]'; exit 0 ;;
  dialog|install|uninstall|restore|status) ;;
  *) echo 'Unknown action. Use install, uninstall, restore or status.' >&2; exit 1 ;;
esac
UI=0
[ "$ACTION" = dialog ] && UI=1
USB=$HERE
while [ "$USB" != / ] && ! grep -q " $USB " /proc/mounts; do USB=$(dirname "$USB"); done
[ "$USB" != / ] || { echo 'Cannot identify the startup storage mount.' >&2; exit 1; }
mount -o rw,remount "$USB" || exit 1
REPORT="$USB/reports/diffpatch/$ID-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$REPORT" || exit 1
: > "$REPORT/run.log" || exit 1
exec 3>&1
exec > "$REPORT/run.log" 2>&1
ROOT_CHANGED=0
RES_CHANGED=0
WATCHDOG_CHANGED=0
LOCKED=0
REBOOT=0
LOCK=/tmp/mzd-stage_wifi-tweak.lock
fail() {
  echo "ERROR: $*"
  printf 'ERROR: %s\nReports: %s\n' "$*" "$REPORT" >&3
  if [ "$UI" = 1 ]; then /jci/tools/jci-dialog --info --title="$TITLE" --text="$*\nSee USB reports." --no-cancel; fi
  exit 1
}
finish() {
  _code=$?
  trap - 0
  if [ "$ROOT_CHANGED" = 1 ]; then mount -o ro,remount / || _code=1; fi
  if [ "$RES_CHANGED" = 1 ]; then mount -o ro,remount /tmp/mnt/resources || _code=1; fi
  if [ "$WATCHDOG_CHANGED" = 1 ]; then echo 0 > /sys/class/gpio/Watchdog\ Disable/value || _code=1; fi
  if [ "$LOCKED" = 1 ]; then rmdir "$LOCK" || _code=1; fi
  printf 'exit_code=%s\n' "$_code" > "$REPORT/status.txt"
  sync
  if [ "$_code" = 0 ] && [ "$REBOOT" = 1 ]; then reboot; fi
  exit "$_code"
}
trap finish 0
trap 'exit 130' INT
trap 'exit 143' TERM
hash() { md5sum "$1" | cut -d' ' -f1; }
check_asset() {
  _expected=$(cut -c1-32 "$1.md5" 2>/dev/null)
  [ -n "$_expected" ] && [ -f "$1" ] && [ ! -L "$1" ] && [ "$(hash "$1")" = "$_expected" ]
}
for TOOL in patch diff awk md5sum cp cmp; do command -v "$TOOL" >/dev/null || fail "Missing tool: $TOOL"; done
check_asset "$SELF" && check_asset "$PATCH_FILE" || fail 'Installer or patch checksum mismatch.'
grep -q '^JCI_SW_VER="MAZ_CMU-150_74\.00\.324"$' /jci/version.ini || fail 'This tweak requires firmware 74.00.324.'
[ -f "$APP" ] && [ ! -L "$APP" ] || fail 'Target is missing or is a symbolic link.'
mkdir "$LOCK" || fail 'Another tweak for this file is running. Restart the CMU if a previous run was interrupted.'
LOCKED=1
cp "$APP" "$REPORT/before.data" || fail 'Cannot save the USB rollback copy.'
BEFORE=$(hash "$APP")
[ "$(hash "$REPORT/before.data")" = "$BEFORE" ] || fail 'USB rollback copy mismatch.'

# BusyBox 1.19.2 has no --dry-run: each direction and its inverse run on copies.
patch_copy() {
  if [ "$1" = install ]; then
    patch -N -p0 -i "$PATCH_FILE" < /dev/null
  else
    patch -N -R -p0 -i "$PATCH_FILE" < /dev/null
  fi
}
probe() {
  _direction=$1
  _dir="$REPORT/$_direction"
  mkdir -p "$_dir/inverse" || return 1
  cp "$REPORT/before.data" "$_dir/target.data" || return 1
  (cd "$_dir" && patch_copy "$_direction") > "$_dir/patch.log" 2>&1 || return 1
  cmp -s "$REPORT/before.data" "$_dir/target.data" && return 1
  cp "$_dir/target.data" "$_dir/inverse/target.data" || return 1
  _inverse=install
  [ "$_direction" = install ] && _inverse=uninstall
  (cd "$_dir/inverse" && patch_copy "$_inverse") > "$_dir/inverse.log" 2>&1 || return 1
  cmp -s "$REPORT/before.data" "$_dir/inverse/target.data"
}
FORWARD=0
REVERSE=0
probe install && FORWARD=1
probe uninstall && REVERSE=1
case "$FORWARD:$REVERSE" in
  1:0) STATE=uninstalled ;;
  0:1) STATE=installed ;;
  *) fail 'Patch state is unknown, partial or ambiguous. No system file changed.' ;;
esac
echo "state=$STATE"

make_rw() {
  _watchdog=$(cat /sys/class/gpio/Watchdog\ Disable/value) || fail 'Cannot read watchdog state.'
  case "$_watchdog" in
    0) echo 1 > /sys/class/gpio/Watchdog\ Disable/value || fail 'Cannot disable watchdog.'; WATCHDOG_CHANGED=1 ;;
    1) ;;
    *) fail 'Unknown watchdog state.' ;;
  esac
  if awk '$2=="/" && $3!="rootfs" && $4 ~ /(^|,)ro(,|$)/ {f=1} END {exit !f}' /proc/mounts; then
    mount -o rw,remount / || fail 'Cannot remount the system read-write.'
    ROOT_CHANGED=1
  fi
}
SERVICE=/tmp/mnt/resources/mzd-v74-tweaks/ssh
PAYLOAD="$HERE/assets"
resources_rw() {
  if awk '$2=="/tmp/mnt/resources" && $4 ~ /(^|,)ro(,|$)/ {f=1} END {exit !f}' /proc/mounts; then
    mount -o rw,remount /tmp/mnt/resources || fail 'Cannot remount resources read-write.'
    RES_CHANGED=1
  fi
}
ssh_payload_ok() {
  [ -d "$SERVICE" ] && [ ! -L "$SERVICE" ] || return 1
  for _file in service.sh sshd_config password.hash; do
    [ ! -L "$SERVICE/$_file" ] && cmp -s "$PAYLOAD/$_file" "$SERVICE/$_file" || return 1
  done
}
ssh_prepare() {
  for _file in service.sh sshd_config password.hash usb-log-marker.txt; do
    check_asset "$PAYLOAD/$_file" || fail 'SSH asset checksum mismatch.'
  done
  if [ -e "$SERVICE" ]; then
    ssh_payload_ok || fail 'Existing SSH service files differ. Nothing overwritten.'
  elif [ "$STATE" = installed ]; then
    fail 'The SSH boot hook is installed but the service payload is missing.'
  fi
  if [ "$ACTION" = install ]; then
    _check=$PAYLOAD
    [ -d "$SERVICE" ] && _check=$SERVICE
    sh "$_check/service.sh" check || fail 'SSH prerequisites failed; an unrelated port 22 listener is never replaced.'
    if [ ! -e "$SERVICE" ]; then
      resources_rw
      mkdir -p "$(dirname "$SERVICE")" || fail 'Cannot create SSH parent directory.'
      _stage="$SERVICE.new-$$"
      mkdir "$_stage" || fail 'Cannot prepare SSH service directory.'
      for _file in service.sh sshd_config password.hash; do
        if ! cp "$PAYLOAD/$_file" "$_stage/$_file" || ! cmp -s "$PAYLOAD/$_file" "$_stage/$_file"; then
          rm -f "$_stage/service.sh" "$_stage/sshd_config" "$_stage/password.hash"
          rmdir "$_stage"
          fail 'Cannot copy and verify SSH service payload.'
        fi
      done
      chmod 700 "$_stage/service.sh" && chmod 600 "$_stage/sshd_config" "$_stage/password.hash" || fail 'Cannot set SSH payload permissions.'
      sync
      mv "$_stage" "$SERVICE" || fail 'Cannot publish SSH service directory.'
    fi
    cp "$PAYLOAD/usb-log-marker.txt" "$USB/diffpatch-ssh-log-marker.txt" || fail 'Cannot save USB runtime-log marker.'
  fi
}
ssh_rollback_hook() {
  if [ "$NO_CHANGE" = 0 ]; then
    cat "$REPORT/before.data" > "$APP"; sync
    [ "$(hash "$APP")" = "$BEFORE" ] || fail 'SSH boot-hook rollback failed. Do NOT reboot.'
  fi
}
ssh_complete() {
  if [ "$ACTION" = install ]; then
    resources_rw
    if ! printf 'enabled\n' > "$SERVICE/enabled"; then
      rm -f "$SERVICE/enabled"
      ssh_rollback_hook
      fail 'Cannot enable the SSH service. The new boot hook was reverted.'
    fi
    sync
    sh "$SERVICE/service.sh" boot "$USB" >/dev/null 2>&1 3>&- &
    sleep 2
    if ! sh "$SERVICE/service.sh" status; then
      rm -f "$SERVICE/enabled"
      sh "$SERVICE/service.sh" stop || fail 'SSH startup and service cleanup failed. Do NOT reboot.'
      ssh_rollback_hook
      fail 'SSH did not start. The new boot hook and runtime changes were reverted.'
    fi
    printf 'SSH: port 22, user cmu, password jci.\n' >&3
  elif [ -d "$SERVICE" ]; then
    resources_rw
    rm -f "$SERVICE/enabled"
    sync
    sh "$SERVICE/service.sh" stop || fail 'Boot hook removed; service cleanup failed. Check the report.'
    for _file in service.sh sshd_config password.hash; do rm -f "$SERVICE/$_file"; done
    rmdir "$SERVICE" || fail 'SSH stopped; service directory is not empty.'
    printf 'Managed SSH service, password overlay and firewall access removed.\n' >&3
  fi
}

if [ "$ACTION" = status ]; then
  printf '%s\n' "$STATE" >&3
  exit 0
fi
if [ "$UI" = 1 ]; then
  killall -q jci-dialog
  if /jci/tools/jci-dialog --3-button-dialog --title="$TITLE" --text='Enable native SSH on port 22. Login: cmu / jci.\nWhat would you like to do?' --ok-label=Install --cancel-label=Uninstall --button3-label=Exit; then
    ACTION=install
  elif [ $? -eq 1 ]; then ACTION=uninstall
  else echo 'Cancelled. Nothing changed.'; exit 0
  fi
fi
[ "$ACTION" = restore ] && ACTION=uninstall
NO_CHANGE=0
if { [ "$ACTION" = install ] && [ "$STATE" = installed ]; } || { [ "$ACTION" = uninstall ] && [ "$STATE" = uninstalled ]; }; then NO_CHANGE=1; fi
if [ "$NO_CHANGE" = 0 ]; then
  BACKUP="${APP}.org"
  if [ -e "$BACKUP" ] || [ -L "$BACKUP" ]; then
    [ -f "$BACKUP" ] && [ ! -L "$BACKUP" ] && [ "$(hash "$BACKUP")" = "$ORIGINAL" ] || fail 'The .org backup is not the known OEM original.'
  else
    [ "$BEFORE" = "$ORIGINAL" ] || fail 'The shared OEM .org backup is missing. Nothing changed.'
  fi
fi
ssh_prepare
if [ "$NO_CHANGE" = 0 ]; then
  DESIRED_FILE="$REPORT/$ACTION/target.data"
  DESIRED=$(hash "$DESIRED_FILE")
  diff -U 3 "$REPORT/before.data" "$DESIRED_FILE" > "$REPORT/changes.diff"
  [ "$?" = 1 ] || fail 'Cannot record the prepared change.'
  make_rw
  if [ ! -e "$BACKUP" ]; then
    cp -a "$APP" "$BACKUP" && sync
    if [ "$(hash "$BACKUP")" != "$ORIGINAL" ]; then rm -f "$BACKUP"; fail 'Original backup failed.'; fi
  fi
  [ "$(hash "$APP")" = "$BEFORE" ] || fail 'Target changed while preparing the tweak.'
  cat "$DESIRED_FILE" > "$APP"; sync
  [ "$(hash "$APP")" = "$DESIRED" ] || { cat "$DESIRED_FILE" > "$APP"; sync; }
  if [ "$(hash "$APP")" != "$DESIRED" ]; then
    cat "$REPORT/before.data" > "$APP"; sync
    [ "$(hash "$APP")" = "$BEFORE" ] || fail 'Write AND rollback failed. Do NOT reboot the CMU.'
    fail 'Write failed; the complete previous file was restored.'
  fi
fi
ssh_complete
if [ "$NO_CHANGE" = 1 ]; then
  printf 'Requested setting is already present.\nReports: %s\n' "$REPORT" >&3
else
  printf '%s completed. Other changes were preserved.\nReports: %s\n' "$ACTION" "$REPORT" >&3
fi
if [ "$UI" = 1 ] && [ "$NO_CHANGE" = 0 ]; then
  killall -q jci-dialog
  if /jci/tools/jci-dialog --question --title="$TITLE" --text='Completed. Reboot to reload the system.' --ok-label='Reboot now' --cancel-label='Reboot later'; then REBOOT=1; fi
fi
exit 0
