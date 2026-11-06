-- The shared host already loads this runner; reuse it without replacing the host.
local process=assert(package.loaded.process,'Shared process runner is unavailable.')
local collector=require('collector')
local preferences=require('preferences')
local lfs=require('lfs')
return function(context)
    local settings=preferences.create(context.files,assert(context.config.preferences)..'/settings.conf',lfs.mkdir)
    local reader=collector.create({
        run=function(program,args,timeout)return process.run(program,args,nil,nil,timeout)end,
        now=function()
            local file=assert(io.open('/proc/uptime','r'))
            local value=assert(file:read('*n'));file:close();return value
        end
    })
    return {request=function(operation,args)
        if operation=='preferences' then return settings.request(args)end
        assert(operation=='sample','Unknown speedometer operation.')
        return reader.sample()
    end}
end
