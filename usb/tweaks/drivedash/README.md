# DriveDash

A configurable instrument display for firmware 74.00.324. Install through the USB
launcher, restart, then open Applications > DriveDash. The BM 2014-inspired
skin is the first interchangeable design; no other AIO tweaks are bundled.

Press the commander knob (Enter in the emulator) for settings. Tilt/rotate to
select, press to apply. Selection stays in the submenu; Back returns to settings,
then to the instrument. Back on the instrument returns to Applications.

The instrument stays hidden until saved choices and the needed automatic CMU
settings have loaded, so the first visible frame already uses the chosen language
and units. Missing automatic settings have a bounded five-second fallback; late
replies cannot change the startup language afterwards.
Saved app choices load before automatic CMU settings are requested. Language,
speed and temperature each offer Automatic or manual choices. Manual choices do
not query the corresponding Mazda preference. Automatic values are read once on
opening, or on first switching a manual field to Automatic. Reopen after changing
Mazda system settings. English and German are currently supplied; other system
languages use English fallback.

The manifest declares the whole persistent preferences directory, containing
`/tmp/mnt/data_persist/mzd-tweaks/gui-data/drivedash/settings.conf`.
Updates preserve it. Uninstall removes preferences unless Keep settings is chosen.
The original template is not copied over existing settings. Config edits do not
make the installed package broken. The app writes atomically through its own
registered service; settings load/save failures are shown in its settings menu.

The shared helper manages the optional GUI hook, module registry and Lua service
startup hook. This worker uses that helper and owns no replacement OEM binary or
factory GUI file. Other GUI consumers keep their shared support on removal;
the last consumer removes the owned support and restores the shared startup hook.
Reports are written to reports/drivedash on the originating USB.

## Data status

Vehicle data uses bounded read-only SMDB commands through the common Lua bridge.
Only an open instrument view requests snapshots. Each SMDB read has a one-second
deadline and an explicit JCI library path. Two consecutive read failures retain
the last value; the third clears it. Success resets the failure counter. A session
idle for ten seconds resets the cache. Opening settings or leaving
stops new requests. One already executing request may finish within its deadline.
There is no background trip recorder or legacy websocketd. GPS uses one bounded
read-only LDS query in the secondary rotation while the instrument is open.

Speed/RPM, temperatures, vehicle trip counter and stored average consumption use
the native SMDB fields. Initial stationary real-car readings confirmed RPM and
coolant scaling; the stored economy source was checked against the dashboard.
The tank bars use the old AIO reference maximum of 184 and remain approximate;
full/empty calibration is not yet verified. Unavailable readings appear as --.
Zero manual-transmission gear signals remain -- rather than an invented N. Valid zero speed/RPM cannot distinguish a stopped
vehicle from unpopulated SMDB defaults on a bench CMU.

The HTTP emulator explicitly uses simulated data. The installed file-origin view
uses the CMU provider and never falls back to simulation. A bench CMU can verify
menus, preference persistence, native language/units and removal without sensors;
it cannot establish vehicle sensor scaling or freshness. The main instrument
view omits the diagnostic captions; the browser preview remains simulated.

Developer details and checks: [prototype notes](../../../development/drivedash/README.md).

Designs share a [normalized data model](../../../development/drivedash/Data-model.md),
including additional temperatures, consumption counters, GPS and view-session
statistics. The BM layout displays only a subset. Vehicle trip-counter behavior
and the GPS heading reference still need on-car verification.

The development package was renamed from `speedometer` to `drivedash`. Remove
the old Speedometer test installation before installing DriveDash; they use
different package IDs and config owners. No automatic settings migration is
performed. DriveDash is a proper name and remains unchanged in every language.
