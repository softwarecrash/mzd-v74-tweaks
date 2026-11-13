local p=require("posix")
local socket=require("socket")
local json=require("cjson")
local process=require("process")
local protocol=require("protocol")
local checks=0
local function check(value,message) assert(value,message);checks=checks+1;print("PASS",checks,message);io.stdout:flush() end
print("CMU_RUNTIME",_VERSION,p.version,socket._VERSION)
local function run(script) return process.run("/bin/sh",{"-c",script}) end
if os.getenv("CMU_TRANSPORT_ONLY")~="1" then
    local packages=process.run("/usr/bin/qemu-arm",{"-L","/cmu","/cmu/lib/ld-linux.so.3","--library-path","/cmu/lib:/cmu/usr/lib","/cmu/bin/busybox","sh","/experiment/tests/package-test.sh"})
    print("ORIGINAL_SHELL_PACKAGES",protocol.result(packages));io.stdout:flush()
    check(packages.exitCode==0 and packages.stdout:find("ORIGINAL_SHELL_PACKAGES_PASSED",1,true),"persistent install/uninstall with original CMU shell")
end
local settings=process.run("/usr/bin/qemu-arm",{"-L","/cmu","/cmu/lib/ld-linux.so.3","--library-path","/cmu/lib:/cmu/usr/lib","/cmu/bin/busybox","sh","/experiment/tests/settings-test.sh"})
print("ORIGINAL_SHELL_SETTINGS",protocol.result(settings));io.stdout:flush()
check(settings.exitCode==0 and settings.stdout:find("ORIGINAL_SETTINGS_PASSED",1,true),"settings schema and values with original CMU BusyBox")
local originalShell=process.run("/usr/bin/qemu-arm",{"-L","/cmu","/cmu/lib/ld-linux.so.3","--library-path","/cmu/lib:/cmu/usr/lib","/cmu/bin/busybox","sh","/experiment/package/tweaks/backup-jci/run.sh","status"})
print("ORIGINAL_SHELL_BACKUP_STATUS",protocol.result(originalShell))
check(originalShell.exitCode==0 and originalShell.stdout=="unavailable\n","actual CMU shell must inspect without critical exit")
for _,id in ipairs({"patch-example","restore-originals"}) do
 local original=process.run("/usr/bin/qemu-arm",{"-L","/cmu","/cmu/lib/ld-linux.so.3","--library-path","/cmu/lib:/cmu/usr/lib","/cmu/bin/busybox","sh","/experiment/package/tweaks/"..id.."/run.sh","status"})
 print("ORIGINAL_SHELL_STATUS",id,protocol.result(original))
 check(original.exitCode==0,"actual CMU shell worker failed: "..id)
end
local closedInput=assert(p.fork())
if closedInput==0 then
 p.close(0)
 local input=process.run("/bin/sh",{"-c","test -r /proc/self/fd/0"})
 if input.exitCode~=0 then print("CHILD_STDIN_FAILED");io.stdout:flush();p._exit(98) end
 local r=process.run("/usr/bin/qemu-arm",{"-L","/cmu","/cmu/lib/ld-linux.so.3","--library-path","/cmu/lib:/cmu/usr/lib","/cmu/bin/busybox","sh","/experiment/package/tweaks/patch-example/run.sh","status"})
 print("CLOSED_STDIN_STATUS",protocol.result(r));io.stdout:flush();p._exit(r.exitCode or 99)
end
local _,closedReason,closedCode=p.wait(closedInput)
check(closedReason=="exited" and closedCode==0,"status with initially closed stdin")
local r=run("printf output; printf errors >&2; exit 2")
check(r.started and r.exitCode==2 and not r.signal and r.stdout=="output" and r.stderr=="errors","split outputs/exit 2")
r=run("exit 143");check(r.exitCode==143 and not r.signal,"normal exit 143")
r=run("kill -TERM $$");check(r.signal==15 and not r.exitCode,"signal 15")
r=process.run("/does-not-exist",{})
check(not r.started and #r.startError>0,"exec failure")
local startTime=socket.gettime()
local timeout=process.run("/bin/sh",{"-c","sleep 20"},nil,nil,1)
check(timeout.exitCode==1 and not timeout.signal and timeout.stderr:find("Status check timed out",1,true),"read-only deadline")
check(socket.gettime()-startTime<5,"read-only process group stopped")
local silent=process.run("/bin/sh",{"-c","exec 1>/dev/null 2>/dev/null; sleep 20"},nil,nil,1)
check(silent.exitCode==1 and silent.stderr:find("Status check timed out",1,true),"status deadline after output pipes close")
local literal="spaces 'quotes' \"double\"; $(touch /tmp/injected) `touch /tmp/injected`\nnext"
r=process.run("/usr/bin/printf",{"%s",literal})
check(r.stdout==literal and r.exitCode==0 and not io.open("/tmp/injected"),"literal arguments: "..protocol.result(r))
r=run("i=0; while [ $i -lt 7000 ]; do printf 0123456789; printf abcdefghij >&2; i=$((i+1)); done")
check(r.exitCode==0 and #r.stdout==65536 and #r.stderr==65536 and r.stdoutTruncated and r.stderrTruncated,"both streams drained beyond cap")
local binary=string.char(0,34,92,195,188,255)
local encoded=protocol.string(binary)
check(encoded:find(string.char(92).."u0000",1,true) and encoded:find(string.char(92).."u00ff",1,true),"byte-preserving JSON")
check(type(json.decode(protocol.result(r)))=="table","valid result JSON")
for _,body in ipairs({"program=%2Fbin%2Fsh&arg=%00","program=%2Fbin%2Fsh&arg=%GG","program=relative","arg=a","program=%2Fbin%2Fsh&x=a"}) do
    check(not pcall(protocol.arguments,body),"invalid form accepted: "..body)
end
local function write(path,data)
    local f=assert(io.open(path,"w"));assert(f:write(data));f:close()
end
local function read(path)
    local f=io.open(path,"rb");if not f then return nil end
    local data=f:read("*a");f:close();return data
end
local base="/experiment/package"
local ready="/tmp/lua-session/ready"
local function start()
    local pid=assert(p.fork())
    if pid==0 then
        assert(p.chdir(base))
        local log=assert(p.open("/tmp/lua-server.log",{"creat","wronly","trunc"},"rw-------"))
        p.dup2(log,1);p.dup2(log,2);p.close(log)
        p.exec("/usr/bin/qemu-arm","-L","/cmu","/cmu/lib/ld-linux.so.3","--library-path","/cmu/lib:/cmu/usr/lib","/cmu/usr/bin/lua","/experiment/server.lua","/experiment/transport.html",ready)
        p._exit(99)
    end
    for i=1,100 do if read(ready) then break end;socket.sleep(0.1) end
    local data=read(ready)
    assert(data,"server not ready: "..tostring(read("/tmp/lua-server.log")))
    local port,token=data:match("^(%d+)\n([0-9a-f]+)")
    assert(port and token);return pid,tonumber(port),token
end
local pid,port,token=start()
local host="127.0.0.1:"..port
local function request(method,path,body,options)
    body=body or "";options=options or {}
    -- The client must allow the production 30-second read-only deadline plus
    -- response time; nested CPU emulation can exceed the old 15-second limit.
    local client=assert(socket.connect("127.0.0.1",port));client:settimeout(45)
    local headers={method.." "..path.." HTTP/1.1","Host: "..(options.host or host)}
    if method=="POST" then
        headers[#headers+1]="Content-Length: "..#body
        headers[#headers+1]="X-Poc-Token: "..(options.token or token)
        headers[#headers+1]="Content-Type: application/x-www-form-urlencoded"
    end
    if options.origin then headers[#headers+1]="Origin: "..options.origin end
    assert(client:send(table.concat(headers,"\r\n").."\r\n\r\n"..body))
    if options.disconnect then client:close();return end
    if options.onSent then options.onSent() end
    local response,err,partial=client:receive("*a");client:close();response=response or partial
    local code=tonumber(response:match("^HTTP/1.1 (%d+)"))
    local payload=response:match("\r\n\r\n(.*)$")
    assert(code,response..tostring(err));return code,payload
end
local function escape(value) return (value:gsub("([^%w%-_%.~])",function(c)return string.format("%%%02X",c:byte())end)) end
local function form(program,args)
    local parts={"program="..escape(program)}
    for _,a in ipairs(args) do parts[#parts+1]="arg="..escape(a) end
    return table.concat(parts,"&")
end
local function exec(args)
    local code,data=request("POST","/exec",form("/bin/sh",args));assert(code==200,data);return json.decode(data)
end
local code,data=request("GET","/")
check(code==200 and data:find("shell%-ready"),"transport page")
-- USB replug may change sda1 to sdb1 while the bridge retains its old cwd.
assert(run("mkdir -p /tmp/mnt/sdz1 /tmp/mnt/sdz2").exitCode==0)
write("/tmp/mnt/sdz1/installer.sh","printf 'first-root\\n'\n")
write("/tmp/mnt/sdz2/installer.sh","printf 'second-root\\n'\n")
write("/tmp/lua-session/usb-root","/tmp/mnt/sdz1\n")
r=exec({"./installer.sh","probe"});check(r.exitCode==0 and r.stdout=="first-root\n","USB source first mount")
write("/tmp/lua-session/usb-root","/tmp/mnt/sdz2\n")
r=exec({"./installer.sh","probe"});check(r.exitCode==0 and r.stdout=="second-root\n","USB source changed mount without new bridge")
os.remove("/tmp/lua-session/usb-root")
assert(os.rename("/experiment/transport.html","/experiment/transport.hidden"))
local cachedCode,cachedPage=request("GET","/")
assert(os.rename("/experiment/transport.hidden","/experiment/transport.html"))
check(cachedCode==200 and cachedPage:find("shell%-ready"),"transport page survives missing USB source")
check(request("GET","/",nil,{host="other"})==403,"host protection")
check(request("POST","/exec","",{token="wrong"})==403,"token protection")
check(request("POST","/exec","",{origin="http://other"})==403,"origin protection")
check(request("POST","/exec","program=%GG")==400,"invalid encoding")
check(request("POST","/exec",string.rep("x",32769))==400,"body cap")
r=exec({"./installer.sh","restore-check","patch-example"})
check(r.exitCode==1 and r.stderr:find("A readable target and original .org backup are required.",1,true),"early recovery refusal reaches GUI")
local refusalLog=read("/tmp/lua-server.log")
check(refusalLog:find("Worker failed: installer restore-check patch-example",1,true) and
    refusalLog:find("A readable target and original .org backup are required.",1,true),"normal log includes early refusal reason before any worker report")
-- Successful batch inspections must log per-tweak failures in normal mode.
for _,path in ipairs({"/tmp/mnt","/tmp/mnt/data_persist","/tmp/mnt/data_persist/mzd-tweaks",
    "/tmp/mnt/data_persist/mzd-tweaks/installed","/tmp/mnt/data_persist/mzd-tweaks/installed/status-fixture"}) do
    p.mkdir(path,"rwx------")
end
local failedState="/tmp/mnt/data_persist/mzd-tweaks/installed/status-fixture/state.conf"
write(failedState,"format=1\nstate=failed\n")
r=exec({"./installer.sh","statuses","status-fixture demo"})
check(r.exitCode==0 and r.stderr=="" and r.stdout:find("status-fixture\tbroken\t",1,true),"batch broken state is a successful inspection")
local statusLog=read("/tmp/lua-server.log")
check(statusLog:find("Tweak status: status-fixture state=broken",1,true) and
    statusLog:find("Saved installation state: failed",1,true),"normal log records failed saved state without an install attempt")
check(not statusLog:find("Tweak status: demo",1,true),"healthy status is not logged")
os.remove(failedState);p.rmdir("/tmp/mnt/data_persist/mzd-tweaks/installed/status-fixture")
r=exec({"./installer.sh","list"});check(r.exitCode==0 and r.stdout:find("demo\n",1,true),"actual discovery")
r=exec({"./installer.sh","manifest","demo"});check(r.exitCode==0 and r.stdout:find("id=demo",1,true),"actual manifest reader")
r=exec({"./installer.sh","action","demo","status"});check(r.exitCode==0 and r.stdout=="uninstalled\n","worker status")
r=exec({"./installer.sh","statuses","demo patch-example"});check(r.exitCode==0 and r.stdout=="demo\tuninstalled\t\npatch-example\tuninstalled\t\n","bulk registered status")
r=exec({"./installer.sh","action","demo","run"});check(r.exitCode==0 and r.stdout:find("Synthetic command"),"worker Run")
r=exec({"./installer.sh","start-run","demo"});local job=r.stdout:match("^(job%.[A-Za-z0-9]+)")
check(r.exitCode==0 and job,"actual background start")
local sawRunning=false
for i=1,50 do
    r=exec({"./installer.sh","job-status",job});check(r.exitCode==0,"job poll")
    if r.stdout:find("^done\n0") then break end
    sawRunning=sawRunning or r.stdout:find("^running\n")~=nil;socket.sleep(0.1)
end
check(sawRunning and r.stdout:find("^done\n0"),"background progress and completion")
r=exec({"./installer.sh","job-output",job,"stdout"});check(r.stdout:find("Synthetic command"),"background stdout")
request("POST","/exec",form("/bin/sh",{"-c","sleep 1; printf completed > /tmp/disconnected-completed"}),{disconnect=true})
socket.sleep(1.5)
check(read("/tmp/disconnected-completed")=="completed","disconnect must not abort worker")
local code=request("POST","/exec",form("/bin/sh",{"-c","sleep 1; printf drained > /tmp/term-completed"}),{
    onSent=function() socket.sleep(0.3);p.kill(pid,p.SIGTERM) end
})
local waited,reason,status=p.wait(pid)
check(code==200 and read("/tmp/term-completed")=="drained" and reason=="exited" and status==0,"SIGTERM waits for current worker")
check(not read(ready),"ready file removed")
check(not read("/tmp/lua-server.log"):find("request POST",1,true),"normal logging omits per-request traces")
-- Exercise the production Lua startup helper.
for _,backend in ipairs({"normal","debug","off"}) do
    local state="/tmp/helper-"..backend
    assert(p.mkdir(state,"rwx------"))
    local child=assert(p.fork())
    if child==0 then
        p.exec("/bin/sh","/experiment/tests/start-helper.sh",state,backend);p._exit(99)
    end
    local readyData
    -- Allow the runtime precheck before the helper's own startup wait begins.
    for i=1,300 do if read(state.."/pids") then readyData=read(state.."/ready");break end;socket.sleep(0.1) end
    assert(readyData,"shared helper failed: "..tostring(read(state.."/http.log")))
    port,token=readyData:match("^(%d+)\n([0-9a-f]+)");port=tonumber(port);host="127.0.0.1:"..port
    r=exec({"./installer.sh","list"});check(r.exitCode==0 and r.stdout:find("demo\n",1,true),"shared helper "..backend)
    check(request("POST","/exit","")==200,"graceful stop "..backend)
    local got,why,value=p.wait(child);check(why=="exited" and value==0,"helper process cleanup "..backend..": "..tostring(got).." "..tostring(why).." "..tostring(value))
    local trace=read(state.."/http.log"):find("request POST /exec",1,true)
    check((trace~=nil)==(backend=="debug"),"HTTP trace follows logging mode "..backend)
end
print("LUA_BACKEND_PASSED",checks,"checks; original ARM Lua/POSIX/socket, real process/HTTP/job handling; no CMU writes")
