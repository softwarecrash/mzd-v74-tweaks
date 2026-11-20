# Log Collector

System command for firmware 74.00.324. Select **Run** in the launcher, or invoke `sh run.sh run`. `status` is read-only and returns `uninstalled` when ready (displayed as Ready), or `unavailable` with a reason on stderr.

## How It Works

- **Export running logs**: When the selected rotation size matches the active setting in `/data/log/syslog-ng.conf`, **Run** copies regular files from `/var/log/running_log` into `logs/` on the originating USB, retaining relative paths. Progress shows copied files / total files and elapsed time. Logs remain live: if a file disappears during copying, the export fails visibly and retains its incomplete output.
- **Adjust log rotation size**: When the selected rotation size differs from `/data/log/syslog-ng.conf`, **Run** adjusts the rotation limit in `/data/log/syslog-ng.conf`, creates an OEM backup at `/data/log/syslog-ng.conf.org`, and signals the installer to recommend a reboot on exit (`MZD_REBOOT_REQUIRED`). Restoring the stock setting (`512`) checks MD5 against the OEM checksum (`62b15df0e73fd732774e9c5968041899`) and removes `.org` upon verification.

## Output

Output is saved on the USB containing this worker, under `exports/logs-collector/<timestamp>-<unique>-complete/`. Each run creates a separate folder with `run.log`. Failed runs retain a folder with `.incomplete`; they are never labelled complete. The final dialog displays the output path or failure details.

The worker resolves its own location and checks the actual USB mount and available space. It may temporarily remount that USB writable and restores its original mount mode afterwards. It does not remount internal storage, stop the watchdog, install anything or reboot. Keep the USB connected until the result appears.

Uses shared `lib/export.sh`. `progress=true` enables RAM-based background-job polling through the existing bridge. No Python or Node.js is needed on the vehicle.
