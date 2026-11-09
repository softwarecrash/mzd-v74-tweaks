const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../../../tools/preview-gui-services.js'),'utf8');

function fixture(storage) {
    const dimensions=[];
    const window={
        mzdPreviewServiceDefaults:{},
        localStorage:{
            getItem(key){return storage[key]||null;},
            setItem(key,value){storage[key]=value;}
        },
        setTimeout(fn){return setTimeout(fn,0);}
    };
    const document={createElement(name){
        assert.equal(name,'canvas');
        const canvas={width:0,height:0,getContext(){
            return {
                createLinearGradient(){return {addColorStop(){}};},
                fillRect(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},closePath(){}
            };
        },toDataURL(type){
            dimensions.push({width:canvas.width,height:canvas.height,type:type});
            return 'data:image/png;base64,PREVIEW_FIXTURE';
        }};
        return canvas;
    }};
    vm.runInNewContext(source,{window:window,document:document,JSON:JSON,Array:Array,Object:Object,Error:Error,String:String});
    return {services:window.MzdGuiServices,dimensions:dimensions};
}

function request(services,operation,args) {
    return new Promise((resolve,reject)=>{
        services.request('wallpaper-manager',operation,args,(error,result)=>error?reject(new Error(error)):resolve(result));
    });
}

test('emulated Wallpaper Manager service',async t=>{
    const storage={}, env=fixture(storage), gallery=await request(env.services,'gallery',{});
    await t.test('generates loadable 800 x 480 PNG gallery entries',()=>{
        assert.equal(gallery.images.length,3);
        assert.deepEqual(env.dimensions.map(value=>[value.width,value.height,value.type]),[
            [800,480,'image/png'],[800,480,'image/png'],[800,480,'image/png']
        ]);
        assert(gallery.images.every(image=>image.url.indexOf('data:image/png;base64,')===0));
    });

    await request(env.services,'save',{version:1,selected:gallery.images[0].id,enabled:false,interval:30,slides:[gallery.images[0].id]});
    const usb=await request(env.services,'usb',{});
    await t.test('lists synthetic USB wallpaper files',()=>{
        assert.equal(usb.status,'ready');
        assert.equal(usb.items.length,3);
    });
    const prepared=await request(env.services,'prepare',{source:usb.items[0].source,name:usb.items[0].name});
    await t.test('prepares an image URL for the real import client',()=>{
        assert(prepared.url.indexOf('data:image/png;base64,')===0);
    });
    const imported=await request(env.services,'commit',{ticket:prepared.ticket,width:800,height:480});
    await t.test('commits imports into the gallery',()=>{
        assert.equal(imported.images.length,4);
        assert.equal(imported.images[3].label,usb.items[0].label);
        assert.equal(imported.settings.selected,gallery.images[0].id);
    });

    await request(env.services,'delete',{id:imported.images[3].id});
    const reloaded=fixture(storage), persisted=await request(reloaded.services,'gallery',{});
    await t.test('deletes imports and preserves browser settings after reload',()=>{
        assert.equal(persisted.images.length,3);
        assert.equal(persisted.settings.interval,30);
        assert.equal(persisted.settings.selected,gallery.images[0].id);
        assert(!persisted.images.some(image=>image.id===imported.images[3].id));
    });
});
