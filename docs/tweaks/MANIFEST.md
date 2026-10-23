# Manifest and launcher contract proposal

Issue [#11](https://github.com/piotrmocko/mzd-v74-tweaks/issues/11#issuecomment-6348730655)
suggests a manifest to describe each tweak and its group. No format or complete
launcher protocol has been agreed there yet. This branch proposes
**`manifest.json`**, standard JSON with a versioned project-specific schema.
[`schemas/tweak-manifest.schema.json`](../../schemas/tweak-manifest.schema.json) documents the shape; `render_installers.py` validates the
fields with Python's standard library and also enforces safe paths and IDs.

## Fields

| Field | Meaning |
| --- | --- |
| `schema_version` | Contract version, currently `6` (runtime library metadata is optional). |
| `library_api` | Optional shared runtime API, currently integer `2`; required only when `libraries` is declared. |
| `libraries` | Optional runtime dependencies. Omitted by all five self-contained reference tweaks. |
| `id` | Stable tweak ID; matches the repository folder name. |
| `name`, `description` | English menu label and short function description. |
| `version` | Installer-package version, currently `0.7.0`; not a vehicle-test claim. |
| `type` | Implementation kind: `patch`, `service`, `command` or `files`. SSH is a service with a boot-hook patch. |
| `group` | Lowercase kebab-case menu category; currently `interface` or `system`. |
| `firmware` | Explicitly supported firmware list, currently only `74.00.324`. |
| `entrypoint` | Relative executable script, currently `run.sh`. Invoke it with `sh`. |
| `actions` | `install`, `uninstall`, `status`; no display-specific actions. |
| `target` | Optional single-file patch target; not required for command/multi-file workers. |
| `original_md5` | Optional single-file OEM checksum, not the checksum of every modified combination. |
| `lock_group` | Optional single-file lock name; all three list tweaks use `List2Ctrl`. Multi-file workers own their lock set. |
| `status_scope` | `target-patch`, `configuration`, `payload` or `service-health`; define the exact meaning per tweak. |
| `reboot_required` | Boolean: `true` for UI changes, `false` for immediate SSH activation. The launcher owns any reboot question. |

The manifest is static discovery metadata, not an installed-state database.
It contains no shell commands and must never be sourced or evaluated.
Its `.md5` sidecar protects package integrity, as for the scripts/assets.
Checksums detect accidental corruption; they are not package signatures.

## Proposed discovery and status behaviour

1. Discover folders containing `manifest.json`, then read their metadata.
2. Group/display them using `group`, `name` and `description`.
3. Invoke `sh <folder>/run.sh status` and inspect both stdout and the exit code.
4. Serialize modifying actions, even if several tweaks were selected together.

| Invocation | stdout / result |
| --- | --- |
| `status`, exit `0` | Exactly `installed` or `uninstalled`, followed by a newline. |
| `status`, nonzero exit | Error, unknown or partial state; stdout remains empty, error text goes to stderr. Never display it as uninstalled. Details are logged on USB. |
| No argument, `--help` or `-h` | Usage text, exit `0`; no mounts, reports or system writes. |
| Unknown action or extra arguments | Error on stderr, nonzero exit; no mounts, reports or system writes. |
| `install` / `uninstall` | Complete direct action with textual progress; no GUI, questions or automatic reboot. |

`status` currently needs a writable startup medium because its patch probes and
reports stay on USB. It leaves the system target untouched. For SSH, `installed`
describes the boot hook, **not** current WLAN connectivity or a successful login.
Live service health remains a separate concern. This limitation is explicit so
the future menu does not present patch presence as full service verification.

Version 6 makes `libraries` and `library_api` optional together. The five
reference workers omit both and contain their helpers directly. Command/file
workers can still use their own implementation with no patch-specific metadata.
The contract has no `restore`
alias and includes `reboot_required`. The only
actions are `install`, `uninstall` and `status`. The earlier GUI action remains
removed. A launcher must create any selection/confirmation before calling a
worker, wait for the action to finish, and handle its exit code and messages.
Display adapters and any final reboot question belong to that launcher. There
is no dependency on MMUI or an interactive stdin in the tweak scripts.

## Reproducible installers without a CMU JSON dependency

```sh
python3 build/tweaks/render_installers.py
python3 build/tweaks/render_installers.py --check
```

The first command renders the five reference `run.sh` files from the readable
template and their manifests and refreshes checksum sidecars. Other tweak IDs
keep their own hand-maintained `run.sh`; the tool validates metadata and updates
checksums without replacing their implementation. It does not
regenerate patch contents or service assets. The second command only checks.

Configuration constants, including the OEM hash, are rendered into each script.
The manifest remains the editable source of those constants; CI rejects stale
generated scripts. The CMU only checks the manifest checksum and runs the shell
script, so it needs neither Python nor a JSON parser. A future JS launcher can
read JSON directly; a shell launcher would need an agreed data-only parser.

Each reference runtime folder is self-contained and can be copied anywhere on
USB. No external libraries or fixed directory depth are required. Only future
workers explicitly declaring runtime libraries need the shared helper layout.
Development templates and build tools are never required on USB.

## Source layout and review boundaries

`build/tweaks/templates/worker.sh.in` defines the five reference workers' explicit
orchestration. The renderer embeds the helper source in each generated `run.sh`;
this is development-time reuse, not a runtime dependency. Shared helpers remain
an optional implementation choice for other workers. The renderer does not
replace hand-maintained entrypoints for other tweak IDs.

The five workers call only their embedded helpers. SSH payload preparation and
activation remain in `build/tweaks/templates/ssh-functions.sh.in` and are embedded
only in the SSH worker. Display helpers belong to the launcher. See
[LIBRARIES.md](LIBRARIES.md) for the optional helper experiment.

Firmware metadata declares support, not code equivalence. A worker must enforce
its advertised firmware and retain its own integrity/conflict/rollback guards;
the manifest cannot prevent unrelated implementations from diverging.

The vehicle JavaScript diffs and SSH supervisor payload remain byte-identical
to the preceding branch revision. No firmware file is normalized or regenerated
by this refactor. The worker structure and its output contract require their
own tests and are not automatically covered by the earlier vehicle evidence.
