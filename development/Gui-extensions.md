# Shared GUI extensions (development)

The shared helper supports lazy-loaded views for any tweak. A view can display
information, provide a tool or present a tweak's settings interface. Games is
one optional grouping, not the owner of the runtime. The initial native adapter
supports Applications; a native Mazda Settings adapter is not implemented yet.
Do not use guessed native context IDs.

## Authoring

Start with [Hello World](examples/gui-hello-world/) or the
[minimal neutral fixture](examples/gui-extension/). Use `type=gui-extension`,
`gui_api` (the lowest [GUI API level](#gui-api-level) it needs), a literal `gui_label` (1-80 characters), and
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
- **Hybrid extension workers (`type=files` + `gui_api`)**: Used when an in-car
  settings or monitoring interface accompanies native shims, loaders, and binary/XML
  patches (such as Android Auto Mod). The worker delegates to `lib/bundle.sh` and
  declares `components=components.tsv`, `target`, `oem_backup_md5`, and `lock_group`
  alongside the GUI extension metadata (`gui_api`, `gui_label`, `gui_entrypoint`, etc.).
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

## GUI API level

`lib/gui-runtime/api.conf` holds one line, `api=N`: the GUI API level of the provider, a
positive integer that only grows. A tweak declares in `gui_api` the lowest level it needs;
`gui_api=1` works with any provider. Installing or updating a tweak is refused, before any
installed consumer is removed, unless the installed provider **and the saved runtime copy of
every installed GUI consumer** (it runs on uninstall) are at least that level. The message
asks to uninstall all GUI tweaks (settings can be kept when offered) and reinstall from the
current USB package. The provider is never replaced by a consumer install or update; removing
an older consumer remains available through its saved uninstaller. The SDK is therefore not
required to be backward compatible across levels.

| Level | Meaning |
| --- | --- |
| 1 | Plain views, or any provider deployed before the integer level existed (its capabilities are unknown). |
| 2 | Resident, service, translations, config data, view and parking lifecycle, original state, native menu, service request and the settings view (`settings-host.js`, `settings-view.js`). |

Rules for maintainers: a level is additive only and never reused for different content. Bump
`api` in `api.conf` whenever the runtime, registry format or shell library gains something a
tweak can depend on, add a row above and a row to the feature table in `tools/validate.py`.
Every provider deployed before this scheme reports `api=1`, so tweaks that need level 2 ask
for a one-time reinstall of the GUI tweaks. `tools/validate.py` checks that a shipped tweak
does not declare a level above the shipped `api.conf` and declares at least level 2 when its
manifest or scripts use anything beyond plain views. The registry's own `api:1` is its format
number and unrelated to this level.


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

Views default to a fullscreen 800x480 area. A view can opt into the original
Mazda status bar with `MzdGuiModule.setLayout('with-status-bar')`; its iframe
then occupies 800x416 below the 64-pixel bar. Use `fullscreen` to return to the
default. Fit the view to its iframe dimensions. Layout requests use the same
source/token checks as other view messages and do not change native contexts.
If a resident temporarily replaces the view root with a native settings list,
request the layout again after releasing that list to restore the view title.

A view can opt into phone interruption handling by registering
`MzdGuiModule.onSuspend(fn)` and `MzdGuiModule.onResume(fn)`. Stop view timers
and data requests on suspend; rebuild any native settings list on resume. The
same iframe remains in memory, hidden and detached from resident access during
the call. The SDK and parent release input to the native phone interface.
Known phone-call contexts and the `backupparking` contexts `BackupCameraDisplay`,
`BUCAndPSMDisplay` and `ParkingSensorDisplay` qualify. Switching between these
displays keeps the view suspended until it returns to its original menu. Resume requires the original
Applications context sequence and a completed framework transition. Temporary
Applications ready/displayed callbacks mask the incoming OEM list during the
return animation and remove the polling delay at completion; original callbacks
are delegated and restored when the session closes. Deliberate
navigation or an unknown return identity closes the view. Without opt-in,
context changes retain the existing close behavior. No synthetic MMUI messages
or forced native context switches are used.

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

Plain views (`gui_api=1`) are unchanged. Two optional manifest paths opt into additional
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

Because the resident persists across view openings, it can keep in-memory state
(Android Auto Settings still reads its settings again on every open), queue rapid consecutive user
requests safely, and continue asynchronous persistence to its Lua backend service
even if the driver closes the view before writes complete. When completing saves
in the background, residents can display non-intrusive native Status Bar Notifications
(SBN) via `framework.common.startTimedSbn` to confirm that changes were saved safely,
or that a reboot is needed to apply them. Keep notifications best-effort: a failed
SBN must not stop a save.

A registered Lua entrypoint returns `function(context) ... end`. It returns a
table with `request(operation,args)`, optional `image(kind,key)`, `tick()` and
`close()`. Every service validates its own finite operations and argument schema;
there is no shared arbitrary command/path endpoint. `context.files` provides
checked file operations, `context.data` is its owned mutable data folder, and
`context.urls` generates token-protected binary image URLs. Lua dependencies are
loaded relative to that service's entrypoint with a per-module cache. Services
share one process and are trusted, not a privilege boundary. A service must not
read or write module files while it starts or from `tick()`; it reads them when a
request needs them, so a drive without the view does no extra disk access.

Tweak workers never reboot (see the [worker contract](Worker-contract.md)). A GUI
service may offer a reboot operation only to apply its own saved settings, and
only under these rules:

- The driver confirms it in the view. Default to **No**.
- The resident sends it only after every queued save has finished.
- It covers only changes made through that service. Whoever changes the files
  another way, for example over SSH, is responsible for the reboot.
- The service refuses it when nothing is waiting to be applied, flushes writes
  before calling `reboot`, and reports a failed command with its exit status.
- The view gives a manual fallback when the request fails.

Android Auto Settings is the reference implementation (`usb/tweaks/android-auto/assets`).

The first service consumer adds one adjacent marker/command pair to the existing
`/jci/scripts/stage_wifi.sh`, under the same target lock as SSH. It starts the
shared Lua/LuaSocket host via the owned supervisor. Original GUI JS and native
MMUI binaries are not changed. Removing the last service consumer removes only
that pair and stops the verified owned process; ordinary GUI consumers may remain.
The final GUI consumer removes the verified shared GUI hook/runtime/registries.
Module user data under `/tmp/mnt/data_persist/mzd-tweaks/gui-data/<id>` is separate
from immutable snapshots. Unknown existing data folders are refused. New managed
uninstall removes the owned module data after its writers have stopped. Consumers
that offer preservation must declare their module data directory with
`config.<name>.path` in the manifest (trailing `/`); `--preserve-config` then keeps
that data. Undeclared service staging data is removed even when an unrelated
config elsewhere is preserved. Wallpaper Manager declares its entire module data directory,
including imported images and settings; Update preserves it automatically.

The service binds an ephemeral port on 127.0.0.1. A RAM-only descriptor supplies
the per-start token. File-origin Opera talks through a hidden same-origin HTTP
bridge iframe, using authenticated messages and RPC. No installer or SSH session
is required. Old descriptors and pending calls are invalidated after a restart.
The supervisor uses a new session and closes inherited standard streams. Runtime
diagnostics are bounded and kept in RAM at `/tmp/mzd-gui-service/service.log`.

### Existing installations

Providers and saved uninstallers from before the [GUI API level](#gui-api-level) report
`api=1` and cannot safely interpret newer metadata. They are never overwritten
implicitly. Before adding a resident/service consumer, remove the old GUI consumers with
their saved uninstallers, then install them from the updated package. The worker refuses
an older provider or older saved GUI consumer before changing files. Level-1 consumers
(plain views) can continue reusing their old compatible provider.

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

This requires GUI API level 2. Old immutable providers/saved consumers
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
Config-owning GUI modules require GUI API level 2.

Views may use `MzdGuiModule.send(name,value)` and `onMessage(callback)` for
module-specific resident messages. Types are prefixed `mzd-module-`; SDK adds
the view token. The resident must still validate the active view, token, type
and payload, and use only its own scoped `context.service` API. This does not
expose arbitrary filesystem or shell access to view messages.

## Shared settings view

GUI API level 2 provides a shared settings list built on `createNativeMenu` and
`context.service`. It comes in two files because a resident and its view run in different
windows:

- `settings-host.js` (`MzdSettingsHost`) is loaded by the shared hook after `residents.js`
  and before `services.js` whenever a registered module has a resident. A tweak needs no
  manifest key to use it.
- `settings-view.js` (`MzdSettingsView`) is loaded by the view itself from `view.html`. A
  view runs in its own iframe, a separate window from the page where the hook and the
  residents run, so loading it in the hook would not make it available there.

If a script cannot be loaded, the hook still continues with the remaining scripts and the
runtime starts. Only the resident that needs the missing code fails; other modules are
unaffected.

A resident that uses `MzdSettingsHost` must check that it exists before using it, because
`settings-host.js` may have failed to load while the resident did load. Throw a clear error,
for example `throw new Error('Shared settings code is unavailable.')`: the runtime logs it and
stops only that resident. If `settings-view.js` is missing, a view should say so (Android Auto
and MZD Tweaks show the existing `menuError` text) and call `ready()` so the message stays
visible until the driver goes back.

A view adds the script after the SDK:

```html
<script src="/data/integration/mzd-gui-runtime/sdk.js"></script>
<script src="/data/integration/mzd-gui-runtime/settings-view.js"></script>
<script src="view.js"></script>
```

The resident creates the host. The host routes native menu messages, keeps the
last settings, queues `set` requests (a newer value for a queued key replaces
it) and shows the save-error and reboot notifications:

```js
window.MzdGuiResidents.register('example-id', function (context) {
    window.MzdSettingsHost.create(context, {
        prefix: 'example',   // message type prefix shared with the view
        dialog: true,        // preload the OEM Dialog3 template
        reboot: true,        // forward confirmed reboot requests to the service
        texts: { saveError: 'Failed to save settings' }, // used until the view sends localized texts
        onState: function (settings, result) {}          // after every service result or queued change
    });
});
```

The service implements `get` and `set {key, value}`. Both return `{settings}`, with
optional `limits` (per key `{min, max, step}`), `unavailable` (per key reason) and
`rebootRequired`. `reboot` follows the rules in
[Optional resident and service capabilities](#optional-resident-and-service-capabilities-provider-020-development).
Other host options: `initialState`, `syncOnStart`, `onRequest(action, payload, host)`
for custom view requests, `split`, `preview`, `onOpen`, `onClose` and `onDispose`.
Residents with their own menus can still use
`MzdSettingsHost.handleNativeMessage(nativeMenu, context, prefix, event, options)`
for the native menu routing alone.

The view declares rows:

```js
window.MzdSettingsView.create(window.MzdGuiModule, {
    prefix: 'example',
    title: function (tr) { return tr('title', 'Example'); },
    rowDefaults: { savingSpinner: true },
    types: { /* custom row types, see below */ },
    entries: function (state, tr, api) {
        return [
            { key: 'enabled', type: 'bool', label: tr('enabled', 'Enabled'), defaultValue: true },
            { key: 'level', type: 'step', label: tr('level', 'Level'), min: 1, max: 5 },
            { type: 'reboot', label: tr('reboot', 'Reboot to apply changes'),
              question: tr('rebootQuestion', 'Do you want to reboot MZD to apply settings?') }
        ];
    }
});
```

Built-in row types cover only common patterns:

| Type | Behavior |
| --- | --- |
| `bool` | OEM On/Off row. `defaultValue` applies while the setting is absent. |
| `step` | OEM stepper. Limits come from the service `limits[key]`, otherwise `min`, `max` and `increment`. Each value is saved. |
| `action` | Sends `<prefix>-request {action}`. `confirm: {text, buttons}` asks first; the default buttons are No (focused) and Yes. |
| `reboot` | Enabled only when the service reports `rebootRequired` and no save is running. Always confirmed. `fallback` text appears if the dialog fails. |

These row properties work for every type, including custom ones:

| Property | Effect |
| --- | --- |
| `disabled` | Boolean or `function (state, api)`. A key listed in `unavailable` is always disabled. |
| `savingSpinner` | Shows the OEM refresh spinner in front of the row while its own key is being saved. |
| `savingDisabled` | Disables the row while its own key is being saved. |
| `busyDisabled` | Disables the row while any save is running. |
| `image1`, `detail`, `caret`, `checkable`, `checked`, `radio` | Passed to the OEM list item. |
| `select` | `function (api, row, params)` that replaces the type's activation. |

`rowDefaults` sets the three saving properties for all rows. A row's own value overrides it. The
resident reports the keys still waiting in its queue, so each row only reflects
its own save.

### Custom row types

Tweak-specific behavior stays in the tweak. `types` maps a type name to hooks;
every hook is optional:

| Hook | Called |
| --- | --- |
| `row(def, api)` | Returns OEM row fields (`itemStyle`, `checked`, `value`, `detail`, ...). The shared properties are applied afterwards. |
| `activate(def, row, params, api)` | When the driver selects an enabled row. `params` carries a stepper value. |
| `focus(def, info, api)` | When focus moves away from this row or leaves its stepper. `info` is `{index, previous, secondary}`. |
| `flush(def, api)` | Before another row is activated, Back, a dialog or view disposal. Lets deferred rows save. |
| `response(def, data, api)` | After every resident state message, including errors. |

`api` offers `t`, `state()`, `limits()`, `unavailable()`, `saving()`,
`pending(key)`, `rebootRequired()`, `save(key, value)`, `request(action, payload)`,
`render()`, `openPage({id, title, entries, index})`, `back(silent)`,
`confirm({text, buttons, fallback}, onYes)`, `flush()`, `stepValue(row, params)`
and `isFinalAdjustment(params)`. `MzdSettingsView.types` exposes the built-in
types for reuse, for example `row: MzdSettingsView.types.step.row`.

Android Auto Settings (`usb/tweaks/android-auto/assets/view.js`) is the
reference: its `dpi` type saves Resolution DPI only after the adjustment is
finished, its `distance` type opens a radio sub-page and its `transport` type
maps On/Off to `svcnavi`/`vbs`. MZD Tweaks uses only built-in rows.
