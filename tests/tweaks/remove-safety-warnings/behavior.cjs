// Exercise the actual patched context from the shipped diff; no vehicle runtime.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const diff = fs.readFileSync(path.join(root, 'usb/tweaks/remove-safety-warnings/assets/change.patch'), 'utf8');
let inHunk = false, before = '', after = '';
for (const line of diff.split('\n')) {
    if (line.startsWith('@@ ')) { inHunk = true; continue; }
    if (!inHunk) continue;
    if (line[0] === ' ' || line[0] === '-') before += line.slice(1) + '\n';
    if (line[0] === ' ' || line[0] === '+') after += line.slice(1) + '\n';
}
function contextBlock(text) {
    const start = text.search(/^\s*"Disclaimer"\s*:/m);
    const marker = '}, // end of Disclaimer';
    assert(start >= 0);
    const end = text.indexOf(marker, start);
    assert(end > start);
    return text.slice(start, end + 2);
}
const calls = [];
const sandbox = {
    framework: {sendEventToMmui(app, event) { calls.push([app, event]); }},
    setTimeout() { throw new Error('The replacement context must not start a timer.'); }
};
const context = vm.runInNewContext('({' + contextBlock(after) + '})', sandbox).Disclaimer;
assert.equal(context.template, 'NoCtrlTmplt');
assert.equal(context.hideHomeBtn, true);
assert.equal(context.properties.statusBarVisible, false);
assert.equal(context.properties.customBgImage, 'common/images/FullTransparent.png');
assert.equal(context.properties.visibleSurfaces.join(','), 'TRANLOGO_SURFACE,TRANLOGOEND_SURFACE');
for (const old of ['controlProperties', 'displayedFunction', 'noLongerDisplayedFunction', 'contextOutFunction']) {
    assert.equal(context[old], undefined, old + ' must not retain the old dialog/timer lifecycle');
}
assert.equal(typeof context.readyFunction, 'function');
context.readyFunction();
assert.deepEqual(calls, [
    ['system', 'DisposeIntroVideo'],
    ['common', 'Global.Yes'],
    ['system', 'NotifyDisclaimerEnd']
]);
// The diff replaces one context only, not the surrounding SystemWarning entry.
assert.match(before, /Dialog3Tmplt/);
assert.equal(diff.split('\n').filter(line => line.startsWith('@@ ')).length, 1);
assert(!diff.split('\n').some(line => /^[+-].*"SystemWarning"/.test(line)));
console.log('NO_MORE_DISCLAIMER_BEHAVIOR_PASSED: v74 context, immediate event order, no dialog/timer, single-context scope.');
