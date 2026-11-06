-- The manifest-declared config is mutable; module assets remain immutable.
local M={}
local keys={'version','design','language','speedUnit','tempUnit','animated'}
local function defaults()return {version=1,design='oem-style',language='auto',speedUnit='auto',tempUnit='auto',animated=true}end
local function valid(value)
    assert(type(value)=='table','Invalid settings.')
    for key in pairs(value)do
        local known=false;for _,name in ipairs(keys)do if key==name then known=true end end
        assert(known,'Unknown settings field.')
    end
    assert(value.version==1,'Unsupported settings version.')
    assert(type(value.design)=='string' and #value.design<=40 and value.design:match('^[a-z][a-z0-9_-]*$'),'Invalid design.')
    assert(value.language=='auto' or type(value.language)=='string' and #value.language<=8 and value.language:match('^[a-z][a-z][a-z]?_[A-Z][A-Z]$'),'Invalid language.')
    assert(value.speedUnit=='auto' or value.speedUnit=='kmh' or value.speedUnit=='mph','Invalid speed unit.')
    assert(value.tempUnit=='auto' or value.tempUnit=='C' or value.tempUnit=='F','Invalid temperature unit.')
    assert(type(value.animated)=='boolean','Invalid animation setting.')
    local out={};for _,key in ipairs(keys)do out[key]=value[key]end;return out
end
function M.create(fs,path,mkdir)
    local function read()
        if not fs.exists(path)then return defaults()end
        local text=fs.read(path,4096)
        if text=='' then return defaults()end
        local value,seen={},{}
        for line in text:gmatch('[^\n]+')do
            local key,raw=line:match('^([A-Za-z]+)=([^\r]+)$')
            assert(key and not seen[key],'Invalid settings file.');seen[key]=true
            if key=='version' then value[key]=tonumber(raw)
            elseif key=='animated' then
                assert(raw=='true' or raw=='false','Invalid animation setting.');value[key]=raw=='true'
            else value[key]=raw end
        end
        return valid(value)
    end
    local function write(value)
        value=valid(value)
        local lines={};for _,key in ipairs(keys)do lines[#lines+1]=key..'='..tostring(value[key])end
        local parent,prefix=assert(path:match('^(.*)/')),''
        for part in parent:gmatch('[^/]+')do
            prefix=prefix..'/'..part
            if fs.exists(prefix)then fs.directory(prefix)else assert(mkdir(prefix))end
        end
        local temporary=path..'.'..fs.random()..'.tmp'
        local ok,message=pcall(function()
            fs.write_new(temporary,table.concat(lines,'\n')..'\n');fs.rename(temporary,path)
        end)
        if not ok then fs.remove_if_exists(temporary);error(message)end
        fs.sync_directory(parent)
        return value
    end
    return {request=function(args)
        if args.values~=nil then return write(args.values)end
        return read()
    end}
end
return M
