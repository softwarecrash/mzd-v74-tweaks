local image=require('image')
local catalog=require('catalog')
local store=require('store')
local function read(path)local f=assert(io.open(path,'rb'));local s=f:read('*a');f:close();return s end
local sample=read(arg and arg[1] or '/sample-small.png')
local checks=0
local function check(ok,message)assert(ok,message);checks=checks+1 end
local function fails(fn,match)local ok,err=pcall(fn);check(not ok and tostring(err):find(match,1,true),'Expected failure: '..match..'; got '..tostring(err))end
check(image.inspect(sample).format=='png','PNG dimensions and CRC')
fails(function()image.inspect(sample:sub(1,-2))end,'truncated')
fails(function()image.inspect(string.rep('x',1024*1024+1))end,'1 MiB')
fails(function()image.inspect('invalid')end,'Only PNG')
fails(function()image.inspect(string.char(255,216,255,217))end,'Only PNG')
local bad=sample:sub(1,45)..string.char((sample:byte(46)+1)%256)..sample:sub(47)
fails(function()image.inspect(bad)end,'checksum')
local fs,files,dirs={}, {},{['/gallery']=true,['/usb']=true,['/usb/wallpapers']=true}
local counter,clock,free=0,0,1024*1024*1024
local function meta(path)local s=assert(files[path],'missing file '..path);return{bytes=#s,device=1,inode=path,modified=1}end
fs.regular=meta
fs.directory=function(path)assert(dirs[path],'missing directory '..path)end
fs.read=function(path,max)local s=assert(files[path],'missing file');assert(#s<=max,'too large');return s end
fs.write_new=function(path,data)assert(not files[path],'exists');files[path]=data end
fs.exists=function(path)return files[path]~=nil end
fs.remove_if_exists=function(path)files[path]=nil end
local rename_fail=false
fs.rename=function(a,b)if rename_fail and b=='/gallery/gallery.tsv' then error('index write failed')end;files[b]=assert(files[a]);files[a]=nil end
fs.sync_directory=function()end
fs.space=function()return{available=free,capacity=2*1024*1024*1024}end
fs.random=function()counter=counter+1;return string.format('%032x',counter)end
fs.now=function()return clock end
fs.list=function(path)
    local rows,seen={},{}
    for name in pairs(files) do if name:sub(1,#path+1)==path..'/' then local child=name:sub(#path+2):match('^[^/]+');if not seen[child] then seen[child]=true;rows[#rows+1]=child end end end
    for name in pairs(dirs) do if name:sub(1,#path+1)==path..'/' then local child=name:sub(#path+2):match('^[^/]+');if not seen[child] then seen[child]=true;rows[#rows+1]=child end end end
    return rows
end
local connected=true
fs.usb_mounts=function()return connected and {{id='sda1'}} or {}end
fs.usb_mount=function(id)assert(id=='sda1' and connected,'disconnected');return '/usb'end
files['/gallery/owner']='MZD_WALLPAPER_DATA_V1\n'
files['/gallery/gallery.tsv']=catalog.encode({})
local s=store.create(fs,'/gallery')
check(s.list_usb().status=='empty','empty wallpapers')
dirs['/usb/wallpapers']=nil;check(s.list_usb().status=='missing','missing wallpapers');dirs['/usb/wallpapers']=true
connected=false;check(s.list_usb().status=='disconnected','disconnected stick');connected=true
files['/usb/ignored.png']=sample
dirs['/usb/wallpapers/nested']=true;files['/usb/wallpapers/nested/ignored.png']=sample
check(s.list_usb().status=='empty','only direct wallpapers files')
files['/usb/wallpapers/car.png']=sample
files['/usb/wallpapers/hidden.jpg']=sample
check(#s.list_usb().items==1,'only PNG files listed')
fails(function()s.prepare('sda1','hidden.jpg')end,'Only PNG')
fails(function()s.prepare('sda1','../ignored.png')end,'Invalid USB')
local t=s.prepare('sda1','car.png');check(#s.gallery()==0,'prepare never publishes')
check(s.preview(t.ticket)==sample,'preview uses staged bytes')
fails(function()s.commit(t.ticket,799,480)end,'decoded')
s.abort(t.ticket);check(#s.gallery()==0,'failed decode leaves gallery unchanged')
t=s.prepare('sda1','car.png');local rows=s.commit(t.ticket,800,480);check(#rows==1,'commit publishes image')
check(s.image(rows[1].id)==sample,'gallery bytes')
t=s.prepare('sda1','car.png');rows=s.commit(t.ticket,800,480);check(#rows==2,'duplicate content allowed')
t=s.prepare('sda1','car.png');clock=121;s.tick();fails(function()s.commit(t.ticket,800,480)end,'expired')
free=1;fails(function()s.prepare('sda1','car.png')end,'storage reserve');free=1024*1024*1024
t=s.prepare('sda1','car.png');free=1;fails(function()s.commit(t.ticket,800,480)end,'storage reserve');free=1024*1024*1024;s.abort(t.ticket)
t=s.prepare('sda1','car.png');rename_fail=true;fails(function()s.commit(t.ticket,800,480)end,'index write failed');rename_fail=false
check(#s.gallery()==2,'index failure rolls back new image')
local image_files=0;for path in pairs(files)do if path:match('^/gallery/img%-') then image_files=image_files+1 end end
check(image_files==2,'no orphan on caught commit failure')
t=s.prepare('sda1','car.png');for path in pairs(files)do if path:match('/%.pending%-')then files[path]=bad end end
fails(function()s.commit(t.ticket,800,480)end,'Staged image changed');s.abort(t.ticket)
check(#s.remove(rows[1].id)==1,'delete')
fails(function()s.image(rows[1].id)end,'Unknown gallery')
local foreign='/gallery/img-'..string.format('%032x',counter+1)..'.png';files[foreign]=sample
fails(function()s.prepare('sda1','car.png')end,'already exists');check(files[foreign]==sample and not files['/gallery/transaction'],'collision preserves unknown file');files[foreign]=nil
-- Settings and gallery membership are published in the same index.
local remaining=s.gallery()[1].id
s.settings({version=1,selected=remaining,enabled=true,interval=30,slides={remaining},offscreen=true})
local rebooted=store.create(fs,'/gallery');assert(rebooted.settings().selected==remaining and rebooted.settings().enabled and rebooted.settings().offscreen)
local rows_4,settings_4=catalog.decode("MZD_WALLPAPER_GALLERY_V1\n"..remaining.."\tpng\t6361722e706e67\nS\t"..remaining.."\t1\t30\t"..remaining.."\n")
check(settings_4.offscreen==false,'4-field backward compatibility defaults offscreen to false')
fails(function()catalog.decode("MZD_WALLPAPER_GALLERY_V1\nS\t-\t0\t10\t-\t\n")end,'Invalid saved wallpaper settings')
fails(function()rebooted.settings({version=1,enabled=true,interval=7,slides={remaining}})end,'Invalid wallpaper settings')
fails(function()rebooted.settings({version=1,enabled=true,interval=10,slides={remaining},offscreen='yes'})end,'Invalid wallpaper settings')
-- Crash after prepare: only that transaction's staging file is removed.
t=s.prepare('sda1','car.png');s=store.create(fs,'/gallery');check(not files['/gallery/transaction'],'prepared crash journal recovered')
-- Crash after image rename, before index publication: remove the unindexed image.
t=s.prepare('sda1','car.png')
local jid,jtoken=files['/gallery/transaction']:match('I\t([^\t]+)\t([^\t]+)')
fs.rename('/gallery/.pending-'..jtoken..'.png','/gallery/'..jid..'.png')
s=store.create(fs,'/gallery');check(not files['/gallery/'..jid..'.png'],'unpublished image recovered')
-- Crash after index publication: keep the indexed image and clean its journal.
t=s.prepare('sda1','car.png');jid,jtoken=files['/gallery/transaction']:match('I\t([^\t]+)\t([^\t]+)')
fs.rename('/gallery/.pending-'..jtoken..'.png','/gallery/'..jid..'.png')
local current,configuration=catalog.decode(files['/gallery/gallery.tsv']);current[#current+1]={id=jid,label='car.png',format='png'}
files['/gallery/gallery.tsv']=catalog.encode(current,configuration)
s=store.create(fs,'/gallery');check(s.image(jid)==sample,'published image retained after restart')
s.remove(remaining);check(s.settings().selected==nil and not s.settings().enabled,'delete atomically clears selected/slideshow image')
local many={}
for i=1,50 do local id='img-'..string.format('%032x',1000+i);many[i]={id=id,label='test.png',format='png'};files['/gallery/'..id..'.png']=sample end
files['/gallery/gallery.tsv']=catalog.encode(many)
fails(function()s.prepare('sda1','car.png')end,'50 images')
s.close()
for path in pairs(files)do check(not path:find('/.pending-',1,true),'no pending files')end
fails(function()catalog.decode('MZD_WALLPAPER_GALLERY_V1\ninvalid\n')end,'Invalid gallery entry')
print('WALLPAPER_CMU_STORE_PASSED',checks,_VERSION)
