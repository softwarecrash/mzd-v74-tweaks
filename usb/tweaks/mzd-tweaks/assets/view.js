(function () {
    'use strict';

    var sdk = window.MzdGuiModule, status = document.getElementById('status');
    if (!sdk) {
        if (status) { status.textContent = 'Open through Applications.'; }
        return;
    }

    var token = sdk.token, tr = sdk.t;
    var ended = false, state = null, saving = false;
    var index = 0;

    var SETTINGS = [
        { key: 'main_menu_loop', type: 'bool' },
        { key: 'list_loop', type: 'bool' },
        { key: 'list_beep', type: 'bool' },
        { key: 'short_delay', type: 'bool' }
    ];

    function post(data) {
        data.token = token;
        window.parent.postMessage(data, '*');
    }

    function saveSetting(key, value) {
        state[key] = value;
        saving = true;
        render();
        post({ type: 'mzd-tweaks-request', action: 'set', payload: { key: key, value: value } });
    }

    function entries() {
        var result = [], i, def, isChecked;
        for (i = 0; i < SETTINGS.length; i += 1) {
            def = SETTINGS[i];
            if (def.key === 'list_beep') {
                isChecked = !(state && state.list_beep === false);
            } else {
                isChecked = !!(state && state[def.key]);
            }
            result.push({
                id: def.key,
                key: def.key,
                type: 'bool',
                label: tr(def.key, def.key),
                itemStyle: 'styleOnOff',
                checked: isChecked
            });
        }
        return result;
    }

    function render() {
        if (ended || !state) { return; }
        var list = entries();
        if (index >= list.length) { index = 0; }
        post({
            type: 'mzd-tweaks-native-render',
            menu: {
                page: 'home',
                title: tr('title', 'MZD Tweaks'),
                rows: list,
                index: index
            }
        });
    }

    function back() {
        if (!state) { return false; }
        return false;
    }

    function activate(position) {
        if (ended || !state) { return; }
        index = position;
        var row = entries()[index];
        if (!row || row.disabled) { return; }

        if (row.key === 'list_beep') {
            saveSetting(row.key, (state && state.list_beep === false) ? true : false);
        } else {
            saveSetting(row.key, !state[row.key]);
        }
    }

    function receive(event) {
        var data = event.data;
        if (event.source !== window.parent || !data || data.token !== token || ended) { return; }

        if (data.type === 'mzd-tweaks-native-select') {
            activate(data.index);
            return;
        }

        if (data.type === 'mzd-tweaks-native-focus') {
            if (typeof data.index === 'number' && data.index >= 0) {
                index = data.index;
            }
            return;
        }

        if (data.type === 'mzd-tweaks-response') {
            saving = data.saving === true;
            if (data.state) {
                state = data.state;
                if (status) { status.style.display = 'none'; }
                render();
            }
            if (data.error && status) {
                status.style.display = 'block';
                status.textContent = data.error;
            }
            return;
        }
    }

    function input(action, phase) {
        if (ended) { return false; }
        if (action === 'back') {
            if (phase === 'press') { return true; }
            return back();
        }
        if (state) {
            post({ type: 'mzd-tweaks-native-input', action: action, phase: phase });
        }
        return true;
    }

    function dispose() {
        if (ended) { return; }
        post({ type: 'mzd-tweaks-native-release' });
        ended = true;
        window.removeEventListener('message', receive, false);
    }

    window.addEventListener('message', receive, false);
    sdk.onInput(input);
    sdk.onDispose(dispose);
    sdk.ready();

    if (sdk.loadLanguage) {
        sdk.loadLanguage(function () {
            if (state) {
                render();
            }
        });
    }

    post({ type: 'mzd-tweaks-request', action: 'get' });
}());
