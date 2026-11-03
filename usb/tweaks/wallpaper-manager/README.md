# Wallpaper Manager

Open Applications > Wallpaper Manager to import, select and rotate backgrounds.
The tweak includes no images.

## USB images

Create `wallpapers` in the USB root and put PNG files there. Only immediate files
in that directory are listed; other USB assets and subdirectories are ignored.
Required: PNG, exactly 800 x 480 pixels, maximum 1 MiB per image. JPEG and animated
PNG are not supported. Missing-folder instructions appear in the menu. Preview
follows the highlighted image. Import does not apply the image or include it in
slideshows automatically; duplicate contents are allowed.

Gallery > image offers Use as background, Include in slideshow and Delete image.
The selected image previews behind its menu. Deletion requires confirmation.
Slideshow offers Off or 5/10/30/60/120/300 seconds. Include images through Gallery;
Off retains the current background. Gallery, Slideshow, Import from USB and
Use original background are available directly in the main menu. Selecting
Use original background applies the Mazda background without opening a submenu.

## Installation and lifecycle

Install with the normal installer and restart. Shared GUI support is installed
only when needed and reused by other consumers, including Tetris. Closing the
view leaves the resident slideshow running. The generic loopback service handles
bounded imports and persistent settings; it adds the shared startup pair to
`/jci/scripts/stage_wifi.sh` without changing native MMUI binaries or OEM GUI JS.
No compiled helper is bundled; the service uses factory Lua/POSIX/LuaSocket.

User data lives under `/tmp/mnt/data_persist/mzd-tweaks/gui-data/wallpaper-manager`.
Imported files/settings work without USB. Uninstall removes owned hooks/service
support when their last consumer is removed. The manifest declares the entire
module data directory as mutable config, including imported images, gallery
selection, slideshow settings and ownership markers. Normal uninstall removes
this directory; `uninstall --preserve-config` retains it. The installer asks
whether to keep this data on uninstall, and Update always keeps it. Existing
files are never overwritten during installation. No images are bundled.
It does not delete or adopt unknown data directories. Imports/settings use
journaled updates and bounded free-space/gallery limits (50 images, 50 MiB).
Original background: `/jci/gui/common/images/background.png`.

## Language

The optional `gui_translations` script covers all 41 distinct Mazda 74.00.324
locale codes. The view chooses language once on opening; no language polling or
settings writes occur. Missing text silently falls back to English/existing text.
Filenames stay unchanged. Backend protocol/diagnostics remain English; user-facing
error categories are translated. Installer metadata is independent of app text.

## Development and validation

Backend Lua lives in `assets/service`. Resident sources and dictionary builder
are in `development/wallpaper-manager`; run its `build.py` after source edits.
Run the Node suites in `tests/tweaks/wallpaper-manager` and the real package
profile `python tests/contract/test_gui_extensions.py --wallpaper-only`.
Shared lifecycle/API: [GUI extensions](../../../development/Gui-extensions.md).
Physical CMU behavior/languages have been user-tested; font coverage and wording
in every locale have not all been visually reviewed. Crash recovery has isolated
fault-state coverage; arbitrary physical power-cut behavior is not proven.
