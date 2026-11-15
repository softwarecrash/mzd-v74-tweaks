/*
 * MZD Tweaks resident and view on the shared settings code (usb/lib/gui-runtime/settings-host.js and settings-view.js).
 * The resident keeps window.mzdTweaks, read by runtime hooks, in step with the saved
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
  assert.deepEqual(plain(page.win.mzdTweaks), DEFAULTS, 'runtime hooks find defaults before anything is read');
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

// --- Runtime Hooks for OEM Controls ---
{
  function makeFakeControls() {
    function MainMenuCtrl() {
      this._focus = 0;
      this._highlight = 0;
    }
    MainMenuCtrl.prototype._getFocus = function () { return this._focus; };
    MainMenuCtrl.prototype._setFocus = function (idx) { this._focus = idx; };
    MainMenuCtrl.prototype._setHighlight = function (idx) { this._highlight = idx; };
    MainMenuCtrl.prototype._offsetFocus = function (direction) {
      var dir = (direction === -1 || direction === 'left') ? -1 : (direction === 1 || direction === 'right') ? 1 : 0;
      if (dir === 0) return;
      var current = this._getFocus();
      var next = current + dir;
      if (next < 0) next = 0;
      if (next > 4) next = 4;
      this._setFocus(next);
      this._setHighlight(next);
    };

    function List2Ctrl() {
      this.focussedIndex = 0;
      this.dataList = { itemCount: 5, items: [{ disabled: false }, { disabled: false }, { disabled: false }, { disabled: false }, { disabled: false }] };
      this.beeps = [];
      this.init();
    }
    List2Ctrl.prototype.defaultProperties = {
      autoscrollTier1Timeout: 1500,
      autoscrollTier2Timeout: 5000,
      autoscrollTier1Interval: 500,
      autoscrollTier2Interval: 1000
    };
    List2Ctrl.prototype.init = function () {
      this.properties = Object.assign({}, List2Ctrl.prototype.defaultProperties);
    };
    List2Ctrl.prototype._getFocussedIndex = function () { return this.focussedIndex; };
    List2Ctrl.prototype._manageFocus = function (idx) { this.focussedIndex = idx; };
    List2Ctrl.prototype._beep = function (pressType, eventCause) { this.beeps.push([pressType, eventCause]); };
    List2Ctrl.prototype._handleMCCW = function () {
      if (this.focussedIndex >= 0 && this.focussedIndex < this.dataList.itemCount - 1) { this.focussedIndex += 1; }
      return 'consumed';
    };
    List2Ctrl.prototype._handleMCCCW = function () {
      if (this.focussedIndex > 0) { this.focussedIndex -= 1; }
      return 'consumed';
    };
    List2Ctrl.prototype._handleMCDown = function () {
      if (this.focussedIndex >= 0 && this.focussedIndex < this.dataList.itemCount - 1) { this.focussedIndex += 1; }
      return 'consumed';
    };
    List2Ctrl.prototype._handleMCUp = function () {
      if (this.focussedIndex > 0) { this.focussedIndex -= 1; }
      return 'consumed';
    };
    List2Ctrl.prototype._getListPosition = function () {
      if (this.dataList.itemCount <= (this.properties.visibleItems || 5)) return 'onepage';
      if (this.focussedIndex === 0) return 'top';
      if (this.focussedIndex === this.dataList.itemCount - 1) return 'bottom';
      return 'middle';
    };
    List2Ctrl.prototype._scrollTo = function (pos) { this._scrollPos = pos; };
    List2Ctrl.prototype._scrollDownPage = function () {
      var pos = this._getListPosition();
      if (pos === 'onepage' || pos === 'bottom') return 'atLimit';
      this.focussedIndex = Math.min(this.focussedIndex + 4, this.dataList.itemCount - 1);
      return 'paged';
    };
    List2Ctrl.prototype._scrollUpPage = function () {
      var pos = this._getListPosition();
      if (pos === 'onepage' || pos === 'top') return 'atLimit';
      this.focussedIndex = Math.max(this.focussedIndex - 4, 0);
      return 'paged';
    };
    List2Ctrl.prototype.handleControllerEvent = function (eventID) {
      if (eventID === 'downStart') {
        return this._handleMCDown();
      } else if (eventID === 'upStart') {
        return this._handleMCUp();
      } else if (eventID === 'cw') {
        return this._handleMCCW();
      } else if (eventID === 'ccw') {
        return this._handleMCCCW();
      }
      return 'consumed';
    };

    return { MainMenuCtrl, List2Ctrl };
  }

  // 1. With hooks installed and settings disabled: stock behavior preserved
  const controls1 = makeFakeControls();
  const win1 = {
    MainMenuCtrl: controls1.MainMenuCtrl,
    List2Ctrl: controls1.List2Ctrl,
    setTimeout: (fn) => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  };
  vm.runInNewContext(settingsHostSource, { window: win1 });
  win1.MzdGuiResidents = { register: () => {}, log: () => {} };
  const doc1 = { head: { appendChild: () => {} }, documentElement: {} };
  vm.runInNewContext(residentSource, { window: win1, document: doc1 });

  // MainMenuCtrl when main_menu_loop is false
  const menuCtrl1 = new controls1.MainMenuCtrl();
  menuCtrl1._setFocus(4);
  menuCtrl1._offsetFocus(1);
  assert.equal(menuCtrl1._getFocus(), 4, 'without loop, focus stays at 4 when moving right');
  menuCtrl1._setFocus(0);
  menuCtrl1._offsetFocus(-1);
  assert.equal(menuCtrl1._getFocus(), 0, 'without loop, focus stays at 0 when moving left');

  // List2Ctrl when list_loop is false, list_beep is true, short_delay is false
  const listCtrl1 = new controls1.List2Ctrl();
  listCtrl1.focussedIndex = 4;
  listCtrl1._handleMCCW();
  assert.equal(listCtrl1.focussedIndex, 4, 'without list loop, focus stays at end when moving forward');
  listCtrl1.focussedIndex = 0;
  listCtrl1._handleMCCCW();
  assert.equal(listCtrl1.focussedIndex, 0, 'without list loop, focus stays at start when moving backward');

  listCtrl1._beep('Long', 'Multicontroller');
  assert.deepEqual(listCtrl1.beeps, [['Long', 'Multicontroller']], 'beep sounds when list_beep is default true');
  listCtrl1.focussedIndex = 4;
  assert.equal(listCtrl1._scrollDownPage(), 'atLimit', 'without list loop, page down stops at limit');
  assert.equal(listCtrl1.focussedIndex, 4);
  listCtrl1.focussedIndex = 0;
  assert.equal(listCtrl1._scrollUpPage(), 'atLimit', 'without list loop, page up stops at limit');
  assert.equal(listCtrl1.focussedIndex, 0);

  assert.equal(listCtrl1.properties.autoscrollTier1Timeout, 1500, 'stock autoscrollTier1Timeout is 1500');
  assert.equal(listCtrl1.properties.autoscrollTier2Timeout, 5000, 'stock autoscrollTier2Timeout is 5000');
  assert.equal(listCtrl1.properties.autoscrollTier1Interval, 500, 'stock autoscrollTier1Interval is 500');
  assert.equal(listCtrl1.properties.autoscrollTier2Interval, 1000, 'stock autoscrollTier2Interval is 1000');

  // 2. Enable features dynamically
  win1.mzdTweaks.main_menu_loop = true;
  win1.mzdTweaks.list_loop = true;
  win1.mzdTweaks.list_beep = false;
  win1.mzdTweaks.short_delay = true;

  // Main menu loop active
  menuCtrl1._setFocus(4);
  menuCtrl1._offsetFocus(1);
  assert.equal(menuCtrl1._getFocus(), 0, 'with main_menu_loop, focus wraps from 4 to 0');
  menuCtrl1._offsetFocus(-1);
  assert.equal(menuCtrl1._getFocus(), 4, 'with main_menu_loop, focus wraps from 0 to 4');
  menuCtrl1._offsetFocus('right');
  assert.equal(menuCtrl1._getFocus(), 0, 'with main_menu_loop, string "right" wraps from 4 to 0');
  menuCtrl1._offsetFocus('left');
  assert.equal(menuCtrl1._getFocus(), 4, 'with main_menu_loop, string "left" wraps from 0 to 4');
  menuCtrl1._setFocus(2);
  menuCtrl1._offsetFocus(0);
  assert.equal(menuCtrl1._getFocus(), 2, 'unexpected direction 0 delegates to original without moving focus');
  menuCtrl1._offsetFocus(undefined);
  assert.equal(menuCtrl1._getFocus(), 2, 'unexpected undefined direction delegates to original without moving focus');
  menuCtrl1._setFocus(-1);
  menuCtrl1._offsetFocus(-1);
  assert.equal(menuCtrl1._getFocus(), 0, 'unfocused -1 delegates to original without wrapping to 4');
  menuCtrl1._setFocus(0);

  // List loop active
  listCtrl1.focussedIndex = 4;
  listCtrl1._handleMCCW();
  assert.equal(listCtrl1.focussedIndex, 0, 'with list_loop, rotary CW wraps from bottom to top');
  listCtrl1.focussedIndex = 0;
  listCtrl1._handleMCCCW();
  assert.equal(listCtrl1.focussedIndex, 4, 'with list_loop, rotary CCW wraps from top to bottom');
  listCtrl1.focussedIndex = 4;
  listCtrl1._handleMCDown();
  assert.equal(listCtrl1.focussedIndex, 0, 'with list_loop, tilt down wraps from bottom to top');
  listCtrl1.focussedIndex = 0;
  listCtrl1._handleMCUp();
  assert.equal(listCtrl1.focussedIndex, 4, 'with list_loop, tilt up wraps from top to bottom');

  // List loop does not wrap backwards or forwards when unfocused
  listCtrl1.focussedIndex = -1;
  listCtrl1._handleMCCCW();
  assert.equal(listCtrl1.focussedIndex, -1, 'backward rotation when no item is focused does not wrap to the end');
  listCtrl1._handleMCUp();
  assert.equal(listCtrl1.focussedIndex, -1, 'tilt up when no item is focused does not wrap to the end');
  listCtrl1._handleMCCW();
  assert.equal(listCtrl1.focussedIndex, -1, 'forward rotation when no item is focused does not wrap');
  listCtrl1._handleMCDown();
  assert.equal(listCtrl1.focussedIndex, -1, 'tilt down when no item is focused does not wrap');

  // Tilt-and-hold autoscroll (like MainMenuCtrl) loops continuously without stopping
  listCtrl1.focussedIndex = 4;
  listCtrl1.handleControllerEvent('downStart');
  assert.equal(listCtrl1.focussedIndex, 0, 'downStart on last item loops to 0');
  assert.equal(listCtrl1._scrollPos, 0, 'short list keeps scroll at 0');
  assert.equal(listCtrl1._topItem, 0, 'short list keeps _topItem at 0');
  listCtrl1._handleMCDown();
  assert.equal(listCtrl1.focussedIndex, 1, 'autoscroll step continues to 1 without stopping');
  listCtrl1.handleControllerEvent('down');
  assert.equal(listCtrl1._tiltHoldTimeoutId, null, 'releasing down clears timeout');
  assert.equal(listCtrl1._tiltHoldIntervalId, null, 'releasing down clears interval');

  listCtrl1.focussedIndex = 0;
  listCtrl1.handleControllerEvent('upStart');
  assert.equal(listCtrl1.focussedIndex, 4, 'upStart on first item loops to 4');
  assert.equal(listCtrl1._scrollPos, 0, 'short list keeps scroll at 0 when looping up');
  assert.equal(listCtrl1._topItem, 0, 'short list keeps _topItem at 0 when looping up');
  listCtrl1._handleMCUp();
  assert.equal(listCtrl1.focussedIndex, 3, 'autoscroll step continues to 3 without stopping');
  listCtrl1.handleControllerEvent('up');
  assert.equal(listCtrl1._tiltHoldTimeoutId, null, 'releasing up clears timeout');
  assert.equal(listCtrl1._tiltHoldIntervalId, null, 'releasing up clears interval');

  // Test continuous autoscroll timer and interval execution across multiple full loops
  let timeoutFn = null;
  let intervalFn = null;
  win1.setTimeout = (fn) => { timeoutFn = fn; return 101; };
  win1.setInterval = (fn) => { intervalFn = fn; return 202; };
  listCtrl1.focussedIndex = 3;
  listCtrl1.handleControllerEvent('downStart');
  assert.equal(listCtrl1.focussedIndex, 4, 'downStart moves from 3 to 4');
  assert.equal(listCtrl1._tiltHoldTimeoutId, 101, 'timeout is scheduled');
  assert.equal(typeof timeoutFn, 'function');
  timeoutFn(); // timeout triggers autoscroll step
  assert.equal(listCtrl1.focussedIndex, 0, 'timeout step wraps from 4 to 0');
  assert.equal(listCtrl1._tiltHoldIntervalId, 202, 'interval is scheduled');
  assert.equal(typeof intervalFn, 'function');
  intervalFn(); // tick 1
  assert.equal(listCtrl1.focussedIndex, 1, 'interval step continues to 1');
  intervalFn(); // tick 2
  assert.equal(listCtrl1.focussedIndex, 2, 'interval step continues to 2');
  intervalFn(); // tick 3
  assert.equal(listCtrl1.focussedIndex, 3, 'interval step continues to 3');
  intervalFn(); // tick 4
  assert.equal(listCtrl1.focussedIndex, 4, 'interval step continues to 4');
  intervalFn(); // tick 5: loops again without stopping!
  assert.equal(listCtrl1.focussedIndex, 0, 'interval step loops again to 0');
  assert.equal(listCtrl1._scrollPos, 0, 'short list keeps scroll at 0 across multiple loops');
  assert.equal(listCtrl1._topItem, 0, 'short list keeps _topItem at 0 across multiple loops');
  listCtrl1.handleControllerEvent('down'); // user releases down
  assert.equal(listCtrl1._tiltHoldTimeoutId, null, 'releasing down clears timeout');
  assert.equal(listCtrl1._tiltHoldIntervalId, null, 'releasing down clears interval');

  // Multi-page list wraps page scrolling
  const multiPageList = new controls1.List2Ctrl();
  multiPageList.dataList = {
    itemCount: 10,
    items: Array.from({ length: 10 }, () => ({ disabled: false }))
  };
  multiPageList.properties.visibleItems = 5;
  multiPageList.focussedIndex = 9;
  assert.equal(multiPageList._scrollDownPage(), 'paged', 'multi-page scroll down wraps to top page');
  assert.equal(multiPageList.focussedIndex, 0, 'focus placed on first item after wrap');
  assert.equal(multiPageList._scrollPos, 0, 'scrolled to top');

  multiPageList.focussedIndex = 0;
  assert.equal(multiPageList._scrollUpPage(), 'paged', 'multi-page scroll up wraps to bottom page');
  assert.equal(multiPageList.focussedIndex, 9, 'focus placed on last item after wrap');
  assert.equal(multiPageList._scrollPos, 5, 'scrolled to bottom');

  // List beep muted
  listCtrl1.beeps = [];
  listCtrl1._beep('Long', 'Multicontroller');
  assert.deepEqual(listCtrl1.beeps, [], 'beep is muted when list_beep is false');
  listCtrl1._beep('Short', 'Multicontroller');
  assert.deepEqual(listCtrl1.beeps, [['Short', 'Multicontroller']], 'only long multicontroller beep is muted');

  // Shorter delay active
  assert.equal(listCtrl1.properties.autoscrollTier1Timeout, 500, 'short_delay sets autoscrollTier1Timeout to 500');
  assert.equal(listCtrl1.properties.autoscrollTier2Timeout, 1500, 'short_delay sets autoscrollTier2Timeout to 1500');
  assert.equal(listCtrl1.properties.autoscrollTier1Interval, 300, 'short_delay sets autoscrollTier1Interval to 300');
  assert.equal(listCtrl1.properties.autoscrollTier2Interval, 500, 'short_delay sets autoscrollTier2Interval to 500');
  assert.equal(controls1.List2Ctrl.prototype.defaultProperties.autoscrollTier1Timeout, 500, 'short_delay sets autoscrollTier1Timeout on defaultProperties');
}

{
  // Bounded polling timer clears even when controls are never instantiated
  let pollCallback;
  let cleared = false;
  let clearedId = null;
  const timerWin = {
    setInterval: (cb) => { pollCallback = cb; return 42; },
    clearInterval: (id) => { cleared = true; clearedId = id; }
  };
  vm.runInNewContext(settingsHostSource, { window: timerWin });
  timerWin.MzdGuiResidents = { register: () => {}, log: () => {} };
  const timerDoc = { head: { appendChild: () => {} }, documentElement: {} };
  vm.runInNewContext(residentSource, { window: timerWin, document: timerDoc });

  assert.equal(typeof pollCallback, 'function', 'polling timer starts when controls are absent');
  for (let i = 0; i < 299; i++) {
    pollCallback();
    assert.equal(cleared, false, 'timer continues before 300 attempts');
  }
  pollCallback(); // 300th attempt
  assert.equal(cleared, true, 'timer clears after reaching bounded limit of 300 attempts');
  assert.equal(clearedId, 42);
}

{
  // framework.instantiateControl hook
  let origInstantiateCalled = false;
  const fwControls = makeFakeControls();
  const fwWin = {
    framework: {
      instantiateControl: () => {
        origInstantiateCalled = true;
        return {};
      }
    },
    setInterval: () => 1,
    clearInterval: () => {}
  };
  vm.runInNewContext(settingsHostSource, { window: fwWin });
  fwWin.MzdGuiResidents = { register: () => {}, log: () => {} };
  const fwDoc = { head: { appendChild: () => {} }, documentElement: {} };
  vm.runInNewContext(residentSource, { window: fwWin, document: fwDoc });

  fwWin.MainMenuCtrl = fwControls.MainMenuCtrl;
  fwWin.List2Ctrl = fwControls.List2Ctrl;
  assert.equal(fwControls.MainMenuCtrl.prototype._mzdTweaksHooked, undefined);
  assert.equal(fwControls.List2Ctrl.prototype._mzdTweaksHooked, undefined);

  fwWin.framework.instantiateControl(null, null, 'MainMenuCtrl', {});
  assert.equal(origInstantiateCalled, true);
  assert.equal(fwControls.MainMenuCtrl.prototype._mzdTweaksHooked, true, 'MainMenuCtrl hooked on instantiateControl');

  fwWin.framework.instantiateControl(null, null, 'List2Ctrl', {});
  assert.equal(fwControls.List2Ctrl.prototype._mzdTweaksHooked, true, 'List2Ctrl hooked on instantiateControl');
}

{
  // proto.defaultProperties defined after hookList2 is bound dynamically by init()
  const controlsLate = makeFakeControls();
  delete controlsLate.List2Ctrl.prototype.defaultProperties;
  const lateWin = {
    List2Ctrl: controlsLate.List2Ctrl,
    setInterval: () => 1,
    clearInterval: () => {}
  };
  vm.runInNewContext(settingsHostSource, { window: lateWin });
  lateWin.MzdGuiResidents = { register: () => {}, log: () => {} };
  const lateDoc = { head: { appendChild: () => {} }, documentElement: {} };
  vm.runInNewContext(residentSource, { window: lateWin, document: lateDoc });

  // defaultProperties added after initial hook
  controlsLate.List2Ctrl.prototype.defaultProperties = {
    autoscrollTier1Timeout: 1500,
    autoscrollTier2Timeout: 5000,
    autoscrollTier1Interval: 500,
    autoscrollTier2Interval: 1000
  };
  lateWin.mzdTweaks.short_delay = true;
  const lateList = new controlsLate.List2Ctrl();
  assert.equal(lateList.properties.autoscrollTier1Timeout, 500, 'instance properties bound by init()');
  assert.equal(controlsLate.List2Ctrl.prototype.defaultProperties.autoscrollTier1Timeout, 500, 'proto.defaultProperties bound by init() when added late');
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
