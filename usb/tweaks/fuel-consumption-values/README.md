# Fuel Consumption Values

Shows the fuel consumption value above every bar of both graphs in the Fuel
Consumption app. The stock firmware shows a value only for "Current".

- Average fuel economy history (Current and the five previous resets).
- Current trip graph, both the 1-minute and the 10-minute bars.

The ten narrow 1-minute bars are merged in pairs (1+2, 3+4, 5+6, 7+8, 9+10),
so the last 10 minutes are shown as five bars, each as wide as a 10-minute bar.
A pair shows the average of its two minutes; an empty minute (for example
before the trip started) does not halve the other one. The car sends only the
per-minute values, so this is a simple average, not weighted by distance.
When a new minute arrives the pairs are redrawn at once instead of sliding.

The value uses the unit of the graph (for example L/100km) with one decimal.
Empty bars get no value. Tall bars get the value inside the top of the bar,
because the graph area clips anything above it.

| Stock | Tweak |
|---|---|
| ![stock](../../../images/fuel-bar-values-stock.jpg) | ![tweak](../../../images/fuel-bar-values-tweak.jpg) |

Supported firmware: **74.00.324**. Select the tweak in the installer, read its
description, and choose **Install** or **Uninstall**. Restart the CMU after changing
this tweak; the installer offers Restart when leaving.

Normal uninstall removes this tweak while preserving unrelated changes where
possible. If installation is refused, read the displayed reason. Restore originals
resets all patches on affected files, not just this tweak.

Action reports and `run.log` are saved on the originating USB under
`reports/fuel-consumption-values/<action>-<timestamp>-<unique>/`.
