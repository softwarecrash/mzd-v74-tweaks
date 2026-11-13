# Wireless AA ordinary removal preparation

Selected strategy: stop owned runtime, remove files through the normal package
controller, then recommend reboot. No native Mazda service restart is attempted.

## Isolated container evidence

The pure lifecycle checks cover exact argv ownership, listener-first TERM,
bounded escalation, stubborn-process refusal and preservation of unrelated SSH
and AP processes. Shell cleanup checks use fake network commands and verify that
only our inserted wlan1 rule is deleted, wlan0 is untouched and cleanup failure
retains runtime config. The shared package fixture covers a failed shutdown
before any file removal, explicit retry, Update, config preservation, full
removal, original metadata, inverse patches, unrelated SM changes and rollback.
No native ARM payload or live networking is executed by these fixtures.

## Factory inspection probe

Test CMU firmware 74.00.324, factory Lua 5.1/POSIX. The lifecycle module and CLI
were temporarily staged in RAM and run in read-only inspect mode. Inspection
completed successfully and found no wireless-owned processes. Temporary probe
files were removed. No installed package, service or network state was changed.

## Limits

A real active Wireless AA shutdown and post-Uninstall reboot remain pending.
Mapped .so code and in-memory hooks remain until reboot; there is no dlclose or
native service restart. Public candidate mutations remain blocked until physical
acceptance. Shared upstream diagnostic logs are not erased.
