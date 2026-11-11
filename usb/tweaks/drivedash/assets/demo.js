(function (global) {
    'use strict';
    global.DriveDashDemo = function () {
        var timer = null, elapsed = 0, previous = null;
        function snapshot(animated) {
            var wave = animated ? Math.sin(elapsed/15) : 0;
            return {source:'demo',available:true,sampleSeconds:elapsed,intakeC:31,driveAvgL100:7.1,cumulativeAvgL100:7.4,gearNumber:4,leverPosition:4,gpsSpeedKph:87+wave*12,gpsAltitudeM:145+wave*5,gpsHeadingDeg:135,gpsCourseDeg:135+wave*20,gpsLatitudeDeg:48.1,gpsLongitudeDeg:11.5,speedKph:88 + wave*12,rpm:2400 + wave*500,gear:'D',outsideC:22,coolantC:90,fuelPercent:72,engineLoadPercent:45 + wave*30,batteryPercent:81,tripKm:123.4 + (animated ? elapsed*88/3600 : 0),avgL100:6.7,speedUnit:'kmh',tempUnit:'C'};
        }
        function stop() { if (timer !== null) { global.clearInterval(timer); timer = null; } previous = null; }
        return {start:function (callback, animated) {
            stop(); callback(snapshot(animated));
            if (!animated) { return; }
            previous = new Date().getTime();
            timer = global.setInterval(function () { var now = new Date().getTime(); elapsed += (now-previous)/1000; previous = now; callback(snapshot(true)); },250);
        },stop:stop};
    };
}(window));
