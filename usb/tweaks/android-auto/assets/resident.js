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
            if (fw.sendEventToMmui === old.backWrapper) {
                fw.sendEventToMmui = old.originalSend;
            }
            if (old.container.parentNode) {
                old.container.parentNode.removeChild(old.container);
            }
            old.frame.style.display = old.display;
            old.root.style.cssText = old.css;
            old.root.className = old.className;
            if (fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') {
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
                if (session && (!document.documentElement.contains(session.frame) || global.framework.getCurrentApp() !== 'system' || global.framework.getCurrCtxtId() !== 'Applications')) {
                    close();
                }
            }
        };
    }
    global.AaNativeMenu = {create: create};
}(window));

window.MzdGuiResidents.register('android-auto', function (context) {
    'use strict';
    var nativeMenu = window.AaNativeMenu.create(), hostEnded = false;
    function frameToken(source) {
        var current = context.view();
        return current && current.source === source ? current.token : '';
    }
    function reply(event, token, id, settings, error) {
        if (hostEnded) { return; }
        try {
            event.source.postMessage({
                type: 'aa-response',
                token: token,
                id: id,
                state: settings,
                error: error || ''
            }, '*');
        } catch (ignore) {}
    }
    function receive(event) {
        var data = event.data, token = frameToken(event.source), frames, frame, i;
        if (data && data.type === 'aa-native-release' && nativeMenu.owns(event.source, data.token)) {
            nativeMenu.close();
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
        if (data.type === 'aa-request' && typeof data.id === 'number') {
            context.service.request(data.action, data.payload || {}, function (error, result) {
                reply(event, token, data.id, result ? result.settings : null, error);
            });
        }
    }
    var refresh = window.setInterval(function () {
        nativeMenu.check();
    }, 500);
    context.onMessage(receive);
    context.onViewClose(function () {
        nativeMenu.close();
    });
    context.onDispose(function () {
        hostEnded = true;
        nativeMenu.close();
        window.clearInterval(refresh);
    });
    context.onServiceReady(function () {
        context.service.request('get', {}, function (error, result) {
            var current = context.view();
            if (current && result && result.settings) {
                try {
                    current.source.postMessage({
                        type: 'aa-response',
                        token: current.token,
                        id: 0,
                        state: result.settings,
                        error: error || ''
                    }, '*');
                } catch (ignore) {}
            }
        });
    });
});
