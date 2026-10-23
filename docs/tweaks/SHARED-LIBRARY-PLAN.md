# Plan: shared runtime helpers

Status: implemented on this branch. All five workers use shared API 1.
See [LIBRARIES.md](LIBRARIES.md) for the implemented contract. Integrated vehicle
validation remains pending; upstream PRs are unchanged.

## Target layout

```text
lib/
  common.sh
  common.sh.md5
  patch.sh
  patch.sh.md5
tweaks/<id>/
  run.sh
  run.sh.md5
  manifest.json
  manifest.json.md5
  assets/
```

Independent means callable without the launcher. To use a single tweak, copy `lib/` and `tweaks/<id>/`; copying only the tweak
folder is insufficient. All tweaks use the same maintained helper files.

## Responsibilities

| Location | Responsibilities |
| --- | --- |
| `lib/common.sh` | Checksums, firmware validation, startup-medium discovery, text output/USB reports, mount/watchdog state and cleanup. |
| `lib/patch.sh` | Shared-target locks, forward/reverse probes on USB copies, patch-state detection, verified OEM backup, prepared write and complete previous-file rollback. |
| `tweaks/<id>/run.sh` | Resolve its location, load helpers, provide tweak configuration and run the requested action. SSH additionally orchestrates its own payload and service lifecycle. |
| Launcher | Selection, confirmation, display adapters and any final reboot question. |

Keep the first split small: two libraries, not a framework or one helper file
per function. Keep the reviewed diff files and SSH service assets byte-identical.

## Loading and dependency contract

- Resolve `lib/` relative to the actual script path, not the working directory
  or a fixed USB device name. Use the documented `lib/` + `tweaks/<id>/` layout.
- Keep a small bootstrap in each worker for usage/action validation and checking
  the required library files/checksums before sourcing them. Missing, damaged or
  incompatible libraries fail on stderr before system modifications.
- Imports define functions/constants only: no automatic mounts, traps, logs or
  system changes. The worker explicitly starts the operation and owns cleanup.
- Document the shared context variables and use namespaced helper functions.
  Avoid accidental variable/function overrides between the common and patch layers.
- Define one library API version and record the worker's requirement in the
  manifest and rendered bootstrap. The manifest uses `library_api: 1` and schema version 4. Reject incompatible combinations instead of keeping legacy
  implementations or fallbacks.

## Implementation order

1. Extract common functions into `lib/common.sh`, keeping their current behaviour
   and safety checks. No dialogs or launcher dependencies enter the library.
2. Extract the generic patch workflow into `lib/patch.sh`.
3. Convert **main-menu-loop** first as a small reference worker. Update its
   isolated tests to the packaged directory layout and validate helper loading.
4. Convert list-beep, shorter-delay and list-loop; rerun all eight combinations
   and selective removal checks. Then convert the SSH worker, preserving its
   separate supervisor implementation.
5. Update rendering, manifests/schema, checksum generation and documentation.
   Templates generate only the small worker entrypoints, not copies of helpers.
6. Include the shared libraries in the existing package and verify its contents.
   Individual use requires only copying `lib/` and the desired tweak folder.
7. Update CI and run worker, package, native BusyBox and SSH lifecycle checks.
   Validate the final integrated wrapper on the vehicle before claiming it is
   vehicle-tested. Keep upstream PRs unchanged until the replacement is agreed.

## Acceptance checks

- Install/uninstall/status work from any working directory and without a UI.
- No arguments/--help print usage; invalid actions do not modify the CMU.
- Status stdout/error codes, USB reports, OEM backups, locks and cleanup retain
  their documented behaviour. Workers never prompt or reboot.
- Missing/corrupt/incompatible helpers fail before modifying system files.
- Sourcing either library causes no operations or output by itself.
- The existing ZIP includes the libraries and matching checksums. Tests copy
  only `lib/` and the selected tweak folder, as a shell user would.
- No private CMU binaries/readouts, payload normalization or duplicated runtime
  helper implementations are introduced.
