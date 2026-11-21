# CarPlay Wireless

Enable native Wireless Apple CarPlay on Mazda vehicles equipped with the **CMU150** head unit running firmware **v74.00.324**.

## How It Works

This tweak unlocks native Wireless CarPlay on compatible CMU150 hardware originally supporting wired CarPlay only:

1. **Hardware detection spoofing (`/jci/scripts/get_board_type.sh`)**: Spoofs the CMU board detection result based on the calling process. It reports legacy hardware (`ret=1`) when queried by `vim_app` so core vehicle systems operate normally, while reporting wireless-capable hardware (`ret=2`) to the CarPlay service daemon.
2. **Service configuration tuning (`/jci/sm/sm_WCP.conf`)**: Adjusts service parameters for `jciLDS` (removes `GPS=UBLOX` argument and disables board reset on error) and `jcinavi` (clears `args="wcp"` and disables board reset) to prevent GPS conflicts and restart loops.
3. **Startup script tuning (`/usr/bin/autostart`)**: Prevents the startup sequence from creating `/data_persist/ublox.txt`, avoiding u-blox GPS conflicts and DTC fault code `B119F`.

## Hardware Verification & Safety

During installation preflight, the tweak inspects hardware GPIO pins (`DI_TP1056` and `DI_TP1029`):
- **Legacy CMU150 (GPIO 0/0)**: Compatible. Installation proceeds.
- **Newer CMU hardware with factory Wireless CarPlay (GPIO 1/x)**: The tweak is not required; installation is **blocked** in preflight.
- **Unknown / Unreadable GPIO**: Installation is **blocked** for safety.

## Installation & Removal

- **Install**: Select **CarPlay Wireless** in the installer and select **Install**. Restart the CMU when prompted.
- **Uninstall**: Select **CarPlay Wireless** and choose **Uninstall**. All modified files are restored from verified OEM backups (`.org`).
- **Reset**: The tweak provides `reset.sh` to cleanly revert persistent changes during System > Restore originals.

Reports and logs are saved on the USB drive under `reports/carplay-wireless/`.

## Persistent Data

The tweak may create the file `/data_persist/wcp_force_off` on the vehicle’s persistent storage. Its presence acts as a kill‑switch that forces the wireless CarPlay modification to stay disabled. If this file exists, the startup script and board‑type spoofing will skip applying the wireless enable changes, effectively reverting to the original wired‑only behavior. Deleting the file re‑enables the modification on the next reboot.


## Upstream Attribution & License

Based on the [mazda-cmu150-wcp-mod](https://github.com/Kenatia/mazda-cmu150-wcp-mod) project:
- **Author**: Loc Le Van ([Kenatia](https://github.com/Kenatia))
- **Source Repository**: https://github.com/Kenatia/mazda-cmu150-wcp-mod
- **Commit Hash**: `2069d1e6de20a37ef17654cb5a2fcfa9a4ffdddf`
- **License**: [MIT License](LICENSE) (Copyright (c) 2026 Loc Le Van)
