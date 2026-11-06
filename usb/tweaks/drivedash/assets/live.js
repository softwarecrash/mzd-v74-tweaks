/* Serialized service requests; tolerate two consecutive transport failures. */
(function (global) {
    'use strict';
    global.DriveDashLive = function (request) {
        var active = false, generation = 0, timer = null, pending = false, callback = null, delay = 500, failures = 0;
        function stop() { active = false; generation += 1; global.clearTimeout(timer); timer = null; callback = null; }
        function poll() {
            var mine = generation;
            if (!active || pending) { return; }
            pending = true;
            request(function (error, result) {
                pending = false;
                if (!active) { return; }
                if (mine !== generation) { poll(); return; }
                if (error || !result || result.source !== 'cmu') {
                    failures += 1;
                    if (failures === 3) { callback({source:'unavailable'}); }
                    delay = failures < 3 ? 500 : Math.min(8000,Math.max(1000,delay*2));
                } else {
                    failures = 0; callback(result); delay = result.available ? 500 : 1000;
                }
                if (active && mine === generation) { timer = global.setTimeout(poll,delay); }
            });
        }
        return {start:function (fn) {
            stop(); active = true; callback = fn; delay = 500; failures = 0; callback({source:'unavailable'}); poll();
        },stop:stop};
    };
}(window));
