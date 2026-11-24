const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),Module=require('node:module');
function fixturePath(...parts){const relative=path.join(...parts);return path.join(relative.split(path.sep)[0]==='assets'?path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'):path.resolve(__dirname,'../../../development/wallpaper-manager'),relative);}
const root=path.resolve(__dirname,'../../../usb/tweaks/wallpaper-manager'),script=fs.readFileSync(fixturePath('preview/core.js'),'utf8');
const window={};vm.runInNewContext(script,{window});
const catalog=[{id:'a',url:'/images/a.png'},{id:'b',url:'/images/b.png'}];
let saved='',writes=0,painted=[],timers=new Map(),next=0,fail=false;
function fixture(){return window.WallpaperPreviewCore.create({catalog,read:()=>saved,write:v=>{saved=v;writes++;},paint:(id,done)=>{painted.push(id);done(fail&&id!==null);},delay:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},cancel:id=>timers.delete(id)});}
function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();}
let core=fixture();assert.equal(core.snapshot().active,null);assert.equal(writes,0);
core.command('select','a');assert.equal(core.snapshot().active,'a');assert.equal(writes,1);
core.command('slideshow');const n=writes;assert.equal(timers.size,1);tick();assert.equal(core.snapshot().active,'b');tick();assert.equal(core.snapshot().active,'a');assert.equal(writes,n,'slideshow ticks must not persist');assert.equal(timers.size,1);
core.command('interval');assert.equal(core.snapshot().interval,30);assert.equal(timers.size,1);
core.dispose();assert.equal(timers.size,0);assert.throws(()=>core.command('select','a'));
core=fixture();assert(core.snapshot().enabled);assert.equal(core.snapshot().interval,30);
core.command('delete','a');assert(!core.snapshot().images.some(x=>x.id==='a'));assert.equal(core.snapshot().active,'b');
core.command('delete','b');assert.equal(core.snapshot().active,null);assert.equal(core.snapshot().enabled,false);assert.equal(timers.size,0);assert.throws(()=>core.command('slideshow'));
assert.throws(()=>core.command('reset'),'no sample restoration command in application');core.dispose();saved='';core=fixture();assert.equal(core.snapshot().images.length,2);assert.throws(()=>core.command('select','../../bad'));
core.command('select',null);assert.equal(painted[painted.length-1],null);core.dispose();
saved='{"version":1,"selected":"../../evil","enabled":true,"interval":-1,"slides":["../../evil"],"removed":[]}';core=fixture();assert.equal(core.snapshot().active,null);assert.equal(core.snapshot().enabled,false);core.dispose();
saved='not json';core=fixture();assert.equal(core.snapshot().images.length,2);fail=true;core.command('select','a');assert.equal(core.snapshot().active,null);assert(core.snapshot().error.includes('could not be loaded'));core.dispose();
fail=false;saved='';core=fixture();core.command('slideshow-mode',5);assert(core.snapshot().enabled);assert.equal(core.snapshot().interval,5);tick();const last=core.snapshot().active;
core.command('slideshow-mode',0);assert.equal(core.snapshot().active,last,'Off retains current image');assert.equal(timers.size,0);core.dispose();core=fixture();assert.equal(core.snapshot().active,last);assert.equal(core.snapshot().enabled,false);
core.command('include','a');core.command('include','b');const beforeInvalid=writes;assert.throws(()=>core.command('slideshow-mode',10));assert.equal(writes,beforeInvalid,'empty selection refusal does not save');core.command('slideshow-mode',0);assert.throws(()=>core.command('slideshow-mode',7));
core.command('offscreen',true);assert.equal(core.snapshot().offscreen,true);assert.equal(JSON.parse(saved).offscreen,true);
core.command('offscreen',false);assert.equal(core.snapshot().offscreen,false);assert.equal(JSON.parse(saved).offscreen,false);
core.dispose();
// Parse every runtime file using the same ES5 grammar as the CMU check.
const key=Object.keys(process.binding('natives')).find(k=>k.endsWith('acorn/dist/acorn'));const parser=new Module('preview-es5');parser._compile(process.binding('natives')[key],'preview-es5.js');
for(const dir of ['assets','preview'])for(const name of fs.readdirSync(fixturePath(dir)))if(name.endsWith('.js'))parser.exports.parse(fs.readFileSync(fixturePath(dir,name),'utf8'),{ecmaVersion:5});
console.log('WALLPAPER_PREVIEW_PASSED: selection, resident slideshow, one timer, no tick writes, persistence, delete, invalid state, fallback, disposal and ES5.');
