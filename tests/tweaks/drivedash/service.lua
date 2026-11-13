package.path='usb/tweaks/drivedash/assets/service/?.lua;'..package.path
local calls=0
package.loaded.process={run=function(program,args,inherited,trace,timeout)
    assert(program=='/bin/sh' and args[1]=='-c' and timeout==1 and not inherited and not trace)
    calls=calls+1;return {started=true,exitCode=0,stdout='1\t0\t0\n2\t0\t0\n3\t0\t0\n'}
end}
package.loaded.lfs={mkdir=function()return true end}
local data={}
local fs={exists=function(p)return p=='/config' or data[p]~=nil end,directory=function(p)assert(p=='/config')end,
    read=function(p)return assert(data[p])end,random=function()return 'test'end,
    write_new=function(p,s)assert(not data[p]);data[p]=s end,rename=function(a,b)data[b]=data[a];data[a]=nil end,
    remove_if_exists=function(p)data[p]=nil end,sync_directory=function()end}
local factory=assert(loadfile('usb/tweaks/drivedash/assets/service/entry.lua'))()
local service=factory({files=fs,config={preferences='/config'}})
assert(calls==0 and not service.tick and not service.close,'Service startup must not collect data.')
local settings=service.request('preferences',{});assert(settings.language=='auto' and calls==0)
settings.language='de_DE';service.request('preferences',{values=settings})
assert(service.request('preferences',{}).language=='de_DE' and calls==0)
local sample=service.request('sample',{});assert(sample.speedKph==0 and sample.rpm==0 and calls==1)
assert(not pcall(service.request,'unknown',{}))
print('DRIVEDASH_SERVICE_PASSED: existing shared runner, zero startup/settings sensor reads, persistent preferences and bounded read-only samples.')
