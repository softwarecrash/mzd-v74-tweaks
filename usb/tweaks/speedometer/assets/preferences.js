/* Serialize persistent settings writes and coalesce rapid menu changes. */
(function (global) {
    'use strict';
    global.SpeedometerPreferences = function (request) {
        var busy = false, pending = null, notify = null;
        function drain() {
            var value;
            if (busy || !pending) { return; }
            value = pending; pending = null; busy = true;
            request({values:value},function (error) { busy = false; if (notify) { notify(error || null); } drain(); });
        }
        return {
            load:function (callback) { request({},callback); },
            save:function (value,callback) {
                pending = JSON.parse(JSON.stringify(value)); notify = callback; drain();
            }
        };
    };
}(window));
