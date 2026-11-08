/* Local prototype adapter using the same OEM List2 factory as Applications. */
(function (global) {
    'use strict';
    function create(options) {
        options = options || {};
        var session = null, selection = null;
        function send(type, value) {
            if (session) {
                session.frame.contentWindow.postMessage({
                    type: type,
                    token: session.token,
                    index: value
                }, '*');
            }
        }
        function destroyList() {
            if (session && session.control) {
                try { global.framework.destroyControl(session.control); } catch (ignore) {}
                session.control = null;
            }
        }
        function close() {
            var old = session, fw = global.framework, app;
            if (!old) { return; }
            global.clearTimeout(selection);
            selection = null;
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
            if (fw && typeof fw.getCurrentApp === 'function' && fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') {
                app = fw.getAppInstance('system');
                if (!app._currentContextTemplate || !app._currentContextTemplate.divElt || app._currentContextTemplate.divElt.style.visibility !== 'hidden') {
                    if (app._currentContextTemplate && app._currentContextTemplate.list2Ctrl) {
                        app._currentContextTemplate.list2Ctrl.setLineNumbers();
                    }
                    if (fw.common && fw.common.setSbNameId) {
                        fw.common.setSbNameId('system', 'Applications');
                    }
                }
            }
        }
        function attach(frame, token) {
            var fw = global.framework, root = frame.parentNode, container, originalSend;
            if (session && session.frame === frame && session.token === token) { return; }
            close();
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
                css: root.style.cssText,
                className: root.className,
                display: frame.style.display,
                originalSend: fw.sendEventToMmui
            };
            frame.style.display = 'none';
            root.style.cssText = 'position:absolute;left:60px;top:64px;width:740px;height:416px;z-index:7;background:transparent;overflow:visible;';
            root.className = '';
            root.appendChild(container);
            originalSend = session.originalSend;
            session.backWrapper = function (uia, event) {
                if (session && event === 'Global.GoBack' && fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') {
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
                    image1: row.checkable ? (row.radio ? 'radio' : 'tick') : '',
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
                                send('aa-native-select', data.aaIndex);
                            }
                        }, 0);
                    }
                });
                session.control.handleControllerEvent('acceptFocusInit');
            }
            session.page = menu.page;
            session.signature = signature;
        }
        function input(frame, token, action, phase) {
            var control, event, capture;
            if (!session || session.frame !== frame || session.token !== token || !session.control) { return; }
            control = session.control;
            if (action === 'rotateRight' || action === 'rotateLeft') {
                if (phase === 'release') { return; }
                event = action === 'rotateRight' ? 'cw' : 'ccw';
            } else {
                if (['up', 'down', 'left', 'right', 'select'].indexOf(action) < 0) { return; }
                if (phase === 'step') {
                    control.handleControllerEvent(action + 'Start');
                    event = action;
                } else {
                    event = phase === 'press' ? action + 'Start' : action;
                }
            }
            control.handleControllerEvent(event);
            capture = control.getContextCapture();
            send('aa-native-focus', capture.focussedItem);
        }
        return {
            render: render,
            input: input,
            close: close,
            owns: function (source, token) {
                return session && session.source === source && session.token === token;
            },
            check: function () {
                if (session && (!document.documentElement.contains(session.frame) || !global.framework || typeof global.framework.getCurrentApp !== 'function' || global.framework.getCurrentApp() !== 'system' || global.framework.getCurrCtxtId() !== 'Applications')) {
                    close();
                }
            }
        };
    }

    global.MzdGuiResidents.register('android-auto', function (context) {
        'use strict';
        var refreshTimer = null;
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
            onOpen: startPolling,
            onClose: stopPolling
        });
        var hostEnded = false;
        var cachedSettings = null, cachedLoaded = false;
        var queue = [], inFlight = false, syncing = false;
        var syncCallbacks = [];
        var lastSavedMessage = '', lastErrorMessage = '';

        function showSbn(text, isError) {
            var fw = global.framework;
            if (fw && fw.common && typeof fw.common.startTimedSbn === 'function') {
                try {
                    fw.common.startTimedSbn('androidauto', 'AASettingsNotification', isError ? 'errorNotification' : 'typeD', {
                        sbnStyle: 'Style02',
                        imagePath1: 'common/images/icons/IcnSbnApps.png',
                        text1: text
                    });
                } catch (ignore) {}
            }
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
                        error: error || ''
                    }, '*');
                } catch (ignore) {}
            }
        }

        function syncFromService(cb) {
            if (cb) { syncCallbacks.push(cb); }
            if (syncing) { return; }
            syncing = true;
            context.service.request('get', {}, function (error, result) {
                var cbs, i;
                syncing = false;
                if (!error && result && result.settings) {
                    cachedSettings = result.settings;
                    cachedLoaded = true;
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

        function hasQueuedKey(key) {
            var i;
            for (i = 0; i < queue.length; i += 1) {
                if (queue[i].key === key) { return true; }
            }
            return false;
        }

        function drainQueue() {
            if (hostEnded || inFlight || queue.length === 0) { return; }
            var next = queue.shift();
            inFlight = true;
            context.service.request('set', { key: next.key, value: next.value }, function (error, result) {
                inFlight = false;
                if (error) {
                    queue = [];
                    if (lastSavedMessage || lastErrorMessage) {
                        showSbn(lastErrorMessage || 'Failed to save Android Auto settings', true);
                        lastSavedMessage = '';
                        lastErrorMessage = '';
                    }
                    syncFromService(function () {
                        broadcastState(error);
                    });
                    return;
                }
                if (result && result.settings) {
                    for (var k in result.settings) {
                        if (Object.prototype.hasOwnProperty.call(result.settings, k)) {
                            if (!hasQueuedKey(k)) {
                                cachedSettings[k] = result.settings[k];
                            }
                        }
                    }
                }
                broadcastState('');
                if (queue.length > 0) {
                    drainQueue();
                } else {
                    if (lastSavedMessage) {
                        showSbn(lastSavedMessage, false);
                        lastSavedMessage = '';
                        lastErrorMessage = '';
                    }
                }
            });
        }

        function receive(event) {
            var data = event.data, token = frameToken(event.source), frames, frame, i;
            if (data && data.type === 'aa-native-release') {
                if ((token && data.token === token) || (nativeMenu && nativeMenu.owns(event.source, data.token))) {
                    nativeMenu.close();
                    if (inFlight || queue.length > 0) {
                        lastSavedMessage = data.savedMessage || 'Android Auto settings saved.';
                        lastErrorMessage = data.errorMessage || 'Failed to save Android Auto settings';
                        if (data.savingMessage) {
                            showSbn(data.savingMessage, false);
                        }
                    }
                }
                return;
            }
            if (!token || !data || data.token !== token) { return; }
            if (data.type === 'aa-native-render' || data.type === 'aa-native-input') {
                frames = document.getElementsByTagName('iframe');
                for (i = 0; i < frames.length; i += 1) {
                    if (frames[i].contentWindow === event.source) { frame = frames[i]; }
                }
                if (!frame) { return; }
                try {
                    if (data.type === 'aa-native-render') {
                        nativeMenu.render(frame, token, data.menu);
                    } else {
                        nativeMenu.input(frame, token, data.action, data.phase);
                    }
                } catch (failure) {
                    nativeMenu.close();
                    event.source.postMessage({
                        type: 'aa-native-error',
                        token: token,
                        message: String(failure.message || failure)
                    }, '*');
                }
                return;
            }
            if (data.type === 'aa-request') {
                if (data.action === 'get') {
                    if (cachedLoaded && cachedSettings) {
                        broadcastState('');
                    } else {
                        syncFromService();
                    }
                    return;
                }
                if (data.action === 'set' && data.payload && data.payload.key) {
                    if (!cachedSettings) { cachedSettings = {}; }
                    cachedSettings[data.payload.key] = data.payload.value;
                    var found = false;
                    for (i = 0; i < queue.length; i += 1) {
                        if (queue[i].key === data.payload.key) {
                            queue[i].value = data.payload.value;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        queue.push({ key: data.payload.key, value: data.payload.value });
                    }
                    drainQueue();
                }
            }
        }
        context.onMessage(receive);
        context.onViewClose(function () {
            nativeMenu.close();
            stopPolling();
        });
        context.onDispose(function () {
            hostEnded = true;
            nativeMenu.close();
            stopPolling();
        });
        context.onServiceReady(function () {
            if (cachedLoaded) {
                syncFromService();
            }
        });
    });
}(window));
