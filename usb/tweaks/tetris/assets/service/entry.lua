local lfs=require('lfs')
-- Mutable high score belongs to the declared config path, never the module assets.
return function(context)
    local fs,path=context.files,assert(context.config.state)..'/highscore.conf'
    local function read()
        if not fs.exists(path)then return 0 end
        local data=fs.read(path,128)
        return math.min(2147483647,tonumber(data:match('^highscore=(%d+)\n$')) or 0)
    end
    return {request=function(operation,args)
        assert(operation=='score','Unknown operation.')
        local best=read()
        if args.score~=nil then
            assert(type(args.score)=='number' and args.score>=0 and args.score<=2147483647 and args.score==math.floor(args.score),'Invalid score.')
            if args.score>best then
                local prefix=''
                for part in path:match('^(.*)/'):gmatch('[^/]+')do
                    prefix=prefix..'/'..part
                    if fs.exists(prefix)then fs.directory(prefix)else assert(lfs.mkdir(prefix))end
                end
                local temporary=path..'.'..fs.random()..'.tmp'
                fs.write_new(temporary,'highscore='..string.format('%.0f',args.score)..'\n')
                local ok,message=pcall(fs.rename,temporary,path)
                if not ok then fs.remove_if_exists(temporary);error(message)end
                fs.sync_directory(path:match('^(.*)/'));best=args.score
            end
        end
        return {highscore=best}
    end}
end
