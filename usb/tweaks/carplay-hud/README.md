# CarPlay HUD Mod

CarPlay HUD Mod version **2.0.0** for Mazda CMU **74.00.324**.

Based on the [KidMixer/mazda-carplay-hud](https://github.com/KidMixer/mazda-carplay-hud) project.

This tweak enables turn-by-turn navigation guidance, maneuver arrows and street names from Apple CarPlay to be displayed on the windshield Active Driving Display (HUD).

## Features

- **HUD Navigation**: Forwards turn directions, distance, and road names from Apple CarPlay (Apple Maps, Google Maps, Waze) to the vehicle's HUD.
- **Wired & Wireless Support**: Supports both standard wired CarPlay and factory wireless CarPlay (WCP).
- **Safe Execution**: Configures the `jciCARPLAY` service with `reset_board="no"` to prevent reboot loops in case of unexpected exceptions.
- **Dual SM Configuration**: Configures both `sm.conf` and `sm_WCP.conf`, preserving compatibility across wired and wireless hardware configurations.

## Hardware compatibility

- **Windshield HUD (`WHUD_color`)**: Fully supported; navigation directions, maneuver arrows and street names display on the windshield HUD.
- **Combiner HUD (`CHUD_mono`, `CHUD_color`)**: Displays basic navigation info; street names are not supported on combiner displays (warns in preflight).
- **Vehicles without HUD (`none`)**: Not supported (blocks installation in preflight).
- **Unknown HUD type (`unknown`)**: HUD compatibility cannot be verified (blocks installation in preflight).

## Installed files

- **Payload directory**: `/tmp/mnt/data_persist/mzd-tweaks/shims/carplay-hud/`
  - `libpatch-blmjcicarplay.so` (preloaded into `jciCARPLAY`)
- **Service configuration**: `/jci/sm/sm.conf` and `/jci/sm/sm_WCP.conf`
  - Service `jciCARPLAY` receives `LD_PRELOAD`
  - Sets `reset_board="no"` on `jciCARPLAY`
  - Injects `LD_LIBRARY_PATH="/jci/lib:/usr/lib"`
- **Device Manager configuration**: `/etc/devmgr_config_master.xml` (sets `NaviSupported` to `TRUE`)

## Diagnostics

During active navigation sessions, runtime diagnostics from the bridge are written to `/tmp/carplay_bridge.log`.

## Upstream provenance and source

- Author: KidMixer (KID MIXER-MODER); release supplied by Piotr Mocko.
- Release: https://github.com/KidMixer/mazda-carplay-hud/releases/tag/v2.0.0
- Source commit: `9782e927ca7a3e1715585cbafdb6417833944506`.
- Release ZIP SHA256: `9ae4cff89b05c18ffe6926c37e3893ebaa2c82a3c3cdbe413e0517df97c8bb58`.
- Checked-in source ZIP SHA256: `2d6955d2dd13e804b5258901e381467d9d323a9828d2836548b18c94d53db1cb`.
- Unmodified library SHA256: `76c9f329dab61e5530b31c84ecf403890ce0846acd57213813d0e1dbda449a2e`.

`source/mazda-carplay-hud-source.zip` contains the source snapshot at that commit,
including the Makefile, common headers and build instructions. Use upstream's
CMU m3-toolchain to rebuild. The source ZIP does not contain Git submodules;
the documented toolchain must be obtained separately. The library is unchanged;
the launcher integration and separate generated configuration are new.
Upstream license: AGPL-3.0-or-later, included as LICENSE and in the source ZIP.

Action reports and `run.log` are saved on the originating USB under
`reports/carplay-hud/<action>-<timestamp>-<unique>/`.
