# MZD Tweaks

Adds four interface enhancements, each with an on/off setting in the Mazda Applications menu.

Features included:
- **Main Menu Loop**: Wrap between the first and last main-menu icons.
- **List Loop**: Wrap between the first and last selectable items in scrollable lists.
- **List Beep**: Keep factory list autoscroll beeps or mute them.
- **Shorter Delay**: Reduce list autoscroll delay and intervals for faster multicontroller scrolling.

## Configuration

MZD Tweaks adds an **MZD Tweaks** menu in **Applications**:
- Each feature can be turned on or off there. The change is saved and then
  applied to the running interface; no reboot is needed after the first one.
- The menu is the only way to change these settings. There is no USB
  pre-configuration file.
- Settings are saved to `/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.conf`
  and `settings.js`. Both files are written completely before either one replaces
  the saved copy, so a failed save keeps the previous settings.
- At boot, `settings.js` sets the saved values before the module service starts.
  The tweak then reads the settings once from the service.

## Installation & Removal

Supported firmware: **74.00.324**.
- **Install**: Select MZD Tweaks in the USB installer and choose **Install**. One
  reboot is required after installation to load the patched OEM controls
  (`List2Ctrl.js`, `MainMenuCtrl.js`).
- **Uninstall**: Select **Uninstall** in the installer. Choose whether to keep or
  remove the saved settings when prompted. Factory OEM files are verified and restored.
