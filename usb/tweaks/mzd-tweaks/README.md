# MZD Tweaks

Adds interface enhancements, each with configurable settings in the Mazda Applications menu.

Features included:
- **Main Menu Loop**: Wrap between the first and last main-menu icons.
- **Main menu flat layout**: Arrange main menu icons in a horizontal dock across the lower screen and hide the background ellipse arc.
- **Main menu icons size**: Customize the size of main menu icons (Default (100), Small (80), Mini (60)).
- **Main menu icons glow**: Toggle highlight glow behind focused main menu icons. Off hides both factory red glow and custom colored theme glows.
- **Main Menu icons order**: Customize the display order of the 5 main menu icons while preserving left-to-right navigation.
- **List Loop**: Wrap between the first and last selectable items in scrollable lists.
- **List Beep**: Keep factory list autoscroll beeps or mute them.
- **List menu shorter delay**: Reduce list autoscroll delay and intervals for faster multicontroller scrolling.
- **Date in status bar**: Show a short date below a smaller clock. The sub-page lists today's date in each format: weekday (`Wed 18`), month name (`Nov 18`) or month number (`11/18`, two digits). Names and order follow the head unit language (English for unsupported languages). Off keeps the factory clock, which Android Auto and CarPlay always keep. `true`/`false` from an older `settings.js` read as weekday/Off.
- **Color theme**: Customize the accent and highlight color across the Mazda Connect interface (Stock Red (default), Cobalt Blue, Emerald Green, Amber Orange, Neon Violet, Hot Pink, Titanium Silver, Sunset Gold, Electric Cyan). Applied in memory without system patching.
- **Entertainment menu order**: Customize the display order of audio sources in the factory Entertainment menu.
- **Fuel ending time**: How long the ending screen of the [Fuel Consumption Ending Screen](../fuel-consumption-ending/README.md) tweak stays on, 5 to 30 s (default 7 s). The row appears only while version 1.1.0 or later of that tweak is installed; the check runs when the MZD Tweaks view opens. Applies at the next ignition off, no reboot.

## Configuration

MZD Tweaks adds an **MZD Tweaks** menu in **Applications**:
- Each feature can be configured there. Changes are saved and applied to the
  running interface immediately; no reboot is needed after the first one.
- **Main menu flat layout**:
  - Toggles between stock elliptical orbit and horizontal dock layout.
  - In flat layout, the background ellipse arc is hidden and the selected item title moves to the top.
- **Main menu icons size**:
  - Displays the active coin scale (Default, Small, Mini). Selecting opens a subpage with checkmarks.
  - Fully compatible with both elliptical and flat layouts.
- **Color theme**:
  - Displays the active theme name on the right. Selecting it opens a dedicated color
    selection subpage with checkmarks.
  - Selecting any theme instantly applies the new theme across the UI and returns
    to the previous settings menu.
  - Replaces red highlights across main menu coins, glows, list items, sliders,
    buttons, dialogs, and media controls while preserving white text and dark backgrounds.
- **Entertainment menu order**:
  - Displays **Default** or **Custom** depending on whether custom order is active.
  - Subpage provides an **Enable custom order** toggle. When disabled, the factory
    stock audio order is restored.
  - Only available audio sources (detected from hardware and vehicle configuration) appear in the subpage list.
  - Select an audio source item to mark it with a checkmark, then rotate or tilt
    (up/down) the commander knob to move the item up or down in the list.
  - Reordered items are automatically saved upon leaving the subpage (via Back button
    or Home button) accompanied by a "Settings saved" notification once confirmed by the service.
    Global variables and the OEM Entertainment menu are updated immediately once saved
    (via `mzdTweaksResortEntertainment()`, which re-sorts and updates the list in the system app).
- The menu is the only way to change these settings. There is no USB
  pre-configuration file.
- Settings are saved to `/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js`.
  The file is written completely to temporary storage before replacing the saved copy,
  so a failed save keeps the previous settings.
- At boot, `settings.js` sets the saved values before the module service starts.
  The tweak then reads the settings once from the service.

## Installation & Removal

Supported firmware: **74.00.324**.
- **Install**: Select MZD Tweaks in the USB installer and choose **Install**. One
  reboot is required after installation to initialize the shared GUI runtime.
  OEM system files are not modified; all enhancements are applied at runtime in memory.
- **Uninstall**: Select **Uninstall** in the installer. Choose whether to keep or
  remove the saved settings when prompted. Removes the extension cleanly.
