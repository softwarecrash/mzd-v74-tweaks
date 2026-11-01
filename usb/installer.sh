#!/bin/sh
# Shell-side adapter for discovery, saved packages and tweak actions.
set -u
SELF=$(readlink -f "$0") || exit 1
HERE=$(dirname "$SELF")
. "$HERE/lib/defines.sh" || exit 1
. "$HERE/lib/version.sh" || exit 1
MZD_INSTALLER_VERSION=$(mzd_installer_version "$HERE"); export MZD_INSTALLER_VERSION
fail() { printf '%s\n' "$*" >&2; exit 1; }
valid_id() { case "$1" in ''|*[!a-zA-Z0-9_-]*) return 1 ;; esac; }
case "${1:-}" in
  restore-check|restore-original)
    case "$1:$#" in restore-check:2|restore-original:3) ;; *) fail 'Expected a tweak ID and, for Restore, the confirmation fingerprint.' ;; esac
    ROOT=$HERE
    . "$ROOT/lib/recovery.sh" || exit 1
    mzd_recovery_main "$@" ;;
  preflight-info)
    [ "$#" = 2 ] && valid_id "$2" || fail 'Expected a tweak ID.'
    . "$HERE/lib/manifest.sh" || exit 1
    mzd_manifest_load "$HERE/tweaks/$2/manifest.conf" && [ "$ID" = "$2" ] || exit 1
    [ -n "${COMPONENTS:-}" ] || exit 0
    /bin/sh "$HERE/tweaks/$2/run.sh" preflight ;;
  settings-info)
    [ "$#" = 2 ] && valid_id "$2" || fail 'Expected a tweak ID.'
    . "$HERE/lib/manifest.sh" && . "$HERE/lib/packages.sh" && . "$HERE/lib/settings.sh" || exit 1
    entry="$MZD_PACKAGE_STORE/$2"
    if [ -e "$entry" ] || [ -L "$entry" ]; then
      mzd_package_check "$entry" || exit 1
      printf 'settings_saved=true\n'
      manifest="$entry/package/tweaks/$2/manifest.conf"
      if [ -f "$entry/package/settings.conf" ]; then
        mzd_settings_process "$manifest" info 1 "$entry/package/settings.conf"
      else mzd_settings_process "$manifest" info 0 /dev/null; fi
    else
      manifest="$HERE/tweaks/$2/manifest.conf"
      mzd_manifest_load "$manifest" && [ "$ID" = "$2" ] || exit 1
      printf 'settings_saved=false\n'
      mzd_settings_process "$manifest" info 0 /dev/null
    fi ;;
  statuses)
    shift
    . "$HERE/lib/manifest.sh" && . "$HERE/lib/packages.sh" || exit 1
    if [ "$#" = 1 ]; then
      ids=$1
      set -f
      # A single plain ID list avoids the transport argument-count limit.
      # shellcheck disable=SC2086
      set -- $ids
    fi
    mzd_package_statuses "$HERE" "$@" ;;
  uninstall-check)
    [ "$#" = 2 ] && valid_id "$2" || fail 'Expected a tweak ID.'
    . "$HERE/lib/manifest.sh" && . "$HERE/lib/packages.sh" || exit 1
    entry="$MZD_PACKAGE_STORE/$2"
    [ -d "$entry" ] && [ ! -L "$entry" ] || fail 'No saved uninstaller is available.'
    [ ! -d "$MZD_PACKAGE_LOCK" ] || fail 'Another package operation or Restore is active.'
    mzd_package_check "$entry" && mzd_package_dependents "$entry" || exit 1
    state=$(mzd_package_state "$entry") || fail 'Saved installation state is invalid.'
    mzd_manifest_load "$entry/package/tweaks/$2/manifest.conf" || exit 1
    case " $ACTIONS " in *" uninstall "*) ;; *) fail 'Saved package does not support Uninstall.' ;; esac
    printf 'available\t%s\t%s\n' "$VERSION" "$state" ;;
  package-info)
    [ "$#" = 2 ] && valid_id "$2" || fail 'Expected a tweak ID.'
    . "$HERE/lib/manifest.sh" && . "$HERE/lib/packages.sh" || exit 1
    entry="$MZD_PACKAGE_STORE/$2"
    if [ -d "$entry" ] && [ ! -L "$entry" ]; then
      mzd_manifest_load "$entry/package/tweaks/$2/manifest.conf" || exit 1
      [ "$ID" = "$2" ] || exit 1
      state=$(mzd_package_state "$entry") || exit 1
      printf '%s\t%s\n' "$VERSION" "$state"
    fi ;;
  metrics)
    shift
    . "$HERE/lib/metrics.sh" || exit 1
    mzd_metrics "$@" ;;
  list)
    (
    for path in "$HERE/tweaks/"*; do
      [ -d "$path" ] && [ ! -L "$path" ] && [ -f "$path/manifest.conf" ] || continue
      id=${path##*/}
      valid_id "$id" || continue
      printf '%s\n' "$id"
    done
    if [ -f "$HERE/lib/packages.sh" ]; then
      . "$HERE/lib/packages.sh" || exit 1
      for path in "$MZD_PACKAGE_STORE"/*; do
        [ -d "$path" ] || continue
        id=${path##*/}; valid_id "$id" || continue
        printf '%s\n' "$id"
      done
    fi
    ) | sort -u ;;
  manifest|action)
    [ "$#" -ge 2 ] && valid_id "$2" || fail 'Invalid tweak folder.'
    TWEAK="$HERE/tweaks/$2"
    if [ "$1" = action ] && [ "$#" = 3 ]; then
      case "$3" in uninstall|status)
        . "$HERE/lib/manifest.sh" && . "$HERE/lib/packages.sh" || exit 1
        if [ -e "$MZD_PACKAGE_STORE/$2" ] || [ -L "$MZD_PACKAGE_STORE/$2" ]; then
          shift
          mzd_package_action "$HERE" "$@"
          exit $?
        fi ;;
      esac
    fi
    if [ ! -d "$TWEAK" ] && [ -f "$HERE/lib/packages.sh" ]; then
      . "$HERE/lib/packages.sh" || exit 1
      TWEAK="$MZD_PACKAGE_STORE/$2/package/tweaks/$2"
    fi
    [ -d "$TWEAK" ] && [ ! -L "$TWEAK" ] || fail 'Tweak folder is missing or is a symbolic link.'
    if [ "$1" = manifest ]; then
      [ -f "$TWEAK/manifest.conf" ] && [ ! -L "$TWEAK/manifest.conf" ] || fail 'Manifest is missing or is a symbolic link.'
      library="$HERE/lib/manifest.sh"
      [ -f "$library" ] && [ ! -L "$library" ] && [ -r "$library" ] || fail 'Manifest reader is missing or unreadable.'
      . "$library" || exit 1
      mzd_manifest_load "$TWEAK/manifest.conf" || exit 1
      [ "$ID" = "$2" ] || fail 'Manifest ID does not match its folder.'
      cat "$TWEAK/manifest.conf"
    else
      [ "$#" -ge 3 ] || fail 'Expected tweak and action.'
      case "$3" in install|uninstall|status|run) ;; *) fail 'Unsupported action.' ;; esac
      [ -f "$TWEAK/run.sh" ] && [ ! -L "$TWEAK/run.sh" ] || fail 'Tweak run.sh is missing or is a symbolic link.'
      case "$3" in install|run) ;; *) [ "$#" = 3 ] || fail 'Settings are accepted only for Install or Run.' ;; esac
      # No string evaluation or shell command concatenation. Preserve the
      # worker's stdout, stderr and exit code, including critical exit code 2.
      if [ "$3" != run ]; then
        . "$HERE/lib/manifest.sh" && . "$HERE/lib/packages.sh" || exit 1
        mzd_manifest_load "$TWEAK/manifest.conf" || exit 1
        if [ "$TYPE" != command ]; then
          shift
          mzd_package_action "$HERE" "$@"
          exit $?
        elif [ "$3" = status ]; then
          # Command readiness is checked by Run, not by the menu refresh.
          printf 'uninstalled\n'
          exit 0
        fi
      fi
      if [ "$3" = run ]; then
        . "$HERE/lib/manifest.sh" && . "$HERE/lib/settings.sh" || exit 1
        mzd_manifest_load "$TWEAK/manifest.conf" && [ "$ID" = "$2" ] || exit 1
        settings_action=$3; shift 3
        settings_temp=$(mktemp /tmp/mzd-run-settings.XXXXXX) || exit 1
        trap 'rm -f "$settings_temp"' 0
        mzd_settings_normalize "$TWEAK/manifest.conf" "$@" > "$settings_temp" || exit 1
        MZD_SETTINGS_FILE=$settings_temp; export MZD_SETTINGS_FILE
        cd "$TWEAK" || exit 1
        /bin/sh "$TWEAK/run.sh" "$settings_action"; exit $?
      fi
      cd "$TWEAK" || exit 1
      exec /bin/sh "$TWEAK/run.sh" "$3"
    fi ;;
  start-run|job-status|job-output|job-execute)
    . "$HERE/lib/jobs.sh" || exit 1
    case "$1" in
      start-run) [ "$#" -ge 2 ] || fail 'Expected a tweak ID.'; shift; mzd_job_start "$@" ;;
      job-status) [ "$#" = 2 ] || fail 'Expected a job ID.'; mzd_job_status "$2" ;;
      job-execute) [ "$#" = 3 ] || exit 1; mzd_job_execute "$2" "$3" ;;
      job-output)
        [ "$#" = 3 ] || fail 'Expected job and output stream.'
        mzd_job_path "$2"
        [ -f "$JOB/done" ] || fail 'Job has not completed.'
        case "$3" in stdout|stderr) cat "$JOB/$3" ;; *) fail 'Unknown output stream.' ;; esac ;;
    esac ;;
  event)
    [ -n "${INSTALLER_STATE:-}" ] && [ -d "$INSTALLER_STATE" ] || fail 'Installer session is missing.'
    case "${2:-}" in
      ready) : > "$INSTALLER_STATE/ui-ready" ;;
      ui-error) : ;; # Early browser diagnostics do not declare the UI ready.
      close) : > "$INSTALLER_STATE/ui-close" ;;
      restart)
        [ ! -d "$INSTALLER_STATE/active-job" ] || fail 'A background operation is still running.'
        command -v reboot >/dev/null 2>&1 || fail 'Restart command is unavailable.'
        : > "$INSTALLER_STATE/ui-restart" && : > "$INSTALLER_STATE/ui-close" || fail 'Could not request restart.'
        ;;
      note) ;;
      *) fail 'Unsupported installer event.' ;;
    esac
    printf '%s %s %s\n' "$(date +%H:%M:%S)" "$2" "${3:-}" >> "$INSTALLER_LOG/ui.log"
    ;;
  *) fail 'Usage: installer.sh list | manifest ID | action ID ACTION | event EVENT DETAIL' ;;
esac
