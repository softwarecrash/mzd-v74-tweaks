/* Design draft: unit conversion, skin selection, translations and view lifecycle. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const root = path.resolve(__dirname, '../../../usb/tweaks/drivedash/assets');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const acornKey = Object.keys(process.binding('natives')).find(k => k.endsWith('acorn/dist/acorn'));
const parser = new Module('drivedash-es5');
parser._compile(process.binding('natives')[acornKey], 'drivedash-es5.js');
for (const name of ['i18n.js', 'data.js', 'model.js', 'skins/registry.js', 'skins/oem-style.js', 'skins/classic.js', 'skins/motorsport.js', 'skins/illustrated.js', 'skins/venom.js', 'demo.js', 'live.js', 'preferences.js', 'needle.js', 'view.js', 'resident.js']) {
    parser.exports.parse(source(name), {ecmaVersion: 5});
}

function fixture(native, live, initial, deferred, bitmap=false) {
    const timeouts = new Map(); let timeoutId = 0;
    const stats = {bitmapDraws:0,drawn:[],rotations:[],imageLoads:[],images:[],timerDelays:[]};
    const events = {}, intervals = new Map(), texts = [], labels = [], messages = [], saved = {};
    if (initial) saved['mzd-drivedash-design-preview-v1']=JSON.stringify(initial);
    const drawing = new Proxy({}, {get(target, key) {
        if (key === 'rotate') return angle => {stats.rotations.push(angle);};
        if (key === 'drawImage') return image => {stats.bitmapDraws++;stats.drawn.push(image);};
        if (key === 'fillText') return (value,x,y) => {texts.push(value);labels.push({value,x,y});};
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
    let input, dispose, suspend, resume;
    const serviceCallbacks = {};
    let serviceSerial = 0;
    let unitsCallback = null;
    const window = {parent, innerWidth: 800, innerHeight: 416, location: {hash: native ? '#mzdgui=preview-token' : '', search: live ? '?lang=de_DE&data=cmu' : '?lang=de_DE'},
        localStorage: {getItem: key => saved[key] || null, setItem: (key, value) => {saved[key] = value;}},
        addEventListener: (name, fn) => {events[name] = fn;}, removeEventListener: name => {delete events[name];},
        setTimeout: (fn,ms) => {stats.timerDelays.push(ms);timeouts.set(++timeoutId,fn);return timeoutId;},clearTimeout: id => {timeouts.delete(id);},
        setInterval: fn => {const id = intervals.size+1; intervals.set(id, fn); return id;}, clearInterval: id => intervals.delete(id),
        MzdGuiModule: {
            token: native ? 'preview-token' : '',
            onSuspend: fn => {suspend=fn;},
            onResume: fn => {resume=fn;},
            setLayout: value => messages.push({type:'layout',value}),
            onInput: fn => {input = fn;},
            onDispose: fn => {dispose = fn;},
            ready() {},
            loadLanguage: fn => fn('de_DE', 'ltr'),
            getUnits: fn => {
                messages.push({type:'mzd-gui-units-request'});
                unitsCallback = fn;
            },
            request: (operation, args, callback, timeoutMs) => {
                const id = ++serviceSerial;
                messages.push({type:'mzd-gui-service-request', id, operation, args, values: args ? args.values : undefined});
                serviceCallbacks[id] = callback;
            }
        }
    };
    if (bitmap) window.Image = function () {stats.images.push(this);this.complete=bitmap!=='pending';this.width=800;this.height=416;Object.defineProperty(this,'src',{set(value){stats.imageLoads.push(value);}});};
    const document = {documentElement: {}, getElementById: id => nodes[id], createElement: node};
    const context = vm.createContext({window, document, Date, console});
    for (const name of ['i18n.js', 'data.js', 'model.js', 'skins/registry.js', 'skins/oem-style.js', 'skins/classic.js', 'skins/motorsport.js', 'skins/illustrated.js', 'skins/venom.js', 'demo.js', 'live.js', 'preferences.js', 'needle.js', 'view.js']) vm.runInContext(source(name), context);
    if (live && !deferred) {
        const load = messages.find(m=>m.operation==='preferences');
        assert.ok(load);
        serviceCallbacks[load.id](null, initial || {});
    }
    if (native && !deferred && unitsCallback) {
        unitsCallback({language:'de_DE',speedUnit:'mph',tempUnit:'F'});
    }
    return {window, context, nodes, stats, events, intervals, texts, labels, messages, saved, input, dispose, suspend, resume, timeouts, serviceCallbacks, getUnitsCallback: () => unitsCallback};
}

const f = fixture(false), model = f.window.DriveDashModel;
assert.equal(f.messages[0].type,'layout');assert.equal(f.messages[0].value,'with-status-bar');
assert.equal(f.nodes.stage.style.top,'0px');assert.equal(f.nodes.stage.style.transform,'none');
assert.ok(!f.texts.some(value=>/^\d{2}:\d{2}$/.test(String(value))),'Only the original Mazda bar displays the clock');
const tr = key => f.window.DriveDashLanguages.en_US[key] || key;
let config = model.settings({speedUnit:'mph',tempUnit:'F'}, ['oem-style']);
let value = model.display({speedKph:88,rpm:2400,outsideC:22,coolantC:90,tripKm:123.4,avgL100:6.7},config,tr);
assert.equal(value.speed,'55'); assert.equal(value.outside,'72'); assert.equal(value.coolant,'194');
assert.equal(value.averageUnit,'mpg');
let auto = model.settings({},['oem-style']);
let automatic = model.display({speedKph:88,outsideC:22,speedUnit:'kmh',tempUnit:'C'},auto,tr,{speedUnit:'mph',tempUnit:'F'});
assert.equal(automatic.speed,'55');assert.equal(automatic.outside,'72');
let manual = model.display({speedKph:88,outsideC:22},model.settings({speedUnit:'kmh',tempUnit:'C'},['oem-style']),tr,{speedUnit:'mph',tempUnit:'F'});
assert.equal(manual.speed,'88');assert.equal(manual.outside,'22');
value = model.display({engineLoadPercent:43,batteryPercent:81},config,tr);
assert.equal(value.engineLoad,43);assert.equal(value.battery,81);
value = model.display({},config,tr);
assert.equal(value.engineLoad,null);assert.equal(value.battery,null);
assert.equal(value.speed,'--'); assert.equal(value.rpm,null); assert.equal(value.outside,'--');
assert.equal(model.settings({speedUnit:'bad',tempUnit:'bad',design:'bad'},['oem-style']).design,'oem-style');
assert.equal(f.nodes.demo.textContent,'DEMOWERTE'); assert.ok(f.texts.includes('Außen'));
assert.ok(f.texts.includes('123,4 km'));
for (const dictionary of Object.values(f.window.DriveDashLanguages)) { assert.equal(dictionary['gui.label'],'DriveDash'); assert.equal(dictionary.title,'DriveDash'); }
for (const key of Object.keys(f.window.DriveDashLanguages.en_US)) assert.ok(f.window.DriveDashLanguages.de_DE[key],key);
assert.equal(f.intervals.size,1);

// Additional registered renderers appear in settings and activate without exiting.
let alternativeDraws = 0;
f.window.DriveDashSkins.register({id:'alternative',labelKey:'Alternative',draw() {alternativeDraws++;}});
assert.throws(() => f.window.DriveDashSkins.register({id:'alternative',draw() {}}));
f.nodes.settings.onclick(); assert.equal(f.intervals.size,0);
f.nodes['menu-rows'].children[0].onclick();
assert.equal(f.nodes['menu-rows'].children.length,7);
assert(!f.nodes['menu-rows'].children.some(row=>row.children[0].textContent==='Zur\u00fcck'));
f.nodes['menu-rows'].children[6].onclick();
assert.equal(alternativeDraws,0); assert.equal(f.intervals.size,0);
f.input('back','step'); // Design -> settings, still paused.
assert.equal(f.intervals.size,0);
f.nodes['menu-back'].onclick(); // Settings -> gauge.
assert.ok(alternativeDraws>0); assert.equal(f.intervals.size,1);
assert.equal(JSON.parse(f.saved['mzd-drivedash-design-preview-v1']).design,'alternative');
f.nodes.settings.onclick(); f.nodes['menu-rows'].children[1].onclick(); f.nodes['menu-rows'].children[2].onclick();
assert.equal(JSON.parse(f.saved['mzd-drivedash-design-preview-v1']).speedUnit,'mph');
assert.equal(f.intervals.size,0,'Selecting a unit must stay in the settings.');
assert.equal(f.nodes['menu-title'].textContent,'Geschwindigkeitseinheit');
assert.ok(f.nodes['menu-rows'].children[2].children[0].textContent.startsWith('\u2713'));
f.dispose(); assert.equal(f.intervals.size,0); assert.equal(f.events.message,undefined);

// Native emulator path: localized rows are sent to the OEM adapter, not the HTML menu.
const n = fixture(true);
n.input('select','press'); n.input('select','release');
assert.equal(n.intervals.size,0);
const render = n.messages.find(m => m.type==='drivedash-native-render');
assert.equal(render.menu.title,'Einstellungen'); assert.equal(render.menu.rows[0].label,'Design');
assert.notEqual(n.nodes['fallback-menu'].style.display,'block');
assert(!render.menu.rows.some(row=>row.id==='return'));
n.events.message({source:{},data:{type:'mzd-gui-input',token:'preview-token',action:'back',phase:'step'}});
assert.equal(n.intervals.size,0);
n.input('back','step');
assert.equal(n.intervals.size,1);
assert.ok(n.messages.some(m => m.type==='drivedash-native-release'));
assert.equal(n.input('back','step'),false);
assert.ok(n.texts.includes('mph'));assert.ok(n.texts.includes('72\u00b0F'));
n.nodes.settings.onclick();
n.events.message({source:n.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:3}});
n.events.message({source:n.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:1}});
assert.equal(n.nodes.settings.textContent,'Settings');
assert.equal(JSON.parse(n.saved['mzd-drivedash-design-preview-v1']).language,'en_US');
assert.equal(n.intervals.size,0);
assert.equal(n.messages.filter(m=>m.type==='drivedash-native-render').at(-1).menu.title,'Language');
assert.ok(n.messages.filter(m=>m.type==='drivedash-native-render').at(-1).menu.rows[1].checked);
n.events.message({source:n.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:0}});
assert.equal(n.nodes.settings.textContent,'Einstellungen','Automatic restores the startup CMU language.');
assert.equal(n.messages.filter(m=>m.type==='mzd-gui-units-request').length,1);
n.dispose(); assert.equal(n.intervals.size,0);

// Live view uses the authenticated resident bridge and never falls back to demo data.
const live = fixture(true,true);
assert.equal(live.intervals.size,0);
const sample = live.messages.find(m => m.operation==='sample');
assert.ok(sample);assert.equal(live.nodes.demo.textContent,'KEINE FAHRZEUGDATEN');
live.serviceCallbacks[sample.id](null,{source:'cmu',available:true,speedKph:12,rpm:700});
assert.equal(live.nodes.demo.textContent,'FAHRZEUGDATEN');
live.nodes.settings.onclick();
const liveMenu = live.messages.filter(m => m.type==='drivedash-native-render').at(-1);
assert.ok(!liveMenu.menu.rows.some(row => row.id==='animated'));
live.dispose();

const allManual = fixture(true,false,{language:'en_US',speedUnit:'kmh',tempUnit:'C'});
assert.equal(allManual.messages.filter(m=>m.type==='mzd-gui-units-request').length,0);
assert.equal(allManual.nodes.settings.textContent,'Settings');
allManual.nodes.settings.onclick();
allManual.events.message({source:allManual.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:3}});
allManual.events.message({source:allManual.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:0}});
const firstAuto = allManual.messages.find(m=>m.type==='mzd-gui-units-request');
assert.ok(firstAuto);
allManual.dispose();

const mixed = fixture(true,false,{language:'de_DE',speedUnit:'auto',tempUnit:'C'});
const mixedRequest = mixed.messages.find(m=>m.type==='mzd-gui-units-request');
assert.ok(mixedRequest);
mixed.dispose();

const savedLive = fixture(true,true,{version:1,language:'en_US',design:'oem-style',speedUnit:'mph',tempUnit:'F',animated:true});
assert.equal(savedLive.messages.filter(m=>m.type==='mzd-gui-units-request').length,0,'Read persistent choices before querying automatic settings.');
assert.equal(savedLive.nodes.settings.textContent,'Settings');
savedLive.nodes.settings.onclick();
savedLive.events.message({source:savedLive.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:1}});
savedLive.events.message({source:savedLive.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index:1}});
const save = savedLive.messages.filter(m=>m.operation==='preferences').at(-1);
assert.equal(save.values.speedUnit,'kmh');
assert.equal(savedLive.intervals.size,0,'Saving must keep settings open.');
savedLive.dispose();

// No English frame or sensor polling before preferences and locale have resolved.
const startup = fixture(true,true,null,true);
assert.equal(startup.texts.length,0);assert.equal(startup.nodes.stage.style.visibility,'hidden');
assert.equal(startup.messages.filter(m=>m.operation==='sample').length,0);
const loadPreferences = startup.messages.find(m=>m.operation==='preferences');
startup.serviceCallbacks[loadPreferences.id](null, {});
assert.ok(startup.messages.some(m=>m.type==='mzd-gui-units-request'));assert.equal(startup.texts.length,0);
assert.equal(startup.nodes.stage.style.visibility,'hidden');
startup.getUnitsCallback()({language:'de_DE',speedUnit:'kmh',tempUnit:'C'});
assert.equal(startup.nodes.stage.style.visibility,'visible');assert.ok(startup.texts.includes('Au\u00dfen'));assert.ok(!startup.texts.includes('Outside'));
assert.equal(startup.messages.filter(m=>m.operation==='sample').length,1);startup.dispose();

// Missing localization cannot hide the screen forever or produce a late language flip.
const fallback = fixture(true,false,null,true);
assert.equal(fallback.texts.length,0);[...fallback.timeouts.values()][0]();
assert.equal(fallback.nodes.stage.style.visibility,'visible');assert.equal(fallback.nodes.settings.textContent,'Settings');
if (fallback.getUnitsCallback()) { fallback.getUnitsCallback()({language:'de_DE'}); }
assert.equal(fallback.nodes.settings.textContent,'Settings');fallback.dispose();
console.log('DRIVEDASH_PREVIEW_PASSED: ES5, missing data, conversions, shared i18n, live skin switch, saved browser choices, native menu messages and timer cleanup.');

const phone=fixture(true);assert.equal(phone.intervals.size,1);
phone.suspend();assert.equal(phone.intervals.size,0);phone.resume();assert.equal(phone.intervals.size,1);
phone.input('select','press');phone.input('select','release');assert.equal(phone.intervals.size,0);
let before=phone.messages.filter(m=>m.type==='drivedash-native-render').length;
phone.suspend();phone.resume();assert.equal(phone.intervals.size,0,'settings must remain paused after call');
assert.equal(phone.messages.filter(m=>m.type==='drivedash-native-render').length,before+1,'settings rebuilt after resident release');
phone.dispose();phone.resume();assert.equal(phone.intervals.size,0);
console.log('DRIVEDASH_PHONE_PASSED: demand-driven data stops during calls, resumes on gauge, settings retained/rebuilt, no restart after disposal.');

const gearView=fixture(false), skin=gearView.window.DriveDashSkins.get('oem-style');
let labelStart=gearView.labels.length;
skin.draw(gearView.nodes.gauge.getContext('2d'),model.display({},config,tr),tr);
assert(!gearView.labels.slice(labelStart).some(label=>label.x===161&&label.y===290),'unavailable gear has no placeholder');
labelStart=gearView.labels.length;
skin.draw(gearView.nodes.gauge.getContext('2d'),model.display({gear:'3'},config,tr),tr);
assert(gearView.labels.slice(labelStart).some(label=>label.x===161&&label.y===290&&label.value==='3'),'valid gear remains visible');
gearView.window.innerWidth=1600;gearView.window.innerHeight=832;gearView.events.resize();
assert.equal(gearView.nodes.stage.style.transform,'none','native canvas is never enlarged by CSS');gearView.dispose();
console.log('DRIVEDASH_RENDER_PASSED: missing gear omitted, valid gear shown and no CSS upscaling.');

const png=fs.readFileSync(path.join(root,'skins/oem-style-background.png'));
assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),800);assert.equal(png.readUInt32BE(20),416);
const raster=fixture(false,false,null,false,true);assert(raster.stats.bitmapDraws>0,'loaded native-size bitmap is actually used');
const movingNeedle=raster.window.DriveDashNeedle;assert.equal(typeof movingNeedle,'function');raster.dispose();
console.log('DRIVEDASH_BITMAP_PASSED: native-size PNG and loaded-image rendering path, with vector fallback covered by the other view fixtures.');

const liveNeedle=fixture(true,true);
let request=liveNeedle.messages.filter(m=>m.operation==='sample').at(-1);
function rpmReply(rpm){liveNeedle.serviceCallbacks[request.id](null,{source:'cmu',available:true,rpm,speedKph:0});}
rpmReply(1000);
const [pollId,poll]=[...liveNeedle.timeouts][0];liveNeedle.timeouts.delete(pollId);poll();
request=liveNeedle.messages.filter(m=>m.operation==='sample').at(-1);rpmReply(3000);
assert(liveNeedle.timeouts.size>=2,'polling and needle redraw timers are separate');
const sampleCount=liveNeedle.messages.filter(m=>m.operation==='sample').length;
liveNeedle.suspend();assert.equal(liveNeedle.timeouts.size,0,'phone suspension stops both timer types');
assert.equal(liveNeedle.messages.filter(m=>m.operation==='sample').length,sampleCount,'animation does not request extra samples');
liveNeedle.dispose();assert.equal(liveNeedle.timeouts.size,0);
console.log('DRIVEDASH_ANIMATION_LIFECYCLE_PASSED: interpolation timer is separate from sensor polling and both stop during phone suspension.');

const cache=fixture(false,false,null,false,true),cacheSkin=cache.window.DriveDashSkins.get('oem-style');
const cachedSample=model.display({rpm:1000,speedKph:88},config,tr);cacheSkin.draw(cache.nodes.gauge.getContext('2d'),cachedSample,tr);
const labelCount=cache.labels.length;cachedSample.rpm=2000;cacheSkin.draw(cache.nodes.gauge.getContext('2d'),cachedSample,tr);
assert.equal(cache.labels.length,labelCount,'needle-only frames reuse instrument labels and LCD geometry');
cachedSample.speed='99';cacheSkin.draw(cache.nodes.gauge.getContext('2d'),cachedSample,tr);assert(cache.labels.length>labelCount,'changed readings invalidate the cache');cache.dispose();
console.log('DRIVEDASH_RENDER_CACHE_PASSED: needle animation reuses instrument layer; new readings invalidate it.');

const classic=fixture(false,false,{design:'classic'});
assert.ok(classic.texts.includes(classic.window.DriveDashLanguages.de_DE['data.topSpeedKph']));
assert.equal(classic.window.DriveDashSkins.get('classic').labelKey,'design.classic');
for (const digit of ['0','7']) assert.ok(classic.labels.some(label=>String(label.value)===digit && label.y>300 && label.y<=405),'Classic RPM '+digit+' remains inside the view.');
classic.dispose();
console.log('DRIVEDASH_CLASSIC_PASSED: registered renderer, shared labels/model, ES5 and missing-data rendering.');

const compassView=fixture(false,false,{design:'classic'}),compassSkin=compassView.window.DriveDashSkins.get('classic');
let mark=compassView.labels.length;
compassSkin.draw(compassView.nodes.gauge.getContext('2d'),model.display({speedKph:40,gpsCourseDeg:90},config,tr),tr);
let north=compassView.labels.slice(mark).find(label=>label.value==='N');
assert.ok(north && Math.abs(north.x)<1 && north.y===-86,'North keeps its fixed position within the rotating ring.');
assert.ok(compassView.stats.rotations.some(angle=>Math.abs(angle+Math.PI/2)<0.0001),'The complete ring rotates west when heading east.');
mark=compassView.labels.length;
compassSkin.draw(compassView.nodes.gauge.getContext('2d'),model.display({},config,tr),tr);
assert.ok(!compassView.labels.slice(mark).some(label=>['N','E','S','W'].includes(label.value)),'Unknown course does not show a fake cardinal ring.');
compassView.dispose();

const sport=fixture(false,false,{design:'motorsport'});
assert.equal(sport.window.DriveDashSkins.get('motorsport').labelKey,'design.motorsport');
assert.ok(sport.texts.includes('88'));assert.ok(sport.texts.includes('D'));assert.ok(sport.texts.includes('123,4 km'));
sport.dispose();
console.log('DRIVEDASH_MOTORSPORT_PASSED: shared model/units, missing-data path, demo readings and ES5.');

for(const design of ['sakura','midnight-rose']){
 const illustrated=fixture(false,false,{design:design});
 assert.equal(illustrated.window.DriveDashSkins.get(design).labelKey,'design.'+design);
 assert.ok(illustrated.texts.includes('88'));assert.ok(illustrated.texts.includes('123,4 km'));
 illustrated.dispose();
}
console.log('DRIVEDASH_ILLUSTRATED_PASSED: both themes, shared live values, translations, no-image fallback and ES5.');

for(const design of ['oem-style','classic','motorsport','sakura','midnight-rose','venom']){
 const lazy=fixture(false,false,{design},false,true);
 assert.deepEqual(lazy.stats.imageLoads,design==='classic'||design==='motorsport'?[]:['skins/'+design+'-background.png'],'Only selected skin loads its bitmap.');
 lazy.nodes.gauge.onclick();assert.equal(lazy.nodes['menu-title'].textContent,'Einstellungen','Tapping gauge opens settings.');lazy.dispose();
}

let demoClock=0,demoTick,demoState;
const dw={setInterval(fn){demoTick=fn;return 1;},clearInterval(){}};
vm.runInNewContext(source('demo.js'),{window:dw,Date:class{getTime(){return demoClock;}}});
const highSpeedDemo=new dw.DriveDashDemo();highSpeedDemo.start(value=>{demoState=value;},true);
for(const [seconds,speed] of [[16,288],[20,320],[24,360]]){demoClock=seconds*1000;demoTick();assert.equal(demoState.speedKph,speed);}
highSpeedDemo.stop();

const retry = fixture(true,true,null,true);
function failLoad(f) {const request=f.messages.filter(m=>m.operation==='preferences').at(-1);f.serviceCallbacks[request.id]('temporary');}
function retryTimer(f,delay){assert.equal(f.stats.timerDelays.at(-1),delay);const [id,fn]=[...f.timeouts].at(-1);f.timeouts.delete(id);fn();}
failLoad(retry);assert.equal(retry.nodes.stage.style.visibility,'hidden');retryTimer(retry,2000);
failLoad(retry);retryTimer(retry,4000);failLoad(retry);
retry.getUnitsCallback()({language:'de_DE'});
const nativeSelect=(f,index)=>f.events.message({source:f.window.parent,data:{type:'drivedash-native-select',token:'preview-token',index}});
const lastMenu=f=>f.messages.filter(m=>m.type==='drivedash-native-render').at(-1).menu;
retry.nodes.gauge.onclick();assert(lastMenu(retry).rows.every(row=>row.disabled),'Settings are read-only after a failed load.');
for(let index=0;index<lastMenu(retry).rows.length;index++)nativeSelect(retry,index);
assert.equal(lastMenu(retry).page,'settings');
assert(!retry.messages.some(m=>m.values),'Failed load cannot overwrite settings');
assert.equal(retry.messages.filter(m=>m.operation==='preferences').length,3);
retry.dispose();assert.equal(retry.timeouts.size,0);
const recovery=fixture(true,true,null,true);failLoad(recovery);retryTimer(recovery,2000);
const load=recovery.messages.filter(m=>m.operation==='preferences').at(-1);
recovery.serviceCallbacks[load.id](null,{design:'classic',language:'de_DE',speedUnit:'mph',tempUnit:'F'});
assert.equal(recovery.nodes.stage.style.visibility,'visible');
recovery.nodes.settings.onclick();assert.equal(recovery.messages.at(-1).menu.rows[0].detail,'Classic');
nativeSelect(recovery,0);nativeSelect(recovery,2);assert.equal(recovery.messages.filter(m=>m.values).at(-1).values.design,'motorsport','Saving works after a successful retry.');
recovery.dispose();
const cancelled=fixture(true,true,null,true);failLoad(cancelled);cancelled.dispose();assert.equal(cancelled.timeouts.size,0);
const artwork=fixture(false,false,{animated:false},false,true);
const image=artwork.stats.images[0];const draws=artwork.stats.bitmapDraws;image.onload();
assert(artwork.stats.bitmapDraws>draws,'Static demo redraws when its image loads');
artwork.suspend();const stopped=artwork.stats.bitmapDraws;image.onload();assert.equal(artwork.stats.bitmapDraws,stopped);
artwork.dispose();image.onload();assert.equal(artwork.stats.bitmapDraws,stopped);

const broken=fixture(true,true,null,true);
broken.window.DriveDashSkins.register({id:'broken',labelKey:'Broken',draw(){throw new Error('canvas failure');}});
assert.throws(()=>broken.serviceCallbacks[broken.messages.find(m=>m.operation==='preferences').id](null,{design:'broken',language:'de_DE',speedUnit:'kmh',tempUnit:'C'}),/canvas failure/);
assert.equal(broken.nodes.stage.style.visibility,'visible','A failing first draw cannot hide the view.');
assert.ok(broken.messages.some(m=>m.operation==='sample'),'Polling starts despite the failing draw.');
broken.dispose();
const pending=fixture(false,false,{animated:false},false,'pending');
const pendingArt=pending.stats.images[0];assert(!pending.stats.drawn.includes(pendingArt));
pendingArt.complete=true;pendingArt.onload();assert(pending.stats.drawn.includes(pendingArt),'Loaded artwork replaces the cached fallback layer.');
pending.dispose();
const venom=fixture(false,false,{design:'venom'},false,true);
assert.equal(venom.window.DriveDashSkins.get('venom').id,'venom');
assert(venom.texts.includes('88'));assert(venom.stats.imageLoads.includes('skins/venom-background.png'));
venom.dispose();
console.log('DRIVEDASH_VENOM_PASSED: registered ES5 skin, live model, lazy image and lifecycle.');

demoClock=0;const rpmDemo=new dw.DriveDashDemo();rpmDemo.start(value=>{demoState=value;},true);
assert.equal(demoState.rpm,800);
for(const [seconds,rpm] of [[2,3200],[4,1200],[6,6200],[8,2000],[10,7600],[12,900]]){demoClock=seconds*1000;demoTick();assert.equal(demoState.rpm,rpm);}
rpmDemo.stop();rpmDemo.start(value=>{demoState=value;},false);assert.equal(demoState.rpm,2400);
