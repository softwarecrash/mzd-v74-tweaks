/*
 * mzd-emu only: emulates GUI module services, which run as Lua on the CMU.
 * tools/preview-menu.sh --emu puts this before the real boot hook. Keep each
 * module's operations and results in sync with its assets/service/entry.lua.
 */
(function () {
    'use strict';
    if (window.MzdGuiServices) { return; }
    var defaults = window.mzdPreviewServiceDefaults || {}, listeners = [];

    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function stored(key, fallback) {
        try { var text = window.localStorage.getItem(key); if (text) { return JSON.parse(text); } } catch (ignore) {}
        return copy(fallback);
    }

    // Android Auto: the libraries read libpatch.conf at boot. Saved settings
    // persist across page reloads, and an emulated reboot reloads the page.
    // Like entry.lua, a key's baseline is its value before its first write.
    function androidAuto() {
        var key = 'mzd-preview-android-auto', settings = stored(key, defaults['android-auto'] || {}), applied = {};
        if (typeof settings.resolution_dpi !== 'number') { settings.resolution_dpi = 141; }
        function remember(name) {
            if (!applied.hasOwnProperty(name)) { applied[name] = settings[name]; }
        }
        function result() {
            var name, rebootRequired = false;
            for (name in applied) { if (applied.hasOwnProperty(name) && settings[name] !== applied[name]) { rebootRequired = true; } }
            return {
                success: true,
                settings: copy(settings),
                limits: { resolution_dpi: { min: 100, max: 160, step: 1 } },
                unavailable: {},
                rebootRequired: rebootRequired
            };
        }
        function valid(name, value) {
            if (!settings.hasOwnProperty(name)) { return false; }
            if (name === 'resolution_dpi') { return typeof value === 'number' && value >= 100 && value <= 160; }
            if (name === 'hud_transport') { return value === 'svcnavi' || value === 'vbs'; }
            if (name === 'hud_maneuver_max_distance_m') { return typeof value === 'number' && value >= 0; }
            return typeof value === 'boolean';
        }
        function save() { window.localStorage.setItem(key, JSON.stringify(settings)); }
        return function (operation, args) {
            var name;
            if (window.mzdPreviewFailSave && (operation === 'set' || operation === 'save')) {
                throw new Error('Simulated save failure');
            }
            if (window.mzdPreviewFailReboot && operation === 'reboot') {
                throw new Error('Simulated reboot failure');
            }
            if (operation === 'get') { return result(); }
            if (operation === 'set') {
                if (!valid(args.key, args.value)) { throw new Error('Invalid setting'); }
                remember(args.key);
                settings[args.key] = args.value;
                save();
                return result();
            }
            if (operation === 'save') {
                for (name in args.settings || {}) {
                    if (args.settings.hasOwnProperty(name) && valid(name, args.settings[name])) {
                        remember(name);
                        settings[name] = args.settings[name];
                    }
                }
                save();
                return result();
            }
            if (operation === 'reboot') {
                if (!result().rebootRequired) { throw new Error('No saved changes to apply'); }
                window.setTimeout(function () { window.location.reload(); }, 1500);
                return { success: true };
            }
            throw new Error('Unknown operation: ' + operation);
        };
    }

    function wallpaperManager() {
        var key = 'mzd-preview-wallpaper-manager', palettes = [
            ['#09203f','#537895','#e8a65b','#183d58'],
            ['#16324f','#5b8c85','#f2d492','#2c5364'],
            ['#271b4a','#a64b79','#ffbd69','#45243b']
        ], names = ['Coastal dusk.png','Mountain lake.png','Desert evening.png'];
        var sequence = 100, pending = {}, base = [], imported = [], removed = [], settings;
        function artwork(palette) {
            var canvas = document.createElement('canvas'), ctx, sky;
            canvas.width = 800; canvas.height = 480; ctx = canvas.getContext('2d');
            sky = ctx.createLinearGradient(0,0,0,480);
            sky.addColorStop(0,palette[0]); sky.addColorStop(0.65,palette[1]); sky.addColorStop(1,palette[2]);
            ctx.fillStyle = sky; ctx.fillRect(0,0,800,480);
            ctx.beginPath(); ctx.arc(620,130,54,0,Math.PI*2); ctx.fillStyle = palette[2]; ctx.fill();
            ctx.beginPath(); ctx.moveTo(0,330); ctx.lineTo(180,140); ctx.lineTo(360,330);
            ctx.lineTo(505,175); ctx.lineTo(800,365); ctx.lineTo(800,480); ctx.lineTo(0,480);
            ctx.closePath(); ctx.fillStyle = palette[3]; ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0,390,800,90);
            return canvas.toDataURL('image/png');
        }
        function row(id,label,url) { return {id:id,label:label,url:url,bytes:url.length}; }
        function galleryRows() {
            var rows = [], all = base.concat(imported), i, j, hidden;
            for (i = 0; i < all.length; i += 1) {
                hidden = false;
                for (j = 0; j < removed.length; j += 1) { if (removed[j] === all[i].id) { hidden = true; break; } }
                if (!hidden) { rows.push(copy(all[i])); }
            }
            return rows;
        }
        function cleanSettings(value) {
            var rows = galleryRows(), ids = [], slides = [], i, j, selected = null, interval = value && value.interval;
            for (i = 0; i < rows.length; i += 1) { ids.push(rows[i].id); }
            if (value && typeof value.selected === 'string' && ids.indexOf(value.selected) >= 0) { selected = value.selected; }
            if (value && Array.isArray(value.slides)) {
                for (i = 0; i < value.slides.length; i += 1) {
                    if (ids.indexOf(value.slides[i]) >= 0 && slides.indexOf(value.slides[i]) < 0) { slides.push(value.slides[i]); }
                }
            }
            if ([5,10,30,60,120,300].indexOf(interval) < 0) { interval = 10; }
            return {version:1,selected:selected,enabled:!!(value && value.enabled && slides.length),interval:interval,slides:slides};
        }
        function persist() {
            try {
                window.localStorage.setItem(key,JSON.stringify({version:1,settings:settings,imported:imported,removed:removed}));
            } catch (error) { throw new Error('Wallpaper preview storage is unavailable: ' + String(error.message || error)); }
        }
        function result() { return {images:galleryRows(),settings:copy(settings)}; }
        function nextId() {
            sequence += 1;
            return 'img-' + ('00000000000000000000000000000000' + sequence.toString(16)).slice(-32);
        }
        var saved = stored(key,null), i;
        for (i = 0; i < palettes.length; i += 1) {
            base.push(row('img-' + ('0000000000000000000000000000000' + (i + 1).toString(16)).slice(-32),names[i],artwork(palettes[i])));
        }
        if (saved && saved.version === 1) {
            if (Array.isArray(saved.imported)) {
                imported = saved.imported.filter(function (item) {
                    return item && typeof item.id === 'string' && typeof item.label === 'string' &&
                        typeof item.url === 'string' && item.url.indexOf('data:image/png;base64,') === 0;
                }).map(function (item) { return row(item.id,item.label,item.url); });
            }
            if (Array.isArray(saved.removed)) { removed = saved.removed.filter(function (id) { return typeof id === 'string'; }); }
        }
        settings = cleanSettings(saved && saved.version === 1 ? saved.settings : null);
        function usbItems() {
            var items = [], i;
            for (i = 0; i < palettes.length; i += 1) {
                items.push({source:'sda1',name:'preview-' + names[i].toLowerCase().replace(/ /g,'-'),label:names[i],
                    bytes:base[i].bytes,url:base[i].url});
            }
            return items;
        }
        return function (operation,args) {
            var items, selected, found, i;
            args = args || {};
            if (operation === 'gallery') { return result(); }
            if (operation === 'save') {
                settings = cleanSettings(args); persist(); return {settings:copy(settings)};
            }
            if (operation === 'usb') { items = usbItems(); return {status:'ready',items:items}; }
            if (operation === 'prepare') {
                items = usbItems(); selected = null;
                for (i = 0; i < items.length; i += 1) {
                    if (items[i].source === args.source && items[i].name === args.name) { selected = items[i]; }
                }
                if (!selected) { throw new Error('Preview USB image was not found.'); }
                sequence += 1;
                pending['preview-' + sequence] = selected;
                return {ticket:'preview-' + sequence,url:selected.url,width:800,height:480,bytes:selected.bytes};
            }
            if (operation === 'commit') {
                selected = pending[args.ticket];
                if (!selected) { throw new Error('Preview import has expired.'); }
                if (args.width !== 800 || args.height !== 480) { throw new Error('Required: 800 x 480 pixels.'); }
                delete pending[args.ticket];
                imported.push(row(nextId(),selected.label,selected.url));
                settings = cleanSettings(settings); persist(); return result();
            }
            if (operation === 'abort') {
                if (!pending[args.ticket]) { throw new Error('Preview import has expired.'); }
                delete pending[args.ticket]; return {aborted:true};
            }
            if (operation === 'delete') {
                items = galleryRows(); found = false;
                for (i = 0; i < items.length; i += 1) { if (items[i].id === args.id) { found = true; } }
                if (!found) { throw new Error('Preview gallery image was not found.'); }
                imported = imported.filter(function (item) { return item.id !== args.id; });
                if (base.some(function (item) { return item.id === args.id; })) { removed.push(args.id); }
                settings = cleanSettings(settings); persist(); return result();
            }
            throw new Error('Unknown operation: ' + operation);
        };
    }

    function mzdTweaks() {
        var key = 'mzd-preview-mzd-tweaks';
        var schemaDefaults = {
            main_menu_loop: false,
            list_loop: false,
            list_beep: true,
            short_delay: false
        };
        var initial = defaults['mzd-tweaks'] || schemaDefaults;
        var settings = stored(key, initial);
        var name;

        for (name in schemaDefaults) {
            if (Object.prototype.hasOwnProperty.call(schemaDefaults, name)) {
                if (typeof settings[name] !== 'boolean') {
                    settings[name] = (initial && typeof initial[name] === 'boolean') ? initial[name] : schemaDefaults[name];
                }
            }
        }

        function applyGlobals() {
            if (!window.mzdTweaks) { window.mzdTweaks = {}; }
            for (var k in settings) {
                if (Object.prototype.hasOwnProperty.call(settings, k)) {
                    window.mzdTweaks[k] = settings[k];
                }
            }
        }

        function save() {
            try { window.localStorage.setItem(key, JSON.stringify(settings)); } catch (ignore) {}
        }

        applyGlobals();

        return function (operation, args) {
            args = args || {};
            if (operation === 'get') {
                applyGlobals();
                return { settings: copy(settings) };
            }
            if (operation === 'set') {
                if (typeof args.key !== 'string' || !Object.prototype.hasOwnProperty.call(schemaDefaults, args.key) || typeof args.value !== 'boolean') {
                    throw new Error('Invalid setting: ' + String(args.key));
                }
                settings[args.key] = args.value;
                save();
                applyGlobals();
                return { settings: copy(settings) };
            }
            throw new Error('Unknown operation: ' + operation);
        };
    }

    function hookControls() {
        if (window.MainMenuCtrl && window.MainMenuCtrl.prototype && !window.MainMenuCtrl.prototype._mzdTweaksHooked) {
            window.MainMenuCtrl.prototype._mzdTweaksHooked = true;
            try {
                var origOffsetFocus = window.MainMenuCtrl.prototype._offsetFocus;
                if (origOffsetFocus && origOffsetFocus.toString().indexOf('mzdTweaks') === -1) {
                    window.MainMenuCtrl.prototype._offsetFocus = function (direction) {
                        if (!window.mzdTweaks || !window.mzdTweaks.main_menu_loop) {
                            return origOffsetFocus.apply(this, arguments);
                        }
                        var index = this._getFocus();
                        if (direction === 'left') { index -= 1; }
                        else if (direction === 'right') { index += 1; }
                        if (index < 0) { index = 4; }
                        if (index > 4) { index = 0; }
                        if (index !== this._getFocus()) {
                            this._setFocus(index);
                        }
                    };
                }
            } catch (ignore) {}
        }

        if (window.List2Ctrl && window.List2Ctrl.prototype && !window.List2Ctrl.prototype._mzdTweaksHooked) {
            window.List2Ctrl.prototype._mzdTweaksHooked = true;
            try {
                var origMCDown = window.List2Ctrl.prototype._handleMCDown;
                if (origMCDown && origMCDown.toString().indexOf('mzdTweaks') === -1) {
                    try {
                        Object.defineProperty(window.List2Ctrl.prototype, 'autoscrollTier1Timeout', {
                            get: function () { return (window.mzdTweaks && window.mzdTweaks.short_delay) ? 500 : 1500; },
                            configurable: true
                        });
                        Object.defineProperty(window.List2Ctrl.prototype, 'autoscrollTier2Timeout', {
                            get: function () { return (window.mzdTweaks && window.mzdTweaks.short_delay) ? 1500 : 5000; },
                            configurable: true
                        });
                        Object.defineProperty(window.List2Ctrl.prototype, 'autoscrollTier1Interval', {
                            get: function () { return (window.mzdTweaks && window.mzdTweaks.short_delay) ? 300 : 500; },
                            configurable: true
                        });
                        Object.defineProperty(window.List2Ctrl.prototype, 'autoscrollTier2Interval', {
                            get: function () { return (window.mzdTweaks && window.mzdTweaks.short_delay) ? 500 : 1000; },
                            configurable: true
                        });
                    } catch (e1) {}

                    var origBeep = window.List2Ctrl.prototype._beep;
                    if (origBeep) {
                        window.List2Ctrl.prototype._beep = function (pressType, eventCause) {
                            if (pressType === 'Long' && eventCause === 'Multicontroller' && window.mzdTweaks && window.mzdTweaks.list_beep === false) {
                                return;
                            }
                            return origBeep.apply(this, arguments);
                        };
                    }

                    window.List2Ctrl.prototype._handleMCDown = function () {
                        var beforeIndex = this._getFocussedIndex();
                        var res = origMCDown.apply(this, arguments);
                        if (window.mzdTweaks && window.mzdTweaks.list_loop && this._getFocussedIndex() === beforeIndex) {
                            if (this.dataList && this.dataList.items && this.dataList.itemCount > 0) {
                                var nextIndex = beforeIndex + 1;
                                while (nextIndex < this.dataList.itemCount && this.dataList.items[nextIndex] && this.dataList.items[nextIndex].disabled) { nextIndex++; }
                                if (nextIndex >= this.dataList.itemCount) {
                                    var idx = 0;
                                    while (idx < this.dataList.itemCount && this.dataList.items[idx] && this.dataList.items[idx].disabled) { idx++; }
                                    if (idx < this.dataList.itemCount && this.dataList.items[idx] && !this.dataList.items[idx].disabled) {
                                        this._manageFocus(idx);
                                        return 'consumed';
                                    }
                                }
                            }
                        }
                        return res;
                    };

                    var origMCUp = window.List2Ctrl.prototype._handleMCUp;
                    if (origMCUp) {
                        window.List2Ctrl.prototype._handleMCUp = function () {
                            var beforeIndex = this._getFocussedIndex();
                            var res = origMCUp.apply(this, arguments);
                            if (window.mzdTweaks && window.mzdTweaks.list_loop && this._getFocussedIndex() === beforeIndex) {
                                if (this.dataList && this.dataList.items && this.dataList.itemCount > 0) {
                                    var prevIndex = beforeIndex - 1;
                                    while (prevIndex >= 0 && this.dataList.items[prevIndex] && this.dataList.items[prevIndex].disabled) { prevIndex--; }
                                    if (prevIndex < 0) {
                                        var idx = this.dataList.itemCount - 1;
                                        while (idx >= 0 && this.dataList.items[idx] && this.dataList.items[idx].disabled) { idx--; }
                                        if (idx >= 0 && this.dataList.items[idx] && !this.dataList.items[idx].disabled) {
                                            this._manageFocus(idx);
                                            return 'consumed';
                                        }
                                    }
                                }
                            }
                            return res;
                        };
                    }
                }
            } catch (ignore) {}
        }
    }

    if (window.setInterval) {
        var hookPoll = window.setInterval(function () {
            hookControls();
            if (window.MainMenuCtrl && window.List2Ctrl) {
                window.clearInterval(hookPoll);
            }
        }, 100);
    }

    var modules = {
        'android-auto': androidAuto(),
        'mzd-tweaks': mzdTweaks()
    };
    window.MzdGuiServices = {
        request: function (module, operation, args, callback) {
            var delay = 150;
            if (module === 'android-auto' && (operation === 'set' || operation === 'save') &&
                ((args && args.key === 'resolution_dpi') || (args && args.settings && args.settings.resolution_dpi !== undefined))) {
                delay = 2000;
            }
            window.setTimeout(function () {
                var value, service;
                if (module === 'wallpaper-manager' && !modules[module]) {
                    try { modules[module] = wallpaperManager(); }
                    catch (initError) { callback('Wallpaper preview unavailable: ' + String(initError.message || initError)); return; }
                }
                if (!modules[module]) { callback('Module service is unavailable.'); return; }
                service = modules[module];
                try { value = service(operation, args || {}); } catch (error) { callback(String(error.message || error)); return; }
                callback(null, value);
            }, delay);
        },
        onReady: function (fn) {
            listeners.push(fn);
            window.setTimeout(function () { if (listeners.indexOf(fn) >= 0) { fn(); } }, 50);
            return function () { var at = listeners.indexOf(fn); if (at >= 0) { listeners.splice(at, 1); } };
        },
        dispose: function () { listeners = []; }
    };
}());
