const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');

const aaRoot = path.resolve(__dirname, '../../../usb/tweaks/android-auto');
const repo = path.resolve(aaRoot, '../../..');

const queue = [];
const hostEvents = {};
const viewEvents = {};
const timers = new Map();
let timer = 0, writes = 0, control = null, created = 0, destroyed = 0, attached = true, sb = 'Applications';

function element() {
    return {
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

const status = element(), rootNode = element(), frame = element();
rootNode.style.cssText = 'old-style';
rootNode.appendChild(frame);

const document = { getElementById: () => status };
let lastSbn = null;
const common = {
    setSbName: v => { sb = v; },
    setSbNameId: (app, id) => { sb = id; },
    startTimedSbn: (uiaId, sbnId, type, props) => {
        lastSbn = { uiaId: uiaId, sbnId: sbnId, type: type, props: props };
    }
};

const originalSend = () => {};
const fw = {
    common: common,
    getCurrentApp: () => 'system',
    getCurrCtxtId: () => 'Applications',
    getAppInstance: () => ({
        _currentContextTemplate: {
            list2Ctrl: { setLineNumbers() { this.restored = true; } }
        }
    }),
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
            dataList: props.dataList,
            handleControllerEvent(event) {
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
                return { hasFocus: true, focussedItem: this.focus, topItem: 0 };
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
    destroyControl(c) {
        destroyed++;
        if (control === c) { control = null; }
    }
};

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
    setInterval: f => { host.refresh = f; return 1; },
    clearInterval: () => {}
};

const parent = {
    postMessage: data => queue.push(() => {
        if (hostEvents.message) {
            hostEvents.message({ source: view, data: data });
        }
    })
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
const frames = [frame];

let savedSettings = {
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

const resident = {
    onServiceReady: fn => { resident.reconnected = fn; },
    view: () => ({ source: view, frame: frame, token: 'fixture-token' }),
    onMessage: fn => { hostEvents.message = fn; },
    onViewClose: fn => { resident.closed = fn; },
    onDispose: fn => { hostEvents.unload = fn; },
    service: {
        request(op, args, cb) {
            queue.push(() => {
                if (op === 'get') {
                    cb(null, { success: true, settings: Object.assign({}, savedSettings) });
                } else if (op === 'set') {
                    writes++;
                    savedSettings[args.key] = args.value;
                    cb(null, { success: true, settings: Object.assign({}, savedSettings) });
                } else {
                    throw Error('Unexpected operation: ' + op);
                }
            });
        }
    }
};

host.MzdGuiResidents = {
    register(id, fn) {
        assert.equal(id, 'android-auto');
        fn(resident);
    }
};

const hostContext = {
    window: host,
    document: {
        getElementsByTagName: () => frames,
        createElement: element,
        documentElement: { contains: () => attached }
    }
};

// Run resident script
vm.runInNewContext(fs.readFileSync(path.join(aaRoot, 'assets/resident.js'), 'utf8'), hostContext);

// Run SDK
vm.runInNewContext(fs.readFileSync(path.join(repo, 'usb/lib/gui-runtime/sdk.js'), 'utf8'), { window: view });

// Run view script
vm.runInNewContext(fs.readFileSync(path.join(aaRoot, 'assets/view.js'), 'utf8'), { window: view, document: document });

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

// 1. Initial load
flush();
assert.equal(sb, 'Android Auto Settings');
assert.equal(control.dataList.items.length, 15);

// Check first row (touch): boolean toggle -> styleOnOff, value 1 (on)
assert.equal(control.dataList.items[0].text1, 'Touchscreen while driving');
assert.equal(control.dataList.items[0].itemStyle, 'styleOnOff');
assert.equal(control.dataList.items[0].value, 1);
assert.equal(control.dataList.items[0].checked, true);
assert.equal(control.dataList.items[0].hasCaret, false);

// Check row 2 (hud_transport): styleOnOff, value 1 (svcnavi is on)
assert.equal(control.dataList.items[2].text1, 'Show speed limit with Nav SD');
assert.equal(control.dataList.items[2].itemStyle, 'styleOnOff');
assert.equal(control.dataList.items[2].value, 1);
assert.equal(control.dataList.items[2].checked, true);

// Check row 7 (hud_maneuver_max_distance_m): style06 with label1="Always" and hasCaret=true
assert.equal(control.dataList.items[7].text1, 'Show HUD turns within');
assert.equal(control.dataList.items[7].itemStyle, 'style06');
assert.equal(control.dataList.items[7].label1, 'Always');
assert.equal(control.dataList.items[7].hasCaret, true);

// 2. Click touch row (toggle to OFF)
click(0);
assert.equal(savedSettings.touch, false);
assert.equal(control.dataList.items[0].value, 2);
assert.equal(control.dataList.items[0].checked, false);
assert.equal(writes, 1);

// Click again (toggle to ON)
click(0);
assert.equal(savedSettings.touch, true);
assert.equal(control.dataList.items[0].value, 1);
assert.equal(control.dataList.items[0].checked, true);
assert.equal(writes, 2);

// 3. Click hud_transport row (toggle to vbs / OFF)
click(2);
assert.equal(savedSettings.hud_transport, 'vbs');
assert.equal(control.dataList.items[2].value, 2);
assert.equal(control.dataList.items[2].checked, false);
assert.equal(writes, 3);

// 3b. Rapid consecutive clicks while save is in flight (queueing & race safety)
let holdService = true;
const heldCallbacks = [];
const origServiceRequest = resident.service.request;
const holdRequest = function (op, args, cb) {
    if (holdService && op === 'set') {
        queue.push(() => {
            writes++;
            savedSettings[args.key] = args.value;
            heldCallbacks.push(() => cb(null, { success: true, settings: Object.assign({}, savedSettings) }));
        });
    } else {
        origServiceRequest.call(this, op, args, cb);
    }
};
resident.service.request = holdRequest;

// User toggles touch to false (in flight, held)
click(0);
assert.equal(control.dataList.items[0].checked, false);
assert.equal(writes, 4);

// User immediately toggles hud to false while touch save is still in flight
click(1);
assert.equal(control.dataList.items[1].checked, false);
// Second request was queued in view.js, not yet sent to service
assert.equal(writes, 4);

// First save completes
holdService = false;
heldCallbacks.shift()();
flush(); // Processes first response, which sends the queued second request and its response
assert.equal(writes, 5);
resident.service.request = origServiceRequest;

// Verify both settings were successfully saved and UI reflects both
assert.equal(savedSettings.touch, false);
assert.equal(savedSettings.hud, false);
assert.equal(control.dataList.items[0].checked, false);
assert.equal(control.dataList.items[1].checked, false);

// Restore touch and hud to true
click(0);
assert.equal(savedSettings.touch, true);
click(1);
assert.equal(savedSettings.hud, true);
assert.equal(writes, 7);

// 4. Click distance row -> enters distance submenu
click(7);
assert.equal(sb, 'Show HUD turns within');
assert.equal(control.dataList.items.length, 10); // 10 distance options

// Verify distance options: style03, image1 'tick', only 0m (Always) is checked
assert.equal(control.dataList.items[0].text1, 'Always');
assert.equal(control.dataList.items[0].itemStyle, 'style03');
assert.equal(control.dataList.items[0].image1, 'tick');
assert.equal(control.dataList.items[0].checked, true);

assert.equal(control.dataList.items[1].text1, '500 m');
assert.equal(control.dataList.items[1].itemStyle, 'style03');
assert.equal(control.dataList.items[1].image1, 'tick');
assert.equal(control.dataList.items[1].checked, false);

assert.equal(control.dataList.items[2].text1, '1 km');
assert.equal(control.dataList.items[2].checked, false);

// 5. Select 1 km option (index 2)
click(2);
assert.equal(savedSettings.hud_maneuver_max_distance_m, 1000);
assert.equal(control.dataList.items[0].checked, false);
assert.equal(control.dataList.items[2].checked, true);
assert.equal(writes, 8);

// 6. Navigate back to main settings menu
input('back');
assert.equal(sb, 'Android Auto Settings');
assert.equal(control.dataList.items.length, 15);

// Verify that the distance row now displays "1 km" on the right hand side
assert.equal(control.dataList.items[7].text1, 'Show HUD turns within');
assert.equal(control.dataList.items[7].label1, '1 km');
assert.equal(control.dataList.items[7].hasCaret, true);

// 7. Back navigation from main menu closes view
input('back');
// Runtime calls onViewClose when view requests close
resident.closed();
assert.equal(control, null, 'List control destroyed on close');
assert.equal(fw.sendEventToMmui, originalSend, 'Original sendEventToMmui restored');

// Cleanup
view.MzdGuiModule._dispose();
flush();

// 8. Test background save completion and SBN notification on exit
lastSbn = null;
holdService = true;
resident.service.request = holdRequest;
hostEvents.message({
    source: view,
    data: {
        type: 'aa-request',
        token: 'fixture-token',
        action: 'set',
        payload: { key: 'touch', value: false }
    }
});
flush();
assert.equal(writes, 9);

// Driver leaves menu while save is in flight
hostEvents.message({
    source: view,
    data: {
        type: 'aa-native-release',
        token: 'fixture-token',
        savingMessage: 'Saving Android Auto settings...',
        savedMessage: 'Android Auto settings saved.'
    }
});
flush();

assert.notEqual(lastSbn, null, 'Saving SBN emitted on exit while save in flight');
assert.equal(lastSbn.uiaId, 'androidauto');
assert.equal(lastSbn.type, 'typeD');
assert.equal(lastSbn.props.sbnStyle, 'Style02');
assert.equal(lastSbn.props.text1, 'Saving Android Auto settings...');
assert.equal(lastSbn.props.imagePath1, 'common/images/icons/IcnSbnApps.png');

// Background save finishes
lastSbn = null;
holdService = false;
heldCallbacks.shift()();
flush();

assert.notEqual(lastSbn, null, 'Saved SBN emitted when background save finished');
assert.equal(lastSbn.type, 'typeD');
assert.equal(lastSbn.props.text1, 'Android Auto settings saved.');
assert.equal(savedSettings.touch, false);

// 8b. Untrusted aa-native-release is ignored
lastSbn = null;
hostEvents.message({
    source: {},
    data: {
        type: 'aa-native-release',
        token: 'untrusted-token',
        savingMessage: 'Spoofed toast',
        savedMessage: 'Spoofed toast'
    }
});
assert.equal(lastSbn, null, 'Untrusted aa-native-release ignored');

// 9. Re-entering view serves state immediately from resident cache
let reloadedState = null;
viewEvents.message = [event => {
    if (event.data && event.data.type === 'aa-response') {
        reloadedState = event.data.state;
    }
}];
hostEvents.message({
    source: view,
    data: {
        type: 'aa-request',
        token: 'fixture-token',
        action: 'get'
    }
});
flush();
assert.notEqual(reloadedState, null, 'Resident immediately returned cached state');
assert.equal(reloadedState.hud_maneuver_max_distance_m, 1000);
assert.equal(reloadedState.touch, false);

hostEvents.unload();
flush();

console.log('ANDROID_AUTO_VIEW_PASSED: MZD Connect styling, styleOnOff checkboxes, distance submenu with style03 checkmarks, value display on main menu, back navigation, SBN system toast and cleanup.');
