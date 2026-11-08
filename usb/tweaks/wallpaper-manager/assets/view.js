(function () {
    'use strict';
    var sdk = window.MzdGuiModule, status = document.getElementById('status');
    var ended = false, state = null, page = 'home', index = 0, chosen = null, positions = {}, notice = '', rawNotice = '', usbChosen = null, pendingCommand = '';
    var match = /(?:^|[&#])mzdgui=([a-zA-Z0-9-]+)(?:&|$)/.exec(window.location.hash);
    var token = match ? match[1] : '', sequence = 0, pending = 0, timeout = null;
    var intervals = [5,10,30,60,120,300];
    function tr(key, fallback, values) {
        if (sdk && sdk.t) { return sdk.t(key,fallback,values); }
        return fallback.replace(/\{([a-zA-Z0-9_]+)\}/g,function (match,name) { return values && Object.prototype.hasOwnProperty.call(values,name) ? String(values[name]) : match; });
    }
    function message(value) {
        if (!value) { return ''; }
        if (value === 'Image imported.') { return tr('imported','Image imported.'); }
        if (/Mazda background restored/.test(value)) { return tr('errorRestored','Image could not be loaded. Mazda background restored.'); }
        if (/Select at least one slideshow image/.test(value)) { return tr('chooseSlides','Select at least one slideshow image.'); }
        if (/space|quota|capacity|Gallery.*full|Gallery.*limit/i.test(value)) { return tr('errorSpace','Not enough gallery space. Delete an image and retry.'); }
        if (/USB|stick|mount|disconnected/i.test(value)) { return tr('errorUsb','USB image is unavailable. Reconnect the stick and refresh.'); }
        if (/PNG|800|480|1 MiB|decode|truncated|image is empty|checksum/i.test(value)) { return tr('errorImage','Invalid image. Use a PNG, 800 x 480 pixels, up to 1 MiB.'); }
        if (/already|progress|being saved|still loading/i.test(value)) { return tr('errorBusy','Please wait for the current operation to finish.'); }
        if (/service|starting|timed out/i.test(value)) { return tr('serviceUnavailable','Wallpaper service is unavailable. Please retry.'); }
        return tr('errorGeneric','The action could not be completed. Please retry.');
    }
    function post(data) { data.token = token; window.parent.postMessage(data,'*'); }
    function image(id) {
        var i;
        if (state) { for (i = 0; i < state.images.length; i += 1) { if (state.images[i].id === id) { return state.images[i]; } } }
        return null;
    }
    function entries() {
        var result = [], i, row;
        if (page === 'gallery') {
            for (i = 0; i < state.images.length; i += 1) {
                row = state.images[i]; result.push({id:row.id,label:row.label,detail:state.active === row.id ? tr('active','Active') : '',caret:true});
            }
            if (!result.length) { result.push({id:'hint',label:tr('noImages','No PNG images found'),disabled:true}); }
            return result;
        }
        if (page === 'import') {
            var usb = state.usb || {status:'idle',items:[]};
            if (usb.status === 'ready') {
                for (i = 0; i < usb.items.length; i += 1) { row = usb.items[i]; result.push({id:'usb-file',name:row.name,label:row.label,caret:true}); }
            } else {
                result.push({id:'hint',label:usb.status === 'missing' ? tr('folderHint','Create wallpapers in USB root') : usb.status === 'empty' ? tr('noImages','No PNG images found') : usb.status === 'loading' ? tr('readingUsb','Reading USB...') : tr('connectUsb','Connect USB with wallpapers folder'),disabled:true});
                result.push({id:'hint',label:tr('limits','PNG: 800 x 480, max. 1 MiB'),disabled:true});
            }
            result.push({id:'retry',label:tr('refresh','Refresh USB')}); return result;
        }
        if (page === 'import-image') {
            return [{id:'import-one',label:state.importing ? tr('importing','Importing...') : tr('importImage','Import image'),disabled:state.importing || !usbChosen || !!usbChosen.error},
                {id:'hint',label:usbChosen && message(usbChosen.error) || tr('limits','800 x 480 pixels, max. 1 MiB'),disabled:true}];
        }
        if (page === 'image') {
            return [{id:'apply',label:tr('useBackground','Use as background'),checkable:true,checked:state.active === chosen},
                {id:'include',label:tr('include','Include in slideshow'),checkable:true,checked:state.slides.indexOf(chosen) >= 0},
                {id:'delete',label:tr('delete','Delete image'),caret:true}];
        }
        if (page === 'delete') { return [{id:'cancel',label:tr('cancel','Cancel')},{id:'confirm',label:tr('delete','Delete image')}]; }
        if (page === 'slideshow') {
            result.push({id:'mode',seconds:0,label:tr('off','Off'),checkable:true,radio:true,checked:!state.enabled});
            for (i = 0; i < intervals.length; i += 1) {
                result.push({id:'mode',seconds:intervals[i],label:tr('seconds','{seconds} seconds',{seconds:intervals[i]}),checkable:true,radio:true,checked:state.enabled && state.interval === intervals[i]});
            }
            return result;
        }
        return [{id:'gallery',label:tr('gallery','Gallery'),detail:tr('images','{count} images',{count:state.images.length}),caret:true},
            {id:'slideshow',label:tr('slideshow','Slideshow'),detail:state.enabled ? tr('seconds','{seconds} seconds',{seconds:state.interval}) : tr('off','Off'),caret:true},
            {id:'import',label:tr('import','Import from USB'),disabled:!state.importAvailable,caret:true},
            {id:'original',label:tr('restore','Use original background'),checkable:true,checked:state.active === null}];
    }
    function request(command,value) {
        if (ended || pending) { return; }
        pending = ++sequence; pendingCommand = command;
        post({type:'wallpaper-preview-request',id:pending,command:command,value:value});
        timeout = window.setTimeout(function () { pending = 0; status.textContent = tr('serviceUnavailable','Wallpaper service is unavailable. Please retry.'); },command === 'import-one' ? 120000 : 30000);
    }
    function open(next) { positions[page] = index; page = next; index = positions[page] || 0; render(); }
    function back() {
        notice = ''; rawNotice = '';
        if (!state || page === 'home') { return false; }
        if (page === 'import-image') { page = 'import'; }
        else if (page === 'import') { page = 'home'; }
        else if (page === 'image') { page = 'gallery'; }
        else if (page === 'delete') { page = 'image'; }
        else { page = 'home'; }
        index = positions[page] || 0; render(); return true;
    }
    function activate(position) {
        if (ended || !state || pending) { return; }
        notice = ''; rawNotice = ''; index = position;
        var row = entries()[index];
        if (!row || row.disabled) { return; }
        positions[page] = index;
        if (row.id === 'cancel') { back(); return; }
        if (row.id === 'original') { request('select',null); return; }
        if (row.id === 'import' || row.id === 'retry') { open('import'); request('usb-list'); return; }
        if (row.id === 'usb-file') { usbChosen = state.usb.items[index]; open('import-image'); return; }
        if (row.id === 'import-one') { request('import-one',{source:usbChosen.source || 'sda1',name:usbChosen.name}); return; }
        if (page === 'gallery') { chosen = row.id; positions.image = 0; open('image'); return; }
        if (row.id === 'apply') { request('select',chosen); return; }
        if (row.id === 'include') { request('include',chosen); return; }
        if (row.id === 'confirm') { page = 'gallery'; index = 0; positions.gallery = 0; request('delete',chosen); return; }
        if (row.id === 'mode') { request('slideshow-mode',row.seconds); return; }
        open(row.id);
    }
    function render() {
        if (ended || !state) { return; }
        var list = entries(), row = image(chosen), heading;
        if (index >= list.length) { index = 0; }
        heading = {home:tr('gui.label','Wallpaper Manager'),gallery:tr('gallery','Gallery'),image:row ? row.label : tr('wallpaper','Wallpaper'),slideshow:tr('slideshow','Slideshow'),'delete':tr('deleteTitle','Delete image?'),import:tr('import','Import from USB'),'import-image':usbChosen ? usbChosen.name : tr('importImage','Import image')}[page];
        var right = page === 'import-image' ? usbChosen : page === 'import' && state.usb && state.usb.items ? state.usb.items[index] : null;
        if (right && right.error) { right = {url:right.url,label:right.label,error:message(right.error)}; }
        post({type:'wallpaper-native-render',menu:{page:page,title:notice || heading,rows:list,index:index,rightPreview:right,split:page === 'import-image' || page === 'import' && !!right,previewId:(page === 'image' || page === 'delete') && row ? row.id : null}});
    }
    function receive(event) {
        var data = event.data;
        if (event.source !== window.parent || !data || data.token !== token || ended) { return; }
        if (data.type === 'wallpaper-native-select') { activate(data.index); return; }
        if (data.type === 'wallpaper-native-focus') { if (typeof data.index === 'number' && data.index >= 0) { index = data.index; positions[page] = index; if (page === 'import') { render(); } } return; }
        if (data.type === 'wallpaper-native-error') { status.textContent = tr('menuError','The Mazda menu could not be opened. Please reopen the app.'); return; }
        if (data.type !== 'wallpaper-preview-response' || !data.state || data.id !== 0 && data.id !== pending) { return; }
        if (data.id !== 0) { window.clearTimeout(timeout); pending = 0; if (pendingCommand === 'import-one' && !data.error) { page = 'gallery'; index = 0; positions.gallery = 0; } pendingCommand = ''; }
        state = data.state; rawNotice = data.error || data.notice || state.error || ''; notice = message(rawNotice); status.textContent = notice; render();
    }
    function input(action, phase) {
        if (ended) { return false; }
        if (action === 'back') { if (phase === 'press') { return true; } return back(); }
        if (state) { post({type:'wallpaper-native-input',action:action,phase:phase}); }
        return true;
    }
    function dispose() { if (ended) { return; } post({type:'wallpaper-native-release'}); ended = true; window.clearTimeout(timeout); window.removeEventListener('message',receive,false); }
    if (!sdk) { status.textContent = tr('openApps','Open through Applications.'); return; }
    sdk.setLayout('with-status-bar');
    window.addEventListener('message',receive,false); sdk.onInput(input); sdk.onDispose(dispose); sdk.ready();
    if (sdk.loadLanguage) { sdk.loadLanguage(function (language, direction) {
        document.documentElement.lang = language.replace('_','-'); status.dir = direction;
        if (state) { notice = message(rawNotice); render(); }
        else { status.textContent = tr('opening','Opening Wallpaper Manager...'); }
    }); }
    request('state');
}());
