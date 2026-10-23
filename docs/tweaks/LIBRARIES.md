# Shared runtime libraries (API 1)

Workers are callable directly from a shell without the launcher. They require
`lib/` from the same package. Copying only a tweak folder is insufficient:

```text
USB/
  lib/common.sh
  lib/common.sh.md5
  lib/patch.sh
  lib/patch.sh.md5
  tweaks/<id>/run.sh
  tweaks/<id>/run.sh.md5
  tweaks/<id>/manifest.json
  tweaks/<id>/manifest.json.md5
  tweaks/<id>/assets/...
```

Copy `lib/` and the desired `tweaks/<id>/` folder onto the USB drive, preserving
that relative layout. No separate package generation is needed. Invoke it from
an existing root shell, using the actual USB mount:

```sh
sh /tmp/mnt/sdb1/tweaks/list-loop/run.sh install
```

The current directory and the leaf folder name do not matter; keep the two-level `tweaks/<id>/` layout relative to `lib/`.

## Loading and lifecycle

The small worker bootstrap validates arguments before loading anything. It
resolves its actual path with `readlink -f`, finds `../../lib`, verifies both
library files against their MD5 sidecars, then sources them. Missing, corrupt
or incompatible libraries cause an error on stderr before reports, mounts or
system changes. Checksums detect accidental damage, not malicious packages.

Both `mzd_common_api` and `mzd_patch_api` must return the integer API required
by the rendered worker and manifest (`library_api: 1`). No legacy fallback is
provided. Change the API when changing the calling contract incompatibly.

Sourcing either library only defines functions. It performs no mounts, logging,
traps, UI or system writes. The worker calls `mzd_patch_run` explicitly. That
starts `mzd_begin`, which opens the USB report and installs cleanup traps, then
validates the package/firmware and probes the patch under a target-file lock.
`status` prints only the state and stops. Modifying actions prepare the change,
run the preparation hook, write/verify the change, then run the completion hook.
Cleanup restores mount/watchdog state and releases the lock on exit.

## Responsibilities and shared context

| Component | Responsibility |
| --- | --- |
| `common.sh` | Startup-medium discovery, reports, checksums, firmware checks, root/watchdog state and cleanup. |
| `patch.sh` | Target lock, USB copies, forward/reverse probes, state detection, OEM backup, verified write/rollback and orchestration. |
| Worker | Argument/bootstrap checks, manifest-derived target configuration and tweak-specific hooks. SSH retains its payload/service logic. |
| Launcher | Discovery, selection, confirmation, display adapters, sequential calls and any reboot question. |

The worker supplies `ACTION`, `SELF`, `HERE`, `ID`, `APP`, `ORIGINAL`, `LOCK`
and `PATCH_FILE`. Its two hooks are `mzd_tweak_prepare` and `mzd_tweak_complete`;
UI workers use no-op hooks. SSH uses them to provision and activate/remove its
owned service. Hooks report fatal errors through `mzd_fail`.

`mzd_begin` initializes `ROOT_CHANGED`, `RES_CHANGED`, `WATCHDOG_CHANGED` and
`LOCKED`, then establishes `USB`, `REPORT` and output descriptors 3/4. Patch
functions establish `BEFORE`, `STATE`, `NO_CHANGE`, `BACKUP` and prepared-file
state before the hooks use them. Descriptor 3 is caller stdout; 4 is caller
stderr. Detailed output goes to the USB log. Detached services must close both
caller descriptors so shell/launcher pipes can finish.

Shared functions use the `mzd_` prefix. Shell variables are shared within the
worker process; underscore-prefixed scratch names are a convention, not lexical
scope. Review nested calls for variable collisions. Neither library parses or
evaluates JSON on the CMU. Workers never prompt, open MMUI or reboot.

The renderer refreshes worker/manifest/library checksums and `--check` rejects
stale outputs. The existing package builder includes both libraries. CI exercises
missing/corrupt/API-mismatched libraries, import without side effects, and the
lifecycle of a separately copied tweak folder with its shared `lib/`.
The shell interface and USB reporting contract are in [MANIFEST.md](MANIFEST.md).
