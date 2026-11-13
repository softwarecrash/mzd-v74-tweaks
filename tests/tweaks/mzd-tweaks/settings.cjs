/*
 * MZD Tweaks resident and view on the shared settings code (usb/lib/gui-runtime/settings-host.js and settings-view.js).
 * The resident keeps window.mzdTweaks, read by the patched OEM code, in step with the saved
 * settings: it changes only after the service confirmed a read or a save. The view only
 * declares four On/Off rows. Fake contexts, no CMU.
 * Run: node tests/tweaks/mzd-tweaks/settings.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '../../..');
const settingsHostSource = fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/settings-host.js'), 'utf8');
const settingsViewSource = fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/settings-view.js'), 'utf8');
const residentSource = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/resident.js'), 'utf8');
const viewSource = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/view.js'), 'utf8');
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const DEFAULTS = { main_menu_loop: false, list_loop: false, list_beep: true, short_delay: false };

// --- Resident ---------------------------------------------------------------

function residentPage(boot) {
  const win = { setInterval: () => 1, clearInterval() {} };
  const scripts = [];
  if (boot) { win.mzdTweaks = boot; }
  const head = { appendChild(script) { scripts.push(script); } };
  const document = { head: head, documentElement: head, createElement: () => ({}) };
  vm.runInNewContext(settingsHostSource, { window: win });
  const registered = [], logs = [];
  win.MzdGuiResidents = { register(id, factory) { registered.push(id); win.factory = factory; }, log(id, message) { logs.push([id, message]); } };
  vm.runInNewContext(residentSource, { window: win, document: document });

  const source = { messages: [], postMessage(message) { this.messages.push(plain(message)); } };
  const ctx = { requests: [], notes: [], options: null, handlers: {}, current: { source: source, token: 'tok', frame: {} } };
  ctx.view = () => ctx.current;
  ctx.onMessage = fn => { ctx.handlers.message = fn; };
  ctx.onViewClose = () => {};
  ctx.onDispose = () => {};
  ctx.logs = [];
  ctx.log = message => ctx.logs.push(message);
  ctx.onServiceReady = fn => { ctx.handlers.ready = fn; };
  ctx.notify = (text, isError) => ctx.notes.push([text, isError]);
  ctx.createNativeMenu = options => { ctx.options = options; return { close() {}, check() {}, owns: () => false }; };
  ctx.service = { request(op, args, cb) { ctx.requests.push({ op: op, args: plain(args), cb: cb }); } };
  win.factory(ctx);
  return { win, ctx, source, scripts, registered, logs };
}

function request(ctx, action, payload) {
  ctx.handlers.message({ source: ctx.current.source, data: { type: 'mzd-tweaks-request', token: 'tok', action: action, payload: payload } });
}

function complete(ctx, op, error, result) {
  const index = ctx.requests.findIndex(r => r.op === op);
  assert(index >= 0, op + ' request is waiting');
  ctx.requests.splice(index, 1)[0].cb(error, result);
}

function lastResponse(source) {
  const all = source.messages.filter(m => m.type === 'mzd-tweaks-response');
  return all[all.length - 1];
}

{
  const page = residentPage();
  assert.deepEqual(page.registered, ['mzd-tweaks']);
  assert.deepEqual(plain(page.win.mzdTweaks), DEFAULTS, 'the patched OEM code finds its defaults before anything is read');
  assert.equal(page.scripts.length, 1);
  assert.equal(page.scripts[0].src, '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js', 'the boot script is still requested');
  const prevented = [];
  assert.equal(page.scripts[0].onerror({ preventDefault() { prevented.push(true); } }), true);
  assert.deepEqual(prevented, [true], 'a missing boot script does not raise a page error');
  assert.equal(page.logs.length, 1, 'a missing boot script is logged');
  assert.equal(page.logs[0][0], 'mzd-tweaks');

  assert.equal(page.ctx.options.prefix, 'mzd-tweaks');
  assert.equal(page.ctx.options.dialog, false, 'no dialogs are needed');
  assert.deepEqual(page.ctx.requests.map(r => r.op), ['get'], 'the saved settings are read at startup, before any view opens');

  // A view that opens while the first read runs gets no unconfirmed values.
  request(page.ctx, 'get');
  assert.equal(page.ctx.requests.length, 1, 'it joins the read that is running');
  assert.equal(lastResponse(page.source), undefined, 'the inline defaults are never shown as saved values');

  complete(page.ctx, 'get', null, { settings: { main_menu_loop: true, list_loop: true, list_beep: false, short_delay: true } });
  assert.deepEqual(plain(page.win.mzdTweaks), { main_menu_loop: true, list_loop: true, list_beep: false, short_delay: true },
    'the saved settings reach the globals');
  assert.deepEqual(lastResponse(page.source).state, { main_menu_loop: true, list_loop: true, list_beep: false, short_delay: true });
}

{
  const page = residentPage({ main_menu_loop: false, list_loop: true, list_beep: true, short_delay: false });
  assert.equal(lastResponse(page.source), undefined, 'boot values are not shown before the service confirmed them');
  assert.deepEqual(plain(page.win.mzdTweaks), { main_menu_loop: false, list_loop: true, list_beep: true, short_delay: false },
    'existing globals are kept');
}

{
  // At boot the service is usually still starting: the first read fails at once.
  const page = residentPage({ main_menu_loop: true, list_loop: false, list_beep: true, short_delay: false });
  complete(page.ctx, 'get', 'Module service is starting or unavailable. Please retry.');
  assert.deepEqual(page.ctx.logs, [], 'the expected boot failure is not logged');
  assert.equal(page.win.mzdTweaks.main_menu_loop, true, 'a failed read keeps the boot values');
  page.ctx.current = null;
  page.ctx.handlers.ready();
  assert.deepEqual(page.ctx.requests.map(r => r.op), ['get'], 'the settings are read when the service is ready, with no view open');
  complete(page.ctx, 'get', null, { settings: Object.assign({}, DEFAULTS, { list_loop: true }) });
  assert.deepEqual(plain(page.win.mzdTweaks), Object.assign({}, DEFAULTS, { list_loop: true }), 'the service values reach the globals');
  page.ctx.handlers.ready();
  complete(page.ctx, 'get', 'Disk error');
  assert.deepEqual(page.ctx.logs, ['Settings read failed: Disk error'], 'a later failed read with no view open is logged');
}

{
  const page = residentPage();
  complete(page.ctx, 'get', null, { settings: Object.assign({}, DEFAULTS) });
  request(page.ctx, 'set', { key: 'short_delay', value: true });
  assert.equal(page.win.mzdTweaks.short_delay, false, 'the globals wait until the service has saved the change');
  assert.equal(page.ctx.requests.length, 1);
  assert.deepEqual(page.ctx.requests[0].args, { key: 'short_delay', value: true });

  // A second change while saving waits for its own confirmation.
  request(page.ctx, 'set', { key: 'list_loop', value: true });
  assert.equal(page.win.mzdTweaks.list_loop, false);
  complete(page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { short_delay: true }) });
  assert.equal(page.win.mzdTweaks.short_delay, true, 'a confirmed save reaches the globals');
  assert.equal(page.win.mzdTweaks.list_loop, false, 'a queued value is not applied before it is saved');
  complete(page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { short_delay: true, list_loop: true }) });
  assert.equal(page.win.mzdTweaks.list_loop, true);
  assert.equal(lastResponse(page.source).saving, false);
}

{
  const page = residentPage();
  complete(page.ctx, 'get', null, { settings: Object.assign({}, DEFAULTS) });
  request(page.ctx, 'set', { key: 'main_menu_loop', value: true });
  assert.equal(page.win.mzdTweaks.main_menu_loop, false);
  complete(page.ctx, 'set', 'Disk full');
  assert.equal(page.win.mzdTweaks.main_menu_loop, false, 'a failed save never reaches the globals');
  assert.equal(lastResponse(page.source).state.main_menu_loop, false, 'the view goes back to the saved value at once');
  complete(page.ctx, 'get', 'Module service timed out. Please retry.');
  assert.equal(page.win.mzdTweaks.main_menu_loop, false, 'also when the follow-up read fails');
  assert.equal(lastResponse(page.source).state.main_menu_loop, false);
  assert.deepEqual(page.ctx.notes, [['Failed to save settings', true]]);
  assert.deepEqual(page.ctx.logs, ['Settings save failed: Disk full']);
}

// --- View -------------------------------------------------------------------

function viewPage(options) {
  options = options || {};
  const posts = [], listeners = {};
  let readyCalls = 0;
  const status = { style: {}, textContent: 'Opening MZD Tweaks...', dir: '' };
  const win = {
    parent: { postMessage(message) { posts.push(plain(message)); } },
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener() {}
  };
  vm.runInNewContext(settingsViewSource, { window: win });
  if (!options.noSdk) {
    win.MzdGuiModule = { token: 'tok', t: (key, fallback) => fallback, onInput() {}, onDispose() {}, ready() { readyCalls += 1; }, loadLanguage() {} };
  }
  if (options.noView) { delete win.MzdSettingsView; }
  vm.runInNewContext(viewSource, { window: win, document: { getElementById: () => status } });
  const respond = state => listeners.message({ source: win.parent, data: { type: 'mzd-tweaks-response', token: 'tok', state: state, saving: false, pending: [], limits: {}, unavailable: {} } });
  const select = index => listeners.message({ source: win.parent, data: { type: 'mzd-tweaks-native-select', token: 'tok', index: index } });
  const menu = () => posts.filter(m => m.type === 'mzd-tweaks-native-render').pop().menu;
  const sets = () => posts.filter(m => m.type === 'mzd-tweaks-request' && m.action === 'set').map(m => m.payload);
  return { posts, status, respond, select, menu, sets, readyCalls: () => readyCalls };
}

{
  const page = viewPage();
  assert.deepEqual(page.posts.map(m => m.type + ':' + m.action), ['mzd-tweaks-request:get'], 'the view asks the resident for the settings');
  page.respond({ main_menu_loop: true, list_loop: false, short_delay: false });
  const menu = page.menu();
  assert.equal(menu.title, 'MZD Tweaks');
  assert.deepEqual(menu.rows.map(r => r.key), ['main_menu_loop', 'list_loop', 'list_beep', 'short_delay']);
  assert.deepEqual(menu.rows.map(r => r.label), ['Main menu loop', 'List menu loop', 'List menu beep', 'Shorter list menu delay']);
  assert(menu.rows.every(r => r.itemStyle === 'styleOnOff' && r.disabled === false && r.spinner === false), 'plain On/Off rows');
  assert.deepEqual(menu.rows.map(r => r.checked), [true, false, true, false], 'the end beep is on until it is switched off');

  page.select(2);
  assert.deepEqual(page.sets(), [{ key: 'list_beep', value: false }], 'switching the default beep off saves false');
  page.respond({ main_menu_loop: true, list_loop: false, list_beep: false, short_delay: false });
  assert.equal(page.menu().rows[2].checked, false);
  page.select(2);
  assert.deepEqual(page.sets().pop(), { key: 'list_beep', value: true });
  page.select(0);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_loop', value: false });
  assert.equal(page.menu().rows.length, 4, 'there is no reboot row: the globals apply at once');
}

{
  const page = viewPage({ noSdk: true });
  assert.equal(page.status.textContent, 'Open through Applications.');
  assert.deepEqual(page.posts, [], 'outside Applications nothing is sent');
  const missing = viewPage({ noView: true });
  assert.equal(missing.status.textContent, 'The Mazda menu could not be opened. Please reopen the app.', 'without the shared settings code the view says so');
  assert.equal(missing.readyCalls(), 1, 'the view is ready, so the message stays until the driver goes back');
  assert.deepEqual(missing.posts, [], 'and nothing is sent');
}

console.log('MZD_TWEAKS_SETTINGS_PASSED: boot globals, no unconfirmed state, read on service ready, globals only after a confirmed save, failed save restored, four On/Off rows with default-on end beep, no reboot row.');
