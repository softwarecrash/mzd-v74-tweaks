# Fuel Consumption Ending Screen

At ignition off, show the Fuel Consumption screen with all its data for 7 s.

- **Car equipped with i-stop:** the stock firmware always shows the i-stop
  effectiveness screen here. This tweak shows the Fuel Consumption screen
  instead, with its graphs filled.
- **Car without i-stop:** the stock ending screen already is the Fuel
  Consumption screen, so the tweak only makes it 7 s long instead of 5 s.

The head unit decides from the *equipped* features reported by the EEM service,
not from whether i-stop is switched on right now. Turning i-stop off with its
button makes no difference. The ending screen must be enabled in the Fuel
Consumption settings, as with the stock screen.

| Stock (i-stop car) | Tweak |
|---|---|
| ![stock](../../../images/fuel-ending-stock.jpg) | ![tweak](../../../images/fuel-ending-tweak.jpg) |

The tweak installs two parts in one step:

- a JavaScript patch of `/jci/gui/apps/ecoenergy/js/ecoenergyApp.js`
  (switches the screen, 7 s timer);
- the `fuel_ending_mmui.so` shim for the jciMMUI service, stored in
  `/tmp/mnt/data_persist/mzd-tweaks/shims/fuel-consumption-ending/`. It makes
  the MMUI request the fuel consumption data for the ending screen. On a car
  without i-stop it passes everything through unchanged.

Supported firmware: **74.00.324**. Select the tweak in the installer, read its
description, and choose **Install** or **Uninstall**. Restart the CMU after changing
this tweak; the installer offers Restart when leaving.

If the older `fuel-consumption.sh` installer was used, uninstall its Fuel ending
screen and Fuel ending data parts first. Installation is refused while another
copy of the shim is referenced or ecoenergyApp.js contains a different change.

Normal uninstall removes this tweak while preserving unrelated changes where
possible. Restore originals resets all patches on affected files, not just
this tweak.

The jciMMUI service has `reset_board=yes`: a library/process failure can restart
the CMU. Never reboot after a critical installer error; inspect the USB report
first. Action reports and `run.log` are saved on the originating USB under
`reports/fuel-consumption-ending/<action>-<timestamp>-<unique>/`.

Source: `src/mazda/patches/fuel_ending_mmui/` in this repository. Build with
`sh build/build.sh`; see
[the developer notes](../../../development/tweaks/fuel-consumption-ending.md).
