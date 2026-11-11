(function () {
    'use strict';
    var sdk = window.MzdGuiModule, status = document.getElementById('status');
    if (!sdk) {
        if (status) { status.textContent = 'Open through Applications'; }
        return;
    }
    var token = sdk.token, tr = sdk.t;
    var ended = false, state = null, page = 'home', index = 0, chosen = null, positions = {}, notice = '', usbChosen = null, pending = false, lastBroadcastError = '';
    var dialogAction = null;
    var intervals = [5,10,30,60,120,300];
    function stripExt(name) {
        return typeof name === 'string' ? name.replace(/\.[a-zA-Z0-9]+$/, '') : '';
    }
    function message(value) {
        if (!value) { return ''; }
        if (/^Image imported\.?$/.test(value)) { return tr('imported','Image imported'); }
        if (/Mazda background restored/.test(value)) { return tr('errorRestored','Image could not be loaded. Mazda background restored'); }
        if (/Select at least one slideshow image/.test(value)) { return tr('chooseSlides','Select at least one slideshow image'); }
        if (/space|quota|capacity|Gallery.*full|Gallery.*limit/i.test(value)) { return tr('errorSpace','Not enough gallery space. Delete an image and retry'); }
        if (/USB|stick|mount|disconnected/i.test(value)) { return tr('errorUsb','USB image is unavailable. Reconnect the stick and refresh'); }
        if (/PNG|800|480|1 MiB|decode|truncated|image is empty|checksum/i.test(value)) { return tr('errorImage','Invalid image. Use a PNG, 800 x 480 pixels, up to 1 MiB'); }
        if (/already|progress|being saved|still loading/i.test(value)) { return tr('errorBusy','Please wait for the current operation to finish'); }
        if (/service|starting|timed out/i.test(value)) { return tr('serviceUnavailable','Wallpaper service is unavailable. Please retry'); }
        return tr('errorGeneric','The action could not be completed. Please retry');
    }
    function post(data) { data.token = token; window.parent.postMessage(data,'*'); }
    function image(id) {
        var i;
        if (state) { for (i = 0; i < state.images.length; i += 1) { if (state.images[i].id === id) { return state.images[i]; } } }
        return null;
    }
    function formatInterval(seconds) {
        if (seconds > 59) {
            var minutes = Math.round(seconds / 60);
            return tr('minutes', '{minutes} min', {minutes: minutes});
        }
        return tr('seconds', '{seconds} s', {seconds: seconds});
    }
    function entries() {
        var result = [], i, row;
        if (page === 'gallery') {
            for (i = 0; i < state.images.length; i += 1) {
                row = state.images[i];
                var detail = '';
                var inSlides = state.slides && state.slides.indexOf(row.id) >= 0;
                if (state.enabled) {
                    if (inSlides) { detail = tr('slideshow','Slideshow'); }
                } else {
                    var isSelectedBg = (state.selected ? state.selected === row.id : state.active === row.id);
                    if (isSelectedBg) {
                        detail = tr('background','Background');
                    } else if (inSlides) {
                        detail = tr('slideshow','Slideshow');
                    }
                }
                result.push({id:row.id,label:stripExt(row.label),detail:detail,caret:true});
            }
            if (!result.length) { result.push({id:'hint',label:tr('noImages','No PNG images found'),disabled:true}); }
            return result;
        }
        if (page === 'import') {
            var usb = state.usb || {status:'idle',items:[]};
            if (usb.status === 'ready') {
                for (i = 0; i < usb.items.length; i += 1) { row = usb.items[i]; result.push({id:'usb-file',name:row.name,label:stripExt(row.label),caret:true}); }
            } else {
                result.push({id:'hint',label:usb.status === 'missing' ? tr('folderHint','Create wallpapers in USB root') : usb.status === 'empty' ? tr('noImages','No PNG images found') : usb.status === 'loading' ? tr('readingUsb','Reading USB...') : tr('connectUsb','Connect USB with wallpapers folder'),disabled:true});
                result.push({id:'hint',label:tr('limits','PNG: 800 x 480, max. 1 MiB'),disabled:true});
            }
            result.push({id:'retry',label:tr('refresh','Refresh USB'),image1:'common/images/icons/IcnListSynchronize_En.png',itemStyle:'style02'}); return result;
        }
        if (page === 'import-image') {
            return [{id:'import-one',label:state.importing ? tr('importing','Importing...') : tr('importImage','Import image'),image1:'common/images/icons/IcnListImport_En.png',itemStyle:'style02',disabled:state.importing || !usbChosen || !!usbChosen.error},
                {id:'hint-name',label:usbChosen ? stripExt(usbChosen.label || usbChosen.name) : '',disabled:true},
                {id:'hint',label:usbChosen && message(usbChosen.error) || tr('limits','PNG: 800 x 480, max. 1 MiB'),disabled:true}];
        }
        if (page === 'image') {
            var isCheckedBg = !state.enabled && ((state.selected && state.selected === chosen) || (!state.selected && state.active === chosen));
            return [{id:'apply',label:tr('useBackground','Use as static background'),checkable:true,checked:isCheckedBg},
                {id:'include',label:tr('include','Include in slideshow'),checkable:true,checked:state.slides.indexOf(chosen) >= 0},
                {id:'delete',label:tr('delete','Delete image'),image1:'common/images/icons/IcnListDelete_En.png',itemStyle:'style02'}];
        }
        if (page === 'slideshow') {
            result.push({id:'mode',seconds:0,label:tr('off','Off'),checkable:true,checked:!state.enabled});
            for (i = 0; i < intervals.length; i += 1) {
                result.push({id:'mode',seconds:intervals[i],label:formatInterval(intervals[i]),checkable:true,checked:state.enabled && state.interval === intervals[i]});
            }
            return result;
        }
        return [{id:'gallery',label:tr('gallery','Gallery'),detail:tr('images','{count} images',{count:state.images.length}),caret:true},
            {id:'slideshow',label:tr('slideshow','Slideshow'),detail:state.enabled ? formatInterval(state.interval) : tr('off','Off'),caret:true},
            {id:'import',label:tr('import','Import from USB'),disabled:!state.importAvailable,caret:true},
            {id:'original',label:tr('restore','Use original background'),checkable:true,checked:state.active === null}];
    }
    function execute(command, value) {
        if (ended || pending) { return; }
        pending = true;
        var timeoutMs = command === 'import-one' ? 120000 : 30000;
        sdk.request(command, { value: value }, function (error, result) {
            pending = false;
            if (ended) { return; }
            if (command === 'import-one' && !error) { page = 'gallery'; index = 0; positions.gallery = 0; }
            if (command === 'slideshow-mode' && !error && !(result && result.state && result.state.error)) { page = 'home'; index = positions.home || 0; }
            if (result && result.state) {
                state = result.state;
                var raw = error || result.notice || state.error || '';
                if (raw) {
                    notice = message(raw);
                    var isErr = !(result.notice && !error && !state.error);
                    sdk.notify(notice, isErr);
                    if (status) { status.textContent = notice; }
                }
                render();
            } else if (error) {
                notice = message(error);
                sdk.notify(notice, true);
                if (status) { status.textContent = notice; }
            }
        }, timeoutMs);
    }
    function open(next) { positions[page] = index; page = next; index = positions[page] || 0; render(); }
    function back() {
        notice = '';
        if (!state || page === 'home') { return false; }
        if (page === 'import-image') { page = 'import'; }
        else if (page === 'import') { page = 'home'; }
        else if (page === 'image') { page = 'gallery'; }
        else { page = 'home'; }
        index = positions[page] || 0; render(); return true;
    }
    function activate(position) {
        if (ended || !state || pending) { return; }
        notice = ''; index = position;
        var row = entries()[index];
        if (!row || row.disabled) { return; }
        positions[page] = index;
        if (row.id === 'original') { execute('select', null); return; }
        if (row.id === 'import' || row.id === 'retry') { open('import'); execute('usb-list'); return; }
        if (row.id === 'usb-file') { usbChosen = state.usb.items[index]; open('import-image'); return; }
        if (row.id === 'import-one') { execute('import-one', { source: usbChosen.source || 'sda1', name: usbChosen.name }); return; }
        if (page === 'gallery') { chosen = row.id; positions.image = 0; open('image'); return; }
        if (row.id === 'apply') {
            if (state.enabled) {
                dialogAction = 'apply';
                post({
                    type: 'wallpaper-native-dialog',
                    dialog: {
                        text: tr('stopSlideshowConfirm', 'The slideshow is running. Do you want to stop the slideshow and use this image as the background?'),
                        buttons: [
                            { value: 'no', labelId: 'common.No' },
                            { value: 'yes', labelId: 'common.Yes' }
                        ],
                        initialFocus: 0
                    }
                });
                render();
                return;
            }
            execute('select', chosen);
            return;
        }
        if (row.id === 'include') { execute('include', chosen); return; }
        if (row.id === 'delete') {
            dialogAction = 'delete';
            post({
                type: 'wallpaper-native-dialog',
                dialog: {
                    text: tr('deleteConfirm', 'Do you want to delete this image?'),
                    buttons: [
                        { value: 'no', labelId: 'common.No' },
                        { value: 'yes', labelId: 'common.Yes' }
                    ],
                    initialFocus: 0
                }
            });
            return;
        }
        if (row.id === 'mode') { execute('slideshow-mode', row.seconds); return; }
        open(row.id);
    }
    function render() {
        if (ended || !state) { return; }
        var list = entries(), row = image(chosen), heading;
        if (index >= list.length) { index = 0; }
        heading = {home:tr('gui.label','Wallpaper Manager'),gallery:tr('gallery','Gallery'),image:row ? stripExt(row.label) : tr('wallpaper','Wallpaper'),slideshow:tr('slideshow','Slideshow'),import:tr('import','Import from USB'),'import-image':tr('importImage','Import image')}[page];
        var right = page === 'import-image' ? usbChosen : page === 'import' && state.usb && state.usb.items ? state.usb.items[index] : null;
        if (right && right.error) { right = {url:right.url,label:stripExt(right.label),error:message(right.error)}; }
        post({type:'wallpaper-native-render',menu:{page:page,title:heading,rows:list,index:index,rightPreview:right,split:page === 'import-image' || page === 'import' && !!right,previewId:page === 'image' && row ? row.id : null}});
    }
    function receive(event) {
        var data = event.data;
        if (event.source !== window.parent || !data || data.token !== token || ended) { return; }
        if (data.type === 'wallpaper-native-select') { activate(data.index); return; }
        if (data.type === 'wallpaper-native-dialog-select') {
            post({type:'wallpaper-native-dialog',dialog:null});
            if (data.value === 'yes') {
                if (dialogAction === 'delete') {
                    dialogAction = null;
                    page = 'gallery'; index = 0; positions.gallery = 0;
                    execute('delete', chosen);
                    return;
                }
                if (dialogAction === 'apply') {
                    dialogAction = null;
                    execute('select', chosen);
                    return;
                }
            }
            dialogAction = null;
            render();
            return;
        }
        if (data.type === 'wallpaper-native-focus') { if (typeof data.index === 'number' && data.index >= 0) { index = data.index; positions[page] = index; if (page === 'import') { render(); } } return; }
        if (data.type === 'wallpaper-native-error') {
            if (data.scope === 'dialog') { dialogAction = null; render(); return; }
            if (!data.scope || data.scope === 'menu') { status.textContent = tr('menuError','The Mazda menu could not be opened. Please reopen the app'); }
            return;
        }
        if (data.type === 'wallpaper-preview-response' && data.id === 0 && data.state) {
            state = data.state;
            var broadcastErr = data.error || data.notice || state.error || '';
            if (broadcastErr && broadcastErr !== lastBroadcastError) {
                lastBroadcastError = broadcastErr;
                notice = message(broadcastErr);
                sdk.notify(notice, true);
                if (status) { status.textContent = notice; }
            } else if (!broadcastErr) {
                lastBroadcastError = '';
            }
            render();
        }
    }
    function input(action, phase) {
        if (ended) { return false; }
        if (action === 'back') { if (phase === 'press') { return true; } return back(); }
        if (state) { post({type:'wallpaper-native-input',action:action,phase:phase}); }
        return true;
    }
    function dispose() { if (ended) { return; } post({type:'wallpaper-native-release'}); ended = true; window.removeEventListener('message',receive,false); }
    sdk.setLayout('with-status-bar');
    window.addEventListener('message',receive,false); sdk.onInput(input); sdk.onDispose(dispose); sdk.ready();
    if (sdk.loadLanguage) { sdk.loadLanguage(function (language, direction) {
        document.documentElement.lang = language.replace('_','-'); status.dir = direction;
        if (state) { render(); }
        else { status.textContent = tr('opening','Opening Wallpaper Manager...'); }
    }); }
    execute('state');
}());
