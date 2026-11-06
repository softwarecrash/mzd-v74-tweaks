(function (global) {
    'use strict';
    var own = Object.prototype.hasOwnProperty;
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function choice(value, values, fallback) { return values.indexOf(value) >= 0 ? value : fallback; }
    function settings(value, designs) {
        value = value || {};
        return {version:1,design:choice(value.design,designs,'bm2014'),speedUnit:choice(value.speedUnit,['auto','kmh','mph'],'auto'),tempUnit:choice(value.tempUnit,['auto','C','F'],'auto'),animated:value.animated !== false};
    }
    function display(data, config, t) {
        data = data || {};
        var speedUnit = config.speedUnit === 'auto' ? choice(data.speedUnit,['kmh','mph'],'kmh') : config.speedUnit;
        var tempUnit = config.tempUnit === 'auto' ? choice(data.tempUnit,['C','F'],'C') : config.tempUnit;
        function value(key, conversion, digits) {
            return own.call(data,key) && finite(data[key]) ? (data[key] * conversion).toFixed(digits).replace('.',t('decimal')) : '--';
        }
        function temperature(key) {
            return finite(data[key]) ? String(Math.round(tempUnit === 'F' ? data[key] * 9 / 5 + 32 : data[key])) : '--';
        }
        return {source:data.source || 'unavailable',speed:value('speedKph',speedUnit === 'mph' ? 1/1.609344 : 1,0),speedUnit:t(speedUnit),rpm:finite(data.rpm) ? Math.max(0,Math.min(8000,data.rpm)) : null,
            gear:typeof data.gear === 'string' ? data.gear : '--',outside:temperature('outsideC'),coolant:temperature('coolantC'),tempUnit:t(tempUnit === 'F' ? 'fahrenheit' : 'celsius'),
            trip:value('tripKm',speedUnit === 'mph' ? 1/1.609344 : 1,1),tripUnit:t(speedUnit === 'mph' ? 'mi' : 'km'),
            average:finite(data.avgL100) && data.avgL100 > 0 ? (speedUnit === 'mph' ? 235.214583/data.avgL100 : data.avgL100).toFixed(1).replace('.',t('decimal')) : '--',averageUnit:t(speedUnit === 'mph' ? 'mpg' : 'l100'),
            fuel:finite(data.fuelPercent) ? Math.max(0,Math.min(100,data.fuelPercent)) : null};
    }
    global.SpeedometerModel = {settings:settings,display:display};
}(window));
