const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname,'../..');
for (const [id,api] of [['wallpaper-manager','WallpaperNativeMenu'],['drivedash','DriveDashNativeMenu']]) {
  const source = path.join(root,'usb/tweaks',id,'assets/resident.js');
  if (!fs.existsSync(source)) continue;
  test(id + ' OEM Back arrow focus and cleanup', () => {
    function node() { return {style:{cssText:''},children:[],appendChild(n){n.parentNode=this;this.children.push(n);},removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;},set innerHTML(v){this.children=[];}}; }
    let focused=false, list, restored=false, title='', callback;
    const messages=[], events=[];
    const template={divElt:{style:{visibility:'visible'}},list2Ctrl:{setLineNumbers(){}},handleControllerEvent(e){restored=e==='acceptFocusFromLeft';}};
    const fw={getCurrentApp:()=> 'system',getCurrCtxtId:()=> 'Applications',getAppInstance:()=>({_currentContextTemplate:template}),sendEventToMmui(){},
      common:{setSbName(v){title=v;},setSbNameId(a,v){title=v;},leftBtn:{btnInstance:{get hasFocus(){return focused;}},handleControllerEvent(e){
        if(e==='acceptFocusFromRight'){focused=true;return 'consumed';}
        if(e==='lostFocus'){focused=false;return 'consumed';}
        if(e==='right')return 'giveFocusRight';
        if(e==='select'){fw.sendEventToMmui('common','Global.GoBack');return 'consumed';}
      }}},
      instantiateControl(a,p,t,props){list={handleControllerEvent(e){events.push(e);return e==='leftStart'?'giveFocusLeft':'consumed';},getContextCapture(){return {focussedItem:0,topItem:0};},restoreContext(){},setDataListAndUpdateItems(){}};return list;},destroyControl(){}
    };
    const head=node(), body=node();
    const document={head,body,createElement:node,getElementById:()=>null,getElementsByTagName:n=>n==='head'?[head]:n==='body'?[body]:[],documentElement:{contains:()=>true}};
    const win={framework:fw,addEventListener(){},removeEventListener(){},setTimeout(fn){callback=fn;return 1;},clearTimeout(){}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'usb/lib/gui-runtime/residents.js'),'utf8'),{window:win,document});
    let code=fs.readFileSync(source,'utf8');
    vm.runInNewContext(code,{window:win,document});
    assert(win[api], 'native menu API exported');
    const menu=win[api].create(), parent=node(), frame=node();
    frame.contentWindow={postMessage(m){messages.push(m);}};parent.appendChild(frame);
    const spec={title:'Settings',page:'one',rows:[{label:'Entry'}]};
    menu.render(frame,'token',spec);
    menu.input(frame,'token','left','step');assert(focused);assert(events.includes('lostFocus'));
    menu.input(frame,'token','right','step');assert(!focused);assert(events.includes('acceptFocusFromLeft'));
    menu.input(frame,'wrong','left','step');assert(!focused);
    menu.input(frame,'token','left','step');menu.input(frame,'token','select','step');
    assert(messages.some(m=>m.action==='back'));
    menu.render(frame,'token',{...spec,page:'two'});assert(!focused,'new page releases arrow focus');
    menu.input(frame,'token','left','step');assert(focused);
    menu.close();assert(!focused);assert(restored);assert.equal(title,'Applications');
    assert.equal(parent.children.length,1,'overlay removed');
  });
}
