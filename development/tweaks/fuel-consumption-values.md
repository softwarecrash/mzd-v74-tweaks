# Fuel Consumption Values

Shows the value of every bar in both Fuel Consumption graphs on firmware
74.00.324: the average fuel economy history (CFERBar1-6) and the current trip
graph (1-minute CDFEBar1-11 and 10-minute CDFEBarRight1-6).

The diff edits only
`/jci/gui/apps/ecoenergy/controls/FuelConsumption/js/FuelConsumptionCtrl.js`.
It adds one helper, `_modSetBarLabel`, and calls it after each place where the
control sets a bar height: `_setCDFEGraphBarHeight(s)`,
`_setCDFEGraphBarHeight(s)Right` and `_setCFERGraphBarHeight(s)`. The HEV
graph branch is not touched. The helper creates one absolutely positioned
label per bar, hides it for values of 0 or less, and moves it inside the bar
when the bar is taller than the 109 px graph area minus the label height.
No full replacement file is shipped.

On the vehicle the one-minute shift animation ends with the Opera/Presto
`oTransitionEnd` event, which calls `_resetCDFEGraph` and then the bar height
setters, so the labels follow the bars. A Chromium-based emulator does not send
that event; trigger it manually there.

Ported from the `fuel-consumption.sh` bar values tweak in
[piotrmocko/mzd-v74-tweaks](https://github.com/piotrmocko/mzd-v74-tweaks/blob/main/jci-patches/FuelConsumptionCtrl-patch.py).
The patch is byte-identical to that version: the OEM file plus this diff gives
the `jci-mods/FuelConsumptionCtrl.js` shipped there.

Use `sh run.sh status`, `install` or `uninstall` from this folder in the complete
USB layout. Settings are read only from manifest.conf. Other tweaks touching
FuelConsumptionCtrl.js must use the same FuelConsumptionCtrl lock group.
Uninstall reverses this diff and preserves unrelated modifications. Restart the
CMU manually after changing this JavaScript tweak.

Contract, patch-behavior and full-OEM round-trip checks are separate from a
vehicle test. See [reviewed evidence](../test-runs/README.md) for the tested scope.
