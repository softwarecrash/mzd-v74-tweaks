# Contributing

All commands and paths below are relative to the repository root.

Target branch: `development`. The `usb/` directory contains the runnable USB package. Copy its contents to the USB root.
Keep changes scoped to a tweak or a separately explained infrastructure change.
Do not introduce a second legacy launcher or generated runtime tree.

1. Read [the worker contract](Worker-contract.md).
2. Copy `development/examples/patch/` or `development/examples/hello/` into `usb/tweaks/<id>/`.
   For a lazy-loaded GUI view, use [the Hello World GUI example](examples/gui-hello-world/)
   and read [Shared GUI extensions](Gui-extensions.md). Menu paths, including nested paths,
   use the same shared lifecycle for all views.
3. Supply an English manifest, README, entrypoint and assets. For mutable app data,
   use [the config example](examples/config-data/README.md) and declare
   `config.<name>.path` directly in the manifest.
4. Declare firmware, dependencies, conflicts, lock group and reboot needs.
   Put these settings only in manifest.conf; the shared reader configures run.sh.
5. Implement and test any hardware or component checks. With the shared runtime,
   define `mzd_check_prerequisites()` and emit a reason on stderr before returning
   failure. The status helper maps unmet prerequisites to unavailable/broken.
6. Register fixture cases for the new tweak in `tests/contract/test_workers.py`.
   Include installed, uninstalled, unavailable, broken, inspection failure,
   dependency/conflict handling and preservation of unrelated edits where applicable.
   Declare additional touched/created paths in managed-paths.tsv for package
   ownership checks. List created containers if uninstall removes them. Use the
   shared package controller; do not bypass it with MZD_WORKER_DIRECT in normal use.
7. Run `python tools/validate.py` and `python tests/contract/test_workers.py`.
   Also run `python tests/contract/test_packages.py` for lifecycle/helper changes.
   Run `python tests/contract/test_recovery.py` for single-file recovery changes.
   Run `node tests/installer/test-ui.cjs` and the transport test for UI changes.
   CI additionally runs ShellCheck, and the worker tests on a CMU-like BusyBox 1.19.2
   (see [Testing](Testing.md#tests-in-ci)).
8. Record real vehicle results under `development/test-runs/` using its template. Include
   firmware, commit, actions, expected/actual results and limits. Never commit
   keys, raw dumps or personal logs.

Runtime shell is POSIX sh and must work with the [CMU BusyBox 1.19.2](CMU-BusyBox.md)
and [CMU BusyBox applet reference](CMU-BusyBox-reference.md).
`grep` has no `-x` and `patch` has no `--dry-run`. 
There are no checksum sidecars for project files. Keep `oem_backup_md5` in the
manifest: it identifies the original vehicle backup, not the current patched file.
Read [the manifest format](Manifest-format.md) before adding settings.

PR checks validate metadata and the contract, exercise sandboxed real entrypoints,
and test UI processing. A green check does not prove arbitrary shell code safe
or replace code review and a vehicle test. New behavior needs relevant tests,
not merely a manifest that advertises it. Configure `Validate tweaks / contract`
and `Validate tweaks / workers` (which needs `Validate tweaks / busybox`) as required
checks in repository branch protection if merges must be blocked.

The installer release version is maintained in `usb/VERSION` as `major.minor.patch`.
It is independent of tweak versions and appears in the footer, launcher logs and
action reports. Update this file when preparing an installer release; no build is needed.
