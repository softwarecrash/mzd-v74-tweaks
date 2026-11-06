# Speedometer design prototype

Browser/emulator draft for issue #62. No CMU installer, native data access or
additional AIO tweaks are included. Every displayed vehicle value is simulated;
the view is visibly marked DEMO in the current language.

The first skin is inspired by the Mazda 3 BM (2014) instrument cluster. The
application is skin-independent: `skins/registry.js` manages renderers, and each
renderer receives the same normalized display model and translation function.
Additional skins register an ID, translation key and `draw(context, model, t)`.
The settings design list comes from this registry. Selecting a skin applies it
without closing the app. Only BM 2014 is supplied initially.

`model.js` owns normalized data and unit conversion. `demo.js` is an explicitly
simulated provider with start/stop lifecycle, to be replaced by an adapter to our
shared Lua bridge. No legacy websocketd, CASDK installation, disclaimer patch,
watchdog changes or status-bar speedometer is used.

`assets/i18n.js` is the single dictionary for the gauge, settings, units and menu
entry. English and German are supplied for this draft; other Mazda languages use
English fallback until translated. Language is selected once at view startup.

Browser settings use a separate localStorage key. This is emulator persistence,
not the final on-CMU config implementation. Live CMU settings will use the
manifest config lifecycle and Lua service. No CMU installation is implied.

## Emulator

From the repository root:

```sh
python development/speedometer/stage-emulator.py
```

This updates only our existing private emulator's shared runtime and the
speedometer module, preserving its other registry entries and saving the previous
registry. It never reads or writes a connected CMU or the original firmware dump.
Start the existing private mzd-emu, open `http://localhost:8080/jci/gui/index.html`,
then Applications > Speedometer. Standalone preview is served at
`http://localhost:8080/data/integration/mzd-gui-modules/speedometer/assets/view.html`.
The standalone preview can use `?lang=de_DE` or `?lang=en_US`.

Press Select/Enter or the on-screen settings button to open the native Mazda
settings list. Rotate/M/N or Up/Down changes selection; Select confirms. Back
returns from settings to the gauge; Back on the gauge returns to Applications.
In standalone preview a matching HTML menu is used because no OEM List2 factory
is available. Vehicle simulation pauses while settings are open and stops on exit.

The emulator shows appearance and input behavior. Real vehicle data, CPU usage,
Opera rendering on hardware and final config persistence remain unverified.

The isolated preview checks run in the repository's test container:

```sh
sh tools/test-in-container.sh run node tests/tweaks/speedometer/preview.cjs
```
