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
assert.equal(lines.filter(line => line.startsWith('@@ ')).length, 10);
// Every bar height setter of the CDFE (left/right) and CFER graphs gets a label call.
const calls = added.filter(line => /\/\/ MOD$/.test(line));
assert.equal(calls.filter(line => line.includes('_CDFEGraphBarValues[') && line.includes(', 21, 13)')).length, 2);
assert.equal(calls.filter(line => line.includes('_CDFEGraphBarValuesRight[') && line.includes(', 44, 18)')).length, 2);
assert.equal(calls.filter(line => line.includes('_modSetCFERBarLabel(bar, this._CFERGraphBarValues[')).length, 2);
// The HEV graph is only mentioned to skip it.
assert.deepEqual(added.filter(line => /hev/i.test(line)).map(line => line.trim()),
                 ["if (this.properties.ctrlStyle === 'hevstyle') { return; }",
                  "if (this.properties.ctrlStyle === 'hevstyle' || !xDiv || !fiveLabel) { return; }",
                  "if (this.properties.ctrlStyle === 'hevstyle') { return; }"]);
// Pairing runs after every full redraw, and a new minute is applied at once.
assert.equal(calls.filter(line => line.trim() === 'this._modPairCDFEBars(); // MOD').length, 1);
assert.equal(calls.filter(line => line.trim() === 'this._modFinishCDFEShift(); // MOD').length, 1);
assert.equal(calls.filter(line => line.trim() === 'this._modPairCDFEAxisLabels(xDiv, barLabel); // MOD').length, 1);

const start = added.findIndex(line => line.startsWith('FuelConsumptionCtrl.prototype._modSetBarLabel'));
const end = added.findIndex((line, i) => i > start && line === '};' && added[i - 1].includes('this._resetCDFEGraph(false);'));
assert(start >= 0 && end > start);
const source = added.slice(start, end + 1).join('\n');

function element(tag) {
    return {tag, children: [], style: {}, innerHTML: '', className: '',
            appendChild(child) { this.children.push(child); if (!this.firstChild) { this.firstChild = child; } },
            insertBefore(child, before) {
                const at = before ? this.children.indexOf(before) : -1;
                if (at < 0) { this.children.push(child); } else { this.children.splice(at, 0, child); }
                this.firstChild = this.children[0];
            }};
}
const sandbox = {document: {createElement(tag) { assert(tag === 'div' || tag === 'span'); return element(tag); }}};
sandbox.FuelConsumptionCtrl = function () {};
vm.runInNewContext(source, sandbox);
const ctrl = new sandbox.FuelConsumptionCtrl();

// One label per bar, reused on every update.
const bar = element();
ctrl._modSetBarLabel(bar, 7.84, 40, 44, 18);
assert.equal(bar.children.length, 1);
const label = bar.children[0];
assert.equal(label.innerHTML, '7.8');
// The value goes inside the bar whenever it fits, with a dark shadow.
assert.equal(label.style.top, '4px');
// Several dark layers, so the digits stay readable on the light "current" bars too.
assert(label.style.textShadow.split(',').filter(layer => /#000/.test(layer)).length >= 3);
assert.equal(label.style.fontSize, '18px');
assert.match(label.style.cssText, /width:44px;/);
ctrl._modSetBarLabel(bar, '6.0', 40, 44, 18);
assert.equal(bar.children.length, 1);
assert.equal(label.innerHTML, '6.0');

// Only bars too short for the label get it above, without shadow.
ctrl._modSetBarLabel(bar, 15, 100, 44, 18);
assert.equal(label.style.top, '4px');
ctrl._modSetBarLabel(bar, 2.1, 26, 44, 18);
assert.equal(label.style.top, '4px');
ctrl._modSetBarLabel(bar, 2.0, 25, 44, 18);
assert.equal(label.style.top, '-24px');
assert.equal(label.style.textShadow, 'none');

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
assert.equal(history.children[0].style.top, '4px');
ctrl._modSetCFERBarLabel(history, 1.5, 20);
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
    for (let i = 1; i <= 11; i++) {
        const bar = bars['CDFEBar' + i] = element('div');
        bar.style.left = (3 + (i - 1) * 23) + 'px';
        bar.className = i === 10 ? 'FuelConsumptionCtrlCDFEBarGraphCoreCurrent' : 'FuelConsumptionCtrlCDFEBarGraphCore';
        const cap = element('div');
        cap.className = 'FuelConsumptionCtrlCDFEBarGraphCap';
        bar.appendChild(cap);
    }
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
    // The silver cap covers the whole pair, with the factory 44 px images.
    assert.equal(second.firstChild.style.width, '44px');
    assert.equal(second.firstChild.style.backgroundSize, '44px 2px');
    assert.equal(second.firstChild.style.backgroundImage, 'url(apps/ecoenergy/controls/FuelConsumption/images/FuelConsBarCap_wide.png)');
    assert.equal(second.style.backgroundImage, 'url(apps/ecoenergy/controls/FuelConsumption/images/' +
                 (k === 4 ? 'FuelConsBar_WideCurrent.png)' : 'FuelConsBar_wide.png)'));
}
assert.deepEqual([2, 4, 6, 8, 10].map(i => bars['CDFEBar' + i]._modLbl.innerHTML), ['7.4', '14.2', '13.4', '7.8', '7.0']);
// Only the newest ("current") pair gets the dark layer, under the label and after the cap.
assert.deepEqual([2, 4, 6, 8, 10].map(i => bars['CDFEBar' + i]._modShade.style.display), ['none', 'none', 'none', 'none', 'block']);
assert.match(bars.CDFEBar10._modShade.style.cssText, /rgba\(0,0,0,0\.35\)/);
assert.deepEqual(bars.CDFEBar10.children.map(c => c === bars.CDFEBar10._modShade ? 'shade' : c === bars.CDFEBar10._modLbl ? 'label' : c.className),
                 ['FuelConsumptionCtrlCDFEBarGraphCap', 'shade', 'label']);
// Reused, and hidden again when the bar is no longer current.
bars.CDFEBar10.className = 'FuelConsumptionCtrlCDFEBarGraphCore';
paired._modPairCDFEBars();
assert.equal(bars.CDFEBar10.children.length, 3);
assert.equal(bars.CDFEBar10._modShade.style.display, 'none');
assert.equal(bars.CDFEBar4.style.height, Math.round(109 * 14.2 / 15) + 'px');
assert.equal(bars.CDFEBar11.style.width, undefined);
assert.equal(bars.CDFEBar11.style.visibility, undefined);

// The x axis gets 8, 6, 4 and 2 on the pair borders; the factory "5" label is reused for 6.
const xDiv = element('div');
const five = element('span');
five.innerHTML = 5; five.style.left = '170px'; five.style.width = '44px';
xDiv.appendChild(five);
paired._modPairCDFEAxisLabels(xDiv, five);
assert.equal(xDiv.children.length, 4);
assert.deepEqual(xDiv.children.map(l => [l.innerHTML, l.style.left, l.style.width]),
                 [[6, '147px', '44px'], [8, '101px', '44px'], [4, '193px', '44px'], [2, '239px', '44px']]);
graph('hevstyle').c._modPairCDFEAxisLabels(xDiv, five);
assert.equal(xDiv.children.length, 4);

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

console.log('FUEL_CONSUMPTION_VALUES_BEHAVIOR_PASSED: bar setters, label reuse, placement, empty values, narrow-bar font, inside placement with shadow, paired 1-minute bars with wide caps and darker current pair, pair axis labels and immediate shift.');
