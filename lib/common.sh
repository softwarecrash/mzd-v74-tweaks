#!/bin/sh
# API 2: general helpers. Importing this file performs no operations.

mzd_common_api() {
  printf '%s\n' '2'
}

# Functions using scratch variables run in subshells to isolate caller state.
mzd_hash() (
  md5sum "$1" | cut -d' ' -f1
)

mzd_check_asset() (
  expected=$(cut -c1-32 "$1.md5" 2>/dev/null)
  [ -n "$expected" ] && [ -f "$1" ] && [ ! -L "$1" ] &&
    [ "$(mzd_hash "$1")" = "$expected" ]
)

mzd_require_assets() (
  for asset in "$@"
  do
    mzd_check_asset "$asset" || mzd_fail "Asset checksum mismatch: $asset"
  done
)

mzd_require_tools() (
  for tool in "$@"
  do
    command -v "$tool" >/dev/null 2>&1 || mzd_fail "Missing tool: $tool"
  done
)

# This check has no target-file or patch dependency.
mzd_validate_firmware() (
  grep -Fxq "JCI_SW_VER=\"MAZ_CMU-150_$1\"" /jci/version.ini ||
    mzd_fail "This tweak requires firmware $1."
)

mzd_report_message() {
  printf '%s\n' "$*"
  printf '%s\n' "$*" >&3
}

# Before begin, errors use stderr only. During an operation they also reach USB.
mzd_fail() {
  if [ -n "${MZD_REPORT:-}" ]
  then
    printf 'ERROR: %s\n' "$*"
    printf 'ERROR: %s\nReports: %s\n' "$*" "$MZD_REPORT" >&4
  else
    printf 'ERROR: %s\n' "$*" >&2
  fi
  exit 1
}

# Explicit session start: script path, tweak ID, optional cleanup function.
# Only MZD_USB/MZD_REPORT/MZD_CLEANUP are shared session variables.
mzd_begin() {
  MZD_CLEANUP=${3:-}
  MZD_USB=$(dirname "$1")
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
  MZD_REPORT="$MZD_USB/reports/diffpatch/$2-$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$MZD_REPORT" || exit 1
  : > "$MZD_REPORT/run.log" || exit 1
  exec 3>&1
  exec 4>&2
  exec > "$MZD_REPORT/run.log" 2>&1
  trap mzd_finish 0
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

# Cleanup is an optional worker-supplied function name, never evaluated code.
mzd_finish() {
  MZD_EXIT=$?
  trap - 0
  if [ -n "$MZD_CLEANUP" ]
  then
    "$MZD_CLEANUP" || MZD_EXIT=1
  fi
  printf 'exit_code=%s\n' "$MZD_EXIT" > "$MZD_REPORT/status.txt" || MZD_EXIT=1
  sync
  exit "$MZD_EXIT"
}
