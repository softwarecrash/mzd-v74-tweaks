-- Generic, loopback-only service host. Only saved manifest entrypoints are loaded.
local here=assert(arg[0]:match('^(.*)/'))
package.path=here..'/?.lua;'..package.path
local socket=require('socket')
local p=require('posix')
local lfs=require('lfs')
local json=require('cjson')
local process=require('process')
local files=require('files').create(process)
local runtime=here:match('^(.*)/service$')
assert(runtime,'Unsupported service runtime path.')
assert(#arg==3,'Usage: lua server.lua modules-directory registry.tsv data-directory')
local module_root,registry,data_root=arg[1],arg[2],arg[3]
files.directory(module_root);files.directory(data_root)
local ram='/tmp/mzd-gui-service'
files.directory(ram)
assert(files.read(ram..'/owner',128)=='MZD_GUI_RAM_V1\n','Unknown GUI service RAM ownership.')
if files.exists(ram..'/lock')then files.regular(ram..'/lock')end
local lock=assert(io.open(ram..'/lock','a+'));assert(lfs.lock(lock,'w'),'GUI service is already running.')
local server=assert(socket.bind('127.0.0.1',0));server:settimeout(1)
assert(p.fcntl(server:getfd(),p.F_SETFD,1))
local _,port=server:getsockname();port=assert(tonumber(port))
local origin='http://127.0.0.1:'..port
local token=files.random()..files.random():sub(1,16)
local modules,stopping={},false
local notes=0
local function note(message)notes=notes+1;if notes<=100 then io.stderr:write('[mzd-gui-service] '..tostring(message):sub(1,512)..'\n');io.stderr:flush()end end
local function hex(s)return(s:gsub('.',function(c)return string.format('%02x',c:byte())end))end
local function decode(s)
    assert(#s<=1024 and not s:find('[^0-9a-f]') and #s%2==0,'Invalid image key.')
    return(s:gsub('..',function(n)return string.char(tonumber(n,16))end))
end
local function scoped(entry)
    local base,cache=entry:match('^(.*)/[^/]+$'),{}
    local function load(name)
        if name=='posix' or name=='lfs' or name=='socket' or name=='cjson' then return require(name) end
        assert(type(name)=='string' and name:match('^[a-z][a-z0-9_-]*$'),'Invalid module library.')
        if cache[name]~=nil then assert(cache[name]~=false,'Circular module library.');return cache[name]end
        local path=base..'/'..name..'.lua';files.regular(path)
        local env=setmetatable({require=load},{__index=_G})
        local chunk=assert(loadfile(path));setfenv(chunk,env);cache[name]=false
        local value=chunk();cache[name]=value or true;return cache[name]
    end
    local env=setmetatable({require=load},{__index=_G})
    local chunk=assert(loadfile(entry));setfenv(chunk,env);return chunk()
end
local function asset_url(id,kind,key)return origin..'/image/'..id..'/'..kind..'/'..hex(key)..'?token='..token end
local lines=files.read(registry,65536)
for line in lines:gmatch('[^\n]+')do
    local id,path=line:match('^([a-z0-9-]+)\t(assets/[A-Za-z0-9_./-]+%.lua)$')
    assert(id and not id:match('^%-') and not id:match('%-$') and not id:find('%-%-') and not path:find('/%.%.?/'),'Invalid service registration.')
    assert(not modules[id],'Duplicate service registration.')
    local ok,value=pcall(function()
        local folder=data_root..'/'..id;files.directory(folder)
        assert(files.read(folder..'/owner',256)=='MZD_GUI_DATA_V1\n'..id..'\n','Unknown module data ownership.')
        local entry=module_root..'/'..id..'/'..path;files.regular(entry)
        local factory=scoped(entry);assert(type(factory)=='function','Service factory required.')
        local config={}
        local manifest=files.read(module_root..'/'..id..'/manifest.conf',65536)
        for row in manifest:gmatch('[^\n]+')do
            local key,target=row:match('^config%.([a-z][a-z0-9_]*)%.path=([^\r]+)')
            if key then
                assert(target:match('^/tmp/mnt/data_persist/'),'Invalid config path.')
                config[key]=target:gsub('/$','')
            end
        end
        local service=factory({id=id,data=folder,config=config,files=files,urls={image=function(kind,key)
            assert(type(kind)=='string' and #kind<=32 and kind:match('^[a-z]+$') and type(key)=='string' and #key<=512,'Invalid service image key.')
            return asset_url(id,kind,key)
        end}})
        assert(type(service)=='table' and type(service.request)=='function','Invalid module service.')
        return service
    end)
    if ok then modules[id]=value else note(id..': '..tostring(value))end
end
local function line(client,limit)
    local out={}
    for i=1,limit do
        local c=assert(client:receive(1),'Incomplete HTTP request.')
        if c=='\n' then assert(out[#out]=='\r','Invalid HTTP line.');out[#out]=nil;return table.concat(out)end
        out[#out+1]=c
    end
    error('HTTP line too long.')
end
local function send(client,code,mime,body)
    local wire='HTTP/1.1 '..code..' Result\r\nContent-Type: '..mime..'\r\nContent-Length: '..#body..'\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n'..body
    local at=1
    while at<=#wire do local last=assert(client:send(wire,at));at=last+1 end
end
local function response(client,code,value)send(client,code,'application/json; charset=utf-8',json.encode(value))end
local function request(client)
    local method,path=line(client,2048):match('^(%u+) (%S+) HTTP/1%.[01]$')
    assert(method,'Invalid HTTP method.')
    local headers,total={},0
    while true do local text=line(client,2048);total=total+#text;assert(total<=8192,'Headers too large.');if text=='' then break end
        local k,v=text:match('^([^:%s]+):%s*(.-)%s*$');assert(k,'Invalid HTTP header.');k=k:lower();assert(not headers[k],'Duplicate HTTP header.');headers[k]=v
    end
    assert(headers.host=='127.0.0.1:'..port and not headers['transfer-encoding'],'Forbidden HTTP host.')
    if method=='GET' and (path=='/bridge' or path=='/bridge.js')then
        send(client,200,path=='/bridge' and 'text/html; charset=utf-8' or 'application/javascript',files.read(here..(path=='/bridge' and '/bridge.html' or '/bridge.js'),32768));return
    end
    local id,kind,key,provided=path:match('^/image/([a-z0-9-]+)/([a-z]+)/([0-9a-f]+)%?token=([0-9a-f]+)$')
    if method=='GET' and id then
        assert(provided==token and modules[id] and type(modules[id].image)=='function','Forbidden image request.')
        local data,mime=modules[id].image(kind,decode(key));assert(type(data)=='string' and #data<=2*1024*1024,'Invalid image response.')
        assert(mime=='image/png' or mime=='image/jpeg','Invalid image content type.');send(client,200,mime,data);return
    end
    assert(method=='POST' and path=='/rpc' and headers['x-mzd-gui-token']==token and headers['content-type']=='application/json','Forbidden service request.')
    assert(not headers.origin or headers.origin==origin,'Foreign service origin.')
    local length=tonumber(headers['content-length']);assert(length and length>=2 and length<=8192 and length%1==0,'Invalid request size.')
    local raw=assert(client:receive(length))
    local body=json.decode(raw)
    assert(type(body)=='table' and type(body.module)=='string' and modules[body.module] and type(body.operation)=='string' and #body.operation<=32 and type(body.args)=='table','Invalid service operation.')
    for k in pairs(body)do assert(k=='module' or k=='operation' or k=='args','Unknown service request field.')end
    local ok,value=pcall(modules[body.module].request,body.operation,body.args)
    response(client,200,ok and {result=value} or {error=tostring(value):sub(1,512)})
end
local connection='window.mzdGuiServiceConnection={origin:'..json.encode(origin)..',token:'..json.encode(token)..'};\n'
files.write_new(ram..'/connection.new',connection);files.rename(ram..'/connection.new',ram..'/connection.js')
local pid=assert(io.open(ram..'/pid','w'));pid:write(tostring(p.getpid().pid)..'\n');pid:close()
p.signal(p.SIGPIPE,'SIG_IGN');p.signal(p.SIGTERM,function()stopping=true end);p.signal(p.SIGINT,function()stopping=true end)
while not stopping do
    local client=server:accept()
    if client then client:settimeout(5);local ok,err=pcall(function()assert(p.fcntl(client:getfd(),p.F_SETFD,1));request(client)end);if not ok then pcall(response,client,400,{error=tostring(err):sub(1,512)})end;client:close()end
    for id,service in pairs(modules)do if service.tick then local ok,err=pcall(service.tick);if not ok then note(id..': '..tostring(err))end end end
end
for id,service in pairs(modules)do if service.close then local ok,err=pcall(service.close);if not ok then note(id..': '..tostring(err))end end end
server:close();os.remove(ram..'/connection.js');os.remove(ram..'/pid');lfs.unlock(lock);lock:close()
