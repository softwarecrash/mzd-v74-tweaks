/*
 * Shared settings host for residents (GUI API level 2). Strictly ES5.
 *
 * MzdSettingsHost runs in a resident: native menu delegation, save queue,
 * state broadcasts, notifications and the optional reboot request. The
 * matching view half is settings-view.js. The shared hook loads this file
 * with the residents; a view never needs it.
 */
(function (global) {
    'use strict';

    var has = Object.prototype.hasOwnProperty;
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

    function currentView(context) {
        return context.view();
    }

    function frameToken(context, source) {
        var current = currentView(context);
        return (current && current.source === source) ? current.token : '';
    }

    function findFrame(context, source) {
        var current = currentView(context);
        return (current && current.source === source) ? current.frame : null;
    }

    /*
     * Routes <prefix>-native-render/-input/-dialog/-release messages from the
     * active view to a native menu. Returns true when the message was handled.
     * options.onRelease replaces the default close(true) on release.
     * options.leaveOnError returns to Applications when the menu fails.
     */
    function handleNativeMessage(nativeMenu, context, prefix, event, options) {
        var data, token, frame, owns;
        options = options || {};
        if (!event || !event.data || !prefix) { return false; }
        data = event.data;
        token = frameToken(context, event.source);

        if (data.type === prefix + '-native-release') {
            owns = nativeMenu.owns(event.source, data.token);
            if (!(token && data.token === token) && !owns) { return false; }
            if (typeof options.onRelease === 'function') {
                options.onRelease();
            } else {
                nativeMenu.close(true);
            }
            return true;
        }
        if (!token || data.token !== token) { return false; }
        if (data.type !== prefix + '-native-render' &&
                data.type !== prefix + '-native-input' &&
                data.type !== prefix + '-native-dialog') {
            return false;
        }
        frame = findFrame(context, event.source);
        if (!frame) { return false; }
        try {
            if (data.type === prefix + '-native-render') {
                nativeMenu.render(frame, token, data.menu);
            } else if (data.type === prefix + '-native-dialog') {
                nativeMenu.dialog(frame, token, data.dialog);
            } else {
                nativeMenu.input(frame, token, data.action, data.phase);
            }
        } catch (failure) {
            nativeMenu.close(options.leaveOnError === true);
            try {
                event.source.postMessage({
                    type: prefix + '-native-error',
                    token: token,
                    scope: data.type === prefix + '-native-dialog' ? 'dialog' : 'menu',
                    message: String(failure.message || failure)
                }, '*');
            } catch (ignore) {}
        }
        return true;
    }

    // --- Resident side ---------------------------------------------------

    function createHost(context, options) {
        options = options || {};
        var prefix = options.prefix || 'mzd';
        var texts = copy(copy({}, DEFAULT_TEXTS), options.texts);
        var refreshTimer = null, hostEnded = false, viewOpen = false, saveFailed = false;
        var settings = options.initialState ? copy({}, options.initialState) : null;
        var limits = {}, unavailable = {}, rebootRequired = false;
        var queue = [], inFlight = null, syncing = false, syncCallbacks = [];
        var nativeMenu, menuOptions;

        function saving() {
            return !!inFlight || queue.length > 0;
        }

        function pendingKeys() {
            var keys = [], i;
            if (inFlight) { keys.push(inFlight.key); }
            for (i = 0; i < queue.length; i += 1) { keys.push(queue[i].key); }
            return keys;
        }

        // A failing tweak hook is logged; it must not stop the host.
        function hook(name, value, extra) {
            if (typeof options[name] === 'function') {
                try { options[name](value, extra); } catch (error) { context.log(name + ' failed: ' + error); }
            }
        }

        function notifyReboot() {
            if (!viewOpen && !saving() && rebootRequired && !saveFailed) {
                context.notify(texts.reboot, false);
            }
        }

        function stopPolling() {
            if (refreshTimer) {
                global.clearInterval(refreshTimer);
                refreshTimer = null;
            }
        }

        menuOptions = {
            prefix: prefix,
            dialog: !!options.dialog,
            onOpen: function () {
                if (!viewOpen) {
                    viewOpen = true;
                    saveFailed = false;
                }
                if (!refreshTimer) {
                    refreshTimer = global.setInterval(function () { nativeMenu.check(); }, 500);
                }
                hook('onOpen');
            },
            onClose: function () {
                stopPolling();
                hook('onClose');
            }
        };
        if (options.split != null) { menuOptions.split = options.split; }
        if (options.preview != null) { menuOptions.preview = options.preview; }
        nativeMenu = context.createNativeMenu(menuOptions);

        function leave() {
            nativeMenu.close(true);
            stopPolling();
            if (viewOpen) {
                viewOpen = false;
                notifyReboot();
            }
        }

        function broadcast(error) {
            var current = currentView(context);
            if (!current || !current.source || (!settings && !error)) { return; }
            try {
                current.source.postMessage({
                    type: prefix + '-response',
                    token: current.token,
                    state: settings,
                    limits: limits,
                    unavailable: unavailable,
                    rebootRequired: rebootRequired,
                    saving: saving(),
                    pending: pendingKeys(),
                    error: error || ''
                }, '*');
            } catch (ignore) {}
        }

        function hasQueuedKey(name) {
            var i;
            for (i = 0; i < queue.length; i += 1) {
                if (queue[i].key === name) { return true; }
            }
            return false;
        }

        // Service values never overwrite a value that is still waiting to be saved.
        function accept(result, full) {
            var key, i;
            if (full || !settings) { settings = {}; }
            for (key in result.settings) {
                if (has.call(result.settings, key) && !hasQueuedKey(key) && !(inFlight && inFlight.key === key)) {
                    settings[key] = result.settings[key];
                }
            }
            if (full) {
                if (inFlight) { settings[inFlight.key] = inFlight.value; }
                for (i = 0; i < queue.length; i += 1) { settings[queue[i].key] = queue[i].value; }
            }
            if (full || result.limits) { limits = result.limits || {}; }
            if (full || result.unavailable) { unavailable = result.unavailable || {}; }
            rebootRequired = result.rebootRequired === true || result.restart_required === true;
            hook('onState', settings, result);
        }

        function sync(callback) {
            if (callback) { syncCallbacks.push(callback); }
            if (settings) { broadcast(''); }
            if (syncing) { return; }
            syncing = true;
            context.service.request('get', {}, function (error, result) {
                var callbacks = syncCallbacks, i;
                syncing = false;
                syncCallbacks = [];
                if (!error && result && result.settings) {
                    accept(result, true);
                    broadcast('');
                } else if (error) {
                    broadcast(error);
                }
                for (i = 0; i < callbacks.length; i += 1) {
                    try { callbacks[i](error, result); } catch (failure) { context.log('sync callback failed: ' + failure); }
                }
            });
        }

        function drain() {
            var next;
            if (hostEnded || inFlight || queue.length === 0) { return; }
            next = queue.shift();
            inFlight = next;
            context.service.request('set', { key: next.key, value: next.value }, function (error, result) {
                inFlight = null;
                if (error) {
                    queue = [];
                    saveFailed = true;
                    context.notify(texts.saveError, true);
                    sync(function () { broadcast(error); });
                    return;
                }
                if (result && result.settings) { accept(result, false); }
                broadcast('');
                if (queue.length > 0) {
                    drain();
                } else {
                    notifyReboot();
                }
            });
        }

        // A newer value for a queued key replaces it, so rapid changes coalesce.
        function queueSetting(name, value) {
            var i;
            if (!settings) { settings = {}; }
            settings[name] = value;
            hook('onState', settings, null);
            for (i = 0; i < queue.length; i += 1) {
                if (queue[i].key === name) {
                    queue[i].value = value;
                    drain();
                    return;
                }
            }
            queue.push({ key: name, value: value });
            drain();
        }

        function setTexts(payload) {
            var name;
            for (name in payload) {
                if (has.call(payload, name) && typeof payload[name] === 'string' && payload[name]) {
                    texts[name] = payload[name];
                }
            }
        }

        // Follows the reboot rules in development/Gui-extensions.md.
        function requestReboot() {
            if (saving() || !rebootRequired) {
                broadcast('');
                return;
            }
            context.service.request('reboot', {}, function (error) {
                if (error) {
                    context.log('Reboot failed: ' + error);
                    context.notify(texts.rebootFallback, false);
                }
            });
        }

        function receive(event) {
            var data = event.data;
            if (handleNativeMessage(nativeMenu, context, prefix, event, { onRelease: leave })) { return; }
            if (!data || data.type !== prefix + '-request' || !data.token ||
                    data.token !== frameToken(context, event.source)) {
                return;
            }
            if (data.action === 'get') {
                sync();
            } else if (data.action === 'texts' && data.payload) {
                setTexts(data.payload);
            } else if (data.action === 'reboot' && options.reboot === true) {
                requestReboot();
            } else if (data.action === 'set' && data.payload && typeof data.payload.key === 'string') {
                queueSetting(data.payload.key, data.payload.value);
            } else if (typeof options.onRequest === 'function') {
                try { options.onRequest(data.action, data.payload, api); } catch (error) { context.log('onRequest failed: ' + error); }
            }
        }

        var api = {
            nativeMenu: nativeMenu,
            sync: sync,
            settings: function () { return settings; },
            save: queueSetting,
            broadcast: broadcast,
            leave: leave,
            saving: saving
        };

        context.onMessage(receive);
        context.onViewClose(leave);
        context.onDispose(function () {
            hostEnded = true;
            leave();
            hook('onDispose');
        });
        context.onServiceReady(function () {
            if (currentView(context)) { sync(); }
        });
        if (options.syncOnStart === true) { sync(); }
        return api;
    }

    global.MzdSettingsHost = { create: createHost, handleNativeMessage: handleNativeMessage };
}(window));
