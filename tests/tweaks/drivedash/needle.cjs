const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('usb/tweaks/drivedash/assets/needle.js','utf8'),{window});
const n=new window.DriveDashNeedle();assert.equal(n.value(0),null);n.set(1000,0);assert.equal(n.value(0),1000);
n.set(3000,100);let previous=n.value(100);assert.equal(previous,1000);
for(let t=110;t<=600;t+=10){let next=n.value(t);assert(next>=previous&&next<=3000);previous=next;}
assert.equal(n.value(1100),3000);assert(!n.moving(1100));
n.set(5000,1200);const position=n.value(1300),velocity=(n.value(1300)-n.value(1299));n.set(6000,1300);
assert.equal(n.value(1300),position);assert(Math.abs((n.value(1301)-position)-velocity)<1,'retarget retains needle velocity');
n.set(2000,1350);for(let t=1350;t<2400;t+=10)assert(n.value(t)>=2000&&n.value(t)<=6000);
n.set(null,2400);assert.equal(n.value(2400),null);assert(!n.moving(2400));
n.set(1000,2500);n.set(3000,2600);assert.equal(n.value(1),3000);assert(!n.moving(1));
n.reset();n.set(9000,0);assert.equal(n.value(0),8000);n.reset();assert.equal(n.value(0),null);
console.log('DRIVEDASH_NEEDLE_PASSED: critically damped bounded motion, continuous position/velocity, reversal, settling, missing samples, clock rollback and cleanup.');
