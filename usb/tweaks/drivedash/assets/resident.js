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
        function backButton() {
            var common = global.framework && global.framework.common;
            return common && common.leftBtn && common.leftBtn.btnInstance ? common.leftBtn : null;
        }
        function releaseBackButton() {
            var button = backButton();
            if (button && button.btnInstance.hasFocus) { button.handleControllerEvent('lostFocus'); }
        }
        function dispatch(control, event) {
            var button = backButton(), response;
            if (button && button.btnInstance.hasFocus) {
                response = button.handleControllerEvent(event);
                if (response === 'giveFocusRight' && control.handleControllerEvent('acceptFocusFromLeft') === 'consumed') {
                    button.handleControllerEvent('lostFocus');
                }
                return response;
            }
            response = control.handleControllerEvent(event);
            if (response === 'giveFocusLeft' && button) {
                button.handleControllerEvent('acceptFocusFromRight');
                control.handleControllerEvent('lostFocus');
            }
            return response;
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
                releaseBackButton();
                app = fw.getAppInstance('system');
                if (app._currentContextTemplate && typeof app._currentContextTemplate.handleControllerEvent === 'function') { app._currentContextTemplate.handleControllerEvent('acceptFocusFromLeft'); }
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
                    appData: { drivedashIndex: i },
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
                                send('drivedash-native-select', data.drivedashIndex);
                            }
                        }, 0);
                    }
                });
                releaseBackButton();
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
                    dispatch(control,action + 'Start');
                    event = action;
                } else {
                    event = phase === 'press' ? action + 'Start' : action;
                }
            }
            dispatch(control,event);
            capture = control.getContextCapture();
            send('drivedash-native-focus', capture.focussedItem);
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

    global.MzdGuiResidents.register('drivedash',function (context) {
        var menu = create(), sampling = false;
        context.onMessage(function (event) {
            var value = event.data, current = context.view(), frame = null, frames, i;
            if (!value) { return; }
            if (value.type === 'drivedash-native-release' && menu.owns(event.source,value.token)) { menu.close(); return; }
            if (!current || current.source !== event.source || current.token !== value.token) { return; }
            if (value.type === 'drivedash-system-settings') {
                var localize = global.framework && global.framework.localize, settings = {}, distance, temperature, fields = value.fields || {};
                try { if (fields.language === true) { settings.language = context.language(); } } catch (ignoreLanguage) {}
                try { if (fields.speedUnit === true) { distance = localize && localize.getDistanceUnit(); } } catch (ignoreDistance) {}
                try { if (fields.tempUnit === true) { temperature = localize && localize.getTemperatureUnit(); } } catch (ignoreTemperature) {}
                if (distance === 'Miles' || distance === 'Kilometers') { settings.speedUnit = distance === 'Miles' ? 'mph' : 'kmh'; }
                if (temperature === 'Fahrenheit' || temperature === 'Celsius') { settings.tempUnit = temperature === 'Fahrenheit' ? 'F' : 'C'; }
                current.source.postMessage({type:'drivedash-system-settings-result',token:current.token,settings:settings},'*');
                return;
            }
            if (value.type === 'drivedash-preferences' && typeof value.id === 'number') {
                context.service.request('preferences',value.values ? {values:value.values} : {},function (error,result) {
                    if (context.view() !== current) { return; }
                    current.source.postMessage({type:'drivedash-preferences-result',token:current.token,id:value.id,error:error || '',result:result},'*');
                });
                return;
            }
            if (value.type === 'drivedash-sample' && typeof value.id === 'number') {
                if (sampling) { current.source.postMessage({type:'drivedash-sample-result',token:current.token,id:value.id,error:'Data reader is busy.'},'*'); return; }
                sampling = true;
                context.service.request('sample',{},function (error,result) {
                    sampling = false;
                    if (context.view() !== current) { return; }
                    current.source.postMessage({type:'drivedash-sample-result',token:current.token,id:value.id,error:error || '',result:result},'*');
                });
                return;
            }
            frames = document.getElementsByTagName('iframe');
            for (i = 0; i < frames.length; i += 1) { if (frames[i].contentWindow === event.source) { frame = frames[i]; break; } }
            if (!frame) { return; }
            try {
                if (value.type === 'drivedash-native-render') { menu.render(frame,value.token,value.menu); }
                else if (value.type === 'drivedash-native-input') { menu.input(frame,value.token,value.action,value.phase); }
            } catch (failure) {
                menu.close();
                event.source.postMessage({type:'drivedash-native-error',token:value.token},'*');
            }
        });
        context.onViewClose(function () { menu.close(); });
        context.onDispose(function () { menu.close(); });
    });
}(window));
