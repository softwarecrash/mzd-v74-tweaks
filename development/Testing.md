# Testing and styling preview

Run commands from the repository root. See [Contributing](CONTRIBUTING.md) for
required coverage. Checks use synthetic fixtures unless explicitly stated.

```sh
python tools/validate.py
python tests/contract/test_manifest.py
python tests/contract/test_workers.py
python tests/contract/test_packages.py
python tests/contract/test_report_messages.py
node tests/installer/test-ui.cjs
node tests/installer/test-transport.cjs
```

The [validation workflow](../.github/workflows/validate-tweaks.yml) lists the full
set, including BusyBox workers, patch combinations, SSH supervision, exports,
Restore, restart, metrics, logging, Lua syntax and disclaimer behavior. Run checks
appropriate to the change; a green check does not replace review or vehicle tests.

## BusyBox worker fixtures

The container job mounts a full static BusyBox at `/usr/local/bin/busybox`.
Alpine's default build does not include every required applet, including `patch`.
When `CMU_TEST_BUSYBOX=1` is set, every dedicated worker fixture must expose the
mounted binary through applet symlinks in its private command directory. Keep
mock mount, watchdog and service commands separate; never replace those guards.
The cluster-language fixture follows the same setup as the shared patch workers.
A modern BusyBox CI pass supplements the original CMU tool checks; it does not
prove compatibility with every option on the vehicle's older BusyBox.

## Offline styling preview on Windows

Open `tools/preview.cmd` to rebuild and open a disposable local HTML preview.
It embeds current UI files and simulated tweak states. Actions are simulated;
it never executes a vehicle worker or restarts the computer. Rebuild after editing
CSS or JavaScript. Python, Node.js and a web server are not needed for this preview.
The PowerShell entrypoint also supports `tools/preview.ps1 -NoOpen`.
Use `tools/preview.ps1 -Settings` to open the real generic settings controls
with the non-destructive Settings Example manifest. The desktop bridge simulates
execution; use the runnable example on the CMU to test the actual shell handoff.
Use `tools/preview.ps1 -Restore` for an eligible Restore, or `-RestoreDenied`
for a simulated MD5 refusal. These shortcuts execute no real worker or restore.

Settings checks: `python tests/contract/test_settings.py` exercises schema
agreement, literal arguments, defaults/limits, background configuration lifetime,
saved snapshots and matching uninstall. The UI suite includes the real controls,
read-only installed values, draft cancellation and multicontroller access.
Use `python tests/transport/test-in-vm.py --settings` for focused native checks,
or `--packages` for a saved-settings install/uninstall roundtrip.
`python tests/transport/test-in-vm.py --transport` additionally runs the shared
settings reader with the original ARM CMU BusyBox shell/awk and existing Lua
transport. Keep emulation and physical-vehicle evidence separate.

## Evidence

Keep isolated, emulated and physical CMU results distinct. Use the
[vehicle test guide](Vehicle-testing.md) and store sanitized records in
[test-runs/](test-runs/README.md). Raw logs, firmware and keys do not belong in Git.

## Shared shim checks

`python tests/contract/test_shims.py` uses synthetic loader files and header-only
library fixtures. It exercises two shims sharing a service, selective removal,
saved assets, failed-second-write rollback, ownership, reset hooks and metadata
catalogs. It never loads or executes a fixture `.so`.

`python tests/transport/test-in-vm.py --shims` additionally checks the literal
manifest, ELF header guard and preload transformations with the original ARM
BusyBox shell/awk/dd/od. Neither test proves that a functional shim can load,
intercept symbols or boot on a physical CMU. The source-only inert example has
its own developer build step; runtime packages ship a prepared `.so` asset.

## Mixed component bundles

Run `python tests/contract/test_components.py` for matching developer/runtime
component grammar and configuration mappings, and
`python tests/contract/test_bundles.py` for the real controller with synthetic
payloads/targets. The latter includes distinct services, generated configuration,
a JS patch, later-write rollback, critical rollback payload retention, saved
uninstall and reset ownership checks. Header fixtures are never loaded.
The UI suite covers detail-only compatibility queries, blocks, warnings, info
messages and stale replies. The focused `--shims` emulation test additionally exercises the
component/config-map parsers and vehicle helper with original CMU shell/awk.

## Opera startup compatibility

Run `node tests/installer/test-es5.cjs` before the UI suite. It checks the runtime
scripts/inline bootstrap as ES5 and rejects function declarations in statement
blocks. Modern Node/Acorn accept some block-function extensions which the CMU
Opera strict parser can reject before the first readiness event. Node 22's
bundled Acorn parser supplies grammar parsing; no runtime npm dependency ships.
`node tests/installer/test-startup-errors.cjs` checks independent early parse/error
reporting through the transport iframe. Those diagnostics use event ui-error,
never ready, and are retained in normal USB ui.log on launcher cleanup.
