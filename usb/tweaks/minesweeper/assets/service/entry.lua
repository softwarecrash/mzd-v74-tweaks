local lfs=require('lfs')
-- Mutable record belongs to the declared config path, never the module assets.
return function(context)
    local fs,path=context.files,assert(context.config.state)..'/record.conf'
    local function read()
        if not fs.exists(path)then return 0 end
        local data=fs.read(path,128)
        local value=tonumber(data:match('^best=(%d+)\n$')) or 0
        return value>=0 and value<=2147483647 and value==math.floor(value) and value or 0
    end
    return {request=function(operation,args)
        assert(operation=='record','Unknown operation.')
        local best=read()
        if args.value~=nil then
            assert(type(args.value)=='number' and args.value>=0 and args.value<=2147483647 and args.value==math.floor(args.value),'Invalid record.')
            if args.value>0 and (best==0 or args.value<best) then
                local prefix=''
                for part in path:match('^(.*)/'):gmatch('[^/]+')do
                    prefix=prefix..'/'..part
                    if fs.exists(prefix)then fs.directory(prefix)else assert(lfs.mkdir(prefix))end
                end
                local temporary=path..'.'..fs.random()..'.tmp'
                fs.write_new(temporary,'best='..string.format('%.0f',args.value)..'\n')
                local ok,message=pcall(fs.rename,temporary,path)
                if not ok then fs.remove_if_exists(temporary);error(message)end
                fs.sync_directory(path:match('^(.*)/'));best=args.value
            end
        end
        return {best=best}
    end}
end
