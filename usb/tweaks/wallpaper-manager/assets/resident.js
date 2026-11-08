/* Local emulator storage/controller only. No CMU filesystem bridge. */
(function (global) {
    'use strict';
    function create(options) {
        var catalog = options.catalog, ids = [], i, listeners = [], timer = null, ended = false, generation = 0;
        var config = {selected:null,enabled:false,interval:10,slides:[],removed:[]}, active = null, error = '';
        var intervals = [5,10,30,60,120,300], stored;
        for (i = 0; i < catalog.length; i += 1) { ids.push(catalog[i].id); }
        config.slides = ids.slice(0);
        function allowed(id) { return ids.indexOf(id) >= 0 && config.removed.indexOf(id) < 0; }
        function clean(values) {
            var result = [], j;
            if (Object.prototype.toString.call(values) !== '[object Array]') { return result; }
            for (j = 0; j < values.length; j += 1) { if (ids.indexOf(values[j]) >= 0 && result.indexOf(values[j]) < 0) { result.push(values[j]); } }
            return result;
        }
        try {
            stored = JSON.parse(options.read() || 'null');
            if (stored && stored.version === 1) {
                config.removed = clean(stored.removed); config.slides = clean(stored.slides);
                config.selected = allowed(stored.selected) ? stored.selected : null;
                config.interval = intervals.indexOf(stored.interval) >= 0 ? stored.interval : 10;
                config.enabled = stored.enabled === true;
            }
        } catch (ignore) {}
        function candidates() { return config.slides.filter(allowed); }
        function snapshot() {
            return {images:catalog.filter(function (image) { return allowed(image.id); }),active:active,
                enabled:config.enabled,interval:config.interval,slides:candidates(),error:error,preview:true};
        }
        function notify() { var value = snapshot(), j; for (j = 0; j < listeners.length; j += 1) { listeners[j](value); } }
        function save() {
            try { options.write(JSON.stringify({version:1,selected:config.selected,enabled:config.enabled,interval:config.interval,slides:config.slides,removed:config.removed})); }
            catch (ignore) { error = 'Browser storage is unavailable; changes last for this session.'; }
        }
        function cancel() { if (timer !== null) { options.cancel(timer); timer = null; } }
        function schedule() {
            cancel();
            if (!ended && config.enabled && candidates().length > 1) { timer = options.delay(next,config.interval * 1000); }
        }
        function show(id) {
            var request = ++generation;
            active = id; notify();
            options.paint(id,function (failed) {
                if (ended || request !== generation) { return; }
                if (failed) {
                    active = null; config.enabled = false; cancel(); error = 'Image could not be loaded. Mazda background restored.';
                    options.paint(null,function () {}); notify();
                }
            });
        }
        function next() {
            var choices = candidates(), index = choices.indexOf(active);
            timer = null;
            if (ended || !config.enabled || !choices.length) { return; }
            show(choices[(index + 1) % choices.length]); schedule();
        }
        function command(name, value) {
            if (ended) { throw new Error('Controller has been disposed.'); }
            error = '';
            if (name === 'select') {
                if (value !== null && !allowed(value)) { throw new Error('Unknown gallery image.'); }
                config.selected = value; config.enabled = false; cancel(); save(); show(value);
            } else if (name === 'slideshow-mode') {
                if (value !== 0 && intervals.indexOf(value) < 0) { throw new Error('Unsupported slideshow interval.'); }
                if (value !== 0 && !candidates().length) { throw new Error('Select at least one slideshow image.'); }
                config.enabled = value !== 0;
                if (value === 0) { config.selected = active; }
                else {
                    config.interval = value;
                    if (candidates().indexOf(active) < 0) { show(candidates()[0]); }
                }
                save(); schedule(); notify();
            } else if (name === 'slideshow') {
                if (!candidates().length) { throw new Error('Select at least one slideshow image.'); }
                config.enabled = !config.enabled;
                if (config.enabled && candidates().indexOf(active) < 0) { show(candidates()[0]); }
                save(); schedule(); notify();
            } else if (name === 'interval') {
                config.interval = intervals.indexOf(value) >= 0 ? value : intervals[(intervals.indexOf(config.interval) + 1) % intervals.length]; save(); schedule(); notify();
            } else if (name === 'include' || name === 'delete') {
                if (!allowed(value)) { throw new Error('Unknown gallery image.'); }
                if (name === 'delete') { config.removed.push(value); }
                else if (config.slides.indexOf(value) < 0) { config.slides.push(value); }
                else { config.slides.splice(config.slides.indexOf(value),1); }
                if (active === value && name === 'delete') { config.selected = null; show(null); }
                if (!candidates().length) { config.enabled = false; }
                else if (config.enabled && candidates().indexOf(active) < 0) { show(candidates()[0]); }
                save(); schedule(); notify();
            } else { throw new Error('Unsupported preview command.'); }
            return snapshot();
        }
        if (!candidates().length) { config.enabled = false; }
        active = config.selected;
        if (config.enabled && candidates().indexOf(active) < 0) { active = candidates()[0]; }
        show(active); schedule();
        return {snapshot:snapshot,command:command,replaceCatalog:function (images) {
            if (ended) { return; }
            catalog = images.slice(0); ids = [];
            for (i = 0; i < catalog.length; i += 1) { ids.push(catalog[i].id); }
            config.removed = clean(config.removed); config.slides = clean(config.slides);
            if (!allowed(config.selected)) { config.selected = null; }
            if (active !== null && !allowed(active)) { show(null); }
            if (!candidates().length) { config.enabled = false; }
            schedule(); notify();
        },subscribe:function (fn) {
            listeners.push(fn); fn(snapshot());
            return function () { var n = listeners.indexOf(fn); if (n >= 0) { listeners.splice(n,1); } };
        },dispose:function () { ended = true; generation += 1; cancel(); listeners = []; }};
    }
    global.WallpaperPreviewCore = {create:create};
}(window));

/* Local prototype adapter using the same OEM List2 factory as Applications. */
(function (global) {
    'use strict';
    function create(options) {
        options = options || {};
        var session = null, selection = null;
        function send(type, value) {
            if (session) { session.frame.contentWindow.postMessage({type:type,token:session.token,index:value},'*'); }
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
            if (session && session.control) { try { global.framework.destroyControl(session.control); } catch (ignore) {} session.control = null; }
        }
        function close() {
            var old = session, fw = global.framework, app;
            if (!old) { return; }
            global.clearTimeout(selection); selection = null; destroyList(); session = null;
            if (options.preview) { options.preview(null,null); }
            if (fw.sendEventToMmui === old.backWrapper) { fw.sendEventToMmui = old.originalSend; }
            if (old.container.parentNode) { old.container.parentNode.removeChild(old.container); }
            if (old.previewPane && old.previewPane.parentNode) { old.previewPane.parentNode.removeChild(old.previewPane); }
            old.frame.style.display = old.display;
            old.root.style.cssText = old.css; old.root.className = old.className;
            if (fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') {
                releaseBackButton();
                app = fw.getAppInstance('system');
                if (app._currentContextTemplate && typeof app._currentContextTemplate.handleControllerEvent === 'function') { app._currentContextTemplate.handleControllerEvent('acceptFocusFromLeft'); }
                if (!app._currentContextTemplate || !app._currentContextTemplate.divElt || app._currentContextTemplate.divElt.style.visibility !== 'hidden') {
                    if (app._currentContextTemplate && app._currentContextTemplate.list2Ctrl) { app._currentContextTemplate.list2Ctrl.setLineNumbers(); }
                    if (fw.common && fw.common.setSbNameId) { fw.common.setSbNameId('system','Applications'); }
                }
            }
        }
        function attach(frame, token) {
            var fw = global.framework, root = frame.parentNode, container, originalSend;
            if (session && session.frame === frame && session.token === token) { return; }
            close();
            if (!fw || typeof fw.instantiateControl !== 'function' || typeof fw.destroyControl !== 'function') { throw new Error('Mazda list factory unavailable.'); }
            container = document.createElement('div');
            container.className = 'TemplateWithStatusLeft List2Tmplt';
            container.style.cssText = 'position:absolute;left:0;top:0;width:740px;height:416px;';
            session = {frame:frame,source:frame.contentWindow,token:token,root:root,container:container,control:null,page:'',signature:'',
                css:root.style.cssText,className:root.className,display:frame.style.display,originalSend:fw.sendEventToMmui};
            frame.style.display = 'none';
            root.style.cssText = 'position:absolute;left:60px;top:64px;width:740px;height:416px;z-index:7;background:transparent;overflow:visible;';
            root.className = ''; root.appendChild(container);
            var style = document.createElement('style');
            style.textContent = '.wallpaperImportSplit .List2Ctrl{width:390px!important;overflow:hidden}.wallpaperImportSplit .List2Ctrl .line1{max-width:300px!important;overflow:hidden;text-overflow:ellipsis}.wallpaperImportSplit .List2Ctrl .mask,.wallpaperImportSplit .List2Ctrl .scroller{max-width:390px!important}';
            container.appendChild(style);
            session.splitStyle = style;
            originalSend = session.originalSend;
            session.backWrapper = function (uia, event) {
                if (session && event === 'Global.GoBack' && fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') {
                    session.frame.contentWindow.postMessage({type:'mzd-gui-input',token:session.token,action:'back',phase:'step'},'*'); return;
                }
                return originalSend.apply(this,arguments);
            };
            fw.sendEventToMmui = session.backWrapper;
        }
        function render(frame, token, menu) {
            var fw = global.framework, items = [], i, row, captured, signature, current, oldPage;
            if (!menu || typeof menu.title !== 'string' || !menu.rows || menu.rows.length > 202) { throw new Error('Invalid native menu.'); }
            attach(frame,token); current = session;
            // OEM StatusBar treats any .png substring as an icon path.
            if (fw.common && fw.common.setSbName) { fw.common.setSbName(menu.title.replace(/[.]png/gi,'')); }
            if (options.preview) { options.preview(menu.previewId || null,frame); }
            session.container.className = 'TemplateWithStatusLeft List2Tmplt' + (menu.split ? ' wallpaperImportSplit' : '');
            if (!session.previewPane) {
                session.previewPane = document.createElement('div');
                session.previewPane.style.cssText = 'position:absolute;left:408px;top:65px;width:300px;color:white;font-size:22px;white-space:normal;word-wrap:break-word;';
                session.root.appendChild(session.previewPane);
            }
            session.previewPane.style.display = menu.split ? 'block' : 'none';
            session.previewPane.innerHTML = '';
            if (menu.split && menu.rightPreview) {
                var preview = menu.rightPreview, picture, caption;
                if (preview.url && /^http:\/\/(?:localhost:8091\/usb-image\/|127\.0\.0\.1:[0-9]+\/image\/wallpaper-manager\/usb\/)/.test(preview.url)) {
                    picture = document.createElement('img'); picture.src = preview.url;
                    picture.style.cssText = 'width:300px;height:180px;object-fit:contain;'; session.previewPane.appendChild(picture);
                }
                caption = document.createElement('div'); caption.textContent = preview.error || preview.label || '';
                session.previewPane.appendChild(caption);
            }
            for (i = 0; i < menu.rows.length; i += 1) {
                row = menu.rows[i];
                items.push({appData:{wallpaperIndex:i},text1Id:null,text1:row.label,
                    itemStyle:row.checkable ? 'style03' : row.detail ? 'style06' : 'style01',
                    image1:row.checkable ? (row.radio ? 'radio' : 'tick') : '',checked:row.checked === true,
                    label1Id:null,label1:row.detail || '',hasCaret:row.caret === true,disabled:row.disabled === true});
            }
            signature = JSON.stringify(items); oldPage = session.page;
            if (session.control && oldPage === menu.page && session.signature === signature) { return; }
            if (session.control && oldPage === menu.page) {
                captured = session.control.getContextCapture();
                // setDataList alone empties the OEM scroller without repainting.
                session.control.setDataListAndUpdateItems({itemCountKnown:true,itemCount:items.length,items:items,vuiSupport:false});
                if (captured.focussedItem >= items.length) { captured.focussedItem = 0; captured.topItem = 0; }
                session.control.restoreContext(captured);
            } else {
                global.clearTimeout(selection); destroyList(); session.container.innerHTML = ''; session.container.appendChild(session.splitStyle);
                session.control = fw.instantiateControl('system',session.container,'List2Ctrl',{
                    titleConfiguration:'noTitle',numberedList:true,
                    focussedItem:menu.index || 0,
                    dataList:{itemCountKnown:true,itemCount:items.length,items:items,vuiSupport:false},
                    selectCallback:function (source, data) {
                        if (session !== current || source !== current.control || !data) { return; }
                        global.clearTimeout(selection);
                        selection = global.setTimeout(function () {
                            if (session === current && current.control === source) { send('wallpaper-native-select',data.wallpaperIndex); }
                        },0);
                    }
                });
                releaseBackButton();
                session.control.handleControllerEvent('acceptFocusInit');
            }
            session.page = menu.page; session.signature = signature;
        }
        function input(frame, token, action, phase) {
            var control, event, capture;
            if (!session || session.frame !== frame || session.token !== token || !session.control) { return; }
            control = session.control;
            if (action === 'rotateRight' || action === 'rotateLeft') {
                if (phase === 'release') { return; }
                event = action === 'rotateRight' ? 'cw' : 'ccw';
            } else {
                if (['up','down','left','right','select'].indexOf(action) < 0) { return; }
                if (phase === 'step') { dispatch(control,action + 'Start'); event = action; }
                else { event = phase === 'press' ? action + 'Start' : action; }
            }
            dispatch(control,event);
            capture = control.getContextCapture(); send('wallpaper-native-focus',capture.focussedItem);
        }
        return {render:render,input:input,close:close,owns:function (source, token) { return session && session.source === source && session.token === token; },check:function () {
            if (session && (!document.documentElement.contains(session.frame) || global.framework.getCurrentApp() !== 'system' || global.framework.getCurrCtxtId() !== 'Applications')) { close(); }
        }};
    }
    global.WallpaperNativeMenu = {create:create};
}(window));

/* CMU client factory. The shared service bridge supplies authenticated requests
 * and validated image URLs. Loading this file does not start or change anything. */
(function (global) {
    'use strict';
    function create(service, options) {
        options = options || {};
        var makeImage = options.makeImage || function () { return new Image(); };
        var delay = options.delay || function (fn, ms) { return global.setTimeout(fn, ms); };
        var cancel = options.cancel || function (id) { global.clearTimeout(id); };
        var busy = false;
        function request(operation, args, callback) {
            function received(error, result) {
                // Factory cjson encodes empty Lua tables as objects, including lists.
                var keys = ['images','items'], i, value;
                if (!error && result) {
                    for (i = 0; i < keys.length; i += 1) {
                        value = result[keys[i]];
                        if (value && Object.prototype.toString.call(value) === '[object Object]' && Object.keys(value).length === 0) { result[keys[i]] = []; }
                    }
                }
                callback(error,result);
            }
            try { service.request(operation,args,received); }
            catch (error) { callback(String(error.message || error)); }
        }
        function importImage(file, callback) {
            if (busy) { callback('Another import is already in progress.'); return; }
            if (!file || typeof file.source !== 'string' || typeof file.name !== 'string') { callback('Invalid USB image selection.'); return; }
            busy = true;
            request('prepare',{source:file.source,name:file.name},function (error, prepared) {
                if (error) { busy = false; callback(error); return; }
                var picture, timer, finished = false;
                function complete(failure, result) { busy = false; callback(failure,result); }
                function abort(message) {
                    if (finished) { return; } finished = true; cancel(timer);
                    if (picture) { picture.onload = null; picture.onerror = null; picture.src = ''; }
                    request('abort',{ticket:prepared.ticket},function () { complete(message); });
                }
                timer = delay(function () { abort('Image validation timed out. Please retry.'); },15000);
                try {
                    picture = makeImage();
                    picture.onerror = function () { abort('Image could not be decoded.'); };
                    picture.onload = function () {
                        if (finished) { return; }
                        var width = typeof picture.naturalWidth === 'number' ? picture.naturalWidth : picture.width;
                        var height = typeof picture.naturalHeight === 'number' ? picture.naturalHeight : picture.height;
                        if (width !== 800 || height !== 480) { abort('Required: 800 x 480 pixels.'); return; }
                        finished = true; cancel(timer); picture.onload = null; picture.onerror = null;
                        request('commit',{ticket:prepared.ticket,width:width,height:height},function (failure, result) {
                            if (failure) { request('abort',{ticket:prepared.ticket},function () { complete(failure); }); }
                            else { complete(null,result); }
                        });
                    };
                    picture.src = prepared.url;
                } catch (failure) { abort(String(failure.message || failure)); }
            });
        }
        return {
            gallery:function (callback) { request('gallery',{},callback); },
            usb:function (callback) { request('usb',{},callback); },
            importImage:importImage,
            remove:function (id, callback) { request('delete',{id:id},callback); }
        };
    }
    global.WallpaperCmuImportClient = {create:create};
}(window));

window.MzdGuiResidents.register("wallpaper-manager",function (context) {
/* Resident host; gallery/settings belong to the installed service. */
(function (context) {
    'use strict';
    if (window.WallpaperManager) { return; }
    var original = 'common/images/background.png', desired = original, request = 0;
    var menuPreview = null, previewOwner = null, previewPath = null, previewRequest = 0;
    var catalog = [], savedSettings = null, stagedSettings = null, saving = false, retry = null, loadSequence = 0, mutation = 0;
    function updateBackground() {
        var fw = window.framework, common = fw && fw.common, visible = desired;
        if (!common) { return; }
        common._defaultBgPath = desired;
        if (previewPath && previewOwner && document.documentElement.contains(previewOwner) &&
            fw.getCurrentApp() === 'system' && fw.getCurrCtxtId() === 'Applications') { visible = previewPath; }
        if (!common._customBgSet) {
            common._currentBgPath = visible;
            if (common._bgDiv1 && common._bgDiv1.style.backgroundImage !== 'url("' + visible + '")') { common._bgDiv1.style.backgroundImage = 'url("' + visible + '")'; }
            if (common._bgDiv2) { common._bgDiv2.style.backgroundImage = 'url("' + visible + '")'; }
        }
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
        var value = core ? core.snapshot() : {images:[],active:null,enabled:false,interval:10,slides:[],error:'',preview:true};
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
        loading = false; core.subscribe(broadcast); window.WallpaperManager = core;
    }
    function replace(images) { catalog = images; core.replaceCatalog(images); }
    function reply(event, data, error, notice) {
        if (hostEnded) { return; }
        try { event.source.postMessage({type:'wallpaper-preview-response',token:data.token,id:data.id,state:snapshot(),error:error || '',notice:notice || ''},'*'); } catch (ignore) {}
    }
    function frameToken(source) {
        var current = context.view();
        return current && current.source === source ? current.token : '';
    }
    var nativeMenu = window.WallpaperNativeMenu.create({preview:setMenuPreview});
    function receive(event) {
        var data = event.data, token = frameToken(event.source), result, error = '', frames, frame, i;
        if (data && data.type === 'wallpaper-native-release' && nativeMenu.owns(event.source,data.token)) { nativeMenu.close(); return; }
        if (!token || !data || data.token !== token) { return; }
        if (data.type === 'wallpaper-native-render' || data.type === 'wallpaper-native-input') {
            frames = document.getElementsByTagName('iframe');
            for (i = 0; i < frames.length; i += 1) { if (frames[i].contentWindow === event.source) { frame = frames[i]; } }
            if (!frame) { return; }
            try {
                if (data.type === 'wallpaper-native-render') { nativeMenu.render(frame,token,data.menu); }
                else { nativeMenu.input(frame,token,data.action,data.phase); }
            } catch (failure) {
                nativeMenu.close();
                event.source.postMessage({type:'wallpaper-native-error',token:token,message:String(failure.message || failure)},'*');
            }
            return;
        }
        if (data.type !== 'wallpaper-preview-request' || typeof data.id !== 'number') { return; }
        if (data.command === 'state') {
            reply(event,data);
            if (core && !saving && !importing) {
                var baseline = mutation;
                client.gallery(function (failure, result) {
                    if (failure || hostEnded || baseline !== mutation || saving || importing) { return; }
                    function configKey(value) { value = value || {}; return JSON.stringify([value.selected || null,value.enabled === true,value.interval,Array.isArray(value.slides) ? value.slides : []]); }
                    function catalogKey(images) { return JSON.stringify(images.map(function (row) { return [row.id,row.label,row.url,row.bytes]; })); }
                    if (configKey(savedSettings) !== configKey(result.settings)) { initialize(result.images,result.settings); }
                    else if (catalogKey(catalog) !== catalogKey(result.images)) { replace(result.images); }
                });
            }
            return;
        }
        if (!core) { reply(event,data,'Gallery is still loading.'); return; }
        if (saving) { reply(event,data,'Settings are still being saved.'); return; }
        mutation += 1;
        if (data.command === 'usb-list') {
            if (!client) { usb = {status:'unavailable',items:[]}; reply(event,data); return; }
            usb = {status:'loading',items:[]}; broadcast();
            client.usb(function (failure, result) { usb = failure ? {status:'unavailable',items:[],error:failure} : result; reply(event,data); }); return;
        }
        if (data.command === 'import-one') {
            if (!client || importing) { reply(event,data,'Import is unavailable or already in progress.'); return; }
            importing = true; broadcast();
            client.importImage(data.value,function (failure, result) {
                importing = false;
                if (!failure) { replace(result.images); }
                reply(event,data,failure,failure ? '' : 'Image imported.');
            }); return;
        }
        if (data.command === 'delete' && client) {
            client.remove(data.value,function (failure, result) {
                if (!failure) { initialize(result.images,result.settings); }
                reply(event,data,failure);
            }); return;
        }
        stagedSettings = null;
        try { core.command(data.command,data.value); }
        catch (failure) { error = String(failure.message || failure); }
        if (!error && stagedSettings) {
            saving = true;
            context.service.request('save',stagedSettings,function (failure, result) {
                saving = false;
                if (hostEnded) { return; }
                if (failure) { initialize(catalog,savedSettings); }
                else { savedSettings = result.settings; }
                reply(event,data,failure);
            });
        } else { reply(event,data,error); }
    }
    function broadcast() {
        var frames = document.getElementsByTagName('iframe'), i, token;
        for (i = 0; i < frames.length; i += 1) {
            token = frameToken(frames[i].contentWindow);
            if (token) { try { frames[i].contentWindow.postMessage({type:'wallpaper-preview-response',token:token,id:0,state:snapshot(),error:''},'*'); } catch (ignore) {} }
        }
    }
    var refresh = window.setInterval(function () { updateBackground(); nativeMenu.check(); },500);
    context.onMessage(receive);
    context.onViewClose(function () { nativeMenu.close(); });
    context.onDispose(function () { hostEnded = true; nativeMenu.close(); if (core) { core.dispose(); } window.clearInterval(refresh); window.clearTimeout(retry); desired = original; previewPath = null; updateBackground(); delete window.WallpaperManager; });
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

});
