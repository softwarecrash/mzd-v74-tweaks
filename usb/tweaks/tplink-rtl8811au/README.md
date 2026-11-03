# TP-Link Archer T2U RTL8811AU Driver

Driver for a **TP-Link Archer T2U v3 / T2U Nano** USB Wi-Fi adapter on CMU **74.00.324**. The
driver loads at every startup and the adapter becomes a second, **5 GHz** radio,
`wlan1`. The built-in radio stays `wlan0`, so the CMU's own Wi-Fi features and SSH
keep working.

This tweak installs the **driver only**. It does not configure or start anything
on `wlan1`: there is no access point and no wireless Android Auto. Wireless Android
Auto also needs an AA Mod release with wireless support, which the
[Android Auto Mod](../android-auto/) tweak does not include yet.

## Hardware

- **TP-Link Archer T2U v3**, USB ID `2357:011f`. Check `Ver:` on the box or the label:
  **v1 is a different chip (MediaTek) and does not work.**
- The Archer T2U Nano (`2357:011e`) and the Archer T2U Plus (`2357:0120`) use the same
  chip and are in the driver's ID table.
- Plug the adapter into the stock Mazda USB hub. The hub only has power with
  ACC/ignition on, so the adapter shows up only then.

The installer details say whether a supported adapter is connected. This is only
information: installing with the adapter unplugged or ACC/ignition off is fine.

## Install and check

1. Open **Driver > TP-Link Archer T2U RTL8811AU Driver**, select Install, then exit
   the installer and restart the CMU.
2. With ACC/ignition on and the adapter plugged in, the driver writes its latest
   startup result to `/tmp/mzd-tplink-rtl8811au-boot.log` (at most 4 KiB). Over SSH:

   ```sh
   cat /tmp/mzd-tplink-rtl8811au-boot.log
   ```

   `result=ok` means the driver loaded. `wlan1` in `wlans=` means the adapter was
   found. A line without `wlan1` is normal if the CMU started with ACC/ignition
   off. On any other result, the reason is in that line and a `dmesg` extract is
   saved as `/tmp/mzd-tplink-rtl8811au-dmesg.log` (at most 40 lines / 8 KiB).
   Logs are overwritten, stay in RAM and disappear on reboot. A successful load
   removes an older failure dump. Uninstall and Restore originals remove both
   owned log files; unrelated files and linked paths are not deleted.

Uninstall removes the boot entry and the files. Restart the CMU afterwards.

## Installed files

- `/data_persist/wl/` (persistent storage, survives firmware updates and a
  factory reset):
  - `rtl8812au.ko`: the driver module
  - `load-wlan1.sh`: loads the module at startup (executable)
  - `dongle.conf`: the driver's channel plan
- `/jci/sm/sm.conf` and `/jci/sm/sm_WCP.conf`: a `load_wlan1` boot service, right
  after the stock `start_wifi` service. It starts after `start_wifi` and `stage_usb`,
  so the built-in radio keeps `wlan0` and the adapter gets `wlan1`. The service never
  resets the CMU (`reset_board="no"`).

Installing is refused, without changing anything, when:

- a `load_wlan1` boot entry is already in either service configuration, or
  `/data_persist/wl` already exists. Both are left behind by a driver installed by
  hand with the cmu150-rtl8811au install guide. Remove that installation as described
  in the guide's Uninstall section first.
- the CMU's `cfg80211.ko` is not the stock 74.00.324 module. The driver must match
  that exact module; on any other one it can load and then hang the CMU.

## Regulatory

The driver uses a fixed regulatory domain, whatever the country: 2.4 GHz channels
1-13 and 5 GHz channels 36-48. Make sure these channels are permitted where you use
it.

## Upstream provenance and source

- Driver: [cmu150-rtl8811au](https://github.com/PingusPepan/cmu150-rtl8811au) by PingusPepan.
- Release: [v1.0.0](https://github.com/PingusPepan/cmu150-rtl8811au/releases/tag/v1.0.0),
  commit `f38166f5757aa88f2e4a15c60579caa0f77739ad`.
- Release archive `cmu150-rtl8811au-1.0.0.tar.gz`, SHA256
  `862112dcada1582716927fdf0d18c11b9f37f155e13cadd1f238fadfc9d8cf66`.
- `assets/rtl8812au.ko` and `assets/dongle.conf` are the release files, unchanged.
  `load-wlan1.sh` has a small local adaptation for bounded RAM logs and safe log
  paths, reproduced and checked by `tools/tplink_loader.py`. Driver-loading and
  radio behavior are unchanged. The boot entry is the release's service from its
  `sm.conf.snippet`, unchanged.
- License: GPL-2.0-only, included as `LICENSE`. The complete source of this build
  is the repository at the commit above.
