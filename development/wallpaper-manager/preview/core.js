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
