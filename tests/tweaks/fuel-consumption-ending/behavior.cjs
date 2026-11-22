// Run the ending timer from the shipped diff with mocked timers; no vehicle runtime.
// The time is 7 s unless MZD Tweaks provides a whole number of seconds from 5 to 30.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const diff = fs.readFileSync(path.join(root, 'usb/tweaks/fuel-consumption-ending/assets/change.patch'), 'utf8');
const lines = diff.split('\n');
const removed = lines.filter(line => line[0] === '-' && !line.startsWith('---')).map(line => line.slice(1));
assert.deepEqual(removed, ['    this.endingTimer = setTimeout(this._stopEndingTimer.bind(this), 5000);'], 'only the 5 s timer line is replaced');

// New side of the timer function: context and added lines from its definition to the closing brace.
const newSide = lines.filter(line => (line[0] === ' ' || line[0] === '+') && !line.startsWith('+++')).map(line => line.slice(1));
const start = newSide.findIndex(line => line.startsWith('ecoenergyApp.prototype._startEndingTimer = function()'));
const end = newSide.findIndex((line, i) => i > start && line === '};');
assert(start >= 0 && end > start, 'timer function found in the diff');
const source = newSide.slice(start, end + 1).join('\n');

function run(tweaks, options) {
    const timers = [];
    const sandbox = {
        setTimeout(fn, ms) { timers.push(ms); return timers.length; },
        Math
    };
    sandbox.window = options && options.noWindowObject ? {} : { mzdTweaks: tweaks };
    sandbox.ecoenergyApp = function () {};
    sandbox.ecoenergyApp.prototype._stopEndingTimer = function () {};
    vm.runInNewContext(source, sandbox);
    const app = new sandbox.ecoenergyApp();
    app._startEndingTimer();
    assert.equal(timers.length, 1, 'one timer');
    return timers[0];
}

assert.equal(run(undefined), 7000, 'no MZD Tweaks: 7 s');
assert.equal(run(undefined, { noWindowObject: true }), 7000, 'no window.mzdTweaks: 7 s');
assert.equal(run({}), 7000, 'MZD Tweaks without the setting: 7 s');
assert.equal(run({ fuel_ending_delay: 5 }), 5000, 'lowest value');
assert.equal(run({ fuel_ending_delay: 12 }), 12000, 'chosen value');
assert.equal(run({ fuel_ending_delay: 30 }), 30000, 'highest value');
for (const bad of [4, 31, 0, -7, 7.5, NaN, Infinity, '12', null, true]) {
    assert.equal(run({ fuel_ending_delay: bad }), 7000, 'invalid value ' + String(bad) + ' keeps 7 s');
}
// The value is read when the ending screen starts, so a change applies without a reboot.
const tweaks = { fuel_ending_delay: 9 };
assert.equal(run(tweaks), 9000);
tweaks.fuel_ending_delay = 20;
assert.equal(run(tweaks), 20000);
// ES5 only: the Opera browser of the CMU has no let/const/arrow functions.
assert(!/\b(let|const)\b|=>/.test(source), 'ES5 syntax');
console.log('FUEL_ENDING_BEHAVIOR_PASSED: 7 s default, MZD Tweaks time from 5 to 30 s, invalid values ignored, read at every start, ES5.');
