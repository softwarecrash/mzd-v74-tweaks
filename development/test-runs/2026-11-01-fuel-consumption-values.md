# Fuel Consumption Values port validation

- Date: 2026-11-01
- Revision: the commit containing this record; base `8a746e8`
- Tester: patrikguth
- Type: isolated local tests, not physical CMU
- Firmware / region / hardware: 74.00.324 EU (fixtures and full OEM file only)
- Upstream reference: piotrmocko/mzd-v74-tweaks `main`,
  `jci-mods/FuelConsumptionCtrl.js` (MD5 `266f2fb5876cc89287efda4cdc8ad52e`)

| Check | Result |
| --- | --- |
| Manifest validation and automatic installer discovery | Passed; 15 tweaks validated |
| Real worker entrypoint, BusyBox container (as in CI) | 32 checks for this tweak, 307 in total, passed |
| Status, install, uninstall, repeated actions, partial/unsupported states | Passed |
| Failed write, failed rollback, cleanup severity, persistent package | Passed |
| Other contract suites (combinations, packages, recovery, restore, ...) | Passed |
| Label helper from the shipped diff in Node VM, mocked DOM | All six setter calls, one reused label per bar, placement, empty values, narrow-bar font |
| Complete OEM file plus diff, GNU and BusyBox `patch` | Byte-identical to the upstream main-branch file |
| Complete-file reverse patch, edits before and after installing | Original restored exactly; unrelated edits preserved |
| Error-level ShellCheck of run.sh, `node --check` of the patched file | Passed |

The full-OEM check (`tests/tweaks/fuel-consumption-values/test_port.py`) used
the original from a private dump, validated against the manifest fingerprint,
in a disposable directory. No OEM file is committed.

## Limits and unresolved observations

The same JavaScript change (only comments translated) has been running in the
tester's car since 2026-10-12, installed by the older standalone script. This
launcher package itself has not yet been installed on a physical CMU. A vehicle
run should check install, the values on both graphs after a restart, status,
and uninstall back to the stock screen.
