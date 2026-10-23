# Standalone diff/patch tweaks

Five self-contained tweak folders for Mazda CMU firmware **74.00.324**. Each
contains its own `run.sh`, manifest, unified diff and required assets. Copy any
one folder to USB and run it from a shell. No shared `lib/`, launcher, build step,
Python or JSON parser is needed on the CMU.

The common contract is the shell interface (`install`, `uninstall`, `status`),
output/exit rules and the manifest. Each worker owns its implementation and
lifecycle. Shared helpers can be considered after migration and installer
integration. See [MANIFEST.md](MANIFEST.md).

## Repository layout

```text
tweaks/<id>/                 # Worker, manifest and tweak-specific assets
tests/tweaks/                # Worker, metadata and SSH supervisor tests
docs/tweaks/                 # Usage and implementation notes
schemas/tweak-manifest.schema.json
```

A single tweak needs only its own complete folder; its position/name and the
caller's working directory do not matter. Copy the complete `tweaks/` directory
to use all five tweaks, or copy just the required tweak folder. No packaging
script or code generation is required.

| Folder | Function |
| --- | --- |
| `ssh` | Native SSH on port 22, login `cmu` / `jci` |
| `list-beep` | Disable the two long multicontroller list beeps |
| `shorter-delay` | Reduce list autoscroll delays and intervals |
| `list-loop` | Wrap between the first and last selectable list entries |
| `main-menu-loop` | Wrap between the first and last main-menu icons |

From an existing root shell, use the actual USB mount path, for example:

```sh
sh /tmp/mnt/sdb1/tweaks/list-beep/run.sh install
sh /tmp/mnt/sdb1/tweaks/list-beep/run.sh status
sh /tmp/mnt/sdb1/tweaks/list-beep/run.sh uninstall
```

Every `run.sh` is a shell-only worker: it performs the requested action without
dialogs, confirmation prompts, MMUI calls or automatic reboot. Without an
argument, or with `--help`, it prints usage and makes no changes. Unknown actions
(including the removed `dialog` action) and extra arguments are rejected before
mounts, reports or target writes. `restore` is no longer an accepted action.

The current working directory and copied folder name do not matter. Progress
and completion are text on stdout; errors are on stderr, and failures return a
nonzero exit code. `status` writes exactly `installed` or `uninstalled` to stdout
on success. Detailed reports remain on the startup USB drive.

An installer can read the manifests, display its own selection/confirmation,
then call these same actions sequentially and present their results. The
installer owns the display implementation and any reboot question. Direct shell
users reboot the CMU themselves to reload changed UI files. SSH starts
immediately and also starts after reboot. These folders do not provide the MP3
entry point; use the existing upstream entry mechanism to obtain a shell first.

`reboot_required` is `true` for the four UI tweaks and `false` for SSH. A launcher
can collect successful UI changes and offer one final reboot. The workers never
reboot, and the flag describes how changes become effective, not vehicle-test
coverage. The current upstream launcher/release recipe is unchanged; use the
standalone folders for this experimental structure.

## Independent implementations

The five `run.sh` files are maintained directly and contain their technical
helpers locally. Repeated helper code is intentional at this stage. Edit the
worker itself and refresh its `run.sh.md5` sidecar after a change.

Other tweaks can implement their own commands, file-copy or native-service
workflow. They follow the same shell/manifest contract. Shared-code extraction
is a later step based on the migrated tweaks. Existing upstream installers still
need individual adaptation and validation.

The manifest declares supported firmware; each worker must enforce that support.
It does not prevent implementation differences or replace conflict, backup and
rollback checks. CI checks the workers and the shared external contract.

## Patching and backups

The diffs contain the previously vehicle-tested modifications. No additional
JavaScript helpers or replacement full JS files are introduced. The three list
tweaks deliberately remain separate, although they change the same file.

The native BusyBox 1.19.2 `patch` has no `--dry-run`. Each reference worker therefore
applies both directions to separate USB copies, then applies the inverse and
requires a byte-identical round trip. Exactly one direction must be valid.
Unknown, partially applied or ambiguous patches are refused before writing
the target. Repeated installation or removal leaves the selected state intact.

On the first write, an adjacent `<target>.org` backup is created only from the
known original. An existing backup must match that original's checksum. This
backup is shared by tweaks targeting the same file and retained on uninstall.
It is never overwritten with a modified file. If a modified target has lost
its original backup, the script refuses to change it.

Normal uninstall reverses the individual diff rather than copying the entire
original over a shared file. Other list tweaks are preserved. Every operation
also saves the complete previous target, patch probe logs, exit status and the
prepared change under `reports/diffpatch/<tweak>-<timestamp>-<pid>/` at the root
of the **startup USB drive**. Failed writes are rolled back to that previous
file. Root/resources mount flags and the watchdog setting are restored on
normal exit or a caught signal. Power loss cannot be made transactional by a
shell script; the retained OEM backup and USB rollback copy remain available.

## SSH details

The patch adds only the boot hook to `/jci/scripts/stage_wifi.sh`. The service
and configuration live under `/tmp/mnt/resources/mzd-v74-tweaks/ssh/`. A running
unrelated listener on port 22 is refused; the OEM service on port 36000 is left
alone. There is no dependency on a private developer key.

The password change uses a RAM overlay over the existing account file. The
service does not persist a replacement factory account file. It listens without
requiring an active WLAN connection and remains available when an address
arrives later. Uninstall stops the managed service and removes its hook,
payload, password overlay and firewall access. Removing SSH through its own
connection can interrupt that connection.

The installer puts `diffpatch-ssh-log-marker.txt` at the startup USB root.
Runtime logs go to `reports/ssh-*/` on a matching attached USB; without one the
service writes no runtime logs. Installer reports always remain on the startup
USB. On failed startup the newly applied boot hook is reversed and the service
is disabled; verified inactive payload files can remain for retry or uninstall.

## Verification

The five underlying functions were previously installed and removed on the
vehicle; SSH also survived a reboot. The current self-contained diff/patch wrapper has been
validated offline, and has **not yet been run on the vehicle**.

The local native compatibility test executed the original CMU ARM BusyBox
1.19.2 under QEMU against the full read-out files: all 48 install/uninstall
cases for the three list tweaks across their eight combinations, plus both
main-menu operations, reproduced the expected file checksums. SSH installer
orchestration also passed with a stand-in service. The VM used redirected test
paths and did not access a vehicle. Private read-outs and original ARM binaries
are not included here.

Public regression tests use independent small fixtures and mocked system
commands. They exercise the actual installer scripts, including failures, and
the actual SSH supervisor with stand-in network, firewall, mount and daemon
commands. They do not emulate Opera or prove a real network connection:

```sh
python3 tests/tweaks/test_installers.py
python3 tests/tweaks/test_ssh_service.py
python3 tests/tweaks/test_metadata.py
```

On Windows these tests use Git for Windows Bash; on Linux they use `/bin/sh`.
No build is required. After editing a worker, refresh its checksum from inside
that tweak folder and run the tests above:

```sh
md5sum run.sh > run.sh.md5
```

See [PR-MIGRATION.md](PR-MIGRATION.md) for the review follow-up and the options
for retaining the existing PRs or switching them to the diff/patch approach.
