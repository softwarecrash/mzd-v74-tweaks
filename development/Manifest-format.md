# Manifest format

Each tweak has one `manifest.conf`. It supplies both launcher metadata and worker
settings. The shell uses `usb/lib/manifest.sh`; `installer.sh manifest ID` validates
and forwards the same text to the UI. No settings are copied into run.sh, generated
from another file or interpreted as shell code.

```ini
contract_version=1
id=list-beep
name=No List Beep
description=Mute the two long multicontroller list beeps.
version=0.8.0
type=patch
group=interface
firmware=74.00.324
entrypoint=run.sh
actions=install uninstall status
target=/jci/gui/common/controls/List2/js/List2Ctrl.js
oem_backup_md5=e111883b9dcbeb6bb154521826fcacac
lock_group=List2Ctrl
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
  `options`, which allows 4096 UTF-8 bytes.
- `number`: canonical nonnegative integer, `min`, `max`, positive `step`, optional
  `unit`. Values must be in range and `(value-min)` divisible by step. Numeric
  fields are limited to 2147483647; leading zeros and floating-point values are
  refused. Defaults must satisfy the same rules.
- `boolean`: exactly `true` or `false`; no numeric fields or options.
- `choice`: `options` is a single-space-separated list of at most 64 unique
  tokens, each 1-32 lowercase letters/digits/underscore/hyphen, starting with a
  letter or digit. The default must be an option. No numeric fields.
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
snapshot. See [Shared GUI extensions](Gui-extensions.md) for the API 1 metadata,
first/last-consumer lifecycle, ownership rules and development limits.

### Choice control behavior

Two choice values use a direct cycling button. Three or more open a visible
selection list with five rows and scrolling. The current value is marked and
focused on opening. Rotary input and arrow keys move focus; Select commits the
choice to the current draft. Back, Escape or Cancel closes the list without
changing the value and restores focus to the setting button. Selecting a choice
does not run a worker; the normal Install/Run action applies the draft later.
Installed settings remain read-only. Boolean controls are unchanged. Choice
labels continue to use the existing token display; tweaks own their terminology.
