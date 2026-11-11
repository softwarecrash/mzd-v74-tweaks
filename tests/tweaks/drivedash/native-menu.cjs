/* Exercise DriveDash against the real shared resident/menu runtime. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let created=0,updates=0,control,seq=0;
const timers=new Map(),replies=[];
function node(){return {style:{cssText:''},className:'',children:[],appendChild(n){this.children.push(n);n.parentNode=this;},removeChild(n){this.children=this.children.filter(x=>x!==n);n.parentNode=null;},set innerHTML(v){this.children=[];}};}
const head=node(),root=node();root.style.cssText='original-root';root.className='original';
const frame={parentNode:root,style:{display:'block'},contentWindow:{postMessage:m=>replies.push(m)}};
const button={btnInstance:{hasFocus:false},handleControllerEvent(e){if(e==='acceptFocusFromRight')this.btnInstance.hasFocus=true;if(e==='lostFocus')this.btnInstance.hasFocus=false;return e==='right'?'giveFocusRight':'consumed';}};
const framework={instantiateControl(app,parent,name,properties){created++;assert.equal(app,'system');assert.equal(name,'List2Ctrl');assert.equal(parent.className,'TemplateWithStatusLeft List2Tmplt');assert.equal(properties.smallItemText,true,'Use the SDK standard text size.');
 control={properties,data:properties.dataList,handleControllerEvent(e){if(e==='left')return 'giveFocusLeft';return 'consumed';},getContextCapture(){return {focussedItem:1,topItem:0};},setDataListAndUpdateItems(data){updates++;this.data=data;},restoreContext(c){assert.equal(c.focussedItem,1);}};return control;},destroyControl(){},sendEventToMmui(){},getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'Applications',getAppInstance:()=> ({_currentContextTemplate:{divElt:{style:{visibility:'hidden'}}}}),common:{leftBtn:button,setSbName(){}}};
const window={framework,setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);},addEventListener(){}};
const document={head,createElement:node,documentElement:{contains:()=>true},getElementsByTagName:()=>[frame]};
const ctx=vm.createContext({window,document});
vm.runInContext(fs.readFileSync('usb/lib/gui-runtime/residents.js','utf8'),ctx);
window.MzdGuiResidents.start([{id:'drivedash',resident:'/data/integration/mzd-gui-modules/drivedash/assets/resident.js'}]);
vm.runInContext(fs.readFileSync('usb/tweaks/drivedash/assets/resident.js','utf8'),ctx);
window.MzdGuiResidents.view('drivedash',{source:frame.contentWindow,token:'native-test'});
function send(type,props={},source=frame.contentWindow,token='native-test'){window.MzdGuiResidents.message('drivedash',{source,data:{type,token,...props}});}
function render(checked){send('drivedash-native-render',{menu:{title:'Speed units',page:'speed',index:1,rows:[{label:'Automatic',radio:true,checkable:true,checked:!checked},{label:'km/h',radio:true,checkable:true,checked}]}});}
render(false);assert.equal(created,1);assert.equal(frame.style.display,'none');
assert.equal(control.data.items[0].itemStyle,'style03');assert.equal(control.data.items[0].image1,'radio');
render(true);assert.equal(created,1);assert.equal(updates,1);assert.ok(control.data.items[1].checked);
assert.equal(frame.style.display,'none','Selection keeps the gauge hidden.');
control.properties.selectCallback(control,control.data.items[1].appData);
for(const [id,fn] of [...timers]){timers.delete(id);fn();}
assert.ok(replies.some(m=>m.type==='drivedash-native-select'&&m.index===1),'Shared SDK selection reaches DriveDash.');
send('drivedash-native-input',{action:'left',phase:'step'});assert.equal(button.btnInstance.hasFocus,true);
send('drivedash-native-input',{action:'right',phase:'step'});assert.equal(button.btnInstance.hasFocus,false);
send('drivedash-native-release',{}, {},'native-test');assert.equal(frame.style.display,'none','Foreign release ignored.');
send('drivedash-native-input',{action:'left',phase:'step'});
send('drivedash-native-release');assert.equal(button.btnInstance.hasFocus,false,'Returning to the gauge releases the menu Back button.');assert.equal(frame.style.display,'block');assert.equal(root.style.cssText,'original-root');assert.equal(root.className,'original');
render(false);window.MzdGuiResidents.view('drivedash',null);assert.equal(frame.style.display,'block','Closing or suspending the view removes settings.');
window.MzdGuiResidents.dispose();
console.log('DRIVEDASH_NATIVE_MENU_PASSED: real SDK factory, standard radio/text, selection/focus, Back handoff, gauge return and view cleanup.');
