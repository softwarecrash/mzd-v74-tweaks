const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let distanceCalls = 0, temperatureCalls = 0;
const framework = {
    localize: {
        getDistanceUnit() { distanceCalls++; return 'Miles'; },
        getTemperatureUnit() { temperatureCalls++; return 'Fahrenheit'; },
        getCurrentLanguage() { return 'de_DE'; }
    }
};
const window = {
    framework,
    clearTimeout() {},
    setTimeout(fn) { return 1; },
    addEventListener() {},
    removeEventListener() {}
};
const root = path.resolve(__dirname, '../../..');
vm.runInNewContext(fs.readFileSync(path.join(root, 'usb/lib/gui-runtime/residents.js'), 'utf8'), { window });
const residentCode = fs.readFileSync(path.join(root, 'usb/tweaks/drivedash/assets/resident.js'), 'utf8');
vm.runInNewContext(residentCode, { window });

let units = window.MzdGuiResidents.units('drivedash');
assert.equal(units.language, 'de_DE');
assert.equal(units.speedUnit, 'mph');
assert.equal(units.tempUnit, 'F');
assert.equal(distanceCalls, 1);
assert.equal(temperatureCalls, 1);

framework.localize = {
    getDistanceUnit: () => 'Kilometers',
    getTemperatureUnit: () => 'Celsius',
    getCurrentLanguage: () => 'de_DE'
};
units = window.MzdGuiResidents.units('drivedash');
assert.equal(units.speedUnit, 'kmh');
assert.equal(units.tempUnit, 'C');

framework.localize = {
    getDistanceUnit: () => 'unknown',
    getTemperatureUnit: () => { throw Error('missing'); },
    getCurrentLanguage: () => 'de_DE'
};
units = window.MzdGuiResidents.units('drivedash');
assert.equal(units.speedUnit, null);
assert.equal(units.tempUnit, null);
assert.equal(units.language, 'de_DE');

console.log('DRIVEDASH_SYSTEM_PASSED: OEM getters, locale, units, source/token checks, independent failures and no sensor/service calls.');
