/*
 * MZD Tweaks resident. Uses the shared native menu runtime for the
 * OEM List2 control and synchronizes live in-flight JavaScript variables.
 */
(function (global) {
    'use strict';

    if (!global.mzdTweaks) {
        global.mzdTweaks = {
            main_menu_loop: false,
            list_loop: false,
            list_beep: true,
            short_delay: false
        };
    }

    try {
        var bootScript = document.createElement('script');
        bootScript.type = 'text/javascript';
        bootScript.src = '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js';
        bootScript.onerror = function (event) {
            if (event && event.preventDefault) { event.preventDefault(); }
            return true;
        };
        (document.head || document.documentElement).appendChild(bootScript);
    } catch (ignore) {}

    global.MzdGuiResidents.register('mzd-tweaks', function (context) {
        var refreshTimer = null, hostEnded = false;
        var cachedSettings = null;
        var queue = [], inFlight = null, syncing = false, syncCallbacks = [];
        var viewOpen = false;

        function saving() {
            return !!inFlight || queue.length > 0;
        }

        function startPolling() {
            if (!refreshTimer) {
                refreshTimer = global.setInterval(function () {
                    nativeMenu.check();
                }, 500);
            }
        }

        function stopPolling() {
            if (refreshTimer) {
                global.clearInterval(refreshTimer);
                refreshTimer = null;
            }
        }

        var nativeMenu = context.createNativeMenu({
            prefix: 'mzd-tweaks',
            dialog: false,
            onOpen: function () {
                viewOpen = true;
                startPolling();
            },
            onClose: function () {
                viewOpen = false;
                stopPolling();
            }
        });

        function frameToken(source) {
            var current = context.view();
            return current && current.source === source ? current.token : '';
        }

        function broadcastState(error) {
            var current = context.view();
            if (current && current.source && (cachedSettings || error)) {
                try {
                    current.source.postMessage({
                        type: 'mzd-tweaks-response',
                        token: current.token,
                        state: cachedSettings,
                        saving: saving(),
                        error: error || ''
                    }, '*');
                } catch (ignore) {}
            }
        }

        function withPendingSaves(settings) {
            var i;
            if (inFlight) { settings[inFlight.key] = inFlight.value; }
            for (i = 0; i < queue.length; i += 1) { settings[queue[i].key] = queue[i].value; }
            return settings;
        }

        function applyGlobals(settings) {
            var k;
            if (!global.mzdTweaks) { global.mzdTweaks = {}; }
            for (k in settings) {
                if (Object.prototype.hasOwnProperty.call(settings, k)) {
                    global.mzdTweaks[k] = settings[k];
                }
            }
        }

        function syncFromService(cb) {
            if (cb) { syncCallbacks.push(cb); }
            if (cachedSettings) {
                broadcastState('');
            }
            if (syncing) { return; }
            syncing = true;
            context.service.request('get', {}, function (error, result) {
                var cbs, i;
                syncing = false;
                if (!error && result && result.settings) {
                    cachedSettings = withPendingSaves(result.settings);
                    applyGlobals(cachedSettings);
                    broadcastState('');
                } else if (error) {
                    broadcastState(error);
                }
                cbs = syncCallbacks;
                syncCallbacks = [];
                for (i = 0; i < cbs.length; i += 1) {
                    try {
                        cbs[i](error, result);
                    } catch (ignore) {}
                }
            });
        }

        function hasQueuedKey(name) {
            var i;
            for (i = 0; i < queue.length; i += 1) {
                if (queue[i].key === name) { return true; }
            }
            return false;
        }

        function drainQueue() {
            if (hostEnded || inFlight || queue.length === 0) { return; }
            var next = queue.shift();
            inFlight = next;
            context.service.request('set', { key: next.key, value: next.value }, function (error, result) {
                var k;
                inFlight = null;
                if (error) {
                    queue = [];
                    context.notify(context.t('saveError', 'Failed to save settings'), true);
                    syncFromService(function () {
                        broadcastState(error);
                    });
                    return;
                }
                if (result && result.settings) {
                    for (k in result.settings) {
                        if (Object.prototype.hasOwnProperty.call(result.settings, k) && !hasQueuedKey(k)) {
                            cachedSettings[k] = result.settings[k];
                        }
                    }
                    applyGlobals(cachedSettings);
                }
                broadcastState('');
                if (queue.length > 0) {
                    drainQueue();
                }
            });
        }

        function queueSetting(name, value) {
            var i;
            if (!cachedSettings) { cachedSettings = {}; }
            cachedSettings[name] = value;
            if (!global.mzdTweaks) { global.mzdTweaks = {}; }
            global.mzdTweaks[name] = value;

            for (i = 0; i < queue.length; i += 1) {
                if (queue[i].key === name) {
                    queue[i].value = value;
                    drainQueue();
                    return;
                }
            }
            queue.push({ key: name, value: value });
            drainQueue();
        }

        function leaveSettingsView() {
            nativeMenu.close(true);
            stopPolling();
        }

        function receive(event) {
            var data = event.data, token = frameToken(event.source), frames, frame, i;
            if (data && data.type === 'mzd-tweaks-native-release') {
                if ((token && data.token === token) || nativeMenu.owns(event.source, data.token)) {
                    leaveSettingsView();
                }
                return;
            }
            if (!token || !data || data.token !== token) { return; }

            if (data.type === 'mzd-tweaks-native-render' && data.menu) {
                var current = context.view();
                frame = (current && current.frame) || null;
                if (!frame) {
                    frames = document.getElementsByTagName('iframe');
                    for (i = 0; i < frames.length; i += 1) {
                        if (frames[i].contentWindow === event.source) { frame = frames[i]; break; }
                    }
                }
                if (!frame) { return; }
                try {
                    nativeMenu.render(frame, token, data.menu);
                } catch (failure) {
                    nativeMenu.close(false);
                    event.source.postMessage({
                        type: 'mzd-tweaks-native-error',
                        token: token,
                        scope: 'menu',
                        message: String(failure.message || failure)
                    }, '*');
                }
                return;
            }

            if (data.type === 'mzd-tweaks-native-input') {
                var currentView = context.view();
                frame = (currentView && currentView.frame) || null;
                if (!frame) {
                    frames = document.getElementsByTagName('iframe');
                    for (i = 0; i < frames.length; i += 1) {
                        if (frames[i].contentWindow === event.source) { frame = frames[i]; break; }
                    }
                }
                if (frame) {
                    nativeMenu.input(frame, token, data.action, data.phase);
                }
                return;
            }

            if (data.type === 'mzd-tweaks-request') {
                if (data.action === 'sync' || data.action === 'get') {
                    syncFromService();
                    return;
                }
                if (data.action === 'set' && data.payload && typeof data.payload.key === 'string') {
                    queueSetting(data.payload.key, data.payload.value);
                }
            }
        }

        context.onMessage(receive);
        context.onViewClose(leaveSettingsView);
        context.onDispose(function () {
            hostEnded = true;
            leaveSettingsView();
        });

        context.onServiceReady(function () {
            if (context.view()) {
                syncFromService();
            }
        });

        // Initialize state from existing globals, then synchronize with service.
        cachedSettings = {};
        for (var key in global.mzdTweaks) {
            if (Object.prototype.hasOwnProperty.call(global.mzdTweaks, key)) {
                cachedSettings[key] = global.mzdTweaks[key];
            }
        }
        syncFromService();
    });
}(window));
