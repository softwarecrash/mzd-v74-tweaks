local collector=assert(loadfile('usb/tweaks/drivedash/assets/service/collector.lua'))()
local now,calls,broken=0,0,false
local raw={VehicleSpeed='8850',EngineSpeed='1200',['Out-CarTemperature']='62',EngClnt_Te_Actl='130',TransmChangeLeverPosition='4',TransmissionGearPosition='6',PID_Drv1Dstnc_curr='6170',TotAvlFuelE='139',FuelGaugePosition='91',EngineLoad='43',Battery_StateOfCharge='162',DR_IntakeAirTemp='70',Drv1AvlFuelE='149',HVD_CumAvgFuelEff_curr='718'}
local reader=collector.create({now=function()return now end,run=function(program,args,timeout)
    assert(program=='/usr/bin/env' and args[1]=='LD_LIBRARY_PATH=/jci/lib:/usr/lib:/lib' and args[2]=='/jci/smdb/smdb-read' and args[3]=='-n' and args[5]=='-e' and #args==6 and timeout==1)
    calls=calls+1
    return {started=true,exitCode=broken and 1 or 0,stdout=raw[args[6]]..'\n'}
end})
local data=reader.sample()
assert(data.speedKph==88.5 and data.rpm==2400 and data.outsideC==22 and data.available)
assert(data.coolantC==nil and data.fuelPercent==nil)
assert(calls==3);reader.sample();assert(calls==3,'Repeated requests must reuse the sample.')
for i=1,11 do now=now+0.5;data=reader.sample()end
assert(data.coolantC==90 and data.gear=='D' and data.tripKm==123.4 and math.abs(data.avgL100-1000/139)<0.000001)
assert(data.engineLoadPercent==43 and data.batteryPercent==81)
assert(data.intakeC==30 and math.abs(data.driveAvgL100-1000/149)<0.00001 and math.abs(data.cumulativeAvgL100-10000/718)<0.00001)
assert(data.gearNumber==6 and data.leverPosition==4)
assert(data.fuelRaw==91 and math.abs(data.fuelPercent-91*100/184)<0.000001)
raw.VehicleSpeed='65535';raw.EngineSpeed='error 1200'
for i=1,2 do now=now+0.5;data=reader.sample();assert(data.speedKph==88.5 and data.rpm==2400,'Two failed reads must retain valid data.')end
now=now+0.5;data=reader.sample();assert(data.speedKph==nil and data.rpm==nil and not data.available,'Third failure must clear the affected values.')
raw.VehicleSpeed='0';raw.EngineSpeed='0';now=now+0.5;data=reader.sample()
assert(data.speedKph==0 and data.rpm==0,'A valid standstill remains valid.')
-- A good read resets the counter; intermittent failures must not accumulate.
broken=true;now=now+0.5;assert(reader.sample().rpm==0)
broken=false;now=now+0.5;assert(reader.sample().rpm==0)
broken=true;now=now+0.5;assert(reader.sample().rpm==0)
now=now+0.5;assert(reader.sample().rpm==0)
now=now+0.5;assert(reader.sample().rpm==nil)
-- Idle sessions must not resurrect old temperatures or tank values.
now=now+10;data=reader.sample()
assert(data.coolantC==nil and data.gear==nil and data.tripKm==nil and data.fuelPercent==nil)
assert(not data.speedUnit and not data.tempUnit)
-- Retried slow values get three consecutive attempts rather than three whole rotations.
now=0;local coolantBroken=false;local reads={}
reader=collector.create({now=function()return now end,run=function(_,args)
    local key=args[6];reads[#reads+1]=key
    return {started=true,exitCode=key=='EngClnt_Te_Actl' and coolantBroken and 1 or 0,stdout=raw[key]..'\n'}
end})
reader.sample();now=now+0.5;assert(reader.sample().coolantC==90)
for i=1,11 do now=now+0.5;reader.sample()end
coolantBroken=true
for i=1,2 do now=now+0.5;data=reader.sample();assert(data.coolantC==90);assert(reads[#reads]=='EngClnt_Te_Actl')end
now=now+0.5;data=reader.sample();assert(data.coolantC==nil)
print('DRIVEDASH_COLLECTOR_PASSED: one-second env-scoped reads, measured conversions, three consecutive failures, recovery, slow-field retry, idle reset and reference tank bars.')

-- New slow fields share retention, sentinel rejection and recovery behavior.
raw.EngineLoad='255';raw.Battery_StateOfCharge='254'
for i=1,36 do now=now+0.5;data=reader.sample()end
assert(data.engineLoadPercent==nil and data.batteryPercent==nil)
raw.EngineLoad='0';raw.Battery_StateOfCharge='200'
for i=1,12 do now=now+0.5;data=reader.sample()end
assert(data.engineLoadPercent==0 and data.batteryPercent==100)
raw.EngineLoad='100';raw.Battery_StateOfCharge='0'
for i=1,12 do now=now+0.5;data=reader.sample()end
assert(data.engineLoadPercent==100 and data.batteryPercent==0)
raw.EngineLoad='101';raw.Battery_StateOfCharge='255'
for i=1,36 do now=now+0.5;data=reader.sample()end
assert(data.engineLoadPercent==nil and data.batteryPercent==nil)
print('DRIVEDASH_LOAD_BATTERY_PASSED: raw SOC scaling, load limits, sentinels and valid zero/full values.')
