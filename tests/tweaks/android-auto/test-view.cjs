const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');

const aaRoot = path.resolve(__dirname, '../../../usb/tweaks/android-auto');
const repo = path.resolve(aaRoot, '../../..');
const residentSource = fs.readFileSync(path.join(aaRoot, 'assets/resident.js'), 'utf8');
const viewSource = fs.readFileSync(path.join(aaRoot, 'assets/view.js'), 'utf8');

const queue = [];
const hostEvents = {};
const viewEvents = {};
const timers = new Map();
let timer = 0, writes = 0, reboots = 0, rebootError = null, control = null, dialogConfig = null, dialogsCreated = 0, dialogFailure = null;
let created = 0, destroyed = 0, attached = true, sb = 'Applications';

function element(tagName) {
    return {
        tagName: tagName || 'div',
        children: [],
        style: { cssText: '' },
        className: '',
        attributes: {},
        textContent: '',
        appendChild(e) { e.parentNode = this; this.children.push(e); },
        removeChild(e) { this.children.splice(this.children.indexOf(e), 1); e.parentNode = null; },
        get firstChild() { return this.children[0] || null; },
        set innerHTML(v) { this.children = []; },
        setAttribute(k, v) { this.attributes[k] = v; }
    };
}

function findElements(node, className, found = []) {
    if (node.className === className) { found.push(node); }
    for (const child of node.children) { findElements(child, className, found); }
    return found;
}

function findElement(node, className) {
    return findElements(node, className)[0] || null;
}

const status = element(), rootNode = element(), frame = element();
rootNode.style.cssText = 'old-style';
rootNode.appendChild(frame);

const head = element('head'), body = element('body');
const document = {
    body: body,
    getElementById: () => status,
    getElementsByTagName: name => name === 'head' ? [head] : name === 'iframe' ? [frame] : [],
    createElement: tagName => element(tagName)
};
let lastSbn = null;
const sbns = [];
let backFocused = false;
const common = {
    setSbName: v => { sb = v; },
    setSbNameId: (app, id) => { sb = id; },
    startTimedSbn: (uiaId, sbnId, type, props) => {
        lastSbn = { uiaId: uiaId, sbnId: sbnId, type: type, props: props };
        sbns.push(lastSbn);
    },
    // Mirrors the OEM LeftBtnCtrl/ButtonCtrl responses.
    leftBtn: {
        btnInstance: {
            get hasFocus() { return backFocused; }
        },
        handleControllerEvent(event) {
            if (event === 'acceptFocusFromRight' || event === 'acceptFocusInit') {
                backFocused = true;
                return 'consumed';
            }
            if (event === 'lostFocus') {
                backFocused = false;
                return 'consumed';
            }
            if (!backFocused) { return 'ignored'; }
            if (event === 'right') { return 'giveFocusRight'; }
            if (event === 'down') { return 'giveFocusDown'; }
            if (event === 'cw') { return 'giveFocusCw'; }
            if (event === 'select') {
                fw.sendEventToMmui('common', 'Global.GoBack');
                return 'consumed';
            }
            return 'ignored';
        }
    }
};

const appsTemplate = {
    divElt: { style: { visibility: 'hidden' } },
    list2Ctrl: { setLineNumbers() { this.restored = true; } },
    hasFocus: true,
    handleControllerEvent(event) {
        if (event === 'acceptFocusFromLeft') { this.hasFocus = true; }
        if (event === 'lostFocus') { this.hasFocus = false; }
        return 'consumed';
    }
};

const originalSend = () => {};
const fw = {
    common: common,
    _frameworkState: 'idle',
    _templatesLoaded: {},
    _controlsLoaded: {},
    _processedFilePaths: {},
    registerCtrlLoaded(name) {
        this._controlsLoaded[name] = { isLoaded: true, nameCounter: 0 };
    },
    registerTmpltLoaded(name) {
        this._templatesLoaded[name] = { isLoaded: true, nameCounter: 0 };
    },
    getCurrentApp: () => 'system',
    getCurrCtxtId: () => 'Applications',
    getAppInstance: () => ({ _currentContextTemplate: appsTemplate }),
    sendEventToMmui: originalSend,
    instantiateControl(app, parent, type, props) {
        assert.equal(type, 'List2Ctrl');
        assert.equal(props.titleConfiguration, 'noTitle');
        assert.equal(props.numberedList, true);
        assert(parent.className.indexOf('TemplateWithStatusLeft List2Tmplt') === 0);
        created++;
        control = {
            props: props,
            rendered: true,
            focus: props.focussedItem || 0,
            hasFocus: false,
            dataList: props.dataList,
            handleControllerEvent(event) {
                if (event === 'acceptFocusInit') {
                    this.hasFocus = true;
                }
                if (event === 'leftStart') { return 'giveFocusLeft'; }
                if (event === 'acceptFocusFromLeft' || event === 'acceptFocusFromRight') {
                    this.hasFocus = true;
                    return 'consumed';
                }
                if (event === 'lostFocus') {
                    this.hasFocus = false;
                    return 'consumed';
                }
                if (event === 'cw' || event === 'down') {
                    this.focus = (this.focus + 1) % this.dataList.items.length;
                }
                if (event === 'ccw' || event === 'up') {
                    this.focus = (this.focus + this.dataList.items.length - 1) % this.dataList.items.length;
                }
                if (event === 'select') {
                    props.selectCallback(this, this.dataList.items[this.focus].appData);
                }
            },
            getContextCapture() {
                return { hasFocus: this.hasFocus, focussedItem: this.focus, topItem: 0 };
            },
            restoreContext(c) {
                this.focus = c.focussedItem;
            },
            setDataList(d) {
                this.dataList = d;
                this.rendered = false;
            },
            setDataListAndUpdateItems(d) {
                this.dataList = d;
                this.rendered = true;
            }
        };
        return control;
    },
    instantiateTemplate(app, parent, type, props) {
        assert.equal(type, 'Dialog3Tmplt');
        assert.equal(this._templatesLoaded.Dialog3Tmplt.isLoaded, true, 'OEM template assets are registered before instantiation');
        assert.equal(this._frameworkState, 'idle', 'Instantiating a preloaded dialog does not change framework state');
        assert.equal(parent.parentNode, body, 'OEM dialog root is a body-level overlay');
        if (dialogFailure) {
            const message = dialogFailure;
            dialogFailure = null;
            throw new Error(message);
        }
        dialogsCreated++;
        dialogConfig = props.Dialog3Ctrl;
        const buttons = [dialogConfig.buttonConfig.button1, dialogConfig.buttonConfig.button2];
        let dialogFocus = dialogConfig.initialFocus || 0;
        const dialogElement = element();
        dialogElement.className = 'TemplateFull Dialog3Tmplt';
        parent.appendChild(dialogElement);
        return {
            divElt: dialogElement,
            dialog3Ctrl: {},
            cleanUp() {},
            handleControllerEvent(event) {
                if (event === 'right' || event === 'down' || event === 'cw') {
                    dialogFocus = 1;
                }
                if (event === 'left' || event === 'up' || event === 'ccw') {
                    dialogFocus = 0;
                }
                if (event === 'select') {
                    dialogConfig.defaultSelectCallback(this, buttons[dialogFocus].appData);
                }
            }
        };
    },
    destroyControl(c) {
        destroyed++;
        if (control === c) { control = null; }
    }
};

const ASSET_REGISTRATIONS = {
    'ButtonCtrl.js': ['registerCtrlLoaded', 'ButtonCtrl'],
    'Dialog3Ctrl.js': ['registerCtrlLoaded', 'Dialog3Ctrl'],
    'Dialog3Tmplt.js': ['registerTmpltLoaded', 'Dialog3Tmplt']
};
head.appendChild = function (node) {
    node.parentNode = head;
    head.children.push(node);
    if (node.tagName === 'script') {
        const file = node.src.substring(node.src.lastIndexOf('/') + 1);
        const registration = ASSET_REGISTRATIONS[file];
        assert(registration, 'Unexpected Mazda dialog asset: ' + node.src);
        fw[registration[0]](registration[1]);
    }
    node.onload();
};

let intervalsStarted = 0, intervalsCleared = 0;
const host = {
    location: { hostname: 'localhost', origin: undefined },
    framework: fw,
    addEventListener: (n, f) => { hostEvents[n] = f; },
    removeEventListener: n => { delete hostEvents[n]; },
    setTimeout: (f, ms) => {
        timers.set(++timer, { f: f, ms: ms });
        return timer;
    },
    clearTimeout: n => timers.delete(n),
    setInterval: f => { intervalsStarted++; host.refresh = f; return intervalsStarted; },
    clearInterval: () => { intervalsCleared++; delete host.refresh; }
};

const viewMessages = [];
const parent = {
    postMessage: data => {
        viewMessages.push(data.type);
        queue.push(() => {
            if (hostEvents.message) {
                hostEvents.message({ source: view, data: data });
            }
        });
    }
};

const view = {
    parent: parent,
    location: { hash: '#mzdgui=fixture-token' },
    addEventListener: (n, f) => (viewEvents[n] || (viewEvents[n] = [])).push(f),
    removeEventListener: (n, f) => {
        if (viewEvents[n]) {
            viewEvents[n] = viewEvents[n].filter(x => x !== f);
            if (!viewEvents[n].length) delete viewEvents[n];
        }
    },
    setTimeout: host.setTimeout,
    clearTimeout: host.clearTimeout,
    postMessage: (data, target) => {
        assert.equal(target, '*', 'Wildcard target required for file-origin postMessage');
        queue.push(() => {
            for (const f of (viewEvents.message || []).slice()) {
                f({ source: parent, data: data });
            }
        });
    }
};

frame.contentWindow = view;

let savedSettings = {
    resolution_dpi: 141,
    touch: true,
    hud: true,
    hud_transport: 'svcnavi',
    force_street_name: false,
    hud_fold_latin: true,
    use_protocol_v1_6: true,
    roundabout_prepend_exit_number: false,
    hud_maneuver_max_distance_m: 0,
    compass_always_on: false,
    bt_pairing_bypass_all_devices: false,
    bt_pairing_show_device_notification: false,
    mute_pauses_phone: true,
    unmute_starts_playback: false,
    block_headunit_media_play: true,
    aa_audio_low_latency: false
};
// Like entry.lua: a key's baseline is its value before its first write through
// the service, and a reboot is required while a written key differs from it.
const applied = {};
function writeSetting(key, value) {
    if (!(key in applied)) { applied[key] = savedSettings[key]; }
    savedSettings[key] = value;
}
function serviceResult() {
    return {
        success: true,
        settings: Object.assign({}, savedSettings),
        limits: { resolution_dpi: { min: 100, max: 160, step: 1 } },
        unavailable: {},
        rebootRequired: Object.keys(applied).some(k => applied[k] !== savedSettings[k])
    };
}
const serviceCalls = [];
let viewAttached = false;

const resident = {
    onServiceReady: fn => { resident.reconnected = fn; },
    view: () => viewAttached ? { source: view, frame: frame, token: 'fixture-token' } : null,
    onMessage: fn => { hostEvents.message = fn; },
    onViewClose: fn => { resident.closed = fn; },
    onDispose: fn => { hostEvents.unload = fn; },
    service: {
        request(op, args, cb) {
            serviceCalls.push(op);
            queue.push(() => {
                if (op === 'get') {
                    cb(null, serviceResult());
                } else if (op === 'set') {
                    writes++;
                    writeSetting(args.key, args.value);
                    cb(null, serviceResult());
                } else if (op === 'reboot') {
                    reboots++;
                    if (rebootError) { cb(rebootError); } else { cb(null, { success: true }); }
                } else {
                    throw Error('Unexpected operation: ' + op);
                }
            });
        }
    }
};

// Saves sent while holdService is set wait in heldCallbacks; a held save is
// written only when its callback succeeds.
let holdService = false;
const heldCallbacks = [];
const origServiceRequest = resident.service.request;
const holdRequest = function (op, args, cb) {
    if (holdService && op === 'set') {
        queue.push(() => {
            writes++;
            heldCallbacks.push(err => {
                if (err) {
                    cb(err);
                } else {
                    writeSetting(args.key, args.value);
                    cb(null, serviceResult());
                }
            });
        });
    } else {
        origServiceRequest.call(this, op, args, cb);
    }
};
function holdSaves() {
    holdService = true;
    resident.service.request = holdRequest;
}
function releaseSave(error) {
    holdService = false;
    heldCallbacks.shift()(error);
    flush();
    resident.service.request = origServiceRequest;
}

const hostContext = {
    window: host,
    document: document
};
document.documentElement = { contains: () => attached };
vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/residents.js'), 'utf8'), hostContext);
vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/settings-host.js'), 'utf8'), hostContext);
const residentsApi = host.MzdGuiResidents;
resident.createNativeMenu = opts => residentsApi.createNativeMenu(opts);
resident.notify = (text, isError) => residentsApi.notify('android-auto', text, isError);
resident.log = msg => residentsApi.log('android-auto', msg);
host.MzdGuiResidents = {
    ...residentsApi,
    register(id, fn) {
        assert.equal(id, 'android-auto');
        fn(resident);
    }
};

// Run resident script
vm.runInNewContext(residentSource, hostContext);
assert.equal(host.AaNativeMenu, undefined, 'No global namespace pollution');
assert.equal(intervalsStarted, 0, 'Polling interval not started at resident registration');
resident.reconnected(); // the service becomes ready at boot
assert.deepEqual(serviceCalls, [], 'No settings are read before the view opens');
viewAttached = true;

// Run SDK
vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/sdk.js'), 'utf8'), { window: view });
vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/settings-view.js'), 'utf8'), { window: view, document: document });

// Run view script
vm.runInNewContext(viewSource, { window: view, document: document });

// Deliver i18n dictionary to SDK
let dictionary;
vm.runInNewContext(fs.readFileSync(path.join(aaRoot, 'assets/i18n.js'), 'utf8'), {
    window: {
        MzdGuiI18n: {
            register(id, value) { dictionary = value; }
        }
    }
});
const texts = dictionary.languages.en_US;
for (const [locale, language] of Object.entries(dictionary.languages)) {
    for (const key of ['reboot', 'rebootQuestion', 'rebootFallback', 'always']) {
        assert.equal(typeof language[key], 'string', locale + ' has the ' + key + ' translation');
    }
    for (const key of ['default', 'rebootNotice', 'rebootError']) {
        assert.equal(Object.prototype.hasOwnProperty.call(language, key), false, locale + ' has no obsolete ' + key + ' text');
    }
    if (locale.indexOf('en_') !== 0) {
        assert.notEqual(language.rebootQuestion, texts.rebootQuestion, locale + ' has a translated reboot question');
    }
    assert.equal(language.rebootFallback.length <= 48, true, locale + ' reboot fallback fits a short notification');
}
assert.equal(texts.reboot, 'Reboot to apply changes');
assert.equal(texts.rebootQuestion, 'Do you want to reboot MZD to apply Android Auto settings?');
assert.equal(texts.rebootFallback, 'Hold NAV + MUTE to reboot');
assert.equal(texts.always, 'Always');

// English fallbacks in the scripts match en_US
for (const [, key, fallback] of viewSource.matchAll(/tr\('([a-zA-Z0-9_]+)', '([^']*)'\)/g)) {
    assert.equal(fallback, texts[key], 'view.js fallback for ' + key + ' matches en_US');
}
for (const [name, key] of Object.entries({ saveError: 'saveError', reboot: 'reboot', rebootFallback: 'rebootFallback' })) {
    assert(residentSource.includes(name + ": '" + texts[key] + "'"), 'resident.js default for ' + name + ' matches en_US');
}

for (const fn of viewEvents.message.slice()) {
    fn({
        source: parent,
        data: {
            type: 'mzd-gui-language',
            token: 'fixture-token',
            value: { language: 'en_US', direction: 'ltr', texts: texts }
        }
    });
}

function flush() {
    let n = 0;
    while (queue.length) {
        assert(++n < 200, 'message loop safety check');
        queue.shift()();
    }
    const ready = [...timers.entries()].filter(([id, t]) => t.ms === 0);
    for (const [id, t] of ready) {
        timers.delete(id);
        t.f();
    }
    if (queue.length) flush();
}

function click(i) {
    control.focus = i;
    control.props.selectCallback(control, control.dataList.items[i].appData);
    flush();
}

function input(action, phase = 'step') {
    for (const f of viewEvents.message.slice()) {
        f({ source: parent, data: { type: 'mzd-gui-input', token: 'fixture-token', action: action, phase: phase } });
    }
    flush();
}

function residentMessage(data) {
    hostEvents.message({ source: view, data: Object.assign({ token: 'fixture-token' }, data) });
    flush();
}

const rebootRow = () => control.dataList.items[16];
const dpiRow = () => control.dataList.items[0];
const dialogs = () => findElements(body, 'TemplateFull Dialog3Tmplt');

function stepDpi(val, isFinal = true) {
    control.focus = 0;
    control.dataList.items[0].value = val;
    control.props.selectCallback(control, control.dataList.items[0].appData, { value: val, finalAdjustment: isFinal });
    flush();
}

// 1. Initial load
flush();
assert.equal(intervalsStarted, 1, 'Polling interval started on view open');
assert.equal(sb, 'Android Auto Settings');
assert.equal(control.dataList.items.length, 17);
assert.equal(control.props.smallItemText, true, 'AA settings use the Safety-tab compact text size');
assert.equal(control.hasFocus, true, 'The settings list takes focus when it opens');

// Check row 0 (resolution_dpi): styleStep at top of menu
assert.equal(dpiRow().label1, 'Resolution DPI');
assert.equal(dpiRow().itemStyle, 'styleStep');
assert.equal(dpiRow().value, 141);
assert.equal(dpiRow().min, 100);
assert.equal(dpiRow().max, 160);
assert.equal(dpiRow().increment, 1);
assert.equal(dpiRow().disabled, false);
assert.equal(dpiRow().image1, '');

// Check row 1 (touch): boolean toggle -> styleOnOff, value 1 (on)
assert.equal(control.dataList.items[1].text1, 'Touchscreen in Android Auto');
assert.equal(control.dataList.items[1].itemStyle, 'styleOnOff');
assert.equal(control.dataList.items[1].value, 1);
assert.equal(control.dataList.items[1].checked, true);
assert.equal(control.dataList.items[1].hasCaret, false);

// Check row 3 (hud_transport): styleOnOff, value 1 (svcnavi is on)
assert.equal(control.dataList.items[3].text1, 'Show speed limit with Nav SD');
assert.equal(control.dataList.items[3].itemStyle, 'styleOnOff');
assert.equal(control.dataList.items[3].value, 1);
assert.equal(control.dataList.items[3].checked, true);

// Check row 8 (hud_maneuver_max_distance_m): style06 with label1="Always" and hasCaret=true
assert.equal(control.dataList.items[8].text1, 'Show HUD turns within');
assert.equal(control.dataList.items[8].itemStyle, 'style06');
assert.equal(control.dataList.items[8].label1, 'Always');
assert.equal(control.dataList.items[8].hasCaret, true);

// 1b. Reboot uses the OEM reset icon and is disabled until a change is saved
assert.equal(rebootRow().text1, 'Reboot to apply changes');
assert.equal(rebootRow().image1, 'common/images/icons/IcnListSynchronize_En.png');
assert.equal(rebootRow().disabled, true, 'Reboot is disabled before any setting changes');
click(16);
assert.equal(dialogConfig, null, 'A disabled reboot row does not open the confirmation dialog');

// 1c. Resolution DPI stepping, deferred save, spinner, and reboot requirement
// Turning rotary knob without finalAdjustment updates value locally but defers save
stepDpi(122, false);
assert.equal(dpiRow().value, 122);
assert.equal(writes, 0, 'In-flight adjust does not send save immediately');
assert.equal(dpiRow().disabled, false);
assert.equal(dpiRow().image1, '');

// Stepping with isFinal=true (pressing Enter / clicking knob) triggers the save
holdSaves();
stepDpi(122, true);
assert.equal(writes, 1);
assert.equal(dpiRow().disabled, true, 'DPI row disabled while save in progress');
assert.equal(dpiRow().image1, 'common/controls/List2/images/IcnStatBgFunctions_Refreshing_01.png', 'DPI row shows spinner during save');
assert.equal(rebootRow().disabled, true, 'Reboot row stays disabled while DPI save is in progress');
assert.equal(control.dataList.items[1].disabled, false, 'Other settings stay usable while DPI saves');
assert.equal(control.dataList.items[1].image1, '', 'Only the saving DPI row shows the spinner');
releaseSave();
assert.equal(savedSettings.resolution_dpi, 122);
assert.equal(dpiRow().disabled, false, 'DPI row re-enabled after save completes');
assert.equal(dpiRow().image1, '', 'DPI row spinner removed after save completes');
assert.equal(rebootRow().disabled, false, 'Changing DPI enables reboot');

// Stepping without finalAdjustment, then losing secondary focus (+/- deactivation) commits save
stepDpi(135, false);
assert.equal(dpiRow().value, 135);
assert.equal(writes, 1, 'In-flight adjust does not save yet');
holdSaves();
viewEvents.message.forEach(fn => fn({
    source: view.parent,
    data: { type: 'aa-native-focus', token: 'fixture-token', index: 0, secondary: false }
}));
flush();
assert.equal(writes, 2, 'Exiting secondary multicontroller triggers DPI save');
assert.equal(dpiRow().image1, 'common/controls/List2/images/IcnStatBgFunctions_Refreshing_01.png', 'DPI row shows left spinner during save');
releaseSave();
assert.equal(savedSettings.resolution_dpi, 135);
assert.equal(dpiRow().image1, '', 'Spinner removed after save');

// Stepping without finalAdjustment, then moving focus to row 1 commits save
stepDpi(138, false);
assert.equal(dpiRow().value, 138);
assert.equal(writes, 2);
holdSaves();
viewEvents.message.forEach(fn => fn({
    source: view.parent,
    data: { type: 'aa-native-focus', token: 'fixture-token', index: 1 }
}));
flush();
assert.equal(writes, 3, 'Moving focus away from row 0 triggers DPI save');
releaseSave();
assert.equal(savedSettings.resolution_dpi, 138);

// Stepping DPI back to baseline (141) disables reboot again
stepDpi(141, true);
assert.equal(writes, 4);
assert.equal(savedSettings.resolution_dpi, 141);
assert.equal(rebootRow().disabled, true, 'Restoring boot DPI disables reboot row');

// Unavailable Resolution DPI disables row
let customServiceResult = null;
const origResultFn = serviceResult;
serviceResult = () => customServiceResult || origResultFn();
customServiceResult = {
    success: true,
    settings: Object.assign({}, savedSettings),
    limits: {},
    unavailable: { resolution_dpi: 'Missing settings.conf' },
    rebootRequired: false
};
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(dpiRow().disabled, true, 'Unavailable DPI disables the stepper row');
click(0);
assert.equal(writes, 4, 'Clicking disabled DPI row does not trigger save');
customServiceResult = null;
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(dpiRow().disabled, false, 'Available DPI restores row enablement');

// The DPI range comes from the service limits, not from the view
customServiceResult = {
    success: true,
    settings: Object.assign({}, savedSettings),
    limits: { resolution_dpi: { min: 120, max: 150, step: 5 } },
    unavailable: {},
    rebootRequired: false
};
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(dpiRow().min, 120, 'The stepper minimum follows the service');
assert.equal(dpiRow().max, 150, 'The stepper maximum follows the service');
assert.equal(dpiRow().increment, 5, 'The stepper increment follows the service');
assert.equal(dpiRow().value, 141);
stepDpi(155, true);
assert.equal(writes, 4, 'A value above the service maximum is never saved');
stepDpi(110, true);
assert.equal(writes, 4, 'A value below the service minimum is never saved');
customServiceResult = null;
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(dpiRow().min, 100, 'New limits replace the old ones');
assert.equal(dpiRow().max, 160);
assert.equal(dpiRow().increment, 1);

// 2. A save in progress keeps reboot disabled; a successful save enables it
holdSaves();
click(1);
assert.equal(control.dataList.items[1].checked, false);
assert.equal(rebootRow().disabled, true, 'Reboot stays disabled while a save is in progress');
assert.equal(dpiRow().disabled, true, 'The DPI row waits while any other setting saves');
assert.equal(dpiRow().image1, '', 'The DPI row shows no spinner for another setting');
assert.equal(control.dataList.items[1].image1, '', 'A saving toggle row shows no spinner');
assert.equal(control.dataList.items[2].disabled, false, 'Other toggle rows stay usable while one saves');
releaseSave();
assert.equal(dpiRow().disabled, false, 'The DPI row is usable again after the save');
assert.equal(savedSettings.touch, false);
assert.equal(writes, 5);
assert.equal(rebootRow().disabled, false, 'A successful save enables reboot');

// 3. Restoring the boot value disables reboot again
click(1);
assert.equal(savedSettings.touch, true);
assert.equal(control.dataList.items[1].checked, true);
assert.equal(writes, 6);
assert.equal(rebootRow().disabled, true, 'A setting toggled back to its boot value needs no reboot');

// 4. Click hud_transport row (toggle to vbs / OFF)
click(3);
assert.equal(savedSettings.hud_transport, 'vbs');
assert.equal(control.dataList.items[3].value, 2);
assert.equal(control.dataList.items[3].checked, false);
assert.equal(writes, 7);
assert.equal(rebootRow().disabled, false);

// 5. The confirmation dialog defaults to No and restores list focus
click(16);
assert.equal(dialogConfig.text1, 'Do you want to reboot MZD to apply Android Auto settings?');
assert.equal(dialogConfig.initialFocus, 0, 'No is the default selection');
assert.equal(dialogConfig.buttonConfig.button1.labelId, 'common.No', 'OEM dialog uses the localized No button first');
assert.equal(dialogConfig.buttonConfig.button1.appData, 'no');
assert.equal(dialogConfig.buttonConfig.button2.labelId, 'common.Yes', 'OEM dialog uses the localized Yes button second');
assert.equal(dialogConfig.buttonConfig.button2.appData, 'yes');
assert.equal(dialogs().length, 1, 'The OEM dialog covers the full interface');
assert.equal(fw._frameworkState, 'idle', 'Opening the dialog does not enter the framework template-loading state');
assert.equal(control.hasFocus, false, 'The list gives focus to the dialog');
resident.reconnected();
flush();
assert.equal(dialogsCreated, 1, 'A settings refresh does not recreate the open dialog');
assert.equal(dialogs().length, 1, 'Only one OEM dialog is shown');
input('select');
assert.equal(reboots, 0, 'Default No selection does not reboot');
assert.equal(dialogs().length, 0, 'Selecting No removes the OEM dialog');
assert.equal(control.hasFocus, true, 'Dismissing the dialog restores list focus');
const focusBeforeDialogDismissal = control.focus;
input('down');
assert.notEqual(control.focus, focusBeforeDialogDismissal, 'List navigation works after dismissing the dialog');

// 6. Yes requests the reboot
click(16);
assert.equal(dialogs().length, 1, 'Confirmation dialog can be opened again');
input('right');
input('select');
assert.equal(dialogs().length, 0, 'Selecting Yes removes the OEM dialog');
assert.equal(reboots, 1, 'Yes requests reboot through the GUI service');

// 7. A failed reboot tells the driver how to reboot manually
rebootError = 'Failed to reboot MZD (status 1)';
click(16);
input('right');
input('select');
assert.equal(reboots, 2);
assert.equal(lastSbn.type, 'typeD');
assert.equal(lastSbn.props.text1, 'Hold NAV + MUTE to reboot', 'Reboot failure shows the manual fallback');
rebootError = null;

// 8. A dialog that cannot be created leaves a working list
dialogFailure = 'Simulated dialog failure';
click(16);
assert.equal(dialogs().length, 0, 'A failed dialog leaves no overlay');
assert.equal(sb, 'Hold NAV + MUTE to reboot', 'A failed dialog shows the manual reboot fallback');
assert.equal(control.hasFocus, true, 'A failed dialog restores list focus');
click(2);
assert.equal(savedSettings.hud, false, 'The list accepts selections after a failed dialog');
assert.equal(sb, 'Android Auto Settings', 'The fallback notice clears on the next selection');
click(2);
assert.equal(savedSettings.hud, true);
assert.equal(writes, 9);

// 9. Opening the dialog by touch while the Back button has focus
input('left');
assert.equal(backFocused, true, 'Left from the list transfers focus to the Mazda Back button');
assert.equal(control.hasFocus, false);
click(16);
assert.equal(backFocused, false, 'Opening the dialog releases the Back button');
input('select');
assert.equal(dialogs().length, 0);
assert.equal(control.hasFocus, true, 'The list has focus after the dialog closes');
assert.equal(backFocused, false, 'The Back button stays unfocused after the dialog closes');

// 10. Rapid consecutive clicks queue; a reboot cannot overtake them
holdSaves();
click(1);
assert.equal(control.dataList.items[1].checked, false);
assert.equal(writes, 10);
click(2);
assert.equal(control.dataList.items[2].checked, false);
assert.equal(writes, 10, 'Second save waits in the resident queue');
assert.equal(rebootRow().disabled, true, 'Reboot is disabled while saves are queued');
residentMessage({ type: 'aa-request', action: 'reboot' });
assert.equal(reboots, 2, 'A reboot request cannot overtake queued saves');
releaseSave();
assert.equal(writes, 11);
assert.equal(savedSettings.touch, false);
assert.equal(savedSettings.hud, false);
assert.equal(control.dataList.items[1].checked, false);
assert.equal(control.dataList.items[2].checked, false);
click(1);
click(2);
assert.equal(savedSettings.touch, true);
assert.equal(savedSettings.hud, true);
assert.equal(writes, 13);

// 11. Distance submenu
click(8);
assert.equal(sb, 'Show HUD turns within');
assert.equal(control.dataList.items.length, 10);
assert.equal(control.dataList.items[0].text1, 'Always');
assert.equal(control.dataList.items[0].itemStyle, 'style03');
assert.equal(control.dataList.items[0].image1, 'tick');
assert.equal(control.dataList.items[0].checked, true);
assert.equal(control.dataList.items[1].text1, '500 m');
assert.equal(control.dataList.items[1].checked, false);
assert.equal(control.dataList.items[2].text1, '1 km');
assert.equal(control.dataList.items[2].checked, false);
click(2);
assert.equal(savedSettings.hud_maneuver_max_distance_m, 1000);
assert.equal(sb, 'Android Auto Settings', 'Accepting a distance returns to Android Auto settings');
assert.equal(control.dataList.items.length, 17);
assert.equal(control.dataList.items[8].label1, '1 km');
assert.equal(control.dataList.items[8].hasCaret, true);
assert.equal(control.focus, 8, 'Returning restores focus to the distance setting');
assert.equal(writes, 14);

// Save error preserves header title in the view and does not set title to 'Failed to save'
for (const fn of viewEvents.message) {
    fn({
        source: view.parent,
        data: { type: 'aa-response', token: 'fixture-token', error: 'Failed to save settings', saving: false, pending: [] }
    });
}
flush();
assert.equal(sb, 'Android Auto Settings', 'Header title preserved on save error');

// 12. Leaving through the Mazda Back button hands focus back to Applications
input('left');
assert.equal(backFocused, true);
input('right');
assert.equal(backFocused, false, 'Right from the Back button returns focus to the settings list');
assert.equal(control.hasFocus, true);
input('left');
assert.equal(backFocused, true, 'Back button can be focused again');
appsTemplate.hasFocus = false; // touching embedded controls lets Common take focus from the hidden list
sbns.length = 0;
input('select');
assert(viewMessages.includes('mzd-gui-close'), 'Selecting the Back button closes the settings view');
resident.closed(); // the runtime calls onViewClose when the view closes
assert.equal(backFocused, false, 'Leaving through the Back button releases its focus');
assert.equal(appsTemplate.hasFocus, true, 'The Applications list regains focus');
assert.equal(sb, 'Applications', 'Closing Android Auto settings restores the Applications header even when its template is hidden');
assert.equal(sbns.length, 1);
assert.equal(lastSbn.props.text1, 'Reboot to apply changes', 'Leaving with saved changes prompts for a reboot');
assert.equal(intervalsCleared, 1, 'Polling interval cleared on view close');
assert.equal(host.refresh, undefined, 'Polling callback removed');
assert.equal(control, null, 'List control destroyed on close');
assert.equal(fw.sendEventToMmui, originalSend, 'Original sendEventToMmui restored');

view.MzdGuiModule._dispose();
flush();

// 13. Notifications use the view's language, also after the view closed
residentMessage({
    type: 'aa-request',
    action: 'texts',
    payload: {
        saveError: 'Échec de l’enregistrement',
        reboot: 'Redémarrer pour appliquer',
        rebootFallback: 'Maintenir NAV + MUTE'
    }
});

// 14. A save that finishes after leaving shows the reboot notice
lastSbn = null;
holdSaves();
residentMessage({ type: 'aa-request', action: 'set', payload: { key: 'touch', value: false } });
assert.equal(writes, 15);
assert.equal(lastSbn, null, 'No saving notification is shown');
let reopened = null;
viewEvents.message = [event => { if (event.data && event.data.type === 'aa-response') { reopened = event.data; } }];
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(savedSettings.touch, true, 'The held save is not written yet');
assert.equal(reopened.state.touch, false, 'Reopening during a background save keeps the pending value');
assert.equal(reopened.saving, true, 'Reopening during a background save keeps reboot disabled');
sbns.length = 0;
residentMessage({ type: 'aa-native-release' });
resident.closed();
assert.equal(sbns.length, 0, 'Leaving during a save waits for its result');
releaseSave();
assert.equal(savedSettings.touch, false);
assert.equal(lastSbn.type, 'typeD');
assert.equal(lastSbn.props.text1, 'Redémarrer pour appliquer', 'A save finishing after leaving prompts for a reboot');

// 14b. Untrusted aa-native-release is ignored
lastSbn = null;
hostEvents.message({ source: {}, data: { type: 'aa-native-release', token: 'untrusted-token' } });
assert.equal(lastSbn, null, 'Untrusted aa-native-release ignored');

// 15. A failed save after leaving shows only the error, even after an earlier success
residentMessage({
    type: 'aa-native-render',
    menu: { page: 'home', title: 'Android Auto Settings', rows: [{ label: 'Touch', itemStyle: 'styleOnOff' }], index: 0 }
});
residentMessage({ type: 'aa-request', action: 'set', payload: { key: 'force_street_name', value: true } });
assert.equal(savedSettings.force_street_name, true);
holdSaves();
residentMessage({ type: 'aa-request', action: 'set', payload: { key: 'hud', value: false } });
sbns.length = 0;
residentMessage({ type: 'aa-native-release' });
resident.closed();
assert.equal(sbns.length, 0, 'No reboot notice while a save is still running');
releaseSave('disk error');
assert.equal(savedSettings.hud, true, 'The failed save was not written');
assert.equal(sbns.length, 1, 'No reboot notice follows a failed save');
assert.equal(sbns[0].type, 'errorNotification');
assert.equal(sbns[0].props.text1, 'Échec de l’enregistrement');

// 16. Concurrency: callbacks in syncFromService are queued and all invoked
let pendingServiceCb = null;
let getRequests = 0;
resident.service.request = (op, args, cb) => {
    if (op === 'get') {
        getRequests++;
        pendingServiceCb = cb;
    } else if (op === 'set') {
        queue.push(() => {
            cb('set error');
        });
    }
};
// Trigger first failure which calls syncFromService(cb1)
residentMessage({ type: 'aa-request', action: 'set', payload: { key: 'touch', value: true } });
assert.equal(getRequests, 1, 'First get request started');
assert.notEqual(pendingServiceCb, null, 'Service get request in flight');

// Trigger a second event while get is still in flight (calls syncFromService without a second get request)
resident.reconnected();
assert.equal(getRequests, 1, 'Second sync call queued without duplicate request');

// Now resolve the in-flight get request
let broadcastCount = 0;
viewEvents.message = [event => {
    if (event.data && event.data.type === 'aa-response') {
        broadcastCount++;
    }
}];
pendingServiceCb(null, serviceResult());
flush();
assert.equal(broadcastCount >= 1, true, 'Queued sync completed and broadcast state');
resident.service.request = origServiceRequest;

// 17. Initial get failure broadcasts error to view even when cachedSettings is null
{
    let errorReceived = null;
    const testView = {
        location: { hash: '#mzdgui=err-token' },
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: data => {
            if (data.type === 'aa-response') {
                errorReceived = data.error;
            }
        }
    };
    let freshHostEvents;
    const testHostContext = {
        window: {
            MzdGuiResidents: {
                ...residentsApi,
                register(id, fn) {
                    fn({
                        view: () => ({ source: testView, token: 'err-token' }),
                        onMessage: fn => { freshHostEvents = fn; },
                        onViewClose: () => {},
                        onDispose: () => {},
                        onServiceReady: () => {},
                        createNativeMenu: opts => residentsApi.createNativeMenu(opts),
                        notify: (text, isError) => residentsApi.notify('android-auto', text, isError),
                        log: msg => residentsApi.log('android-auto', msg),
                        service: {
                            request(op, args, cb) {
                                if (op === 'get') {
                                    cb('Initial connection failed');
                                }
                            }
                        }
                    });
                }
            }
        },
        document: hostContext.document
    };
    vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/settings-host.js'), 'utf8'), testHostContext);
    vm.runInNewContext(residentSource, testHostContext);
    freshHostEvents({
        source: testView,
        data: { type: 'aa-request', token: 'err-token', action: 'get' }
    });
    assert.equal(errorReceived, 'Initial connection failed', 'Error broadcast when cachedSettings is null');
}

// 18. NativeMenu check is exception-safe when framework is temporarily undefined
assert.doesNotThrow(() => {
    const origFw = host.framework;
    delete host.framework;
    if (host.refresh) { host.refresh(); }
    host.framework = origFw;
}, 'check does not throw when framework is undefined');

// 19. Every view open reads the settings again; outside edits show up but do not ask for a reboot
let reloadedState = null, reloadedReboot = null;
const getsBefore = serviceCalls.filter(op => op === 'get').length;
savedSettings.compass_always_on = true; // edited over SSH
viewEvents.message = [event => {
    if (event.data && event.data.type === 'aa-response') {
        reloadedState = event.data.state;
        reloadedReboot = event.data.rebootRequired;
    }
}];
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(serviceCalls.filter(op => op === 'get').length, getsBefore + 1, 'Opening the view reads the settings again');
assert.equal(reloadedState.compass_always_on, true, 'An outside edit shows up on the next open');
assert.equal(reloadedState.hud_maneuver_max_distance_m, 1000);
assert.equal(reloadedState.touch, false);
assert.equal(reloadedReboot, true, 'Changes saved in the view still need a reboot');
writeSetting('touch', true);
writeSetting('hud_maneuver_max_distance_m', 0);
writeSetting('hud_transport', 'svcnavi');
writeSetting('force_street_name', false);
residentMessage({ type: 'aa-request', action: 'get' });
assert.equal(reloadedState.compass_always_on, true);
assert.equal(reloadedReboot, false, 'An outside edit alone does not ask for a reboot');

hostEvents.unload();
flush();

// 20. OEM dialog components that are already loaded are not loaded again
{
    const assetsBefore = head.children.length;
    let fastMessage;
    const fastWindow = Object.assign({}, host, {
        Dialog3Tmplt: function () {},
        MzdGuiResidents: {
            ...residentsApi,
            register(id, fn) {
                fn({
                    view: () => ({ source: view, frame: frame, token: 'fast-token' }),
                    onMessage: f => { fastMessage = f; },
                    onViewClose: () => {},
                    onDispose: () => {},
                    onServiceReady: () => {},
                    createNativeMenu: opts => residentsApi.createNativeMenu(opts),
                    notify: (text, isError) => residentsApi.notify('android-auto', text, isError),
                    log: msg => residentsApi.log('android-auto', msg),
                    service: { request() {} }
                });
            }
        }
    });
    vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/settings-host.js'), 'utf8'), { window: fastWindow, document: document });
    vm.runInNewContext(residentSource, { window: fastWindow, document: document });
    fastMessage({
        source: view,
        data: { type: 'aa-native-render', token: 'fast-token', menu: { page: 'home', title: 'Fast', rows: [{ label: 'Row' }], index: 0 } }
    });
    assert.equal(head.children.length, assetsBefore, 'Already registered OEM dialog components are reused');
}

console.log('ANDROID_AUTO_VIEW_PASSED: MZD Connect styling, reboot row enabled only for changes saved in the view, fresh settings on every open, single OEM confirmation dialog, No/Yes and failed reboot, dialog failure recovery, Back button focus handoff, localized reboot notices, settings navigation and cleanup.');
