const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixturePath(...parts){const relative=path.join(...parts);return path.join(relative.split(path.sep)[0]==='assets'?path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'):path.resolve(__dirname,'../../../development/wallpaper-manager'),relative);}
const root=path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'),repo=path.resolve(root,'../../..'),queue=[],hostEvents={},viewEvents={},timers=new Map();let timer=0,writes=0,control=null,created=0,destroyed=0,attached=true,sb='Applications',dialogConfig=null;
function element(){return {children:[],style:{cssText:''},className:'',attributes:{},textContent:'',appendChild(e){e.parentNode=this;this.children.push(e);},removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;},get firstChild(){return this.children[0]||null;},set innerHTML(v){this.children=[];},setAttribute(k,v){this.attributes[k]=v;}};}
const status=element(),rootNode=element(),frame=element();rootNode.style.cssText='old-style';rootNode.appendChild(frame);
const head=element(),body=element();
const document={head,body,getElementById:()=>status,createElement:element,getElementsByTagName:n=>n==='head'?[head]:frames,documentElement:{contains:()=>attached}};
const common={_customBgSet:false,_defaultBgPath:'common/images/background.png',_currentBgPath:'common/images/background.png',_bgDiv1:element(),_bgDiv2:null,setSbName:v=>sb=v,setSbNameId:()=>sb='Applications'};
const originalSend=()=>{},fw={common,getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'Applications',getAppInstance:()=>({_currentContextTemplate:{list2Ctrl:{setLineNumbers(){}}}}),sendEventToMmui:originalSend,
 _templatesLoaded:{Dialog3Tmplt:{isLoaded:true}},
 _controlsLoaded:{Dialog3Ctrl:{isLoaded:true},ButtonCtrl:{isLoaded:true}},
 instantiateTemplate(app,parent,type,props){dialogConfig=props.Dialog3Ctrl;return {dialog3Ctrl:props.Dialog3Ctrl,cleanUp(){dialogConfig=null;}};},
 instantiateControl(app,parent,type,props){assert.equal(type,'List2Ctrl');assert.equal(props.titleConfiguration,'noTitle');assert(parent.className.indexOf('TemplateWithStatusLeft List2Tmplt')===0);created++;
  control={props,rendered:true,focus:props.focussedItem||0,dataList:props.dataList,handleControllerEvent(event){if(event==='cw'||event==='down'){this.focus=(this.focus+1)%this.dataList.items.length;}if(event==='ccw'||event==='up'){this.focus=(this.focus+this.dataList.items.length-1)%this.dataList.items.length;}if(event==='select')props.selectCallback(this,this.dataList.items[this.focus].appData);},getContextCapture(){return{hasFocus:true,focussedItem:this.focus,topItem:0};},restoreContext(c){this.focus=c.focussedItem;},setDataList(d){this.dataList=d;this.rendered=false;},setDataListAndUpdateItems(d){this.dataList=d;this.rendered=true;}};return control;},destroyControl(c){destroyed++;if(control===c)control=null;}};
const host={location:{hostname:'localhost',origin:undefined},framework:fw,localStorage:{getItem:()=>null,setItem:()=>writes++},addEventListener:(n,f)=>hostEvents[n]=f,removeEventListener:n=>delete hostEvents[n],setTimeout:(f,ms)=>{timers.set(++timer,{f,ms});return timer;},clearTimeout:n=>timers.delete(n),setInterval:f=>{host.refresh=f;return 1;},clearInterval:()=>{}};
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

let saved={version:1,selected:null,enabled:false,interval:10,slides:[],removed:[]},failSave=false;
const imageID='img-'+ 'a'.repeat(32),imageID2='img-'+ 'b'.repeat(32);
const records=[{id:imageID,label:'User image.png',url:'/image.png'},{id:imageID2,label:'Second.png',url:'/second.png'}];
const resident={onServiceReady:fn=>resident.reconnected=fn,view:()=>({source:view,frame,token:'fixture-token'}),onMessage:fn=>hostEvents.message=fn,onViewClose:fn=>resident.closed=fn,onDispose:fn=>hostEvents.unload=fn,onServiceRequest:fn=>resident.serviceRequest=fn,
 service:{request(op,args,cb){queue.push(()=>{
  if(op==='gallery')cb(null,{images:records.slice(),settings:saved});
  else if(op==='save'){writes++;if(failSave){failSave=false;cb('Disk full.');}else{saved=JSON.parse(JSON.stringify(args));cb(null,{settings:saved});}}
  else if(op==='delete'){writes++;const id=args.id||args.value;const idx=records.findIndex(r=>r.id===id);if(idx>=0)records.splice(idx,1);saved.slides=saved.slides.filter(x=>x!==id);if(saved.selected===id)saved.selected=null;cb(null,{images:records.slice(),settings:saved});}
  else if(op==='usb')cb(null,{status:'ready',items:[{source:'sda1',name:'photo.png',label:'photo.png'}]});
  else throw Error('Unexpected request '+op);
 });}}};
vm.runInNewContext(fs.readFileSync(path.join(repo,'usb/lib/gui-runtime/residents.js'),'utf8'),context);
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
input('back');click(2);assert.equal(sb,'Import from USB');
const refreshRow=control.dataList.items.find(x=>x.text1==='Refresh USB');
assert(refreshRow);assert.equal(refreshRow.image1,'common/images/icons/IcnListSynchronize_En.png');
click(0);assert.equal(sb,'Import image');
assert.equal(control.dataList.items[0].text1,'Import image');
assert.equal(control.dataList.items[0].image1,'common/images/icons/IcnListImport_En.png');
assert.equal(control.dataList.items[1].text1,'photo');
assert.equal(control.dataList.items[1].disabled,true);
assert.equal(control.dataList.items[2].text1,'PNG: 800 x 480, max. 1 MiB');
assert.equal(control.dataList.items[2].disabled,true);
// 10. Re-enable slideshow for resident tests
input('back');input('back');click(1);click(1);assert(saved.enabled);
resident.closed();assert.equal(host.WallpaperManager.snapshot().enabled,true,'closing the manager retains resident slideshow');
resident.reconnected();flush();assert.equal(host.WallpaperManager.snapshot().active,imageID);
const before=writes;const rotation=[...timers.values()].find(t=>t.ms===5000);if(rotation){rotation.f();flush();}assert.equal(writes,before,'no flash writes per slideshow tick');
resident.closed();hostEvents.unload();flush();assert.equal(host.WallpaperManager,undefined);assert.equal(fw.sendEventToMmui,originalSend);assert.equal(common._defaultBgPath,'common/images/background.png');
console.log('WALLPAPER_CMU_HOST_PASSED: service-backed gallery, empty default membership, durable settings, save-failure rollback, view-independent lifetime and stock-background disposal.');
