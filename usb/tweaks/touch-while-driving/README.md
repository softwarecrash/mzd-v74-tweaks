# Touchscreen While Driving

For firmware **74.00.324**. Removes the Mazda touchscreen speed restriction
and the GUI `Global.AtSpeed` handler, so Mazda menus also stop becoming
speed-disabled. Restart after installing or uninstalling.

The **GPS & General Speed Restriction** setting defaults to `enabled`. This
preserves the vehicle's existing general (bus) speed restriction value; it does
not force that restriction on. The LVDS touch restriction is disabled either
way. Select `disabled` to also disable the general restriction. This can cut
GPS/GNSS and compass signals to MZD Navigation, CarPlay and Android Auto; it is
not required for touchscreen unlock. On upgrade from 0.1.0, the old choice
values `disable` and `keep` fall back to the new `enabled` default. This changes
the former `disable` behavior to preserving the vehicle's existing general
restriction. DVD unlocking is outside this tweak's scope.

The worker uses the OEM NVRAM setters, verifies their return codes and reads
both values back. Before the first change, it saves the original values under
`/tmp/mnt/resources/mzd-tweaks/touch-while-driving/original.txt`. An absent key
means the OEM `enable` default; uninstall restores that value through the OEM
setter, which can leave a formerly absent key explicitly enabled.

The Common.js patch uses the shared patch engine, OEM backup and lock. Uninstall
reverses only this patch and restores the saved NVRAM values, retaining unrelated
Common.js changes. Failed transactions attempt to restore the entry file and
both entry settings. A failed rollback reports a critical result and retains
the baseline for recovery. Power loss cannot be rolled back by a shell trap;
the saved package and baseline remain available for removal.

Restore originals archives the baseline, restores the settings and removes the
owned backup only after verification. Unknown backups, extra files and legacy
AIO/TouchTune installations are not automatically adopted. Normal menu status
uses package receipts; deep worker status also checks the patch and settings.

Reports use the standard USB `reports/touch-while-driving/` directory. The
worker does not issue runtime DBus unlocks or change the native MMUI service.

## Validation

The inspected EU OEM Common.js fingerprint is recorded in manifest.conf.

Isolated entrypoint tests cover settings, patch preservation, rollback, saved
removal and reset. Vehicle behavior at speed, compass operation, and
CarPlay/Android Auto touch behavior still need vehicle testing. The bench's
existing touchscreen hardware fault cannot establish touch functionality.
