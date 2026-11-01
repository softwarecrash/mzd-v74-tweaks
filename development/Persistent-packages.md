# Persistent installed packages â€” format 1

The installer snapshots every patch/service/files tweak before installation.
Command tweaks such as backup, log export and Restore remain USB operations.
The permanent root is `/tmp/mnt/data_persist/mzd-tweaks/installed/` on the
existing persistent read-write partition, not the `/tmp` RAM filesystem.

The namespace is now `mzd-tweaks`. For installations made under the former
`mzd-v74-tweaks` name, uninstall with the matching previous USB package before
installing with the renamed namespace. Do not simply rename the directory:
saved helpers/manifests and shim loader entries can contain absolute old paths,
while saved code is protected by its recorded inventory. Editing those snapshots
invalidates their integrity checks. No automatic migration or compatibility
alias is provided. Keep the old USB package available until removal is complete.

```text
installed/<id>/
    state.conf
    package.files
    paths.tsv
    package/
        settings.conf      # Effective settings, only when declared
        tweaks/<id>/       # Manifest, worker, assets and reset hook
        lib/               # This version's complete shared runtime snapshot
```

`id` is the stable technical manifest/folder ID, not the display name. The layout
inside package/ preserves worker-relative paths. Shared helpers are deliberately
copied per installed package: an old uninstaller never sources new USB helpers.
Helper fixes do not silently alter existing snapshots; update their packages to
adopt them. Package format, state meanings, lock paths and reset session ledger
are a stable interface. Future incompatible changes need a new supported format.

## Operations

Use `sh installer.sh action <id> install|uninstall|status`. Public patch-worker
entrypoints forward to this same controller. `MZD_WORKER_DIRECT=1` is internal
for a controller-selected saved worker or read-only deep probe; ordinary callers
must not set it. No worker opens dialogs or reboots.

Install validates firmware, dependencies, writable persistent storage and free
space. It leaves at least the greater of 64 MiB or 10% partition capacity free,
including a staging margin. It copies and compares the package before changing
targets, inventories the saved files, publishes it and records `installing`.
Only successful worker execution and a deep installed-state check produce
`installed`. A different version is staged before the saved old uninstaller runs;
failed old removal prevents execution of the replacement. The menu initially
uses explicit Uninstall then Install; installed/USB versions are shown together
when different. Reusing a version number does not force replacement.

Uninstall verifies the saved package and ownership/dependency records, marks
`uninstalling`, executes the saved worker and verifies its uninstalled state.
Only then is the saved package removed. Failures retain it as `failed`.
`prepared`, `installing`, `uninstalling`, `restoring` and invalid/incomplete
records are not reported as installed. Interrupted published operations retain
their matching code. A hard power loss during pre-publication copying may leave
an unused hidden staging directory; it is never executed or automatically adopted.

Menu status reads the receipt and checks saved-file/registered-path presence.
Without a receipt it returns `uninstalled` without starting the USB worker or
examining the target. Commands are listed as ready; their prerequisites are
checked when Run is selected. `sh installer.sh statuses "id1 id2"` returns the
whole menu in one request, with ID, state and reason separated by literal tabs.
It does not rehash target files or probe every patch. It describes a registered
installation, not current service health or a complete integrity audit. All
mutations perform deep worker checks. `package.files` is an integrity inventory
of the saved code, not project-asset checksum sidecars or proof against a malicious
root user. Reports still go to the originating USB via `MZD_ORIGIN_USB`.

Installed IDs missing from a later USB package remain discoverable and removable.
Unknown saved files, altered code or unverifiable records block execution and
deletion rather than falling back to new USB uninstall code.

## Shared targets and ownership

The manifest target is registered as a patch target by default. An optional
`managed-paths.tsv` declares additional paths with one literal tab-separated
`patch`, `create` or `shim` and absolute path per line. Declaring the manifest
target there overrides its default mode. Use canonical system paths consistently.
Declare created directories too when uninstall removes their containers.

Independent patches can share a file; their workers must reverse only their own
changes. Creating/replacing a path already used by another installed package is
refused. A creator/shim cannot be removed while another package uses that path
or its descendants. Explicit `requires` also blocks provider removal. These
checks depend on declared effects; arbitrary unregistered shell changes cannot
be inferred. New tweak implementations must register all affected paths and
provide their own validated, selective rollback.

Package mutations and Restore share `/tmp/mzd-packages.lock`; workers retain their
existing global target locks. Do not replace or delete somebody else's lock.

## Restore originals

Restore selects reset hooks/manifests from saved packages, even when the USB has
different code. Consumers are stopped before providers using registered
requirements and path ownership; cycles refuse reset. Snapshots are excluded
from `.org` discovery. Receipts become `restoring` before modifications and are
archived on USB and removed only after target/reset-hook and uninstalled-state
verification. Unavailable post-reset prerequisites do not prevent forgetting a
tweak when its target is proven byte-identical to its recorded OEM original.
Corrupt packages and unknown extras remain protected for manual investigation.

## First deployment

There is intentionally no adoption or recovery table for pre-receipt versions.
Uninstall the existing test tweaks (especially SSH) with their matching previous
USB package before switching to this layout. Do not overwrite the USB package
first. For the recorded physical test scope, see [test evidence](test-runs/2026-10-25-persistent-packages.md).

## Effective tweak settings

Before Install the controller validates supplied values against the USB schema.
Initial defaults are loaded from USB `user/<id>/settings.conf` when present, falling
back to manifest declarations. Any tweak asset matching `assets/*.conf` can also be
overridden via USB `user/<id>/<name>.conf`. Configuration override files in `user/<id>/`
are enforced to be regular `.conf` files subject to a 64 KB (65,536 bytes) size limit
(defined by `MZD_CONFIG_SIZE_LIMIT` in `lib/defines.sh`), and the size of `user/<id>/`
is included in the persistent storage free-space calculation (`du -sk`) before installation.

Validation differs between settings and asset overrides:
- `settings.conf` is parsed and validated against the `manifest.conf` schema by `settings.awk`
  (types, bounds, choices, and unknown keys).
- Asset overrides matching `assets/*.conf` (such as `libpatch.conf`) are not parsed or
  schema-validated by the package controller; they are copied into the staged package and
  verified byte-for-byte (`cmp -s`). Content, syntax and directive validation is the
  responsibility of the relevant tweak.
- Asset overrides replace the bundled asset file entirely; they are **not merged** with the
  bundled version.

The normalized effective configuration is copied into `package/settings.conf`
and covered by `package.files`, along with any user asset overrides, the matching
manifest, worker and helpers. Invalid settings or oversized overrides are refused before
persistent staging or target writes.

The saved worker receives `MZD_SETTINGS_FILE` pointing to that saved file for
install/deep status/uninstall. Reset hooks use the same saved configuration and
helper. Missing required values or a changed configuration block execution;
there is no fallback to defaults from a new USB. Packages created before settings
support continue using their own saved runtime and have no new configuration.

The detail dialog shows saved settings read-only. To change settings, uninstall
then install with new values. Repeating Install for the same version succeeds
only with the same effective values; different values are refused. New-version
staging carries the new values while the old uninstaller still uses the old ones.
Menu status retains its fast receipt/presence check.

Command settings live in a private RAM file for synchronous Run, or inside the
RAM job directory for a background Run. They remain until the job finishes;
commands are not registered as persistent installed packages.

## Shim payloads and shared loader files

For a declared `shim_path`, ownership additionally includes its per-tweak
persistent directory and all `shim_extra_targets`. The snapshot contains the
matching original library asset and helpers. Normal uninstall removes only this
library's preload token, preserving other shims in the service's LD_PRELOAD list.
System Restore adds all declared loader/OEM pairs to its catalog and runs the
saved reset hook before forgetting the package. Unknown payload bytes or a
remaining loader reference prevent deletion. A configured shim is not evidence
that the running process has loaded it; restart is required for changes.

The controller checks new shim assets and declared native module fingerprints
before removing an older package. Saved workers receive the internal receipt
state as `MZD_PACKAGE_STATE`. During uninstalling/restoring, the shared shim
status verifies absence without requiring prerequisites for a fresh install.
This avoids stranding a saved removal after a separate native module changes.
Registered shim library bytes are immutable: another package cannot patch that
same payload path. Independently managed loader files remain shareable patches.

## Removing a failed saved installation from the menu

Opening a broken tweak detail view requests `installer.sh uninstall-check ID`.
This is read-only and checks the snapshot inventory, recorded ownership/settings,
state, uninstall action and dependents without executing its worker. It returns
`available<TAB>VERSION<TAB>STATE` only when a saved uninstaller can be offered.
A refused check leaves the button hidden and explains why. It does not run during
menu-wide status collection.

The detail dialog keeps Retry status and adds Uninstall with the saved version.
Choosing Uninstall uses the existing controller action and recorded worker;
mutation guards run again, and unknown payloads or failures remain blocked.
After successful verified removal, acknowledge the result, reopen the tweak and
Install the USB version. There is no automatic reinstall or receipt deletion.

## Shared GUI extensions

`type=gui-extension` saves each consumer independently and manages the common
provider automatically. See [Shared GUI extensions](Gui-extensions.md) for the
first/last-consumer lifecycle, ownership and development limits.
