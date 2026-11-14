/*
 * Shared settings view (GUI API level 2). Strictly ES5.
 *
 * MzdSettingsView runs in a view: declarative rows rendered as an OEM List2
 * menu, sub-pages, confirmation dialogs and per-row saving feedback. Only
 * common patterns live here; tweak-specific row behaviour is added by the
 * tweak through MzdSettingsView.create(sdk, {types: {...}}). A view loads this
 * file itself (view.html): it runs in its own iframe, a separate window from
 * the one where the hook and the residents run. The matching resident half is
 * settings-host.js.
 */
(function (global) {
    'use strict';

    var has = Object.prototype.hasOwnProperty;
    var REBOOT_ICON = 'common/images/icons/IcnListSynchronize_En.png';
    var DEFAULT_TEXTS = {
        saveError: 'Failed to save settings',
        reboot: 'Reboot to apply changes',
        rebootFallback: 'Hold NAV + MUTE to reboot'
    };

    function copy(target, source) {
        var key;
        if (source) {
            for (key in source) {
                if (has.call(source, key)) { target[key] = source[key]; }
            }
        }
        return target;
    }

    // --- View side -------------------------------------------------------

    function isFinalAdjustment(params) {
        return !!params && (params.final === true || params.finalAdjust === true || params.finalAdjustment === true);
    }

    // Value chosen on an OEM styleStep row, or null when missing or out of range.
    function stepValue(row, params) {
        var value = (params && typeof params.value === 'number') ? params.value : (typeof params === 'number' ? params : null);
        if (value == null || value < row.min || value > row.max) { return null; }
        return value;
    }

    function stateValue(def, api) {
        var state = api.state();
        return (state && state[def.key] != null) ? state[def.key] : def.defaultValue;
    }

    var TYPES = {
        // On/Off row. defaultValue applies while the setting is absent.
        bool: {
            row: function (def, api) {
                return { itemStyle: 'styleOnOff', checked: !!stateValue(def, api) };
            },
            activate: function (def, row, params, api) {
                api.save(def.key, !row.checked);
            }
        },
        // OEM stepper. Limits come from the service (limits[key]) or the row.
        // Every value is saved; the resident coalesces rapid changes.
        step: {
            row: function (def, api) {
                var limit = api.limits()[def.key] || {};
                var min = typeof limit.min === 'number' ? limit.min : (typeof def.min === 'number' ? def.min : 0);
                var max = typeof limit.max === 'number' ? limit.max : (typeof def.max === 'number' ? def.max : 100);
                var increment = limit.step || limit.increment || def.increment || 1;
                var value = stateValue(def, api);
                return {
                    itemStyle: 'styleStep',
                    value: typeof value === 'number' ? value : min,
                    min: min,
                    max: max,
                    increment: increment
                };
            },
            activate: function (def, row, params, api) {
                var value = stepValue(row, params);
                if (value !== null && value !== stateValue(def, api)) { api.save(def.key, value); }
            }
        },
        // Button row sending <prefix>-request {action}. confirm: {text, buttons}
        // asks first; the default buttons are No (focused) and Yes.
        action: {
            row: function () { return {}; },
            activate: function (def, row, params, api) {
                if (def.confirm) {
                    api.confirm(def.confirm, function () { api.request(def.action); });
                } else {
                    api.request(def.action);
                }
            }
        },
        // Reboot to apply saved settings. Enabled only when the service reports
        // rebootRequired and no save is running; always confirmed, default No.
        reboot: {
            row: function (def, api) {
                return { image1: REBOOT_ICON, disabled: api.saving() || !api.rebootRequired() };
            },
            activate: function (def, row, params, api) {
                api.confirm({
                    text: def.question || api.t('rebootQuestion', 'Do you want to reboot MZD to apply settings?'),
                    fallback: def.fallback || api.t('rebootFallback', DEFAULT_TEXTS.rebootFallback)
                }, function () { api.request('reboot'); });
            }
        }
    };

    function createView(sdk, options) {
        options = options || {};
        var prefix = options.prefix || 'mzd';
        var token = sdk.token;
        var tr = sdk.t;
        var status = options.statusElement || document.getElementById('status');
        var types = copy(copy({}, TYPES), options.types);
        var rowDefaults = options.rowDefaults || {};
        var ended = false, state = null, limits = {}, unavailable = {}, rebootRequired = false, saving = false;
        var pending = {}, notice = '', dialog = null;
        var home = { id: 'home' }, pages = [home], index = 0, positions = { home: 0 };
        var api;

        function post(data) {
            if (ended) { return; }
            data.token = token;
            try { window.parent.postMessage(data, '*'); } catch (ignore) {}
        }

        function request(action, payload) {
            var data = { type: prefix + '-request', action: action };
            if (payload !== undefined) { data.payload = payload; }
            post(data);
        }

        // The resident shows save and reboot notifications, including after
        // this view closes, so it keeps its own copy of the localized texts.
        function sendTexts() {
            var payload = {}, all = copy(copy({}, DEFAULT_TEXTS), options.texts), key;
            for (key in all) {
                if (has.call(all, key)) { payload[key] = tr(key, all[key]); }
            }
            request('texts', payload);
        }

        function page() {
            return pages[pages.length - 1];
        }

        function definitions(target) {
            target = target || page();
            if (target === home) {
                return typeof options.entries === 'function' ? (options.entries(state, tr, api) || []) : (options.entries || []);
            }
            return typeof target.entries === 'function' ? (target.entries(api) || []) : (target.entries || []);
        }

        function typeOf(def) {
            return (def && has.call(types, def.type)) ? types[def.type] : (def && def.action ? types.action : null);
        }

        function flag(def, name) {
            if (typeof def[name] === 'boolean') { return def[name]; }
            return rowDefaults[name] === true;
        }

        // Shared row properties apply to every type, including custom ones:
        // disabled (bool or function(state, api)), image1, savingSpinner,
        // savingDisabled (own save pending) and busyDisabled (any save running).
        function buildRow(def) {
            var type = typeOf(def), row = {}, own;
            copy(row, type && typeof type.row === 'function' ? type.row(def, api) : null);
            row.id = def.id || def.key || def.action || def.type || '';
            if (def.key != null) { row.key = def.key; }
            if (def.type) { row.type = def.type; }
            if (def.action) { row.action = def.action; }
            if (row.label == null) { row.label = def.label != null ? def.label : tr(row.id, row.id); }
            if (def.image1) { row.image1 = def.image1; }
            if (def.detail != null && row.detail == null) { row.detail = def.detail; }
            if (def.checkable) { row.checkable = true; row.checked = def.checked === true; }
            if (def.radio) { row.radio = true; }
            if (def.caret) { row.caret = true; }
            own = def.key != null && pending[def.key] === true;
            row.spinner = row.spinner === true || (own && flag(def, 'savingSpinner'));
            row.disabled = row.disabled === true ||
                (typeof def.disabled === 'function' ? !!def.disabled(state, api) : def.disabled === true) ||
                (def.key != null && !!unavailable[def.key]) ||
                (own && flag(def, 'savingDisabled')) ||
                (saving && flag(def, 'busyDisabled'));
            return row;
        }

        function rows(defs) {
            var list = [], i;
            for (i = 0; i < defs.length; i += 1) { list.push(buildRow(defs[i])); }
            return list;
        }

        // Lets deferred custom types commit before anything else happens.
        function flush(except) {
            var p, defs, i, type;
            if (!state) { return; }
            for (p = 0; p < pages.length; p += 1) {
                defs = definitions(pages[p]);
                for (i = 0; i < defs.length; i += 1) {
                    type = typeOf(defs[i]);
                    if (type && typeof type.flush === 'function' &&
                            !(except && defs[i].key != null && defs[i].key === except.key)) {
                        type.flush(defs[i], api);
                    }
                }
            }
        }

        function render() {
            var current, list, heading;
            if (ended || !state || dialog) { return; }
            current = page();
            list = rows(definitions(current));
            if (index >= list.length) { index = 0; }
            heading = current === home ? options.title : current.title;
            if (typeof heading === 'function') { heading = heading(tr, state); }
            post({
                type: prefix + '-native-render',
                menu: {
                    page: current.id,
                    title: notice || heading || tr('title', 'Settings'),
                    rows: list,
                    index: index
                }
            });
        }

        function save(key, value) {
            if (!state) { state = {}; }
            state[key] = value;
            pending[key] = true;
            saving = true;
            render();
            request('set', { key: key, value: value });
        }

        // Opens a sub-page: {id, title, entries: function(api) | Array, index}.
        function openPage(next) {
            positions[page().id] = index;
            pages.push(next);
            index = typeof next.index === 'number' ? next.index : (positions[next.id] || 0);
            positions[next.id] = index;
            render();
        }

        // Leaves the current sub-page. silent skips the render, for callers
        // that render through save() right after.
        function back(silent) {
            flush(null);
            notice = '';
            if (!state || pages.length < 2) { return false; }
            pages.pop();
            index = positions[page().id] || 0;
            if (!silent) { render(); }
            return true;
        }

        function confirm(config, onConfirm) {
            flush(null);
            dialog = { onConfirm: onConfirm, fallback: config.fallback || '' };
            post({
                type: prefix + '-native-dialog',
                dialog: {
                    text: config.text,
                    buttons: config.buttons || [
                        { value: 'no', labelId: 'common.No' },
                        { value: 'yes', labelId: 'common.Yes' }
                    ]
                }
            });
        }

        function closeDialog() {
            dialog = null;
            post({ type: prefix + '-native-dialog', dialog: null });
            render();
        }

        function activate(position, params) {
            var defs, def, row, type;
            if (ended || !state || dialog) { return; }
            notice = '';
            index = position;
            defs = definitions();
            def = defs[index];
            if (!def) { return; }
            row = buildRow(def);
            if (row.disabled) { return; }
            positions[page().id] = index;
            flush(def);
            type = typeOf(def);
            if (typeof def.select === 'function') {
                def.select(api, row, params);
            } else if (type && typeof type.activate === 'function') {
                type.activate(def, row, params, api);
            }
        }

        function focus(data) {
            var previous = index, def, type;
            if (typeof data.index !== 'number' || data.index < 0) { return; }
            index = data.index;
            positions[page().id] = index;
            def = definitions()[previous];
            type = typeOf(def);
            if (type && typeof type.focus === 'function') {
                type.focus(def, { index: index, previous: previous, secondary: data.secondary === true }, api);
            }
        }

        function showStatus(text) {
            if (!status) { return; }
            status.style.display = text ? 'block' : 'none';
            status.textContent = text;
        }

        function respond(data) {
            var i, p, defs, type;
            saving = data.saving === true;
            pending = {};
            for (i = 0; i < data.pending.length; i += 1) { pending[data.pending[i]] = true; }
            if (data.state) {
                state = data.state;
                limits = data.limits;
                unavailable = data.unavailable;
                rebootRequired = data.rebootRequired === true || data.restart_required === true;
            }
            if (state) {
                for (p = 0; p < pages.length; p += 1) {
                    defs = definitions(pages[p]);
                    for (i = 0; i < defs.length; i += 1) {
                        type = typeOf(defs[i]);
                        if (type && typeof type.response === 'function') { type.response(defs[i], data, api); }
                    }
                }
                if (typeof options.onState === 'function') {
                    try { options.onState(state, data, api); } catch (ignore) {}
                }
            }
            if (data.error && !state) {
                showStatus(tr('serviceUnavailable', 'Service unavailable. Please retry.'));
            } else if (!data.error) {
                showStatus('');
            }
            render();
        }

        function receive(event) {
            var data = event.data, confirmed, open;
            if (ended || event.source !== window.parent || !data || data.token !== token) { return; }
            if (data.type === prefix + '-native-select') {
                activate(data.index, data.params);
            } else if (data.type === prefix + '-native-focus') {
                focus(data);
            } else if (data.type === prefix + '-native-dialog-select') {
                if (!dialog) { return; }
                confirmed = data.value === 'yes';
                open = dialog;
                closeDialog();
                if (confirmed && typeof open.onConfirm === 'function') { open.onConfirm(); }
            } else if (data.type === prefix + '-native-error') {
                if (data.scope === 'dialog') {
                    // The resident already removed the dialog and restored list focus.
                    notice = dialog ? dialog.fallback : '';
                    dialog = null;
                    render();
                } else {
                    showStatus(tr('menuError', 'The Mazda menu could not be opened. Please reopen the app.'));
                }
            } else if (data.type === prefix + '-response') {
                respond(data);
            }
        }

        function input(action, phase) {
            if (ended) { return false; }
            if (action === 'back') {
                if (phase === 'press') { return true; }
                if (dialog) {
                    closeDialog();
                    return true;
                }
                return back(false);
            }
            if (state) { post({ type: prefix + '-native-input', action: action, phase: phase }); }
            return true;
        }

        function dispose() {
            if (ended) { return; }
            flush(null);
            post({ type: prefix + '-native-release' });
            ended = true;
            window.removeEventListener('message', receive, false);
        }

        api = {
            t: tr,
            state: function () { return state; },
            limits: function () { return limits; },
            unavailable: function () { return unavailable; },
            saving: function () { return saving; },
            pending: function (key) { return pending[key] === true; },
            rebootRequired: function () { return rebootRequired; },
            save: save,
            request: request,
            render: render,
            openPage: openPage,
            back: back,
            confirm: confirm,
            flush: function () { flush(null); },
            stepValue: stepValue,
            isFinalAdjustment: isFinalAdjustment
        };

        window.addEventListener('message', receive, false);
        sdk.onInput(input);
        sdk.onDispose(dispose);
        sdk.ready();
        sdk.loadLanguage(function (language, direction) {
            document.documentElement.lang = language.replace('_', '-');
            if (status) { status.dir = direction; }
            sendTexts();
            if (state) {
                render();
            } else if (status) {
                status.textContent = tr('loading', 'Loading settings...');
            }
        });
        request('get');
        return api;
    }

    global.MzdSettingsView = { create: createView, types: TYPES, stepValue: stepValue, isFinalAdjustment: isFinalAdjustment };
}(window));
