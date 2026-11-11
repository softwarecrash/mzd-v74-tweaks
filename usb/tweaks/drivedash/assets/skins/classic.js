/* Classic AIO-inspired draft. Uses only the shared display model and canvas. */
(function (global) {
    'use strict';
    var PI = Math.PI, cached = null, cachedContext = null, cachedUnit = null;
    var cream = '#e8e2d3', muted = '#a6a39a';
    function text(ctx, value, x, y, size, align, color) {
        ctx.font = size + 'px DriveDashMazda, Arial, sans-serif';
        ctx.textAlign = align || 'center'; ctx.fillStyle = color || cream; ctx.fillText(value,x,y);
    }
    function arc(ctx,x,y,r,a,b,color,width) {
        ctx.beginPath(); ctx.arc(x,y,r,a,b); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
    }
    function line(ctx,x,y,a,b,color,width) {
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
    }
    function disc(ctx,x,y,r,inner,outer) {
        var g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,inner);g.addColorStop(1,outer);
        ctx.beginPath();ctx.arc(x,y,r,0,2*PI);ctx.fillStyle=g;ctx.fill();
    }
    function rim(ctx,x,y,r,width) {
        var g=ctx.createLinearGradient(x-r,y-r,x+r,y+r);
        g.addColorStop(0,'#444443');g.addColorStop(0.2,'#e0ddd5');g.addColorStop(0.37,'#74736f');g.addColorStop(0.7,'#292b2a');g.addColorStop(1,'#a7a59e');
        arc(ctx,x,y,r,0,2*PI,g,width);arc(ctx,x,y,r+width/2,0,2*PI,'#c7c4bc',0.8);arc(ctx,x,y,r-width/2,0,2*PI,'#070909',1.5);
    }
    function background(ctx,m) {
        var cx=241,cy=197,max=m.speedUnit==='mph'?160:240,i,a,r,g;
        ctx.clearRect(0,0,800,416);ctx.fillStyle='#090a0a';ctx.fillRect(0,0,800,416);
        g=ctx.createRadialGradient(cx,cy,10,cx,cy,430);g.addColorStop(0,'#1c1c1b');g.addColorStop(1,'#060707');ctx.fillStyle=g;ctx.fillRect(0,0,800,416);
        for(i=0;i<=24;i+=1){
            a=PI*5/6+i*PI/18;r=i%2===0?142:147;
            line(ctx,cx+Math.cos(a)*r,cy+Math.sin(a)*r,cx+Math.cos(a)*156,cy+Math.sin(a)*156,cream,i%2===0?4:2);
            if(i%2===0){text(ctx,String(Math.round(i*max/24)),cx+Math.cos(a)*175,cy+Math.sin(a)*175+7,22);}
        }
        disc(ctx,cx,cy,110,'#242323','#090b0b');rim(ctx,cx,cy,106,7);rim(ctx,cx,cy,64,7);
        disc(ctx,cx,cy,59,'#69130b','#080a0a');
        /* Separate lower RPM fan, as in the original AIO arrangement. */
        for(i=0;i<=28;i+=1){a=PI*1.22+i*PI*0.56/28;r=i%4===0?139:145;
            line(ctx,241+Math.cos(a)*r,471+Math.sin(a)*r,241+Math.cos(a)*154,471+Math.sin(a)*154,i>=24?'#c52a19':cream,i%4===0?3:1.5);
            if(i%4===0){text(ctx,String(i/4),241+Math.cos(a)*125,471+Math.sin(a)*125+6,19);}
        }
        line(ctx,458,26,458,389,'#30312e',1);
    }
    function compass(ctx,heading) {
        var i,a,cx=241,cy=197,letters=['N','E','S','W'];
        if(heading===null){text(ctx,'--',cx,cy-80,20,'center',muted);return;}
        // One rigid ring: labels and ticks share the same transform and origin.
        ctx.save();ctx.translate(cx,cy);ctx.rotate(-heading*PI/180);ctx.textBaseline='middle';
        // North accent belongs to the ring and rotates with its N label.
        ctx.beginPath();ctx.arc(0,0,101,-PI*0.58,-PI*0.42);ctx.arc(0,0,69,-PI*0.42,-PI*0.58,true);ctx.closePath();
        var northGlow=ctx.createRadialGradient(0,-86,1,0,-86,35);
        northGlow.addColorStop(0,'#9c2517');northGlow.addColorStop(1,'#300a07');ctx.fillStyle=northGlow;ctx.fill();
        for(i=0;i<8;i+=1){
            a=-PI/2+i*PI/4;
            if(i%2===0){text(ctx,letters[i/2],Math.cos(a)*86,Math.sin(a)*86,23,'center',i===0?'#ff6b4b':cream);}
            else{line(ctx,Math.cos(a)*79,Math.sin(a)*79,Math.cos(a)*85,Math.sin(a)*85,'#9c9991',1);}
        }
        ctx.restore();
        // The fixed top marker is the vehicle's forward direction.
        ctx.beginPath();ctx.moveTo(cx-5,cy-102);ctx.lineTo(cx+5,cy-102);ctx.lineTo(cx,cy-94);ctx.closePath();ctx.fillStyle='#e52a18';ctx.fill();
    }
    function draw(ctx,m,t) {
        var max=m.speedUnit==='mph'?160:240,speed=m.data.speedKph===null?null:m.data.speedKph/(m.speedUnit==='mph'?1.609344:1),a,i,row,rows;
        if(!cached && typeof document!=='undefined' && document.createElement){cached=document.createElement('canvas');cached.width=800;cached.height=416;cachedContext=cached.getContext('2d');}
        if(cachedContext){if(cachedUnit!==m.speedUnit){background(cachedContext,m);cachedUnit=m.speedUnit;}ctx.clearRect(0,0,800,416);ctx.drawImage(cached,0,0);}else{background(ctx,m);}
        compass(ctx,m.data.gpsCourseDeg);
        if(speed!==null){
            a=PI*5/6+Math.min(max,Math.max(0,speed))*PI*4/3/max;
            ctx.save();ctx.translate(241,197);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-11,-4);ctx.lineTo(137,-2);ctx.lineTo(145,0);ctx.lineTo(137,2);ctx.lineTo(-11,4);ctx.closePath();ctx.fillStyle='#ed2a16';ctx.fill();ctx.restore();
            disc(ctx,241,197,58,'#64150d','#080a0a');
        }
        text(ctx,m.speed,241,210,50);text(ctx,m.speedUnit,241,233,16,'center',muted);
        if(m.rpm!==null){a=PI*1.22+Math.min(7000,m.rpm)*PI*0.56/7000;line(ctx,241+Math.cos(a)*115,471+Math.sin(a)*115,241+Math.cos(a)*155,471+Math.sin(a)*155,'#ef2b17',4);}
        text(ctx,m.rpm===null?'--':String(Math.round(m.rpm)),241,402,27);text(ctx,t('rpm'),365,400,14,'center',muted);
        rows=[['data.topSpeedKph','topSpeedKph'],['trip','tripKm'],['data.movingAvgKph','movingAvgKph'],['data.gpsAltitudeM','gpsAltitudeM'],['outside','outsideC'],['coolant','coolantC'],['average','avgL100']];
        for(i=0;i<rows.length;i+=1){row=rows[i];text(ctx,t(row[0]),482,51+i*48,17,'left',muted);text(ctx,m.formatted[row[1]]+' '+m.units[row[1]],778,74+i*48,24,'right');}
    }
    global.DriveDashSkins.register({id:'classic',labelKey:'design.classic',draw:draw});
}(window));
