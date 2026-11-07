/* Display-only interpolation. Never change sensor samples or session statistics. */
(function (global) {
    'use strict';
    global.DriveDashNeedle = function () {
        var from = null, target = null, began = 0, duration = 350;
        function value(now) {
            if (target === null) { return null; }
            if (now < began) { return target; }
            var fraction = Math.max(0,Math.min(1,(now-began)/duration));
            fraction = fraction*fraction*(3-2*fraction);
            return from+(target-from)*fraction;
        }
        return {value:value,set:function (rpm,now) {
            rpm = typeof rpm === 'number' && isFinite(rpm) ? Math.max(0,Math.min(8000,rpm)) : null;
            if (rpm === target) { return; }
            from = value(now); target = rpm; began = now;
            if (from === null || target === null) { from = target; }
        },moving:function (now) { return target !== null && from !== target && now >= began && now-began < duration; },
        reset:function () { from = null; target = null; began = 0; }};
    };
}(window));
