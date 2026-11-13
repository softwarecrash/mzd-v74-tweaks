# DriveDash Venom bench deployment

Date: 2026-11-12. Test CMU firmware: 74.00.324. Shared GUI SDK: 0.6.0.
Candidate: local Venom skin changes on feature/issue-62-speedometer.

The isolated Docker preview checks pass, including ES5 parsing, skin registration,
lazy artwork loading and view lifecycle. The owner accepted the emulator layout.

The USB DriveDash package was backed up, then replaced with the candidate.
The real worker uninstalled with --preserve-config and installed successfully.
Preferences remained byte-identical. All installed assets matched the candidate;
DriveDash, SSH and the TP-Link driver reported installed. The CMU was rebooted.

After reboot SSH reconnected, the shared GUI service was running and its log
was empty. The owner confirmed that the artwork, tooth-shaped scales, fuel gauge and text
are visible and working on the physical display. Real-car acceptance is pending. This
bench has no vehicle sensors; the deployment does not establish vehicle readings.

The small author credit was added after this physical display check.
