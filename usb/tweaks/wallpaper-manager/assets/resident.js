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
                selected:config.selected,
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
                    active = null; config.enabled = false; cancel(); error = 'Image could not be loaded. Mazda background restored';
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
                if (value !== 0 && !candidates().length) { throw new Error('Select at least one slideshow image'); }
                config.enabled = value !== 0;
                if (value === 0) { config.selected = active; }
                else {
                    config.interval = value;
                    if (candidates().indexOf(active) < 0) { show(candidates()[0]); }
                }
                save(); schedule(); notify();
            } else if (name === 'slideshow') {
                if (!candidates().length) { throw new Error('Select at least one slideshow image'); }
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

/* Local prototype adapter delegating to the shared native menu factory. */
(function (global) {
    'use strict';
    function create(options) {
        options = options || {};
        options.prefix = 'wallpaper';
        options.split = true;
        if (global.MzdGuiResidents && typeof global.MzdGuiResidents.createNativeMenu === 'function') {
            return global.MzdGuiResidents.createNativeMenu(options);
        }
        throw new Error('MzdGuiResidents native menu factory unavailable.');
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
        var value = core ? core.snapshot() : {images:[],active:null,selected:null,enabled:false,interval:10,slides:[],error:'',preview:true};
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
    function frameToken(source) {
        var current = context.view();
        return current && current.source === source ? current.token : '';
    }
    var nativeMenu = context.createNativeMenu({prefix:'wallpaper',split:true,dialog:true,preview:setMenuPreview});
    function receive(event) {
        var data = event.data, token = frameToken(event.source), frames, frame, i;
        if (data && data.type === 'wallpaper-native-release' && nativeMenu.owns(event.source,data.token)) { nativeMenu.close(); return; }
        if (!token || !data || data.token !== token) { return; }
        if (data.type === 'wallpaper-native-render' || data.type === 'wallpaper-native-input' || data.type === 'wallpaper-native-dialog') {
            frames = document.getElementsByTagName('iframe');
            for (i = 0; i < frames.length; i += 1) { if (frames[i].contentWindow === event.source) { frame = frames[i]; } }
            if (!frame) { return; }
            try {
                if (data.type === 'wallpaper-native-render') { nativeMenu.render(frame,token,data.menu); }
                else if (data.type === 'wallpaper-native-dialog') { nativeMenu.dialog(frame,token,data.dialog); }
                else { nativeMenu.input(frame,token,data.action,data.phase); }
            } catch (failure) {
                nativeMenu.close();
                event.source.postMessage({type:'wallpaper-native-error',token:token,scope:data.type === 'wallpaper-native-dialog' ? 'dialog' : 'menu',message:String(failure.message || failure)},'*');
            }
        }
    }
    context.onServiceRequest(function (command, args, callback) {
        if (hostEnded) { return; }
        var value = args && Object.prototype.hasOwnProperty.call(args, 'value') ? args.value : args;
        var error = '';
        if (command === 'state') {
            callback(null, { state: snapshot() });
            if (core && !saving && !importing) {
                var baseline = mutation;
                client.gallery(function (failure, result) {
                    if (failure || hostEnded || baseline !== mutation || saving || importing) { return; }
                    function configKey(v) { v = v || {}; return JSON.stringify([v.selected || null, v.enabled === true, v.interval, Array.isArray(v.slides) ? v.slides : []]); }
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
                else { savedSettings = result.settings; }
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
