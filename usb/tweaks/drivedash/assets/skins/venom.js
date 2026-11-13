/* Venom concept: static comic artwork, cached live values and animated RPM. */
(function (global) {
    'use strict';
    var image=null,cache=null,key=null,PI=Math.PI;
    function text(ctx,value,x,y,size,align,color){ctx.font='italic '+size+'px DriveDashMotorsport, Arial, sans-serif';ctx.textAlign=align||'left';ctx.fillStyle=color||'#f4f4ef';ctx.fillText(value,x,y);}
    function load(){if(!image&&typeof global.Image==='function'){image=new global.Image();image.onload=function(){global.DriveDashSkins.invalidate('venom');};image.src='skins/venom-background.png';}}
    function base(ctx,m,t,ready){
        var i,a,r=152,x=168,y=166;
        ctx.fillStyle='#000';ctx.fillRect(0,0,800,416);
        if(ready){ctx.drawImage(image,0,0,800,416);}
        for(i=0;i<=40;i+=1){
            a=2.2+i*2.75/40;
            var spread=i%5===0?0.018:0.009,tip=r-(i%5===0?18:9);
            ctx.beginPath();
            ctx.moveTo(x+Math.cos(a-spread)*r,y+Math.sin(a-spread)*r);
            ctx.lineTo(x+Math.cos(a)*tip,y+Math.sin(a)*tip);
            ctx.lineTo(x+Math.cos(a+spread)*r,y+Math.sin(a+spread)*r);
            ctx.closePath();ctx.fillStyle=i>=33?'#cf202c':'#e5edf1';ctx.fill();
            if(i%5===0){text(ctx,String(i/5),x+Math.cos(a)*(r-32),y+Math.sin(a)*(r-32)+7,22,'center');}
        }
        text(ctx,'x1000 '+t('rpm'),125,184,12,'center','#9caab2');
        text(ctx,m.speed,550,264,82,'right');text(ctx,m.speedUnit,607,260,19,'right');
        var rows=[[t('outside'),m.outside+m.tempUnit],[t('coolant'),m.coolant+m.tempUnit],[t('average'),m.average+' '+m.averageUnit],[t('trip'),m.trip+' '+m.tripUnit]];
        for(i=0;i<rows.length;i+=1){y=259+i*30;text(ctx,rows[i][0],112,y,10,'left','#adb9c3');text(ctx,rows[i][1],231,y+18,i===2?19:22,'right');}
        text(ctx,t('fuel'),62,395,11,'left','#adb9c3');
        for(i=0;i<10;i+=1){ctx.fillStyle=m.fuel===null?'#26323a':m.fuel>i*10?'#eef0ed':'#26323a';var bx=94+i*14,baseY=i%2===0?384:398,direction=i%2===0?1:-1;ctx.beginPath();ctx.moveTo(bx,baseY);ctx.lineTo(bx+11,baseY);ctx.lineTo(bx+8,baseY+direction*6);ctx.lineTo(bx+3,baseY+direction*14);ctx.lineTo(bx+2,baseY+direction*6);ctx.closePath();ctx.fill();}
        if(m.fuel===null){text(ctx,'--',245,397,14,'right');}
        ctx.font='11px DriveDashMazda, Arial, sans-serif';ctx.textAlign='right';ctx.fillStyle='#9ca4ab';ctx.fillText('by SoftWareCrash',792,408);
    }
    function draw(ctx,m,t){
        load();var ready=!!(image&&image.complete&&image.width>0),next=[ready,m.speed,m.speedUnit,m.outside,m.coolant,m.tempUnit,m.average,m.averageUnit,m.trip,m.tripUnit,m.fuel,t('outside'),t('coolant'),t('average'),t('trip'),t('fuel'),t('rpm')].join('|'),layer,a;
        if(!cache&&typeof document!=='undefined'){cache=document.createElement('canvas');cache.width=800;cache.height=416;}
        layer=cache&&cache.getContext('2d');
        if(layer){if(key!==next){base(layer,m,t,ready);key=next;}ctx.clearRect(0,0,800,416);ctx.drawImage(cache,0,0);}else{base(ctx,m,t,ready);}
        if(m.rpm!==null){a=2.2+Math.max(0,Math.min(8000,m.rpm))*2.75/8000;ctx.save();ctx.translate(168,166);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-9,-3);ctx.lineTo(129,-1.5);ctx.lineTo(133,-1);ctx.lineTo(133,1);ctx.lineTo(129,1.5);ctx.lineTo(-9,3);ctx.closePath();ctx.fillStyle='#f32d3d';ctx.fill();ctx.restore();}
        ctx.beginPath();ctx.arc(168,166,7,0,2*PI);ctx.fillStyle='#080b0d';ctx.fill();ctx.strokeStyle='#d7dfe0';ctx.lineWidth=1;ctx.stroke();
    }
    global.DriveDashSkins.register({id:'venom',labelKey:'design.venom',draw:draw});
}(window));
