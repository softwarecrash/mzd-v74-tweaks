#!/bin/sh
# --- Local common helpers ---
# Functions using scratch variables run in subshells to isolate caller state.
mzd_hash() (
  md5sum "$1" | cut -d' ' -f1
)

mzd_asset_readable() (
  [ -f "$1" ] && [ ! -L "$1" ] && [ -r "$1" ]
)

mzd_tweak_asset() {
  asset_source=$1
  case "$asset_source" in
    assets/*.conf|*/assets/*.conf)
      if [ -z "${MZD_PACKAGE_STATE:-}" ]; then
        asset_name=${asset_source##*/}
        user_asset="${MZD_ORIGIN_USB:-${ROOT:-${HERE%/*/*}}}/user/${ID:-${HERE##*/}}/$asset_name"
        if [ -f "$user_asset" ] && [ ! -L "$user_asset" ]; then
          [ -n "${MZD_CONFIG_SIZE_LIMIT:-}" ] || . "${MZD_ORIGIN_USB:-${ROOT:-${HERE%/*/*}}}/lib/defines.sh" 2>/dev/null || :
          asset_size=$(( $(wc -c < "$user_asset") ))
          if [ "$asset_size" -le "${MZD_CONFIG_SIZE_LIMIT:-65536}" ]; then
            printf '%s\n' "$user_asset"
            return 0
          fi
          printf 'Asset configuration override exceeds size limit of %d KB: %s\n' "$(( ${MZD_CONFIG_SIZE_LIMIT:-65536} / 1024 ))" "$asset_name" >&2
          return 1
        fi
      fi
      ;;
  esac
  case "$asset_source" in
    /*) printf '%s\n' "$asset_source" ;;
    *) printf '%s\n' "${HERE:-.}/$asset_source" ;;
  esac
}

mzd_require_assets() (
  for asset in "$@"
  do
    mzd_asset_readable "$asset" || mzd_fail "Missing or unreadable asset: $asset"
  done
)

mzd_require_tools() (
  for tool in "$@"
  do
    command -v "$tool" >/dev/null 2>&1 || mzd_fail "Missing tool: $tool"
  done
)

# Exact line comparison supported by the CMU's BusyBox awk. Its grep has no -x.
mzd_line_is() (
  awk -v expected="$1" '$0 == expected {found=1} END {exit !found}' "$2"
)

# This check has no target-file or patch dependency.
mzd_validate_firmware() (
  mzd_line_is "JCI_SW_VER=\"MAZ_CMU-150_$1\"" /jci/version.ini ||
    mzd_fail "This tweak requires firmware $1."
)

mzd_report_message() {
  printf '%s\n' "$*"
  printf '%s\n' "$*" >&3
}

# Call after mzd_begin: stdout is the report log. The launcher owns progress;
# forwarding this line to fd 3 would leave stale progress in the final GUI result.
mzd_report_start() {
  case "$ACTION" in
    install) MZD_ACTION_LABEL=Install ;;
    uninstall) MZD_ACTION_LABEL=Uninstall ;;
    run) MZD_ACTION_LABEL=Run ;;
    *) mzd_fail 'Unsupported progress action.' ;;
  esac
  printf '%s in progress. Do not remove the USB drive.\n' "$MZD_ACTION_LABEL"
}

# Before begin, errors use stderr only. During an operation they also reach USB.
mzd_fail() {
  if [ "${ACTION:-}" != status ] && [ -n "${MZD_REPORT:-}" ]
  then
    printf 'ERROR: %s\n' "$*"
    printf 'ERROR: %s\nReports: %s\n' "$*" "$MZD_REPORT" >&4
    : > "$MZD_REPORT/error-reported" 2>/dev/null || :
  else
    printf 'ERROR: %s\n' "$*" >&2
  fi
  exit "${MZD_FAILURE_CODE:-1}"
}

# Persist severity because patch helpers run in subshells.
# Exit 2 means manual intervention is required; never continue or reboot.
mzd_fatal() {
  printf '%s\n' "$*" > "$MZD_REPORT/critical-error" || :
  MZD_FAILURE_CODE=2
  mzd_fail "$@"
}

# Explicit session start: script path, tweak ID, optional cleanup function.
# Only MZD_USB/MZD_REPORT/MZD_CLEANUP are shared session variables.
mzd_begin() {
  MZD_CLEANUP=${3:-}
  MZD_USB=${MZD_ORIGIN_USB:-$(dirname "$1")}
  while [ "$MZD_USB" != / ] && ! grep -q " $MZD_USB " /proc/mounts
  do
    MZD_USB=$(dirname "$MZD_USB")
  done
  if [ "$MZD_USB" = / ]
  then
    echo 'Cannot identify the startup storage mount.' >&2
    exit 1
  fi
  mount -o rw,remount "$MZD_USB" || exit 1
  mkdir -p "$MZD_USB/reports/$2" || exit 1
  # CMU clocks and PIDs can repeat across boots. Never reuse stale rollback state.
  MZD_REPORT=$(mktemp -d "$MZD_USB/reports/$2/$ACTION-$(date +%Y%m%d-%H%M%S)-XXXXXX") || exit 1
  if [ -n "${MZD_SETTINGS_FILE:-}" ]; then
    [ -f "$MZD_SETTINGS_FILE" ] && [ ! -L "$MZD_SETTINGS_FILE" ] || exit 1
    cp "$MZD_SETTINGS_FILE" "$MZD_REPORT/settings.conf" && cmp -s "$MZD_SETTINGS_FILE" "$MZD_REPORT/settings.conf" || exit 1
  fi
  : > "$MZD_REPORT/run.log" || exit 1
  exec 3>&1
  exec 4>&2
  exec > "$MZD_REPORT/run.log" 2>&1
  printf 'Installer version: %s\n' "${MZD_INSTALLER_VERSION:-unknown}"
  trap mzd_finish 0
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

# Cleanup is an optional worker-supplied function name, never evaluated code.
mzd_finish() {
  MZD_EXIT=$?
  trap - 0
  case "${ACTION:-}:$MZD_EXIT" in
    install:130|install:143|uninstall:130|uninstall:143|restore-original:130|restore-original:143)
      printf 'ERROR: The operation was interrupted; changes may be incomplete. Do NOT reboot.\nReports: %s\n' "$MZD_REPORT" >&4
      MZD_EXIT=2 ;;
  esac
  if [ -n "$MZD_CLEANUP" ] && ! "$MZD_CLEANUP"
  then
    printf 'ERROR: Cleanup failed; system state could not be fully restored. Do NOT reboot.\nReports: %s\n' "$MZD_REPORT" >&4
    MZD_EXIT=2
  fi
  if [ -f "$MZD_REPORT/critical-error" ]
  then
    MZD_EXIT=2
  fi
  if [ "$MZD_EXIT" != 0 ] && [ ! -f "$MZD_REPORT/error-reported" ]
  then
    printf 'ERROR: Operation failed or was interrupted (exit %s). Check the report before continuing.\nReports: %s\n' "$MZD_EXIT" "$MZD_REPORT" >&4
  fi
  if ! printf 'exit_code=%s\n' "$MZD_EXIT" > "$MZD_REPORT/status.txt"
  then
    printf 'ERROR: Cannot save the final result. Check USB storage.\nReports: %s\n' "$MZD_REPORT" >&4
    [ "$MZD_EXIT" = 0 ] && MZD_EXIT=1
  fi
  sync
  # Never announce success before cleanup and result recording have succeeded.
  if [ "$MZD_EXIT" = 0 ] && [ -n "${MZD_SUCCESS:-}" ]
  then
    mzd_report_message "$MZD_SUCCESS"
  fi
  if [ "$MZD_EXIT" = 0 ] && [ -n "${MZD_STATUS:-}" ]
  then
    printf '%s\n' "$MZD_STATUS" >&3
  fi
  exit "$MZD_EXIT"
}
