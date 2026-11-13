(function (global) {
    'use strict';
    var own = Object.prototype.hasOwnProperty;
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function choice(value, values, fallback) { return values.indexOf(value) >= 0 ? value : fallback; }
    function settings(value, designs, languages) {
        value = value || {};
        return {version:1,language:choice(value.language,['auto'].concat(languages || ['en_US','de_DE']),'auto'),design:choice(value.design,designs,'oem-style'),speedUnit:choice(value.speedUnit,['auto','kmh','mph'],'auto'),tempUnit:choice(value.tempUnit,['auto','C','F'],'auto'),animated:value.animated !== false};
    }
    function display(data, config, t, system) {
        data = data || {}; system = system || {};
        var speedUnit = config.speedUnit === 'auto' ? choice(system.speedUnit || data.speedUnit,['kmh','mph'],'kmh') : config.speedUnit;
        var tempUnit = config.tempUnit === 'auto' ? choice(system.tempUnit || data.tempUnit,['C','F'],'C') : config.tempUnit;
        function value(key, conversion, digits) {
            return own.call(data,key) && finite(data[key]) ? (data[key] * conversion).toFixed(digits).replace('.',t('decimal')) : '--';
        }
        function temperature(key) {
            return finite(data[key]) ? String(Math.round(tempUnit === 'F' ? data[key] * 9 / 5 + 32 : data[key])) : '--';
        }
        var canonical = global.DriveDashData.normalize(data), formatted = {}, units = {}, descriptors = global.DriveDashData.fields, i, f, v, factor, unit, digits;
        function duration(seconds) {
            var n = Math.floor(seconds), h = Math.floor(n/3600), m = Math.floor(n/60)%60, sec = n%60;
            return (h > 0 ? h+':'+('0'+m).slice(-2) : String(m))+':'+('0'+sec).slice(-2);
        }
        for (i = 0; i < descriptors.length; i += 1) {
            f = descriptors[i]; v = canonical[f.key]; factor = 1; unit = ''; digits = 0;
            if (f.unit === 'kmh') { factor = speedUnit === 'mph' ? 1/1.609344 : 1; unit = t(speedUnit); }
            else if (f.unit === 'distance') { factor = speedUnit === 'mph' ? 1/1.609344 : 1; unit = t(speedUnit === 'mph' ? 'mi' : 'km'); digits = 1; }
            else if (f.unit === 'height') { factor = speedUnit === 'mph' ? 3.280839895 : 1; unit = t(speedUnit === 'mph' ? 'ft' : 'm'); }
            else if (f.unit === 'temperature') { unit = t(tempUnit === 'F' ? 'fahrenheit' : 'celsius'); if (v !== null && tempUnit === 'F') { v = v*9/5+32; } }
            else if (f.unit === 'economy') { digits = 1; unit = t(speedUnit === 'mph' ? 'mpg' : 'l100'); if (v !== null && speedUnit === 'mph') { v = v > 0 ? 235.214583/v : null; } }
            else if (f.unit === 'percent') { unit = '%'; }
            else if (f.unit === 'degrees') { digits = f.key.indexOf('Latitude') >= 0 || f.key.indexOf('Longitude') >= 0 ? 5 : 0; unit = '\u00b0'; }
            else if (f.unit === 'rpm') { unit = t('rpm'); }
            units[f.key] = unit;
            formatted[f.key] = v === null ? '--' : f.unit === 'duration' ? duration(v) : (v*factor).toFixed(digits).replace('.',t('decimal'));
        }
        return {data:canonical,formatted:formatted,units:units,source:data.source || 'unavailable',speed:value('speedKph',speedUnit === 'mph' ? 1/1.609344 : 1,0),speedUnit:t(speedUnit),rpm:finite(data.rpm) ? Math.max(0,Math.min(8000,data.rpm)) : null,
            gear:typeof data.gear === 'string' ? data.gear : '--',outside:temperature('outsideC'),coolant:temperature('coolantC'),tempUnit:t(tempUnit === 'F' ? 'fahrenheit' : 'celsius'),
            trip:value('tripKm',speedUnit === 'mph' ? 1/1.609344 : 1,1),tripUnit:t(speedUnit === 'mph' ? 'mi' : 'km'),
            average:finite(data.avgL100) && data.avgL100 > 0 ? (speedUnit === 'mph' ? 235.214583/data.avgL100 : data.avgL100).toFixed(1).replace('.',t('decimal')) : '--',averageUnit:t(speedUnit === 'mph' ? 'mpg' : 'l100'),
            engineLoad:finite(data.engineLoadPercent) ? Math.max(0,Math.min(100,data.engineLoadPercent)) : null,
            battery:finite(data.batteryPercent) ? Math.max(0,Math.min(100,data.batteryPercent)) : null,
            fuel:finite(data.fuelPercent) ? Math.max(0,Math.min(100,data.fuelPercent)) : null};
    }
    global.DriveDashModel = {settings:settings,display:display};
}(window));
