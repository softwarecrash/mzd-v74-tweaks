-- Exercise the real service factories with factory Lua/POSIX and filesystem code.
local process=require('process')
local fs=assert(loadfile('/experiment/package/lib/gui-runtime/service/files.lua'))().create(process)
for _,id in ipairs({'snake','minesweeper'})do
    local factory=assert(loadfile('/experiment/package/tweaks/'..id..'/assets/service/entry.lua'))()
    local context={files=fs,config={state='/tmp/traffic-jam-records/'..id}}
    local service=factory(context)
    assert(service.request('record',{}).best==0)
    assert(service.request('record',{value=120}).best==120)
    local expected=id=='snake' and 200 or 30
    assert(service.request('record',{value=expected}).best==expected)
    assert(service.request('record',{value=120}).best==expected)
    assert(factory(context).request('record',{}).best==expected)
    for _,value in ipairs({-1,1.5,'400',2147483648})do assert(not pcall(service.request,'record',{value=value}))end
    assert(not pcall(service.request,'unknown',{}))
    local file=context.config.state..'/record.conf'
    assert(fs.read(file,128)=='best='..expected..'\n')
    for _,name in ipairs(fs.list(context.config.state))do assert(name=='record.conf')end
    fs.remove_if_exists(file);fs.write_new(file,'')
    assert(factory(context).request('record',{}).best==0)
    assert(service.request('record',{value=75}).best==75)
    fs.remove_if_exists(file);fs.write_new(file,'best=99999999999999999999999999999\n')
    assert(factory(context).request('record',{}).best==0)
end
print('TRAFFIC_JAM_RECORDS_PASSED: independent records, max score/min time, invalid input, reload, empty/missing files and atomic publication.')
