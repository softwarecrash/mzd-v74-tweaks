-- Factory Lua 5.1/POSIX frontend for the scoped runtime shutdown.
local lfs=require('lfs');local p=require('posix');local socket=require('socket')
local here=assert(arg[0]:match('^(.*)/'))
local lifecycle=assert(loadfile(here..'/lifecycle.lua'))()
local action,payload=arg[1],arg[2]
assert(#arg==2 and (action=='begin' or action=='stop' or action=='inspect'),'Invalid lifecycle action.')
assert(payload=='/data_persist/mzd-tweaks/shims/android-auto-wireless' or payload=='/tmp/mnt/data_persist/mzd-tweaks/shims/android-auto-wireless','Unexpected payload path.')
local state='/tmp/mzd-aaw-runtime'
local owner='MZD_AAW_RUNTIME_V1\n/tmp/mnt/data_persist/mzd-tweaks/shims/android-auto-wireless\n'
local function read(path)
    local f=io.open(path,'r');if not f then return nil end
    local value=f:read('*a');f:close();return value
end
local function write(path,value)
    assert(not lfs.symlinkattributes(path) or lfs.symlinkattributes(path).mode=='file','Unsafe runtime file.')
    local f=assert(io.open(path,'w'));assert(f:write(value));assert(f:close())
end
local function owned_state()
    local attributes=lfs.symlinkattributes(state)
    if not attributes then return false end
    assert(attributes.mode=='directory' and read(state..'/owner')==owner,'Unknown wireless RAM state.')
    return true
end
if action=='begin' then
    local config=assert(loadfile(here..'/config.lua'))()
    local settings=config.read(assert(read(payload..'/libpatch.conf'),'Missing wireless config.'))
    if not settings.wireless then os.exit(0)end
    if not owned_state()then assert(lfs.mkdir(state));write(state..'/owner',owner)end
    assert(not lfs.symlinkattributes(state..'/disabled'),'Wireless stopped until reboot.')
    os.exit(0)
end
local function identity(pid)
    local raw=read('/proc/'..pid..'/stat');if not raw then return nil end
    local fields={};for field in (raw:match('^%d+ %(.+%)%s+(.*)$')or ''):gmatch('%S+')do fields[#fields+1]=field end
    return fields[20]
end
local function processes()
    local records={}
    for pid in lfs.dir('/proc')do
        if pid:match('^%d+$')then
            local cmd=read('/proc/'..pid..'/cmdline');local start=identity(pid)
            if cmd and start then
                local argv={};for value in cmd:gmatch('([^%z]+)%z')do argv[#argv+1]=value end
                records[#records+1]={pid=tonumber(pid),start=start,argv=argv}
            end
        end
    end
    return records
end
if action=='inspect' then
    for _,record in ipairs(processes())do local kind=lifecycle.owns(record.argv,payload);if kind then print(record.pid..' '..kind)end end
    os.exit(0)
end
if not owned_state()then
    for _,record in ipairs(processes())do
        local kind=lifecycle.owns(record.argv,payload)
        assert(kind~='listener' and kind~='handler' and kind~='script','Owned process without runtime marker; inspect before removal.')
    end
    print('inactive');os.exit(0)
end
write(state..'/disabled','stopped until reboot\n')
lifecycle.stop({processes=processes,sleep=socket.sleep,signal=function(record,signal)
    -- Recheck birth time before signalling so a reused PID is never targeted.
    if identity(record.pid)~=record.start then return true end
    local ok,_,errno=p.kill(record.pid,signal=='TERM' and p.SIGTERM or p.SIGKILL)
    return ok~=nil or errno==3
end},payload)
print('owned')
