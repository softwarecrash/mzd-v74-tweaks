# Instrument Cluster and HUD Language

One component bundle for firmware 74.00.324: a shim in jciBLMSettings (both SM
loaders) and a generated configuration file.

`libpatch-svcjciblmsettings.so` interposes `VBS_SETTINGS_SetCMUControlReq` and
rewrites the value of control type 2 ("Display Characters", CAN PID 0x4B) to the
configured code. Other control types and other processes pass through. Behaviour,
fallbacks and logging are described at the top of
`src/mazda/patches/libpatch-svcjciblmsettings/cluster_language.c`.

The shim keeps the file name of the earlier release so `run.sh` can block any other
copy by name (`/data_persist/oem-aa-mod/` and older standalone installers), and an
installed test release upgrades in place. `build/build.sh` needs the asset name to
match the source folder.

## Configuration

`hud_display_language` is a `choice` and `hud_display_code` a number from 0 to 255;
`assets/libpatch.map` writes both to `libpatch.conf`. The shim parses that file
itself and has its own language table. A non-zero code wins over the language.
`tests/contract/test_cluster_language.py` requires the manifest options and the
table to match.

The code is a setting because the generated file must stay as installed: a hand
edit makes Status report `broken` and blocks Uninstall.
The former `english` value is gone: a saved install upgrades to the default `off`.

The codes come from `BLM_SETTINGS_Languages_LANG_to_VBS16` in
`svcjciblmsettings.so`. Settings tokens must be lowercase, so the list uses `en-uk`.

## Tests

- `tests/contract/test_cluster_language.py`: the real package on synthetic files.
- `tests/tweaks/cluster-language/shim/run.sh`: the built shim under qemu-arm with
  stand-in libraries in a small root that has the `/jci` paths.
