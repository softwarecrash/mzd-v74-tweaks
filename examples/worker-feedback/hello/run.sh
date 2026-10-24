#!/bin/sh
# Minimal command worker: no installation state, system changes or GUI calls.
# The launcher may label its button OPEN and invoke this worker with `run`.
if [ "$#" -gt 1 ]; then
  printf 'Expected one action. Usage: sh run.sh run\n' >&2
  exit 1
fi

case "${1:-}" in
  run)
    # stdout is the message captured and displayed by the launcher.
    printf 'HELLO\n'
    exit 0
    ;;
  ''|-h|--help)
    printf 'Usage: sh run.sh run\n'
    exit 0
    ;;
  *)
    # No artificial install/uninstall/status actions for a one-shot command.
    printf 'Unsupported action. Use: sh run.sh run\n' >&2
    exit 1
    ;;
esac
