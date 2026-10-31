# HUD Street Name

Unlocks the **Street Information** options in Active Driving Display settings
for supported vehicles. The tweak changes the settings app's HUD region and
language checks to North America and US English; it does not change the CMU's
selected language or region.

**Supported firmware:** 74.00.324  
**Supported HUD:** color windshield HUD (`WHUD_color`) only.

The worker checks the detected HUD before installing. A combiner HUD, no HUD,
or an unknown HUD blocks installation and reports why. Uninstall always
succeeds regardless of HUD state, reversing only this patch. Street-name
availability also depends on the vehicle's navigation and map data.

After installation, restart the CMU and open **Settings > Active Driving
Display > Display Information > Street Information**. Available choices are
**Always**, **At Maneuver**, and **Off**.

![Supported windshield HUD and unsupported combiner HUD](../../../images/WHUD-supported-CHUD-unsupported.jpg)

![Active Driving Display settings](../../../images/mzd-hud.jpg)

![Display Information settings](../../../images/mzd-hud-display-info.jpg)

![Street Information settings](../../../images/mzd-hud-street-info.jpg)

Uninstall reverses only this patch and preserves unrelated changes to
`/jci/gui/apps/vehsettings/js/vehsettingsApp.js` where possible.
