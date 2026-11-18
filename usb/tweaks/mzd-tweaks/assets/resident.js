/*
 * MZD Tweaks resident. The shared settings host owns the native menu and the
 * save queue; this file keeps window.mzdTweaks in sync and hooks MainMenuCtrl,
 * List2Ctrl and systemApp at runtime without modifying OEM target files.
 *
 * Sources that populate window.mzdTweaks:
 * - Inline defaults below, so OEM code and hooks always find the object.
 * - settings.js, written by the service; loads asynchronously at boot.
 * - The service, through onConfirmed, after a successful read or save.
 */
(function (global) {
    'use strict';

    var AUDIO_ORDER_MAP = {
        'TrafficInfo': 'audio_traffic_info',
        'FMRadio': 'audio_fm_radio',
        'AMRadio': 'audio_am_radio',
        'DAB': 'audio_dab',
        'SatRadio': 'audio_sat_radio',
        'XmAudio': 'audio_xm_audio',
        'AhaRadio': 'audio_aha_radio',
        'Pandora': 'audio_pandora',
        'Stitcher': 'audio_stitcher',
        'BTAudio': 'audio_bt_audio',
        'CarPlayWifi': 'audio_car_play_wifi',
        'CarPlay': 'audio_car_play',
        'AndroidAuto': 'audio_android_auto',
        'USB_A': 'audio_usb_a',
        'USB_B': 'audio_usb_b',
        'CD': 'audio_cd',
        'AuxIn': 'audio_aux_in',
        'DVD': 'audio_dvd',
        'TV': 'audio_tv'
    };

    var DEFAULT_AUDIO_ORDER = {
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

    var DEFAULTS = {
        main_menu_loop: false,
        list_loop: false,
        list_beep: true,
        short_delay: false,
        audio_order_custom: false,
        audio_order: DEFAULT_AUDIO_ORDER
    };

    function backfillDefaults(obj) {
        if (!obj) { return; }
        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && obj[k] === undefined) {
                if (k === 'audio_order') {
                    obj[k] = {};
                    for (var subKey in DEFAULT_AUDIO_ORDER) {
                        if (Object.prototype.hasOwnProperty.call(DEFAULT_AUDIO_ORDER, subKey)) {
                            obj[k][subKey] = DEFAULT_AUDIO_ORDER[subKey];
                        }
                    }
                } else {
                    obj[k] = DEFAULTS[k];
                }
            }
        }
        if (!obj.audio_order) {
            obj.audio_order = {};
        }
        for (var ak in DEFAULT_AUDIO_ORDER) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_AUDIO_ORDER, ak) && obj.audio_order[ak] === undefined) {
                obj.audio_order[ak] = DEFAULT_AUDIO_ORDER[ak];
            }
        }
    }

    if (!global.mzdTweaks) {
        global.mzdTweaks = {};
    }
    backfillDefaults(global.mzdTweaks);

    try {
        var bootScript = document.createElement('script');
        bootScript.type = 'text/javascript';
        bootScript.src = '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js';
        bootScript.onload = function () {
            backfillDefaults(global.mzdTweaks);
        };
        bootScript.onerror = function (event) {
            if (event && event.preventDefault) { event.preventDefault(); }
            backfillDefaults(global.mzdTweaks);
            if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
                global.MzdGuiResidents.log('mzd-tweaks', 'settings.js could not be loaded; using defaults until the service answers.');
            }
            return true;
        };
        (document.head || document.documentElement).appendChild(bootScript);
    } catch (failure) {
        backfillDefaults(global.mzdTweaks);
        if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
            global.MzdGuiResidents.log('mzd-tweaks', 'settings.js could not be added: ' + failure);
        }
    }

    // --- Runtime hooks for OEM controls ---

    // 1. Main Menu Loop
    function hookMainMenu() {
        if (!global.MainMenuCtrl || !global.MainMenuCtrl.prototype || global.MainMenuCtrl.prototype._mzdTweaksHooked) {
            return;
        }
        global.MainMenuCtrl.prototype._mzdTweaksHooked = true;
        var origOffsetFocus = global.MainMenuCtrl.prototype._offsetFocus;
        if (typeof origOffsetFocus === 'function') {
            global.MainMenuCtrl.prototype._offsetFocus = function (direction) {
                if (!global.mzdTweaks || !global.mzdTweaks.main_menu_loop) {
                    return origOffsetFocus.apply(this, arguments);
                }
                var dir = 0;
                if (direction === -1 || direction === 'left') {
                    dir = -1;
                } else if (direction === 1 || direction === 'right') {
                    dir = 1;
                } else {
                    return origOffsetFocus.apply(this, arguments);
                }
                var current = (typeof this._getFocus === 'function') ? this._getFocus() : 0;
                if (typeof current !== 'number' || isNaN(current) || current < 0 || current > 4) {
                    return origOffsetFocus.apply(this, arguments);
                }
                var index = current + dir;
                if (index < 0) { index = 4; }
                if (index > 4) { index = 0; }
                if (index !== current) {
                    if (typeof this._setFocus === 'function') {
                        this._setFocus(index);
                    }
                    if (typeof this._setHighlight === 'function') {
                        this._setHighlight(index);
                    }
                }
            };
        }
    }

    // 2. List Loop, List Beep, Shorter Delay
    function firstEnabled(list) {
        for (var i = 0; i < list.itemCount; i++) {
            if (list.items[i] && !list.items[i].disabled) { return i; }
        }
        return -1;
    }

    function lastEnabled(list) {
        for (var i = list.itemCount - 1; i >= 0; i--) {
            if (list.items[i] && !list.items[i].disabled) { return i; }
        }
        return -1;
    }

    // Wrap only in plain list focus mode. While OEM waits for list data
    // (_inLoading without scrollingDuringLoading) it ignores focus and scroll
    // changes, so a wrap then would leave the list half moved.
    function canWrap(control) {
        if (!global.mzdTweaks || !global.mzdTweaks.list_loop) { return false; }
        if (control._inListReorder || control._inLetterIndexMulticontroller) { return false; }
        if (control._inLoading && !(control.properties && control.properties.scrollingDuringLoading)) { return false; }
        if (!control.dataList || !control.dataList.items || !(control.dataList.itemCount > 0)) { return false; }
        if (typeof control._getFocussedIndex !== 'function') { return false; }
        var current = control._getFocussedIndex();
        return typeof current === 'number' && current >= 0;
    }

    // Top item that shows idx at the bottom of the list, like OEM scrolling down.
    function bottomTop(control, idx) {
        var count = control.dataList.itemCount;
        var vis = (control.properties && typeof control.properties.visibleItems === 'number') ? control.properties.visibleItems : 6;
        if (count <= vis || control._isScrollable === false) { return 0; }
        return Math.max(0, Math.min(count - vis, idx));
    }

    function focusListItem(control, idx, topPos) {
        if (control.scrollerAnimationEndCallback && control.scroller) {
            control.scroller.removeEventListener(control._VENDOR + 'TransitionEnd', control.scrollerAnimationEndCallback, false);
            control.scrollerAnimationEndCallback = null;
        }
        control._inScroll = false;
        control._scrollNature = null;

        if (control.properties) {
            control.properties.focussedItem = idx;
            control.properties.scrollTo = topPos;
        }
        // OEM sets _topItem from the clamped scroll position.
        if (typeof control._scrollTo === 'function') {
            control._scrollTo(topPos, 0);
        }
        // A 0 ms scroll fires no transition end; drop its listener.
        if (control.scrollerAnimationEndCallback && control.scroller) {
            control.scroller.removeEventListener(control._VENDOR + 'TransitionEnd', control.scrollerAnimationEndCallback, false);
            control.scrollerAnimationEndCallback = null;
        }
        control._inScroll = false;
        control._scrollNature = null;

        if (typeof control._showFocus === 'function') {
            control._showFocus(idx, true);
        } else if (typeof control._manageFocus === 'function') {
            control._manageFocus(idx);
        }
        control._lastItemWithFocus = idx;
        // Keep the highlight when the scroll started a real OEM data request.
        if (control.items && control.items.length) {
            for (var k = 0; k < control.items.length; k++) {
                var it = control.items[k];
                if (it && it.domElt && it.domElt.classList) {
                    if (it.ref === idx) {
                        it.domElt.classList.add('focus');
                    } else {
                        it.domElt.classList.remove('focus');
                    }
                }
            }
        }
    }

    function wrapListForward(origFn) {
        return function () {
            if (canWrap(this)) {
                var list = this.dataList, next = this._getFocussedIndex() + 1;
                while (next < list.itemCount && list.items[next] && list.items[next].disabled) {
                    next++;
                }
                if (next >= list.itemCount) {
                    var first = firstEnabled(list);
                    if (first >= 0) {
                        focusListItem(this, first, 0);
                        return 'consumed';
                    }
                }
            }
            return origFn.apply(this, arguments);
        };
    }

    function wrapListBackward(origFn) {
        return function () {
            if (canWrap(this)) {
                var list = this.dataList, prev = this._getFocussedIndex() - 1;
                while (prev >= 0 && list.items[prev] && list.items[prev].disabled) {
                    prev--;
                }
                if (prev < 0) {
                    var last = lastEnabled(list);
                    if (last >= 0) {
                        focusListItem(this, last, bottomTop(this, last));
                        return 'consumed';
                    }
                }
            }
            return origFn.apply(this, arguments);
        };
    }

    function wrapScrollDownPage(origFn) {
        return function () {
            if (!canWrap(this)) {
                return origFn.apply(this, arguments);
            }
            var pos = (typeof this._getListPosition === 'function') ? this._getListPosition() : '';
            if (pos === 'onepage') {
                return (typeof this._handleMCDown === 'function') ? this._handleMCDown() : 'consumed';
            }
            var beforeIndex = this._getFocussedIndex();
            var res = origFn.apply(this, arguments);
            if (res === 'atLimit' || pos === 'bottom' || this._getFocussedIndex() === beforeIndex) {
                var first = firstEnabled(this.dataList);
                if (first >= 0) {
                    focusListItem(this, first, 0);
                    return 'paged';
                }
            }
            return res;
        };
    }

    function wrapScrollUpPage(origFn) {
        return function () {
            if (!canWrap(this)) {
                return origFn.apply(this, arguments);
            }
            var pos = (typeof this._getListPosition === 'function') ? this._getListPosition() : '';
            if (pos === 'onepage') {
                return (typeof this._handleMCUp === 'function') ? this._handleMCUp() : 'consumed';
            }
            var beforeIndex = this._getFocussedIndex();
            var res = origFn.apply(this, arguments);
            if (res === 'atLimit' || pos === 'top' || this._getFocussedIndex() === beforeIndex) {
                var last = lastEnabled(this.dataList);
                if (last >= 0) {
                    focusListItem(this, last, bottomTop(this, last));
                    return 'paged';
                }
            }
            return res;
        };
    }

    function hookList2() {
        if (!global.List2Ctrl || !global.List2Ctrl.prototype || global.List2Ctrl.prototype._mzdTweaksHooked) {
            return;
        }
        var proto = global.List2Ctrl.prototype;
        proto._mzdTweaksHooked = true;

        // Shorter Delay getters on prototype and instances
        function defineDelayProps(target) {
            if (!target) { return; }
            try {
                Object.defineProperty(target, 'autoscrollTier1Timeout', {
                    get: function () {
                        return (global.mzdTweaks && global.mzdTweaks.short_delay) ? 500 : 1500;
                    },
                    configurable: true,
                    enumerable: true
                });
                Object.defineProperty(target, 'autoscrollTier2Timeout', {
                    get: function () {
                        return (global.mzdTweaks && global.mzdTweaks.short_delay) ? 1500 : 5000;
                    },
                    configurable: true,
                    enumerable: true
                });
                Object.defineProperty(target, 'autoscrollTier1Interval', {
                    get: function () {
                        return (global.mzdTweaks && global.mzdTweaks.short_delay) ? 300 : 500;
                    },
                    configurable: true,
                    enumerable: true
                });
                Object.defineProperty(target, 'autoscrollTier2Interval', {
                    get: function () {
                        return (global.mzdTweaks && global.mzdTweaks.short_delay) ? 500 : 1000;
                    },
                    configurable: true,
                    enumerable: true
                });
            } catch (ignoreDelay) {}
        }

        defineDelayProps(proto);
        if (proto.defaultProperties) {
            defineDelayProps(proto.defaultProperties);
        }

        // Hook init() to bind getters directly to this.properties upon creation
        var origListInit = proto.init;
        proto.init = function () {
            var res;
            if (typeof origListInit === 'function') {
                res = origListInit.apply(this, arguments);
            }
            if (this.properties) {
                defineDelayProps(this.properties);
            }
            if (proto.defaultProperties) {
                defineDelayProps(proto.defaultProperties);
            }
            return res;
        };

        // List Beep muting (default-on: mutes ONLY when explicitly false)
        var origBeep = proto._beep;
        if (typeof origBeep === 'function') {
            proto._beep = function (pressType, eventCause) {
                if (pressType === 'Long' && eventCause === 'Multicontroller' &&
                    global.mzdTweaks && global.mzdTweaks.list_beep === false) {
                    return;
                }
                return origBeep.apply(this, arguments);
            };
        }

        // Continuous tilt-and-hold autoscroll: like MainMenuCtrl, keep stepping without switching to Tier 2 page scroll
        var origHandleController = proto.handleControllerEvent;
        if (typeof origHandleController === 'function') {
            proto.handleControllerEvent = function (eventID) {
                if (!global.mzdTweaks || !global.mzdTweaks.list_loop) {
                    return origHandleController.apply(this, arguments);
                }
                var clearT = global.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);
                var clearI = global.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval : null);
                var setT = global.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
                var setI = global.setInterval || (typeof setInterval !== 'undefined' ? setInterval : null);

                if (eventID === 'down' || eventID === 'up' || eventID === 'lostFocus') {
                    if (clearT && this._tiltHoldTimeoutId) { clearT(this._tiltHoldTimeoutId); }
                    if (clearI && this._tiltHoldIntervalId) { clearI(this._tiltHoldIntervalId); }
                    this._tiltHoldTimeoutId = null;
                    this._tiltHoldIntervalId = null;
                    return origHandleController.apply(this, arguments);
                }
                if (eventID === 'downStart' || eventID === 'upStart') {
                    if (this._inListReorder || this._inLetterIndexMulticontroller) {
                        return origHandleController.apply(this, arguments);
                    }
                    var self = this;
                    if (clearT && this._tiltHoldTimeoutId) { clearT(this._tiltHoldTimeoutId); }
                    if (clearI && this._tiltHoldIntervalId) { clearI(this._tiltHoldIntervalId); }
                    this._tiltHoldTimeoutId = null;
                    this._tiltHoldIntervalId = null;

                    if (typeof this._itemRemoveHit === 'function') { this._itemRemoveHit(); }
                    if (typeof this._indexRemoveHit === 'function') { this._indexRemoveHit(); }

                    var isDown = (eventID === 'downStart');
                    var stepFn = isDown ? this._handleMCDown : this._handleMCUp;
                    var response = typeof stepFn === 'function' ? stepFn.call(this) : 'consumed';

                    var t1Timeout = (this.properties && typeof this.properties.autoscrollTier1Timeout === 'number') ? this.properties.autoscrollTier1Timeout : 1500;
                    var t1Interval = (this.properties && typeof this.properties.autoscrollTier1Interval === 'number') ? this.properties.autoscrollTier1Interval : 500;

                    if (setT) {
                        this._tiltHoldTimeoutId = setT(function () {
                            if (typeof self._beep === 'function') {
                                self._beep('Long', 'Multicontroller');
                            }
                            if (typeof stepFn === 'function') {
                                stepFn.call(self);
                            }
                            if (clearI && self._tiltHoldIntervalId) {
                                clearI(self._tiltHoldIntervalId);
                            }
                            if (setI) {
                                self._tiltHoldIntervalId = setI(function () {
                                    if (typeof stepFn === 'function') {
                                        stepFn.call(self);
                                    }
                                }, t1Interval);
                            }
                        }, t1Timeout);
                    }

                    this._lastControllerEvent = eventID;
                    return response;
                }
                return origHandleController.apply(this, arguments);
            };
        }

        // List Loop: Rotary CW / CCW, Tilt Down / Up, and Page Down / Up
        if (typeof proto._handleMCCW === 'function') {
            proto._handleMCCW = wrapListForward(proto._handleMCCW);
        }
        if (typeof proto._handleMCCCW === 'function') {
            proto._handleMCCCW = wrapListBackward(proto._handleMCCCW);
        }
        if (typeof proto._handleMCDown === 'function') {
            proto._handleMCDown = wrapListForward(proto._handleMCDown);
        }
        if (typeof proto._handleMCUp === 'function') {
            proto._handleMCUp = wrapListBackward(proto._handleMCUp);
        }
        if (typeof proto._scrollDownPage === 'function') {
            proto._scrollDownPage = wrapScrollDownPage(proto._scrollDownPage);
        }
        if (typeof proto._scrollUpPage === 'function') {
            proto._scrollUpPage = wrapScrollUpPage(proto._scrollUpPage);
        }
    }

    // Entertainment Audio Order (systemApp hook)
    // OEM systemApp.js accesses CarPlay and Android Auto slots relative to
    // _USB1EntIndex in _masterEntertainmentDataList.items. We must never reorder
    // _masterEntertainmentDataList.items in place, but instead sort only the
    // visible list returned by _buildEntertainmentDataList().
    function sortEntertainmentItems(items) {
        if (!items || !items.length) {
            return;
        }
        var isCustom = global.mzdTweaks && global.mzdTweaks.audio_order_custom;
        var audioOrder = (isCustom && global.mzdTweaks && global.mzdTweaks.audio_order) ? global.mzdTweaks.audio_order : {};

        for (var i = 0; i < items.length; i++) {
            var srcId = items[i].appData && items[i].appData.audioSourceId;
            var key = AUDIO_ORDER_MAP[srcId];
            var defIdx = (key && DEFAULT_AUDIO_ORDER[key] !== undefined) ? DEFAULT_AUDIO_ORDER[key] : i;
            if (items[i].defaultIndex === undefined) {
                items[i].defaultIndex = defIdx;
            }
            if (isCustom && key && audioOrder[key] !== undefined) {
                items[i].index = audioOrder[key];
            } else {
                items[i].index = items[i].defaultIndex;
            }
        }

        items.sort(function (a, b) {
            var diff = (a.index || 0) - (b.index || 0);
            if (diff !== 0) {
                return diff;
            }
            return (a.defaultIndex || 0) - (b.defaultIndex || 0);
        });
    }

    function hookSystemApp() {
        if (!global.systemApp || !global.systemApp.prototype || global.systemApp.prototype._mzdTweaksHooked) {
            return;
        }
        var proto = global.systemApp.prototype;
        if (typeof proto._buildEntertainmentDataList !== 'function') {
            return;
        }
        proto._mzdTweaksHooked = true;

        var origBuildEnt = proto._buildEntertainmentDataList;
        proto._buildEntertainmentDataList = function () {
            var dataList = origBuildEnt.apply(this, arguments);
            if (dataList && dataList.items) {
                sortEntertainmentItems(dataList.items);
            }
            return dataList;
        };

        if (global.framework && typeof global.framework.getAppInstance === 'function') {
            var currentApp = global.framework.getAppInstance('system');
            if (currentApp && currentApp._currentContext && currentApp._currentContext.ctxtId === 'Entertainment' &&
                currentApp._currentContextTemplate && currentApp._currentContextTemplate.list2Ctrl) {
                var list = currentApp._buildEntertainmentDataList();
                if (list && list.items) {
                    currentApp._currentContextTemplate.list2Ctrl.setDataList(list);
                    currentApp._currentContextTemplate.list2Ctrl.updateItems(0, list.items.length - 1);
                }
            }
        }
    }

    // Expose global resort function
    global.mzdTweaksResortEntertainment = function () {
        var fw = (global.parent && global.parent.framework) || global.framework;
        var sysApp = fw && typeof fw.getAppInstance === 'function' ? fw.getAppInstance('system') : null;
        if (sysApp && typeof sysApp._buildEntertainmentDataList === 'function') {
            var dataList = sysApp._buildEntertainmentDataList();
            if (sysApp._currentContext && sysApp._currentContext.ctxtId === 'Entertainment' &&
                sysApp._currentContextTemplate && sysApp._currentContextTemplate.list2Ctrl &&
                dataList && dataList.items) {
                sysApp._currentContextTemplate.list2Ctrl.setDataList(dataList);
                sysApp._currentContextTemplate.list2Ctrl.updateItems(0, dataList.items.length - 1);
            }
            return dataList;
        }
    };

    function hookFramework() {
        if (global.framework && typeof global.framework.instantiateControl === 'function' && !global.framework._mzdTweaksInstantiateHooked) {
            global.framework._mzdTweaksInstantiateHooked = true;
            var origInstantiate = global.framework.instantiateControl;
            global.framework.instantiateControl = function (uia, parent, type, props) {
                if (type === 'List2Ctrl') {
                    hookList2();
                } else if (type === 'MainMenuCtrl') {
                    hookMainMenu();
                }
                return origInstantiate.apply(this, arguments);
            };
        }
    }

    function initHooks() {
        hookMainMenu();
        hookList2();
        hookSystemApp();
        hookFramework();

        // Also poll during initial boot until both controls are hooked or limit reached
        var pollTimer = global.setInterval || (typeof setInterval !== 'undefined' ? setInterval : null);
        var clearTimer = global.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval : null);
        var isHooked = function () {
            return global.MainMenuCtrl && global.MainMenuCtrl.prototype && global.MainMenuCtrl.prototype._mzdTweaksHooked &&
                global.List2Ctrl && global.List2Ctrl.prototype && global.List2Ctrl.prototype._mzdTweaksHooked &&
                global.systemApp && global.systemApp.prototype && global.systemApp.prototype._mzdTweaksHooked;
        };
        if (pollTimer && !isHooked()) {
            var attempts = 0;
            var maxAttempts = 300;
            var poll = null;
            var pollFn = function () {
                attempts++;
                hookMainMenu();
                hookList2();
                hookSystemApp();
                hookFramework();
                if (isHooked() || attempts >= maxAttempts) {
                    if (clearTimer && poll !== null) { clearTimer(poll); }
                }
            };
            poll = pollTimer(pollFn, 100);
            if ((isHooked() || attempts >= maxAttempts) && clearTimer && poll !== null) {
                clearTimer(poll);
            }
        }
    }

    initHooks();

    global.MzdGuiResidents.register('mzd-tweaks', function (context) {
        if (!global.MzdSettingsHost) {
            // settings-host.js did not load. The runtime logs this and stops only this resident.
            throw new Error('Shared settings code is unavailable.');
        }
        function applyGlobals(settings) {
            var k, subKey;
            if (!global.mzdTweaks) { global.mzdTweaks = {}; }
            if (!global.mzdTweaks.audio_order) { global.mzdTweaks.audio_order = {}; }
            for (k in settings) {
                if (Object.prototype.hasOwnProperty.call(settings, k)) {
                    if (k.indexOf('audio_order.') === 0) {
                        subKey = k.substring(12);
                        global.mzdTweaks.audio_order[subKey] = settings[k];
                    } else if (k === 'audio_order' && typeof settings[k] === 'object' && settings[k] !== null) {
                        for (subKey in settings[k]) {
                            if (Object.prototype.hasOwnProperty.call(settings[k], subKey)) {
                                global.mzdTweaks.audio_order[subKey] = settings[k][subKey];
                            }
                        }
                    } else {
                        global.mzdTweaks[k] = settings[k];
                    }
                }
            }
            backfillDefaults(global.mzdTweaks);
            if (typeof global.mzdTweaksResortEntertainment === 'function') {
                try {
                    global.mzdTweaksResortEntertainment();
                } catch (error) {
                    context.log('Failed to resort entertainment list: ' + (error && error.message ? error.message : error));
                    context.notify('Failed to save settings. Please retry.', true);
                }
            }
        }

        global.MzdSettingsHost.create(context, {
            prefix: 'mzd-tweaks',
            syncOnStart: true,
            onConfirmed: applyGlobals
        });
    });
}(window));
