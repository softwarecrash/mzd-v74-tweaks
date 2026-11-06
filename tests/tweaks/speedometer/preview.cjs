/* Design draft: unit conversion, skin selection, translations and view lifecycle. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const root = path.resolve(__dirname, '../../../development/speedometer/assets');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const acornKey = Object.keys(process.binding('natives')).find(k => k.endsWith('acorn/dist/acorn'));
const parser = new Module('speedometer-es5');
parser._compile(process.binding('natives')[acornKey], 'speedometer-es5.js');
for (const name of ['i18n.js', 'model.js', 'skins/registry.js', 'skins/bm2014.js', 'demo.js', 'view.js', 'resident.js']) {
    parser.exports.parse(source(name), {ecmaVersion: 5});
}

function fixture(native) {
    const events = {}, intervals = new Map(), texts = [], messages = [], saved = {};
    const drawing = new Proxy({}, {get(target, key) {
        if (key === 'fillText') return value => texts.push(value);
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({addColorStop() {}});
        return target[key] || (() => {});
    }});
    function node() {
        const value = {style: {}, children: [], textContent: '', setAttribute() {}, appendChild(n) {this.children.push(n);}, getContext() {return drawing;}};
        Object.defineProperty(value, 'innerHTML', {set() {value.children = [];}});
        return value;
    }
    const nodes = {};
    for (const id of ['stage', 'gauge', 'settings', 'demo', 'fallback-menu', 'menu-title', 'menu-rows', 'menu-back']) nodes[id] = node();
    const parent = {postMessage: data => messages.push(data)};
    let input, dispose;
    const window = {parent, innerWidth: 800, innerHeight: 480, location: {hash: native ? '#mzdgui=preview-token' : '', search: '?lang=de_DE'},
        localStorage: {getItem: key => saved[key] || null, setItem: (key, value) => {saved[key] = value;}},
        addEventListener: (name, fn) => {events[name] = fn;}, removeEventListener: name => {delete events[name];},
        setInterval: fn => {const id = intervals.size+1; intervals.set(id, fn); return id;}, clearInterval: id => intervals.delete(id),
        MzdGuiModule: {onInput: fn => {input = fn;}, onDispose: fn => {dispose = fn;}, ready() {}, loadLanguage: fn => fn('de_DE', 'ltr')}
    };
    const document = {documentElement: {}, getElementById: id => nodes[id], createElement: node};
    const context = vm.createContext({window, document, Date, console});
    for (const name of ['i18n.js', 'model.js', 'skins/registry.js', 'skins/bm2014.js', 'demo.js', 'view.js']) vm.runInContext(source(name), context);
    return {window, context, nodes, events, intervals, texts, messages, saved, input, dispose};
}

const f = fixture(false), model = f.window.SpeedometerModel;
const tr = key => f.window.SpeedometerLanguages.en_US[key] || key;
let config = model.settings({speedUnit:'mph',tempUnit:'F'}, ['bm2014']);
let value = model.display({speedKph:88,rpm:2400,outsideC:22,coolantC:90,tripKm:123.4,avgL100:6.7},config,tr);
assert.equal(value.speed,'55'); assert.equal(value.outside,'72'); assert.equal(value.coolant,'194');
assert.equal(value.averageUnit,'mpg (US)');
value = model.display({},config,tr);
assert.equal(value.speed,'--'); assert.equal(value.rpm,null); assert.equal(value.outside,'--');
assert.equal(model.settings({speedUnit:'bad',tempUnit:'bad',design:'bad'},['bm2014']).design,'bm2014');
assert.equal(f.nodes.demo.textContent,'DEMOWERTE'); assert.ok(f.texts.includes('Außen'));
assert.ok(f.texts.includes('123,4 km'));
for (const key of Object.keys(f.window.SpeedometerLanguages.en_US)) assert.ok(f.window.SpeedometerLanguages.de_DE[key],key);
assert.equal(f.intervals.size,1);

// A second registered renderer appears in settings and activates without exiting.
let alternativeDraws = 0;
f.window.SpeedometerSkins.register({id:'alternative',labelKey:'Alternative',draw() {alternativeDraws++;}});
assert.throws(() => f.window.SpeedometerSkins.register({id:'alternative',draw() {}}));
f.nodes.settings.onclick(); assert.equal(f.intervals.size,0);
f.nodes['menu-rows'].children[0].onclick();
assert.equal(f.nodes['menu-rows'].children.length,2);
f.nodes['menu-rows'].children[1].onclick();
assert.ok(alternativeDraws>0); assert.equal(f.intervals.size,1);
assert.equal(JSON.parse(f.saved['mzd-speedometer-design-preview-v1']).design,'alternative');
f.nodes.settings.onclick(); f.nodes['menu-rows'].children[1].onclick(); f.nodes['menu-rows'].children[2].onclick();
assert.equal(JSON.parse(f.saved['mzd-speedometer-design-preview-v1']).speedUnit,'mph');
f.dispose(); assert.equal(f.intervals.size,0); assert.equal(f.events.message,undefined);

// Native emulator path: localized rows are sent to the OEM adapter, not the HTML menu.
const n = fixture(true);
n.input('select','press'); n.input('select','release');
assert.equal(n.intervals.size,0);
const render = n.messages.find(m => m.type==='speedo-native-render');
assert.equal(render.menu.title,'Einstellungen'); assert.equal(render.menu.rows[0].label,'Design');
assert.notEqual(n.nodes['fallback-menu'].style.display,'block');
n.events.message({source:{},data:{type:'speedo-native-select',token:'preview-token',index:4}});
assert.equal(n.intervals.size,0);
n.events.message({source:n.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:4}});
assert.equal(n.intervals.size,1);
assert.ok(n.messages.some(m => m.type==='speedo-native-release'));
assert.equal(n.input('back','step'),false);
n.dispose(); assert.equal(n.intervals.size,0);
console.log('SPEEDOMETER_PREVIEW_PASSED: ES5, missing data, conversions, shared i18n, live skin switch, saved browser choices, native menu messages and timer cleanup.');
