# Android Auto Wireless: bench-test candidate

Working branch: `feature/android-auto-wireless-installer`. This candidate is kept
outside the released `usb/` tree. Copy it to `usb/tweaks/android-auto-wireless/`
in a prepared test package. It now uses the normal `run.sh` and package controller;
there is no test-only replacement worker or call to the upstream installer.

## Scope and prerequisites

Pinned OEM AA Mod PR10 payload: source `43d7ba1`, artifact `f646816`; provenance
and archive fingerprint are in `upstream.json`. Original upstream binaries and
scripts, license and attributions are retained under `assets/upstream/`.
`import-upstream.py ARCHIVE` imports only the pinned six payload files, never a
private config, OEM replacement file or moving latest release.

The first version requires the separately installed `tplink-rtl8811au` driver
and conflicts with `android-auto`. No navigation/HUD shim is included. Supported
native `aap_service` and `blmjciaapa.so` fingerprints are checked before mutation.
Both SM files must contain the driver startup record. Foreign AA preloads are
refused, not adopted. Install checks supported firmware again under the locks.

Preflight validates config, required tools and native files. When Wireless is on,
it checks that wlan1 is bound to rtl8812au, resolves its radio through the sysfs
phy80211 link, and checks AP mode plus the configured available 5 GHz channel.
Queries have a bounded timeout; no interface is raised or AP launched by preflight.
When Wireless is off, absent dongle/AP capability is not a blocker to installing
an inactive configuration. The managed driver dependency still applies.

## Configuration

`config.libpatch.path` in the manifest declares mutable `libpatch.conf` next to
the libraries in `/tmp/mnt/data_persist/mzd-tweaks/shims/android-auto-wireless/`.
It is initialized from `assets/libpatch.conf` only when absent. Update preserves
it; Uninstall uses the installer's Keep settings choice. Config changes are not
compared against immutable package files.

The public template starts with Wireless off and no password. For a bench test,
edit the template before first installation: `wireless = true`, `aa_ssid`,
`aa_psk` and `aa_channel`. Enabling requires an 8-63 printable ASCII WPA2 password
and channel 36, 40, 44 or 48. SSIDs are limited to 32 bytes. Control characters,
`#` and surrounding whitespace are rejected. Existing configs take precedence
when reinstalling with retained settings. A native settings UI is not included yet.
The pure Lua adapter updates only these four fields and preserves other AA keys.
Its validation CLI never prints SSIDs or passwords.

Interface wlan1, AP address 192.168.53.1, DHCP range 192.168.53.20-254, TCP port
5277, WPA2 and visible SSID remain internal fixed values. There are no IP/interface
controls. The listener supports path overrides, so no script is placed in the
shared driver wl directory and no binary path is patched.

## Install, Update and removal

`components.tsv` declares the two libraries, executable helpers/runtime scripts,
Lua lifecycle/config helpers and five reversible patches (both SM files, both AA
attribute files and Bluetooth configuration). The shared bundle publishes payload
before references and removes references before payload. Original metadata,
backups, locks, reports and rollback use the existing package controller.

The shutdown callback runs after planning/write prerequisites, under the locks.
It targets only owned listener/handler/scripts and hostapd/udhcpd with the exact
AA config arguments. It sends bounded TERM/KILL, rechecks process birth time,
and aborts file removal if shutdown fails. Unrelated SSH, wlan0, other APs, the
WLAN driver and native Mazda services are untouched. Only an INPUT rule recorded
as inserted by this startup script is removed. wlan1 returns to managed/down;
known owned RAM configuration is deleted. A RAM-only disabled marker prevents
recovery relaunch until reboot. Reset/Restore prepare also stops owned runtime.

Recommended sequence: install, reboot, connect/test Wireless AA, uninstall, then
reboot. The worker never reboots itself. Linux keeps already mapped .so code and
hooks in memory until the native processes end at reboot; it is not dynamically
unloaded. The pinned shims cache config and write hostapd config once per process.
Update also requires reboot. Shared upstream `/data_persist/log/aaw-boot.log`
diagnostics are retained rather than erasing other consumers' log entries.

## Test evidence and remaining acceptance

The normal entrypoint passes isolated package tests for Install/Update/Uninstall,
mutable config, executable modes, failed-shutdown retention, write rollback and
unrelated SM edits. The mixed test accepts `--driver-source /path/to/tplink-tweak`
and exercises the real separate driver package, dependency refusals, shared
backups and last-consumer cleanup. AP preflight rejection paths and scoped process/
network cleanup are tested with fixtures. No ARM code or kernel driver is loaded
by these package fixtures.

The normal candidate completed a real bench Install, reboot, visible Wireless AA
connection, active-session Uninstall and second reboot on firmware 74.00.324 EU
with TP-Link 2357:011e. Factory Lua/POSIX shutdown stopped the owned processes,
removed the owned firewall rule and returned wlan1 to managed/down before payload
removal. All five target hashes matched their pre-test values afterwards and after
reboot; the payload, config and package registration were removed. SSH, the driver
and DriveDash were retained. See the 2026-11-13 bench lifecycle test record.
Audio/calls, cold reconnect, wired AA and return to AA after selecting Mazda radio
remain separate vehicle checks.

The bench lacked an AA-capable USB hub in the previous test. Its RAM-only
USBHubScheme aid is not enabled as a persistent startup hook by this package.
No automatic release, download, merge or device deployment is implemented.
