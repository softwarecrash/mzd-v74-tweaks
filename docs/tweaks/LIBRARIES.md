# Optional shared runtime libraries (API 2)

A tweak is callable from a shell without the launcher. Copy the shared `lib/`
folder and the desired `tweaks/<id>/` folder to USB, preserving this layout:

```text
USB/
  lib/
    common.sh
    common.sh.md5
    system.sh
    system.sh.md5
    patch.sh
    patch.sh.md5
  tweaks/<id>/
    run.sh
    run.sh.md5
    manifest.json
    manifest.json.md5
    assets/                 # Optional; commands may need no payload
```

No individual ZIP or build step is needed. For example:

```sh
sh /tmp/mnt/sdb1/tweaks/list-loop/run.sh install
```

The caller's directory and USB device name do not matter. Keep the relative
`tweaks/<id>/` and `lib/` positions. A worker loads only the libraries it uses:

| Library | Responsibilities | Dependency |
| --- | --- | --- |
| `common.sh` | USB reports, caller output, checksums, tool and firmware checks, optional cleanup callback. | None |
| `system.sh` | Multiple target locks, explicit watchdog changes, arbitrary mount-point remounts and cleanup. | `common.sh`, started report session |
| `patch.sh` | Text patch preparation, state, OEM backup validation, verified application and explicit rollback. | `common.sh`, started report session |

There is no mandatory patch workflow, target file or service assumption in the
common/system layers. `patch.sh` does not remount, acquire locks, start services
or reboot. The worker chooses those operations. Native payloads and command-only
tweaks do not have to use diff/patch.

## Import and bootstrap

Every import defines functions only: no output, mounts, traps or system writes.
The worker validates arguments first, resolves its actual path with `readlink -f`,
then checks the selected library files against their sidecars before sourcing.
It checks each imported module's `mzd_<module>_api` result against `library_api`
in the rendered script (currently `2`). Missing, corrupt or incompatible modules
fail before operations. Checksums detect damage, not malicious packages.

The manifest's `libraries` array records the modules used, for example
`["common"]` or `["common", "system", "patch"]`. It is data for tools/launchers;
it is never sourced or evaluated on the CMU. Each worker implements its own
bootstrap/lifecycle. The existing template is for the five reference tweaks,
not a requirement for future command, native-shim or multi-file workers.

## General functions

```sh
mzd_begin "$SELF" "$ID" [cleanup_function]
mzd_require_tools command ...
mzd_require_assets /absolute/file ...
mzd_validate_firmware 74.00.324
mzd_report_message 'Text for the caller and USB log'
mzd_hash /absolute/file
mzd_check_asset /absolute/file
```

`mzd_begin` starts one report session and installs exit/INT/TERM cleanup traps.
It sets only the shared session variables `MZD_USB`, `MZD_REPORT`, `MZD_CLEANUP`
(and `MZD_EXIT` during exit). It does not require `APP`, `PATCH_FILE`, `HERE`,
`ORIGINAL` or other patch-specific globals. The optional cleanup argument is a
function name, invoked without arguments; it is never evaluated shell text.
A custom worker can combine its own cleanup with `mzd_system_cleanup`.

Detailed output goes to `$MZD_REPORT/run.log`. Descriptor 3 is caller stdout;
4 is caller stderr. A successful status action writes exactly `installed` or
`uninstalled` plus newline to descriptor 3. Errors use `mzd_fail`, which exits
nonzero and prints the error/report path on stderr. Helpers may run in subshells;
workers must check failures (`helper ... || exit 1`). Detached services close
both caller descriptors. Workers never prompt, open MMUI or reboot.

## Optional system operations

```sh
mzd_begin "$SELF" "$ID" mzd_system_cleanup
mzd_system_begin
mzd_system_lock /tmp/mzd-SharedTarget-tweak.lock || exit 1
mzd_system_watchdog_disable || exit 1
mzd_system_remount_rw / || exit 1
mzd_system_remount_rw /tmp/mnt/resources || exit 1
```

Call `mzd_system_begin` once after starting the report session. It sets
`MZD_SYSTEM` and creates cleanup records on USB. Locks are atomic `mkdir` locks;
all workers modifying the same file must choose the same lock, acquire multiple
locks in a consistent order, and keep them until exit. A failed second lock
releases only locks owned by this invocation. The launcher also serializes
modifying actions.

Watchdog disabling and remounting are separate explicit operations. Cleanup
restores only recorded changes, including multiple read-only mounts, and
releases owned locks. Already-writable mounts and an already-disabled watchdog
are preserved. Paths must be absolute and contain no newline.

## Optional text patches

```sh
ctx="$MZD_REPORT/main-menu"
mzd_patch_prepare "$target" "$patch" "$known_oem_md5" "$ctx" || exit 1
state=$(mzd_patch_state "$ctx") || exit 1
mzd_patch_validate_backup "$ctx" || exit 1
# Worker makes the required mount writable, only for a modifying action.
mzd_patch_apply "$ctx" install || exit 1
# If a later worker-specific step fails:
mzd_patch_rollback "$ctx" || exit 1
```

Each context is a new directory under the report on the startup USB. It keeps
its own target path, state, previous file/hash, forward/reverse probes and desired
hash. These functions take explicit arguments and isolate temporary variables;
multiple contexts do not overwrite one another or the worker's variables.
Patch payloads use `target.data` as the filename inside the isolated probe folder.

Preparation and state queries never change the target. Native BusyBox has no
dry-run, so preparation requires a changed probe plus an exact inverse round
trip. Unknown/partial/ambiguous states fail. Applying an already-present requested
state is a no-op. The known adjacent OEM `.org` backup is verified and retained.
Application checks that the target and prepared copy have not changed, preserves
permissions, retries a failed write once and restores the complete previous file
on failure. Explicit rollback also refuses intervening target changes.

For multiple targets, the worker acquires all locks and prepares/validates all
contexts before writes. It owns the order and any group rollback if a later
step fails. This API does not promise a transaction across files, service
activation or power loss. The SSH reference worker demonstrates custom payload
provisioning and rollback after activation failure.

## Existing upstream tweaks and scope

- Disclaimer and HUD JS changes can use `patch.sh`; HUD detection stays separate.
- Touchscreen uses a Mazda configuration command and its own state query; no
  patch target or `patch.sh` dependency is required.
- Fuel-consumption JS changes can use separate contexts. Its native shim keeps
  its payload/service-config logic in its worker.
- Android Auto installs native libraries and modifies multiple configuration
  files. Its worker may use common/system helpers and optional patch contexts.
- Backup/log collection are tools with their own actions, not fake installed
  tweaks. They can reuse common reporting without adopting patch metadata.

Those upstream installers have not been ported by this change. The libraries
provide reusable operations; each port still needs appropriate status, backups,
conflict checks, rollback and tests. In particular, fuel-ending and Android Auto
both modify `sm.conf`/`sm_WCP.conf`: coordinated locks and selective removal are
required, rather than restoring whole historical backups over other tweaks.

The five reference workers retain their reviewed patch/service assets. Their
integrated API-2 wrapper requires vehicle validation; offline/native results
are documented separately in [README.md](README.md).
