/*
 * MZD Tweaks resident and view on the shared settings code (usb/lib/gui-runtime/settings-host.js and settings-view.js).
 * The resident keeps window.mzdTweaks, read by runtime hooks, in step with the saved
 * settings: it changes only after the service confirmed a read or a save. The view
 * declares On/Off rows and an Entertainment menu order subpage. Fake contexts, no CMU.
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

const DEFAULT_AUDIO_ORDER = {
  audio_traffic_info: 0,
  audio_fm_radio: 1,
  audio_am_radio: 2,
  audio_dab: 3,
  audio_sat_radio: 4,
  audio_xm_audio: 5,
  audio_aha_radio: 6,
  audio_pandora: 7,
  audio_stitcher: 8,
  audio_bt_audio: 9,
  audio_car_play_wifi: 10,
  audio_car_play: 11,
  audio_android_auto: 12,
  audio_usb_a: 13,
  audio_usb_b: 14,
  audio_cd: 15,
  audio_aux_in: 16,
  audio_dvd: 17,
  audio_tv: 18
};

const DEFAULTS = {
  main_menu_loop: false,
  list_loop: false,
  list_beep: true,
  short_delay: false,
  audio_order_custom: false,
  audio_order: DEFAULT_AUDIO_ORDER
};

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

  const expectedSettings = { main_menu_loop: true, list_loop: true, list_beep: false, short_delay: true, audio_order_custom: false };
  complete(page.ctx, 'get', null, { settings: expectedSettings });
  assert.equal(page.win.mzdTweaks.main_menu_loop, true, 'the saved settings reach the globals');
  assert.equal(page.win.mzdTweaks.list_loop, true);
  assert.equal(page.win.mzdTweaks.list_beep, false);
  assert.equal(page.win.mzdTweaks.short_delay, true);
  assert.equal(page.win.mzdTweaks.audio_order_custom, false);
  assert.deepEqual(lastResponse(page.source).state, expectedSettings, 'state broadcast check');
}

{
  const page = residentPage({ main_menu_loop: false, list_loop: true, list_beep: true, short_delay: false, audio_order_custom: false, audio_order: DEFAULT_AUDIO_ORDER });
  assert.equal(lastResponse(page.source), undefined, 'boot values are not shown before the service confirmed them');
  assert.deepEqual(plain(page.win.mzdTweaks), { main_menu_loop: false, list_loop: true, list_beep: true, short_delay: false, audio_order_custom: false, audio_order: DEFAULT_AUDIO_ORDER },
    'existing globals are kept');
}

{
  // At boot the service is usually still starting: the first read fails at once.
  const page = residentPage({ main_menu_loop: true, list_loop: false, list_beep: true, short_delay: false, audio_order_custom: false });
  complete(page.ctx, 'get', 'Module service is starting or unavailable. Please retry.');
  assert.deepEqual(page.ctx.logs, [], 'the expected boot failure is not logged');
  assert.equal(page.win.mzdTweaks.main_menu_loop, true, 'a failed read keeps the boot values');
  page.ctx.current = null;
  page.ctx.handlers.ready();
  assert.deepEqual(page.ctx.requests.map(r => r.op), ['get'], 'the settings are read when the service is ready, with no view open');
  complete(page.ctx, 'get', null, { settings: Object.assign({}, DEFAULTS, { list_loop: true }) });
  assert.equal(page.win.mzdTweaks.list_loop, true, 'the service values reach the globals');
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
  // Confirming audio_order or audio_order_custom calls mzdTweaksResortEntertainment
  const page = residentPage();
  let resortCount = 0;
  page.win.mzdTweaksResortEntertainment = () => { resortCount += 1; };
  complete(page.ctx, 'get', null, { settings: Object.assign({}, DEFAULTS) });
  assert.equal(resortCount, 1, 'resort is called after initial get');

  request(page.ctx, 'set', { key: 'audio_order_custom', value: true });
  complete(page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { audio_order_custom: true }) });
  assert.equal(page.win.mzdTweaks.audio_order_custom, true);
  assert.equal(resortCount, 2, 'resort is called after audio_order_custom save');

  request(page.ctx, 'set', { key: 'audio_order', value: { audio_fm_radio: 0, audio_am_radio: 1 } });
  complete(page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { 'audio_order.audio_fm_radio': 0, 'audio_order.audio_am_radio': 1 }) });
  assert.equal(page.win.mzdTweaks.audio_order.audio_fm_radio, 0);
  assert.equal(resortCount, 3, 'resort is called after audio_order reorder save');
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

{
  // systemApp runtime hook test: _buildEntertainmentDataList returns sorted copy without mutating master list
  function FakeSystemApp() {
    this._initEntertainmentDataList();
  }
  FakeSystemApp.prototype._initEntertainmentDataList = function () {
    this._masterEntertainmentDataList = {
      items: [
        { appData: { audioSourceId: 'USB_B' }, defaultIndex: 1 },
        { appData: { audioSourceId: 'FMRadio' }, defaultIndex: 0 },
        { appData: { audioSourceId: 'USB_A' }, defaultIndex: 2 }
      ]
    };
    this._USB1EntIndex = 2;
    this._USB2EntIndex = 0;
  };
  FakeSystemApp.prototype._buildEntertainmentDataList = function () {
    this.built = true;
    return {
      items: this._masterEntertainmentDataList.items.slice()
    };
  };

  const sysWin = {
    systemApp: FakeSystemApp,
    setInterval: () => 1,
    clearInterval: () => {}
  };
  vm.runInNewContext(settingsHostSource, { window: sysWin });
  sysWin.MzdGuiResidents = { register: () => {}, log: () => {} };
  const sysDoc = { head: { appendChild: () => {} }, documentElement: {} };
  vm.runInNewContext(residentSource, { window: sysWin, document: sysDoc });

  assert.equal(FakeSystemApp.prototype._mzdTweaksHooked, true, 'systemApp prototype hooked');
  const app = new FakeSystemApp();
  // Master list items remain untouched in OEM order
  assert.equal(app._masterEntertainmentDataList.items[0].appData.audioSourceId, 'USB_B', 'master list preserved in OEM order');
  assert.equal(app._USB1EntIndex, 2, '_USB1EntIndex preserved');
  assert.equal(app._USB2EntIndex, 0, '_USB2EntIndex preserved');

  // When custom order is off, _buildEntertainmentDataList sorts by defaultIndex
  const defaultList = app._buildEntertainmentDataList();
  assert.equal(defaultList.items[0].appData.audioSourceId, 'FMRadio', 'defaults sort by defaultIndex');
  assert.equal(defaultList.items[1].appData.audioSourceId, 'USB_B');
  assert.equal(defaultList.items[2].appData.audioSourceId, 'USB_A');

  // Custom order re-sorting
  sysWin.mzdTweaks.audio_order_custom = true;
  sysWin.mzdTweaks.audio_order = {
    audio_usb_a: 0,
    audio_usb_b: 1,
    audio_fm_radio: 2
  };
  const customList = app._buildEntertainmentDataList();
  assert.equal(customList.items[0].appData.audioSourceId, 'USB_A');
  assert.equal(customList.items[1].appData.audioSourceId, 'USB_B');
  assert.equal(customList.items[2].appData.audioSourceId, 'FMRadio');
  // Master list still untouched
  assert.equal(app._masterEntertainmentDataList.items[0].appData.audioSourceId, 'USB_B');
  assert.equal(app._USB1EntIndex, 2);

  // Turning custom order off restores OEM stock order
  sysWin.mzdTweaks.audio_order_custom = false;
  const restoredList = app._buildEntertainmentDataList();
  assert.equal(restoredList.items[0].appData.audioSourceId, 'FMRadio', 'OEM order restored after custom order disabled');
  assert.equal(restoredList.items[1].appData.audioSourceId, 'USB_B');
  assert.equal(restoredList.items[2].appData.audioSourceId, 'USB_A');

  // OEM items without defaultIndex also restore properly via DEFAULT_AUDIO_ORDER
  const appNoDefault = new FakeSystemApp();
  appNoDefault._masterEntertainmentDataList.items = [
    { appData: { audioSourceId: 'USB_B' } },
    { appData: { audioSourceId: 'FMRadio' } },
    { appData: { audioSourceId: 'USB_A' } }
  ];
  sysWin.mzdTweaks.audio_order_custom = true;
  const customNoDefault = appNoDefault._buildEntertainmentDataList();
  assert.equal(customNoDefault.items[0].appData.audioSourceId, 'USB_A');
  assert.equal(customNoDefault.items[1].appData.audioSourceId, 'USB_B');
  assert.equal(customNoDefault.items[2].appData.audioSourceId, 'FMRadio');

  sysWin.mzdTweaks.audio_order_custom = false;
  const restoredNoDefault = appNoDefault._buildEntertainmentDataList();
  assert.equal(restoredNoDefault.items[0].appData.audioSourceId, 'FMRadio', 'stock order restored without defaultIndex');
  assert.equal(restoredNoDefault.items[1].appData.audioSourceId, 'USB_A');
  assert.equal(restoredNoDefault.items[2].appData.audioSourceId, 'USB_B');
}

// --- View -------------------------------------------------------------------

function viewPage(options) {
  options = options || {};
  const posts = [], listeners = {};
  let readyCalls = 0;
  let inputHandler = null;
  const notes = [];
  const status = { style: {}, textContent: 'Opening MZD Tweaks...', dir: '' };
  const win = {
    parent: { postMessage(message) { posts.push(plain(message)); } },
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener() {}
  };
  vm.runInNewContext(settingsViewSource, { window: win });
  if (!options.noSdk) {
    win.MzdGuiModule = {
      token: 'tok',
      t: (key, fallback) => fallback,
      onInput(fn) { inputHandler = fn; },
      onDispose() {},
      ready() { readyCalls += 1; },
      notify(text, isError) { notes.push([text, isError]); },
      loadLanguage() {}
    };
  }
  if (options.noView) { delete win.MzdSettingsView; }
  vm.runInNewContext(viewSource, { window: win, document: { getElementById: () => status } });
  const respond = (state, saving) => listeners.message({ source: win.parent, data: { type: 'mzd-tweaks-response', token: 'tok', state: state, saving: !!saving, pending: saving ? ['audio_order'] : [], limits: {}, unavailable: {} } });
  const select = index => listeners.message({ source: win.parent, data: { type: 'mzd-tweaks-native-select', token: 'tok', index: index } });
  const dialogSelect = value => listeners.message({ source: win.parent, data: { type: 'mzd-tweaks-native-dialog-select', token: 'tok', value: value } });
  const lastDialog = () => {
    const dialogs = posts.filter(m => m.type === 'mzd-tweaks-native-dialog');
    return dialogs.length ? dialogs[dialogs.length - 1].dialog : null;
  };
  const input = (action, phase) => {
    if (inputHandler) {
      const handled = inputHandler(action, phase);
      if (action === 'home' && phase !== 'press' && !handled) {
        win.parent.postMessage({ type: 'mzd-gui-home', token: 'tok' });
      }
      return handled;
    }
    return false;
  };
  const menu = () => posts.filter(m => m.type === 'mzd-tweaks-native-render').pop().menu;
  const sets = () => posts.filter(m => m.type === 'mzd-tweaks-request' && m.action === 'set').map(m => m.payload);
  return { posts, status, respond, select, dialogSelect, lastDialog, notes, input, menu, sets, readyCalls: () => readyCalls };
}

{
  const page = viewPage();
  assert.deepEqual(page.posts.map(m => m.type + ':' + m.action), ['mzd-tweaks-request:get'], 'the view asks the resident for the settings');
  page.respond({ main_menu_loop: true, list_loop: false, short_delay: false, audio_order_custom: false });
  const menu = page.menu();
  assert.equal(menu.title, 'MZD Tweaks');
  assert.deepEqual(menu.rows.map(r => r.key), ['main_menu_loop', 'list_loop', 'list_beep', 'short_delay', 'audio_order_menu']);
  assert.deepEqual(menu.rows.map(r => r.label), ['Main menu loop', 'List menu loop', 'List menu beep', 'Shorter list menu delay', 'Entertainment menu order']);
  assert.equal(menu.rows[4].detail, 'Default', 'detail shows Default when custom order is off');
  assert.equal(menu.rows[4].caret, true);

  page.select(2);
  assert.deepEqual(page.sets(), [{ key: 'list_beep', value: false }], 'switching the default beep off saves false');
  page.respond({ main_menu_loop: true, list_loop: false, list_beep: false, short_delay: false });
  assert.equal(page.menu().rows[2].checked, false);
  page.select(2);
  assert.deepEqual(page.sets().pop(), { key: 'list_beep', value: true });
  page.select(0);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_loop', value: false });

  // Open the Entertainment menu order subpage
  page.select(4);
  const subMenu = page.menu();
  assert.equal(subMenu.title, 'Entertainment menu order');
  assert.equal(subMenu.rows[0].key, 'audio_order_custom');
  assert.equal(subMenu.rows[0].itemStyle, 'styleOnOff');
  assert.equal(subMenu.rows[0].checked, false);

  assert.equal(subMenu.rows[1].key, 'reorder_hint');
  assert.equal(subMenu.rows[1].disabled, true);

  // Audio items are disabled when custom order is off
  assert(subMenu.rows.slice(2).every(r => r.disabled === true), 'audio source items disabled when custom is off');

  // Enable custom order
  page.select(0);
  assert.deepEqual(page.sets().pop(), { key: 'audio_order_custom', value: true });
  page.respond({ audio_order_custom: true });

  const customMenu = page.menu();
  assert.equal(customMenu.rows[0].checked, true);
  assert(customMenu.rows.slice(2).every(r => r.disabled === false), 'audio source items enabled');

  // Select an audio item to activate reorder mode (toggles checkmark)
  const firstItem = customMenu.rows[2];
  page.select(2);
  assert.equal(page.menu().rows[2].checked, true, 'item is now checked for reordering');

  // Reorder with rotary knob (rotateRight / down moves down)
  page.input('rotateRight', 'step');
  assert.equal(page.menu().rows[3].key, firstItem.key, 'moved down to next position');

  // Commander tilt down release does not leak native input
  const nativeInputsBefore = page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length;
  assert.equal(page.input('down', 'release'), true, 'down release consumed while reordering');
  assert.equal(page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length, nativeInputsBefore, 'no native down event leaked on release');

  // Reorder with tilt up (up moves up)
  page.input('up', 'press');
  assert.equal(page.menu().rows[2].key, firstItem.key, 'moved back up');

  // Commander tilt up release does not leak native input
  assert.equal(page.input('up', 'release'), true, 'up release consumed while reordering');
  assert.equal(page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length, nativeInputsBefore, 'no native up event leaked on release');

  // Pressing back deselects reorder item without leaving the subpage
  assert.equal(page.input('back', 'press'), true, 'back press consumed while reordering');
  assert.equal(page.menu().page, 'audio_order', 'still on audio_order page during back press');
  assert.equal(page.menu().rows[2].checked, true, 'item still checked during press');

  assert.equal(page.input('back', 'release'), true, 'back release consumed while reordering');
  assert.equal(page.menu().page, 'audio_order', 'still on audio_order page after back release');
  assert.equal(page.menu().rows[2].checked, false, 'item is deselected');

  // Back step phase also deselects reordering item without leaving subpage
  page.select(2);
  assert.equal(page.menu().rows[2].checked, true, 'item checked again');
  assert.equal(page.input('back', 'step'), true, 'back step consumed while reordering');
  assert.equal(page.menu().page, 'audio_order', 'still on audio_order page after back step');
  assert.equal(page.menu().rows[2].checked, false, 'item is deselected by back step');

  // Touching checkbox to disable custom order while an item is selected deselects the item
  page.select(2);
  assert.equal(page.menu().rows[2].checked, true, 'item is selected for reordering');
  page.select(0); // touch checkbox to disable custom order
  assert.deepEqual(page.sets().pop(), { key: 'audio_order_custom', value: false });
  page.respond({ audio_order_custom: false });
  assert.equal(page.menu().rows[0].checked, false, 'custom order is disabled');
  assert.equal(page.menu().rows[2].checked, false, 'reordering item was automatically deselected');
  assert.equal(page.menu().index, 0, 'menu focus index moved to row 0');
  assert(page.menu().rows.slice(2).every(r => r.disabled === true), 'audio source items are disabled');

  const nativeInputsBeforeDisable = page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length;
  const itemKeyBefore = page.menu().rows[2].key;
  assert.equal(page.input('rotateRight', 'step'), true);
  assert.equal(page.menu().rows[2].key, itemKeyBefore, 'item does not move when custom order is off');
  assert.equal(page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length, nativeInputsBeforeDisable + 1, 'native input forwarded instead of reordering');

  // Re-enable custom order
  page.select(0);
  assert.deepEqual(page.sets().pop(), { key: 'audio_order_custom', value: true });
  page.respond({ audio_order_custom: true });
  assert.equal(page.menu().rows[0].checked, true);
  assert.equal(page.menu().rows[2].checked, false, 'item remains deselected after re-enabling');
  assert.equal(page.menu().index, 0, 'menu focus index is at row 0');

  // Now navigate to item 2 and press enter to activate checkmark
  page.select(2);
  assert.equal(page.menu().rows[2].checked, true, 'checkmark activates after re-enabling custom order and selecting item');

  // Reorder item again so we have modified order to save
  page.input('rotateRight', 'step');
  page.select(3); // deselect with enter key

  // Deselecting an item with Enter must NOT save settings yet
  assert.equal(page.sets().filter(s => s.key === 'audio_order').length, 0, 'deselecting with enter does not save');
  assert.equal(page.notes.length, 0, 'no notification on deselect');

  // Leaving via Back automatically saves, and upon confirmed save, emits notification
  assert.equal(page.input('back', 'press'), true, 'back press consumed at subpage');
  assert.equal(page.menu().page, 'audio_order', 'still on subpage during press');
  assert.equal(page.input('back', 'release'), true, 'back leaves subpage');
  assert.equal(page.menu().page, 'home', 'back to home page');

  const audioSets = page.sets().filter(s => s.key === 'audio_order');
  assert.equal(audioSets.length, 1, 'leaving subpage via back auto-saved audio_order');
  assert.equal(page.notes.length, 0, 'no notification before save confirmation');

  // Service confirms the save
  page.respond({ audio_order_custom: true });
  assert.deepEqual(page.notes[0], ['Settings saved', false], 'Settings saved notification emitted after save confirmation');

  // Re-enter audio order page, order is unchanged now. Leaving via Back should NOT trigger save again
  const setsCount = page.sets().length;
  const notesCount = page.notes.length;
  page.select(4);
  assert.equal(page.menu().page, 'audio_order');
  page.input('back', 'release');
  assert.equal(page.menu().page, 'home');
  assert.equal(page.sets().length, setsCount, 'no save triggered when order was unchanged');
  assert.equal(page.notes.length, notesCount, 'no notification emitted when order was unchanged');

  // Re-enter audio order page, reorder, and leave via Home
  page.select(4);
  assert.equal(page.menu().page, 'audio_order');
  page.select(2);
  page.input('rotateRight', 'step');
  page.select(3);

  // Leaving via Home automatically saves and navigates home, then notifies upon confirmation
  page.input('home', 'step');
  const homeSets = page.sets().filter(s => s.key === 'audio_order');
  assert.equal(homeSets.length, 2, 'leaving subpage via home auto-saved audio_order');
  const homePosts = page.posts.filter(m => m.type === 'mzd-tweaks-native-home' || m.type === 'mzd-gui-home');
  assert(homePosts.length > 0, 'leaving on home posts home exit message');

  // Confirm home save
  page.respond({ audio_order_custom: true });
  assert.deepEqual(page.notes[page.notes.length - 1], ['Settings saved', false], 'Settings saved notification emitted on confirmed home exit');

  // At home page, when not reordering, tilt down forwards native input
  const nativeCountBefore = page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length;
  assert.equal(page.input('down', 'release'), true);
  assert.equal(page.posts.filter(m => m.type === 'mzd-tweaks-native-input').length, nativeCountBefore + 1, 'native input forwarded when not reordering');

  // At home page, back press is consumed, back release returns false to let SDK close the app
  assert.equal(page.input('back', 'press'), true, 'back press consumed at home page');
  assert.equal(page.input('back', 'release'), false, 'back release at home returns false to let SDK close view');
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

{
  // i18n key-parity check for settings_saved across all registered languages
  const i18nSource = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/i18n.js'), 'utf8');
  let registeredI18n = null;
  const mockWin = {
    MzdGuiI18n: {
      register(id, payload) {
        registeredI18n = payload;
      }
    }
  };
  vm.runInNewContext(i18nSource, { window: mockWin });
  assert(registeredI18n && registeredI18n.languages, 'i18n loaded');
  const langs = Object.keys(registeredI18n.languages);
  assert.equal(langs.length, 41, 'all 41 languages registered');
  for (const lang of langs) {
    const dict = registeredI18n.languages[lang];
    assert(dict.settings_saved && dict.settings_saved.length > 0, 'settings_saved present in ' + lang);
    assert(dict.audio_order_custom && dict.audio_order_custom.length > 0, 'audio_order_custom present in ' + lang);
    assert(dict.audio_order_hint && dict.audio_order_hint.length > 0, 'audio_order_hint present in ' + lang);
    assert(dict.default && dict.default.length > 0, 'default present in ' + lang);
    assert(dict.custom && dict.custom.length > 0, 'custom present in ' + lang);
    assert(dict.audio_order_title && dict.audio_order_title.length > 0, 'audio_order_title present in ' + lang);
    assert.equal(dict.title, 'MZD Tweaks', 'title not translated in ' + lang);
    assert.equal(dict['gui.label'], 'MZD Tweaks', 'gui.label not translated in ' + lang);
  }
}

console.log('MZD_TWEAKS_SETTINGS_PASSED: boot globals, no unconfirmed state, read on service ready, globals only after a confirmed save, failed save restored, four On/Off rows, audio order subpage with deferred save, resort confirmation.');
