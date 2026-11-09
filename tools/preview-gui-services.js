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
        function remember(name) {
            if (!applied.hasOwnProperty(name)) { applied[name] = settings[name]; }
        }
        function result() {
            var name, rebootRequired = false;
            for (name in applied) { if (applied.hasOwnProperty(name) && settings[name] !== applied[name]) { rebootRequired = true; } }
            return { success: true, settings: copy(settings), rebootRequired: rebootRequired };
        }
        function valid(name, value) {
            if (!settings.hasOwnProperty(name)) { return false; }
            if (name === 'hud_transport') { return value === 'svcnavi' || value === 'vbs'; }
            if (name === 'hud_maneuver_max_distance_m') { return typeof value === 'number' && value >= 0; }
            return typeof value === 'boolean';
        }
        function save() { window.localStorage.setItem(key, JSON.stringify(settings)); }
        return function (operation, args) {
            var name;
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

    var modules = { 'android-auto': androidAuto() };
    window.MzdGuiServices = {
        request: function (module, operation, args, callback) {
            window.setTimeout(function () {
                var value;
                if (!modules[module]) { callback('Module service is unavailable.'); return; }
                try { value = modules[module](operation, args || {}); } catch (error) { callback(String(error.message || error)); return; }
                callback(null, value);
            }, 150);
        },
        onReady: function (fn) {
            listeners.push(fn);
            window.setTimeout(function () { if (listeners.indexOf(fn) >= 0) { fn(); } }, 50);
            return function () { var at = listeners.indexOf(fn); if (at >= 0) { listeners.splice(at, 1); } };
        },
        dispose: function () { listeners = []; }
    };
}());
