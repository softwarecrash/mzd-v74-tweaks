# User settings

The installer supports custom default settings and configuration overrides stored
on the USB drive. This allows you to maintain your preferred options and runtime
configuration files across tweak installations, removals and updates, without
needing to re-enter them in the on-screen menu or re-edit files when new installer
releases are copied to the USB.

## Directory layout

User configuration is placed in a `user/` folder at the root of the USB drive,
organized by tweak ID:

```text
user/
    <tweak-id>/
        settings.conf       # User defaults for tweak manifest settings
        <name>.conf         # Overrides for any assets/*.conf file
```

For example, for Android Auto Mod (`android-auto`):

```text
user/
    android-auto/
        settings.conf
        libpatch.conf
```

## Settings defaults (`settings.conf`)

Tweaks that expose configurable options (such as DPI resolution, display aspect ratio,
or speed restrictions) define default values in their `manifest.conf`.

When `user/<tweak-id>/settings.conf` exists on the USB drive, the installer loads your
values as the initial defaults instead of the release defaults:

- When you open the tweak details dialog in the installer UI, the controls are
  pre-populated with your user settings.
- When installing from the command line or running a command tweak, any setting not
  explicitly passed as an argument uses the value from your `settings.conf`.
- If only a subset of settings is declared in `settings.conf`, the remaining settings
  use the standard manifest defaults.

### File format and validation

The structure of `user/<tweak-id>/settings.conf` is exactly the same as the
configuration file stored on the persistent storage during installation:

- One `key=value` pair per line.
- Setting names must match the keys declared by the tweak manifest.
- Values are strictly validated against the tweak schema: numbers must satisfy min,
  max and step constraints; choices must match declared options; boolean values must
  be `true` or `false`. Unknown keys are rejected with clear diagnostics.
- Empty lines and comment lines starting with `#` are ignored.
- File size must not exceed 64 KB (65,536 bytes).

Example `user/android-auto/settings.conf`:

```ini
# Custom default settings for Android Auto Mod
resolution_dpi=153
resolution_par=15800
```

## Asset configuration overrides (`*.conf`)

Some tweaks include runtime configuration files in their `assets/` directory. For
example, Android Auto Mod includes `assets/libpatch.conf` to configure runtime library
features such as touch controls, HUD guidance forwarding, mute/pause behavior, and GAL
protocol version.

When a configuration file matching an asset's filename exists under `user/<tweak-id>/`,
the installer uses your file instead of `tweaks/<tweak-id>/assets/<name>.conf`:

- For example, if `user/android-auto/libpatch.conf` exists, it replaces
  `tweaks/android-auto/assets/libpatch.conf`.
- This applies to any `assets/*.conf` file that is part of the tweak.
- **Full replacement (not merged)**: The override file replaces the bundled file entirely.
  It is **not merged** with the bundled default file. Any configuration options, keys,
  or comments omitted from your override will not be present in the installed file.
  If you provide an override, ensure that all necessary directives for your setup
  are included.
- **Validation**: Unlike `settings.conf`, asset overrides such as `libpatch.conf` are
  not parsed or checked against a manifest schema by the installer. The installer
  checks that the file is a regular file within the size limit, copies it into the
  installation snapshot, and compares it byte-for-byte (`cmp -s`). Content, syntax,
  and directive validation must be handled by the relevant tweak or runtime libraries.
- **Size limit and free-space calculation**: Each configuration override file is limited
  to a maximum size of 64 KB (65,536 bytes, defined by `MZD_CONFIG_SIZE_LIMIT` in `lib/defines.sh`).
  The size of `user/<tweak-id>/` is included in the free-space calculation before
  installation to ensure the persistent storage margin is respected.
- The custom asset is verified and packaged into the persistent installation snapshot
  on the CMU during install or update, so subsequent uninstallation remains completely
  independent of the USB drive.

## Updates and reinstallation

When a new version of the installer or a tweak is released:

1. Copy the updated release files onto your USB drive (overwriting `tweaks/` and `lib/`).
2. Your `user/` directory remains untouched because it lives outside the release folders.
3. When you open the installer and update the tweak, the new version is installed with
   your saved user settings and custom `.conf` assets automatically applied.

> [!NOTE]
> For an already installed tweak, settings are saved in persistent storage on the CMU
> and displayed as **INSTALLED SETTINGS** (read-only) in the detail view. To change
> settings for an already installed version, select **Uninstall**, return to the tweak,
> adjust your settings (or update `user/<tweak-id>/settings.conf`), and select **Install**.
