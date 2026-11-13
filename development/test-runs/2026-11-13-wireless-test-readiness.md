# Wireless AA candidate: normal-entrypoint test readiness

Date: 2026-11-13. Firmware: 74.00.324. Driver dependency: tplink-rtl8811au 1.0.3.
Source: local feature/android-auto-wireless-installer candidate.

The candidate now declares components.tsv and routes normal run.sh/reset.sh to
the shared transaction. Fixtures no longer replace the candidate entrypoint.
The Docker mixed-package lifecycle passes with the actual pending TP-Link source:
Install/Update/Uninstall, dependency gates, config retention, runtime-stop failure,
Restore preparation, write rollback, unrelated SM changes and final cleanup.
Read-only preflight fixtures reject missing AP mode, unavailable channel, missing
radio identity and invalid config before changing targets. ShellCheck, syntax,
standalone lifecycle/config/shutdown and general bundle checks also pass.

A private complete test package is prepared locally with Wireless enabled,
SSID MazdaAA-Test, channel 36 and a random private password. The published template
remains disabled with no password. The package contains current helpers, driver
and the normal candidate; developer import scripts are excluded from the USB.
No private credential is included in this report or the repository.

The package was temporarily staged in RAM on the real test CMU. Normal preflight
and validate-install passed: supported native module hashes, wlan1 driver, AP mode
and selected 5 GHz channel. Native Wiphy association is resolved through the
wlan1 phy80211 symlink, since iw dev info omits it on this driver. Direct deep
worker status reported uninstalled, confirming the forward/inverse patch plan
accepts the unit's current targets with its existing other tweaks.

All five system target hashes were unchanged afterwards; RAM probe files were
removed. No installation, service start/stop, interface change, reboot or USB
update occurred. An active wireless session, loaded-shim Uninstall and post-reboot
cleanup remain the next controlled CMU acceptance steps. The optional bench-only
USBHubScheme signal is not installed as a persistent boot change.
