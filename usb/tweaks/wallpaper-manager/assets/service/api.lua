-- Narrow wallpaper service operations for the future shared GUI service bridge.
-- The bridge owns authentication, request bounds and single-process serialization.
-- No operation accepts an absolute path, shell text or a caller-selected program.
local M={}
local function need(ok,message)if not ok then error(message,0) end end
function M.create(store,urls)
    local function decorate(rows)
        for _,r in ipairs(rows) do r.url=urls.image(r.id) end
        return {images=rows,settings=store.settings()}
    end
    return function(operation,args)
        args=args or {}
        need(type(operation)=="string" and type(args)=="table","Invalid wallpaper request.")
        local allowed={save={version=true,selected=true,enabled=true,interval=true,slides=true,offscreen=true,removed=true},gallery={},usb={},prepare={source=true,name=true},commit={ticket=true,width=true,height=true},abort={ticket=true},delete={id=true}}
        need(allowed[operation],"Unknown wallpaper operation.")
        for k,v in pairs(args) do
            need(allowed[operation][k],"Unknown wallpaper argument.")
            if operation~="save" then need(type(v)=="string" and #v<=255 or type(v)=="number" and (k=="width" or k=="height"),"Invalid wallpaper argument.")end
        end
        if operation=="save" then return {settings=store.settings(args)}end
        if operation=="gallery" then return decorate(store.gallery()) end
        if operation=="usb" then
            local result=store.list_usb()
            for _,r in ipairs(result.items) do if not r.error then r.url=urls.usb(r.source,r.name) end end
            return result
        end
        if operation=="prepare" then
            local result=store.prepare(args.source,args.name);result.url=urls.preview(result.ticket);return result
        end
        if operation=="commit" then return decorate(store.commit(args.ticket,args.width,args.height)) end
        if operation=="abort" then store.abort(args.ticket);return {aborted=true} end
        if operation=="delete" then return decorate(store.remove(args.id)) end
    end
end
return M
