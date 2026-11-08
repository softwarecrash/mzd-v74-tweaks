const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const runtime=fs.readFileSync('usb/lib/gui-runtime/runtime.js','utf8'),sdk=fs.readFileSync('usb/lib/gui-runtime/sdk.js','utf8');
function harness(failStartup=false,unavailable=false,extraModules=[]){
 const listeners={},timeouts=new Map(),delays=new Map(),intervals=new Map(),controls=[];let selecting=false;let serial=0,context='Applications',currentApp='system',sequence=66,disposed=0;
 function node(tag){const e={tag,style:{},children:[],parentNode:null,appendChild(c){this.children.push(c);c.parentNode=this;},removeChild(c){this.children.splice(this.children.indexOf(c),1);c.parentNode=null;}};Object.defineProperty(e,'innerHTML',{set(){for(const c of this.children)c.parentNode=null;this.children=[];}});if(tag==='iframe')e.contentWindow={postMessage(){},focus(){},MzdGuiModule:{_dispose(){disposed++;}}};return e;}
 const baseTemplate={divElt:{style:{visibility:'visible'}},list2Ctrl:{setLineNumbers(){this.restored=true;}}};const app={_currentContextTemplate:baseTemplate,_masterApplicationDataList:{items:[{stock:true}]},_applicationsCtxtWiseAppNames:{Applications:['stock']}};
 function System(){}System.prototype._initApplicationsDataList=function(){return 17;};System.prototype._updateApplicationStructure=function(){return 18;};
 let sbName='Applications';const sent=[],fw={common:{setSbName(name){sbName=name;},setSbNameId(uia,id){sbName=id;}},_frameworkState:'idle',getCurrentApp:()=> currentApp,getCurrCtxtId:()=>context,getCurrCtxtSeqNo:()=>sequence,getAppInstance(){if(failStartup)throw Error('startup failure');return app;},sendEventToMmui(){sent.push([...arguments]);return 19;}};
 fw.instantiateControl=function(uia,parent,name,properties){const c={name,properties,divElt:node('native-list'),events:[],handleControllerEvent(event){this.events.push(event);}};controls.push(c);parent.appendChild(c.divElt);return c;};fw.destroyControl=function(c){assert(!selecting,'native callback must finish before control destruction');c.destroyed=true;if(c.divElt.parentNode)c.divElt.parentNode.removeChild(c.divElt);};
 const original={init:System.prototype._initApplicationsDataList,structure:System.prototype._updateApplicationStructure,send:fw.sendEventToMmui};
 const win={framework:unavailable?undefined:fw,systemApp:System,mzdGuiRegistry:{api:1,modules:[{id:'one',menuPath:'',label:'One',entrypoint:'/data/integration/mzd-gui-modules/one/assets/view.html'},{id:'two',menuPath:'Games',label:'Two',entrypoint:'/data/integration/mzd-gui-modules/two/assets/view.html'}].concat(extraModules)},addEventListener(k,f){(listeners[k]||(listeners[k]=[])).push(f);},removeEventListener(k,f){listeners[k]=(listeners[k]||[]).filter(x=>x!==f);},setTimeout(f,ms){timeouts.set(++serial,f);delays.set(serial,ms);return serial;},clearTimeout(id){timeouts.delete(id);},setInterval(f){intervals.set(++serial,f);return serial;},clearInterval(id){intervals.delete(id);}};
 const doc={body:node('body'),createElement:node,activeElement:{focus(){}}};vm.runInNewContext(runtime,{window:win,document:doc});
 function event(k,data){for(const fn of [...(listeners[k]||[])])fn(data);}
 return {win,doc,app,original,System,sent,listeners,timeouts,intervals,controls,choose(index){const c=controls.filter(x=>!x.destroyed).at(-1);selecting=true;try{c.properties.selectCallback(c,c.properties.dataList.items[index].appData,{});}finally{selecting=false;}for(const [id,fn] of [...timeouts])if(delays.get(id)===0){timeouts.delete(id);fn();}},title(){return sbName;},open(id){fw.sendEventToMmui('system','MzdGui.Open.'+(id==='games'?'menu.0':'module.'+id));},context(v,app='system',seq=sequence){context=v;currentApp=app;sequence=seq;},event,get disposed(){return disposed;},frame(){return doc.body.children[0] && doc.body.children[0].children.find(x=>x.tag==='iframe');}};
}
let h=harness();assert.equal(h.doc.body.children.length,0,'no view loaded at boot');assert.equal(h.app._masterApplicationDataList.items.length,3);assert.equal(h.System.prototype._initApplicationsDataList.call(h.app),17);assert.equal(h.app._masterApplicationDataList.items.length,3,'no duplicate rows');assert.equal(h.win.framework.sendEventToMmui('system','NativeEvent'),19);assert.deepEqual(h.sent,[['system','NativeEvent']]);
h.open('one');let f=h.frame();assert(f);let token=f.src.split('#mzdgui=')[1];h.event('message',{source:{},data:{type:'mzd-gui-ready',token}});assert.equal(h.timeouts.size,1,'foreign source rejected');h.event('message',{source:f.contentWindow,data:{type:'mzd-gui-ready',token:'wrong'}});assert.equal(h.timeouts.size,1);h.event('message',{source:f.contentWindow,data:{type:'mzd-gui-ready',token}});assert.equal(h.timeouts.size,0);h.event('message',{source:f.contentWindow,data:{type:'mzd-gui-error',token,message:'test error'}});assert.equal(h.doc.body.children.length,0);assert.equal(h.intervals.size,0);assert.equal(h.disposed,1);
h.open('games');assert(!h.frame());h.choose(0);f=h.frame();const oldError=f.onerror,oldTimeout=[...h.timeouts.values()][0];oldTimeout();assert(!h.frame(),'game timeout returns to game list');assert.equal(h.timeouts.size,0);h.choose(0);const newFrame=h.frame();oldError();oldTimeout();assert.equal(h.frame(),newFrame,'stale view events cannot kill new view');h.context('Home');for(const fn of [...h.intervals.values()])fn();assert.equal(h.doc.body.children.length,0);assert.equal(h.intervals.size,0);assert.equal(h.timeouts.size,0);
h=harness();h.open('one');h.frame().contentWindow.postMessage=()=>{throw Error('unreachable view');};h.event('keyup',{keyCode:8,preventDefault(){},stopImmediatePropagation(){}});assert.equal(h.doc.body.children.length,0,'input failure contained');
h=harness(true);assert.equal(h.win.framework.sendEventToMmui,h.original.send);assert.equal(h.System.prototype._initApplicationsDataList,h.original.init);assert.equal(h.System.prototype._updateApplicationStructure,h.original.structure);assert(Object.values(h.listeners).every(x=>x.length===0),'partial startup removes listeners');
h=harness(false,true);assert.equal(h.intervals.size,1);for(let i=0;i<120;i++)for(const fn of [...h.intervals.values()])fn();assert.equal(h.intervals.size,0,'framework readiness retries are bounded');assert.equal(h.doc.body.children.length,0);assert.equal(h.win.framework,undefined);
// SDK validates source/token, contains consumer errors and disposes once.
const listeners={},messages=[];let cleanup=0,inputs=0;const parent={postMessage(m){messages.push(m);}},win={parent,location:{hash:'#mzdgui=test-token'},addEventListener(k,f){listeners[k]=f;},removeEventListener(k,f){if(listeners[k]===f)delete listeners[k];}};vm.runInNewContext(sdk,{window:win});const api=win.MzdGuiModule;api.onInput(()=>{inputs++;throw Error('consumer failure');});api.onDispose(()=>{cleanup++;throw Error('dispose failure');});const receive=listeners.message;receive({source:{},data:{type:'mzd-gui-input',token:'test-token',action:'select',phase:'press'}});assert.equal(inputs,0);receive({source:parent,data:{type:'mzd-gui-input',token:'test-token',action:'select',phase:'press'}});assert.equal(inputs,1);assert.equal(messages[0].type,'mzd-gui-error');parent.postMessage=()=>{throw Error('parent gone');};assert.doesNotThrow(()=>win.onerror('parent failure'));api._dispose();api._dispose();assert.equal(cleanup,1);assert.equal(Object.keys(listeners).length,0);receive({source:parent,data:{type:'mzd-gui-input',token:'test-token',action:'select',phase:'press'}});assert.equal(inputs,1);assert.equal(win.onerror,undefined,'original error handler restored');
console.log('GUI_RUNTIME_PASSED: lazy views, stock delegation, duplicate prevention, handshake, timeout/error recovery, stale callbacks, context cleanup, partial startup rollback and SDK disposal (DOM mocks).');

h=harness(false,false,[{id:'tools-view',menuPath:'Tools/Examples',label:'Tool',entrypoint:'/data/integration/mzd-gui-modules/tools-view/assets/view.html'},{id:'other-tool',menuPath:'Tools/Examples',label:'Other',entrypoint:'/data/integration/mzd-gui-modules/other-tool/assets/view.html'}]);
assert.equal(h.app._masterApplicationDataList.items.length,4,'shared path creates one top-level Tools entry');assert.equal(h.app._masterApplicationDataList.items[3].text1,'Tools');
h.win.framework.sendEventToMmui('system','MzdGui.Open.menu.1');assert(!h.frame());h.choose(0);assert.equal(h.title(),'Examples');
h.choose(0);assert(h.frame().src.includes('/tools-view/'));h.frame().onerror();assert(!h.frame());assert(h.title().includes('select an entry'));
h.event('keyup',{keyCode:8,preventDefault(){},stopImmediatePropagation(){}});assert.equal(h.title(),'Tools');h.event('keyup',{keyCode:8,preventDefault(){},stopImmediatePropagation(){}});assert.equal(h.doc.body.children.length,0);
h=harness(false,false,[{id:'bad-path',menuPath:'Tools/../Examples',label:'Invalid',entrypoint:'/data/integration/mzd-gui-modules/bad-path/assets/view.html'}]);assert.equal(h.app._masterApplicationDataList.items.length,1);assert.equal(h.win.framework.sendEventToMmui,h.original.send);
console.log('GUI_MENU_PATHS_PASSED: nested paths, shared ancestors, sibling views, error recovery, Back to parent and traversal rejection.');

const helloNodes={close:{},input:{},count:{}},helloApi={onInput(fn){this.input=fn;},onDispose(fn){this.dispose=fn;},ready(){this.readied=true;},close(){this.closed=true;}};
vm.runInNewContext(fs.readFileSync('development/examples/gui-hello-world/assets/view.js','utf8'),{document:{getElementById(id){return helloNodes[id];}},MzdGuiModule:helloApi});
assert(helloApi.readied);helloApi.input('select','press');helloApi.input('select','release');assert.equal(helloNodes.count.textContent,'1');assert.equal(helloApi.input('back','step'),false);helloNodes.close.onclick();assert(helloApi.closed);helloApi.dispose();assert.equal(helloNodes.close.onclick,null);
console.log('HELLO_WORLD_VIEW_PASSED: ready, input counter, default Back and disposable click handler.');

h=harness();assert.equal(h.app._masterApplicationDataList.items[1].hasCaret,false,'direct view has no submenu arrow');assert.equal(h.app._masterApplicationDataList.items[2].hasCaret,true);h.open('games');let native=h.controls.at(-1);assert.equal(native.name,'List2Ctrl');assert.equal(native.properties.titleConfiguration,'noTitle');assert.equal(native.properties.dataList.items[0].hasCaret,false);h.event('keydown',{keyCode:40,preventDefault(){},stopImmediatePropagation(){}});h.event('keyup',{keyCode:40,preventDefault(){},stopImmediatePropagation(){}});assert(native.events.includes('downStart')&&native.events.includes('down'));h.win.framework.sendEventToMmui('system','Global.GoBack');assert.equal(h.doc.body.children.length,0);assert(native.destroyed);assert.equal(h.app._currentContextTemplate.divElt.style.visibility,'visible');assert(h.app._currentContextTemplate.list2Ctrl.restored);assert.equal(h.title(),'Applications');assert.equal(h.sent.length,0);h.win.framework.sendEventToMmui('system','Global.GoBack');assert.equal(h.sent.length,1);
console.log('GUI_NATIVE_LIST_PASSED: OEM control factory/destroy API, native event phases, callback-safe deferred transitions, correct carets and Back delegation.');

h=harness();h.win.framework.instantiateControl=function(){throw Error('factory failed');};assert.doesNotThrow(()=>h.open('games'));assert.equal(h.doc.body.children.length,0);assert.equal(h.intervals.size,0);assert.equal(h.win.framework.sendEventToMmui('system','NativeAfterFailure'),19);
h=harness();const factory=h.win.framework.instantiateControl;h.win.framework.instantiateControl=function(){const c=factory.apply(this,arguments);delete c.handleControllerEvent;return c;};h.open('games');assert.equal(h.doc.body.children.length,0);assert(h.controls.every(c=>c.destroyed),'invalid returned controls are destroyed');
h=harness();h.open('games');native=h.controls.at(-1);native.properties.selectCallback(native,native.properties.dataList.items[0].appData,{});h.context('HomeScreen');for(const fn of [...h.timeouts.values()])fn();assert.equal(h.doc.body.children.length,0);assert(!h.frame());
console.log('GUI_NATIVE_FAILURES_PASSED: factory failure, invalid-control cleanup and no deferred launch after native context change.');
// Actual runtime -> SDK -> registered dictionary handshake, including file-origin target.
h=harness();const languageSource=fs.readFileSync('usb/lib/gui-runtime/i18n.js','utf8');
h.doc.head={appendChild(s){s.parentNode=this;},removeChild(s){s.parentNode=null;}};
h.win.framework.localize={getCurrentLanguage:()=> 'de_DE'};
vm.runInNewContext(languageSource,{window:h.win,document:h.doc});
h.win.MzdGuiI18n.start([{id:'one',translations:'/data/integration/mzd-gui-modules/one/assets/i18n.js'}]);
h.open('one');f=h.frame();const child=f.contentWindow,childEvents={};
const parentProxy={postMessage(data){h.event('message',{source:child,data});}};
child.parent=parentProxy;child.location={hash:'#mzdgui='+f.src.split('#mzdgui=')[1]};
child.addEventListener=(name,fn)=>childEvents[name]=fn;child.removeEventListener=name=>delete childEvents[name];
child.postMessage=(data,target)=>{assert.equal(target,'*');if(childEvents.message)childEvents.message({source:parentProxy,data});};
vm.runInNewContext(sdk,{window:child});let languageReady=0;
child.MzdGuiModule.loadLanguage((language)=>{languageReady++;assert.equal(language,'de_DE');});
assert.equal(languageReady,0,'startup waits for the dictionary');
h.win.MzdGuiI18n.register('one',{version:1,languages:{en_US:{start:'Start'},de_DE:{start:'Starten'}}});
assert.equal(languageReady,1);assert.equal(child.MzdGuiModule.t('start','Start'),'Starten');assert.equal(child.MzdGuiModule.t('missing','Existing'),'Existing');
assert.equal([...h.intervals.values()].length,1,'only the existing active-context monitor, no language polling');
h.win.framework.localize.getCurrentLanguage=()=> 'en_US';assert.equal(child.MzdGuiModule.t('start','Start'),'Starten','open view keeps its initial language');
child.MzdGuiModule.close();assert.equal(h.doc.body.children.length,0);
console.log('GUI_LANGUAGE_HANDSHAKE_PASSED: actual runtime/SDK/dictionary, authenticated one-shot startup, German texts, silent fallbacks and no language polling.');

h=harness();h.open('one');f=h.frame();let defaultLanguage;
f.contentWindow.postMessage=(data,target)=>{defaultLanguage=data.value;assert.equal(target,'*');};
h.event('message',{source:f.contentWindow,data:{type:'mzd-gui-language-request',token:f.src.split('#mzdgui=')[1]}});
assert.equal(defaultLanguage.language,'en_US');assert.deepEqual(Object.keys(defaultLanguage.texts),[]);
console.log('GUI_LANGUAGE_OPTIONAL_PASSED: no translation declaration/helper still answers an SDK request with existing defaults.');
// Translated example: the application changes labels once, preserving local state.
let exampleDictionary;vm.runInNewContext(fs.readFileSync('development/examples/gui-hello-world/assets/i18n.js','utf8'),{window:{MzdGuiI18n:{register(id,data){assert.equal(id,'gui-hello-world');exampleDictionary=data;}}}});
const translatedNodes={};for(const id of ['heading','intro','counter-label','back-hint','input','close','count'])translatedNodes[id]={textContent:''};
let exampleLocale='en_US',exampleReady;
const translatedApi={t(key,fallback,values){let text=exampleDictionary.languages[exampleLocale][key]||exampleDictionary.languages.en_US[key]||fallback;return text.replace(/\{(\w+)\}/g,(match,key)=>values&&Object.hasOwn(values,key)?String(values[key]):match);},loadLanguage(fn){exampleReady=fn;},onInput(fn){this.input=fn;},onDispose(fn){this.dispose=fn;},ready(){},close(){}};
const translatedDocument={documentElement:{},getElementById:id=>translatedNodes[id]};
vm.runInNewContext(fs.readFileSync('development/examples/gui-hello-world/assets/view.js','utf8'),{document:translatedDocument,MzdGuiModule:translatedApi});
translatedApi.input('select','press');exampleLocale='de_DE';exampleReady('de_DE','ltr');
assert.equal(translatedNodes.heading.textContent,'Hallo Welt');assert.equal(translatedNodes['counter-label'].textContent,'Zähler');assert.equal(translatedNodes.close.textContent,'Zurück');assert.equal(translatedNodes.count.textContent,'1');assert.equal(translatedNodes.input.textContent,'Eingabe: select / press');assert.equal(translatedDocument.documentElement.lang,'de-DE');
assert.equal(translatedApi.input('back','step'),false);translatedApi.dispose();assert.equal(translatedNodes.close.onclick,null);
console.log('HELLO_WORLD_I18N_PASSED: actual dictionary/view, German labels, retained counter, normalized input diagnostics and default Back/disposal.');

// Opt-in status-bar layout uses the authenticated SDK path; other views stay fullscreen.
{
 const h=harness(); h.open('one'); const frame=h.frame(), root=frame.parentNode;
 const token=frame.src.split('#mzdgui=')[1], events={};
 const parent={postMessage(data){h.event('message',{source:frame.contentWindow,data});}};
 const child=frame.contentWindow;
 child.parent=parent;child.location={hash:'#mzdgui='+token};
 child.addEventListener=(name,fn)=>events[name]=fn;child.removeEventListener=name=>delete events[name];
 vm.runInNewContext(sdk,{window:child});
 h.event('message',{source:{},data:{type:'mzd-gui-layout',token,message:'with-status-bar'}});
 assert.notEqual(root.style.top,'64px','foreign frame cannot change layout');
 child.MzdGuiModule.setLayout('with-status-bar');
 assert.equal(root.style.top,'64px');assert.equal(root.style.height,'416px');
 assert.equal(root.style.zIndex,'9','view covers side chrome (8), below status bar (10)');assert.equal(frame.style.height,'416px');assert.equal(h.title(),'One');
 child.MzdGuiModule.setLayout('invalid');assert.equal(root.style.height,'416px');
 child.MzdGuiModule.setLayout('fullscreen');assert.equal(root.style.top,'0px');assert.equal(frame.style.height,'480px');
 child.MzdGuiModule.close();assert.equal(h.title(),'Applications');assert.equal(h.doc.body.children.length,0);
 h.open('games');h.choose(0);assert(h.frame().style.cssText.includes('height:480px'),'next view retains default fullscreen');
}
console.log('GUI_STATUS_BAR_LAYOUT_PASSED: real SDK/runtime opt-in, viewport, title restoration, invalid/foreign requests and unchanged fullscreen defaults.');

// Actual runtime + SDK: retain one opted-in view across a phone interruption.
function callFixture(optIn=true) {
 const h=harness();h.open('one');const frame=h.frame(), child=frame.contentWindow, events={};
 const token=frame.src.split('#mzdgui=')[1], parent={postMessage(data){h.event('message',{source:child,data});}};
 let suspended=0,resumed=0,disposed=0;
 child.parent=parent;child.location={hash:'#mzdgui='+token};
 child.addEventListener=(name,fn)=>events[name]=fn;child.removeEventListener=name=>delete events[name];
 child.postMessage=data=>{if(events.message)events.message({source:parent,data});};
 vm.runInNewContext(sdk,{window:child});
 child.MzdGuiModule.onDispose(()=>disposed++);
 if(optIn){child.MzdGuiModule.onSuspend(()=>suspended++);child.MzdGuiModule.onResume(()=>resumed++);}
 child.MzdGuiModule.ready();
 return {h,frame,child,events,token,parent,tick(){for(const fn of [...h.intervals.values()])fn();},get disposed(){return disposed;},get suspended(){return suspended;},get resumed(){return resumed;}};
}
{
 const c=callFixture();let input=0,consumed=0;c.child.MzdGuiModule.onInput(()=>{input++;return true;});
 c.h.context('ActiveCall','phone',67);c.tick();c.tick();
 assert.equal(c.suspended,1);assert.equal(c.disposed,0);assert.equal(c.frame.parentNode.style.display,'none');
 const key={keyCode:13,preventDefault(){consumed++;},stopImmediatePropagation(){consumed++;}};
 c.h.event('keydown',key);c.events.keydown(key);assert.equal(input,0);assert.equal(consumed,0,'phone input must be released');
 c.h.context('Applications','system',66);c.h.win.framework._frameworkState='transition';c.tick();assert.equal(c.resumed,0);
 const replacement={divElt:{style:{visibility:'visible'}},list2Ctrl:{setLineNumbers(){}}};c.h.app._currentContextTemplate=replacement;
 c.h.win.framework._frameworkState='idle';c.tick();c.tick();
 assert.equal(c.resumed,1);assert.equal(c.h.frame(),c.frame,'same iframe and state retained');assert.equal(replacement.divElt.style.visibility,'hidden');
 c.child.MzdGuiModule.close();assert.equal(c.disposed,1);assert.equal(replacement.divElt.style.visibility,'visible');
}
for(const [context,app,seq] of [['Home','system',68],['NowPlaying','usbaudio',68],['Map','navigation',68],['Applications','system',68],['RecentCalls','phone',68]]) {
 const c=callFixture();c.h.context('IncomingCall','phone',67);c.tick();assert.equal(c.suspended,1);
 c.h.context(context,app,seq);c.tick();assert.equal(c.resumed,0);assert.equal(c.h.doc.body.children.length,0);assert.equal(c.disposed,1);
}
{
 const c=callFixture(false);c.h.context('ActiveCall','phone',67);c.tick();assert.equal(c.h.doc.body.children.length,0,'non-opted-in views still close');
}
{
 const c=callFixture();delete c.h.win.framework.getCurrCtxtSeqNo;c.child.MzdGuiModule.close();c.h.open('one');
 const frame=c.h.frame(), token=frame.src.split('#mzdgui=')[1];
 c.h.event('message',{source:frame.contentWindow,data:{type:'mzd-gui-lifecycle',token,message:'phone'}});
 c.h.event('message',{source:frame.contentWindow,data:{type:'mzd-gui-ready',token}});
 c.h.context('ActiveCall','phone',67);c.tick();assert.equal(c.h.doc.body.children.length,0,'unknown return identity must close safely');
}
console.log('GUI_PHONE_LIFECYCLE_PASSED: actual SDK/runtime suspend/resume, same-frame state, native input release, transition readiness, template replacement, deliberate navigation, no sequence and opt-in only.');

// Mazda ready/displayed callbacks prevent the Applications flash on return.
{
 const c=callFixture(false);let readyCalls=0,displayedCalls=0;
 const originalReady=function(value){readyCalls++;assert.equal(value,'ready-argument');return 17;};
 const originalDisplayed=function(value){displayedCalls++;assert.equal(value,'displayed-argument');return 18;};
 const entry={readyFunction:originalReady,displayedFunction:originalDisplayed};
 c.h.app._contextTable={Applications:entry};
 c.child.MzdGuiModule.onSuspend(()=>{});c.child.MzdGuiModule.onResume(()=>{});
 c.h.context('ActiveCall','phone',67);c.tick();
 c.h.context('Applications','system',66);c.h.win.framework._frameworkState='transition';
 const template={divElt:{className:'List2Tmplt',style:{visibility:'visible'}},list2Ctrl:{setLineNumbers(){}}};
 c.h.app._currentContext={ctxtId:'Applications',contextSeq:66};c.h.app._currentContextTemplate=template;
 assert.equal(entry.readyFunction('ready-argument'),17);assert.equal(readyCalls,1);
 assert(template.divElt.className.includes('MzdGuiReturnMask'),'list masked before its transition begins');
 assert.equal(c.frame.parentNode.style.display,'none','phone remains in front until transition ends');
 c.h.win.framework._frameworkState='idle';
 assert.equal(entry.displayedFunction('displayed-argument'),18);assert.equal(displayedCalls,1);
 assert.equal(c.frame.parentNode.style.display,'','resume is immediate, without waiting for the polling interval');
 assert.equal(template.divElt.style.visibility,'hidden');assert(!template.divElt.className.includes('MzdGuiReturnMask'));
 c.child.MzdGuiModule.close();assert.equal(entry.readyFunction,originalReady);assert.equal(entry.displayedFunction,originalDisplayed);
 assert.equal(template.divElt.style.visibility,'visible');
}
{
 const c=callFixture(false), entry={readyFunction(){}};c.h.app._contextTable={Applications:entry};
 c.child.MzdGuiModule.onSuspend(()=>{});c.child.MzdGuiModule.close();
 assert(!Object.hasOwn(entry,'displayedFunction'),'temporary callback removed exactly on close');
}
console.log('GUI_PHONE_RETURN_TRANSITION_PASSED: masked incoming list, immediate displayed callback, original callback delegation and exact hook cleanup.');

// Real vehicle context names: camera and parking displays share the native return stack.
for (const context of ['BackupCameraDisplay','BUCAndPSMDisplay','ParkingSensorDisplay']) {
 const c=callFixture();c.h.context(context,'backupparking',76);c.tick();
 assert.equal(c.suspended,1);assert.equal(c.disposed,0);assert.equal(c.frame.parentNode.style.display,'none');
 c.h.context('Applications','system',66);c.tick();assert.equal(c.resumed,1);assert.equal(c.h.frame(),c.frame);
 c.child.MzdGuiModule.close();
}
{
 const c=callFixture();
 for (const [context,app,seq] of [['BackupCameraDisplay','backupparking',76],['BUCAndPSMDisplay','backupparking',77],['ParkingSensorDisplay','backupparking',84],['ActiveCall','phone',85],['ParkingSensorDisplay','backupparking',90]]) {
  c.h.context(context,app,seq);c.tick();assert.equal(c.suspended,1);assert.equal(c.resumed,0);assert.equal(c.disposed,0);
 }
 c.h.context('Applications','system',66);c.tick();assert.equal(c.resumed,1);assert.equal(c.h.frame(),c.frame);
 c.child.MzdGuiModule.close();
}
for(const [context,app,seq] of [['HomeScreen','system',93],['Map','navigation',94],['Applications','system',95],['Idle','backupparking',92]]) {
 const c=callFixture();c.h.context('BackupCameraDisplay','backupparking',76);c.tick();
 c.h.context(context,app,seq);c.tick();assert.equal(c.resumed,0);assert.equal(c.disposed,1);
}
for(const [context,app] of [['BackupCameraDisplay','phone'],['OtherDisplay','backupparking']]) {
 const c=callFixture();c.h.context(context,app,76);c.tick();assert.equal(c.disposed,1);
}
{
 const c=callFixture(false);c.h.context('ParkingSensorDisplay','backupparking',90);c.tick();assert.equal(c.disposed,1);
}
console.log('GUI_PARKING_LIFECYCLE_PASSED: three vehicle contexts, chained camera/parking/phone interruptions, same-frame return and safe close on navigation or unrelated contexts.');
