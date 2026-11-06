# Speedometer: issue 62 working notes

Issue: https://github.com/softwarecrash/mzd-v74-tweaks/issues/62
Branch: `feature/issue-62-speedometer`
Starting development commit: `0ee2b43b04129425cd4b5a0f93266b34d340aad6`.
Sources reviewed on 2026-11-06. Planning/research only; no installable tweak yet.

## Requested scope

- A new speedometer tweak, possibly drawing on MZD-AIO or similar projects.
- Persistently selectable UI style.
- Obtain speed and temperature units from the CMU where possible; provide saved
  mph/km/h and Celsius/Fahrenheit choices when automatic detection is unavailable.
- Additional settings and visual mockups will follow from the issue author.
  Do not treat upstream layouts/features as an agreed final specification.

### Initial design decision (2026-11-06)

Use concept **02: Mazda 3 BM / 2014 instrument cluster** for initial development:
central tachometer with integrated digital speed, silver outlines, white markings
and restrained red accents. Other concepts remain ideas for later; do not build
five styles now. The selected concept image is retained privately with the other
design drafts. It is not a finished UI asset or evidence that every shown value
is available from the vehicle.

## Sources linked in the issue

1. [Trevelopment/MZD-AIO](https://github.com/Trevelopment/MZD-AIO)
   - Existing AIO implementation and installation reference.
   - A private local copy already exists at `aio_reference/` beside this checkout;
     do not duplicate the whole repository in this branch.
   - Its CASDK speedometer registers through `CustomApplicationsHandler` and
     subscribes to `VehicleData.vehicle.speed`, `VehicleData.vehicle.rpm` and
     `VehicleData.gps.heading`. Those are SDK abstractions, not proof of an
     available direct API in our shared GUI runtime.

2. [Trevelopment/MZD_Speedometer](https://github.com/Trevelopment/MZD_Speedometer)
   - Reviewed README, controller configuration, data-retrieval configuration and
     installer source. README describes classic analog/digital and bar layouts,
     configurable fields/themes, independent unit overrides and controller mappings.
   - The old installer edits Opera settings, application registration, startup
     files and watchdog configuration. Do not port that installer wholesale.
   - `dataRetrieval_config.txt` uses the legacy update/installer launch mechanism;
     it is not the live vehicle-data API.
   - Repository declares GPL-3.0; retain provenance/licensing for any reused code
     or assets. No upstream runtime code/assets have been copied into this branch.

3. [romangarms/Mazda-CASDK-Apps](https://github.com/romangarms/Mazda-CASDK-Apps)
   - Reviewed README. Useful references include dashboard/lap-timer displays with
     speed, RPM and temperatures, plus a fixed multidash application.
   - README reports a one-second CASDK vehicle-data polling interval and identifies
     that as unsuitable for its acceleration-timer application. This is an
     upstream limitation to investigate, not a measured limit of our CMU APIs.
   - Repository declares MIT; inspect individual reused files and provenance too.

4. [CASDK compatibility discussion, post 2609996](https://www.mazda3revolution.com/threads/title-casdk-compatibility-with-mazda3-2017-%E2%80%94-firmware-74-00-324-4a-n.260596/?post_id=2609996#post-2609996)
5. [AIO discussion, page 483, post 2566060](https://www.mazda3revolution.com/threads/aio-all-in-one-tweaks.122458/page-483?post_id=2566060#post-2566060)
   - Both forum links were supplied by Piotr in the issue comment.
   - Their contents could not be retrieved: direct and clean-URL web requests
     failed, and the browser access host was unavailable. They have **not** been
     read or used as evidence. Revisit them or obtain copies before relying on
     their firmware-74 compatibility claims. The thread title alone proves none.

## Proposed starting approach

1. Use our existing shared GUI extension lifecycle and lazy-loaded Applications
   entry rather than installing CASDK as another framework.
2. Establish read-only firmware-74 data sources for vehicle/GPS speed and useful
   optional values, then determine units and realistic update rates. Keep this
   transport separate from rendering. Do not infer units from UI language alone.
3. Read/poll data only while the view needs it; stop timers/subscriptions on exit.
   Reuse the factory runtime and existing Lua bridge if a backend is needed.
4. Declare mutable settings using the existing manifest config mechanism, with
   settings owned by the app and Keep/Remove behavior owned by the installer.
5. Build emulator fixtures with explicitly simulated data while layouts are being
   decided. Missing vehicle data on a bench must remain visibly unavailable,
   rather than being presented as a valid zero-speed/temperature reading.
6. Validate real CMU data separately from browser appearance. No on-vehicle
   compatibility or performance claim has been established by this research.

## User-supplied v74 speedometer CPU fix

Reviewed the private `speedometer-cpu-fix.zip` on 2026-11-06 without executing it.
It contains only `speedometer.sh` and `speedometer.js`, under the legacy
`/jci/gui/apps/_speedometer/` layout. It is not a complete installer or full v74
port. Keep the archive and extracted review copy private.

Both files were compared with the matching files in the existing local AIO
reference (`app/files/tweaks/config/speedometer/`). The relevant differences are:

- GPS response parsing uses one awk process instead of five per response.
- JavaScript tracks sockets by stream and closes them on foreground/background
  transitions. A one-second supervisor reconnects missing sockets.
- Foreground uses four streams: speed, RPM/distance, GPS and environmental values.
- Background uses one `statsBg` stream every two seconds. It reads speed, RPM,
  distance and GPS, retaining trip statistics without polling temperatures/fuel.
- Foreground vehicle/RPM/GPS loops sleep 0.5 seconds; environmental reads sleep
  three seconds. These sleeps are additional to command execution time.

Useful principles to incorporate later: group related reads, avoid repeated
parsing processes, collect only needed values, and explicitly own/stop transports.
This is a static review, not a CPU benchmark or confirmed real-CMU fix.

Do not copy the patch unchanged:

- Foreground detection compares `framework.getCurrentApp()` with `_speedometer`.
  Our shared extension uses the Applications host and view lifecycle; use those
  lifecycle callbacks instead of the legacy app ID or an always-fast fallback.
- The patch still polls in the background and leaves other JS timers running.
  Decide explicitly whether background trip recording is wanted. If not, stop
  data collection and rendering when the view closes.
- Existing rendering still creates jQuery animation work even when the speed
  animation option is disabled and invokes Cufon. The new BM view should not
  inherit this rendering stack or redraw hidden elements.
- A retry every second has no backoff; D-Bus calls lack an explicit reply timeout.
  Add bounded failure handling appropriate to the new data bridge.
- Average speed currently averages samples. Changing between fast foreground and
  slow background sampling weights the two periods differently; use elapsed time
  if preserving trip statistics across those modes.
- Socket closure stopping child shell loops depends on the old websocketd setup,
  which is not included in the supplied archive. Verify cleanup in our own runtime.

## Ready-made code available for selective porting

- **AIO classic implementation:** the local `_speedometer` tree includes the app,
  two templates, CSS/images, startup/configuration code, data shell script and
  update logic. Data source names, conversions and field handling are useful;
  legacy registration, global status-bar patches and watchdog/Opera changes are
  not the installation model for the new tweak.
- **Private CPU fix:** a small delta on that AIO data/rendering code, not an
  independent application. Apply its relevant ideas to the new lifecycle later.
- **CASDK simple speedometer:** a separate complete UI example using SDK vehicle
  subscriptions. It is a reference for gauge/controller logic, not a requirement
  to install CASDK.
- **Trevelopment/MZD_Speedometer:** accessible upstream configuration, controls,
  installer and layout reference. No additional access is needed for these files.
- **romangarms/Mazda-CASDK-Apps:** accessible dashboard examples and field usage;
  inspect chosen implementation files before deciding to reuse them.

The missing inputs are the two forum posts above and the full specific v74 port
package/version linked there, if any. The two-file CPU archive does not establish
which v74 registration/startup adjustments that port makes.

## Open decisions

- Fields beyond speed/RPM and later styles beyond the selected BM-2014 concept.
- Exact CMU APIs, value units, permissions and sampling behavior on 74.00.324.
- Automatic unit selection behavior when CMU settings change.
- Whether any upstream UI/assets will actually be reused or the view is new.
- Contents of the two currently inaccessible forum posts.
