(function () {
    'use strict';
    var sdk = window.MzdGuiModule, status = document.getElementById('status');
    if (!sdk) {
        if (status) { status.textContent = 'Open through Applications.'; }
        return;
    }
    var token = sdk.token, tr = sdk.t;
    var ended = false, state = null, limits = {}, unavailable = {}, rebootRequired = false, saving = false, savingDpi = false, rebootDialogOpen = false;
    var page = 'home', index = 0, positions = {home: 0, distance: 0}, notice = '';
    var committedDpi = null, pendingDpi = null, inDpiSecondary = false;

    var SETTINGS = [
        { key: 'touch', type: 'bool' },
        { key: 'hud', type: 'bool' },
        { key: 'hud_transport', type: 'transport' },
        { key: 'force_street_name', type: 'bool' },
        { key: 'hud_fold_latin', type: 'bool' },
        { key: 'use_protocol_v1_6', type: 'bool' },
        { key: 'roundabout_prepend_exit_number', type: 'bool' },
        { key: 'hud_maneuver_max_distance_m', type: 'distance' },
        { key: 'compass_always_on', type: 'bool' },
        { key: 'bt_pairing_bypass_all_devices', type: 'bool' },
        { key: 'bt_pairing_show_device_notification', type: 'bool' },
        { key: 'mute_pauses_phone', type: 'bool' },
        { key: 'unmute_starts_playback', type: 'bool' },
        { key: 'block_headunit_media_play', type: 'bool' },
        { key: 'aa_audio_low_latency', type: 'bool' }
    ];

    var DISTANCES = [0, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 20000];

    function formatDistance(meters) {
        var m = Number(meters) || 0;
        if (!m) {
            return tr('always', 'Always');
        }
        if (m >= 1000) {
            return (m / 1000) + ' km';
        }
        return m + ' m';
    }

    function post(data) {
        data.token = token;
        window.parent.postMessage(data, '*');
    }

    // The resident shows save and reboot notifications, including after this
    // view closes, so it keeps its own copy of the localized texts.
    function sendNoticeTexts() {
        post({
            type: 'aa-request',
            action: 'texts',
            payload: {
                saveError: tr('saveError', 'Failed to save settings'),
                reboot: tr('reboot', 'Reboot to apply changes'),
                rebootFallback: tr('rebootFallback', 'Hold NAV + MUTE to reboot')
            }
        });
    }

    function saveSetting(key, value) {
        state[key] = value;
        saving = true;
        render();
        post({type: 'aa-request', action: 'set', payload: {key: key, value: value}});
    }

    function commitDpi(val) {
        pendingDpi = null;
        committedDpi = val;
        savingDpi = true;
        render();
        post({
            type: 'aa-request',
            action: 'set',
            payload: { key: 'resolution_dpi', value: val }
        });
    }

    function flushDpi() {
        if (pendingDpi != null) {
            commitDpi(pendingDpi);
        }
    }

    function openRebootDialog() {
        flushDpi();
        rebootDialogOpen = true;
        post({
            type: 'aa-native-dialog',
            dialog: {
                text: tr('rebootQuestion', 'Do you want to reboot MZD to apply Android Auto settings?'),
                buttons: [
                    { value: 'no', labelId: 'common.No' },
                    { value: 'yes', labelId: 'common.Yes' }
                ]
            }
        });
    }

    function closeRebootDialog() {
        rebootDialogOpen = false;
        post({ type: 'aa-native-dialog', dialog: null });
        render();
    }

    function entries() {
        var result = [], i, def, meters, currentDist;
        if (page === 'distance') {
            currentDist = (state && typeof state.hud_maneuver_max_distance_m === 'number') ? state.hud_maneuver_max_distance_m : 0;
            for (i = 0; i < DISTANCES.length; i += 1) {
                meters = DISTANCES[i];
                result.push({
                    id: 'dist-' + meters,
                    meters: meters,
                    label: formatDistance(meters),
                    checkable: true,
                    checked: currentDist === meters
                });
            }
            return result;
        }

        var dpiLimits = (limits && limits.resolution_dpi) || (state && state.limits && state.limits.resolution_dpi) || { min: 100, max: 160, step: 1 };
        var dpiUnavailable = (unavailable && unavailable.resolution_dpi) || (state && state.unavailable && state.unavailable.resolution_dpi);
        var currentDpi = (state && typeof state.resolution_dpi === 'number') ? state.resolution_dpi : 141;
        var dpiDisabled = saving || savingDpi || (state && state.resolution_dpi_disabled === true) || !!dpiUnavailable;
        result.push({
            id: 'resolution_dpi',
            key: 'resolution_dpi',
            type: 'step',
            label: tr('resolution_dpi', 'Resolution DPI'),
            itemStyle: 'styleStep',
            value: currentDpi,
            min: dpiLimits.min,
            max: dpiLimits.max,
            increment: dpiLimits.step,
            disabled: dpiDisabled,
            spinner: savingDpi === true
        });

        for (i = 0; i < SETTINGS.length; i += 1) {
            def = SETTINGS[i];
            if (def.type === 'bool') {
                result.push({
                    id: def.key,
                    key: def.key,
                    type: 'bool',
                    label: tr(def.key, def.key),
                    itemStyle: 'styleOnOff',
                    checked: !!(state && state[def.key])
                });
            } else if (def.type === 'transport') {
                result.push({
                    id: def.key,
                    key: def.key,
                    type: 'transport',
                    label: tr(def.key, def.key),
                    itemStyle: 'styleOnOff',
                    checked: !!(state && state[def.key] === 'svcnavi')
                });
            } else if (def.type === 'distance') {
                result.push({
                    id: def.key,
                    key: def.key,
                    type: 'distance',
                    label: tr(def.key, def.key),
                    detail: formatDistance(state ? state[def.key] : 0),
                    caret: true
                });
            }
        }
        // Rebooting is offered only when saved settings differ from the ones MZD
        // booted with, and never while a save could still be lost.
        result.push({
            id: 'reboot',
            action: 'reboot',
            label: tr('reboot', 'Reboot to apply changes'),
            image1: 'common/images/icons/IcnListSynchronize_En.png',
            disabled: saving || savingDpi || !rebootRequired
        });
        return result;
    }

    function open(next) {
        positions[page] = index;
        page = next;
        if (page === 'distance') {
            var currentDist = (state && typeof state.hud_maneuver_max_distance_m === 'number') ? state.hud_maneuver_max_distance_m : 0;
            var dIdx = DISTANCES.indexOf(currentDist);
            index = dIdx >= 0 ? dIdx : 0;
        } else {
            index = positions[page] || 0;
        }
        positions[page] = index;
        render();
    }

    function back() {
        flushDpi();
        notice = '';
        if (!state || page === 'home') { return false; }
        page = 'home';
        index = positions.home || 0;
        render();
        return true;
    }

    function activate(position, params) {
        if (ended || !state || rebootDialogOpen) { return; }
        notice = '';
        index = position;
        var row = entries()[index];
        if (!row || row.disabled) { return; }
        positions[page] = index;

        if (row.type !== 'step') {
            flushDpi();
        }

        if (row.action === 'reboot') {
            openRebootDialog();
            return;
        }

        if (page === 'distance') {
            page = 'home';
            index = positions.home || 0;
            if (state.hud_maneuver_max_distance_m !== row.meters) {
                saveSetting('hud_maneuver_max_distance_m', row.meters);
            } else {
                render();
            }
            return;
        }

        if (row.type !== 'step') {
            flushDpi();
        }

        if (row.type === 'step') {
            inDpiSecondary = true;
            var val = (params && typeof params.value === 'number') ? params.value : (typeof params === 'number' ? params : null);
            if (val == null || val < row.min || val > row.max) { return; }
            state[row.key] = val;
            var isFinal = params && (params.final === true || params.finalAdjust === true || params.finalAdjustment === true);
            if (val !== committedDpi) {
                pendingDpi = val;
            } else {
                pendingDpi = null;
            }
            if (isFinal) {
                flushDpi();
            }
            return;
        }

        if (row.type === 'bool') {
            saveSetting(row.key, !state[row.key]);
        } else if (row.type === 'transport') {
            saveSetting(row.key, state[row.key] === 'svcnavi' ? 'vbs' : 'svcnavi');
        } else if (row.type === 'distance') {
            open('distance');
        }
    }

    function render() {
        // The OEM dialog covers the list; it is redrawn once the dialog closes.
        if (ended || !state || rebootDialogOpen) { return; }
        var list = entries(), heading;
        if (index >= list.length) { index = 0; }
        heading = (page === 'distance') ?
            tr('hud_maneuver_max_distance_m', 'Show HUD turns within') :
            tr('title', 'Android Auto Settings');
        post({
            type: 'aa-native-render',
            menu: {
                page: page,
                title: notice || heading,
                rows: list,
                index: index
            }
        });
    }

    function receive(event) {
        var data = event.data, confirmed;
        if (event.source !== window.parent || !data || data.token !== token || ended) { return; }
        if (data.type === 'aa-native-select') {
            activate(data.index, data.params);
            return;
        }
        if (data.type === 'aa-native-focus') {
            if (typeof data.index === 'number' && data.index >= 0) {
                var prevIndex = index;
                index = data.index;
                positions[page] = index;
                var wasSecondary = inDpiSecondary;
                inDpiSecondary = (index === 0 && data.secondary === true);
                if (page === 'home') {
                    if ((prevIndex === 0 && index !== 0) || (wasSecondary && !inDpiSecondary)) {
                        flushDpi();
                    }
                }
            }
            return;
        }
        if (data.type === 'aa-native-dialog-select') {
            if (!rebootDialogOpen) { return; }
            confirmed = data.value === 'yes';
            closeRebootDialog();
            if (confirmed) {
                post({type: 'aa-request', action: 'reboot'});
            }
            return;
        }
        if (data.type === 'aa-native-error') {
            if (data.scope === 'dialog') {
                // The resident already removed the dialog and restored list focus.
                rebootDialogOpen = false;
                notice = tr('rebootFallback', 'Hold NAV + MUTE to reboot');
                render();
            } else if (status) {
                status.textContent = tr('menuError', 'The Mazda menu could not be opened. Please reopen the app.');
            }
            return;
        }
        if (data.type === 'aa-response') {
            saving = data.saving === true;
            if (!saving) {
                savingDpi = false;
            }
            if (data.state) {
                state = data.state;
                if (typeof state.resolution_dpi === 'number' && !savingDpi && pendingDpi == null) {
                    committedDpi = state.resolution_dpi;
                }
                if (data.limits) { limits = data.limits; }
                if (data.unavailable) { unavailable = data.unavailable; }
                rebootRequired = data.rebootRequired === true || data.restart_required === true;
            }
            if (data.error) {
                savingDpi = false;
                pendingDpi = null;
                if (status && !state) {
                    status.textContent = tr('serviceUnavailable', 'Service unavailable. Please retry.');
                }
            } else if (status && !notice) {
                status.textContent = '';
            }
            render();
        }
    }

    function input(action, phase) {
        if (ended) { return false; }
        if (action === 'back') {
            if (phase === 'press') { return true; }
            if (rebootDialogOpen) {
                closeRebootDialog();
                return true;
            }
            return back();
        }
        if (state) {
            post({type: 'aa-native-input', action: action, phase: phase});
        }
        return true;
    }

    function dispose() {
        if (ended) { return; }
        flushDpi();
        post({type: 'aa-native-release'});
        ended = true;
        window.removeEventListener('message', receive, false);
    }

    window.addEventListener('message', receive, false);
    sdk.onInput(input);
    sdk.onDispose(dispose);
    sdk.ready();

    if (sdk.loadLanguage) {
        sdk.loadLanguage(function (language, direction) {
            document.documentElement.lang = language.replace('_', '-');
            if (status) { status.dir = direction; }
            sendNoticeTexts();
            if (state) {
                render();
            } else if (status) {
                status.textContent = tr('loading', 'Loading settings...');
            }
        });
    }

    post({type: 'aa-request', action: 'get'});
}());
