const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixturePath(...parts){const relative=path.join(...parts);return path.join(relative.split(path.sep)[0]==='assets'?path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'):path.resolve(__dirname,'../../../development/wallpaper-manager'),relative);}
const root=path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'),repo=path.resolve(root,'../../..'),queue=[],hostEvents={},viewEvents={},timers=new Map();let timer=0,writes=0,control=null,created=0,destroyed=0,attached=true,sb='Applications';
function element(){return {children:[],style:{cssText:''},className:'',attributes:{},textContent:'',appendChild(e){e.parentNode=this;this.children.push(e);},removeChild(e){this.children.splice(this.children.indexOf(e),1);e.parentNode=null;},get firstChild(){return this.children[0]||null;},set innerHTML(v){this.children=[];},setAttribute(k,v){this.attributes[k]=v;}};}
const status=element(),rootNode=element(),frame=element();rootNode.style.cssText='old-style';rootNode.appendChild(frame);
const head=element(),body=element();
const document={head,body,getElementById:()=>status,createElement:element,getElementsByTagName:n=>n==='head'?[head]:frames,documentElement:{contains:()=>attached}};
const common={_customBgSet:false,_defaultBgPath:'common/images/background.png',_currentBgPath:'common/images/background.png',_bgDiv1:element(),_bgDiv2:null,setSbName:v=>sb=v,setSbNameId:()=>sb='Applications'};
const originalSend=()=>{},fw={common,getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'Applications',getAppInstance:()=>({_currentContextTemplate:{list2Ctrl:{setLineNumbers(){}}}}),sendEventToMmui:originalSend,
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
const context={window:host,Image:MockImage,document};

let saved={version:1,selected:null,enabled:false,interval:10,slides:[],removed:[]},failSave=false;
const imageID='img-'+ 'a'.repeat(32),records=[{id:imageID,label:'User image',url:'/image.png'}];
const resident={onServiceReady:fn=>resident.reconnected=fn,view:()=>({source:view,frame,token:'fixture-token'}),onMessage:fn=>hostEvents.message=fn,onViewClose:fn=>resident.closed=fn,onDispose:fn=>hostEvents.unload=fn,onServiceRequest:fn=>resident.serviceRequest=fn,
 service:{request(op,args,cb){queue.push(()=>{
  if(op==='gallery')cb(null,{images:records.slice(),settings:saved});
  else if(op==='save'){writes++;if(failSave){failSave=false;cb('Disk full.');}else{saved=JSON.parse(JSON.stringify(args));cb(null,{settings:saved});}}
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
flush();assert.equal(sb,'Wallpaper Manager');assert.equal(host.WallpaperManager.snapshot().images.length,1);assert.deepEqual(Array.from(host.WallpaperManager.snapshot().slides),[]);
click(0);click(0);click(0);assert.equal(saved.selected,imageID);assert.equal(writes,1);assert.equal(host.WallpaperManager.snapshot().active,imageID);
failSave=true;parent.postMessage({type:'mzd-gui-service-request',token:'fixture-token',id:999,operation:'select',args:{value:null}});flush();assert.equal(saved.selected,imageID);assert.equal(host.WallpaperManager.snapshot().active,imageID,'failed save rolls UI back to durable settings');
click(1);assert.deepEqual(saved.slides,[imageID]);input('back');input('back');click(1);click(1);assert(saved.enabled);assert.equal(saved.interval,5);
resident.closed();assert.equal(host.WallpaperManager.snapshot().enabled,true,'closing the manager retains resident slideshow');
resident.reconnected();flush();assert.equal(host.WallpaperManager.snapshot().active,imageID);
const before=writes;const rotation=[...timers.values()].find(t=>t.ms===5000);if(rotation){rotation.f();flush();}assert.equal(writes,before,'no flash writes per slideshow tick');
resident.closed();hostEvents.unload();flush();assert.equal(host.WallpaperManager,undefined);assert.equal(fw.sendEventToMmui,originalSend);assert.equal(common._defaultBgPath,'common/images/background.png');
console.log('WALLPAPER_CMU_HOST_PASSED: service-backed gallery, empty default membership, durable settings, save-failure rollback, view-independent lifetime and stock-background disposal.');
