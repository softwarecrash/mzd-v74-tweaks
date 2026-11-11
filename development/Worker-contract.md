# Worker contract v1

## Discovery

A tweak is `usb/tweaks/<id>/manifest.conf` plus `run.sh`. The manifest has
`contract_version=1`; see [Manifest format](Manifest-format.md). It is data, never
shell code. The launcher starts `/bin/sh <path>/run.sh <action>` using separate
arguments and captures stdout, stderr, exitCode, signals and output truncation.
No worker depends on interactive stdin, dialogs, a reboot or a build step.

Patch/service actions: install, uninstall, status. Command actions: run, status.
No arguments, --help or -h prints usage and exits 0 without side effects.
Extra arguments or unsupported actions return 1 with stderr and empty stdout,
except `uninstall --preserve-config` for workers declaring `config.<name>.path`.
Source `lib/config-args.sh` before argument checks; the package controller owns
config initialization/removal. Config-owning workers must stop their writers
before completing Uninstall. See [mutable configs](Manifest-format.md#mutable-configuration-and-user-data).

Persistent patch/service/files actions now go through the shared package
controller, including direct public run.sh calls. It saves a self-contained
worker/helper snapshot before installation and selects the saved version for
removal. Normal menu status checks recorded state and file presence; it is not
a fresh full patch/service audit. The deep worker contract below applies inside
the controller before mutations and after completion. See
[Persistent packages](Persistent-packages.md) for states, reset and first-use
requirements. Command tweaks continue to execute from USB without installation.

The launcher reads discovery metadata through one `installer.sh manifests`
request and groups each detail view into `installer.sh details ID "section ..."`.
These return JSON lines with each section's exit code, stdout and stderr.
Read-only detail sections verify the data they use without acquiring the global
package lock or reusing mutation-phase verification. Failed or truncated batches
fall back to individual queries. Mutating operations perform their own checks.

The launcher batches menu status through `installer.sh statuses "id1 id2"`.
Without a saved installation, public status returns `uninstalled` without
executing the worker. This means no registered installation, not a guarantee of
installability. Command readiness and all detailed prerequisites are checked
when the action runs. The status table below describes the deep worker result.

## Managed uninstall cleanup

The controller snapshots original patch targets and metadata for new installations.
Workers still implement their normal inverse operation and verify their own
payload removal. After their successful uninstalled-state check, the controller
restores original metadata when the content matches, removes owned `.org`
backups after the last registered consumer, and prunes empty created containers.
Never delete another consumer's backup from a worker. Configuration preservation
continues to be controlled by `uninstall --preserve-config`.

## Status

| Exact stdout, followed by newline | Meaning |
| --- | --- |
| installed | Complete persistent installation, as documented by the tweak |
| uninstalled | Absent and ready for its install action; for commands, ready to run |
| unavailable | Unsupported target/firmware, missing component, prerequisite or conflict |
| broken | Evidence of a partial installation or missing/altered installed payload |

All four are successful inspections (exit 0). unavailable and broken MUST explain
why on stderr. Other successful states normally leave stderr empty. The launcher
shows the reason and provides Retry status instead of install/run for blocked
states. A broken managed package may additionally offer Uninstall after the
read-only `installer.sh uninstall-check ID` verifies its saved package, state,
uninstall contract and dependents. This never selects the replacement USB worker;
the normal removal action repeats its existing checks. Broken is not an automatic
repair permission.

An inspection failure (for example unreadable target, invalid manifest or missing assets, missing
probe tool or concurrent change) returns 1, empty stdout and a reason on stderr.
Unknown target content alone is unavailable; only evidence of an installation
justifies broken. Patch workers detect complete forward/reverse states on RAM
copies. Individually reversible hunks identify partial installations. Content
that cannot establish ownership is unavailable, not guessed absent.

Status does not acquire modification locks, remount storage, change the watchdog,
start/stop services, create USB reports or call sync. It may read assets and use
private /tmp scratch directories, removed on exit and catchable signals.
Installed SSH means a complete persistent hook/payload/marker, not a live login.

## Prerequisites, dependencies and conflicts

Supported firmware is explicit in the manifest and enforced by run.sh. A worker
may define mzd_check_prerequisites() for hardware/component checks; it returns
failure with a clear stderr reason. Shared status maps that to unavailable, or
broken if an installed tweak has lost a prerequisite.

requires/conflicts contain space-separated tweak IDs in manifest.conf. The
shared reader loads all configuration for run.sh; no duplicate declarations or
JSON parser are needed. Dependencies
must be installed. Conflicts must report uninstalled; every unresolved or blocked status
blocks the operation. Cycles are rejected. Recheck immediately before modifying
anything. The manifest never substitutes for runtime checks.

## Modifying actions

0: verified success; 1: ordinary failure/refusal with known safe state;
2: critical rollback/cleanup failure or uncertain changes. Output is readable
progress/result text. stderr explains failures. Critical errors explicitly say
not to reboot. Signals/transport loss are not successful outcomes.

Action reports use `reports/<tweak-id>/<action>-<timestamp>-<unique>/` on the
originating USB, with `run.log` and `status.txt`. The result displays that same
directory. Saved packages retain their bundled helper version for removal; older
installed packages may still use their original report layout until reinstalled.

The worker owns target locks, prerequisites, exact patch application, backups,
rollback, mount/watchdog restoration and reports. Tweaks touching the same target
share a lock. Unified patches must contain exactly one relative `target.data`
file; no absolute or additional target paths are accepted. Apply/reverse only this tweak and preserve unrelated edits. Verify
writes and rollback. Do not overwrite an unknown OEM backup or silently replace
unknown service files. No automatic reboot. The launcher serializes actions,
shows the result and rechecks status after acknowledgement.

Tests must exercise the declared entrypoint, not only a copied transform.
Contract compliance and feature correctness are separate review responsibilities.

## Export commands and progress

System export commands declare `actions=run status`. A ready command returns `uninstalled`; the launcher labels this Ready. It does not claim an installed state after exporting. Unavailable sources, firmware, tools or USB space return `unavailable` with a reason. Status never copies data or scans the entire source tree for its size.

With optional `progress=true`, Run executes as a background job. Shared export workers call `mzd_export_progress <done> <total> <message>`; zero total means a phase without a meaningful percentage. Progress is written atomically in RAM. Completion retains the worker exit code, stdout and stderr for the usual result dialog. Only one progress job runs per session; Exit is disabled while working. Launcher cleanup waits for an active export before restoring storage state. Direct shell `run` remains synchronous.

Exports write unique folders below the originating USB's `exports/<id>/`. Completed folders end in `-complete`; failed exports retain `.incomplete` and diagnostics. They do not alter source data, root mount mode, watchdog or log rotation settings.

## Explicit reset and owned extras

For unmanaged plain file patches, a rejected install may offer a separately
confirmed single-file recovery. This requires a verified OEM `.org` and no
overlapping saved installation. It never adopts or uninstalls unknown services.
See [Target recovery](Target-recovery.md) for the controller protocol and guards.
Worker status/action interfaces remain unchanged.

`System > Restore originals` resets `.org` snapshots on internal Linux filesystems
and runs registered cleanup hooks. This is a separately confirmed command, never
an automatic response to broken/unavailable status. Known backups require the OEM
hash; uncatalogued old snapshots have no guarantee of OEM provenance. Preserve
both current files and backup data on USB, verify writes, then remove internal
`.org` backups only after restored files and cleanup are verified. Recheck all
statuses afterwards. Normal uninstall continues to reverse only its own patch.

Workers that create persistent extras declare `reset_entrypoint=reset.sh` with:

- `check`: read-only ownership/cleanup preflight, no deletion or service changes.
- `prepare`: archive extras in `MZD_RESET_DIR`, then stop/disable owned services.
  Use exported `MZD_REPORT`, `MZD_SYSTEM`, `MZD_USB`, `ACTION` and shared mount
  helpers so the reset worker restores mount state. Do not stop foreign services.
- `finish`: verify that owned runtime is stopped, then delete only registered,
  verified extras. This runs after file restoration; do not restore patch backups
  inside hooks. Failure retains remaining `.org` backups and reports the phase.

Hooks are trusted repository code, never arbitrary files discovered on the CMU.
Missing files may be repairable; unknown/changed payloads must not be blindly
removed. A new service/files worker must provide an entrypoint hook and isolated
behavior tests. Old installer extras need an explicit reviewed hook; a generic
`.org` reset cannot discover their ownership. No automatic reboot.

Reset hook outcomes use the same severity: 0 success, 1 known safe refusal/failure,
2 incomplete/uncertain runtime cleanup. The restore worker preserves critical
severity and prevents backup deletion after a failed hook.

## Restart after leaving the launcher

Workers still never reboot. The UI remembers successful install/uninstall/run
operations with `reboot_required=true` for the current session. Exit then offers
**Restart** or **Exit** (leave without restarting). Back/Escape on this dialog
also leaves without restarting. Status checks, failed operations and operations
without the flag do not create a restart recommendation. A critical error blocks
the Restart choice even if an earlier operation requested one.

Explicit Restart sends a session event over the existing shell bridge. The
launcher waits for work, closes its own processes, saves logs and flushes writes
before invoking `reboot`. The USB is left writable; no USB read-only remount
blocks Exit or Restart. Internal filesystem/watchdog cleanup remains required.
Launcher/cleanup errors suppress reboot.
There is no SSH dependency. The restart recommendation belongs to the current
launcher session; installation records are described in Persistent packages. In the offline
preview this event is simulated; it never restarts the computer.

## Effective settings

A worker still receives one action argument. The controller accepts optional
literal `key=value` arguments for Install/Run and exports a private, normalized
`MZD_SETTINGS_FILE` after schema validation. Load the matching shared
`settings.sh`, optionally verify with `mzd_settings_check manifest.conf FILE`,
and read a value with `mzd_setting name`. Never source/eval that file or read
values from a new USB during saved removal/reset.

The controller preserves settings through the saved package lifecycle; see
[Manifest format](Manifest-format.md#optional-tweak-settings) and
[Persistent packages](Persistent-packages.md#effective-tweak-settings).
Shared `mzd_begin` copies effective settings into the USB action report when a
worker opens one. Validation refusals are captured by normal diagnostics.
The settings example is non-destructive and reports its values on stdout.

## Component workers and compatibility details

Workers with `components=components.tsv` (or declaring `preflight=true`) support an
extra read-only `preflight` action returning `block<TAB>reason`, `warning<TAB>reason`
and/or `info<TAB>reason`, at most 16 lines of 512 characters. A completed inspection
with a block returns 1; warnings and info messages alone return 0. The GUI calls this through
`installer.sh preflight-info ID` only for an opened uninstalled detail view.
It waits for the result before enabling Install. No new persistent status enum
is introduced, and compatibility never blocks saved Uninstall.

The internal `validate-install` action validates replacement assets, generated
configuration, firmware, native module checks and compatibility before the
controller removes an old version. It is not a mutation action. Install repeats
its compatibility check under the shared lock. A worker callback returns plain
records only: no dialogs, mounts or writes. Workers may also define
`mzd_bundle_patch` to dynamically configure patch components from effective settings.

Bundles can configure service environment variables using `loader_env` records
in `components.tsv` (`loader_env<TAB>NAME=VALUE<TAB>-<TAB>service<TAB>-`).
Value strings must not contain quotes, control characters, backslashes, angle
brackets or ampersands (`"`, `\r`, `\n`, `\`, `<`, `>`, `&`). Colon-separated
path variables (such as `LD_LIBRARY_PATH`) are merged with existing definitions
on installation. When uninstalled, only the tweak's declared tokens are removed;
tokens still required by the OEM configuration or another installed tweak are
preserved.

Individual `shim` component records may specify `no_reset` in the 5th column
instead of `-`. This sets `reset_board="no"` on the target service element to
prevent reboot loops from unhandled exceptions, and records the original value
so it can be restored on uninstall. Component status verification confirms that
`reset_board="no"` remains active.
See the [bundle example](examples/bundle/README.md) for transaction and upgrade limits.

## Shared GUI extensions

`type=gui-extension` uses automatically managed GUI support and a saved consumer
snapshot. In addition, component bundle workers (`type=files`) can declare `gui_api=1`
to attach an in-car Applications menu view, resident script, Lua backend service,
and translations to their package.

For hybrid bundle workers, `usb/lib/bundle.sh` automatically manages the GUI lifecycle:
it runs GUI asset, capability, and service preflight checks during `validate-install`,
serializes with other GUI operations using `/tmp/mzd-gui-extension.lock`, calls
`mzd_gui_mutate install`/`uninstall`, incorporates GUI status into the worker's status
result, stops registered services, and delegates cleanup phases to `mzd_gui_reset`.

See [Shared GUI extensions](Gui-extensions.md) for the API 1 metadata,
first/last-consumer lifecycle, ownership rules and development limits.

Tweaks with `preflight=true` also run their read-only preflight against the
staged effective settings and overridden assets before publication or replacement
of an installed package. A rejected candidate leaves the installed worker intact.
