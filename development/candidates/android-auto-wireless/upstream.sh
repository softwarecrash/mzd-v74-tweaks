#!/bin/sh
# Adapter boundary: upstream supplies AA functionality; our controller owns lifecycle.
# No upstream installer is sourced/executed, and no payload is activated yet.
mzd_aaw_pending() {
    printf 'Wireless AA adapter is a development scaffold. Payload integration and verified removal are not implemented; nothing changed.\n' >&2
}
mzd_aaw_status() {
    mzd_aaw_pending
    printf 'unavailable\n'
}
mzd_aaw_preflight() {
    printf 'block\tWireless AA payload integration and verified removal are not implemented yet.\n'
    return 1
}
mzd_aaw_install() { mzd_aaw_pending; return 1; }
mzd_aaw_uninstall() { mzd_aaw_pending; return 1; }
