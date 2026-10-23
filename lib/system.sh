#!/bin/sh
# API 2: optional system operations. Importing this file performs no operations.
# Requires common.sh and an explicit mzd_begin session.

mzd_system_api() {
  printf '%s\n' '2'
}

# USB state records allow multiple locks/mounts without shell variable collisions.
mzd_system_begin() {
  MZD_SYSTEM="$MZD_REPORT/system"
  mkdir "$MZD_SYSTEM" || mzd_fail 'Cannot initialize system cleanup state.'
  : > "$MZD_SYSTEM/locks" || mzd_fail 'Cannot initialize locks.'
  : > "$MZD_SYSTEM/mounts" || mzd_fail 'Cannot initialize mounts.'
}

# Reject multiline record entries. Paths are data, never shell commands.
mzd_system_path() (
  case "$1" in
    /*) ;;
    *) mzd_fail 'An absolute system path is required.' ;;
  esac
  case "$1" in
    *'
'*) mzd_fail 'Multiline system paths are unsupported.' ;;
  esac
)

mzd_system_lock() (
  mzd_system_path "$1" || exit 1
  if grep -Fxq "$1" "$MZD_SYSTEM/locks"
  then
    return 0
  fi
  mkdir "$1" || mzd_fail 'Another tweak for this file is running. Restart the CMU if a previous run was interrupted.'
  if ! printf '%s\n' "$1" >> "$MZD_SYSTEM/locks"
  then
    rmdir "$1"
    mzd_fail 'Cannot record the owned lock.'
  fi
)

# Disabling the watchdog is explicit, separate from a mount or file operation.
mzd_system_watchdog_disable() (
  value=$(cat /sys/class/gpio/Watchdog\ Disable/value) || mzd_fail 'Cannot read watchdog state.'
  case "$value" in
    0)
      # Record before changing so cleanup also handles a caught interruption.
      : > "$MZD_SYSTEM/watchdog" || mzd_fail 'Cannot record watchdog state.'
      echo 1 > /sys/class/gpio/Watchdog\ Disable/value || mzd_fail 'Cannot disable watchdog.'
      ;;
    1) ;;
    *) mzd_fail 'Unknown watchdog state.' ;;
  esac
)

# Accept any explicit mount point, not only root or resources.
mzd_system_remount_rw() (
  mzd_system_path "$1" || exit 1
  mode=$(awk -v path="$1" '$2==path && $3!="rootfs" {print $4; exit}' /proc/mounts)
  case ",$mode," in
    *,rw,*) return 0 ;;
    *,ro,*) ;;
    *) mzd_fail "Unknown mount state: $1" ;;
  esac
  if ! grep -Fxq "$1" "$MZD_SYSTEM/mounts"
  then
    printf '%s\n' "$1" >> "$MZD_SYSTEM/mounts" || mzd_fail 'Cannot record mount state.'
  fi
  mount -o rw,remount "$1" || mzd_fail "Cannot remount $1 read-write."
)

# Restore only recorded changes; never remove somebody else's lock.
mzd_system_cleanup() (
  [ -n "${MZD_SYSTEM:-}" ] && [ -d "$MZD_SYSTEM" ] || exit 0
  result=0
  if [ -f "$MZD_SYSTEM/mounts" ]
  then
    # Restore nested mounts before their parents.
    awk '{line[NR]=$0} END {for (i=NR;i>0;i--) print line[i]}' "$MZD_SYSTEM/mounts" > "$MZD_SYSTEM/restore-mounts" || result=1
    while IFS= read -r path
    do
      mount -o ro,remount "$path" || result=1
    done < "$MZD_SYSTEM/restore-mounts"
  fi
  if [ -f "$MZD_SYSTEM/watchdog" ]
  then
    echo 0 > /sys/class/gpio/Watchdog\ Disable/value || result=1
  fi
  if [ -f "$MZD_SYSTEM/locks" ]
  then
    while IFS= read -r path
    do
      rmdir "$path" || result=1
    done < "$MZD_SYSTEM/locks"
  fi
  exit "$result"
)
