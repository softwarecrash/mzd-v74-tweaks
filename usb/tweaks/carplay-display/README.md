# CarPlay Display

Scale Apple CarPlay to fit your physical screen size. This tweak modifies the OEM CarPlay configuration file (`/jci/carplay/carplay_config_create.xml`) to declare the correct physical screen dimensions (`widthPhysical` and `heightPhysical`), preventing distortion, stretching, or squishing of CarPlay maps, navigation, and application icons.

Supported firmware: **74.00.324**.

## Settings

### Display size (`display_size`)
Select the physical screen size of your car's center display:

| Option | Display Type | Dimensions (Width x Height) | Aspect Ratio |
| --- | --- | --- | --- |
| `154x85` | 7-inch (Factory default) | 154 mm x 85 mm | 16:9 |
| `177x100` | 8-inch (Factory display) | 177 mm x 100 mm | 16:9 |
| `244x92` | 10.25-inch (Aftermarket display) | 244 mm x 92 mm | 8:3 |
| `297x113` | 12.3-inch (Aftermarket display) | 297 mm x 113 mm | 8:3 |

The default option is `177x100` (8-inch factory display).

You can configure this setting in the installer UI prior to installation or by specifying default values in `user/carplay-display/settings.conf` on your USB drive:

```ini
display_size=177x100
```

## Installation & Removal

- **Install**: Select CarPlay Display in the installer, choose your display size, and select **Install**. Restart the CMU when prompted.
- **Uninstall**: Select CarPlay Display and choose **Uninstall**. The OEM configuration file is restored from its verified backup (`carplay_config_create.xml.org`).
- **Reset**: The tweak provides `reset.sh` to cleanly revert persistent changes during full system recovery or Restore Originals.

Reports and logs are saved on the USB drive under `reports/carplay-display/`.
