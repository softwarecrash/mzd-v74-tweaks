const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const timers = new Map(), requests = [], received = [];
let serial = 0,clock=0;
const window = {setTimeout(fn,ms) {timers.set(++serial,{fn,ms});return serial;},clearTimeout(id) {timers.delete(id);}};
vm.runInNewContext(fs.readFileSync('usb/tweaks/drivedash/assets/live.js','utf8'),{window,Date:class{getTime(){return clock;}}});
const source = new window.DriveDashLive(callback => requests.push(callback));
function fire(ms) {const pair = [...timers].find(([,t]) => t.ms===ms);assert.ok(pair,'Missing timer '+ms);timers.delete(pair[0]);pair[1].fn();}
source.start(value => received.push(value));assert.equal(requests.length,1);assert.equal(received[0].source,'unavailable');
requests.shift()(null,{source:'cmu',available:true,speedKph:88});
for(let i=0;i<2;i++){fire(250);requests.shift()('timeout');assert.equal(received.at(-1).speedKph,88);}
fire(250);requests.shift()('timeout');assert.equal(received.at(-1).source,'unavailable');
fire(1000);requests.shift()(null,{source:'cmu',available:true,speedKph:77});
fire(250);requests.shift()('timeout');assert.equal(received.at(-1).speedKph,77,'Successful reply resets the failure counter.');
source.stop();assert.equal(timers.size,0);
source.start(value=>received.push(value));source.stop();source.start(value=>received.push(value));
assert.equal(requests.length,1,'Reopen must wait for the outstanding request.');
requests.shift()(null,{source:'cmu',available:true,speedKph:111});assert.equal(requests.length,0);fire(100);assert.equal(requests.length,1);assert.notEqual(received.at(-1).speedKph,111);
requests.shift()(null,{source:'cmu',available:false,coolantC:65});assert.equal(received.at(-1).coolantC,65,'Valid partial snapshots must retain their slow fields.');
fire(1000);const before=received.length;source.stop();requests.shift()(null,{source:'cmu',available:true,speedKph:99});assert.equal(received.length,before);assert.equal(timers.size,0);
console.log('DRIVEDASH_LIVE_PASSED: three-failure threshold, recovery/reset, serialized requests, delayed reply isolation, partial readings and close cleanup.');

source.start(()=>{});clock+=170;requests.shift()(null,{source:'cmu',available:true});assert([...timers.values()].some(t=>t.ms===100),'minimum rest after a slow query');source.stop();

source.start(()=>{});clock+=500;requests.shift()(null,{source:'cmu',available:true});assert([...timers.values()].some(t=>t.ms===100),'overdue requests must still rest');source.stop();
