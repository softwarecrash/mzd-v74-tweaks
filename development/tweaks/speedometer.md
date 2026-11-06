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

## Open decisions

- Final display styles/mockups and fields beyond speed.
- Exact CMU APIs, value units, permissions and sampling behavior on 74.00.324.
- Automatic unit selection behavior when CMU settings change.
- Whether any upstream UI/assets will actually be reused or the view is new.
- Contents of the two currently inaccessible forum posts.
