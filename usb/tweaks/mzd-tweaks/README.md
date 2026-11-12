# MZD Tweaks

Combine essential JavaScript interface enhancements into one bundle with live in-flight toggles directly in the Mazda Applications menu.

Features included:
- **Main Menu Loop**: Wrap between the first and last main-menu icons.
- **List Loop**: Wrap between the first and last selectable items in scrollable lists.
- **List Beep**: Keep factory list autoscroll beeps or mute them.
- **Shorter Delay**: Reduce list autoscroll delay and intervals for faster multicontroller scrolling.

## Configuration

Unlike static patches, MZD Tweaks provides an **MZD Tweaks** menu in **Applications**:
- Features can be turned on or off in real time without rebooting the CMU.
- Toggles apply in flight to the running Opera browser immediately.
- Settings are saved to `/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.conf` and `settings.js`.
- At boot, settings are loaded directly into browser global variables without additional service overhead.

### USB Pre-Configuration
You can pre-configure default settings on your computer before installation by placing a `settings.conf` file on your USB drive under `user/mzd-tweaks/settings.conf`:

```ini
main_menu_loop=true
list_loop=true
list_beep=false
short_delay=true
```

## Installation & Removal

Supported firmware: **74.00.324**.
- **Install**: Select MZD Tweaks in the USB installer and choose **Install**. A single reboot is required after initial installation to load the patched JavaScript templates into Opera.
- **Uninstall**: Select **Uninstall** in the installer. Choose whether to keep or remove user configuration when prompted. Factory OEM files are verified and restored.
