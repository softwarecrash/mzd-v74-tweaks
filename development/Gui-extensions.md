# Shared GUI extensions (API 1, development)

The shared helper supports lazy-loaded views for any tweak. A view can display
information, provide a tool or present a tweak's settings interface. Games is
one optional grouping, not the owner of the runtime. The initial native adapter
supports Applications; a native Mazda Settings adapter is not implemented yet.
Do not use guessed native context IDs.

## Authoring

Start with [Hello World](examples/gui-hello-world/) or the
[minimal neutral fixture](examples/gui-extension/). Use `type=gui-extension`,
`gui_api=1`, a literal `gui_label` (1-80 characters), and
`gui_entrypoint=assets/view.html`. The menu location is manifest data:

```ini
gui_menu_path=Tools/Examples
gui_label=Hello World
```

This produces Applications > Tools > Examples > Hello World. An empty
`gui_menu_path=` puts the view directly under Applications; `Games` is an
ordinary path, not a special owner or adapter. The helper creates intermediate
menus using the original Mazda List2Ctrl factory and destroy APIs, merges
identical paths and takes Back one level at a time. Direct views have no caret;
only folders have submenu carets. Common Mazda chrome, status bar and Back
control are retained, and the original list is restored when leaving. No new
native MMUI context is registered. Paths are
case-sensitive display labels separated by `/`, with at most eight segments,
80 characters per segment and 240 characters total. Leading/trailing slashes,
empty/dot segments and outer whitespace are rejected. The root Applications
context is implicit; a path named Settings is an ordinary submenu, not the
native Mazda Settings context.
IDs `games` and `exit` are reserved. Include `reset_entrypoint=reset.sh`,
`status_scope=payload`, `reboot_required=true`, and install/uninstall/status actions.
Asset paths use ASCII letters, digits, dots, underscores, hyphens and slashes,
without dot traversal or links; the limit is 512 asset entries.

### Standalone vs. hybrid extension workers

There are two patterns for authoring GUI extensions:

- **Standalone GUI extensions (`type=gui-extension`)**: Used for self-contained
  interactive applications, games or utilities. No fake OEM target, OEM hash, lock
  group, shim or component declaration is allowed. The worker delegates directly to
  `lib/gui-extension.sh`, and `reset.sh` delegates to the same helper.
- **Hybrid extension workers (`type=files` + `gui_api=1`)**: Used when an in-car
  settings or monitoring interface accompanies native shims, loaders, and binary/XML
  patches (such as Android Auto Mod). The worker delegates to `lib/bundle.sh` and
  declares `components=components.tsv`, `target`, `oem_backup_md5`, and `lock_group`
  alongside the GUI extension metadata (`gui_api=1`, `gui_label`, `gui_entrypoint`, etc.).
  `bundle.sh` automatically integrates GUI asset validation, `/tmp/mzd-gui-extension.lock`
  synchronization, GUI mutations, status aggregation, and service cleanup.
  Runtime settings are often coupled to a declared mutable config (`config.<name>.path`)
  and manipulated live via a background Lua service (`gui_service`) and resident script
  (`gui_resident`).

The standalone example delegates both workers to `lib/gui-extension.sh`. The controller
saves the module and matching helper snapshot for removal. Do not directly write
the boot hook, registry or other extensions' folders. Keep unrelated system mutations out of a view. The optional resident/service
capabilities below provide a narrow registered service bridge; plain views still
have no generic filesystem or executable API. Installer settings remain supported.

## Automatic shared lifecycle

The first GUI consumer creates the optional developer hook, shared runtime and
registry under `/data/integration`. The provider receipt and immutable support
snapshot live under `/tmp/mnt/data_persist/mzd-tweaks/gui-provider`, separately
from individual package receipts. No user-installed provider tweak is required.
Subsequent consumers reuse compatible, byte-verified support and update only the
derived registry. Different compatible USB runtime versions do not replace an
existing provider implicitly.

The registry contains data only. Applications entries exist at boot, while a
consumer HTML view and its JavaScript load only when selected. Each intermediate menu exists only while a registered consumer uses its path.
Removing the last consumer of one path retains other paths and shared support
while another GUI consumer remains. Removing the last GUI
consumer removes the verified hook/runtime/registry and provider receipt.
A pre-existing modules container is retained. A consumer upgrade retains shared
support during replacement. All GUI changes use one shared modification lock,
in addition to package-controller serialization.

Unknown developer hooks, links, unregistered module folders and changed owned
files cause refusal. The helper does not chain, adopt or overwrite foreign hooks.
An existing separately managed hook therefore needs an explicit migration; it
cannot be silently adopted. Status remains read-only. Backups and write verification
support rollback for caught failures. Reports retain transaction backups. A
rollback failure returns critical severity and says not to reboot. Power loss
cannot be handled by a running shell trap and is not yet proven recoverable.

## View API

Include `/data/integration/mzd-gui-runtime/sdk.js`, then use:

```js
MzdGuiModule.onInput(function (action, phase) {
    // left/right/up/down/select/rotateLeft/rotateRight/back
    // phase: press/release/step
    return false; // true consumes Back instead of the default close
});
MzdGuiModule.onDispose(function () {
    // Stop view timers and release listeners/resources.
});
MzdGuiModule.ready(); // Call after the view is usable, within eight seconds.
// MzdGuiModule.close();
```

Messages require the active iframe source and per-open token. Exceptions, load
errors and startup timeouts close a direct Applications view or return a grouped
view to its immediate parent menu. Native context changes close the view without restoring stale
focus. Disposing a view is idempotent. Custom events are consumed locally;
ordinary native events delegate to the original framework function.

Views share the browser process and origin. The iframe and cooperative SDK are
not a security boundary and cannot protect against an infinite loop or browser
engine crash. Do not install untrusted views. A failed helper initialization
restores only its own wrappers and removes its listeners. It must not modify OEM
JavaScript files or enable developer mode.

## Validation and remaining limits

Run `python tests/contract/test_gui_extensions.py`,
`python tests/contract/test_manifest.py`, `node tests/installer/test-gui-runtime.cjs`,
`node tests/installer/test-ui.cjs`, and `node tests/installer/test-es5.cjs`.
The runtime suite uses DOM mocks; it does not prove rendering or native input on
Opera. The real Restore fixture checks two saved consumers, shared cleanup and
receipt removal. Emulator, physical CMU, power-loss recovery and migration of existing consumers
remain separate acceptance work. Do not describe this development
implementation as vehicle-verified.

See [Acceptance testing](Gui-extension-testing.md) for the neutral browser and
physical CMU sequence, including the split between SSH checks and human input.


## Optional resident and service capabilities (provider 0.2.0, development)

GUI API 1 views are unchanged. Two optional manifest paths opt into additional
shared support; they are not specific to games or wallpaper:

```ini
gui_resident=assets/resident.js
gui_service=assets/service/entry.lua
```

A resident path must be an `assets/*.js` path. A service path must be an
`assets/*.lua` path and requires a resident. Paths cannot contain traversal or
links and must exist in the saved immutable module assets. Plain GUI consumers
load no resident or service code. The registry remains data-only.

The resident script registers once at GUI startup:

```js
window.MzdGuiResidents.register('example-id', function (context) {
    context.onDispose(function () { /* Stop timers/listeners; restore owned state. */ });
    context.onViewClose(function () { /* Release transient UI resources only. */ });
    context.onMessage(function (event) { /* Active view source/token already checked. */ });
    context.service.request('get', {}, function (error, result) { /* Optional service. */ });
});
```

Closing an iframe disposes its SDK but retains its resident. Each resident has
independent registration, load/timeout/error handling and idempotent cleanup.
A failure in one cooperative resident does not replace or close other modules.
As with views, this is not a sandbox against hostile code or infinite loops.

A registered Lua entrypoint returns `function(context) ... end`. It returns a
table with `request(operation,args)`, optional `image(kind,key)`, `tick()` and
`close()`. Every service validates its own finite operations and argument schema;
there is no shared arbitrary command/path endpoint. `context.files` provides
checked file operations, `context.data` is its owned mutable data folder, and
`context.urls` generates token-protected binary image URLs. Lua dependencies are
loaded relative to that service's entrypoint with a per-module cache. Services
share one process and are trusted, not a privilege boundary.

The first service consumer adds one adjacent marker/command pair to the existing
`/jci/scripts/stage_wifi.sh`, under the same target lock as SSH. It starts the
shared Lua/LuaSocket host via the owned supervisor. Original GUI JS and native
MMUI binaries are not changed. Removing the last service consumer removes only
that pair and stops the verified owned process; ordinary GUI consumers may remain.
The final GUI consumer removes the verified shared GUI hook/runtime/registries.
Module user data under `/tmp/mnt/data_persist/mzd-tweaks/gui-data/<id>` is retained
separately from immutable snapshots. Unknown existing data folders are refused.
Consumers that offer complete user-data removal must declare their module data
directory with `config.<name>.path` in the manifest (trailing `/`). The package
controller then removes it after successful uninstall unless `--preserve-config`
was requested. Wallpaper Manager declares its entire module data directory,
including imported images and settings; Update preserves it automatically.

The service binds an ephemeral port on 127.0.0.1. A RAM-only descriptor supplies
the per-start token. File-origin Opera talks through a hidden same-origin HTTP
bridge iframe, using authenticated messages and RPC. No installer or SSH session
is required. Old descriptors and pending calls are invalidated after a restart.
The supervisor uses a new session and closes inherited standard streams. Runtime
diagnostics are bounded and kept in RAM at `/tmp/mzd-gui-service/service.log`.

### Existing installations

Providers and saved uninstallers from 0.1.0 cannot safely interpret capability
metadata. They are never overwritten implicitly. Before adding a resident/service
consumer, remove the old GUI consumers with their saved uninstallers, then install
them from the updated package. The worker refuses an older provider or older saved
GUI consumer before changing files. Ordinary API 1 consumers can continue reusing
their old compatible provider when no new capability is requested.

### Additional validation

Run `node tests/installer/test-gui-residents.cjs` and
`python tests/contract/test_gui_extensions.py --services-only`, alongside the
existing GUI/manifest/UI/ES5 suites. Service HTTP/file-origin behavior still needs
original Opera and physical CMU acceptance; fixture success is not vehicle proof.

## Optional translations

Declare `gui_translations=assets/i18n.js` only for a translated consumer.
Without this key the helper does not load a dictionary. Language polling is never started.
The UTF-8 script calls `window.MzdGuiI18n.register("consumer-id", dictionary)`.
The dictionary has `version: 1` and `languages`, whose keys are Mazda locale
codes (for example `en_US`, `de_DE`) and values are flat string-key maps.
The helper uses the native script loader, as Mazda does for its dictionaries;
it does not require file-origin XMLHttpRequest support.
See `usb/tweaks/tetris/assets/i18n.js` for a complete example.

The helper reads `framework.localize.getCurrentLanguage()`, normalizes Mazda enum
values when needed and chooses a language once when the consumer opens.
There is no polling or live language-change handling. Resolution is exact locale, base
language (or its first sorted regional dictionary), then `en_US`/`en`, then the
consumer's existing fallback text. Unavailable, malformed or timed-out files
and missing texts silently retain fallbacks. There are no missing-text logs.
Load timeout is five seconds, with maximum 128 locales and 256 keys per locale. Paths
remain scoped to the declaring consumer's assets, without links or traversal.

Views use `MzdGuiModule.t(key, fallback, values)` for plain text, with named
placeholders such as `{score}`. `loadLanguage(function(language, direction){})`
requests one authenticated source/token-checked snapshot, waiting for the
dictionary load or its bounded fallback before invoking the callback. `language()` returns the current code. File-origin responses use `*`
with the existing source/token checks. Insert translated strings as text, never
HTML. Keep spatial controller/game layouts stable; apply RTL to prose as needed.
Residents have `context.t`, `context.language()` and
`context.loadLanguage(function(snapshot){})`; subscriptions are disposed with
the resident. View subscriptions end on Exit or return to a shared submenu.

Optional keys `gui.label`, `gui.menu.0`, `gui.menu.1`, etc. translate displayed
Applications labels and each menu-path segment, preserving manifest path identity.
Shared menu translations use the first translated consumer in registry order.
`gui.back` and `gui.backToApplications` translate shared navigation. Reopening a consumer reads the currently selected Mazda language.

This requires shared provider `i18n=2`. Old immutable providers/saved consumers
are refused before publishing a replacement receipt: uninstall their GUI
consumers normally, then reinstall from the updated package. Existing consumers
without translation metadata remain supported. Installer metadata is separate.

## Mutable configuration paths

GUI modules can declare `config.<name>.path` directly in their manifest, with
an optional `config.<name>.source` default. A trailing path slash means a folder;
otherwise the path is a file. The package controller manages initialization and
Keep/Remove at Uninstall. It does not parse app-specific values. These data must
be outside immutable installed modules and package snapshots.

Lua services receive normalized paths in `context.config.<name>`. Applications
handle empty/missing files and perform checked, atomic writes themselves. See
Tetris `assets/service/entry.lua` and the [config example](examples/config-data/README.md).
Config-owning GUI modules require shared runtime `config=1`.

Views may use `MzdGuiModule.send(name,value)` and `onMessage(callback)` for
module-specific resident messages. Types are prefixed `mzd-module-`; SDK adds
the view token. The resident must still validate the active view, token, type
and payload, and use only its own scoped `context.service` API. This does not
expose arbitrary filesystem or shell access to view messages.
