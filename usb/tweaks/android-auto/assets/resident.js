/*
 * Android Auto Settings resident. Renders the view's menu with the OEM List2
 * control and the OEM Dialog3 confirmation template, and owns the save queue,
 * status bar notifications and the reboot request.
 */
(function (global) {
    'use strict';
    function note(message) {
        try { if (global.log && global.log.info) { global.log.info('[android-auto] ' + message); } } catch (ignore) {}
    }

    // OEM components for the confirmation dialog. Applications does not load
    // them, so they are added on first use.
    var DIALOG_ASSETS = [
        {css: '/jci/gui/common/controls/Dialog3/css/Dialog3Ctrl.css'},
        {css: '/jci/gui/common/controls/Button/css/ButtonCtrl.css'},
        {js: '/jci/gui/common/controls/Button/js/ButtonCtrl.js', method: 'registerCtrlLoaded', registry: '_controlsLoaded', name: 'ButtonCtrl', key: 'common/controls/Button'},
        {js: '/jci/gui/common/controls/Dialog3/js/Dialog3Ctrl.js', method: 'registerCtrlLoaded', registry: '_controlsLoaded', name: 'Dialog3Ctrl', key: 'common/controls/Dialog3'},
        {js: '/jci/gui/common/templates/Dialog3/js/Dialog3Tmplt.js', method: 'registerTmpltLoaded', registry: '_templatesLoaded', name: 'Dialog3Tmplt'}
    ];

    function create(options) {
        options = options || {};
        var session = null, selection = null, shown = false, dialogAssetsReady = false, dialogAssetCallbacks = null;

        function dialogAssetsRegistered(fw) {
            return !!(fw._templatesLoaded && fw._templatesLoaded.Dialog3Tmplt && fw._templatesLoaded.Dialog3Tmplt.isLoaded &&
                fw._controlsLoaded && fw._controlsLoaded.Dialog3Ctrl && fw._controlsLoaded.Dialog3Ctrl.isLoaded &&
                fw._controlsLoaded.ButtonCtrl && fw._controlsLoaded.ButtonCtrl.isLoaded &&
                typeof global.Dialog3Tmplt === 'function');
        }
        function loadDialogAsset(asset, callback) {
            var fw = global.framework, head = document.getElementsByTagName('head')[0], node, original, wrapper;
            var registered = false, complete = false;
            if (!head) {
                callback('Mazda dialog assets are unavailable.');
                return;
            }
            function finish(error) {
                if (complete) { return; }
                complete = true;
                if (asset.js) {
                    if (fw[asset.method] === wrapper) { fw[asset.method] = original; }
                    if (!error && !registered) { error = 'Mazda dialog component did not register: ' + asset.name; }
                    // Stop the framework from loading the same component files again.
                    if (!error && asset.key && fw._processedFilePaths) { fw._processedFilePaths[asset.key] = true; }
                }
                callback(error || '');
            }
            if (asset.css) {
                node = document.createElement('link');
                node.rel = 'stylesheet';
                node.href = asset.css;
            } else {
                original = fw[asset.method];
                if (typeof original !== 'function') {
                    callback('Mazda dialog registration is unavailable.');
                    return;
                }
                // The OEM registration hooks also drive the framework's app and
                // template loading state machine (_frameworkState). Record this
                // component as loaded without advancing that state.
                wrapper = function (name) {
                    if (name !== asset.name) { return original.apply(this, arguments); }
                    registered = true;
                    fw[asset.registry][name] = fw[asset.registry][name] || {isLoaded: true, nameCounter: 0};
                };
                fw[asset.method] = wrapper;
                node = document.createElement('script');
                node.src = asset.js;
            }
            node.onload = function () { finish(''); };
            node.onerror = function () { finish('Failed to load Mazda dialog asset: ' + (asset.css || asset.js)); };
            head.appendChild(node);
        }
        function ensureDialogAssets(callback) {
            if (dialogAssetsReady || dialogAssetsRegistered(global.framework)) {
                dialogAssetsReady = true;
                callback('');
                return;
            }
            if (dialogAssetCallbacks) {
                dialogAssetCallbacks.push(callback);
                return;
            }
            dialogAssetCallbacks = [callback];
            function finish(error) {
                var callbacks = dialogAssetCallbacks, i;
                dialogAssetCallbacks = null;
                dialogAssetsReady = !error;
                for (i = 0; i < callbacks.length; i += 1) { callbacks[i](error); }
            }
            function next(index) {
                if (index >= DIALOG_ASSETS.length) {
                    finish('');
                    return;
                }
                loadDialogAsset(DIALOG_ASSETS[index], function (error) {
                    if (error) { finish(error); } else { next(index + 1); }
                });
            }
            next(0);
        }
        function owns(frame, token) {
            return !!session && session.frame === frame && session.token === token;
        }
        function send(type, fields) {
            var message = fields || {};
            if (!session) { return; }
            message.type = type;
            message.token = session.token;
            session.frame.contentWindow.postMessage(message, '*');
        }
        function applications(fw) {
            return !!fw && typeof fw.getCurrentApp === 'function' && fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications';
        }
        // The embedded list is not a framework template, so the multicontroller
        // handoff that Common performs between the Mazda Back button and the
        // active template is done here.
        function backButton() {
            var common = global.framework && global.framework.common;
            return common && common.leftBtn && common.leftBtn.btnInstance ? common.leftBtn : null;
        }
        function releaseBackButton() {
            var button = backButton();
            if (button && button.btnInstance.hasFocus) { button.handleControllerEvent('lostFocus'); }
        }
        function focusList() {
            releaseBackButton();
            session.control.handleControllerEvent('acceptFocusInit');
        }
        function destroyList() {
            if (session && session.control) {
                try { global.framework.destroyControl(session.control); } catch (ignore) {}
                session.control = null;
            }
        }
        function destroyDialog(restoreFocus) {
            var dialog = session && session.dialog;
            if (!dialog) { return; }
            session.dialog = null;
            if (dialog.template && typeof dialog.template.cleanUp === 'function') {
                try { dialog.template.cleanUp(); } catch (error) { note('Dialog cleanup failed: ' + (error.message || error)); }
            }
            if (dialog.container.parentNode) {
                dialog.container.parentNode.removeChild(dialog.container);
            }
            if (restoreFocus && session.control) {
                session.control.restoreContext(dialog.capture);
                focusList();
            }
        }
        function dialogButton(button) {
            if (!button || typeof button.value !== 'string' || typeof button.labelId !== 'string') {
                throw new Error('Invalid confirmation dialog.');
            }
            return {appData: button.value, labelId: button.labelId};
        }
        function showDialog(frame, token, spec) {
            var fw = global.framework, buttons, dialog;
            if (!owns(frame, token)) { return; }
            if (!spec) {
                destroyDialog(true);
                return;
            }
            if (typeof spec.text !== 'string' || !spec.buttons || spec.buttons.length !== 2) {
                throw new Error('Invalid confirmation dialog.');
            }
            buttons = {button1: dialogButton(spec.buttons[0]), button2: dialogButton(spec.buttons[1])};
            if (!session.control) { throw new Error('Confirmation dialog requested before the menu.'); }
            if (session.dialog) { return; }
            dialog = session.dialog = {
                container: document.createElement('div'),
                capture: session.control.getContextCapture(),
                template: null
            };
            releaseBackButton();
            session.control.handleControllerEvent('lostFocus');
            dialog.container.style.cssText = 'position:absolute;left:0;top:0;width:800px;height:480px;z-index:20000;';
            document.body.appendChild(dialog.container);
            ensureDialogAssets(function (error) {
                if (!session || session.dialog !== dialog) { return; }
                if (!error) {
                    try {
                        dialog.template = fw.instantiateTemplate('system', dialog.container, 'Dialog3Tmplt', {
                            Dialog3Ctrl: {
                                contentStyle: 'style02',
                                fullScreen: true,
                                initialFocus: 0,
                                text1: spec.text,
                                buttonConfig: buttons,
                                defaultSelectCallback: function (source, value) {
                                    if (session && session.dialog === dialog) {
                                        send('aa-native-dialog-select', {value: value});
                                    }
                                }
                            }
                        });
                        if (!dialog.template || !dialog.template.dialog3Ctrl) { error = 'Mazda confirmation dialog could not be created.'; }
                    } catch (failure) {
                        error = String(failure.message || failure);
                    }
                }
                if (error) {
                    destroyDialog(true);
                    send('aa-native-error', {scope: 'dialog', message: error});
                }
            });
        }
        // Restores the Applications screen after the settings view is left.
        function returnToApplications() {
            var fw = global.framework, app, template;
            if (!shown || !applications(fw)) { return; }
            shown = false;
            app = fw.getAppInstance('system');
            template = app && app._currentContextTemplate;
            // Leaving through the Mazda Back button keeps its focus, and touching
            // the embedded controls can take focus from the hidden Applications
            // list. Give focus back to the list, as Common does when the Back
            // button hands focus right.
            releaseBackButton();
            if (template && typeof template.handleControllerEvent === 'function') {
                template.handleControllerEvent('acceptFocusFromLeft');
            }
            // The runtime restores line numbers itself while the template is hidden.
            if (template && template.list2Ctrl && (!template.divElt || template.divElt.style.visibility !== 'hidden')) {
                template.list2Ctrl.setLineNumbers();
            }
            if (fw.common && fw.common.setSbNameId) {
                fw.common.setSbNameId('system', 'Applications');
            }
        }
        // leaving: the view is going away. Otherwise only the native list is
        // removed (for example after an error) and the view stays on screen.
        function close(leaving) {
            var old = session, fw = global.framework;
            if (old) {
                global.clearTimeout(selection);
                selection = null;
                destroyDialog(false);
                destroyList();
                session = null;
                if (typeof options.onClose === 'function') {
                    try { options.onClose(); } catch (ignore) {}
                }
                if (fw && fw.sendEventToMmui === old.backWrapper) {
                    fw.sendEventToMmui = old.originalSend;
                }
                if (old.container.parentNode) {
                    old.container.parentNode.removeChild(old.container);
                }
                old.frame.style.display = old.display;
                old.root.style.cssText = old.css;
                old.root.className = old.className;
            }
            if (leaving) { returnToApplications(); }
        }
        function attach(frame, token) {
            var fw = global.framework, root = frame.parentNode, container, originalSend;
            if (owns(frame, token)) { return; }
            close(false);
            if (!fw || typeof fw.instantiateControl !== 'function' || typeof fw.destroyControl !== 'function') {
                throw new Error('Mazda list factory unavailable.');
            }
            container = document.createElement('div');
            container.className = 'TemplateWithStatusLeft List2Tmplt';
            container.style.cssText = 'position:absolute;left:0;top:0;width:740px;height:416px;';
            session = {
                frame: frame,
                source: frame.contentWindow,
                token: token,
                root: root,
                container: container,
                control: null,
                page: '',
                signature: '',
                dialog: null,
                css: root.style.cssText,
                className: root.className,
                display: frame.style.display,
                originalSend: fw.sendEventToMmui
            };
            frame.style.display = 'none';
            root.style.cssText = 'position:absolute;left:60px;top:64px;width:740px;height:416px;z-index:7;background:transparent;overflow:visible;';
            root.className = '';
            root.appendChild(container);
            // Preload so the confirmation dialog opens without a delay. A failure
            // is retried and reported when the dialog is requested.
            ensureDialogAssets(function (error) {
                if (error) { note('Dialog preload failed: ' + error); }
            });
            originalSend = session.originalSend;
            session.backWrapper = function (uia, event) {
                if (session && event === 'Global.GoBack' && applications(fw)) {
                    session.frame.contentWindow.postMessage({
                        type: 'mzd-gui-input',
                        token: session.token,
                        action: 'back',
                        phase: 'step'
                    }, '*');
                    return;
                }
                return originalSend.apply(this, arguments);
            };
            fw.sendEventToMmui = session.backWrapper;
        }
        function render(frame, token, menu) {
            var fw = global.framework, items = [], i, row, captured, signature, current, oldPage;
            if (!menu || typeof menu.title !== 'string' || !menu.rows || menu.rows.length > 202) {
                throw new Error('Invalid native menu.');
            }
            attach(frame, token);
            shown = true;
            if (typeof options.onOpen === 'function') {
                try { options.onOpen(); } catch (ignore) {}
            }
            current = session;
            if (fw.common && fw.common.setSbName) {
                fw.common.setSbName(menu.title.replace(/[.]png/gi, ''));
            }
            for (i = 0; i < menu.rows.length; i += 1) {
                row = menu.rows[i];
                items.push({
                    appData: { aaIndex: i },
                    text1Id: null,
                    text1: row.label,
                    itemStyle: row.itemStyle || (row.checkable ? 'style03' : row.detail ? 'style06' : 'style01'),
                    image1: row.checkable ? (row.radio ? 'radio' : 'tick') : (row.image1 || ''),
                    checked: row.checked === true,
                    value: row.value != null ? row.value : (row.checked ? 1 : 2),
                    label1Id: null,
                    label1: row.detail || '',
                    hasCaret: row.caret === true,
                    disabled: row.disabled === true
                });
            }
            signature = JSON.stringify(items);
            oldPage = session.page;
            if (session.control && oldPage === menu.page && session.signature === signature) {
                return;
            }
            if (session.control && oldPage === menu.page) {
                captured = session.control.getContextCapture();
                session.control.setDataListAndUpdateItems({
                    itemCountKnown: true,
                    itemCount: items.length,
                    items: items,
                    vuiSupport: false
                });
                if (captured.focussedItem >= items.length) {
                    captured.focussedItem = 0;
                    captured.topItem = 0;
                }
                session.control.restoreContext(captured);
            } else {
                global.clearTimeout(selection);
                destroyList();
                session.container.innerHTML = '';
                session.control = fw.instantiateControl('system', session.container, 'List2Ctrl', {
                    titleConfiguration: 'noTitle',
                    numberedList: true,
                    smallItemText: true,
                    focussedItem: menu.index || 0,
                    dataList: {
                        itemCountKnown: true,
                        itemCount: items.length,
                        items: items,
                        vuiSupport: false
                    },
                    selectCallback: function (source, data) {
                        if (session !== current || source !== current.control || !data) { return; }
                        global.clearTimeout(selection);
                        selection = global.setTimeout(function () {
                            if (session === current && current.control === source) {
                                send('aa-native-select', {index: data.aaIndex});
                            }
                        }, 0);
                    }
                });
                focusList();
            }
            session.page = menu.page;
            session.signature = signature;
        }
        function input(frame, token, action, phase) {
            var control, event, dialog;
            if (!owns(frame, token) || !session.control) { return; }
            dialog = session.dialog;
            // Ignore input while the dialog assets load; Back still closes it.
            if (dialog && !dialog.template) { return; }
            control = dialog ? dialog.template : session.control;
            function dispatch(controllerEvent) {
                var button = backButton(), response;
                if (dialog) {
                    return control.handleControllerEvent(controllerEvent);
                }
                if (button && button.btnInstance.hasFocus) {
                    response = button.handleControllerEvent(controllerEvent);
                    if (response === 'giveFocusRight') {
                        response = control.handleControllerEvent('acceptFocusFromLeft');
                        if (response === 'consumed') {
                            button.handleControllerEvent('lostFocus');
                        }
                    }
                    return response;
                }
                response = control.handleControllerEvent(controllerEvent);
                if (response === 'giveFocusLeft' && button) {
                    button.handleControllerEvent('acceptFocusFromRight');
                    control.handleControllerEvent('lostFocus');
                }
                return response;
            }
            if (action === 'rotateRight' || action === 'rotateLeft') {
                if (phase === 'release') { return; }
                event = action === 'rotateRight' ? 'cw' : 'ccw';
            } else {
                if (['up', 'down', 'left', 'right', 'select'].indexOf(action) < 0) { return; }
                if (phase === 'step') {
                    dispatch(action + 'Start');
                    event = action;
                } else {
                    event = phase === 'press' ? action + 'Start' : action;
                }
            }
            dispatch(event);
            if (dialog || !session) { return; }
            send('aa-native-focus', {index: control.getContextCapture().focussedItem});
        }
        return {
            render: render,
            input: input,
            dialog: showDialog,
            close: close,
            owns: function (source, token) {
                return !!session && session.source === source && session.token === token;
            },
            check: function () {
                if (session && (!document.documentElement.contains(session.frame) || !applications(global.framework))) {
                    close(false);
                }
            }
        };
    }

    global.MzdGuiResidents.register('android-auto', function (context) {
        'use strict';
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
        var cachedSettings = null, rebootRequired = false;
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
        function showSbn(text, isError) {
            var fw = global.framework;
            if (!fw || !fw.common || typeof fw.common.startTimedSbn !== 'function') { return; }
            try {
                fw.common.startTimedSbn('androidauto', 'AASettingsNotification', isError ? 'errorNotification' : 'typeD', {
                    sbnStyle: 'Style02',
                    imagePath1: 'common/images/icons/IcnSbnApps.png',
                    text1: text
                });
            } catch (error) {
                note('Notification failed: ' + (error.message || error));
            }
        }

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
            if (!saving() && rebootRequired && !saveFailed) { showSbn(texts.reboot, false); }
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

        var nativeMenu = create({
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
                    rebootRequired = result.rebootRequired === true;
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
                    showSbn(texts.saveError, true);
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
                    rebootRequired = result.rebootRequired === true;
                }
                broadcastState('');
                if (queue.length > 0) {
                    drainQueue();
                } else if (!viewOpen && rebootRequired && !saveFailed) {
                    showSbn(texts.reboot, false);
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
                    note('Reboot failed: ' + error);
                    showSbn(texts.rebootFallback, false);
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
