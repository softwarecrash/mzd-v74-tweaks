# Troubleshooting

## The installer does not open

Check the supported firmware and USB contents. Copy the files inside `usb/` to
the USB root, not the enclosing folder. Include `jci-autoupdate` and the long
`.up` filename. Use the complete package rather than mixing files from old tests.

## A tweak says Not installed but installation is refused

The overview reads saved installation records. An older patch without a record
may still be present. Installation checks the actual target before writing and
can refuse an already modified or incompatible file. Read the reason. Use the
matching old package to uninstall an old test tweak where available.

## Unavailable or Broken installation

Open the tweak to read the reason. **Retry status** or **Refresh** can update the
overview, but cannot fix missing hardware or unsupported firmware. If the message
indicates a damaged or incompatible file, consider [Restore originals](Backup-and-restore)
after reading its scope: it removes all patches on affected files.

## An operation fails

Keep the USB connected until the result appears. Preserve the action report under
`reports/diffpatch/`. If requested for diagnosis, set `logging=debug` in
`installer.conf` on USB and repeat only the agreed steps. Launcher diagnostics
are saved under `installer-logs/`. Debug logging is the current development default; Off disables
installer diagnostic exports but keeps action reports and explicit backups.

A critical message saying **Do NOT reboot** means changes or cleanup could not
be verified. Follow that instruction and seek review with the report. Do not
assume a failed operation left everything unchanged.

## SSH is installed but not reachable

The installed indicator is not a network connectivity test. Configure a saved
Wi-Fi network and automatic connection in the Mazda menu. The SSH tweak enables
Wi-Fi at each startup, but cannot make an unavailable network reachable.

## Android Auto freezes, drops to native UI on calls, or needs a restart

- **Soft reboot the CMU**: Press and hold **NAV + MUTE** together for about 10 seconds
  until the screen turns black. Wait 30–90 seconds for the system to restart.
- **Phone calls kick out or freeze AA**: In **Applications > Android Auto Settings**,
  revert media synchronization settings to defaults (turn off **Pause media when muted**,
  **Force play on unmute**, and **Prevent car media auto-play**). If using a wireless
  adapter, unpair your phone from native Mazda Bluetooth so calls are handled cleanly
  through Android Auto.
- **Touchscreen works only when parked**: Touchscreen input while moving is governed
  by the system-wide MZD Connect speed lock. Install the **Touchscreen While Driving**
  tweak to enable touch input in Android Auto while driving.
