/**
 * Shared settings code (GUI API level 2): usb/lib/gui-runtime/settings-host.js for residents and
 * settings-view.js for views.
 *
 * MzdSettingsHost runs in a resident, MzdSettingsView in a view. Both are tested here with fake
 * contexts, so that every behaviour is checked independent of a tweak. Tweak specific rows are tested
 * with their tweak (tests/tweaks/android-auto, tests/tweaks/mzd-tweaks).
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run: node --test tests/installer/test-gui-settings.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const runtime = path.join(root, 'usb/lib/gui-runtime');
const hostSource = fs.readFileSync(path.join(runtime, 'settings-host.js'), 'utf8');
const viewSource = fs.readFileSync(path.join(runtime, 'settings-view.js'), 'utf8');
const bootSource = fs.readFileSync(path.join(runtime, 'boot.js'), 'utf8');

// Objects made by the code under test come from another realm; compare them as plain data.
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function loadHost(win) {
  vm.runInNewContext(hostSource, { window: win });
  return win;
}

function loadView(win, document) {
  vm.runInNewContext(viewSource, document ? { window: win, document: document } : { window: win });
  return win;
}

// --- Resident side ---------------------------------------------------------

// A resident context whose service requests complete only when the test says so.
function hostPage(options) {
  const win = { intervals: [], cleared: [] };
  win.setInterval = fn => { win.intervals.push(fn); return win.intervals.length; };
  win.clearInterval = id => { win.cleared.push(id); };
  loadHost(win);
  const source = { messages: [], postMessage(message) { this.messages.push(message); } };
  const ctx = { notes: [], logs: [], requests: [], menuCalls: [], handlers: {}, current: { source: source, token: 'tok', frame: { name: 'frame' } } };
  ctx.view = () => ctx.current;
  ctx.onMessage = fn => { ctx.handlers.message = fn; };
  ctx.onViewClose = fn => { ctx.handlers.viewClose = fn; };
  ctx.onDispose = fn => { ctx.handlers.dispose = fn; };
  ctx.onServiceReady = fn => { ctx.handlers.ready = fn; };
  ctx.notify = (text, isError) => { ctx.notes.push([text, isError]); };
  ctx.log = text => { ctx.logs.push(text); };
  ctx.service = { request(op, args, cb) { ctx.requests.push({ op: op, args: args, cb: cb }); } };
  ctx.createNativeMenu = menuOptions => {
    ctx.menuOptions = menuOptions;
    ctx.menu = {
      owned: false,
      fail: null,
      render(...args) { ctx.menuCalls.push(['render', ...args]); if (this.fail) { throw this.fail; } },
      input(...args) { ctx.menuCalls.push(['input', ...args]); if (this.fail) { throw this.fail; } },
      dialog(...args) { ctx.menuCalls.push(['dialog', ...args]); if (this.fail) { throw this.fail; } },
      close(...args) { ctx.menuCalls.push(['close', ...args]); },
      owns() { return this.owned; },
      check() { ctx.menuCalls.push(['check']); }
    };
    return ctx.menu;
  };
  const host = win.MzdSettingsHost.create(ctx, options);
  return { win, ctx, host, source };
}

function fromView(ctx, data) {
  ctx.handlers.message({ source: ctx.current.source, data: Object.assign({ token: 'tok' }, data) });
}

function viewRequest(ctx, action, payload) {
  fromView(ctx, { type: 'p-request', action: action, payload: payload });
}

function take(ctx, op) {
  const index = ctx.requests.findIndex(r => r.op === op);
  assert(index >= 0, 'a "' + op + '" request is waiting');
  return ctx.requests.splice(index, 1)[0];
}

function lastResponse(source) {
  const all = source.messages.filter(m => m.type === 'p-response');
  return all.length ? plain(all[all.length - 1]) : undefined;
}

test('api.conf carries only the GUI API level and the install gate compares it', () => {
  const api = fs.readFileSync(path.join(runtime, 'api.conf'), 'utf8').trim().split('\n');
  assert.equal(api.length, 1, 'no version or capability lines');
  assert(/^api=[1-9][0-9]*$/.test(api[0]), 'a positive integer');
  assert(Number(api[0].slice(4)) >= 2, 'level 2 is the first level that carries the settings code');
  const gate = fs.readFileSync(path.join(root, 'usb/lib/gui-services.sh'), 'utf8');
  assert(/\[ "\$have" -ge "\$want" \]/.test(gate), 'the gate compares the provider level with the tweak level');
  assert(!/settings-view|native-menu|service-request|i18n=2|config=1|view-lifecycle|original-state/.test(gate), 'no capability lines are checked any more');
});

test('tweaks load only the settings half they use', () => {
  const tweaks = path.join(root, 'usb/tweaks');
  const hosts = [], views = [];
  for (const id of fs.readdirSync(tweaks)) {
    const assets = path.join(tweaks, id, 'assets');
    if (!fs.existsSync(path.join(tweaks, id, 'manifest.conf')) || !fs.existsSync(assets)) { continue; }
    const read = name => (fs.existsSync(path.join(assets, name)) ? fs.readFileSync(path.join(assets, name), 'utf8') : '');
    const usesHost = /MzdSettingsHost/.test(read('resident.js')), usesView = /MzdSettingsView/.test(read('view.js'));
    const html = read('view.html');
    assert.equal(/mzd-gui-runtime\/settings-view\.js/.test(html), usesView, id + ': view.html loads settings-view.js exactly when its view uses it');
    assert(!/mzd-gui-runtime\/settings(-host)?\.js/.test(html), id + ': a view never loads the host half or the old settings.js');
    if (usesHost) { hosts.push(id); }
    if (usesView) { views.push(id); }
  }
  assert.deepEqual(hosts.sort(), ['android-auto', 'mzd-tweaks', 'wallpaper-manager']);
  assert.deepEqual(views.sort(), ['android-auto', 'mzd-tweaks']);
});

// Runs boot.js against a fake page. fail: scripts that fail to load (onerror), throwOn: scripts whose
// insertion throws. Returns the scripts in the order they were requested.
function bootOrder(modules, options) {
  options = options || {};
  const loaded = [], win = {}, prevented = [];
  const matches = (list, src) => (list || []).some(name => src.endsWith(name));
  const head = {
    appendChild(script) {
      loaded.push(script.src.replace('/data/integration/', ''));
      if (matches(options.throwOn, script.src)) { throw new Error('insert failed'); }
      if (/mzd-gui-registry\.js$/.test(script.src) && !matches(options.fail, script.src)) { win.mzdGuiRegistry = { modules: modules }; }
      if (matches(options.fail, script.src)) {
        assert.equal(script.onerror({ preventDefault() { prevented.push(script.src); } }), true, 'the load error is handled');
      } else {
        script.onload();
      }
    }
  };
  const document = { head: head, documentElement: head, createElement: () => ({}), getElementsByTagName: () => [head] };
  vm.runInNewContext(bootSource, { window: win, document: document });
  if (options.twice) { vm.runInNewContext(bootSource, { window: win, document: document }); }
  loaded.prevented = prevented.length;
  return loaded;
}

const lib = name => 'mzd-gui-runtime/' + name + '.js';
const REGISTRY = 'mzd-gui-registry.js', RUNTIME = lib('runtime');

test('boot loads settings-host.js after the residents and before the services, for every resident', () => {
  const host = lib('settings-host');
  assert.deepEqual(Array.from(bootOrder([])), [REGISTRY, RUNTIME], 'views alone never load resident code');
  assert.deepEqual(Array.from(bootOrder([{ translations: true }])), [REGISTRY, lib('i18n'), RUNTIME]);
  assert.deepEqual(Array.from(bootOrder([{ resident: true }])), [REGISTRY, lib('residents'), host, RUNTIME]);
  assert.deepEqual(Array.from(bootOrder([{ resident: true, service: true, translations: true }])),
    [REGISTRY, lib('residents'), host, lib('services'), lib('i18n'), RUNTIME]);
  assert.deepEqual(
    Array.from(bootOrder([{ resident: true }, { resident: true, service: true, translations: true }])),
    [REGISTRY, lib('residents'), host, lib('services'), lib('i18n'), RUNTIME],
    'it is loaded once, however many residents there are'
  );
  assert(!bootOrder([{ resident: true }]).some(name => name === lib('settings-view')), 'the view half is never loaded by the hook');
  assert.equal(bootOrder([{ resident: true }], { twice: true }).length, 4, 'a second boot request loads nothing');
});

test('boot continues with the remaining scripts when one of them cannot be loaded', () => {
  const modules = [{ resident: true, service: true, translations: true }];
  const all = [REGISTRY, lib('residents'), lib('settings-host'), lib('services'), lib('i18n'), RUNTIME];
  assert.deepEqual(Array.from(bootOrder(modules)), all);

  let order = bootOrder(modules, { fail: ['settings-host.js'] });
  assert.deepEqual(Array.from(order), all, 'the services and the runtime still load without settings-host.js');
  assert.equal(order.prevented, 1, 'the load error is not reported to the page');
  assert.deepEqual(Array.from(bootOrder(modules, { fail: ['services.js'] })), all, 'the runtime starts without services.js');
  assert.deepEqual(Array.from(bootOrder(modules, { fail: ['residents.js'] })), all, 'settings-host.js and the rest still load without residents.js');
  assert.deepEqual(Array.from(bootOrder(modules, { fail: ['i18n.js'] })), all, 'the runtime starts without i18n.js');
  assert.deepEqual(Array.from(bootOrder(modules, { fail: ['settings-host.js', 'services.js', 'i18n.js'] })), all);
  assert.deepEqual(Array.from(bootOrder(modules, { fail: [REGISTRY] })), [REGISTRY, RUNTIME],
    'without a registry only the runtime is requested, and it finds nothing to start');
  assert.deepEqual(Array.from(bootOrder(modules, { throwOn: ['settings-host.js'] })), all, 'a script that cannot even be inserted does not stop the chain');
});

test('handleNativeMessage routes the messages of the active view to the native menu', () => {
  const { win, ctx, source } = hostPage({ prefix: 'p' });
  const route = win.MzdSettingsHost.handleNativeMessage;
  const message = (type, extra) => ({ source: source, data: Object.assign({ type: 'p-' + type, token: 'tok' }, extra) });
  const last = () => ctx.menuCalls[ctx.menuCalls.length - 1];
  ctx.menuCalls.length = 0;

  assert.equal(route(ctx.menu, ctx, 'p', message('native-render', { menu: { title: 'T' } })), true);
  assert.equal(last()[0], 'render');
  assert.equal(last()[1], ctx.current.frame);
  assert.equal(last()[2], 'tok');
  assert.equal(last()[3].title, 'T');

  assert.equal(route(ctx.menu, ctx, 'p', message('native-input', { action: 'down', phase: 'step' })), true);
  assert.deepEqual(last().slice(0, 1).concat(last().slice(2)), ['input', 'tok', 'down', 'step']);

  assert.equal(route(ctx.menu, ctx, 'p', message('native-dialog', { dialog: { text: 'Sure?' } })), true);
  assert.equal(last()[0], 'dialog');
  assert.equal(last()[3].text, 'Sure?');

  const calls = ctx.menuCalls.length;
  assert.equal(route(ctx.menu, ctx, 'p', message('native-focus')), false, 'other message types are not native menu traffic');
  assert.equal(route(ctx.menu, ctx, 'p', { source: source, data: { type: 'p-native-render', token: 'old', menu: {} } }), false, 'a stale token is refused');
  assert.equal(route(ctx.menu, ctx, 'p', { source: {}, data: { type: 'p-native-render', token: 'tok', menu: {} } }), false, 'another window is refused');
  assert.equal(route(ctx.menu, ctx, 'other', message('native-render', { menu: {} })), false, 'another prefix is not routed');
  assert.equal(ctx.menuCalls.length, calls, 'refused messages never reach the menu');
});

test('handleNativeMessage releases the menu for the owning view and reports menu failures', () => {
  const { win, ctx, source } = hostPage({ prefix: 'p' });
  const route = win.MzdSettingsHost.handleNativeMessage;
  const message = (type, extra) => ({ source: source, data: Object.assign({ type: 'p-' + type, token: 'tok' }, extra) });
  const last = () => ctx.menuCalls[ctx.menuCalls.length - 1];
  ctx.menuCalls.length = 0;

  assert.equal(route(ctx.menu, ctx, 'p', message('native-release')), true);
  assert.deepEqual(last(), ['close', true], 'release leaves the menu');
  const stale = { source: {}, data: { type: 'p-native-release', token: 'old' } };
  assert.equal(route(ctx.menu, ctx, 'p', stale), false, 'a stranger cannot release the menu');
  ctx.menu.owned = true;
  assert.equal(route(ctx.menu, ctx, 'p', stale), true, 'the menu owner can release it after the view changed');
  ctx.menu.owned = false;

  let released = 0;
  ctx.menuCalls.length = 0;
  assert.equal(route(ctx.menu, ctx, 'p', message('native-release'), { onRelease() { released += 1; } }), true);
  assert.equal(released, 1);
  assert.equal(ctx.menuCalls.length, 0, 'onRelease replaces the default close');

  ctx.menu.fail = new Error('List failed');
  ctx.menuCalls.length = 0;
  assert.equal(route(ctx.menu, ctx, 'p', message('native-render', { menu: {} })), true);
  assert.deepEqual(last(), ['close', false], 'a failed menu closes without leaving Applications');
  let error = plain(source.messages[source.messages.length - 1]);
  assert.deepEqual(error, { type: 'p-native-error', token: 'tok', scope: 'menu', message: 'List failed' });
  assert.equal(route(ctx.menu, ctx, 'p', message('native-dialog', { dialog: {} })), true);
  assert.equal(plain(source.messages[source.messages.length - 1]).scope, 'dialog');
  assert.equal(route(ctx.menu, ctx, 'p', message('native-render', { menu: {} }), { leaveOnError: true }), true);
  assert.deepEqual(last(), ['close', true], 'leaveOnError returns to Applications');
});

test('host reads the settings once per sync and broadcasts the whole state', () => {
  const states = [];
  const { ctx, source } = hostPage({ prefix: 'p', onState: (settings, result) => states.push([plain(settings), !!result]) });
  assert.equal(ctx.requests.length, 0, 'nothing is read before a view asks');
  viewRequest(ctx, 'get');
  viewRequest(ctx, 'get');
  assert.equal(ctx.requests.length, 1, 'concurrent reads share one service request');
  assert.equal(ctx.requests[0].op, 'get');
  assert.equal(lastResponse(source), undefined, 'there is nothing to show yet');

  take(ctx, 'get').cb(null, {
    settings: { a: 1 },
    limits: { a: { min: 1, max: 2, step: 1 } },
    unavailable: { b: 'Missing file' },
    rebootRequired: true
  });
  assert.deepEqual(lastResponse(source), {
    type: 'p-response',
    token: 'tok',
    state: { a: 1 },
    limits: { a: { min: 1, max: 2, step: 1 } },
    unavailable: { b: 'Missing file' },
    rebootRequired: true,
    saving: false,
    pending: [],
    error: ''
  });
  assert.deepEqual(states, [[{ a: 1 }, true]]);

  const before = source.messages.length;
  viewRequest(ctx, 'get');
  assert.equal(source.messages.length, before + 1, 'the cached state is shown while the new read runs');
  take(ctx, 'get').cb(null, { settings: { a: 2 }, restart_required: true });
  const second = lastResponse(source);
  assert.equal(second.state.a, 2);
  assert.equal(second.rebootRequired, true, 'restart_required is the same as rebootRequired');
  assert.deepEqual(second.limits, {}, 'a full read replaces the limits');
});

test('host reports a failed read with its error and ignores requests of other windows', () => {
  const { ctx, source } = hostPage({ prefix: 'p' });
  viewRequest(ctx, 'get');
  take(ctx, 'get').cb('Service offline');
  const response = lastResponse(source);
  assert.equal(response.error, 'Service offline');
  assert.equal(response.state, null);

  ctx.handlers.message({ source: {}, data: { type: 'p-request', token: 'tok', action: 'get' } });
  ctx.handlers.message({ source: ctx.current.source, data: { type: 'p-request', token: 'old', action: 'get' } });
  ctx.handlers.message({ source: ctx.current.source, data: { type: 'p-request', action: 'get' } });
  ctx.handlers.message({ source: ctx.current.source, data: { type: 'other-request', token: 'tok', action: 'get' } });
  assert.equal(ctx.requests.length, 0, 'only the active view of this prefix can request');
});

test('host saves one value at a time and lets newer values replace queued ones', () => {
  const { ctx, host, source } = hostPage({ prefix: 'p' });
  viewRequest(ctx, 'set', { key: 'a', value: 1 });
  viewRequest(ctx, 'set', { key: 'b', value: 2 });
  viewRequest(ctx, 'set', { key: 'b', value: 3 });
  viewRequest(ctx, 'set', { key: 'c', value: 4 });
  viewRequest(ctx, 'set', { value: 5 });
  viewRequest(ctx, 'set', { key: 7, value: 5 });
  assert.equal(ctx.requests.length, 1, 'a second save waits for the first');
  assert.deepEqual(plain(ctx.requests[0]).args, { key: 'a', value: 1 });
  assert.equal(host.saving(), true);
  assert.deepEqual(plain(host.settings()), { a: 1, b: 3, c: 4 }, 'the newest values are visible at once');

  take(ctx, 'set').cb(null, { settings: { a: 1, b: 0, c: 0 } });
  let response = lastResponse(source);
  assert.equal(response.saving, true);
  assert.deepEqual(response.pending, ['b', 'c'], 'the view learns which keys still wait');
  assert.deepEqual(plain(response.state), { a: 1, b: 3, c: 4 }, 'a service value never replaces a queued one');
  assert.deepEqual(plain(ctx.requests[0]).args, { key: 'b', value: 3 }, 'the coalesced value is the one saved');

  take(ctx, 'set').cb(null, { settings: { b: 3 } });
  take(ctx, 'set').cb(null, { settings: { c: 4 }, rebootRequired: true });
  response = lastResponse(source);
  assert.equal(response.saving, false);
  assert.deepEqual(response.pending, []);
  assert.equal(response.rebootRequired, true);
  assert.equal(host.saving(), false);
});

test('a full read keeps values that are still being saved', () => {
  const { ctx, host } = hostPage({ prefix: 'p' });
  viewRequest(ctx, 'set', { key: 'a', value: 5 });
  viewRequest(ctx, 'set', { key: 'b', value: 6 });
  viewRequest(ctx, 'get');
  take(ctx, 'get').cb(null, { settings: { a: 1, b: 1, c: 1 } });
  assert.deepEqual(plain(host.settings()), { a: 5, b: 6, c: 1 }, 'reopening the view never flashes the old values');
});

test('a failed save clears the queue, tells the driver and shows the stored values again', () => {
  const { ctx, source } = hostPage({ prefix: 'p', texts: { saveError: 'Could not save' } });
  viewRequest(ctx, 'set', { key: 'a', value: 1 });
  viewRequest(ctx, 'set', { key: 'b', value: 2 });
  take(ctx, 'set').cb('Disk full');
  assert.deepEqual(ctx.notes, [['Could not save', true]]);
  assert.equal(ctx.requests.length, 1, 'the queued save is dropped; only a read follows');
  assert.equal(ctx.requests[0].op, 'get');
  take(ctx, 'get').cb(null, { settings: { a: 0, b: 0 } });
  const response = lastResponse(source);
  assert.equal(response.error, 'Disk full');
  assert.deepEqual(plain(response.state), { a: 0, b: 0 });
  assert.equal(response.saving, false);
});

test('reboot is forwarded only when enabled, idle and needed', () => {
  const { ctx } = hostPage({ prefix: 'p', reboot: true });
  viewRequest(ctx, 'get');
  take(ctx, 'get').cb(null, { settings: { a: 1 }, rebootRequired: false });
  viewRequest(ctx, 'reboot');
  assert.equal(ctx.requests.length, 0, 'nothing to apply, nothing to reboot');

  viewRequest(ctx, 'get');
  take(ctx, 'get').cb(null, { settings: { a: 1 }, rebootRequired: true });
  viewRequest(ctx, 'set', { key: 'a', value: 2 });
  viewRequest(ctx, 'reboot');
  assert.deepEqual(ctx.requests.map(r => r.op), ['set'], 'a reboot cannot overtake a running save');
  take(ctx, 'set').cb(null, { settings: { a: 2 }, rebootRequired: true });

  viewRequest(ctx, 'reboot');
  assert.deepEqual(ctx.requests.map(r => r.op), ['reboot']);
  take(ctx, 'reboot').cb('Failed to reboot MZD (status 1)');
  assert.deepEqual(ctx.logs, ['Reboot failed: Failed to reboot MZD (status 1)']);
  assert.deepEqual(ctx.notes.slice(-1), [['Hold NAV + MUTE to reboot', false]], 'the driver gets the manual fallback');
});

test('a host without the reboot option never sends it to the service', () => {
  const seen = [];
  const { ctx } = hostPage({ prefix: 'p', onRequest: (action, payload) => seen.push([action, plain(payload)]) });
  viewRequest(ctx, 'get');
  take(ctx, 'get').cb(null, { settings: {}, rebootRequired: true });
  viewRequest(ctx, 'reboot');
  assert.equal(ctx.requests.length, 0);
  assert.deepEqual(seen, [['reboot', undefined]], 'it is left to the tweak');
});

test('host notices: reboot after leaving the list, nothing after a failed save, localized texts', () => {
  const { ctx } = hostPage({ prefix: 'p', texts: { reboot: 'Restart please' } });
  function open() { ctx.menuOptions.onOpen(); }
  function save(result) { viewRequest(ctx, 'set', { key: 'a', value: 1 }); take(ctx, 'set').cb(null, result); }

  open();
  save({ settings: { a: 1 }, rebootRequired: true });
  assert.deepEqual(ctx.notes, [], 'the open list shows the state itself');
  ctx.handlers.viewClose();
  assert.deepEqual(ctx.notes, [['Restart please', false]], 'leaving the list shows the reboot notice');
  assert.deepEqual(ctx.menuCalls.slice(-1), [['close', true]]);

  ctx.notes.length = 0;
  open();
  viewRequest(ctx, 'set', { key: 'a', value: 2 });
  ctx.handlers.viewClose();
  assert.deepEqual(ctx.notes, [], 'a save in progress reports for itself when it finishes');
  take(ctx, 'set').cb(null, { settings: { a: 2 }, rebootRequired: true });
  assert.deepEqual(ctx.notes, [['Restart please', false]]);

  ctx.notes.length = 0;
  viewRequest(ctx, 'texts', { reboot: 'Neu starten', saveError: '', ignored: 5, extra: 'More' });
  open();
  viewRequest(ctx, 'set', { key: 'a', value: 3 });
  take(ctx, 'set').cb('Disk full');
  take(ctx, 'get').cb(null, { settings: { a: 2 }, rebootRequired: true });
  ctx.handlers.viewClose();
  assert.deepEqual(ctx.notes, [['Failed to save settings', true]], 'an empty text is ignored and a failed save shows only its error');

  ctx.notes.length = 0;
  open();
  save({ settings: { a: 1 }, rebootRequired: true });
  ctx.handlers.viewClose();
  assert.deepEqual(ctx.notes, [['Neu starten', false]], 'opening the list again forgets the failure and uses the localized text');
});

test('host polls the native menu only while it is open', () => {
  const { win, ctx } = hostPage({ prefix: 'p' });
  assert.equal(ctx.menuOptions.prefix, 'p');
  assert.equal(ctx.menuOptions.dialog, false);
  ctx.menuOptions.onOpen();
  ctx.menuOptions.onOpen();
  assert.equal(win.intervals.length, 1, 'one timer per open list');
  win.intervals[0]();
  assert.deepEqual(ctx.menuCalls.slice(-1), [['check']]);
  ctx.menuOptions.onClose();
  assert.deepEqual(win.cleared, [1]);
  ctx.menuOptions.onClose();
  assert.deepEqual(win.cleared, [1], 'stopping twice is harmless');
});

test('host passes menu options through and runs the open and close hooks', () => {
  const hooks = [];
  const { ctx } = hostPage({
    prefix: 'p', dialog: true, split: true, preview: 'preview',
    onOpen: () => { hooks.push('open'); throw new Error('ignored'); },
    onClose: () => hooks.push('close')
  });
  assert.equal(ctx.menuOptions.dialog, true);
  assert.equal(ctx.menuOptions.split, true);
  assert.equal(ctx.menuOptions.preview, 'preview');
  ctx.menuOptions.onOpen();
  ctx.menuOptions.onClose();
  assert.deepEqual(hooks, ['open', 'close'], 'a failing hook does not break the host');
  assert.deepEqual(ctx.logs, ['onOpen failed: Error: ignored'], 'and it is logged, not hidden');
});

test('host reads the service at start and on service ready, and shows nothing unconfirmed', () => {
  const states = [], confirmed = [];
  const { ctx, host, source } = hostPage({
    prefix: 'p', syncOnStart: true, initialState: { a: 1 },
    onState: (s, r) => states.push([plain(s), r === null]),
    onConfirmed: (s) => confirmed.push(plain(s))
  });
  assert.equal(host.settings(), null, 'there is no initial state option; nothing is known before the first read');
  assert.equal(ctx.requests.length, 1, 'syncOnStart reads at registration');
  viewRequest(ctx, 'get');
  assert.equal(ctx.requests.length, 1, 'a view joins the read that is already running');
  assert.equal(lastResponse(source), undefined, 'the view gets no state before the service answered');

  take(ctx, 'get').cb('Module service is starting or unavailable. Please retry.');
  assert.deepEqual(ctx.logs, [], 'the expected boot failure is not logged');
  assert.equal(lastResponse(source).state, null, 'the view gets the error without any state');
  ctx.current = null;
  ctx.handlers.ready();
  assert.equal(ctx.requests.length, 1, 'with syncOnStart the host reads when the service is ready, also with no view open');
  take(ctx, 'get').cb(null, { settings: { a: 2 } });
  assert.deepEqual(confirmed, [{ a: 2 }], 'onConfirmed gets the service values');
  assert.deepEqual(states, [[{ a: 2 }, false]]);
  ctx.handlers.ready();
  take(ctx, 'get').cb('Disk error');
  assert.deepEqual(ctx.logs, ['Settings read failed: Disk error'], 'a later failed read with no view open is logged');
});

test('host onConfirmed sees only saved values and a failed save restores them', () => {
  const states = [], confirmed = [];
  const { ctx, host, source } = hostPage({
    prefix: 'p',
    onState: (s) => states.push(plain(s)),
    onConfirmed: (s) => confirmed.push(plain(s))
  });
  viewRequest(ctx, 'get');
  take(ctx, 'get').cb(null, { settings: { a: 1, b: 1 } });
  confirmed.length = 0; states.length = 0;

  viewRequest(ctx, 'set', { key: 'a', value: 2 });
  viewRequest(ctx, 'set', { key: 'b', value: 2 });
  assert.deepEqual(states, [{ a: 2, b: 1 }, { a: 2, b: 2 }], 'onState follows local changes at once');
  assert.deepEqual(confirmed, [], 'onConfirmed waits for the service');
  take(ctx, 'set').cb(null, { settings: { a: 2, b: 1 } });
  assert.deepEqual(confirmed, [{ a: 2, b: 1 }], 'a saved value is confirmed, the queued one is not');
  assert.deepEqual(plain(host.settings()), { a: 2, b: 2 }, 'the view state keeps the queued value');

  take(ctx, 'set').cb('Disk full');
  assert.deepEqual(plain(host.settings()), { a: 2, b: 1 }, 'a failed save goes back to the confirmed values at once');
  assert.deepEqual(states[states.length - 1], { a: 2, b: 1 }, 'and tells onState');
  assert.deepEqual(confirmed, [{ a: 2, b: 1 }], 'nothing new is confirmed');
  take(ctx, 'get').cb('Module service timed out. Please retry.');
  assert.deepEqual(plain(host.settings()), { a: 2, b: 1 }, 'also when the follow-up read fails');
  assert.deepEqual(lastResponse(source).state, { a: 2, b: 1 });
  assert(ctx.logs.indexOf('Settings save failed: Disk full') >= 0, 'the failed save is logged');
});

test('host onRequest handles custom requests and hook failures never break it', () => {
  const calls = [];
  const { ctx, host } = hostPage({
    prefix: 'p',
    onRequest: (action, payload, api) => { calls.push([action, plain(payload), api === host]); throw new Error('ignored'); },
    onState: () => { throw new Error('ignored'); }
  });
  viewRequest(ctx, 'custom', { x: 1 });
  assert.deepEqual(calls, [['custom', { x: 1 }, true]]);
  assert.deepEqual(ctx.logs, ['onRequest failed: Error: ignored'], 'a failing request hook is logged');
  viewRequest(ctx, 'set', { key: 'a', value: 1 });
  take(ctx, 'set').cb(null, { settings: { a: 1 } });
  assert.equal(host.saving(), false, 'a throwing onState still finishes the save');
  assert(ctx.logs.length > 1 && ctx.logs.slice(1).every(line => line === 'onState failed: Error: ignored'), 'and so is a failing state hook');
});

test('host follows the lifecycle of the resident', () => {
  const hooks = [];
  const { ctx, host } = hostPage({ prefix: 'p', onDispose: () => hooks.push('dispose') });
  ctx.current = null;
  ctx.handlers.ready();
  assert.equal(ctx.requests.length, 0, 'a reconnecting service is not read without a view');
  ctx.current = { source: {}, token: 'tok' };
  ctx.handlers.ready();
  assert.deepEqual(ctx.requests.map(r => r.op), ['get']);

  ctx.menuCalls.length = 0;
  ctx.handlers.dispose();
  assert.deepEqual(ctx.menuCalls, [['close', true]]);
  assert.deepEqual(hooks, ['dispose']);
  host.save('a', 1);
  assert.deepEqual(ctx.requests.map(r => r.op), ['get'], 'a disposed host starts no save');
});

test('a resident without the shared settings code stops with a clear error', () => {
  const tweaks = path.join(root, 'usb/tweaks');
  const checked = [];
  for (const id of fs.readdirSync(tweaks)) {
    const file = path.join(tweaks, id, 'assets/resident.js');
    if (!fs.existsSync(file) || !/MzdSettingsHost/.test(fs.readFileSync(file, 'utf8'))) { continue; }
    const win = {};
    let factory = null, menus = 0;
    win.MzdGuiResidents = { register(name, fn) { factory = fn; return true; } };
    const head = { appendChild() {} };
    const document = { head: head, documentElement: head, createElement: () => ({}), getElementsByTagName: () => [] };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: win, document: document });
    assert.equal(typeof factory, 'function', id + ' registers its resident');
    const ctx = { createNativeMenu() { menus += 1; return {}; }, onMessage() {}, onViewClose() {}, onDispose() {}, onServiceRequest() {} };
    assert.throws(() => factory(ctx), /Shared settings code is unavailable\./, id);
    assert.equal(menus, 0, id + ' creates nothing without the shared code');
    checked.push(id);
  }
  assert.deepEqual(checked.sort(), ['android-auto', 'mzd-tweaks', 'wallpaper-manager']);
});

test('a view tells the driver when the shared settings code is missing', () => {
  for (const id of ['android-auto', 'mzd-tweaks']) {
    const source = fs.readFileSync(path.join(root, 'usb/tweaks', id, 'assets/view.js'), 'utf8');
    function run(withSdk) {
      const status = { style: {}, textContent: '', dir: '' }, posts = [];
      let ready = 0;
      const win = { parent: { postMessage(m) { posts.push(m); } }, addEventListener() {}, removeEventListener() {} };
      if (withSdk) {
        win.MzdGuiModule = { token: 'tok', t: (key, fallback) => 'x-' + key, onInput() {}, onDispose() {}, ready() { ready += 1; }, loadLanguage() {} };
      }
      vm.runInNewContext(source, { window: win, document: { getElementById: () => status } });
      return { status, posts, ready };
    }
    const noView = run(true);
    assert.equal(noView.status.textContent, 'x-menuError', id + ': the existing translated text is used');
    assert.equal(noView.ready, 1, id + ': ready is called so the text stays visible');
    assert.deepEqual(noView.posts, [], id);
    const noSdk = run(false);
    assert.equal(noSdk.status.textContent, 'Open through Applications.', id + ': outside Applications nothing else applies');
    assert.deepEqual(noSdk.posts, [], id);
  }
});

// --- View side -------------------------------------------------------------

function viewPage(options, sdkExtra) {
  const win = { listeners: {}, posts: [] };
  win.parent = { postMessage(message, target) { assert.equal(target, '*', 'file-origin messages need the wildcard target'); win.posts.push(message); } };
  win.addEventListener = (name, fn) => { win.listeners[name] = fn; };
  win.removeEventListener = (name, fn) => { if (win.listeners[name] === fn) { delete win.listeners[name]; } };
  const document = { documentElement: { lang: '' }, getElementById: () => null };
  loadView(win, document);
  const sdk = {
    token: 'tok',
    t: (key, fallback) => (fallback != null ? fallback : key),
    readyCalls: 0,
    onInput(fn) { this.input = fn; },
    onDispose(fn) { this.dispose = fn; },
    ready() { this.readyCalls += 1; },
    loadLanguage(fn) { this.language = fn; }
  };
  Object.assign(sdk, sdkExtra);
  const status = { style: {}, textContent: '', dir: '' };
  const api = win.MzdSettingsView.create(sdk, Object.assign({ prefix: 'p', statusElement: status }, options));
  const page = { win, sdk, status, api, document };
  page.send = data => win.listeners.message({ source: win.parent, data: Object.assign({ token: 'tok' }, data) });
  page.respond = data => page.send(Object.assign({ type: 'p-response', saving: false, pending: [], limits: {}, unavailable: {} }, data));
  page.renders = () => win.posts.filter(m => m.type === 'p-native-render');
  page.menu = () => { const all = page.renders(); return plain(all[all.length - 1].menu); };
  page.row = index => page.menu().rows[index];
  page.select = (index, params) => page.send({ type: 'p-native-select', index: index, params: params });
  page.requests = action => win.posts.filter(m => m.type === 'p-request' && (!action || m.action === action)).map(plain);
  page.dialogs = () => win.posts.filter(m => m.type === 'p-native-dialog').map(plain);
  return page;
}

test('view asks for the settings, sends localized notice texts and shows loading status', () => {
  const page = viewPage(
    { entries: [], texts: { extraNote: 'Fallback' } },
    { t: (key, fallback) => 'x-' + key }
  );
  assert.equal(page.sdk.readyCalls, 1);
  assert.equal(typeof page.sdk.input, 'function');
  assert.equal(typeof page.sdk.dispose, 'function');
  assert.deepEqual(page.requests().map(r => r.action), ['get'], 'the first message asks for the settings');
  assert.equal(page.requests('get')[0].token, 'tok');

  page.sdk.language('en_US', 'ltr');
  assert.equal(page.document.documentElement.lang, 'en-US');
  assert.equal(page.status.dir, 'ltr');
  assert.equal(page.status.textContent, 'x-loading');
  assert.equal(page.renders().length, 0, 'nothing is drawn before the settings arrive');
  assert.deepEqual(page.requests('texts')[0].payload, {
    saveError: 'x-saveError', reboot: 'x-reboot', rebootFallback: 'x-rebootFallback', extraNote: 'x-extraNote'
  }, 'the resident keeps its own localized copy for notices after the view closes');

  page.respond({ state: {} });
  page.sdk.language('en_US', 'ltr');
  assert.equal(page.renders().length, 2, 'a language change redraws an open list');
});

test('view draws the declared entries with the title of the page', () => {
  const seen = [];
  const page = viewPage({
    title: (tr, state) => 'Title ' + state.n,
    entries: (state, tr, api) => { seen.push(typeof api.save); return [{ key: 'on', type: 'bool', label: 'On' }]; }
  });
  page.respond({ state: { n: 3, on: true } });
  const menu = page.menu();
  assert.equal(menu.page, 'home');
  assert.equal(menu.title, 'Title 3');
  assert.equal(menu.index, 0);
  assert(seen.length > 0 && seen.every(type => type === 'function'), 'entries() receives the view api');
  assert.deepEqual(menu.rows[0], { id: 'on', key: 'on', type: 'bool', label: 'On', itemStyle: 'styleOnOff', checked: true, spinner: false, disabled: false });

  const fixed = viewPage({ entries: [{ key: 'k', type: 'bool' }] });
  fixed.respond({ state: {} });
  assert.equal(fixed.menu().title, 'Settings', 'a missing title falls back to the shared one');
  assert.equal(fixed.row(0).label, 'k', 'a missing label shows the key');
});

test('bool rows honour defaultValue and save the opposite value', () => {
  const page = viewPage({ entries: [{ key: 'beep', type: 'bool', label: 'Beep', defaultValue: true }, { key: 'loop', type: 'bool', label: 'Loop' }] });
  page.respond({ state: {} });
  assert.equal(page.row(0).checked, true, 'the default applies while the setting is absent');
  assert.equal(page.row(1).checked, false);
  page.select(0);
  assert.deepEqual(page.requests('set').map(r => r.payload), [{ key: 'beep', value: false }]);
  assert.equal(page.row(0).checked, false, 'the list shows the new value before the service answers');
  page.respond({ state: { beep: false }, saving: false });
  page.select(0);
  assert.deepEqual(page.requests('set').pop().payload, { key: 'beep', value: true });
});

test('every row can show a spinner and be disabled while it saves, configured by properties', () => {
  const page = viewPage({
    entries: () => [
      { key: 'on', type: 'bool', label: 'On' },
      { key: 'spin', type: 'bool', label: 'Spin', savingSpinner: true, savingDisabled: true },
      { key: 'busy', type: 'bool', label: 'Busy', busyDisabled: true },
      { key: 'gone', type: 'bool', label: 'Gone' },
      { key: 'lock', type: 'bool', label: 'Lock', disabled: state => state.lock === true },
      { key: 'also', type: 'bool', label: 'Also', disabled: true }
    ]
  });
  page.respond({ state: { lock: false }, unavailable: { gone: 'Missing file' } });
  assert.deepEqual(page.menu().rows.map(r => r.disabled), [false, false, false, true, false, true],
    'unavailable keys and disabled properties switch a row off');
  assert(page.menu().rows.every(r => r.spinner === false));

  page.select(1);
  assert.equal(page.requests('set').length, 1);
  assert.equal(page.row(1).spinner, true, 'the saving row shows the spinner in front');
  assert.equal(page.row(1).disabled, true, 'and cannot be used again');
  assert.equal(page.row(2).disabled, true, 'busyDisabled rows wait for any save');
  assert.equal(page.row(0).disabled, false, 'other rows stay usable');
  assert.equal(page.row(0).spinner, false);

  page.select(1);
  page.select(2);
  assert.equal(page.requests('set').length, 1, 'disabled rows ignore the knob');
  page.select(3);
  page.select(5);
  assert.equal(page.requests('set').length, 1, 'unavailable and disabled rows ignore the knob');

  page.select(0);
  assert.equal(page.row(0).spinner, false, 'a row without savingSpinner never shows one');
  assert.equal(page.requests('set').length, 2);

  page.respond({ state: { lock: false }, saving: true, pending: ['spin', 'on'] });
  assert.equal(page.row(1).spinner, true, 'the resident keeps the spinner on while its queue holds the key');
  page.respond({ state: { lock: true }, saving: false, pending: [] });
  assert.deepEqual(page.menu().rows.slice(0, 3).map(r => [r.spinner, r.disabled]), [[false, false], [false, false], [false, false]]);
  assert.equal(page.row(4).disabled, true, 'a disabled function sees the current state');
  page.select(4);
  assert.equal(page.requests('set').length, 2);
});

test('rowDefaults configure all rows and a row can override them', () => {
  const page = viewPage({
    rowDefaults: { savingSpinner: true, savingDisabled: true, busyDisabled: true },
    entries: () => [
      { key: 'a', type: 'bool', label: 'A' },
      { key: 'b', type: 'bool', label: 'B', savingSpinner: false, savingDisabled: false, busyDisabled: false }
    ]
  });
  page.respond({ state: {} });
  page.select(0);
  assert.deepEqual([page.row(0).spinner, page.row(0).disabled], [true, true]);
  assert.deepEqual([page.row(1).spinner, page.row(1).disabled], [false, false], 'false on the row wins over the default');
  page.select(1);
  assert.deepEqual([page.row(1).spinner, page.row(1).disabled], [false, false]);
});

test('the shared row properties work for every type, including custom and action rows', () => {
  const calls = [];
  const page = viewPage({
    types: {
      custom: {
        row: () => ({ detail: 'extra', caret: true }),
        activate: (def, row, params, api) => { calls.push('activate'); api.save(def.key, 'v'); }
      }
    },
    entries: () => [
      { key: 'c', type: 'custom', label: 'Custom', savingSpinner: true, savingDisabled: true, image1: 'own.png' },
      { type: 'action', action: 'go', id: 'go', label: 'Go', disabled: true, image1: 'go.png' },
      { key: 'lvl', type: 'step', label: 'Level', min: 1, max: 9, savingSpinner: true }
    ]
  });
  page.respond({ state: { lvl: 2 } });
  assert.deepEqual([page.row(0).detail, page.row(0).caret, page.row(0).image1], ['extra', true, 'own.png']);
  assert.deepEqual([page.row(1).disabled, page.row(1).image1, page.row(1).action], [true, 'go.png', 'go']);
  page.select(1);
  assert.equal(page.requests('go').length, 0, 'a disabled action row does nothing');

  page.select(0);
  assert.deepEqual(calls, ['activate']);
  assert.deepEqual([page.row(0).spinner, page.row(0).disabled], [true, true], 'a custom row gets the saving feedback too');
  assert.deepEqual([page.row(2).spinner, page.row(2).disabled], [false, false], 'a step row waits for its own key only');

  page.respond({ state: { lvl: 2, c: 'v' }, saving: false });
  page.select(2, { value: 4, final: true });
  assert.deepEqual([page.row(2).spinner, page.row(2).value], [true, 4], 'a step row shows the spinner while it saves');
});

test('step rows take their range from the service limits and save valid values only', () => {
  const page = viewPage({ entries: () => [{ key: 'lvl', type: 'step', label: 'Level', defaultValue: 4, min: 1, max: 3, increment: 1 }] });
  page.respond({ state: {}, limits: {} });
  assert.deepEqual(page.row(0), {
    id: 'lvl', key: 'lvl', type: 'step', label: 'Level', itemStyle: 'styleStep',
    value: 4, min: 1, max: 3, increment: 1, spinner: false, disabled: false
  }, 'the default value shows while the setting is absent');

  page.respond({ state: { lvl: 5 }, limits: { lvl: { min: 3, max: 9, step: 2 } } });
  assert.deepEqual([page.row(0).value, page.row(0).min, page.row(0).max, page.row(0).increment], [5, 3, 9, 2],
    'the limits of the service decide the range');

  page.select(0, { value: 12, final: true });
  page.select(0, { value: 2, final: true });
  page.select(0, { value: 5, final: true });
  page.select(0, {});
  assert.equal(page.requests('set').length, 0, 'out of range, unchanged and missing values are not saved');
  page.select(0, { value: 7, final: true });
  assert.deepEqual(page.requests('set').map(r => r.payload), [{ key: 'lvl', value: 7 }]);
  assert.equal(page.row(0).value, 7);
});

test('action rows send their request, optionally after a Yes/No confirmation', () => {
  const page = viewPage({
    entries: () => [
      { type: 'action', action: 'ping', id: 'ping', label: 'Ping' },
      { type: 'action', action: 'wipe', id: 'wipe', label: 'Wipe', confirm: { text: 'Really?' } },
      { action: 'bare', id: 'bare', label: 'Bare' }
    ]
  });
  page.respond({ state: {} });
  page.select(0);
  page.select(2);
  assert.deepEqual(page.requests().map(r => r.action), ['get', 'ping', 'bare'], 'a row with only an action behaves as an action row');

  const renders = page.renders().length;
  page.select(1);
  assert.deepEqual(page.dialogs(), [{
    type: 'p-native-dialog', token: 'tok',
    dialog: { text: 'Really?', buttons: [{ value: 'no', labelId: 'common.No' }, { value: 'yes', labelId: 'common.Yes' }] }
  }], 'No comes first, so it is the default');
  page.select(0);
  assert.equal(page.requests('ping').length, 1, 'rows are locked while the dialog is open');
  assert.equal(page.renders().length, renders, 'the dialog covers the list');

  page.send({ type: 'p-native-dialog-select', value: 'no' });
  assert.equal(page.dialogs()[1].dialog, null, 'answering closes the dialog');
  assert.equal(page.renders().length, renders + 1, 'and draws the list again');
  assert.equal(page.requests('wipe').length, 0);
  page.send({ type: 'p-native-dialog-select', value: 'yes' });
  assert.equal(page.dialogs().length, 2, 'an answer without a dialog is ignored');

  page.select(1);
  page.send({ type: 'p-native-dialog-select', value: 'yes' });
  assert.equal(page.requests('wipe').length, 1);
});

test('the reboot row waits for a needed reboot and an idle service, then confirms', () => {
  const page = viewPage({ entries: () => [{ type: 'reboot', id: 'reboot', label: 'Reboot', question: 'Reboot now?', fallback: 'Hold both buttons' }] });
  page.respond({ state: {}, rebootRequired: false });
  assert.equal(page.row(0).image1, 'common/images/icons/IcnListSynchronize_En.png');
  assert.equal(page.row(0).disabled, true, 'nothing to apply');
  page.select(0);
  assert.equal(page.dialogs().length, 0);

  page.respond({ state: {}, rebootRequired: true, saving: true, pending: ['a'] });
  assert.equal(page.row(0).disabled, true, 'a save may still be lost');
  page.respond({ state: {}, rebootRequired: true });
  assert.equal(page.row(0).disabled, false);

  page.select(0);
  assert.equal(page.dialogs()[0].dialog.text, 'Reboot now?');
  assert.equal(page.dialogs()[0].dialog.buttons[0].value, 'no', 'No is the default');
  page.send({ type: 'p-native-dialog-select', value: 'no' });
  assert.equal(page.requests('reboot').length, 0);
  page.select(0);
  page.send({ type: 'p-native-dialog-select', value: 'yes' });
  assert.equal(page.requests('reboot').length, 1);

  page.select(0);
  page.send({ type: 'p-native-error', scope: 'dialog' });
  assert.equal(page.menu().title, 'Hold both buttons', 'a dialog that cannot open shows the manual way');
  page.select(0);
  assert.equal(page.dialogs().length, 6, 'the list works after a failed dialog');
  page.send({ type: 'p-native-dialog-select', value: 'no' });
  assert.notEqual(page.menu().title, 'Hold both buttons', 'the notice clears on the next use');

  const plainPage = viewPage({ entries: () => [{ type: 'reboot', id: 'reboot' }] });
  plainPage.respond({ state: {}, rebootRequired: true });
  plainPage.select(0);
  assert.equal(plainPage.dialogs()[0].dialog.text, 'Do you want to reboot MZD to apply settings?', 'a default question exists');
});

test('Back leaves a sub-page first, and only then lets the SDK close the view', () => {
  const sub = {
    id: 'sub', title: 'Pick one', index: 1,
    entries: api => [
      { id: 'zero', label: 'Zero', select: inner => { inner.back(true); inner.save('level', 0); } },
      { id: 'one', label: 'One', checkable: true, checked: true, select: inner => { inner.back(true); inner.render(); } }
    ]
  };
  const page = viewPage({
    title: () => 'Home',
    types: { sub: { row: () => ({ detail: 'x', caret: true }), activate: (def, row, params, api) => api.openPage(sub) } },
    entries: () => [{ key: 'x', type: 'bool', label: 'X' }, { key: 'level', type: 'sub', label: 'Level' }]
  });
  page.respond({ state: { level: 2 } });
  page.select(1);
  assert.deepEqual([page.menu().page, page.menu().title, page.menu().index], ['sub', 'Pick one', 1], 'a sub-page has its own title and focus');
  assert.deepEqual(page.menu().rows.map(r => r.label), ['Zero', 'One']);
  assert.deepEqual([page.row(1).checkable, page.row(1).checked], [true, true]);

  assert.equal(page.sdk.input('back', 'press'), true, 'the press is consumed without acting');
  assert.equal(page.menu().page, 'sub');
  assert.equal(page.sdk.input('back', 'step'), true);
  assert.deepEqual([page.menu().page, page.menu().title, page.menu().index], ['home', 'Home', 1], 'Back returns to the list and its focus');
  assert.equal(page.sdk.input('back', 'step'), false, 'at the top Back belongs to the SDK');

  page.select(1);
  const renders = page.renders().length;
  page.select(0);
  assert.equal(page.renders().length, renders + 1, 'a silent back plus save draws only once');
  assert.equal(page.menu().page, 'home');
  assert.deepEqual(page.requests('set').map(r => r.payload), [{ key: 'level', value: 0 }]);

  page.respond({ state: { level: 0 } });
  page.select(1);
  page.select(1);
  assert.equal(page.menu().page, 'home', 'a sub-page can leave and just redraw');
  assert.equal(page.requests('set').length, 1);
});

test('Back closes an open dialog first and other keys go to the native list', () => {
  const page = viewPage({ entries: () => [{ type: 'reboot', id: 'reboot' }] });
  assert.equal(page.sdk.input('down', 'step'), true);
  assert.equal(page.win.posts.filter(m => m.type === 'p-native-input').length, 0, 'keys are not forwarded before the list exists');
  page.respond({ state: {}, rebootRequired: true });
  page.sdk.input('rotateRight', 'step');
  assert.deepEqual(plain(page.win.posts.filter(m => m.type === 'p-native-input').pop()), { type: 'p-native-input', token: 'tok', action: 'rotateRight', phase: 'step' });

  page.select(0);
  assert.equal(page.sdk.input('back', 'step'), true);
  assert.equal(page.dialogs().pop().dialog, null, 'Back dismisses the dialog');
  assert.equal(page.sdk.input('back', 'step'), false);
});

test('custom row types hook into activation, focus, flushing and responses', () => {
  const log = [];
  const page = viewPage({
    types: {
      lazy: {
        row: () => ({ detail: 'lazy' }),
        activate: (def, row, params, api) => log.push(['activate', def.key, params && params.value, typeof api.save]),
        focus: (def, info) => log.push(['focus', def.key, info.index, info.previous, info.secondary]),
        flush: def => log.push(['flush', def.key]),
        response: (def, data) => log.push(['response', def.key, !!data.error])
      }
    },
    entries: () => [{ key: 'l', type: 'lazy', label: 'L' }, { key: 'b', type: 'bool', label: 'B' }]
  });
  page.respond({ state: {} });
  assert.deepEqual(log.splice(0), [['response', 'l', false]]);
  page.respond({ state: {}, error: 'Service offline' });
  assert.deepEqual(log.splice(0), [['response', 'l', true]], 'errors reach the hook as well');

  page.select(0, { value: 3 });
  assert.deepEqual(log.splice(0), [['activate', 'l', 3, 'function']], 'a row is not flushed by its own activation');
  page.select(1);
  assert.deepEqual(log.splice(0), [['flush', 'l']], 'another row first commits deferred changes');

  page.select(0);
  log.length = 0;
  page.send({ type: 'p-native-focus', index: 1, secondary: true });
  assert.deepEqual(log.splice(0), [['focus', 'l', 1, 0, true]], 'focus tells the row it lost, not the row it gained');
  page.send({ type: 'p-native-focus', index: -1 });
  page.send({ type: 'p-native-focus' });
  assert.deepEqual(log, [], 'invalid focus is ignored');

  page.sdk.input('back', 'step');
  assert.deepEqual(log.splice(0), [['flush', 'l']], 'Back flushes');
  page.sdk.dispose();
  assert.deepEqual(log.splice(0), [['flush', 'l']], 'closing the view flushes before it is released');
});

test('a row can replace the activation of its type', () => {
  const seen = [];
  const page = viewPage({
    entries: () => [{ key: 'o', type: 'bool', label: 'O', select: (api, row, params) => seen.push([row.id, row.checked, params, typeof api.state]) }]
  });
  page.respond({ state: { o: true } });
  page.select(0, { x: 1 });
  assert.deepEqual(seen, [['o', true, { x: 1 }, 'function']]);
  assert.equal(page.requests('set').length, 0, 'the bool toggle did not run');
});

test('view shows service and menu errors in the status line', () => {
  const page = viewPage({ entries: () => [{ key: 'k', type: 'bool', label: 'K' }] });
  page.respond({ error: 'Service offline' });
  assert.equal(page.status.textContent, 'Service unavailable. Please retry.');
  assert.equal(page.status.style.display, 'block');
  page.respond({ state: { k: true } });
  assert.equal(page.status.textContent, '');
  assert.equal(page.status.style.display, 'none');
  page.respond({ state: { k: true }, error: 'Disk full' });
  assert.equal(page.status.style.display, 'none', 'with a list on screen the error is shown by the resident');
  page.send({ type: 'p-native-error', scope: 'menu' });
  assert.equal(page.status.textContent, 'The Mazda menu could not be opened. Please reopen the app.');
  assert.equal(page.status.style.display, 'block');
});

test('view ignores other windows and tokens and stops after dispose', () => {
  const page = viewPage({ entries: () => [{ key: 'k', type: 'bool', label: 'K' }] });
  const listener = page.win.listeners.message;
  listener({ source: {}, data: { type: 'p-response', token: 'tok', state: { k: true } } });
  listener({ source: page.win.parent, data: { type: 'p-response', token: 'old', state: { k: true } } });
  assert.equal(page.renders().length, 0);
  page.respond({ state: { k: true } });
  assert.equal(page.renders().length, 1);

  const posts = page.win.posts.length;
  page.sdk.dispose();
  page.sdk.dispose();
  const released = page.win.posts.slice(posts).map(m => m.type);
  assert.deepEqual(released, ['p-native-release'], 'the native list is released once');
  assert.equal(page.win.listeners.message, undefined, 'the listener is removed');
  listener({ source: page.win.parent, data: { type: 'p-response', token: 'tok', state: { k: false } } });
  page.api.save('k', false);
  assert.equal(page.sdk.input('down', 'step'), false);
  assert.equal(page.win.posts.length, posts + 1, 'nothing is sent after dispose');
});

test('view helpers expose the built-in types and the step helpers', () => {
  const win = loadView({});
  const View = win.MzdSettingsView;
  assert.deepEqual(Object.keys(View.types).sort(), ['action', 'bool', 'reboot', 'step']);
  assert.equal(View.stepValue({ min: 1, max: 5 }, { value: 3 }), 3);
  assert.equal(View.stepValue({ min: 1, max: 5 }, 4), 4, 'a plain number is a value too');
  assert.equal(View.stepValue({ min: 1, max: 5 }, { value: 6 }), null);
  assert.equal(View.stepValue({ min: 1, max: 5 }, { value: 0 }), null);
  assert.equal(View.stepValue({ min: 1, max: 5 }, null), null);
  assert.equal(View.stepValue({ min: 1, max: 5 }, { value: '3' }), null);
  assert.equal(View.isFinalAdjustment({ final: true }), true);
  assert.equal(View.isFinalAdjustment({ finalAdjust: true }), true);
  assert.equal(View.isFinalAdjustment({ finalAdjustment: true }), true);
  assert.equal(View.isFinalAdjustment({ value: 3 }), false);
  assert.equal(View.isFinalAdjustment(undefined), false);
  assert.equal(win.MzdSettingsHost, undefined, 'the view half carries no host code');
});

test('the host half exposes create and handleNativeMessage and carries no view code', () => {
  const win = loadHost({});
  assert.equal(typeof win.MzdSettingsHost.create, 'function');
  assert.equal(typeof win.MzdSettingsHost.handleNativeMessage, 'function');
  assert.equal(win.MzdSettingsView, undefined);
});
