-- Replacement for both native helpers, using the CMU's existing Lua modules.
local source=arg[0]:match("^(.*)/") or "."
package.path=source.."/?.lua;"..package.path
local socket=require("socket")
local posix=require("posix")
local process=require("process")
local protocol=require("protocol")
local debugLog=os.getenv("MZD_LOG_LEVEL")=="debug"
local function debug(message)
    if debugLog then io.stderr:write(message.."\n");io.stderr:flush() end
end
process.check()
if arg[1]=="--check" then
    print(_VERSION.."; "..tostring(posix.version).."; "..tostring(socket._VERSION))
    os.exit(0)
end
assert(#arg==2,"Usage: lua server.lua transport.html ready-file | --check")
local transport,readyPath=arg[1],arg[2]
-- Keep the already authenticated page available while the USB is unplugged.
local transportFile=assert(io.open(transport,"rb"))
local transportPage=assert(transportFile:read("*a"));transportFile:close()
local sessionState=os.getenv("INSTALLER_STATE")
local function currentInstaller()
    if not sessionState then return nil end
    local file=io.open(sessionState.."/usb-root","r")
    if not file then return nil end
    local root=file:read("*l");file:close()
    if root and (root:match("^/tmp/mnt/sd[a-z][0-9]+$") or root:match("^/mnt/sd[a-z][0-9]+$")) then
        return root.."/installer.sh"
    end
    return nil
end
local server=assert(socket.bind("127.0.0.1",0))
server:settimeout(1)
assert(posix.fcntl(server:getfd(),posix.F_SETFD,1))
local _,port=server:getsockname();port=assert(tonumber(port))
local host="127.0.0.1:"..port
local origin="http://"..host
local rng=assert(io.open("/dev/urandom","rb"));local bytes=assert(rng:read(24));rng:close()
assert(#bytes==24,"Cannot read session entropy")
local token=bytes:gsub(".",function(c)return string.format("%02x",c:byte())end)
-- Lua patterns' dot includes binary bytes; the explicit length check also covers NUL.
assert(#token==48,"Invalid session entropy")
local stopping=false
posix.signal(posix.SIGPIPE,"SIG_IGN")
posix.signal(posix.SIGTERM,function()stopping=true end)
posix.signal(posix.SIGINT,function()stopping=true end)
local ready=assert(io.open(readyPath..".tmp","w"));assert(ready:write(port.."\n"..token.."\n"));ready:close()
assert(os.rename(readyPath..".tmp",readyPath))
io.stderr:write("Installer version: "..(os.getenv("MZD_INSTALLER_VERSION") or "unknown").."\n")
io.stderr:write("Lua transport ready; loopback; "..tostring(posix.version).."\n");io.stderr:flush()
local function send(client,data)
    local index=1
    while index<=#data do
        local last,err,partial=client:send(data,index)
        if not last then return nil,err end
        index=last+1
    end
    return true
end
local function respond(client,code,mime,body)
    debug("response "..code.." bytes="..#body)
    return send(client,"HTTP/1.1 "..code.." Result\r\nContent-Type: "..mime.."\r\nContent-Length: "..#body..
        "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"..body)
end
local function line(client,limit)
    local parts={}
    for i=1,limit do
        local c=assert(client:receive(1),"Incomplete HTTP line")
        if c=="\n" then
            assert(parts[#parts]=="\r","Invalid HTTP line ending")
            parts[#parts]=nil;return table.concat(parts)
        end
        parts[#parts+1]=c
    end
    error("HTTP line too long")
end
local function request(client)
    local first=line(client,2048)
    local method,path=first:match("^(%u+) (%S+) HTTP/1%.[01]$")
    if not method then respond(client,400,"text/plain","Invalid HTTP request");return end
    local headers,total={},0
    while true do
        local value=line(client,2048);total=total+#value+2
        if total>16384 then respond(client,431,"text/plain","Headers too large");return end
        if value=="" then break end
        local k,v=value:match("^([^:%s]+):%s*(.-)%s*$")
        if not k then respond(client,400,"text/plain","Invalid header");return end
        k=k:lower()
        if headers[k] then respond(client,400,"text/plain","Duplicate header");return end
        headers[k]=v
    end
    if headers.host~=host or (headers.origin and headers.origin~=origin) or headers["transfer-encoding"] then
        respond(client,403,"text/plain","Forbidden");return
    end
    debug("request "..method.." "..path)
    if method=="GET" and path=="/" then
        respond(client,200,"text/html; charset=utf-8",transportPage);return
    end
    if method~="POST" or headers["x-poc-token"]~=token then respond(client,403,"text/plain","Forbidden");return end
    local textLength=headers["content-length"] or ""
    local length=tonumber(textLength)
    if not textLength:match("^%d+$") or not length or length>32768 then
        respond(client,400,"text/plain","Invalid body length");return
    end
    local body=length>0 and client:receive(length) or ""
    if not body or #body~=length then respond(client,400,"text/plain","Incomplete body");return end
    if path=="/exit" then respond(client,200,"application/json",'{"ok":true}');stopping=true;return end
    if path~="/exec" then respond(client,404,"text/plain","Not found");return end
    local ok,program,args=pcall(protocol.arguments,body)
    if not ok then respond(client,400,"text/plain","Invalid process arguments");return end
    local label="exec"
    if program=="/bin/sh" and args[1]=="./installer.sh" then
        label="installer"
        for i=2,math.min(#args,4) do
            if args[i]:match("^[a-zA-Z0-9_.-]+$") then label=label.." "..args[i] else break end
        end
    end
    local function trace(message)
        debug(label..": "..message)
    end
    trace("begin")
    -- A disconnect or SIGTERM must not abort an already-running modifying worker.
    local readonlyStatus=program=="/bin/sh" and args[1]=="./installer.sh" and
        ((args[2]=="action" and args[4]=="status" and #args==4) or ((args[2]=="statuses" or args[2]=="config-info" or args[2]=="update-info" or args[2]=="uninstall-check" or args[2]=="restore-check" or args[2]=="settings-info" or args[2]=="preflight-info") and #args==3))
    local runArgs=args
    if program=="/bin/sh" and args[1]=="./installer.sh" then
        local installer=currentInstaller()
        if installer then
            runArgs={};for i,value in ipairs(args) do runArgs[i]=value end
            runArgs[1]=installer
        end
    end
    local ok,result=pcall(process.run,program,runArgs,{server:getfd(),client:getfd()},trace,readonlyStatus and 30 or nil)
    if ok then
        debug("result "..label.." started="..tostring(result.started).." exit="..tostring(result.exitCode)..
            " signal="..tostring(result.signal).." stdout="..#result.stdout.." stderr="..#result.stderr)
        if not result.started or result.exitCode~=0 or result.signal then
            io.stderr:write("Worker failed: "..label.." exit="..tostring(result.exitCode).." signal="..tostring(result.signal).."\n")
        end
        -- Batch status inspections succeed even when individual tweaks are broken.
        -- Keep those reasons in normal logs too, without writing from status workers.
        if program=="/bin/sh" and args[1]=="./installer.sh" and args[2]=="statuses" then
            for row in result.stdout:gmatch("[^\n]+") do
                local id,state,reason=row:match("^([%w_-]+)\t([%w_-]+)\t(.*)$")
                if state=="broken" or state=="unavailable" or state=="error" then
                    io.stderr:write("Tweak status: "..id.." state="..state..
                        " reason="..protocol.string(reason:sub(1,4096)).."\n")
                end
            end
        end
        -- Keep refusal reasons even when preflight ended before a worker report.
        -- Debug still controls per-request/process traces; error output is bounded.
        if not result.started or result.exitCode~=0 or result.signal or #result.stderr>0 then
            io.stderr:write("diagnostic "..label.." stdout="..protocol.string(result.stdout:sub(1,4096))..
                " stderr="..protocol.string(result.stderr:sub(1,4096))..
                " startError="..protocol.string(result.startError or "").."\n")
        end
        io.stderr:flush()
        respond(client,200,"application/json",protocol.result(result))
    else
        io.stderr:write(tostring(result).."\n");io.stderr:flush()
        respond(client,502,"text/plain","Unknown process outcome; check the Lua transport log")
    end
end
while not stopping do
    local client=server:accept()
    if client then
        client:settimeout(10)
        assert(posix.fcntl(client:getfd(),posix.F_SETFD,1))
        local ok,err=pcall(request,client)
        if not ok then
            io.stderr:write("request failure: "..tostring(err).."\n");io.stderr:flush()
            respond(client,400,"text/plain","Malformed or incomplete request")
        end
        client:close();collectgarbage("step",50)
    end
end
server:close();os.remove(readyPath)
io.stderr:write("Lua transport stopped after completing its active request\n")
