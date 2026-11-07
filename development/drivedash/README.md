# DriveDash development and emulator

Development draft for issue #62, with a browser demo and an initial read-only
CMU data adapter. The installable package and single asset source now live in
`usb/tweaks/drivedash/`. No additional AIO tweaks are bundled.
The normal browser emulator remains explicitly marked DEMO; native reads have
not yet been verified on hardware.

The first skin is named **OEM Style**, inspired by Mazda instrument clusters. The
application is skin-independent: `skins/registry.js` manages renderers, and each
renderer receives the same normalized display model and translation function.
Additional skins register an ID, translation key and `draw(context, model, t)`.
The settings design list comes from this registry. Selecting a skin applies it
without closing the app. Selections remain in their settings page with the
selected radio value marked. Back returns to the settings overview, then to the
gauge. Only OEM Style is supplied initially.

`model.js` owns normalized data and unit conversion. `demo.js` is an explicitly
simulated provider with start/stop lifecycle. `live.js` pulls snapshots through
the resident and shared Lua service. File-origin views select the live provider;
a browser view can explicitly select it with `?data=cmu`. Live failures never
switch to demo values. No legacy websocketd, CASDK installation, disclaimer patch,
watchdog changes or status-bar speedometer is used.

`assets/i18n.js` is the single dictionary for the gauge, settings, units and menu
entry. English and German are supplied for this draft; other Mazda languages use
English fallback until translated. Saved app choices are loaded first. Only
fields set to Automatic are read from the Mazda GUI framework on opening;
all-manual choices perform no app settings query. Switching a previously manual
field to Automatic reads it once on demand.
The default option is Automatic; settings also offer explicit km/h or mph,
Celsius or Fahrenheit, and any language supplied in the common dictionary
(currently English and German). Manual choices override the startup snapshot.
Reopen the app after changing Mazda system settings to refresh automatic choices.
Unsupported system languages silently use the English dictionary; unknown units
fall back to metric. Missing unit getters do not discard a valid language.
No setters, native service requests, CAN input or background watcher are needed.
`framework.localize.getDistanceUnit()` supplies Miles/Kilometers and
`getTemperatureUnit()` supplies Fahrenheit/Celsius; language uses the existing
shared GUI i18n API. Both gauge and native settings menu use the selected language.

Browser settings use a separate localStorage key. This is emulator persistence,
used only by the HTTP demo. The installed file-origin view loads its declared
persistent config through the shared Lua service before requesting automatic
Mazda preferences. It never uses browser storage. Settings writes are serialized
and atomic; rapid changes coalesce. Read/write failures are shown in Settings.

## Emulator

From the repository root:

```sh
python development/drivedash/stage-emulator.py
```

This updates only our existing private emulator's shared runtime and the
DriveDash module, preserving its other registry entries and saving the previous
registry. It never reads or writes a connected CMU or the original firmware dump.
Start the existing private mzd-emu, open `http://localhost:8080/jci/gui/index.html`,
then Applications > DriveDash. Standalone preview is served at
`http://localhost:8080/data/integration/mzd-gui-modules/drivedash/assets/view.html`.
The standalone preview can use `?lang=de_DE` or `?lang=en_US`.

DriveDash requests the shared `with-status-bar` layout: the original Mazda
status bar stays above an 800x416 view. OEM Style keeps its dial circular and
uses the Mazda clock instead of drawing a separate system-time clock. Other
GUI consumers keep their fullscreen layout until they opt in separately.
DriveDash opts into phone interruption handling: data polling pauses during a
call, and the same view/settings page resumes only when Mazda returns to the
original Applications context. Home, music, navigation and a new Applications
visit continue to close the view. Phone return was confirmed on the bench CMU. The user accepted the remaining
brief appearance of native side chrome during the return transition.

Press the commander knob or Enter to open the native Mazda
settings list. Rotate/M/N or Up/Down changes selection; Select confirms. Back
returns from settings to the gauge; Back on the gauge returns to Applications.
In standalone preview a matching HTML menu is used because no OEM List2 factory
is available. Vehicle simulation pauses while settings are open and stops on exit.

The emulator shows appearance and input behavior. Real vehicle data, CPU usage,
Opera rendering and real config persistence on hardware remain unverified;
package/config lifecycle and failure handling have isolated container coverage.

Instrument photo references for the BM approximation:
[2014 Mazda3 review](https://noticias.autocosmos.com.mx/2014/04/01/mazda3-sedan-2014-a-prueba)
and [close-up of the LCD segments](https://www.otosaigon.com/threads/mazda3-2-0-bi-hu-dong-ho-do-toc-do.9026725/).
The main view has no source/status badge or footer caption. The HTTP preview
still uses simulated values; the installed view uses actual CMU data.
The preview uses its own drawing geometry; the photographs are not shipped assets.

The isolated preview checks run in the repository's test container:

```sh
sh tools/test-in-container.sh run node tests/tweaks/drivedash/preview.cjs
```

## Initial CMU adapter

`usb/tweaks/drivedash/assets/service/entry.lua` is a shared service factory; `collector.lua` reads
fixed fields using `/jci/smdb/smdb-read` and the existing argv-only process runner.
The shared host has already loaded the runner; the factory reuses
`package.loaded.process`. The host and its scoped require facade are unchanged.
There is no new executable, shell loop, websocketd or SMDB write. A bounded
read-only LDS GPS query occupies one secondary sampling slot.
The factory performs no reads at startup and registers no tick callback.
The manifest declares the resident, service, translations and owned config
directory. Its config template includes the shared data ownership marker, so
seeded defaults and the existing GUI lifecycle agree on the directory owner.

A sample reads speed and RPM, plus one rotating secondary field or GPS group. Repeated
requests within 500 ms reuse the result. Each command receives a one-second deadline
(the shared runner additionally allows its existing TERM/KILL cleanup grace).
Valid readings survive two consecutive failed attempts; the third failure
clears only the affected field. A successful read resets its failure counter.
A previously valid secondary field is retried on the next sample after a failure,
instead of waiting for another complete rotation. Ten seconds without sampling
resets the session cache so reopening cannot resurrect old readings.
The browser keeps one request outstanding, uses a five-second service deadline,
and also tolerates two transport failures before clearing the display on the
third. It backs off after that and stops polling in settings and on exit. An already executing read completes within its
bounded process lifecycle; no additional work is scheduled by a closed view.

The following conversions are based on the supplied legacy reference and field
names confirmed in the private v74 SMDB XML. They still require real-CMU checks:

| Field | Normalization |
| --- | --- |
| VehicleSpeed | raw / 100 km/h |
| EngineSpeed | raw * 2 RPM |
| Out-CarTemperature / EngClnt_Te_Actl | raw - 40 Celsius; raw zero/255 rejected |
| PID_Drv1Dstnc_curr | raw * 0.02 km; vehicle counter, not a new app trip |
| TotAvlFuelE (vdm_vdt_history_data) | 1000 / raw L/100 km; zero rejected; matches the stored Mazda average |
| TransmChangeLeverPosition | 1/2/3/4 to P/R/N/D |
| TransmissionGearPosition | 1..6 as fallback when lever is unavailable |
| EngineLoad | raw percent, valid range 0..100 |
| Battery_StateOfCharge | raw / 2 percent, valid range 0..200; 254/255 unavailable |
| FuelGaugePosition | approximate bars using the initial AIO reference maximum 184; not calibrated litres |

Missing fields with no prior reading show `--`. Three consecutive read failures
or out-of-range values clear a previously valid field. A successful read of zero speed/RPM remains valid: SMDB defaults
alone do not prove fresh CAN data, and a reliable vehicle-data freshness signal
has not been established. Automatic units use the read-only GUI snapshot described above, with metric
fallback when unavailable. Persistent CMU app settings are now declared in the package manifest.

Additional isolated checks:

```sh
sh tools/test-in-container.sh run node tests/tweaks/drivedash/native-menu.cjs
sh tools/test-in-container.sh run node tests/tweaks/drivedash/system.cjs
sh tools/test-in-container.sh run node tests/tweaks/drivedash/live.cjs
sh tools/test-in-container.sh run lua5.1 tests/tweaks/drivedash/collector.lua
sh tools/test-in-container.sh run node tests/installer/test-gui-services.cjs
```

## Package lifecycle checks

```sh
sh tools/test-in-container.sh run python tests/contract/test_gui_extensions.py --drivedash-only
sh tools/test-in-container.sh run node tests/tweaks/drivedash/preferences.cjs
sh tools/test-in-container.sh run lua5.1 tests/tweaks/drivedash/preferences.lua
sh tools/test-in-container.sh run lua5.1 tests/tweaks/drivedash/service.lua
```

The package profile uses real worker entrypoints and synthetic mount/startup
fixtures. It covers read-only status, unavailable firmware/foreign hook, missing
payload, install, updated mutable config, Update, mixed Tetris coexistence,
preserve/reinstall, complete owned-data removal and saved-package uninstall when
USB assets are absent. No real CMU service is started by that fixture.

## Real-car findings and 0.1.1 data correction

Read-only checks on the owner's manual-transmission CMU found successful command
roundtrips of 167-316 ms. The previous 250 ms limit was too short. Raw engine
speed 353 gives 706 RPM; coolant 105 gives 65 Celsius. Trip distance and the
current-trip economy counter were zero at stationary idle. The average display
now reads the stored total economy counter instead; raw 141 corresponds to about
7.1 L/100 km, close to the dashboard's 7.2 at the time of the checks. A tank raw
value of 91-92 was observed with the gauge slightly below half. This supports the
initial reference bars only; full/empty calibration is not established. Both gear
fields returned zero at idle, so no neutral/gear value is invented.

Every SMDB command now executes through the factory `/usr/bin/env` with an explicit
JCI library path, independent of the launching service's inherited environment.
This is per-command environment setup, not a global system or shared-service edit.
The 0.1.1 failure-count behavior is covered with original ARM Lua/modules under
QEMU as well as the real shared Lua HTTP service and bounded synthetic reads.

Engine load and battery SOC are now wired to the live collector. Their raw scaling
follows the legacy speedometer reference; on-vehicle plausibility remains to be
verified. Both use the same slow-field rotation and three-failure retention.

## Shared data contract

See [Data-model.md](Data-model.md) for the complete skin API, normalized fields,
unit formatting, view-local statistics and open vehicle checks. `tripKm` remains
an unverified vehicle counter; checking it against driving and reset behavior is
explicitly pending.

## CMU rendering

OEM Style ships an 800x416 antialiased PNG for fixed instrument geometry. It is
rendered once with threefold supersampling and reduced to native size by the
authoring tool `render-background.cjs` (development-only `@napi-rs/canvas` 1.1.0;
pass the private Mazda fonts directory). No renderer package or font files are
installed on the CMU. The original vector routine remains as a load-error fallback.
Texts, data and needle remain dynamic. Needle movement interpolates only the
displayed RPM for 350 ms with redraws at most every 50 ms while moving; measured
samples, statistics and service polling remain unchanged. Settings, phone
suspension and disposal cancel the redraw timer. The cleaner fixed instrument outlines were confirmed visually on the bench CMU.
Needle motion with changing real vehicle RPM and CPU behavior still need checks.
