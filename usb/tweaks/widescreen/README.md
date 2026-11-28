# Widescreen

Compensate horizontal stretching on 10.25-inch and 12.3-inch widescreen displays using a condensed font (*Saira ExtraCondensed*) and icon scaling.

## What it does

- Installs `SairaExtraCondensed-Regular.ttf` (`normal`) and `SairaExtraCondensed-Medium.ttf` (`bold`) into `/jci/fonts/CHN/` so CMU Opera loads them natively.
- Installs `widescreen.css` into `/jci/gui/common/css/widescreen.css`.
- Patches `/jci/gui/index.html` to load `common/css/widescreen.css` on boot and adds `class="widescreen"` to `<body>` so other tweaks can target `body.widescreen`.
- Applies `scaleX(0.67)` on Main Menu icons and `scaleX(0.63)` on bottom button, status bar, and notification icons.

## Why fonts are installed to `/jci/fonts/CHN/`

- On the CMU, `/jci/opera/opera_home/opera.ini` sets `Enable Webfonts=0`, which disables `@font-face` webfont loading in Opera 12.
- Additionally, Opera 12 enforces `file://` same-origin restrictions on `@font-face` across separate directory trees (such as `file:///jci/gui/index.html` loading fonts from `/data/integration/`).
- On the vehicle, JCI Opera runs with `OPERA_FONTS=/jci/fonts/CHN` and `FREETYPE_FONT_SET=YES`, so Opera scans `/jci/fonts/CHN/` non-recursively at boot and registers all `.ttf`.

## Installation & Removal

Supported firmware: **74.00.324**.

- **Install**: Select **Widescreen** in the USB installer and choose **Install**. Reboot the CMU to apply.
- **Uninstall**: Select **Uninstall** in the installer and reboot to restore the stock `/jci/gui/index.html` and remove the added CSS and font files.
