# Wireless AA and TP-Link: virtual package lifecycle

Date: 2026-11-13. Environment: repository Docker runner, synthetic CMU targets.
Wireless candidate: feature/android-auto-wireless-installer, local work in progress.
Driver: tplink-rtl8811au 1.0.3 from the pending driver worktree (b413fc5).
The driver is supplied as an explicit fixture source, not bundled into Wireless.

Command:

```sh
sh tools/test-in-container.sh run python tests/contract/test_wireless_transaction.py --driver-source /path/to/tplink-rtl8811au
```

The real package controller, bundle helpers, driver entrypoint and prepared
Wireless transaction are used. Mounts, watchdog, USB detection and process/network
operations are fixtures. ARM libraries and the kernel module are copied but never
loaded; no radio, Bluetooth or phone projection is exercised.

Passed: Wireless refuses installation without its managed driver dependency;
driver install and version-only Update; Wireless install and executable modes;
driver removal refusal while Wireless is installed; failed runtime shutdown
retaining package files; Wireless Update preserving changed config; preserved
Uninstall/reinstall and full removal; driver module and load_wlan1 records remain
through Wireless removal; publication failure rollback; final driver removal
restoring original bytes and timestamps with no .org or payload leftovers.

A second mixed lifecycle preserves a later unrelated SM change. In that case
the changed SM target keeps its original .org deliberately, as specified by the
existing original-state cleanup policy. No foreign change is overwritten.

The isolated driver fixture temporarily raises its version to test Update; the
actual driver source and CMU/stick are unchanged. Wireless now declares
requires=tplink-rtl8811au for this first supported integration.

This is package/lifecycle evidence, not a real driver load, factory kernel boot,
active AP shutdown or Wireless AA acceptance. Physical bench testing remains.
