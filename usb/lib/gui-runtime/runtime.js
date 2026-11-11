/* Shared API 1 Applications adapter. Consumer views load only on selection. */
(function () {
    'use strict';
    if (window.MzdGuiRuntime) { return; }
    var modules = [], groups = [], rows = [], names = [], fw, proto, originalInit, originalStructure, originalSend;
    var initWrapper, structureWrapper, sendWrapper, active = null, installed = false, attempts = 0, timer, languageCleanups = [];
    var prefix = 'MzdGui.Open.';
    function log(message) { try { if (window.log && window.log.info) { window.log.info('[mzd-gui] ' + message); } } catch (ignore) {} }
    function applications() { return fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications'; }
    function label(item) {
        var i, depth;
        if (!window.MzdGuiI18n) { return item.label; }
        if (item.kind === 'module') { return window.MzdGuiI18n.text(item.id,'gui.label',item.label); }
        depth = item.path.split('/').length - 1;
        for (i = 0; i < modules.length; i += 1) {
            if (modules[i].translations && (modules[i].menuPath === item.path || modules[i].menuPath.indexOf(item.path+'/') === 0)) {
                return window.MzdGuiI18n.text(modules[i].id,'gui.menu.'+depth,item.label);
            }
        }
        return item.label;
    }
    function entries() {
        var result = [], n;
        for (n = 0; n < modules.length; n += 1) {
            if (!modules[n].menuPath) { result.push({id:modules[n].id,label:label(modules[n]),kind:'module'}); }
        }
        for (n = 0; n < groups.length; n += 1) { if (!groups[n].parentPath) { result.push({id:groups[n].id,label:label(groups[n]),kind:'menu'}); } }
        return result;
    }
    function decorate(app) {
        var all = entries(), master = app._masterApplicationDataList, map = app._applicationsCtxtWiseAppNames, n, j, name, row;
        if (!master || !master.items || !map || !map.Applications) { return; }
        for (n = 0; n < all.length; n += 1) {
            name = 'mzd-gui-' + all[n].kind + '-' + all[n].id;
            for (j = 0; j < master.items.length; j += 1) { if (master.items[j].appData && master.items[j].appData.appName === name) { break; } }
            if (j === master.items.length) {
                row = {appData:{appName:name,isVisible:true,audioSourceId:'None',mmuiEvent:prefix+all[n].kind+'.'+all[n].id},text1Id:null,text1:all[n].label,itemStyle:'style01',hasCaret:all[n].kind === 'menu',disabled:false};
                master.items.push(row); rows.push(row);
            } else if (rows.indexOf(master.items[j]) < 0) { log('Conflicting Applications entry: ' + name); continue; }
            if (rows.indexOf(master.items[j]) >= 0) { master.items[j].text1 = all[n].label; }
            if (map.Applications.indexOf(name) < 0) { map.Applications.push(name); names.push(name); }
        }
    }
    // Embedded lists bypass Common's normal template routing. Keep its OEM
    // Back-button handoff, including returning focus to Applications on close.
    function backButton() {
        var common = fw && fw.common;
        return common && common.leftBtn && common.leftBtn.btnInstance ? common.leftBtn : null;
    }
    function releaseBackButton() {
        var button = backButton();
        if (button && button.btnInstance.hasFocus) { button.handleControllerEvent('lostFocus'); }
    }
    function menuEvent(control, event) {
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
    function close(restore) {
        var old = active;
        if (!old) { return; } active = null;
        releaseReturnHooks(old);
        window.clearTimeout(old.timeout); window.clearTimeout(old.selectionTimer); window.clearInterval(old.monitor);
        if (old.module && window.MzdGuiResidents && typeof window.MzdGuiResidents.view === 'function') { window.MzdGuiResidents.view(old.module.id,null); }
        if (old.languageCleanup) { old.languageCleanup(); }
        disposeMenu(old);
        if (old.baseTemplate && old.baseTemplate.divElt && old.baseTemplate.divElt.style.visibility === 'hidden') {
            old.baseTemplate.divElt.style.visibility = old.baseVisibility;
        }
        try {
            if (applications() && fw.getAppInstance('system')._currentContextTemplate === old.baseTemplate) {
                releaseBackButton();
                if (typeof old.baseTemplate.handleControllerEvent === 'function') { old.baseTemplate.handleControllerEvent('acceptFocusFromLeft'); }
                if (old.baseTemplate.list2Ctrl && typeof old.baseTemplate.list2Ctrl.setLineNumbers === 'function') { old.baseTemplate.list2Ctrl.setLineNumbers(); }
                if (old.sbChanged && fw.common && typeof fw.common.setSbNameId === 'function') { fw.common.setSbNameId('system','Applications'); }
            }
        } catch (ignore3) {}
        try { if (old.frame && old.frame.contentWindow.MzdGuiModule) { old.frame.contentWindow.MzdGuiModule._dispose(); } } catch (ignore) {}
        if (old.root.parentNode) { old.root.parentNode.removeChild(old.root); }
        if (restore) { try { if (old.focus && old.focus.focus) { old.focus.focus(); } } catch (ignore2) {} }
    }
    function stop(event) { if (event.preventDefault) { event.preventDefault(); } if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } event.returnValue = false; }
    function disposeMenu(session) {
        var control = session.listCtrl;
        session.listCtrl = null;
        if (control) { try { fw.destroyControl(control); } catch (error) { log('List cleanup: ' + error); } }
    }
    function selectEntry(item) {
        if (item.kind === 'menu') { active.parent = item.path; submenu(''); }
        else { launch(item); }
    }
    function submenu(message) {
        var session = active, root = session.root, n, item, items = [], control;
        window.clearTimeout(session.timeout); window.clearTimeout(session.selectionTimer);
        if (session.languageCleanup) { session.languageCleanup(); session.languageCleanup = null; }
        disposeMenu(session);
        if (session.frame) { try { if (session.frame.contentWindow.MzdGuiModule) { session.frame.contentWindow.MzdGuiModule._dispose(); } } catch (ignore) {} }
        if (session.module && window.MzdGuiResidents && typeof window.MzdGuiResidents.view === 'function') { window.MzdGuiResidents.view(session.module.id,null); }
        session.module = null;
        session.frame = null; session.list = []; session.keys = {}; root.innerHTML = '';
        root.className = 'TemplateWithStatusLeft List2Tmplt';
        root.style.left = '60px'; root.style.top = '64px'; root.style.width = '740px'; root.style.height = '416px';
        root.style.zIndex = '7'; root.style.background = 'transparent'; root.style.overflow = 'visible';
        if (fw.common && typeof fw.common.setSbName === 'function') {
            session.sbChanged = true; var title = session.parent.substring(session.parent.lastIndexOf('/')+1);
            for (n = 0; n < groups.length; n += 1) { if (groups[n].path === session.parent) { title = label(groups[n]); } }
            fw.common.setSbName(message || title);
        }
        for (n = 0; n < groups.length; n += 1) { if (groups[n].parentPath === session.parent) { session.list.push(groups[n]); } }
        for (n = 0; n < modules.length; n += 1) { if (modules[n].menuPath === session.parent) { session.list.push(modules[n]); } }
        for (n = 0; n < session.list.length; n += 1) {
            item = session.list[n];
            items.push({appData:{mzdGuiItem:item},text1Id:null,text1:label(item),itemStyle:'style01',hasCaret:item.kind === 'menu',disabled:false});
        }
        if (typeof fw.instantiateControl !== 'function' || typeof fw.destroyControl !== 'function') { throw new Error('Mazda list API unavailable'); }
        control = fw.instantiateControl('system',root,'List2Ctrl',{
            titleConfiguration:'noTitle',
            numberedList:true,dataList:{itemCountKnown:true,itemCount:items.length,items:items,vuiSupport:false},
            selectCallback:guarded(function (source, data) {
                if (active !== session || source !== session.listCtrl || !data || !data.mzdGuiItem) { return; }
                window.clearTimeout(session.selectionTimer);
                // Let the OEM selection callback finish before destroying its list.
                session.selectionTimer = window.setTimeout(guarded(function () {
                    if (active === session && session.listCtrl === source) { if (applications()) { selectEntry(data.mzdGuiItem); } else { close(false); } }
                }),0);
            })
        });
        session.listCtrl = control;
        if (!control || typeof control.handleControllerEvent !== 'function') { throw new Error('Mazda list did not initialize'); }
        releaseBackButton();
        control.handleControllerEvent('acceptFocusInit');
    }
    function launch(module) {
        var frame = document.createElement('iframe'), session = active;
        if (session.languageCleanup) { session.languageCleanup(); session.languageCleanup = null; }
        releaseBackButton();
        disposeMenu(session);
        active.root.className = ''; active.root.style.zIndex = '10000'; active.root.style.background = '#000'; active.root.style.overflow = 'hidden';
        active.root.style.left = '0px'; active.root.style.top = '0px'; active.root.style.width = '800px'; active.root.style.height = '480px'; active.root.style.backgroundPosition = '0 0';
        active.root.innerHTML = ''; active.frame = frame; active.module = module; active.keys = {}; active.phoneLifecycle = false; active.ready = false;
        active.token = 'v1-' + new Date().getTime() + '-' + String(Math.random()).replace(/\D/g,'');
        frame.style.cssText = 'display:block;width:800px;height:480px;border:0;background:#000;'; frame.title = module.label;
        frame.onerror = guarded(function () { if (active === session && active.frame === frame) { failed('View failed to load'); } });
        active.timeout = window.setTimeout(guarded(function () { if (active === session && active.frame === frame) { failed('View startup timed out'); } }),8000);
        frame.src = module.entrypoint + '#mzdgui=' + active.token; active.root.appendChild(frame);
        if (window.MzdGuiResidents && typeof window.MzdGuiResidents.view === 'function') { window.MzdGuiResidents.view(module.id,{source:frame.contentWindow,frame:frame,token:active.token}); }
    }
    function layout(mode) {
        if (!active || !active.frame || !applications() || ['fullscreen','with-status-bar'].indexOf(mode) < 0) { return; }
        var status = mode === 'with-status-bar', height = status ? 416 : 480;
        active.root.style.top = status ? '64px' : '0px';
        // Mazda side chrome is layer 8; status/notifications start at layer 10.
        active.root.style.height = height+'px'; active.root.style.zIndex = status ? '9' : '10000';
        active.frame.style.height = height+'px';
        if (fw.common && typeof fw.common.setSbName === 'function') {
            active.sbChanged = true; fw.common.setSbName(label(active.module));
        }
    }
    function failed(message) {
        log(message);
        if (!active) { return; }
        if (active.suspended) { close(false); return; }
        try { if (active.parent) { submenu(message + ' - select an entry to retry'); } else { close(true); } }
        catch (error) { log(String(error)); close(false); }
    }
    function clearReturnMask(session) {
        if (session.returnMask) {
            session.returnMask.className = session.returnMask.className.replace(/(?:^|\s)MzdGuiReturnMask(?=\s|$)/g,'');
            session.returnMask = null;
        }
    }
    function releaseReturnHooks(session) {
        clearReturnMask(session);
        var hooks = session.returnHooks;
        if (!hooks) { return; }
        if (hooks.entry.readyFunction === hooks.ready) { hooks.entry.readyFunction = hooks.oldReady; }
        if (hooks.entry.displayedFunction === hooks.displayed) {
            if (hooks.hadDisplayed) { hooks.entry.displayedFunction = hooks.oldDisplayed; }
            else { delete hooks.entry.displayedFunction; }
        }
        session.returnHooks = null;
    }
    function watchReturn(session) {
        var app = fw.getAppInstance('system'), entry = app._contextTable && app._contextTable.Applications;
        if (!entry || session.returnHooks) { return; }
        var hooks = {entry:entry,oldReady:entry.readyFunction,oldDisplayed:entry.displayedFunction,hadDisplayed:Object.prototype.hasOwnProperty.call(entry,'displayedFunction')};
        hooks.ready = function () {
            var result = typeof hooks.oldReady === 'function' ? hooks.oldReady.apply(this,arguments) : undefined;
            try {
                var current = app._currentContext, template = app._currentContextTemplate, style;
                if (active === session && session.suspended && current && current.ctxtId === 'Applications' && String(current.contextSeq) === session.contextSeq && template && template.divElt) {
                    clearReturnMask(session);
                    style = session.returnMaskStyle;
                    if (!style || style.parentNode !== session.root) {
                        style = document.createElement('style');
                        style.textContent = '.MzdGuiReturnMask,.MzdGuiReturnMask *{visibility:hidden!important}';
                        session.root.appendChild(style); session.returnMaskStyle = style;
                    }
                    session.returnMask = template.divElt;
                    template.divElt.className = (template.divElt.className || '')+' MzdGuiReturnMask';
                }
            } catch (error) { log('Return preparation: '+error); close(false); }
            return result;
        };
        hooks.displayed = function () {
            var result = typeof hooks.oldDisplayed === 'function' ? hooks.oldDisplayed.apply(this,arguments) : undefined;
            try { if (active === session && session.suspended) { checkContext(); } }
            catch (error) { log('Return completion: '+error); close(false); }
            return result;
        };
        session.returnHooks = hooks; entry.readyFunction = hooks.ready; entry.displayedFunction = hooks.displayed;
    }
    function contextSequence() {
        var value = typeof fw.getCurrCtxtSeqNo === 'function' ? fw.getCurrCtxtSeqNo() : null;
        return (typeof value === 'number' || typeof value === 'string') && /^\d+$/.test(String(value)) ? String(value) : null;
    }
    function interruptingContext() {
        var app = fw.getCurrentApp(), context = fw.getCurrCtxtId();
        return app === 'phone' && ['IncomingCall','ActiveCall','ActiveCallDTMF','ActiveCall1','ActiveCall1DTMF','ActiveCall2','ActiveCall2DTMF','ActiveCallMerged','ActiveCallMergedDTMF','BTMultipleCall','MultipleCallWaiting'].indexOf(context) >= 0 ||
            app === 'backupparking' && ['BackupCameraDisplay','BUCAndPSMDisplay','ParkingSensorDisplay'].indexOf(context) >= 0;
    }
    function checkContext() {
        var session = active, template;
        if (!session) { return; }
        if (!applications()) {
            if (!session.phoneLifecycle || !session.frame || !session.ready || session.contextSeq === null || !interruptingContext()) { close(false); return; }
            if (!session.suspended) {
                session.suspended = true; session.keys = {};
                // Release native settings and resident access before hiding the root.
                if (window.MzdGuiResidents && typeof window.MzdGuiResidents.view === 'function') { window.MzdGuiResidents.view(session.module.id,null); }
                session.root.style.display = 'none';
                if (typeof session.frame.blur === 'function') { session.frame.blur(); }
                if (typeof window.focus === 'function') { window.focus(); }
                session.frame.contentWindow.postMessage({type:'mzd-gui-suspend',token:session.token},'*');
                log('View suspended for native interruption: '+session.module.id);
            }
            return;
        }
        if (!session.suspended) { return; }
        // A new Applications visit is deliberate navigation, not the return stack.
        if (contextSequence() !== session.contextSeq) { close(false); return; }
        if (fw._frameworkState && fw._frameworkState !== 'idle') { return; }
        template = fw.getAppInstance('system')._currentContextTemplate;
        if (!template || !template.divElt) { return; }
        if (template !== session.baseTemplate) {
            if (session.baseTemplate && session.baseTemplate.divElt) { session.baseTemplate.divElt.style.visibility = session.baseVisibility; }
            session.baseTemplate = template; session.baseVisibility = template.divElt.style.visibility;
        }
        template.divElt.style.visibility = 'hidden';
        clearReturnMask(session);
        session.suspended = false; session.keys = {}; session.root.style.display = '';
        if (window.MzdGuiResidents && typeof window.MzdGuiResidents.view === 'function') { window.MzdGuiResidents.view(session.module.id,{source:session.frame.contentWindow,frame:session.frame,token:session.token}); }
        session.frame.contentWindow.postMessage({type:'mzd-gui-resume',token:session.token},'*');
        session.frame.contentWindow.focus();
        log('View resumed after phone: '+session.module.id);
    }
    function open(id) {
        var n, root, session, baseTemplate;
        if (active || !applications()) { return; }
        root = document.createElement('div'); root.style.cssText = 'position:absolute;left:0;top:0;width:800px;height:480px;overflow:hidden;z-index:10000;background:#000 url(/jci/gui/common/images/background.png);';
        baseTemplate = fw.getAppInstance('system')._currentContextTemplate;
        session = {contextSeq:contextSequence(),suspended:false,phoneLifecycle:false,root:root,focus:document.activeElement,frame:null,module:null,keys:{},timeout:null,monitor:null,baseTemplate:baseTemplate}; active = session;
        if (baseTemplate && baseTemplate.divElt) { session.baseVisibility = baseTemplate.divElt.style.visibility; baseTemplate.divElt.style.visibility = 'hidden'; }
        document.body.appendChild(root);
        session.monitor = window.setInterval(guarded(function () { if (active === session) { checkContext(); } }),250);
        for (n = 0; n < groups.length; n += 1) { if (id === 'menu.'+groups[n].id) { active.parent = groups[n].path; submenu(''); return; } }
        for (n = 0; n < modules.length; n += 1) { if ('module.'+modules[n].id === id && !modules[n].menuPath) { launch(modules[n]); return; } }
        close(true);
    }
    function menuBack() {
        var at = active.parent.lastIndexOf('/');
        if (at < 0) { close(true); } else { active.parent = active.parent.substring(0,at); submenu(''); }
    }
    function input(action, phase) {
        if (active.frame) { active.frame.contentWindow.postMessage({type:'mzd-gui-input',token:active.token,action:action,phase:phase},'*'); return; }
        if (action === 'back' && phase !== 'press') { menuBack(); return; }
        if (!active.listCtrl || action === 'back') { return; }
        if (action === 'rotateRight' || action === 'rotateLeft') {
            if (phase === 'press') { menuEvent(active.listCtrl,action === 'rotateRight' ? 'cw' : 'ccw'); }
        } else {
            menuEvent(active.listCtrl,phase === 'press' ? action + 'Start' : action);
        }
    }
    function down(event) {
        var code = event.keyCode || event.which, action = {37:'left',39:'right',38:'up',40:'down',13:'select',77:'rotateRight',78:'rotateLeft',27:'back'}[code];
        if (!active || active.suspended || !applications()) { return; }
        if (code === 8) { stop(event); return; }
        if (!action) { return; } stop(event);
        try { if (!active.keys[code]) { active.keys[code] = action; input(action,'press'); } } catch (error) { failed(String(error)); }
    }
    function up(event) {
        var code = event.keyCode || event.which, action;
        if (!active || active.suspended || !applications()) { return; }
        if (code === 8) { stop(event); input('back','step'); return; }
        action = active.keys[code]; if (action) { stop(event); delete active.keys[code]; input(action,'release'); }
    }
    function receive(event) {
        var data = event.data;
        if (!active || !active.frame || event.source !== active.frame.contentWindow || !data || data.token !== active.token) { return; }
        if (active.suspended && data.type !== 'mzd-gui-error') { return; }
        if (active.module && window.MzdGuiResidents && typeof window.MzdGuiResidents.message === 'function') { window.MzdGuiResidents.message(active.module.id,event); }
        if (data.type === 'mzd-gui-language-request' && active.module) {
            if (active.languageCleanup) { active.languageCleanup(); }
            var session = active, deliver = function (value) {
                if (active === session && session.frame) { session.frame.contentWindow.postMessage({type:'mzd-gui-language',token:session.token,value:value},'*'); }
            };
            if (window.MzdGuiI18n) { active.languageCleanup = window.MzdGuiI18n.load(active.module.id,deliver); }
            else { deliver({language:'en_US',direction:'ltr',texts:{}}); }
        }
        if (data.type === 'mzd-gui-units-request' && active.frame) {
            var units = window.MzdGuiResidents && typeof window.MzdGuiResidents.units === 'function' ?
                window.MzdGuiResidents.units(active.module ? active.module.id : null) :
                { speedUnit: null, distanceUnit: null, tempUnit: null, language: 'en_US' };
            active.frame.contentWindow.postMessage({ type: 'mzd-gui-units', token: active.token, value: units }, '*');
        }
        if (data.type === 'mzd-gui-notify' && typeof data.text === 'string') {
            if (window.MzdGuiResidents && typeof window.MzdGuiResidents.notify === 'function') {
                window.MzdGuiResidents.notify(active.module ? active.module.id : 'system', data.text, data.isError);
            } else {
                var notifyFw = window.framework;
                if (notifyFw && notifyFw.common && typeof notifyFw.common.startTimedSbn === 'function') {
                    var str = String(data.text || '');
                    var head = document.getElementsByTagName('head')[0];
                    if (head) {
                        var style = document.getElementById('mzd-gui-sbn-style');
                        if (!style) {
                            style = document.createElement('style');
                            style.id = 'mzd-gui-sbn-style';
                            head.appendChild(style);
                        }
                        style.textContent = str.length > 34 ? '.SbnCtrl_Style02_Text1 { font-size: 26px !important; }' : '';
                    }
                    try {
                        notifyFw.common.startTimedSbn(active.module ? active.module.id : 'system', 'MzdGuiNotification', data.isError ? 'errorNotification' : 'typeD', {
                            sbnStyle: 'Style02',
                            imagePath1: data.isError ? 'common/images/icons/IcnSbnSystemError.png' : 'common/images/icons/IcnSbnApps.png',
                            text1: str
                        });
                    } catch (ignore) {}
                }
            }
        }
        if (data.type === 'mzd-gui-lifecycle' && data.message === 'phone') { active.phoneLifecycle = true; watchReturn(active); }
        else if (data.type === 'mzd-gui-layout') { layout(data.message); }
        else if (data.type === 'mzd-gui-ready') { active.ready = true; window.clearTimeout(active.timeout); try { active.frame.contentWindow.focus(); } catch (ignore) {} }
        else if (data.type === 'mzd-gui-close') { if (active.parent) { submenu(''); } else { close(true); } }
        else if (data.type === 'mzd-gui-error') { failed(String(data.message || 'Module error').substring(0,512)); }
        else if (data.type === 'mzd-gui-log') { log(String(data.message || '').substring(0,512)); }
    }
    function guarded(fn) {
        return function () {
            try { return fn.apply(this,arguments); }
            catch (error) { log(String(error)); try { close(false); } catch (ignore) {} }
        };
    }
    var safeDown = guarded(down), safeUp = guarded(up), safeReceive = guarded(receive);
    function disable() {
        var app, master, map, n;
        installed = false;
        while (languageCleanups.length) { languageCleanups.pop()(); }
        if (window.MzdGuiI18n) { window.MzdGuiI18n.dispose(); }
        if (window.MzdGuiResidents && typeof window.MzdGuiResidents.dispose === 'function') { window.MzdGuiResidents.dispose(); }
        window.clearInterval(timer);
        try { close(false); } catch (ignore) {}
        window.removeEventListener('keydown',safeDown,true); window.removeEventListener('keyup',safeUp,true); window.removeEventListener('message',safeReceive,false);
        if (proto && proto._initApplicationsDataList === initWrapper) { proto._initApplicationsDataList = originalInit; }
        if (proto && proto._updateApplicationStructure === structureWrapper) { proto._updateApplicationStructure = originalStructure; }
        if (fw && fw.sendEventToMmui === sendWrapper) { fw.sendEventToMmui = originalSend; }
        try {
            app = fw && fw.getAppInstance('system'); master = app && app._masterApplicationDataList; map = app && app._applicationsCtxtWiseAppNames;
            if (master && master.items) { for (n = master.items.length - 1; n >= 0; n -= 1) { if (rows.indexOf(master.items[n]) >= 0) { master.items.splice(n,1); } } }
            if (map && map.Applications) { for (n = map.Applications.length - 1; n >= 0; n -= 1) { if (names.indexOf(map.Applications[n]) >= 0) { map.Applications.splice(n,1); } } }
        } catch (ignore2) {}
        rows = []; names = [];
    }
    function install() {
        var app;
        fw = window.framework; proto = window.systemApp && window.systemApp.prototype;
        if (!fw || !proto || typeof proto._initApplicationsDataList !== 'function' || typeof proto._updateApplicationStructure !== 'function' ||
            typeof fw.sendEventToMmui !== 'function' || typeof fw.getAppInstance !== 'function' || typeof fw.getCurrentApp !== 'function' || typeof fw.getCurrCtxtId !== 'function') { return false; }
        originalInit = proto._initApplicationsDataList; originalStructure = proto._updateApplicationStructure; originalSend = fw.sendEventToMmui;
        initWrapper = function () { var result = originalInit.apply(this,arguments); try { decorate(this); } catch (error) { disable(); log(String(error)); } return result; };
        structureWrapper = function () { var result = originalStructure.apply(this,arguments); try { decorate(this); } catch (error) { disable(); log(String(error)); } return result; };
        sendWrapper = function (uiaId,eventId) {
            if (eventId === 'Global.GoBack' && active && active.parent && !active.frame && applications()) { try { menuBack(); } catch (error) { failed(String(error)); } return; }
            if (typeof eventId === 'string' && eventId.indexOf(prefix) === 0) { try { if (uiaId === 'system') { open(eventId.substring(prefix.length)); } } catch (error) { failed(String(error)); } return; }
            return originalSend.apply(this,arguments);
        };
        proto._initApplicationsDataList = initWrapper; proto._updateApplicationStructure = structureWrapper; fw.sendEventToMmui = sendWrapper;
        installed = true;
        window.addEventListener('keydown',safeDown,true); window.addEventListener('keyup',safeUp,true); window.addEventListener('message',safeReceive,false);
        app = fw.getAppInstance('system'); if (app) { decorate(app); }
        if (window.MzdGuiI18n) {
            window.MzdGuiI18n.start(modules);
            modules.forEach(function (module) {
                if (module.translations) { languageCleanups.push(window.MzdGuiI18n.load(module.id,function () {
                    if (installed) { var app = fw.getAppInstance('system'); if (app) { decorate(app); } }
                })); }
            });
        }
        if (window.MzdGuiResidents && typeof window.MzdGuiResidents.start === 'function') { window.MzdGuiResidents.start(modules); }
        return true;
    }
    try {
        var registry = window.mzdGuiRegistry, n, entry, seen = {};
        if (!registry || registry.api !== 1 || !Array.isArray(registry.modules) || registry.modules.length > 100) { return; }
        for (n = 0; n < registry.modules.length; n += 1) {
            entry = registry.modules[n];
            if (!entry || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ['games','exit'].indexOf(entry.id) >= 0 || seen['$'+entry.id] ||
                typeof entry.label !== 'string' ||
                typeof entry.entrypoint !== 'string' || entry.entrypoint.indexOf('/data/integration/mzd-gui-modules/'+entry.id+'/assets/') !== 0 || /(^|\/)\.\.?($|\/)/.test(entry.entrypoint)) { continue; }
            var menuPath = entry.menuPath || '', segments = menuPath ? menuPath.split('/') : [], currentPath = '', parentPath = '', g, k;
            if (typeof menuPath !== 'string' || menuPath.length > 240 || segments.length > 8) { throw new Error('Invalid menu path'); }
            for (k = 0; k < segments.length; k += 1) {
                if (!segments[k] || segments[k] === '.' || segments[k] === '..' || segments[k].length > 80 || /^\s|\s$/.test(segments[k]) || /[\x00-\x1f\x7f]/.test(segments[k])) { throw new Error('Invalid menu segment'); }
                parentPath = currentPath; currentPath += (currentPath ? '/' : '') + segments[k];
                for (g = 0; g < groups.length; g += 1) { if (groups[g].path === currentPath) { break; } }
                if (g === groups.length) { groups.push({id:String(groups.length),path:currentPath,parentPath:parentPath,label:segments[k],kind:'menu'}); }
            }
            entry.menuPath = menuPath; entry.kind = 'module';
            seen['$'+entry.id] = true; modules.push(entry);
        }
        if (!modules.length) { return; }
        window.MzdGuiRuntime = {api:1};
        if (!install()) {
            timer = window.setInterval(function () { attempts += 1; try { if (install() || attempts >= 120) { window.clearInterval(timer); } } catch (error) { disable(); log(String(error)); } },500);
        }
    } catch (error) { disable(); log('Startup stopped: ' + error); }
}());
