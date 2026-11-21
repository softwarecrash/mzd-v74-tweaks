# Log Collector

Supported firmware: **74.00.324**. Select **System > Log Collector > Run**.
Copies available running logs to the connected USB under `exports/logs-collector/` or adjusts their rotation size in `/data/log/syslog-ng.conf`.
Progress shows files copied and elapsed time. Keep USB connected until completion.

## Logs Rotation Size

- **Stock 512 KB** (`512`): Original factory rotation size.
- **Medium 1 MB** (`1024`): Moderate increase in log storage capacity.
- **Enlarged 5 MB** (`5120`): Increases log storage capacity before files rotate and overwrite, providing more driving time before needing to copy logs (especially useful when debugging with OEM AA Mods).

## How It Works

- When the selected rotation size matches the active setting in `/data/log/syslog-ng.conf`, **Run** copies the current running logs to the connected USB drive.
- When the selected rotation size differs from `/data/log/syslog-ng.conf`, **Run** updates the rotation size in `/data/log/syslog-ng.conf`, creates an OEM backup at `/data/log/syslog-ng.conf.org` if the file matches the OEM checksum (`62b15df0e73fd732774e9c5968041899`), and prompts to restart the CMU for the change to take effect.
- Restoring the stock setting (`512`) sets the rotation size back. When the file matches the OEM checksum, the `.org` backup is safely removed.
- If an unrecognized rotation size (such as `1000`) or non-OEM content is detected, **Run** warns the user while still allowing the rotation size to be updated to the selected preset.

To preserve diagnostic output, run log collection before turning off the ignition, as powering off can cause running logs to be lost. Each run creates a separate output folder and log. Completed folders end in `-complete`; failed runs retain incomplete output. Review logs for personal information before sharing them.
