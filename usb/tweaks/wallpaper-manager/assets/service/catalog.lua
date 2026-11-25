-- Literal, bounded data format. Filenames are generated; labels are hex encoded.
local M={}
local function need(ok,message) if not ok then error(message,0) end end
function M.id(id) return type(id)=="string" and #id==36 and id:match("^img%-[0-9a-f]+$")~=nil end
local function hex(s) return (s:gsub(".",function(c)return string.format("%02x",c:byte())end)) end
local function unhex(s)
    need(#s%2==0 and not s:find("[^0-9a-f]"),"Invalid gallery label encoding.")
    return (s:gsub("..",function(n)return string.char(tonumber(n,16))end))
end
function M.settings(rows,value,strict)
    value=value or {version=1,enabled=false,interval=10,slides={}}
    local ids,seen,slides={},{},{}
    for _,row in ipairs(rows)do ids[row.id]=true end
    need(value.version==1 and type(value.enabled)=="boolean" and (value.interval==5 or value.interval==10 or value.interval==30 or value.interval==60 or value.interval==120 or value.interval==300),"Invalid wallpaper settings.")
    need(type(value.slides)=="table" and #value.slides<=50,"Invalid slideshow selection.")
    for k in pairs(value.slides)do need(type(k)=="number" and k%1==0 and k>=1 and k<=#value.slides,"Invalid slideshow array.")end
    for _,id in ipairs(value.slides)do
        need(type(id)=="string" and not seen[id],"Invalid slideshow ID.");seen[id]=true
        if strict then need(ids[id],"Unknown slideshow image.") end
        if ids[id] then slides[#slides+1]=id end
    end
    local selected=type(value.selected)=="string" and value.selected or nil
    if strict and selected then need(ids[selected],"Unknown selected image.")end
    need(value.offscreen==nil or type(value.offscreen)=="boolean","Invalid wallpaper settings.")
    local offscreen=(value.offscreen==true)
    return {version=1,selected=ids[selected] and selected or nil,enabled=value.enabled and #slides>0,interval=value.interval,slides=slides,offscreen=offscreen,removed={}}
end
function M.encode(rows,settings)
    need(#rows<=50,"Gallery limit: 50 images.")
    local lines,seen={"MZD_WALLPAPER_GALLERY_V1"},{}
    for _,r in ipairs(rows) do
        need(M.id(r.id) and not seen[r.id],"Invalid gallery ID.");seen[r.id]=true
        need(r.format=="png","Invalid gallery format.")
        need(type(r.label)=="string" and #r.label>0 and #r.label<=255 and not r.label:find("[%z\1-\31\127]"),"Invalid gallery label.")
        lines[#lines+1]=r.id.."\t"..r.format.."\t"..hex(r.label)
    end
    if settings then
        local c=M.settings(rows,settings,false)
        lines[#lines+1]="S\t"..(c.selected or "-").."\t"..(c.enabled and "1" or "0").."\t"..c.interval.."\t"..(#c.slides>0 and table.concat(c.slides,",") or "-").."\t"..(c.offscreen and "1" or "0")
    end
    return table.concat(lines,"\n").."\n"
end
function M.decode(s)
    need(type(s)=="string" and #s<=30000 and s:sub(-1)=="\n","Invalid gallery index.")
    local rows,settings={},nil
    local first=true
    for line in s:gmatch("([^\n]*)\n") do
        if first then need(line=="MZD_WALLPAPER_GALLERY_V1","Unknown gallery version.");first=false
        elseif line:sub(1,2)=="S\t" then
            need(not settings,"Duplicate gallery settings.")
            local selected,enabled,interval,slides,tail=line:match("^S\t([a-z0-9-]+)\t([01])\t(%d+)\t([a-z0-9,-]+)(.*)$")
            need(selected and (tail=="" or tail=="\t0" or tail=="\t1"),"Invalid saved wallpaper settings.")
            local values={};if slides~="-" then for id in slides:gmatch("[^,]+")do values[#values+1]=id end end
            settings={version=1,selected=selected~="-" and selected or nil,enabled=enabled=="1",interval=tonumber(interval),slides=values,offscreen=tail=="\t1"}
        else need(not settings,"Gallery records after settings.");local id,format,label=line:match("^(img%-[0-9a-f]+)\t([a-z]+)\t([0-9a-f]+)$");need(id,"Invalid gallery entry.");rows[#rows+1]={id=id,format=format,label=unhex(label)} end
    end
    need(not first,"Missing gallery version.");M.encode(rows);return rows,M.settings(rows,settings,false)
end
return M
