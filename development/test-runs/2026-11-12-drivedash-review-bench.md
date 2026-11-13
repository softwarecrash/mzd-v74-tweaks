# DriveDash review corrections: bench check

Date: 2026-11-12. Firmware: 74.00.324. Source: local review corrections on
feature/issue-62-speedometer, based on 9eeae8d. Shared GUI SDK: 0.6.0.

Installed through the real worker after preserve-config uninstall. Existing
settings were byte-identical afterwards. All deployed assets matched the local
candidate. DriveDash, SSH and TP-Link status reported installed. USB contains the
same candidate; other tweaks and shared helper files were not replaced.

After reboot, the actual shared Lua service successfully answered preferences
and four sample requests. The service log was empty. GPS did not provide a valid
position on the bench; real course behavior still requires a car test.

The owner confirmed that startup immediately uses the saved language and design,
and that Settings and all five skins open correctly on the physical unit. Settings retry failures and
render-exception recovery were tested in isolated container fixtures, not induced
on the physical unit. No artificial CMU service failures were introduced.
