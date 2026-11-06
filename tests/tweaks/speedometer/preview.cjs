/* Design draft: unit conversion, skin selection, translations and view lifecycle. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const root = path.resolve(__dirname, '../../../usb/tweaks/speedometer/assets');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const acornKey = Object.keys(process.binding('natives')).find(k => k.endsWith('acorn/dist/acorn'));
const parser = new Module('speedometer-es5');
parser._compile(process.binding('natives')[acornKey], 'speedometer-es5.js');
for (const name of ['i18n.js', 'model.js', 'skins/registry.js', 'skins/bm2014.js', 'demo.js', 'live.js', 'preferences.js', 'view.js', 'resident.js']) {
    parser.exports.parse(source(name), {ecmaVersion: 5});
}

function fixture(native, live, initial, deferred) {
    const timeouts = new Map(); let timeoutId = 0;
    const events = {}, intervals = new Map(), texts = [], messages = [], saved = {};
    if (initial) saved['mzd-speedometer-design-preview-v1']=JSON.stringify(initial);
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
    nodes.stage.style.visibility='hidden';
    const parent = {postMessage: data => messages.push(data)};
    let input, dispose;
    const window = {parent, innerWidth: 800, innerHeight: 480, location: {hash: native ? '#mzdgui=preview-token' : '', search: live ? '?lang=de_DE&data=cmu' : '?lang=de_DE'},
        localStorage: {getItem: key => saved[key] || null, setItem: (key, value) => {saved[key] = value;}},
        addEventListener: (name, fn) => {events[name] = fn;}, removeEventListener: name => {delete events[name];},
        setTimeout: fn => {timeouts.set(++timeoutId,fn);return timeoutId;},clearTimeout: id => {timeouts.delete(id);},
        setInterval: fn => {const id = intervals.size+1; intervals.set(id, fn); return id;}, clearInterval: id => intervals.delete(id),
        MzdGuiModule: {onInput: fn => {input = fn;}, onDispose: fn => {dispose = fn;}, ready() {}, loadLanguage: fn => fn('de_DE', 'ltr')}
    };
    const document = {documentElement: {}, getElementById: id => nodes[id], createElement: node};
    const context = vm.createContext({window, document, Date, console});
    for (const name of ['i18n.js', 'model.js', 'skins/registry.js', 'skins/bm2014.js', 'demo.js', 'live.js', 'preferences.js', 'view.js']) vm.runInContext(source(name), context);
    if (live && !deferred) { const load = messages.find(m=>m.type==='speedo-preferences'); assert.ok(load); events.message({source:parent,data:{type:'speedo-preferences-result',token:'preview-token',id:load.id,result:initial || {}}}); }
    if (native && !deferred && messages.some(m=>m.type==='speedo-system-settings')) events.message({source:parent,data:{type:'speedo-system-settings-result',token:'preview-token',settings:{language:'de_DE',speedUnit:'mph',tempUnit:'F'}}});
    return {window, context, nodes, events, intervals, texts, messages, saved, input, dispose,timeouts};
}

const f = fixture(false), model = f.window.SpeedometerModel;
const tr = key => f.window.SpeedometerLanguages.en_US[key] || key;
let config = model.settings({speedUnit:'mph',tempUnit:'F'}, ['bm2014']);
let value = model.display({speedKph:88,rpm:2400,outsideC:22,coolantC:90,tripKm:123.4,avgL100:6.7},config,tr);
assert.equal(value.speed,'55'); assert.equal(value.outside,'72'); assert.equal(value.coolant,'194');
assert.equal(value.averageUnit,'mpg');
let auto = model.settings({},['bm2014']);
let automatic = model.display({speedKph:88,outsideC:22,speedUnit:'kmh',tempUnit:'C'},auto,tr,{speedUnit:'mph',tempUnit:'F'});
assert.equal(automatic.speed,'55');assert.equal(automatic.outside,'72');
let manual = model.display({speedKph:88,outsideC:22},model.settings({speedUnit:'kmh',tempUnit:'C'},['bm2014']),tr,{speedUnit:'mph',tempUnit:'F'});
assert.equal(manual.speed,'88');assert.equal(manual.outside,'22');
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
assert.equal(f.nodes['menu-rows'].children.length,3);
assert.equal(f.nodes['menu-rows'].children.at(-1).children[0].textContent,'Zur\u00fcck');
f.nodes['menu-rows'].children[1].onclick();
assert.equal(alternativeDraws,0); assert.equal(f.intervals.size,0);
f.nodes['menu-rows'].children.at(-1).onclick(); // Design -> settings, still paused.
assert.equal(f.intervals.size,0);
f.nodes['menu-back'].onclick(); // Settings -> gauge.
assert.ok(alternativeDraws>0); assert.equal(f.intervals.size,1);
assert.equal(JSON.parse(f.saved['mzd-speedometer-design-preview-v1']).design,'alternative');
f.nodes.settings.onclick(); f.nodes['menu-rows'].children[1].onclick(); f.nodes['menu-rows'].children[2].onclick();
assert.equal(JSON.parse(f.saved['mzd-speedometer-design-preview-v1']).speedUnit,'mph');
assert.equal(f.intervals.size,0,'Selecting a unit must stay in the settings.');
assert.equal(f.nodes['menu-title'].textContent,'Geschwindigkeitseinheit');
assert.ok(f.nodes['menu-rows'].children[2].children[0].textContent.startsWith('\u2713'));
f.dispose(); assert.equal(f.intervals.size,0); assert.equal(f.events.message,undefined);

// Native emulator path: localized rows are sent to the OEM adapter, not the HTML menu.
const n = fixture(true);
n.input('select','press'); n.input('select','release');
assert.equal(n.intervals.size,0);
const render = n.messages.find(m => m.type==='speedo-native-render');
assert.equal(render.menu.title,'Einstellungen'); assert.equal(render.menu.rows[0].label,'Design');
assert.notEqual(n.nodes['fallback-menu'].style.display,'block');
n.events.message({source:{},data:{type:'speedo-native-select',token:'preview-token',index:render.menu.rows.findIndex(row => row.id==='return')}});
assert.equal(n.intervals.size,0);
n.events.message({source:n.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:render.menu.rows.findIndex(row => row.id==='return')}});
assert.equal(n.intervals.size,1);
assert.ok(n.messages.some(m => m.type==='speedo-native-release'));
assert.equal(n.input('back','step'),false);
// Snapshot is read once; automatic choices use CMU units even for simulated values.
n.events.message({source:n.window.parent,data:{type:'speedo-system-settings-result',token:'preview-token',settings:{language:'de_DE',speedUnit:'mph',tempUnit:'F'}}});
assert.ok(n.texts.includes('mph'));assert.ok(n.texts.includes('72\u00b0F'));
n.events.message({source:n.window.parent,data:{type:'speedo-system-settings-result',token:'preview-token',settings:{language:'en_US',speedUnit:'kmh'}}});
assert.equal(n.nodes.settings.textContent,'Einstellungen','A second snapshot must not change a running view.');
n.nodes.settings.onclick();
n.events.message({source:n.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:3}});
n.events.message({source:n.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:1}});
assert.equal(n.nodes.settings.textContent,'Settings');
assert.equal(JSON.parse(n.saved['mzd-speedometer-design-preview-v1']).language,'en_US');
assert.equal(n.intervals.size,0);
assert.equal(n.messages.filter(m=>m.type==='speedo-native-render').at(-1).menu.title,'Language');
assert.ok(n.messages.filter(m=>m.type==='speedo-native-render').at(-1).menu.rows[1].checked);
n.events.message({source:n.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:0}});
assert.equal(n.nodes.settings.textContent,'Einstellungen','Automatic restores the startup CMU language.');
assert.equal(n.messages.filter(m=>m.type==='speedo-system-settings').length,1);
n.dispose(); assert.equal(n.intervals.size,0);
// Live view uses the authenticated resident bridge and never falls back to demo data.
const live = fixture(true,true);
assert.equal(live.intervals.size,0);
const sample = live.messages.find(m => m.type==='speedo-sample');
assert.ok(sample);assert.equal(live.nodes.demo.textContent,'KEINE FAHRZEUGDATEN');
live.events.message({source:live.window.parent,data:{type:'speedo-sample-result',token:'preview-token',id:sample.id,result:{source:'cmu',available:true,speedKph:12,rpm:700}}});
assert.equal(live.nodes.demo.textContent,'FAHRZEUGDATEN');
live.nodes.settings.onclick();
const liveMenu = live.messages.filter(m => m.type==='speedo-native-render').at(-1);
assert.ok(!liveMenu.menu.rows.some(row => row.id==='animated'));
live.dispose();
const allManual = fixture(true,false,{language:'en_US',speedUnit:'kmh',tempUnit:'C'});
assert.equal(allManual.messages.filter(m=>m.type==='speedo-system-settings').length,0);
assert.equal(allManual.nodes.settings.textContent,'Settings');
allManual.nodes.settings.onclick();
allManual.events.message({source:allManual.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:3}});
allManual.events.message({source:allManual.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:0}});
const firstAuto = allManual.messages.find(m=>m.type==='speedo-system-settings');
assert.ok(firstAuto.fields.language);assert.equal(firstAuto.fields.speedUnit,false);assert.equal(firstAuto.fields.tempUnit,false);
allManual.dispose();
const mixed = fixture(true,false,{language:'de_DE',speedUnit:'auto',tempUnit:'C'});
const mixedRequest = mixed.messages.find(m=>m.type==='speedo-system-settings');
assert.equal(mixedRequest.fields.language,false);assert.equal(mixedRequest.fields.speedUnit,true);assert.equal(mixedRequest.fields.tempUnit,false);
mixed.dispose();
const savedLive = fixture(true,true,{version:1,language:'en_US',design:'bm2014',speedUnit:'mph',tempUnit:'F',animated:true});
assert.equal(savedLive.messages.filter(m=>m.type==='speedo-system-settings').length,0,'Read persistent choices before querying automatic settings.');
assert.equal(savedLive.nodes.settings.textContent,'Settings');
savedLive.nodes.settings.onclick();
savedLive.events.message({source:savedLive.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:1}});
savedLive.events.message({source:savedLive.window.parent,data:{type:'speedo-native-select',token:'preview-token',index:1}});
const save = savedLive.messages.filter(m=>m.type==='speedo-preferences').at(-1);
assert.equal(save.values.speedUnit,'kmh');
assert.equal(savedLive.intervals.size,0,'Saving must keep settings open.');
savedLive.dispose();
// No English frame or sensor polling before preferences and locale have resolved.
const startup = fixture(true,true,null,true);
assert.equal(startup.texts.length,0);assert.equal(startup.nodes.stage.style.visibility,'hidden');
assert.equal(startup.messages.filter(m=>m.type==='speedo-sample').length,0);
const loadPreferences = startup.messages.find(m=>m.type==='speedo-preferences');
startup.events.message({source:startup.window.parent,data:{type:'speedo-preferences-result',token:'preview-token',id:loadPreferences.id,result:{}}});
assert.ok(startup.messages.some(m=>m.type==='speedo-system-settings'));assert.equal(startup.texts.length,0);
assert.equal(startup.nodes.stage.style.visibility,'hidden');
startup.events.message({source:startup.window.parent,data:{type:'speedo-system-settings-result',token:'preview-token',settings:{language:'de_DE',speedUnit:'kmh',tempUnit:'C'}}});
assert.equal(startup.nodes.stage.style.visibility,'visible');assert.ok(startup.texts.includes('Au\u00dfen'));assert.ok(!startup.texts.includes('Outside'));
assert.equal(startup.messages.filter(m=>m.type==='speedo-sample').length,1);startup.dispose();
// Missing localization cannot hide the screen forever or produce a late language flip.
const fallback = fixture(true,false,null,true);
assert.equal(fallback.texts.length,0);[...fallback.timeouts.values()][0]();
assert.equal(fallback.nodes.stage.style.visibility,'visible');assert.equal(fallback.nodes.settings.textContent,'Settings');
fallback.events.message({source:fallback.window.parent,data:{type:'speedo-system-settings-result',token:'preview-token',settings:{language:'de_DE'}}});
assert.equal(fallback.nodes.settings.textContent,'Settings');fallback.dispose();
console.log('SPEEDOMETER_PREVIEW_PASSED: ES5, missing data, conversions, shared i18n, live skin switch, saved browser choices, native menu messages and timer cleanup.');
