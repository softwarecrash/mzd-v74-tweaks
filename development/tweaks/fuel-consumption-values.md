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
label per bar and hides it for values of 0 or less. Since 1.1.0 the label is
placed inside the top of the bar with a dark `text-shadow` whenever the bar is
at least the font size + 8 px tall (or too tall for a label above it in the
109 px clipped area); only shorter bars get it above, without shadow.
No full replacement file is shipped.

Version 1.1.0 merges the ten 1-minute bars (CDFEBar1-10) in pairs.
`_modPairCDFEBars`, called at the end of `_setCDFEGraphBarHeights`, hides the
left bar of each pair and moves/widens the right one to 44 px (two bars plus
the spacing between them, the width of a 10-minute bar) with the factory
`FuelConsBar_wide.png` / `FuelConsBar_WideCurrent.png` body and
`FuelConsBarCap_wide.png` cap images; the current pair gets a
`rgba(0,0,0,0.35)` layer (`_modShadeCurrent`) between the cap and the label. `_modPairCDFEAxisLabels`, called after the
factory "5" label in `_addCDFEGraphAxisLabels`, moves that label to the 6-minute
border and adds 8, 4 and 2. `_modPairCDFEBackground` (same hook) replaces the
graph background, which is plain under the 1-minute bars, with pieces of the same
`FuelConsBgBars1.png`: the stock part under the 10-minute bars, then light/dark
stripes (image x 237+ and 96) with the gray line (image x 48) on the pair borders. The height and label
use `_modPairValue`: the average of the two minutes rounded to one decimal, or
the non-empty one if the other is 0. CDFEBar10 keeps the factory "current"
style, so the newest pair stays highlighted. `insertCurrentDriveFuelGraph`
ends with `_modFinishCDFEShift`, which drops the one-bar slide and redraws the
graph at once, because a 23 px slide would show half-shifted pairs. The HEV
style (`hevstyle`) is left unchanged.

The factory one-minute shift animation ends with the Opera/Presto
`oTransitionEnd` event. With the paired bars this slide is skipped and
`_resetCDFEGraph` runs directly, so the emulator shows the new minute too.

Ported from the `fuel-consumption.sh` bar values tweak in
[piotrmocko/mzd-v74-tweaks](https://github.com/piotrmocko/mzd-v74-tweaks/blob/main/jci-patches/FuelConsumptionCtrl-patch.py).
Version 1.0.0 was byte-identical to that version; 1.1.0 adds the paired
1-minute bars.

Use `sh run.sh status`, `install` or `uninstall` from this folder in the complete
USB layout. Settings are read only from manifest.conf. Other tweaks touching
FuelConsumptionCtrl.js must use the same FuelConsumptionCtrl lock group.
Uninstall reverses this diff and preserves unrelated modifications. Restart the
CMU manually after changing this JavaScript tweak.

Contract, patch-behavior and full-OEM round-trip checks are separate from a
vehicle test. See [reviewed evidence](../test-runs/README.md) for the tested scope.
