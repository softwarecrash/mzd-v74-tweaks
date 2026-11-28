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
assert.equal(lines.filter(line => line.startsWith('@@ ')).length, 9);
// Every bar height setter of the CDFE (left/right) and CFER graphs gets a label call.
const calls = added.filter(line => /\/\/ MOD$/.test(line));
assert.equal(calls.filter(line => line.includes('_CDFEGraphBarValues[') && line.includes(', 21, 13)')).length, 2);
assert.equal(calls.filter(line => line.includes('_CDFEGraphBarValuesRight[') && line.includes(', 44, 18)')).length, 2);
assert.equal(calls.filter(line => line.includes('_modSetCFERBarLabel(bar, this._CFERGraphBarValues[')).length, 2);
// The HEV graph is only mentioned to skip it.
assert.deepEqual(added.filter(line => /hev/i.test(line)).map(line => line.trim()),
                 Array(2).fill("if (this.properties.ctrlStyle === 'hevstyle') { return; }"));
// Pairing runs after every full redraw, and a new minute is applied at once.
assert.equal(calls.filter(line => line.trim() === 'this._modPairCDFEBars(); // MOD').length, 1);
assert.equal(calls.filter(line => line.trim() === 'this._modFinishCDFEShift(); // MOD').length, 1);

const start = added.findIndex(line => line.startsWith('FuelConsumptionCtrl.prototype._modSetBarLabel'));
const end = added.findIndex((line, i) => i > start && line === '};' && added[i - 1].includes('this._resetCDFEGraph(false);'));
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

// The label width follows the bar width (paired bars are wider).
ctrl._modSetBarLabel(narrow, 12.8, 30, 44, 18);
assert.equal(narrow.children[0].style.width, '44px');
assert.equal(narrow.children[0].style.fontSize, '18px');

// Pair value: average of both minutes, or the non-empty one.
assert.equal(ctrl._modPairValue(12.8, 15.6), 14.2);
assert.equal(ctrl._modPairValue(13.6, 13.1), 13.4);
assert.equal(ctrl._modPairValue(6.6, '9'), 7.8);
assert.equal(ctrl._modPairValue(0, 7.4), 7.4);
assert.equal(ctrl._modPairValue(7.4, undefined), 7.4);
assert.equal(ctrl._modPairValue(0, 0), 0);

// The ten 1-minute bars become five 44 px bars; the hidden new-data slot is untouched.
function graph(style) {
    const bars = {};
    for (let i = 1; i <= 11; i++) { bars['CDFEBar' + i] = element(); bars['CDFEBar' + i].style.left = (3 + (i - 1) * 23) + 'px'; }
    sandbox.document.getElementById = id => bars[id] || null;
    const c = new sandbox.FuelConsumptionCtrl();
    c._newCDFEDataIdx = 10;
    c._CSSConstants = {CDFEGraphBarWidth: 21, CDFEGraphBarSpacing: 2, CDFEGraphBarMargin: 3, CDFEGraphVisibleHeight: 109};
    c.properties = {ctrlStyle: style, currentFuelConfig: {yAxisLimitValue: 15}};
    c._scaleDataToGraphY = (h, v, limit) => Math.round(h * v / limit);
    c._CDFEGraphBarValues = [0, 7.4, 12.8, 15.6, 13.6, 13.1, 6.6, 9, 10, 4, 0];
    return {c, bars};
}
const {c: paired, bars} = graph('default');
paired._modPairCDFEBars();
for (let k = 0; k < 5; k++) {
    const first = bars['CDFEBar' + (2 * k + 1)], second = bars['CDFEBar' + (2 * k + 2)];
    assert.equal(first.style.visibility, 'hidden');
    assert.equal(second.style.left, (3 + k * 46) + 'px');
    assert.equal(second.style.width, '44px');
    assert.equal(second.style.backgroundSize, '44px 100%');
}
assert.deepEqual([2, 4, 6, 8, 10].map(i => bars['CDFEBar' + i].children[0].innerHTML), ['7.4', '14.2', '13.4', '7.8', '7.0']);
assert.equal(bars.CDFEBar4.style.height, Math.round(109 * 14.2 / 15) + 'px');
assert.equal(bars.CDFEBar11.style.width, undefined);
assert.equal(bars.CDFEBar11.style.visibility, undefined);

// HEV style keeps the factory bars.
const {c: hev, bars: hevBars} = graph('hevstyle');
hev._modPairCDFEBars();
assert(Object.values(hevBars).every(b => b.style.width === undefined && b.style.visibility === undefined));

// A new minute is redrawn at once: no pending slide listener, no transition flag.
const events = [];
const shift = graph('default').c;
shift._cbCDFELeftAnimationEnd = () => {};
shift.CDFEGraphArea = {removeEventListener(name, cb) { events.push([name, cb === shift._cbCDFELeftAnimationEnd]); }};
shift._CDFELineGraphInTransition = true;
shift._resetCDFEGraph = animate => events.push(['reset', animate]);
shift._modFinishCDFEShift();
assert.deepEqual(events, [['oTransitionEnd', true], ['reset', false]]);
assert.equal(shift._CDFELineGraphInTransition, false);
const hevShift = graph('hevstyle').c;
hevShift._resetCDFEGraph = () => assert.fail('HEV must keep the factory slide');
hevShift._modFinishCDFEShift();

console.log('FUEL_CONSUMPTION_VALUES_BEHAVIOR_PASSED: bar setters, label reuse, placement, empty values, narrow-bar font, paired 1-minute bars and immediate shift.');
