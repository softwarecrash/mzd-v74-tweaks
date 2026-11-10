/* Optional cooperative resident lifecycle. No module, settings or game special cases. */
(function (global) {
    'use strict';
    if (global.MzdGuiResidents) { return; }
    var records = {}, ended = false;
    var DIALOG_ASSETS = [
        {css: '/jci/gui/common/controls/Dialog3/css/Dialog3Ctrl.css'},
        {css: '/jci/gui/common/controls/Button/css/ButtonCtrl.css'},
        {js: '/jci/gui/common/controls/Button/js/ButtonCtrl.js', method: 'registerCtrlLoaded', registry: '_controlsLoaded', name: 'ButtonCtrl', key: 'common/controls/Button'},
        {js: '/jci/gui/common/controls/Dialog3/js/Dialog3Ctrl.js', method: 'registerCtrlLoaded', registry: '_controlsLoaded', name: 'Dialog3Ctrl', key: 'common/controls/Dialog3'},
        {js: '/jci/gui/common/templates/Dialog3/js/Dialog3Tmplt.js', method: 'registerTmpltLoaded', registry: '_templatesLoaded', name: 'Dialog3Tmplt'}
    ];
    var dialogAssetsReady = false, dialogAssetCallbacks = null;

    function log(id, message) {
        try {
            if (global.log && typeof global.log.info === 'function') {
                global.log.info('[mzd-gui resident ' + id + '] ' + message);
            }
        } catch (ignore) {}
    }
    function stop(id) {
        var record = records['$' + id], handlers, i;
        if (!record || record.stopped) { return; }
        record.stopped = true; global.clearTimeout(record.timeout);
        if (record.script && record.script.parentNode) { record.script.parentNode.removeChild(record.script); }
        record.view = null; record.message = null; record.closed = null; record.serviceRequest = null;
        handlers = record.cleanup; record.cleanup = [];
        for (i = handlers.length - 1; i >= 0; i -= 1) { try { handlers[i](); } catch (error) { log(id, error); } }
    }
    function fail(id, error) { log(id, error); stop(id); }
    function inApplications() {
        var fw = global.framework;
        return !!fw && typeof fw.getCurrentApp === 'function' && typeof fw.getCurrCtxtId === 'function' && fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications';
    }
    function ensureSbnStyle(isLong) {
        var head = document.getElementsByTagName('head')[0];
        if (!head) { return; }
        var style = document.getElementById('mzd-gui-sbn-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'mzd-gui-sbn-style';
            head.appendChild(style);
        }
        style.textContent = isLong ? '.SbnCtrl_Style02_Text1 { font-size: 26px !important; }' : '';
    }
    function showNotification(id, text, isError) {
        var fw = global.framework;
        if (!fw || !fw.common || typeof fw.common.startTimedSbn !== 'function' || !text) { return false; }
        var str = String(text || '');
        ensureSbnStyle(str.length > 35);
        try {
            fw.common.startTimedSbn(id || 'system', 'MzdGuiNotification', isError ? 'errorNotification' : 'typeD', {
                sbnStyle: 'Style02',
                imagePath1: 'common/images/icons/IcnSbnApps.png',
                text1: str
            });
            return true;
        } catch (error) {
            log(id, 'Notification failed: ' + (error.message || error));
            return false;
        }
    }
    function getUnits(id) {
        var fw = global.framework, localize = fw && fw.localize, dist = null, temp = null, lang = 'en_US';
        try { if (localize && typeof localize.getDistanceUnit === 'function') { dist = localize.getDistanceUnit(); } } catch (e) {}
        try { if (localize && typeof localize.getTemperatureUnit === 'function') { temp = localize.getTemperatureUnit(); } } catch (e) {}
        if (global.MzdGuiI18n && id) {
            try { lang = global.MzdGuiI18n.snapshot(id).language; } catch (e) {}
        } else if (localize && typeof localize.getCurrentLanguage === 'function') {
            try { lang = localize.getCurrentLanguage(); } catch (e) {}
        }
        return {
            speedUnit: dist === 'Miles' ? 'mph' : (dist === 'Kilometers' ? 'kmh' : null),
            distanceUnit: dist === 'Miles' ? 'mi' : (dist === 'Kilometers' ? 'km' : null),
            tempUnit: temp === 'Fahrenheit' ? 'F' : (temp === 'Celsius' ? 'C' : null),
            language: lang || 'en_US'
        };
    }
    function backButton() {
        var common = global.framework && global.framework.common;
        return common && common.leftBtn && common.leftBtn.btnInstance ? common.leftBtn : null;
    }
    function releaseBackButton() {
        var button = backButton();
        if (button && button.btnInstance.hasFocus) { button.handleControllerEvent('lostFocus'); }
    }
    function dispatchControllerEvent(control, event) {
        var button = backButton(), response;
        if (button && button.btnInstance.hasFocus) {
            response = button.handleControllerEvent(event);
            if (response === 'giveFocusRight' && control && control.handleControllerEvent('acceptFocusFromLeft') === 'consumed') {
                button.handleControllerEvent('lostFocus');
            }
            return response;
        }
        if (!control || typeof control.handleControllerEvent !== 'function') { return 'ignored'; }
        response = control.handleControllerEvent(event);
        if (response === 'giveFocusLeft' && button) {
            button.handleControllerEvent('acceptFocusFromRight');
            control.handleControllerEvent('lostFocus');
        }
        return response;
    }
    function returnToApplications() {
        var fw = global.framework, app, template;
        if (!inApplications()) { return; }
        releaseBackButton();
        app = fw.getAppInstance('system');
        template = app && app._currentContextTemplate;
        if (template && typeof template.handleControllerEvent === 'function') {
            template.handleControllerEvent('acceptFocusFromLeft');
        }
        if (template && template.list2Ctrl && (!template.divElt || template.divElt.style.visibility !== 'hidden')) {
            template.list2Ctrl.setLineNumbers();
        }
        if (fw.common && typeof fw.common.setSbNameId === 'function') {
            fw.common.setSbNameId('system', 'Applications');
        }
    }

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

    function createNativeMenu(options) {
        options = options || {};
        var prefix = options.prefix || 'mzd', id = options.id || prefix;
        var session = null, selection = null, shown = false;

        function owns(target, token) {
            return !!session && (session.frame === target || session.source === target) && session.token === token;
        }
        function send(type, value) {
            if (!session) { return; }
            var message = (typeof value === 'object' && value !== null && !Array.isArray(value)) ? value : { value: value };
            message.type = type;
            message.token = session.token;
            session.frame.contentWindow.postMessage(message, '*');
        }
        function focusList() {
            releaseBackButton();
            if (session && session.control) {
                session.control.handleControllerEvent('acceptFocusInit');
            }
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
                try { dialog.template.cleanUp(); } catch (error) { log(id, 'Dialog cleanup failed: ' + (error.message || error)); }
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
            var hasLabelId = button && typeof button.labelId === 'string' && button.labelId.length > 0;
            var labelText = button ? (typeof button.label === 'string' ? button.label : (typeof button.text1 === 'string' ? button.text1 : '')) : '';
            if (!button || typeof button.value !== 'string' || (!hasLabelId && !labelText)) {
                throw new Error('Invalid confirmation dialog.');
            }
            var config = {
                appData: button.value,
                labelId: hasLabelId ? button.labelId : null
            };
            if (labelText) {
                config.label = labelText;
                config.text1 = labelText;
            }
            return config;
        }
        function showDialog(frame, token, spec) {
            var fw = global.framework, buttons = {}, dialog, i;
            if (!owns(frame, token)) { return; }
            if (!options.dialog) {
                throw new Error('Confirmation dialog not enabled for this module.');
            }
            if (!spec) {
                destroyDialog(true);
                return;
            }
            if (typeof spec.text !== 'string' || !spec.buttons || spec.buttons.length < 1 || spec.buttons.length > 3) {
                throw new Error('Invalid confirmation dialog.');
            }
            for (i = 0; i < spec.buttons.length; i += 1) {
                buttons['button' + (i + 1)] = dialogButton(spec.buttons[i]);
            }
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
                                contentStyle: spec.contentStyle || 'style02',
                                fullScreen: true,
                                initialFocus: (typeof spec.initialFocus === 'number' && spec.initialFocus >= 0 && spec.initialFocus < spec.buttons.length) ? spec.initialFocus : 0,
                                buttonCount: spec.buttons.length,
                                text1: spec.text,
                                buttonConfig: buttons,
                                defaultSelectCallback: function (source, value) {
                                    if (session && session.dialog === dialog) {
                                        send(prefix + '-native-dialog-select', { value: value });
                                    }
                                }
                            }
                        });
                        if (!dialog.template || !dialog.template.dialog3Ctrl) {
                            error = 'Mazda confirmation dialog could not be created.';
                        }
                    } catch (failure) {
                        error = String(failure.message || failure);
                    }
                }
                if (error) {
                    destroyDialog(true);
                    send(prefix + '-native-error', { scope: 'dialog', message: error });
                }
            });
        }
        function close(leaving) {
            var old = session, fw = global.framework;
            if (old) {
                global.clearTimeout(selection);
                selection = null;
                destroyDialog(false);
                destroyList();
                if (options.preview) {
                    try { options.preview(null, null); } catch (ignore) {}
                }
                session = null;
                if (typeof options.onClose === 'function') {
                    try { options.onClose(old); } catch (ignore) {}
                }
                if (fw && fw.sendEventToMmui === old.backWrapper) {
                    fw.sendEventToMmui = old.originalSend;
                }
                if (old.container.parentNode) {
                    old.container.parentNode.removeChild(old.container);
                }
                if (old.previewPane && old.previewPane.parentNode) {
                    old.previewPane.parentNode.removeChild(old.previewPane);
                }
                old.frame.style.display = old.display;
                old.root.style.cssText = old.css;
                old.root.className = old.className;
            }
            var shouldLeave = typeof leaving === 'boolean' ? leaving : true;
            if (shouldLeave) {
                if (shown) {
                    shown = false;
                    returnToApplications();
                }
            }
        }
        function attach(frame, token) {
            var fw = global.framework, root = frame.parentNode, container, originalSend, style;
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
                dialog: null,
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
            if (options.split) {
                style = document.createElement('style');
                style.textContent = '.wallpaperImportSplit .List2Ctrl{width:390px!important;overflow:hidden}.wallpaperImportSplit .List2Ctrl .line1{max-width:300px!important;overflow:hidden;text-overflow:ellipsis}.wallpaperImportSplit .List2Ctrl .mask,.wallpaperImportSplit .List2Ctrl .scroller{max-width:390px!important}';
                container.appendChild(style);
                session.splitStyle = style;
            }
            if (options.dialog) {
                ensureDialogAssets(function (error) {
                    if (error) { log(id, 'Dialog preload failed: ' + error); }
                });
            }
            originalSend = session.originalSend;
            session.backWrapper = function (uia, event) {
                if (session && event === 'Global.GoBack' && inApplications()) {
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
            var fw = global.framework, items = [], i, row, captured, signature, current, oldPage, preview, picture, caption;
            if (!menu || typeof menu.title !== 'string' || !menu.rows || menu.rows.length > 202) {
                throw new Error('Invalid native menu.');
            }
            attach(frame, token);
            shown = true;
            if (typeof options.onOpen === 'function') {
                try { options.onOpen(session); } catch (ignore) {}
            }
            current = session;
            if (fw.common && typeof fw.common.setSbName === 'function') {
                fw.common.setSbName(menu.title.replace(/[.]png/gi, ''));
            }
            if (options.preview) {
                try { options.preview(menu.previewId || null, frame); } catch (ignore) {}
            }
            if (menu.split) {
                session.container.className = 'TemplateWithStatusLeft List2Tmplt wallpaperImportSplit';
                if (!session.previewPane) {
                    session.previewPane = document.createElement('div');
                    session.previewPane.style.cssText = 'position:absolute;left:408px;top:65px;width:300px;color:white;font-size:22px;white-space:normal;word-wrap:break-word;';
                    session.root.appendChild(session.previewPane);
                }
                session.previewPane.style.display = 'block';
                session.previewPane.innerHTML = '';
                if (menu.rightPreview) {
                    preview = menu.rightPreview;
                    if (preview.url && typeof preview.url === 'string' && /^(?:http:\/\/(?:localhost:8091\/usb-image\/|127\.0\.0\.1:[0-9]+\/image\/wallpaper-manager\/usb\/)|data:image\/png;base64,[A-Za-z0-9+/=]+$)/.test(preview.url)) {
                        picture = document.createElement('img');
                        picture.src = preview.url;
                        picture.style.cssText = 'width:300px;height:180px;object-fit:contain;';
                        session.previewPane.appendChild(picture);
                    }
                    caption = document.createElement('div');
                    caption.textContent = preview.error || preview.label || '';
                    session.previewPane.appendChild(caption);
                }
            } else if (session.previewPane) {
                session.previewPane.style.display = 'none';
            }
            for (i = 0; i < menu.rows.length; i += 1) {
                row = menu.rows[i];
                items.push({
                    appData: { itemIndex: i, aaIndex: i, wallpaperIndex: i },
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
                if (session.splitStyle) {
                    session.container.appendChild(session.splitStyle);
                }
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
                                var idx = data.itemIndex != null ? data.itemIndex : (data.aaIndex != null ? data.aaIndex : data.wallpaperIndex);
                                send(prefix + '-native-select', { index: idx });
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
            if (dialog && !dialog.template) { return; }
            control = dialog ? dialog.template : session.control;
            if (action === 'rotateRight' || action === 'rotateLeft') {
                if (phase === 'release') { return; }
                event = action === 'rotateRight' ? 'cw' : 'ccw';
            } else {
                if (['up', 'down', 'left', 'right', 'select'].indexOf(action) < 0) { return; }
                if (phase === 'step') {
                    if (dialog) {
                        control.handleControllerEvent(action + 'Start');
                    } else {
                        dispatchControllerEvent(control, action + 'Start');
                    }
                    event = action;
                } else {
                    event = phase === 'press' ? action + 'Start' : action;
                }
            }
            if (dialog) {
                control.handleControllerEvent(event);
                return;
            }
            dispatchControllerEvent(control, event);
            if (!session) { return; }
            send(prefix + '-native-focus', { index: control.getContextCapture().focussedItem });
        }
        return {
            render: render,
            input: input,
            dialog: showDialog,
            close: close,
            owns: owns,
            check: function () {
                if (session && (!document.documentElement.contains(session.frame) || !inApplications())) {
                    close(false);
                }
            },
            getSession: function () { return session; },
            focusList: focusList,
            send: send
        };
    }

    function register(id, factory) {
        var record = records['$' + id], context;
        if (ended || !record || record.stopped || record.registered || typeof factory !== 'function') { return false; }
        record.registered = true; global.clearTimeout(record.timeout);
        context = {
            id: id,
            log: function (message) { log(id, message); },
            units: function () { return getUnits(id); },
            language: function () { return global.MzdGuiI18n ? global.MzdGuiI18n.snapshot(id).language : 'en_US'; },
            t: function (key, fallback, values) { return global.MzdGuiI18n ? global.MzdGuiI18n.text(id, key, fallback, values) : String(fallback || key); },
            loadLanguage: function (fn) {
                if (global.MzdGuiI18n && typeof fn === 'function') { record.cleanup.push(global.MzdGuiI18n.load(id, fn)); }
            },
            onDispose: function (fn) { if (typeof fn === 'function' && !record.stopped) { record.cleanup.push(fn); } },
            service: {
                request: function (operation, args, callback) {
                    if (record.stopped || !record.entry.service || !global.MzdGuiServices) { callback('Module service is unavailable.'); return; }
                    global.MzdGuiServices.request(id, operation, args, function (error, result) {
                        if (!record.stopped) { try { callback(error, result); } catch (failure) { fail(id, failure); } }
                    });
                }
            },
            onServiceReady: function (fn) {
                if (typeof fn === 'function' && global.MzdGuiServices && global.MzdGuiServices.onReady) {
                    record.cleanup.push(global.MzdGuiServices.onReady(function () { if (!record.stopped) { try { fn(); } catch (error) { fail(id, error); } } }));
                }
            },
            view: function () { return record.view; },
            onMessage: function (fn) { record.message = typeof fn === 'function' ? fn : null; },
            onServiceRequest: function (fn) { record.serviceRequest = typeof fn === 'function' ? fn : null; },
            notify: function (text, isError) { return showNotification(id, text, isError); },
            onViewClose: function (fn) { record.closed = typeof fn === 'function' ? fn : null; },
            inApplications: inApplications,
            returnToApplications: returnToApplications,
            createNativeMenu: function (opts) {
                opts = opts || {};
                opts.id = opts.id || id;
                return createNativeMenu(opts);
            }
        };
        try { factory(context); } catch (error) { fail(id, error); return false; }
        return true;
    }
    function start(entries) {
        var i, entry, record, script;
        if (ended) { return; }
        for (i = 0; i < entries.length; i += 1) {
            entry = entries[i];
            if (!entry.resident || records['$' + entry.id]) { continue; }
            if (typeof entry.resident !== 'string' || !/^\/data\/integration\/mzd-gui-modules\/[a-z0-9-]+\/assets\/[A-Za-z0-9_.\/-]+\.js$/.test(entry.resident) ||
                entry.resident.indexOf('/data/integration/mzd-gui-modules/' + entry.id + '/assets/') !== 0 || /(^|\/)\.\.?($|\/)/.test(entry.resident)) { log(entry.id, 'Invalid resident path.'); continue; }
            record = {entry: entry, registered: false, stopped: false, cleanup: [], view: null, message: null, closed: null, serviceRequest: null};
            records['$' + entry.id] = record;
            script = document.createElement('script'); record.script = script;
            script.type = 'text/javascript'; script.async = true; script.src = entry.resident;
            (function (id, target) {
                target.onerror = function (event) { if (event && event.preventDefault) { event.preventDefault(); } fail(id, 'Resident could not be loaded.'); return true; };
                record.timeout = global.setTimeout(function () { fail(id, 'Resident registration timed out.'); }, 8000);
            }(entry.id, script));
            (document.head || document.documentElement).appendChild(script);
        }
    }
    function view(id, value) {
        var record = records['$' + id];
        if (!record || record.stopped) { return; }
        record.view = value;
        if (!value && record.closed) { try { record.closed(); } catch (error) { fail(id, error); } }
    }
    function message(id, event) {
        var record = records['$' + id], current, data;
        if (!record || record.stopped) { return; }
        current = record.view;
        if (!current || event.source !== current.source || !event.data || event.data.token !== current.token) { return; }
        data = event.data;
        if (data.type === 'mzd-gui-service-request' && typeof data.id === 'number' && typeof data.operation === 'string') {
            if (record.serviceRequest) {
                try {
                    record.serviceRequest(data.operation, data.args, function (error, result) {
                        if (!record.stopped && record.view === current) {
                            try {
                                current.source.postMessage({
                                    type: 'mzd-gui-service-result',
                                    token: current.token,
                                    id: data.id,
                                    error: error || null,
                                    result: result !== undefined ? result : null
                                }, '*');
                            } catch (ignore) {}
                        }
                    });
                } catch (failure) {
                    try {
                        current.source.postMessage({
                            type: 'mzd-gui-service-result',
                            token: current.token,
                            id: data.id,
                            error: String(failure.message || failure)
                        }, '*');
                    } catch (ignore) {}
                }
                return;
            }
            if (!record.entry.service || !global.MzdGuiServices) {
                try { current.source.postMessage({ type: 'mzd-gui-service-result', token: current.token, id: data.id, error: 'Module service is unavailable.' }, '*'); } catch (ignore) {}
                return;
            }
            global.MzdGuiServices.request(id, data.operation, data.args, function (error, result) {
                if (!record.stopped && record.view === current) {
                    try {
                        current.source.postMessage({
                            type: 'mzd-gui-service-result',
                            token: current.token,
                            id: data.id,
                            error: error || null,
                            result: result !== undefined ? result : null
                        }, '*');
                    } catch (ignore) {}
                }
            });
            return;
        }
        if (data.type === 'mzd-gui-notify') { return; }
        if (!record.message) { return; }
        try { record.message(event); } catch (error) { fail(id, error); }
    }
    function dispose() { var key; if (ended) { return; } ended = true; for (key in records) { if (records.hasOwnProperty(key)) { stop(records[key].entry.id); } } }
    global.MzdGuiResidents = {
        start: start,
        register: register,
        view: view,
        message: message,
        stop: stop,
        dispose: dispose,
        log: log,
        notify: showNotification,
        units: getUnits,
        inApplications: inApplications,
        backButton: backButton,
        releaseBackButton: releaseBackButton,
        dispatchControllerEvent: dispatchControllerEvent,
        returnToApplications: returnToApplications,
        createNativeMenu: createNativeMenu
    };
    global.addEventListener('unload', dispose, false);
}(window));
