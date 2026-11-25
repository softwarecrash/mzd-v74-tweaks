const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixturePath(...parts){const relative=path.join(...parts);return path.join(relative.split(path.sep)[0]==='assets'?path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'):path.resolve(__dirname,'../../../development/wallpaper-manager'),relative);}
const root=path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'),repo=path.resolve(root,'../../..'),queue=[],hostEvents={},viewEvents={},timers=new Map();let timer=0,writes=0,control=null,created=0,destroyed=0,attached=true,sb='Applications',dialogConfig=null;
function element(){return {children:[],style:{cssText:''},className:'',attributes:{},textContent:'',appendChild(e){e.parentNode=this;this.children.push(e);},removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;},get firstChild(){return this.children[0]||null;},set innerHTML(v){this.children=[];},setAttribute(k,v){this.attributes[k]=v;}};}
const status=element(),rootNode=element(),frame=element();rootNode.style.cssText='old-style';rootNode.appendChild(frame);
const head=element(),body=element();
const document={head,body,getElementById:()=>status,createElement:element,getElementsByTagName:n=>n==='head'?[head]:frames,querySelectorAll:()=>[],documentElement:{contains:()=>attached}};
const common={_customBgSet:false,_defaultBgPath:'common/images/background.png',_currentBgPath:'common/images/background.png',_bgDiv1:element(),_bgDiv2:null,setSbName:v=>sb=v,setSbNameId:()=>sb='Applications'};
const mmuiCalls=[],originalSend=(app,event)=>mmuiCalls.push({app,event}),fw={common,getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'Applications',getAppInstance:()=>({_currentContextTemplate:{list2Ctrl:{setLineNumbers(){}}}}),sendEventToMmui:originalSend,
 _templatesLoaded:{Dialog3Tmplt:{isLoaded:true}},
 _controlsLoaded:{Dialog3Ctrl:{isLoaded:true},ButtonCtrl:{isLoaded:true}},
 instantiateTemplate(app,parent,type,props){if(props&&props.Dialog3Ctrl){dialogConfig=props.Dialog3Ctrl;return {dialog3Ctrl:props.Dialog3Ctrl,cleanUp(){dialogConfig=null;}};}return {divElt:parent,cleanUp(){}};},
 instantiateControl(app,parent,type,props){if(type==='OffScreenCtrl'){return {divElt:parent};}assert.equal(type,'List2Ctrl');assert.equal(props.titleConfiguration,'noTitle');assert(parent.className.indexOf('TemplateWithStatusLeft List2Tmplt')===0);created++;
  control={props,rendered:true,focus:props.focussedItem||0,dataList:props.dataList,handleControllerEvent(event){if(event==='cw'||event==='down'){this.focus=(this.focus+1)%this.dataList.items.length;}if(event==='ccw'||event==='up'){this.focus=(this.focus+this.dataList.items.length-1)%this.dataList.items.length;}if(event==='select')props.selectCallback(this,this.dataList.items[this.focus].appData);},getContextCapture(){return{hasFocus:true,focussedItem:this.focus,topItem:0};},restoreContext(c){this.focus=c.focussedItem;},setDataList(d){this.dataList=d;this.rendered=false;},setDataListAndUpdateItems(d){this.dataList=d;this.rendered=true;}};return control;},destroyControl(c){destroyed++;if(control===c)control=null;}};
const intervals=new Set();let intervalsStarted=0,intervalsCleared=0;
const host={location:{hostname:'localhost',origin:undefined},framework:fw,localStorage:{getItem:()=>null,setItem:()=>writes++},addEventListener:(n,f)=>hostEvents[n]=f,removeEventListener:n=>delete hostEvents[n],setTimeout:(f,ms)=>{timers.set(++timer,{f,ms});return timer;},clearTimeout:n=>timers.delete(n),setInterval:f=>{intervalsStarted++;const id=++timer;intervals.add(id);host.refresh=f;return id;},clearInterval:id=>{intervalsCleared++;intervals.delete(id);delete host.refresh;}};
const layoutMessages=[];
const parent={postMessage:data=>{
  if(data.type==='mzd-gui-layout')layoutMessages.push(data);
  if(data.type==='mzd-gui-service-request'&&resident.serviceRequest){
    queue.push(()=>{
      resident.serviceRequest(data.operation,data.args,(error,result)=>{
        queue.push(()=>{for(const f of (viewEvents.message||[]).slice())f({source:parent,data:{type:'mzd-gui-service-result',token:'fixture-token',id:data.id,error:error||null,result:result||null}});});
      });
    });
    return;
  }
  if(hostEvents.message)queue.push(()=>hostEvents.message({source:view,data}));
}};
const view={parent,location:{hash:'#mzdgui=fixture-token'},addEventListener:(n,f)=>(viewEvents[n]||(viewEvents[n]=[])).push(f),removeEventListener:(n,f)=>{if(viewEvents[n]){viewEvents[n]=viewEvents[n].filter(x=>x!==f);if(!viewEvents[n].length)delete viewEvents[n];}},setTimeout:host.setTimeout,clearTimeout:host.clearTimeout,postMessage:(data,target)=>{assert.equal(target,'*','CMU file-origin replies require wildcard target plus authenticated source/token');queue.push(()=>{for(const f of (viewEvents.message||[]).slice())f({source:parent,data});});}};
frame.contentWindow=view;frame.getAttribute=()=>'/data/integration/mzd-gui-modules/wallpaper-manager/assets/view.html#mzdgui=fixture-token';
const frames=[frame];
function MockImage(){this.width=800;this.height=480;Object.defineProperty(this,'src',{set:()=>queue.push(()=>this.onload())});}
const context={window:host,Image:MockImage,document,Dialog3Tmplt:function(){}};host.Dialog3Tmplt=context.Dialog3Tmplt;

let saved={version:1,selected:null,enabled:false,interval:10,slides:[],removed:[],offscreen:false},failSave=false,prepareImport=null,holdUsb=false,pendingUsb=null,usbResult={status:'ready',items:[{source:'sda1',name:'photo.png',label:'photo.png'}]};
const imageID='img-'+ 'a'.repeat(32),imageID2='img-'+ 'b'.repeat(32);
const records=[{id:imageID,label:'User image.png',url:'/image.png'},{id:imageID2,label:'Second.png',url:'/second.png'}];
const resident={onServiceReady:fn=>resident.reconnected=fn,view:()=>({source:view,frame,token:'fixture-token'}),onMessage:fn=>hostEvents.message=fn,onViewClose:fn=>resident.closed=fn,onDispose:fn=>hostEvents.unload=fn,onServiceRequest:fn=>resident.serviceRequest=fn,
 service:{request(op,args,cb){queue.push(()=>{
  if(op==='gallery')cb(null,{images:records.slice(),settings:saved});
  else if(op==='save'){writes++;if(failSave){failSave=false;cb('Disk full.');}else{saved=JSON.parse(JSON.stringify(args));cb(null,{settings:saved});}}
  else if(op==='delete'){writes++;const id=args.id||args.value;const idx=records.findIndex(r=>r.id===id);if(idx>=0)records.splice(idx,1);saved.slides=saved.slides.filter(x=>x!==id);if(saved.selected===id)saved.selected=null;cb(null,{images:records.slice(),settings:saved});}
  else if(op==='usb'){if(holdUsb)pendingUsb=()=>cb(null,usbResult);else cb(null,usbResult);}
  else if(op==='prepare'){assert.equal(args.source,'sda1');assert.equal(args.name,'photo.png');prepareImport=cb;}
  else if(op==='commit'){assert.equal(args.ticket,'import-ticket');assert.equal(args.width,800);assert.equal(args.height,480);records.push({id:'img-'+'c'.repeat(32),label:'photo.png',url:'/photo.png'});cb(null,{images:records.slice(),settings:saved});}
  else throw Error('Unexpected request '+op);
 });}}};
vm.runInNewContext(fs.readFileSync(path.join(repo,'usb/lib/gui-runtime/residents.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(repo,'usb/lib/gui-runtime/settings-host.js'),'utf8'),context);
resident.createNativeMenu=opts=>host.MzdGuiResidents.createNativeMenu(opts);
context.context=resident;
for(const name of ['preview/core.js','preview/native-menu.js','cmu/import-client.js','cmu/host.js'])vm.runInNewContext(fs.readFileSync(fixturePath(name),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(repo,'usb/lib/gui-runtime/sdk.js'),'utf8'),{window:view});
vm.runInNewContext(fs.readFileSync(fixturePath('assets/view.js'),'utf8'),{window:view,document});
function flush(){let n=0;while(queue.length){assert(++n<200,'message loop');queue.shift()();}const ready=[...timers.entries()].filter(([id,t])=>t.ms===0);for(const[id,t]of ready){timers.delete(id);t.f();}if(queue.length)flush();}
function click(i){control.focus=i;control.props.selectCallback(control,control.dataList.items[i].appData);flush();}
function input(action,phase='step'){for(const f of viewEvents.message.slice())f({source:parent,data:{type:'mzd-gui-input',token:'fixture-token',action,phase}});flush();}
assert.equal(layoutMessages.length,1);assert.equal(layoutMessages[0].message,'with-status-bar');
assert(fs.readFileSync(fixturePath('assets/style.css'),'utf8').includes('height:416px'));
flush();assert.equal(sb,'Wallpaper Manager');assert.equal(host.WallpaperManager.snapshot().images.length,2);assert.deepEqual(Array.from(host.WallpaperManager.snapshot().slides),[]);
assert.equal(intervals.size,1,'one menu check interval while view is open');assert.equal(intervalsStarted,1);assert.equal(intervalsCleared,0);
assert.equal(control.dataList.items[4].text1,'Apply background when screen is off');
assert.equal(control.dataList.items[4].checked,false);
assert.equal(control.dataList.items[4].disabled,true);
const offscreenStyle=head.children.find(e=>e.id==='mzd-wallpaper-offscreen');
assert(offscreenStyle);
assert.equal(offscreenStyle.textContent,'');
click(4);assert.equal(saved.offscreen,false,'disabled row does not toggle');
// 1. Gallery list items strip extension, no 'Active' detail
click(0);assert.equal(sb,'Gallery');
assert.equal(control.dataList.items[0].text1,'User image','extension stripped in list');
assert.equal(control.dataList.items[1].text1,'Second','extension stripped in list');
assert.equal(control.dataList.items[0].label1,'','no Active detail');
assert.equal(control.dataList.items[1].label1,'','no Active detail');
// 2. Include Second in slideshow
click(1);assert.equal(sb,'Second');click(1);assert.deepEqual(saved.slides,[imageID2]);
input('back');assert.equal(control.dataList.items[0].label1,'');assert.equal(control.dataList.items[1].label1,'Slideshow');
// 3. Select User image as background when slideshow is off: applies immediately without modal
click(0);assert.equal(sb,'User image','extension stripped in title');
assert.equal(control.dataList.items[0].text1,'Use as static background');
assert.equal(control.dataList.items[2].text1,'Delete image');
assert.equal(control.dataList.items[2].image1,'common/images/icons/IcnListDelete_En.png');
click(0);assert.equal(saved.selected,imageID);assert.equal(host.WallpaperManager.snapshot().active,imageID);
input('back');
// When slideshow is disabled and one picture is selected for background, show 'Background' and keep 'Slideshow' for other
assert.equal(control.dataList.items[0].label1,'Background','shows Background detail when selected');
assert.equal(control.dataList.items[1].label1,'Slideshow','shows Slideshow detail when in slideshow');
input('back');assert.equal(sb,'Wallpaper Manager');
assert.equal(control.dataList.items[4].disabled,false);
// Failed offscreen save rolls back UI and offscreen style
failSave=true;click(4);assert.equal(saved.offscreen,false);assert.equal(host.WallpaperManager.snapshot().offscreen,false);assert.equal(offscreenStyle.textContent,'');
click(4);assert.equal(saved.offscreen,true);
assert(offscreenStyle.textContent.includes('.OffScreenCtrl.mzd-wallpaper-display-off'));
assert(offscreenStyle.textContent.includes('.mzd-wallpaper-display-off .OffScreenCtrl'));
assert(offscreenStyle.textContent.includes('/image.png'));
// Only DisplayOff (showClock: true) gets marker class, not IdleStandby/WaitForEnding
const displayOffEl=element(),idleStandbyEl=element();
const displayOffCtrl=fw.instantiateControl('system',displayOffEl,'OffScreenCtrl',{showClock:true});
const idleStandbyCtrl=fw.instantiateControl('system',idleStandbyEl,'OffScreenCtrl',{showClock:false});
assert(displayOffEl.className.split(/\s+/).includes('mzd-wallpaper-display-off'),'DisplayOff gets marker class');
assert(!idleStandbyEl.className.split(/\s+/).includes('mzd-wallpaper-display-off'),'IdleStandby does not get marker class');
fw.destroyControl(idleStandbyCtrl);fw.destroyControl(displayOffCtrl);
assert(!displayOffEl.className.split(/\s+/).includes('mzd-wallpaper-display-off'),'destroyControl clears marker class');
// Template transition restores _bgDiv1 if OEM reset it
common._bgDiv1.style.backgroundImage='url("common/images/background.png")';
fw.instantiateTemplate('system',rootNode,'HomeScreenTmplt',{});flush();
assert.equal(common._bgDiv1.style.backgroundImage,'url("/image.png")');
// Hover preview updates _bgDiv1 without mutating #mzd-wallpaper-offscreen
click(0);assert.equal(sb,'Gallery');click(1);assert.equal(sb,'Second');
assert.equal(common._bgDiv1.style.backgroundImage,'url("/second.png")','menu preview updates _bgDiv1');
assert(offscreenStyle.textContent.includes('/image.png')&&!offscreenStyle.textContent.includes('/second.png'),'menu preview does not mutate offscreen style');
input('back');input('back');assert.equal(sb,'Wallpaper Manager');
click(4);assert.equal(saved.offscreen,false);
assert.equal(offscreenStyle.textContent,'');
click(0);assert.equal(sb,'Gallery');
// 4. Failed save rolls back
click(0);failSave=true;parent.postMessage({type:'mzd-gui-service-request',token:'fixture-token',id:999,operation:'select',args:{value:null}});flush();assert.equal(saved.selected,imageID);assert.equal(host.WallpaperManager.snapshot().active,imageID,'failed save rolls UI back to durable settings');
// 5. Add User image to slideshow and enable slideshow
click(1);assert.deepEqual(saved.slides,[imageID2,imageID]);
input('back');input('back');click(1);assert.equal(sb,'Slideshow');
assert.equal(control.dataList.items[0].image1,'tick','checkmark on left side instead of radio');
assert.equal(control.dataList.items[1].image1,'tick','checkmark on left side instead of radio');
assert.equal(control.dataList.items[1].text1,'5 s');
assert.equal(control.dataList.items[4].text1,'1 min','displays 60 seconds as 1 min');
assert.equal(control.dataList.items[5].text1,'2 min','displays 120 seconds as 2 min');
assert.equal(control.dataList.items[6].text1,'5 min','displays 300 seconds as 5 min');
click(1);assert(saved.enabled);assert.equal(saved.interval,5);
assert.equal(sb,'Wallpaper Manager','selecting slideshow time returns to previous screen');
// 6. When slideshow is enabled, gallery shows Slideshow indicator for all slideshow members
click(0);assert.equal(sb,'Gallery');
assert.equal(control.dataList.items[0].label1,'Slideshow','shows Slideshow detail during slideshow');
assert.equal(control.dataList.items[1].label1,'Slideshow','shows Slideshow detail during slideshow');
click(0);assert.equal(control.dataList.items[0].text1,'Use as static background');
assert.equal(control.dataList.items[0].checked,false,'Use as static background is unchecked while slideshow is active');
// 7. Selecting Use as static background prompts with confirmation dialog
click(0);assert(dialogConfig);
assert.equal(dialogConfig.text1,'The slideshow is running. Do you want to stop the slideshow and use this image as the background?');
assert.equal(dialogConfig.initialFocus,0);
assert.equal(dialogConfig.buttonConfig.button1.appData,'no');
assert.equal(dialogConfig.buttonConfig.button1.labelId,'common.No');
assert.equal(dialogConfig.buttonConfig.button2.appData,'yes');
assert.equal(dialogConfig.buttonConfig.button2.labelId,'common.Yes');
// Selecting no cancels and keeps slideshow
dialogConfig.defaultSelectCallback(null,'no');flush();
assert.equal(dialogConfig,null);assert.equal(saved.enabled,true);
assert.equal(control.dataList.items[0].checked,false,'Use as static background remains unchecked after clicking No');
// Selecting yes applies background and stops slideshow
click(0);dialogConfig.defaultSelectCallback(null,'yes');flush();
assert.equal(saved.enabled,false);assert.equal(saved.selected,imageID);assert.equal(dialogConfig,null);
assert.equal(control.dataList.items[0].checked,true,'Use as static background becomes checked after confirming Yes');
// 7b. When slideshow is disabled, selected image displays "Background" and other slideshow images display "Slideshow"
input('back');assert.equal(sb,'Gallery');
assert.equal(control.dataList.items[0].text1,'User image','file extension stripped from gallery list');
assert.equal(control.dataList.items[0].label1,'Background','selected background displays Background detail');
assert.equal(control.dataList.items[1].text1,'Second','file extension stripped from gallery list');
assert.equal(control.dataList.items[1].label1,'Slideshow','other slideshow image retains Slideshow detail');
// 8. Delete image prompts with confirmation dialog on Second
click(1);assert.equal(sb,'Second');
assert.equal(control.dataList.items[2].text1,'Delete image');
assert.equal(control.dataList.items[2].image1,'common/images/icons/IcnListDelete_En.png');
click(2);assert(dialogConfig);
assert.equal(dialogConfig.text1,'Do you want to delete this image?');
assert.equal(dialogConfig.initialFocus,0);
assert.equal(dialogConfig.buttonConfig.button1.appData,'no');
assert.equal(dialogConfig.buttonConfig.button1.labelId,'common.No');
assert.equal(dialogConfig.buttonConfig.button2.appData,'yes');
assert.equal(dialogConfig.buttonConfig.button2.labelId,'common.Yes');
dialogConfig.defaultSelectCallback(null,'no');flush();
assert.equal(dialogConfig,null);assert.equal(records.length,2);
// Test dialog error recovery scope: 'dialog'
click(2);assert(dialogConfig);
dialogConfig.defaultSelectCallback(null,'no');flush();
for(const fn of viewEvents.message.slice()) fn({source:parent,data:{type:'wallpaper-native-error',token:'fixture-token',scope:'dialog'}});
flush();assert.equal(status.textContent,'','dialog error does not break app with menuError');
// Open delete dialog again and confirm delete
click(2);assert(dialogConfig);
dialogConfig.defaultSelectCallback(null,'yes');flush();
assert.equal(dialogConfig,null);assert.equal(records.length,1);assert.equal(sb,'Gallery');
// 9. Import from USB view and preview screen
usbResult={status:'ready',items:[{source:'sda1',name:'photo.png',label:'photo.png'}]};
input('back');
// Pressing Back while usb-list is in flight must not reset Home focus to Gallery on completion
holdUsb=true;
click(2);
assert.equal(sb,'Import from USB');
assert(pendingUsb,'usb-list is in flight');
input('back');assert.equal(sb,'Wallpaper Manager');assert.equal(control.focus,2);
holdUsb=false;pendingUsb();pendingUsb=null;flush();assert.equal(sb,'Wallpaper Manager');assert.equal(control.focus,2,'usb-list completion on home preserves home focus');
usbResult={status:'disconnected',items:[]};
click(2);assert.equal(sb,'Import from USB');
assert.equal(control.dataList.items[0].disabled,true,'first row is disabled hint');
assert.equal(control.dataList.items[1].disabled,true,'second row is disabled limit');
assert.equal(control.dataList.items[2].text1,'Refresh USB');
assert.equal(control.focus,2,'focus on Refresh USB when disconnected');
usbResult={status:'ready',items:[{source:'sda1',name:'photo.png',label:'photo.png'}]};
click(2);assert.equal(control.focus,0,'focus on first image after refresh');
const refreshRow=control.dataList.items.find(x=>x.text1==='Refresh USB');
assert(refreshRow);assert.equal(refreshRow.image1,'common/images/icons/IcnListSynchronize_En.png');
click(0);assert.equal(sb,'Import image');
assert.equal(control.dataList.items[0].text1,'Import image');
assert.equal(control.dataList.items[0].image1,'common/images/icons/IcnListImport_En.png');
assert.equal(control.dataList.items[0].disabled,false);
// Clicking import disables the row and switches icon to disabled state
click(0);
assert.equal(control.dataList.items[0].text1,'Importing...');
assert.equal(control.dataList.items[0].image1,'common/images/icons/IcnListImport_Ds.png');
assert.equal(control.dataList.items[0].disabled,true);
flush();
assert.equal(control.dataList.items[1].text1,'photo');
assert.equal(control.dataList.items[1].disabled,true);
assert.equal(control.dataList.items[2].text1,'PNG: 800 x 480, max. 1 MiB');
assert.equal(control.dataList.items[2].disabled,true);
// Complete the staged import only after checking its in-progress row.
assert.equal(typeof prepareImport,'function');
prepareImport(null,{ticket:'import-ticket',url:'/staged-photo.png'});flush();
assert.equal(sb,'Gallery');assert.equal(control.dataList.items[1].text1,'photo');
// 10. Re-enable slideshow and offscreen for resident tests
click(1);click(1);assert.equal(saved.slides.length,2,'two slideshow images enable rotation');
input('back');input('back');click(4);assert.equal(saved.offscreen,true);click(1);click(1);assert(saved.enabled);
mmuiCalls.length=0;const queuedBefore=queue.length;input('home');assert.equal(queue.length,queuedBefore,'input home returns false and emits no native-input message');
fw.sendEventToMmui('common','Global.IntentHome');assert.deepEqual(mmuiCalls,[{app:'common',event:'Global.IntentHome'}],'touching Home delegates to OEM sendEventToMmui');
resident.closed();assert.equal(host.WallpaperManager.snapshot().enabled,true,'closing the manager retains resident slideshow');
assert.equal(intervals.size,0,'no active intervals while view is closed');assert.equal(intervalsCleared,intervalsStarted);
resident.reconnected();flush();assert.equal(host.WallpaperManager.snapshot().active,imageID);
assert(offscreenStyle.textContent.includes('/image.png'));
const before=writes;const rotation=[...timers.entries()].find(([,t])=>t.ms===5000);assert(rotation,'slideshow rotation timer scheduled');timers.delete(rotation[0]);rotation[1].f();flush();assert.equal(writes,before,'no flash writes per slideshow tick');
assert(offscreenStyle.textContent.includes('/photo.png'),'slideshow rotation updates offscreen style');
resident.closed();hostEvents.unload();flush();assert.equal(host.WallpaperManager,undefined);assert.equal(fw.sendEventToMmui,originalSend);assert.equal(common._defaultBgPath,'common/images/background.png');
assert(!head.children.some(e=>e.id==='mzd-wallpaper-offscreen')&&offscreenStyle.parentNode===null,'onDispose removes #mzd-wallpaper-offscreen');
assert.equal(intervals.size,0,'no active intervals after unload');
// 11. bootRetry retries while fw.common or fw.common._bgDiv1 is missing
{
 const bTimers=new Map(),bQueue=[];let bTimerId=0;const bHead=element(),bBody=element();
 function BMockImage(){this.width=800;this.height=480;Object.defineProperty(this,'src',{set:()=>bQueue.push(()=>this.onload())});}
 function bFlush(){while(bQueue.length){bQueue.shift()();}}
 const bDoc={head:bHead,body:bBody,getElementById:()=>null,createElement:element,getElementsByTagName:n=>n==='head'?[bHead]:[],documentElement:{contains:()=>true}};
 const bFw={common:null,getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'HomeScreen'};
 const bHost={location:{hostname:'localhost',origin:undefined},framework:bFw,addEventListener:(n,f)=>{if(n==='unload')bHost.unload=f;},removeEventListener:()=>{},setTimeout:(f,ms)=>{bTimers.set(++bTimerId,{f,ms});return bTimerId;},clearTimeout:n=>bTimers.delete(n),setInterval:()=>0,clearInterval:()=>{}};
 const bRes={onServiceReady:()=>{},view:()=>null,onMessage:()=>{},onViewClose:()=>{},onDispose:fn=>bHost.unload=fn,onServiceRequest:()=>{},
  service:{request(op,args,cb){if(op==='gallery')cb(null,{images:records.slice(),settings:{version:1,selected:imageID,enabled:false,interval:10,slides:[],offscreen:false}});}}};
 const bCtx={window:bHost,Image:BMockImage,document:bDoc};
 vm.runInNewContext(fs.readFileSync(path.join(repo,'usb/lib/gui-runtime/residents.js'),'utf8'),bCtx);
 vm.runInNewContext(fs.readFileSync(path.join(repo,'usb/lib/gui-runtime/settings-host.js'),'utf8'),bCtx);
 bRes.createNativeMenu=opts=>bHost.MzdGuiResidents.createNativeMenu(opts);bCtx.context=bRes;
 for(const name of ['preview/core.js','preview/native-menu.js','cmu/import-client.js','cmu/host.js'])vm.runInNewContext(fs.readFileSync(fixturePath(name),'utf8'),bCtx);
 bFlush();
 assert.equal([...bTimers.values()].filter(t=>t.ms===500).length,1,'bootRetry scheduled when common is missing');
 bFw.common={_customBgSet:false,_defaultBgPath:'common/images/background.png',_currentBgPath:'common/images/background.png',_bgDiv1:null,_bgDiv2:null};
 const step1=[...bTimers.entries()].find(([,t])=>t.ms===500);bTimers.delete(step1[0]);step1[1].f();
 assert.equal(bFw.common._defaultBgPath,'/image.png');
 assert.equal([...bTimers.values()].filter(t=>t.ms===500).length,1,'bootRetry continues while _bgDiv1 is missing');
 bFw.common._bgDiv1=element();
 const step2=[...bTimers.entries()].find(([,t])=>t.ms===500);bTimers.delete(step2[0]);step2[1].f();
 assert.equal(bFw.common._bgDiv1.style.backgroundImage,'url("/image.png")');
 assert.equal([...bTimers.values()].filter(t=>t.ms===500).length,0,'bootRetry stops once common and _bgDiv1 exist');
 bHost.unload();
}
console.log('WALLPAPER_CMU_HOST_PASSED: service-backed gallery, empty default membership, durable settings, save-failure rollback, view-independent lifetime and stock-background disposal.');
