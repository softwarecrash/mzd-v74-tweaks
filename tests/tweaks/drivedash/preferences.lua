local factory=assert(loadfile('usb/tweaks/drivedash/assets/service/preferences.lua'))()
local path='/config/settings.conf'
local content,dirs={}, {['/config']=true}
local failRename=false
local fs={exists=function(p)return content[p]~=nil or dirs[p]end,read=function(p,limit)assert(#content[p]<=limit);return content[p]end,
 directory=function(p)assert(dirs[p])end,random=function()return 'fixture'end,
 write_new=function(p,value)assert(not content[p]);content[p]=value end,
 rename=function(from,to)assert(not failRename,'Injected rename failure.');content[to]=content[from];content[from]=nil end,
 remove_if_exists=function(p)content[p]=nil end,sync_directory=function(p)assert(p=='/config')end}
local store=factory.create(fs,path,function(p)dirs[p]=true;return true end)
local defaults=store.request({});assert(defaults.language=='auto' and defaults.speedUnit=='auto' and not content[path])
local value={version=1,design='bm2014',language='de_DE',speedUnit='mph',tempUnit='F',animated=false}
store.request({values=value});local saved=content[path]
assert(store.request({}).language=='de_DE' and store.request({}).animated==false)
assert(factory.create(fs,path,function()error('Unexpected mkdir')end).request({}).speedUnit=='mph')
value.speedUnit='kmh';failRename=true;assert(not pcall(store.request,{values=value}));assert(content[path]==saved and not content[path..'.fixture.tmp'])
failRename=false;value.speedUnit='invalid';assert(not pcall(store.request,{values=value}));assert(content[path]==saved)
content[path]=saved..'animated=false\n';assert(not pcall(store.request,{}),'Duplicate false values must be rejected.')
content[path]='';assert(store.request({}).tempUnit=='auto')
print('DRIVEDASH_PREFERENCES_PASSED: lazy defaults, persistent reload, false values, strict fields, atomic write failure and temporary cleanup.')
