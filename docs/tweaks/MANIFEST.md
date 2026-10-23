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
| `schema_version` | Contract version, currently `4` (shared runtime dependency contract). |
| `library_api` | Required shared runtime API, currently integer `1`. Both libraries must match. |
| `id` | Stable tweak ID; matches the repository folder name. |
| `name`, `description` | English menu label and short function description. |
| `version` | Installer-package version, currently `0.5.0`; not a vehicle-test claim. |
| `type` | Implementation kind: `patch` or `service`. SSH is a service with a boot-hook patch. |
| `group` | Menu grouping: `interface` or `system` for the five current tweaks. |
| `firmware` | Explicitly supported firmware list, currently only `74.00.324`. |
| `entrypoint` | Relative executable script, currently `run.sh`. Invoke it with `sh`. |
| `actions` | `install`, `uninstall`, `status`; no display-specific actions. |
| `target` | System file modified by this tweak's diff. |
| `original_md5` | Exact OEM checksum, not the checksum of every modified combination. |
| `lock_group` | Shared target-file lock; all three list tweaks use `List2Ctrl`. |
| `status_scope` | `target-patch`: state of this patch in the target file. |
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

Version 4 adds the required `library_api` field. The contract has no `restore`
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

The first command renders all five independent `run.sh` files from the readable
templates and their manifests and refreshes checksum sidecars. It does not
regenerate patch contents or service assets. The second command only checks.

Configuration constants, including the OEM hash, are rendered into each script.
The manifest remains the editable source of those constants; CI rejects stale
generated scripts. The CMU only checks the manifest checksum and runs the shell
script, so it needs neither Python nor a JSON parser. A future JS launcher can
read JSON directly; a shell launcher would need an agreed data-only parser.

Each runtime folder requires the packaged `lib/` at the USB root, beside
`tweaks/`. The existing package builder includes it. To use one tweak, copy `lib/` and
that `tweaks/<id>/` folder while preserving their relative layout.
Workers resolve it relative to their own path, check library checksums and API,
and fail before system changes on missing or incompatible dependencies.
Development templates and build tools are not required on USB.

## Source layout and review boundaries

`build/tweaks/templates/worker.sh.in` defines argument validation, library loading,
manifest-derived configuration and tweak hooks. `lib/common.sh` owns reports,
checksums, firmware validation and cleanup. `lib/patch.sh` owns patch probes,
backups, verified writes and the shared orchestration.
`build/tweaks/templates/ssh-functions.sh.in` isolates SSH payload preparation and
activation. The libraries define functions without starting operations when
sourced; the worker explicitly invokes the workflow. See [LIBRARIES.md](LIBRARIES.md)
for API context and hook responsibilities. Display helpers belong to the launcher.

The vehicle JavaScript diffs and SSH supervisor payload remain byte-identical
to the preceding branch revision. No firmware file is normalized or regenerated
by this refactor. The worker structure and its output contract require their
own tests and are not automatically covered by the earlier vehicle evidence.
