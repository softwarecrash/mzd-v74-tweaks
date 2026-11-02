CMU TWEAK INSTALLER - DEVELOPMENT

Copy the contents of the usb/ directory to the USB root, including jci-autoupdate and .up.
Insert USB. The styled installer opens directly with a notice and OK / Exit.
OK starts tweak discovery; Exit returns to Mazda without running any tweak. No compilation or package assembly is required.

Tabs come from tweak manifests. Green means installed, grey means uninstalled,
amber means unavailable, red means broken or a failed status inspection.
Select a tweak to read its description and any reason. Install/Uninstall are
available only for valid ready states. Commands use Run. Blocked states offer
Retry status. Result OK returns to the list and refreshes the affected status.
Exit returns to the Mazda UI. Workers never reboot automatically.

Multicontroller: rotate or tilt to move between controls; press to select.
In details, tilt up/down scrolls text and rotation moves between buttons.
Back returns from details to the list, or exits from the list. Action results
must be acknowledged with OK. Vehicle confirmation of this mapping is pending.

Current included tweaks support firmware 74.00.324. The native Lua launcher,
persistent SSH lifecycle and selected patches have been tested on a vehicle.
The latest status batching and layout changes still need vehicle confirmation.
See the repository's user guide for operation and troubleshooting.
Launcher logs: installer-logs/. Action reports: reports/<tweak-id>/<action>-<timestamp>-<unique>/.
SSH runtime logs: reports/ssh/runtime-<timestamp>-<unique>/.
Command exports: exports/<tweak-id>/.
No temporary diagnostic SSH server or notebook public key is included.

The installer leaves its USB writable after actions and Exit; it flushes writes
before leaving or restarting. System filesystem mount restoration is unchanged.

Tweaks with declared configuration ask whether to keep it during Uninstall.
Updates retain configuration automatically. Other tweaks uninstall directly.
