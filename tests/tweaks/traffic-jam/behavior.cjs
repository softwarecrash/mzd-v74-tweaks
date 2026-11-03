/* Real engines and view entrypoints; deterministic rules and commander input. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'../../..');
function engine(id){const w={};vm.runInNewContext(fs.readFileSync(path.join(root,'usb/tweaks',id,'assets/engine.js'),'utf8'),{window:w});return w[id==='snake'?'SnakeEngine':'MinesweeperEngine'];}
const Snake=engine('snake').Game,Mines=engine('minesweeper').Game;
let s=new Snake(()=>0), m=new Mines(()=>0.4), checks=0;
assert.equal(s.body.length,3);assert.equal(s.interval(),260);assert(!s.turn('left'));assert(s.turn('up'));assert(s.turn('left'));assert(!s.turn('down'));s.step();assert.equal(s.direction,'up');s.step();assert.equal(s.direction,'left');checks++;
s.start();s.apple={x:8,y:9};s.step();assert.equal(s.score,1);assert.equal(s.body.length,4);assert(s.interval()<260);assert(!s.body.some(p=>p.x===s.apple.x&&p.y===s.apple.y));checks++;
for(const [direction,x,y,expectedX,expectedY] of [['right',23,9,0,9],['left',0,9,23,9],['up',5,0,5,17],['down',5,17,5,0]]){s.start();s.body=[{x,y}];s.direction=direction;s.apple={x:10,y:10};s.step();assert.equal(s.state,'playing');assert.equal(s.body[0].x,expectedX);assert.equal(s.body[0].y,expectedY);}s.start();s.tick(100000);assert.equal(s.body[0].x,8,'late frame advances at most one cell');s.score=10000;assert.equal(s.interval(),90);checks++;
s.start();s.body=[{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2}];s.direction='left';s.apple={x:10,y:10};s.step();assert.equal(s.state,'playing','departing tail is legal');s.body=[{x:2,y:2},{x:1,y:2},{x:1,y:3},{x:2,y:3}];s.direction='left';s.step();assert.equal(s.state,'lost');checks++;
m.flag(true);for(let n=0;n<20;n++)m.flag(true);assert.equal(m.flags,1);assert(m.cells[0].flag);m.reveal();assert(!m.planted,'a flagged field cannot start the game');for(let n=0;n<20;n++)m.flag(false);assert.equal(m.flags,0);assert(!m.cells[0].flag);checks++;
m.reveal();assert(m.planted);assert.equal(m.cells.filter(c=>c.mine).length,30);assert(!m.cells[0].mine);assert.equal(m.cells[0].count,0);assert(m.neighbors(0).every(n=>!m.cells[n].mine));assert(m.opened>1);assert(!m.flag(true),'opened fields cannot be flagged');checks++;
for(let first of [0,15,176,191,88]){m=new Mines(()=>0.23);m.cursor=first;m.reveal();assert(!m.cells[first].mine);assert.equal(m.cells[first].count,0);assert.equal(m.cells.filter(c=>c.mine).length,30);for(let n=0;n<m.cells.length;n++){const expected=m.neighbors(n).filter(i=>m.cells[i].mine).length;assert.equal(m.cells[n].count,expected);}}checks++;
m=new Mines(()=>0.4);m.tick(1000);assert.equal(m.elapsed,0);m.reveal();m.tick(500);assert.equal(m.elapsed,500);m.cursor=m.cells.findIndex(c=>c.mine);m.reveal();assert.equal(m.state,'lost');m.tick(500);assert.equal(m.elapsed,500);checks++;
m=new Mines(()=>0.4);m.reveal();for(let n=0;n<m.cells.length;n++){if(!m.cells[n].mine){m.cursor=n;m.reveal();}}assert.equal(m.state,'won');assert.equal(m.opened,162);m.start();m.move('left');m.move('up');assert.equal(m.cursor,0);checks++;
function view(id){
 let interval,now=1000,disposed,input,message,closed=0,language,sent=[],events={},docEvents={};
 const context=new Proxy({}, {get(t,k){return t[k]||(t[k]=()=>{});},set(t,k,v){t[k]=v;return true;}});
 function node(){return {style:{},children:[],textContent:'',setAttribute(){},appendChild(n){this.children.push(n);},getContext(){return context;},set innerHTML(v){this.children=[];}};}
 const nodes={};for(const n of ['stage','board','title','metric-label','best-label','best','controls','keyboard','extra','metric','court','shade','dialog','dialog-title','dialog-text','menu'])nodes[n]=node();
 const document={documentElement:{},getElementById:n=>nodes[n],createElement:node,addEventListener(n,f){docEvents[n]=f;},removeEventListener(n){delete docEvents[n];}};
 const sdk={t:(k,f)=>f,onInput(f){input=f;},onDispose(f){disposed=f;},onMessage(f){message=f;},loadLanguage(f){language=f;},send(n,v){sent.push([n,v]);},ready(){},close(){closed++;}};
 const w={TrafficJamGame:id,MzdGuiModule:sdk,innerWidth:800,innerHeight:480,setInterval(f){interval=f;return 1;},clearInterval(){interval=null;},addEventListener(n,f){events[n]=f;},removeEventListener(n){delete events[n];}};
 const sandbox={window:w,document,Date:class extends Date{constructor(){super(now);}static now(){return now;}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'usb/tweaks',id,'assets/engine.js'),'utf8'),sandbox);
 vm.runInNewContext(fs.readFileSync(path.join(root,'usb/tweaks',id,'assets/app.js'),'utf8'),sandbox);
 return {api:w.TrafficJamView,nodes,sent,input,message,events,docEvents,tick(ms){now+=ms;if(interval)interval();},language,dispose(){disposed();},closed(){return closed;},hasTimer(){return !!interval;}};
}
for(const id of ['snake','minesweeper']){
 let factory,handler,ready,current,request,received=[];
 vm.runInNewContext(fs.readFileSync(path.join(root,'usb/tweaks',id,'assets/resident.js'),'utf8'),{window:{MzdGuiResidents:{register(name,fn){assert.equal(name,id);factory=fn;}}}});
 current={token:'secret',source:{postMessage(data){received.push(data);}}};
 factory({view(){return current;},onMessage(fn){handler=fn;},onServiceReady(fn){ready=fn;},service:{request(operation,args,callback){assert.equal(operation,'record');request={args,callback};}}});
 function event(value,token='secret',source=current.source){handler({source,data:{token,type:'mzd-module-'+id+'-record',value:{id:1,value}}});}
 event(50,'wrong');event(50,'secret',{});assert.equal(request,undefined);
 event(undefined);assert.deepEqual(JSON.parse(JSON.stringify(request.args)),{});request.callback(null,{best:0});
 event(50);request.callback('Service starting');event(100);request.callback('Service starting');ready();
 assert.equal(request.args.value,id==='snake'?100:50,'pending record direction survives retry');request.callback(null,{best:id==='snake'?100:50});
 event(200);const callback=request.callback,count=received.length;current=null;callback(null,{best:200});assert.equal(received.length,count,'closed view receives no reply');checks++;
}
for(const id of ['snake','minesweeper']){
 const v=view(id);assert.equal(v.api.mode(),'ready');assert.equal(v.sent[0][0],id+'-record');v.language('de_DE','ltr');
 v.input('select','press');v.input('select','release');assert.equal(v.api.mode(),'play');assert.equal(v.nodes.court.style.display,'block');
 if(id==='minesweeper'){
  for(let n=0;n<12;n++){v.input('rotateRight','press');v.input('rotateRight','release');}assert.equal(v.api.game.flags,1);
  for(let n=0;n<12;n++)v.input('rotateLeft','step');assert.equal(v.api.game.flags,0);
  v.input('right','press');assert.equal(v.api.game.cursor,1);v.tick(400);assert.equal(v.api.game.cursor,2);v.input('right','release');v.tick(400);assert.equal(v.api.game.cursor,2);
  v.input('select','press');assert(v.api.game.planted);
 }
 v.input('back','press');assert.equal(v.api.mode(),'play');v.input('back','release');assert.equal(v.api.mode(),'paused');assert.equal(v.nodes.court.style.display,'none');
 const value=id==='snake'?v.api.game.body[0].x:v.api.game.elapsed;v.tick(1000);assert.equal(id==='snake'?v.api.game.body[0].x:v.api.game.elapsed,value,'pause freezes gameplay/time');
 const before=v.nodes.menu.children.length;v.input('rotateRight','press');assert.equal(v.nodes.menu.children.length,before,'menu entries remain present after selection changes');assert(v.nodes.menu.children[1].className.includes('selected'));
 v.input('back','step');assert.equal(v.api.mode(),'play');v.events.blur();assert.equal(v.api.mode(),'paused');v.input('back','step');v.tick(3000);assert.equal(v.api.mode(),'paused','suspended view resumes paused');
 v.message({type:'mzd-module-'+id+'-record-result',result:{best:42}});assert.equal(v.nodes.best.textContent,id==='snake'?'42':'0:42');
 v.input('rotateRight','press');v.input('rotateRight','press');v.input('select','press');assert.equal(v.closed(),1);
 v.dispose();assert(!v.hasTimer());assert.deepEqual(Object.keys(v.events),[]);assert.deepEqual(Object.keys(v.docEvents),[]);checks++;
}
for(const id of ['snake','minesweeper']){
 const v=view(id);v.input('select','press');v.input('select','release');
 if(id==='snake'){v.api.game.body=[{x:2,y:2},{x:1,y:2},{x:1,y:3},{x:2,y:3}];v.api.game.direction='left';v.tick(300);assert(v.api.game.crash);}
 else {v.input('select','press');v.api.game.cursor=v.api.game.cells.findIndex(c=>c.mine);v.input('select','press');}
 assert.equal(v.api.mode(),'result');assert.equal(v.nodes.court.style.display,'block');assert.equal(v.nodes.dialog.style.display,'none');
 const score=v.api.game.elapsed;v.tick(1000);assert.equal(v.api.game.elapsed,score);v.input('rotateRight','step');assert.equal(v.api.mode(),'result');
 v.input('select','release');assert.equal(v.api.mode(),'result','opening release cannot dismiss final board');
 v.input('select','press');assert.equal(v.api.mode(),'finished');v.input('select','release');v.input('back','step');assert.equal(v.api.mode(),'result');
 v.language('de_DE','ltr');assert.equal(v.api.mode(),'result');assert.equal(v.nodes.court.style.display,'block');
 v.input('back','step');assert.equal(v.api.mode(),'finished');v.dispose();checks++;
}
for(const id of ['snake','minesweeper']){
 for(const name of ['app.js','style.css'])assert.equal(fs.readFileSync(path.join(root,'usb/tweaks',id,'assets',name),'utf8'),fs.readFileSync(path.join(root,'development/traffic-jam',name),'utf8'));
 let catalog;vm.runInNewContext(fs.readFileSync(path.join(root,'usb/tweaks',id,'assets/i18n.js'),'utf8'),{window:{MzdGuiI18n:{register(name,value){assert.equal(name,id);catalog=value;}}}});
 assert.deepEqual(Object.keys(catalog.languages.en_US).sort(),Object.keys(catalog.languages.de_DE).sort());
 assert(!JSON.stringify(catalog).includes('\uFFFD'));checks++;
}
console.log('TRAFFIC_JAM_PASSED:',checks,'rules, safe first opening, idempotent flag directions, commander phases, pause, suspension, menus, config bridge, translations and disposal.');
