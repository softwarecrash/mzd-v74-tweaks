/* Illustrated themes: static native-resolution art and live model-driven instruments. */
(function(global){
    'use strict';
    var PI=Math.PI;
    function register(theme){
        var image=typeof global.Image==='function'?new global.Image():null,cache=null,cacheContext=null,key=null;
        if(image){image.src='skins/'+theme.id+'-background.png';}
        function text(ctx,value,x,y,size,color){ctx.font=size+'px DriveDashMazda, Arial, sans-serif';ctx.textAlign='center';ctx.fillStyle=color||theme.ink;ctx.fillText(value,x,y);}
        function arc(ctx,x,y,r,start,end,color,width){ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
        function circle(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,2*PI);ctx.fillStyle=color;ctx.fill();}
        function softDial(ctx,x,y,r){
            var glow=ctx.createRadialGradient(x-25,y-40,10,x,y,r);
            glow.addColorStop(0,'rgba(255,255,255,0.97)');glow.addColorStop(0.7,'rgba(255,238,249,0.89)');glow.addColorStop(1,'rgba(244,180,216,0.88)');
            circle(ctx,x,y,r,glow);
            arc(ctx,x,y,r+2,0,2*PI,'rgba(244,119,184,0.12)',15);
            arc(ctx,x,y,r+1,0,2*PI,'rgba(249,153,200,0.28)',9);
            var rim=ctx.createLinearGradient(x-r,y-r,x+r,y+r);
            rim.addColorStop(0,'#fffaff');rim.addColorStop(0.27,'#f9b0d4');rim.addColorStop(0.53,'#e876ad');rim.addColorStop(0.8,'#ffdbed');rim.addColorStop(1,'#fff7fd');
            arc(ctx,x,y,r,0,2*PI,rim,5);arc(ctx,x,y,r-5,0,2*PI,'rgba(255,255,255,0.88)',1.5);
            arc(ctx,x,y,r+4,PI*0.99,PI*1.72,'rgba(255,255,255,0.82)',2);
        }
        function roundedCard(ctx,x,y,w,h){
            var r=17,g=ctx.createLinearGradient(x,y,x,y+h);
            ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
            g.addColorStop(0,'rgba(255,255,255,0.97)');g.addColorStop(0.48,'rgba(255,238,249,0.96)');g.addColorStop(1,'rgba(250,207,229,0.97)');
            ctx.fillStyle=g;ctx.fill();ctx.lineWidth=6;ctx.strokeStyle='rgba(247,151,196,0.18)';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#fff7fc';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='rgba(227,108,168,0.52)';ctx.stroke();
        }
        function gothicFrame(ctx,x,y,w,h){
            var r=14,c=x+w/2,g=ctx.createLinearGradient(x,y,x,y+h);
            ctx.beginPath();ctx.moveTo(x+r,y+3);ctx.bezierCurveTo(x+w*0.23,y+3,c-19,y+7,c,y);ctx.bezierCurveTo(c+19,y+7,x+w*0.77,y+3,x+w-r,y+3);
            ctx.quadraticCurveTo(x+w,y+3,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h-3,x+w-r,y+h-3);
            ctx.bezierCurveTo(x+w*0.77,y+h-3,c+19,y+h-7,c,y+h);ctx.bezierCurveTo(c-19,y+h-7,x+w*0.23,y+h-3,x+r,y+h-3);
            ctx.quadraticCurveTo(x,y+h-3,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y+3,x+r,y+3);ctx.closePath();
            g.addColorStop(0,'rgba(65,22,62,0.97)');g.addColorStop(0.5,'rgba(25,10,30,0.97)');g.addColorStop(1,'rgba(44,15,43,0.98)');ctx.fillStyle=g;ctx.fill();
            ctx.strokeStyle='rgba(228,53,155,0.15)';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle='#9e548b';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='rgba(255,192,232,0.42)';ctx.lineWidth=0.7;ctx.stroke();
            // Small curved corner flourishes frame the value rather than crossing it.
            ctx.strokeStyle='#c17cae';ctx.lineWidth=0.8;
            ctx.beginPath();ctx.moveTo(x+5,y+19);ctx.bezierCurveTo(x+5,y+8,x+16,y+8,x+21,y+13);ctx.bezierCurveTo(x+15,y+10,x+11,y+14,x+13,y+18);
            ctx.moveTo(x+w-5,y+19);ctx.bezierCurveTo(x+w-5,y+8,x+w-16,y+8,x+w-21,y+13);ctx.bezierCurveTo(x+w-15,y+10,x+w-11,y+14,x+w-13,y+18);ctx.stroke();
        }
        function gothicDial(ctx,x,y,r){
            var g=ctx.createRadialGradient(x-25,y-40,4,x,y,r),rim=ctx.createLinearGradient(x-r,y-r,x+r,y+r);
            g.addColorStop(0,'rgba(58,23,57,0.97)');g.addColorStop(1,'rgba(13,7,20,0.98)');circle(ctx,x,y,r,g);
            arc(ctx,x,y,r+2,0,2*PI,'rgba(222,37,144,0.12)',13);
            rim.addColorStop(0,'#f0c5e1');rim.addColorStop(0.25,'#773968');rim.addColorStop(0.52,'#c174a9');rim.addColorStop(0.74,'#391b39');rim.addColorStop(1,'#c68ab8');
            arc(ctx,x,y,r,0,2*PI,rim,4);arc(ctx,x,y,r-5,0,2*PI,'rgba(205,145,185,0.34)',1);
        }
        function base(ctx,m,t,ready){
            var x=theme.rpmX,y=164,r=theme.radius,i,a,outer,cardX,cardW=theme.dark?139:181;
            ctx.clearRect(0,0,800,416);ctx.fillStyle=theme.background;ctx.fillRect(0,0,800,416);
            if(ready){ctx.drawImage(image,0,0);}
            if(theme.dark){ctx.lineCap='round';gothicDial(ctx,x,y,r+4);}else{ctx.lineCap='round';softDial(ctx,x,y,r+4);}
            arc(ctx,x,y,r,PI*5/6,PI*13/6,theme.track,8);
            arc(ctx,x,y,r,PI*5/6+PI*4/3*0.85,PI*13/6,theme.dark?theme.accent:'#f582bc',theme.dark?8:6);
            for(i=0;i<=32;i+=1){a=PI*5/6+i*PI/24;outer=i%4===0?r-5:r-7;
                ctx.beginPath();ctx.moveTo(x+Math.cos(a)*(i%4===0?r-17:r-11),y+Math.sin(a)*(i%4===0?r-17:r-11));ctx.lineTo(x+Math.cos(a)*outer,y+Math.sin(a)*outer);ctx.strokeStyle=theme.dark?theme.ink:'#aa5c87';ctx.lineWidth=i%4===0?2:1;ctx.stroke();
                if(i%4===0){text(ctx,String(i/4),x+Math.cos(a)*(r-31),y+Math.sin(a)*(r-31)+7,22);}
            }
            if(theme.dark){gothicFrame(ctx,x-91,280,182,43);}
            text(ctx,t('rpm'),x,y-28,16,theme.muted);text(ctx,'x1000',x,y-10,12,theme.muted);
            if(!theme.dark){softDial(ctx,145,164,132);}
            text(ctx,m.speed,theme.speedX,theme.dark?208:190,theme.dark?116:108);
            text(ctx,m.speedUnit,theme.speedX,theme.dark?243:225,23,theme.muted);
            var cards=[[t('coolant'),m.coolant+m.tempUnit],[t('outside'),m.outside+m.tempUnit],[t('average'),m.average+' '+m.averageUnit],[t('trip'),m.trip+' '+m.tripUnit]];
            for(i=0;i<cards.length;i+=1){cardX=12+i*(cardW+8);if(theme.dark){gothicFrame(ctx,cardX,341,cardW,64);}else{roundedCard(ctx,cardX,341,cardW,64);}
                text(ctx,cards[i][0],cardX+cardW/2,363,15,theme.muted);text(ctx,cards[i][1],cardX+cardW/2,391,cards[i][1].length>10?17:25);}
        }
        function draw(ctx,m,t){
            var ready=!!(image&&image.complete&&image.width===800&&image.height===416),next=JSON.stringify([ready,m.speed,m.speedUnit,m.coolant,m.outside,m.tempUnit,m.average,m.averageUnit,m.trip,m.tripUnit,t('coolant'),t('outside'),t('average'),t('trip'),t('rpm')]);
            var a,x=theme.rpmX,y=164;
            if(!cache&&typeof document!=='undefined'&&document.createElement){cache=document.createElement('canvas');cache.width=800;cache.height=416;cacheContext=cache.getContext('2d');}
            if(cacheContext){if(next!==key){base(cacheContext,m,t,ready);key=next;}ctx.clearRect(0,0,800,416);ctx.drawImage(cache,0,0);}else{base(ctx,m,t,ready);}
            if(m.rpm!==null){a=PI*5/6+Math.min(8000,Math.max(0,m.rpm))*PI*4/3/8000;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-13,-3);ctx.lineTo(theme.radius-20,-1.5);ctx.lineTo(theme.radius-12,0);ctx.lineTo(theme.radius-20,1.5);ctx.lineTo(-13,3);ctx.closePath();ctx.fillStyle=theme.accent;ctx.fill();ctx.restore();}
            circle(ctx,x,y,8,theme.accent);circle(ctx,x,y,4,theme.track);
            text(ctx,m.rpm===null?'--':String(Math.round(m.rpm))+' '+t('rpm'),x,theme.dark?311:305,26);
        }
        global.DriveDashSkins.register({id:theme.id,labelKey:'design.'+theme.id,draw:draw});
    }
    register({id:'sakura',dark:false,rpmX:414,speedX:145,radius:111,ink:'#53112f',muted:'#873d67',accent:'#ed479e',track:'#efbad7',panel:'rgba(255,241,248,0.84)',card:'rgba(255,242,249,0.94)',background:'#fbe2ef'});
    register({id:'midnight-rose',dark:true,rpmX:157,speedX:427,radius:139,ink:'#ffe0f3',muted:'#e0a6cc',accent:'#f52d9b',track:'#5c2454',panel:'rgba(24,10,29,0.94)',card:'rgba(24,10,29,0.96)',background:'#160c1c'});
}(window));
