# SSH Access

Enable SSH on port **22**. Login: **cmu / jci**. Supported firmware: **74.00.324**.
Choose Install or Uninstall in the installer.

Wi-Fi is automatically enabled at every startup, even if it was switched off.
Configure a saved network and automatic connection in the Mazda menu first.
This setting is requested once during startup; manually switching Wi-Fi off lasts
until the next startup. It does not change network credentials.

The installed indicator records installation, not whether the network or SSH port
is currently reachable. Uninstall removes this tweak's service and startup changes.
Uninstall and Restore originals remove the automatic Wi-Fi behavior, but do not
switch off an existing connection. An unrelated SSH listener is not replaced.

SSH can coexist with the shared GUI startup hook in either installation order.
Only that exact GUI block may be removed from a temporary inspection copy, and
the result must match the OEM checksum before an original `.org` is created.
Unknown changes or an invalid existing backup are still refused.
The verified OEM `.org` backup remains after both SSH and GUI tweaks are
uninstalled; Restore originals removes it after successful restoration.

Action reports and `run.log` are saved on the originating USB under
`reports/ssh/<action>-<timestamp>-<unique>/`.

Optional SSH runtime logs use `reports/ssh/runtime-<timestamp>-<unique>/run.log`
on an attached USB containing the matching `mzd-ssh-log-marker.txt`.
