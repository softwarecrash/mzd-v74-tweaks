// Exercise the label helper from the shipped diff with a mocked DOM; no vehicle runtime.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const diff = fs.readFileSync(path.join(root, 'usb/tweaks/fuel-consumption-values/assets/change.patch'), 'utf8');
const lines = diff.split('\n');
const added = lines.filter(line => line[0] === '+' && !line.startsWith('+++')).map(line => line.slice(1));
const removed = lines.filter(line => line[0] === '-' && !line.startsWith('---')).map(line => line.slice(1));
// Only one blank line is replaced; everything else is added.
assert.deepEqual(removed.map(line => line.trim()), ['']);
assert.equal(lines.filter(line => line.startsWith('@@ ')).length, 7);
// Every bar height setter of the CDFE (left/right) and CFER graphs gets a label call.
const calls = added.filter(line => /\/\/ MOD$/.test(line));
assert.equal(calls.filter(line => line.includes('_CDFEGraphBarValues[') && line.includes(', 21, 13)')).length, 2);
assert.equal(calls.filter(line => line.includes('_CDFEGraphBarValuesRight[') && line.includes(', 44, 18)')).length, 2);
assert.equal(calls.filter(line => line.includes('_modSetCFERBarLabel(bar, this._CFERGraphBarValues[')).length, 2);
assert(!added.some(line => /hev/i.test(line)), 'The HEV graph branch must stay untouched');

const start = added.findIndex(line => line.startsWith('FuelConsumptionCtrl.prototype._modSetBarLabel'));
const end = added.findIndex((line, i) => i > start && line === '};' && added[i - 1].includes('_modSetBarLabel(bar, value, heightPx, 50, 22)'));
assert(start >= 0 && end > start);
const source = added.slice(start, end + 1).join('\n');

function element() {
    return {children: [], style: {}, innerHTML: '', appendChild(child) { this.children.push(child); }};
}
const sandbox = {document: {createElement(tag) { assert.equal(tag, 'div'); return element(); }}};
sandbox.FuelConsumptionCtrl = function () {};
vm.runInNewContext(source, sandbox);
const ctrl = new sandbox.FuelConsumptionCtrl();

// One label per bar, reused on every update.
const bar = element();
ctrl._modSetBarLabel(bar, 7.84, 40, 44, 18);
assert.equal(bar.children.length, 1);
const label = bar.children[0];
assert.equal(label.innerHTML, '7.8');
assert.equal(label.style.top, '-24px');
assert.equal(label.style.fontSize, '18px');
assert.match(label.style.cssText, /width:44px;/);
ctrl._modSetBarLabel(bar, '6.0', 40, 44, 18);
assert.equal(bar.children.length, 1);
assert.equal(label.innerHTML, '6.0');

// Tall bars get the value inside the 109 px clipped graph area.
ctrl._modSetBarLabel(bar, 15, 100, 44, 18);
assert.equal(label.style.top, '4px');
ctrl._modSetBarLabel(bar, 15, 85, 44, 18);
assert.equal(label.style.top, '-24px');

// Empty or invalid values clear the label.
for (const value of [0, -1, '', undefined, NaN, '--.-']) {
    ctrl._modSetBarLabel(bar, value, 40, 44, 18);
    assert.equal(label.innerHTML, '');
}

// Narrow 1-minute bars shrink four-character values only.
const narrow = element();
ctrl._modSetBarLabel(narrow, 12.8, 30, 21, 13);
assert.equal(narrow.children[0].style.fontSize, '11px');
assert.equal(narrow.children[0].style.letterSpacing, '-1px');
ctrl._modSetBarLabel(narrow, 9.4, 30, 21, 13);
assert.equal(narrow.children[0].style.fontSize, '13px');
assert.equal(narrow.children[0].style.letterSpacing, '0px');

// History bars use the wide CFER settings.
const history = element();
ctrl._modSetCFERBarLabel(history, 8.26, 50);
assert.match(history.children[0].style.cssText, /width:50px;.*font-size:22px;/);
assert.equal(history.children[0].innerHTML, '8.3');
assert.equal(history.children[0].style.top, '-28px');

// A missing bar element is ignored.
ctrl._modSetBarLabel(null, 5, 10, 21, 13);
console.log('FUEL_CONSUMPTION_VALUES_BEHAVIOR_PASSED: all six bar setters, label reuse, placement, empty values and narrow-bar font.');
