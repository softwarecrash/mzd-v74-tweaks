local batch=assert(loadfile('usb/tweaks/drivedash/assets/service/batch.lua'))()
local fields={{'speed','namespace','VehicleSpeed'},{'rpm','namespace','EngineSpeed'}}
local function run(program,args,timeout)
 assert(program=='/bin/sh' and args[1]=='-c' and timeout==1)
 assert(args[2]:find('wait') and args[2]:find('&'))
 return {started=true,exitCode=0,stdout='2\t0\t1500\n1\t0\t8850\n'}
end
local r=batch.read(fields,run);assert(r.speed=='8850' and r.rpm=='1500')
r=batch.read(fields,function()return {started=true,exitCode=1,stdout='1\t0\t8850\n'}end);assert(r.speed=='8850' and not r.rpm,'Completed fast read survives another read timeout')
r=batch.read(fields,function()return {started=true,stdout='1\t0\t10\n1\t0\t20\n2\t1\t30\n'}end);assert(not r.speed and not r.rpm)
assert(not pcall(batch.read,{{'bad','namespace;exit','field'}},run))
print('DRIVEDASH_BATCH_PASSED: bounded parallel command, tagged out-of-order values, partial timeout retention, duplicate/failure rejection and static identifiers.')
