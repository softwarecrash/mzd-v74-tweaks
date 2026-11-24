(function () {
    'use strict';
    var sdk = window.MzdGuiModule, View = window.MzdSettingsView, status = document.getElementById('status');
    if (!sdk) { if (status) { status.textContent = 'Open through Applications.'; } return; }
    if (!View) {
        if (status) { status.textContent = sdk.t('menuError', 'The Mazda menu could not be opened. Please reopen the app.'); }
        sdk.ready();
        return;
    }

    var THEMES = [
        { id: 'red', defaultLabel: 'Stock Red (default)', defaultShortLabel: 'Red' },
        { id: 'blue', defaultLabel: 'Cobalt Blue', defaultShortLabel: 'Blue' },
        { id: 'green', defaultLabel: 'Emerald Green', defaultShortLabel: 'Green' },
        { id: 'orange', defaultLabel: 'Amber Orange', defaultShortLabel: 'Orange' },
        { id: 'purple', defaultLabel: 'Neon Violet', defaultShortLabel: 'Purple' },
        { id: 'pink', defaultLabel: 'Hot Pink', defaultShortLabel: 'Pink' },
        { id: 'silver', defaultLabel: 'Titanium Silver', defaultShortLabel: 'Silver' },
        { id: 'gold', defaultLabel: 'Sunset Gold', defaultShortLabel: 'Gold' },
        { id: 'cyan', defaultLabel: 'Electric Cyan', defaultShortLabel: 'Cyan' }
    ];

    function getThemeShortLabel(id, tr) {
        for (var i = 0; i < THEMES.length; i++) {
            if (THEMES[i].id === id) {
                return (typeof tr === 'function') ? tr('color_' + id, THEMES[i].defaultShortLabel) : THEMES[i].defaultShortLabel;
            }
        }
        return (typeof tr === 'function') ? tr('color_red', 'Red') : 'Red';
    }

    function getThemeLabel(id, tr) {
        for (var i = 0; i < THEMES.length; i++) {
            if (THEMES[i].id === id) {
                return (typeof tr === 'function') ? tr('theme_' + id, THEMES[i].defaultLabel) : THEMES[i].defaultLabel;
            }
        }
        return (typeof tr === 'function') ? tr('theme_red', 'Stock Red (default)') : 'Stock Red (default)';
    }

    function themeIndex(current) {
        for (var i = 0; i < THEMES.length; i++) {
            if (THEMES[i].id === current) {
                return i;
            }
        }
        return 0;
    }

    function themeOption(theme, current, tr) {
        var label = (typeof tr === 'function') ? tr('theme_' + theme.id, theme.defaultLabel) : theme.defaultLabel;
        return {
            id: 'theme-' + theme.id,
            key: 'theme_' + theme.id,
            label: label,
            checkable: true,
            checked: current === theme.id,
            select: function (api) {
                api.back(true);
                var state = api.state() || {};
                if (state.theme !== theme.id) {
                    api.save('theme', theme.id);
                } else {
                    api.render();
                }
            }
        };
    }

    var COINS_SIZES = [
        { id: 100, defaultLabel: 'Default', defaultShortLabel: 'Default' },
        { id: 80, defaultLabel: 'Small', defaultShortLabel: 'Small' },
        { id: 60, defaultLabel: 'Mini', defaultShortLabel: 'Mini' }
    ];

    function getCoinsSizeShortLabel(id, tr) {
        for (var i = 0; i < COINS_SIZES.length; i++) {
            if (COINS_SIZES[i].id === id) {
                return (typeof tr === 'function') ? tr('coins_size_' + id, COINS_SIZES[i].defaultShortLabel) : COINS_SIZES[i].defaultShortLabel;
            }
        }
        return (typeof tr === 'function') ? tr('coins_size_100', 'Default') : 'Default';
    }

    function coinsSizeIndex(current) {
        for (var i = 0; i < COINS_SIZES.length; i++) {
            if (COINS_SIZES[i].id === current) {
                return i;
            }
        }
        return 0;
    }

    function coinsSizeOption(sizeItem, current, tr) {
        var label = (typeof tr === 'function') ? tr('coins_size_' + sizeItem.id, sizeItem.defaultLabel) : sizeItem.defaultLabel;
        return {
            id: 'coins-size-' + sizeItem.id,
            key: 'coins_size_' + sizeItem.id,
            label: label,
            checkable: true,
            checked: current === sizeItem.id,
            select: function (api) {
                api.back(true);
                var state = api.state() || {};
                if (state.main_menu_coins_size !== sizeItem.id) {
                    api.save('main_menu_coins_size', sizeItem.id);
                } else {
                    api.render();
                }
            }
        };
    }

    var AUDIO_SOURCES = [
        { id: 'audio_traffic_info', audioSourceId: 'TrafficInfo', text1Id: 'TrafficAlertsItem', defaultLabel: 'Traffic Alerts', japanOnly: true },
        { id: 'audio_fm_radio', audioSourceId: 'FMRadio', text1Id: 'FmRadio', defaultLabel: 'FM' },
        { id: 'audio_am_radio', audioSourceId: 'AMRadio', text1Id: 'AmRadio', defaultLabel: 'AM' },
        { id: 'audio_dab', audioSourceId: 'DAB', text1Id: 'DabRadio', defaultLabel: 'DAB', hardwareDependent: true },
        { id: 'audio_sat_radio', audioSourceId: 'SatRadio', text1Id: 'SdarsRadio', defaultLabel: 'XM', hardwareDependent: true },
        { id: 'audio_xm_audio', audioSourceId: 'XmAudio', text1Id: 'XMAudio', defaultLabel: 'SXM', hardwareDependent: true },
        { id: 'audio_aha_radio', audioSourceId: 'AhaRadio', text1Id: 'AhaRadio', defaultLabel: 'aha' },
        { id: 'audio_pandora', audioSourceId: 'Pandora', text1Id: 'Pandora', defaultLabel: 'Pandora' },
        { id: 'audio_stitcher', audioSourceId: 'Stitcher', text1Id: 'StitcherItem', defaultLabel: 'Stitcher' },
        { id: 'audio_bt_audio', audioSourceId: 'BTAudio', text1Id: 'Bluetooth', defaultLabel: 'Bluetooth' },
        { id: 'audio_car_play_wifi', audioSourceId: 'CarPlayWifi', text1Id: 'CarPlay', defaultLabel: 'Apple CarPlay', hardwareDependent: true },
        { id: 'audio_car_play', audioSourceId: 'CarPlay', text1Id: 'USB1CarPlay', defaultLabel: 'Apple CarPlay' },
        { id: 'audio_android_auto', audioSourceId: 'AndroidAuto', text1Id: 'USB1AndroidAuto', defaultLabel: 'Android Auto' },
        { id: 'audio_usb_a', audioSourceId: 'USB_A', text1Id: 'UsbAudioA', defaultLabel: 'USB 1' },
        { id: 'audio_usb_b', audioSourceId: 'USB_B', text1Id: 'UsbAudioB', defaultLabel: 'USB 2' },
        { id: 'audio_cd', audioSourceId: 'CD', text1Id: 'CdPlayer', defaultLabel: 'CD', hardwareDependent: true },
        { id: 'audio_aux_in', audioSourceId: 'AuxIn', text1Id: 'AuxIn', defaultLabel: 'Auxiliary' },
        { id: 'audio_dvd', audioSourceId: 'DVD', text1Id: 'DVDItem', defaultLabel: 'DVD', hardwareDependent: true },
        { id: 'audio_tv', audioSourceId: 'TV', text1Id: 'TVItem', defaultLabel: 'TV', hardwareDependent: true }
    ];

    function getAudioSourceLabel(source) {
        try {
            var fw = (window.parent && window.parent.framework) || window.framework;
            if (fw && fw.localize && typeof fw.localize.getLocStr === 'function') {
                var localized = fw.localize.getLocStr('system', source.text1Id);
                if (localized && typeof localized === 'string' && localized !== source.text1Id) {
                    return localized;
                }
            }
        } catch (ignore) {}
        return source.defaultLabel;
    }

    function isAudioSourceAvailable(source) {
        var fw = (window.parent && window.parent.framework) || window.framework;
        if (source.japanOnly) {
            if (!fw || !fw.localize || typeof fw.localize.getRegion !== 'function' || !fw.localize.REGIONS) {
                return false;
            }
            if (fw.localize.getRegion() !== fw.localize.REGIONS.Japan) {
                return false;
            }
        }
        if (fw && typeof fw.getAppInstance === 'function') {
            var sysApp = fw.getAppInstance('system');
            if (sysApp && sysApp._masterEntertainmentDataList && sysApp._masterEntertainmentDataList.items) {
                var items = sysApp._masterEntertainmentDataList.items;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].appData && items[i].appData.audioSourceId === source.audioSourceId) {
                        if (source.hardwareDependent) {
                            return items[i].appData.isVisible === true;
                        }
                        return true;
                    }
                }
                return false;
            }
        }
        return true;
    }

    var currentOrder = null;
    var savedOrder = null;
    var pendingOrderSave = null;
    var activeReorderId = null;

    function hasOrderChanged() {
        if (!currentOrder || !savedOrder || currentOrder.length !== savedOrder.length) {
            return false;
        }
        for (var i = 0; i < currentOrder.length; i++) {
            if (currentOrder[i].id !== savedOrder[i]) {
                return true;
            }
        }
        return false;
    }

    function initCurrentOrder(state) {
        var available = [], i, src;
        for (i = 0; i < AUDIO_SOURCES.length; i++) {
            src = AUDIO_SOURCES[i];
            if (isAudioSourceAvailable(src)) {
                available.push(src);
            }
        }
        available.sort(function (a, b) {
            var valA = (state && typeof state['audio_order.' + a.id] === 'number') ? state['audio_order.' + a.id] :
                (state && state.audio_order && typeof state.audio_order[a.id] === 'number' ? state.audio_order[a.id] : AUDIO_SOURCES.indexOf(a));
            var valB = (state && typeof state['audio_order.' + b.id] === 'number') ? state['audio_order.' + b.id] :
                (state && state.audio_order && typeof state.audio_order[b.id] === 'number' ? state.audio_order[b.id] : AUDIO_SOURCES.indexOf(b));
            return valA - valB;
        });
        currentOrder = available;
        savedOrder = [];
        for (i = 0; i < available.length; i++) {
            savedOrder.push(available[i].id);
        }
    }

    var audioOrderPage = {
        id: 'audio_order',
        title: function (tr) { return tr('audio_order_title', 'Entertainment menu order'); },
        entries: function (api) {
            var state = api.state() || {};
            var tr = api.t;
            var isCustom = !!state.audio_order_custom;
            if (!isCustom) {
                activeReorderId = null;
            }
            if (!currentOrder) {
                initCurrentOrder(state);
            }

            var rows = [
                {
                    key: 'audio_order_custom',
                    type: 'bool',
                    label: tr('audio_order_custom', 'Enable custom order'),
                    defaultValue: false
                },
                {
                    key: 'reorder_hint',
                    disabled: true,
                    image1: 'common/images/icons/IcnUmpInfo_Ds.png',
                    label: tr('audio_order_hint', 'Press knob and rotate to change order')
                }
            ];

            function makeSelect(srcId) {
                return function (a) {
                    if (!isCustom) { return; }
                    if (activeReorderId === srcId) {
                        activeReorderId = null;
                    } else {
                        activeReorderId = srcId;
                    }
                    a.render();
                };
            }

            for (var j = 0; j < currentOrder.length; j++) {
                var item = currentOrder[j];
                rows.push({
                    key: 'src_' + item.id,
                    label: getAudioSourceLabel(item),
                    checkable: true,
                    checked: (activeReorderId === item.id),
                    disabled: !isCustom,
                    select: makeSelect(item.id)
                });
            }

            return rows;
        },
        onLeave: function (api) {
            activeReorderId = null;
            var state = api.state() || {};
            var isCustom = !!state.audio_order_custom;
            if (isCustom && hasOrderChanged()) {
                var orderMap = {};
                var assigned = {};
                var nextIdx = 0;
                for (var k = 0; k < currentOrder.length; k++) {
                    orderMap[currentOrder[k].id] = nextIdx++;
                    assigned[currentOrder[k].id] = true;
                }
                for (var j = 0; j < AUDIO_SOURCES.length; j++) {
                    var remainingSrc = AUDIO_SOURCES[j];
                    if (!assigned[remainingSrc.id]) {
                        orderMap[remainingSrc.id] = nextIdx++;
                    }
                }
                var newSavedOrder = [];
                for (var i = 0; i < currentOrder.length; i++) {
                    newSavedOrder.push(currentOrder[i].id);
                }
                pendingOrderSave = newSavedOrder;
                api.save('audio_order', orderMap);
            }
        },
        onInput: function (action, phase, api) {
            var state = api.state() || {};
            var isCustom = !!state.audio_order_custom;
            if (!isCustom) {
                activeReorderId = null;
                return false;
            }
            if (activeReorderId && currentOrder) {
                var idx = -1;
                for (var k = 0; k < currentOrder.length; k++) {
                    if (currentOrder[k].id === activeReorderId) {
                        idx = k;
                        break;
                    }
                }
                if (idx < 0) {
                    activeReorderId = null;
                    return false;
                }
                var isDown = (action === 'rotateRight' || action === 'down');
                var isUp = (action === 'rotateLeft' || action === 'up');
                if (isDown || isUp) {
                    if (phase === 'step' || phase === 'press') {
                        var newIdx = idx;
                        if (isDown) {
                            if (idx < currentOrder.length - 1) {
                                newIdx = idx + 1;
                            }
                        } else if (isUp) {
                            if (idx > 0) {
                                newIdx = idx - 1;
                            }
                        }
                        if (newIdx !== idx) {
                            var moved = currentOrder.splice(idx, 1)[0];
                            currentOrder.splice(newIdx, 0, moved);
                            api.render(2 + newIdx);
                        }
                    }
                    return true;
                }
                if (action === 'back') {
                    if (phase === 'step' || phase === 'release') {
                        activeReorderId = null;
                        api.render();
                    }
                    return true;
                }
                return false;
            }
            return false;
        }
    };

    View.create(sdk, {
        prefix: 'mzd-tweaks',
        statusElement: status,
        types: {
            enumBool: {
                row: function (def, api) {
                    var state = api.state() || {};
                    var val = (state[def.key] != null) ? state[def.key] : def.defaultValue;
                    return {
                        itemStyle: 'styleOnOff',
                        checked: val === def.trueValue
                    };
                },
                activate: function (def, row, params, api) {
                    var next = row.checked ? def.falseValue : def.trueValue;
                    api.save(def.key, next);
                }
            }
        },
        title: function (tr) { return tr('title', 'MZD Tweaks'); },
        onState: function (state, data, api) {
            if (state && !state.audio_order_custom) {
                activeReorderId = null;
            }
            if (pendingOrderSave && data) {
                var isPending = data.pending && data.pending.indexOf('audio_order') >= 0;
                if (!data.saving && !isPending) {
                    if (!data.error) {
                        savedOrder = pendingOrderSave;
                        if (sdk && typeof sdk.notify === 'function') {
                            sdk.notify(api.t('settings_saved', 'Settings saved'), false);
                        }
                    }
                    pendingOrderSave = null;
                }
            } else if (data && data.state && data.state.audio_order && currentOrder && !activeReorderId) {
                savedOrder = [];
                for (var i = 0; i < currentOrder.length; i++) {
                    savedOrder.push(currentOrder[i].id);
                }
            }
        },
        entries: function (state, tr) {
            state = state || {};
            var customLabel = state.audio_order_custom ?
                tr('custom', 'Custom') :
                tr('default', 'Default');
            return [
                { key: 'main_menu_loop', type: 'bool', label: tr('main_menu_loop', 'Main menu loop') },
                {
                    key: 'main_menu_coins_layout',
                    type: 'enumBool',
                    trueValue: 'flat',
                    falseValue: 'ellipse',
                    defaultValue: 'ellipse',
                    label: tr('main_menu_flat_layout', 'Main menu flat layout')
                },
                {
                    key: 'main_menu_coins_size_menu',
                    label: tr('main_menu_coins_size', 'Main menu icons size'),
                    detail: getCoinsSizeShortLabel(state.main_menu_coins_size != null ? state.main_menu_coins_size : 100, tr),
                    caret: true,
                    select: function (api) {
                        var current = (api.state() && api.state().main_menu_coins_size != null) ? api.state().main_menu_coins_size : 100;
                        api.openPage({
                            id: 'coins_size',
                            title: api.t('main_menu_coins_size', 'Main menu icons size'),
                            index: coinsSizeIndex(current),
                            entries: function (pageApi) {
                                var pageState = pageApi.state() || {};
                                var pageCurrent = pageState.main_menu_coins_size != null ? pageState.main_menu_coins_size : 100;
                                var pageTr = pageApi.t;
                                var list = [];
                                for (var i = 0; i < COINS_SIZES.length; i++) {
                                    list.push(coinsSizeOption(COINS_SIZES[i], pageCurrent, pageTr));
                                }
                                return list;
                            }
                        });
                    }
                },
                { key: 'main_menu_coins_glow', type: 'bool', label: tr('main_menu_coins_glow', 'Main menu icons glow'), defaultValue: true },
                { key: 'list_loop', type: 'bool', label: tr('list_loop', 'List menu loop') },
                { key: 'list_beep', type: 'bool', label: tr('list_beep', 'List menu beep'), defaultValue: true },
                { key: 'short_delay', type: 'bool', label: tr('short_delay', 'List menu shorter delay') },
                { key: 'statusbar_date', type: 'bool', label: tr('statusbar_date', 'Date in status bar') },
                {
                    key: 'theme_menu',
                    label: tr('theme', 'Theme'),
                    detail: getThemeShortLabel(state.theme || 'red', tr),
                    caret: true,
                    select: function (api) {
                        var current = (api.state() || {}).theme || 'red';
                        api.openPage({
                            id: 'theme',
                            title: api.t('theme', 'Theme'),
                            index: themeIndex(current),
                            entries: function (pageApi) {
                                var pageState = pageApi.state() || {};
                                var pageCurrent = pageState.theme || 'red';
                                var pageTr = pageApi.t;
                                var list = [];
                                for (var i = 0; i < THEMES.length; i++) {
                                    list.push(themeOption(THEMES[i], pageCurrent, pageTr));
                                }
                                return list;
                            }
                        });
                    }
                },
                {
                    key: 'audio_order_menu',
                    label: tr('audio_order_title', 'Entertainment menu order'),
                    detail: customLabel,
                    caret: true,
                    select: function (api) {
                        currentOrder = null;
                        savedOrder = null;
                        activeReorderId = null;
                        api.openPage(audioOrderPage);
                    }
                }
            ];
        }
    });
}());
