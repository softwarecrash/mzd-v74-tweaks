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

    var MAIN_MENU_ITEMS = [
        { id: 'main_menu_app', text1Id: 'Applications', defaultLabel: 'Applications' },
        { id: 'main_menu_ent', text1Id: 'Entertainment', defaultLabel: 'Entertainment' },
        { id: 'main_menu_com', text1Id: 'Communication', defaultLabel: 'Communication' },
        { id: 'main_menu_nav', text1Id: 'NavigationTitle', defaultLabel: 'Navigation' },
        { id: 'main_menu_set', text1Id: 'Settings', defaultLabel: 'Settings' }
    ];

    function getJciSystemLabel(item) {
        try {
            var fw = (window.parent && window.parent.framework) || window.framework;
            if (fw && fw.localize && typeof fw.localize.getLocStr === 'function') {
                var localized = fw.localize.getLocStr('system', item.text1Id);
                if (localized && typeof localized === 'string' && localized !== item.text1Id) {
                    return localized;
                }
            }
        } catch (ignore) {}
        return item.defaultLabel;
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

    function createOrderPage(opts) {
        var currentOrder = null;
        var savedOrder = null;
        var pendingOrderSave = null;
        var activeReorderId = null;
        var allItems = opts.allItems;

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
            var available = [], i, item;
            for (i = 0; i < allItems.length; i++) {
                item = allItems[i];
                if (!opts.isAvailable || opts.isAvailable(item)) {
                    available.push(item);
                }
            }
            available.sort(function (a, b) {
                var orderMap = state && state[opts.orderKey];
                var valA = (state && typeof state[opts.orderKey + '.' + a.id] === 'number') ? state[opts.orderKey + '.' + a.id] :
                    (orderMap && typeof orderMap[a.id] === 'number' ? orderMap[a.id] : allItems.indexOf(a));
                var valB = (state && typeof state[opts.orderKey + '.' + b.id] === 'number') ? state[opts.orderKey + '.' + b.id] :
                    (orderMap && typeof orderMap[b.id] === 'number' ? orderMap[b.id] : allItems.indexOf(b));
                return valA - valB;
            });
            currentOrder = available;
            savedOrder = [];
            for (i = 0; i < available.length; i++) {
                savedOrder.push(available[i].id);
            }
        }

        var page = {
            id: opts.pageId,
            title: function (tr) { return tr(opts.titleKey, opts.defaultTitle); },
            entries: function (api) {
                var state = api.state() || {};
                var tr = api.t;
                var isCustom = !!state[opts.customKey];
                if (!isCustom) {
                    activeReorderId = null;
                }
                if (!currentOrder) {
                    initCurrentOrder(state);
                }

                var rows = [
                    {
                        key: opts.customKey,
                        type: 'bool',
                        label: tr('enable_cusom_order', 'Enable custom order'),
                        defaultValue: false
                    },
                    {
                        key: opts.hintKey || 'reorder_hint',
                        disabled: true,
                        image1: 'common/images/icons/IcnUmpInfo_Ds.png',
                        label: tr('custom_order_hint', 'Press knob and rotate to change order')
                    }
                ];

                function makeSelect(itemId) {
                    return function (a) {
                        if (!isCustom) { return; }
                        if (activeReorderId === itemId) {
                            activeReorderId = null;
                        } else {
                            activeReorderId = itemId;
                        }
                        a.render();
                    };
                }

                for (var j = 0; j < currentOrder.length; j++) {
                    var item = currentOrder[j];
                    rows.push({
                        key: (opts.rowPrefix || 'src_') + item.id,
                        label: getJciSystemLabel(item),
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
                var isCustom = !!state[opts.customKey];
                if (isCustom && hasOrderChanged()) {
                    var orderMap = {};
                    var assigned = {};
                    var nextIdx = 0;
                    for (var k = 0; k < currentOrder.length; k++) {
                        orderMap[currentOrder[k].id] = nextIdx++;
                        assigned[currentOrder[k].id] = true;
                    }
                    for (var j = 0; j < allItems.length; j++) {
                        var remaining = allItems[j];
                        if (!assigned[remaining.id]) {
                            orderMap[remaining.id] = nextIdx++;
                        }
                    }
                    var newSavedOrder = [];
                    for (var i = 0; i < currentOrder.length; i++) {
                        newSavedOrder.push(currentOrder[i].id);
                    }
                    pendingOrderSave = newSavedOrder;
                    api.save(opts.orderKey, orderMap);
                }
            },
            onInput: function (action, phase, api) {
                var state = api.state() || {};
                var isCustom = !!state[opts.customKey];
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

        return {
            page: page,
            reset: function () {
                currentOrder = null;
                savedOrder = null;
                activeReorderId = null;
            },
            onState: function (state, data, api) {
                if (state && !state[opts.customKey]) {
                    activeReorderId = null;
                }
                if (pendingOrderSave && data) {
                    var isPending = data.pending && data.pending.indexOf(opts.orderKey) >= 0;
                    if (!data.saving && !isPending) {
                        if (!data.error) {
                            savedOrder = pendingOrderSave;
                            if (sdk && typeof sdk.notify === 'function') {
                                sdk.notify(api.t('settings_saved', 'Settings saved'), false);
                            }
                        }
                        pendingOrderSave = null;
                    }
                } else if (data && data.state && data.state[opts.orderKey] && currentOrder && !activeReorderId) {
                    savedOrder = [];
                    for (var i = 0; i < currentOrder.length; i++) {
                        savedOrder.push(currentOrder[i].id);
                    }
                }
            }
        };
    }

    var audioOrderCtrl = createOrderPage({
        pageId: 'audio_order',
        titleKey: 'audio_order_title',
        defaultTitle: 'Entertainment menu order',
        customKey: 'audio_order_custom',
        orderKey: 'audio_order',
        hintKey: 'reorder_hint',
        rowPrefix: 'src_',
        allItems: AUDIO_SOURCES,
        isAvailable: isAudioSourceAvailable
    });

    var mainMenuOrderCtrl = createOrderPage({
        pageId: 'main_menu_order',
        titleKey: 'main_menu_order_title',
        defaultTitle: 'Main Menu icons order',
        customKey: 'main_menu_order_custom',
        orderKey: 'main_menu_order',
        hintKey: 'main_menu_reorder_hint',
        rowPrefix: 'mm_',
        allItems: MAIN_MENU_ITEMS
    });

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
            audioOrderCtrl.onState(state, data, api);
            mainMenuOrderCtrl.onState(state, data, api);
        },
        entries: function (state, tr) {
            state = state || {};
            var customLabel = state.audio_order_custom ?
                tr('custom', 'Custom') :
                tr('default', 'Default');
            var mainMenuCustomLabel = state.main_menu_order_custom ?
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
                { key: 'main_menu_coins_glow', type: 'bool', label: tr('main_menu_coins_glow', 'Main menu icons glow'), defaultValue: true },
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
                {
                    key: 'main_menu_order_menu',
                    label: tr('main_menu_order_title', 'Main Menu icons order'),
                    detail: mainMenuCustomLabel,
                    caret: true,
                    select: function (api) {
                        mainMenuOrderCtrl.reset();
                        api.openPage(mainMenuOrderCtrl.page);
                    }
                },
                { key: 'list_loop', type: 'bool', label: tr('list_loop', 'List menu loop') },
                { key: 'list_beep', type: 'bool', label: tr('list_beep', 'List menu beep'), defaultValue: true },
                { key: 'short_delay', type: 'bool', label: tr('short_delay', 'List menu shorter delay') },
                { key: 'statusbar_date', type: 'bool', label: tr('statusbar_date', 'Date in status bar') },
                { key: 'bluetooth_notification', type: 'bool', label: tr('bluetooth_notification', 'Bluetooth connection notification'), defaultValue: true },
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
                        audioOrderCtrl.reset();
                        api.openPage(audioOrderCtrl.page);
                    }
                }
            ];
        }
    });
}());
