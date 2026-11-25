/*
 * MZD Tweaks resident and view on the shared settings code (usb/lib/gui-runtime/settings-host.js and settings-view.js).
 * The resident keeps window.mzdTweaks, read by runtime hooks, in step with the saved
 * settings: it changes only after the service confirmed a read or a save. The view
 * declares settings rows and subpages. The resident applies StatusBarCtrl changes
 * at runtime. Fake contexts, no CMU.
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
const i18nRuntimeSource = fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/i18n.js'), 'utf8');
const tweaksI18nSource = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/i18n.js'), 'utf8');
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

const DEFAULT_MAIN_MENU_ORDER = {
  main_menu_app: 0,
  main_menu_ent: 1,
  main_menu_com: 2,
  main_menu_nav: 3,
  main_menu_set: 4
};

const DEFAULTS = {
  main_menu_loop: false,
  main_menu_coins_layout: 'ellipse',
  main_menu_coins_size: 100,
  main_menu_coins_glow: true,
  list_loop: false,
  list_beep: true,
  short_delay: false,
  statusbar_date: 'off',
  bluetooth_notification: true,
  theme: 'red',
  main_menu_order_custom: false,
  main_menu_order: DEFAULT_MAIN_MENU_ORDER,
  audio_order_custom: false,
  audio_order: DEFAULT_AUDIO_ORDER
};

// --- Resident ---------------------------------------------------------------

function residentPage(boot, options) {
  options = options || {};
  const win = { setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, addEventListener() {} };
  if (options.framework) { win.framework = options.framework; }
  if (options.MainMenuCtrl) { win.MainMenuCtrl = options.MainMenuCtrl; }
  if (options.Common) { win.Common = options.Common; }
  if (options.StatusBarCtrl) { win.StatusBarCtrl = options.StatusBarCtrl; }
  if (options.Intl) { win.Intl = options.Intl; }
  if (options.utility) { win.utility = options.utility; }
  if (options.previewServices) { win.mzdPreviewServiceDefaults = options.previewServices; }
  if (options.parentPreviewServices) { win.parent = { mzdPreviewServiceDefaults: options.parentPreviewServices }; }
  const scripts = [];
  if (boot) { win.mzdTweaks = boot; }
  const head = { appendChild(script) { scripts.push(script); } };
  const document = {
    head: head,
    documentElement: head,
    body: options.body || null,
    createElement: options.createElement || (() => ({})),
    getElementsByClassName(name) {
      if (name === 'StatusBarCtrlClock') { return options.statusbarElements || []; }
      return [];
    }
  };
  win.document = document;
  vm.runInNewContext(settingsHostSource, { window: win });
  const registered = [], logs = [];
  win.MzdGuiResidents = { register(id, factory) { registered.push(id); win.factory = factory; }, log(id, message) { logs.push([id, message]); } };
  if (options.i18n) {
    // The real shared translation runtime and the real mzd-tweaks dictionaries.
    vm.runInNewContext(i18nRuntimeSource, { window: win, document: document });
    win.MzdGuiI18n.start([{ id: 'mzd-tweaks', translations: '/data/integration/mzd-gui-modules/mzd-tweaks/assets/i18n.js' }]);
    vm.runInNewContext(tweaksI18nSource, { window: win });
  }
  vm.runInNewContext(residentSource, { window: win, document: document });

  const source = { messages: [], postMessage(message) { this.messages.push(plain(message)); } };
  const ctx = { requests: [], notes: [], options: null, handlers: {}, current: { source: source, token: 'tok', frame: {} } };
  ctx.view = () => ctx.current;
  ctx.onMessage = fn => { ctx.handlers.message = fn; };
  ctx.onViewClose = () => {};
  ctx.onDispose = () => {};
  ctx.logs = [];
  ctx.log = message => ctx.logs.push(message);
  ctx.loadLanguage = fn => { if (win.MzdGuiI18n) { win.MzdGuiI18n.load('mzd-tweaks', fn); } };
  ctx.onServiceReady = fn => { ctx.handlers.ready = fn; };
  ctx.notify = (text, isError) => ctx.notes.push([text, isError]);
  ctx.createNativeMenu = options => { ctx.options = options; return { close() {}, check() {}, owns: () => false }; };
  ctx.service = { request(op, args, cb) { ctx.requests.push({ op: op, args: plain(args), cb: cb }); } };
  win.factory(ctx);
  return { win, ctx, source, scripts, registered, logs, document };
}

function fakeElement() {
  let text = '';
  const element = {
    style: {},
    children: [],
    appendChild(child) { this.children.push(child); return child; }
  };
  Object.defineProperty(element, 'innerText', {
    get() { return this.children.length ? this.children.map(child => child.innerText || child.textContent).join('\n') : text; },
    set(value) { text = String(value); this.children = []; }
  });
  Object.defineProperty(element, 'textContent', {
    get() { return this.children.length ? this.children.map(child => child.textContent || child.innerText).join('') : text; },
    set(value) { text = String(value); this.children = []; }
  });
  return element;
}

function statusbarFixture(mode, contextId, usePrivateClock, existingBeforeHook, currentApp, disableIntl, language) {
  const currentTime = new Date(2026, 10, 18, 8, 26);
  const clocks = [];
  const framework = {
    localize: {
      getCurrentLanguage: () => language || 'en_US',
      getTimeFormat: () => '24hrs'
    },
    common: { getCurrentTime: () => currentTime },
    getCurrCtxtId: () => contextId || 'Home',
    getCurrentApp: () => currentApp || (contextId === 'AndroidAutoUI' ? 'androidauto' : contextId === 'CarPlayUI' ? 'carplay' : 'system')
  };
  function StatusBarCtrl() {
    this.clock = fakeElement(); // stock v74 has no date element
    clocks.push(this.clock);
    if (usePrivateClock) { this._updateClock(currentTime); }
    else { this.updateClock(currentTime); }
  }
  const updateClock = function () {
    this.clock.innerText = contextId === 'AndroidAutoUI' || contextId === 'CarPlayUI' ? '' : '08:26';
  };
  if (usePrivateClock) { StatusBarCtrl.prototype._updateClock = updateClock; }
  else { StatusBarCtrl.prototype.updateClock = updateClock; }
  const control = existingBeforeHook ? new StatusBarCtrl() : null;
  const pageOptions = {
    framework,
    StatusBarCtrl,
    statusbarElements: clocks,
    createElement: () => fakeElement(),
    i18n: !!language
  };
  if (!disableIntl) { pageOptions.Intl = Intl; }
  const page = residentPage(Object.assign({}, DEFAULTS, { statusbar_date: mode }), pageOptions);
  return { page, control: control || new page.win.StatusBarCtrl() };
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
  const on = statusbarFixture(true).control;
  assert.equal(on.clock.innerText, '08:26\nWed 18', 'On shows the time with the short date below it');
  assert.equal(on.clock.children[0].style.fontSize, '30px', 'the time font is smaller');
  assert.equal(on.clock.children[1].style.fontSize, '22px', 'the date is smaller than the time');
  assert.equal(on.clock.style.top, '0', 'the factory clock box is reused, so the bar does not grow');

  for (const value of ['off', false, 'long', 'on', 'stacked', undefined]) {
    const stock = statusbarFixture(value).control;
    assert.equal(stock.clock.innerText, '08:26', 'only a known mode changes the clock: ' + String(value));
    assert(!stock.clock.style.top, 'other values keep stock styling');
  }
  // 18 November 2026, Wednesday. true from an older settings.js reads as weekday.
  for (const [mode, text] of [['weekday', 'Wed 18'], ['month_text', 'Nov 18'], ['month_numeric', '11/18'], [true, 'Wed 18']]) {
    assert.equal(statusbarFixture(mode).control.clock.innerText, '08:26\n' + text, 'mode ' + String(mode));
  }

  const missing = statusbarFixture(true);
  delete missing.page.win.mzdTweaks.statusbar_date;
  missing.control.updateClock();
  assert.equal(missing.control.clock.innerText, '08:26', 'a missing setting leaves the stock clock intact');

  for (const contextId of ['AndroidAutoUI', 'CarPlayUI']) {
    const projection = statusbarFixture(true, contextId).control;
    assert.equal(projection.clock.innerText, '', contextId + ' keeps the stock empty clock');
    assert(!projection.clock.style.top, contextId + ' keeps OEM clock styling');
  }

  const activeProjectionApp = statusbarFixture(true, 'Home', false, false, 'androidauto').control;
  assert.equal(activeProjectionApp.clock.innerText, '08:26\nWed 18',
    'the stock context ID, not the current audio app, determines projection behavior');

  const noIntl = statusbarFixture(true, null, false, false, null, true).control;
  assert.equal(noIntl.clock.innerText, '08:26\nWed 18', 'English day names are used when Intl is unavailable');

  // Pass the fixture time: a no-argument OEM update uses the real current date, which is not fixed.
  const repeat = statusbarFixture(true).control;
  repeat.updateClock(new Date(2026, 10, 18, 8, 26));
  assert.equal(repeat.clock.innerText, '08:26\nWed 18', 'a repeated OEM update does not duplicate the date');

  // The framework reports 0 until the first system time arrives; the date is
  // left out until a real time is available rather than showing a stale date.
  const noTime = statusbarFixture(true);
  noTime.page.win.framework.common.getCurrentTime = () => 0;
  noTime.control.updateClock(0);
  assert.equal(noTime.control.clock.innerText, '08:26',
    'a zero system time keeps the factory clock without a date');
  assert(!noTime.control.clock.style.top,
    'a zero system time keeps stock styling');
  noTime.page.win.framework.common.getCurrentTime = () => new Date(0);
  noTime.control.updateClock(new Date(0));
  assert.equal(noTime.control.clock.innerText, '08:26',
    'an epoch Date object is treated as unset time and keeps the factory clock');
  assert(!noTime.control.clock.style.top,
    'an epoch Date object keeps stock styling');

  // An unreadable context must keep the factory clock, never draw over AA/CarPlay.
  const unknownContext = statusbarFixture(true);
  unknownContext.page.win.framework.getCurrCtxtId = () => { throw new Error('no context'); };
  unknownContext.control.updateClock();
  assert.equal(unknownContext.control.clock.innerText, '08:26', 'an unknown context keeps the factory clock');
  assert(!unknownContext.control.clock.style.top, 'an unknown context keeps stock styling');

  // A render failure restores the clock instead of leaving it half built.
  const broken = statusbarFixture(true);
  broken.page.win.document.createElement = () => { throw new Error('no elements'); };
  broken.control.updateClock();
  assert.equal(broken.control.clock.innerText, '08:26', 'a render failure leaves the factory clock');

  for (const existingBeforeHook of [false, true]) {
    const live = statusbarFixture(false, null, true, existingBeforeHook);
    complete(live.page.ctx, 'get', null, { settings: Object.assign({}, DEFAULTS) });
    request(live.page.ctx, 'set', { key: 'statusbar_date', value: 'weekday' });
    assert.equal(live.control.clock.innerText, '08:26', 'unsaved changes do not affect the status bar');
    complete(live.page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { statusbar_date: 'weekday' }) });
    assert.equal(live.control.clock.innerText, '08:26\nWed 18', 'a confirmed setting refreshes the clock');
    request(live.page.ctx, 'set', { key: 'statusbar_date', value: 'month_numeric' });
    complete(live.page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { statusbar_date: 'month_numeric' }) });
    assert.equal(live.control.clock.innerText, '08:26\n11/18', 'changing the format refreshes the clock');
    request(live.page.ctx, 'set', { key: 'statusbar_date', value: 'off' });
    complete(live.page.ctx, 'set', null, { settings: Object.assign({}, DEFAULTS, { statusbar_date: 'off' }) });
    assert.equal(live.control.clock.innerText, '08:26', 'switching to Off restores the stock clock');
    assert(!live.control.clock.style.top, 'switching to Off restores stock styling');
  }
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

  const expectedSettings = { main_menu_loop: true, main_menu_coins_layout: 'ellipse', main_menu_coins_size: 100, main_menu_coins_glow: true, list_loop: true, list_beep: false, short_delay: true, statusbar_date: 'off', bluetooth_notification: true, theme: 'red', audio_order_custom: false };
  complete(page.ctx, 'get', null, { settings: expectedSettings });
  assert.equal(page.win.mzdTweaks.main_menu_loop, true, 'the saved settings reach the globals');
  assert.equal(page.win.mzdTweaks.list_loop, true);
  assert.equal(page.win.mzdTweaks.list_beep, false);
  assert.equal(page.win.mzdTweaks.short_delay, true);
  assert.equal(page.win.mzdTweaks.audio_order_custom, false);
  assert.deepEqual(lastResponse(page.source).state, expectedSettings, 'state broadcast check');
}

{
  const page = residentPage(undefined, { parentPreviewServices: { 'mzd-tweaks': {} } });
  assert.equal(page.scripts.length, 0, 'the emulator preview service replaces the vehicle settings.js boot script');
  assert.deepEqual(page.ctx.requests.map(r => r.op), ['get'], 'the preview service still loads settings at startup');
}

{
  const page = residentPage({ main_menu_loop: false, main_menu_coins_layout: 'ellipse', main_menu_coins_size: 100, main_menu_coins_glow: true, list_loop: true, list_beep: true, short_delay: false, statusbar_date: 'off', bluetooth_notification: true, theme: 'blue', main_menu_order_custom: false, main_menu_order: DEFAULT_MAIN_MENU_ORDER, audio_order_custom: false, audio_order: DEFAULT_AUDIO_ORDER });
  assert.equal(lastResponse(page.source), undefined, 'boot values are not shown before the service confirmed them');
  assert.deepEqual(plain(page.win.mzdTweaks), { main_menu_loop: false, main_menu_coins_layout: 'ellipse', main_menu_coins_size: 100, main_menu_coins_glow: true, list_loop: true, list_beep: true, short_delay: false, statusbar_date: 'off', bluetooth_notification: true, theme: 'blue', main_menu_order_custom: false, main_menu_order: DEFAULT_MAIN_MENU_ORDER, audio_order_custom: false, audio_order: DEFAULT_AUDIO_ORDER },
    'existing globals are kept');
}

{
  // At boot the service is usually still starting: the first read fails at once.
  const page = residentPage({ main_menu_loop: true, main_menu_coins_glow: true, list_loop: false, list_beep: true, short_delay: false, audio_order_custom: false });
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

    function makeFakeDomItem(ref) {
      const classes = new Set();
      return {
        ref: ref,
        domElt: {
          classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c)
          }
        }
      };
    }

    function List2Ctrl() {
      this.focussedIndex = 0;
      this._lastItemWithFocus = 0;
      this.dataList = { itemCount: 5, items: [{ disabled: false }, { disabled: false }, { disabled: false }, { disabled: false }, { disabled: false }] };
      this.beeps = [];
      this.init();
      this._rebuildItems();
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
    List2Ctrl.prototype._rebuildItems = function () {
      const count = this.dataList ? this.dataList.itemCount : 0;
      this.items = [];
      for (let i = 0; i < count; i++) {
        const item = makeFakeDomItem(i);
        if (i === this.focussedIndex) {
          item.domElt.classList.add('focus');
        }
        this.items.push(item);
      }
    };
    List2Ctrl.prototype._getFocussedIndex = function () {
      return this.focussedIndex;
    };
    // Like OEM: focus and scroll changes are ignored while list data is loading.
    List2Ctrl.prototype._loadingLocked = function () {
      return this._inLoading === true && !this.properties.scrollingDuringLoading;
    };
    List2Ctrl.prototype._showFocus = function (idx, allowOffscreen) {
      if (this._loadingLocked()) return;
      this._manageFocus(idx);
    };
    List2Ctrl.prototype._manageFocus = function (idx) {
      this.focussedIndex = idx;
      this._lastItemWithFocus = idx;
      if (this.items) {
        for (let i = 0; i < this.items.length; i++) {
          if (this.items[i].ref === idx) {
            this.items[i].domElt.classList.add('focus');
          } else {
            this.items[i].domElt.classList.remove('focus');
          }
        }
      }
    };
    List2Ctrl.prototype._beep = function (pressType, eventCause) { this.beeps.push([pressType, eventCause]); };
    List2Ctrl.prototype._handleMCCW = function () {
      if (this.focussedIndex >= 0 && this.dataList && this.dataList.items) {
        let next = this.focussedIndex + 1;
        while (next < this.dataList.itemCount && this.dataList.items[next] && this.dataList.items[next].disabled) {
          next++;
        }
        if (next < this.dataList.itemCount && !this.dataList.items[next].disabled) {
          this._manageFocus(next);
        }
      }
      return 'consumed';
    };
    List2Ctrl.prototype._handleMCCCW = function () {
      if (this.focussedIndex > 0 && this.dataList && this.dataList.items) {
        let prev = this.focussedIndex - 1;
        while (prev >= 0 && this.dataList.items[prev] && this.dataList.items[prev].disabled) {
          prev--;
        }
        if (prev >= 0 && !this.dataList.items[prev].disabled) {
          this._manageFocus(prev);
        }
      }
      return 'consumed';
    };
    List2Ctrl.prototype._handleMCDown = function () {
      return this._handleMCCW();
    };
    List2Ctrl.prototype._handleMCUp = function () {
      return this._handleMCCCW();
    };
    List2Ctrl.prototype._getListPosition = function () {
      const vis = (this.properties && typeof this.properties.visibleItems === 'number') ? this.properties.visibleItems : 5;
      if (this.dataList.itemCount <= vis) return 'onepage';
      if (this.focussedIndex === 0) return 'top';
      if (this.focussedIndex === this.dataList.itemCount - 1) return 'bottom';
      return 'middle';
    };
    List2Ctrl.prototype._scrollTo = function (pos) {
      if (this._loadingLocked()) return;
      const vis = typeof this.properties.visibleItems === 'number' ? this.properties.visibleItems : 6;
      const top = Math.max(0, Math.min(pos, this.dataList.itemCount - vis));
      this._scrollPos = top;
      this._topItem = top;
    };
    List2Ctrl.prototype._scrollDownPage = function () {
      var pos = this._getListPosition();
      if (pos === 'onepage' || pos === 'bottom') return 'atLimit';
      var next = Math.min(this.focussedIndex + 4, this.dataList.itemCount - 1);
      while (next > this.focussedIndex && this.dataList.items[next] && this.dataList.items[next].disabled) {
        next--;
      }
      if (next === this.focussedIndex) return 'atLimit';
      this._manageFocus(next);
      return 'paged';
    };
    List2Ctrl.prototype._scrollUpPage = function () {
      var pos = this._getListPosition();
      if (pos === 'onepage' || pos === 'top') return 'atLimit';
      var prev = Math.max(this.focussedIndex - 4, 0);
      while (prev < this.focussedIndex && this.dataList.items[prev] && this.dataList.items[prev].disabled) {
        prev++;
      }
      if (prev === this.focussedIndex) return 'atLimit';
      this._manageFocus(prev);
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
  multiPageList._rebuildItems();
  multiPageList._manageFocus(9);
  assert.equal(multiPageList._scrollDownPage(), 'paged', 'multi-page scroll down wraps to top page');
  assert.equal(multiPageList.focussedIndex, 0, 'focus placed on first item after wrap');
  assert.equal(multiPageList._scrollPos, 0, 'scrolled to top');

  multiPageList._manageFocus(0);
  assert.equal(multiPageList._scrollUpPage(), 'paged', 'multi-page scroll up wraps to bottom page');
  assert.equal(multiPageList.focussedIndex, 9, 'focus placed on last item after wrap');
  assert.equal(multiPageList._scrollPos, 5, 'scrolled to bottom');

  // AA Settings simulation: 17 items, item 16 (reboot) is disabled
  const aaList = new controls1.List2Ctrl();
  aaList.dataList = {
    itemCount: 17,
    items: Array.from({ length: 17 }, (_, i) => ({ disabled: i === 16 }))
  };
  aaList.properties.visibleItems = 6;
  aaList._rebuildItems();
  aaList._manageFocus(15); // focused at last enabled item

  function getFocusRef(ctrl) {
    let ref = -1;
    let count = 0;
    for (const it of ctrl.items) {
      if (it.domElt.classList.contains('focus')) {
        ref = it.ref;
        count++;
      }
    }
    return { ref, count };
  }

  assert.deepEqual(getFocusRef(aaList), { ref: 15, count: 1 }, 'initially focus is on item 15 with highlight');

  // 1. Rotary CW from 15 loops forward to 0 (skipping disabled reboot item 16)
  aaList._handleMCCW();
  assert.equal(aaList.focussedIndex, 0, 'CW on last enabled item wraps to 0');
  assert.deepEqual(getFocusRef(aaList), { ref: 0, count: 1 }, 'DOM focus highlight preserved on item 0');
  assert.equal(aaList._scrollPos, 0, 'scrollPos reset to top');
  aaList._handleMCCW();
  assert.equal(aaList.focussedIndex, 1, 'very next CW after forward wrap advances to 1 on first click without stall');
  assert.deepEqual(getFocusRef(aaList), { ref: 1, count: 1 }, 'DOM focus highlight on item 1');

  // 2. Rotary CCW from 0 loops backward to 15 (skipping disabled reboot item 16)
  aaList._manageFocus(0);
  aaList._handleMCCCW();
  assert.equal(aaList.focussedIndex, 15, 'CCW on 0 wraps to 15');
  assert.deepEqual(getFocusRef(aaList), { ref: 15, count: 1 }, 'DOM focus highlight preserved on item 15');
  assert.equal(aaList._scrollPos, 11, 'backward wrap scrolls to the OEM bottom position (17 - 6)');
  assert.equal(aaList._topItem, 11, '_topItem follows the clamped scroll position');
  aaList._handleMCCCW();
  assert.equal(aaList.focussedIndex, 14, 'very next CCW after backward wrap advances to 14 on first click without stall');
  assert.deepEqual(getFocusRef(aaList), { ref: 14, count: 1 }, 'DOM focus highlight on item 14');

  // 3. Tilt Down from 15 loops forward to 0
  aaList._manageFocus(15);
  aaList._handleMCDown();
  assert.equal(aaList.focussedIndex, 0, 'tilt down wraps to 0');
  assert.deepEqual(getFocusRef(aaList), { ref: 0, count: 1 }, 'highlight preserved on 0');
  aaList._handleMCDown();
  assert.equal(aaList.focussedIndex, 1, 'tilt down on 0 advances to 1 on first click without stall');

  // 4. Tilt Up from 0 loops backward to 15
  aaList._manageFocus(0);
  aaList._handleMCUp();
  assert.equal(aaList.focussedIndex, 15, 'tilt up wraps to 15');
  assert.deepEqual(getFocusRef(aaList), { ref: 15, count: 1 }, 'highlight preserved on 15');
  aaList._handleMCUp();
  assert.equal(aaList.focussedIndex, 14, 'tilt up on 15 advances to 14 on first click without stall');

  // 5. Continuous autoscroll (downStart and upStart) across disabled boundary
  aaList._manageFocus(15);
  aaList.handleControllerEvent('downStart');
  assert.equal(aaList.focussedIndex, 0, 'downStart on 15 wraps to 0');
  assert.deepEqual(getFocusRef(aaList), { ref: 0, count: 1 }, 'highlight on 0 after downStart');
  aaList.handleControllerEvent('down');
  aaList.handleControllerEvent('downStart');
  assert.equal(aaList.focussedIndex, 1, 'downStart on 0 advances to 1 on first click without stall');
  aaList.handleControllerEvent('down');

  aaList._manageFocus(0);
  aaList.handleControllerEvent('upStart');
  assert.equal(aaList.focussedIndex, 15, 'upStart on 0 wraps to 15');
  assert.deepEqual(getFocusRef(aaList), { ref: 15, count: 1 }, 'highlight on 15 after upStart');
  aaList.handleControllerEvent('up');
  aaList.handleControllerEvent('upStart');
  assert.equal(aaList.focussedIndex, 14, 'upStart on 15 advances to 14 on first click without stall');
  aaList.handleControllerEvent('up');

  // 6. Page down and page up across disabled boundary
  aaList._manageFocus(15);
  aaList._scrollPos = 11;
  assert.equal(aaList._scrollDownPage(), 'paged', 'page down wraps to 0');
  assert.equal(aaList.focussedIndex, 0, 'page down placed focus on 0');
  assert.deepEqual(getFocusRef(aaList), { ref: 0, count: 1 }, 'highlight preserved on 0 after page down');

  assert.equal(aaList._scrollUpPage(), 'paged', 'page up wraps to 15');
  assert.equal(aaList.focussedIndex, 15, 'page up placed focus on 15');
  assert.deepEqual(getFocusRef(aaList), { ref: 15, count: 1 }, 'highlight preserved on 15 after page up');
  assert.equal(aaList._scrollPos, 11, 'page up aligned scrollPos to 11');

  // 6b. No wrap while OEM waits for list data: the list would move only half way
  aaList._manageFocus(15);
  aaList._scrollTo(11);
  aaList._inLoading = true;
  aaList._handleMCCW();
  assert.equal(aaList.focussedIndex, 15, 'CW at the end does not wrap while the list is loading');
  assert.equal(aaList._topItem, 11, 'loading list keeps its scroll position on CW');
  aaList._manageFocus(0);
  aaList._handleMCCCW();
  assert.equal(aaList.focussedIndex, 0, 'CCW at the start does not wrap while the list is loading');
  assert.equal(aaList._topItem, 11, 'loading list keeps its scroll position on CCW');
  aaList.properties.scrollingDuringLoading = true;
  aaList._handleMCCCW();
  assert.equal(aaList.focussedIndex, 15, 'a list that scrolls during loading still wraps');
  aaList.properties.scrollingDuringLoading = false;
  aaList._inLoading = false;

  // 6c. No wrap in list reorder or letter index mode
  aaList._manageFocus(15);
  aaList._inListReorder = true;
  aaList._handleMCCW();
  assert.equal(aaList.focussedIndex, 15, 'CW does not wrap in list reorder mode');
  aaList._inListReorder = false;
  aaList._inLetterIndexMulticontroller = true;
  aaList._handleMCCW();
  assert.equal(aaList.focussedIndex, 15, 'CW does not wrap in letter index mode');
  aaList._inLetterIndexMulticontroller = false;

  // 7. Middle disabled row (Audio Custom Order simulation: 21 items, item 1 disabled)
  const audioList = new controls1.List2Ctrl();
  audioList.dataList = {
    itemCount: 21,
    items: Array.from({ length: 21 }, (_, i) => ({ disabled: i === 1 }))
  };
  audioList.properties.visibleItems = 5;
  audioList._rebuildItems();
  audioList._manageFocus(0);

  audioList._handleMCCW();
  assert.equal(audioList.focussedIndex, 2, 'CW skips disabled item 1 to item 2');
  assert.deepEqual(getFocusRef(audioList), { ref: 2, count: 1 }, 'highlight on 2');

  audioList._handleMCCCW();
  assert.equal(audioList.focussedIndex, 0, 'CCW skips disabled item 1 back to item 0');
  assert.deepEqual(getFocusRef(audioList), { ref: 0, count: 1 }, 'highlight on 0');

  audioList._handleMCCCW();
  assert.equal(audioList.focussedIndex, 20, 'CCW on 0 wraps to 20');
  assert.deepEqual(getFocusRef(audioList), { ref: 20, count: 1 }, 'highlight on 20');

  audioList._handleMCCW();
  assert.equal(audioList.focussedIndex, 0, 'CW on 20 wraps to 0');
  assert.deepEqual(getFocusRef(audioList), { ref: 0, count: 1 }, 'highlight on 0');

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
  const previewTime = new Date(2026, 10, 18, 8, 26);
  const framework = {
    localize: { getCurrentLanguage: () => 'en_US', getTimeFormat: () => '24hrs' },
    common: { getCurrentTime: () => previewTime }
  };
  let readyCalls = 0;
  let inputHandler = null;
  const notes = [];
  const status = { style: {}, textContent: 'Opening MZD Tweaks...', dir: '' };
  const win = {
    parent: { framework, postMessage(message) { posts.push(plain(message)); } },
    Intl,
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
  return { win, posts, status, respond, select, dialogSelect, lastDialog, notes, input, menu, sets, readyCalls: () => readyCalls };
}

{
  const page = viewPage();
  page.respond({ statusbar_date: 'off' });
  let row = page.menu().rows[8];
  assert.deepEqual([row.label, row.detail, row.caret], ['Date in status bar', 'Off', true], 'the date row shows Off and opens a page');
  page.select(8);
  let sub = page.menu();
  assert.equal(sub.title, 'Date in status bar');
  // The view uses the framework time (18 November 2026 in this fixture), like the status bar.
  assert.deepEqual(sub.rows.map(r => r.label), ['Off', 'Wed 18', 'Nov 18', '11/18'], 'the options are examples of today');
  assert.deepEqual(sub.rows.map(r => r.checked), [true, false, false, false], 'Off is checked');
  page.select(2);
  assert.deepEqual(page.sets(), [{ key: 'statusbar_date', value: 'month_text' }], 'choosing an example saves its mode');
  assert.notEqual(page.menu().title, 'Date in status bar', 'choosing returns to the main page');
  page.respond({ statusbar_date: 'month_text' });
  assert.equal(page.menu().rows[8].detail, 'Nov 18', 'the row shows the chosen format');
  page.respond({ statusbar_date: true });
  assert.equal(page.menu().rows[8].detail, 'Wed 18', 'true from an older settings.js shows as weekday');
  page.select(8);
  assert.deepEqual(page.menu().rows.map(r => r.checked), [false, true, false, false], 'weekday is checked for true');
  page.select(1);
  assert.equal(page.sets().length, 1, 'choosing the current mode saves nothing');
  page.respond({ statusbar_date: 'stacked' });
  assert.equal(page.menu().rows[8].detail, 'Off', 'an unknown value shows Off');
}

{
  const page = viewPage();
  page.respond({ bluetooth_notification: true });
  assert.equal(page.menu().rows[9].label, 'Bluetooth connection notification');
  assert.equal(page.menu().rows[9].checked, true, 'the bluetooth notification is on by default');
  page.select(9);
  assert.deepEqual(page.sets(), [{ key: 'bluetooth_notification', value: false }], 'switching bluetooth notification off saves false');
}

{
  const page = viewPage();
  assert.deepEqual(page.posts.map(m => m.type + ':' + m.action), ['mzd-tweaks-request:get'], 'the view asks the resident for the settings');
  page.respond({ main_menu_loop: true, main_menu_coins_glow: true, list_loop: false, short_delay: false, main_menu_order_custom: false, audio_order_custom: false });
  const menu = page.menu();
  assert.equal(menu.title, 'MZD Tweaks');
  assert.deepEqual(menu.rows.map(r => r.key), ['main_menu_loop', 'main_menu_coins_layout', 'main_menu_coins_glow', 'main_menu_coins_size_menu', 'main_menu_order_menu', 'list_loop', 'list_beep', 'short_delay', 'statusbar_date_menu', 'bluetooth_notification', 'theme_menu', 'audio_order_menu']);
  assert.deepEqual(menu.rows.map(r => r.label), ['Main menu loop', 'Main menu flat layout', 'Main menu icons glow', 'Main menu icons size', 'Main Menu icons order', 'List menu loop', 'List menu beep', 'List menu shorter delay', 'Date in status bar', 'Bluetooth connection notification', 'Theme', 'Entertainment menu order']);
  assert.equal(menu.rows[3].detail, 'Default');
  assert.equal(menu.rows[3].caret, true);
  assert.equal(menu.rows[4].detail, 'Default', 'main menu order detail shows Default when off');
  assert.equal(menu.rows[4].caret, true);
  assert.equal(menu.rows[10].detail, 'Red');
  assert.equal(menu.rows[10].caret, true);
  assert.equal(menu.rows[11].detail, 'Default', 'detail shows Default when custom order is off');
  assert.equal(menu.rows[11].caret, true);

  // Toggle flat layout
  page.select(1);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_coins_layout', value: 'flat' });
  page.respond({ main_menu_coins_layout: 'flat' });
  assert.equal(page.menu().rows[1].checked, true);
  page.select(1);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_coins_layout', value: 'ellipse' });
  page.respond({ main_menu_coins_layout: 'ellipse' });
  assert.equal(page.menu().rows[1].checked, false);

  // Open the Coin size subpage
  page.select(3);
  const sizeMenu = page.menu();
  assert.equal(sizeMenu.title, 'Main menu icons size');
  assert.equal(sizeMenu.rows.length, 3);
  assert.equal(sizeMenu.rows[0].key, 'coins_size_100');
  assert.equal(sizeMenu.rows[0].checked, true);
  assert.equal(sizeMenu.rows[1].key, 'coins_size_80');
  assert.equal(sizeMenu.rows[1].checked, false);
  assert.equal(sizeMenu.rows[2].key, 'coins_size_60');
  assert.equal(sizeMenu.rows[2].checked, false);

  // Select Small (80)
  page.select(1);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_coins_size', value: 80 });
  page.respond({ main_menu_coins_size: 80 });
  assert.equal(page.menu().rows[3].detail, 'Small');

  page.select(6);
  assert.deepEqual(page.sets().pop(), { key: 'list_beep', value: false });
  page.respond({ main_menu_loop: true, main_menu_coins_glow: true, list_loop: false, list_beep: false, short_delay: false });
  assert.equal(page.menu().rows[6].checked, false);
  page.select(6);
  assert.deepEqual(page.sets().pop(), { key: 'list_beep', value: true });
  page.select(2);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_coins_glow', value: false });
  page.respond({ main_menu_loop: true, main_menu_coins_glow: false, list_loop: false, list_beep: true, short_delay: false });
  assert.equal(page.menu().rows[2].checked, false);
  page.select(2);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_coins_glow', value: true });
  page.respond({ main_menu_loop: true, main_menu_coins_glow: true, list_loop: false, list_beep: true, short_delay: false });
  page.select(0);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_loop', value: false });

  // Open the Main menu order subpage
  page.win.parent.framework = {
    localize: {
      getLocStr(app, id) {
        const dict = {
          Applications: 'Aplikacje',
          Entertainment: 'Rozrywka',
          Communication: 'Komunikacja',
          NavigationTitle: 'Nawigacja',
          Settings: 'Ustawienia'
        };
        return dict[id] || id;
      }
    }
  };
  page.select(4);
  const mmMenu = page.menu();
  assert.equal(mmMenu.title, 'Main Menu icons order');
  assert.equal(mmMenu.rows.length, 7);
  assert.equal(mmMenu.rows[0].key, 'main_menu_order_custom');
  assert.equal(mmMenu.rows[0].itemStyle, 'styleOnOff');
  assert.equal(mmMenu.rows[0].checked, false);
  assert.equal(mmMenu.rows[1].key, 'main_menu_reorder_hint');
  assert.equal(mmMenu.rows[1].disabled, true);
  assert.deepEqual(mmMenu.rows.slice(2).map(r => r.label), ['Aplikacje', 'Rozrywka', 'Komunikacja', 'Nawigacja', 'Ustawienia'], 'main menu labels use JCI system translations');
  assert(mmMenu.rows.slice(2).every(r => r.disabled === true), 'main menu items disabled when custom is off');

  // Enable custom main menu order, reorder Applications down, and leave to auto-save
  page.select(0);
  assert.deepEqual(page.sets().pop(), { key: 'main_menu_order_custom', value: true });
  page.respond({ main_menu_order_custom: true });
  assert(page.menu().rows.slice(2).every(r => r.disabled === false), 'main menu items enabled');
  page.select(2);
  assert.equal(page.menu().rows[2].checked, true);
  page.input('rotateRight', 'step');
  assert.equal(page.menu().rows[3].key, 'mm_main_menu_app', 'Applications moved to second slot');
  page.input('back', 'release');
  page.input('back', 'release');
  const mmOrderSaves = page.sets().filter(s => s.key === 'main_menu_order');
  assert.equal(mmOrderSaves.length, 1, 'leaving main_menu_order subpage auto-saved order');
  assert.deepEqual(mmOrderSaves[0].value, {
    main_menu_ent: 0,
    main_menu_app: 1,
    main_menu_com: 2,
    main_menu_nav: 3,
    main_menu_set: 4
  });
  page.respond({ main_menu_order_custom: true, main_menu_order: mmOrderSaves[0].value });
  assert.equal(page.menu().rows[4].detail, 'Custom', 'main menu order detail shows Custom');
  page.notes.length = 0;
  delete page.win.parent.framework;

  // Open the Theme subpage
  page.select(10);
  const themeMenu = page.menu();
  assert.equal(themeMenu.title, 'Theme');
  assert.equal(themeMenu.rows.length, 9);
  assert.equal(themeMenu.rows[0].key, 'theme_red');
  assert.equal(themeMenu.rows[0].checked, true);
  assert.equal(themeMenu.rows[1].key, 'theme_blue');
  assert.equal(themeMenu.rows[1].checked, false);

  // Select Blue: saves theme: 'blue' and immediately returns to main menu
  page.select(1);
  assert.deepEqual(page.sets().pop(), { key: 'theme', value: 'blue' });
  page.respond({ theme: 'blue' });
  assert.equal(page.menu().rows[10].detail, 'Blue');

  // Open the Entertainment menu order subpage
  page.select(11);
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
  page.select(11);
  assert.equal(page.menu().page, 'audio_order');
  page.input('back', 'release');
  assert.equal(page.menu().page, 'home');
  assert.equal(page.sets().length, setsCount, 'no save triggered when order was unchanged');
  assert.equal(page.notes.length, notesCount, 'no notification emitted when order was unchanged');

  // Re-enter audio order page, reorder, and leave via Home
  page.select(11);
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
    assert(dict.enable_custom_order && dict.enable_custom_order.length > 0, 'enable_custom_order present in ' + lang);
    assert(dict.custom_order_hint && dict.custom_order_hint.length > 0, 'custom_order_hint present in ' + lang);
    assert(dict.default && dict.default.length > 0, 'default present in ' + lang);
    assert(dict.custom && dict.custom.length > 0, 'custom present in ' + lang);
    assert(dict.audio_order_title && dict.audio_order_title.length > 0, 'audio_order_title present in ' + lang);
    assert(dict.main_menu_order_title && dict.main_menu_order_title.length > 0, 'main_menu_order_title present in ' + lang);
    assert(dict.main_menu_coins_glow && dict.main_menu_coins_glow.length > 0, 'main_menu_coins_glow present in ' + lang);
    assert(dict.main_menu_flat_layout && dict.main_menu_flat_layout.length > 0, 'main_menu_flat_layout present in ' + lang);
    assert(dict.main_menu_coins_size && dict.main_menu_coins_size.length > 0, 'main_menu_coins_size present in ' + lang);
    assert(dict.coins_size_100 && dict.coins_size_100.length > 0, 'coins_size_100 present in ' + lang);
    assert(dict.coins_size_80 && dict.coins_size_80.length > 0, 'coins_size_80 present in ' + lang);
    assert(dict.coins_size_60 && dict.coins_size_60.length > 0, 'coins_size_60 present in ' + lang);
    assert(dict.statusbar_date && dict.statusbar_date.length > 0, 'statusbar_date present in ' + lang);
    assert(dict.theme && dict.theme.length > 0, 'theme present in ' + lang);
    for (const color of ['red', 'blue', 'green', 'orange', 'purple', 'pink', 'silver', 'gold', 'cyan']) {
      assert(dict['theme_' + color] && dict['theme_' + color].length > 0, 'theme_' + color + ' present in ' + lang);
      assert(dict['color_' + color] && dict['color_' + color].length > 0, 'color_' + color + ' present in ' + lang);
    }
    assert(dict.bluetooth_notification && dict.bluetooth_notification.length > 0, 'bluetooth_notification present in ' + lang);
    for (const day of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
      assert(dict['weekday_' + day] && dict['weekday_' + day].length > 0, 'weekday_' + day + ' present in ' + lang);
    }
    for (const month of ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']) {
      assert(dict['month_' + month] && dict['month_' + month].length > 0, 'month_' + month + ' present in ' + lang);
    }
    assert(dict.statusbar_date_off && dict.statusbar_date_off.length > 0, 'statusbar_date_off present in ' + lang);
    assert(/\{m\}/.test(dict.date_numeric_format) && /\{d\}/.test(dict.date_numeric_format), 'date_numeric_format in ' + lang);
    assert(/\{d\}/.test(dict.date_text_format) && /\{[Mn]\}/.test(dict.date_text_format), 'date_text_format in ' + lang);
    assert.equal(dict.title, 'MZD Tweaks', 'title not translated in ' + lang);
    assert.equal(dict['gui.label'], 'MZD Tweaks', 'gui.label not translated in ' + lang);
  }
}


{
  // The head unit browser has no Intl: weekdays must come from the mzd-tweaks translations.
  let registered = null;
  vm.runInNewContext(tweaksI18nSource, { window: { MzdGuiI18n: { register(id, payload) { registered = payload; } } } });
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  for (const lang of Object.keys(registered.languages)) {
    const control = statusbarFixture(true, null, false, false, null, true, lang).control;
    for (let n = 0; n < 7; n++) {
      control.updateClock(new Date(2026, 10, 15 + n, 8, 26)); // 15 November 2026 is a Sunday
      const expected = registered.languages[lang]['weekday_' + days[n]] + ' ' + (15 + n);
      assert.equal(control.clock.children[1].textContent, expected, 'translated weekday without Intl in ' + lang + ' for ' + days[n]);
    }
  }
  const german = statusbarFixture(true, null, false, false, null, true, 'de_DE').control;
  assert.equal(german.clock.innerText, '08:26\nMi 18', 'German weekday is shown on the status bar');
  const regional = statusbarFixture(true, null, false, false, null, true, 'de_AT').control;
  assert.equal(regional.clock.children[1].textContent, 'Mi 18', 'a regional variant uses the base language weekdays');
  const unknown = statusbarFixture(true, null, false, false, null, true, 'sw_KE').control;
  assert.equal(unknown.clock.children[1].textContent, 'Wed 18', 'an unsupported language falls back to English');

  // Month formats: two-digit numbers in the language order, and the short month name.
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (const lang of Object.keys(registered.languages)) {
    const dict = registered.languages[lang];
    for (const [mode, date] of [['month_numeric', new Date(2026, 0, 5, 8, 26)], ['month_numeric', new Date(2026, 10, 18, 8, 26)],
      ['month_text', new Date(2026, 0, 5, 8, 26)], ['month_text', new Date(2026, 8, 28, 8, 26)]]) {
      const control = statusbarFixture(mode, null, false, false, null, true, lang).control;
      control.updateClock(date);
      const m = date.getMonth(), d = date.getDate();
      const expected = mode === 'month_numeric' ?
        dict.date_numeric_format.replace('{m}', String(m + 1).padStart(2, '0')).replace('{d}', String(d).padStart(2, '0')) :
        dict.date_text_format.replace('{M}', dict['month_' + months[m]]).replace('{n}', String(m + 1)).replace('{d}', String(d));
      assert.equal(control.clock.children[1].textContent, expected, mode + ' in ' + lang + ' for ' + date.toDateString());
    }
  }
  for (const [lang, numeric, text] of [['en_US', '11/18', 'Nov 18'], ['en_UK', '18/11', '18 Nov'], ['de_DE', '18.11', '18. Nov.'],
    ['hu_HU', '11.18', 'nov. 18.'], ['ja_JP', '11/18', '11月18日'], ['sw_KE', '11/18', 'Nov 18']]) {
    assert.equal(statusbarFixture('month_numeric', null, false, false, null, true, lang).control.clock.children[1].textContent, numeric, 'numeric ' + lang);
    assert.equal(statusbarFixture('month_text', null, false, false, null, true, lang).control.clock.children[1].textContent, text, 'text ' + lang);
  }
}

{
  // Theme and Coins Glow stylesheet and body class management
  const headElements = [];
  const byId = {};
  const mockHead = {
    appendChild(el) {
      headElements.push(el);
      if (el.id) byId[el.id] = el;
      el.parentNode = mockHead;
      return el;
    },
    removeChild(el) {
      const idx = headElements.indexOf(el);
      if (idx !== -1) headElements.splice(idx, 1);
      if (el.id) delete byId[el.id];
      el.parentNode = null;
      return el;
    }
  };
  const mockBody = { className: '' };
  const mockDoc = {
    head: mockHead,
    documentElement: mockHead,
    body: mockBody,
    createElement(tag) {
      return { tagName: tag, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; } };
    },
    getElementById(id) {
      return byId[id] || null;
    },
    getElementsByClassName() { return []; }
  };

  const win = {
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, addEventListener() {},
    document: mockDoc,
    mzdTweaks: { main_menu_loop: false, main_menu_coins_glow: true, theme: 'red' },
    MzdGuiResidents: { register(id, factory) { win.factory = factory; }, log() {} }
  };
  vm.runInNewContext(settingsHostSource, { window: win });
  vm.runInNewContext(residentSource, { window: win, document: mockDoc });

  // Initial state with theme: 'red' and main_menu_coins_glow: true
  assert.equal(byId['mzd-tweaks-base-css'] !== undefined, true, 'mzd-tweaks.css is always loaded');
  assert.equal(byId['mzd-tweaks-theme-common-css'], undefined, 'theme-common.css is not loaded when theme is red');
  assert.equal(byId['mzd-tweaks-theme-color-css'], undefined, 'theme color css is not loaded when theme is red');
  assert.equal(mockBody.className.indexOf('mzd-coins-glow') !== -1, true, 'mzd-coins-glow is on body when enabled');
  assert.equal(mockBody.className.indexOf('mzd-no-coins-glow'), -1, 'mzd-no-coins-glow is not on body');

  // Switch to Cobalt Blue
  let hostOptions = null;
  const originalCreate = win.MzdSettingsHost.create;
  win.MzdSettingsHost.create = (c, opts) => {
    hostOptions = opts;
    return originalCreate(c, opts);
  };
  const source = { messages: [], postMessage(message) { this.messages.push(plain(message)); } };
  const ctx = {
    requests: [],
    notes: [],
    options: null,
    handlers: {},
    current: { source: source, token: 'tok', frame: {} },
    logs: [],
    log(message) { this.logs.push(message); },
    notify(text, isError) { this.notes.push([text, isError]); },
    view() { return this.current; },
    onMessage(fn) { this.handlers.message = fn; },
    onViewClose(fn) { this.handlers.viewClose = fn; },
    onDispose(fn) { this.handlers.dispose = fn; },
    loadLanguage(fn) { if (typeof fn === 'function') fn(); },
    onServiceReady(fn) { this.handlers.ready = fn; },
    createNativeMenu(options) { this.options = options; return { close() {}, check() {}, owns: () => false }; },
    service: { request(op, args, cb) { ctx.requests.push({ op: op, args: plain(args), cb: cb }); } }
  };
  win.factory(ctx);
  hostOptions.onConfirmed({ theme: 'blue' });

  assert.equal(byId['mzd-tweaks-base-css'] !== undefined, true, 'mzd-tweaks.css remains loaded');
  assert.equal(byId['mzd-tweaks-theme-common-css'] !== undefined, true, 'theme-common.css is loaded when custom theme is blue');
  assert.equal(byId['mzd-tweaks-theme-color-css'] !== undefined, true, 'theme color css is loaded');
  assert.equal(mockBody.className.indexOf('mzd-theme-blue') !== -1, true, 'mzd-theme-blue is on body');
  assert.equal(mockBody.className.indexOf('mzd-coins-glow') !== -1, true, 'mzd-coins-glow remains on body');

  // Switch between two non-red themes (blue -> green)
  hostOptions.onConfirmed({ theme: 'green' });
  assert.equal(byId['mzd-tweaks-theme-common-css'] !== undefined, true, 'theme-common.css remains loaded');
  assert.equal(byId['mzd-tweaks-theme-color-css'].getAttribute('data-theme'), 'green', 'data-theme updated to green');
  assert.equal(byId['mzd-tweaks-theme-color-css'].href, '/data/integration/mzd-gui-modules/mzd-tweaks/assets/themes/theme-green.css', 'href updated to theme-green.css');
  assert.equal(mockBody.className.indexOf('mzd-theme-blue'), -1, 'old mzd-theme-blue class removed');
  assert.equal(mockBody.className.indexOf('mzd-theme-green') !== -1, true, 'new mzd-theme-green class added');

  // Unrecognized theme falls back to factory red
  hostOptions.onConfirmed({ theme: 'bogus-theme' });
  assert.equal(byId['mzd-tweaks-theme-common-css'], undefined, 'unrecognized theme removes theme-common.css');
  assert.equal(byId['mzd-tweaks-theme-color-css'], undefined, 'unrecognized theme removes theme-color.css');
  assert.equal(mockBody.className.indexOf('mzd-theme-'), -1, 'unrecognized theme adds no theme class');

  // Re-apply blue before testing glow and red fallback
  hostOptions.onConfirmed({ theme: 'blue' });
  assert.equal(mockBody.className.indexOf('mzd-theme-blue') !== -1, true);

  // Disable main_menu_coins_glow
  hostOptions.onConfirmed({ main_menu_coins_glow: false });
  assert.equal(mockBody.className.indexOf('mzd-coins-glow'), -1, 'mzd-coins-glow is removed from body');
  assert.equal(mockBody.className.indexOf('mzd-no-coins-glow') !== -1, true, 'mzd-no-coins-glow is added to body');

  // Switch back to factory red
  hostOptions.onConfirmed({ theme: 'red' });
  assert.equal(byId['mzd-tweaks-base-css'] !== undefined, true, 'mzd-tweaks.css remains loaded');
  assert.equal(byId['mzd-tweaks-theme-common-css'], undefined, 'theme-common.css is unloaded when theme is red');
  assert.equal(byId['mzd-tweaks-theme-color-css'], undefined, 'theme color css is unloaded when theme is red');
  assert.equal(mockBody.className.indexOf('mzd-no-coins-glow') !== -1, true, 'mzd-no-coins-glow persists in factory red');

  // Test main_menu_coins_layout DOM classes
  hostOptions.onConfirmed({ main_menu_coins_layout: 'flat' });
  assert.equal(mockBody.className.indexOf('mzd-layout-flat') !== -1, true, 'mzd-layout-flat is added when flat layout is enabled');
  hostOptions.onConfirmed({ main_menu_coins_layout: 'ellipse' });
  assert.equal(mockBody.className.indexOf('mzd-layout-flat'), -1, 'mzd-layout-flat is removed when ellipse layout is selected');

  // Test main_menu_coins_size DOM classes
  hostOptions.onConfirmed({ main_menu_coins_size: 80 });
  assert.equal(mockBody.className.indexOf('mzd-coins-80') !== -1, true, 'mzd-coins-80 is added for 80% size');
  assert.equal(mockBody.className.indexOf('mzd-coins-60'), -1, 'mzd-coins-60 is not present');
  hostOptions.onConfirmed({ main_menu_coins_size: 60 });
  assert.equal(mockBody.className.indexOf('mzd-coins-80'), -1, 'mzd-coins-80 is removed when switching to 60%');
  assert.equal(mockBody.className.indexOf('mzd-coins-60') !== -1, true, 'mzd-coins-60 is added for 60% size');
  hostOptions.onConfirmed({ main_menu_coins_size: 100 });
  assert.equal(mockBody.className.indexOf('mzd-coins-80'), -1, 'mzd-coins-80 is removed when reset to 100%');
  assert.equal(mockBody.className.indexOf('mzd-coins-60'), -1, 'mzd-coins-60 is removed when reset to 100%');
}

{
  // Deferred applyTheme when document.body is initially null attaches only one DOMContentLoaded listener
  const byId = {};
  const mockHead = {
    appendChild(el) {
      if (el.id) byId[el.id] = el;
      el.parentNode = mockHead;
      return el;
    },
    removeChild(el) {
      if (el.id) delete byId[el.id];
      el.parentNode = null;
      return el;
    }
  };
  const domListeners = [];
  const deferDoc = {
    head: mockHead,
    documentElement: mockHead,
    body: null,
    addEventListener(name, fn) {
      if (name === 'DOMContentLoaded') domListeners.push(fn);
    },
    createElement(tag) {
      return { tagName: tag, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k]; } };
    },
    getElementById(id) { return byId[id] || null; },
    getElementsByClassName() { return []; }
  };
  const deferWin = {
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, addEventListener() {},
    document: deferDoc,
    mzdTweaks: { theme: 'purple' },
    MzdGuiResidents: { register(id, factory) { deferWin.factory = factory; }, log() {} }
  };
  let deferHostOptions = null;
  vm.runInNewContext(settingsHostSource, { window: deferWin });
  const origCreate = deferWin.MzdSettingsHost.create;
  deferWin.MzdSettingsHost.create = (c, opts) => { deferHostOptions = opts; return origCreate(c, opts); };
  vm.runInNewContext(residentSource, { window: deferWin, document: deferDoc });

  // Trigger another applyTheme before DOMContentLoaded while body is still null
  deferWin.factory({
    view: () => null, onMessage() {}, onViewClose() {}, onDispose() {}, loadLanguage() {},
    onServiceReady() {}, createNativeMenu() { return { close() {}, check() {}, owns: () => false }; },
    log() {}, notify() {}, service: { request() {} }
  });
  deferHostOptions.onConfirmed({ theme: 'cyan' });
  assert.equal(domListeners.length, 1, 'attaches only a single DOMContentLoaded listener when body is null');

  deferDoc.body = { className: '' };
  domListeners[0]();
  assert.equal(deferDoc.body.className.indexOf('mzd-theme-cyan') !== -1, true, 'deferred DOMContentLoaded applies latest theme');
  assert.equal(byId['mzd-tweaks-theme-color-css'].getAttribute('data-theme'), 'cyan');
}

{
  // Theme swatch classes in _getListItem and updateItems use appData.page/appData.id, strip unconditionally, and log errors
  function SwatchList2Ctrl() {
    this.parentDiv = { className: 'TemplateWithStatusLeft List2Tmplt mzd-custom-menu' };
    this.dataList = { itemCount: 0, items: [] };
    this.items = [];
    this.init();
  }
  SwatchList2Ctrl.prototype.init = function () { this.properties = {}; };
  SwatchList2Ctrl.prototype._getListItem = function (listItem, dataListIndex) {
    return listItem;
  };
  SwatchList2Ctrl.prototype.updateItems = function () {
    return 'updated';
  };

  const swatchLogs = [];
  const swatchDoc = { head: { appendChild() {} }, documentElement: {}, createElement() { return {}; }, getElementsByClassName() { return []; } };
  const swatchWin = {
    List2Ctrl: SwatchList2Ctrl,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, addEventListener() {},
    MzdGuiResidents: { register() {}, log(id, msg) { swatchLogs.push([id, msg]); } }
  };
  vm.runInNewContext(settingsHostSource, { window: swatchWin });
  vm.runInNewContext(residentSource, { window: swatchWin, document: swatchDoc });

  const ctrl = new swatchWin.List2Ctrl();
  // Reordered 2-item theme subpage (not 9 items, not positional)
  ctrl.dataList = {
    itemCount: 2,
    items: [
      { appData: { page: 'theme', id: 'theme-cyan' } },
      { appData: { page: 'theme', id: 'theme-blue' } }
    ]
  };
  const li0 = ctrl._getListItem({ className: 'ListItem style03' }, 0);
  const li1 = ctrl._getListItem({ className: 'ListItem style03' }, 1);
  assert.equal(li0.className, 'ListItem style03 mzd-theme-row mzd-theme-row-cyan', '_getListItem applies cyan swatch by appData.id');
  assert.equal(li1.className, 'ListItem style03 mzd-theme-row mzd-theme-row-blue', '_getListItem applies blue swatch by appData.id');

  // Unrecognized theme id does not add swatch class and strips stale class
  ctrl.dataList = {
    itemCount: 1,
    items: [{ appData: { page: 'theme', id: 'theme-neon' } }]
  };
  const liInvalid = ctrl._getListItem(li0, 0);
  assert.equal(liInvalid.className, 'ListItem style03', '_getListItem strips stale swatch class on invalid theme id');

  // updateItems applies swatch classes and then strips them unconditionally when leaving theme page
  ctrl.dataList = {
    itemCount: 2,
    items: [
      { appData: { page: 'theme', id: 'theme-gold' } },
      { appData: { page: 'theme', id: 'theme-pink' } }
    ]
  };
  ctrl.items = [
    { ref: 0, domElt: { className: 'ListItem style03' } },
    { ref: 1, domElt: { className: 'ListItem style03' } }
  ];
  assert.equal(ctrl.updateItems(), 'updated');
  assert.equal(ctrl.items[0].domElt.className, 'ListItem style03 mzd-theme-row mzd-theme-row-gold');
  assert.equal(ctrl.items[1].domElt.className, 'ListItem style03 mzd-theme-row mzd-theme-row-pink');

  // Switching to non-theme page strips swatch classes via updateItems
  ctrl.dataList = {
    itemCount: 2,
    items: [
      { appData: { page: 'home', id: 'list_loop' } },
      { appData: { page: 'home', id: 'theme_menu' } }
    ]
  };
  ctrl.updateItems();
  assert.equal(ctrl.items[0].domElt.className, 'ListItem style03', 'updateItems strips swatch class when not on theme page');
  assert.equal(ctrl.items[1].domElt.className, 'ListItem style03', 'updateItems strips swatch class on all rows');

  // Non-custom menu does not receive swatch classes even if appData matches
  ctrl.parentDiv.className = 'TemplateWithStatusLeft List2Tmplt';
  ctrl.dataList = { itemCount: 1, items: [{ appData: { page: 'theme', id: 'theme-red' } }] };
  ctrl.items = [{ ref: 0, domElt: { className: 'ListItem style03 mzd-theme-row mzd-theme-row-red' } }];
  ctrl.updateItems();
  assert.equal(ctrl.items[0].domElt.className, 'ListItem style03', 'non-custom menu strips and never adds swatch classes');

  // Exceptions in _getListItem and updateItems are logged via MzdGuiResidents.log
  const throwingElt = {
    get className() { throw new Error('DOM class error'); },
    set className(_) {}
  };
  ctrl.parentDiv.className = 'TemplateWithStatusLeft List2Tmplt mzd-custom-menu';
  ctrl._getListItem(throwingElt, 0);
  ctrl.items = [{ ref: 0, domElt: throwingElt }];
  ctrl.updateItems();
  assert.equal(swatchLogs.length, 2, 'exceptions in _getListItem and updateItems are logged');
  assert.equal(swatchLogs[0][0], 'mzd-tweaks');
  assert(swatchLogs[0][1].indexOf('DOM class error') !== -1);
  assert.equal(swatchLogs[1][0], 'mzd-tweaks');
  assert(swatchLogs[1][1].indexOf('DOM class error') !== -1);
}

{
  // DialPad2 call button keeps DialPad_CallIcon.png in both focused and active states across all themes
  const themeCommonCss = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/theme-common.css'), 'utf8');
  assert(
    /body\[class\*="mzd-theme-"\]\s+\.DialPad2Ctrl\.DialpadStyle02\s+\.callBtn\.focused,\s*body\[class\*="mzd-theme-"\]\s+\.DialPad2Ctrl\.DialpadStyle02\s+\.callBtn\.active\s*\{[^}]*background-position:\s*center center,\s*center center\s*!important;[^}]*background-repeat:\s*no-repeat,\s*no-repeat\s*!important;/s.test(themeCommonCss),
    'theme-common.css keeps centered no-repeat layers on callBtn.focused and callBtn.active'
  );

  const themes = ['blue', 'cyan', 'gold', 'green', 'orange', 'pink', 'purple', 'silver'];
  for (const theme of themes) {
    const css = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/themes/theme-' + theme + '.css'), 'utf8');
    for (const state of ['focused', 'active']) {
      const ruleRe = new RegExp('body\\.mzd-theme-' + theme + '\\s+\\.DialPad2Ctrl\\.DialpadStyle02\\s+\\.callBtn\\.' + state + '\\s*\\{([^}]*)\\}');
      const match = css.match(ruleRe);
      assert(match, 'theme-' + theme + '.css defines .callBtn.' + state);
      const body = match[1];
      assert(
        body.includes('background-image: url(/jci/gui/common/controls/DialPad2/images/DialPad_CallIcon.png), -o-linear-gradient('),
        'theme-' + theme + '.css .callBtn.' + state + ' keeps DialPad_CallIcon.png with -o-linear-gradient'
      );
      assert(
        body.includes('background-image: url(/jci/gui/common/controls/DialPad2/images/DialPad_CallIcon.png), linear-gradient('),
        'theme-' + theme + '.css .callBtn.' + state + ' keeps DialPad_CallIcon.png with linear-gradient'
      );
    }
  }
  // Test Common.prototype.startTimedSbn hook for bluetooth_notification
  const calls = [];
  function MockCommon() {}
  MockCommon.prototype.startTimedSbn = function (uiaId, sbnId, type, props) {
    calls.push({ uiaId: uiaId, sbnId: sbnId, type: type, props: props });
  };
  const mockFw = { common: new MockCommon() };
  const page = residentPage({ bluetooth_notification: false }, { framework: mockFw, Common: MockCommon });

  // When bluetooth_notification is false, PhoneConnectionStatus and AudioConnectionStatus are suppressed:
  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneDisconnected' });
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioDisconnected' });
  assert.equal(calls.length, 0, 'Phone and Audio connection SBNs are suppressed when bluetooth_notification is false');

  // PairingSuccessStatus is NOT suppressed:
  mockFw.common.startTimedSbn('btpairing', 'PairingSuccessStatus', 'btConnecting', { text1Id: 'PairingSuccess' });
  assert.equal(calls.length, 1, 'PairingSuccessStatus is not suppressed');
  assert.equal(calls[0].sbnId, 'PairingSuccessStatus');

  // Non-Bluetooth SBN is NOT suppressed:
  mockFw.common.startTimedSbn('system', 'SomeSbn', 'typeE', {});
  assert.equal(calls.length, 2, 'Non-bluetooth SBN is not suppressed');

  // When bluetooth_notification is true, Phone and Audio connection SBNs pass through:
  page.win.mzdTweaks.bluetooth_notification = true;
  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  assert.equal(calls.length, 4, 'Phone and Audio connection SBNs pass through when bluetooth_notification is true');
  assert.equal(calls[2].sbnId, 'PhoneConnectionStatus');
  assert.equal(calls[3].sbnId, 'AudioConnectionStatus');
}

{
  // Test Object.getPrototypeOf(framework.common) fallback when Common is absent
  const calls = [];
  const commonProto = {
    startTimedSbn(uiaId, sbnId, type, props) {
      calls.push({ uiaId: uiaId, sbnId: sbnId, type: type, props: props });
    }
  };
  const mockFw = { common: Object.create(commonProto) };
  const page = residentPage({ bluetooth_notification: false }, { framework: mockFw });

  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  assert.equal(calls.length, 0, 'fallback prototype hook suppresses BT connection SBNs when Common is absent');

  mockFw.common.startTimedSbn('btpairing', 'PairingSuccessStatus', 'btConnecting', { text1Id: 'PairingSuccess' });
  assert.equal(calls.length, 1, 'fallback prototype hook passes non-connection SBNs');

  page.win.mzdTweaks.bluetooth_notification = true;
  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  assert.equal(calls.length, 2, 'fallback prototype hook passes BT connection SBNs when enabled');
}

{
  // Test Object.getPrototypeOf(framework.common) fallback when Common.prototype exists without startTimedSbn
  const calls = [];
  function EmptyCommon() {}
  const actualProto = {
    startTimedSbn(uiaId, sbnId, type, props) {
      calls.push({ uiaId: uiaId, sbnId: sbnId, type: type, props: props });
    }
  };
  const mockFw = { common: Object.create(actualProto) };
  const page = residentPage({ bluetooth_notification: false }, { framework: mockFw, Common: EmptyCommon });

  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  assert.equal(calls.length, 0, 'falls back to Object.getPrototypeOf(framework.common) when Common.prototype lacks startTimedSbn');
  assert.equal(actualProto._mzdTweaksBtHooked, true, 'actual prototype is marked hooked');
  assert.equal(EmptyCommon.prototype._mzdTweaksBtHooked, undefined, 'EmptyCommon.prototype is not marked hooked');

  page.win.mzdTweaks.bluetooth_notification = true;
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  assert.equal(calls.length, 1, 'fallback prototype hook passes BT connection SBNs when enabled');
}

{
  // Test framework.common own-property startTimedSbn when Common is absent
  const calls = [];
  const mockFw = {
    common: {
      startTimedSbn(uiaId, sbnId, type, props) {
        calls.push({ uiaId: uiaId, sbnId: sbnId, type: type, props: props });
      }
    }
  };
  const page = residentPage({ bluetooth_notification: false }, { framework: mockFw });

  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  mockFw.common.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  assert.equal(calls.length, 0, 'own-property framework.common.startTimedSbn suppresses BT connection SBNs');

  mockFw.common.startTimedSbn('system', 'SomeSbn', 'typeE', {});
  assert.equal(calls.length, 1, 'own-property hook passes non-BT SBNs');

  page.win.mzdTweaks.bluetooth_notification = true;
  mockFw.common.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  assert.equal(calls.length, 2, 'own-property hook passes BT connection SBNs when enabled');
}

{
  // Test framework.common own-property startTimedSbn when Common.prototype is ALSO hooked (no prototype shadowing bug)
  const protoCalls = [];
  const ownCalls = [];
  function ShadowCommon() {}
  ShadowCommon.prototype.startTimedSbn = function (uiaId, sbnId, type, props) {
    protoCalls.push({ uiaId: uiaId, sbnId: sbnId, type: type, props: props });
  };
  const fwCommon = new ShadowCommon();
  fwCommon.startTimedSbn = function (uiaId, sbnId, type, props) {
    ownCalls.push({ uiaId: uiaId, sbnId: sbnId, type: type, props: props });
  };
  const mockFw = { common: fwCommon };
  const page = residentPage({ bluetooth_notification: false }, { framework: mockFw, Common: ShadowCommon });

  assert.equal(ShadowCommon.prototype._mzdTweaksBtHooked, true, 'Common.prototype is hooked');
  assert.equal(Object.prototype.hasOwnProperty.call(fwCommon, '_mzdTweaksBtHooked'), true,
    'framework.common receives own _mzdTweaksBtHooked even when Common.prototype._mzdTweaksBtHooked is true');

  fwCommon.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  fwCommon.startTimedSbn('btpairing', 'AudioConnectionStatus', 'btConnecting', { text1Id: 'AudioConnected' });
  assert.equal(ownCalls.length, 0, 'own-property startTimedSbn suppresses BT connection SBNs even when Common.prototype is hooked');
  assert.equal(protoCalls.length, 0, 'prototype startTimedSbn is not called by own-property method');

  fwCommon.startTimedSbn('btpairing', 'PairingSuccessStatus', 'btConnecting', { text1Id: 'PairingSuccess' });
  assert.equal(ownCalls.length, 1, 'own-property hook passes non-connection SBNs');

  page.win.mzdTweaks.bluetooth_notification = true;
  fwCommon.startTimedSbn('btpairing', 'PhoneConnectionStatus', 'btConnecting', { text1Id: 'PhoneConnected' });
  assert.equal(ownCalls.length, 2, 'own-property hook passes BT connection SBNs when enabled');
}

// MainMenuCtrl custom order runtime test: _coins & DOM reordering, positional classes, native label/selectCallback, and live reset
{
  function makeTestEl(cls) {
    const el = {
      className: cls || '',
      children: [],
      style: {},
      offsetLeft: 0,
      offsetTop: 0,
      offsetWidth: 142,
      offsetHeight: 152,
      _listeners: {},
      appendChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        this.children.push(child);
        return child;
      },
      addEventListener(type, fn) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (!this._listeners[type]) return;
        this._listeners[type] = this._listeners[type].filter(f => f !== fn);
      }
    };
    el.classList = {
      add(c) {
        const parts = el.className ? el.className.split(/\s+/) : [];
        if (parts.indexOf(c) === -1) {
          parts.push(c);
          el.className = parts.join(' ');
        }
      },
      remove(c) {
        const parts = el.className ? el.className.split(/\s+/) : [];
        el.className = parts.filter(p => p !== c).join(' ');
      },
      contains(c) {
        const parts = el.className ? el.className.split(/\s+/) : [];
        return parts.indexOf(c) !== -1;
      }
    };
    return el;
  }

  const sentEvents = [];
  const locStrings = {
    Applications: 'Aplikacje',
    Entertainment: 'Rozrywka',
    Communication: 'Komunikacja',
    NavigationTitle: 'Nawigacja',
    Settings: 'Ustawienia'
  };
  let liveCtrl = null;
  const mockFw = {
    sendEventToMmui(uiaId, eventId, params) {
      sentEvents.push({ uiaId, eventId, params });
    },
    getAppInstance(id) {
      if (id === 'system') {
        return { _currentContextTemplate: { mainMenuControl: liveCtrl } };
      }
      return null;
    },
    localize: {
      getLocStr(app, id) {
        return locStrings[id] || id;
      }
    }
  };

  function FakeMainMenuCtrl(uiaId, parentDiv, controlId, properties) {
    this.uiaId = uiaId || 'system';
    this.controlId = controlId || 'MainMenuCtrl';
    this.properties = properties || {};
    this._coins = [
      { key: 'App', focusTranslateX: 30,  focusTranslateY: -53, hasFocus: false, nameId: 'Applications' },
      { key: 'Ent', focusTranslateX: -15, focusTranslateY: -30, hasFocus: false, nameId: 'Entertainment' },
      { key: 'Com', focusTranslateX: -15, focusTranslateY: -30, hasFocus: false, nameId: 'Communication' },
      { key: 'Nav', focusTranslateX: -15, focusTranslateY: -30, hasFocus: false, nameId: 'NavigationTitle' },
      { key: 'Set', focusTranslateX: -58, focusTranslateY: -53, hasFocus: false, nameId: 'Settings' }
    ];
    this._fullyHighlightedIndex = null;
    this._hitAreaComputes = 0;
    this.createStructure();
    if (parentDiv && parentDiv.appendChild) parentDiv.appendChild(this.divElt);
    this.init();
  }
  FakeMainMenuCtrl.prototype.createStructure = function () {
    this.divElt = makeTestEl('MainMenuCtrl');
    const ellipse = makeTestEl('MainMenuCtrlEllipse');
    this.divElt.appendChild(ellipse);
    for (let i = 0; i < this._coins.length; i++) {
      const key = this._coins[i].key;
      const coinDiv = makeTestEl('MainMenuCtrl' + key + 'Div');
      coinDiv.appendChild(makeTestEl('MainMenuCtrl' + key + 'Focus'));
      coinDiv.appendChild(makeTestEl('MainMenuCtrl' + key + 'Normal'));
      this._coins[i].div = coinDiv;
      this._coins[i].highlight = makeTestEl('MainMenuCtrl' + key + 'Highlight');
      this._coins[i].setHighlightEndBinder = this._setHighlightEnd.bind(this, i);
      coinDiv.addEventListener('OTransitionEnd', this._coins[i].setHighlightEndBinder, false);
    }
    this.divElt.appendChild(this._coins[1].highlight);
    this.divElt.appendChild(this._coins[2].highlight);
    this.divElt.appendChild(this._coins[3].highlight);
    this.divElt.appendChild(this._coins[1].div);
    this.divElt.appendChild(this._coins[2].div);
    this.divElt.appendChild(this._coins[3].div);
    this.divElt.appendChild(this._coins[4].highlight);
    this.divElt.appendChild(this._coins[4].div);
    this.divElt.appendChild(this._coins[0].highlight);
    this.divElt.appendChild(this._coins[0].div);
    this._iconNameDiv = makeTestEl('MainMenuCtrlIconName');
    this.divElt.appendChild(this._iconNameDiv);
  };
  FakeMainMenuCtrl.prototype.init = function () {
    for (let i = 0; i < this._coins.length; i++) {
      this._computeHitAreas(this._coins[i]);
    }
    this._setFocus(2);
  };
  FakeMainMenuCtrl.prototype._computeHitAreas = function (coin) {
    this._hitAreaComputes++;
    const slotMatch = coin.div.className.match(/\bmzd-coin-(\d)\b/);
    const slot = slotMatch ? Number(slotMatch[1]) : 1;
    const lefts = [-35, 105, 330, 549, 721];
    coin.div.offsetLeft = lefts[slot - 1];
    coin.normalHitArea = { x: coin.div.offsetLeft + 71, y: 200, r2: 4900 };
    coin.focusHitArea = { x: coin.div.offsetLeft + 71 + coin.focusTranslateX, y: 200 + coin.focusTranslateY, r2: 7056 };
    coin.currentHitArea = coin.normalHitArea;
  };
  FakeMainMenuCtrl.prototype._getFocus = function () {
    for (let i = 0; i < this._coins.length; i++) {
      if (this._coins[i].hasFocus) return i;
    }
    return -1;
  };
  FakeMainMenuCtrl.prototype._setFocus = function (idx) {
    for (let i = 0; i < this._coins.length; i++) {
      this._coins[i].hasFocus = (i === idx);
    }
  };
  FakeMainMenuCtrl.prototype._setHighlight = function (idx) {
    if (this._fullyHighlightedIndex !== idx) {
      this._fullyHighlightedIndex = null;
      let name = '';
      for (let i = 0; i < this._coins.length; i++) {
        if (i === idx) {
          this._coins[i].div.classList.add('MainMenuCtrlCoinFocus');
          this._coins[i].highlight.classList.add('Visible');
          this._coins[i].currentHitArea = this._coins[i].focusHitArea;
          name = mockFw.localize.getLocStr(this.uiaId, this._coins[i].nameId);
        } else if (this._coins[i].highlight.style.opacity !== '0') {
          this._coins[i].div.classList.remove('MainMenuCtrlCoinFocus');
          this._coins[i].highlight.classList.remove('Visible');
          this._coins[i].currentHitArea = this._coins[i].normalHitArea;
        }
      }
      if (name !== '') {
        this._iconNameDiv.innerHTML = name;
      }
    }
  };
  FakeMainMenuCtrl.prototype._setHighlightEnd = function (index) {
    this._fullyHighlightedIndex = index;
  };
  FakeMainMenuCtrl.prototype._offsetFocus = function (dir) {
    const d = (dir === -1 || dir === 'left') ? -1 : (dir === 1 || dir === 'right') ? 1 : 0;
    const next = Math.max(0, Math.min(4, this._getFocus() + d));
    if (next !== this._getFocus()) {
      this._setFocus(next);
      this._setHighlight(next);
    }
  };
  FakeMainMenuCtrl.prototype._invokeSelectCallback = function (index) {
    const icon = this._coins[index].key.toLowerCase();
    const eventMap = {
      app: 'SelectApplications',
      ent: 'SelectEntertainment',
      com: 'SelectCommunication',
      nav: 'SelectNavigation',
      set: 'SelectSettings'
    };
    mockFw.sendEventToMmui('system', eventMap[icon]);
  };
  FakeMainMenuCtrl.prototype.cleanUp = function () {
    for (let i = 0; i < this._coins.length; i++) {
      this._coins[i].div.removeEventListener('OTransitionEnd', this._coins[i].setHighlightEndBinder, false);
    }
  };

  const mockBody = { className: '' };
  const page = residentPage({
    main_menu_order_custom: true,
    main_menu_order: {
      main_menu_set: 0,
      main_menu_nav: 1,
      main_menu_com: 2,
      main_menu_ent: 3,
      main_menu_app: 4
    }
  }, {
    MainMenuCtrl: FakeMainMenuCtrl,
    framework: mockFw,
    body: mockBody
  });

  // sendEventToMmui is NOT wrapped for main menu order
  assert.equal(page.win.framework._mzdTweaksSendHooked, undefined, 'framework.sendEventToMmui is not wrapped');
  assert.equal(mockBody.className.indexOf('mzd-main-menu-custom') !== -1, true, 'body has mzd-main-menu-custom');

  const ctrl = new page.win.MainMenuCtrl('system', makeTestEl('MainMenuTmplt'), 'MainMenuCtrl', {});
  liveCtrl = ctrl;

  // _coins reordered to [Set, Nav, Com, Ent, App] with slot focusTranslate values
  assert.deepEqual(ctrl._coins.map(c => c.key), ['Set', 'Nav', 'Com', 'Ent', 'App']);
  assert.equal(ctrl._coins[0].focusTranslateX, 30);
  assert.equal(ctrl._coins[0].focusTranslateY, -53);
  assert.equal(ctrl._coins[4].focusTranslateX, -58);
  assert.equal(ctrl._coins[4].focusTranslateY, -53);

  // Positional classes applied to coin divs and highlights
  for (let s = 0; s < 5; s++) {
    assert(ctrl._coins[s].div.classList.contains('mzd-coin'), 'coin ' + s + ' has mzd-coin');
    assert(ctrl._coins[s].div.classList.contains('mzd-coin-' + (s + 1)), 'coin ' + s + ' has mzd-coin-' + (s + 1));
    assert(ctrl._coins[s].highlight.classList.contains('mzd-coin-highlight'), 'highlight ' + s + ' has mzd-coin-highlight');
    assert(ctrl._coins[s].highlight.classList.contains('mzd-coin-highlight-' + (s + 1)), 'highlight ' + s + ' has mzd-coin-highlight-' + (s + 1));
  }

  // DOM children really reordered in OEM z-order [1, 2, 3] highlights, [1, 2, 3] divs, [4], [0], IconName
  assert.deepEqual(
    ctrl.divElt.children.map(el => el.className.split(' ')[0]),
    [
      'MainMenuCtrlEllipse',
      'MainMenuCtrlNavHighlight', 'MainMenuCtrlComHighlight', 'MainMenuCtrlEntHighlight',
      'MainMenuCtrlNavDiv', 'MainMenuCtrlComDiv', 'MainMenuCtrlEntDiv',
      'MainMenuCtrlAppHighlight', 'MainMenuCtrlAppDiv',
      'MainMenuCtrlSetHighlight', 'MainMenuCtrlSetDiv',
      'MainMenuCtrlIconName'
    ]
  );

  // Initial focus is slot 2 (Com), navigating left to slot 0 highlights Set natively
  ctrl._setHighlight(2);
  assert.equal(ctrl._iconNameDiv.innerHTML, 'Komunikacja');
  ctrl._offsetFocus(-1);
  assert.equal(ctrl._getFocus(), 1);
  assert.equal(ctrl._iconNameDiv.innerHTML, 'Nawigacja');
  ctrl._offsetFocus(-1);
  assert.equal(ctrl._getFocus(), 0);
  assert.equal(ctrl._iconNameDiv.innerHTML, 'Ustawienia');
  assert(ctrl._coins[0].div.classList.contains('MainMenuCtrlCoinFocus'));

  // Selecting slot 0 invokes SelectSettings natively via _coins[0].key
  ctrl._invokeSelectCallback(0);
  assert.deepEqual(sentEvents[0], { uiaId: 'system', eventId: 'SelectSettings', params: undefined });

  // Live toggle back to default order reorders _coins, DOM, classes, hit areas, and OTransitionEnd binders
  page.win.mzdTweaks.main_menu_order_custom = false;
  const computesBefore = ctrl._hitAreaComputes;
  page.win.mzdTweaksApplyMainMenuOrder();
  assert.equal(mockBody.className.indexOf('mzd-main-menu-custom'), -1, 'mzd-main-menu-custom removed');
  assert.deepEqual(ctrl._coins.map(c => c.key), ['App', 'Ent', 'Com', 'Nav', 'Set']);
  assert.equal(ctrl._iconNameDiv.innerHTML, 'Aplikacje', 'slot 0 now shows Applications natively');
  assert(ctrl._coins[0].div.classList.contains('mzd-coin-1'));
  assert(ctrl._coins[4].div.classList.contains('mzd-coin-5'));
  assert(ctrl._hitAreaComputes > computesBefore, 'hit areas recomputed on live reorder');
  assert.deepEqual(
    ctrl.divElt.children.map(el => el.className.split(' ')[0]),
    [
      'MainMenuCtrlEllipse',
      'MainMenuCtrlEntHighlight', 'MainMenuCtrlComHighlight', 'MainMenuCtrlNavHighlight',
      'MainMenuCtrlEntDiv', 'MainMenuCtrlComDiv', 'MainMenuCtrlNavDiv',
      'MainMenuCtrlSetHighlight', 'MainMenuCtrlSetDiv',
      'MainMenuCtrlAppHighlight', 'MainMenuCtrlAppDiv',
      'MainMenuCtrlIconName'
    ]
  );

  // applyTheme recomputes hit areas AND restores focus/highlight state on live MainMenuCtrl
  {
    let setFocusCalls = 0;
    let setHighlightCalls = 0;
    const origSetFocus = ctrl._setFocus;
    const origSetHighlight = ctrl._setHighlight;
    ctrl._setFocus = function (idx) {
      setFocusCalls++;
      return origSetFocus.call(this, idx);
    };
    ctrl._setHighlight = function (idx) {
      setHighlightCalls++;
      return origSetHighlight.call(this, idx);
    };
    const computesBeforeTheme = ctrl._hitAreaComputes;
    page.ctx.handlers.ready();
    page.ctx.requests[0].cb(null, { settings: { main_menu_coins_layout: 'flat' } });
    assert.equal(mockBody.className.indexOf('mzd-layout-flat') !== -1, true, 'mzd-layout-flat applied');
    assert(ctrl._hitAreaComputes > computesBeforeTheme, 'applyTheme recomputed hit areas');
    assert.equal(setFocusCalls, 1, 'applyTheme restored focus');
    assert.equal(setHighlightCalls, 1, 'applyTheme re-applied highlight');
    assert.equal(ctrl._coins[0].currentHitArea, ctrl._coins[0].focusHitArea, 'applyTheme restored focusHitArea');
    ctrl._setFocus = origSetFocus;
    ctrl._setHighlight = origSetHighlight;
  }

  // Rebound OTransitionEnd fires with updated slot index and cleanUp removes all listeners
  ctrl._coins[0].div._listeners.OTransitionEnd[0]();
  assert.equal(ctrl._fullyHighlightedIndex, 0);
  ctrl.cleanUp();
  for (let s = 0; s < 5; s++) {
    assert.equal(ctrl._coins[s].div._listeners.OTransitionEnd.length, 0, 'OTransitionEnd listener cleaned up for slot ' + s);
  }
}

// CSS positional contract: mzd-tweaks.css, theme-common.css, and themes/*.css do not couple placement/themes to icon names
{
  const mzdCss = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/mzd-tweaks.css'), 'utf8');
  const themeCommonCss = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/theme-common.css'), 'utf8');
  assert(!/\.MainMenuCtrl(App|Ent|Com|Nav|Set)(Div|Highlight)\b/.test(mzdCss),
    'mzd-tweaks.css uses slot classes (.mzd-coin-1..5) instead of icon-named Div/Highlight selectors');
  assert(!/\.MainMenuCtrl(App|Ent|Com|Nav|Set)(Div|Highlight|Normal)\b/.test(themeCommonCss),
    'theme-common.css uses positional classes instead of icon-named Div/Highlight/Normal selectors');
  for (let i = 1; i <= 5; i++) {
    assert(mzdCss.includes('.mzd-coin-' + i), 'mzd-tweaks.css styles .mzd-coin-' + i);
    assert(mzdCss.includes('.mzd-coin-highlight-' + i), 'mzd-tweaks.css styles .mzd-coin-highlight-' + i);
  }
  for (const baseImg of ['HomeApps_Focus_base.png', 'HomeAudio_Focus_base.png', 'HomeCom_Focus_base.png', 'HomeNav_Focus_base.png', 'HomeSet_Focus_base.png']) {
    assert(themeCommonCss.includes(baseImg), 'theme-common.css includes :after overlay for ' + baseImg);
  }
  const themes = ['blue', 'cyan', 'gold', 'green', 'orange', 'pink', 'purple', 'silver'];
  for (const theme of themes) {
    const css = fs.readFileSync(path.join(repo, 'usb/tweaks/mzd-tweaks/assets/themes/theme-' + theme + '.css'), 'utf8');
    assert(!/\.MainMenuCtrl(App|Ent|Com|Nav|Set)/.test(css),
      'theme-' + theme + '.css contains no icon-name coin selectors');
    assert(css.includes('.MainMenuCtrl .mzd-coin > div[class$="Focus"]'),
      'theme-' + theme + '.css styles focused coins generically');
  }

  // CSS specificity & decoupling checks
  assert(!/body\.mzd-main-menu-custom\s+\.MainMenuCtrl\s+\.mzd-coin-/.test(mzdCss),
    'mzd-tweaks.css scopes custom-order slot overrides with :not(.mzd-layout-flat)');
  assert(mzdCss.includes('body.mzd-layout-flat .MainMenuCtrl .mzd-coin.MainMenuCtrlCoinFocus'),
    'flat layout focus selector includes .MainMenuCtrl .mzd-coin');
  assert(mzdCss.includes('body.mzd-layout-flat.mzd-coins-80 .MainMenuCtrl .mzd-coin.MainMenuCtrlCoinFocus'),
    'flat + 80% focus selector outranks .mzd-coin');
  assert(mzdCss.includes('body.mzd-layout-flat.mzd-coins-60 .MainMenuCtrl .mzd-coin.MainMenuCtrlCoinFocus'),
    'flat + 60% focus selector outranks .mzd-coin');
}

// initCurrentOrder deterministic tie-breaker when duplicate order values exist
{
  const page = viewPage();
  page.respond({
    main_menu_order_custom: true,
    'main_menu_order.main_menu_app': 1,
    'main_menu_order.main_menu_ent': 1,
    'main_menu_order.main_menu_com': 0,
    'main_menu_order.main_menu_nav': 2,
    'main_menu_order.main_menu_set': 3
  });
  page.select(4);
  const rows = page.menu().rows.slice(2).map(r => r.key);
  assert.deepEqual(rows, [
    'mm_main_menu_com',
    'mm_main_menu_app',
    'mm_main_menu_ent',
    'mm_main_menu_nav',
    'mm_main_menu_set'
  ], 'initCurrentOrder breaks ties deterministically by allItems index');
}

console.log('MZD_TWEAKS_SETTINGS_PASSED: boot globals, runtime status-bar formats and AA/CarPlay fallback, date modes and sub-page, month names and orders, weekday translations without Intl, no unconfirmed state, failed save restored, audio order subpage with deferred save, resort confirmation.');
