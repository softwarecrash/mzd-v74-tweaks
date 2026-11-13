# Wireless AA: real bench lifecycle

Date: 2026-11-13. Firmware: 74.00.324 EU. Source: local
feature/android-auto-wireless-installer candidate 0.1.0; TP-Link driver 1.0.3.

Normal preflight and Install succeeded. Installed payload hashes and permissions
matched the staged package. After reboot the AP, DHCP, listener and both native
shims started. The bench-only RAM USBHubScheme signal enabled the native AA port;
this is not a persistent package hook. The phone established TCP AA and the user
confirmed that Android Auto appeared and worked.

Normal Uninstall was performed with the wireless session active. It succeeded
without rebooting itself. Owned processes stopped, the owned INPUT rule and RAM
AP config were removed, and wlan1 returned to managed/down. The payload and
mutable config were removed. All five modified system targets matched their
pre-install hashes. Driver files and GUI registry hashes remained unchanged.

After the requested reboot, SSH was reachable, the AA listener port was absent,
and payload, config, runtime markers and package registration were absent. SSH,
TP-Link and DriveDash registrations remained present, with the baseline hashes
still matching. Shared original backups needed by other installed tweaks and
upstream shared diagnostics are intentionally retained.

Limits: bench connection and active-session removal, not a vehicle/audio/calls,
wired-AA, cold-reconnect or radio-return acceptance test. Raw logs, credentials
and original system snapshots remain private. Nothing was pushed.
