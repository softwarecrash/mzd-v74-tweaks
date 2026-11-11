# SSH Access

Enable SSH on port **22**. Default login: **cmu / jci**. Supported firmware: **74.00.324**.
Choose Install or Uninstall in the installer.

Installation waits for the owned supervisor, SSH daemon and initial firewall
setup to be ready, up to 15 seconds. A fast startup continues immediately;
no Wi-Fi address is required. A startup failure or timeout retains diagnostics
and stops the new service before rolling back the boot hook and runtime changes.
If stopping or cleanup fails, installation reports a critical error and warns
not to reboot; remaining files are retained for recovery.

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
New managed installations restore startup-file metadata and remove their own
verified `.org` backup after the last SSH/GUI consumer is uninstalled. A backup
that already existed before installation is retained.

Action reports and `run.log` are saved on the originating USB under
`reports/ssh/<action>-<timestamp>-<unique>/`.

Optional SSH runtime logs use `reports/ssh/runtime-<timestamp>-<unique>/run.log`
on an attached USB containing the matching `mzd-ssh-log-marker.txt`.

Runtime files live in `/tmp/mzd-ssh/`; the owned firewall chain is `MZD_SSH`.
The USB log marker contains `MZD-SSH-v1`.

## Optional public-key login

The installer offers **SSH public key: Ignore / Install** (default Ignore) and
**Password login: Enabled / Disabled** (default Enabled).

Place one OpenSSH public key in `user/ssh/public.key` on the USB and
select Install. The manifest declares a conditional file import: the key is
copied into the saved package and does not depend on the USB remaining inserted.
Do not copy a private key. No bundled key is provided. The CMU's own `ssh-keygen`
validates the key; types unsupported by its factory OpenSSH are refused.

Password login can be disabled only with a valid key selected for installation.
Invalid combinations fail before installing the startup hook or changing the
account overlay. Ignore leaves key authentication disabled, even if a key file
is supplied. Password login remains enabled by default.

Authentication configuration and the selected key are copied into the owned RAM
runtime at startup. Factory account files and factory authorized-key files are
not rewritten. Uninstall and Restore originals remove the owned service key,
settings and RAM files. The original source key on USB is left untouched.
To change these installed options, uninstall and reinstall. Updates retain the
installed option values, as with other installer settings. For key-enabled
updates, supply the public key on USB again. A missing/invalid replacement key
refuses the update before removing the working installation.

With Ignore, the USB key is neither validated nor copied into the saved package
or service payload. With Install, the CMU validates exactly one public key before
the existing installation is removed.
