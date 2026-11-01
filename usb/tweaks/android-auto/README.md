# Android Auto Mod

OEM Android Auto Mod version **0.10.0** for CMU **74.00.324**.

This tweak unlocks touchscreen input while driving in Android Auto and forwards
turn-by-turn navigation guidance, lane recommendations and street names to the
windshield Active Driving Display (HUD).

## Features

- **Touchscreen unlock**: Enables touch input while driving in Android Auto.
- **HUD navigation**: Displays turn directions and street names on supported Windshield HUDs.
- **Configurable resolution and aspect ratio**: Supports factory 7-inch displays and 10.25-inch aftermarket screens.
- **Audio cut-off fix**: Low-latency ALSA audio pipeline and amp mix hold to prevent prompt cutoffs.
- **GAL v1.6 support**: Protocol negotiation for modern Android Auto capabilities.

## Settings

Configurable in the installer UI or via `user/android-auto/settings.conf`:

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `resolution_dpi` | Number (100–160) | `141` | Display DPI. Common values impacting layout: 103, 113, 122, 141, 153. |
| `resolution_par` | Choice | `10670` | Pixel aspect ratio. Factory screen: `10670`. Aftermarket 10.25-inch display: `15800`. |

## User settings and configuration overrides

Custom default settings and runtime configuration can be placed on the USB drive:

- `user/android-auto/settings.conf`: Default values for `resolution_dpi` and `resolution_par`.
  These are validated against the manifest schema (numerical bounds and choice options).
- `user/android-auto/libpatch.conf`: Custom runtime library options (e.g. `use_protocol_v1_6`,
  `aa_audio_low_latency`, touch behavior, HUD options).
  - **Full replacement**: The override file replaces `assets/libpatch.conf` entirely; it is
    **not merged** with the bundled default file. Any options omitted from your override will
    not be present in the installed file.
  - **Validation**: `libpatch.conf` is checked against the 64 KB size limit, copied into the
    persistent snapshot, and compared byte-for-byte (`cmp -s`). It is evaluated at runtime
    by the Android Auto mod libraries.
  - **Size limit**: Configuration overrides must not exceed 64 KB (65,536 bytes) and their
    size is included in the persistent storage free-space calculation.

See [User settings](../../../wiki/User-settings.md) for detailed instructions.

## Hardware compatibility

- **Windshield HUD (`WHUD_color`)**: Fully supported; navigation directions and street names display on the HUD.
- **Combiner HUD (`CHUD_mono`, `CHUD_color`)**: Touchscreen unlock and core Android Auto features work; street names are not supported on combiner displays (warns in preflight).
- **Vehicles without HUD**: Touchscreen unlock works; navigation display is unavailable (warns in preflight).

## Installed files

- **Payload directory**: `/tmp/mnt/data_persist/oem-aa-mod/`
  - `libpatch-blmjciaapa.so` (preloaded into `jciAAPA`)
  - `libpatch-svcjcinavi.so` (preloaded into `jcinavi`)
  - `libpatch-aap_service.so` (preloaded into `aap_service`)
  - `libpatch.conf` (runtime configuration)
- **Service configurations**: `/jci/sm/sm.conf` and `/jci/sm/sm_WCP.conf`
- **System attributes**: `/etc/aap_system_attributes.xml` and `/etc/aap_system_attributes_UCP.xml`
