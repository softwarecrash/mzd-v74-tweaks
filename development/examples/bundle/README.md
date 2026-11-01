# Component bundle example

This source-only example groups two inert libraries, two SM loader files and a
generated configuration into one install/uninstall transaction. Build with
`sh development/examples/bundle/build.sh /path/to/m3-toolchain`, then copy the
complete folder into `usb/tweaks/bundle-example/`. No compiled asset is supplied.
Neither library intercepts a CMU function. The HUD setting demonstrates the
configuration pipeline; it does not make this example a functional HUD tweak.

## Manifest settings become native configuration

`manifest.conf` is the only source of setting types, defaults and choices.
`assets/libpatch.map` maps a native key to a setting name using two tab-separated
columns. It contains no values/defaults. The installer normalizes GUI values and
the worker writes `KEY = VALUE` records next to its libraries. The resulting
libpatch.conf belongs to this package; an existing AA Mod config is untouched.
The library must actually support the declared key and sibling-file lookup.

Use a `file` component for fixed files or fixed configuration. Use `config` for
this literal key/value format. Other formats require a separately reviewed
renderer; do not embed shell substitutions or executable templates in metadata.
Existing foreign settings are not imported automatically. A future explicit
import must validate each supported value against the manifest before use.

## Component table

`components=components.tsv` enables the shared bundle worker. Each non-comment
line has five nonempty tab-separated fields. `-` means unused:

| Kind | Target | Source | Service | OEM MD5 |
| --- | --- | --- | --- | --- |
| loader | absolute SM config | - | - | original fingerprint |
| shim | private persistent .so | assets/name.so | service name | - |
| config | private persistent config | assets/name.map | - | - |
| file | private persistent file | assets/name | - | - |
| patch | absolute existing target | assets/change.patch | - | original fingerprint |
| check | absolute native module | - | - | supported fingerprint |

Shims are inserted into their named services in every declared loader file.
Different shims may use different services, or share a service. Existing preload
tokens remain intact. Each patch must modify only relative `target.data` and
have an exact inverse. A bundle may include several patches on distinct files;
combine edits to the same file into one reviewed patch.

Workers with dynamic patch requirements can define `mzd_bundle_patch` before
calling `mzd_bundle_main`: `mzd_bundle_patch source_patch target_patch` transforms
patch hunks using effective settings (such as resolution or display parameters)
before validation and application. The resulting patch must retain the unified diff
header and exact reversibility.

Payload files must be direct children of
`/tmp/mnt/data_persist/mzd-tweaks/shims/<id>/`. This keeps library-relative
configuration working and gives each package an owned container. Paths are
explicit data, not shell expressions. Declare at most 64 records, 16 shims and
8 loader configs. The manifest primary target/fingerprint must appear once.
Use `lock_group=sm-config`, `type=files`, `reboot_required=true` and reset.sh.
Ownership and Restore catalog entries are derived automatically; no duplicate
managed-paths.tsv is needed.

## Hardware and warnings

A worker can define `mzd_bundle_prerequisites()` before calling the main helper.
It prints zero or more `block<TAB>reason` or `warning<TAB>reason` lines and returns
zero for a completed inspection. A query/tool failure returns nonzero. Keep
queries bounded; the backend gives read-only detail queries a 30-second deadline.

`usb/lib/vehicle.sh` provides read-only `mzd_vehicle_hud` and
`mzd_vehicle_control`. HUD facts are `none`, `CHUD_mono`, `CHUD_color`,
`WHUD_color` or `unknown`. Unknown is never silently treated as supported.
Only a tweak decides which facts block its installation; AA Mod may still be
useful without HUD functionality. Never block uninstall on a hardware query.
Region and CMU language need verified readers before a tweak relies on them;
the shared helper deliberately does not guess a DBus control or filesystem path.

For example, inside a real HUD-specific worker:

```sh
. "$ROOT/lib/vehicle.sh" || exit 1
mzd_bundle_prerequisites() {
    hud=$(mzd_vehicle_hud) || return 1
    case "$hud" in
        WHUD_color) : ;;
        unknown) printf 'block\tCannot determine HUD compatibility.\n' ;;
        *) printf 'block\tThis feature requires a windshield HUD.\n' ;;
    esac
}
```

There is no HUD requirement in the inert example itself. A real tweak can emit
a `warning` about region/language without blocking the whole package. Details
queries do not run during the fast menu scan. Install rechecks prerequisites
with the selected package; a stale GUI check is not authorization to mutate.

## Transaction and removal

All assets/config mappings, native checks and hardware are checked before an
old package is removed. Actual target preparation happens again under the
package and SM locks. The worker prepares full before/after snapshots, publishes
and verifies payloads before adding load references, then applies patches.
Uninstall removes load references/patches before deleting payloads. Failure
reverses the journal. If rollback fails, it stops before deleting a still-needed
library or restoring references to missing payloads and reports critical status.
It never loads the .so or restarts a service itself.

Saved code, assets and normalized settings reconstruct the exact configuration
for uninstall and reset. A newer USB config cannot redefine the saved package.
System Restore archives matching payloads, restores OEM targets and only then
deletes verified owned files. Unknown files or changed payloads block cleanup.

The transaction covers one worker install/uninstall. The existing package
controller replaces versions by uninstalling the saved version first; it does
not promise automatic reinstallation of the old version if a later new-version
install fails. Critical outcomes always require inspection before reboot.
