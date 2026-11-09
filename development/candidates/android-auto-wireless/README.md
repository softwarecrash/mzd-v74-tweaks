# Android Auto Wireless installer adapter

Development candidate on `feature/android-auto-wireless-installer`. It is outside
`usb/` and is not discovered by the released installer. No CMU deployment is
performed. Its entrypoints retain the normal `usb/tweaks/<id>` layout for later
integration and isolated tests.

## Boundary

Pingus' OEM AA Mod supplies the wireless implementation. This adapter will use
our package controller for installation, saved removal, Update, configuration,
reporting and cleanup. It must not call the upstream standalone installer or
restore whole service-manager files over SSH/GUI/driver changes.

- `manifest.conf`: package identity, firmware, common SM lock, conflict with the
  existing `android-auto` tweak and declaration of mutable `libpatch.conf`.
- `run.sh`: public worker interface and read-only preflight.
- `upstream.sh`: adapter boundary, currently refusing all modifications.
- `reset.sh`: reserved reset interface; no installed payload is claimed.
- `upstream.json`: provenance of the already tested baseline.
- `upstream-files.tsv`: import plan, not an executable component inventory.

Status is `unavailable`; preflight explains the missing implementation. Install
and Uninstall are blocked. Copying vendor binaries into this folder does not
silently enable installation. No binary, OEM dump, private password, pairing data
or vehicle-specific patch has been copied into this candidate.

## Integration steps

1. Import a reviewed pinned upstream payload with its license and attribution.
   Keep the two wireless shims; navigation/HUD is outside this initial scope.
2. Build a real component inventory: service-scoped preload entries in both
   `/jci/sm/sm.conf` and `sm_WCP.conf`, inverse patches for both
   `/etc/aap_system_attributes*.xml` files and `/jci/bds/BdsConfiguration.xml`,
   and verified helper/script payloads. Preserve unrelated edits.
3. Keep the WLAN driver separate. Check the selected interface, adapter and AP /
   supported 5-GHz channel capability before advertising wireless readiness.
   Missing hardware must not break wired AA or SSH. No blanket driver-folder deletion.
4. Reuse the declared config lifecycle: initialize only a missing config, retain
   user edits during Update, and remove config only on full Uninstall. Start with
   wireless enable, SSID, WPA2 password and verified channel choices. Do not expose
   interface/subnet settings until upstream scripts derive them from one source.
5. Implement owned-process shutdown and loaded-shim handling before enabling
   Update/Uninstall. The previous private test used disable, reboot, then cleanup;
   this is not yet a one-action package-manager removal. Workers must not reboot.
6. Keep the RAM-only USBHubScheme aid off by default. It enabled the previous
   bench test without an AA-capable USB hub; it is not an unconditional boot hook.
7. Test package lifecycle and missing-adapter paths in containers, then on the
   bench CMU. Vehicle acceptance follows a working installer with Update/removal.

The prior standalone test established Bluetooth pairing, AP/DHCP, TCP projection
and a visible AA screen on firmware 74.00.324 EU with TP-Link 2357:011e and driver
1.0.3. Its removal was verified. That result does not validate this adapter,
audio/calls/navigation, cold reconnect, or return-to-AA behavior after choosing
Mazda radio.

## Later release workflow

Track a pinned release/artifact from Pingus' repository, validate provenance and
required contents, import only selected payloads/license into this adapter, and
open an Update PR. Keep the tweak version separate from the upstream version.
Never download or install a moving `latest` payload on the CMU. No automatic merge,
release or device deployment. Workflow implementation is deferred.

Sources: [upstream PR10](https://github.com/PingusPepan/oem-aa-mod/pull/10),
[tested artifact run](https://github.com/PingusPepan/oem-aa-mod/actions/runs/42317350287).
