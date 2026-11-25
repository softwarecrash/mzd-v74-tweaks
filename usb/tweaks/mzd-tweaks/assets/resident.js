/*
 * MZD Tweaks resident. The shared settings host owns the native menu and the
 * save queue; this file keeps window.mzdTweaks in sync and hooks MainMenuCtrl,
 * List2Ctrl, StatusBarCtrl, Common and systemApp at runtime without modifying OEM files.
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

    var MAIN_MENU_ITEMS = [
        { key: 'main_menu_app', prefix: 'App', defaultIdx: 0 },
        { key: 'main_menu_ent', prefix: 'Ent', defaultIdx: 1 },
        { key: 'main_menu_com', prefix: 'Com', defaultIdx: 2 },
        { key: 'main_menu_nav', prefix: 'Nav', defaultIdx: 3 },
        { key: 'main_menu_set', prefix: 'Set', defaultIdx: 4 }
    ];

    var MAIN_MENU_SLOTS = [
        { slot: 1, focusTranslateX: 30,  focusTranslateY: -53 },
        { slot: 2, focusTranslateX: -15, focusTranslateY: -30 },
        { slot: 3, focusTranslateX: -15, focusTranslateY: -30 },
        { slot: 4, focusTranslateX: -15, focusTranslateY: -30 },
        { slot: 5, focusTranslateX: -58, focusTranslateY: -53 }
    ];

    var MAIN_MENU_Z_ORDER = [1, 2, 3, 4, 0];

    var DEFAULT_MAIN_MENU_ORDER = {
        main_menu_app: 0,
        main_menu_ent: 1,
        main_menu_com: 2,
        main_menu_nav: 3,
        main_menu_set: 4
    };

    var DEFAULTS = {
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

    var EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var DATE_MODES = { off: true, weekday: true, month_text: true, month_numeric: true };

    // statusbar_date is off, weekday, month_text or month_numeric. true and false
    // from older settings.js files read as weekday and off.
    function statusbarDateMode() {
        var value = global.mzdTweaks && global.mzdTweaks.statusbar_date;
        if (value === true) { return 'weekday'; }
        return (typeof value === 'string' && Object.prototype.hasOwnProperty.call(DATE_MODES, value)) ? value : 'off';
    }

    function statusbarDateEnabled() {
        return statusbarDateMode() !== 'off';
    }

    function twoDigits(value) {
        return (value < 10 ? '0' : '') + value;
    }

    // Short date for the status bar: "Wed 18" (weekday), "Nov 18" (month_text) or
    // "11/18" (month_numeric). Names and the order come from the mzd-tweaks translations
    // (Opera on the head unit has no Intl); English is used until they are loaded.
    // The same rules are in view.js for the examples in the menu.
    function statusbarDateText(date, mode) {
        var i18n = global.MzdGuiI18n, month = date.getMonth(), day = date.getDate(), pattern;
        function t(key, fallback) {
            return (i18n && typeof i18n.text === 'function') ? i18n.text('mzd-tweaks', key, fallback) : fallback;
        }
        if (mode === 'month_numeric') {
            pattern = t('date_numeric_format', '{m}/{d}');
            if (typeof pattern !== 'string' || pattern.indexOf('{m}') < 0 || pattern.indexOf('{d}') < 0) {
                pattern = '{m}/{d}';
            }
            return pattern.replace('{m}', twoDigits(month + 1)).replace('{d}', twoDigits(day));
        }
        if (mode === 'month_text') {
            pattern = t('date_text_format', '{M} {d}');
            if (typeof pattern !== 'string' || pattern.indexOf('{d}') < 0 ||
                (pattern.indexOf('{M}') < 0 && pattern.indexOf('{n}') < 0)) {
                pattern = '{M} {d}';
            }
            return pattern.replace('{M}', t('month_' + EN_MONTHS[month].toLowerCase(), EN_MONTHS[month]))
                .replace('{n}', String(month + 1)).replace('{d}', String(day));
        }
        return t('weekday_' + EN_DAYS[date.getDay()].toLowerCase(), EN_DAYS[date.getDay()]) + ' ' + day;
    }

    function clockText(clock) {
        return clock.innerText || clock.textContent || '';
    }

    function isStatusbarAAContext() {
        var fw = global.framework, contextId;
        try {
            contextId = fw && typeof fw.getCurrCtxtId === 'function' ? fw.getCurrCtxtId() : '';
        } catch (error) {
            // Unknown context: keep the factory clock rather than risk drawing over AA/CarPlay.
            if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
                global.MzdGuiResidents.log('mzd-tweaks', 'Status bar context unknown; keeping the factory clock: ' + (error && error.message ? error.message : error));
            }
            return true;
        }
        return contextId === 'AndroidAutoUI' || contextId === 'CarPlayUI';
    }

    // Puts the factory clock back: its text and the CSS-defined layout.
    function restoreClock(clock) {
        if (clock._mzdTweaksOut !== undefined && clockText(clock) === clock._mzdTweaksOut) {
            clock.innerText = clock._mzdTweaksTime;
        }
        clock._mzdTweaksOut = undefined;
        clock.style.top = '';
    }

    // The framework reports 0 until the first system time arrives; that is not a date.
    // Returns null when no real time is available yet, so the caller can skip the date.
    function statusbarDate(currentTime) {
        var ms = typeof currentTime === 'number' ? currentTime :
            (currentTime && typeof currentTime.getTime === 'function' ? currentTime.getTime() : NaN);
        return ms > 0 ? new Date(ms) : null;
    }

    // Time on the first line (smaller), short date on the second line. The clock
    // keeps its factory box, so the status bar does not grow.
    function renderClock(clock, currentTime) {
        var current, time, date, timeLine, dateLine;
        if (!statusbarDateEnabled() || isStatusbarAAContext()) {
            restoreClock(clock);
            return;
        }
        current = clockText(clock);
        // Text written here is not the factory time; keep the saved factory time.
        time = clock._mzdTweaksOut !== undefined && current === clock._mzdTweaksOut ? clock._mzdTweaksTime : current;
        if (!time) { return; }
        date = statusbarDate(currentTime);
        if (!date) {
            restoreClock(clock);
            return;
        }
        timeLine = global.document.createElement('div');
        timeLine.style.fontSize = '30px';
        timeLine.style.lineHeight = '32px';
        timeLine.style.paddingTop = '5px';
        timeLine.textContent = time;
        dateLine = global.document.createElement('div');
        dateLine.style.fontSize = '22px';
        dateLine.style.lineHeight = '22px';
        dateLine.textContent = statusbarDateText(date, statusbarDateMode());
        clock.innerText = '';
        clock.appendChild(timeLine);
        clock.appendChild(dateLine);
        clock.style.top = '0';
        clock._mzdTweaksTime = time;
        clock._mzdTweaksOut = clockText(clock);
    }

    // Each clock is isolated: a failure restores that clock and the others still refresh.
    function refreshStatusbarDisplays(log) {
        var fw = global.framework, doc = global.document, currentTime = null, clocks, i;
        if (!doc || typeof doc.getElementsByClassName !== 'function') { return; }
        try {
            if (fw && fw.common && typeof fw.common.getCurrentTime === 'function') {
                currentTime = fw.common.getCurrentTime();
            }
            clocks = doc.getElementsByClassName('StatusBarCtrlClock');
        } catch (error) {
            if (typeof log === 'function') {
                log('Status bar refresh failed: ' + (error && error.message ? error.message : error));
            }
            return;
        }
        for (i = 0; i < clocks.length; i++) {
            try {
                renderClock(clocks[i], currentTime);
            } catch (error) {
                try { restoreClock(clocks[i]); } catch (ignoreRestore) { /* element unusable */ }
                if (typeof log === 'function') {
                    log('Status bar refresh failed: ' + (error && error.message ? error.message : error));
                }
            }
        }
    }

    function backfillOrderDefaults(obj, propName, defaultsObj) {
        var subKey;
        if (!obj[propName]) {
            obj[propName] = {};
        }
        for (subKey in defaultsObj) {
            if (Object.prototype.hasOwnProperty.call(defaultsObj, subKey) && obj[propName][subKey] === undefined) {
                obj[propName][subKey] = defaultsObj[subKey];
            }
        }
    }

    function backfillDefaults(obj) {
        if (!obj) { return; }
        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && obj[k] === undefined) {
                if (k === 'audio_order') {
                    obj[k] = {};
                    backfillOrderDefaults(obj, 'audio_order', DEFAULT_AUDIO_ORDER);
                } else if (k === 'main_menu_order') {
                    obj[k] = {};
                    backfillOrderDefaults(obj, 'main_menu_order', DEFAULT_MAIN_MENU_ORDER);
                } else {
                    obj[k] = DEFAULTS[k];
                }
            }
        }
        backfillOrderDefaults(obj, 'audio_order', DEFAULT_AUDIO_ORDER);
        backfillOrderDefaults(obj, 'main_menu_order', DEFAULT_MAIN_MENU_ORDER);
    }

    if (!global.mzdTweaks) {
        global.mzdTweaks = {};
    }
    backfillDefaults(global.mzdTweaks);

    var VALID_THEMES = {
        red: true,
        blue: true,
        green: true,
        orange: true,
        purple: true,
        pink: true,
        silver: true,
        gold: true,
        cyan: true
    };
    var THEME_CLASSES = ['mzd-theme-blue', 'mzd-theme-green', 'mzd-theme-orange', 'mzd-theme-purple', 'mzd-theme-pink', 'mzd-theme-silver', 'mzd-theme-gold', 'mzd-theme-cyan'];
    var GLOW_CLASSES = ['mzd-coins-glow', 'mzd-no-coins-glow'];
    var LAYOUT_CLASSES = ['mzd-layout-flat'];
    var SIZE_CLASSES = ['mzd-coins-80', 'mzd-coins-60'];
    var themeDomListenerAttached = false;

    function ensureBaseStylesheet() {
        var doc = global.document;
        if (!doc) { return; }
        var linkId = 'mzd-tweaks-base-css';
        if (typeof doc.getElementById === 'function' && !doc.getElementById(linkId)) {
            var link = doc.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = '/data/integration/mzd-gui-modules/mzd-tweaks/assets/mzd-tweaks.css';
            (doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement).appendChild(link);
        }
    }

    function applyTheme(themeName) {
        var doc = global.document, body, i, cls, newCls;
        var commonLinkId, commonLink, colorLinkId, colorLink, glowEnabled;
        if (!doc) { return; }
        body = doc.body;
        if (!body) {
            if (doc.addEventListener && !themeDomListenerAttached) {
                themeDomListenerAttached = true;
                doc.addEventListener('DOMContentLoaded', function () {
                    themeDomListenerAttached = false;
                    applyTheme(global.mzdTweaks && global.mzdTweaks.theme);
                }, false);
            }
            return;
        }
        if (typeof themeName !== 'string' || !Object.prototype.hasOwnProperty.call(VALID_THEMES, themeName)) {
            themeName = 'red';
        }
        ensureBaseStylesheet();
        cls = body.className || '';
        for (i = 0; i < THEME_CLASSES.length; i++) {
            cls = cls.replace(new RegExp('\\b' + THEME_CLASSES[i] + '\\b', 'g'), '');
        }
        for (i = 0; i < GLOW_CLASSES.length; i++) {
            cls = cls.replace(new RegExp('\\b' + GLOW_CLASSES[i] + '\\b', 'g'), '');
        }
        for (i = 0; i < LAYOUT_CLASSES.length; i++) {
            cls = cls.replace(new RegExp('\\b' + LAYOUT_CLASSES[i] + '\\b', 'g'), '');
        }
        for (i = 0; i < SIZE_CLASSES.length; i++) {
            cls = cls.replace(new RegExp('\\b' + SIZE_CLASSES[i] + '\\b', 'g'), '');
        }
        cls = cls.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

        commonLinkId = 'mzd-tweaks-theme-common-css';
        commonLink = typeof doc.getElementById === 'function' ? doc.getElementById(commonLinkId) : null;
        colorLinkId = 'mzd-tweaks-theme-color-css';
        colorLink = typeof doc.getElementById === 'function' ? doc.getElementById(colorLinkId) : null;

        if (themeName && themeName !== 'red') {
            newCls = 'mzd-theme-' + themeName;
            cls = cls ? (cls + ' ' + newCls) : newCls;

            var commonHref = '/data/integration/mzd-gui-modules/mzd-tweaks/assets/theme-common.css';
            if (!commonLink) {
                commonLink = doc.createElement('link');
                commonLink.id = commonLinkId;
                commonLink.rel = 'stylesheet';
                commonLink.type = 'text/css';
                commonLink.href = commonHref;
                (doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement).appendChild(commonLink);
            }

            var targetHref = '/data/integration/mzd-gui-modules/mzd-tweaks/assets/themes/theme-' + themeName + '.css';
            if (!colorLink) {
                colorLink = doc.createElement('link');
                colorLink.id = colorLinkId;
                colorLink.rel = 'stylesheet';
                colorLink.type = 'text/css';
                colorLink.setAttribute('data-theme', themeName);
                colorLink.href = targetHref;
                (doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement).appendChild(colorLink);
            } else if (colorLink.getAttribute('data-theme') !== themeName) {
                colorLink.setAttribute('data-theme', themeName);
                colorLink.href = targetHref;
            }
        } else {
            // For factory 'red', remove both theme-common.css and color theme stylesheet so OEM styles run unmodified
            if (commonLink && commonLink.parentNode) {
                commonLink.parentNode.removeChild(commonLink);
            }
            if (colorLink && colorLink.parentNode) {
                colorLink.parentNode.removeChild(colorLink);
            }
        }

        glowEnabled = !global.mzdTweaks || global.mzdTweaks.main_menu_coins_glow !== false;
        cls = cls ? (cls + ' ' + (glowEnabled ? 'mzd-coins-glow' : 'mzd-no-coins-glow')) : (glowEnabled ? 'mzd-coins-glow' : 'mzd-no-coins-glow');

        if (global.mzdTweaks && global.mzdTweaks.main_menu_coins_layout === 'flat') {
            cls += ' mzd-layout-flat';
        }

        if (global.mzdTweaks && global.mzdTweaks.main_menu_coins_size === 80) {
            cls += ' mzd-coins-80';
        } else if (global.mzdTweaks && global.mzdTweaks.main_menu_coins_size === 60) {
            cls += ' mzd-coins-60';
        }

        if (body.className !== cls) {
            body.className = cls;
            var liveCtrl = findLiveMainMenuCtrl();
            if (liveCtrl) {
                var focusState = captureMainMenuFocusState(liveCtrl);
                recomputeMainMenuHitAreas(liveCtrl);
                restoreMainMenuFocusState(liveCtrl, focusState);
            }
        }
    }

    applyTheme(global.mzdTweaks.theme);

    function previewServiceActive() {
        try {
            return !!(global.mzdPreviewServiceDefaults ||
                (global.parent && global.parent.mzdPreviewServiceDefaults));
        } catch (ignore) {
            return false; // Cross-origin parent: not the preview.
        }
    }

    if (!previewServiceActive()) {
        try {
            var bootScript = document.createElement('script');
            bootScript.type = 'text/javascript';
            bootScript.src = '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js';
            bootScript.onload = function () {
                backfillDefaults(global.mzdTweaks);
                applyTheme(global.mzdTweaks.theme);
                applyMainMenuOrder(null);
            };
            bootScript.onerror = function (event) {
                if (event && event.preventDefault) { event.preventDefault(); }
                backfillDefaults(global.mzdTweaks);
                applyTheme(global.mzdTweaks.theme);
                applyMainMenuOrder(null);
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
    }

    // --- Runtime hooks for OEM controls ---

    // 1. Main Menu Loop & Order
    function getOrderedMainMenuItems() {
        var list = MAIN_MENU_ITEMS.slice();
        var isCustom = global.mzdTweaks && global.mzdTweaks.main_menu_order_custom;
        var order = isCustom && global.mzdTweaks && global.mzdTweaks.main_menu_order;
        if (!isCustom || !order) {
            return list;
        }
        list.sort(function (a, b) {
            var va = (typeof order[a.key] === 'number') ? order[a.key] : a.defaultIdx;
            var vb = (typeof order[b.key] === 'number') ? order[b.key] : b.defaultIdx;
            if (va !== vb) { return va - vb; }
            return a.defaultIdx - b.defaultIdx;
        });
        return list;
    }

    function findLiveMainMenuCtrl() {
        var fw = global.framework || (global.parent && global.parent.framework);
        var sysApp = fw && typeof fw.getAppInstance === 'function' ? fw.getAppInstance('system') : null;
        var tmplt = sysApp && sysApp._currentContextTemplate;
        return (tmplt && (tmplt.mainMenuControl || tmplt.mainMenuCtrl)) || null;
    }

    function recomputeMainMenuHitAreas(ctrl) {
        var i;
        if (!ctrl || !ctrl._coins || typeof ctrl._computeHitAreas !== 'function') { return; }
        for (i = 0; i < ctrl._coins.length; i++) {
            ctrl._computeHitAreas(ctrl._coins[i]);
        }
    }

    function captureMainMenuFocusState(ctrl) {
        var prevFocus = -1, hadHighlight = false, i, coin;
        if (!ctrl || !ctrl._coins) {
            return { prevFocus: -1, hadHighlight: false };
        }
        if (typeof ctrl._getFocus === 'function') {
            prevFocus = ctrl._getFocus();
        }
        for (i = 0; i < ctrl._coins.length; i++) {
            coin = ctrl._coins[i];
            if (coin && coin.div && typeof coin.div.className === 'string' &&
                coin.div.className.indexOf('MainMenuCtrlCoinFocus') !== -1) {
                hadHighlight = true;
                if (prevFocus < 0) { prevFocus = i; }
            }
        }
        return { prevFocus: prevFocus, hadHighlight: hadHighlight };
    }

    function restoreMainMenuFocusState(ctrl, state) {
        if (!ctrl || !ctrl._coins || !state) { return; }
        if (state.prevFocus >= 0 && state.prevFocus < ctrl._coins.length) {
            if (typeof ctrl._setFocus === 'function') {
                ctrl._setFocus(state.prevFocus);
            }
            if (state.hadHighlight && typeof ctrl._setHighlight === 'function') {
                ctrl._fullyHighlightedIndex = null;
                ctrl._setHighlight(state.prevFocus);
            }
        }
    }

    function reorderMainMenuCoins(ctrl) {
        var ordered, byKey, i, coin, newCoins, slotMeta;
        if (!ctrl || !ctrl._coins || ctrl._coins.length !== MAIN_MENU_ITEMS.length) {
            return false;
        }
        ordered = getOrderedMainMenuItems();
        byKey = {};
        for (i = 0; i < ctrl._coins.length; i++) {
            coin = ctrl._coins[i];
            if (coin && coin.key) {
                byKey[coin.key] = coin;
            }
        }
        newCoins = [];
        for (i = 0; i < ordered.length; i++) {
            coin = byKey[ordered[i].prefix];
            if (!coin) {
                return false;
            }
            slotMeta = MAIN_MENU_SLOTS[i];
            coin.focusTranslateX = slotMeta.focusTranslateX;
            coin.focusTranslateY = slotMeta.focusTranslateY;
            newCoins.push(coin);
        }
        for (i = 0; i < newCoins.length; i++) {
            ctrl._coins[i] = newCoins[i];
        }
        return true;
    }

    function setCoinSlotClass(el, baseCls, numberedPrefix, slotNum) {
        var cls;
        if (!el || typeof el.className !== 'string') { return; }
        cls = el.className
            .replace(new RegExp('\\b' + baseCls + '\\b', 'g'), '')
            .replace(new RegExp('\\b' + numberedPrefix + '\\d+\\b', 'g'), '')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
        cls = cls ? (cls + ' ' + baseCls + ' ' + numberedPrefix + slotNum) : (baseCls + ' ' + numberedPrefix + slotNum);
        if (el.className !== cls) {
            el.className = cls;
        }
    }

    function syncMainMenuDomOrder(ctrl, reorderDom) {
        var i, coin, root;
        if (!ctrl || !ctrl._coins || ctrl._coins.length !== MAIN_MENU_ITEMS.length) { return; }
        for (i = 0; i < ctrl._coins.length; i++) {
            coin = ctrl._coins[i];
            if (!coin) { continue; }
            setCoinSlotClass(coin.div, 'mzd-coin', 'mzd-coin-', i + 1);
            setCoinSlotClass(coin.highlight, 'mzd-coin-highlight', 'mzd-coin-highlight-', i + 1);
        }
        if (!reorderDom) { return; }
        root = ctrl.divElt;
        if (root && typeof root.appendChild === 'function') {
            for (i = 0; i < ctrl._coins.length; i++) {
                coin = ctrl._coins[i];
                if (coin && coin.div) {
                    if (coin.setHighlightEndBinder && typeof coin.div.removeEventListener === 'function') {
                        coin.div.removeEventListener('OTransitionEnd', coin.setHighlightEndBinder, false);
                    }
                    if (typeof ctrl._setHighlightEnd === 'function') {
                        coin.setHighlightEndBinder = ctrl._setHighlightEnd.bind(ctrl, i);
                        if (typeof coin.div.addEventListener === 'function') {
                            coin.div.addEventListener('OTransitionEnd', coin.setHighlightEndBinder, false);
                        }
                    }
                }
            }
            for (i = 0; i < 3; i++) {
                coin = ctrl._coins[MAIN_MENU_Z_ORDER[i]];
                if (coin && coin.highlight) { root.appendChild(coin.highlight); }
            }
            for (i = 0; i < 3; i++) {
                coin = ctrl._coins[MAIN_MENU_Z_ORDER[i]];
                if (coin && coin.div) { root.appendChild(coin.div); }
            }
            for (i = 3; i < MAIN_MENU_Z_ORDER.length; i++) {
                coin = ctrl._coins[MAIN_MENU_Z_ORDER[i]];
                if (coin && coin.highlight) { root.appendChild(coin.highlight); }
                if (coin && coin.div) { root.appendChild(coin.div); }
            }
            if (ctrl._iconNameDiv) { root.appendChild(ctrl._iconNameDiv); }
        }
        recomputeMainMenuHitAreas(ctrl);
    }

    function applyMainMenuOrder(ctrl) {
        var doc = global.document, body, cls, isCustom, targetCtrl, focusState;
        if (!doc) { return; }
        isCustom = !!(global.mzdTweaks && global.mzdTweaks.main_menu_order_custom);
        body = doc.body;
        if (body) {
            cls = (body.className || '').replace(/\bmzd-main-menu-custom\b/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
            if (isCustom) {
                cls = cls ? (cls + ' mzd-main-menu-custom') : 'mzd-main-menu-custom';
            }
            if (body.className !== cls) {
                body.className = cls;
            }
        }
        targetCtrl = ctrl || findLiveMainMenuCtrl();
        if (!targetCtrl || !targetCtrl._coins || targetCtrl._coins.length !== MAIN_MENU_ITEMS.length) {
            return;
        }
        focusState = captureMainMenuFocusState(targetCtrl);
        if (!reorderMainMenuCoins(targetCtrl)) {
            return;
        }
        syncMainMenuDomOrder(targetCtrl, true);
        restoreMainMenuFocusState(targetCtrl, focusState);
    }

    global.mzdTweaksApplyMainMenuOrder = function () {
        applyMainMenuOrder(null);
    };

    function hookMainMenu() {
        var proto, origCreateStructure, origOffsetFocus, liveCtrl;
        if (!global.MainMenuCtrl || !global.MainMenuCtrl.prototype) {
            return;
        }
        proto = global.MainMenuCtrl.prototype;
        if (!proto._mzdTweaksHooked) {
            proto._mzdTweaksHooked = true;

            origCreateStructure = proto.createStructure;
            if (typeof origCreateStructure === 'function') {
                proto.createStructure = function () {
                    reorderMainMenuCoins(this);
                    var res = origCreateStructure.apply(this, arguments);
                    syncMainMenuDomOrder(this, false);
                    return res;
                };
            }

            origOffsetFocus = proto._offsetFocus;
            if (typeof origOffsetFocus === 'function') {
                proto._offsetFocus = function (direction) {
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

        liveCtrl = findLiveMainMenuCtrl();
        applyMainMenuOrder(liveCtrl);
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

        // Swatch previews in Theme selection subpage
        function isCustomTweakMenu(ctrl) {
            return !!(ctrl && ctrl.parentDiv && typeof ctrl.parentDiv.className === 'string' &&
                ctrl.parentDiv.className.indexOf('mzd-custom-menu') !== -1);
        }
        function themeSwatchId(ctrl, idx) {
            var items, item, appData, themeId;
            if (!isCustomTweakMenu(ctrl)) { return null; }
            if (!ctrl.dataList || !ctrl.dataList.items || typeof idx !== 'number' || idx < 0) { return null; }
            items = ctrl.dataList.items;
            if (idx >= items.length) { return null; }
            item = items[idx];
            appData = item && item.appData;
            if (!appData || appData.page !== 'theme' || typeof appData.id !== 'string' || appData.id.indexOf('theme-') !== 0) {
                return null;
            }
            themeId = appData.id.substring(6);
            return Object.prototype.hasOwnProperty.call(VALID_THEMES, themeId) ? themeId : null;
        }
        function stripThemeRowClasses(el) {
            if (!el || typeof el.className !== 'string' || el.className.indexOf('mzd-theme-row') === -1) {
                return;
            }
            el.className = el.className.replace(/\bmzd-theme-row\S*/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        }
        function applyThemeSwatchClass(el, themeId) {
            var cls;
            if (!el) { return; }
            stripThemeRowClasses(el);
            if (themeId) {
                cls = typeof el.className === 'string' ? el.className : '';
                el.className = cls ? (cls + ' mzd-theme-row mzd-theme-row-' + themeId) : ('mzd-theme-row mzd-theme-row-' + themeId);
            }
        }
        var origGetListItem = proto._getListItem;
        if (typeof origGetListItem === 'function') {
            proto._getListItem = function (listItem, dataListIndex) {
                var li = origGetListItem.apply(this, arguments);
                try {
                    if (li) {
                        applyThemeSwatchClass(li, themeSwatchId(this, dataListIndex));
                    }
                } catch (errGetItem) {
                    if (global.MzdGuiResidents && typeof global.MzdGuiResidents.log === 'function') {
                        global.MzdGuiResidents.log('mzd-tweaks', 'Theme swatch update in _getListItem failed: ' + (errGetItem && errGetItem.message ? errGetItem.message : errGetItem));
                    }
                }
                return li;
            };
        }
        var origUpdateItems = proto.updateItems;
        if (typeof origUpdateItems === 'function') {
            proto.updateItems = function () {
                var res = origUpdateItems.apply(this, arguments);
                try {
                    if (this.items) {
                        for (var k = 0; k < this.items.length; k++) {
                            var it = this.items[k];
                            if (it && it.domElt) {
                                applyThemeSwatchClass(it.domElt, themeSwatchId(this, it.ref));
                            }
                        }
                    }
                } catch (errUpdateItems) {
                    if (global.MzdGuiResidents && typeof global.MzdGuiResidents.log === 'function') {
                        global.MzdGuiResidents.log('mzd-tweaks', 'Theme swatch update in updateItems failed: ' + (errUpdateItems && errUpdateItems.message ? errUpdateItems.message : errUpdateItems));
                    }
                }
                return res;
            };
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

    function bluetoothNotificationEnabled() {
        return !global.mzdTweaks || global.mzdTweaks.bluetooth_notification !== false;
    }

    function isBtConnectionSbn(uiaId, sbnId) {
        return uiaId === 'btpairing' && (sbnId === 'PhoneConnectionStatus' || sbnId === 'AudioConnectionStatus');
    }

    function hookCommon() {
        var proto = (global.Common && global.Common.prototype && typeof global.Common.prototype.startTimedSbn === 'function')
            ? global.Common.prototype
            : (global.framework && global.framework.common && Object.getPrototypeOf(global.framework.common));

        function wrapStartTimedSbn(target) {
            var origStartTimedSbn = target.startTimedSbn;
            target._mzdTweaksBtHooked = true;
            target.startTimedSbn = function (uiaId, sbnId, type, properties) {
                if (!bluetoothNotificationEnabled() && isBtConnectionSbn(uiaId, sbnId)) {
                    if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
                        global.MzdGuiResidents.log('mzd-tweaks', 'Suppressed Bluetooth connection SBN: ' + uiaId + ' ' + sbnId);
                    }
                    return;
                }
                return origStartTimedSbn.apply(this, arguments);
            };
        }

        if (proto && !proto._mzdTweaksBtHooked && typeof proto.startTimedSbn === 'function') {
            wrapStartTimedSbn(proto);
        }

        if (global.framework && global.framework.common && typeof global.framework.common.startTimedSbn === 'function' &&
            !Object.prototype.hasOwnProperty.call(global.framework.common, '_mzdTweaksBtHooked') &&
            Object.prototype.hasOwnProperty.call(global.framework.common, 'startTimedSbn')) {
            wrapStartTimedSbn(global.framework.common);
        }
    }

    function hookStatusbar() {
        var proto = global.StatusBarCtrl && global.StatusBarCtrl.prototype;
        if (!proto || proto._mzdTweaksDateHooked) { return; }
        if (typeof proto.updateClock !== 'function' && typeof proto._updateClock !== 'function') {
            if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
                global.MzdGuiResidents.log('mzd-tweaks', 'StatusBarCtrl has no updateClock method; date in status bar is unavailable');
            }
            return;
        }

        function wrapClockMethod(name) {
            var original = proto[name];
            if (typeof original !== 'function') { return; }
            proto[name] = function () {
                var result = original.apply(this, arguments);
                try {
                    if (this.clock) { renderClock(this.clock, arguments.length ? arguments[0] : null); }
                } catch (error) {
                    if (this.clock) { restoreClock(this.clock); }
                    if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
                        global.MzdGuiResidents.log('mzd-tweaks', 'Status bar date display failed: ' + (error && error.message ? error.message : error));
                    }
                }
                return result;
            };
        }

        proto._mzdTweaksDateHooked = true;
        wrapClockMethod('updateClock');
        wrapClockMethod('_updateClock');
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
                } else if (type === 'StatusBarCtrl') {
                    hookStatusbar();
                }
                return origInstantiate.apply(this, arguments);
            };
        }
    }

    function initHooks() {
        hookMainMenu();
        hookList2();
        hookSystemApp();
        hookStatusbar();
        hookCommon();
        hookFramework();

        // Also poll during initial boot until both controls are hooked or limit reached
        var pollTimer = global.setInterval || (typeof setInterval !== 'undefined' ? setInterval : null);
        var clearTimer = global.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval : null);
        var isHooked = function () {
            return global.MainMenuCtrl && global.MainMenuCtrl.prototype && global.MainMenuCtrl.prototype._mzdTweaksHooked &&
                global.List2Ctrl && global.List2Ctrl.prototype && global.List2Ctrl.prototype._mzdTweaksHooked &&
                global.systemApp && global.systemApp.prototype && global.systemApp.prototype._mzdTweaksHooked &&
                global.StatusBarCtrl && global.StatusBarCtrl.prototype && global.StatusBarCtrl.prototype._mzdTweaksDateHooked &&
                ((global.Common && global.Common.prototype && global.Common.prototype._mzdTweaksBtHooked) ||
                 (global.framework && global.framework.common && global.framework.common._mzdTweaksBtHooked));
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
                hookStatusbar();
                hookCommon();
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
            if (!global.mzdTweaks.main_menu_order) { global.mzdTweaks.main_menu_order = {}; }
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
                    } else if (k.indexOf('main_menu_order.') === 0) {
                        subKey = k.substring(16);
                        global.mzdTweaks.main_menu_order[subKey] = settings[k];
                    } else if (k === 'main_menu_order' && typeof settings[k] === 'object' && settings[k] !== null) {
                        for (subKey in settings[k]) {
                            if (Object.prototype.hasOwnProperty.call(settings[k], subKey)) {
                                global.mzdTweaks.main_menu_order[subKey] = settings[k][subKey];
                            }
                        }
                    } else {
                        global.mzdTweaks[k] = settings[k];
                    }
                }
            }
            backfillDefaults(global.mzdTweaks);
            if (Object.prototype.hasOwnProperty.call(settings, 'theme') ||
                Object.prototype.hasOwnProperty.call(settings, 'main_menu_coins_glow') ||
                Object.prototype.hasOwnProperty.call(settings, 'main_menu_coins_size') ||
                Object.prototype.hasOwnProperty.call(settings, 'main_menu_coins_layout')) {
                applyTheme(global.mzdTweaks.theme);
            }
            if (Object.prototype.hasOwnProperty.call(settings, 'main_menu_order_custom') ||
                Object.prototype.hasOwnProperty.call(settings, 'main_menu_order') ||
                Object.keys(settings).some(function (key) { return key.indexOf('main_menu_order.') === 0; })) {
                applyMainMenuOrder(null);
            }
            if (Object.prototype.hasOwnProperty.call(settings, 'statusbar_date')) {
                refreshStatusbarDisplays(context.log);
            }
            if (typeof global.mzdTweaksResortEntertainment === 'function') {
                try {
                    global.mzdTweaksResortEntertainment();
                } catch (error) {
                    context.log('Failed to resort entertainment list: ' + (error && error.message ? error.message : error));
                    context.notify('Failed to save settings. Please retry.', true);
                }
            }
        }

        // Translations load after the resident starts; redraw the date once they are ready.
        context.loadLanguage(function () { refreshStatusbarDisplays(context.log); });

        global.MzdSettingsHost.create(context, {
            prefix: 'mzd-tweaks',
            syncOnStart: true,
            onConfirmed: applyGlobals
        });
    });
}(window));
