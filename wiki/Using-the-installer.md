# Using the installer

Tweaks are grouped into categories. Select a tweak to read its description,
version, supported firmware and whether a restart is needed. The header shows CPU
use and free space on System and Resources.

Use the touchscreen, or rotate/tilt the multicontroller to move and press to
select. In details, tilt up/down to scroll. Back returns to the list; Back from
the list leaves the installer. A result must first be acknowledged with **OK**.

| State | Meaning |
| --- | --- |
| Installed | The CMU has a saved installation record for this tweak |
| Not installed | No saved installation is registered |
| Ready | A tool can be selected with Run; its checks run when started |
| Unavailable | A requirement is not met; read the displayed reason |
| Broken installation / Error | A saved installation is incomplete or a check failed |

The list is a quick overview. Before changing anything, the installer checks the
required files and prerequisites. Old or unsupported changes may block an install
even when the list says Not installed. Read the result instead of retrying blindly.

Select **Install**, **Uninstall** or **Run** as offered. While an action runs, wait
for its completion message. Select **OK** to return to the list. **Refresh** updates
the overview when no action is running.

If the USB has a newer version, details show the installed and USB versions.
Use **Uninstall**, then **Install** to replace the installed version. The matching
saved uninstaller is used automatically.

When leaving after changes that need a restart, select **Restart** or **Exit** to
leave without restarting. A critical error can disable Restart; follow its message.

## After installation: Applications menu extensions

Certain tweaks (such as GUI extensions or interactive mods like Android Auto Mod)
register on-screen interfaces directly under the car's native **Applications** menu.
After restarting the CMU, open **Applications** on the vehicle home screen to access
installed applications and in-car settings menus.
