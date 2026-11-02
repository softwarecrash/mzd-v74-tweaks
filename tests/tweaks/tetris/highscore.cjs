const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let factory,handler,ready,current,request,received=[];
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../usb/tweaks/tetris/assets/resident.js'),'utf8'),{window:{MzdGuiResidents:{register(id,fn){assert.equal(id,'tetris');factory=fn;}}}});
current={token:'secret',source:{postMessage(data){received.push(data);}}};
factory({view(){return current;},onMessage(fn){handler=fn;},onServiceReady(fn){ready=fn;},service:{request(operation,args,callback){assert.equal(operation,'score');request={args,callback};}}});
function event(token='secret',score=null){handler({source:current.source,data:{token,type:'mzd-module-tetris-score',value:{id:1,score}}});}
event('wrong');assert.equal(request,undefined);event();assert.deepEqual(JSON.parse(JSON.stringify(request.args)),{});request.callback(null,{highscore:50});assert.equal(received.at(-1).result.highscore,50);
event('secret',100);request.callback('Service starting');ready();assert.equal(request.args.score,100);request.callback(null,{highscore:100});
event('secret',200);const callback=request.callback;current=null;callback(null,{highscore:200});assert.equal(received.at(-1).result.highscore,100);
console.log('TETRIS_HIGHSCORE_BRIDGE_PASSED: authenticated view, initial read, save, service-ready retry and stale-view guard.');
