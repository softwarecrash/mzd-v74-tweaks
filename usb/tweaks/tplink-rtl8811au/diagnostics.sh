#!/bin/sh
# Used only after successful removal or Restore originals, never by status.
driver_diagnostics_remove() (
    [ ! -L /data_persist/log ] || exit 1
    for log in /data_persist/log/mzd-tplink-rtl8811au-boot.log /data_persist/log/mzd-tplink-rtl8811au-boot.log.1 /data_persist/log/mzd-tplink-rtl8811au-dmesg.log; do
        [ ! -e "$log" ] && [ ! -L "$log" ] && continue
        [ -f "$log" ] && [ ! -L "$log" ] && [ "$(stat -c %h "$log")" = 1 ] && rm -f "$log" || {
            printf 'Cannot remove owned driver diagnostic: %s\n' "$log" >&2
            exit 1
        }
    done
)
