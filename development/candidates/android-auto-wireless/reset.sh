#!/bin/sh
# A scaffold never owns installed payloads. It cannot adopt/reset an old manual test.
set -u
[ "$#" = 1 ] || exit 1
case "$1" in
    check) exit 0 ;;
    prepare|finish)
        printf 'Wireless AA reset is not implemented; no files changed.\n' >&2
        exit 1 ;;
    *) exit 1 ;;
esac
