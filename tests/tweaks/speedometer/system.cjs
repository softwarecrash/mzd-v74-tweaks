const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let message, services=0, distanceCalls=0, temperatureCalls=0, languageCalls=0;
const replies = [];
const current = {token:'fixture-token',source:{postMessage:value=>replies.push(value)}};
const window = {framework:{localize:{getDistanceUnit() {distanceCalls++;return 'Miles';},getTemperatureUnit() {temperatureCalls++;return 'Fahrenheit';}}},
    MzdGuiResidents:{register(id,factory) {assert.equal(id,'speedometer');factory({view:()=>current,language:()=> {languageCalls++;return 'de_DE';},
        onMessage:fn=>{message=fn;},onViewClose() {},onDispose() {},service:{request() {services++;}}});}}};
vm.runInNewContext(fs.readFileSync('usb/tweaks/speedometer/assets/resident.js','utf8'),{window});
function request(source=current.source,token=current.token,fields={language:true,speedUnit:true,tempUnit:true}) {message({source,data:{type:'speedo-system-settings',token,fields}});}
request({},current.token);request(current.source,'foreign');assert.equal(replies.length,0);
request();
assert.equal(replies[0].settings.language,'de_DE');assert.equal(replies[0].settings.speedUnit,'mph');assert.equal(replies[0].settings.tempUnit,'F');
assert.equal(distanceCalls,1);assert.equal(temperatureCalls,1);assert.equal(services,0,'System settings must not query the Lua/vehicle service.');
window.framework.localize={getDistanceUnit:()=> 'Kilometers',getTemperatureUnit:()=> 'Celsius'};
request();assert.equal(replies[1].settings.speedUnit,'kmh');assert.equal(replies[1].settings.tempUnit,'C');
window.framework.localize={getDistanceUnit:()=> 'unknown',getTemperatureUnit:()=> {throw Error('missing');}};
request();assert.equal(replies[2].settings.speedUnit,undefined);assert.equal(replies[2].settings.tempUnit,undefined);assert.equal(replies[2].settings.language,'de_DE');
let lang=languageCalls,dist=distanceCalls,temp=temperatureCalls;
request(current.source,current.token,{});
assert.equal(languageCalls,lang);assert.equal(distanceCalls,dist);assert.equal(temperatureCalls,temp);
request(current.source,current.token,{language:true});
assert.equal(languageCalls,lang+1);assert.equal(distanceCalls,dist);assert.equal(temperatureCalls,temp);
console.log('SPEEDOMETER_SYSTEM_PASSED: OEM getters, locale, units, source/token checks, independent failures and no sensor/service calls.');
