/* Resident host; gallery/settings belong to the installed service. */
(function (context) {
    'use strict';
    if (window.WallpaperManager) { return; }
    if (!window.MzdSettingsHost) {
        // settings-host.js did not load. The runtime logs this and stops only this resident.
        throw new Error('Shared settings code is unavailable.');
    }
    var original = 'common/images/background.png', desired = original, request = 0;
    var menuPreview = null, previewOwner = null, previewPath = null, previewRequest = 0;
    var catalog = [], savedSettings = null, stagedSettings = null, saving = false, retry = null, loadSequence = 0, mutation = 0;
    var bootRetry = null, menuTimer = null, transitionTimer = null;
    var DISPLAY_OFF_CLASS = 'mzd-wallpaper-display-off';
    var offscreenStyle = null, fwHook = null, displayOffTargets = [];
    function addClass(elt, name) {
        if (!elt || typeof elt.className !== 'string') { return; }
        var parts = elt.className ? elt.className.split(/\s+/) : [];
        if (parts.indexOf(name) < 0) {
            parts.push(name);
            elt.className = parts.join(' ').replace(/^\s+|\s+$/g, '');
        }
    }
    function removeClass(elt, name) {
        if (!elt || typeof elt.className !== 'string' || !elt.className) { return; }
        var parts = elt.className.split(/\s+/), out = [], i;
        for (i = 0; i < parts.length; i += 1) {
            if (parts[i] && parts[i] !== name) { out.push(parts[i]); }
        }
        elt.className = out.join(' ');
    }
    function clearDisplayOffTarget(ctrl) {
        var i;
        for (i = displayOffTargets.length - 1; i >= 0; i -= 1) {
            if (!ctrl || displayOffTargets[i].ctrl === ctrl) {
                removeClass(displayOffTargets[i].divElt, DISPLAY_OFF_CLASS);
                removeClass(displayOffTargets[i].parent, DISPLAY_OFF_CLASS);
                displayOffTargets.splice(i, 1);
            }
        }
    }
    function scheduleTransitionRefresh() {
        if (hostEnded || transitionTimer) { return; }
        transitionTimer = window.setTimeout(function () {
            transitionTimer = null;
            if (!hostEnded) { updateBackground(); }
        }, 0);
    }
    function hookFramework(fw) {
        if (!fw || fwHook || hostEnded) { return; }
        var origControl = typeof fw.instantiateControl === 'function' ? fw.instantiateControl : null;
        var origDestroy = typeof fw.destroyControl === 'function' ? fw.destroyControl : null;
        var origTemplate = typeof fw.instantiateTemplate === 'function' ? fw.instantiateTemplate : null;
        if (!origControl && !origDestroy && !origTemplate) { return; }
        fwHook = {
            fw: fw,
            origControl: origControl, wrappedControl: null,
            origDestroy: origDestroy, wrappedDestroy: null,
            origTemplate: origTemplate, wrappedTemplate: null
        };
        if (origControl) {
            fwHook.wrappedControl = function (uia, parent, type, props) {
                var ctrl = origControl.apply(this, arguments);
                if (!hostEnded && type === 'OffScreenCtrl') {
                    var hasClock = !!(props && typeof props.showClock === 'boolean');
                    var isDisplayOff = uia === 'system' && (hasClock ? props.showClock === true :
                        !!(fw.getCurrentApp && fw.getCurrCtxtId && fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'DisplayOff'));
                    var parentTarget = parent && parent !== document.body && parent !== document.documentElement ? parent : null;
                    var ctrlTarget = ctrl && ctrl.divElt ? ctrl.divElt : null;
                    if (isDisplayOff) {
                        if (ctrlTarget) { addClass(ctrlTarget, DISPLAY_OFF_CLASS); }
                        if (parentTarget && parentTarget !== ctrlTarget) { addClass(parentTarget, DISPLAY_OFF_CLASS); }
                        if (ctrlTarget || parentTarget) {
                            displayOffTargets.push({ ctrl: ctrl, divElt: ctrlTarget, parent: parentTarget });
                        }
                    } else {
                        if (ctrlTarget) { removeClass(ctrlTarget, DISPLAY_OFF_CLASS); }
                        if (parentTarget) { removeClass(parentTarget, DISPLAY_OFF_CLASS); }
                    }
                }
                return ctrl;
            };
            fw.instantiateControl = fwHook.wrappedControl;
        }
        if (origDestroy) {
            fwHook.wrappedDestroy = function (ctrl) {
                if (!hostEnded && ctrl) { clearDisplayOffTarget(ctrl); }
                return origDestroy.apply(this, arguments);
            };
            fw.destroyControl = fwHook.wrappedDestroy;
        }
        if (origTemplate) {
            fwHook.wrappedTemplate = function () {
                var tmplt = origTemplate.apply(this, arguments);
                if (!hostEnded) {
                    updateBackground();
                    scheduleTransitionRefresh();
                }
                return tmplt;
            };
            fw.instantiateTemplate = fwHook.wrappedTemplate;
        }
    }
    function unhookFramework() {
        if (!fwHook) { return; }
        var fw = fwHook.fw;
        if (fwHook.wrappedControl && fw.instantiateControl === fwHook.wrappedControl) {
            fw.instantiateControl = fwHook.origControl;
        }
        if (fwHook.wrappedDestroy && fw.destroyControl === fwHook.wrappedDestroy) {
            fw.destroyControl = fwHook.origDestroy;
        }
        if (fwHook.wrappedTemplate && fw.instantiateTemplate === fwHook.wrappedTemplate) {
            fw.instantiateTemplate = fwHook.origTemplate;
        }
        fwHook = null;
    }
    function updateOffScreen(target) {
        var isCustom = (target && target !== original && core && core.snapshot().offscreen === true);
        var head = document.getElementsByTagName('head')[0] || document.head || document.body || document.documentElement;
        if (!offscreenStyle && head) {
            offscreenStyle = document.createElement('style');
            offscreenStyle.id = 'mzd-wallpaper-offscreen';
            head.appendChild(offscreenStyle);
        }
        var css = isCustom ? '.OffScreenCtrl.' + DISPLAY_OFF_CLASS + ', .' + DISPLAY_OFF_CLASS + ' .OffScreenCtrl { background-image: url("' + target + '") !important; background-size: 800px 480px !important; background-position: 0 0 !important; background-repeat: no-repeat !important; }' : '';
        if (offscreenStyle && offscreenStyle.textContent !== css) {
            offscreenStyle.textContent = css;
        }
    }
    function updateBackground() {
        var fw = window.framework, common = fw && fw.common, visible = desired;
        if (fw && !hostEnded) { hookFramework(fw); }
        if (common) { common._defaultBgPath = desired; }
        if (!common || !common._bgDiv1) {
            if (!bootRetry && !hostEnded) {
                bootRetry = window.setTimeout(function () {
                    bootRetry = null;
                    updateBackground();
                }, 500);
            }
            updateOffScreen(desired);
            return;
        }
        if (bootRetry) {
            window.clearTimeout(bootRetry);
            bootRetry = null;
        }
        if (previewPath && previewOwner && document.documentElement.contains(previewOwner) &&
            fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') {
            visible = previewPath;
        }
        if (!common._customBgSet) {
            common._currentBgPath = visible;
            if (common._bgDiv1 && common._bgDiv1.style.backgroundImage !== 'url("' + visible + '")') {
                common._bgDiv1.style.backgroundImage = 'url("' + visible + '")';
            }
            if (common._bgDiv2) {
                common._bgDiv2.style.backgroundImage = 'url("' + visible + '")';
            }
        }
        updateOffScreen(desired);
    }
    function setMenuPreview(id, frame) {
        var row = null, i, image, token;
        if (id === menuPreview && (id === null || frame === previewOwner)) { return; }
        menuPreview = id; previewOwner = id === null ? null : frame; previewPath = null; token = ++previewRequest;
        updateBackground();
        if (id === null) { return; }
        for (i = 0; i < catalog.length; i += 1) { if (catalog[i].id === id) { row = catalog[i]; } }
        if (!row) { return; }
        image = new Image();
        image.onload = function () {
            if (token !== previewRequest || image.width !== 800 || image.height !== 480) { return; }
            previewPath = row.url; updateBackground();
        };
        image.onerror = function () { if (token === previewRequest) { previewPath = null; updateBackground(); } };
        image.src = row.url;
    }

    function paint(id, done) {
        var image, row = null, i, token = ++request;
        if (id === null) { desired = original; updateBackground(); done(false); return; }
        for (i = 0; i < catalog.length; i += 1) { if (catalog[i].id === id) { row = catalog[i]; } }
        if (!row) { done(true); return; }
        image = new Image();
        image.onload = function () {
            if (token !== request) { return; }
            if (image.width !== 800 || image.height !== 480) { done(true); return; }
            desired = row.url; updateBackground(); done(false);
        };
        image.onerror = function () { if (token === request) { done(true); } };
        image.src = row.url;
    }
    var core = null, client = window.WallpaperCmuImportClient.create(context.service), loading = true, backendError = '', hostEnded = false;
    var usb = {status:'idle',items:[]}, importing = false;
    function snapshot() {
        var value = core ? core.snapshot() : {images:[],active:null,selected:null,enabled:false,interval:10,slides:[],offscreen:false,error:'',preview:true};
        value.loading = loading; value.importAvailable = !!client; value.usb = usb; value.importing = importing;
        value.error = value.error || backendError; return value;
    }
    function initialize(images, settings) {
        if (hostEnded) { return; }
        if (core) { core.dispose(); }
        catalog = images; savedSettings = settings; stagedSettings = null;
        core = window.WallpaperPreviewCore.create({catalog:catalog,paint:paint,
            read:function () { return JSON.stringify(savedSettings); },
            write:function (value) { stagedSettings = JSON.parse(value); },
            delay:function (fn,ms) { return window.setTimeout(fn,ms); },cancel:function (id) { window.clearTimeout(id); }});
        loading = false;
        core.subscribe(function () {
            broadcast();
            updateBackground();
        });
        window.WallpaperManager = core;
    }
    function replace(images) { catalog = images; core.replaceCatalog(images); }
    function frameToken(source) {
        var current = context.view();
        return current && current.source === source ? current.token : '';
    }
    function startMenuCheck() {
        if (!menuTimer && !hostEnded) {
            menuTimer = window.setInterval(function () { nativeMenu.check(); }, 500);
        }
    }
    function stopMenuCheck() {
        if (menuTimer) {
            window.clearInterval(menuTimer);
            menuTimer = null;
        }
    }
    var nativeMenu = context.createNativeMenu({
        prefix: 'wallpaper',
        split: true,
        dialog: true,
        preview: setMenuPreview,
        onOpen: startMenuCheck,
        onClose: stopMenuCheck
    });
    function receive(event) {
        window.MzdSettingsHost.handleNativeMessage(nativeMenu, context, 'wallpaper', event, {leaveOnError:true});
    }
    context.onServiceRequest(function (command, args, callback) {
        if (hostEnded) { return; }
        var value = args && Object.prototype.hasOwnProperty.call(args, 'value') ? args.value : args;
        var error = '';
        if (command === 'state') {
            if (core) { updateBackground(); }
            callback(null, { state: snapshot() });
            if (core && !saving && !importing) {
                var baseline = mutation;
                client.gallery(function (failure, result) {
                    if (failure || hostEnded || baseline !== mutation || saving || importing) { return; }
                    function configKey(v) { v = v || {}; return JSON.stringify([v.selected || null, v.enabled === true, v.interval, Array.isArray(v.slides) ? v.slides : [], v.offscreen === true]); }
                    function catalogKey(images) { return JSON.stringify(images.map(function (row) { return [row.id, row.label, row.url, row.bytes]; })); }
                    if (configKey(savedSettings) !== configKey(result.settings)) { initialize(result.images, result.settings); }
                    else if (catalogKey(catalog) !== catalogKey(result.images)) { replace(result.images); }
                });
            }
            return;
        }
        if (!core) { callback('Gallery is still loading.', { state: snapshot() }); return; }
        if (saving) { callback('Settings are still being saved.', { state: snapshot() }); return; }
        mutation += 1;
        if (command === 'usb-list') {
            if (!client) { usb = { status: 'unavailable', items: [] }; callback(null, { state: snapshot() }); return; }
            usb = { status: 'loading', items: [] }; broadcast();
            client.usb(function (failure, result) {
                usb = failure ? { status: 'unavailable', items: [], error: failure } : result;
                callback(failure || null, { state: snapshot() });
            });
            return;
        }
        if (command === 'import-one') {
            if (!client || importing) { callback('Import is unavailable or already in progress.', { state: snapshot() }); return; }
            importing = true; broadcast();
            client.importImage(value, function (failure, result) {
                importing = false;
                if (!failure) { replace(result.images); }
                callback(failure || null, { state: snapshot(), notice: failure ? '' : 'Image imported' });
            });
            return;
        }
        if (command === 'delete' && client) {
            client.remove(value, function (failure, result) {
                if (!failure) { initialize(result.images, result.settings); }
                callback(failure || null, { state: snapshot() });
            });
            return;
        }
        stagedSettings = null;
        try { core.command(command, value); }
        catch (failure) { error = String(failure.message || failure); }
        if (!error && stagedSettings) {
            saving = true;
            context.service.request('save', stagedSettings, function (failure, result) {
                saving = false;
                if (hostEnded) { return; }
                if (failure) { initialize(catalog, savedSettings); }
                else {
                    savedSettings = result.settings;
                    updateBackground();
                }
                callback(failure || null, { state: snapshot() });
            });
        } else {
            callback(error || null, { state: snapshot() });
        }
    });
    function broadcast() {
        var frames = document.getElementsByTagName('iframe'), i, token;
        for (i = 0; i < frames.length; i += 1) {
            token = frameToken(frames[i].contentWindow);
            if (token) { try { frames[i].contentWindow.postMessage({type:'wallpaper-preview-response',token:token,id:0,state:snapshot(),error:''},'*'); } catch (ignore) {} }
        }
    }
    context.onMessage(receive);
    context.onViewClose(function () {
        nativeMenu.close();
    });
    context.onDispose(function () {
        hostEnded = true;
        nativeMenu.close();
        stopMenuCheck();
        clearDisplayOffTarget(null);
        unhookFramework();
        if (core) {
            core.dispose();
        }
        window.clearTimeout(retry);
        if (bootRetry) {
            window.clearTimeout(bootRetry);
            bootRetry = null;
        }
        if (transitionTimer) {
            window.clearTimeout(transitionTimer);
            transitionTimer = null;
        }
        desired = original;
        previewPath = null;
        updateBackground();
        if (offscreenStyle && offscreenStyle.parentNode) {
            offscreenStyle.parentNode.removeChild(offscreenStyle);
        }
        offscreenStyle = null;
        delete window.WallpaperManager;
    });
    function loadGallery() {
        var sequence = ++loadSequence;
        client.gallery(function (failure, result) {
            if (sequence !== loadSequence || hostEnded) { return; }
            backendError = failure || '';
            if (failure) { broadcast(); retry = window.setTimeout(loadGallery,3000); }
            else { initialize(result.images,result.settings); }
        });
    }
    context.onServiceReady(function () { window.clearTimeout(retry); loadGallery(); });
    loadGallery();
}(context));
