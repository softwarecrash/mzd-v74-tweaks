(function () {
    'use strict';
    var sdk = window.MzdGuiModule, status = document.getElementById('status');
    var ended = false, state = null, page = 'home', index = 0, positions = {home: 0, distance: 0}, notice = '';
    var match = /(?:^|[&#])mzdgui=([a-zA-Z0-9-]+)(?:&|$)/.exec(window.location.hash);
    var token = match ? match[1] : '';

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

    function tr(key, fallback, values) {
        if (sdk && sdk.t) { return sdk.t(key, fallback, values); }
        return fallback.replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
            return values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
        });
    }

    function formatDistance(meters) {
        var m = Number(meters) || 0;
        if (!m || m === 0) {
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
        notice = '';
        if (!state || page === 'home') { return false; }
        page = 'home';
        index = positions.home || 0;
        render();
        return true;
    }

    function activate(position) {
        if (ended || !state) { return; }
        notice = '';
        index = position;
        var list = entries();
        var row = list[index];
        if (!row || row.disabled) { return; }
        positions[page] = index;

        if (page === 'distance') {
            var selectedMeters = row.meters;
            if (state.hud_maneuver_max_distance_m !== selectedMeters) {
                state.hud_maneuver_max_distance_m = selectedMeters;
                render();
                post({type: 'aa-request', action: 'set', payload: { key: 'hud_maneuver_max_distance_m', value: selectedMeters }});
            }
            return;
        }

        if (row.type === 'bool') {
            var newBool = !state[row.key];
            state[row.key] = newBool;
            render();
            post({type: 'aa-request', action: 'set', payload: { key: row.key, value: newBool }});
            return;
        }

        if (row.type === 'transport') {
            var newTransport = (state[row.key] === 'svcnavi') ? 'vbs' : 'svcnavi';
            state[row.key] = newTransport;
            render();
            post({type: 'aa-request', action: 'set', payload: { key: row.key, value: newTransport }});
            return;
        }

        if (row.type === 'distance') {
            open('distance');
        }
    }

    function render() {
        if (ended || !state) { return; }
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
        var data = event.data;
        if (event.source !== window.parent || !data || data.token !== token || ended) { return; }
        if (data.type === 'aa-native-select') {
            activate(data.index);
            return;
        }
        if (data.type === 'aa-native-focus') {
            if (typeof data.index === 'number' && data.index >= 0) {
                index = data.index;
                positions[page] = index;
            }
            return;
        }
        if (data.type === 'aa-native-error') {
            if (status) {
                status.textContent = tr('menuError', 'The Mazda menu could not be opened. Please reopen the app.');
            }
            return;
        }
        if (data.type === 'aa-response') {
            if (data.error) {
                notice = state ? tr('error', 'Failed to save') : tr('serviceUnavailable', 'Service unavailable. Please retry.');
                if (status) { status.textContent = notice; }
                render();
            } else if (data.state) {
                state = data.state;
                if (status && !notice) { status.textContent = ''; }
                render();
            }
        }
    }

    function input(action, phase) {
        if (ended) { return false; }
        if (action === 'back') {
            if (phase === 'press') { return true; }
            return back();
        }
        if (state) {
            post({type: 'aa-native-input', action: action, phase: phase});
        }
        return true;
    }

    function dispose() {
        if (ended) { return; }
        post({
            type: 'aa-native-release',
            savingMessage: tr('savingSettings', 'Saving Android Auto settings...'),
            savedMessage: tr('savedSettings', 'Android Auto settings saved.'),
            errorMessage: tr('saveError', tr('error', 'Failed to save Android Auto settings'))
        });
        ended = true;
        window.removeEventListener('message', receive, false);
    }

    if (!sdk) {
        if (status) { status.textContent = tr('openApps', 'Open through Applications.'); }
        return;
    }

    window.addEventListener('message', receive, false);
    sdk.onInput(input);
    sdk.onDispose(dispose);
    sdk.ready();

    if (sdk.loadLanguage) {
        sdk.loadLanguage(function (language, direction) {
            document.documentElement.lang = language.replace('_', '-');
            if (status) { status.dir = direction; }
            if (state) {
                render();
            } else if (status) {
                status.textContent = tr('loading', 'Loading settings...');
            }
        });
    }

    post({type: 'aa-request', action: 'get'});
}());
