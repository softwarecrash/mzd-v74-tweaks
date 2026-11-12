local gps=assert(loadfile('usb/tweaks/drivedash/assets/service/gps.lua'))()
local text='method return time=0 sender=:1.2 -> destination=:1.3 serial=4 reply_serial=2\n   struct {\n      double 48.1\n      double 11.5\n      double -12.5\n      double 135\n      double 87.5\n   }\n'
local value=gps.parse(text)
assert(value.gpsLatitudeDeg==48.1 and value.gpsLongitudeDeg==11.5 and value.gpsAltitudeM==-12.5 and value.gpsHeadingDeg==135 and value.gpsSpeedKph==87.5)
for _,bad in ipairs({'','Error org.freedesktop.DBus.Error.NoReply',text:gsub('double 48.1','double 999'),text:gsub('double 87.5','double nan'),(text:gsub('double 11.5','string "11.5"'))})do assert(gps.parse(bad)==nil)end
local result={started=true,exitCode=0,stdout=text}
local function run(program,args,timeout)
    assert(program=='/usr/bin/env' and args[2]=='/usr/bin/dbus-send' and timeout==1)
    assert(args[4]=='--reply-timeout=1000' and args[#args]=='com.jci.lds.data.GetPosition')
    return result
end
assert(gps.read(run).gpsSpeedKph==87.5)
result.stdoutTruncated=true;assert(gps.read(run)==nil);result.stdoutTruncated=false
result.exitCode=1;assert(gps.read(run)==nil)
-- GPS stays fresh independently of the twelve slow fields at production cadence.
local collector=assert(loadfile('usb/tweaks/drivedash/assets/service/collector.lua'))()
local now,fail,calls=0,false,0
local reader=collector.create({interval=0.2,slowInterval=1,now=function()return now end,
    run=function()return {started=true,exitCode=0,stdout='0\n'}end,
    gps=function()calls=calls+1;if not fail then return value end end})
local sample
for i=0,120 do now=i*0.25;sample=reader.sample()end
assert(calls==16 and sample.gpsAltitudeM==-12.5)
fail=true
for i=1,3 do now=30+i*2;sample=reader.sample();assert((sample.gpsAltitudeM~=nil)==(i<3))end
now=50;sample=reader.sample();assert(sample.gpsAltitudeM==nil)
print('DRIVEDASH_GPS_PASSED: bounded parsing, independent two-second cadence, failure retention and idle reset.')
