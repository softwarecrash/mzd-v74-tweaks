/* Canonical SI snapshots and view-local statistics, shared by every design. */
(function (global) {
    'use strict';
    var fields = [
        ['speedKph','kmh',0,400], ['rpm','rpm',0,16000],
        ['outsideC','temperature',-39,214], ['coolantC','temperature',-39,214], ['intakeC','temperature',-39,214],
        ['tripKm','distance',0,42949672.92], ['avgL100','economy',0,10000],
        ['driveAvgL100','economy',0,10000], ['cumulativeAvgL100','economy',0,10000],
        ['fuelRaw','raw',0,254], ['fuelPercent','percent',0,100],
        ['engineLoadPercent','percent',0,100], ['batteryPercent','percent',0,100],
        ['gearNumber','number',1,6], ['leverPosition','number',1,4],
        ['gpsSpeedKph','kmh',0,500], ['gpsAltitudeM','height',-1000,20000],
        ['gpsHeadingDeg','degrees',0,360], ['gpsLatitudeDeg','degrees',-90,90], ['gpsLongitudeDeg','degrees',-180,180],
        ['topSpeedKph','kmh',0,400], ['movingAvgKph','kmh',0,400], ['maxRpm','rpm',0,16000],
        ['elapsedSeconds','duration',0,Infinity], ['movingSeconds','duration',0,Infinity],
        ['speedObservedSeconds','duration',0,Infinity], ['idleSeconds','duration',0,Infinity],
        ['engineIdleSeconds','duration',0,Infinity], ['idlePercent','percent',0,100],
        ['engineIdlePercent','percent',0,100], ['gpsMinAltitudeM','height',-1000,20000], ['gpsMaxAltitudeM','height',-1000,20000]
    ];
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function normalize(raw) {
        raw = raw || {};
        var out = {schemaVersion:1,source:raw.source || 'unavailable',available:raw.available === true}, i, f, v;
        for (i = 0; i < fields.length; i += 1) {
            f = fields[i]; v = raw[f[0]];
            out[f[0]] = finite(v) && v >= f[2] && v <= f[3] ? v : null;
        }
        out.gear = typeof raw.gear === 'string' && /^(P|R|N|D|[1-6])$/.test(raw.gear) ? raw.gear : null;
        // The original app used different heading references depending on Nav SD.
        // Preserve the reported angle until its actual reference is confirmed.
        out.gpsHeadingReference = 'oem'; out.gpsDirection = null; out.gpsFixValid = null;
        out.sampleSeconds = finite(raw.sampleSeconds) ? raw.sampleSeconds : null;
        out.sequence = finite(raw.sequence) ? raw.sequence : null;
        return out;
    }
    function createSession() {
        var stats = {elapsedSeconds:0,movingSeconds:0,speedObservedSeconds:0,idleSeconds:0,engineIdleSeconds:0};
        var previous = null, lastSequence = null, movingIntegral = 0, engineObserved = 0;
        function update(raw) {
            raw = raw || {};
            var out = normalize(raw), stamp = out.sampleSeconds === null ? new Date().getTime()/1000 : out.sampleSeconds;
            var live = out.source === 'cmu', fresh = raw.fresh || {}, speed = !live || fresh.speedKph === true;
            var rpm = !live || fresh.rpm === true, dt, key, same = live && out.sequence !== null && out.sequence === lastSequence;
            if (!same) {
                if (speed && out.speedKph !== null) { stats.topSpeedKph = Math.max(stats.topSpeedKph || 0,out.speedKph); }
                if (rpm && out.rpm !== null) { stats.maxRpm = Math.max(stats.maxRpm || 0,out.rpm); }
                if (out.gpsAltitudeM !== null && (!live || fresh.gps === true)) {
                    stats.gpsMinAltitudeM = stats.gpsMinAltitudeM === undefined ? out.gpsAltitudeM : Math.min(stats.gpsMinAltitudeM,out.gpsAltitudeM);
                    stats.gpsMaxAltitudeM = stats.gpsMaxAltitudeM === undefined ? out.gpsAltitudeM : Math.max(stats.gpsMaxAltitudeM,out.gpsAltitudeM);
                }
                dt = previous ? stamp-previous.stamp : 0;
                // Do not integrate gaps, failed/retained readings or reopened sessions.
                if (previous && dt > 0 && dt <= 5 && (!live || out.sequence !== null && lastSequence !== null && out.sequence > lastSequence)) {
                    stats.elapsedSeconds += dt;
                    if (speed && previous.speed && out.speedKph !== null && previous.data.speedKph !== null) {
                        stats.speedObservedSeconds += dt;
                        if (out.speedKph > 0 && previous.data.speedKph > 0) {
                            stats.movingSeconds += dt; movingIntegral += (out.speedKph+previous.data.speedKph)*dt/2;
                        }
                        if (out.speedKph === 0 && previous.data.speedKph === 0) { stats.idleSeconds += dt; }
                        if (rpm && previous.rpm && out.rpm !== null && previous.data.rpm !== null) {
                            engineObserved += dt;
                            if (out.speedKph === 0 && previous.data.speedKph === 0 && out.rpm > 0 && previous.data.rpm > 0) { stats.engineIdleSeconds += dt; }
                        }
                    }
                }
                previous = out.source === 'unavailable' ? null : {stamp:stamp,data:out,speed:speed,rpm:rpm};
                lastSequence = out.sequence;
            }
            for (key in stats) { if (Object.prototype.hasOwnProperty.call(stats,key)) { out[key] = stats[key]; } }
            out.movingAvgKph = stats.movingSeconds > 0 ? movingIntegral/stats.movingSeconds : null;
            out.idlePercent = stats.speedObservedSeconds > 0 ? stats.idleSeconds*100/stats.speedObservedSeconds : null;
            out.engineIdlePercent = engineObserved > 0 ? stats.engineIdleSeconds*100/engineObserved : null;
            return out;
        }
        return {update:update,pause:function () { previous = null; lastSequence = null; }};
    }
    global.DriveDashData = {version:1,fields:fields.map(function (f) { return {key:f[0],unit:f[1],labelKey:'data.'+f[0]}; }),normalize:normalize,createSession:createSession};
}(window));
