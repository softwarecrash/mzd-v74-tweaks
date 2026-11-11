/*
 * Android Auto Settings resident. Uses the shared native menu runtime for the
 * OEM List2 control and the OEM Dialog3 confirmation template, and owns the
 * save queue, status bar notifications and the reboot request.
 */
(function (global) {
    'use strict';

    global.MzdGuiResidents.register('android-auto', function (context) {
        var TEXTS = {
            saveError: 'Failed to save settings',
            reboot: 'Reboot to apply changes',
            rebootFallback: 'Hold NAV + MUTE to reboot'
        };
        var texts = {}, key;
        for (key in TEXTS) {
            if (Object.prototype.hasOwnProperty.call(TEXTS, key)) { texts[key] = TEXTS[key]; }
        }
        var refreshTimer = null, hostEnded = false;
        // cachedSettings is working state for the open view and pending saves.
        // Every view open reads libpatch.conf again through the service.
        var cachedSettings = null, cachedLimits = {}, cachedUnavailable = {}, rebootRequired = false;
        var queue = [], inFlight = null, syncing = false, syncCallbacks = [];
        var viewOpen = false, saveFailed = false;

        /*
         * Notification rules (all share one SBN slot):
         * - Leaving the list, or a batch finishing after the list was left,
         *   shows the reboot notice when the saved settings differ from the
         *   ones MZD booted with.
         * - A failed save shows only its error. No reboot notice follows until
         *   the list is opened again.
         */
        function saving() {
            return !!inFlight || queue.length > 0;
        }

        function beginSettingsView() {
            if (viewOpen) { return; }
            viewOpen = true;
            saveFailed = false;
        }

        function endSettingsView() {
            if (!viewOpen) { return; }
            viewOpen = false;
            // A save still in progress shows its own result when it finishes.
            if (!saving() && rebootRequired && !saveFailed) { context.notify(texts.reboot, false); }
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
            prefix: 'aa',
            dialog: true,
            onOpen: function () {
                beginSettingsView();
                startPolling();
            },
            onClose: stopPolling
        });

        function leaveSettingsView() {
            nativeMenu.close(true);
            stopPolling();
            endSettingsView();
        }

        function frameToken(source) {
            var current = context.view();
            return current && current.source === source ? current.token : '';
        }

        function broadcastState(error) {
            var current = context.view();
            if (current && current.source && (cachedSettings || error)) {
                try {
                    current.source.postMessage({
                        type: 'aa-response',
                        token: current.token,
                        state: cachedSettings,
                        limits: cachedLimits,
                        unavailable: cachedUnavailable,
                        rebootRequired: rebootRequired,
                        saving: saving(),
                        error: error || ''
                    }, '*');
                } catch (ignore) {}
            }
        }

        // A fresh read can miss saves that are still queued or running; keep
        // their values so reopening the view does not flash the old ones.
        function withPendingSaves(settings) {
            var i;
            if (inFlight) { settings[inFlight.key] = inFlight.value; }
            for (i = 0; i < queue.length; i += 1) { settings[queue[i].key] = queue[i].value; }
            return settings;
        }

        function syncFromService(cb) {
            if (cb) { syncCallbacks.push(cb); }
            if (syncing) { return; }
            syncing = true;
            context.service.request('get', {}, function (error, result) {
                var cbs, i;
                syncing = false;
                if (!error && result && result.settings) {
                    cachedSettings = withPendingSaves(result.settings);
                    cachedLimits = result.limits || {};
                    cachedUnavailable = result.unavailable || {};
                    rebootRequired = result.rebootRequired === true || result.restart_required === true;
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
                    saveFailed = true;
                    context.notify(texts.saveError, true);
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
                    if (result.limits) { cachedLimits = result.limits; }
                    if (result.unavailable) { cachedUnavailable = result.unavailable; }
                    rebootRequired = result.rebootRequired === true || result.restart_required === true;
                }
                broadcastState('');
                if (queue.length > 0) {
                    drainQueue();
                } else if (!viewOpen && rebootRequired && !saveFailed) {
                    context.notify(texts.reboot, false);
                }
            });
        }

        function queueSetting(name, value) {
            var i;
            if (!cachedSettings) { cachedSettings = {}; }
            cachedSettings[name] = value;
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

        function setTexts(payload) {
            var name;
            if (!payload) { return; }
            for (name in TEXTS) {
                if (Object.prototype.hasOwnProperty.call(TEXTS, name) && typeof payload[name] === 'string' && payload[name]) {
                    texts[name] = payload[name];
                }
            }
        }

        function requestReboot() {
            // The view disables the reboot row while saving, but its state can be
            // out of date. Never let a reboot overtake a queued save.
            if (saving() || !rebootRequired) {
                broadcastState('');
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
            var data = event.data, token = frameToken(event.source), frames, frame, i;
            if (data && data.type === 'aa-native-release') {
                if ((token && data.token === token) || nativeMenu.owns(event.source, data.token)) {
                    leaveSettingsView();
                }
                return;
            }
            if (!token || !data || data.token !== token) { return; }
            if (data.type === 'aa-native-render' || data.type === 'aa-native-input' || data.type === 'aa-native-dialog') {
                frames = document.getElementsByTagName('iframe');
                for (i = 0; i < frames.length; i += 1) {
                    if (frames[i].contentWindow === event.source) { frame = frames[i]; }
                }
                if (!frame) { return; }
                try {
                    if (data.type === 'aa-native-render') {
                        nativeMenu.render(frame, token, data.menu);
                    } else if (data.type === 'aa-native-input') {
                        nativeMenu.input(frame, token, data.action, data.phase);
                    } else {
                        nativeMenu.dialog(frame, token, data.dialog);
                    }
                } catch (failure) {
                    nativeMenu.close(false);
                    event.source.postMessage({
                        type: 'aa-native-error',
                        token: token,
                        scope: 'menu',
                        message: String(failure.message || failure)
                    }, '*');
                }
                return;
            }
            if (data.type !== 'aa-request') { return; }
            if (data.action === 'get') {
                syncFromService();
            } else if (data.action === 'texts') {
                setTexts(data.payload);
            } else if (data.action === 'reboot') {
                requestReboot();
            } else if (data.action === 'set' && data.payload && data.payload.key) {
                queueSetting(data.payload.key, data.payload.value);
            }
        }
        context.onMessage(receive);
        context.onViewClose(leaveSettingsView);
        context.onDispose(function () {
            hostEnded = true;
            leaveSettingsView();
        });
        // The service becomes ready at boot; read settings only for an open view.
        context.onServiceReady(function () {
            if (context.view()) {
                syncFromService();
            }
        });
    });
}(window));
