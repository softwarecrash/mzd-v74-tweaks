# Mutable configuration example

Copy this directory to `usb/tweaks/config-example/`. This is a lifecycle example
using the standard GUI entrypoint. It does not implement a settings editor.
For a working reader/writer, see `usb/tweaks/tetris/assets/service/entry.lua`.

Declare paths directly in `manifest.conf`:

```ini
config.preferences.path=/tmp/mnt/data_persist/mzd-tweaks/data/config-example/preferences.conf
config.preferences.source=assets/defaults/preferences.conf
config.state.path=/tmp/mnt/data_persist/mzd-tweaks/data/config-example/state/
config.state.source=assets/defaults/state/
config.session.path=/tmp/mnt/data_persist/mzd-tweaks/data/config-example/session.conf
```

There is no extra list or type field. A trailing `/` declares a directory;
otherwise the path declares a file. Names are local identifiers. Up to 32
entries may use different persistent locations. Source paths are optional and
relative to the tweak. An empty file is a valid template. Directory templates
are copied file by file, adding only missing files. Nothing merges or rewrites
an existing config. Without a source, the app creates data itself as needed.

The app owns parsing, defaults for empty/missing files, validation of values,
and atomic writes. The installer does not generate config keys or migrate
formats. Shared GUI Lua services receive the declared paths as
`context.config.preferences`, `context.config.state`, and `context.config.session`.
Other workers/apps can use their declared paths directly. Never write into the
saved `installed/<id>/package/` snapshot or deployed module assets.

## Lifecycle

- Install: validate ownership and paths; seed missing template files only.
- Status: config contents and absence are not installation fingerprints.
- Update: saved worker runs `uninstall --preserve-config`, then the new package
  installs. Existing data stays; missing new template files are added.
- Uninstall in the UI: only config-owning tweaks are asked whether to keep data.
- `sh run.sh uninstall`: remove the tweak and its declared data.
- `sh run.sh uninstall --preserve-config`: remove the tweak, keep its data.
- Reinstall after keeping data: reuse the contents without replacing them.

Run through the standard package controller. `config-args.sh`, sourced by the
entrypoint, accepts the preservation flag. The controller performs the data
lifecycle; workers must stop their writers before completing Uninstall.
Do not add worker dialogs or bypass package management.

## Ownership and failures

Only paths inside persistent storage are accepted. Links, special files,
traversal, overlapping declarations, other tweaks' data, and installer metadata
are refused. A declared folder includes all regular files created in it later;
keep that folder exclusive to your app. Mutable paths must not also be declared
as immutable component files. For a bundle, remove its old `file` component and
use the manifest config declaration instead.

Retaining data also retains its ownership record. Updates may add declarations;
removing/moving old declarations requires a full uninstall first. A failed
installation retains initialized data with its failed package for inspection
and explicit cleanup. This implementation targets new installations only.

## Test checklist

1. Install; inspect the seeded file and the empty counter template.
2. Change contents, add a file in `state/`, delete a template file, and create
   `session.conf`. Status must remain installed.
3. Update to a higher version: changed values/runtime files must survive; only
   the missing template is restored.
4. Uninstall with Keep, then reinstall: changes must still be present.
5. Uninstall with Remove: all three declared paths must be absent.
6. Repeat with no source, missing data, an invalid path, and a symlink. Unsafe
   deletion must be refused without following the link.
