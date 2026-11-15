/*
 * MZD Tweaks resident. The shared settings host owns the native menu and the
 * save queue; this file keeps window.mzdTweaks in sync and hooks MainMenuCtrl
 * and List2Ctrl at runtime without modifying OEM target files.
 *
 * Three sources set window.mzdTweaks, in this order:
 * 1. The inline defaults below, so OEM code and hooks always find the object.
 * 2. settings.js, written by the service; it loads asynchronously at boot,
 *    before the service is running, and holds the last saved values.
 * 3. The service, through onConfirmed. It runs after a successful read
 *    (syncOnStart) and after each successful save, never for unsaved values.
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        main_menu_loop: false,
        list_loop: false,
        list_beep: true,
        short_delay: false
    };

    function backfillDefaults(obj) {
        if (!obj) { return; }
        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && obj[k] === undefined) {
                obj[k] = DEFAULTS[k];
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
    function wrapListForward(origFn) {
        return function () {
            var beforeIndex = typeof this._getFocussedIndex === 'function' ? this._getFocussedIndex() : -1;
            var res = origFn.apply(this, arguments);
            if (global.mzdTweaks && global.mzdTweaks.list_loop && typeof this._getFocussedIndex === 'function' && this._getFocussedIndex() === beforeIndex) {
                if (beforeIndex >= 0 && this.dataList && this.dataList.items && this.dataList.itemCount > 0) {
                    var nextIndex = beforeIndex + 1;
                    while (nextIndex < this.dataList.itemCount && this.dataList.items[nextIndex] && this.dataList.items[nextIndex].disabled) {
                        nextIndex++;
                    }
                    if (nextIndex >= this.dataList.itemCount) {
                        var idx = 0;
                        while (idx < this.dataList.itemCount && this.dataList.items[idx] && this.dataList.items[idx].disabled) {
                            idx++;
                        }
                        if (idx < this.dataList.itemCount && this.dataList.items[idx] && !this.dataList.items[idx].disabled) {
                            var vis = (this.properties && typeof this.properties.visibleItems === 'number') ? this.properties.visibleItems : 5;
                            var isShort = (this.dataList.itemCount <= vis) || (this._isScrollable === false);
                            if (isShort) {
                                if (typeof this._scrollTo === 'function') {
                                    this._scrollTo(0, 0);
                                }
                                this._topItem = 0;
                                if (typeof this._showFocus === 'function') {
                                    this._showFocus(idx, true);
                                } else if (typeof this._manageFocus === 'function') {
                                    this._manageFocus(idx);
                                }
                            } else {
                                if (typeof this._scrollTo === 'function') {
                                    this._scrollTo(0, 0);
                                }
                                if (typeof this._manageFocus === 'function') {
                                    this._manageFocus(idx);
                                }
                            }
                            return 'consumed';
                        }
                    }
                }
            }
            return res;
        };
    }

    function wrapListBackward(origFn) {
        return function () {
            var beforeIndex = typeof this._getFocussedIndex === 'function' ? this._getFocussedIndex() : -1;
            var res = origFn.apply(this, arguments);
            if (global.mzdTweaks && global.mzdTweaks.list_loop && typeof this._getFocussedIndex === 'function' && this._getFocussedIndex() === beforeIndex) {
                if (beforeIndex >= 0 && this.dataList && this.dataList.items && this.dataList.itemCount > 0) {
                    var prevIndex = beforeIndex - 1;
                    while (prevIndex >= 0 && this.dataList.items[prevIndex] && this.dataList.items[prevIndex].disabled) {
                        prevIndex--;
                    }
                    if (prevIndex < 0) {
                        var idx = this.dataList.itemCount - 1;
                        while (idx >= 0 && this.dataList.items[idx] && this.dataList.items[idx].disabled) {
                            idx--;
                        }
                        if (idx >= 0 && this.dataList.items[idx] && !this.dataList.items[idx].disabled) {
                            var vis = (this.properties && typeof this.properties.visibleItems === 'number') ? this.properties.visibleItems : 5;
                            var isShort = (this.dataList.itemCount <= vis) || (this._isScrollable === false);
                            if (isShort) {
                                if (typeof this._scrollTo === 'function') {
                                    this._scrollTo(0, 0);
                                }
                                this._topItem = 0;
                                if (typeof this._showFocus === 'function') {
                                    this._showFocus(idx, true);
                                } else if (typeof this._manageFocus === 'function') {
                                    this._manageFocus(idx);
                                }
                            } else {
                                var maxTop = this.dataList.itemCount - vis;
                                if (typeof this._scrollTo === 'function' && maxTop > 0) {
                                    this._scrollTo(maxTop, 0);
                                }
                                if (typeof this._manageFocus === 'function') {
                                    this._manageFocus(idx);
                                }
                            }
                            return 'consumed';
                        }
                    }
                }
            }
            return res;
        };
    }

    function wrapScrollDownPage(origFn) {
        return function () {
            if (!global.mzdTweaks || !global.mzdTweaks.list_loop) {
                return origFn.apply(this, arguments);
            }
            var pos = (typeof this._getListPosition === 'function') ? this._getListPosition() : '';
            if (pos === 'onepage') {
                return (typeof this._handleMCDown === 'function') ? this._handleMCDown() : 'consumed';
            }
            var beforeIndex = (typeof this._getFocussedIndex === 'function') ? this._getFocussedIndex() : -1;
            var res = origFn.apply(this, arguments);
            if (beforeIndex >= 0 && (res === 'atLimit' || pos === 'bottom' || (typeof this._getFocussedIndex === 'function' && this._getFocussedIndex() === beforeIndex))) {
                if (this.dataList && this.dataList.items && this.dataList.itemCount > 0) {
                    var idx = 0;
                    while (idx < this.dataList.itemCount && this.dataList.items[idx] && this.dataList.items[idx].disabled) {
                        idx++;
                    }
                    if (idx < this.dataList.itemCount && this.dataList.items[idx] && !this.dataList.items[idx].disabled && typeof this._manageFocus === 'function') {
                        if (typeof this._scrollTo === 'function') {
                            this._scrollTo(0, 0);
                        }
                        this._manageFocus(idx);
                        return 'paged';
                    }
                }
            }
            return res;
        };
    }

    function wrapScrollUpPage(origFn) {
        return function () {
            if (!global.mzdTweaks || !global.mzdTweaks.list_loop) {
                return origFn.apply(this, arguments);
            }
            var pos = (typeof this._getListPosition === 'function') ? this._getListPosition() : '';
            if (pos === 'onepage') {
                return (typeof this._handleMCUp === 'function') ? this._handleMCUp() : 'consumed';
            }
            var beforeIndex = (typeof this._getFocussedIndex === 'function') ? this._getFocussedIndex() : -1;
            var res = origFn.apply(this, arguments);
            if (beforeIndex >= 0 && (res === 'atLimit' || pos === 'top' || (typeof this._getFocussedIndex === 'function' && this._getFocussedIndex() === beforeIndex))) {
                if (this.dataList && this.dataList.items && this.dataList.itemCount > 0) {
                    var idx = this.dataList.itemCount - 1;
                    while (idx >= 0 && this.dataList.items[idx] && this.dataList.items[idx].disabled) {
                        idx--;
                    }
                    if (idx >= 0 && this.dataList.items[idx] && !this.dataList.items[idx].disabled && typeof this._manageFocus === 'function') {
                        var vis = (this.properties && typeof this.properties.visibleItems === 'number') ? this.properties.visibleItems : 5;
                        var maxTop = this.dataList.itemCount - vis;
                        if (typeof this._scrollTo === 'function') {
                            this._scrollTo(maxTop > 0 ? maxTop : 0, 0);
                        }
                        this._manageFocus(idx);
                        return 'paged';
                    }
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
        hookFramework();

        // Also poll during initial boot until both controls are hooked or limit reached
        var pollTimer = global.setInterval || (typeof setInterval !== 'undefined' ? setInterval : null);
        var clearTimer = global.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval : null);
        var isHooked = function () {
            return global.MainMenuCtrl && global.MainMenuCtrl.prototype && global.MainMenuCtrl.prototype._mzdTweaksHooked &&
                global.List2Ctrl && global.List2Ctrl.prototype && global.List2Ctrl.prototype._mzdTweaksHooked;
        };
        if (pollTimer && !isHooked()) {
            var attempts = 0;
            var maxAttempts = 300;
            var poll = null;
            var pollFn = function () {
                attempts++;
                hookMainMenu();
                hookList2();
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
            var k;
            if (!global.mzdTweaks) { global.mzdTweaks = {}; }
            for (k in settings) {
                if (Object.prototype.hasOwnProperty.call(settings, k)) {
                    global.mzdTweaks[k] = settings[k];
                }
            }
            backfillDefaults(global.mzdTweaks);
        }

        global.MzdSettingsHost.create(context, {
            prefix: 'mzd-tweaks',
            syncOnStart: true,
            onConfirmed: applyGlobals
        });
    });
}(window));
