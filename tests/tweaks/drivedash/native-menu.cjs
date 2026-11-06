const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let receive,closed,created=0,updates=0;
const root={style:{cssText:'original-root'},className:'original',appendChild(node){node.parentNode=this;},removeChild(node){node.parentNode=null;}};
const frame={parentNode:root,style:{display:'block'},contentWindow:{postMessage(){}}};
const view={source:frame.contentWindow,token:'native-test'};
const control={handleControllerEvent(){},getContextCapture(){return {focussedItem:1,topItem:0};},setDataListAndUpdateItems(data){updates++;this.data=data;},restoreContext(capture){assert.equal(capture.focussedItem,1);}};
const framework={instantiateControl(app,parent,name,properties){created++;assert.equal(app,'system');assert.equal(name,'List2Ctrl');assert.equal(parent.className,'TemplateWithStatusLeft List2Tmplt');control.data=properties.dataList;return control;},destroyControl(){},sendEventToMmui(){},getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'Applications',getAppInstance:()=> ({_currentContextTemplate:{divElt:{style:{visibility:'hidden'}}}}),common:{setSbName(){}}};
const window={framework,clearTimeout(){},MzdGuiResidents:{register(id,factory){factory({view:()=>view,onMessage:fn=>{receive=fn;},onViewClose:fn=>{closed=fn;},onDispose(){}});}}};
const document={createElement:()=> ({style:{},className:'',innerHTML:''}),getElementsByTagName:()=>[frame]};
vm.runInNewContext(fs.readFileSync('usb/tweaks/drivedash/assets/resident.js','utf8'),{window,document});
function render(checked){receive({source:frame.contentWindow,data:{type:'drivedash-native-render',token:'native-test',menu:{title:'Speed units',page:'speed',index:1,rows:[{label:'Automatic',radio:true,checkable:true,checked:!checked},{label:'km/h',radio:true,checkable:true,checked}]}}});}
render(false);assert.equal(created,1);assert.equal(frame.style.display,'none');
assert.equal(control.data.items[0].itemStyle,'style03');assert.equal(control.data.items[0].image1,'radio');
render(true);assert.equal(created,1,'Selection must update the existing OEM list.');assert.equal(updates,1);assert.ok(control.data.items[1].checked);
assert.equal(frame.style.display,'none','Selection must keep the gauge hidden.');
closed();assert.equal(frame.style.display,'block');assert.equal(root.style.cssText,'original-root');assert.equal(root.className,'original');
console.log('DRIVEDASH_NATIVE_MENU_PASSED: OEM List2 control/template, native radio rows, in-place selection, preserved focus and return cleanup.');
