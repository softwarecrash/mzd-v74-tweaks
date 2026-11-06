# Speedometer bench installation

- Date: 2026-11-06 (Europe/Berlin)
- Commit: feature/issue-62-speedometer working tree, Speedometer 0.1.0
- Tester: owner (display/commander), Codex (SSH checks)
- Type: physical bench CMU, no vehicle sensors/CAN connection
- Firmware / region / hardware: 74.00.324, EU, CMU150
- Preconditions: only SSH installed; no existing shared GUI provider.

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| USB staging | exact new package; unrelated files retained | 20 package files verified; existing WLAN helper overrides retained | Pass |
| install | installed without UI/SSH disruption | installer and deep status successful; SSH remained installed | Pass |
| service preferences | defaults readable through actual Lua HTTP service | auto language/speed/temperature returned | Pass |
| reboot | CMU and services return | new boot ID; Opera, SSH and GUI service running | Pass |
| view/settings | instrument opens; commander opens native menu | owner confirmed both work | Pass |
| preference persistence | manual mph survives close/reopen | owner confirmed; actual config contains speedUnit=mph | Pass |
| errors | no module errors or unintended restart during test | GUI service log empty, no relevant errors in reviewed GUI log tail; boot ID stable | Pass |
| uninstall | remove owned UI/runtime/data | module, config directory, receipts, provider, GUI hook/runtime/registry removed; SSH retained | Pass |
| reboot after uninstall | clean original startup without GUI service | startup bytes match pre-install state; no GUI service process or RAM directory | Pass |

The original startup backup fingerprint remained unchanged. The shared startup
hook was added beside the existing SSH hook. Update and saved-package removal without USB assets were tested in isolated
fixtures; ordinary full uninstall was also verified on this physical CMU. Vehicle scaling, CAN freshness and fuel calibration remain
unverified without a vehicle. Package was fully uninstalled and the CMU restarted. The updated USB installer
package remains available; installation reports stay on the USB. Unrelated old
Tetris data was left untouched. The mpg label now omits the US suffix.
Raw installation reports and startup backup remain private.
