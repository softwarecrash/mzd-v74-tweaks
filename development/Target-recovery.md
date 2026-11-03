# Confirmed recovery of an unmanaged patch target

This is a separate single-file action, not adoption of an old installation.
Opening the detail view of a non-installed or blocked patch checks eligibility
in the background. A verified response adds a secondary **Restore original**
button without moving focus or opening another dialog. Only clicking that button
opens confirmation. A failed/denied check leaves the existing detail view intact.
Stale responses from closed/replaced detail views are ignored.

The UI calls `installer.sh restore-check <id>`. This is read-only: it uses
file checks and produces no USB reports, locks, remounts or service changes.
An eligible result is one line:

```text
available<TAB>confirmation-fingerprint<TAB>absolute-target-path<LF>
```

An unchanged OEM target returns `original<LF>` with exit 0, including when no
`.org` exists. The UI silently keeps the ordinary details and hides Restore.
Other refusals and invalid replies remain diagnostic. Restore availability alone
does not disable Install: compatible unrelated edits may be preserved, and the
installation action still performs its complete preflight before writing.

An install blocked by a completed worker target inspection can still emit
`MZD_RECOVERY_CANDIDATE`. After the failed result is acknowledged, this returns
to the detail view to offer the same button. It never opens confirmation
automatically, and does not interpret human error text. Other install errors do
not trigger this return. No install attempt is required for the detail button.

Eligibility requires a plain patch without cleanup hooks or additional owned
paths, matching firmware, regular non-symlink internal files, and a `.org` matching
the manifest's OEM fingerprint, with a current file different from that original.
The creator and version of the old patch are irrelevant. Recovery does not run
the patch tool or require the newer patch to recognize the old modifications;
it is also available when normal installation could preserve those modifications.
This avoids expensive forward/reverse probes and old patch-applet limitations.
Read/hash/tool errors fail closed. Services and installed applications need their own
reviewed removal procedures and are deliberately excluded.

Mount eligibility uses software roles, never block-device names. The deepest
actual mount for target and backup must be the same supported Linux filesystem
at `/`, `/jci`, Resources (`/tmp/mnt/resources` or `/mnt/resources`) or persistent
data (`/tmp/mnt/data_persist` or `/mnt/data_persist`). The installer source mount
is excluded even if it uses ext4. Unknown child mounts and RAM/network filesystems
cannot fall back to an allowed parent. Package-store paths remain excluded by
the ownership checks below. A new filesystem layout needs an explicit role-map
update; a different device name does not.

Every saved package is verified before checking registered paths. A receipt for
the same ID, a shared target/backup or an owned ancestor container blocks recovery.
Registered paths are resolved before comparison to catch aliases of the same file.
Unrelated intact packages remain untouched. Unverifiable records also block it.

After explicit confirmation, `installer.sh restore-original <id> <fingerprint>`
acquires the global Restore, package and target locks and rechecks eligibility.
The fingerprint binds the ID, version, firmware, target path, expected OEM hash
and observed file hash. Changing the target definition, backup expectation or
file contents since the offer requires a fresh confirmation.
Current and original files are archived and verified on the originating USB in
`reports/restore-file-<id>/restore-original-.../files/1/`, with hashes and the target path.
Free space is checked before the internal filesystem is remounted writable.
Reports use atomically created unique folders so a reset CMU clock or repeated
process ID cannot reuse an earlier report's rollback state or overwrite archives.

The existing same-directory publication and rollback helpers restore the file.
Only after verification is the internal `.org` removed. Locks, watchdog and mount
state are cleaned up; USB writes are flushed and the USB remains writable. Unknown concurrent
edits are not overwritten during rollback. Uncertain rollback/cleanup is critical
(exit 2). An ordinary failure after commit can leave the original restored and its
`.org` retained, for example when backup deletion fails; the report states this.

The GUI does not reinstall automatically. After successful Restore and OK, the
user may select Install again. Restore requests a restart recommendation on Exit.
Back or Escape on the confirmation makes no changes. No restart is automatic.

Run `python tests/contract/test_recovery.py` and `node tests/installer/test-ui.cjs`.
The offline preview demonstrates the offer when installing Main Menu Loop;
its restore and subsequent install are simulated. This proves no vehicle behavior.

## Diagnose a missing Restore button

From the installer directory on the USB, run this read-only command on the CMU:

```sh
sh installer.sh restore-check list-beep
```

Success prints `available`, a confirmation fingerprint and the target path.
A refusal returns nonzero and explains the condition on stderr. The detail
dialog also displays that reason below ?Restore original unavailable?, so it
can be read or photographed without SSH or shell access. Capture both
streams when sharing results; do not run `restore-original` without confirmation.
The expected backup for No List Beep is
`/jci/gui/common/controls/List2/js/List2Ctrl.js.org`, next to the target.
Its expected OEM MD5 for 74.00.324 is `e111883b9dcbeb6bb154521826fcacac`.
A differently named, relocated or already modified backup is not equivalent.
Other managed tweaks using List2Ctrl also prevent single-file restoration.

With the private CMU backup and existing emulator prerequisites available,
`python tests/transport/test-in-vm.py --recovery` reproduces the pre-persistence
List Beep patch using the original ARM BusyBox, then compares recovery at `f88e9db` with the
working-tree recovery check. It uses private disposable fixtures and never
connects to a vehicle or publishes the OEM file. This is emulation evidence,
not a test of a particular user's filesystem, backup or runtime deadline.
