# Fuel Consumption Ending Screen

One component bundle (`components.tsv`) for firmware 74.00.324 with two parts
that are installed and removed in one transaction:

| Part | Component | What it does |
| --- | --- | --- |
| JS patch | `patch` on `/jci/gui/apps/ecoenergy/js/ecoenergyApp.js` (OEM `32f3607c…`) | Wraps `handleContext`: `EndingEffectiveness` is shown as `EndingFuelConsumption` (with the bar graph unit from the app cache when missing). `_startEndingTimer` 5000 → 7000 ms. |
| MMUI shim | `shim` `fuel_ending_mmui.so` into jciMMUI, both SM loaders | In `libjciuiaecoenergy.so`: Effectiveness ending guard → 0, Fuel guard → original Fuel or original Effectiveness; `EEM_SetEEMUpdateScreenEnable` code 11 (i-stop ending data) → 12 (fuel ending data). |

Without the shim, the JS patch alone shows the screen, but on i-stop cars only
"Current" has data: the MMUI requests the ending data from the EEM service by
the equipped FeatureType (11 for i-stop). Code 12 in the EEM service sends the
same four fuel data messages as code 8 (the Fuel Consumption screen opened from
the menu), without a feature check.

`check` records pin `libjciuiaecoenergy.so` (`ac44a5f1…`, the analysed guards
and state table) and `svcjcimmui.so` (`3b63fa37…`). The worker blocks when an
SM loader already references another `fuel_ending_mmui.so` (the main-branch
`fuel-consumption.sh` installs it to `/data_persist/fuel-ending/`) or the earlier
standalone `fogyend_mmui.so`.

Shim behaviour, fallbacks and logging are described at the top of
`src/mazda/patches/fuel_ending_mmui/fuel_ending_mmui.c`. Nothing runs at load
time; the original functions are looked up once in the defining libraries' own
dynamic symbol tables. It links only against libc/libdl/libpthread (the CMU
glibc has `clock_gettime` in librt). Log: `/tmp/fuel-ending-mmui.log`.

## Building

```sh
git submodule update --init src/mazda/m3-toolchain   # Git LFS, ~550 MB
sh build/build.sh
```

`build/build.sh` compiles every `src/mazda/patches/<name>/` and writes it to each
existing `usb/tweaks/*/assets/<name>.so`. The build is reproducible: the shipped
asset (MD5 `554ca237fcf6f11dbdd8b34d142ca544`) is byte-identical to the
main-branch `jci-shims/fuel_ending_mmui.so`. The Build shims workflow checks on
pull requests that the shipped asset matches its source and runs the shim test;
on `development` pushes it opens a PR with rebuilt assets when they differ.

## Tests

- `tests/contract/test_fuel_consumption_ending.py`: the real package through
  the installer on synthetic SM configs and app fixture (old-shim and
  native-module refusal, changed app refused, one transaction, status/broken,
  repeated install, saved uninstall with changed USB assets).
- `tests/tweaks/fuel-consumption-ending/shim/run.sh`: the built shim under
  qemu-arm against stand-in libraries (`eco.c`, `stubs.c`) for stock, i-stop,
  no ending screen, HEV, missing guards, EEM SONAME and unrelated processes.

The JS change was tested in mzd-emu and the shim with the real
`libjciuiaecoenergy.so` under qemu during the original development; neither
Mazda file is in the repository.

Ported from the `fuel-consumption.sh` Fuel ending screen and Fuel ending data
tweaks in [piotrmocko/mzd-v74-tweaks](https://github.com/piotrmocko/mzd-v74-tweaks).
The OEM file plus the diff is byte-identical to `jci-mods/ecoenergyApp.js` there.
