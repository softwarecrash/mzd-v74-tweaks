# Manifest and launcher contract proposal

Issue [#11](https://github.com/piotrmocko/mzd-v74-tweaks/issues/11#issuecomment-6348730655)
suggests a manifest to describe each tweak and its group. No format or complete
launcher protocol has been agreed there yet. This branch proposes
**`manifest.json`**, standard JSON with a versioned project-specific schema.
`manifest.schema.json` documents the shape; `build_installers.py` validates the
fields with Python's standard library and also enforces safe paths and IDs.

## Fields

| Field | Meaning |
| --- | --- |
| `schema_version` | Manifest format version, currently `1`. |
| `id` | Stable tweak ID; matches the repository folder name. |
| `name`, `description` | English menu label and short function description. |
| `version` | Installer-package version, currently `0.2.0`; not a vehicle-test claim. |
| `type` | Implementation kind: `patch` or `service`. SSH is a service with a boot-hook patch. |
| `group` | Menu grouping: `interface` or `system` for the five current tweaks. |
| `firmware` | Explicitly supported firmware list, currently only `74.00.324`. |
| `entrypoint` | Relative executable script, currently `run.sh`. Invoke it with `sh`. |
| `actions` | Supported arguments, including explicit `dialog` and `status`. |
| `target` | System file modified by this tweak's diff. |
| `original_md5` | Exact OEM checksum, not the checksum of every modified combination. |
| `lock_group` | Shared target-file lock; all three list tweaks use `List2Ctrl`. |
| `status_scope` | `target-patch`: state of this patch in the target file. |

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
| `status`, nonzero exit | Error, unknown or partial state; never display it as uninstalled. An error message is printed and details are logged on USB. |
| `dialog` or no argument | Native Install / Uninstall / Exit dialog. |
| `install` / `uninstall` | Direct action with textual progress; no GUI or automatic reboot. |
| `restore` | Selective uninstall of this tweak only. |

`status` currently needs a writable startup medium because its patch probes and
reports stay on USB. It leaves the system target untouched. For SSH, `installed`
describes the boot hook, **not** current WLAN connectivity or a successful login.
Live service health remains a separate concern. This limitation is explicit so
the future menu does not present patch presence as full service verification.

## Reproducible installers without a CMU JSON dependency

```sh
python3 diffpatch/build_installers.py
python3 diffpatch/build_installers.py --check
```

The first command renders all five independent `run.sh` files from the readable
templates and their manifests and refreshes checksum sidecars. It does not
regenerate patch contents or service assets. The second command only checks.

Configuration constants, including the OEM hash, are rendered into each script.
The manifest remains the editable source of those constants; CI rejects stale
generated scripts. The CMU only checks the manifest checksum and runs the shell
script, so it needs neither Python nor a JSON parser. A future JS launcher can
read JSON directly; a shell launcher would need an agreed data-only parser.

Runtime folders remain self-contained when copied or renamed. Development
templates and build tools are not required on USB. There is deliberately no
new shared runtime dependency until upstream agrees how to organize helpers.

## Source layout and review boundaries

`templates/run.sh.in` groups interface helpers, USB reports/cleanup, integrity,
firmware checks, patch probes, verified writes and the short main flow.
`templates/ssh-functions.sh.in` isolates SSH payload preparation and activation.
Dialogs go through `info`, `confirm` and `ask`; `info` shows non-blocking progress.
These functions can later move into common helpers without changing the tweaks.

The vehicle JavaScript diffs and SSH supervisor payload remain byte-identical
to the preceding branch revision. No firmware file is normalized or regenerated
by this refactor. The installer structure and GUI progress path require their
own tests and are not automatically covered by the earlier vehicle evidence.
