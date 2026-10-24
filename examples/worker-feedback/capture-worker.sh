#!/bin/sh
# Real shell-side capture for the existing launcher architecture.
# Requires the complete repository on writable startup USB storage.
set -u
SELF=$(readlink -f "$0") || exit 1
ROOT=$(dirname "$(dirname "$(dirname "$SELF")")")
ACTION=${1:-}
if [ "$#" != 1 ]; then
  echo 'Usage: sh capture-worker.sh <status|install|uninstall>' >&2
  exit 1
fi
case "$ACTION" in
  status|install|uninstall) ;;
  *) echo 'Unsupported action.' >&2; exit 1 ;;
esac
WORKER="$ROOT/tweaks/main-menu-loop/run.sh"
[ -f "$WORKER" ] || { echo 'Worker not found.' >&2; exit 1; }
mkdir -p "$ROOT/reports" || exit 1
RESULT_DIR=$(mktemp -d "$ROOT/reports/launcher-feedback.XXXXXX") || exit 1

# Save the exit code immediately. Never use the status of cat/printf instead.
if sh "$WORKER" "$ACTION" > "$RESULT_DIR/stdout.txt" 2> "$RESULT_DIR/stderr.txt"
then
  CODE=0
else
  CODE=$?
fi
if ! printf '%s\n' "$CODE" > "$RESULT_DIR/exit-code.txt"
then
  echo 'Cannot record worker result; inspect the reports before continuing.' >&2
  [ "$CODE" = 0 ] && CODE=1
fi

# A shell launcher can replace cat with its own jci-dialog presentation.
if [ "$CODE" = 0 ]
then
  cat "$RESULT_DIR/stdout.txt"
else
  cat "$RESULT_DIR/stderr.txt" >&2
  if [ ! -s "$RESULT_DIR/stderr.txt" ]; then
    printf 'Worker failed (exit %s).\n' "$CODE" >&2
  fi
fi
printf 'Captured result: %s\n' "$RESULT_DIR" >&2
exit "$CODE"
