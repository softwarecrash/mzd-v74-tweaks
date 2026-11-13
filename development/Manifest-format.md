# Manifest format

Each tweak has one `manifest.conf`. It supplies both launcher metadata and worker
settings. The shell uses `usb/lib/manifest.sh`; `installer.sh manifest ID` validates
and forwards the same text to the UI. No settings are copied into run.sh, generated
from another file or interpreted as shell code.

```ini
contract_version=1
id=example-patch
name=Example Tweak
description=A description of what this tweak does.
version=1.0.0
type=patch
group=interface
firmware=74.00.324
entrypoint=run.sh
actions=install uninstall status
target=/jci/path/to/target/file.js
oem_backup_md5=0123456789abcdef0123456789abcdef
lock_group=TargetLockGroup
status_scope=target-patch
reboot_required=true
requires=
conflicts=
```

## Rules

- One field per line, split at the **first** `=`. Keys are lowercase as shown.
- Values are literal text. Use no wrapping quotes or shell escapes. Extra `=`,
  `#`, `$()`, backticks and quotes inside text values remain text, never commands.
- Empty lines, space-only lines and lines starting with `#` are ignored.
  No inline comments, multiline values, tabs or other control characters.
- LF and CRLF line endings and a missing final newline are supported.
- Unknown, duplicate or missing required fields fail with a clear error.
- Version and the currently supported single firmware use three numeric components.
- `actions` is `install uninstall status`, or `run status` for a command.
- `requires` and `conflicts` are space-separated IDs; an empty value means none.
- `reboot_required` is exactly `true` or `false`.
- Patch/service workers additionally require `target`, `oem_backup_md5` and
  `lock_group`. A shared lock is derived from the lock group.
- `oem_backup_md5` identifies the unmodified OEM backup. It is **not** a checksum
  requirement for a currently patched target. Other tweaks can edit that target.

Project scripts, manifests, libraries, assets and binaries have no `.md5`
sidecars. The patch engine still fingerprints vehicle backups and verifies writes
and rollback. Those checks protect vehicle state and are independent of sidecars.

Invalid manifest data is an inspection failure: exit 1, empty stdout, reason on
stderr. An unsupported firmware or incompatible target remains a successfully
determined `unavailable` state, as specified in the worker contract.

## Optional command progress

`progress=true` enables asynchronous Run execution for command workers. It defaults to false and must be a literal boolean. A command may use `target` for its source directory; OEM backup hashes and patch locks are not required for commands.

The launcher calls `installer.sh start-run <id>`, polls `job-status <token>`, and reads `job-output <token> stdout|stderr` after completion. Jobs and progress files live in the temporary installer session, not on USB. The Lua bridge executes these short requests serially.

## Reset and confirmation metadata

- `confirmation`: optional literal warning shown in a second confirmation dialog
  before a command runs. No shell evaluation. Cancelling executes no worker.
- `refresh_all`: optional boolean, default false; recheck all tweak statuses after
  acknowledging an operation result. Restore declares true because it affects
  multiple files/tweaks, even when a later cleanup phase fails.
- `reset_entrypoint`: optional fixed value `reset.sh`. Required by repository
  validation for service/files workers owning persistent extras. The reset hook
  must be a regular local file, not a link.
- `preflight`: optional boolean, default false; enables read-only preflight and
  compatibility queries for non-bundle tweaks through `installer.sh preflight-info ID`.
  The worker's `preflight` action returns `block`, `warning` and/or `info` records
  rendered in the detail view before installation.

## Optional tweak settings

Settings are defined in this same manifest. The launcher renders them in the
Install/Run detail dialog; no tweak-specific GUI code is needed. See the
[runnable settings example](examples/settings/README.md). Its log-storage
numbers illustrate the UI and are not approved logrotate limits.

```ini
settings=log_limit_mb compress profile
setting.log_limit_mb.type=number
setting.log_limit_mb.label=Log storage limit
setting.log_limit_mb.unit=MB
setting.log_limit_mb.default=20
setting.log_limit_mb.min=5
setting.log_limit_mb.max=100
setting.log_limit_mb.step=5
setting.compress.type=boolean
setting.compress.label=Compress old logs
setting.compress.default=true
setting.profile.type=choice
setting.profile.label=Profile
setting.profile.default=stock
setting.profile.options=stock medium large
```

- Up to 16 unique setting names: lowercase letter, then lowercase letters,
  digits or underscores; at most 32 characters. Order follows `settings=`.
- Each needs `type`, `label` and `default`. Optional `help` explains the field.
  Individual declaration values are limited to 256 UTF-8 bytes, except
  `options` and `labels`, which allow 4096 UTF-8 bytes.
- `number`: canonical nonnegative integer, `min`, `max`, positive `step`, optional
  `unit`. Values must be in range and `(value-min)` divisible by step. Numeric
  fields are limited to 2147483647; leading zeros and floating-point values are
  refused. Defaults must satisfy the same rules.
- `boolean`: exactly `true` or `false`; no numeric fields or options.
- `choice`: `options` is a single-space-separated list of at most 64 unique
  tokens, each 1-32 lowercase letters/digits/underscore/hyphen, starting with a
  letter or digit. The default must be an option. No numeric fields. Optional
  `labels` gives the GUI text of each option: a `|`-separated list in the same
  order, for example `labels=Off|English (UK)`. Without it the GUI capitalizes
  the token. The stored value is always the token.
- Undeclared/duplicate keys, unknown declaration fields, invalid defaults,
  control characters and multiline supplied values fail validation.
- There is no free-form text/path setting in this initial contract. Definitions
  and values are always literal data, never sourced or evaluated.

The controller accepts separate `key=value` arguments for Install/Run. Missing
values use defaults. Defaults are loaded first from USB `user/<id>/settings.conf`
when present, falling back to manifest defaults. Values are checked again in the
shell before staging or starting a worker; the UI is not a security or correctness
boundary.

```sh
sh installer.sh action example install log_limit_mb=30 compress=false profile=medium
sh installer.sh action settings-example run log_limit_mb=30
sh installer.sh start-run settings-example log_limit_mb=30
```

`settings-info ID` returns the effective schema, `settings_saved=true|false`,
and `value.NAME=VALUE` lines. Installed packages use their saved schema and
values, even if the USB contains a newer manifest. The menu scan never calls
this detail-only interface. Existing manifests without settings are unchanged.

## Optional shared shim installation

A `files` tweak can use `mzd_shim_main` with `reset_entrypoint=reset.sh` and
`reboot_required=true`. The primary `target`/`oem_backup_md5` describe its first
sm.conf loader file. The additional fields are literal data:

```ini
shim_service=jciMMUI
shim_asset=assets/example.so
shim_path=/tmp/mnt/data_persist/mzd-tweaks/shims/example/example.so
shim_extra_targets=/jci/sm/sm_WCP.conf:030e918f5d6edcd62d196ee37b86fe99
shim_checks=
```

Use the actual tweak ID in the destination directory. The destination is one
regular `.so` directly inside that ID's persistent shim directory; relative,
nested, symlink and control-bearing paths are refused. Service names contain
only letters, digits, underscore, dot or hyphen. Assets live below assets/.

`shim_extra_targets` is a space-separated list of additional absolute loader
paths and known OEM MD5 values, separated by a colon. At most eight distinct
loader targets are supported including the primary. `shim_checks` uses the
same path:MD5 syntax for native module compatibility checks before a fresh
installation. It does not modify those native module files.

The shared helper supports the stock single-line service/environ_var layout,
one LD_PRELOAD variable per service, and space/colon-separated preload paths.
It preserves other tokens and refuses ambiguous/unsupported layouts. ELF header
checks require ARM ELF32 little-endian ET_DYN/EABI5 without the hard-float flag;
this is not proof that arbitrary library code is compatible with a CMU module.
The helper never loads a library to test it. Real shim authors remain responsible
for matching toolchain, dependency/symbol compatibility and vehicle validation.
See [the shim example](examples/shim/README.md).

## Optional component bundles

`components=components.tsv` declares a mixed files/configuration/shims/patches
transaction. It requires `type=files`, `reset_entrypoint=reset.sh`,
`reboot_required=true` and `lock_group=sm-config`. It cannot be combined with
single-shim manifest fields. Optional `payload_dir=/tmp/mnt/data_persist/custom-dir`
allows configuring a custom persistent folder for payload files (`shim`, `file`,
`config`), defaulting to `/tmp/mnt/data_persist/mzd-tweaks/shims/<id>`. Component/config-map
grammar and lifecycle are documented in the [bundle example](examples/bundle/README.md).

## Attribution

Optional `contributors=Original author; port by Another developer` supplies literal
free text shown in the tweak detail view. It is not shell code or HTML and does
not affect installation or status checks. Omit it or leave it empty to hide the
section. Duplicate fields and control characters remain invalid.

## Shared GUI extensions

`type=gui-extension` uses automatically managed GUI support and a saved consumer
snapshot. Non-`gui-extension` tweaks (such as bundle packages with `type=files`)
can also provide an in-car Applications menu GUI by declaring `gui_api`. See
[Shared GUI extensions](Gui-extensions.md) for the GUI metadata, first/last-consumer
lifecycle, ownership rules and development limits.

Whenever `gui_api` is declared (or when `type=gui-extension`), the manifest must
satisfy the GUI extension contract: `gui_api` (the lowest GUI API level the tweak needs, a
positive integer; see [GUI API level](Gui-extensions.md#gui-api-level)), `reset_entrypoint=reset.sh`,
`reboot_required=true`, `status_scope=payload`, a literal `gui_label` (1–80 characters),
and a valid `gui_entrypoint` path under `assets/` ending in `.html`. Standalone
`type=gui-extension` tweaks strictly prohibit patch and component metadata (`target`,
`oem_backup_md5`, `lock_group`, `components`, `shim_asset`). In contrast, hybrid bundle
workers declaring `gui_api` permit those metadata fields to manage their native
components and patches alongside their GUI view.

### Choice control behavior

Two choice values use a direct cycling button. Three or more open a visible
selection list with five rows and scrolling. The current value is marked and
focused on opening. Rotary input and arrow keys move focus; Select commits the
choice to the current draft. Back, Escape or Cancel closes the list without
changing the value and restores focus to the setting button. Selecting a choice
does not run a worker; the normal Install/Run action applies the draft later.
Installed settings remain read-only. Boolean controls are unchanged. Choice
labels continue to use the existing token display; tweaks own their terminology.

Optional GUI `gui_resident` and `gui_service` paths declare shared resident/service capabilities; service requires resident. See [Shared GUI extensions](Gui-extensions.md#optional-resident-and-service-capabilities-provider-020-development) for authoring and old-provider refusal.

Optional GUI field: `gui_translations=assets/i18n.js` declares a scoped JavaScript
translation dictionary for `gui-extension` consumers. Omit it for unchanged
behavior. When present the path must be nonempty, under assets, end in `.js`
and contain no dot/traversal segments. It does not require a resident or service.
See [Shared GUI extensions](Gui-extensions.md#optional-translations).

## Mutable configuration and user data

Declare each path directly; no name list or type field is needed:

```ini
config.preferences.path=/tmp/mnt/data_persist/mzd-tweaks/data/my-tweak/preferences.conf
config.preferences.source=assets/defaults/preferences.conf
config.state.path=/tmp/mnt/data_persist/mzd-tweaks/data/my-tweak/state/
config.state.source=assets/defaults/state/
```

A trailing slash on `path` means a directory; otherwise it means a file. The
source is optional, relative to the tweak, and must be under assets/. Its actual
filesystem kind must match the destination: a file template for a file path,
a directory template for a directory path. An empty
file is a valid template. Installation copies only missing files; existing
contents are never overwritten. Without a source, the app creates its own files
when needed. Declare up to 32 names, each at most 32 characters, starting with
a lowercase letter and followed by lowercase letters, digits or underscores.

Mutable targets must be inside persistent storage, outside installer metadata,
and exclusive to one tweak. Overlapping declarations and links are refused.
Do not also register these targets as immutable component files. Declare a
folder only when every file in that folder belongs to the app's mutable data.
Directory declarations must be the tweak's own `mzd-tweaks/data/<id>/` or
`mzd-tweaks/gui-data/<id>/` directory, or a subdirectory of either, directly
under persistent storage. Shared directories such as its root or `log/` cannot
be declared for recursive removal. Full uninstall removes every file inside a
declared directory, including files created at runtime.

Contents and missing config files do not determine installed status. Apps own
parsing, defaults, format changes and safe writes. GUI services can access the
declared paths through `context.config.<name>`. The original spelling's trailing
slash is removed in that mapping. Other apps/workers can use their paths directly.
Hybrid bundle tweaks can declare mutable configurations (such as `config.libpatch.path`
and `config.libpatch.source` in Android Auto Mod) alongside their component table,
allowing on-screen GUI settings views to inspect and alter runtime parameters via
a companion Lua service without violating component checksums or requiring full
reinstallation.

Update preserves config automatically. Uninstall asks Keep/Remove only for
config-owning tweaks. CLI removal uses `uninstall` (remove data) or
`uninstall --preserve-config` (keep data). See [the config example](examples/config-data/README.md)
and Tetris for complete lifecycle and runtime I/O examples.

### Conditional user asset imports

A choice setting can optionally declare one bundled asset, its USB source filename,
and the value that enables importing it:

```ini
setting.ssh_key.asset=public.key
setting.ssh_key.asset_source=public.key
setting.ssh_key.asset_when=install
```

Both filenames are direct `.conf` or `.key` basenames. The target must be a
bundled file in `assets/`; the source is read from `user/<id>/`. Other setting
values keep the bundled asset unchanged and do not copy the supplied file into
the saved package. The worker validates an enabled import during preflight.
Ordinary `.conf` overrides retain their existing behavior. Declared conditional
targets are never overridden through the ordinary same-name import path.
