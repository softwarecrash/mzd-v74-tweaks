# Shared runtime

manifest.sh: literal KEY=VALUE parsing and configuration validation.
report.sh: asset availability checks, firmware checks, reports and outcome severity.
system.sh: owned locks, writable mounts, watchdog and cleanup.
patch.sh: exact reversible patch probes, backups, writes and rollback.
status.sh: read-only state, prerequisites, dependencies and action preflight.

Workers source these trusted code libraries; manifest.conf is read as data.
There are no project-file checksum sidecars. A shared helper change
requires tests for every affected tweak. Do not move tweak-specific policy here.

export.sh: read-only source exports, originating USB detection, unique output folders and progress.
jobs.sh: detached command execution and RAM progress/result polling through the serial bridge.

metrics.sh: read-only CPU tick deltas and free space for mounted block filesystems.

restore.sh: internal backup discovery, USB archives, owned reset hooks, verified publication and rollback.

restart.sh: explicitly requested launcher reboot after successful cleanup; never called by workers.

transport.sh: factory Lua transport startup and liveness.
logging.sh: literal installer.conf parsing for normal/debug/off diagnostics.
lua-bridge/: loopback HTTP, direct process execution and wire encoding.

packages.sh: persistent per-tweak code/runtime snapshots, versioned receipts,
fast registered status, selective removal dispatch and cross-tweak path guards.
Each installed package owns its helper snapshot; new USB helpers are never
sourced by an old worker. See [Persistent packages](Persistent-packages.md).

settings.sh and settings.awk: literal typed schemas, normalized effective values,
saved configuration validation and `mzd_setting` for workers. They do not source
configuration or evaluate values. The GUI, shell and developer validator share
the contract in [Manifest format](Manifest-format.md#optional-tweak-settings).

shim.sh and shim-preload.awk: shared .so/LD_PRELOAD state inspection, verified
payload placement, multi-loader configuration edits, rollback and reset hooks.
No native shim is executed by these helpers and no service is restarted.

components.sh/components.awk: data-only component plans, derived ownership and
OEM catalogs. config-map.awk: configuration keys mapped to normalized manifest
settings, without duplicate defaults or evaluation.

bundle.sh: mixed payload/loader/patch transactions, saved-configuration removal,
rollback journal, reset hooks and read-only compatibility messages. When `GUI_API`
is declared, it automatically orchestrates GUI extension validation, mutual exclusion
locking via `/tmp/mzd-gui-extension.lock`, installation/removal mutation, status
aggregation, and reset service stops. See the [component example](examples/bundle/README.md)
for the supported scope and limits.

gui-extension.sh: shared Applications menu integration, GUI module publication,
developer hook and runtime support lifecycle, asset validation and reset handling
for standalone and hybrid GUI extensions.

gui-services.sh: background service supervision, resident IPC bridge registration,
RPC validation and lifecycle management for tweaks declaring `gui_service` and `gui_resident`.

vehicle.sh: bounded read-only VBS control/HUD queries. It reports facts and
unknown values; feature-specific compatibility policy belongs to each worker.

datetime.sh: the car's date and time for log/report names (`20261101-204939`,
`...Z` when the zone is unknown, `nodate-u228` without a date), the `Start:` log line
and file dates. Read-only, never sets a clock. See [CMU time](CMU-time.md).

## Blocked status diagnostics

During development, `logging=debug` is the shipped default and also the fallback
when installer.conf is absent or contains no logging entry. Explicit normal/off
settings remain supported.

The Lua transport records each `broken`, `unavailable` or `error` row from a
successful batch status request, including the tweak ID and the returned reason.
This is enabled in normal logging as well as debug logging. Single-status and
refused-action stderr is also retained with its request label. Healthy rows and
routine metrics do not add diagnostic output.

The launcher buffers these diagnostics in RAM and saves `http.log` under the
session's USB `installer-logs/` directory on Exit, following the existing logging
setting. `logging=off` disables USB snapshots. Status workers still make no writes.
A saved `state=failed` explains why a new install is blocked, but is not a fresh
failure of the replacement USB version: inspect the original action report for
the earlier operation's error. No new install is attempted by Retry status.

## Saved operation failures and SSH startup

Failed saved-worker Install/Uninstall calls retain `failure.log` next to
`state.conf`. It records the phase, exit code, saved worker path/version and bounded
stderr/stdout excerpts (4096 characters per stream). Failed post-action
verification records expected/actual state and the status command's exit code.
The record is mutable diagnostics outside the immutable package inventory;
package checks allow only its named files. Saved status reads it without writes,
so later GUI scans and transport logs retain the earlier failure explanation.
Older failed receipts without this record explicitly say that the original
details were not recorded; a new USB cannot reconstruct them.

SSH Access 0.8.5 records startup phases and stderr in `ssh-start.log` inside its
USB action report. On startup failure the worker forwards those diagnostics to
the controller before cleanup, including the supervisor's last sshd runtime
messages when available. Successful startup closes the supervisor's startup
streams; existing runtime logging remains separate. This does not change the
two-second readiness check or automatically repair a failed receipt.
