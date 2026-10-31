# HUD Street Name: physical CMU test

- Date: 2026-10-31
- Commit: `68a3616` (HEAD); installer 0.9.1 runtime on USB
- Tester: User-reported physical CMU test run
- Type: physical CMU
- Firmware / region / hardware: Europe-region firmware (74.00.324), Polish CMU language; color windshield HUD (`WHUD_color`)
- Tweaks and actions: `restore-file` (restore original vehsettingsApp.js), `hud-street-name` (install, uninstall, simulated unsupported HUD uninstall and status)
- Preconditions: Target `/jci/gui/apps/vehsettings/js/vehsettingsApp.js` had pre-existing modifications (before hash `210910938837664c05ac6fefb3e42ad5`), requiring restoration to OEM original before installing tweak.

| Step | Expected | Actual | Pass/fail |
| --- | --- | --- | --- |
| Restore modified file to original | Restore original `vehsettingsApp.js` from backup (`c7efc0822bd22e2566b6cfb06dbabf0a`) | Restored target file successfully; report saved (`restore-original-19700101-000347-nYRxIA`) | Pass |
| Status before installation | `uninstalled` (or ready to install) | Status verified ready for installation | Pass |
| Install patch | Patch applies cleanly and exposes Street Information setting | Patch applied cleanly (`exit_code=0`); report recorded (`install-19700101-000453-gf9xLV`) | Pass |
| Feature behavior | Menu can be toggled and street names display on color windshield HUD | Street Information setting functional and street names display correctly on HUD | Pass |
| Status after installation | `installed` | Report confirms `target/state` is `installed` | Pass |
| Uninstall patch | Patch is reversed cleanly to OEM baseline | Patch reversed cleanly (`exit_code=0`); report recorded (`uninstall-19700101-000207-iB8JzU`); OEM hash restored | Pass |
| Original behavior restored | Street Information menu is absent again | Verified original behavior restored | Pass |
| Uninstall while HUD no longer compatible | Uninstall succeeds regardless of HUD compatibility check | Uninstall succeeded cleanly (`exit_code=0`, `uninstall-19700101-001048-qZBZAc`) | Pass |
| Status with unsupported HUD | Status reports `unavailable` with reason explaining incompatible HUD | Worker detected unsupported HUD check and reported status `unavailable` | Pass |

## Unsupported-HUD simulation & prerequisites testing

- During testing, the installation script was temporarily modified to simulate an incompatible HUD while on the vehicle (reporting `WHUD_color` as unsupported without changing the console message).
- **Uninstall while HUD incompatible**: Verified that `mzd_check_prerequisites` correctly exempts `uninstall` (`ACTION` is not `status` or `install`), allowing clean uninstallation even if the vehicle HUD hardware is detected as unsupported or changed.
- **Status reporting**: Verified that when an unsupported HUD is detected, status evaluation correctly reports `unavailable` with the corresponding reason on stderr.

## Limits and unresolved observations

- The test was executed on physical CMU running European firmware 74.00.324 in Polish language with color windshield HUD (`WHUD_color`).
- All runs succeeded as planned across file restoration, installation, verification, uninstallation, unsupported HUD uninstall pass-through, and unsupported HUD status reporting.
- CMU system clock was reset to epoch (`1970-01-01`) in session report timestamps.

