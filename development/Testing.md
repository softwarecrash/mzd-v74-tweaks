# Testing and styling preview

Run commands from the repository root. See [Contributing](CONTRIBUTING.md) for
required coverage. Checks use synthetic fixtures unless explicitly stated.

## Running checks in containers

On macOS, Windows or any machine whose shell and tools differ from the CI
runner, run the checks in Docker. Only Docker is needed on the host
(Docker Desktop, OrbStack or Colima).

```sh
sh tools/test-in-container.sh                 # every Validate tweaks step
sh tools/test-in-container.sh workers         # worker suite on the CMU-like BusyBox
sh tools/test-in-container.sh run python tests/contract/test_packages.py
sh tools/test-in-container.sh busybox sh -c 'busybox | head -n 1'
```

[tools/container/Dockerfile](../tools/container/Dockerfile) builds the `ubuntu`
image for the runner steps. `workers` and `busybox` use the same scripts as the
CI jobs of the same names (see [Worker tests on the CMU-like BusyBox](#worker-tests-on-the-cmu-like-busybox)):
the first run builds and checks the BusyBox in `.cache/cmu-busybox`, later runs
reuse it until its build or check files change.
[run-ci-steps.py](../tools/container/run-ci-steps.py) reads the steps from the
workflow, so new CI steps run locally without editing these tools. Containers
have no network and mount the repository read-only. AI agents are directed here
by [AGENTS.md](../AGENTS.md) and the `run-checks` skill (`.github/skills/` for
Copilot, `.agent/skills/` for Antigravity; keep the two copies identical).

These checks need no private files. `tests/transport/test-in-vm.py` stays a
separate, manual check for those who have their own CMU files (see
[Original runtime](testing/Original-runtime.md)); it is not part of CI.

```sh
python tools/validate.py
python tests/contract/test_manifest.py
python tests/contract/test_workers.py
python tests/contract/test_packages.py
python tests/contract/test_report_messages.py
node tests/installer/test-ui.cjs
node tests/installer/test-transport.cjs
node tests/tweaks/android-auto/test-view.cjs
```

The tests in `tests/installer/` use the built-in Node test runner (`node:test`): each
reports its named tests and steps, and a failing step does not hide the others. CI runs
every file of the folder in one step with `node --test "tests/installer/*.cjs"`, so a new
test file there needs no workflow change; one file also runs with plain `node`. Give a
pattern, not the folder (`node --test tests/installer/` fails with "Cannot find module"):

```sh
node --test "tests/installer/*.cjs"                                # run all of them
node --test --experimental-test-coverage "tests/installer/*.cjs"   # and show the coverage
```

The coverage table at the end lists, per file, the lines, branches and functions the
tests ran, and the numbers of the lines they never ran. It lists the test files too;
add `--test-coverage-exclude='tests/**'` to see only the project's browser code. In a
container: `sh tools/test-in-container.sh run node --test --experimental-test-coverage "tests/installer/*.cjs"`.

The [validation workflow](../.github/workflows/validate-tweaks.yml) lists the full
set, including BusyBox workers, patch combinations, SSH supervision, exports,
Restore, restart, metrics, logging, Lua syntax and disclaimer behavior. Run checks
appropriate to the change; a green check does not replace review or vehicle tests.

## Tests in CI

The [validation workflow](../.github/workflows/validate-tweaks.yml) runs four jobs:

| Job | Runner | What it checks |
| --- | --- | --- |
| `contract` | Ubuntu | manifests, `shellcheck`, Lua syntax and the contract tests, on the runner's own tools (dash, GNU) |
| `busybox` | ARM | builds the CMU-like BusyBox 1.19.2 and checks it against the CMU's BusyBox; only when its files change, otherwise it comes from the cache |
| `workers` | ARM | `tests/contract/test_workers.py` in an image that holds only that BusyBox, as user 0 (`cmu`) with the CMU's 128 kB stack |
| `launcher` | Ubuntu | the launcher UI tests (Node) |

If `workers` fails on a command that works on your PC, the CMU most likely lacks it or answers differently; see
[CMU BusyBox](CMU-BusyBox.md). The BusyBox, its checks and the image are described in
[tools/busybox/README.md](../tools/busybox/README.md).

## Worker tests on the CMU-like BusyBox

`python tests/contract/test_workers.py` above runs the worker scripts with your PC's shell and tools: quick, but
not what the CMU runs. In CI the same test runs in a Docker image that holds only the CMU-like BusyBox: it is
`/bin/sh` and every command, linked at the paths the CMU has, so a tweak meets the CMU's shell and options. The
image also has the CMU's users (user 0 is called `cmu`) and a Python for the test driver outside the scripts'
`PATH`. To run it the same way:

```sh
sh tools/test-in-container.sh workers
CMU_TEST_ONLY=<tweak-id> sh tools/test-in-container.sh workers    # one tweak
sh tools/test-in-container.sh busybox sh -c 'grep -x a /dev/null; echo $?'
```

These run the same scripts as CI: [prepare.sh](../tools/busybox/prepare.sh) builds and checks the BusyBox (skipped
when `.cache/cmu-busybox` already holds one checked with the current files),
[make-image.sh](../tools/busybox/image/make-image.sh) makes the image and [run.sh](../tools/busybox/image/run.sh)
runs the command in it as on the CMU: user 0, 128 kB stack, read-only repository, no network.

Locally this runs through an emulator. The CMU's BusyBox is a 32-bit ARM program, and neither an x86 PC nor an
Apple Silicon Mac can run 32-bit ARM code directly, so Docker runs it through qemu (`qemu-user-static`, included in
Docker Desktop). The first run builds and checks the BusyBox (some minutes, once); the full worker suite then takes
about ten minutes, against about two on the ARM runner in CI. A test on the PC's own shell and tools is faster but
misses what breaks on the car, for example:

- `printf '%s' ... >/dev/null` as the first output of a process returns 1 on the CMU (the Touch bug, #48);
- `$((65536*65536))` is 0 on the CMU (32-bit arithmetic), and `sed -E` fails there with "invalid option".

If Docker on your machine cannot start ARM programs in containers, see
`QEMU_STATIC` in [tools/busybox/README.md](../tools/busybox/README.md).

Rules for worker fixtures:

- With `CMU_TEST_BUSYBOX=1` every dedicated worker fixture links the BusyBox found on `PATH` into its private command
  directory; the cluster-language fixture follows the same setup as the shared patch workers.
- Keep mock mount, watchdog and service commands separate; never replace those guards.
- A fake command that hands over to the real one must call it at the path the CMU has: `/bin/mv`, `/bin/rm`,
  `/bin/cp`, `/bin/grep`, `/bin/cat` (not `/usr/bin/...`, which exists only on a PC). The image has nothing else.
- Commands the CMU has outside BusyBox (`dbus-send`, `lua`, `zip`, `unzip`, `ip`, the JCI programs) are not in the
  image: a test that needs one fakes it.

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

`node tests/installer/test-es5.cjs` checks every script that CMU Opera runs (every
`.js` file and every non-empty inline `<script>` of an `.html` page in `usb/` and
`development/examples/`, in all subfolders) as ES5 and rejects function declarations
in statement blocks. It checks the grammar only, not whether the browser has a
built-in function such as `Array.prototype.includes`. Modern Node/Acorn accept some
block-function extensions which the CMU Opera strict parser can reject before the
first readiness event. Node 22's bundled Acorn parser supplies grammar parsing; no
runtime npm dependency ships.
`node tests/installer/test-startup-errors.cjs` checks independent early parse/error
reporting through the transport iframe. Those diagnostics use event ui-error,
never ready, and are retained in normal USB ui.log on launcher cleanup.

Installer replug focus checks: `python tests/contract/test_session.py` exercises
the real RAM session helper and event adapter with private fixtures.
`node tests/installer/test-ui.cjs` verifies the browser handshake, no focus
requests while idle, and deferral during modifying actions. A CMU test must also
verify actual display/input restoration on replug and a fresh start after Exit.
The replug case must include a changed USB mount (for example sda1 to sdb1).
The firmware USB invocation must return while the detached installer stays alive.
Original-CMU Lua transport checks cover resolving the current installer path and
serving the cached transport page after its USB source disappears.

Mutable config checks: `python tests/contract/test_config_data.py`,
`python tests/contract/test_packages.py`, and
`python tests/contract/test_bundles.py` cover defaults, preservation, exclusive
ownership, path/link refusal, native bundle coexistence and original-file reset.
The symlink checks need Linux or Windows symlink privileges; the isolated Linux
appliance provides that without modifying the CMU.

Run `python tests/contract/test_gui_extensions.py --tetris-config-only` and
`python tests/contract/test_gui_extensions.py --config-example-only` for actual
consumer lifecycle tests.
`node tests/tweaks/tetris/highscore.cjs` covers the authenticated resident/view
bridge. With the private original CMU runtime available,
`python tests/transport/test-in-vm.py --tetris` tests real Lua/filesystem highscore
I/O under QEMU. A physical CMU visual/gameplay test remains separate evidence.

## GUI extension preview and emulation

For visual and interaction validation of GUI extensions before hardware deployment:
- `sh tools/preview-menu.sh`: Generates a standalone interactive HTML preview of the tweak's menu entry and settings view in a local desktop browser.
- `sh tools/preview-menu.sh --emu [path]`: Stages the tweak into the [mzd-emu](https://github.com/ScorpAL/mzd-emu) browser emulator using genuine `/jci` files from the CMU. See [Gui-extension-testing.md](Gui-extension-testing.md) for setup, `/jci` prerequisites, and emulator options.
