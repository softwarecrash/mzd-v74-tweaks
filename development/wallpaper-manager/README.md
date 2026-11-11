# Wallpaper Manager sources

Runtime: `usb/tweaks/wallpaper-manager`. The Lua backend in its assets/service
folder is canonical. `preview/core.js` is the state/rotation core; native-menu.js
adapts OEM controls. `cmu/import-client.js` and host.js bridge the installed view
to the shared service. Their names identify their origin, not bundled test data.
Run `python development/wallpaper-manager/build.py` to assemble assets/resident.js.
Run build_translations.py to regenerate the optional dictionary. It reuses only
the Cancel vocabulary and locale list from Tetris, never images or dumps.
All runtime/data assets are public and original project code; no OEM files or
private test inputs are shipped. Unit tests use synthetic image names and DOM.
Run the Node checks in a container:

```sh
sh tools/test-in-container.sh run node --test "tests/tweaks/wallpaper-manager/*.cjs"
```

## Browser preview

With the documented `mzd-emu` setup, run
`sh tools/preview-menu.sh --tweak wallpaper-manager --emu ../mzd-emu`.
The emulator service hook generates three 800 x 480 PNG wallpapers in the browser,
and supplies matching USB import fixtures. Gallery selection, background preview,
slideshow settings, import and delete work without copying image files into the
repository or emulator data directory. This is a local service fixture, not a
test of image import or storage on a vehicle; clear the emulator's
`mzd-preview-wallpaper-manager` local-storage key to restore the initial gallery.
