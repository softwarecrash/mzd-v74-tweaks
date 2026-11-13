# DriveDash 0.1.7: five-skin bench acceptance

- Date: 2026-11-12 (Europe/Berlin)
- Hardware: physical CMU150 bench unit, firmware 74.00.324A, no vehicle sensors
- Source: `9eeae8d` on `feature/issue-62-speedometer`
- Package: DriveDash 0.1.7; shared GUI SDK 0.6.0

Installed through the USB package controller, independently compared all deployed
DriveDash assets with the source package, then rebooted. Installed status and the
shared GUI service were healthy; its startup log contained no error. Existing
SSH and TP-Link installations were retained.

The operator confirmed that DriveDash opens, tapping the instrument canvas opens
Settings, and all five designs display correctly: OEM Style, Classic, Motorsport,
Sakura and Midnight Rose. Overall appearance and operation were accepted.

Limits: the bench has no connected vehicle sensors. This does not verify live
high-speed values, GPS-course accuracy/retention while driving, HUD or a physical
memory/performance benchmark. High-speed layout at 288-360 km/h was checked in
the browser simulator separately. Phone/camera return and uninstall were not
repeated in this run.
